export const preferredChannels = [
  "Email",
  "Phone",
  "Telegram",
  "LinkedIn",
  "Other",
] as const;

export type PreferredChannel =
  (typeof preferredChannels)[number];

export const contactStatuses = [
  "Active",
  "Inactive",
  "Left company",
  "Unknown",
] as const;

export type ContactStatus =
  (typeof contactStatuses)[number];

export type Contact = {
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

  preferred_channel: PreferredChannel;
  contact_status: ContactStatus;

  is_decision_maker: boolean;
  do_not_contact: boolean;

  notes: string | null;

  created_at: Date;
  updated_at: Date;
};

export type CreateContactInput = {
  companyId: string;

  firstName: string;
  lastName: string | null;
  jobTitle: string | null;

  email: string | null;
  phone: string | null;
  telegram: string | null;
  linkedinUrl: string | null;

  preferredChannel: PreferredChannel;
  contactStatus: ContactStatus;

  isDecisionMaker: boolean;
  doNotContact: boolean;

  notes: string | null;
};

export type CompanyOption = {
  id: string;
  company_code: string;
  display_name: string;
};
