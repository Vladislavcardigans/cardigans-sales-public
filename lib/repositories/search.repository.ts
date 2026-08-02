import "server-only";

import { getDb } from "@/lib/db";

export type GlobalSearchResult = {
  id: string;
  entity:
    | "company"
    | "contact"
    | "deal"
    | "activity"
    | "task";
  code: string | null;
  title: string;
  subtitle: string | null;
  href: string;
};

type SearchPermissions = {
  companies: boolean;
  contacts: boolean;
  deals: boolean;
  activities: boolean;
  tasks: boolean;
};

const resultLimit = 12;

function normalizeSearchQuery(
  query: string,
): string {
  return query.trim().slice(0, 100);
}

export async function searchSales(
  query: string,
  permissions: SearchPermissions,
): Promise<GlobalSearchResult[]> {
  const normalizedQuery =
    normalizeSearchQuery(query);

  if (normalizedQuery.length < 2) {
    return [];
  }

  const pattern = `%${normalizedQuery}%`;

  const [
    companies,
    contacts,
    deals,
    activities,
    tasks,
  ] = await Promise.all([
    permissions.companies
      ? getDb().query<GlobalSearchResult>(
          `
            SELECT
              company.id,
              'company'::TEXT AS entity,
              company.company_code AS code,
              company.display_name AS title,
              CONCAT_WS(
                ' · ',
                NULLIF(company.industry, ''),
                NULLIF(company.owner_name, '')
              ) AS subtitle,
              '/companies/' || company.id AS href

            FROM sales.companies AS company

            WHERE
              company.display_name ILIKE $1
              OR company.company_code ILIKE $1
              OR COALESCE(company.website, '') ILIKE $1
              OR COALESCE(company.industry, '') ILIKE $1
              OR COALESCE(company.owner_name, '') ILIKE $1

            ORDER BY
              CASE
                WHEN company.company_code ILIKE $1
                  THEN 1
                WHEN company.display_name ILIKE $1
                  THEN 2
                ELSE 3
              END,
              company.updated_at DESC

            LIMIT $2
          `,
          [pattern, resultLimit],
        )
      : Promise.resolve({ rows: [] }),

    permissions.contacts
      ? getDb().query<GlobalSearchResult>(
          `
            SELECT
              contact.id,
              'contact'::TEXT AS entity,
              NULL::TEXT AS code,
              TRIM(
                CONCAT(
                  contact.first_name,
                  ' ',
                  COALESCE(contact.last_name, '')
                )
              ) AS title,
              CONCAT_WS(
                ' · ',
                company.display_name,
                NULLIF(contact.job_title, ''),
                NULLIF(contact.email, ''),
                NULLIF(contact.phone, '')
              ) AS subtitle,
              '/contacts/' || contact.id AS href

            FROM sales.contacts AS contact

            INNER JOIN sales.companies AS company
              ON company.id = contact.company_id

            WHERE
              contact.first_name ILIKE $1
              OR COALESCE(contact.last_name, '') ILIKE $1
              OR COALESCE(contact.email, '') ILIKE $1
              OR COALESCE(contact.phone, '') ILIKE $1
              OR COALESCE(contact.telegram, '') ILIKE $1
              OR company.display_name ILIKE $1
              OR company.company_code ILIKE $1

            ORDER BY contact.updated_at DESC

            LIMIT $2
          `,
          [pattern, resultLimit],
        )
      : Promise.resolve({ rows: [] }),

    permissions.deals
      ? getDb().query<GlobalSearchResult>(
          `
            SELECT
              deal.id,
              'deal'::TEXT AS entity,
              deal.deal_code AS code,
              deal.title,
              CONCAT_WS(
                ' · ',
                company.display_name,
                deal.stage,
                NULLIF(deal.owner_name, '')
              ) AS subtitle,
              '/deals/' || deal.id AS href

            FROM sales.deals AS deal

            INNER JOIN sales.companies AS company
              ON company.id = deal.company_id

            WHERE
              deal.deal_code ILIKE $1
              OR deal.title ILIKE $1
              OR company.display_name ILIKE $1
              OR company.company_code ILIKE $1
              OR COALESCE(deal.owner_name, '') ILIKE $1
              OR COALESCE(deal.description, '') ILIKE $1

            ORDER BY deal.updated_at DESC

            LIMIT $2
          `,
          [pattern, resultLimit],
        )
      : Promise.resolve({ rows: [] }),

    permissions.activities
      ? getDb().query<GlobalSearchResult>(
          `
            SELECT
              activity.id,
              'activity'::TEXT AS entity,
              activity.activity_code AS code,
              activity.subject AS title,
              CONCAT_WS(
                ' · ',
                company.display_name,
                activity.activity_type,
                NULLIF(activity.owner_name, '')
              ) AS subtitle,
              '/activities'::TEXT AS href

            FROM sales.activities AS activity

            INNER JOIN sales.companies AS company
              ON company.id = activity.company_id

            WHERE activity.deleted_at IS NULL
              AND (
                activity.activity_code ILIKE $1
                OR activity.subject ILIKE $1
                OR company.display_name ILIKE $1
                OR company.company_code ILIKE $1
                OR COALESCE(activity.owner_name, '') ILIKE $1
                OR COALESCE(activity.description, '') ILIKE $1
                OR COALESCE(activity.outcome, '') ILIKE $1
              )

            ORDER BY activity.updated_at DESC

            LIMIT $2
          `,
          [pattern, resultLimit],
        )
      : Promise.resolve({ rows: [] }),

    permissions.tasks
      ? getDb().query<GlobalSearchResult>(
          `
            SELECT
              task.id,
              'task'::TEXT AS entity,
              task.task_code AS code,
              task.title,
              CONCAT_WS(
                ' · ',
                company.display_name,
                task.status,
                NULLIF(task.owner_name, '')
              ) AS subtitle,
              '/tasks'::TEXT AS href

            FROM sales.tasks AS task

            INNER JOIN sales.companies AS company
              ON company.id = task.company_id

            WHERE task.deleted_at IS NULL
              AND (
                task.task_code ILIKE $1
                OR task.title ILIKE $1
                OR company.display_name ILIKE $1
                OR company.company_code ILIKE $1
                OR COALESCE(task.owner_name, '') ILIKE $1
                OR COALESCE(task.description, '') ILIKE $1
              )

            ORDER BY task.updated_at DESC

            LIMIT $2
          `,
          [pattern, resultLimit],
        )
      : Promise.resolve({ rows: [] }),
  ]);

  return [
    ...companies.rows,
    ...contacts.rows,
    ...deals.rows,
    ...activities.rows,
    ...tasks.rows,
  ];
}
