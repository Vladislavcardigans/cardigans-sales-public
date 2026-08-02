"use server";

import {
  hasPermission,
} from "@/modules/auth";

import { revalidatePath } from "next/cache";

import { getDb } from "@/lib/db";

import {
  isDealStage,
} from "@/modules/deals/types/deal-kanban";

export type UpdateDealStageResult = {
  success: boolean;
  message?: string;
};

export async function updateDealStageAction(
  dealId: string,
  stage: string,
): Promise<UpdateDealStageResult> {

  const canMove =
    await hasPermission("deal.move");

  if (!canMove) {
    return {
      success: false,
      message:
        "Недостаточно прав для изменения стадии сделки.",
    };
  }
  const normalizedDealId =
    dealId.trim();

  const normalizedStage =
    stage.trim();

  if (!normalizedDealId) {
    return {
      success: false,
      message:
        "Не указан идентификатор сделки.",
    };
  }

  if (!isDealStage(normalizedStage)) {
    return {
      success: false,
      message:
        "Недопустимая стадия сделки.",
    };
  }

  const result = await getDb().query<{
    id: string;
    company_id: string;
  }>(
    `
      UPDATE sales.deals

      SET
        stage = $2,
        updated_at = NOW()

      WHERE id = $1
        AND stage <> $2

      RETURNING
        id,
        company_id
    `,
    [
      normalizedDealId,
      normalizedStage,
    ],
  );

  const updatedDeal = result.rows[0];

  revalidatePath("/");
  revalidatePath("/deals");
  revalidatePath("/deals/kanban");
  revalidatePath(
    `/deals/${normalizedDealId}`,
  );

  if (updatedDeal?.company_id) {
    revalidatePath(
      `/companies/${updatedDeal.company_id}`,
    );
  }

  return {
    success: true,
  };
}
