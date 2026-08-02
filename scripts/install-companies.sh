#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/opt/cardigans-sales"
INFRA_ENV="/opt/cardigans/.env"
POSTGRES_CONTAINER="cardigans-postgres"
APP_CONTAINER="cardigans-sales"
STAMP="$(date +%Y%m%d-%H%M%S)"

trap 'echo; echo "❌ Ошибка на строке $LINENO. Терминал останется открытым."; exit 1' ERR

echo "=================================================="
echo " Установка модуля Companies"
echo "=================================================="
echo
echo "Будет выполнено:"
echo "  • создание/обновление роли sales_app;"
echo "  • создание схемы sales;"
echo "  • создание таблицы sales.companies;"
echo "  • синхронизация DATABASE_URL;"
echo "  • подключение контейнера к сети PostgreSQL;"
echo "  • создание /api/health;"
echo "  • сборка и проверка приложения."
echo
read -r -p "Продолжить? [y/N]: " CONFIRM

case "$CONFIRM" in
  y|Y|yes|YES) ;;
  *) echo "Отменено."; exit 0 ;;
esac

cd "$PROJECT_DIR"

if [[ ! -f "$INFRA_ENV" ]]; then
  echo "❌ Не найден $INFRA_ENV"
  exit 1
fi

if [[ ! -f package.json ]]; then
  echo "❌ Не найден $PROJECT_DIR/package.json"
  exit 1
fi

echo
echo "==> 1/9 Резервное копирование конфигурации"

BACKUP_DIR="$PROJECT_DIR/.backups/install-companies-$STAMP"
mkdir -p "$BACKUP_DIR"

for path in \
  .env \
  .dockerignore \
  docker-compose.yml \
  package.json \
  package-lock.json \
  lib/db.ts \
  app/actions.ts \
  app/api/health/route.ts
do
  if [[ -f "$path" ]]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$path")"
    cp -a "$path" "$BACKUP_DIR/$path"
  fi
done

echo "Резервная копия: $BACKUP_DIR"

echo
echo "==> 2/9 Загрузка параметров PostgreSQL"

set -a
source "$INFRA_ENV"
set +a

: "${POSTGRES_USER:?В $INFRA_ENV отсутствует POSTGRES_USER}"
: "${POSTGRES_PASSWORD:?В $INFRA_ENV отсутствует POSTGRES_PASSWORD}"
: "${POSTGRES_DB:?В $INFRA_ENV отсутствует POSTGRES_DB}"

if ! docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
  echo "❌ Контейнер $POSTGRES_CONTAINER не найден"
  exit 1
fi

POSTGRES_NETWORK="$(
  docker inspect "$POSTGRES_CONTAINER" \
    --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' |
    head -n 1
)"

if [[ -z "$POSTGRES_NETWORK" ]]; then
  echo "❌ Не удалось определить сеть PostgreSQL"
  exit 1
fi

echo "База: $POSTGRES_DB"
echo "Сеть: $POSTGRES_NETWORK"

echo
echo "==> 3/9 Создание роли, схемы и таблицы"

APP_DB_USER="sales_app"
APP_DB_PASSWORD="$(openssl rand -hex 24)"

docker exec -i \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  psql \
  -v ON_ERROR_STOP=1 \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" <<SQL
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO \$\$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = '${APP_DB_USER}'
  ) THEN
    ALTER ROLE ${APP_DB_USER}
      WITH LOGIN
      PASSWORD '${APP_DB_PASSWORD}';
  ELSE
    CREATE ROLE ${APP_DB_USER}
      LOGIN
      PASSWORD '${APP_DB_PASSWORD}';
  END IF;
END
\$\$;

GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${APP_DB_USER};

CREATE SCHEMA IF NOT EXISTS sales;
ALTER SCHEMA sales OWNER TO ${APP_DB_USER};

CREATE SEQUENCE IF NOT EXISTS sales.company_code_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

ALTER SEQUENCE sales.company_code_seq OWNER TO ${APP_DB_USER};

CREATE TABLE IF NOT EXISTS sales.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_code TEXT UNIQUE NOT NULL DEFAULT (
    'CMP-' ||
    LPAD(nextval('sales.company_code_seq')::TEXT, 6, '0')
  ),

  display_name TEXT NOT NULL,
  website TEXT,
  country TEXT NOT NULL,
  industry TEXT,
  owner_name TEXT,

  lifecycle_status TEXT NOT NULL DEFAULT 'New',
  do_not_contact BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT companies_display_name_not_blank
    CHECK (LENGTH(TRIM(display_name)) > 0),

  CONSTRAINT companies_country_not_blank
    CHECK (LENGTH(TRIM(country)) > 0),

  CONSTRAINT companies_lifecycle_status_valid
    CHECK (
      lifecycle_status IN (
        'New',
        'Qualified',
        'Active',
        'Dormant',
        'Former',
        'Disqualified',
        'Closed'
      )
    )
);

ALTER TABLE sales.companies OWNER TO ${APP_DB_USER};

CREATE INDEX IF NOT EXISTS companies_display_name_idx
  ON sales.companies (LOWER(display_name));

CREATE INDEX IF NOT EXISTS companies_country_idx
  ON sales.companies (country);

CREATE INDEX IF NOT EXISTS companies_lifecycle_status_idx
  ON sales.companies (lifecycle_status);

GRANT USAGE ON SCHEMA sales TO ${APP_DB_USER};
GRANT ALL PRIVILEGES
  ON ALL TABLES IN SCHEMA sales
  TO ${APP_DB_USER};

GRANT ALL PRIVILEGES
  ON ALL SEQUENCES IN SCHEMA sales
  TO ${APP_DB_USER};

ALTER DEFAULT PRIVILEGES IN SCHEMA sales
  GRANT ALL PRIVILEGES ON TABLES TO ${APP_DB_USER};

ALTER DEFAULT PRIVILEGES IN SCHEMA sales
  GRANT ALL PRIVILEGES ON SEQUENCES TO ${APP_DB_USER};
SQL

echo
echo "==> 4/9 Проверка авторизации sales_app"

docker exec -i \
  -e PGPASSWORD="$APP_DB_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  psql \
  -h 127.0.0.1 \
  -U "$APP_DB_USER" \
  -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 \
  -c "
    SELECT
      current_database() AS database,
      current_user AS username,
      COUNT(*) AS companies
    FROM sales.companies;
  "

echo
echo "==> 5/9 Создание защищённой конфигурации приложения"

cat > "$PROJECT_DIR/.env" <<EOF
DATABASE_URL=postgresql://${APP_DB_USER}:${APP_DB_PASSWORD}@${POSTGRES_CONTAINER}:5432/${POSTGRES_DB}
EOF

chmod 600 "$PROJECT_DIR/.env"

touch .gitignore
grep -qxF '.env' .gitignore || echo '.env' >> .gitignore
grep -qxF '.env.*' .gitignore || echo '.env.*' >> .gitignore
grep -qxF '.backups/' .gitignore || echo '.backups/' >> .gitignore

cat > .dockerignore <<'EOF'
.git
.next
node_modules
.env
.env.*
.backups
npm-debug.log*
EOF

echo
echo "==> 6/9 Установка PostgreSQL-драйвера"

if ! grep -q '"pg"' package.json; then
  docker run --rm \
    -v "$PROJECT_DIR:/app" \
    -w /app \
    node:22-alpine \
    sh -lc 'npm install pg && npm install --save-dev @types/pg'
else
  echo "Пакет pg уже присутствует."
fi

mkdir -p lib app/api/health

cat > lib/db.ts <<'EOF'
import { Pool } from "pg";

const globalForDatabase = globalThis as unknown as {
  salesDatabasePool?: Pool;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export const db =
  globalForDatabase.salesDatabasePool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.salesDatabasePool = db;
}
EOF

cat > app/api/health/route.ts <<'EOF'
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await db.query<{
      database: string;
      username: string;
      companies: string;
    }>(`
      SELECT
        current_database() AS database,
        current_user AS username,
        COUNT(*)::TEXT AS companies
      FROM sales.companies
    `);

    return NextResponse.json({
      status: "ok",
      database: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);

    return NextResponse.json(
      {
        status: "error",
        message: "Database connection failed",
      },
      { status: 500 },
    );
  }
}
EOF

echo
echo "==> 7/9 Настройка Docker Compose"

cat > docker-compose.yml <<EOF
services:
  sales:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${APP_CONTAINER}
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "127.0.0.1:3000:3000"
    networks:
      - cardigans-internal

networks:
  cardigans-internal:
    external: true
    name: ${POSTGRES_NETWORK}
EOF

echo
echo "==> 8/9 Сборка и пересоздание контейнера"

docker compose up -d --build --force-recreate

echo "Ожидаю готовность приложения..."

READY=0

for ATTEMPT in $(seq 1 40); do
  HTTP_CODE="$(
    curl \
      --silent \
      --output /tmp/cardigans-health.json \
      --write-out '%{http_code}' \
      http://127.0.0.1:3000/api/health \
      || true
  )"

  if [[ "$HTTP_CODE" == "200" ]]; then
    READY=1
    break
  fi

  sleep 2
done

if [[ "$READY" -ne 1 ]]; then
  echo
  echo "❌ Health-check не прошёл."
  echo
  echo "Ответ:"
  cat /tmp/cardigans-health.json 2>/dev/null || true
  echo
  echo "Последние логи:"
  docker logs "$APP_CONTAINER" --tail 150
  exit 1
fi

echo
echo "Health-check:"
cat /tmp/cardigans-health.json
echo

echo
echo "==> 9/9 Итоговая проверка"

docker ps \
  --filter "name=${APP_CONTAINER}" \
  --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo
echo "Структура таблицы:"
docker exec -i \
  -e PGPASSWORD="$APP_DB_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  psql \
  -h 127.0.0.1 \
  -U "$APP_DB_USER" \
  -d "$POSTGRES_DB" \
  -c "\d+ sales.companies"

echo
echo "=================================================="
echo "✅ Модуль Companies установлен"
echo
echo "Сайт:"
echo "  https://sales.cardigansarena.ru"
echo
echo "Health-check:"
echo "  http://127.0.0.1:3000/api/health"
echo
echo "Резервная копия:"
echo "  $BACKUP_DIR"
echo "=================================================="
echo

read -r -p "Сохранить технические изменения в GitHub? [y/N]: " PUSH_CONFIRM

case "$PUSH_CONFIRM" in
  y|Y|yes|YES)
    git add \
      scripts/install-companies.sh \
      lib/db.ts \
      app/api/health/route.ts \
      docker-compose.yml \
      package.json \
      package-lock.json \
      .dockerignore \
      .gitignore

    if git diff --cached --quiet; then
      echo "Нет новых изменений для коммита."
    else
      git commit -m "Add reproducible Companies module installer"
      git push origin main
      echo "✅ Изменения сохранены в GitHub."
    fi
    ;;
  *)
    echo "GitHub не изменён. Приложение и база уже работают."
    ;;
esac
