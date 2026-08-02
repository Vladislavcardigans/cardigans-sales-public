export const taskStatuses = [
  "Todo",
  "InProgress",
  "Done",
  "Cancelled",
] as const;

export type TaskStatus =
  (typeof taskStatuses)[number];

export const taskPriorities = [
  "Low",
  "Normal",
  "High",
  "Urgent",
] as const;

export type TaskPriority =
  (typeof taskPriorities)[number];

export type SalesTask = {
  id: string;
  task_code: string;

  company_id: string;
  company_name: string;
  company_code: string;

  contact_id: string | null;
  contact_name: string | null;

  deal_id: string | null;
  deal_title: string | null;

  activity_id: string | null;
  activity_subject: string | null;

  title: string;
  description: string | null;

  status: TaskStatus;
  priority: TaskPriority;

  due_at: string | null;
  completed_at: string | null;

  owner_name: string | null;

  created_at: Date;
  updated_at: Date;
};

export type CreateTaskInput = {
  companyId: string;
  contactId: string | null;
  dealId: string | null;
  activityId: string | null;

  title: string;
  description: string | null;

  status: TaskStatus;
  priority: TaskPriority;

  dueAt: string | null;
  ownerName: string | null;
};

export type TaskOption = {
  id: string;
  company_id?: string;
  label: string;
};
