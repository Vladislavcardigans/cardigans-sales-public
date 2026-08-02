#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/opt/cardigans-sales"
INFRA_ENV="/opt/cardigans/.env"
POSTGRES_CONTAINER="cardigans-postgres"
APP_CONTAINER="cardigans-sales"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$PROJECT_DIR/.backups/contact-profile-$STAMP"

trap '
  code=$?
  echo
  echo "❌ Ошибка на строке $LINENO, код $code."
  exit $code
' ERR

cd "$PROJECT_DIR"

echo "=================================================="
echo " Contacts 2.0 — карточка контакта"
echo "=================================================="
echo
echo "Будет добавлено:"
echo "  • маршрут /contacts/[id];"
echo "  • отдел, день рождения, аватар и теги;"
echo "  • связанные сделки;"
echo "  • связанные активности;"
echo "  • связанные задачи;"
echo "  • переход из каталога контактов."
echo

read -r -p "Продолжить? [y/N]: " CONFIRM

case "$CONFIRM" in
  y|Y|yes|YES) ;;
  *) echo "Отменено."; exit 0 ;;
esac

echo
echo "==> 1/9 Проверка проекта"

if [[ ! -d .git ]]; then
  echo "❌ Не найден Git-репозиторий."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Есть несохранённые изменения:"
  git status --short
  exit 1
fi

if [[ ! -f "$INFRA_ENV" ]]; then
  echo "❌ Не найден $INFRA_ENV"
  exit 1
fi

echo
echo "==> 2/9 Резервная копия"

mkdir -p "$BACKUP_DIR"

for PATH_NAME in \
  app/contacts/page.tsx \
  'app/contacts/[id]' \
  app/globals.css \
  lib/repositories/contact.repository.ts \
  types/contact.ts
do
  if [[ -e "$PATH_NAME" ]]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$PATH_NAME")"
    cp -a "$PATH_NAME" "$BACKUP_DIR/$PATH_NAME"
  fi
done

echo "Резервная копия: $BACKUP_DIR"

echo
echo "==> 3/9 Обновление PostgreSQL"

set -a
source "$INFRA_ENV"
set +a

: "${POSTGRES_USER:?Не указан POSTGRES_USER}"
: "${POSTGRES_PASSWORD:?Не указан POSTGRES_PASSWORD}"
: "${POSTGRES_DB:?Не указан POSTGRES_DB}"

docker exec -i \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  psql \
  -v ON_ERROR_STOP=1 \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" <<'SQL'
ALTER TABLE sales.contacts
  ADD COLUMN IF NOT EXISTS department TEXT;

ALTER TABLE sales.contacts
  ADD COLUMN IF NOT EXISTS birthday DATE;

ALTER TABLE sales.contacts
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE sales.contacts
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS contacts_tags_gin_idx
  ON sales.contacts
  USING GIN(tags);
SQL

echo
echo "==> 4/9 Расширение типов"

python3 <<'PY'
from pathlib import Path

path = Path("types/contact.ts")
text = path.read_text(encoding="utf-8")

text = text.replace(
'''  job_title: string | null;

  email: string | null;''',
'''  job_title: string | null;
  department: string | null;
  birthday: string | null;
  avatar_url: string | null;
  tags: string[];

  email: string | null;'''
)

text = text.replace(
'''  jobTitle: string | null;

  email: string | null;''',
'''  jobTitle: string | null;
  department: string | null;
  birthday: string | null;
  avatarUrl: string | null;
  tags: string[];

  email: string | null;'''
)

path.write_text(text, encoding="utf-8")
PY

echo
echo "==> 5/9 Расширение contact repository"

cat >> lib/repositories/contact.repository.ts <<'EOF'

export type ContactProfile = Contact & {
  deals_count: number;
  activities_count: number;
  tasks_count: number;
};

export type ContactDeal = {
  id: string;
  deal_code: string;
  title: string;
  stage: string;
  amount: string;
  currency: string;
  probability: number;
  expected_close_date: string | null;
};

export type ContactActivity = {
  id: string;
  activity_code: string;
  activity_type: string;
  subject: string;
  status: string;
  priority: string;
  scheduled_at: string | null;
};

export type ContactTask = {
  id: string;
  task_code: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
};

export async function getContactById(
  id: string,
): Promise<ContactProfile | null> {
  const result = await getDb().query<ContactProfile>(
    `
      SELECT
        contact.id,
        contact.company_id,
        company.display_name AS company_name,
        company.company_code,

        contact.first_name,
        contact.last_name,
        contact.job_title,
        contact.department,
        contact.birthday::TEXT,
        contact.avatar_url,
        contact.tags,

        contact.email,
        contact.phone,
        contact.telegram,
        contact.linkedin_url,

        contact.preferred_channel,
        contact.contact_status,

        contact.is_decision_maker,
        contact.do_not_contact,

        contact.notes,

        contact.created_at,
        contact.updated_at,

        (
          SELECT COUNT(*)::INTEGER
          FROM sales.deals
          WHERE primary_contact_id = contact.id
        ) AS deals_count,

        (
          SELECT COUNT(*)::INTEGER
          FROM sales.activities
          WHERE contact_id = contact.id
        ) AS activities_count,

        (
          SELECT COUNT(*)::INTEGER
          FROM sales.tasks
          WHERE contact_id = contact.id
        ) AS tasks_count

      FROM sales.contacts AS contact

      INNER JOIN sales.companies AS company
        ON company.id = contact.company_id

      WHERE contact.id = $1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function listContactDeals(
  contactId: string,
): Promise<ContactDeal[]> {
  const result = await getDb().query<ContactDeal>(
    `
      SELECT
        id,
        deal_code,
        title,
        stage,
        amount::TEXT,
        currency,
        probability,
        expected_close_date::TEXT

      FROM sales.deals

      WHERE primary_contact_id = $1

      ORDER BY created_at DESC
    `,
    [contactId],
  );

  return result.rows;
}

export async function listContactActivities(
  contactId: string,
): Promise<ContactActivity[]> {
  const result = await getDb().query<ContactActivity>(
    `
      SELECT
        id,
        activity_code,
        activity_type,
        subject,
        status,
        priority,
        scheduled_at::TEXT

      FROM sales.activities

      WHERE contact_id = $1

      ORDER BY
        scheduled_at DESC NULLS LAST,
        created_at DESC

      LIMIT 50
    `,
    [contactId],
  );

  return result.rows;
}

export async function listContactTasks(
  contactId: string,
): Promise<ContactTask[]> {
  const result = await getDb().query<ContactTask>(
    `
      SELECT
        id,
        task_code,
        title,
        status,
        priority,
        due_at::TEXT

      FROM sales.tasks

      WHERE contact_id = $1

      ORDER BY
        due_at ASC NULLS LAST,
        created_at DESC

      LIMIT 50
    `,
    [contactId],
  );

  return result.rows;
}
EOF

echo
echo "==> 6/9 Обновление основного SELECT контактов"

python3 <<'PY'
from pathlib import Path

path = Path("lib/repositories/contact.repository.ts")
text = path.read_text(encoding="utf-8")

text = text.replace(
'''        contact.first_name,
        contact.last_name,
        contact.job_title,

        contact.email,''',
'''        contact.first_name,
        contact.last_name,
        contact.job_title,
        contact.department,
        contact.birthday::TEXT,
        contact.avatar_url,
        contact.tags,

        contact.email,'''
)

text = text.replace(
'''          first_name,
          last_name,
          job_title,

          email,''',
'''          first_name,
          last_name,
          job_title,
          department,
          birthday,
          avatar_url,
          tags,

          email,'''
)

text = text.replace(
'''          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10,
          $11, $12,
          $13''',
'''          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14,
          $15, $16,
          $17'''
)

text = text.replace(
'''        inserted.first_name,
        inserted.last_name,
        inserted.job_title,

        inserted.email,''',
'''        inserted.first_name,
        inserted.last_name,
        inserted.job_title,
        inserted.department,
        inserted.birthday::TEXT,
        inserted.avatar_url,
        inserted.tags,

        inserted.email,'''
)

text = text.replace(
'''      input.firstName,
      input.lastName,
      input.jobTitle,

      input.email,''',
'''      input.firstName,
      input.lastName,
      input.jobTitle,
      input.department,

      input.birthday,
      input.avatarUrl,
      input.tags,

      input.email,'''
)

path.write_text(text, encoding="utf-8")
PY

echo
echo "==> 7/9 Создание карточки контакта"

mkdir -p 'app/contacts/[id]'

cat > 'app/contacts/[id]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";

import { SalesSidebar } from "@/components/layout/SalesSidebar";
import { DatabaseStatus } from "@/components/ui/DatabaseStatus";

import {
  getContactById,
  listContactActivities,
  listContactDeals,
  listContactTasks,
} from "@/lib/repositories/contact.repository";

export const dynamic = "force-dynamic";

type ContactPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const stageNames: Record<string, string> = {
  Lead: "Лид",
  Qualified: "Квалификация",
  Proposal: "Предложение",
  Negotiation: "Переговоры",
  Won: "Выиграна",
  Lost: "Проиграна",
};

const activityNames: Record<string, string> = {
  Call: "Звонок",
  Email: "Письмо",
  Meeting: "Встреча",
  Message: "Сообщение",
  Note: "Заметка",
  Task: "Задача",
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function ContactPage({
  params,
}: ContactPageProps) {
  const { id } = await params;

  const [
    contact,
    deals,
    activities,
    tasks,
  ] = await Promise.all([
    getContactById(id),
    listContactDeals(id),
    listContactActivities(id),
    listContactTasks(id),
  ]);

  if (!contact) {
    notFound();
  }

  const fullName = [
    contact.first_name,
    contact.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  const initials = [
    contact.first_name,
    contact.last_name,
  ]
    .filter(Boolean)
    .map((part) => part?.[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="appShell">
      <SalesSidebar activeSection="contacts" />

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            <Link href="/contacts">Контакты</Link>
            <strong>/</strong>
            <span>{fullName}</span>
          </div>

          <DatabaseStatus />
        </header>

        <section className="contactProfileHero">
          <div className="contactProfileIdentity">
            <div className="contactProfileAvatar">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={fullName}
                />
              ) : (
                initials
              )}
            </div>

            <div>
              <div className="eyebrow">
                {contact.company_code}
              </div>

              <h1>{fullName}</h1>

              <div className="contactProfileMeta">
                <span>
                  {contact.job_title ??
                    "Должность не указана"}
                </span>

                {contact.department && (
                  <>
                    <span>•</span>
                    <span>{contact.department}</span>
                  </>
                )}

                {contact.is_decision_maker && (
                  <span className="contactDecisionBadge">
                    ЛПР
                  </span>
                )}

                {contact.do_not_contact && (
                  <span className="contactBlockedBadge">
                    Не связываться
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="companyHeroActions">
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="secondaryButton companyActionLink"
              >
                Написать
              </a>
            )}

            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="primaryButton companyActionLink"
              >
                Позвонить
              </a>
            )}
          </div>
        </section>

        <section className="contactProfileMetricGrid">
          <article>
            <strong>{contact.deals_count}</strong>
            <span>сделок</span>
          </article>

          <article>
            <strong>{contact.activities_count}</strong>
            <span>активностей</span>
          </article>

          <article>
            <strong>{contact.tasks_count}</strong>
            <span>задач</span>
          </article>

          <article>
            <strong>{contact.preferred_channel}</strong>
            <span>предпочтительный канал</span>
          </article>
        </section>

        <section className="contactProfileGrid">
          <section className="contactProfilePanel">
            <div className="companySectionHeader">
              <div>
                <h2>Профиль контакта</h2>
                <p>Основная информация</p>
              </div>
            </div>

            <div className="companyInfoList">
              <div>
                <span>Компания</span>
                <Link
                  className="contactProfileCompanyLink"
                  href={`/companies/${contact.company_id}`}
                >
                  {contact.company_name}
                </Link>
              </div>

              <div>
                <span>Должность</span>
                <strong>
                  {contact.job_title ?? "Не указана"}
                </strong>
              </div>

              <div>
                <span>Отдел</span>
                <strong>
                  {contact.department ?? "Не указан"}
                </strong>
              </div>

              <div>
                <span>День рождения</span>
                <strong>
                  {formatDate(contact.birthday)}
                </strong>
              </div>

              <div>
                <span>Email</span>
                {contact.email ? (
                  <a href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                ) : (
                  <strong>Не указан</strong>
                )}
              </div>

              <div>
                <span>Телефон</span>
                {contact.phone ? (
                  <a href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                ) : (
                  <strong>Не указан</strong>
                )}
              </div>

              <div>
                <span>Telegram</span>
                <strong>
                  {contact.telegram ?? "Не указан"}
                </strong>
              </div>

              <div>
                <span>LinkedIn</span>
                {contact.linkedin_url ? (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть профиль
                  </a>
                ) : (
                  <strong>Не указан</strong>
                )}
              </div>
            </div>

            {contact.tags.length > 0 && (
              <div className="contactTagBlock">
                <span>Теги</span>

                <div>
                  {contact.tags.map((tag) => (
                    <strong key={tag}>{tag}</strong>
                  ))}
                </div>
              </div>
            )}

            {contact.notes && (
              <div className="contactNotesBlock">
                <span>Примечание</span>
                <p>{contact.notes}</p>
              </div>
            )}
          </section>

          <aside className="contactProfilePanel">
            <div className="companySectionHeader">
              <div>
                <h2>Коммерческая связь</h2>
                <p>Текущая нагрузка контакта</p>
              </div>
            </div>

            <div className="contactCommercialSummary">
              <Link href="/deals">
                <strong>{contact.deals_count}</strong>
                <span>сделок</span>
              </Link>

              <Link href="/activities">
                <strong>{contact.activities_count}</strong>
                <span>активностей</span>
              </Link>

              <Link href="/tasks">
                <strong>{contact.tasks_count}</strong>
                <span>задач</span>
              </Link>
            </div>
          </aside>
        </section>

        <section className="contactRelationsGrid">
          <section className="contactProfilePanel">
            <div className="companySectionHeader">
              <div>
                <h2>Связанные сделки</h2>
                <p>Сделки, где контакт выбран основным</p>
              </div>

              <Link href="/deals">Все сделки →</Link>
            </div>

            {deals.length === 0 ? (
              <div className="dashboardEmpty">
                Связанных сделок пока нет
              </div>
            ) : (
              <div className="contactRelationList">
                {deals.map((deal) => (
                  <article key={deal.id}>
                    <div>
                      <strong>{deal.title}</strong>
                      <span>{deal.deal_code}</span>
                    </div>

                    <span
                      className={
                        `dealStageBadge stage-${deal.stage.toLowerCase()}`
                      }
                    >
                      {stageNames[deal.stage] ?? deal.stage}
                    </span>

                    <strong>
                      {new Intl.NumberFormat("ru-RU").format(
                        Number(deal.amount),
                      )}
                      {" "}
                      {deal.currency}
                    </strong>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="contactProfilePanel">
            <div className="companySectionHeader">
              <div>
                <h2>Задачи</h2>
                <p>Действия, связанные с контактом</p>
              </div>

              <Link href="/tasks">Все задачи →</Link>
            </div>

            {tasks.length === 0 ? (
              <div className="dashboardEmpty">
                Связанных задач пока нет
              </div>
            ) : (
              <div className="contactRelationList">
                {tasks.map((task) => (
                  <article key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <span>{task.task_code}</span>
                    </div>

                    <span>{task.status}</span>

                    <small>
                      {formatDateTime(task.due_at)}
                    </small>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>

        <section className="contactProfilePanel contactActivityPanel">
          <div className="companySectionHeader">
            <div>
              <h2>История активностей</h2>
              <p>
                Последние звонки, встречи, письма и заметки
              </p>
            </div>

            <Link href="/activities">
              Все активности →
            </Link>
          </div>

          {activities.length === 0 ? (
            <div className="dashboardEmpty">
              Связанных активностей пока нет
            </div>
          ) : (
            <div className="contactTimeline">
              {activities.map((activity) => (
                <article key={activity.id}>
                  <div className="contactTimelineMarker" />

                  <div>
                    <strong>{activity.subject}</strong>

                    <span>
                      {activityNames[activity.activity_type] ??
                        activity.activity_type}
                      {" · "}
                      {activity.status}
                    </span>

                    <small>
                      {formatDateTime(activity.scheduled_at)}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
EOF

echo
echo "==> 8/9 Делаю контакты кликабельными"

python3 <<'PY'
from pathlib import Path

path = Path("app/contacts/page.tsx")
text = path.read_text(encoding="utf-8")

old = '''<strong>
                              {fullName}
                            </strong>'''

new = '''<Link
                              className="contactNameLink"
                              href={`/contacts/${contact.id}`}
                            >
                              {fullName}
                            </Link>'''

if old not in text:
    raise SystemExit(
        "Не найдено имя контакта в app/contacts/page.tsx"
    )

text = text.replace(old, new)

path.write_text(text, encoding="utf-8")
PY

echo
echo "==> 9/9 Стили, сборка и проверка"

cat >> app/globals.css <<'EOF'

.contactNameLink {
  color: var(--text);
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

.contactNameLink:hover {
  color: #9692ff;
}

.contactProfileHero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  padding: 34px 0 26px;
}

.contactProfileIdentity {
  display: flex;
  gap: 17px;
  align-items: center;
}

.contactProfileAvatar {
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid #34415b;
  border-radius: 50%;
  background: linear-gradient(145deg, #2b3760, #171f38);
  color: #d5d8ff;
  font-size: 20px;
  font-weight: 900;
}

.contactProfileAvatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.contactProfileMeta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 9px;
  color: var(--muted);
  font-size: 11px;
}

.contactDecisionBadge,
.contactBlockedBadge {
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 8px;
  font-weight: 900;
}

.contactDecisionBadge {
  background: rgba(112, 108, 246, 0.14);
  color: #aaa7ff;
}

.contactBlockedBadge {
  background: rgba(251, 113, 133, 0.1);
  color: #fb8ca0;
}

.contactProfileMetricGrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.contactProfileMetricGrid article {
  padding: 17px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--surface);
}

.contactProfileMetricGrid strong,
.contactProfileMetricGrid span {
  display: block;
}

.contactProfileMetricGrid strong {
  font-size: 22px;
}

.contactProfileMetricGrid span {
  margin-top: 6px;
  color: var(--muted);
  font-size: 9px;
}

.contactProfileGrid,
.contactRelationsGrid {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr;
  gap: 18px;
  margin-top: 18px;
}

.contactRelationsGrid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.contactProfilePanel {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: var(--surface);
}

.contactProfilePanel .companyInfoList a,
.contactProfileCompanyLink {
  display: block;
  margin-top: 7px;
  color: #9692ff;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

.contactTagBlock,
.contactNotesBlock {
  padding: 18px 20px;
  border-top: 1px solid var(--border-soft);
}

.contactTagBlock > span,
.contactNotesBlock > span {
  color: var(--muted);
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
}

.contactTagBlock > div {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}

.contactTagBlock strong {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(112, 108, 246, 0.13);
  color: #aaa7ff;
  font-size: 9px;
}

.contactNotesBlock p {
  margin: 9px 0 0;
  color: var(--muted-strong);
  font-size: 10px;
  line-height: 1.6;
}

.contactCommercialSummary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 24px 18px;
}

.contactCommercialSummary a {
  color: var(--text);
  text-align: center;
  text-decoration: none;
}

.contactCommercialSummary strong,
.contactCommercialSummary span {
  display: block;
}

.contactCommercialSummary strong {
  font-size: 23px;
}

.contactCommercialSummary span {
  margin-top: 6px;
  color: var(--muted);
  font-size: 9px;
}

.contactRelationList {
  display: grid;
}

.contactRelationList article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-soft);
}

.contactRelationList article:last-child {
  border-bottom: 0;
}

.contactRelationList strong,
.contactRelationList span,
.contactRelationList small {
  font-size: 9px;
}

.contactRelationList div strong,
.contactRelationList div span {
  display: block;
}

.contactRelationList div strong {
  font-size: 11px;
}

.contactRelationList div span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 8px;
}

.contactActivityPanel {
  margin-top: 18px;
}

.contactTimeline {
  display: grid;
  padding: 8px 18px 18px;
}

.contactTimeline article {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
  padding: 13px 0;
  border-bottom: 1px solid var(--border-soft);
}

.contactTimeline article:last-child {
  border-bottom: 0;
}

.contactTimelineMarker {
  width: 9px;
  height: 9px;
  margin-top: 4px;
  border: 2px solid var(--primary);
  border-radius: 50%;
}

.contactTimeline strong,
.contactTimeline span,
.contactTimeline small {
  display: block;
}

.contactTimeline strong {
  font-size: 11px;
}

.contactTimeline span {
  margin-top: 5px;
  color: var(--muted-strong);
  font-size: 9px;
}

.contactTimeline small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 8px;
}

@media (max-width: 980px) {
  .contactProfileGrid,
  .contactRelationsGrid {
    grid-template-columns: 1fr;
  }

  .contactProfileMetricGrid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 680px) {
  .contactProfileHero {
    align-items: flex-start;
    flex-direction: column;
  }

  .contactProfileMetricGrid {
    grid-template-columns: 1fr;
  }
}
EOF

if ! docker compose build \
  --progress=plain \
  2>&1 | tee /tmp/contact-profile-build.log
then
  echo
  echo "❌ Ошибка сборки."

  grep -n -B 15 -A 45 \
    -E "Failed to compile|Type error|Error:|Build error" \
    /tmp/contact-profile-build.log \
    | tail -n 220 || true

  exit 1
fi

docker compose up -d --force-recreate

CONTACT_ID="$(
  docker exec "$POSTGRES_CONTAINER" \
    psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -tAc \
    "SELECT id FROM sales.contacts ORDER BY created_at LIMIT 1;" \
    | tr -d '[:space:]'
)"

READY=0

for ATTEMPT in $(seq 1 45); do
  CONTACTS_CODE="$(
    curl -s -o /dev/null -w '%{http_code}' \
      http://127.0.0.1:3000/contacts || true
  )"

  if [[ -n "$CONTACT_ID" ]]; then
    PROFILE_CODE="$(
      curl -s -o /dev/null -w '%{http_code}' \
        "http://127.0.0.1:3000/contacts/$CONTACT_ID" || true
    )"
  else
    PROFILE_CODE="200"
  fi

  if [[ "$CONTACTS_CODE" == "200" &&
        "$PROFILE_CODE" == "200" ]]
  then
    READY=1
    break
  fi

  sleep 2
done

if [[ "$READY" -ne 1 ]]; then
  echo "❌ Проверка не пройдена."
  echo "Contacts: HTTP $CONTACTS_CODE"
  echo "Profile:  HTTP $PROFILE_CODE"

  docker logs "$APP_CONTAINER" --tail 220
  exit 1
fi

echo
echo "=================================================="
echo "✅ Contacts 2.0 установлен"
echo
echo "Открой:"
echo "  https://sales.cardigansarena.ru/contacts"
echo
echo "Нажми на имя контакта."
echo
echo "Резервная копия:"
echo "  $BACKUP_DIR"
echo "=================================================="
echo

read -r -p "Сохранить Contacts 2.0 в GitHub? [y/N]: " PUSH_CONFIRM

case "$PUSH_CONFIRM" in
  y|Y|yes|YES)
    git add \
      scripts/install-contact-profile.sh \
      'app/contacts/[id]/page.tsx' \
      app/contacts/page.tsx \
      lib/repositories/contact.repository.ts \
      types/contact.ts \
      app/globals.css

    git commit -m "Add enhanced contact profiles"
    git push origin main

    echo "✅ Изменения сохранены в GitHub."
    ;;

  *)
    echo "GitHub не изменён."
    ;;
esac
