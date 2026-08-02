import { getDb } from "@/lib/db";

import type {
  CompanyOption,
  Contact,
  ContactStatus,
  CreateContactInput,
  PreferredChannel,
} from "@/types/contact";

export async function listContacts(
  limit = 100,
): Promise<Contact[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);

  const result = await getDb().query<Contact>(
    `
      SELECT
        contact.id,
        contact.company_id,
        company.display_name AS company_name,
        company.company_code,

        contact.first_name,
        contact.last_name,
        contact.job_title,

        contact.email,
        contact.phone,
        contact.telegram,
        contact.linkedin_url,

        contact.preferred_channel,
        contact.contact_status,

        contact.is_decision_maker,
        contact.do_not_contact,

        contact.notes,

        contact.created_at,
        contact.updated_at

      FROM sales.contacts AS contact

      INNER JOIN sales.companies AS company
        ON company.id = contact.company_id

      ORDER BY
        contact.created_at DESC

      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows;
}

export async function listCompanyOptions():
Promise<CompanyOption[]> {
  const result = await getDb().query<CompanyOption>(
    `
      SELECT
        id,
        company_code,
        display_name
      FROM sales.companies
      ORDER BY LOWER(display_name)
    `,
  );

  return result.rows;
}

export async function createContact(
  input: CreateContactInput,
): Promise<Contact> {
  const result = await getDb().query<Contact>(
    `
      WITH inserted AS (
        INSERT INTO sales.contacts (
          company_id,

          first_name,
          last_name,
          job_title,

          email,
          phone,
          telegram,
          linkedin_url,

          preferred_channel,
          contact_status,

          is_decision_maker,
          do_not_contact,

          notes
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10,
          $11, $12,
          $13
        )
        RETURNING *
      )

      SELECT
        inserted.id,
        inserted.company_id,
        company.display_name AS company_name,
        company.company_code,

        inserted.first_name,
        inserted.last_name,
        inserted.job_title,

        inserted.email,
        inserted.phone,
        inserted.telegram,
        inserted.linkedin_url,

        inserted.preferred_channel,
        inserted.contact_status,

        inserted.is_decision_maker,
        inserted.do_not_contact,

        inserted.notes,

        inserted.created_at,
        inserted.updated_at

      FROM inserted

      INNER JOIN sales.companies AS company
        ON company.id = inserted.company_id
    `,
    [
      input.companyId,

      input.firstName,
      input.lastName,
      input.jobTitle,

      input.email,
      input.phone,
      input.telegram,
      input.linkedinUrl,

      input.preferredChannel,
      input.contactStatus,

      input.isDecisionMaker,
      input.doNotContact,

      input.notes,
    ],
  );

  return result.rows[0];
}

export async function countContacts(): Promise<{
  total: number;
  decisionMakers: number;
  doNotContact: number;
}> {
  const result = await getDb().query<{
    total: string;
    decision_makers: string;
    do_not_contact: string;
  }>(
    `
      SELECT
        COUNT(*)::TEXT AS total,

        COUNT(*) FILTER (
          WHERE is_decision_maker = TRUE
        )::TEXT AS decision_makers,

        COUNT(*) FILTER (
          WHERE do_not_contact = TRUE
        )::TEXT AS do_not_contact

      FROM sales.contacts
    `,
  );

  return {
    total: Number(result.rows[0]?.total ?? 0),
    decisionMakers:
      Number(result.rows[0]?.decision_makers ?? 0),
    doNotContact:
      Number(result.rows[0]?.do_not_contact ?? 0),
  };
}

export function isPreferredChannel(
  value: string,
): value is PreferredChannel {
  return [
    "Email",
    "Phone",
    "Telegram",
    "LinkedIn",
    "Other",
  ].includes(value);
}

export function isContactStatus(
  value: string,
): value is ContactStatus {
  return [
    "Active",
    "Inactive",
    "Left company",
    "Unknown",
  ].includes(value);
}
