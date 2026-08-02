"use server";

import { revalidatePath } from "next/cache";
import {
  createCompany as insertCompany,
  isCompanyStatus,
} from "@/lib/repositories/company.repository";

function requiredText(
  formData: FormData,
  field: string,
  label: string,
): string {
  const value = String(formData.get(field) ?? "").trim();

  if (!value) {
    throw new Error(`${label} — обязательное поле.`);
  }

  return value;
}

function optionalText(
  formData: FormData,
  field: string,
): string | null {
  const value = String(formData.get(field) ?? "").trim();
  return value || null;
}

export async function createCompanyAction(
  formData: FormData,
): Promise<void> {
  const displayName = requiredText(
    formData,
    "display_name",
    "Название компании",
  );

  const country = requiredText(
    formData,
    "country",
    "Страна",
  );

  const statusValue =
    String(formData.get("lifecycle_status") ?? "New").trim();

  const lifecycleStatus = isCompanyStatus(statusValue)
    ? statusValue
    : "New";

  await insertCompany({
    displayName,
    country,
    website: optionalText(formData, "website"),
    industry: optionalText(formData, "industry"),
    ownerName: optionalText(formData, "owner_name"),
    lifecycleStatus,
  });

  revalidatePath("/companies");
}
