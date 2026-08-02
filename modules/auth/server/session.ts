import "server-only";

import {
  createHash,
  randomBytes,
} from "node:crypto";

import { cookies } from "next/headers";

import { getDb } from "@/lib/db";

import type {
  AuthSession,
} from "@/modules/auth/types/auth";

import {
  SESSION_COOKIE_NAME,
} from "@/modules/auth/server/session.constants";


const SESSION_DURATION_MS =
  7 * 24 * 60 * 60 * 1000;

function hashToken(
  token: string,
): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function createToken(): string {
  return randomBytes(32)
    .toString("base64url");
}

function cookieOptions(
  expiresAt: Date,
) {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export async function createSession(
  userId: string,
  tenantId: string,
): Promise<void> {
  const token = createToken();
  const tokenHash = hashToken(token);

  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_MS,
  );

  await getDb().query(
    `
      DELETE FROM sales.sessions
      WHERE
        expires_at <= NOW()
        OR revoked_at IS NOT NULL
    `,
  );

  await getDb().query(
    `
      INSERT INTO sales.sessions (
        tenant_id,
        user_id,
        token_hash,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4
      )
    `,
    [
      tenantId,
      userId,
      tokenHash,
      expiresAt,
    ],
  );

  const cookieStore =
    await cookies();

  cookieStore.set(
    SESSION_COOKIE_NAME,
    token,
    cookieOptions(expiresAt),
  );
}

type SessionRow = {
  session_id: string;
  expires_at: Date;

  user_id: string;
  tenant_id: string;
  tenant_name: string;

  email: string;
  display_name: string;

  roles: string[];
};

export async function getCurrentSession():
Promise<AuthSession | null> {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      SESSION_COOKIE_NAME,
    )?.value;

  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);

  const result =
    await getDb().query<SessionRow>(
      `
        SELECT
          sessions.id AS session_id,
          sessions.expires_at,

          users.id AS user_id,
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

        FROM sales.sessions AS sessions

        INNER JOIN sales.users AS users
          ON users.id = sessions.user_id

        INNER JOIN sales.tenants AS tenants
          ON tenants.id = sessions.tenant_id

        LEFT JOIN sales.user_roles
          ON user_roles.user_id = users.id

        LEFT JOIN sales.roles
          ON roles.id = user_roles.role_id

        WHERE sessions.token_hash = $1
          AND sessions.revoked_at IS NULL
          AND sessions.expires_at > NOW()

          AND users.status = 'Active'
          AND tenants.status = 'Active'

          AND users.tenant_id =
            sessions.tenant_id

        GROUP BY
          sessions.id,
          sessions.expires_at,
          users.id,
          users.tenant_id,
          tenants.display_name,
          users.email,
          users.display_name

        LIMIT 1
      `,
      [tokenHash],
    );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  await getDb().query(
    `
      UPDATE sales.sessions
      SET last_seen_at = NOW()
      WHERE id = $1
    `,
    [row.session_id],
  );

  return {
    id: row.session_id,
    expiresAt:
      new Date(row.expires_at),

    user: {
      id: row.user_id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,

      email: row.email,
      displayName:
        row.display_name,

      roles: row.roles,
    },
  };
}

export async function deleteCurrentSession():
Promise<void> {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      SESSION_COOKIE_NAME,
    )?.value;

  if (token) {
    await getDb().query(
      `
        UPDATE sales.sessions
        SET revoked_at = NOW()
        WHERE token_hash = $1
          AND revoked_at IS NULL
      `,
      [hashToken(token)],
    );
  }

  cookieStore.set(
    SESSION_COOKIE_NAME,
    "",
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    },
  );
}
