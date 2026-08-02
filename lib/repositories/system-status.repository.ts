import "server-only";

import { getDb } from "@/lib/db";

export type SystemStatus = {
  database: {
    connected: boolean;
    version: string;
    sizeBytes: number;
    sizeFormatted: string;
    checkedAt: string;
  };

  counts: {
    users: number;
    companies: number;
    contacts: number;
    deals: number;
    activities: number;
    tasks: number;
  };

  backup: {
    fileName: string;
    sizeBytes: number;
    sizeFormatted: string;
    status: string;
    createdAt: string;
  } | null;
};

type StatusRow = {
  database_version: string;
  database_size_bytes: string;
  database_size_formatted: string;

  users_count: string;
  companies_count: string;
  contacts_count: string;
  deals_count: string;
  activities_count: string;
  tasks_count: string;

  checked_at: string;
};

type BackupRow = {
  backup_file: string;
  backup_size_bytes: string;
  backup_size_formatted: string;
  status: string;
  created_at: string;
};

export async function getSystemStatus(
  tenantId: string,
): Promise<SystemStatus> {
  const [statusResult, backupResult] =
    await Promise.all([
      getDb().query<StatusRow>(
        `
          SELECT
            VERSION() AS database_version,

            pg_database_size(
              current_database()
            )::TEXT AS database_size_bytes,

            pg_size_pretty(
              pg_database_size(
                current_database()
              )
            ) AS database_size_formatted,

            (
              SELECT COUNT(*)::TEXT
              FROM sales.users
              WHERE tenant_id = $1
            ) AS users_count,

            (
              SELECT COUNT(*)::TEXT
              FROM sales.companies
              WHERE tenant_id = $1
            ) AS companies_count,

            (
              SELECT COUNT(*)::TEXT
              FROM sales.contacts AS contact
              INNER JOIN sales.companies AS company
                ON company.id = contact.company_id
              WHERE company.tenant_id = $1
            ) AS contacts_count,

            (
              SELECT COUNT(*)::TEXT
              FROM sales.deals AS deal
              INNER JOIN sales.companies AS company
                ON company.id = deal.company_id
              WHERE company.tenant_id = $1
            ) AS deals_count,

            (
              SELECT COUNT(*)::TEXT
              FROM sales.activities AS activity
              INNER JOIN sales.companies AS company
                ON company.id = activity.company_id
              WHERE company.tenant_id = $1
                AND activity.deleted_at IS NULL
            ) AS activities_count,

            (
              SELECT COUNT(*)::TEXT
              FROM sales.tasks AS task
              INNER JOIN sales.companies AS company
                ON company.id = task.company_id
              WHERE company.tenant_id = $1
                AND task.deleted_at IS NULL
            ) AS tasks_count,

            NOW()::TEXT AS checked_at
        `,
        [tenantId],
      ),

      getDb().query<BackupRow>(
        `
          SELECT
            backup_file,
            backup_size_bytes::TEXT,

            pg_size_pretty(
              backup_size_bytes
            ) AS backup_size_formatted,

            status,
            created_at::TEXT

          FROM sales.system_backup_log

          WHERE status = 'Success'

          ORDER BY created_at DESC

          LIMIT 1
        `,
      ),
    ]);

  const row = statusResult.rows[0];

  if (!row) {
    throw new Error(
      "Не удалось получить состояние системы.",
    );
  }

  const backup = backupResult.rows[0];

  return {
    database: {
      connected: true,
      version: row.database_version,
      sizeBytes: Number(
        row.database_size_bytes,
      ),
      sizeFormatted:
        row.database_size_formatted,
      checkedAt: row.checked_at,
    },

    counts: {
      users: Number(row.users_count),
      companies: Number(
        row.companies_count,
      ),
      contacts: Number(
        row.contacts_count,
      ),
      deals: Number(row.deals_count),
      activities: Number(
        row.activities_count,
      ),
      tasks: Number(row.tasks_count),
    },

    backup: backup
      ? {
          fileName: backup.backup_file,
          sizeBytes: Number(
            backup.backup_size_bytes,
          ),
          sizeFormatted:
            backup.backup_size_formatted,
          status: backup.status,
          createdAt: backup.created_at,
        }
      : null,
  };
}
