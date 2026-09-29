import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SimpleColumn<T> = { header: string; cell: (row: T) => ReactNode; align?: "right"; className?: string };

/** Admin lists: a plain scrolling table. Dense, no client state — lookups happen through the URL. */
export function SimpleTable<T>({ caption, columns, rows, rowKey, href, empty }: { caption: string; columns: SimpleColumn<T>[]; rows: T[]; rowKey: (r: T) => string; href?: (r: T) => string; empty: string }) {
  if (rows.length === 0) return <p className="rounded-lg border border-border bg-surface px-6 py-10 text-center text-body text-muted">{empty}</p>;
  return (
    <div tabIndex={0} role="region" aria-label={caption} className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-muted">
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th key={c.header} scope="col" className={cn("h-9 whitespace-nowrap px-3 text-meta font-medium text-secondary first:pl-4 last:pr-4", c.align === "right" && "text-right")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-b border-border last:border-0 hover:bg-surface-hover">
              {columns.map((c, i) => (
                <td key={c.header} className={cn("h-11 px-3 align-middle text-body first:pl-4 last:pr-4", c.align === "right" && "text-right tabular-nums", c.className)}>
                  {i === 0 && href ? (
                    <Link href={href(r)} className="font-medium text-primary hover:underline">
                      {c.cell(r)}
                    </Link>
                  ) : (
                    c.cell(r)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A GET form: lookups are bookmarkable and need no JavaScript. */
export function AdminSearch({ placeholder, q, hidden = {} }: { placeholder: string; q?: string; hidden?: Record<string, string> }) {
  return (
    <form method="get" role="search" className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input
        name="q"
        type="search"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-full rounded-md border border-border-strong bg-surface px-3 text-body text-primary placeholder:text-muted focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 sm:w-80"
      />
      <button type="submit" className="h-8 rounded-md border border-border-strong bg-surface px-3 text-body font-medium text-primary shadow-raised hover:bg-surface-hover">
        Search
      </button>
    </form>
  );
}
