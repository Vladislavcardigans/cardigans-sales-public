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

import { getDb } from "@/lib/db";

import {
  createManagedUser,
  managedRoleCodes,
  resetManagedUserPassword,
  setManagedUserStatus,
  updateManagedUserRole,
  type ManagedRoleCode,
} from "@/lib/repositories/user.repository";

function requiredText(
  formData: FormData,
  field: string,
  label: string,
): string {
  const value = String(
    formData.get(field) ?? "",
  ).trim();

  if (!value) {
    throw new Error(
      `Поле «${label}» обязательно.`,
    );
  }

  return value;
}

function parseRoleCode(
  value: string,
): ManagedRoleCode {
  if (
    !managedRoleCodes.includes(
      value as ManagedRoleCode,
    )
  ) {
    throw new Error(
      "Указана неизвестная роль.",
    );
  }

  return value as ManagedRoleCode;
}

async function getUserAuditIdentity(
  tenantId: string,
  userId: string,
): Promise<{
  email: string | null;
  display_name: string | null;
  status: string | null;
  role_code: string | null;
}> {
  const result = await getDb().query<{
    email: string | null;
    display_name: string | null;
    status: string | null;
    role_code: string | null;
  }>(
    `
      SELECT
        users.email,
        users.display_name,
        users.status,
        roles.role_code

      FROM sales.users AS users

      LEFT JOIN sales.user_roles
        ON user_roles.user_id = users.id

      LEFT JOIN sales.roles
        ON roles.id = user_roles.role_id

      WHERE users.id = $1
        AND users.tenant_id = $2

      ORDER BY roles.role_code
      LIMIT 1
    `,
    [userId, tenantId],
  );

  return result.rows[0] ?? {
    email: null,
    display_name: null,
    status: null,
    role_code: null,
  };
}

export async function createUserAction(
  formData: FormData,
): Promise<void> {
  const session =
    await requirePermission("user.manage");

  const userId =
    await createManagedUser({
    tenantId: session.user.tenantId,
    assignedBy: session.user.id,

    displayName: requiredText(
      formData,
      "display_name",
      "Имя",
    ),

    email: requiredText(
      formData,
      "email",
      "Email",
    ),

    password: requiredText(
      formData,
      "password",
      "Пароль",
    ),

    roleCode: parseRoleCode(
      requiredText(
        formData,
        "role_code",
        "Роль",
      ),
    ),
  });

  const createdUser =
    await getUserAuditIdentity(
      session.user.tenantId,
      userId,
    );

  await createAuditEvent({
    tenantId: session.user.tenantId,
    userId: session.user.id,

    action: "create",
    entityType: "user",
    entityId: userId,

    entityCode: createdUser.email,
    entityTitle: createdUser.display_name,

    details: {
      roleCode: createdUser.role_code,
      status: createdUser.status,
    },
  });

  revalidatePath("/settings/users");
}

export async function updateUserRoleAction(
  userId: string,
  formData: FormData,
): Promise<void> {
  const session =
    await requirePermission("user.manage");

  await updateManagedUserRole(
    session.user.tenantId,
    userId,
    parseRoleCode(
      requiredText(
        formData,
        "role_code",
        "Роль",
      ),
    ),
    session.user.id,
  );

  const updatedUser =
    await getUserAuditIdentity(
      session.user.tenantId,
      userId,
    );

  await createAuditEvent({
    tenantId: session.user.tenantId,
    userId: session.user.id,

    action: "role_change",
    entityType: "user",
    entityId: userId,

    entityCode: updatedUser.email,
    entityTitle: updatedUser.display_name,

    details: {
      roleCode: updatedUser.role_code,
    },
  });

  revalidatePath("/settings/users");
}

export async function toggleUserStatusAction(
  userId: string,
  nextStatus: "Active" | "Disabled",
): Promise<void> {
  const session =
    await requirePermission("user.manage");

  if (
    userId === session.user.id &&
    nextStatus === "Disabled"
  ) {
    throw new Error(
      "Нельзя отключить собственную учётную запись.",
    );
  }

  await setManagedUserStatus(
    session.user.tenantId,
    userId,
    nextStatus,
  );

  const updatedUser =
    await getUserAuditIdentity(
      session.user.tenantId,
      userId,
    );

  await createAuditEvent({
    tenantId: session.user.tenantId,
    userId: session.user.id,

    action: "status_change",
    entityType: "user",
    entityId: userId,

    entityCode: updatedUser.email,
    entityTitle: updatedUser.display_name,

    details: {
      status: updatedUser.status,
    },
  });

  revalidatePath("/settings/users");
}

export async function resetUserPasswordAction(
  userId: string,
  formData: FormData,
): Promise<void> {
  const session =
    await requirePermission("user.manage");

  await resetManagedUserPassword(
    session.user.tenantId,
    userId,
    requiredText(
      formData,
      "password",
      "Новый пароль",
    ),
  );

  const updatedUser =
    await getUserAuditIdentity(
      session.user.tenantId,
      userId,
    );

  await createAuditEvent({
    tenantId: session.user.tenantId,
    userId: session.user.id,

    action: "password_reset",
    entityType: "user",
    entityId: userId,

    entityCode: updatedUser.email,
    entityTitle: updatedUser.display_name,

    details: {
      sessionsRevoked: true,
    },
  });

  revalidatePath("/settings/users");
}
