import Link from "next/link";

import { SalesSidebar } from "@/components/layout/SalesSidebar";
import { DatabaseStatus } from "@/components/ui/DatabaseStatus";
import { ActivityEditModal } from "@/components/activities/ActivityEditModal";

import {
  completeActivityAction,
  createActivityAction,
} from "./actions";

import {
  getActivityMetrics,
  listActivities,
  listActivityCompanyOptions,
  listActivityContactOptions,
  listActivityDealOptions,
} from "@/lib/repositories/activity.repository";

import type {
  Activity,
} from "@/types/activity";

import { hasPermission, requirePermission } from "@/modules/auth";

export const dynamic = "force-dynamic";

const typeNames: Record<string, string> = {
  Call: "Звонок",
  Email: "Письмо",
  Meeting: "Встреча",
  Message: "Сообщение",
  Note: "Заметка",
  Task: "Задача",
};

const typeIcons: Record<string, string> = {
  Call: "☎",
  Email: "✉",
  Meeting: "◉",
  Message: "◌",
  Note: "≡",
  Task: "✓",
};

const statusNames: Record<string, string> = {
  Planned: "Запланировано",
  Completed: "Выполнено",
  Cancelled: "Отменено",
};

const priorityNames: Record<string, string> = {
  Low: "Низкий",
  Normal: "Обычный",
  High: "Высокий",
  Urgent: "Срочный",
};

function getActivityGroup(
  activity: Activity,
): "overdue" | "today" | "upcoming" | "completed" {
  if (activity.status === "Completed") {
    return "completed";
  }

  if (!activity.scheduled_at) {
    return "upcoming";
  }

  const scheduled =
    new Date(activity.scheduled_at);

  const now = new Date();

  const todayStart =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

  const tomorrowStart =
    new Date(todayStart);

  tomorrowStart.setDate(
    tomorrowStart.getDate() + 1,
  );

  if (scheduled < now) {
    return "overdue";
  }

  if (
    scheduled >= todayStart &&
    scheduled < tomorrowStart
  ) {
    return "today";
  }

  return "upcoming";
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

export default async function ActivitiesPage() {
  await requirePermission("activity.read");

  const canCreateActivities =
    await hasPermission("activity.create");

  const canCompleteActivities =
    await hasPermission("activity.complete");

  const canEditActivities =
    await hasPermission("activity.update");

  const canDeleteActivities =
    await hasPermission("activity.delete");

  const [
    activities,
    companies,
    contacts,
    deals,
    metrics,
  ] = await Promise.all([
    listActivities(200),
    listActivityCompanyOptions(),
    listActivityContactOptions(),
    listActivityDealOptions(),
    getActivityMetrics(),
  ]);

  const groups = {
    overdue: activities.filter(
      (activity) =>
        getActivityGroup(activity) ===
        "overdue",
    ),

    today: activities.filter(
      (activity) =>
        getActivityGroup(activity) ===
        "today",
    ),

    upcoming: activities.filter(
      (activity) =>
        getActivityGroup(activity) ===
        "upcoming",
    ),

    completed: activities.filter(
      (activity) =>
        getActivityGroup(activity) ===
        "completed",
    ),
  };

  const sections = [
    {
      key: "overdue",
      title: "Просрочено",
      description:
        "Требует немедленного внимания",
      activities: groups.overdue,
    },
    {
      key: "today",
      title: "Сегодня",
      description:
        "Действия на текущий день",
      activities: groups.today,
    },
    {
      key: "upcoming",
      title: "Предстоящие",
      description:
        "Запланированные следующие шаги",
      activities: groups.upcoming,
    },
    {
      key: "completed",
      title: "Выполненные",
      description:
        "История завершённых действий",
      activities: groups.completed,
    },
  ];

  return (
    <div className="appShell">
      <SalesSidebar
        activeSection="activities"
      />

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Продажи</span>
            <strong>/</strong>
            <span>Активности</span>
          </div>

          <DatabaseStatus />
        </header>

        <section className="pageHeader">
          <div>
            <div className="eyebrow">
              Ежедневная работа
            </div>

            <h1>Активности</h1>

            <p>
              Звонки, встречи, письма,
              сообщения и следующие действия.
            </p>
          </div>
        </section>

        <section className="metricsGrid activityMetricsGrid">
          <article className="metricCard">
            <div className="metricLabel">
              Всего
            </div>

            <strong>{metrics.total}</strong>
            <p>активностей в CRM</p>
          </article>

          <article className="metricCard metricOverdue">
            <div className="metricLabel">
              Просрочено
            </div>

            <strong>{metrics.overdue}</strong>
            <p>требуют внимания</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Сегодня
            </div>

            <strong>{metrics.today}</strong>
            <p>запланировано на день</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Предстоящие
            </div>

            <strong>{metrics.upcoming}</strong>
            <p>будущие действия</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Выполнено
            </div>

            <strong>{metrics.completed}</strong>
            <p>завершённых действий</p>
          </article>
        </section>

        <section className="workspaceGrid">
          <section className="activityWorkspace">
            {sections.map((section) => (
              <section
                className={
                  `activitySection activitySection-${section.key}`
                }
                key={section.key}
              >
                <div className="activitySectionHeader">
                  <div>
                    <h2>{section.title}</h2>
                    <p>{section.description}</p>
                  </div>

                  <strong>
                    {section.activities.length}
                  </strong>
                </div>

                {section.activities.length === 0 ? (
                  <div className="activityEmpty">
                    Нет активностей
                  </div>
                ) : (
                  <div className="activityList">
                    {section.activities.map(
                      (activity) => (
                        <article
                          className="activityCard"
                          key={activity.id}
                        >
                          <div
                            className={
                              `activityTypeIcon activityType-${activity.activity_type.toLowerCase()}`
                            }
                          >
                            {typeIcons[
                              activity.activity_type
                            ]}
                          </div>

                          <div className="activityMain">
                            <div className="activityTitleRow">
                              <div>
                                <strong>
                                  {activity.subject}
                                </strong>

                                <span>
                                  {activity.activity_code}
                                </span>
                              </div>

                              <div className="activityBadges">
                                <span
                                  className={
                                    `activityPriority priority-${activity.priority.toLowerCase()}`
                                  }
                                >
                                  {priorityNames[
                                    activity.priority
                                  ]}
                                </span>

                                <span
                                  className={
                                    `activityStatus activity-status-${activity.status.toLowerCase()}`
                                  }
                                >
                                  {statusNames[
                                    activity.status
                                  ]}
                                </span>
                              </div>
                            </div>

                            <div className="activityRelations">
                              <Link
                                href={
                                  `/companies/${activity.company_id}`
                                }
                              >
                                {activity.company_name}
                              </Link>

                              {activity.contact_name && (
                                <span>
                                  Контакт:{" "}
                                  {activity.contact_name}
                                </span>
                              )}

                              {activity.deal_title && (
                                <span>
                                  Сделка:{" "}
                                  {activity.deal_title}
                                </span>
                              )}
                            </div>

                            {activity.description && (
                              <p className="activityDescription">
                                {activity.description}
                              </p>
                            )}

                            <div className="activityFooter">
                              <span>
                                {typeNames[
                                  activity.activity_type
                                ]}
                              </span>

                              <span>
                                {formatDate(
                                  activity.scheduled_at,
                                )}
                              </span>

                              <span>
                                {activity.owner_name ??
                                  "Ответственный не назначен"}
                              </span>

                              {canEditActivities && (
              <ActivityEditModal
                activity={activity}
                companies={companies}
                contacts={contacts}
                deals={deals}
                canDelete={canDeleteActivities}
              />
            )}

            {canCompleteActivities && activity.status === "Planned" && (
                                <form
                                  action={completeActivityAction.bind(
                                    null,
                                    activity.id,
                                  )}
                                >
                                  <button
                                    className="workflowCompleteButton"
                                    type="submit"
                                  >
                                    ✓ Завершить
                                  </button>
                                </form>
                              )}
                            </div>
                          </div>
                        </article>
                      ),
                    )}
                  </div>
                )}
              </section>
            ))}
          </section>

          {canCreateActivities && (
            <aside className="createPanel">
              <div className="formHeader">
              <div className="formIcon">＋</div>

              <div>
                <h2>Новая активность</h2>
                <p>
                  Следующее действие продавца
                </p>
              </div>
            </div>

            {companies.length === 0 ? (
              <div className="contactNoCompanies">
                <strong>
                  Сначала добавь компанию
                </strong>

                <p>
                  Активность должна быть
                  связана с компанией.
                </p>

                <Link href="/companies">
                  Перейти к компаниям
                </Link>
              </div>
            ) : (
              <form
                action={createActivityAction}
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

                    {companies.map(
                      (company) => (
                        <option
                          key={company.id}
                          value={company.id}
                        >
                          {company.display_name}
                          {" · "}
                          {company.company_code}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <div className="formColumns">
                  <label>
                    Тип
                    <select
                      name="activity_type"
                      defaultValue="Task"
                    >
                      <option value="Call">
                        Звонок
                      </option>
                      <option value="Email">
                        Письмо
                      </option>
                      <option value="Meeting">
                        Встреча
                      </option>
                      <option value="Message">
                        Сообщение
                      </option>
                      <option value="Note">
                        Заметка
                      </option>
                      <option value="Task">
                        Задача
                      </option>
                    </select>
                  </label>

                  <label>
                    Приоритет
                    <select
                      name="priority"
                      defaultValue="Normal"
                    >
                      <option value="Low">
                        Низкий
                      </option>
                      <option value="Normal">
                        Обычный
                      </option>
                      <option value="High">
                        Высокий
                      </option>
                      <option value="Urgent">
                        Срочный
                      </option>
                    </select>
                  </label>
                </div>

                <label>
                  Тема *
                  <input
                    name="subject"
                    required
                    maxLength={255}
                    placeholder="Позвонить и обсудить предложение"
                  />
                </label>

                <label>
                  Контакт
                  <select
                    name="contact_id"
                    defaultValue=""
                  >
                    <option value="">
                      Не выбран
                    </option>

                    {contacts.map(
                      (contact) => (
                        <option
                          key={contact.id}
                          value={contact.id}
                        >
                          {contact.full_name}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  Сделка
                  <select
                    name="deal_id"
                    defaultValue=""
                  >
                    <option value="">
                      Не выбрана
                    </option>

                    {deals.map((deal) => (
                      <option
                        key={deal.id}
                        value={deal.id}
                      >
                        {deal.title}
                        {" · "}
                        {deal.deal_code}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Дата и время
                  <input
                    name="scheduled_at"
                    type="datetime-local"
                  />
                </label>

                <div className="formColumns">
                  <label>
                    Статус
                    <select
                      name="status"
                      defaultValue="Planned"
                    >
                      <option value="Planned">
                        Запланировано
                      </option>
                      <option value="Completed">
                        Выполнено
                      </option>
                      <option value="Cancelled">
                        Отменено
                      </option>
                    </select>
                  </label>

                  <label>
                    Ответственный
                    <input
                      name="owner_name"
                      maxLength={255}
                      placeholder="Имя"
                    />
                  </label>
                </div>

                <label>
                  Описание
                  <textarea
                    name="description"
                    rows={4}
                    maxLength={3000}
                    placeholder="Что нужно сделать и какой контекст учитывать"
                  />
                </label>

                <label>
                  Результат
                  <textarea
                    name="outcome"
                    rows={3}
                    maxLength={3000}
                    placeholder="Заполняется для выполненного действия"
                  />
                </label>

                <button
                  className="submitButton"
                  type="submit"
                >
                  Создать активность
                </button>
              </form>
            )}
            </aside>
          )}
        </section>
      </main>
    </div>
  );
}
