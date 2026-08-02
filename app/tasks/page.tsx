import Link from "next/link";

import { hasPermission, requirePermission } from "@/modules/auth";

import {
  SalesSidebar,
} from "@/components/layout/SalesSidebar";

import {
  DatabaseStatus,
} from "@/components/ui/DatabaseStatus";

import { TaskEditModal } from "@/components/tasks/TaskEditModal";

import {
  completeTaskAction,
  createTaskAction,
} from "./actions";

import {
  getTaskMetrics,
  listTaskOptions,
  listTasks,
} from "@/lib/repositories/task.repository";

export const dynamic = "force-dynamic";

const statusNames: Record<string, string> = {
  Todo: "К выполнению",
  InProgress: "В работе",
  Done: "Выполнена",
  Cancelled: "Отменена",
};

const priorityNames: Record<string, string> = {
  Low: "Низкий",
  Normal: "Обычный",
  High: "Высокий",
  Urgent: "Срочный",
};

function formatDate(value: string | null) {
  if (!value) {
    return "Срок не указан";
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

export default async function TasksPage() {
  await requirePermission("task.read");

  const canCreateTasks =
    await hasPermission("task.create");

  const canCompleteTasks =
    await hasPermission("task.complete");

  const canEditTasks =
    await hasPermission("task.update");

  const canDeleteTasks =
    await hasPermission("task.delete");
  const [
    tasks,
    metrics,
    options,
  ] = await Promise.all([
    listTasks(200),
    getTaskMetrics(),
    listTaskOptions(),
  ]);

  return (
    <div className="appShell">
      <SalesSidebar activeSection="tasks" />

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Продажи</span>
            <strong>/</strong>
            <span>Задачи</span>
          </div>

          <DatabaseStatus />
        </header>

        <section className="pageHeader">
          <div>
            <div className="eyebrow">
              Контроль исполнения
            </div>

            <h1>Задачи</h1>

            <p>
              Следующие действия, сроки и
              ответственность коммерческой команды.
            </p>
          </div>
        </section>

        <section className="metricsGrid taskMetricsGrid">
          <article className="metricCard">
            <div className="metricLabel">
              Всего
            </div>
            <strong>{metrics.total}</strong>
            <p>задач в CRM</p>
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
            <p>задач на текущий день</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              В работе
            </div>
            <strong>{metrics.inProgress}</strong>
            <p>активно выполняются</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Выполнено
            </div>
            <strong>{metrics.done}</strong>
            <p>закрытых задач</p>
          </article>
        </section>

        <section className="workspaceGrid">
          <section className="contentPanel">
            <div className="panelTitle">
              <div>
                <h2>Рабочий список</h2>
                <p>Последние 200 задач</p>
              </div>
            </div>

            {tasks.length === 0 ? (
              <div className="emptyState">
                <div className="emptyIcon">✓</div>
                <h3>Задач пока нет</h3>
                <p>
                  Создай первую задачу через форму справа.
                </p>
              </div>
            ) : (
              <div className="taskList">
                {tasks.map((task) => {
                  const isOverdue =
                    task.status !== "Done" &&
                    task.status !== "Cancelled" &&
                    task.due_at !== null &&
                    new Date(task.due_at) < new Date();

                  return (
                    <article
                      className={
                        `taskCard ${
                          isOverdue ? "taskOverdue" : ""
                        }`
                      }
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

                      <div className="taskBody">
                        <div className="taskTitleRow">
                          <div>
                            <strong>{task.title}</strong>
                            <span>{task.task_code}</span>
                          </div>

                          <div className="taskBadges">
                            <span
                              className={
                                `activityPriority priority-${task.priority.toLowerCase()}`
                              }
                            >
                              {priorityNames[task.priority]}
                            </span>

                            <span
                              className={
                                `taskStatusBadge task-status-${task.status.toLowerCase()}`
                              }
                            >
                              {statusNames[task.status]}
                            </span>
                          </div>
                        </div>

                        <div className="taskRelations">
                          <Link
                            href={
                              `/companies/${task.company_id}`
                            }
                          >
                            {task.company_name}
                          </Link>

                          {task.contact_name && (
                            <span>
                              Контакт: {task.contact_name}
                            </span>
                          )}

                          {task.deal_title && (
                            <span>
                              Сделка: {task.deal_title}
                            </span>
                          )}

                          {task.activity_subject && (
                            <span>
                              Активность: {task.activity_subject}
                            </span>
                          )}
                        </div>

                        {task.description && (
                          <p>{task.description}</p>
                        )}

                        <div className="taskFooter">
                          <span
                            className={
                              isOverdue
                                ? "taskDueOverdue"
                                : ""
                            }
                          >
                            {formatDate(task.due_at)}
                          </span>

                          <span>
                            {task.owner_name ??
                              "Ответственный не назначен"}
                          </span>

                          {canEditTasks && (
                            <TaskEditModal
                              task={task}
                              companies={options.companies}
                              contacts={options.contacts}
                              deals={options.deals}
                              activities={options.activities}
                              canDelete={canDeleteTasks}
                            />
                          )}

                          {canCompleteTasks &&
                            task.status !== "Done" &&
                            task.status !== "Cancelled" && (
                              <form
                                action={completeTaskAction.bind(
                                  null,
                                  task.id,
                                )}
                              >
                                <button
                                  className="workflowCompleteButton"
                                  type="submit"
                                >
                                  ✓ Выполнить
                                </button>
                              </form>
                            )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {canCreateTasks && (
<aside className="createPanel">
            <div className="formHeader">
              <div className="formIcon">＋</div>

              <div>
                <h2>Новая задача</h2>
                <p>
                  Поля со звёздочкой обязательны
                </p>
              </div>
            </div>

            {options.companies.length === 0 ? (
              <div className="contactNoCompanies">
                <strong>
                  Сначала добавь компанию
                </strong>

                <p>
                  Задача обязательно связана
                  с компанией.
                </p>

                <Link href="/companies">
                  Перейти к компаниям
                </Link>
              </div>
            ) : (
              <form
                action={createTaskAction}
                className="companyForm"
              >
                <label>
                  Компания *
                  <select
                    name="company_id"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Выбери компанию
                    </option>

                    {options.companies.map(
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

                <label>
                  Название задачи *
                  <input
                    name="title"
                    required
                    maxLength={255}
                    placeholder="Подготовить коммерческое предложение"
                  />
                </label>

                <div className="formColumns">
                  <label>
                    Статус
                    <select
                      name="status"
                      defaultValue="Todo"
                    >
                      <option value="Todo">
                        К выполнению
                      </option>
                      <option value="InProgress">
                        В работе
                      </option>
                      <option value="Done">
                        Выполнена
                      </option>
                      <option value="Cancelled">
                        Отменена
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
                  Контакт
                  <select
                    name="contact_id"
                    defaultValue=""
                  >
                    <option value="">
                      Не выбран
                    </option>

                    {options.contacts.map(
                      (contact) => (
                        <option
                          key={contact.id}
                          value={contact.id}
                        >
                          {contact.label}
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

                    {options.deals.map((deal) => (
                      <option
                        key={deal.id}
                        value={deal.id}
                      >
                        {deal.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Связанная активность
                  <select
                    name="activity_id"
                    defaultValue=""
                  >
                    <option value="">
                      Не выбрана
                    </option>

                    {options.activities.map(
                      (activity) => (
                        <option
                          key={activity.id}
                          value={activity.id}
                        >
                          {activity.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  Срок
                  <input
                    name="due_at"
                    type="date"
                  />
                </label>

                <label>
                  Ответственный
                  <input
                    name="owner_name"
                    maxLength={255}
                    placeholder="Имя менеджера"
                  />
                </label>

                <label>
                  Описание
                  <textarea
                    name="description"
                    rows={4}
                    maxLength={3000}
                    placeholder="Что именно нужно сделать"
                  />
                </label>

                <button
                  className="submitButton"
                  type="submit"
                >
                  Создать задачу
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
