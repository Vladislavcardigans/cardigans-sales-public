#!/usr/bin/env bash

PROJECT_DIR="/opt/cardigans-sales"
INFRA_ENV="/opt/cardigans/.env"
POSTGRES_CONTAINER="cardigans-postgres"
APP_CONTAINER="cardigans-sales"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$PROJECT_DIR/.backups/install-deals-$STAMP"

trap '
  code=$?
  echo
  echo "❌ Ошибка на строке $LINENO, код $code."
  echo "Терминал останется открытым."
  exit $code
' ERR

cd "$PROJECT_DIR" || exit 1

echo "=================================================="
echo " Установка модуля Deals"
echo "=================================================="
echo
echo "Будет создано:"
echo "  • таблица sales.deals;"
echo "  • привязка Deal → Company;"
echo "  • маршрут /deals;"
echo "  • форма создания сделки;"
echo "  • стадии коммерческой воронки;"
echo "  • сделки в карточке компании;"
echo "  • показатели суммы и вероятности;"
echo "  • health-check и автоматические тесты."
echo

read -r -p "Продолжить? [y/N]: " CONFIRM

case "$CONFIRM" in
  y|Y|yes|YES) ;;
  *)
    echo "Отменено."
    exit 0
    ;;
esac

echo
echo "==> 1/10 Проверка Git"

if [[ ! -d .git ]]; then
  echo "❌ В $PROJECT_DIR отсутствует папка .git"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠️ В репозитории есть несохранённые изменения:"
  git status --short
  echo
  read -r -p "Продолжить и включить их в резервную копию? [y/N]: " DIRTY_CONFIRM

  case "$DIRTY_CONFIRM" in
    y|Y|yes|YES) ;;
    *)
      echo "Отменено."
      exit 0
      ;;
  esac
fi

echo
echo "==> 2/10 Резервное копирование"

mkdir -p "$BACKUP_DIR"

for path in \
  app/deals \
  app/api/health/deals \
  app/companies/[id]/page.tsx \
  app/contacts/page.tsx \
  app/globals.css \
  lib/repositories/deal.repository.ts \
  types/deal.ts
do
  if [[ -e "$path" ]]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$path")"
    cp -a "$path" "$BACKUP_DIR/$path"
  fi
done

echo "Резервная копия:"
echo "  $BACKUP_DIR"

echo
echo "==> 3/10 Загрузка PostgreSQL"

if [[ ! -f "$INFRA_ENV" ]]; then
  echo "❌ Не найден $INFRA_ENV"
  exit 1
fi

set -a
source "$INFRA_ENV"
set +a

: "${POSTGRES_USER:?Не указан POSTGRES_USER}"
: "${POSTGRES_PASSWORD:?Не указан POSTGRES_PASSWORD}"
: "${POSTGRES_DB:?Не указан POSTGRES_DB}"

echo "База: $POSTGRES_DB"

echo
echo "==> 4/10 Создание таблицы deals"

docker exec -i \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  psql \
  -v ON_ERROR_STOP=1 \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" <<'SQL'
CREATE SEQUENCE IF NOT EXISTS sales.deal_code_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

ALTER SEQUENCE sales.deal_code_seq OWNER TO sales_app;

CREATE TABLE IF NOT EXISTS sales.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL
    REFERENCES sales.companies(id)
    ON DELETE CASCADE,

  primary_contact_id UUID
    REFERENCES sales.contacts(id)
    ON DELETE SET NULL,

  deal_code TEXT UNIQUE NOT NULL DEFAULT (
    'DEAL-' ||
    LPAD(nextval('sales.deal_code_seq')::TEXT, 6, '0')
  ),

  title TEXT NOT NULL,

  stage TEXT NOT NULL DEFAULT 'Lead',

  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BYN',

  probability INTEGER NOT NULL DEFAULT 10,

  owner_name TEXT,

  expected_close_date DATE,

  description TEXT,

  lost_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT deals_title_not_blank
    CHECK (LENGTH(TRIM(title)) > 0),

  CONSTRAINT deals_stage_valid
    CHECK (
      stage IN (
        'Lead',
        'Qualified',
        'Proposal',
        'Negotiation',
        'Won',
        'Lost'
      )
    ),

  CONSTRAINT deals_currency_valid
    CHECK (
      currency IN (
        'BYN',
        'RUB',
        'USD',
        'EUR'
      )
    ),

  CONSTRAINT deals_amount_non_negative
    CHECK (amount >= 0),

  CONSTRAINT deals_probability_range
    CHECK (
      probability >= 0
      AND probability <= 100
    )
);

ALTER TABLE sales.deals OWNER TO sales_app;

CREATE INDEX IF NOT EXISTS deals_company_id_idx
  ON sales.deals(company_id);

CREATE INDEX IF NOT EXISTS deals_stage_idx
  ON sales.deals(stage);

CREATE INDEX IF NOT EXISTS deals_expected_close_date_idx
  ON sales.deals(expected_close_date);

CREATE INDEX IF NOT EXISTS deals_owner_name_idx
  ON sales.deals(LOWER(owner_name))
  WHERE owner_name IS NOT NULL;

GRANT ALL PRIVILEGES
  ON sales.deals
  TO sales_app;

GRANT ALL PRIVILEGES
  ON sales.deal_code_seq
  TO sales_app;
SQL

echo
echo "==> 5/10 Создание типов и repository"

mkdir -p \
  app/deals \
  app/api/health/deals \
  lib/repositories \
  types

cat > types/deal.ts <<'EOF'
export const dealStages = [
  "Lead",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
] as const;

export type DealStage =
  (typeof dealStages)[number];

export const dealCurrencies = [
  "BYN",
  "RUB",
  "USD",
  "EUR",
] as const;

export type DealCurrency =
  (typeof dealCurrencies)[number];

export type Deal = {
  id: string;

  company_id: string;
  company_name: string;
  company_code: string;

  primary_contact_id: string | null;
  primary_contact_name: string | null;

  deal_code: string;
  title: string;

  stage: DealStage;

  amount: string;
  currency: DealCurrency;
  probability: number;

  owner_name: string | null;
  expected_close_date: string | null;

  description: string | null;
  lost_reason: string | null;

  created_at: Date;
  updated_at: Date;
};

export type CreateDealInput = {
  companyId: string;
  primaryContactId: string | null;

  title: string;
  stage: DealStage;

  amount: number;
  currency: DealCurrency;
  probability: number;

  ownerName: string | null;
  expectedCloseDate: string | null;

  description: string | null;
};

export type DealCompanyOption = {
  id: string;
  company_code: string;
  display_name: string;
};

export type DealContactOption = {
  id: string;
  company_id: string;
  full_name: string;
};
EOF

cat > lib/repositories/deal.repository.ts <<'EOF'
import { getDb } from "@/lib/db";

import type {
  CreateDealInput,
  Deal,
  DealCompanyOption,
  DealContactOption,
  DealCurrency,
  DealStage,
} from "@/types/deal";

const dealSelect = `
  SELECT
    deal.id,

    deal.company_id,
    company.display_name AS company_name,
    company.company_code,

    deal.primary_contact_id,

    CASE
      WHEN contact.id IS NULL THEN NULL
      ELSE TRIM(
        CONCAT(
          contact.first_name,
          ' ',
          COALESCE(contact.last_name, '')
        )
      )
    END AS primary_contact_name,

    deal.deal_code,
    deal.title,

    deal.stage,

    deal.amount::TEXT,
    deal.currency,
    deal.probability,

    deal.owner_name,
    deal.expected_close_date::TEXT,

    deal.description,
    deal.lost_reason,

    deal.created_at,
    deal.updated_at

  FROM sales.deals AS deal

  INNER JOIN sales.companies AS company
    ON company.id = deal.company_id

  LEFT JOIN sales.contacts AS contact
    ON contact.id = deal.primary_contact_id
`;

export async function listDeals(
  limit = 100,
): Promise<Deal[]> {
  const safeLimit = Math.min(
    Math.max(limit, 1),
    500,
  );

  const result = await getDb().query<Deal>(
    `
      ${dealSelect}

      ORDER BY
        CASE deal.stage
          WHEN 'Negotiation' THEN 1
          WHEN 'Proposal' THEN 2
          WHEN 'Qualified' THEN 3
          WHEN 'Lead' THEN 4
          WHEN 'Won' THEN 5
          WHEN 'Lost' THEN 6
        END,
        deal.created_at DESC

      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows;
}

export async function listCompanyDeals(
  companyId: string,
): Promise<Deal[]> {
  const result = await getDb().query<Deal>(
    `
      ${dealSelect}

      WHERE deal.company_id = $1

      ORDER BY
        CASE deal.stage
          WHEN 'Negotiation' THEN 1
          WHEN 'Proposal' THEN 2
          WHEN 'Qualified' THEN 3
          WHEN 'Lead' THEN 4
          WHEN 'Won' THEN 5
          WHEN 'Lost' THEN 6
        END,
        deal.created_at DESC
    `,
    [companyId],
  );

  return result.rows;
}

export async function createDeal(
  input: CreateDealInput,
): Promise<Deal> {
  const result = await getDb().query<Deal>(
    `
      WITH inserted AS (
        INSERT INTO sales.deals (
          company_id,
          primary_contact_id,

          title,
          stage,

          amount,
          currency,
          probability,

          owner_name,
          expected_close_date,

          description
        )
        VALUES (
          $1, $2,
          $3, $4,
          $5, $6, $7,
          $8, $9,
          $10
        )
        RETURNING *
      )

      SELECT
        inserted.id,

        inserted.company_id,
        company.display_name AS company_name,
        company.company_code,

        inserted.primary_contact_id,

        CASE
          WHEN contact.id IS NULL THEN NULL
          ELSE TRIM(
            CONCAT(
              contact.first_name,
              ' ',
              COALESCE(contact.last_name, '')
            )
          )
        END AS primary_contact_name,

        inserted.deal_code,
        inserted.title,

        inserted.stage,

        inserted.amount::TEXT,
        inserted.currency,
        inserted.probability,

        inserted.owner_name,
        inserted.expected_close_date::TEXT,

        inserted.description,
        inserted.lost_reason,

        inserted.created_at,
        inserted.updated_at

      FROM inserted

      INNER JOIN sales.companies AS company
        ON company.id = inserted.company_id

      LEFT JOIN sales.contacts AS contact
        ON contact.id = inserted.primary_contact_id
    `,
    [
      input.companyId,
      input.primaryContactId,

      input.title,
      input.stage,

      input.amount,
      input.currency,
      input.probability,

      input.ownerName,
      input.expectedCloseDate,

      input.description,
    ],
  );

  return result.rows[0];
}

export async function listDealCompanyOptions():
Promise<DealCompanyOption[]> {
  const result =
    await getDb().query<DealCompanyOption>(
      `
        SELECT
          id,
          company_code,
          display_name

        FROM sales.companies

        ORDER BY
          LOWER(display_name)
      `,
    );

  return result.rows;
}

export async function listDealContactOptions():
Promise<DealContactOption[]> {
  const result =
    await getDb().query<DealContactOption>(
      `
        SELECT
          id,
          company_id,

          TRIM(
            CONCAT(
              first_name,
              ' ',
              COALESCE(last_name, '')
            )
          ) AS full_name

        FROM sales.contacts

        WHERE contact_status = 'Active'

        ORDER BY
          LOWER(first_name),
          LOWER(COALESCE(last_name, ''))
      `,
    );

  return result.rows;
}

export async function getDealMetrics(): Promise<{
  total: number;
  active: number;
  won: number;
  totalPipeline: number;
  weightedPipeline: number;
}> {
  const result = await getDb().query<{
    total: string;
    active: string;
    won: string;
    total_pipeline: string;
    weighted_pipeline: string;
  }>(
    `
      SELECT
        COUNT(*)::TEXT AS total,

        COUNT(*) FILTER (
          WHERE stage NOT IN ('Won', 'Lost')
        )::TEXT AS active,

        COUNT(*) FILTER (
          WHERE stage = 'Won'
        )::TEXT AS won,

        COALESCE(
          SUM(amount) FILTER (
            WHERE stage NOT IN ('Won', 'Lost')
          ),
          0
        )::TEXT AS total_pipeline,

        COALESCE(
          SUM(
            amount * probability / 100.0
          ) FILTER (
            WHERE stage NOT IN ('Won', 'Lost')
          ),
          0
        )::TEXT AS weighted_pipeline

      FROM sales.deals
    `,
  );

  return {
    total: Number(result.rows[0]?.total ?? 0),
    active: Number(result.rows[0]?.active ?? 0),
    won: Number(result.rows[0]?.won ?? 0),
    totalPipeline:
      Number(result.rows[0]?.total_pipeline ?? 0),
    weightedPipeline:
      Number(result.rows[0]?.weighted_pipeline ?? 0),
  };
}

export function isDealStage(
  value: string,
): value is DealStage {
  return [
    "Lead",
    "Qualified",
    "Proposal",
    "Negotiation",
    "Won",
    "Lost",
  ].includes(value);
}

export function isDealCurrency(
  value: string,
): value is DealCurrency {
  return [
    "BYN",
    "RUB",
    "USD",
    "EUR",
  ].includes(value);
}
EOF

echo
echo "==> 6/10 Создание Server Action"

cat > app/deals/actions.ts <<'EOF'
"use server";

import { revalidatePath } from "next/cache";

import {
  createDeal,
  isDealCurrency,
  isDealStage,
} from "@/lib/repositories/deal.repository";

function requiredText(
  formData: FormData,
  field: string,
  label: string,
): string {
  const value =
    String(formData.get(field) ?? "").trim();

  if (!value) {
    throw new Error(
      `${label} — обязательное поле.`,
    );
  }

  return value;
}

function optionalText(
  formData: FormData,
  field: string,
): string | null {
  const value =
    String(formData.get(field) ?? "").trim();

  return value || null;
}

function numericValue(
  formData: FormData,
  field: string,
  fallback: number,
): number {
  const raw =
    String(formData.get(field) ?? "").trim();

  if (!raw) {
    return fallback;
  }

  const value =
    Number(raw.replace(",", "."));

  return Number.isFinite(value)
    ? value
    : fallback;
}

export async function createDealAction(
  formData: FormData,
): Promise<void> {
  const companyId = requiredText(
    formData,
    "company_id",
    "Компания",
  );

  const title = requiredText(
    formData,
    "title",
    "Название сделки",
  );

  const stageValue =
    String(
      formData.get("stage") ?? "Lead",
    ).trim();

  const currencyValue =
    String(
      formData.get("currency") ?? "BYN",
    ).trim();

  const probability =
    Math.min(
      100,
      Math.max(
        0,
        Math.round(
          numericValue(
            formData,
            "probability",
            10,
          ),
        ),
      ),
    );

  const amount =
    Math.max(
      0,
      numericValue(
        formData,
        "amount",
        0,
      ),
    );

  const primaryContactId =
    optionalText(
      formData,
      "primary_contact_id",
    );

  await createDeal({
    companyId,
    primaryContactId,

    title,

    stage:
      isDealStage(stageValue)
        ? stageValue
        : "Lead",

    amount,

    currency:
      isDealCurrency(currencyValue)
        ? currencyValue
        : "BYN",

    probability,

    ownerName:
      optionalText(
        formData,
        "owner_name",
      ),

    expectedCloseDate:
      optionalText(
        formData,
        "expected_close_date",
      ),

    description:
      optionalText(
        formData,
        "description",
      ),
  });

  revalidatePath("/deals");
  revalidatePath(
    `/companies/${companyId}`,
  );
}
EOF

echo
echo "==> 7/10 Создание страницы Deals"

cat > app/deals/page.tsx <<'EOF'
import Link from "next/link";

import { createDealAction } from "./actions";

import {
  getDealMetrics,
  listDealCompanyOptions,
  listDealContactOptions,
  listDeals,
} from "@/lib/repositories/deal.repository";

export const dynamic = "force-dynamic";

const navigation = [
  ["⌂", "Главная", "/"],
  ["▦", "Компании", "/companies"],
  ["◎", "Контакты", "/contacts"],
  ["◇", "Сделки", "/deals"],
  ["✓", "Задачи", "#"],
  ["▥", "Аналитика", "#"],
  ["⚙", "Настройки", "#"],
];

const stageNames: Record<string, string> = {
  Lead: "Лид",
  Qualified: "Квалификация",
  Proposal: "Предложение",
  Negotiation: "Переговоры",
  Won: "Выиграна",
  Lost: "Проиграна",
};

const stageProbability: Record<string, number> = {
  Lead: 10,
  Qualified: 30,
  Proposal: 50,
  Negotiation: 75,
  Won: 100,
  Lost: 0,
};

function formatAmount(
  amount: string | number,
  currency: string,
): string {
  return new Intl.NumberFormat(
    "ru-RU",
    {
      maximumFractionDigits: 2,
    },
  ).format(Number(amount)) +
    " " +
    currency;
}

export default async function DealsPage() {
  const [
    deals,
    companies,
    contacts,
    metrics,
  ] = await Promise.all([
    listDeals(100),
    listDealCompanyOptions(),
    listDealContactOptions(),
    getDealMetrics(),
  ]);

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brandMark">CA</div>

          <div>
            <div className="brandName">
              Cardigans Arena
            </div>

            <div className="brandProduct">
              Sales OS
            </div>
          </div>
        </div>

        <nav className="navigation">
          {navigation.map(
            ([icon, label, href]) => (
              <Link
                key={label}
                href={href}
                className={
                  `navItem ${
                    label === "Сделки"
                      ? "active"
                      : ""
                  }`
                }
              >
                <span className="navIcon">
                  {icon}
                </span>

                <span>{label}</span>
              </Link>
            ),
          )}
        </nav>

        <div className="sidebarFooter">
          <div className="userAvatar">
            ВК
          </div>

          <div>
            <strong>Владислав</strong>
            <span>Администратор</span>
          </div>
        </div>
      </aside>

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Продажи</span>
            <strong>/</strong>
            <span>Сделки</span>
          </div>

          <div className="databaseStatus">
            <span className="databaseDot" />
            PostgreSQL подключён
          </div>
        </header>

        <section className="pageHeader">
          <div>
            <div className="eyebrow">
              Коммерческий блок
            </div>

            <h1>Сделки</h1>

            <p>
              Коммерческие возможности,
              суммы, стадии и прогноз закрытия.
            </p>
          </div>
        </section>

        <section className="metricsGrid dealMetricsGrid">
          <article className="metricCard">
            <div className="metricLabel">
              Всего сделок
            </div>

            <strong>{metrics.total}</strong>

            <p>за всё время</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Активные сделки
            </div>

            <strong>{metrics.active}</strong>

            <p>
              без выигранных и проигранных
            </p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Объём воронки
            </div>

            <strong>
              {new Intl.NumberFormat(
                "ru-RU",
                {
                  maximumFractionDigits: 0,
                },
              ).format(
                metrics.totalPipeline,
              )}
            </strong>

            <p>
              сумма в исходных валютах
            </p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Взвешенный прогноз
            </div>

            <strong>
              {new Intl.NumberFormat(
                "ru-RU",
                {
                  maximumFractionDigits: 0,
                },
              ).format(
                metrics.weightedPipeline,
              )}
            </strong>

            <p>
              сумма × вероятность
            </p>
          </article>
        </section>

        <section className="dealStageSummary">
          {[
            "Lead",
            "Qualified",
            "Proposal",
            "Negotiation",
            "Won",
            "Lost",
          ].map((stage) => {
            const stageDeals =
              deals.filter(
                (deal) =>
                  deal.stage === stage,
              );

            const total =
              stageDeals.reduce(
                (sum, deal) =>
                  sum +
                  Number(deal.amount),
                0,
              );

            return (
              <article
                key={stage}
                className={
                  `dealStageCard stage-${stage.toLowerCase()}`
                }
              >
                <div>
                  <span>
                    {stageNames[stage]}
                  </span>

                  <strong>
                    {stageDeals.length}
                  </strong>
                </div>

                <p>
                  {new Intl.NumberFormat(
                    "ru-RU",
                    {
                      maximumFractionDigits: 0,
                    },
                  ).format(total)}
                </p>
              </article>
            );
          })}
        </section>

        <section className="workspaceGrid">
          <section className="contentPanel">
            <div className="panelTitle">
              <div>
                <h2>
                  Коммерческая воронка
                </h2>

                <p>
                  Последние 100 сделок
                </p>
              </div>
            </div>

            {deals.length === 0 ? (
              <div className="emptyState">
                <div className="emptyIcon">
                  ◇
                </div>

                <h3>
                  Сделок пока нет
                </h3>

                <p>
                  Создай первую возможность
                  через форму справа.
                </p>
              </div>
            ) : (
              <div className="tableViewport">
                <div className="dealTable">
                  <div className="dealTableRow dealTableHead">
                    <div>Сделка</div>
                    <div>Компания</div>
                    <div>Стадия</div>
                    <div>Сумма</div>
                    <div>Вероятность</div>
                    <div>Закрытие</div>
                  </div>

                  {deals.map((deal) => (
                    <div
                      className="dealTableRow"
                      key={deal.id}
                    >
                      <div className="dealTitleCell">
                        <div className="dealIcon">
                          ◇
                        </div>

                        <div>
                          <strong>
                            {deal.title}
                          </strong>

                          <span>
                            {deal.deal_code}
                          </span>

                          {deal.owner_name && (
                            <small>
                              {deal.owner_name}
                            </small>
                          )}
                        </div>
                      </div>

                      <div className="dealCompanyCell">
                        <Link
                          href={
                            `/companies/${deal.company_id}`
                          }
                        >
                          {deal.company_name}
                        </Link>

                        <span>
                          {deal.company_code}
                        </span>

                        {deal.primary_contact_name && (
                          <small>
                            {deal.primary_contact_name}
                          </small>
                        )}
                      </div>

                      <div>
                        <span
                          className={
                            `dealStageBadge stage-${deal.stage.toLowerCase()}`
                          }
                        >
                          {stageNames[deal.stage]}
                        </span>
                      </div>

                      <div className="dealAmount">
                        {formatAmount(
                          deal.amount,
                          deal.currency,
                        )}
                      </div>

                      <div className="dealProbability">
                        <div>
                          <span
                            style={{
                              width:
                                `${deal.probability}%`,
                            }}
                          />
                        </div>

                        <strong>
                          {deal.probability}%
                        </strong>
                      </div>

                      <div className="dealCloseDate">
                        {deal.expected_close_date
                          ? new Intl.DateTimeFormat(
                              "ru-RU",
                            ).format(
                              new Date(
                                deal.expected_close_date,
                              ),
                            )
                          : "Не указана"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="createPanel">
            <div className="formHeader">
              <div className="formIcon">
                ＋
              </div>

              <div>
                <h2>Новая сделка</h2>

                <p>
                  Поля со звёздочкой обязательны
                </p>
              </div>
            </div>

            {companies.length === 0 ? (
              <div className="contactNoCompanies">
                <strong>
                  Сначала добавь компанию
                </strong>

                <p>
                  Каждая сделка должна быть
                  связана с компанией.
                </p>

                <Link href="/companies">
                  Перейти к компаниям
                </Link>
              </div>
            ) : (
              <form
                action={createDealAction}
                className="companyForm"
              >
                <label>
                  Компания *
                  <select
                    name="company_id"
                    required
                    defaultValue=""
                  >
                    <option
                      value=""
                      disabled
                    >
                      Выбери компанию
                    </option>

                    {companies.map(
                      (company) => (
                        <option
                          key={company.id}
                          value={company.id}
                        >
                          {company.display_name}
                          {" · "}
                          {company.company_code}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  Название сделки *
                  <input
                    name="title"
                    required
                    maxLength={255}
                    placeholder="Корпоративный тимбилдинг"
                  />
                </label>

                <label>
                  Основной контакт
                  <select
                    name="primary_contact_id"
                    defaultValue=""
                  >
                    <option value="">
                      Не выбран
                    </option>

                    {contacts.map(
                      (contact) => (
                        <option
                          key={contact.id}
                          value={contact.id}
                        >
                          {contact.full_name}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <div className="formColumns">
                  <label>
                    Сумма
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue="0"
                    />
                  </label>

                  <label>
                    Валюта
                    <select
                      name="currency"
                      defaultValue="BYN"
                    >
                      <option value="BYN">
                        BYN
                      </option>
                      <option value="RUB">
                        RUB
                      </option>
                      <option value="USD">
                        USD
                      </option>
                      <option value="EUR">
                        EUR
                      </option>
                    </select>
                  </label>
                </div>

                <label>
                  Стадия
                  <select
                    name="stage"
                    defaultValue="Lead"
                  >
                    <option value="Lead">
                      Лид
                    </option>
                    <option value="Qualified">
                      Квалификация
                    </option>
                    <option value="Proposal">
                      Предложение
                    </option>
                    <option value="Negotiation">
                      Переговоры
                    </option>
                    <option value="Won">
                      Выиграна
                    </option>
                    <option value="Lost">
                      Проиграна
                    </option>
                  </select>
                </label>

                <label>
                  Вероятность, %
                  <input
                    name="probability"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={
                      stageProbability.Lead
                    }
                  />
                </label>

                <label>
                  Ответственный
                  <input
                    name="owner_name"
                    maxLength={255}
                    placeholder="Имя менеджера"
                  />
                </label>

                <label>
                  Ожидаемая дата закрытия
                  <input
                    name="expected_close_date"
                    type="date"
                  />
                </label>

                <label>
                  Описание
                  <textarea
                    name="description"
                    rows={4}
                    maxLength={3000}
                    placeholder="Предмет сделки, требования и важный контекст"
                  />
                </label>

                <button
                  className="submitButton"
                  type="submit"
                >
                  Создать сделку
                </button>
              </form>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
EOF

echo
echo "==> 8/10 Добавление сделок в карточку компании"

python3 <<'PY'
from pathlib import Path

path = Path("app/companies/[id]/page.tsx")
text = path.read_text(encoding="utf-8")

deal_import = '''import {
  listCompanyDeals,
} from "@/lib/repositories/deal.repository";
'''

if "@/lib/repositories/deal.repository" not in text:
    marker = 'import {\n  getCompanyById,\n  listCompanyContacts,\n} from "@/lib/repositories/company.repository";\n'

    if marker not in text:
        raise SystemExit(
            "Не найден import company.repository в карточке компании."
        )

    text = text.replace(
        marker,
        marker + "\n" + deal_import,
    )

old_promise = '''const [company, contacts] = await Promise.all([
    getCompanyById(id),
    listCompanyContacts(id),
  ]);'''

new_promise = '''const [company, contacts, deals] = await Promise.all([
    getCompanyById(id),
    listCompanyContacts(id),
    listCompanyDeals(id),
  ]);'''

if old_promise not in text:
    raise SystemExit(
        "Не найден блок Promise.all в карточке компании."
    )

text = text.replace(
    old_promise,
    new_promise,
)

old_summary = '''<div>
                <strong>0</strong>
                <span>активных сделок</span>
              </div>'''

new_summary = '''<div>
                <strong>
                  {
                    deals.filter(
                      (deal) =>
                        !["Won", "Lost"].includes(deal.stage),
                    ).length
                  }
                </strong>
                <span>активных сделок</span>
              </div>'''

if old_summary in text:
    text = text.replace(
        old_summary,
        new_summary,
    )

deals_section = '''
        <section id="deals" className="companyContactsPanel">
          <div className="companySectionHeader">
            <div>
              <h2>Сделки компании</h2>
              <p>Коммерческие возможности этой организации</p>
            </div>

            <Link href="/deals">Все сделки →</Link>
          </div>

          {deals.length === 0 ? (
            <div className="companyEmptyContacts">
              <div className="emptyIcon">◇</div>

              <h3>Сделок пока нет</h3>

              <p>
                Создай коммерческую возможность
                и выбери эту компанию.
              </p>

              <Link href="/deals">
                Добавить первую сделку
              </Link>
            </div>
          ) : (
            <div className="companyDealGrid">
              {deals.map((deal) => (
                <article
                  className="companyDealCard"
                  key={deal.id}
                >
                  <div className="companyDealHeader">
                    <div>
                      <strong>{deal.title}</strong>
                      <span>{deal.deal_code}</span>
                    </div>

                    <span
                      className={
                        `dealStageBadge stage-${deal.stage.toLowerCase()}`
                      }
                    >
                      {deal.stage}
                    </span>
                  </div>

                  <div className="companyDealAmount">
                    {new Intl.NumberFormat("ru-RU", {
                      maximumFractionDigits: 2,
                    }).format(Number(deal.amount))}
                    {" "}
                    {deal.currency}
                  </div>

                  <div className="companyDealFooter">
                    <span>
                      Вероятность: {deal.probability}%
                    </span>

                    <span>
                      {deal.expected_close_date
                        ? new Intl.DateTimeFormat("ru-RU").format(
                            new Date(deal.expected_close_date),
                          )
                        : "Дата не указана"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

'''

contacts_marker = '''        <section id="contacts" className="companyContactsPanel">'''

if contacts_marker not in text:
    raise SystemExit(
        "Не найдена секция Contacts в карточке компании."
    )

if 'className="companyDealGrid"' not in text:
    text = text.replace(
        contacts_marker,
        deals_section + contacts_marker,
    )

text = text.replace(
    '["◇", "Сделки", "#"]',
    '["◇", "Сделки", "/deals"]',
)

path.write_text(
    text,
    encoding="utf-8",
)
PY

python3 <<'PY'
from pathlib import Path

path = Path("app/contacts/page.tsx")

if path.exists():
    text = path.read_text(encoding="utf-8")

    text = text.replace(
        '["◇", "Сделки", "#"]',
        '["◇", "Сделки", "/deals"]',
    )

    path.write_text(
        text,
        encoding="utf-8",
    )
PY

echo
echo "==> 9/10 Health-check и стили"

cat > app/api/health/deals/route.ts <<'EOF'
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result =
      await getDb().query<{
        deals: string;
        active: string;
        won: string;
      }>(
        `
          SELECT
            COUNT(*)::TEXT AS deals,

            COUNT(*) FILTER (
              WHERE stage NOT IN ('Won', 'Lost')
            )::TEXT AS active,

            COUNT(*) FILTER (
              WHERE stage = 'Won'
            )::TEXT AS won

          FROM sales.deals
        `,
      );

    return NextResponse.json({
      status: "ok",
      module: "deals",
      database: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Deals health-check failed:",
      error,
    );

    return NextResponse.json(
      {
        status: "error",
        module: "deals",
      },
      {
        status: 500,
      },
    );
  }
}
EOF

cat >> app/globals.css <<'EOF'

.dealMetricsGrid {
  grid-template-columns:
    repeat(4, minmax(0, 1fr));
}

.dealStageSummary {
  display: grid;
  grid-template-columns:
    repeat(6, minmax(0, 1fr));
  gap: 9px;
  margin-top: 18px;
}

.dealStageCard {
  padding: 13px 14px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--surface);
}

.dealStageCard div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.dealStageCard span {
  color: var(--muted-strong);
  font-size: 10px;
  font-weight: 800;
}

.dealStageCard strong {
  font-size: 17px;
}

.dealStageCard p {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 10px;
}

.dealTable {
  min-width: 1080px;
}

.dealTableRow {
  display: grid;
  grid-template-columns:
    minmax(220px, 1.3fr)
    minmax(170px, 1fr)
    minmax(130px, 0.75fr)
    minmax(120px, 0.75fr)
    minmax(140px, 0.8fr)
    minmax(105px, 0.65fr);
  gap: 15px;
  align-items: center;
  min-height: 79px;
  padding: 0 18px;
  border-bottom: 1px solid var(--border-soft);
}

.dealTableRow:not(.dealTableHead):hover {
  background: var(--surface-hover);
}

.dealTableHead {
  min-height: 45px;
  background: var(--surface-soft);
  color: #65758a;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.dealTitleCell {
  display: flex;
  gap: 11px;
  align-items: center;
}

.dealIcon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 11px;
  background: rgba(112, 108, 246, 0.14);
  color: #aaa7ff;
  font-size: 17px;
}

.dealTitleCell strong,
.dealTitleCell span,
.dealTitleCell small,
.dealCompanyCell a,
.dealCompanyCell span,
.dealCompanyCell small {
  display: block;
}

.dealTitleCell strong,
.dealCompanyCell a {
  color: var(--text);
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}

.dealCompanyCell a:hover {
  color: #9793ff;
}

.dealTitleCell span,
.dealCompanyCell span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 9px;
}

.dealTitleCell small,
.dealCompanyCell small {
  margin-top: 4px;
  color: #7c8ba0;
  font-size: 9px;
}

.dealStageBadge {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 900;
}

.stage-lead {
  background: rgba(96, 165, 250, 0.1);
  color: #7eb5f8;
}

.stage-qualified {
  background: rgba(129, 140, 248, 0.12);
  color: #a5b4fc;
}

.stage-proposal {
  background: rgba(251, 191, 36, 0.1);
  color: #f8ca4e;
}

.stage-negotiation {
  background: rgba(249, 115, 22, 0.1);
  color: #fb923c;
}

.stage-won {
  background: rgba(74, 222, 128, 0.1);
  color: #77e99d;
}

.stage-lost {
  background: rgba(251, 113, 133, 0.1);
  color: #fb8ca0;
}

.dealAmount {
  color: #e3e8f1;
  font-size: 12px;
  font-weight: 800;
}

.dealProbability {
  display: flex;
  gap: 8px;
  align-items: center;
}

.dealProbability > div {
  width: 72px;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: #26324a;
}

.dealProbability > div span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--primary);
}

.dealProbability strong {
  color: var(--muted-strong);
  font-size: 10px;
}

.dealCloseDate {
  color: var(--muted-strong);
  font-size: 10px;
}

.companyDealGrid {
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 18px;
}

.companyDealCard {
  padding: 15px;
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  background: var(--surface-soft);
}

.companyDealHeader {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.companyDealHeader strong,
.companyDealHeader span {
  display: block;
}

.companyDealHeader strong {
  font-size: 12px;
}

.companyDealHeader div > span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 9px;
}

.companyDealAmount {
  margin-top: 18px;
  font-size: 20px;
  font-weight: 900;
}

.companyDealFooter {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 13px;
  color: var(--muted);
  font-size: 9px;
}

@media (max-width: 1250px) {
  .dealStageSummary {
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
  }

  .companyDealGrid {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .dealMetricsGrid,
  .dealStageSummary,
  .companyDealGrid {
    grid-template-columns: 1fr;
  }
}
EOF

echo
echo "==> 10/10 Сборка и тестирование"

if ! docker compose build \
  --no-cache \
  --progress=plain \
  2>&1 | tee /tmp/deals-build.log
then
  echo
  echo "❌ Ошибка сборки Deals."
  echo

  grep -n -B 14 -A 40 \
    -E "Failed to compile|Type error|Error:|Build error" \
    /tmp/deals-build.log \
    | tail -n 180 || true

  exit 1
fi

docker compose up -d --force-recreate

echo "Ожидаю запуск..."

READY=0

for attempt in $(seq 1 45); do
  DEALS_CODE="$(
    curl \
      --silent \
      --output /tmp/deals-page.html \
      --write-out '%{http_code}' \
      http://127.0.0.1:3000/deals \
      || true
  )"

  HEALTH_CODE="$(
    curl \
      --silent \
      --output /tmp/deals-health.json \
      --write-out '%{http_code}' \
      http://127.0.0.1:3000/api/health/deals \
      || true
  )"

  if [[ "$DEALS_CODE" == "200" &&
        "$HEALTH_CODE" == "200" ]]; then
    READY=1
    break
  fi

  sleep 2
done

if [[ "$READY" -ne 1 ]]; then
  echo
  echo "❌ Модуль Deals не прошёл проверку."
  echo "Deals HTTP:  $DEALS_CODE"
  echo "Health HTTP: $HEALTH_CODE"
  echo

  cat /tmp/deals-health.json 2>/dev/null || true

  echo
  docker logs "$APP_CONTAINER" --tail 200

  exit 1
fi

echo
echo "✅ Deals health-check:"
cat /tmp/deals-health.json
echo

echo
echo "Проверка таблицы:"

docker exec \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  psql \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -c "
    SELECT
      COUNT(*) AS deals
    FROM sales.deals;
  "

echo
echo "=================================================="
echo "✅ Модуль Deals установлен"
echo
echo "Открыть:"
echo "  https://sales.cardigansarena.ru/deals"
echo
echo "Карточка компании:"
echo "  https://sales.cardigansarena.ru/companies"
echo
echo "Резервная копия:"
echo "  $BACKUP_DIR"
echo "=================================================="
echo

read -r -p "Сохранить Deals в GitHub? [y/N]: " PUSH_CONFIRM

case "$PUSH_CONFIRM" in
  y|Y|yes|YES)
    git add \
      scripts/install-deals.sh \
      app/deals \
      app/api/health/deals \
      'app/companies/[id]/page.tsx' \
      app/contacts/page.tsx \
      lib/repositories/deal.repository.ts \
      types/deal.ts \
      app/globals.css

    if git diff --cached --quiet; then
      echo "Нет новых изменений для коммита."
    else
      git commit -m "Add Deals pipeline module"
      git push origin main

      echo "✅ Deals сохранён в GitHub."
    fi
    ;;

  *)
    echo "GitHub не изменён."
    echo "Модуль уже работает на сервере."
    ;;
esac
