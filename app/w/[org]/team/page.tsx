import { asc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { Page, PageHeader, Panel } from "@/components/app/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { categoryName } from "@/features/requests/catalog";
import { getDb, schema as s } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: PageProps<"/w/[org]/team">) {
  const { org } = await params;
  const { membership: m } = await requireCapability(org, "team.view");
  const db = await getDb();
  const members = await db
    .select({
      id: s.users.id,
      name: s.users.name,
      email: s.users.email,
      phone: s.users.phone,
      role: s.memberships.role,
      title: s.memberships.title,
      skills: s.memberships.skills,
      active: sql<number>`(select count(*)::int from work_orders w where w.assignee_user_id = ${s.users.id} and w.status in ('scheduled','in_progress','on_hold'))`,
      done90: sql<number>`(select count(*)::int from work_orders w where w.assignee_user_id = ${s.users.id} and w.status = 'completed' and w.completed_at > now() - interval '90 days')`,
      onSite: sql<string | null>`(select w.title from work_orders w where w.assignee_user_id = ${s.users.id} and w.status = 'in_progress' limit 1)`,
    })
    .from(s.memberships)
    .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
    .where(eq(s.memberships.orgId, m.orgId))
    .orderBy(asc(s.users.name));

  return (
    <Page>
      <PageHeader title="Team" description={`${members.length} people in ${m.name}`} />
      <Panel>
        <ul className="divide-y divide-border">
          {members.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={p.name} />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-body font-medium text-primary">
                    <span className="truncate">{p.name}</span>
                    <Badge tone={p.role === "technician" ? "neutral" : "brand"}>{ROLE_LABEL[p.role]}</Badge>
                  </p>
                  <p className="truncate text-compact text-muted">
                    {p.title} · {p.email}
                  </p>
                </div>
              </div>
              {p.skills.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
                  {p.skills.map((sk) => (
                    <li key={sk} className="rounded-md border border-border px-1.5 py-0.5 text-meta text-secondary">
                      {categoryName(sk)}
                    </li>
                  ))}
                </ul>
              )}
              {p.role === "technician" && (
                <div className="flex gap-6 text-compact sm:w-72 sm:justify-end">
                  <span className={p.onSite ? "font-medium text-brand-text" : "text-secondary"}>{p.onSite ? "On site now" : p.active ? `${p.active} booked` : "Available"}</span>
                  <span className="tabular-nums text-muted">{p.done90} jobs in 90 days</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </Page>
  );
}
