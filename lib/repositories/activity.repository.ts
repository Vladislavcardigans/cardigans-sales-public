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
  UpdateActivityInput,
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

export async function getActivityById(
  activityId: string,
): Promise<Activity | null> {
  const normalizedActivityId =
    activityId.trim();

  if (!normalizedActivityId) {
    return null;
  }

  const result =
    await getDb().query<Activity>(
      `
        ${activitySelect}

        WHERE activity.id = $1

        LIMIT 1
      `,
      [normalizedActivityId],
    );

  return result.rows[0] ?? null;
}

export async function updateActivity(
  activityId: string,
  input: UpdateActivityInput,
): Promise<Activity> {
  const normalizedActivityId =
    activityId.trim();

  if (!normalizedActivityId) {
    throw new Error(
      "Не указан идентификатор активности.",
    );
  }

  const result = await getDb().query<{
    id: string;
  }>(
    `
      UPDATE sales.activities

      SET
        company_id = $2,
        contact_id = $3,
        deal_id = $4,

        activity_type = $5,
        subject = $6,

        status = $7,
        priority = $8,

        scheduled_at = $9,

        completed_at =
          CASE
            WHEN $7 = 'Completed'
              THEN COALESCE(
                completed_at,
                NOW()
              )
            ELSE NULL
          END,

        owner_name = $10,
        description = $11,
        outcome = $12,

        updated_at = NOW()

      WHERE id = $1

        AND (
          $3::UUID IS NULL

          OR EXISTS (
            SELECT 1
            FROM sales.contacts AS contact

            WHERE contact.id = $3::UUID
              AND contact.company_id =
                $2::UUID
          )
        )

        AND (
          $4::UUID IS NULL

          OR EXISTS (
            SELECT 1
            FROM sales.deals AS deal

            WHERE deal.id = $4::UUID
              AND deal.company_id =
                $2::UUID
          )
        )

      RETURNING id
    `,
    [
      normalizedActivityId,

      input.companyId,
      input.contactId,
      input.dealId,

      input.activityType,
      input.subject,

      input.status,
      input.priority,

      input.scheduledAt,

      input.ownerName,
      input.description,
      input.outcome,
    ],
  );

  if (!result.rows[0]) {
    throw new Error(
      "Активность не найдена или выбранные " +
        "контакт и сделка не принадлежат компании.",
    );
  }

  const updatedActivity =
    await getActivityById(
      normalizedActivityId,
    );

  if (!updatedActivity) {
    throw new Error(
      "Не удалось загрузить обновлённую активность.",
    );
  }

  return updatedActivity;
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
