export type SalesNavigationItem = {
  icon: string;
  label: string;
  href: string;
  section:
    | "home"
    | "companies"
    | "contacts"
    | "deals"
    | "activities"
    | "tasks"
    | "analytics"
    | "settings";
};

export const salesNavigation: SalesNavigationItem[] = [
  {
    icon: "⌂",
    label: "Главная",
    href: "/",
    section: "home",
  },
  {
    icon: "▦",
    label: "Компании",
    href: "/companies",
    section: "companies",
  },
  {
    icon: "◎",
    label: "Контакты",
    href: "/contacts",
    section: "contacts",
  },
  {
    icon: "◇",
    label: "Сделки",
    href: "/deals",
    section: "deals",
  },
  {
    icon: "✓",
    label: "Активности",
    href: "/activities",
    section: "activities",
  },
  {
    icon: "✓",
    label: "Задачи",
    href: "/tasks",
    section: "tasks",
  },
  {
    icon: "▥",
    label: "Аналитика",
    href: "#",
    section: "analytics",
  },
  {
    icon: "⚙",
    label: "Настройки",
    href: "#",
    section: "settings",
  },
];
