import Link from "next/link";

type PanelHeaderProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
};

export function PanelHeader({
  title,
  description,
  actionLabel,
  actionHref,
}: PanelHeaderProps) {
  return (
    <div className="dashboardPanelHeader sharedPanelHeader">
      <div>
        <h2>{title}</h2>

        {description && (
          <p>{description}</p>
        )}
      </div>

      {actionLabel && actionHref && (
        <Link href={actionHref}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
