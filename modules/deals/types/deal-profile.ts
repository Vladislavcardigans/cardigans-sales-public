export type DealProfile = {
  id: string;
  deal_code: string;
  title: string;

  company_id: string;
  company_name: string;
  company_code: string;

  primary_contact_id: string | null;
  primary_contact_name: string | null;

  stage: string;
  amount: string;
  currency: string;
  probability: number;

  owner_name: string | null;
  expected_close_date: string | null;

  description: string | null;
  lost_reason: string | null;

  created_at: Date;
  updated_at: Date;
};

export type DealActivity = {
  id: string;
  activity_code: string;
  activity_type: string;
  subject: string;
  status: string;
  priority: string;
  scheduled_at: string | null;
  completed_at: string | null;
};

export type DealTask = {
  id: string;
  task_code: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
};

export type DealProfileData = {
  deal: DealProfile | null;
  activities: DealActivity[];
  tasks: DealTask[];
};
