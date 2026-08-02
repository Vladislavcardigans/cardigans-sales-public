"use client";

import type {
  DealStage,
} from "@/modules/deals";


import Link from "next/link";
import {
  useMemo,
  useState,
  useTransition,
} from "react";

import {
  updateDealStageAction,
} from "@/modules/deals/server/deal-kanban.actions";

import type {
  KanbanDeal,
} from "@/modules/deals/types/deal-kanban";



type DealKanbanBoardProps = {
  initialDeals: KanbanDeal[];
  canMove: boolean;
};

const stages = [
  {
    id: "Lead",
    name: "Лид",
    description: "Новая возможность",
  },
  {
    id: "Qualified",
    name: "Квалификация",
    description: "Потребность подтверждена",
  },
  {
    id: "Proposal",
    name: "Предложение",
    description: "КП отправлено",
  },
  {
    id: "Negotiation",
    name: "Переговоры",
    description: "Обсуждение условий",
  },
  {
    id: "Won",
    name: "Выиграно",
    description: "Сделка закрыта",
  },
  {
    id: "Lost",
    name: "Проиграно",
    description: "Возможность потеряна",
  },
] as const;

function formatAmount(
  amount: string | number,
): string {
  return new Intl.NumberFormat(
    "ru-RU",
    {
      maximumFractionDigits: 0,
    },
  ).format(Number(amount));
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
    },
  ).format(new Date(value));
}

export function DealKanbanBoard({
  initialDeals,
  canMove,
}: DealKanbanBoardProps) {
  const [
    deals,
    setDeals,
  ] = useState(initialDeals);

  const [
    draggedDealId,
    setDraggedDealId,
  ] = useState<string | null>(null);

  const [
    activeDropStage,
    setActiveDropStage,
  ] = useState<string | null>(null);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    isPending,
    startTransition,
  ] = useTransition();

  const dealsByStage = useMemo(() => {
    return Object.fromEntries(
      stages.map((stage) => [
        stage.id,
        deals.filter(
          (deal) =>
            deal.stage === stage.id,
        ),
      ]),
    ) as Record<string, KanbanDeal[]>;
  }, [deals]);

  function handleDragStart(
    dealId: string,
  ) {
    if (!canMove) {
      return;
    }

    setDraggedDealId(dealId);
    setError(null);
  }

  function handleDragEnd() {
    if (!canMove) {
      return;
    }

    setDraggedDealId(null);
    setActiveDropStage(null);
  }

  function handleDrop(
    targetStage: string,
  ) {
    if (!canMove) {
      return;
    }

    if (!draggedDealId) {
      return;
    }

    const draggedDeal =
      deals.find(
        (deal) =>
          deal.id === draggedDealId,
      );

    if (
      !draggedDeal ||
      draggedDeal.stage === targetStage
    ) {
      handleDragEnd();
      return;
    }

    const previousStage =
      draggedDeal.stage;

    setDeals((currentDeals) =>
      currentDeals.map((deal) =>
        deal.id === draggedDealId
          ? {
              ...deal,
              stage: targetStage as KanbanDeal["stage"],
            }
          : deal,
      ),
    );

    handleDragEnd();

    startTransition(async () => {
      const result =
        await updateDealStageAction(
          draggedDealId,
          targetStage,
        );

      if (!result.success) {
        setDeals((currentDeals) =>
          currentDeals.map((deal) =>
            deal.id === draggedDealId
              ? {
                  ...deal,
                  stage: previousStage,
                }
              : deal,
          ),
        );

        setError(
          result.message ??
            "Не удалось изменить стадию.",
        );
      }
    });
  }

  return (
    <div className="dealKanbanWrapper">
      {error && (
        <div className="dealKanbanError">
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      {isPending && (
        <div className="dealKanbanSaving">
          Сохранение изменений…
        </div>
      )}

      <div className="dealKanbanBoard">
        {stages.map((stage) => {
          const stageDeals =
            dealsByStage[stage.id] ?? [];

          const totals =
            stageDeals.reduce<
              Record<string, number>
            >(
              (result, deal) => {
                result[deal.currency] =
                  (
                    result[deal.currency] ??
                    0
                  ) +
                  Number(deal.amount);

                return result;
              },
              {},
            );

          return (
            <section
              className={
                `dealKanbanColumn stage-${stage.id.toLowerCase()} ${
                  activeDropStage === stage.id
                    ? "dealKanbanColumnActive"
                    : ""
                }`
              }
              key={stage.id}
              onDragEnter={(event) => {
                event.preventDefault();
                setActiveDropStage(
                  stage.id,
                );
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDragLeave={(event) => {
                if (
                  event.currentTarget ===
                  event.target
                ) {
                  setActiveDropStage(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(stage.id);
              }}
            >
              <header className="dealKanbanColumnHeader">
                <div>
                  <div className="dealKanbanColumnTitle">
                    <span
                      className={
                        `dealKanbanStageDot stage-${stage.id.toLowerCase()}`
                      }
                    />

                    <h2>{stage.name}</h2>

                    <strong>
                      {stageDeals.length}
                    </strong>
                  </div>

                  <p>{stage.description}</p>
                </div>
              </header>

              <div className="dealKanbanColumnTotals">
                {Object.keys(totals).length === 0 ? (
                  <span>Нет суммы</span>
                ) : (
                  Object.entries(totals).map(
                    ([currency, amount]) => (
                      <span key={currency}>
                        {formatAmount(amount)}
                        {" "}
                        {currency}
                      </span>
                    ),
                  )
                )}
              </div>

              <div className="dealKanbanCards">
                {stageDeals.length === 0 ? (
                  <div className="dealKanbanEmpty">
                    Перетащи сделку сюда
                  </div>
                ) : (
                  stageDeals.map((deal) => (
                    <article
                      className={
                        `dealKanbanCard ${
                          draggedDealId === deal.id
                            ? "dealKanbanCardDragging"
                            : ""
                        }`
                      }
                      draggable={canMove}
                      key={deal.id}
                      onDragStart={() =>
                        handleDragStart(
                          deal.id,
                        )
                      }
                      onDragEnd={
                        handleDragEnd
                      }
                    >
                      <div className="dealKanbanCardTop">
                        <span>
                          {deal.deal_code}
                        </span>

                        <strong>
                          {deal.probability}%
                        </strong>
                      </div>

                      <Link
                        className="dealKanbanTitleLink"
                        href={`/deals/${deal.id}`}
                        draggable={false}
                      >
                        {deal.title}
                      </Link>

                      <Link
                        href={
                          `/companies/${deal.company_id}`
                        }
                        draggable={false}
                      >
                        {deal.company_name}
                      </Link>

                      <div className="dealKanbanAmount">
                        {formatAmount(
                          deal.amount,
                        )}
                        {" "}
                        {deal.currency}
                      </div>

                      <div className="dealKanbanProbability">
                        <span
                          style={{
                            width:
                              `${deal.probability}%`,
                          }}
                        />
                      </div>

                      <footer className="dealKanbanCardFooter">
                        <span>
                          {deal.owner_name ??
                            "Без ответственного"}
                        </span>

                        <time>
                          {formatDate(
                            deal.expected_close_date,
                          )}
                        </time>
                      </footer>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
