import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailList } from "@/components/app/page";
import { Badge } from "@/components/ui/badge";
import { SignOutEverywhereForm } from "@/features/admin/components/admin-ui";
import { adminUser } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_LOCALE, formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import type { Role } from "@/lib/db/schema";

export const metadata: Metadata = { title: "User" };

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await adminUser(id);
  if (!u) notFound();
  const now = new Date();
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <Link href="/admin/users" className="text-compact text-muted hover:text-primary">
          ← Users
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-title text-primary">
          {u.name} {u.admin && <Badge tone="danger">Staff</Badge>}
        </h1>
      </div>
      <DetailList
        items={[
          { label: "Email", value: u.email },
          { label: "Phone", value: u.phone ?? <span className="text-muted">—</span> },
          { label: "Joined", value: formatDate(u.createdAt, DEFAULT_LOCALE) },
          { label: "Active sessions", value: `${u.sessions}${u.lastSeen ? ` · last seen ${formatRelative(u.lastSeen, now, DEFAULT_LOCALE)}` : ""}` },
        ]}
      />
      <section aria-labelledby="orgs">
        <h2 id="orgs" className="mb-2 text-heading text-primary">
          Organizations
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {u.orgs.map((o) => (
            <li key={o.slug} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <Link href={`/admin/organizations/${o.slug}`} className="text-body font-medium text-primary hover:underline">
                {o.name}
              </Link>
              <span className="text-compact text-muted">
                {ROLE_LABEL[o.role as Role]}
                {o.title ? ` · ${o.title}` : ""}
              </span>
            </li>
          ))}
          {u.orgs.length === 0 && <li className="px-4 py-6 text-center text-body text-muted">Not a member of any organization.</li>}
        </ul>
      </section>
      <section aria-labelledby="events">
        <h2 id="events" className="mb-2 text-heading text-primary">
          Security events
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {u.events.map((e, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 px-4 py-2 text-body">
              <span className="text-primary">{e.type}</span>
              <span className="text-meta text-muted">
                {e.ip ?? ""} {formatDateTime(e.at, DEFAULT_LOCALE)}
              </span>
            </li>
          ))}
          {u.events.length === 0 && <li className="px-4 py-6 text-center text-body text-muted">None recorded.</li>}
        </ul>
      </section>
      <section aria-labelledby="danger">
        <h2 id="danger" className="mb-2 text-heading text-primary">
          Account access
        </h2>
        <SignOutEverywhereForm userId={u.id} email={u.email} />
      </section>
    </div>
  );
}
