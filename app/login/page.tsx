import { redirect } from "next/navigation";

import {
  getCurrentSession,
} from "@/modules/auth";

import {
  loginAction,
} from "./actions";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    email?: string;
    next?: string;
  }>;
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const session =
    await getCurrentSession();

  if (session) {
    redirect("/");
  }

  const params = await searchParams;

  const hasCredentialsError =
    params.error === "credentials";

  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="loginBrand">
          <div className="loginBrandMark">
            CA
          </div>

          <div>
            <strong>
              Cardigans Arena
            </strong>

            <span>Sales OS</span>
          </div>
        </div>

        <div className="loginHeading">
          <div className="eyebrow">
            Защищённый доступ
          </div>

          <h1>Вход в Sales OS</h1>

          <p>
            Используй учётную запись,
            созданную администратором.
          </p>
        </div>

        {hasCredentialsError && (
          <div
            className="loginError"
            role="alert"
          >
            Неверный email или пароль.
          </div>
        )}

        <form
          action={loginAction}
          className="loginForm"
        >
          <input
            type="hidden"
            name="next"
            value={params.next ?? "/"}
          />

          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={
                params.email ?? ""
              }
              placeholder="name@example.com"
            />
          </label>

          <label>
            Пароль
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Введите пароль"
            />
          </label>

          <button type="submit">
            Войти
          </button>
        </form>

        <p className="loginSupport">
          При проблемах со входом
          обратитесь к администратору.
        </p>
      </section>
    </main>
  );
}
