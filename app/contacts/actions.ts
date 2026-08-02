"use server";

import { revalidatePath } from "next/cache";

import {
  createContact,
  isContactStatus,
  isPreferredChannel,
} from "@/lib/repositories/contact.repository";

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

function checkboxValue(
  formData: FormData,
  field: string,
): boolean {
  return formData.get(field) === "on";
}

export async function createContactAction(
  formData: FormData,
): Promise<void> {
  const companyId = requiredText(
    formData,
    "company_id",
    "Компания",
  );

  const firstName = requiredText(
    formData,
    "first_name",
    "Имя",
  );

  const preferredChannelValue =
    String(
      formData.get("preferred_channel") ?? "Email",
    ).trim();

  const contactStatusValue =
    String(
      formData.get("contact_status") ?? "Active",
    ).trim();

  await createContact({
    companyId,

    firstName,
    lastName: optionalText(formData, "last_name"),
    jobTitle: optionalText(formData, "job_title"),

    email: optionalText(formData, "email"),
    phone: optionalText(formData, "phone"),
    telegram: optionalText(formData, "telegram"),
    linkedinUrl:
      optionalText(formData, "linkedin_url"),

    preferredChannel:
      isPreferredChannel(preferredChannelValue)
        ? preferredChannelValue
        : "Email",

    contactStatus:
      isContactStatus(contactStatusValue)
        ? contactStatusValue
        : "Active",

    isDecisionMaker:
      checkboxValue(formData, "is_decision_maker"),

    doNotContact:
      checkboxValue(formData, "do_not_contact"),

    notes: optionalText(formData, "notes"),
  });

  revalidatePath("/contacts");
}
