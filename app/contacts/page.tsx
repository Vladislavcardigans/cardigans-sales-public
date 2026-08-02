import { DatabaseStatus } from "@/components/ui/DatabaseStatus";
import { SalesSidebar } from "@/components/layout/SalesSidebar";
import Link from "next/link";

import { createContactAction } from "./actions";

import {
  countContacts,
  listCompanyOptions,
  listContacts,
} from "@/lib/repositories/contact.repository";

export const dynamic = "force-dynamic";


const channelNames: Record<string, string> = {
  Email: "Email",
  Phone: "Телефон",
  Telegram: "Telegram",
  LinkedIn: "LinkedIn",
  Other: "Другой",
};

const statusNames: Record<string, string> = {
  Active: "Активный",
  Inactive: "Неактивный",
  "Left company": "Ушёл из компании",
  Unknown: "Неизвестно",
};

export default async function ContactsPage() {
  const [contacts, companies, metrics] =
    await Promise.all([
      listContacts(100),
      listCompanyOptions(),
      countContacts(),
    ]);

  return (
    <div className="appShell">
      <SalesSidebar activeSection="contacts" />

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Продажи</span>
            <strong>/</strong>
            <span>Контакты</span>
          </div>

          <DatabaseStatus />
        </header>

        <section className="pageHeader">
          <div>
            <div className="eyebrow">
              Коммерческий блок
            </div>

            <h1>Контакты</h1>

            <p>
              Люди, участвующие в принятии решений
              внутри компаний.
            </p>
          </div>
        </section>

        <section className="metricsGrid">
          <article className="metricCard">
            <div className="metricLabel">
              Всего контактов
            </div>

            <strong>{metrics.total}</strong>

            <p>записей в CRM</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Лица, принимающие решения
            </div>

            <strong>
              {metrics.decisionMakers}
            </strong>

            <p>отмечены как ЛПР</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Запрещено связываться
            </div>

            <strong>
              {metrics.doNotContact}
            </strong>

            <p>контактов с ограничением</p>
          </article>
        </section>

        <section className="workspaceGrid">
          <section className="contentPanel">
            <div className="panelTitle">
              <div>
                <h2>Каталог контактов</h2>
                <p>Последние 100 записей</p>
              </div>
            </div>

            {contacts.length === 0 ? (
              <div className="emptyState">
                <div className="emptyIcon">
                  ◎
                </div>

                <h3>
                  В базе пока нет контактов
                </h3>

                <p>
                  Создай первую компанию или выбери
                  существующую, затем добавь человека
                  через форму справа.
                </p>
              </div>
            ) : (
              <div className="tableViewport">
                <div className="contactTable">
                  <div className="contactTableRow contactTableHead">
                    <div>Контакт</div>
                    <div>Компания</div>
                    <div>Каналы связи</div>
                    <div>Предпочтение</div>
                    <div>Статус</div>
                  </div>

                  {contacts.map((contact) => {
                    const fullName = [
                      contact.first_name,
                      contact.last_name,
                    ]
                      .filter(Boolean)
                      .join(" ");

                    const initials = [
                      contact.first_name,
                      contact.last_name,
                    ]
                      .filter(Boolean)
                      .map((part) => part?.[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <div
                        className="contactTableRow"
                        key={contact.id}
                      >
                        <div className="contactPerson">
                          <div className="contactAvatar">
                            {initials}
                          </div>

                          <div>
                            <Link
                              className="contactNameLink"
                              href={`/contacts/${contact.id}`}
                            >
                              {fullName}
                            </Link>

                            <span>
                              {contact.job_title ??
                                "Должность не указана"}
                            </span>

                            {contact.is_decision_maker && (
                              <em>ЛПР</em>
                            )}
                          </div>
                        </div>

                        <div className="contactCompany">
                          <strong>
                            {contact.company_name}
                          </strong>

                          <span>
                            {contact.company_code}
                          </span>
                        </div>

                        <div className="contactChannels">
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}`}
                            >
                              {contact.email}
                            </a>
                          )}

                          {contact.phone && (
                            <a
                              href={`tel:${contact.phone}`}
                            >
                              {contact.phone}
                            </a>
                          )}

                          {contact.telegram && (
                            <span>
                              {contact.telegram}
                            </span>
                          )}

                          {!contact.email &&
                            !contact.phone &&
                            !contact.telegram && (
                              <span>
                                Не указаны
                              </span>
                            )}
                        </div>

                        <div>
                          <span className="channelBadge">
                            {channelNames[
                              contact.preferred_channel
                            ] ??
                              contact.preferred_channel}
                          </span>
                        </div>

                        <div>
                          <span
                            className={
                              `contactStatusBadge ${
                                contact.do_not_contact
                                  ? "blocked"
                                  : contact.contact_status
                                      .toLowerCase()
                                      .replace(" ", "-")
                              }`
                            }
                          >
                            {contact.do_not_contact
                              ? "Не связываться"
                              : statusNames[
                                  contact.contact_status
                                ] ??
                                contact.contact_status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <aside className="createPanel">
            <div className="formHeader">
              <div className="formIcon">＋</div>

              <div>
                <h2>Новый контакт</h2>

                <p>
                  Поля со звёздочкой обязательны
                </p>
              </div>
            </div>

            {companies.length === 0 ? (
              <div className="contactNoCompanies">
                <strong>
                  Сначала добавь компанию
                </strong>

                <p>
                  Контакт обязательно должен быть
                  связан с компанией.
                </p>

                <Link href="/companies">
                  Перейти к компаниям
                </Link>
              </div>
            ) : (
              <form
                action={createContactAction}
                className="companyForm"
              >
                <label>
                  Компания *
                  <select
                    name="company_id"
                    required
                    defaultValue=""
                  >
                    <option
                      value=""
                      disabled
                    >
                      Выбери компанию
                    </option>

                    {companies.map((company) => (
                      <option
                        key={company.id}
                        value={company.id}
                      >
                        {company.display_name}
                        {" · "}
                        {company.company_code}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="formColumns">
                  <label>
                    Имя *
                    <input
                      name="first_name"
                      required
                      maxLength={150}
                      placeholder="Анна"
                    />
                  </label>

                  <label>
                    Фамилия
                    <input
                      name="last_name"
                      maxLength={150}
                      placeholder="Иванова"
                    />
                  </label>
                </div>

                <label>
                  Должность
                  <input
                    name="job_title"
                    maxLength={255}
                    placeholder="HR Director"
                  />
                </label>

                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    maxLength={320}
                    placeholder="anna@company.com"
                  />
                </label>

                <label>
                  Телефон
                  <input
                    name="phone"
                    type="tel"
                    maxLength={100}
                    placeholder="+375..."
                  />
                </label>

                <label>
                  Telegram
                  <input
                    name="telegram"
                    maxLength={255}
                    placeholder="@username"
                  />
                </label>

                <label>
                  LinkedIn
                  <input
                    name="linkedin_url"
                    type="url"
                    placeholder="https://linkedin.com/in/..."
                  />
                </label>

                <label>
                  Предпочтительный канал
                  <select
                    name="preferred_channel"
                    defaultValue="Email"
                  >
                    <option value="Email">
                      Email
                    </option>
                    <option value="Phone">
                      Телефон
                    </option>
                    <option value="Telegram">
                      Telegram
                    </option>
                    <option value="LinkedIn">
                      LinkedIn
                    </option>
                    <option value="Other">
                      Другой
                    </option>
                  </select>
                </label>

                <label>
                  Статус
                  <select
                    name="contact_status"
                    defaultValue="Active"
                  >
                    <option value="Active">
                      Активный
                    </option>
                    <option value="Inactive">
                      Неактивный
                    </option>
                    <option value="Left company">
                      Ушёл из компании
                    </option>
                    <option value="Unknown">
                      Неизвестно
                    </option>
                  </select>
                </label>

                <label className="checkboxLabel">
                  <input
                    name="is_decision_maker"
                    type="checkbox"
                  />
                  Лицо, принимающее решение
                </label>

                <label className="checkboxLabel">
                  <input
                    name="do_not_contact"
                    type="checkbox"
                  />
                  Не связываться
                </label>

                <label>
                  Постоянное примечание
                  <textarea
                    name="notes"
                    rows={3}
                    maxLength={2000}
                    placeholder="Только постоянный контекст, не история коммуникаций"
                  />
                </label>

                <button
                  className="submitButton"
                  type="submit"
                >
                  Создать контакт
                </button>
              </form>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
