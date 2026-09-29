import { and, count, eq } from "drizzle-orm";
import { AppShell } from "@/components/app/shell/app-shell";
import type { Command } from "@/components/app/shell/command-menu";
import { getNotifications } from "@/features/notifications/queries";
import { navigationFor } from "@/features/workspace/navigation";
import { getDb, schema as s } from "@/lib/db";
import { ROLE_LABEL, roleCan } from "@/lib/permissions";
import { requireWorkspace } from "@/lib/workspace";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[org]">) {
  const { org } = await params;
  const { user, membership: m, memberships } = await requireWorkspace(org);
  const db = await getDb();

  const [notifications, [badge]] = await Promise.all([
    getNotifications(user.id),
    m.kind === "provider"
      ? db.select({ n: count() }).from(s.requestInvites).where(and(eq(s.requestInvites.providerOrgId, m.orgId), eq(s.requestInvites.status, "pending")))
      : db.select({ n: count() }).from(s.workOrders).where(and(eq(s.workOrders.clientOrgId, m.orgId), eq(s.workOrders.status, "awaiting_verification"))),
  ]);

  const sections = navigationFor({
    slug: m.slug,
    kind: m.kind,
    role: m.role,
    segment: m.segment,
    modules: m.modules,
    badges: m.kind === "provider" ? { requests: badge?.n } : { attention: badge?.n },
  });
  const commands: Command[] = sections.flatMap((sec) => sec.items.map((i) => ({ label: i.label, href: i.href, kind: "navigate" as const })));
  if (m.kind === "provider" && roleCan(m.kind, m.role, "work.create")) {
    commands.unshift({ label: "Create work order", href: `/w/${m.slug}/work-orders/new`, kind: "create" });
  }
  const toSwitcher = (x: typeof m) => ({ slug: x.slug, name: x.name, kind: x.kind, roleLabel: ROLE_LABEL[x.role] });

  return (
    <AppShell
      current={toSwitcher(m)}
      orgs={memberships.filter((x) => x.role !== "technician").map(toSwitcher)}
      sections={sections}
      commands={commands}
      searchPlaceholder={m.kind === "provider" ? "Search work orders, customers…" : "Search work orders, assets, providers…"}
      user={{ name: user.name, email: user.email }}
      notifications={notifications}
      footerLink={m.kind === "provider" ? { label: "View public profile", href: `/pros/${m.slug}` } : undefined}
      now={new Date().toISOString()}
    >
      {children}
    </AppShell>
  );
}
