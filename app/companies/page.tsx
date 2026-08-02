import { DatabaseStatus } from "@/components/ui/DatabaseStatus";
import { SalesSidebar } from "@/components/layout/SalesSidebar";
import Link from "next/link";
import {
  countCompanies,
  listCompanies,
} from "@/lib/repositories/company.repository";
import type { Company } from "@/types/company";
import { createCompanyAction } from "./actions";

export const dynamic = "force-dynamic";


const statusNames: Record<string, string> = {
  New: "Новая",
  Qualified: "Квалифицирована",
  Active: "Активная",
  Dormant: "Неактивная",
  Former: "Бывший клиент",
  Disqualified: "Не подходит",
  Closed: "Закрыта",
};

export default async function CompaniesPage() {
  const [companies, metrics] = await Promise.all([
    listCompanies(100),
    countCompanies(),
  ]);

  return (
    <div className="appShell">
      <SalesSidebar activeSection="companies" />

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Продажи</span>
            <strong>/</strong>
            <span>Компании</span>
          </div>

          <DatabaseStatus />
        </header>

        <section className="pageHeader">
          <div>
            <div className="eyebrow">Коммерческий блок</div>
            <h1>Компании</h1>
            <p>Реальные данные теперь сохраняются в PostgreSQL.</p>
          </div>
        </section>

        <section className="metricsGrid">
          <article className="metricCard">
            <div className="metricLabel">Всего компаний</div>
            <strong>{metrics.total}</strong>
            <p>записей в текущей базе</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">Активные</div>
            <strong>
              {metrics.active}
            </strong>
            <p>активные отношения</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">Новые</div>
            <strong>
              {metrics.newCompanies}
            </strong>
            <p>ожидают квалификации</p>
          </article>
        </section>

        <section className="workspaceGrid">
          <section className="contentPanel">
            <div className="panelTitle">
              <div>
                <h2>Каталог компаний</h2>
                <p>Последние 100 записей</p>
              </div>
            </div>

            {companies.length === 0 ? (
              <div className="emptyState">
                <div className="emptyIcon">▦</div>
                <h3>В базе пока нет компаний</h3>
                <p>
                  Добавь первую компанию через форму справа. Она сразу появится
                  в списке и сохранится в PostgreSQL.
                </p>
              </div>
            ) : (
              <div className="tableViewport">
                <div className="companyTable">
                  <div className="tableRow tableHead">
                    <div>Компания</div>
                    <div>Страна и отрасль</div>
                    <div>Владелец</div>
                    <div>Статус</div>
                    <div>Создана</div>
                  </div>

                  {companies.map((company) => (
                    <div className="tableRow" key={company.id}>
                      <div className="companyCell">
                        <div className="companyLogo">
                          {company.display_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <Link
                              className="companyNameLink"
                              href={`/companies/${company.id}`}
                            >
                              {company.display_name}
                            </Link>
                          <span>{company.company_code}</span>
                          {company.website && (
                            <a
                              href={company.website}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {company.website}
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="stackedCell">
                        <strong>{company.country}</strong>
                        <span>{company.industry ?? "Отрасль не указана"}</span>
                      </div>

                      <div className="ownerName">
                        {company.owner_name ?? "Не назначен"}
                      </div>

                      <div>
                        <span
                          className={`statusBadge status-${company.lifecycle_status.toLowerCase()}`}
                        >
                          {statusNames[company.lifecycle_status] ??
                            company.lifecycle_status}
                        </span>
                      </div>

                      <div className="createdDate">
                        {new Intl.DateTimeFormat("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        }).format(new Date(company.created_at))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="createPanel">
            <div className="formHeader">
              <div className="formIcon">＋</div>
              <div>
                <h2>Новая компания</h2>
                <p>Поля со звёздочкой обязательны</p>
              </div>
            </div>

            <form action={createCompanyAction} className="companyForm">
              <label>
                Название компании *
                <input
                  name="display_name"
                  type="text"
                  required
                  maxLength={255}
                  placeholder="Например, LeverX"
                />
              </label>

              <label>
                Страна *
                <select name="country" required defaultValue="">
                  <option value="" disabled>
                    Выбери страну
                  </option>
                  <option value="Беларусь">Беларусь</option>
                  <option value="Россия">Россия</option>
                  <option value="Казахстан">Казахстан</option>
                  <option value="Другая">Другая</option>
                </select>
              </label>

              <label>
                Отрасль
                <select name="industry" defaultValue="">
                  <option value="">Не указана</option>
                  <option value="IT / Software">IT / Software</option>
                  <option value="Banking / Fintech">Banking / Fintech</option>
                  <option value="Retail / E-commerce">
                    Retail / E-commerce
                  </option>
                  <option value="Manufacturing">Manufacturing</option>
                  <option value="Telecommunications">
                    Telecommunications
                  </option>
                  <option value="Gaming / Esports">Gaming / Esports</option>
                  <option value="Other">Другое</option>
                </select>
              </label>

              <label>
                Сайт
                <input
                  name="website"
                  type="url"
                  placeholder="https://company.com"
                />
              </label>

              <label>
                Ответственный
                <input
                  name="owner_name"
                  type="text"
                  maxLength={255}
                  placeholder="Имя менеджера"
                />
              </label>

              <label>
                Статус
                <select name="lifecycle_status" defaultValue="New">
                  <option value="New">Новая</option>
                  <option value="Qualified">Квалифицирована</option>
                  <option value="Active">Активная</option>
                  <option value="Dormant">Неактивная</option>
                  <option value="Former">Бывший клиент</option>
                  <option value="Disqualified">Не подходит</option>
                </select>
              </label>

              <button className="submitButton" type="submit">
                Создать компанию
              </button>
            </form>
          </aside>
        </section>
      </main>
    </div>
  );
}
