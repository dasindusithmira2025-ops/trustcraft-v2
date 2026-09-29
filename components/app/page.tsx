import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Standard page gutter and width for workspace screens. */
export function Page({ children, className, width = "wide" }: { children: ReactNode; className?: string; width?: "wide" | "narrow" }) {
  return (
    <div className={cn("mx-auto w-full px-4 pb-16 sm:px-6 lg:px-8", width === "wide" ? "max-w-[90rem]" : "max-w-4xl", className)}>{children}</div>
  );
}

export type Crumb = { label: string; href?: string };

export function PageHeader({
  breadcrumbs,
  title,
  description,
  meta,
  actions,
  className,
}: {
  breadcrumbs?: Crumb[];
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-1.5 pb-5 pt-5 sm:pt-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-compact text-muted">
            {breadcrumbs.map((c, i) => (
              <li key={i} className="flex items-center gap-1">
                {c.href ? (
                  <Link href={c.href} className="rounded-sm hover:text-primary">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page">{c.label}</span>
                )}
                {i < breadcrumbs.length - 1 && <ChevronRight className="size-3.5 text-border-strong" aria-hidden />}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-title text-primary">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-body text-secondary">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-compact text-secondary">{meta}</div>}
        </div>
        {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A titled region of a page. Sections are structure, not floating cards. */
export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-heading text-primary">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-compact text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Bordered container for lists and tables. overflow-clip (not hidden) so sticky table headers still stick to the viewport. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-clip rounded-lg border border-border bg-surface", className)}>{children}</div>;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && (
        <span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border bg-surface-muted text-muted [&_svg]:size-5">
          {icon}
        </span>
      )}
      <p className="text-heading text-primary">{title}</p>
      <p className="mt-1 max-w-sm text-body text-secondary">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A number that answers a question, linking to the list behind it. */
export function Metric({
  label,
  value,
  context,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  context?: ReactNode;
  href?: string;
  tone?: "danger" | "warning";
}) {
  const body = (
    <>
      <span className="text-compact text-secondary">{label}</span>
      <span className={cn("mt-1 text-kpi tabular-nums", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-primary")}>
        {value}
      </span>
      {context && <span className="mt-0.5 text-meta text-muted">{context}</span>}
    </>
  );
  const cls = "flex min-w-0 flex-col bg-surface px-4 py-3.5";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-surface-hover")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A row of metrics sharing one border, divided by hairlines. */
export function MetricStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4 [&>:last-child:nth-child(odd)]:col-span-2 lg:[&>:last-child:nth-child(odd)]:col-span-1", className)}>{children}</div>;
}

/** Label/value pairs for entity details. */
export function DetailList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-body", className)}>
      {items.map((it) => (
        <div key={it.label} className="contents">
          <dt className="text-secondary">{it.label}</dt>
          <dd className="min-w-0 text-primary">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
