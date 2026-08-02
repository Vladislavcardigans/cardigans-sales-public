import "server-only";

import type {
  PoolClient,
} from "pg";

import { getDb } from "@/lib/db";

export const userStatuses = [
  "Active",
  "Disabled",
  "Invited",
] as const;

export type UserStatus =
  (typeof userStatuses)[number];

export const managedRoleCodes = [
  "Admin",
  "Manager",
  "Viewer",
] as const;

export type ManagedRoleCode =
  (typeof managedRoleCodes)[number];

export type ManagedUser = {
  id: string;
  email: string;
  display_name: string;
  status: UserStatus;
  roles: ManagedRoleCode[];
  last_login_at: string | null;
  created_at: string;
};

export type RoleOption = {
  id: string;
  role_code: ManagedRoleCode;
  display_name: string;
};

export type CreateManagedUserInput = {
  tenantId: string;
  email: string;
  displayName: string;
  password: string;
  roleCode: ManagedRoleCode;
  assignedBy: string;
};

function isManagedRoleCode(
  value: string,
): value is ManagedRoleCode {
  return managedRoleCodes.includes(
    value as ManagedRoleCode,
  );
}

async function ensureNotLastActiveAdmin(
  client: PoolClient,
  tenantId: string,
  userId: string,
): Promise<void> {
  const targetResult = await client.query<{
    is_active_admin: boolean;
  }>(
    `
      SELECT EXISTS (
        SELECT 1

        FROM sales.users AS users

        INNER JOIN sales.user_roles
          ON user_roles.user_id = users.id

        INNER JOIN sales.roles
          ON roles.id = user_roles.role_id

        WHERE users.id = $1
          AND users.tenant_id = $2
          AND users.status = 'Active'
          AND roles.role_code = 'Admin'
      ) AS is_active_admin
    `,
    [userId, tenantId],
  );

  if (!targetResult.rows[0]?.is_active_admin) {
    return;
  }

  const otherAdminsResult =
    await client.query<{
      total: string;
    }>(
      `
        SELECT COUNT(
          DISTINCT users.id
        )::TEXT AS total

        FROM sales.users AS users

        INNER JOIN sales.user_roles
          ON user_roles.user_id = users.id

        INNER JOIN sales.roles
          ON roles.id = user_roles.role_id

        WHERE users.tenant_id = $1
          AND users.id <> $2
          AND users.status = 'Active'
          AND roles.role_code = 'Admin'
      `,
      [tenantId, userId],
    );

  const otherAdmins = Number(
    otherAdminsResult.rows[0]?.total ?? 0,
  );

  if (otherAdmins === 0) {
    throw new Error(
      "Нельзя отключить или понизить роль " +
        "последнего активного администратора.",
    );
  }
}

async function getRoleId(
  client: PoolClient,
  roleCode: ManagedRoleCode,
): Promise<string> {
  const result = await client.query<{
    id: string;
  }>(
    `
      SELECT id
      FROM sales.roles
      WHERE role_code = $1
      LIMIT 1
    `,
    [roleCode],
  );

  const role = result.rows[0];

  if (!role) {
    throw new Error(
      `Роль ${roleCode} не найдена.`,
    );
  }

  return role.id;
}

export async function listManagedUsers(
  tenantId: string,
): Promise<ManagedUser[]> {
  const result = await getDb().query<ManagedUser>(
    `
      SELECT
        users.id,
        users.email,
        users.display_name,
        users.status,
        users.last_login_at::TEXT,
        users.created_at::TEXT,

        COALESCE(
          ARRAY_AGG(
            DISTINCT roles.role_code
            ORDER BY roles.role_code
          ) FILTER (
            WHERE roles.role_code IS NOT NULL
          ),
          ARRAY[]::VARCHAR[]
        ) AS roles

      FROM sales.users AS users

      LEFT JOIN sales.user_roles
        ON user_roles.user_id = users.id

      LEFT JOIN sales.roles
        ON roles.id = user_roles.role_id

      WHERE users.tenant_id = $1

      GROUP BY users.id

      ORDER BY
        CASE users.status
          WHEN 'Active' THEN 1
          WHEN 'Invited' THEN 2
          ELSE 3
        END,
        LOWER(users.display_name)
    `,
    [tenantId],
  );

  return result.rows;
}

export async function listRoleOptions():
Promise<RoleOption[]> {
  const result = await getDb().query<RoleOption>(
    `
      SELECT
        id,
        role_code,
        display_name
      FROM sales.roles
      WHERE role_code = ANY($1::VARCHAR[])
      ORDER BY
        CASE role_code
          WHEN 'Admin' THEN 1
          WHEN 'Manager' THEN 2
          WHEN 'Viewer' THEN 3
          ELSE 4
        END
    `,
    [managedRoleCodes],
  );

  return result.rows.filter(
    (role) => isManagedRoleCode(role.role_code),
  );
}

export async function createManagedUser(
  input: CreateManagedUserInput,
): Promise<string> {
  const email =
    input.email.trim().toLowerCase();

  const displayName =
    input.displayName.trim();

  if (!email || !displayName) {
    throw new Error(
      "Имя и email обязательны.",
    );
  }

  if (input.password.length < 8) {
    throw new Error(
      "Пароль должен содержать минимум 8 символов.",
    );
  }

  const pool = getDb();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const roleId = await getRoleId(
      client,
      input.roleCode,
    );

    const userResult = await client.query<{
      id: string;
    }>(
      `
        INSERT INTO sales.users (
          tenant_id,
          email,
          display_name,
          password_hash,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          crypt($4, gen_salt('bf', 12)),
          'Active'
        )
        RETURNING id
      `,
      [
        input.tenantId,
        email,
        displayName,
        input.password,
      ],
    );

    const userId = userResult.rows[0]?.id;

    if (!userId) {
      throw new Error(
        "Не удалось создать пользователя.",
      );
    }

    await client.query(
      `
        INSERT INTO sales.user_roles (
          user_id,
          role_id,
          assigned_by
        )
        VALUES ($1, $2, $3)
      `,
      [
        userId,
        roleId,
        input.assignedBy,
      ],
    );

    await client.query("COMMIT");

    return userId;
  } catch (error) {
    await client.query("ROLLBACK");

    if (
      error instanceof Error &&
      error.message.includes(
        "users_tenant_email_unique_idx",
      )
    ) {
      throw new Error(
        "Пользователь с таким email уже существует.",
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function updateManagedUserRole(
  tenantId: string,
  userId: string,
  roleCode: ManagedRoleCode,
  assignedBy: string,
): Promise<void> {
  const pool = getDb();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const roleId = await getRoleId(
      client,
      roleCode,
    );

    if (roleCode !== "Admin") {
      await ensureNotLastActiveAdmin(
        client,
        tenantId,
        userId,
      );
    }

    const userResult = await client.query(
      `
        SELECT id
        FROM sales.users
        WHERE id = $1
          AND tenant_id = $2
        LIMIT 1
      `,
      [userId, tenantId],
    );

    if (!userResult.rows[0]) {
      throw new Error(
        "Пользователь не найден.",
      );
    }

    await client.query(
      `
        DELETE FROM sales.user_roles
        WHERE user_id = $1
      `,
      [userId],
    );

    await client.query(
      `
        INSERT INTO sales.user_roles (
          user_id,
          role_id,
          assigned_by
        )
        VALUES ($1, $2, $3)
      `,
      [
        userId,
        roleId,
        assignedBy,
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setManagedUserStatus(
  tenantId: string,
  userId: string,
  status: Extract<
    UserStatus,
    "Active" | "Disabled"
  >,
): Promise<void> {
  const pool = getDb();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (status === "Disabled") {
      await ensureNotLastActiveAdmin(
        client,
        tenantId,
        userId,
      );
    }

    const result = await client.query(
      `
        UPDATE sales.users

        SET
          status = $3,
          updated_at = NOW()

        WHERE id = $1
          AND tenant_id = $2

        RETURNING id
      `,
      [
        userId,
        tenantId,
        status,
      ],
    );

    if (!result.rows[0]) {
      throw new Error(
        "Пользователь не найден.",
      );
    }

    if (status === "Disabled") {
      await client.query(
        `
          UPDATE sales.sessions

          SET revoked_at = NOW()

          WHERE user_id = $1
            AND revoked_at IS NULL
        `,
        [userId],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resetManagedUserPassword(
  tenantId: string,
  userId: string,
  password: string,
): Promise<void> {
  if (password.length < 8) {
    throw new Error(
      "Пароль должен содержать минимум 8 символов.",
    );
  }

  const result = await getDb().query(
    `
      UPDATE sales.users
      SET
        password_hash =
          crypt($3, gen_salt('bf', 12)),
        updated_at = NOW()
      WHERE id = $1
        AND tenant_id = $2
      RETURNING id
    `,
    [
      userId,
      tenantId,
      password,
    ],
  );

  if (!result.rows[0]) {
    throw new Error(
      "Пользователь не найден.",
    );
  }

  await getDb().query(
    `
      UPDATE sales.sessions
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId],
  );
}
