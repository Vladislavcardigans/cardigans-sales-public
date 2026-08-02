import "server-only";

import { getDb } from "@/lib/db";

export const auditActions = [
  "create",
  "update",
  "complete",
  "move",
  "delete",
  "restore",
  "login",
  "role_change",
  "status_change",
  "password_reset",
] as const;

export type AuditAction =
  (typeof auditActions)[number];

export type AuditEntityType =
  | "company"
  | "contact"
  | "deal"
  | "activity"
  | "task"
  | "user"
  | "session";

export type CreateAuditEventInput = {
  tenantId: string;
  userId: string | null;

  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;

  entityCode?: string | null;
  entityTitle?: string | null;

  details?: Record<
    string,
    unknown
  >;
};

export type AuditLogEntry = {
  id: string;

  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id: string | null;

  entity_code: string | null;
  entity_title: string | null;

  details: Record<
    string,
    unknown
  >;

  created_at: string;

  user_id: string | null;
  user_display_name: string | null;
  user_email: string | null;
};

export async function createAuditEvent(
  input: CreateAuditEventInput,
): Promise<void> {
  await getDb().query(
    `
      INSERT INTO sales.audit_log (
        tenant_id,
        user_id,

        action,
        entity_type,
        entity_id,

        entity_code,
        entity_title,

        details
      )
      VALUES (
        $1,
        $2,

        $3,
        $4,
        $5,

        $6,
        $7,

        $8::JSONB
      )
    `,
    [
      input.tenantId,
      input.userId,

      input.action,
      input.entityType,
      input.entityId ?? null,

      input.entityCode ?? null,
      input.entityTitle ?? null,

      JSON.stringify(
        input.details ?? {},
      ),
    ],
  );
}

export async function listAuditLog(
  tenantId: string,
  limit = 100,
): Promise<AuditLogEntry[]> {
  const normalizedLimit = Math.min(
    Math.max(limit, 1),
    500,
  );

  const result =
    await getDb().query<AuditLogEntry>(
      `
        SELECT
          audit.id,

          audit.action,
          audit.entity_type,
          audit.entity_id,

          audit.entity_code,
          audit.entity_title,

          audit.details,
          audit.created_at::TEXT,

          users.id AS user_id,
          users.display_name
            AS user_display_name,
          users.email AS user_email

        FROM sales.audit_log AS audit

        LEFT JOIN sales.users AS users
          ON users.id = audit.user_id

        WHERE audit.tenant_id = $1

        ORDER BY audit.created_at DESC

        LIMIT $2
      `,
      [
        tenantId,
        normalizedLimit,
      ],
    );

  return result.rows;
}
