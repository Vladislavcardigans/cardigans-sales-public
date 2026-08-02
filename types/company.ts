export const companyStatuses = [
  "New",
  "Qualified",
  "Active",
  "Dormant",
  "Former",
  "Disqualified",
  "Closed",
] as const;

export type CompanyStatus = (typeof companyStatuses)[number];

export type Company = {
  id: string;
  company_code: string;
  display_name: string;
  website: string | null;
  country: string;
  industry: string | null;
  owner_name: string | null;
  lifecycle_status: CompanyStatus;
  do_not_contact: boolean;
  created_at: Date;
  updated_at: Date;
};

export type CreateCompanyInput = {
  displayName: string;
  website: string | null;
  country: string;
  industry: string | null;
  ownerName: string | null;
  lifecycleStatus: CompanyStatus;
};
