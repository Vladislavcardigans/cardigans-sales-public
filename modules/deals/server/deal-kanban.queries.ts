import "server-only";

import { getDb } from "@/lib/db";

import type {
  KanbanDeal,
} from "@/modules/deals/types/deal-kanban";

export async function listKanbanDeals():
Promise<KanbanDeal[]> {
  const result =
    await getDb().query<KanbanDeal>(
      `
        SELECT
          deal.id,
          deal.deal_code,
          deal.title,

          deal.company_id,
          company.display_name
            AS company_name,
          company.company_code,

          deal.stage,

          deal.amount::TEXT,
          deal.currency,
          deal.probability,

          deal.owner_name,
          deal.expected_close_date::TEXT

        FROM sales.deals AS deal

        INNER JOIN sales.companies AS company
          ON company.id = deal.company_id

        ORDER BY
          CASE deal.stage
            WHEN 'Lead' THEN 1
            WHEN 'Qualified' THEN 2
            WHEN 'Proposal' THEN 3
            WHEN 'Negotiation' THEN 4
            WHEN 'Won' THEN 5
            WHEN 'Lost' THEN 6
          END,
          deal.amount DESC,
          deal.created_at DESC
      `,
    );

  return result.rows;
}
