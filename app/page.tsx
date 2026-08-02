import {
  AppLayout,
} from "@/components/layout/AppLayout";
import Link from "next/link";

import {
  EmptyState,
  MetricCard,
  PageHeader,
  PanelHeader,
} from "@/components/ui";

import {
  getDashboardMetrics,
  getDashboardStages,
  listDashboardActivities,
  listDashboardCompanies,
  listDashboardDeals,
} from "@/lib/repositories/dashboard.repository";

export const dynamic = "force-dynamic";

const stageNames: Record<string, string> = {
  Lead: "Лид",
  Qualified: "Квалификация",
  Proposal: "Предложение",
  Negotiation: "Переговоры",
  Won: "Выиграно",
  Lost: "Проиграно",
};

const activityNames: Record<string, string> = {
  Call: "Звонок",
  Email: "Письмо",
  Meeting: "Встреча",
  Message: "Сообщение",
  Note: "Заметка",
  Task: "Задача",
};

const activityIcons: Record<string, string> = {
  Call: "☎",
  Email: "✉",
  Meeting: "◉",
  Message: "◌",
  Note: "≡",
  Task: "✓",
};

const statusNames: Record<string, string> = {
  New: "Новая",
  Qualified: "Квалифицирована",
  Active: "Активная",
  Dormant: "Неактивная",
  Former: "Бывший клиент",
  Disqualified: "Не подходит",
  Closed: "Закрыта",
};

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
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

function formatAmount(
  amount: string | number,
  currency: string,
): string {
  return (
    new Intl.NumberFormat(
      "ru-RU",
      {
        maximumFractionDigits: 0,
      },
    ).format(Number(amount)) +
    " " +
    currency
  );
}

export default async function DashboardPage() {
  const [
    metrics,
    stages,
    activities,
    deals,
    companies,
  ] = await Promise.all([
    getDashboardMetrics(),
    getDashboardStages(),
    listDashboardActivities(8),
    listDashboardDeals(6),
    listDashboardCompanies(6),
  ]);

  return (
    <AppLayout
      activeSection="home"
      breadcrumbs={[
        {
          label: "Sales OS",
        },
        {
          label: "Главная",
        },
      ]}
    >

        <PageHeader
          className="dashboardWelcome"
          eyebrow="Рабочий центр"
          title="Добрый день, Владислав"
          description="Краткая сводка продаж и ближайших действий коммерческого отдела."
          actions={
            <div className="dashboardQuickActions">
              <Link
                className="secondaryButton companyActionLink"
                href="/companies"
              >
                + Компания
              </Link>

              <Link
                className="secondaryButton companyActionLink"
                href="/deals"
              >
                + Сделка
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

        <section className="dashboardMetricGrid">
          <MetricCard
            href="/companies"
            label="Компании"
            value={metrics.companies}
            description="организаций в CRM"
          />

          <MetricCard
            href="/contacts"
            label="Контакты"
            value={metrics.contacts}
            description="связанных людей"
          />

          <MetricCard
            href="/deals"
            label="Активные сделки"
            value={metrics.activeDeals}
            description="в коммерческой воронке"
          />

          <MetricCard
            href="/activities"
            label="Просрочено"
            value={metrics.overdueActivities}
            description="действий требуют внимания"
            tone="danger"
          />

          <MetricCard
            href="/activities"
            label="Сегодня"
            value={metrics.todayActivities}
            description="запланировано действий"
          />

          <MetricCard
            href="/activities"
            label="Выполнено"
            value={metrics.completedActivities}
            description="активностей закрыто"
            tone="success"
          />
        </section>

        <section className="dashboardMainGrid">
          <section className="dashboardPanel">
            <PanelHeader
              title="Коммерческая воронка"
              description="Количество сделок на каждой стадии"
              actionLabel="Все сделки →"
              actionHref="/deals"
            />

            <div className="dashboardPipeline">
              {stages.map((stage) => {
                const maximum = Math.max(
                  ...stages.map(
                    (item) => item.deals_count,
                  ),
                  1,
                );

                const width =
                  stage.deals_count === 0
                    ? 4
                    : Math.max(
                        12,
                        Math.round(
                          stage.deals_count /
                            maximum *
                            100,
                        ),
                      );

                return (
                  <article
                    key={stage.stage}
                    className={
                      `dashboardPipelineRow stage-${stage.stage.toLowerCase()}`
                    }
                  >
                    <div className="dashboardPipelineLabel">
                      <span>
                        {stageNames[stage.stage]}
                      </span>

                      <strong>
                        {stage.deals_count}
                      </strong>
                    </div>

                    <div className="dashboardPipelineTrack">
                      <span
                        style={{
                          width: `${width}%`,
                        }}
                      />
                    </div>

                    <small>
                      {new Intl.NumberFormat(
                        "ru-RU",
                        {
                          maximumFractionDigits: 0,
                        },
                      ).format(
                        stage.total_amount,
                      )}
                    </small>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="dashboardPanel">
            <PanelHeader
              title="Ближайшие действия"
              description="Что нужно сделать следующим"
              actionLabel="Все активности →"
              actionHref="/activities"
            />

            {activities.length === 0 ? (
              <EmptyState
                compact
                description="Нет запланированных активностей"
              />
            ) : (
              <div className="dashboardActivityList">
                {activities.map((activity) => {
                  const isOverdue =
                    activity.scheduled_at
                      ? new Date(
                          activity.scheduled_at,
                        ) < new Date()
                      : false;

                  return (
                    <article
                      className="dashboardActivity"
                      key={activity.id}
                    >
                      <div
                        className={
                          `dashboardActivityIcon activityType-${activity.activity_type.toLowerCase()}`
                        }
                      >
                        {
                          activityIcons[
                            activity.activity_type
                          ]
                        }
                      </div>

                      <div className="dashboardActivityBody">
                        <strong>
                          {activity.subject}
                        </strong>

                        <Link
                          href={
                            `/companies/${activity.company_id}`
                          }
                        >
                          {activity.company_name}
                        </Link>

                        {activity.deal_title && (
                          <small>
                            {activity.deal_title}
                          </small>
                        )}
                      </div>

                      <div
                        className={
                          `dashboardActivityDate ${
                            isOverdue
                              ? "overdue"
                              : ""
                          }`
                        }
                      >
                        <span>
                          {
                            activityNames[
                              activity.activity_type
                            ]
                          }
                        </span>

                        <strong>
                          {formatDate(
                            activity.scheduled_at,
                          )}
                        </strong>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>

        <section className="dashboardLowerGrid">
          <section className="dashboardPanel">
            <PanelHeader
              title="Крупные активные сделки"
              description="Сделки с наибольшей суммой"
              actionLabel="Открыть воронку →"
              actionHref="/deals"
            />

            {deals.length === 0 ? (
              <EmptyState
                compact
                description="Активных сделок пока нет"
              />
            ) : (
              <div className="dashboardDealList">
                {deals.map((deal) => (
                  <article
                    className="dashboardDeal"
                    key={deal.id}
                  >
                    <div>
                      <strong>{deal.title}</strong>

                      <Link
                        href={
                          `/companies/${deal.company_id}`
                        }
                      >
                        {deal.company_name}
                      </Link>

                      <small>{deal.deal_code}</small>
                    </div>

                    <div>
                      <span
                        className={
                          `dealStageBadge stage-${deal.stage.toLowerCase()}`
                        }
                      >
                        {stageNames[deal.stage]}
                      </span>

                      <strong>
                        {formatAmount(
                          deal.amount,
                          deal.currency,
                        )}
                      </strong>

                      <small>
                        Вероятность:
                        {" "}
                        {deal.probability}%
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="dashboardPanel">
            <PanelHeader
              title="Новые компании"
              description="Последние добавленные организации"
              actionLabel="Все компании →"
              actionHref="/companies"
            />

            {companies.length === 0 ? (
              <EmptyState
                compact
                description="Компаний пока нет"
              />
            ) : (
              <div className="dashboardCompanyList">
                {companies.map((company) => (
                  <Link
                    className="dashboardCompany"
                    href={
                      `/companies/${company.id}`
                    }
                    key={company.id}
                  >
                    <div className="companyLogo">
                      {company.display_name
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>

                    <div>
                      <strong>
                        {company.display_name}
                      </strong>

                      <span>
                        {company.country}
                        {" · "}
                        {company.industry ??
                          "Отрасль не указана"}
                      </span>

                      <small>
                        {company.company_code}
                      </small>
                    </div>

                    <span
                      className={
                        `statusBadge status-${company.lifecycle_status.toLowerCase()}`
                      }
                    >
                      {
                        statusNames[
                          company.lifecycle_status
                        ] ??
                        company.lifecycle_status
                      }
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </section>
    </AppLayout>
  );
}
