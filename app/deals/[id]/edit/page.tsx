import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AppLayout,
} from "@/components/layout/AppLayout";

import {
  PageHeader,
} from "@/components/ui";

import { getDb } from "@/lib/db";

import {
  updateDealAction,
} from "./actions";

import {
  requirePermission,
} from "@/modules/auth";

export const dynamic = "force-dynamic";

type EditableDeal = {
  id: string;
  deal_code: string;
  title: string;

  company_id: string;
  company_name: string;

  primary_contact_id: string | null;

  stage: string;
  amount: string;
  currency: string;
  probability: number;

  owner_name: string | null;
  expected_close_date: string | null;

  description: string | null;
  lost_reason: string | null;
};

type ContactOption = {
  id: string;
  full_name: string;
  job_title: string | null;
};

async function getEditableDeal(
  id: string,
): Promise<EditableDeal | null> {
  const result =
    await getDb().query<EditableDeal>(
      `
        SELECT
          deal.id,
          deal.deal_code,
          deal.title,

          deal.company_id,
          company.display_name
            AS company_name,

          deal.primary_contact_id,

          deal.stage,
          deal.amount::TEXT,
          deal.currency,
          deal.probability,

          deal.owner_name,
          deal.expected_close_date::TEXT,

          deal.description,
          deal.lost_reason

        FROM sales.deals AS deal

        INNER JOIN sales.companies AS company
          ON company.id = deal.company_id

        WHERE deal.id = $1
      `,
      [id],
    );

  return result.rows[0] ?? null;
}

async function listCompanyContacts(
  companyId: string,
): Promise<ContactOption[]> {
  const result =
    await getDb().query<ContactOption>(
      `
        SELECT
          id,

          TRIM(
            CONCAT(
              first_name,
              ' ',
              COALESCE(last_name, '')
            )
          ) AS full_name,

          job_title

        FROM sales.contacts

        WHERE company_id = $1
          AND contact_status = 'Active'

        ORDER BY
          LOWER(first_name),
          LOWER(COALESCE(last_name, ''))
      `,
      [companyId],
    );

  return result.rows;
}

type EditDealPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditDealPage({
  params,
}: EditDealPageProps) {
  await requirePermission("deal.update");

  const { id } = await params;

  const deal = await getEditableDeal(id);

  if (!deal) {
    notFound();
  }

  const contacts =
    await listCompanyContacts(
      deal.company_id,
    );

  const updateAction =
    updateDealAction.bind(
      null,
      deal.id,
    );

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
          href: `/deals/${deal.id}`,
        },
        {
          label: "Редактирование",
        },
      ]}
    >
      <PageHeader
        eyebrow={deal.deal_code}
        title="Редактирование сделки"
        description={`${deal.title} · ${deal.company_name}`}
        actions={
          <Link
            className="secondaryButton companyActionLink"
            href={`/deals/${deal.id}`}
          >
            Вернуться к сделке
          </Link>
        }
      />

      <form
        action={updateAction}
        className="dealEditForm"
      >
        <section className="dealEditSection">
          <div className="contactEditSectionHeader">
            <h2>Основная информация</h2>

            <p>
              Название, стадия и контакт
            </p>
          </div>

          <div className="dealEditFields">
            <label>
              Название сделки *
              <input
                name="title"
                required
                maxLength={255}
                defaultValue={deal.title}
              />
            </label>

            <div className="formColumns">
              <label>
                Стадия
                <select
                  name="stage"
                  defaultValue={deal.stage}
                >
                  <option value="Lead">
                    Лид
                  </option>

                  <option value="Qualified">
                    Квалификация
                  </option>

                  <option value="Proposal">
                    Предложение
                  </option>

                  <option value="Negotiation">
                    Переговоры
                  </option>

                  <option value="Won">
                    Выиграна
                  </option>

                  <option value="Lost">
                    Проиграна
                  </option>
                </select>
              </label>

              <label>
                Основной контакт
                <select
                  name="primary_contact_id"
                  defaultValue={
                    deal.primary_contact_id ??
                    ""
                  }
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
                        {contact.job_title
                          ? ` · ${contact.job_title}`
                          : ""}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
          </div>
        </section>

        <section className="dealEditSection">
          <div className="contactEditSectionHeader">
            <h2>Коммерческие параметры</h2>

            <p>
              Сумма, валюта и вероятность
            </p>
          </div>

          <div className="dealEditFields">
            <div className="formColumns">
              <label>
                Сумма
                <input
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={deal.amount}
                />
              </label>

              <label>
                Валюта
                <select
                  name="currency"
                  defaultValue={
                    deal.currency
                  }
                >
                  <option value="BYN">
                    BYN
                  </option>

                  <option value="RUB">
                    RUB
                  </option>

                  <option value="USD">
                    USD
                  </option>

                  <option value="EUR">
                    EUR
                  </option>
                </select>
              </label>
            </div>

            <label>
              Вероятность, %
              <input
                name="probability"
                type="number"
                min="0"
                max="100"
                defaultValue={
                  deal.probability
                }
              />
            </label>
          </div>
        </section>

        <section className="dealEditSection">
          <div className="contactEditSectionHeader">
            <h2>Ответственность и сроки</h2>

            <p>
              Менеджер и ожидаемое закрытие
            </p>
          </div>

          <div className="dealEditFields">
            <div className="formColumns">
              <label>
                Ответственный
                <input
                  name="owner_name"
                  maxLength={255}
                  defaultValue={
                    deal.owner_name ?? ""
                  }
                  placeholder="Имя менеджера"
                />
              </label>

              <label>
                Ожидаемая дата закрытия
                <input
                  name="expected_close_date"
                  type="date"
                  defaultValue={
                    deal.expected_close_date ??
                    ""
                  }
                />
              </label>
            </div>
          </div>
        </section>

        <section className="dealEditSection">
          <div className="contactEditSectionHeader">
            <h2>Контекст сделки</h2>

            <p>
              Описание и причина проигрыша
            </p>
          </div>

          <div className="dealEditFields">
            <label>
              Описание
              <textarea
                name="description"
                rows={6}
                maxLength={5000}
                defaultValue={
                  deal.description ?? ""
                }
                placeholder="Предмет сделки, требования клиента и важные договорённости"
              />
            </label>

            <label>
              Причина проигрыша
              <textarea
                name="lost_reason"
                rows={4}
                maxLength={3000}
                defaultValue={
                  deal.lost_reason ?? ""
                }
                placeholder="Используется только для стадии «Проиграна»"
              />
            </label>

            <p className="dealEditHint">
              Причина проигрыша сохраняется
              только при выборе стадии
              «Проиграна».
            </p>
          </div>
        </section>

        <div className="dealEditActions">
          <Link
            className="secondaryButton companyActionLink"
            href={`/deals/${deal.id}`}
          >
            Отмена
          </Link>

          <button
            className="submitButton"
            type="submit"
          >
            Сохранить изменения
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
