"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";

import {
  createAuditEvent,
} from "@/lib/repositories/audit.repository";

import { requirePermission } from "@/modules/auth";

import {
  createActivity,
  deleteActivity,
  isActivityPriority,
  isActivityStatus,
  isActivityType,
  updateActivity,
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

async function getActivityAuditIdentity(
  activityId: string,
): Promise<{
  activity_code: string | null;
  subject: string | null;
  company_id: string | null;
}> {
  const result = await getDb().query<{
    activity_code: string | null;
    subject: string | null;
    company_id: string | null;
  }>(
    `
      SELECT
        activity_code,
        subject,
        company_id

      FROM sales.activities

      WHERE id = $1

      LIMIT 1
    `,
    [activityId],
  );

  return result.rows[0] ?? {
    activity_code: null,
    subject: null,
    company_id: null,
  };
}

export async function createActivityAction(
  formData: FormData,
): Promise<void> {
  const session =
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

  const activity = await createActivity({
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

  await createAuditEvent({
    tenantId: session.user.tenantId,
    userId: session.user.id,

    action: "create",
    entityType: "activity",
    entityId: activity.id,

    entityCode: activity.activity_code,
    entityTitle: activity.subject,

    details: {
      companyId: activity.company_id,
      status: activity.status,
      priority: activity.priority,
      activityType: activity.activity_type,
    },
  });

  revalidatePath("/activities");
  revalidatePath(
    `/companies/${companyId}`,
  );
}

export async function completeActivityAction(
  activityId: string,
): Promise<void> {
  const session =
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

  const auditIdentity =
    await getActivityAuditIdentity(
      activity.id,
    );

  await createAuditEvent({
    tenantId: session.user.tenantId,
    userId: session.user.id,

    action: "complete",
    entityType: "activity",
    entityId: activity.id,

    entityCode:
      auditIdentity.activity_code,
    entityTitle: auditIdentity.subject,

    details: {
      companyId:
        auditIdentity.company_id,
      status: "Completed",
    },
  });

  revalidatePath("/activities");
  revalidatePath("/");

  if (activity?.company_id) {
    revalidatePath(
      `/companies/${activity.company_id}`,
    );
  }
}

export async function updateActivityAction(
  activityId: string,
  formData: FormData,
): Promise<void> {
  const session =
    await requirePermission("activity.update");

  const normalizedActivityId =
    activityId.trim();

  if (!normalizedActivityId) {
    throw new Error(
      "Не указан идентификатор активности.",
    );
  }

  const companyId = requiredText(
    formData,
    "company_id",
    "Компания",
  );

  const activityTypeValue = requiredText(
    formData,
    "activity_type",
    "Тип активности",
  );

  if (!isActivityType(activityTypeValue)) {
    throw new Error(
      "Указан неизвестный тип активности.",
    );
  }

  const subject = requiredText(
    formData,
    "subject",
    "Тема активности",
  );

  const statusValue = requiredText(
    formData,
    "status",
    "Статус",
  );

  if (!isActivityStatus(statusValue)) {
    throw new Error(
      "Указан неизвестный статус активности.",
    );
  }

  const priorityValue = requiredText(
    formData,
    "priority",
    "Приоритет",
  );

  if (!isActivityPriority(priorityValue)) {
    throw new Error(
      "Указан неизвестный приоритет.",
    );
  }

  const contactId = optionalText(
    formData,
    "contact_id",
  );

  const dealId = optionalText(
    formData,
    "deal_id",
  );

  const scheduledAt = optionalText(
    formData,
    "scheduled_at",
  );

  const ownerName = optionalText(
    formData,
    "owner_name",
  );

  const description = optionalText(
    formData,
    "description",
  );

  const outcome = optionalText(
    formData,
    "outcome",
  );

  const activity = await updateActivity(
    normalizedActivityId,
    {
      companyId,
      contactId,
      dealId,
      activityType: activityTypeValue,
      subject,
      status: statusValue,
      priority: priorityValue,
      scheduledAt,
      ownerName,
      description,
      outcome,
    },
  );

  const auditIdentity =
    await getActivityAuditIdentity(
      activity.id,
    );

  await createAuditEvent({
    tenantId: session.user.tenantId,
    userId: session.user.id,

    action: "update",
    entityType: "activity",
    entityId: activity.id,

    entityCode:
      auditIdentity.activity_code,
    entityTitle: auditIdentity.subject,

    details: {
      companyId:
        auditIdentity.company_id,
    },
  });

  revalidatePath("/activities");
  revalidatePath(
    `/companies/${activity.company_id}`,
  );
  revalidatePath(
    `/activities/${activity.id}/edit`,
  );

  redirect("/activities");
}

export async function deleteActivityAction(
  activityId: string,
): Promise<void> {
  const session =
    await requirePermission("activity.delete");

  const deletedActivity =
    await deleteActivity(activityId);

  const auditIdentity =
    await getActivityAuditIdentity(
      deletedActivity.id,
    );

  await createAuditEvent({
    tenantId: session.user.tenantId,
    userId: session.user.id,

    action: "delete",
    entityType: "activity",
    entityId: deletedActivity.id,

    entityCode:
      auditIdentity.activity_code,
    entityTitle: auditIdentity.subject,

    details: {
      companyId:
        deletedActivity.company_id,
      softDelete: true,
    },
  });

  revalidatePath("/activities");
  revalidatePath("/");
  revalidatePath(
    `/companies/${deletedActivity.company_id}`,
  );

  redirect("/activities");
}
