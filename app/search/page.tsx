import Link from "next/link";

import {
  AppLayout,
} from "@/components/layout/AppLayout";

import {
  hasPermission,
} from "@/modules/auth";

import {
  searchSales,
  type GlobalSearchResult,
} from "@/lib/repositories/search.repository";

export const dynamic = "force-dynamic";

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

const entityNames: Record<
  GlobalSearchResult["entity"],
  string
> = {
  company: "Компания",
  contact: "Контакт",
  deal: "Сделка",
  activity: "Активность",
  task: "Задача",
};

const entityIcons: Record<
  GlobalSearchResult["entity"],
  string
> = {
  company: "▦",
  contact: "◎",
  deal: "◇",
  activity: "✓",
  task: "☑",
};

export default async function SearchPage({
  searchParams,
}: SearchPageProps) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  const [
    canReadCompanies,
    canReadContacts,
    canReadDeals,
    canReadActivities,
    canReadTasks,
  ] = await Promise.all([
    hasPermission("company.read"),
    hasPermission("contact.read"),
    hasPermission("deal.read"),
    hasPermission("activity.read"),
    hasPermission("task.read"),
  ]);

  const results = await searchSales(
    query,
    {
      companies: canReadCompanies,
      contacts: canReadContacts,
      deals: canReadDeals,
      activities: canReadActivities,
      tasks: canReadTasks,
    },
  );

  return (
    <AppLayout
      activeSection="home"
      breadcrumbs={[
        {
          label: "Sales OS",
          href: "/",
        },
        {
          label: "Поиск",
        },
      ]}
    >
      <section className="searchPage">
        <header className="searchPageHeader">
          <div>
            <p className="eyebrow">
              Глобальный поиск
            </p>

            <h1>
              {query
                ? `Результаты для «${query}»`
                : "Поиск по CRM"}
            </h1>

            <p>
              Компании, контакты, сделки,
              активности и задачи в одном месте.
            </p>
          </div>
        </header>

        <form
          action="/search"
          method="get"
          className="searchPageForm"
        >
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Компания, контакт, сделка, задача..."
            minLength={2}
            maxLength={100}
            autoFocus
          />

          <button type="submit">
            Найти
          </button>
        </form>

        {query.length < 2 ? (
          <div className="searchEmptyState">
            Введите минимум два символа.
          </div>
        ) : results.length === 0 ? (
          <div className="searchEmptyState">
            Ничего не найдено. Проверь запрос
            или попробуй другое написание.
          </div>
        ) : (
          <>
            <p className="searchResultCount">
              Найдено: {results.length}
            </p>

            <div className="searchResultList">
              {results.map((result) => (
                <Link
                  key={`${result.entity}-${result.id}`}
                  href={result.href}
                  className="searchResultCard"
                >
                  <span className="searchResultIcon">
                    {entityIcons[result.entity]}
                  </span>

                  <span className="searchResultContent">
                    <span className="searchResultMeta">
                      {entityNames[result.entity]}

                      {result.code && (
                        <>
                          {" · "}
                          {result.code}
                        </>
                      )}
                    </span>

                    <strong>{result.title}</strong>

                    {result.subtitle && (
                      <small>
                        {result.subtitle}
                      </small>
                    )}
                  </span>

                  <span
                    className="searchResultArrow"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
    </AppLayout>
  );
}
