import { getDb } from "@/lib/db";

export type DashboardMetrics = {
  companies: number;
  contacts: number;
  activeDeals: number;
  overdueActivities: number;
  todayActivities: number;
  completedActivities: number;
};

export type DashboardStage = {
  stage: string;
  deals_count: number;
  total_amount: number;
};

export type DashboardActivity = {
  id: string;
  activity_code: string;
  activity_type: string;
  subject: string;
  priority: string;
  scheduled_at: string | null;
  company_id: string;
  company_name: string;
  deal_title: string | null;
};

export type DashboardDeal = {
  id: string;
  deal_code: string;
  title: string;
  stage: string;
  amount: string;
  currency: string;
  probability: number;
  company_id: string;
  company_name: string;
  expected_close_date: string | null;
};

export type DashboardCompany = {
  id: string;
  company_code: string;
  display_name: string;
  country: string;
  industry: string | null;
  lifecycle_status: string;
  created_at: Date;
};

export async function getDashboardMetrics():
Promise<DashboardMetrics> {
  const result = await getDb().query<{
    companies: string;
    contacts: string;
    active_deals: string;
    overdue_activities: string;
    today_activities: string;
    completed_activities: string;
  }>(`
    SELECT
      (
        SELECT COUNT(*)::TEXT
        FROM sales.companies
      ) AS companies,

      (
        SELECT COUNT(*)::TEXT
        FROM sales.contacts
      ) AS contacts,

      (
        SELECT COUNT(*)::TEXT
        FROM sales.deals
        WHERE stage NOT IN ('Won', 'Lost')
      ) AS active_deals,

      (
        SELECT COUNT(*)::TEXT
        FROM sales.activities
        WHERE status = 'Planned'
          AND scheduled_at < NOW()
      ) AS overdue_activities,

      (
        SELECT COUNT(*)::TEXT
        FROM sales.activities
        WHERE status = 'Planned'
          AND scheduled_at >= CURRENT_DATE
          AND scheduled_at < CURRENT_DATE + INTERVAL '1 day'
      ) AS today_activities,

      (
        SELECT COUNT(*)::TEXT
        FROM sales.activities
        WHERE status = 'Completed'
      ) AS completed_activities
  `);

  const row = result.rows[0];

  return {
    companies: Number(row?.companies ?? 0),
    contacts: Number(row?.contacts ?? 0),
    activeDeals: Number(row?.active_deals ?? 0),
    overdueActivities:
      Number(row?.overdue_activities ?? 0),
    todayActivities:
      Number(row?.today_activities ?? 0),
    completedActivities:
      Number(row?.completed_activities ?? 0),
  };
}

export async function getDashboardStages():
Promise<DashboardStage[]> {
  const result = await getDb().query<{
    stage: string;
    deals_count: string;
    total_amount: string;
  }>(`
    SELECT
      stage,
      COUNT(*)::TEXT AS deals_count,
      COALESCE(SUM(amount), 0)::TEXT AS total_amount
    FROM sales.deals
    GROUP BY stage
  `);

  const knownStages = [
    "Lead",
    "Qualified",
    "Proposal",
    "Negotiation",
    "Won",
    "Lost",
  ];

  return knownStages.map((stage) => {
    const row = result.rows.find(
      (item) => item.stage === stage,
    );

    return {
      stage,
      deals_count:
        Number(row?.deals_count ?? 0),
      total_amount:
        Number(row?.total_amount ?? 0),
    };
  });
}

export async function listDashboardActivities(
  limit = 8,
): Promise<DashboardActivity[]> {
  const result =
    await getDb().query<DashboardActivity>(
      `
        SELECT
          activity.id,
          activity.activity_code,
          activity.activity_type,
          activity.subject,
          activity.priority,
          activity.scheduled_at::TEXT,

          company.id AS company_id,
          company.display_name AS company_name,

          deal.title AS deal_title

        FROM sales.activities AS activity

        INNER JOIN sales.companies AS company
          ON company.id = activity.company_id

        LEFT JOIN sales.deals AS deal
          ON deal.id = activity.deal_id

        WHERE activity.status = 'Planned'

        ORDER BY
          CASE
            WHEN activity.scheduled_at < NOW()
            THEN 1
            ELSE 2
          END,
          activity.scheduled_at ASC NULLS LAST,
          activity.created_at DESC

        LIMIT $1
      `,
      [limit],
    );

  return result.rows;
}

export async function listDashboardDeals(
  limit = 6,
): Promise<DashboardDeal[]> {
  const result =
    await getDb().query<DashboardDeal>(
      `
        SELECT
          deal.id,
          deal.deal_code,
          deal.title,
          deal.stage,
          deal.amount::TEXT,
          deal.currency,
          deal.probability,

          company.id AS company_id,
          company.display_name AS company_name,

          deal.expected_close_date::TEXT

        FROM sales.deals AS deal

        INNER JOIN sales.companies AS company
          ON company.id = deal.company_id

        WHERE deal.stage NOT IN ('Won', 'Lost')

        ORDER BY
          deal.amount DESC,
          deal.probability DESC,
          deal.created_at DESC

        LIMIT $1
      `,
      [limit],
    );

  return result.rows;
}

export async function listDashboardCompanies(
  limit = 6,
): Promise<DashboardCompany[]> {
  const result =
    await getDb().query<DashboardCompany>(
      `
        SELECT
          id,
          company_code,
          display_name,
          country,
          industry,
          lifecycle_status,
          created_at

        FROM sales.companies

        ORDER BY created_at DESC

        LIMIT $1
      `,
      [limit],
    );

  return result.rows;
}
