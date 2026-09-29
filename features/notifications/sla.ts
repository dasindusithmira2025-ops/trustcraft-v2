import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { formatDuration, woNumber } from "@/lib/format";
import { notify } from "./notify";

const lastRun = new Map<string, number>();
const EVERY_MS = 60_000;

/**
 * Warns the people who run dispatch when a job's SLA is close or blown. Idempotent: each work order
 * warns once per state ("risk", then "breached") thanks to the dedupe key, so calling this on every
 * poll costs one query and never repeats itself.
 * ponytail: runs when a signed-in dispatcher's client polls (at most once a minute per organization).
 * A scheduled job replaces it when there is a runner; the notification model does not change.
 */
export async function generateSlaNotifications(userId: string): Promise<void> {
  const db = await getDb();
  const { rows: orgs } = await db.execute<{ org_id: string; slug: string }>(sql`
    select m.org_id, o.slug from memberships m join organizations o on o.id = m.org_id
    where m.user_id = ${userId} and o.kind = 'provider' and m.role in ('owner','admin','dispatcher')`);
  for (const org of orgs) {
    const last = lastRun.get(org.org_id) ?? 0;
    if (Date.now() - last < EVERY_MS) continue;
    lastRun.set(org.org_id, Date.now());
    const { rows } = await db.execute<{ id: string; number: number; title: string; sla_due_at: string; state: string; tech: string | null }>(sql`
      select w.id, w.number, w.title, w.sla_due_at,
             case when w.sla_due_at < now() then 'breached' else 'risk' end as state, u.name as tech
      from work_orders w left join users u on u.id = w.assignee_user_id
      where w.provider_org_id = ${org.org_id} and w.status in ('open','scheduled','in_progress','on_hold') and w.sla_due_at is not null
        and w.sla_due_at - now() <= greatest(interval '30 minutes', (w.sla_due_at - w.created_at) * 0.2)
      limit 25`);
    if (!rows.length) continue;
    const { rows: desk } = await db.execute<{ user_id: string }>(sql`select user_id from memberships where org_id = ${org.org_id} and role in ('owner','dispatcher')`);
    for (const w of rows) {
      const due = new Date(w.sla_due_at);
      await notify(
        db,
        desk.map((d) => ({
          userId: d.user_id,
          kind: "action" as const,
          category: "sla" as const,
          title: w.state === "breached" ? `${woNumber(w.number)} is past its SLA` : `${woNumber(w.number)} is close to its SLA`,
          body: `${w.title} — ${w.tech ?? "unassigned"} · ${w.state === "breached" ? `${formatDuration(Date.now() - due.getTime())} overdue` : `${formatDuration(due.getTime() - Date.now())} left`}`,
          href: `/w/${org.slug}/work-orders/${w.number}`,
          entityType: "work_order",
          entityId: w.id,
          dedupeKey: `sla:${w.id}:${w.state}`,
        })),
      );
    }
  }
}
