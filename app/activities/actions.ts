"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/lib/db";

import { requirePermission } from "@/modules/auth";

import {
  createActivity,
  isActivityPriority,
  isActivityStatus,
  isActivityType,
} from "@/lib/repositories/activity.repository";

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

export async function createActivityAction(
  formData: FormData,
): Promise<void> {
  await requirePermission("activity.create");

  const companyId = requiredText(
    formData,
    "company_id",
    "Компания",
  );

  const subject = requiredText(
    formData,
    "subject",
    "Тема активности",
  );

  const typeValue =
    String(
      formData.get("activity_type") ?? "Task",
    ).trim();

  const statusValue =
    String(
      formData.get("status") ?? "Planned",
    ).trim();

  const priorityValue =
    String(
      formData.get("priority") ?? "Normal",
    ).trim();

  await createActivity({
    companyId,

    contactId:
      optionalText(
        formData,
        "contact_id",
      ),

    dealId:
      optionalText(
        formData,
        "deal_id",
      ),

    activityType:
      isActivityType(typeValue)
        ? typeValue
        : "Task",

    subject,

    status:
      isActivityStatus(statusValue)
        ? statusValue
        : "Planned",

    priority:
      isActivityPriority(priorityValue)
        ? priorityValue
        : "Normal",

    scheduledAt:
      optionalText(
        formData,
        "scheduled_at",
      ),

    ownerName:
      optionalText(
        formData,
        "owner_name",
      ),

    description:
      optionalText(
        formData,
        "description",
      ),

    outcome:
      optionalText(
        formData,
        "outcome",
      ),
  });

  revalidatePath("/activities");
  revalidatePath(
    `/companies/${companyId}`,
  );
}

export async function completeActivityAction(
  activityId: string,
): Promise<void> {
  await requirePermission("activity.complete");

  const normalizedActivityId =
    activityId.trim();

  if (!normalizedActivityId) {
    throw new Error(
      "Не указан идентификатор активности.",
    );
  }

  const result = await getDb().query<{
    id: string;
    company_id: string;
  }>(
    `
      UPDATE sales.activities

      SET
        status = 'Completed',
        completed_at = COALESCE(
          completed_at,
          NOW()
        ),
        updated_at = NOW()

      WHERE id = $1
        AND status = 'Planned'

      RETURNING
        id,
        company_id
    `,
    [normalizedActivityId],
  );

  const activity = result.rows[0];

  revalidatePath("/activities");
  revalidatePath("/");

  if (activity?.company_id) {
    revalidatePath(
      `/companies/${activity.company_id}`,
    );
  }
}
