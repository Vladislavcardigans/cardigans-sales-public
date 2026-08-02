import Link from "next/link";

import {
  AppLayout,
} from "@/components/layout/AppLayout";

import {
  requirePermission,
} from "@/modules/auth";

import {
  listAuditLog,
  type AuditAction,
  type AuditEntityType,
} from "@/lib/repositories/audit.repository";

export const dynamic = "force-dynamic";

const actionNames: Record<
  AuditAction,
  string
> = {
  create: "Создание",
  update: "Изменение",
  complete: "Завершение",
  move: "Перемещение",
  delete: "Удаление",
  restore: "Восстановление",
  login: "Вход",
  role_change: "Смена роли",
  status_change: "Смена статуса",
  password_reset: "Сброс пароля",
};

const entityNames: Record<
  AuditEntityType,
  string
> = {
  company: "Компания",
  contact: "Контакт",
  deal: "Сделка",
  activity: "Активность",
  task: "Задача",
  user: "Пользователь",
  session: "Сессия",
};

function formatDateTime(
  value: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Неизвестно";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      dateStyle: "medium",
      timeStyle: "medium",
    },
  ).format(date);
}

function formatDetails(
  details: Record<string, unknown>,
): string {
  const entries = Object.entries(details);

  if (entries.length === 0) {
    return "Без дополнительных данных";
  }

  return entries
    .map(([key, value]) => {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return `${key}: ${String(value)}`;
      }

      return `${key}: ${JSON.stringify(value)}`;
    })
    .join(" · ");
}

export default async function AuditPage() {
  const session =
    await requirePermission("audit.read");

  const entries = await listAuditLog(
    session.user.tenantId,
    100,
  );

  return (
    <AppLayout
      activeSection="settings"
      breadcrumbs={[
        {
          label: "Sales OS",
          href: "/",
        },
        {
          label: "Настройки",
          href: "/settings/users",
        },
        {
          label: "Журнал аудита",
        },
      ]}
    >
      <section className="auditPage">
        <header className="auditPageHeader">
          <div>
            <p className="eyebrow">
              Администрирование
            </p>

            <h1>Журнал аудита</h1>

            <p>
              Последние действия пользователей
              в задачах и активностях.
            </p>
          </div>

          <nav className="settingsNavigation">
            <Link href="/settings/users">
              Пользователи
            </Link>

            <Link href="/settings/system">
              Система
            </Link>

            <Link
              href="/settings/audit"
              className="settingsNavigationActive"
            >
              Аудит
            </Link>
          </nav>
        </header>

        {entries.length === 0 ? (
          <div className="auditEmpty">
            Событий пока нет.
          </div>
        ) : (
          <div className="auditList">
            {entries.map((entry) => (
              <article
                className="auditCard"
                key={entry.id}
              >
                <div
                  className={
                    `auditAction auditAction-${entry.action}`
                  }
                >
                  {actionNames[entry.action]}
                </div>

                <div className="auditContent">
                  <div className="auditTitleRow">
                    <strong>
                      {entityNames[
                        entry.entity_type
                      ]}
                    </strong>

                    {entry.entity_code && (
                      <span>
                        {entry.entity_code}
                      </span>
                    )}
                  </div>

                  <h2>
                    {entry.entity_title ??
                      "Без названия"}
                  </h2>

                  <p className="auditActor">
                    {entry.user_display_name ??
                      "Системное действие"}

                    {entry.user_email && (
                      <>
                        {" · "}
                        {entry.user_email}
                      </>
                    )}
                  </p>

                  <p className="auditDetails">
                    {formatDetails(
                      entry.details,
                    )}
                  </p>
                </div>

                <time className="auditTime">
                  {formatDateTime(
                    entry.created_at,
                  )}
                </time>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppLayout>
  );
}
