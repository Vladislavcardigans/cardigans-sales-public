import { getDb } from "@/lib/db";

import type {
  CreateDealInput,
  Deal,
  DealCompanyOption,
  DealContactOption,
  DealCurrency,
  DealStage,
} from "@/types/deal";

const dealSelect = `
  SELECT
    deal.id,

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

    deal.deal_code,
    deal.title,

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
`;

export async function listDeals(
  limit = 100,
): Promise<Deal[]> {
  const safeLimit = Math.min(
    Math.max(limit, 1),
    500,
  );

  const result = await getDb().query<Deal>(
    `
      ${dealSelect}

      ORDER BY
        CASE deal.stage
          WHEN 'Negotiation' THEN 1
          WHEN 'Proposal' THEN 2
          WHEN 'Qualified' THEN 3
          WHEN 'Lead' THEN 4
          WHEN 'Won' THEN 5
          WHEN 'Lost' THEN 6
        END,
        deal.created_at DESC

      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows;
}

export async function listCompanyDeals(
  companyId: string,
): Promise<Deal[]> {
  const result = await getDb().query<Deal>(
    `
      ${dealSelect}

      WHERE deal.company_id = $1

      ORDER BY
        CASE deal.stage
          WHEN 'Negotiation' THEN 1
          WHEN 'Proposal' THEN 2
          WHEN 'Qualified' THEN 3
          WHEN 'Lead' THEN 4
          WHEN 'Won' THEN 5
          WHEN 'Lost' THEN 6
        END,
        deal.created_at DESC
    `,
    [companyId],
  );

  return result.rows;
}

export async function createDeal(
  input: CreateDealInput,
): Promise<Deal> {
  const result = await getDb().query<Deal>(
    `
      WITH inserted AS (
        INSERT INTO sales.deals (
          company_id,
          primary_contact_id,

          title,
          stage,

          amount,
          currency,
          probability,

          owner_name,
          expected_close_date,

          description
        )
        VALUES (
          $1, $2,
          $3, $4,
          $5, $6, $7,
          $8, $9,
          $10
        )
        RETURNING *
      )

      SELECT
        inserted.id,

        inserted.company_id,
        company.display_name AS company_name,
        company.company_code,

        inserted.primary_contact_id,

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

        inserted.deal_code,
        inserted.title,

        inserted.stage,

        inserted.amount::TEXT,
        inserted.currency,
        inserted.probability,

        inserted.owner_name,
        inserted.expected_close_date::TEXT,

        inserted.description,
        inserted.lost_reason,

        inserted.created_at,
        inserted.updated_at

      FROM inserted

      INNER JOIN sales.companies AS company
        ON company.id = inserted.company_id

      LEFT JOIN sales.contacts AS contact
        ON contact.id = inserted.primary_contact_id
    `,
    [
      input.companyId,
      input.primaryContactId,

      input.title,
      input.stage,

      input.amount,
      input.currency,
      input.probability,

      input.ownerName,
      input.expectedCloseDate,

      input.description,
    ],
  );

  return result.rows[0];
}

export async function listDealCompanyOptions():
Promise<DealCompanyOption[]> {
  const result =
    await getDb().query<DealCompanyOption>(
      `
        SELECT
          id,
          company_code,
          display_name

        FROM sales.companies

        ORDER BY
          LOWER(display_name)
      `,
    );

  return result.rows;
}

export async function listDealContactOptions():
Promise<DealContactOption[]> {
  const result =
    await getDb().query<DealContactOption>(
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

        WHERE contact_status = 'Active'

        ORDER BY
          LOWER(first_name),
          LOWER(COALESCE(last_name, ''))
      `,
    );

  return result.rows;
}

export async function getDealMetrics(): Promise<{
  total: number;
  active: number;
  won: number;
  totalPipeline: number;
  weightedPipeline: number;
}> {
  const result = await getDb().query<{
    total: string;
    active: string;
    won: string;
    total_pipeline: string;
    weighted_pipeline: string;
  }>(
    `
      SELECT
        COUNT(*)::TEXT AS total,

        COUNT(*) FILTER (
          WHERE stage NOT IN ('Won', 'Lost')
        )::TEXT AS active,

        COUNT(*) FILTER (
          WHERE stage = 'Won'
        )::TEXT AS won,

        COALESCE(
          SUM(amount) FILTER (
            WHERE stage NOT IN ('Won', 'Lost')
          ),
          0
        )::TEXT AS total_pipeline,

        COALESCE(
          SUM(
            amount * probability / 100.0
          ) FILTER (
            WHERE stage NOT IN ('Won', 'Lost')
          ),
          0
        )::TEXT AS weighted_pipeline

      FROM sales.deals
    `,
  );

  return {
    total: Number(result.rows[0]?.total ?? 0),
    active: Number(result.rows[0]?.active ?? 0),
    won: Number(result.rows[0]?.won ?? 0),
    totalPipeline:
      Number(result.rows[0]?.total_pipeline ?? 0),
    weightedPipeline:
      Number(result.rows[0]?.weighted_pipeline ?? 0),
  };
}

export function isDealStage(
  value: string,
): value is DealStage {
  return [
    "Lead",
    "Qualified",
    "Proposal",
    "Negotiation",
    "Won",
    "Lost",
  ].includes(value);
}

export function isDealCurrency(
  value: string,
): value is DealCurrency {
  return [
    "BYN",
    "RUB",
    "USD",
    "EUR",
  ].includes(value);
}
