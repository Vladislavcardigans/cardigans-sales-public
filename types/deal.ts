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

export const dealCurrencies = [
  "BYN",
  "RUB",
  "USD",
  "EUR",
] as const;

export type DealCurrency =
  (typeof dealCurrencies)[number];

export type Deal = {
  id: string;

  company_id: string;
  company_name: string;
  company_code: string;

  primary_contact_id: string | null;
  primary_contact_name: string | null;

  deal_code: string;
  title: string;

  stage: DealStage;

  amount: string;
  currency: DealCurrency;
  probability: number;

  owner_name: string | null;
  expected_close_date: string | null;

  description: string | null;
  lost_reason: string | null;

  created_at: Date;
  updated_at: Date;
};

export type CreateDealInput = {
  companyId: string;
  primaryContactId: string | null;

  title: string;
  stage: DealStage;

  amount: number;
  currency: DealCurrency;
  probability: number;

  ownerName: string | null;
  expectedCloseDate: string | null;

  description: string | null;
};

export type DealCompanyOption = {
  id: string;
  company_code: string;
  display_name: string;
};

export type DealContactOption = {
  id: string;
  company_id: string;
  full_name: string;
};
