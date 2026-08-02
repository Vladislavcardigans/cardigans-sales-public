#!/usr/bin/env bash

PROJECT_DIR="/opt/cardigans-sales"
INFRA_ENV="/opt/cardigans/.env"
POSTGRES_CONTAINER="cardigans-postgres"
APP_CONTAINER="cardigans-sales"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$PROJECT_DIR/.backups/install-activities-$STAMP"

trap '
  code=$?
  echo
  echo "❌ Ошибка на строке $LINENO, код $code."
  echo "Терминал останется открытым."
  exit $code
' ERR

cd "$PROJECT_DIR" || exit 1

echo "=================================================="
echo " Установка модуля Activities"
echo "=================================================="
echo
echo "Будет создано:"
echo "  • таблица sales.activities;"
echo "  • звонки, письма, встречи и задачи;"
echo "  • связи с компаниями, контактами и сделками;"
echo "  • маршрут /activities;"
echo "  • группы Просрочено / Сегодня / Предстоящие;"
echo "  • журнал активности в карточке компании;"
echo "  • health-check и автоматические проверки."
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
echo "==> 1/10 Проверка проекта"

if [[ ! -d .git ]]; then
  echo "❌ В $PROJECT_DIR отсутствует .git"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ В репозитории есть несохранённые изменения:"
  git status --short
  echo
  echo "Сначала сохрани или отмени их."
  exit 1
fi

if [[ ! -f "$INFRA_ENV" ]]; then
  echo "❌ Не найден $INFRA_ENV"
  exit 1
fi

echo
echo "==> 2/10 Резервное копирование"

mkdir -p "$BACKUP_DIR"

for PATH_NAME in \
  app/activities \
  app/api/health/activities \
  'app/companies/[id]/page.tsx' \
  app/globals.css \
  components/layout/SalesSidebar.tsx \
  lib/navigation.ts \
  lib/repositories/activity.repository.ts \
  types/activity.ts
do
  if [[ -e "$PATH_NAME" ]]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$PATH_NAME")"
    cp -a "$PATH_NAME" "$BACKUP_DIR/$PATH_NAME"
  fi
done

echo "Резервная копия:"
echo "  $BACKUP_DIR"

echo
echo "==> 3/10 Загрузка PostgreSQL"

set -a
source "$INFRA_ENV"
set +a

: "${POSTGRES_USER:?Не указан POSTGRES_USER}"
: "${POSTGRES_PASSWORD:?Не указан POSTGRES_PASSWORD}"
: "${POSTGRES_DB:?Не указан POSTGRES_DB}"

echo "База: $POSTGRES_DB"

echo
echo "==> 4/10 Создание таблицы activities"

docker exec -i \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  psql \
  -v ON_ERROR_STOP=1 \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" <<'SQL'
CREATE SEQUENCE IF NOT EXISTS sales.activity_code_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

ALTER SEQUENCE sales.activity_code_seq OWNER TO sales_app;

CREATE TABLE IF NOT EXISTS sales.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  activity_code TEXT UNIQUE NOT NULL DEFAULT (
    'ACT-' ||
    LPAD(nextval('sales.activity_code_seq')::TEXT, 6, '0')
  ),

  company_id UUID NOT NULL
    REFERENCES sales.companies(id)
    ON DELETE CASCADE,

  contact_id UUID
    REFERENCES sales.contacts(id)
    ON DELETE SET NULL,

  deal_id UUID
    REFERENCES sales.deals(id)
    ON DELETE SET NULL,

  activity_type TEXT NOT NULL DEFAULT 'Task',
  subject TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'Planned',
  priority TEXT NOT NULL DEFAULT 'Normal',

  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  owner_name TEXT,

  description TEXT,
  outcome TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT activities_subject_not_blank
    CHECK (LENGTH(TRIM(subject)) > 0),

  CONSTRAINT activities_type_valid
    CHECK (
      activity_type IN (
        'Call',
        'Email',
        'Meeting',
        'Message',
        'Note',
        'Task'
      )
    ),

  CONSTRAINT activities_status_valid
    CHECK (
      status IN (
        'Planned',
        'Completed',
        'Cancelled'
      )
    ),

  CONSTRAINT activities_priority_valid
    CHECK (
      priority IN (
        'Low',
        'Normal',
        'High',
        'Urgent'
      )
    )
);

ALTER TABLE sales.activities OWNER TO sales_app;

CREATE INDEX IF NOT EXISTS activities_company_id_idx
  ON sales.activities(company_id);

CREATE INDEX IF NOT EXISTS activities_contact_id_idx
  ON sales.activities(contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS activities_deal_id_idx
  ON sales.activities(deal_id)
  WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS activities_status_idx
  ON sales.activities(status);

CREATE INDEX IF NOT EXISTS activities_scheduled_at_idx
  ON sales.activities(scheduled_at);

CREATE INDEX IF NOT EXISTS activities_owner_name_idx
  ON sales.activities(LOWER(owner_name))
  WHERE owner_name IS NOT NULL;

GRANT ALL PRIVILEGES
  ON sales.activities
  TO sales_app;

GRANT ALL PRIVILEGES
  ON sales.activity_code_seq
  TO sales_app;
SQL

echo
echo "==> 5/10 Создание типов и repository"

mkdir -p \
  app/activities \
  app/api/health/activities \
  lib/repositories \
  types

cat > types/activity.ts <<'EOF'
export const activityTypes = [
  "Call",
  "Email",
  "Meeting",
  "Message",
  "Note",
  "Task",
] as const;

export type ActivityType =
  (typeof activityTypes)[number];

export const activityStatuses = [
  "Planned",
  "Completed",
  "Cancelled",
] as const;

export type ActivityStatus =
  (typeof activityStatuses)[number];

export const activityPriorities = [
  "Low",
  "Normal",
  "High",
  "Urgent",
] as const;

export type ActivityPriority =
  (typeof activityPriorities)[number];

export type Activity = {
  id: string;
  activity_code: string;

  company_id: string;
  company_name: string;
  company_code: string;

  contact_id: string | null;
  contact_name: string | null;

  deal_id: string | null;
  deal_title: string | null;
  deal_code: string | null;

  activity_type: ActivityType;
  subject: string;

  status: ActivityStatus;
  priority: ActivityPriority;

  scheduled_at: string | null;
  completed_at: string | null;

  owner_name: string | null;

  description: string | null;
  outcome: string | null;

  created_at: Date;
  updated_at: Date;
};

export type CreateActivityInput = {
  companyId: string;
  contactId: string | null;
  dealId: string | null;

  activityType: ActivityType;
  subject: string;

  status: ActivityStatus;
  priority: ActivityPriority;

  scheduledAt: string | null;
  ownerName: string | null;

  description: string | null;
  outcome: string | null;
};

export type ActivityCompanyOption = {
  id: string;
  display_name: string;
  company_code: string;
};

export type ActivityContactOption = {
  id: string;
  company_id: string;
  full_name: string;
};

export type ActivityDealOption = {
  id: string;
  company_id: string;
  title: string;
  deal_code: string;
};
EOF

cat > lib/repositories/activity.repository.ts <<'EOF'
import { getDb } from "@/lib/db";

import type {
  Activity,
  ActivityCompanyOption,
  ActivityContactOption,
  ActivityDealOption,
  ActivityPriority,
  ActivityStatus,
  ActivityType,
  CreateActivityInput,
} from "@/types/activity";

const activitySelect = `
  SELECT
    activity.id,
    activity.activity_code,

    activity.company_id,
    company.display_name AS company_name,
    company.company_code,

    activity.contact_id,

    CASE
      WHEN contact.id IS NULL THEN NULL
      ELSE TRIM(
        CONCAT(
          contact.first_name,
          ' ',
          COALESCE(contact.last_name, '')
        )
      )
    END AS contact_name,

    activity.deal_id,
    deal.title AS deal_title,
    deal.deal_code,

    activity.activity_type,
    activity.subject,

    activity.status,
    activity.priority,

    activity.scheduled_at::TEXT,
    activity.completed_at::TEXT,

    activity.owner_name,

    activity.description,
    activity.outcome,

    activity.created_at,
    activity.updated_at

  FROM sales.activities AS activity

  INNER JOIN sales.companies AS company
    ON company.id = activity.company_id

  LEFT JOIN sales.contacts AS contact
    ON contact.id = activity.contact_id

  LEFT JOIN sales.deals AS deal
    ON deal.id = activity.deal_id
`;

export async function listActivities(
  limit = 200,
): Promise<Activity[]> {
  const safeLimit = Math.min(
    Math.max(limit, 1),
    500,
  );

  const result = await getDb().query<Activity>(
    `
      ${activitySelect}

      ORDER BY
        CASE activity.status
          WHEN 'Planned' THEN 1
          WHEN 'Completed' THEN 2
          WHEN 'Cancelled' THEN 3
        END,

        CASE
          WHEN activity.status = 'Planned'
            AND activity.scheduled_at < NOW()
          THEN 1
          ELSE 2
        END,

        activity.scheduled_at ASC NULLS LAST,
        activity.created_at DESC

      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows;
}

export async function listCompanyActivities(
  companyId: string,
  limit = 50,
): Promise<Activity[]> {
  const safeLimit = Math.min(
    Math.max(limit, 1),
    200,
  );

  const result = await getDb().query<Activity>(
    `
      ${activitySelect}

      WHERE activity.company_id = $1

      ORDER BY
        activity.scheduled_at DESC NULLS LAST,
        activity.created_at DESC

      LIMIT $2
    `,
    [companyId, safeLimit],
  );

  return result.rows;
}

export async function createActivity(
  input: CreateActivityInput,
): Promise<Activity> {
  const completedAt =
    input.status === "Completed"
      ? new Date().toISOString()
      : null;

  const result = await getDb().query<Activity>(
    `
      WITH inserted AS (
        INSERT INTO sales.activities (
          company_id,
          contact_id,
          deal_id,

          activity_type,
          subject,

          status,
          priority,

          scheduled_at,
          completed_at,

          owner_name,

          description,
          outcome
        )
        VALUES (
          $1, $2, $3,
          $4, $5,
          $6, $7,
          $8, $9,
          $10,
          $11, $12
        )
        RETURNING *
      )

      SELECT
        inserted.id,
        inserted.activity_code,

        inserted.company_id,
        company.display_name AS company_name,
        company.company_code,

        inserted.contact_id,

        CASE
          WHEN contact.id IS NULL THEN NULL
          ELSE TRIM(
            CONCAT(
              contact.first_name,
              ' ',
              COALESCE(contact.last_name, '')
            )
          )
        END AS contact_name,

        inserted.deal_id,
        deal.title AS deal_title,
        deal.deal_code,

        inserted.activity_type,
        inserted.subject,

        inserted.status,
        inserted.priority,

        inserted.scheduled_at::TEXT,
        inserted.completed_at::TEXT,

        inserted.owner_name,

        inserted.description,
        inserted.outcome,

        inserted.created_at,
        inserted.updated_at

      FROM inserted

      INNER JOIN sales.companies AS company
        ON company.id = inserted.company_id

      LEFT JOIN sales.contacts AS contact
        ON contact.id = inserted.contact_id

      LEFT JOIN sales.deals AS deal
        ON deal.id = inserted.deal_id
    `,
    [
      input.companyId,
      input.contactId,
      input.dealId,

      input.activityType,
      input.subject,

      input.status,
      input.priority,

      input.scheduledAt,
      completedAt,

      input.ownerName,

      input.description,
      input.outcome,
    ],
  );

  return result.rows[0];
}

export async function listActivityCompanyOptions():
Promise<ActivityCompanyOption[]> {
  const result =
    await getDb().query<ActivityCompanyOption>(
      `
        SELECT
          id,
          display_name,
          company_code

        FROM sales.companies

        ORDER BY LOWER(display_name)
      `,
    );

  return result.rows;
}

export async function listActivityContactOptions():
Promise<ActivityContactOption[]> {
  const result =
    await getDb().query<ActivityContactOption>(
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

        ORDER BY
          LOWER(first_name),
          LOWER(COALESCE(last_name, ''))
      `,
    );

  return result.rows;
}

export async function listActivityDealOptions():
Promise<ActivityDealOption[]> {
  const result =
    await getDb().query<ActivityDealOption>(
      `
        SELECT
          id,
          company_id,
          title,
          deal_code

        FROM sales.deals

        WHERE stage NOT IN ('Won', 'Lost')

        ORDER BY created_at DESC
      `,
    );

  return result.rows;
}

export async function getActivityMetrics(): Promise<{
  total: number;
  overdue: number;
  today: number;
  upcoming: number;
  completed: number;
}> {
  const result = await getDb().query<{
    total: string;
    overdue: string;
    today: string;
    upcoming: string;
    completed: string;
  }>(
    `
      SELECT
        COUNT(*)::TEXT AS total,

        COUNT(*) FILTER (
          WHERE status = 'Planned'
            AND scheduled_at < NOW()
        )::TEXT AS overdue,

        COUNT(*) FILTER (
          WHERE status = 'Planned'
            AND scheduled_at >= CURRENT_DATE
            AND scheduled_at < CURRENT_DATE + INTERVAL '1 day'
        )::TEXT AS today,

        COUNT(*) FILTER (
          WHERE status = 'Planned'
            AND scheduled_at >= CURRENT_DATE + INTERVAL '1 day'
        )::TEXT AS upcoming,

        COUNT(*) FILTER (
          WHERE status = 'Completed'
        )::TEXT AS completed

      FROM sales.activities
    `,
  );

  return {
    total: Number(result.rows[0]?.total ?? 0),
    overdue: Number(result.rows[0]?.overdue ?? 0),
    today: Number(result.rows[0]?.today ?? 0),
    upcoming: Number(result.rows[0]?.upcoming ?? 0),
    completed: Number(result.rows[0]?.completed ?? 0),
  };
}

export function isActivityType(
  value: string,
): value is ActivityType {
  return [
    "Call",
    "Email",
    "Meeting",
    "Message",
    "Note",
    "Task",
  ].includes(value);
}

export function isActivityStatus(
  value: string,
): value is ActivityStatus {
  return [
    "Planned",
    "Completed",
    "Cancelled",
  ].includes(value);
}

export function isActivityPriority(
  value: string,
): value is ActivityPriority {
  return [
    "Low",
    "Normal",
    "High",
    "Urgent",
  ].includes(value);
}
EOF

echo
echo "==> 6/10 Создание Server Action"

cat > app/activities/actions.ts <<'EOF'
"use server";

import { revalidatePath } from "next/cache";

import {
  createActivity,
  isActivityPriority,
  isActivityStatus,
  isActivityType,
} from "@/lib/repositories/activity.repository";

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

export async function createActivityAction(
  formData: FormData,
): Promise<void> {
  const companyId = requiredText(
    formData,
    "company_id",
    "Компания",
  );

  const subject = requiredText(
    formData,
    "subject",
    "Тема активности",
  );

  const typeValue =
    String(
      formData.get("activity_type") ?? "Task",
    ).trim();

  const statusValue =
    String(
      formData.get("status") ?? "Planned",
    ).trim();

  const priorityValue =
    String(
      formData.get("priority") ?? "Normal",
    ).trim();

  await createActivity({
    companyId,

    contactId:
      optionalText(
        formData,
        "contact_id",
      ),

    dealId:
      optionalText(
        formData,
        "deal_id",
      ),

    activityType:
      isActivityType(typeValue)
        ? typeValue
        : "Task",

    subject,

    status:
      isActivityStatus(statusValue)
        ? statusValue
        : "Planned",

    priority:
      isActivityPriority(priorityValue)
        ? priorityValue
        : "Normal",

    scheduledAt:
      optionalText(
        formData,
        "scheduled_at",
      ),

    ownerName:
      optionalText(
        formData,
        "owner_name",
      ),

    description:
      optionalText(
        formData,
        "description",
      ),

    outcome:
      optionalText(
        formData,
        "outcome",
      ),
  });

  revalidatePath("/activities");
  revalidatePath(
    `/companies/${companyId}`,
  );
}
EOF

echo
echo "==> 7/10 Создание страницы Activities"

cat > app/activities/page.tsx <<'EOF'
import Link from "next/link";

import { SalesSidebar } from "@/components/layout/SalesSidebar";
import { DatabaseStatus } from "@/components/ui/DatabaseStatus";

import { createActivityAction } from "./actions";

import {
  getActivityMetrics,
  listActivities,
  listActivityCompanyOptions,
  listActivityContactOptions,
  listActivityDealOptions,
} from "@/lib/repositories/activity.repository";

import type {
  Activity,
} from "@/types/activity";

export const dynamic = "force-dynamic";

const typeNames: Record<string, string> = {
  Call: "Звонок",
  Email: "Письмо",
  Meeting: "Встреча",
  Message: "Сообщение",
  Note: "Заметка",
  Task: "Задача",
};

const typeIcons: Record<string, string> = {
  Call: "☎",
  Email: "✉",
  Meeting: "◉",
  Message: "◌",
  Note: "≡",
  Task: "✓",
};

const statusNames: Record<string, string> = {
  Planned: "Запланировано",
  Completed: "Выполнено",
  Cancelled: "Отменено",
};

const priorityNames: Record<string, string> = {
  Low: "Низкий",
  Normal: "Обычный",
  High: "Высокий",
  Urgent: "Срочный",
};

function getActivityGroup(
  activity: Activity,
): "overdue" | "today" | "upcoming" | "completed" {
  if (activity.status === "Completed") {
    return "completed";
  }

  if (!activity.scheduled_at) {
    return "upcoming";
  }

  const scheduled =
    new Date(activity.scheduled_at);

  const now = new Date();

  const todayStart =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

  const tomorrowStart =
    new Date(todayStart);

  tomorrowStart.setDate(
    tomorrowStart.getDate() + 1,
  );

  if (scheduled < now) {
    return "overdue";
  }

  if (
    scheduled >= todayStart &&
    scheduled < tomorrowStart
  ) {
    return "today";
  }

  return "upcoming";
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

export default async function ActivitiesPage() {
  const [
    activities,
    companies,
    contacts,
    deals,
    metrics,
  ] = await Promise.all([
    listActivities(200),
    listActivityCompanyOptions(),
    listActivityContactOptions(),
    listActivityDealOptions(),
    getActivityMetrics(),
  ]);

  const groups = {
    overdue: activities.filter(
      (activity) =>
        getActivityGroup(activity) ===
        "overdue",
    ),

    today: activities.filter(
      (activity) =>
        getActivityGroup(activity) ===
        "today",
    ),

    upcoming: activities.filter(
      (activity) =>
        getActivityGroup(activity) ===
        "upcoming",
    ),

    completed: activities.filter(
      (activity) =>
        getActivityGroup(activity) ===
        "completed",
    ),
  };

  const sections = [
    {
      key: "overdue",
      title: "Просрочено",
      description:
        "Требует немедленного внимания",
      activities: groups.overdue,
    },
    {
      key: "today",
      title: "Сегодня",
      description:
        "Действия на текущий день",
      activities: groups.today,
    },
    {
      key: "upcoming",
      title: "Предстоящие",
      description:
        "Запланированные следующие шаги",
      activities: groups.upcoming,
    },
    {
      key: "completed",
      title: "Выполненные",
      description:
        "История завершённых действий",
      activities: groups.completed,
    },
  ];

  return (
    <div className="appShell">
      <SalesSidebar
        activeSection="activities"
      />

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Продажи</span>
            <strong>/</strong>
            <span>Активности</span>
          </div>

          <DatabaseStatus />
        </header>

        <section className="pageHeader">
          <div>
            <div className="eyebrow">
              Ежедневная работа
            </div>

            <h1>Активности</h1>

            <p>
              Звонки, встречи, письма,
              сообщения и следующие действия.
            </p>
          </div>
        </section>

        <section className="metricsGrid activityMetricsGrid">
          <article className="metricCard">
            <div className="metricLabel">
              Всего
            </div>

            <strong>{metrics.total}</strong>
            <p>активностей в CRM</p>
          </article>

          <article className="metricCard metricOverdue">
            <div className="metricLabel">
              Просрочено
            </div>

            <strong>{metrics.overdue}</strong>
            <p>требуют внимания</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Сегодня
            </div>

            <strong>{metrics.today}</strong>
            <p>запланировано на день</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Предстоящие
            </div>

            <strong>{metrics.upcoming}</strong>
            <p>будущие действия</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Выполнено
            </div>

            <strong>{metrics.completed}</strong>
            <p>завершённых действий</p>
          </article>
        </section>

        <section className="workspaceGrid">
          <section className="activityWorkspace">
            {sections.map((section) => (
              <section
                className={
                  `activitySection activitySection-${section.key}`
                }
                key={section.key}
              >
                <div className="activitySectionHeader">
                  <div>
                    <h2>{section.title}</h2>
                    <p>{section.description}</p>
                  </div>

                  <strong>
                    {section.activities.length}
                  </strong>
                </div>

                {section.activities.length === 0 ? (
                  <div className="activityEmpty">
                    Нет активностей
                  </div>
                ) : (
                  <div className="activityList">
                    {section.activities.map(
                      (activity) => (
                        <article
                          className="activityCard"
                          key={activity.id}
                        >
                          <div
                            className={
                              `activityTypeIcon activityType-${activity.activity_type.toLowerCase()}`
                            }
                          >
                            {typeIcons[
                              activity.activity_type
                            ]}
                          </div>

                          <div className="activityMain">
                            <div className="activityTitleRow">
                              <div>
                                <strong>
                                  {activity.subject}
                                </strong>

                                <span>
                                  {activity.activity_code}
                                </span>
                              </div>

                              <div className="activityBadges">
                                <span
                                  className={
                                    `activityPriority priority-${activity.priority.toLowerCase()}`
                                  }
                                >
                                  {priorityNames[
                                    activity.priority
                                  ]}
                                </span>

                                <span
                                  className={
                                    `activityStatus activity-status-${activity.status.toLowerCase()}`
                                  }
                                >
                                  {statusNames[
                                    activity.status
                                  ]}
                                </span>
                              </div>
                            </div>

                            <div className="activityRelations">
                              <Link
                                href={
                                  `/companies/${activity.company_id}`
                                }
                              >
                                {activity.company_name}
                              </Link>

                              {activity.contact_name && (
                                <span>
                                  Контакт:{" "}
                                  {activity.contact_name}
                                </span>
                              )}

                              {activity.deal_title && (
                                <span>
                                  Сделка:{" "}
                                  {activity.deal_title}
                                </span>
                              )}
                            </div>

                            {activity.description && (
                              <p className="activityDescription">
                                {activity.description}
                              </p>
                            )}

                            <div className="activityFooter">
                              <span>
                                {typeNames[
                                  activity.activity_type
                                ]}
                              </span>

                              <span>
                                {formatDate(
                                  activity.scheduled_at,
                                )}
                              </span>

                              <span>
                                {activity.owner_name ??
                                  "Ответственный не назначен"}
                              </span>
                            </div>
                          </div>
                        </article>
                      ),
                    )}
                  </div>
                )}
              </section>
            ))}
          </section>

          <aside className="createPanel">
            <div className="formHeader">
              <div className="formIcon">＋</div>

              <div>
                <h2>Новая активность</h2>
                <p>
                  Следующее действие продавца
                </p>
              </div>
            </div>

            {companies.length === 0 ? (
              <div className="contactNoCompanies">
                <strong>
                  Сначала добавь компанию
                </strong>

                <p>
                  Активность должна быть
                  связана с компанией.
                </p>

                <Link href="/companies">
                  Перейти к компаниям
                </Link>
              </div>
            ) : (
              <form
                action={createActivityAction}
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

                <div className="formColumns">
                  <label>
                    Тип
                    <select
                      name="activity_type"
                      defaultValue="Task"
                    >
                      <option value="Call">
                        Звонок
                      </option>
                      <option value="Email">
                        Письмо
                      </option>
                      <option value="Meeting">
                        Встреча
                      </option>
                      <option value="Message">
                        Сообщение
                      </option>
                      <option value="Note">
                        Заметка
                      </option>
                      <option value="Task">
                        Задача
                      </option>
                    </select>
                  </label>

                  <label>
                    Приоритет
                    <select
                      name="priority"
                      defaultValue="Normal"
                    >
                      <option value="Low">
                        Низкий
                      </option>
                      <option value="Normal">
                        Обычный
                      </option>
                      <option value="High">
                        Высокий
                      </option>
                      <option value="Urgent">
                        Срочный
                      </option>
                    </select>
                  </label>
                </div>

                <label>
                  Тема *
                  <input
                    name="subject"
                    required
                    maxLength={255}
                    placeholder="Позвонить и обсудить предложение"
                  />
                </label>

                <label>
                  Контакт
                  <select
                    name="contact_id"
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

                <label>
                  Сделка
                  <select
                    name="deal_id"
                    defaultValue=""
                  >
                    <option value="">
                      Не выбрана
                    </option>

                    {deals.map((deal) => (
                      <option
                        key={deal.id}
                        value={deal.id}
                      >
                        {deal.title}
                        {" · "}
                        {deal.deal_code}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Дата и время
                  <input
                    name="scheduled_at"
                    type="datetime-local"
                  />
                </label>

                <div className="formColumns">
                  <label>
                    Статус
                    <select
                      name="status"
                      defaultValue="Planned"
                    >
                      <option value="Planned">
                        Запланировано
                      </option>
                      <option value="Completed">
                        Выполнено
                      </option>
                      <option value="Cancelled">
                        Отменено
                      </option>
                    </select>
                  </label>

                  <label>
                    Ответственный
                    <input
                      name="owner_name"
                      maxLength={255}
                      placeholder="Имя"
                    />
                  </label>
                </div>

                <label>
                  Описание
                  <textarea
                    name="description"
                    rows={4}
                    maxLength={3000}
                    placeholder="Что нужно сделать и какой контекст учитывать"
                  />
                </label>

                <label>
                  Результат
                  <textarea
                    name="outcome"
                    rows={3}
                    maxLength={3000}
                    placeholder="Заполняется для выполненного действия"
                  />
                </label>

                <button
                  className="submitButton"
                  type="submit"
                >
                  Создать активность
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
echo "==> 8/10 Обновление навигации и карточки компании"

python3 <<'PY'
from pathlib import Path

path = Path("lib/navigation.ts")
text = path.read_text(encoding="utf-8")

text = text.replace(
    '''{
    icon: "✓",
    label: "Задачи",
    href: "#",
    section: "activities",
  },''',
    '''{
    icon: "✓",
    label: "Активности",
    href: "/activities",
    section: "activities",
  },''',
)

path.write_text(text, encoding="utf-8")
PY

python3 <<'PY'
from pathlib import Path

path = Path("app/companies/[id]/page.tsx")
text = path.read_text(encoding="utf-8")

activity_import = '''import {
  listCompanyActivities,
} from "@/lib/repositories/activity.repository";
'''

if "@/lib/repositories/activity.repository" not in text:
    marker = '''import {
  listCompanyDeals,
} from "@/lib/repositories/deal.repository";
'''

    if marker not in text:
        raise SystemExit(
            "Не найден импорт deal.repository."
        )

    text = text.replace(
        marker,
        marker + "\n" + activity_import,
    )

old = '''const [company, contacts, deals] = await Promise.all([
    getCompanyById(id),
    listCompanyContacts(id),
    listCompanyDeals(id),
  ]);'''

new = '''const [company, contacts, deals, activities] =
    await Promise.all([
      getCompanyById(id),
      listCompanyContacts(id),
      listCompanyDeals(id),
      listCompanyActivities(id, 50),
    ]);'''

if old not in text:
    raise SystemExit(
        "Не найден Promise.all карточки компании."
    )

text = text.replace(old, new)

text = text.replace(
    '''<div>
                <strong>0</strong>
                <span>активностей</span>
              </div>''',
    '''<div>
                <strong>{activities.length}</strong>
                <span>активностей</span>
              </div>''',
)

activity_section = '''
        <section
          id="activities"
          className="companyContactsPanel"
        >
          <div className="companySectionHeader">
            <div>
              <h2>Активности компании</h2>
              <p>
                Звонки, встречи, письма и задачи
              </p>
            </div>

            <Link href="/activities">
              Все активности →
            </Link>
          </div>

          {activities.length === 0 ? (
            <div className="companyEmptyContacts">
              <div className="emptyIcon">✓</div>

              <h3>Активностей пока нет</h3>

              <p>
                Добавь следующее действие
                для этой компании.
              </p>

              <Link href="/activities">
                Добавить активность
              </Link>
            </div>
          ) : (
            <div className="companyActivityList">
              {activities.map((activity) => (
                <article
                  className="companyActivityCard"
                  key={activity.id}
                >
                  <div
                    className={
                      `companyActivityIcon activityType-${activity.activity_type.toLowerCase()}`
                    }
                  >
                    {activity.activity_type === "Call"
                      ? "☎"
                      : activity.activity_type === "Email"
                        ? "✉"
                        : activity.activity_type === "Meeting"
                          ? "◉"
                          : activity.activity_type === "Message"
                            ? "◌"
                            : activity.activity_type === "Note"
                              ? "≡"
                              : "✓"}
                  </div>

                  <div className="companyActivityBody">
                    <div>
                      <strong>
                        {activity.subject}
                      </strong>

                      <span>
                        {activity.activity_code}
                      </span>
                    </div>

                    <p>
                      {activity.description ??
                        "Описание не указано"}
                    </p>

                    <div className="companyActivityMeta">
                      <span>
                        {activity.status}
                      </span>

                      <span>
                        {activity.scheduled_at
                          ? new Intl.DateTimeFormat(
                              "ru-RU",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            ).format(
                              new Date(
                                activity.scheduled_at,
                              ),
                            )
                          : "Дата не указана"}
                      </span>

                      {activity.deal_title && (
                        <span>
                          Сделка:{" "}
                          {activity.deal_title}
                        </span>
                      )}
                    </div>
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
        "Не найдена секция контактов."
    )

if 'className="companyActivityList"' not in text:
    text = text.replace(
        contacts_marker,
        activity_section + contacts_marker,
    )

path.write_text(text, encoding="utf-8")
PY

echo
echo "==> 9/10 Health-check и стили"

cat > app/api/health/activities/route.ts <<'EOF'
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getDb().query<{
      activities: string;
      planned: string;
      completed: string;
      overdue: string;
    }>(
      `
        SELECT
          COUNT(*)::TEXT AS activities,

          COUNT(*) FILTER (
            WHERE status = 'Planned'
          )::TEXT AS planned,

          COUNT(*) FILTER (
            WHERE status = 'Completed'
          )::TEXT AS completed,

          COUNT(*) FILTER (
            WHERE status = 'Planned'
              AND scheduled_at < NOW()
          )::TEXT AS overdue

        FROM sales.activities
      `,
    );

    return NextResponse.json({
      status: "ok",
      module: "activities",
      database: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Activities health-check failed:",
      error,
    );

    return NextResponse.json(
      {
        status: "error",
        module: "activities",
      },
      {
        status: 500,
      },
    );
  }
}
EOF

cat >> app/globals.css <<'EOF'

.activityMetricsGrid {
  grid-template-columns:
    repeat(5, minmax(0, 1fr));
}

.metricOverdue strong {
  color: #fb8ca0;
}

.activityWorkspace {
  display: grid;
  gap: 16px;
}

.activitySection {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: var(--surface);
}

.activitySection-overdue {
  border-color: rgba(251, 113, 133, 0.25);
}

.activitySectionHeader {
  min-height: 66px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 0 18px;
  border-bottom: 1px solid var(--border);
}

.activitySectionHeader h2 {
  margin: 0;
  font-size: 15px;
}

.activitySectionHeader p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 10px;
}

.activitySectionHeader > strong {
  min-width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--surface-soft);
  font-size: 11px;
}

.activityEmpty {
  padding: 24px 18px;
  color: var(--muted);
  font-size: 11px;
  text-align: center;
}

.activityList {
  display: grid;
}

.activityCard {
  display: flex;
  gap: 13px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-soft);
}

.activityCard:last-child {
  border-bottom: 0;
}

.activityCard:hover {
  background: var(--surface-hover);
}

.activityTypeIcon,
.companyActivityIcon {
  width: 39px;
  height: 39px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 11px;
  font-size: 15px;
  font-weight: 900;
}

.activityType-call {
  background: rgba(74, 222, 128, 0.1);
  color: #77e99d;
}

.activityType-email {
  background: rgba(96, 165, 250, 0.1);
  color: #82b8f9;
}

.activityType-meeting {
  background: rgba(168, 85, 247, 0.12);
  color: #c084fc;
}

.activityType-message {
  background: rgba(34, 211, 238, 0.1);
  color: #67e8f9;
}

.activityType-note {
  background: rgba(251, 191, 36, 0.1);
  color: #f8ca4e;
}

.activityType-task {
  background: rgba(112, 108, 246, 0.14);
  color: #aaa7ff;
}

.activityMain {
  min-width: 0;
  flex: 1;
}

.activityTitleRow {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}

.activityTitleRow strong,
.activityTitleRow span {
  display: block;
}

.activityTitleRow strong {
  font-size: 12px;
}

.activityTitleRow div:first-child > span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 9px;
}

.activityBadges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.activityPriority,
.activityStatus {
  display: inline-flex !important;
  min-height: 23px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 8px;
  font-weight: 900;
}

.priority-low,
.priority-normal {
  background: rgba(148, 163, 184, 0.1);
  color: #a7b2c1;
}

.priority-high {
  background: rgba(249, 115, 22, 0.1);
  color: #fb923c;
}

.priority-urgent {
  background: rgba(251, 113, 133, 0.12);
  color: #fb8ca0;
}

.activity-status-planned {
  background: rgba(96, 165, 250, 0.1);
  color: #82b8f9;
}

.activity-status-completed {
  background: rgba(74, 222, 128, 0.1);
  color: #77e99d;
}

.activity-status-cancelled {
  background: rgba(148, 163, 184, 0.1);
  color: #a7b2c1;
}

.activityRelations {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 9px;
}

.activityRelations a,
.activityRelations span {
  color: var(--muted-strong);
  font-size: 9px;
  text-decoration: none;
}

.activityRelations a {
  color: #9692ff;
  font-weight: 800;
}

.activityDescription {
  margin: 10px 0 0;
  color: #aeb9ca;
  font-size: 10px;
  line-height: 1.55;
}

.activityFooter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 11px;
  color: var(--muted);
  font-size: 9px;
}

.companyActivityList {
  display: grid;
}

.companyActivityCard {
  display: flex;
  gap: 12px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--border-soft);
}

.companyActivityCard:last-child {
  border-bottom: 0;
}

.companyActivityBody {
  min-width: 0;
  flex: 1;
}

.companyActivityBody > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.companyActivityBody strong {
  font-size: 11px;
}

.companyActivityBody > div:first-child > span {
  color: var(--muted);
  font-size: 8px;
}

.companyActivityBody p {
  margin: 6px 0 0;
  color: var(--muted-strong);
  font-size: 9px;
}

.companyActivityMeta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 14px;
  margin-top: 9px;
  color: var(--muted);
  font-size: 8px;
}

@media (max-width: 1250px) {
  .activityMetricsGrid {
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .activityMetricsGrid {
    grid-template-columns: 1fr;
  }

  .activityTitleRow {
    flex-direction: column;
  }
}
EOF

echo
echo "==> 10/10 Сборка и тестирование"

if ! docker compose build \
  --no-cache \
  --progress=plain \
  2>&1 | tee /tmp/activities-build.log
then
  echo
  echo "❌ Ошибка сборки Activities."
  echo

  grep -n -B 15 -A 45 \
    -E "Failed to compile|Type error|Error:|Build error" \
    /tmp/activities-build.log \
    | tail -n 200 || true

  exit 1
fi

docker compose up -d --force-recreate

echo "Ожидаю запуск приложения..."

READY=0

COMPANY_ID="$(
  docker exec "$POSTGRES_CONTAINER" \
    psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -tAc \
    "SELECT id FROM sales.companies ORDER BY created_at LIMIT 1;" \
    | tr -d '[:space:]'
)"

for ATTEMPT in $(seq 1 45); do
  ACTIVITIES_CODE="$(
    curl \
      --silent \
      --output /tmp/activities-page.html \
      --write-out '%{http_code}' \
      http://127.0.0.1:3000/activities \
      || true
  )"

  HEALTH_CODE="$(
    curl \
      --silent \
      --output /tmp/activities-health.json \
      --write-out '%{http_code}' \
      http://127.0.0.1:3000/api/health/activities \
      || true
  )"

  COMPANIES_CODE="$(
    curl \
      --silent \
      --output /dev/null \
      --write-out '%{http_code}' \
      http://127.0.0.1:3000/companies \
      || true
  )"

  if [[ -n "$COMPANY_ID" ]]; then
    CARD_CODE="$(
      curl \
        --silent \
        --output /dev/null \
        --write-out '%{http_code}' \
        "http://127.0.0.1:3000/companies/$COMPANY_ID" \
        || true
    )"
  else
    CARD_CODE="200"
  fi

  if [[ "$ACTIVITIES_CODE" == "200" &&
        "$HEALTH_CODE" == "200" &&
        "$COMPANIES_CODE" == "200" &&
        "$CARD_CODE" == "200" ]]
  then
    READY=1
    break
  fi

  sleep 2
done

if [[ "$READY" -ne 1 ]]; then
  echo
  echo "❌ Activities не прошёл проверку."
  echo "Activities:   HTTP $ACTIVITIES_CODE"
  echo "Health:       HTTP $HEALTH_CODE"
  echo "Companies:    HTTP $COMPANIES_CODE"
  echo "Company card: HTTP $CARD_CODE"
  echo

  cat /tmp/activities-health.json 2>/dev/null || true

  echo
  docker logs "$APP_CONTAINER" --tail 220

  exit 1
fi

echo
echo "✅ Activities health-check:"
cat /tmp/activities-health.json
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
      COUNT(*) AS activities
    FROM sales.activities;
  "

echo
echo "=================================================="
echo "✅ Модуль Activities установлен"
echo
echo "Открыть:"
echo "  https://sales.cardigansarena.ru/activities"
echo
echo "Резервная копия:"
echo "  $BACKUP_DIR"
echo "=================================================="
echo

read -r -p "Сохранить Activities в GitHub? [y/N]: " PUSH_CONFIRM

case "$PUSH_CONFIRM" in
  y|Y|yes|YES)
    git add \
      scripts/install-activities.sh \
      app/activities \
      app/api/health/activities \
      'app/companies/[id]/page.tsx' \
      lib/repositories/activity.repository.ts \
      types/activity.ts \
      lib/navigation.ts \
      app/globals.css

    if git diff --cached --quiet; then
      echo "Нет новых изменений для коммита."
    else
      git commit -m "Add Activities workflow module"
      git push origin main

      echo "✅ Activities сохранён в GitHub."
    fi
    ;;

  *)
    echo "GitHub не изменён."
    echo "Модуль уже работает на сервере."
    ;;
esac
