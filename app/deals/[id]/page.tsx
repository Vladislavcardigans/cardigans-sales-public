import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AppLayout,
} from "@/components/layout/AppLayout";

import {
  PageHeader,
  PanelHeader,
} from "@/components/ui";

import {
  getDealProfileData,
} from "@/modules/deals";

import {
  requirePermission,
} from "@/modules/auth";

export const dynamic = "force-dynamic";


const stageNames: Record<string, string> = {
  Lead: "Лид",
  Qualified: "Квалификация",
  Proposal: "Предложение",
  Negotiation: "Переговоры",
  Won: "Выиграна",
  Lost: "Проиграна",
};

const activityNames: Record<string, string> = {
  Call: "Звонок",
  Email: "Письмо",
  Meeting: "Встреча",
  Message: "Сообщение",
  Note: "Заметка",
  Task: "Задача",
};

function formatAmount(
  amount: string,
  currency: string,
): string {
  return (
    new Intl.NumberFormat(
      "ru-RU",
      {
        maximumFractionDigits: 2,
      },
    ).format(Number(amount)) +
    " " +
    currency
  );
}

function formatDate(
  value: string | Date | null,
): string {
  if (!value) {
    return "Не указана";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
    },
  ).format(new Date(value));
}

function formatDateTime(
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

type DealPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DealPage({
  params,
}: DealPageProps) {
  await requirePermission("deal.read");

  const { id } = await params;

  const {
    deal,
    activities,
    tasks,
  } = await getDealProfileData(id);

  if (!deal) {
    notFound();
  }

  const activeTasks =
    tasks.filter(
      (task) =>
        !["Done", "Cancelled"].includes(
          task.status,
        ),
    ).length;

  const plannedActivities =
    activities.filter(
      (activity) =>
        activity.status === "Planned",
    ).length;

  const weightedAmount =
    Number(deal.amount) *
    deal.probability /
    100;

  return (
    <AppLayout
      activeSection="deals"
      breadcrumbs={[
        {
          label: "Продажи",
        },
        {
          label: "Сделки",
          href: "/deals",
        },
        {
          label: deal.deal_code,
        },
      ]}
    >
      <PageHeader
        eyebrow={deal.deal_code}
        title={deal.title}
        description={`${deal.company_name} · ${
          stageNames[deal.stage] ?? deal.stage
        }`}
        actions={
          <div className="dealProfileActions">
            <Link
              className="secondaryButton companyActionLink"
              href={`/deals/${deal.id}/edit`}
            >
              Редактировать
            </Link>

            <Link
              className="secondaryButton companyActionLink"
              href="/deals/kanban"
            >
              Открыть Kanban
            </Link>

            <Link
              className="primaryButton companyActionLink"
              href="/activities"
            >
              + Активность
            </Link>
          </div>
        }
      />

      <section className="dealProfileMetrics">
        <article>
          <span>Сумма</span>
          <strong>
            {formatAmount(
              deal.amount,
              deal.currency,
            )}
          </strong>
        </article>

        <article>
          <span>Вероятность</span>
          <strong>
            {deal.probability}%
          </strong>
        </article>

        <article>
          <span>Взвешенный прогноз</span>
          <strong>
            {formatAmount(
              String(weightedAmount),
              deal.currency,
            )}
          </strong>
        </article>

        <article>
          <span>Активные задачи</span>
          <strong>{activeTasks}</strong>
        </article>

        <article>
          <span>Запланированные действия</span>
          <strong>{plannedActivities}</strong>
        </article>
      </section>

      <section className="dealProfileGrid">
        <section className="dealProfilePanel">
          <PanelHeader
            title="Параметры сделки"
            description="Основная коммерческая информация"
          />

          <div className="companyInfoList">
            <div>
              <span>Стадия</span>

              <strong>
                {stageNames[deal.stage] ??
                  deal.stage}
              </strong>
            </div>

            <div>
              <span>Ответственный</span>

              <strong>
                {deal.owner_name ??
                  "Не назначен"}
              </strong>
            </div>

            <div>
              <span>Дата закрытия</span>

              <strong>
                {formatDate(
                  deal.expected_close_date,
                )}
              </strong>
            </div>

            <div>
              <span>Создана</span>

              <strong>
                {formatDate(deal.created_at)}
              </strong>
            </div>

            <div>
              <span>Компания</span>

              <Link
                className="dealProfileLink"
                href={
                  `/companies/${deal.company_id}`
                }
              >
                {deal.company_name}
              </Link>
            </div>

            <div>
              <span>Основной контакт</span>

              {deal.primary_contact_id &&
              deal.primary_contact_name ? (
                <Link
                  className="dealProfileLink"
                  href={
                    `/contacts/${deal.primary_contact_id}`
                  }
                >
                  {deal.primary_contact_name}
                </Link>
              ) : (
                <strong>Не выбран</strong>
              )}
            </div>
          </div>

          {deal.description && (
            <div className="dealProfileDescription">
              <span>Описание</span>
              <p>{deal.description}</p>
            </div>
          )}

          {deal.lost_reason && (
            <div className="dealProfileLostReason">
              <span>
                Причина проигрыша
              </span>

              <p>{deal.lost_reason}</p>
            </div>
          )}
        </section>

        <aside className="dealProfilePanel">
          <PanelHeader
            title="Состояние"
            description="Прогресс сделки"
          />

          <div className="dealProfileStage">
            <div className="dealProfileStageTop">
              <span
                className={
                  `dealKanbanStageDot stage-${deal.stage.toLowerCase()}`
                }
              />

              <strong>
                {stageNames[deal.stage] ??
                  deal.stage}
              </strong>

              <span>
                {deal.probability}%
              </span>
            </div>

            <div className="dealProfileProgress">
              <span
                style={{
                  width:
                    `${deal.probability}%`,
                }}
              />
            </div>

            <p>
              Ожидаемая сумма с учётом
              вероятности:
            </p>

            <strong>
              {formatAmount(
                String(weightedAmount),
                deal.currency,
              )}
            </strong>
          </div>
        </aside>
      </section>

      <section className="dealRelationsGrid">
        <section className="dealProfilePanel">
          <PanelHeader
            title="Активности сделки"
            description="Звонки, встречи, письма и заметки"
            actionLabel="Все активности →"
            actionHref="/activities"
          />

          {activities.length === 0 ? (
            <div className="dashboardEmpty">
              Связанных активностей пока нет
            </div>
          ) : (
            <div className="dealRelationList">
              {activities.map(
                (activity) => (
                  <article key={activity.id}>
                    <div
                      className={
                        `dealRelationIcon activityType-${activity.activity_type.toLowerCase()}`
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

                    <div>
                      <strong>
                        {activity.subject}
                      </strong>

                      <span>
                        {activityNames[
                          activity.activity_type
                        ] ??
                          activity.activity_type}
                        {" · "}
                        {activity.status}
                      </span>

                      <small>
                        {formatDateTime(
                          activity.scheduled_at,
                        )}
                      </small>
                    </div>

                    <span
                      className={
                        `activityPriority priority-${activity.priority.toLowerCase()}`
                      }
                    >
                      {activity.priority}
                    </span>
                  </article>
                ),
              )}
            </div>
          )}
        </section>

        <section className="dealProfilePanel">
          <PanelHeader
            title="Задачи сделки"
            description="Следующие действия и контроль сроков"
            actionLabel="Все задачи →"
            actionHref="/tasks"
          />

          {tasks.length === 0 ? (
            <div className="dashboardEmpty">
              Связанных задач пока нет
            </div>
          ) : (
            <div className="dealRelationList">
              {tasks.map((task) => (
                <article key={task.id}>
                  <div
                    className={
                      `dealRelationIcon task-status-${task.status.toLowerCase()}`
                    }
                  >
                    {task.status === "Done"
                      ? "✓"
                      : task.status ===
                          "InProgress"
                        ? "◐"
                        : "○"}
                  </div>

                  <div>
                    <strong>
                      {task.title}
                    </strong>

                    <span>
                      {task.task_code}
                      {" · "}
                      {task.status}
                    </span>

                    <small>
                      {formatDateTime(
                        task.due_at,
                      )}
                    </small>
                  </div>

                  <span
                    className={
                      `activityPriority priority-${task.priority.toLowerCase()}`
                    }
                  >
                    {task.priority}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </AppLayout>
  );
}
