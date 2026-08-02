export {
  getDealProfile,
  getDealProfileData,
  listDealActivities,
  listDealTasks,
} from "./server/deal-profile.queries";

export {
  listKanbanDeals,
} from "./server/deal-kanban.queries";

export type {
  DealActivity,
  DealProfile,
  DealProfileData,
  DealTask,
} from "./types/deal-profile";

export type {
  DealStage,
  KanbanDeal,
} from "./types/deal-kanban";

export {
  dealStages,
  isDealStage,
} from "./types/deal-kanban";
