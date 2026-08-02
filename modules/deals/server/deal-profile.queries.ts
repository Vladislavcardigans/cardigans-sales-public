import "server-only";

import { getDb } from "@/lib/db";

import type {
  DealActivity,
  DealProfile,
  DealProfileData,
  DealTask,
} from "@/modules/deals/types/deal-profile";

export async function getDealProfile(
  id: string,
): Promise<DealProfile | null> {
  const result =
    await getDb().query<DealProfile>(
      `
        SELECT
          deal.id,
          deal.deal_code,
          deal.title,

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

        WHERE deal.id = $1
      `,
      [id],
    );

  return result.rows[0] ?? null;
}

export async function listDealActivities(
  dealId: string,
  limit = 50,
): Promise<DealActivity[]> {
  const safeLimit = Math.min(
    Math.max(limit, 1),
    200,
  );

  const result =
    await getDb().query<DealActivity>(
      `
        SELECT
          id,
          activity_code,
          activity_type,
          subject,
          status,
          priority,
          scheduled_at::TEXT,
          completed_at::TEXT

        FROM sales.activities

        WHERE deal_id = $1

        ORDER BY
          scheduled_at DESC NULLS LAST,
          created_at DESC

        LIMIT $2
      `,
      [dealId, safeLimit],
    );

  return result.rows;
}

export async function listDealTasks(
  dealId: string,
  limit = 50,
): Promise<DealTask[]> {
  const safeLimit = Math.min(
    Math.max(limit, 1),
    200,
  );

  const result =
    await getDb().query<DealTask>(
      `
        SELECT
          id,
          task_code,
          title,
          status,
          priority,
          due_at::TEXT,
          completed_at::TEXT

        FROM sales.tasks

        WHERE deal_id = $1

        ORDER BY
          CASE status
            WHEN 'Todo' THEN 1
            WHEN 'InProgress' THEN 2
            WHEN 'Done' THEN 3
            WHEN 'Cancelled' THEN 4
          END,
          due_at ASC NULLS LAST,
          created_at DESC

        LIMIT $2
      `,
      [dealId, safeLimit],
    );

  return result.rows;
}

export async function getDealProfileData(
  dealId: string,
): Promise<DealProfileData> {
  const [
    deal,
    activities,
    tasks,
  ] = await Promise.all([
    getDealProfile(dealId),
    listDealActivities(dealId),
    listDealTasks(dealId),
  ]);

  return {
    deal,
    activities,
    tasks,
  };
}
