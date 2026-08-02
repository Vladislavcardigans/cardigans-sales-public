import Link from "next/link";

type EmptyStateProps = {
  title?: string;
  description: string;
  icon?: string;
  actionLabel?: string;
  actionHref?: string;
  compact?: boolean;
};

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  actionHref,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={
        compact
          ? "dashboardEmpty sharedEmptyState compact"
          : "emptyState sharedEmptyState"
      }
    >
      {icon && (
        <div className="emptyIcon">
          {icon}
        </div>
      )}

      {title && <h3>{title}</h3>}

      <p>{description}</p>

      {actionLabel && actionHref && (
        <Link href={actionHref}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
