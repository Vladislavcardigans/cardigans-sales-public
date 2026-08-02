import Link from "next/link";

import {
  NotificationBell,
} from "@/components/notifications/NotificationBell";

import {
  getNotificationSummary,
} from "@/lib/repositories/notification.repository";
import { redirect } from "next/navigation";

import type {
  ReactNode,
} from "react";

import {
  SalesSidebar,
} from "@/components/layout/SalesSidebar";

import {
  DatabaseStatus,
} from "@/components/ui/DatabaseStatus";

import {
  hasPermission,
  getCurrentSession,
} from "@/modules/auth";

import type {
  SalesNavigationItem,
} from "@/lib/navigation";

export type AppBreadcrumb = {
  label: string;
  href?: string;
};

type AppLayoutProps = {
  activeSection:
    SalesNavigationItem["section"];

  breadcrumbs: AppBreadcrumb[];

  children: ReactNode;

  topbarRight?: ReactNode;
};

export async function AppLayout({
  activeSection,
  breadcrumbs,
  children,
  topbarRight,
}: AppLayoutProps) {
  const session =
    await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  const [
    canReadTasks,
    canReadActivities,
    canManageUsers,
    canReadSystem,
    canReadAudit,
    canManageTrash,
  ] = await Promise.all([
    hasPermission("task.read"),
    hasPermission("activity.read"),
    hasPermission("user.manage"),
    hasPermission("system.read"),
    hasPermission("audit.read"),
    hasPermission("trash.manage"),
  ]);

  const showSettings =
    canManageUsers ||
    canReadSystem ||
    canReadAudit ||
    canManageTrash;

  const notificationSummary =
    await getNotificationSummary({
      tasks: canReadTasks,
      activities: canReadActivities,
    });


  return (
    <div className="appShell">
      <SalesSidebar
        activeSection={activeSection}
        showSettings={showSettings}
      />

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            {breadcrumbs.map(
              (breadcrumb, index) => (
                <span
                  className="breadcrumbGroup"
                  key={
                    `${breadcrumb.label}-${index}`
                  }
                >
                  {index > 0 && (
                    <strong>/</strong>
                  )}

                  {breadcrumb.href ? (
                    <Link
                      href={breadcrumb.href}
                    >
                      {breadcrumb.label}
                    </Link>
                  ) : (
                    <span>
                      {breadcrumb.label}
                    </span>
                  )}
                </span>
              ),
            )}
          </div>

          <div className="appTopbarRight">
            <NotificationBell
              summary={notificationSummary}
            />
            <form
              action="/search"
              method="get"
              className="globalSearchForm"
            >
              <span
                className="globalSearchIcon"
                aria-hidden="true"
              >
                ⌕
              </span>

              <input
                type="search"
                name="q"
                placeholder="Поиск по CRM..."
                minLength={2}
                maxLength={100}
                aria-label="Поиск по CRM"
              />
            </form>

            {topbarRight ?? <DatabaseStatus />}

            <Link
              className="currentUserControl"
              href="/logout"
              title="Управление сессией"
            >
              <span className="currentUserAvatar">
                {session.user.displayName
                  .trim()
                  .slice(0, 1)
                  .toUpperCase()}
              </span>

              <span className="currentUserText">
                <strong>
                  {session.user.displayName}
                </strong>

                <small>
                  {session.user.roles.join(", ") ||
                    "Пользователь"}
                </small>
              </span>

              <span
                className="currentUserLogout"
                aria-hidden="true"
              >
                ↗
              </span>
            </Link>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
