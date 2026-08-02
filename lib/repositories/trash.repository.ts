import "server-only";

import { getDb } from "@/lib/db";

export type TrashEntityType =
  | "task"
  | "activity";

export type TrashItem = {
  id: string;
  entity_type: TrashEntityType;
  code: string | null;
  title: string;
  company_id: string;
  company_name: string;
  deleted_at: string;
};

export async function listTrashItems(
  tenantId: string,
): Promise<TrashItem[]> {
  const result = await getDb().query<TrashItem>(
    `
      SELECT
        task.id,
        'task'::TEXT AS entity_type,
        task.task_code AS code,
        task.title,
        task.company_id,
        company.display_name AS company_name,
        task.deleted_at::TEXT

      FROM sales.tasks AS task

      INNER JOIN sales.companies AS company
        ON company.id = task.company_id

      WHERE company.tenant_id = $1
        AND task.deleted_at IS NOT NULL

      UNION ALL

      SELECT
        activity.id,
        'activity'::TEXT AS entity_type,
        activity.activity_code AS code,
        activity.subject AS title,
        activity.company_id,
        company.display_name AS company_name,
        activity.deleted_at::TEXT

      FROM sales.activities AS activity

      INNER JOIN sales.companies AS company
        ON company.id = activity.company_id

      WHERE company.tenant_id = $1
        AND activity.deleted_at IS NOT NULL

      ORDER BY deleted_at DESC
    `,
    [tenantId],
  );

  return result.rows;
}

export async function restoreTrashItem(
  tenantId: string,
  entityType: TrashEntityType,
  entityId: string,
): Promise<TrashItem> {
  const table =
    entityType === "task"
      ? "tasks"
      : "activities";

  const titleColumn =
    entityType === "task"
      ? "title"
      : "subject";

  const codeColumn =
    entityType === "task"
      ? "task_code"
      : "activity_code";

  const result = await getDb().query<TrashItem>(
    `
      UPDATE sales.${table} AS item

      SET
        deleted_at = NULL,
        updated_at = NOW()

      FROM sales.companies AS company

      WHERE item.id = $1
        AND item.company_id = company.id
        AND company.tenant_id = $2
        AND item.deleted_at IS NOT NULL

      RETURNING
        item.id,
        $3::TEXT AS entity_type,
        item.${codeColumn} AS code,
        item.${titleColumn} AS title,
        item.company_id,
        company.display_name AS company_name,
        NOW()::TEXT AS deleted_at
    `,
    [
      entityId,
      tenantId,
      entityType,
    ],
  );

  const restoredItem = result.rows[0];

  if (!restoredItem) {
    throw new Error(
      "Запись не найдена или уже восстановлена.",
    );
  }

  return restoredItem;
}
