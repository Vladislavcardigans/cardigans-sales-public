import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentSession,
} from "@/modules/auth";

export const dynamic = "force-dynamic";

export default async function SessionTestPage() {
  const session =
    await getCurrentSession();

  if (!session) {
    redirect(
      "/login?next=/session-test",
    );
  }

  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="loginHeading">
          <div className="eyebrow">
            Проверка сессии
          </div>

          <h1>Вход выполнен</h1>

          <p>
            Сервер распознал пользователя
            и действующую сессию.
          </p>
        </div>

        <dl className="sessionDetails">
          <div>
            <dt>Пользователь</dt>
            <dd>
              {session.user.displayName}
            </dd>
          </div>

          <div>
            <dt>Email</dt>
            <dd>{session.user.email}</dd>
          </div>

          <div>
            <dt>Организация</dt>
            <dd>
              {session.user.tenantName}
            </dd>
          </div>

          <div>
            <dt>Роли</dt>
            <dd>
              {session.user.roles.join(", ") ||
                "Нет ролей"}
            </dd>
          </div>

          <div>
            <dt>Сессия действует до</dt>
            <dd>
              {session.expiresAt
                .toLocaleString("ru-RU")}
            </dd>
          </div>
        </dl>

        <div className="logoutActions">
          <Link href="/">
            Перейти в CRM
          </Link>

          <Link href="/logout">
            Завершить сессию
          </Link>
        </div>
      </section>
    </main>
  );
}
