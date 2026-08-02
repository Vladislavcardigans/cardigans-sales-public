import {
  getCompanyProfileData,
} from "@/modules/companies";

import { CompanyTimeline } from "@/components/company/CompanyTimeline";
import { DatabaseStatus } from "@/components/ui/DatabaseStatus";
import { SalesSidebar } from "@/components/layout/SalesSidebar";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCompanyById,
  listCompanyContacts,
} from "@/lib/repositories/company.repository";

import {
  listCompanyDeals,
} from "@/lib/repositories/deal.repository";

import {
  listCompanyActivities,
} from "@/lib/repositories/activity.repository";

import {
  listCompanyTasks,
} from "@/lib/repositories/task.repository";

const statusNames: Record<string, string> = {
  New: "Новая",
  Qualified: "Квалифицирована",
  Active: "Активная",
  Dormant: "Неактивная",
  Former: "Бывший клиент",
  Disqualified: "Не подходит",
  Closed: "Закрыта",
};


type CompanyPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CompanyProfileView({
  params,
}: CompanyPageProps) {
  const { id } = await params;

  const {
    company,
    contacts,
    deals,
    activities,
    tasks,
  } = await getCompanyProfileData(id);

  if (!company) {
    notFound();
  }

  return (
    <div className="appShell">
      <SalesSidebar activeSection="companies" />

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            <Link href="/companies">Компании</Link>
            <strong>/</strong>
            <span>{company.display_name}</span>
          </div>

          <DatabaseStatus />
        </header>

        <section className="companyHero">
          <div className="companyHeroIdentity">
            <div className="companyHeroLogo">
              {company.display_name.slice(0, 2).toUpperCase()}
            </div>

            <div>
              <div className="eyebrow">{company.company_code}</div>
              <h1>{company.display_name}</h1>

              <div className="companyHeroMeta">
                <span>{company.country}</span>
                <span>•</span>
                <span>{company.industry ?? "Отрасль не указана"}</span>
                <span
                  className={`statusBadge status-${company.lifecycle_status.toLowerCase()}`}
                >
                  {statusNames[company.lifecycle_status] ??
                    company.lifecycle_status}
                </span>
              </div>
            </div>
          </div>

          <div className="companyHeroActions">
            {company.website && (
              <a
                className="secondaryButton companyActionLink"
                href={company.website}
                target="_blank"
                rel="noreferrer"
              >
                Открыть сайт
              </a>
            )}

            <Link
              className="primaryButton companyActionLink"
              href="/contacts"
            >
              + Добавить контакт
            </Link>
          </div>
        </section>

        <nav className="companyTabs">
          <a className="active" href="#overview">
            Обзор
          </a>
          <a href="#contacts">Контакты ({company.contacts_count})</a>
          <a href="#deals">Сделки</a>
          <a href="#activities">Активности</a>
          <a href="#files">Файлы</a>
          <a href="#ai">AI</a>
        </nav>

        <section id="overview" className="companyDetailsGrid">
          <article className="companyInfoCard">
            <div className="companySectionHeader">
              <div>
                <h2>Информация о компании</h2>
                <p>Основные данные организации</p>
              </div>
            </div>

            <div className="companyInfoList">
              <div>
                <span>Код</span>
                <strong>{company.company_code}</strong>
              </div>

              <div>
                <span>Страна</span>
                <strong>{company.country}</strong>
              </div>

              <div>
                <span>Отрасль</span>
                <strong>{company.industry ?? "Не указана"}</strong>
              </div>

              <div>
                <span>Ответственный</span>
                <strong>{company.owner_name ?? "Не назначен"}</strong>
              </div>

              <div>
                <span>Статус</span>
                <strong>
                  {statusNames[company.lifecycle_status] ??
                    company.lifecycle_status}
                </strong>
              </div>

              <div>
                <span>Создана</span>
                <strong>
                  {new Intl.DateTimeFormat("ru-RU", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  }).format(new Date(company.created_at))}
                </strong>
              </div>
            </div>
          </article>

          <aside className="companySummaryCard">
            <div className="companySectionHeader">
              <div>
                <h2>Сводка</h2>
                <p>Коммерческое состояние</p>
              </div>
            </div>

            <div className="companySummaryMetrics">
              <div>
                <strong>{company.contacts_count}</strong>
                <span>контактов</span>
              </div>

              <div>
                <strong>
                  {
                    deals.filter(
                      (deal) =>
                        !["Won", "Lost"].includes(deal.stage),
                    ).length
                  }
                </strong>
                <span>активных сделок</span>
              </div>

              <div>
                <strong>{activities.length}</strong>
                <span>активностей</span>
              </div>
            </div>

            <div className="companyNextStep">
              <span>Следующий этап</span>
              <strong>Добавить сделку или активность</strong>
              <p>
                Эти модули появятся на следующих этапах разработки.
              </p>
            </div>
          </aside>
        </section>


        <section id="deals" className="companyContactsPanel">
          <div className="companySectionHeader">
            <div>
              <h2>Сделки компании</h2>
              <p>Коммерческие возможности этой организации</p>
            </div>

            <Link href="/deals">Все сделки →</Link>
          </div>

          {deals.length === 0 ? (
            <div className="companyEmptyContacts">
              <div className="emptyIcon">◇</div>

              <h3>Сделок пока нет</h3>

              <p>
                Создай коммерческую возможность
                и выбери эту компанию.
              </p>

              <Link href="/deals">
                Добавить первую сделку
              </Link>
            </div>
          ) : (
            <div className="companyDealGrid">
              {deals.map((deal) => (
                <article
                  className="companyDealCard"
                  key={deal.id}
                >
                  <div className="companyDealHeader">
                    <div>
                      <strong>{deal.title}</strong>
                      <span>{deal.deal_code}</span>
                    </div>

                    <span
                      className={
                        `dealStageBadge stage-${deal.stage.toLowerCase()}`
                      }
                    >
                      {deal.stage}
                    </span>
                  </div>

                  <div className="companyDealAmount">
                    {new Intl.NumberFormat("ru-RU", {
                      maximumFractionDigits: 2,
                    }).format(Number(deal.amount))}
                    {" "}
                    {deal.currency}
                  </div>

                  <div className="companyDealFooter">
                    <span>
                      Вероятность: {deal.probability}%
                    </span>

                    <span>
                      {deal.expected_close_date
                        ? new Intl.DateTimeFormat("ru-RU").format(
                            new Date(deal.expected_close_date),
                          )
                        : "Дата не указана"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>


        <section
          id="activities"
          className="companyContactsPanel"
        >
          <div className="companySectionHeader">
            <div>
              <h2>Активности компании</h2>
              <p>
                Звонки, встречи, письма и задачи
              </p>
            </div>

            <Link href="/activities">
              Все активности →
            </Link>
          </div>

          {activities.length === 0 ? (
            <div className="companyEmptyContacts">
              <div className="emptyIcon">✓</div>

              <h3>Активностей пока нет</h3>

              <p>
                Добавь следующее действие
                для этой компании.
              </p>

              <Link href="/activities">
                Добавить активность
              </Link>
            </div>
          ) : (
            <div className="companyActivityList">
              {activities.map((activity) => (
                <article
                  className="companyActivityCard"
                  key={activity.id}
                >
                  <div
                    className={
                      `companyActivityIcon activityType-${activity.activity_type.toLowerCase()}`
                    }
                  >
                    {activity.activity_type === "Call"
                      ? "☎"
                      : activity.activity_type === "Email"
                        ? "✉"
                        : activity.activity_type === "Meeting"
                          ? "◉"
                          : activity.activity_type === "Message"
                            ? "◌"
                            : activity.activity_type === "Note"
                              ? "≡"
                              : "✓"}
                  </div>

                  <div className="companyActivityBody">
                    <div>
                      <strong>
                        {activity.subject}
                      </strong>

                      <span>
                        {activity.activity_code}
                      </span>
                    </div>

                    <p>
                      {activity.description ??
                        "Описание не указано"}
                    </p>

                    <div className="companyActivityMeta">
                      <span>
                        {activity.status}
                      </span>

                      <span>
                        {activity.scheduled_at
                          ? new Intl.DateTimeFormat(
                              "ru-RU",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            ).format(
                              new Date(
                                activity.scheduled_at,
                              ),
                            )
                          : "Дата не указана"}
                      </span>

                      {activity.deal_title && (
                        <span>
                          Сделка:{" "}
                          {activity.deal_title}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>


        <section
          id="tasks"
          className="companyContactsPanel"
        >
          <div className="companySectionHeader">
            <div>
              <h2>Задачи компании</h2>
              <p>
                Следующие действия и контроль сроков
              </p>
            </div>

            <Link href="/tasks">
              Все задачи →
            </Link>
          </div>

          {tasks.length === 0 ? (
            <div className="companyEmptyContacts">
              <div className="emptyIcon">✓</div>

              <h3>Задач пока нет</h3>

              <p>
                Добавь следующее действие
                для этой компании.
              </p>

              <Link href="/tasks">
                Добавить задачу
              </Link>
            </div>
          ) : (
            <div className="companyTaskList">
              {tasks.map((task) => (
                <article
                  className="companyTaskCard"
                  key={task.id}
                >
                  <div
                    className={
                      `taskCheck task-status-${task.status.toLowerCase()}`
                    }
                  >
                    {task.status === "Done"
                      ? "✓"
                      : task.status === "InProgress"
                        ? "◐"
                        : "○"}
                  </div>

                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.task_code}</span>

                    <p>
                      {task.description ??
                        "Описание не указано"}
                    </p>

                    <small>
                      {task.due_at
                        ? new Intl.DateTimeFormat(
                            "ru-RU",
                            {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          ).format(
                            new Date(task.due_at),
                          )
                        : "Срок не указан"}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <CompanyTimeline companyId={id} />

        <section id="contacts" className="companyContactsPanel">
          <div className="companySectionHeader">
            <div>
              <h2>Контакты компании</h2>
              <p>Люди, связанные с этой организацией</p>
            </div>

            <Link href="/contacts">Все контакты →</Link>
          </div>

          {contacts.length === 0 ? (
            <div className="companyEmptyContacts">
              <div className="emptyIcon">◎</div>
              <h3>Контактов пока нет</h3>
              <p>
                Добавь человека и выбери эту компанию в форме Contacts.
              </p>

              <Link href="/contacts">Добавить первый контакт</Link>
            </div>
          ) : (
            <div className="companyContactGrid">
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
                  <article
                    className="companyContactCard"
                    key={contact.id}
                  >
                    <div className="contactAvatar">{initials}</div>

                    <div>
                      <div className="companyContactName">
                        <strong>{fullName}</strong>

                        {contact.is_decision_maker && (
                          <span>ЛПР</span>
                        )}
                      </div>

                      <p>
                        {contact.job_title ?? "Должность не указана"}
                      </p>

                      <div className="companyContactChannels">
                        {contact.email && (
                          <a href={`mailto:${contact.email}`}>
                            {contact.email}
                          </a>
                        )}

                        {contact.phone && (
                          <a href={`tel:${contact.phone}`}>
                            {contact.phone}
                          </a>
                        )}

                        {contact.telegram && (
                          <span>{contact.telegram}</span>
                        )}
                      </div>

                      {contact.do_not_contact && (
                        <div className="companyContactBlocked">
                          Не связываться
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="futureModulesGrid">
          <article id="deals">
            <span>◇</span>
            <h3>Сделки</h3>
            <p>
              Коммерческие возможности, суммы, стадии и вероятность.
            </p>
          </article>

          <article id="activities">
            <span>✓</span>
            <h3>Активности</h3>
            <p>
              Звонки, встречи, письма, сообщения и следующие действия.
            </p>
          </article>

          <article id="files">
            <span>▤</span>
            <h3>Файлы</h3>
            <p>
              Коммерческие предложения, договоры и презентации.
            </p>
          </article>

          <article id="ai">
            <span>✦</span>
            <h3>AI Summary</h3>
            <p>
              Автоматическое резюме компании и рекомендации продавцу.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
