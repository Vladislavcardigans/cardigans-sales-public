"use server";

import {
  requirePermission,
} from "@/modules/auth";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";

const allowedStages = [
  "Lead",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
] as const;

const allowedCurrencies = [
  "BYN",
  "RUB",
  "USD",
  "EUR",
] as const;

function requiredText(
  formData: FormData,
  field: string,
  label: string,
): string {
  const value =
    String(formData.get(field) ?? "").trim();

  if (!value) {
    throw new Error(
      `${label} — обязательное поле.`,
    );
  }

  return value;
}

function optionalText(
  formData: FormData,
  field: string,
): string | null {
  const value =
    String(formData.get(field) ?? "").trim();

  return value || null;
}

function numericValue(
  formData: FormData,
  field: string,
  fallback: number,
): number {
  const raw =
    String(formData.get(field) ?? "")
      .trim()
      .replace(",", ".");

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

export async function updateDealAction(
  dealId: string,
  formData: FormData,
): Promise<void> {

  await requirePermission("deal.update");
  const normalizedDealId = dealId.trim();

  if (!normalizedDealId) {
    throw new Error(
      "Не указан идентификатор сделки.",
    );
  }

  const title = requiredText(
    formData,
    "title",
    "Название сделки",
  );

  const stageValue =
    String(
      formData.get("stage") ?? "Lead",
    ).trim();

  const currencyValue =
    String(
      formData.get("currency") ?? "BYN",
    ).trim();

  const stage =
    allowedStages.includes(
      stageValue as
        (typeof allowedStages)[number],
    )
      ? stageValue
      : "Lead";

  const currency =
    allowedCurrencies.includes(
      currencyValue as
        (typeof allowedCurrencies)[number],
    )
      ? currencyValue
      : "BYN";

  const amount = Math.max(
    0,
    numericValue(
      formData,
      "amount",
      0,
    ),
  );

  const probability = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        numericValue(
          formData,
          "probability",
          10,
        ),
      ),
    ),
  );

  const primaryContactId =
    optionalText(
      formData,
      "primary_contact_id",
    );

  const existingResult =
    await getDb().query<{
      company_id: string;
    }>(
      `
        SELECT company_id
        FROM sales.deals
        WHERE id = $1
      `,
      [normalizedDealId],
    );

  const companyId =
    existingResult.rows[0]?.company_id;

  if (!companyId) {
    throw new Error(
      "Сделка не найдена.",
    );
  }

  if (primaryContactId) {
    const contactResult =
      await getDb().query<{
        id: string;
      }>(
        `
          SELECT id
          FROM sales.contacts
          WHERE id = $1
            AND company_id = $2
        `,
        [
          primaryContactId,
          companyId,
        ],
      );

    if (!contactResult.rows[0]) {
      throw new Error(
        "Выбранный контакт не принадлежит компании сделки.",
      );
    }
  }

  await getDb().query(
    `
      UPDATE sales.deals

      SET
        primary_contact_id = $2,

        title = $3,
        stage = $4,

        amount = $5,
        currency = $6,
        probability = $7,

        owner_name = $8,
        expected_close_date = $9,

        description = $10,

        lost_reason = CASE
          WHEN $4 = 'Lost'
          THEN $11
          ELSE NULL
        END,

        updated_at = NOW()

      WHERE id = $1
    `,
    [
      normalizedDealId,
      primaryContactId,

      title,
      stage,

      amount,
      currency,
      probability,

      optionalText(
        formData,
        "owner_name",
      ),

      optionalText(
        formData,
        "expected_close_date",
      ),

      optionalText(
        formData,
        "description",
      ),

      optionalText(
        formData,
        "lost_reason",
      ),
    ],
  );

  revalidatePath("/deals");
  revalidatePath("/deals/kanban");
  revalidatePath("/");
  revalidatePath(
    `/deals/${normalizedDealId}`,
  );
  revalidatePath(
    `/companies/${companyId}`,
  );

  redirect(
    `/deals/${normalizedDealId}`,
  );
}
