import Link from "next/link";
import { notFound } from "next/navigation";

import { AppLayout } from "@/components/layout/AppLayout";
import { requirePermission } from "@/modules/auth";

import {
  getActivityById,
  listActivityCompanyOptions,
  listActivityContactOptions,
  listActivityDealOptions,
} from "@/lib/repositories/activity.repository";

import {
  activityPriorities,
  activityStatuses,
  activityTypes,
} from "@/types/activity";

import { updateActivityAction } from "../../actions";

type EditActivityPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const typeNames: Record<string, string> = {
  Call: "Звонок",
  Email: "Email",
  Meeting: "Встреча",
  Message: "Сообщение",
  Note: "Заметка",
  Task: "Задача",
};

const statusNames: Record<string, string> = {
  Planned: "Запланирована",
  Completed: "Выполнена",
  Cancelled: "Отменена",
};

const priorityNames: Record<string, string> = {
  Low: "Низкий",
  Normal: "Обычный",
  High: "Высокий",
  Urgent: "Срочный",
};

function toDateTimeLocal(
  value: string | null,
): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Date(
    date.getTime() -
      date.getTimezoneOffset() * 60_000,
  )
    .toISOString()
    .slice(0, 16);
}

export default async function EditActivityPage({
  params,
}: EditActivityPageProps) {
  await requirePermission("activity.update");

  const { id } = await params;

  const [
    activity,
    companies,
    contacts,
    deals,
  ] = await Promise.all([
    getActivityById(id),
    listActivityCompanyOptions(),
    listActivityContactOptions(),
    listActivityDealOptions(),
  ]);

  if (!activity) {
    notFound();
  }

  return (
    <AppLayout
      activeSection="activities"
      breadcrumbs={[
        {
          label: "Активности",
          href: "/activities",
        },
        {
          label: "Редактирование",
        },
      ]}
    >
      <main>
        <section className="pageHeader">
          <div>
            <p className="eyebrow">
              {activity.activity_code}
            </p>

            <h1>Редактирование активности</h1>

            <p>
              Измени параметры и сохрани активность.
            </p>
          </div>

          <div className="pageActions">
            <Link
              href="/activities"
              className="secondaryButton"
            >
              Назад к активностям
            </Link>
          </div>
        </section>

        <section className="createPanel">
          <form
            action={updateActivityAction.bind(
              null,
              activity.id,
            )}
            className="companyForm"
          >
            <label>
              Компания *
              <select
                name="company_id"
                required
                defaultValue={activity.company_id}
              >
                {companies.map((company) => (
                  <option
                    key={company.id}
                    value={company.id}
                  >
                    {company.display_name} ·{" "}
                    {company.company_code}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Тип активности *
              <select
                name="activity_type"
                required
                defaultValue={
                  activity.activity_type
                }
              >
                {activityTypes.map((type) => (
                  <option key={type} value={type}>
                    {typeNames[type] ?? type}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Тема *
              <input
                name="subject"
                required
                defaultValue={activity.subject}
              />
            </label>

            <label>
              Приоритет *
              <select
                name="priority"
                required
                defaultValue={activity.priority}
              >
                {activityPriorities.map(
                  (priority) => (
                    <option
                      key={priority}
                      value={priority}
                    >
                      {priorityNames[priority] ??
                        priority}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Статус *
              <select
                name="status"
                required
                defaultValue={activity.status}
              >
                {activityStatuses.map((status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {statusNames[status] ?? status}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Контакт
              <select
                name="contact_id"
                defaultValue={
                  activity.contact_id ?? ""
                }
              >
                <option value="">
                  Контакт не выбран
                </option>

                {contacts.map((contact) => (
                  <option
                    key={contact.id}
                    value={contact.id}
                  >
                    {contact.full_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Сделка
              <select
                name="deal_id"
                defaultValue={activity.deal_id ?? ""}
              >
                <option value="">
                  Сделка не выбрана
                </option>

                {deals.map((deal) => (
                  <option
                    key={deal.id}
                    value={deal.id}
                  >
                    {deal.deal_code} · {deal.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Дата и время
              <input
                type="datetime-local"
                name="scheduled_at"
                defaultValue={toDateTimeLocal(
                  activity.scheduled_at,
                )}
              />
            </label>

            <label>
              Ответственный
              <input
                name="owner_name"
                defaultValue={
                  activity.owner_name ?? ""
                }
              />
            </label>

            <label>
              Описание
              <textarea
                name="description"
                rows={5}
                defaultValue={
                  activity.description ?? ""
                }
              />
            </label>

            <label>
              Результат
              <textarea
                name="outcome"
                rows={4}
                defaultValue={activity.outcome ?? ""}
              />
            </label>

            <div className="formActions">
              <button type="submit">
                Сохранить изменения
              </button>

              <Link
                href="/activities"
                className="secondaryButton"
              >
                Отмена
              </Link>
            </div>
          </form>
        </section>
      </main>
    </AppLayout>
  );
}
