import "server-only";

import { getDb } from "@/lib/db";

import {
  getCurrentSession,
} from "@/modules/auth/server/session";

export const permissionCodes = [
  "dashboard.read",

  "company.read",
  "company.create",
  "company.update",

  "contact.read",
  "contact.create",
  "contact.update",

  "deal.read",
  "deal.create",
  "deal.update",
  "deal.move",

  "activity.read",
  "activity.create",
  "activity.complete",
  "activity.update",
  "activity.delete",

  "task.read",
  "task.create",
  "task.complete",

  "analytics.read",

  "settings.read",
  "settings.manage",

  "user.manage",
] as const;

export type PermissionCode =
  (typeof permissionCodes)[number];

export async function listUserPermissions(
  userId: string,
): Promise<PermissionCode[]> {
  const result = await getDb().query<{
    permission_code: PermissionCode;
  }>(
    `
      SELECT DISTINCT
        permissions.permission_code

      FROM sales.user_roles

      INNER JOIN sales.role_permissions
        ON role_permissions.role_id =
          user_roles.role_id

      INNER JOIN sales.permissions
        ON permissions.id =
          role_permissions.permission_id

      WHERE user_roles.user_id = $1

      ORDER BY permissions.permission_code
    `,
    [userId],
  );

  return result.rows.map(
    (row) => row.permission_code,
  );
}

export async function hasPermission(
  permissionCode: PermissionCode,
): Promise<boolean> {
  const session =
    await getCurrentSession();

  if (!session) {
    return false;
  }

  const result = await getDb().query<{
    allowed: boolean;
  }>(
    `
      SELECT EXISTS (
        SELECT 1

        FROM sales.user_roles

        INNER JOIN sales.role_permissions
          ON role_permissions.role_id =
            user_roles.role_id

        INNER JOIN sales.permissions
          ON permissions.id =
            role_permissions.permission_id

        WHERE user_roles.user_id = $1
          AND permissions.permission_code = $2
      ) AS allowed
    `,
    [
      session.user.id,
      permissionCode,
    ],
  );

  return result.rows[0]?.allowed ?? false;
}

export async function requirePermission(
  permissionCode: PermissionCode,
) {
  const session =
    await getCurrentSession();

  if (!session) {
    throw new Error(
      "Для выполнения действия требуется авторизация.",
    );
  }

  const allowed =
    await hasPermission(permissionCode);

  if (!allowed) {
    throw new Error(
      `Недостаточно прав: ${permissionCode}`,
    );
  }

  return session;
}

export async function hasRole(
  roleCode: string,
): Promise<boolean> {
  const session =
    await getCurrentSession();

  if (!session) {
    return false;
  }

  return session.user.roles.includes(
    roleCode,
  );
}
