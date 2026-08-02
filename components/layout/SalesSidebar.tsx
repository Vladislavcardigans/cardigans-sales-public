import Link from "next/link";

import {
  salesNavigation,
  type SalesNavigationItem,
} from "@/lib/navigation";

type SalesSidebarProps = {
  activeSection: SalesNavigationItem["section"];
};

export function SalesSidebar({
  activeSection,
}: SalesSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brandBlock">
        <div className="brandMark">CA</div>

        <div>
          <div className="brandName">
            Cardigans Arena
          </div>

          <div className="brandProduct">
            Sales OS
          </div>
        </div>
      </div>

      <nav className="navigation">
        {salesNavigation.map((item) => {
          const isPlaceholder =
            item.href === "#";

          const className =
            `navItem ${
              item.section === activeSection
                ? "active"
                : ""
            }`;

          if (isPlaceholder) {
            return (
              <span
                key={item.section}
                className={`${className} navItemDisabled`}
                title="Раздел появится позже"
              >
                <span className="navIcon">
                  {item.icon}
                </span>

                <span>{item.label}</span>
              </span>
            );
          }

          return (
            <Link
              key={item.section}
              href={item.href}
              className={className}
            >
              <span className="navIcon">
                {item.icon}
              </span>

              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebarFooter">
        <div className="userAvatar">
          ВК
        </div>

        <div>
          <strong>Владислав</strong>
          <span>Администратор</span>
        </div>
      </div>
    </aside>
  );
}
