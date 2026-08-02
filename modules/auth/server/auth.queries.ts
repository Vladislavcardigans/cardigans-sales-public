import "server-only";

import { getDb } from "@/lib/db";

import type {
  AuthenticatedUser,
} from "@/modules/auth/types/auth";

type AuthenticatedUserRow = {
  id: string;
  tenant_id: string;
  tenant_name: string;

  email: string;
  display_name: string;

  roles: string[];
};

export async function authenticateUser(
  email: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const normalizedEmail =
    email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return null;
  }

  const result =
    await getDb().query<AuthenticatedUserRow>(
      `
        SELECT
          users.id,
          users.tenant_id,

          tenants.display_name
            AS tenant_name,

          users.email,
          users.display_name,

          COALESCE(
            ARRAY_AGG(
              DISTINCT roles.role_code
            ) FILTER (
              WHERE roles.role_code
                IS NOT NULL
            ),
            ARRAY[]::VARCHAR[]
          ) AS roles

        FROM sales.users AS users

        INNER JOIN sales.tenants AS tenants
          ON tenants.id = users.tenant_id

        LEFT JOIN sales.user_roles
          ON user_roles.user_id = users.id

        LEFT JOIN sales.roles
          ON roles.id = user_roles.role_id

        WHERE LOWER(users.email) =
          LOWER($1)

          AND users.status = 'Active'
          AND tenants.status = 'Active'

          AND users.password_hash =
            crypt(
              $2,
              users.password_hash
            )

        GROUP BY
          users.id,
          users.tenant_id,
          tenants.display_name,
          users.email,
          users.display_name

        LIMIT 1
      `,
      [
        normalizedEmail,
        password,
      ],
    );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,

    email: row.email,
    displayName: row.display_name,

    roles: row.roles,
  };
}

export async function recordLogin(
  userId: string,
): Promise<void> {
  await getDb().query(
    `
      UPDATE sales.users
      SET
        last_login_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [userId],
  );
}
