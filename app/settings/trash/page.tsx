import Link from "next/link";

import {
  AppLayout,
} from "@/components/layout/AppLayout";

import {
  requirePermission,
} from "@/modules/auth";

import {
  listTrashItems,
  type TrashEntityType,
} from "@/lib/repositories/trash.repository";

import {
  restoreTrashItemAction,
} from "./actions";

export const dynamic = "force-dynamic";

const entityNames: Record<
  TrashEntityType,
  string
> = {
  task: "Задача",
  activity: "Активность",
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
      timeStyle: "short",
    },
  ).format(date);
}

export default async function TrashPage() {
  const session =
    await requirePermission("trash.manage");

  const items = await listTrashItems(
    session.user.tenantId,
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
          label: "Корзина",
        },
      ]}
    >
      <section className="trashPage">
        <header className="trashPageHeader">
          <div>
            <p className="eyebrow">
              Администрирование
            </p>

            <h1>Корзина</h1>

            <p>
              Восстановление удалённых задач
              и активностей.
            </p>
          </div>

          <nav className="settingsNavigation">
            <Link href="/settings/users">
              Пользователи
            </Link>

            <Link href="/settings/system">
              Система
            </Link>

            <Link href="/settings/audit">
              Аудит
            </Link>

            <Link
              href="/settings/trash"
              className="settingsNavigationActive"
            >
              Корзина
            </Link>
          </nav>
        </header>

        {items.length === 0 ? (
          <div className="trashEmpty">
            Корзина пуста.
          </div>
        ) : (
          <div className="trashList">
            {items.map((item) => (
              <article
                className="trashCard"
                key={`${item.entity_type}-${item.id}`}
              >
                <div className="trashEntity">
                  {entityNames[item.entity_type]}
                </div>

                <div className="trashContent">
                  <div className="trashMeta">
                    {item.code && (
                      <span>{item.code}</span>
                    )}

                    <span>
                      {item.company_name}
                    </span>
                  </div>

                  <h2>{item.title}</h2>

                  <p>
                    Удалено:{" "}
                    {formatDateTime(
                      item.deleted_at,
                    )}
                  </p>
                </div>

                <form
                  action={restoreTrashItemAction.bind(
                    null,
                    item.entity_type,
                    item.id,
                  )}
                >
                  <button
                    type="submit"
                    className="trashRestoreButton"
                  >
                    Восстановить
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppLayout>
  );
}
