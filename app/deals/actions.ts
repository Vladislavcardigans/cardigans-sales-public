"use server";

import {
  requirePermission,
} from "@/modules/auth";

import { revalidatePath } from "next/cache";

import {
  createDeal,
  isDealCurrency,
  isDealStage,
} from "@/lib/repositories/deal.repository";

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
    String(formData.get(field) ?? "").trim();

  if (!raw) {
    return fallback;
  }

  const value =
    Number(raw.replace(",", "."));

  return Number.isFinite(value)
    ? value
    : fallback;
}

export async function createDealAction(
  formData: FormData,
): Promise<void> {

  await requirePermission("deal.create");
  const companyId = requiredText(
    formData,
    "company_id",
    "Компания",
  );

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

  const probability =
    Math.min(
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

  const amount =
    Math.max(
      0,
      numericValue(
        formData,
        "amount",
        0,
      ),
    );

  const primaryContactId =
    optionalText(
      formData,
      "primary_contact_id",
    );

  await createDeal({
    companyId,
    primaryContactId,

    title,

    stage:
      isDealStage(stageValue)
        ? stageValue
        : "Lead",

    amount,

    currency:
      isDealCurrency(currencyValue)
        ? currencyValue
        : "BYN",

    probability,

    ownerName:
      optionalText(
        formData,
        "owner_name",
      ),

    expectedCloseDate:
      optionalText(
        formData,
        "expected_close_date",
      ),

    description:
      optionalText(
        formData,
        "description",
      ),
  });

  revalidatePath("/deals");
  revalidatePath(
    `/companies/${companyId}`,
  );
}
