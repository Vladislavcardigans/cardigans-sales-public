import "server-only";

import {
  getCompanyById,
  listCompanyContacts,
} from "@/lib/repositories/company.repository";

import {
  listCompanyDeals,
} from "@/lib/repositories/deal.repository";

import {
  listCompanyActivities,
} from "@/lib/repositories/activity.repository";

import {
  listCompanyTasks,
} from "@/lib/repositories/task.repository";

export async function getCompanyProfileData(
  companyId: string,
) {
  const [
    company,
    contacts,
    deals,
    activities,
    tasks,
  ] = await Promise.all([
    getCompanyById(companyId),
    listCompanyContacts(companyId),
    listCompanyDeals(companyId),
    listCompanyActivities(companyId, 50),
    listCompanyTasks(companyId, 50),
  ]);

  return {
    company,
    contacts,
    deals,
    activities,
    tasks,
  };
}

export type CompanyProfileData =
  Awaited<
    ReturnType<typeof getCompanyProfileData>
  >;
