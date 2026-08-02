export const dealStages = [
  "Lead",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
] as const;

export type DealStage =
  (typeof dealStages)[number];

export type KanbanDeal = {
  id: string;
  deal_code: string;
  title: string;

  company_id: string;
  company_name: string;
  company_code: string;

  stage: DealStage;

  amount: string;
  currency: string;
  probability: number;

  owner_name: string | null;
  expected_close_date: string | null;
};

export function isDealStage(
  value: string,
): value is DealStage {
  return dealStages.includes(
    value as DealStage,
  );
}
