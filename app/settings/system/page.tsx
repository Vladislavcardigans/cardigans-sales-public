import Link from "next/link";

import {
  AppLayout,
} from "@/components/layout/AppLayout";

import {
  requirePermission,
} from "@/modules/auth";

import {
  getSystemStatus,
} from "@/lib/repositories/system-status.repository";

export const dynamic = "force-dynamic";

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

export default async function SystemPage() {
  const session =
    await requirePermission("system.read");

  const status = await getSystemStatus(
    session.user.tenantId,
  );

  const databaseVersion =
    status.database.version
      .split(",")[0]
      ?.trim() ?? status.database.version;

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
          label: "Состояние системы",
        },
      ]}
    >
      <section className="systemPage">
        <header className="systemPageHeader">
          <div>
            <p className="eyebrow">
              Администрирование
            </p>

            <h1>Состояние системы</h1>

            <p>
              Основные показатели CRM,
              PostgreSQL и резервного копирования.
            </p>
          </div>

          <nav className="settingsNavigation">
            <Link href="/settings/users">
              Пользователи
            </Link>

            <Link
              href="/settings/system"
              className="settingsNavigationActive"
            >
              Система
            </Link>

            <Link href="/settings/audit">
              Аудит
            </Link>
          </nav>
        </header>

        <div className="systemHealthCard">
          <span className="systemHealthIndicator" />

          <div>
            <strong>Система работает</strong>

            <small>
              Последняя проверка:{" "}
              {formatDateTime(
                status.database.checkedAt,
              )}
            </small>
          </div>
        </div>

        <section className="systemMetricsGrid">
          <article>
            <span>Пользователи</span>
            <strong>{status.counts.users}</strong>
          </article>

          <article>
            <span>Компании</span>
            <strong>
              {status.counts.companies}
            </strong>
          </article>

          <article>
            <span>Контакты</span>
            <strong>
              {status.counts.contacts}
            </strong>
          </article>

          <article>
            <span>Сделки</span>
            <strong>{status.counts.deals}</strong>
          </article>

          <article>
            <span>Активности</span>
            <strong>
              {status.counts.activities}
            </strong>
          </article>

          <article>
            <span>Задачи</span>
            <strong>{status.counts.tasks}</strong>
          </article>
        </section>

        <div className="systemDetailsGrid">
          <article className="systemDetailCard">
            <header>
              <div>
                <p className="eyebrow">
                  База данных
                </p>
                <h2>PostgreSQL</h2>
              </div>

              <span className="systemStatusSuccess">
                Подключено
              </span>
            </header>

            <dl>
              <div>
                <dt>Версия</dt>
                <dd>{databaseVersion}</dd>
              </div>

              <div>
                <dt>Размер базы</dt>
                <dd>
                  {status.database.sizeFormatted}
                </dd>
              </div>

              <div>
                <dt>Проверено</dt>
                <dd>
                  {formatDateTime(
                    status.database.checkedAt,
                  )}
                </dd>
              </div>
            </dl>
          </article>

          <article className="systemDetailCard">
            <header>
              <div>
                <p className="eyebrow">
                  Резервное копирование
                </p>
                <h2>Последний backup</h2>
              </div>

              <span
                className={
                  status.backup
                    ? "systemStatusSuccess"
                    : "systemStatusWarning"
                }
              >
                {status.backup
                  ? "Успешно"
                  : "Нет данных"}
              </span>
            </header>

            {status.backup ? (
              <dl>
                <div>
                  <dt>Создан</dt>
                  <dd>
                    {formatDateTime(
                      status.backup.createdAt,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Размер</dt>
                  <dd>
                    {status.backup.sizeFormatted}
                  </dd>
                </div>

                <div>
                  <dt>Файл</dt>
                  <dd>
                    {status.backup.fileName}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="systemBackupEmpty">
                После следующего автоматического
                backup здесь появится информация.
              </p>
            )}
          </article>
        </div>
      </section>
    </AppLayout>
  );
}
