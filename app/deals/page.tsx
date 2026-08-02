import { AppLayout } from "@/components/layout/AppLayout";
import Link from "next/link";

import { createDealAction } from "./actions";

import {
  getDealMetrics,
  listDealCompanyOptions,
  listDealContactOptions,
  listDeals,
} from "@/lib/repositories/deal.repository";

import {
  hasPermission,
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

const stageProbability: Record<string, number> = {
  Lead: 10,
  Qualified: 30,
  Proposal: 50,
  Negotiation: 75,
  Won: 100,
  Lost: 0,
};

function formatAmount(
  amount: string | number,
  currency: string,
): string {
  return new Intl.NumberFormat(
    "ru-RU",
    {
      maximumFractionDigits: 2,
    },
  ).format(Number(amount)) +
    " " +
    currency;
}

export default async function DealsPage() {
  await requirePermission("deal.read");

  const canCreateDeals =
    await hasPermission("deal.create");

  const [
    deals,
    companies,
    contacts,
    metrics,
  ] = await Promise.all([
    listDeals(100),
    listDealCompanyOptions(),
    listDealContactOptions(),
    getDealMetrics(),
  ]);

  return (
    <AppLayout
      activeSection="deals"
      breadcrumbs={[
        {
          label: "Sales OS",
          href: "/",
        },
        {
          label: "Сделки",
        },
      ]}
    >


        <section className="pageHeader">
          <div>
            <div className="eyebrow">
              Коммерческий блок
            </div>

            <h1>Сделки</h1>

            <p>
              Коммерческие возможности,
              суммы, стадии и прогноз закрытия.
            </p>
          </div>
        </section>

        <div className="dealViewSwitcher">
          <span>
            Представление воронки
          </span>

          <div>
            <strong>
              Таблица
            </strong>

            <Link href="/deals/kanban">
              Kanban →
            </Link>
          </div>
        </div>

        <section className="metricsGrid dealMetricsGrid">
          <article className="metricCard">
            <div className="metricLabel">
              Всего сделок
            </div>

            <strong>{metrics.total}</strong>

            <p>за всё время</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Активные сделки
            </div>

            <strong>{metrics.active}</strong>

            <p>
              без выигранных и проигранных
            </p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Объём воронки
            </div>

            <strong>
              {new Intl.NumberFormat(
                "ru-RU",
                {
                  maximumFractionDigits: 0,
                },
              ).format(
                metrics.totalPipeline,
              )}
            </strong>

            <p>
              сумма в исходных валютах
            </p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Взвешенный прогноз
            </div>

            <strong>
              {new Intl.NumberFormat(
                "ru-RU",
                {
                  maximumFractionDigits: 0,
                },
              ).format(
                metrics.weightedPipeline,
              )}
            </strong>

            <p>
              сумма × вероятность
            </p>
          </article>
        </section>

        <section className="dealStageSummary">
          {[
            "Lead",
            "Qualified",
            "Proposal",
            "Negotiation",
            "Won",
            "Lost",
          ].map((stage) => {
            const stageDeals =
              deals.filter(
                (deal) =>
                  deal.stage === stage,
              );

            const total =
              stageDeals.reduce(
                (sum, deal) =>
                  sum +
                  Number(deal.amount),
                0,
              );

            return (
              <article
                key={stage}
                className={
                  `dealStageCard stage-${stage.toLowerCase()}`
                }
              >
                <div>
                  <span>
                    {stageNames[stage]}
                  </span>

                  <strong>
                    {stageDeals.length}
                  </strong>
                </div>

                <p>
                  {new Intl.NumberFormat(
                    "ru-RU",
                    {
                      maximumFractionDigits: 0,
                    },
                  ).format(total)}
                </p>
              </article>
            );
          })}
        </section>

        <section className="workspaceGrid">
          <section className="contentPanel">
            <div className="panelTitle">
              <div>
                <h2>
                  Коммерческая воронка
                </h2>

                <p>
                  Последние 100 сделок
                </p>
              </div>
            </div>

            {deals.length === 0 ? (
              <div className="emptyState">
                <div className="emptyIcon">
                  ◇
                </div>

                <h3>
                  Сделок пока нет
                </h3>

                <p>
                  Создай первую возможность
                  через форму справа.
                </p>
              </div>
            ) : (
              <div className="tableViewport">
                <div className="dealTable">
                  <div className="dealTableRow dealTableHead">
                    <div>Сделка</div>
                    <div>Компания</div>
                    <div>Стадия</div>
                    <div>Сумма</div>
                    <div>Вероятность</div>
                    <div>Закрытие</div>
                  </div>

                  {deals.map((deal) => (
                    <div
                      className="dealTableRow"
                      key={deal.id}
                    >
                      <div className="dealTitleCell">
                        <div className="dealIcon">
                          ◇
                        </div>

                        <div>
                          <Link
                            className="dealTitleLink"
                            href={`/deals/${deal.id}`}
                          >
                            {deal.title}
                          </Link>

                          <span>
                            {deal.deal_code}
                          </span>

                          {deal.owner_name && (
                            <small>
                              {deal.owner_name}
                            </small>
                          )}
                        </div>
                      </div>

                      <div className="dealCompanyCell">
                        <Link
                          href={
                            `/companies/${deal.company_id}`
                          }
                        >
                          {deal.company_name}
                        </Link>

                        <span>
                          {deal.company_code}
                        </span>

                        {deal.primary_contact_name && (
                          <small>
                            {deal.primary_contact_name}
                          </small>
                        )}
                      </div>

                      <div>
                        <span
                          className={
                            `dealStageBadge stage-${deal.stage.toLowerCase()}`
                          }
                        >
                          {stageNames[deal.stage]}
                        </span>
                      </div>

                      <div className="dealAmount">
                        {formatAmount(
                          deal.amount,
                          deal.currency,
                        )}
                      </div>

                      <div className="dealProbability">
                        <div>
                          <span
                            style={{
                              width:
                                `${deal.probability}%`,
                            }}
                          />
                        </div>

                        <strong>
                          {deal.probability}%
                        </strong>
                      </div>

                      <div className="dealCloseDate">
                        {deal.expected_close_date
                          ? new Intl.DateTimeFormat(
                              "ru-RU",
                            ).format(
                              new Date(
                                deal.expected_close_date,
                              ),
                            )
                          : "Не указана"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {canCreateDeals && (
<aside className="createPanel">
            <div className="formHeader">
              <div className="formIcon">
                ＋
              </div>

              <div>
                <h2>Новая сделка</h2>

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
                  Каждая сделка должна быть
                  связана с компанией.
                </p>

                <Link href="/companies">
                  Перейти к компаниям
                </Link>
              </div>
            ) : (
              <form
                action={createDealAction}
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

                <label>
                  Название сделки *
                  <input
                    name="title"
                    required
                    maxLength={255}
                    placeholder="Корпоративный тимбилдинг"
                  />
                </label>

                <label>
                  Основной контакт
                  <select
                    name="primary_contact_id"
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

                <div className="formColumns">
                  <label>
                    Сумма
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue="0"
                    />
                  </label>

                  <label>
                    Валюта
                    <select
                      name="currency"
                      defaultValue="BYN"
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
                  Стадия
                  <select
                    name="stage"
                    defaultValue="Lead"
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
                  Вероятность, %
                  <input
                    name="probability"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={
                      stageProbability.Lead
                    }
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
                  Ожидаемая дата закрытия
                  <input
                    name="expected_close_date"
                    type="date"
                  />
                </label>

                <label>
                  Описание
                  <textarea
                    name="description"
                    rows={4}
                    maxLength={3000}
                    placeholder="Предмет сделки, требования и важный контекст"
                  />
                </label>

                <button
                  className="submitButton"
                  type="submit"
                >
                  Создать сделку
                </button>
              </form>
            )}
          </aside>


          )}
        </section>
      </AppLayout>
  );
}
