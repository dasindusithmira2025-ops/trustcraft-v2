import { BellOff } from "lucide-react";
import Link from "next/link";
import { EmptyState, Panel } from "@/components/app/page";
import { Pagination } from "@/components/app/data-table";
import { NOTIFICATION_CATEGORIES } from "@/lib/db/schema";
import { cn } from "@/lib/cn";
import { oneOf, param, withParams, type Params } from "@/lib/url";
import { listNotifications } from "../queries";
import { MarkAllRead, NotificationRow } from "./notification-row";

const TITLE: Record<(typeof NOTIFICATION_CATEGORIES)[number], string> = {
  assignment: "Assignments",
  work: "Work",
  quote: "Quotes",
  verification: "Verification",
  invoice: "Invoices",
  sla: "SLA",
  team: "Team",
  system: "Other",
};
const PAGE_SIZE = 25;

/**
 * Everything you've been told, newest first: filter by unread or by kind, jump to what it is about,
 * mark things read. The same screen serves every surface — workspace, home and field.
 */
export async function NotificationCenter({ userId, path, params, now }: { userId: string; path: string; params: Params; now: string }) {
  const unreadOnly = param(params, "show") === "unread";
  const category = oneOf(param(params, "kind"), ["", ...NOTIFICATION_CATEGORIES] as const, "") || undefined;
  const page = Math.max(1, Number(param(params, "page")) || 1);
  const data = await listNotifications(userId, { unreadOnly, category, page, pageSize: PAGE_SIZE });
  const counts = new Map(data.byCategory.map((c) => [c.category, c]));
  const present = NOTIFICATION_CATEGORIES.filter((c) => counts.has(c));

  const chip = (label: string, patch: Record<string, string | null>, active: boolean, badge?: number) => (
    <Link
      key={label}
      href={withParams(path, params, { ...patch, page: null })}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn("inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-compact", active ? "border-brand/40 bg-brand-subtle font-medium text-brand-text" : "border-border bg-surface text-secondary hover:text-primary")}
    >
      {label}
      {badge !== undefined && badge > 0 && <span className="rounded bg-danger-solid px-1 text-[10px] font-semibold leading-4 text-white">{badge}</span>}
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter notifications" className="flex flex-wrap items-center gap-1.5">
          {chip("All", { show: null, kind: null }, !unreadOnly && !category)}
          {chip("Unread", { show: "unread", kind: null }, unreadOnly && !category, data.unread)}
          {present.map((c) => chip(TITLE[c], { kind: c, show: null }, category === c, counts.get(c)!.unread))}
        </nav>
        {data.unread > 0 && <MarkAllRead />}
      </div>
      <Panel>
        {data.items.length ? (
          <ul className="divide-y divide-border">
            {data.items.map((n) => (
              <NotificationRow key={n.id} item={n} now={now} kindLabel={TITLE[n.category]} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<BellOff />} title={unreadOnly ? "You're all caught up" : "Nothing here yet"} body={unreadOnly ? "Every notification has been read." : "Assignments, quotes, verifications, payments and SLA warnings will appear here."} />
        )}
        <Pagination pathname={path} params={params} page={page} pageSize={PAGE_SIZE} total={data.total} />
      </Panel>
    </div>
  );
}
