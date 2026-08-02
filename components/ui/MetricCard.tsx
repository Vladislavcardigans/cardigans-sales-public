import Link from "next/link";

type MetricCardProps = {
  label: string;
  value: string | number;
  description?: string;
  href?: string;
  tone?: "default" | "danger" | "success";
  className?: string;
};

export function MetricCard({
  label,
  value,
  description,
  href,
  tone = "default",
  className = "",
}: MetricCardProps) {
  const classes = [
    "dashboardMetricCard",
    "sharedMetricCard",
    tone === "danger"
      ? "dashboardMetricDanger sharedMetricDanger"
      : "",
    tone === "success"
      ? "sharedMetricSuccess"
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>

      {description && (
        <small>{description}</small>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
      >
        {content}
      </Link>
    );
  }

  return (
    <article className={classes}>
      {content}
    </article>
  );
}
