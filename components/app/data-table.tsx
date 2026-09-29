import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { withParams, type Params } from "@/lib/url";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "right";
  /** Columns without priority drop out on narrower desktops before the table ever scrolls. */
  minWidth?: "lg" | "xl" | "2xl";
  className?: string;
};

type Props<T> = {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** The single link per row; the whole row is clickable through it. */
  rowLink: (row: T) => { href: string; label: string };
  /** Compact rendering for phones, instead of squeezing the table. */
  mobileRow: (row: T) => ReactNode;
  pathname: string;
  params: Params;
  sort?: { key: string; dir: "asc" | "desc" };
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
};

const HIDE: Record<NonNullable<Column<unknown>["minWidth"]>, string> = {
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
  "2xl": "hidden 2xl:table-cell",
};

/**
 * Server-rendered data table. Sort and filter state lives in the URL so views can be
 * refreshed, bookmarked and shared — the foundation saved views will build on.
 */
export function DataTable<T>({ caption, columns, rows, rowKey, rowLink, mobileRow, pathname, params, sort, empty, rowClassName }: Props<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  // The last column that is always shown gets the edge padding, so it never touches the border when wider columns hide.
  const edge = columns.findLastIndex((c) => !c.minWidth);
  return (
    <>
      <table className="hidden w-full border-collapse text-left md:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-14 z-10 bg-surface-muted">
          <tr className="border-b border-border">
            {columns.map((c, ci) => {
              const active = sort?.key === c.key;
              const nextDir = active && sort?.dir === "asc" ? "desc" : "asc";
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    "h-9 whitespace-nowrap px-3 text-meta font-medium text-secondary first:pl-4 last:pr-4",
                    ci === edge && "pr-4",
                    c.align === "right" && "text-right",
                    c.minWidth && HIDE[c.minWidth],
                  )}
                >
                  {c.sortable ? (
                    <Link
                      href={withParams(pathname, params, { sort: c.key, dir: nextDir, page: null })}
                      scroll={false}
                      className={cn("inline-flex items-center gap-1 rounded-sm hover:text-primary", active && "text-primary")}
                    >
                      {c.header}
                      {active && (sort!.dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
                    </Link>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const link = rowLink(row);
            return (
              <tr key={rowKey(row)} className={cn("group relative border-b border-border last:border-0 hover:bg-surface-hover", rowClassName?.(row))}>
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      "h-11 px-3 align-middle text-body first:pl-4 last:pr-4",
                      i === edge && "pr-4",
                      c.align === "right" && "text-right tabular-nums",
                      c.minWidth && HIDE[c.minWidth],
                      c.className,
                    )}
                  >
                    {i === 0 ? (
                      <Link href={link.href} aria-label={link.label} className="rounded-sm after:absolute after:inset-0 focus-visible:outline-offset-[-2px]">
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className="divide-y divide-border md:hidden" aria-label={caption}>
        {rows.map((row) => {
          const link = rowLink(row);
          return (
            <li key={rowKey(row)}>
              <Link href={link.href} aria-label={link.label} className="block px-4 py-3 active:bg-surface-hover">
                {mobileRow(row)}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Pagination({ pathname, params, page, pageSize, total }: { pathname: string; params: Params; page: number; pageSize: number; total: number }) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const last = Math.ceil(total / pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
      <p className="text-compact text-muted tabular-nums">
        {from.toLocaleString("en")}–{to.toLocaleString("en")} of {total.toLocaleString("en")}
      </p>
      <div className="flex gap-1.5">
        <Link
          href={withParams(pathname, params, { page: page > 2 ? String(page - 1) : null })}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          className={buttonClass({ size: "sm" })}
        >
          <ChevronLeft aria-hidden /> Previous
        </Link>
        <Link
          href={withParams(pathname, params, { page: String(page + 1) })}
          aria-disabled={page >= last}
          tabIndex={page >= last ? -1 : undefined}
          className={buttonClass({ size: "sm" })}
        >
          Next <ChevronRight aria-hidden />
        </Link>
      </div>
    </nav>
  );
}

/** Saved-view style tabs driven by a URL param. */
export function ViewTabs({
  pathname,
  params,
  param = "view",
  views,
  current,
}: {
  pathname: string;
  params: Params;
  param?: string;
  views: { id: string; label: string; count?: number }[];
  current: string;
}) {
  return (
    <nav aria-label="Views" className="-mb-px flex gap-1 overflow-x-auto">
      {views.map((v, i) => {
        const active = v.id === current;
        return (
          <Link
            key={v.id}
            href={withParams(pathname, params, { [param]: i === 0 ? null : v.id, page: null })}
            aria-current={active ? "page" : undefined}
            scroll={false}
            className={cn(
              "flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-body transition-colors",
              active ? "border-brand font-medium text-primary" : "border-transparent text-secondary hover:text-primary",
            )}
          >
            {v.label}
            {v.count !== undefined && (
              <span className={cn("rounded px-1 text-meta tabular-nums", active ? "bg-brand-subtle text-brand-text" : "bg-neutral-subtle text-muted")}>
                {v.count.toLocaleString("en")}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
