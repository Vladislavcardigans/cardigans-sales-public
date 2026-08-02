"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";

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

function checkboxValue(
  formData: FormData,
  field: string,
): boolean {
  const value = formData.get(field);

  return (
    value === "on" ||
    value === "true" ||
    value === "1"
  );
}

const allowedChannels = [
  "Email",
  "Phone",
  "Telegram",
  "LinkedIn",
  "Other",
];

const allowedStatuses = [
  "Active",
  "Inactive",
  "Former",
];

export async function updateContactAction(
  contactId: string,
  formData: FormData,
): Promise<void> {
  const firstName = requiredText(
    formData,
    "first_name",
    "Имя",
  );

  const preferredChannelValue =
    String(
      formData.get("preferred_channel") ??
      "Email",
    ).trim();

  const contactStatusValue =
    String(
      formData.get("contact_status") ??
      "Active",
    ).trim();

  const preferredChannel =
    allowedChannels.includes(
      preferredChannelValue,
    )
      ? preferredChannelValue
      : "Email";

  const contactStatus =
    allowedStatuses.includes(
      contactStatusValue,
    )
      ? contactStatusValue
      : "Active";

  const result = await getDb().query(
    `
      UPDATE sales.contacts

      SET
        first_name = $2,
        last_name = $3,
        job_title = $4,

        email = $5,
        phone = $6,
        telegram = $7,
        linkedin_url = $8,

        preferred_channel = $9,
        contact_status = $10,

        is_decision_maker = $11,
        do_not_contact = $12,

        notes = $13,
        updated_at = NOW()

      WHERE id = $1

      RETURNING
        id,
        company_id
    `,
    [
      contactId,

      firstName,
      optionalText(formData, "last_name"),
      optionalText(formData, "job_title"),

      optionalText(formData, "email"),
      optionalText(formData, "phone"),
      optionalText(formData, "telegram"),
      optionalText(formData, "linkedin_url"),

      preferredChannel,
      contactStatus,

      checkboxValue(
        formData,
        "is_decision_maker",
      ),

      checkboxValue(
        formData,
        "do_not_contact",
      ),

      optionalText(formData, "notes"),
    ],
  );

  const updatedContact = result.rows[0];

  if (!updatedContact) {
    throw new Error(
      "Контакт не найден.",
    );
  }

  revalidatePath("/contacts");
  revalidatePath(
    `/contacts/${contactId}`,
  );
  revalidatePath(
    `/companies/${updatedContact.company_id}`,
  );

  redirect(`/contacts/${contactId}`);
}
