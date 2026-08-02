import Link from "next/link";

import { getDb } from "@/lib/db";

type TimelineEventType =
  | "company"
  | "contact"
  | "deal"
  | "activity"
  | "task";

type TimelineEvent = {
  event_id: string;
  event_type: TimelineEventType;
  title: string;
  description: string | null;
  event_status: string | null;
  event_at: string;
  href: string | null;
};

type CompanyTimelineProps = {
  companyId: string;
};

const eventIcons: Record<TimelineEventType, string> = {
  company: "▦",
  contact: "◎",
  deal: "◇",
  activity: "◉",
  task: "✓",
};

const eventTypeNames: Record<TimelineEventType, string> = {
  company: "Компания",
  contact: "Контакт",
  deal: "Сделка",
  activity: "Активность",
  task: "Задача",
};

async function listCompanyTimeline(
  companyId: string,
): Promise<TimelineEvent[]> {
  const result = await getDb().query<TimelineEvent>(
    `
      SELECT *
      FROM (
        SELECT
          company.id::TEXT AS event_id,
          'company'::TEXT AS event_type,
          'Компания создана'::TEXT AS title,
          company.display_name::TEXT AS description,
          company.lifecycle_status::TEXT AS event_status,
          company.created_at::TEXT AS event_at,
          NULL::TEXT AS href

        FROM sales.companies AS company

        WHERE company.id = $1

        UNION ALL

        SELECT
          contact.id::TEXT AS event_id,
          'contact'::TEXT AS event_type,
          (
            'Добавлен контакт: ' ||
            TRIM(
              CONCAT(
                contact.first_name,
                ' ',
                COALESCE(contact.last_name, '')
              )
            )
          )::TEXT AS title,
          contact.job_title::TEXT AS description,
          contact.contact_status::TEXT AS event_status,
          contact.created_at::TEXT AS event_at,
          ('/contacts/' || contact.id)::TEXT AS href

        FROM sales.contacts AS contact

        WHERE contact.company_id = $1

        UNION ALL

        SELECT
          deal.id::TEXT AS event_id,
          'deal'::TEXT AS event_type,
          ('Создана сделка: ' || deal.title)::TEXT AS title,
          (
            deal.amount::TEXT ||
            ' ' ||
            deal.currency
          )::TEXT AS description,
          deal.stage::TEXT AS event_status,
          deal.created_at::TEXT AS event_at,
          '/deals'::TEXT AS href

        FROM sales.deals AS deal

        WHERE deal.company_id = $1

        UNION ALL

        SELECT
          activity.id::TEXT AS event_id,
          'activity'::TEXT AS event_type,
          activity.subject::TEXT AS title,
          activity.description::TEXT AS description,
          activity.status::TEXT AS event_status,
          activity.created_at::TEXT AS event_at,
          '/activities'::TEXT AS href

        FROM sales.activities AS activity

        WHERE activity.company_id = $1

        UNION ALL

        SELECT
          task.id::TEXT AS event_id,
          'task'::TEXT AS event_type,
          task.title::TEXT AS title,
          task.description::TEXT AS description,
          task.status::TEXT AS event_status,
          task.created_at::TEXT AS event_at,
          '/tasks'::TEXT AS href

        FROM sales.tasks AS task

        WHERE task.company_id = $1

        UNION ALL

        SELECT
          activity.id::TEXT || '-completed' AS event_id,
          'activity'::TEXT AS event_type,
          ('Выполнено: ' || activity.subject)::TEXT AS title,
          activity.outcome::TEXT AS description,
          'Completed'::TEXT AS event_status,
          activity.completed_at::TEXT AS event_at,
          '/activities'::TEXT AS href

        FROM sales.activities AS activity

        WHERE activity.company_id = $1
          AND activity.completed_at IS NOT NULL

        UNION ALL

        SELECT
          task.id::TEXT || '-completed' AS event_id,
          'task'::TEXT AS event_type,
          ('Задача выполнена: ' || task.title)::TEXT AS title,
          task.description::TEXT AS description,
          'Done'::TEXT AS event_status,
          task.completed_at::TEXT AS event_at,
          '/tasks'::TEXT AS href

        FROM sales.tasks AS task

        WHERE task.company_id = $1
          AND task.completed_at IS NOT NULL
      ) AS timeline

      WHERE timeline.event_at IS NOT NULL

      ORDER BY
        timeline.event_at DESC

      LIMIT 100
    `,
    [companyId],
  );

  return result.rows;
}

function formatTimelineDate(value: string): string {
  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

export async function CompanyTimeline({
  companyId,
}: CompanyTimelineProps) {
  const events =
    await listCompanyTimeline(companyId);

  return (
    <section
      id="timeline"
      className="companyTimelinePanel"
    >
      <div className="companySectionHeader">
        <div>
          <h2>История компании</h2>

          <p>
            Контакты, сделки, активности и задачи
          </p>
        </div>

        <strong className="companyTimelineCount">
          {events.length}
        </strong>
      </div>

      {events.length === 0 ? (
        <div className="dashboardEmpty">
          История пока отсутствует
        </div>
      ) : (
        <div className="companyTimeline">
          {events.map((event) => {
            const content = (
              <>
                <div
                  className={
                    `companyTimelineIcon timeline-${event.event_type}`
                  }
                >
                  {eventIcons[event.event_type]}
                </div>

                <div className="companyTimelineContent">
                  <div className="companyTimelineTitle">
                    <strong>{event.title}</strong>

                    {event.event_status && (
                      <span>
                        {event.event_status}
                      </span>
                    )}
                  </div>

                  {event.description && (
                    <p>{event.description}</p>
                  )}

                  <div className="companyTimelineMeta">
                    <span>
                      {eventTypeNames[event.event_type]}
                    </span>

                    <time dateTime={event.event_at}>
                      {formatTimelineDate(event.event_at)}
                    </time>
                  </div>
                </div>
              </>
            );

            if (event.href) {
              return (
                <Link
                  href={event.href}
                  className="companyTimelineEvent companyTimelineEventLink"
                  key={`${event.event_type}-${event.event_id}`}
                >
                  {content}
                </Link>
              );
            }

            return (
              <article
                className="companyTimelineEvent"
                key={`${event.event_type}-${event.event_id}`}
              >
                {content}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
