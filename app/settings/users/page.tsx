import {
  AppLayout,
} from "@/components/layout/AppLayout";

import {
  requirePermission,
} from "@/modules/auth";

import {
  listManagedUsers,
  listRoleOptions,
  type ManagedRoleCode,
  type UserStatus,
} from "@/lib/repositories/user.repository";

import {
  createUserAction,
  resetUserPasswordAction,
  toggleUserStatusAction,
  updateUserRoleAction,
} from "./actions";

export const dynamic = "force-dynamic";

const roleNames: Record<
  ManagedRoleCode,
  string
> = {
  Admin: "Администратор",
  Manager: "Менеджер",
  Viewer: "Наблюдатель",
};

const statusNames: Record<
  UserStatus,
  string
> = {
  Active: "Активен",
  Disabled: "Отключён",
  Invited: "Приглашён",
};

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "Никогда";
  }

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

export default async function UsersPage() {
  const session =
    await requirePermission("user.manage");

  const [users, roles] =
    await Promise.all([
      listManagedUsers(
        session.user.tenantId,
      ),
      listRoleOptions(),
    ]);

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
        },
        {
          label: "Пользователи",
        },
      ]}
    >
      <section className="usersPage">
        <header className="usersPageHeader">
          <div>
            <p className="eyebrow">
              Администрирование
            </p>

            <h1>Пользователи</h1>

            <p>
              Создание сотрудников, назначение ролей
              и управление доступом к CRM.
            </p>
          </div>

          <span className="usersCount">
            {users.length}
          </span>
        </header>

        <div className="usersWorkspace">
          <div className="usersList">
            {users.length === 0 ? (
              <div className="usersEmpty">
                Пользователи не найдены.
              </div>
            ) : (
              users.map((user) => {
                const currentRole =
                  user.roles[0] ?? "Viewer";

                const isCurrentUser =
                  user.id === session.user.id;

                return (
                  <article
                    className="userCard"
                    key={user.id}
                  >
                    <header className="userCardHeader">
                      <div className="userIdentity">
                        <span className="userAvatar">
                          {user.display_name
                            .trim()
                            .slice(0, 1)
                            .toUpperCase()}
                        </span>

                        <div>
                          <h2>
                            {user.display_name}
                          </h2>

                          <p>{user.email}</p>
                        </div>
                      </div>

                      <span
                        className={
                          `userStatus userStatus-${user.status}`
                        }
                      >
                        {statusNames[user.status]}
                      </span>
                    </header>

                    <dl className="userMeta">
                      <div>
                        <dt>Роль</dt>
                        <dd>
                          {user.roles
                            .map(
                              (role) =>
                                roleNames[role] ??
                                role,
                            )
                            .join(", ") ||
                            "Не назначена"}
                        </dd>
                      </div>

                      <div>
                        <dt>Последний вход</dt>
                        <dd>
                          {formatDate(
                            user.last_login_at,
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt>Создан</dt>
                        <dd>
                          {formatDate(
                            user.created_at,
                          )}
                        </dd>
                      </div>
                    </dl>

                    <div className="userActionsGrid">
                      <form
                        action={updateUserRoleAction.bind(
                          null,
                          user.id,
                        )}
                        className="userInlineForm"
                      >
                        <label>
                          Роль
                          <select
                            name="role_code"
                            defaultValue={currentRole}
                            disabled={isCurrentUser}
                          >
                            {roles.map((role) => (
                              <option
                                key={role.id}
                                value={role.role_code}
                              >
                                {role.display_name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <button
                          type="submit"
                          disabled={isCurrentUser}
                        >
                          Сохранить роль
                        </button>
                      </form>

                      <form
                        action={resetUserPasswordAction.bind(
                          null,
                          user.id,
                        )}
                        className="userInlineForm"
                      >
                        <label>
                          Новый пароль
                          <input
                            type="password"
                            name="password"
                            minLength={8}
                            required
                            autoComplete="new-password"
                            placeholder="Минимум 8 символов"
                          />
                        </label>

                        <button type="submit">
                          Сбросить пароль
                        </button>
                      </form>
                    </div>

                    <footer className="userCardFooter">
                      {isCurrentUser ? (
                        <small>
                          Собственную роль и статус
                          нельзя изменить на этой странице.
                        </small>
                      ) : (
                        <form
                          action={toggleUserStatusAction.bind(
                            null,
                            user.id,
                            user.status === "Active"
                              ? "Disabled"
                              : "Active",
                          )}
                        >
                          <button
                            type="submit"
                            className={
                              user.status === "Active"
                                ? "userDisableButton"
                                : "userEnableButton"
                            }
                          >
                            {user.status === "Active"
                              ? "Отключить пользователя"
                              : "Включить пользователя"}
                          </button>
                        </form>
                      )}
                    </footer>
                  </article>
                );
              })
            )}
          </div>

          <aside className="createUserPanel">
            <div className="createUserHeader">
              <p className="eyebrow">
                Новый сотрудник
              </p>

              <h2>Создать пользователя</h2>

              <p>
                Пользователь сможет войти сразу
                после создания.
              </p>
            </div>

            <form
              action={createUserAction}
              className="createUserForm"
            >
              <label>
                Имя *
                <input
                  name="display_name"
                  required
                  maxLength={150}
                  placeholder="Иван Иванов"
                />
              </label>

              <label>
                Email *
                <input
                  type="email"
                  name="email"
                  required
                  maxLength={255}
                  autoComplete="off"
                  placeholder="ivan@company.ru"
                />
              </label>

              <label>
                Временный пароль *
                <input
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Минимум 8 символов"
                />
              </label>

              <label>
                Роль *
                <select
                  name="role_code"
                  required
                  defaultValue="Manager"
                >
                  {roles.map((role) => (
                    <option
                      key={role.id}
                      value={role.role_code}
                    >
                      {role.display_name}
                    </option>
                  ))}
                </select>
              </label>

              <button type="submit">
                Создать пользователя
              </button>
            </form>
          </aside>
        </div>
      </section>
    </AppLayout>
  );
}
