import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/app/page";
import { InviteForm, MemberControls, MemberEditButton, RemoveTimeOff, RevokeInvite, TimeOffForm } from "@/features/org/components/team-forms";
import { SettingsSection } from "@/features/org/components/settings-section";
import { categoryName } from "@/features/requests/catalog";
import { getDb, schema as s } from "@/lib/db";
import { dayKey, formatDate } from "@/lib/format";
import { ASSIGNABLE_ROLES, ROLE_LABEL, roleCan } from "@/lib/permissions";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Members" };

export default async function MembersSettings({ params }: PageProps<"/w/[org]/settings/members">) {
  const { org } = await params;
  const { user, membership: m } = await requireCapability(org, "team.view");
  const canManage = roleCan(m.kind, m.role, "team.manage");
  const canLeave = canManage || roleCan(m.kind, m.role, "work.dispatch");
  const db = await getDb();
  const today = dayKey(new Date(), m.timezone);
  const loc = { locale: m.locale, timezone: m.timezone };

  const [members, invites, leave] = await Promise.all([
    db
      .select({ id: s.users.id, name: s.users.name, email: s.users.email, role: s.memberships.role, title: s.memberships.title, skills: s.memberships.skills })
      .from(s.memberships)
      .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
      .where(eq(s.memberships.orgId, m.orgId))
      .orderBy(asc(s.users.name)),
    canManage ? db.select().from(s.invitations).where(and(eq(s.invitations.orgId, m.orgId), isNull(s.invitations.acceptedAt))).orderBy(desc(s.invitations.createdAt)) : [],
    m.kind === "provider" && canLeave
      ? db
          .select({ id: s.timeOff.id, userId: s.timeOff.userId, name: s.users.name, startsOn: s.timeOff.startsOn, endsOn: s.timeOff.endsOn, reason: s.timeOff.reason })
          .from(s.timeOff)
          .innerJoin(s.users, eq(s.users.id, s.timeOff.userId))
          .where(and(eq(s.timeOff.orgId, m.orgId), gte(s.timeOff.endsOn, today)))
          .orderBy(asc(s.timeOff.startsOn))
      : [],
  ]);
  const roles = ASSIGNABLE_ROLES[m.kind];
  const now = new Date();

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="People" description={`${members.length} ${members.length === 1 ? "person" : "people"} in ${m.name}.`}>
        <ul className="-mx-5 -my-5 divide-y divide-border">
          {members.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={p.name} />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-body font-medium text-primary">
                    <span className="truncate">{p.name}</span>
                    {p.id === user.id && <Badge>You</Badge>}
                  </p>
                  <p className="truncate text-compact text-muted">
                    {p.title ? `${p.title} · ` : ""}
                    {p.email}
                  </p>
                  {p.skills.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1" aria-label="Skills">
                      {p.skills.map((sk) => (
                        <span key={sk} className="rounded-md border border-border px-1.5 text-meta text-secondary">
                          {categoryName(sk)}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </div>
              {canManage ? (
                <div className="flex items-center gap-1 sm:justify-end">
                  <MemberEditButton org={m.slug} userId={p.id} name={p.name} title={p.title} skills={p.skills} />
                  <MemberControls org={m.slug} userId={p.id} name={p.name} role={p.role} roles={roles} isOwner={p.role === "owner"} isSelf={p.id === user.id} />
                </div>
              ) : (
                <Badge tone={p.role === "technician" ? "neutral" : "brand"}>{ROLE_LABEL[p.role]}</Badge>
              )}
            </li>
          ))}
        </ul>
      </SettingsSection>

      {canManage && invites.length > 0 && (
        <SettingsSection title="Waiting to join" description="Invitations that haven't been accepted yet.">
          <ul className="-mx-5 -my-5 divide-y divide-border">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-primary">{i.email}</span>
                  <span className="block text-compact text-muted">
                    {ROLE_LABEL[i.role]} · {i.expiresAt < now ? "expired" : `expires ${formatDate(i.expiresAt, loc)}`}
                  </span>
                </span>
                <RevokeInvite org={m.slug} id={i.id} email={i.email} />
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}

      {canManage && (
        <SettingsSection title="Invite someone" description="They get a personal link to join. Only they can use it.">
          <InviteForm org={m.slug} roles={roles} />
        </SettingsSection>
      )}

      {m.kind === "provider" && canLeave && (
        <SettingsSection title="Time off" description="Dispatch warns before booking someone into leave.">
          <div className="flex flex-col gap-5">
            {leave.length > 0 ? (
              <ul className="-mx-5 divide-y divide-border border-y border-border">
                {leave.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="min-w-0 flex-1 text-body text-primary">
                      <span className="font-medium">{l.name}</span>
                      <span className="text-secondary">
                        {" "}
                        · {l.startsOn === l.endsOn ? formatDate(l.startsOn, loc) : `${formatDate(l.startsOn, loc)} – ${formatDate(l.endsOn, loc)}`} · {l.reason}
                      </span>
                    </span>
                    <RemoveTimeOff org={m.slug} id={l.id} label={`${l.name}, ${l.startsOn}`} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No upcoming time off" body="Add leave or training days so the dispatch board plans around them." className="py-6" />
            )}
            <TimeOffForm org={m.slug} today={today} members={members.map((p) => ({ id: p.id, name: p.name }))} />
          </div>
        </SettingsSection>
      )}
    </div>
  );
}
