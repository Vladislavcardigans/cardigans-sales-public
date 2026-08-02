import Link from "next/link";

import {
  AppLayout,
} from "@/components/layout/AppLayout";

import {
  DealKanbanBoard,
} from "@/components/deals/DealKanbanBoard";

import {
  listKanbanDeals,
} from "@/modules/deals";

import {
  PageHeader,
} from "@/components/ui";

import {
  hasPermission,
  requirePermission,
} from "@/modules/auth";

export const dynamic = "force-dynamic";



export default async function DealKanbanPage() {
  await requirePermission("deal.read");

  const canMoveDeals =
    await hasPermission("deal.move");

  const deals =
    await listKanbanDeals();

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
          label: "Kanban",
        },
      ]}
    >
      <PageHeader
        eyebrow="Коммерческая воронка"
        title="Kanban сделок"
        description={
            canMoveDeals
              ? "Перетаскивай карточки между стадиями — изменения автоматически сохраняются в PostgreSQL."
              : "Режим только для просмотра. Изменение стадий недоступно."
          }
        actions={
          <Link
            className="secondaryButton companyActionLink"
            href="/deals"
          >
            Табличный вид
          </Link>
        }
      />

      <DealKanbanBoard
        initialDeals={deals}
        canMove={canMoveDeals}
      />
    </AppLayout>
  );
}
