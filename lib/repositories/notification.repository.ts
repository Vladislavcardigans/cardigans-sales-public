import "server-only";

import { getDb } from "@/lib/db";

export type CrmNotification = {
  id: string;
  kind:
    | "overdue-task"
    | "today-task"
    | "today-activity";
  code: string;
  title: string;
  companyName: string;
  eventAt: string | null;
  href: string;
};

type NotificationPermissions = {
  tasks: boolean;
  activities: boolean;
};

export type NotificationSummary = {
  overdueTasks: CrmNotification[];
  todayTasks: CrmNotification[];
  todayActivities: CrmNotification[];
  total: number;
};

const sectionLimit = 6;

export async function getNotificationSummary(
  permissions: NotificationPermissions,
): Promise<NotificationSummary> {
  const [
    overdueTaskResult,
    todayTaskResult,
    todayActivityResult,
  ] = await Promise.all([
    permissions.tasks
      ? getDb().query<CrmNotification>(
          `
            SELECT
              task.id,
              'overdue-task'::TEXT AS kind,
              task.task_code AS code,
              task.title,
              company.display_name AS "companyName",
              task.due_at::TEXT AS "eventAt",
              '/tasks'::TEXT AS href

            FROM sales.tasks AS task

            INNER JOIN sales.companies AS company
              ON company.id = task.company_id

            WHERE task.deleted_at IS NULL
              AND task.status IN ('Todo', 'InProgress')
              AND task.due_at < NOW()

            ORDER BY task.due_at ASC
            LIMIT $1
          `,
          [sectionLimit],
        )
      : Promise.resolve({ rows: [] }),

    permissions.tasks
      ? getDb().query<CrmNotification>(
          `
            SELECT
              task.id,
              'today-task'::TEXT AS kind,
              task.task_code AS code,
              task.title,
              company.display_name AS "companyName",
              task.due_at::TEXT AS "eventAt",
              '/tasks'::TEXT AS href

            FROM sales.tasks AS task

            INNER JOIN sales.companies AS company
              ON company.id = task.company_id

            WHERE task.deleted_at IS NULL
              AND task.status IN ('Todo', 'InProgress')
              AND task.due_at >= CURRENT_DATE
              AND task.due_at < CURRENT_DATE + INTERVAL '1 day'

            ORDER BY task.due_at ASC
            LIMIT $1
          `,
          [sectionLimit],
        )
      : Promise.resolve({ rows: [] }),

    permissions.activities
      ? getDb().query<CrmNotification>(
          `
            SELECT
              activity.id,
              'today-activity'::TEXT AS kind,
              activity.activity_code AS code,
              activity.subject AS title,
              company.display_name AS "companyName",
              activity.scheduled_at::TEXT AS "eventAt",
              '/activities'::TEXT AS href

            FROM sales.activities AS activity

            INNER JOIN sales.companies AS company
              ON company.id = activity.company_id

            WHERE activity.deleted_at IS NULL
              AND activity.status = 'Planned'
              AND activity.scheduled_at >= CURRENT_DATE
              AND activity.scheduled_at <
                CURRENT_DATE + INTERVAL '1 day'

            ORDER BY activity.scheduled_at ASC
            LIMIT $1
          `,
          [sectionLimit],
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const overdueTasks = overdueTaskResult.rows;
  const todayTasks = todayTaskResult.rows;
  const todayActivities = todayActivityResult.rows;

  return {
    overdueTasks,
    todayTasks,
    todayActivities,
    total:
      overdueTasks.length +
      todayTasks.length +
      todayActivities.length,
  };
}
