"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  requirePermission,
} from "@/modules/auth";

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

export async function createUserAction(
  formData: FormData,
): Promise<void> {
  const session =
    await requirePermission("user.manage");

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

  revalidatePath("/settings/users");
}
