import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentSession,
} from "@/modules/auth";

import {
  logoutAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function LogoutPage() {
  const session =
    await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="loginHeading">
          <div className="eyebrow">
            Текущий пользователь
          </div>

          <h1>Выйти из Sales OS?</h1>

          <p>
            {session.user.displayName}
            {" · "}
            {session.user.email}
          </p>
        </div>

        <form
          action={logoutAction}
          className="logoutActions"
        >
          <Link href="/">
            Отмена
          </Link>

          <button type="submit">
            Выйти
          </button>
        </form>
      </section>
    </main>
  );
}
