export const activityTypes = [
  "Call",
  "Email",
  "Meeting",
  "Message",
  "Note",
  "Task",
] as const;

export type ActivityType =
  (typeof activityTypes)[number];

export const activityStatuses = [
  "Planned",
  "Completed",
  "Cancelled",
] as const;

export type ActivityStatus =
  (typeof activityStatuses)[number];

export const activityPriorities = [
  "Low",
  "Normal",
  "High",
  "Urgent",
] as const;

export type ActivityPriority =
  (typeof activityPriorities)[number];

export type Activity = {
  id: string;
  activity_code: string;

  company_id: string;
  company_name: string;
  company_code: string;

  contact_id: string | null;
  contact_name: string | null;

  deal_id: string | null;
  deal_title: string | null;
  deal_code: string | null;

  activity_type: ActivityType;
  subject: string;

  status: ActivityStatus;
  priority: ActivityPriority;

  scheduled_at: string | null;
  completed_at: string | null;

  owner_name: string | null;

  description: string | null;
  outcome: string | null;

  created_at: Date;
  updated_at: Date;
};

export type CreateActivityInput = {
  companyId: string;
  contactId: string | null;
  dealId: string | null;

  activityType: ActivityType;
  subject: string;

  status: ActivityStatus;
  priority: ActivityPriority;

  scheduledAt: string | null;
  ownerName: string | null;

  description: string | null;
  outcome: string | null;
};

export type ActivityCompanyOption = {
  id: string;
  display_name: string;
  company_code: string;
};

export type ActivityContactOption = {
  id: string;
  company_id: string;
  full_name: string;
};

export type ActivityDealOption = {
  id: string;
  company_id: string;
  title: string;
  deal_code: string;
};
