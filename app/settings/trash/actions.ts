"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  requirePermission,
} from "@/modules/auth";

import {
  createAuditEvent,
} from "@/lib/repositories/audit.repository";

import {
  restoreTrashItem,
  type TrashEntityType,
} from "@/lib/repositories/trash.repository";

function parseEntityType(
  value: string,
): TrashEntityType {
  if (
    value !== "task" &&
    value !== "activity"
  ) {
    throw new Error(
      "Неизвестный тип записи.",
    );
  }

  return value;
}

export async function restoreTrashItemAction(
  entityTypeValue: string,
  entityId: string,
): Promise<void> {
  const session =
    await requirePermission("trash.manage");

  const entityType =
    parseEntityType(entityTypeValue);

  const restoredItem =
    await restoreTrashItem(
      session.user.tenantId,
      entityType,
      entityId,
    );

  await createAuditEvent({
    tenantId: session.user.tenantId,
    userId: session.user.id,

    action: "restore",
    entityType,
    entityId: restoredItem.id,

    entityCode: restoredItem.code,
    entityTitle: restoredItem.title,

    details: {
      companyId: restoredItem.company_id,
      companyName: restoredItem.company_name,
    },
  });

  revalidatePath("/settings/trash");
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/activities");
  revalidatePath(
    `/companies/${restoredItem.company_id}`,
  );
}
