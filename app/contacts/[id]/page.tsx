import Link from "next/link";
import { notFound } from "next/navigation";

import { SalesSidebar } from "@/components/layout/SalesSidebar";
import { DatabaseStatus } from "@/components/ui/DatabaseStatus";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type ContactProfile = {
  id: string;
  company_id: string;
  company_name: string;
  company_code: string;

  first_name: string;
  last_name: string | null;
  job_title: string | null;

  email: string | null;
  phone: string | null;
  telegram: string | null;
  linkedin_url: string | null;

  preferred_channel: string;
  contact_status: string;

  is_decision_maker: boolean;
  do_not_contact: boolean;
  notes: string | null;

  created_at: Date;

  deals_count: number;
  activities_count: number;
  tasks_count: number;
};

async function getContact(
  id: string,
): Promise<ContactProfile | null> {
  const result = await getDb().query<ContactProfile>(
    `
      SELECT
        contact.id,
        contact.company_id,
        company.display_name AS company_name,
        company.company_code,

        contact.first_name,
        contact.last_name,
        contact.job_title,

        contact.email,
        contact.phone,
        contact.telegram,
        contact.linkedin_url,

        contact.preferred_channel,
        contact.contact_status,

        contact.is_decision_maker,
        contact.do_not_contact,
        contact.notes,

        contact.created_at,

        (
          SELECT COUNT(*)::INTEGER
          FROM sales.deals
          WHERE primary_contact_id = contact.id
        ) AS deals_count,

        (
          SELECT COUNT(*)::INTEGER
          FROM sales.activities
          WHERE contact_id = contact.id
        ) AS activities_count,

        (
          SELECT COUNT(*)::INTEGER
          FROM sales.tasks
          WHERE contact_id = contact.id
        ) AS tasks_count

      FROM sales.contacts AS contact

      INNER JOIN sales.companies AS company
        ON company.id = contact.company_id

      WHERE contact.id = $1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

type ContactPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ContactPage({
  params,
}: ContactPageProps) {
  const { id } = await params;
  const contact = await getContact(id);

  if (!contact) {
    notFound();
  }

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
    .map((value) => value?.[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="appShell">
      <SalesSidebar activeSection="contacts" />

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            <Link href="/contacts">Контакты</Link>
            <strong>/</strong>
            <span>{fullName}</span>
          </div>

          <DatabaseStatus />
        </header>

        <section className="simpleContactHero">
          <div className="simpleContactIdentity">
            <div className="simpleContactAvatar">
              {initials}
            </div>

            <div>
              <div className="eyebrow">
                {contact.company_code}
              </div>

              <h1>{fullName}</h1>

              <p>
                {contact.job_title ??
                  "Должность не указана"}
                {" · "}
                {contact.company_name}
              </p>
            </div>
          </div>

          <div className="companyHeroActions">
            <Link
              className="secondaryButton companyActionLink"
              href={`/contacts/${contact.id}/edit`}
            >
              Редактировать
            </Link>

            {contact.email && (
              <a
                className="secondaryButton companyActionLink"
                href={`mailto:${contact.email}`}
              >
                Написать
              </a>
            )}

            {contact.phone && (
              <a
                className="primaryButton companyActionLink"
                href={`tel:${contact.phone}`}
              >
                Позвонить
              </a>
            )}
          </div>
        </section>

        <section className="simpleContactMetrics">
          <article>
            <strong>{contact.deals_count}</strong>
            <span>сделок</span>
          </article>

          <article>
            <strong>{contact.activities_count}</strong>
            <span>активностей</span>
          </article>

          <article>
            <strong>{contact.tasks_count}</strong>
            <span>задач</span>
          </article>
        </section>

        <section className="simpleContactGrid">
          <article className="simpleContactPanel">
            <div className="companySectionHeader">
              <div>
                <h2>Контактные данные</h2>
                <p>Основная информация</p>
              </div>
            </div>

            <div className="companyInfoList">
              <div>
                <span>Компания</span>

                <Link
                  className="simpleContactLink"
                  href={`/companies/${contact.company_id}`}
                >
                  {contact.company_name}
                </Link>
              </div>

              <div>
                <span>Должность</span>
                <strong>
                  {contact.job_title ?? "Не указана"}
                </strong>
              </div>

              <div>
                <span>Email</span>

                {contact.email ? (
                  <a
                    className="simpleContactLink"
                    href={`mailto:${contact.email}`}
                  >
                    {contact.email}
                  </a>
                ) : (
                  <strong>Не указан</strong>
                )}
              </div>

              <div>
                <span>Телефон</span>

                {contact.phone ? (
                  <a
                    className="simpleContactLink"
                    href={`tel:${contact.phone}`}
                  >
                    {contact.phone}
                  </a>
                ) : (
                  <strong>Не указан</strong>
                )}
              </div>

              <div>
                <span>Telegram</span>
                <strong>
                  {contact.telegram ?? "Не указан"}
                </strong>
              </div>

              <div>
                <span>Канал связи</span>
                <strong>
                  {contact.preferred_channel}
                </strong>
              </div>

              <div>
                <span>Статус</span>
                <strong>
                  {contact.contact_status}
                </strong>
              </div>

              <div>
                <span>ЛПР</span>
                <strong>
                  {contact.is_decision_maker
                    ? "Да"
                    : "Нет"}
                </strong>
              </div>
            </div>
          </article>

          <aside className="simpleContactPanel">
            <div className="companySectionHeader">
              <div>
                <h2>Быстрые действия</h2>
                <p>Связанные разделы CRM</p>
              </div>
            </div>

            <div className="simpleContactActions">
              <Link href="/deals">
                Сделки
                <strong>{contact.deals_count}</strong>
              </Link>

              <Link href="/activities">
                Активности
                <strong>
                  {contact.activities_count}
                </strong>
              </Link>

              <Link href="/tasks">
                Задачи
                <strong>{contact.tasks_count}</strong>
              </Link>
            </div>
          </aside>
        </section>

        {contact.notes && (
          <section className="simpleContactPanel simpleContactNotes">
            <div className="companySectionHeader">
              <div>
                <h2>Примечание</h2>
                <p>Дополнительный контекст</p>
              </div>
            </div>

            <p>{contact.notes}</p>
          </section>
        )}
      </main>
    </div>
  );
}
