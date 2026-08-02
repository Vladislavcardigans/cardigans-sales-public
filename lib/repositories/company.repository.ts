import { getDb } from "@/lib/db";
import type {
  Company,
  CompanyStatus,
  CreateCompanyInput,
} from "@/types/company";

export async function listCompanies(limit = 100): Promise<Company[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);

  const result = await getDb().query<Company>(
    `
      SELECT
        id,
        company_code,
        display_name,
        website,
        country,
        industry,
        owner_name,
        lifecycle_status,
        do_not_contact,
        created_at,
        updated_at
      FROM sales.companies
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows;
}

export async function createCompany(
  input: CreateCompanyInput,
): Promise<Company> {
  const result = await getDb().query<Company>(
    `
      INSERT INTO sales.companies (
        display_name,
        website,
        country,
        industry,
        owner_name,
        lifecycle_status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        company_code,
        display_name,
        website,
        country,
        industry,
        owner_name,
        lifecycle_status,
        do_not_contact,
        created_at,
        updated_at
    `,
    [
      input.displayName,
      input.website,
      input.country,
      input.industry,
      input.ownerName,
      input.lifecycleStatus,
    ],
  );

  return result.rows[0];
}

export async function countCompanies(): Promise<{
  total: number;
  active: number;
  newCompanies: number;
}> {
  const result = await getDb().query<{
    total: string;
    active: string;
    new_companies: string;
  }>(`
    SELECT
      COUNT(*)::TEXT AS total,
      COUNT(*) FILTER (
        WHERE lifecycle_status = 'Active'
      )::TEXT AS active,
      COUNT(*) FILTER (
        WHERE lifecycle_status = 'New'
      )::TEXT AS new_companies
    FROM sales.companies
  `);

  return {
    total: Number(result.rows[0]?.total ?? 0),
    active: Number(result.rows[0]?.active ?? 0),
    newCompanies: Number(result.rows[0]?.new_companies ?? 0),
  };
}

export function isCompanyStatus(value: string): value is CompanyStatus {
  return [
    "New",
    "Qualified",
    "Active",
    "Dormant",
    "Former",
    "Disqualified",
    "Closed",
  ].includes(value);
}

export type CompanyDetails = Company & {
  contacts_count: number;
};

export type CompanyContact = {
  id: string;
  first_name: string;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  preferred_channel: string;
  contact_status: string;
  is_decision_maker: boolean;
  do_not_contact: boolean;
};

export async function getCompanyById(
  id: string,
): Promise<CompanyDetails | null> {
  const result = await getDb().query<CompanyDetails>(
    `
      SELECT
        company.id,
        company.company_code,
        company.display_name,
        company.website,
        company.country,
        company.industry,
        company.owner_name,
        company.lifecycle_status,
        company.do_not_contact,
        company.created_at,
        company.updated_at,
        COUNT(contact.id)::INTEGER AS contacts_count
      FROM sales.companies AS company
      LEFT JOIN sales.contacts AS contact
        ON contact.company_id = company.id
      WHERE company.id = $1
      GROUP BY company.id
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function listCompanyContacts(
  companyId: string,
): Promise<CompanyContact[]> {
  const result = await getDb().query<CompanyContact>(
    `
      SELECT
        id,
        first_name,
        last_name,
        job_title,
        email,
        phone,
        telegram,
        preferred_channel,
        contact_status,
        is_decision_maker,
        do_not_contact
      FROM sales.contacts
      WHERE company_id = $1
      ORDER BY
        is_decision_maker DESC,
        first_name,
        last_name
    `,
    [companyId],
  );

  return result.rows;
}
