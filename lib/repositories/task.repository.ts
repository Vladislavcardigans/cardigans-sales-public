import { getDb } from "@/lib/db";

import type {
  CreateTaskInput,
  SalesTask,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput,
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

export async function getTaskById(
  taskId: string,
): Promise<SalesTask | null> {
  const normalizedTaskId = taskId.trim();

  if (!normalizedTaskId) {
    return null;
  }

  const result =
    await getDb().query<SalesTask>(
      `
        ${taskSelect}

        WHERE task.id = $1

        LIMIT 1
      `,
      [normalizedTaskId],
    );

  return result.rows[0] ?? null;
}

export async function updateTask(
  taskId: string,
  input: UpdateTaskInput,
): Promise<SalesTask> {
  const normalizedTaskId = taskId.trim();

  if (!normalizedTaskId) {
    throw new Error(
      "Не указан идентификатор задачи.",
    );
  }

  const result = await getDb().query<{
    id: string;
  }>(
    `
      UPDATE sales.tasks

      SET
        company_id = $2,
        contact_id = $3,
        deal_id = $4,
        activity_id = $5,

        title = $6,
        description = $7,

        status = $8,
        priority = $9,

        due_at = $10,

        completed_at =
          CASE
            WHEN $8 = 'Done'
              THEN COALESCE(
                completed_at,
                NOW()
              )
            ELSE NULL
          END,

        owner_name = $11,
        updated_at = NOW()

      WHERE id = $1

        AND (
          $3::UUID IS NULL
          OR EXISTS (
            SELECT 1
            FROM sales.contacts AS contact
            WHERE contact.id = $3::UUID
              AND contact.company_id = $2::UUID
          )
        )

        AND (
          $4::UUID IS NULL
          OR EXISTS (
            SELECT 1
            FROM sales.deals AS deal
            WHERE deal.id = $4::UUID
              AND deal.company_id = $2::UUID
          )
        )

        AND (
          $5::UUID IS NULL
          OR EXISTS (
            SELECT 1
            FROM sales.activities AS activity
            WHERE activity.id = $5::UUID
              AND activity.company_id = $2::UUID
              AND activity.deleted_at IS NULL
          )
        )

      RETURNING id
    `,
    [
      normalizedTaskId,

      input.companyId,
      input.contactId,
      input.dealId,
      input.activityId,

      input.title,
      input.description,

      input.status,
      input.priority,

      input.dueAt,
      input.ownerName,
    ],
  );

  if (!result.rows[0]) {
    throw new Error(
      "Задача не найдена или выбранные связанные " +
        "объекты не принадлежат компании.",
    );
  }

  const updatedTask =
    await getTaskById(normalizedTaskId);

  if (!updatedTask) {
    throw new Error(
      "Не удалось загрузить обновлённую задачу.",
    );
  }

  return updatedTask;
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
