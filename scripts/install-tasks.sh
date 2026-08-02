#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/opt/cardigans-sales"
INFRA_ENV="/opt/cardigans/.env"
POSTGRES_CONTAINER="cardigans-postgres"
APP_CONTAINER="cardigans-sales"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$PROJECT_DIR/.backups/install-tasks-$STAMP"

trap '
  code=$?
  echo
  echo "❌ Ошибка на строке $LINENO, код $code."
  echo "Терминал останется открытым."
  exit $code
' ERR

cd "$PROJECT_DIR"

echo "=================================================="
echo " Установка модуля Tasks 2.0"
echo "=================================================="
echo
echo "Будет создано:"
echo "  • таблица sales.tasks;"
echo "  • маршрут /tasks;"
echo "  • статусы и приоритеты;"
echo "  • связи с компанией, контактом, сделкой и активностью;"
echo "  • просроченные, сегодняшние и будущие задачи;"
echo "  • блок задач в карточке компании;"
echo "  • health-check и автоматическая проверка."
echo

read -r -p "Продолжить? [y/N]: " CONFIRM

case "$CONFIRM" in
  y|Y|yes|YES) ;;
  *) echo "Отменено."; exit 0 ;;
esac

echo
echo "==> 1/10 Проверка проекта"

if [[ ! -d .git ]]; then
  echo "❌ Не найден .git"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Есть несохранённые изменения:"
  git status --short
  echo
  echo "Сначала сохрани или отмени их."
  exit 1
fi

if [[ ! -f "$INFRA_ENV" ]]; then
  echo "❌ Не найден $INFRA_ENV"
  exit 1
fi

for FILE in \
  lib/db.ts \
  lib/navigation.ts \
  components/layout/SalesSidebar.tsx \
  'app/companies/[id]/page.tsx'
do
  if [[ ! -f "$FILE" ]]; then
    echo "❌ Не найден $FILE"
    exit 1
  fi
done

echo
echo "==> 2/10 Резервное копирование"

mkdir -p "$BACKUP_DIR"

for PATH_NAME in \
  app/tasks \
  app/api/health/tasks \
  'app/companies/[id]/page.tsx' \
  app/globals.css \
  lib/navigation.ts \
  lib/repositories/task.repository.ts \
  types/task.ts
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

echo
echo "==> 4/10 Создание таблицы sales.tasks"

docker exec -i \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  psql \
  -v ON_ERROR_STOP=1 \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" <<'SQL'
CREATE SEQUENCE IF NOT EXISTS sales.task_code_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

ALTER SEQUENCE sales.task_code_seq OWNER TO sales_app;

CREATE TABLE IF NOT EXISTS sales.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_code TEXT UNIQUE NOT NULL DEFAULT (
    'TASK-' ||
    LPAD(nextval('sales.task_code_seq')::TEXT, 6, '0')
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

  activity_id UUID
    REFERENCES sales.activities(id)
    ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,

  status TEXT NOT NULL DEFAULT 'Todo',
  priority TEXT NOT NULL DEFAULT 'Normal',

  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  owner_name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tasks_title_not_blank
    CHECK (LENGTH(TRIM(title)) > 0),

  CONSTRAINT tasks_status_valid
    CHECK (
      status IN (
        'Todo',
        'InProgress',
        'Done',
        'Cancelled'
      )
    ),

  CONSTRAINT tasks_priority_valid
    CHECK (
      priority IN (
        'Low',
        'Normal',
        'High',
        'Urgent'
      )
    )
);

ALTER TABLE sales.tasks OWNER TO sales_app;

CREATE INDEX IF NOT EXISTS tasks_company_id_idx
  ON sales.tasks(company_id);

CREATE INDEX IF NOT EXISTS tasks_status_idx
  ON sales.tasks(status);

CREATE INDEX IF NOT EXISTS tasks_due_at_idx
  ON sales.tasks(due_at);

CREATE INDEX IF NOT EXISTS tasks_deal_id_idx
  ON sales.tasks(deal_id)
  WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_owner_name_idx
  ON sales.tasks(LOWER(owner_name))
  WHERE owner_name IS NOT NULL;

GRANT ALL PRIVILEGES
  ON sales.tasks
  TO sales_app;

GRANT ALL PRIVILEGES
  ON sales.task_code_seq
  TO sales_app;
SQL

echo
echo "==> 5/10 Создание типов и repository"

mkdir -p \
  app/tasks \
  app/api/health/tasks \
  lib/repositories \
  types

cat > types/task.ts <<'EOF'
export const taskStatuses = [
  "Todo",
  "InProgress",
  "Done",
  "Cancelled",
] as const;

export type TaskStatus =
  (typeof taskStatuses)[number];

export const taskPriorities = [
  "Low",
  "Normal",
  "High",
  "Urgent",
] as const;

export type TaskPriority =
  (typeof taskPriorities)[number];

export type SalesTask = {
  id: string;
  task_code: string;

  company_id: string;
  company_name: string;
  company_code: string;

  contact_id: string | null;
  contact_name: string | null;

  deal_id: string | null;
  deal_title: string | null;

  activity_id: string | null;
  activity_subject: string | null;

  title: string;
  description: string | null;

  status: TaskStatus;
  priority: TaskPriority;

  due_at: string | null;
  completed_at: string | null;

  owner_name: string | null;

  created_at: Date;
  updated_at: Date;
};

export type CreateTaskInput = {
  companyId: string;
  contactId: string | null;
  dealId: string | null;
  activityId: string | null;

  title: string;
  description: string | null;

  status: TaskStatus;
  priority: TaskPriority;

  dueAt: string | null;
  ownerName: string | null;
};

export type TaskOption = {
  id: string;
  company_id?: string;
  label: string;
};
EOF

cat > lib/repositories/task.repository.ts <<'EOF'
import { getDb } from "@/lib/db";

import type {
  CreateTaskInput,
  SalesTask,
  TaskPriority,
  TaskStatus,
} from "@/types/task";

const taskSelect = `
  SELECT
    task.id,
    task.task_code,

    task.company_id,
    company.display_name AS company_name,
    company.company_code,

    task.contact_id,

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

    task.deal_id,
    deal.title AS deal_title,

    task.activity_id,
    activity.subject AS activity_subject,

    task.title,
    task.description,

    task.status,
    task.priority,

    task.due_at::TEXT,
    task.completed_at::TEXT,

    task.owner_name,

    task.created_at,
    task.updated_at

  FROM sales.tasks AS task

  INNER JOIN sales.companies AS company
    ON company.id = task.company_id

  LEFT JOIN sales.contacts AS contact
    ON contact.id = task.contact_id

  LEFT JOIN sales.deals AS deal
    ON deal.id = task.deal_id

  LEFT JOIN sales.activities AS activity
    ON activity.id = task.activity_id
`;

export async function listTasks(
  limit = 200,
): Promise<SalesTask[]> {
  const safeLimit = Math.min(
    Math.max(limit, 1),
    500,
  );

  const result = await getDb().query<SalesTask>(
    `
      ${taskSelect}

      ORDER BY
        CASE task.status
          WHEN 'Todo' THEN 1
          WHEN 'InProgress' THEN 2
          WHEN 'Done' THEN 3
          WHEN 'Cancelled' THEN 4
        END,

        CASE
          WHEN task.status IN ('Todo', 'InProgress')
            AND task.due_at < NOW()
          THEN 1
          ELSE 2
        END,

        task.due_at ASC NULLS LAST,
        task.created_at DESC

      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows;
}

export async function listCompanyTasks(
  companyId: string,
  limit = 50,
): Promise<SalesTask[]> {
  const safeLimit = Math.min(
    Math.max(limit, 1),
    200,
  );

  const result = await getDb().query<SalesTask>(
    `
      ${taskSelect}

      WHERE task.company_id = $1

      ORDER BY
        CASE task.status
          WHEN 'Todo' THEN 1
          WHEN 'InProgress' THEN 2
          WHEN 'Done' THEN 3
          WHEN 'Cancelled' THEN 4
        END,
        task.due_at ASC NULLS LAST,
        task.created_at DESC

      LIMIT $2
    `,
    [companyId, safeLimit],
  );

  return result.rows;
}

export async function createTask(
  input: CreateTaskInput,
): Promise<SalesTask> {
  const completedAt =
    input.status === "Done"
      ? new Date().toISOString()
      : null;

  const result = await getDb().query<SalesTask>(
    `
      WITH inserted AS (
        INSERT INTO sales.tasks (
          company_id,
          contact_id,
          deal_id,
          activity_id,

          title,
          description,

          status,
          priority,

          due_at,
          completed_at,

          owner_name
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6,
          $7, $8,
          $9, $10,
          $11
        )
        RETURNING *
      )

      SELECT
        inserted.id,
        inserted.task_code,

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

        inserted.activity_id,
        activity.subject AS activity_subject,

        inserted.title,
        inserted.description,

        inserted.status,
        inserted.priority,

        inserted.due_at::TEXT,
        inserted.completed_at::TEXT,

        inserted.owner_name,

        inserted.created_at,
        inserted.updated_at

      FROM inserted

      INNER JOIN sales.companies AS company
        ON company.id = inserted.company_id

      LEFT JOIN sales.contacts AS contact
        ON contact.id = inserted.contact_id

      LEFT JOIN sales.deals AS deal
        ON deal.id = inserted.deal_id

      LEFT JOIN sales.activities AS activity
        ON activity.id = inserted.activity_id
    `,
    [
      input.companyId,
      input.contactId,
      input.dealId,
      input.activityId,

      input.title,
      input.description,

      input.status,
      input.priority,

      input.dueAt,
      completedAt,

      input.ownerName,
    ],
  );

  return result.rows[0];
}

export async function getTaskMetrics(): Promise<{
  total: number;
  overdue: number;
  today: number;
  inProgress: number;
  done: number;
}> {
  const result = await getDb().query<{
    total: string;
    overdue: string;
    today: string;
    in_progress: string;
    done: string;
  }>(`
    SELECT
      COUNT(*)::TEXT AS total,

      COUNT(*) FILTER (
        WHERE status IN ('Todo', 'InProgress')
          AND due_at < NOW()
      )::TEXT AS overdue,

      COUNT(*) FILTER (
        WHERE status IN ('Todo', 'InProgress')
          AND due_at >= CURRENT_DATE
          AND due_at < CURRENT_DATE + INTERVAL '1 day'
      )::TEXT AS today,

      COUNT(*) FILTER (
        WHERE status = 'InProgress'
      )::TEXT AS in_progress,

      COUNT(*) FILTER (
        WHERE status = 'Done'
      )::TEXT AS done

    FROM sales.tasks
  `);

  const row = result.rows[0];

  return {
    total: Number(row?.total ?? 0),
    overdue: Number(row?.overdue ?? 0),
    today: Number(row?.today ?? 0),
    inProgress: Number(row?.in_progress ?? 0),
    done: Number(row?.done ?? 0),
  };
}

export async function listTaskOptions() {
  const [
    companies,
    contacts,
    deals,
    activities,
  ] = await Promise.all([
    getDb().query<{
      id: string;
      display_name: string;
      company_code: string;
    }>(`
      SELECT id, display_name, company_code
      FROM sales.companies
      ORDER BY LOWER(display_name)
    `),

    getDb().query<{
      id: string;
      company_id: string;
      label: string;
    }>(`
      SELECT
        id,
        company_id,
        TRIM(
          CONCAT(
            first_name,
            ' ',
            COALESCE(last_name, '')
          )
        ) AS label
      FROM sales.contacts
      ORDER BY LOWER(first_name)
    `),

    getDb().query<{
      id: string;
      company_id: string;
      label: string;
    }>(`
      SELECT
        id,
        company_id,
        title || ' · ' || deal_code AS label
      FROM sales.deals
      ORDER BY created_at DESC
    `),

    getDb().query<{
      id: string;
      company_id: string;
      label: string;
    }>(`
      SELECT
        id,
        company_id,
        subject || ' · ' || activity_code AS label
      FROM sales.activities
      ORDER BY created_at DESC
    `),
  ]);

  return {
    companies: companies.rows,
    contacts: contacts.rows,
    deals: deals.rows,
    activities: activities.rows,
  };
}

export function isTaskStatus(
  value: string,
): value is TaskStatus {
  return [
    "Todo",
    "InProgress",
    "Done",
    "Cancelled",
  ].includes(value);
}

export function isTaskPriority(
  value: string,
): value is TaskPriority {
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

cat > app/tasks/actions.ts <<'EOF'
"use server";

import { revalidatePath } from "next/cache";

import {
  createTask,
  isTaskPriority,
  isTaskStatus,
} from "@/lib/repositories/task.repository";

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

export async function createTaskAction(
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
    "Название задачи",
  );

  const statusValue =
    String(
      formData.get("status") ?? "Todo",
    ).trim();

  const priorityValue =
    String(
      formData.get("priority") ?? "Normal",
    ).trim();

  await createTask({
    companyId,

    contactId:
      optionalText(formData, "contact_id"),

    dealId:
      optionalText(formData, "deal_id"),

    activityId:
      optionalText(formData, "activity_id"),

    title,

    description:
      optionalText(formData, "description"),

    status:
      isTaskStatus(statusValue)
        ? statusValue
        : "Todo",

    priority:
      isTaskPriority(priorityValue)
        ? priorityValue
        : "Normal",

    dueAt:
      optionalText(formData, "due_at"),

    ownerName:
      optionalText(formData, "owner_name"),
  });

  revalidatePath("/tasks");
  revalidatePath(
    `/companies/${companyId}`,
  );
}
EOF

echo
echo "==> 7/10 Создание страницы Tasks"

cat > app/tasks/page.tsx <<'EOF'
import Link from "next/link";

import {
  SalesSidebar,
} from "@/components/layout/SalesSidebar";

import {
  DatabaseStatus,
} from "@/components/ui/DatabaseStatus";

import {
  createTaskAction,
} from "./actions";

import {
  getTaskMetrics,
  listTaskOptions,
  listTasks,
} from "@/lib/repositories/task.repository";

export const dynamic = "force-dynamic";

const statusNames: Record<string, string> = {
  Todo: "К выполнению",
  InProgress: "В работе",
  Done: "Выполнена",
  Cancelled: "Отменена",
};

const priorityNames: Record<string, string> = {
  Low: "Низкий",
  Normal: "Обычный",
  High: "Высокий",
  Urgent: "Срочный",
};

function formatDate(value: string | null) {
  if (!value) {
    return "Срок не указан";
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

export default async function TasksPage() {
  const [
    tasks,
    metrics,
    options,
  ] = await Promise.all([
    listTasks(200),
    getTaskMetrics(),
    listTaskOptions(),
  ]);

  return (
    <div className="appShell">
      <SalesSidebar activeSection="tasks" />

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Продажи</span>
            <strong>/</strong>
            <span>Задачи</span>
          </div>

          <DatabaseStatus />
        </header>

        <section className="pageHeader">
          <div>
            <div className="eyebrow">
              Контроль исполнения
            </div>

            <h1>Задачи</h1>

            <p>
              Следующие действия, сроки и
              ответственность коммерческой команды.
            </p>
          </div>
        </section>

        <section className="metricsGrid taskMetricsGrid">
          <article className="metricCard">
            <div className="metricLabel">
              Всего
            </div>
            <strong>{metrics.total}</strong>
            <p>задач в CRM</p>
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
            <p>задач на текущий день</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              В работе
            </div>
            <strong>{metrics.inProgress}</strong>
            <p>активно выполняются</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Выполнено
            </div>
            <strong>{metrics.done}</strong>
            <p>закрытых задач</p>
          </article>
        </section>

        <section className="workspaceGrid">
          <section className="contentPanel">
            <div className="panelTitle">
              <div>
                <h2>Рабочий список</h2>
                <p>Последние 200 задач</p>
              </div>
            </div>

            {tasks.length === 0 ? (
              <div className="emptyState">
                <div className="emptyIcon">✓</div>
                <h3>Задач пока нет</h3>
                <p>
                  Создай первую задачу через форму справа.
                </p>
              </div>
            ) : (
              <div className="taskList">
                {tasks.map((task) => {
                  const isOverdue =
                    task.status !== "Done" &&
                    task.status !== "Cancelled" &&
                    task.due_at !== null &&
                    new Date(task.due_at) < new Date();

                  return (
                    <article
                      className={
                        `taskCard ${
                          isOverdue ? "taskOverdue" : ""
                        }`
                      }
                      key={task.id}
                    >
                      <div
                        className={
                          `taskCheck task-status-${task.status.toLowerCase()}`
                        }
                      >
                        {task.status === "Done"
                          ? "✓"
                          : task.status === "InProgress"
                            ? "◐"
                            : "○"}
                      </div>

                      <div className="taskBody">
                        <div className="taskTitleRow">
                          <div>
                            <strong>{task.title}</strong>
                            <span>{task.task_code}</span>
                          </div>

                          <div className="taskBadges">
                            <span
                              className={
                                `activityPriority priority-${task.priority.toLowerCase()}`
                              }
                            >
                              {priorityNames[task.priority]}
                            </span>

                            <span
                              className={
                                `taskStatusBadge task-status-${task.status.toLowerCase()}`
                              }
                            >
                              {statusNames[task.status]}
                            </span>
                          </div>
                        </div>

                        <div className="taskRelations">
                          <Link
                            href={
                              `/companies/${task.company_id}`
                            }
                          >
                            {task.company_name}
                          </Link>

                          {task.contact_name && (
                            <span>
                              Контакт: {task.contact_name}
                            </span>
                          )}

                          {task.deal_title && (
                            <span>
                              Сделка: {task.deal_title}
                            </span>
                          )}

                          {task.activity_subject && (
                            <span>
                              Активность: {task.activity_subject}
                            </span>
                          )}
                        </div>

                        {task.description && (
                          <p>{task.description}</p>
                        )}

                        <div className="taskFooter">
                          <span
                            className={
                              isOverdue
                                ? "taskDueOverdue"
                                : ""
                            }
                          >
                            {formatDate(task.due_at)}
                          </span>

                          <span>
                            {task.owner_name ??
                              "Ответственный не назначен"}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="createPanel">
            <div className="formHeader">
              <div className="formIcon">＋</div>

              <div>
                <h2>Новая задача</h2>
                <p>
                  Поля со звёздочкой обязательны
                </p>
              </div>
            </div>

            {options.companies.length === 0 ? (
              <div className="contactNoCompanies">
                <strong>
                  Сначала добавь компанию
                </strong>

                <p>
                  Задача обязательно связана
                  с компанией.
                </p>

                <Link href="/companies">
                  Перейти к компаниям
                </Link>
              </div>
            ) : (
              <form
                action={createTaskAction}
                className="companyForm"
              >
                <label>
                  Компания *
                  <select
                    name="company_id"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Выбери компанию
                    </option>

                    {options.companies.map(
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
                  Название задачи *
                  <input
                    name="title"
                    required
                    maxLength={255}
                    placeholder="Подготовить коммерческое предложение"
                  />
                </label>

                <div className="formColumns">
                  <label>
                    Статус
                    <select
                      name="status"
                      defaultValue="Todo"
                    >
                      <option value="Todo">
                        К выполнению
                      </option>
                      <option value="InProgress">
                        В работе
                      </option>
                      <option value="Done">
                        Выполнена
                      </option>
                      <option value="Cancelled">
                        Отменена
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
                  Контакт
                  <select
                    name="contact_id"
                    defaultValue=""
                  >
                    <option value="">
                      Не выбран
                    </option>

                    {options.contacts.map(
                      (contact) => (
                        <option
                          key={contact.id}
                          value={contact.id}
                        >
                          {contact.label}
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

                    {options.deals.map((deal) => (
                      <option
                        key={deal.id}
                        value={deal.id}
                      >
                        {deal.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Связанная активность
                  <select
                    name="activity_id"
                    defaultValue=""
                  >
                    <option value="">
                      Не выбрана
                    </option>

                    {options.activities.map(
                      (activity) => (
                        <option
                          key={activity.id}
                          value={activity.id}
                        >
                          {activity.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  Срок
                  <input
                    name="due_at"
                    type="datetime-local"
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
                  Описание
                  <textarea
                    name="description"
                    rows={4}
                    maxLength={3000}
                    placeholder="Что именно нужно сделать"
                  />
                </label>

                <button
                  className="submitButton"
                  type="submit"
                >
                  Создать задачу
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
    '''    | "activities"
    | "analytics"''',
    '''    | "activities"
    | "tasks"
    | "analytics"''',
)

old = '''  {
    icon: "▥",
    label: "Аналитика",
    href: "#",
    section: "analytics",
  },'''

task_item = '''  {
    icon: "✓",
    label: "Задачи",
    href: "/tasks",
    section: "tasks",
  },
  {
    icon: "▥",
    label: "Аналитика",
    href: "#",
    section: "analytics",
  },'''

if 'href: "/tasks"' not in text:
    if old not in text:
        raise SystemExit(
            "Не найден элемент Аналитика в navigation."
        )

    text = text.replace(old, task_item)

path.write_text(text, encoding="utf-8")
PY

python3 <<'PY'
from pathlib import Path

path = Path("app/companies/[id]/page.tsx")
text = path.read_text(encoding="utf-8")

task_import = '''import {
  listCompanyTasks,
} from "@/lib/repositories/task.repository";
'''

if "@/lib/repositories/task.repository" not in text:
    marker = '''import {
  listCompanyActivities,
} from "@/lib/repositories/activity.repository";
'''

    if marker not in text:
        raise SystemExit(
            "Не найден import activity.repository."
        )

    text = text.replace(
        marker,
        marker + "\n" + task_import,
    )

old = '''const [company, contacts, deals, activities] =
    await Promise.all([
      getCompanyById(id),
      listCompanyContacts(id),
      listCompanyDeals(id),
      listCompanyActivities(id, 50),
    ]);'''

new = '''const [
    company,
    contacts,
    deals,
    activities,
    tasks,
  ] = await Promise.all([
    getCompanyById(id),
    listCompanyContacts(id),
    listCompanyDeals(id),
    listCompanyActivities(id, 50),
    listCompanyTasks(id, 50),
  ]);'''

if old not in text:
    raise SystemExit(
        "Не найден текущий Promise.all карточки компании."
    )

text = text.replace(old, new)

task_section = '''
        <section
          id="tasks"
          className="companyContactsPanel"
        >
          <div className="companySectionHeader">
            <div>
              <h2>Задачи компании</h2>
              <p>
                Следующие действия и контроль сроков
              </p>
            </div>

            <Link href="/tasks">
              Все задачи →
            </Link>
          </div>

          {tasks.length === 0 ? (
            <div className="companyEmptyContacts">
              <div className="emptyIcon">✓</div>

              <h3>Задач пока нет</h3>

              <p>
                Добавь следующее действие
                для этой компании.
              </p>

              <Link href="/tasks">
                Добавить задачу
              </Link>
            </div>
          ) : (
            <div className="companyTaskList">
              {tasks.map((task) => (
                <article
                  className="companyTaskCard"
                  key={task.id}
                >
                  <div
                    className={
                      `taskCheck task-status-${task.status.toLowerCase()}`
                    }
                  >
                    {task.status === "Done"
                      ? "✓"
                      : task.status === "InProgress"
                        ? "◐"
                        : "○"}
                  </div>

                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.task_code}</span>

                    <p>
                      {task.description ??
                        "Описание не указано"}
                    </p>

                    <small>
                      {task.due_at
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
                            new Date(task.due_at),
                          )
                        : "Срок не указан"}
                    </small>
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

if 'className="companyTaskList"' not in text:
    text = text.replace(
        contacts_marker,
        task_section + contacts_marker,
    )

path.write_text(text, encoding="utf-8")
PY

echo
echo "==> 9/10 Health-check и стили"

cat > app/api/health/tasks/route.ts <<'EOF'
import { NextResponse } from "next/server";

import {
  getTaskMetrics,
} from "@/lib/repositories/task.repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const metrics =
      await getTaskMetrics();

    return NextResponse.json({
      status: "ok",
      module: "tasks",
      metrics,
      timestamp:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Tasks health-check failed:",
      error,
    );

    return NextResponse.json(
      {
        status: "error",
        module: "tasks",
      },
      {
        status: 500,
      },
    );
  }
}
EOF

cat >> app/globals.css <<'EOF'

.taskMetricsGrid {
  grid-template-columns:
    repeat(5, minmax(0, 1fr));
}

.taskList {
  display: grid;
}

.taskCard {
  display: flex;
  gap: 13px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-soft);
}

.taskCard:last-child {
  border-bottom: 0;
}

.taskCard:hover {
  background: var(--surface-hover);
}

.taskOverdue {
  background: rgba(251, 113, 133, 0.025);
}

.taskCheck {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 11px;
  background: rgba(112, 108, 246, 0.14);
  color: #aaa7ff;
  font-size: 17px;
  font-weight: 900;
}

.task-status-done {
  background: rgba(74, 222, 128, 0.1);
  color: #77e99d;
}

.task-status-cancelled {
  background: rgba(148, 163, 184, 0.1);
  color: #a7b2c1;
}

.task-status-inprogress {
  background: rgba(96, 165, 250, 0.1);
  color: #82b8f9;
}

.taskBody {
  min-width: 0;
  flex: 1;
}

.taskTitleRow {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}

.taskTitleRow strong,
.taskTitleRow div:first-child > span {
  display: block;
}

.taskTitleRow strong {
  font-size: 12px;
}

.taskTitleRow div:first-child > span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 9px;
}

.taskBadges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.taskStatusBadge {
  display: inline-flex;
  min-height: 23px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 8px;
  font-weight: 900;
}

.taskRelations {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 9px;
}

.taskRelations a,
.taskRelations span {
  color: var(--muted-strong);
  font-size: 9px;
  text-decoration: none;
}

.taskRelations a {
  color: #9692ff;
  font-weight: 800;
}

.taskBody > p {
  margin: 10px 0 0;
  color: #aeb9ca;
  font-size: 10px;
  line-height: 1.55;
}

.taskFooter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 11px;
  color: var(--muted);
  font-size: 9px;
}

.taskDueOverdue {
  color: #fb8ca0;
  font-weight: 800;
}

.companyTaskList {
  display: grid;
}

.companyTaskCard {
  display: flex;
  gap: 12px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--border-soft);
}

.companyTaskCard:last-child {
  border-bottom: 0;
}

.companyTaskCard strong,
.companyTaskCard span,
.companyTaskCard small {
  display: block;
}

.companyTaskCard strong {
  font-size: 11px;
}

.companyTaskCard span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 8px;
}

.companyTaskCard p {
  margin: 7px 0 0;
  color: var(--muted-strong);
  font-size: 9px;
}

.companyTaskCard small {
  margin-top: 8px;
  color: var(--muted);
  font-size: 8px;
}

@media (max-width: 1250px) {
  .taskMetricsGrid {
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .taskMetricsGrid {
    grid-template-columns: 1fr;
  }

  .taskTitleRow {
    flex-direction: column;
  }
}
EOF

echo
echo "==> 10/10 Сборка и тестирование"

# Используем Docker-кэш — без --no-cache.
if ! docker compose build \
  --progress=plain \
  2>&1 | tee /tmp/tasks-build.log
then
  echo
  echo "❌ Ошибка сборки Tasks."

  grep -n -B 15 -A 45 \
    -E "Failed to compile|Type error|Error:|Build error" \
    /tmp/tasks-build.log \
    | tail -n 220 || true

  exit 1
fi

docker compose up -d --force-recreate

echo "Ожидаю запуск..."

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
  TASKS_CODE="$(
    curl \
      --silent \
      --output /tmp/tasks-page.html \
      --write-out '%{http_code}' \
      http://127.0.0.1:3000/tasks \
      || true
  )"

  HEALTH_CODE="$(
    curl \
      --silent \
      --output /tmp/tasks-health.json \
      --write-out '%{http_code}' \
      http://127.0.0.1:3000/api/health/tasks \
      || true
  )"

  DASHBOARD_CODE="$(
    curl \
      --silent \
      --output /dev/null \
      --write-out '%{http_code}' \
      http://127.0.0.1:3000/ \
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

  if [[ "$TASKS_CODE" == "200" &&
        "$HEALTH_CODE" == "200" &&
        "$DASHBOARD_CODE" == "200" &&
        "$CARD_CODE" == "200" ]]
  then
    READY=1
    break
  fi

  sleep 2
done

if [[ "$READY" -ne 1 ]]; then
  echo
  echo "❌ Tasks не прошёл проверку."
  echo "Tasks:        HTTP $TASKS_CODE"
  echo "Health:       HTTP $HEALTH_CODE"
  echo "Dashboard:    HTTP $DASHBOARD_CODE"
  echo "Company card: HTTP $CARD_CODE"
  echo

  cat /tmp/tasks-health.json 2>/dev/null || true
  echo
  docker logs "$APP_CONTAINER" --tail 220

  exit 1
fi

echo
echo "✅ Tasks health-check:"
cat /tmp/tasks-health.json
echo

echo
echo "=================================================="
echo "✅ Модуль Tasks 2.0 установлен"
echo
echo "Открыть:"
echo "  https://sales.cardigansarena.ru/tasks"
echo
echo "Резервная копия:"
echo "  $BACKUP_DIR"
echo "=================================================="
echo

read -r -p "Сохранить Tasks в GitHub? [y/N]: " PUSH_CONFIRM

case "$PUSH_CONFIRM" in
  y|Y|yes|YES)
    git add \
      scripts/install-tasks.sh \
      app/tasks \
      app/api/health/tasks \
      'app/companies/[id]/page.tsx' \
      lib/repositories/task.repository.ts \
      types/task.ts \
      lib/navigation.ts \
      app/globals.css

    if git diff --cached --quiet; then
      echo "Нет новых изменений для коммита."
    else
      git commit -m "Add integrated Tasks module"
      git push origin main

      echo "✅ Tasks сохранён в GitHub."
    fi
    ;;

  *)
    echo "GitHub не изменён."
    echo "Модуль уже работает на сервере."
    ;;
esac
