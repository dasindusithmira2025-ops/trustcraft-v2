import { BadgeCheck, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { TrustScoreSummary } from "@/components/app/trust-score";
import { CATEGORIES, categoryName } from "@/features/requests/catalog";
import { citiesByOrg } from "@/features/service-areas/queries";
import { getTrustScores } from "@/features/trust/queries";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { cn } from "@/lib/cn";
import { oneOf, param } from "@/lib/url";

export const metadata: Metadata = { title: "Professionals" };

/** Network discovery: verified professionals ranked by TrustScore, filterable by service. */
export default async function ProsPage({ searchParams }: PageProps<"/home/pros">) {
  await requireUser();
  const sp = await searchParams;
  const category = oneOf(param(sp, "category"), ["", ...CATEGORIES.map((c) => c.id)] as const, "");
  const db = await getDb();
  const rows = await db
    .select({ orgId: s.organizations.id, slug: s.organizations.slug, name: s.organizations.name, headline: s.providerProfiles.headline, categories: s.providerProfiles.categories, verifiedAt: s.providerProfiles.verifiedAt })
    .from(s.providerProfiles)
    .innerJoin(s.organizations, eq(s.organizations.id, s.providerProfiles.orgId));
  const list = rows.filter((r) => !category || r.categories.includes(category));
  const [trust, areas] = await Promise.all([getTrustScores(list.map((r) => r.orgId)), citiesByOrg(list.map((r) => r.orgId))]);
  list.sort((a, b) => (trust.get(b.orgId)!.score ?? -1) - (trust.get(a.orgId)!.score ?? -1));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title text-primary">Trusted professionals</h1>
        <p className="mt-1 text-body text-secondary">Ranked by TrustScore — built only from jobs customers have signed off.</p>
      </div>
      <nav aria-label="Filter by service" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {[{ id: "", name: "All" }, ...CATEGORIES].map((c) => (
            <li key={c.id}>
              <Link
                href={c.id ? `/home/pros?category=${c.id}` : "/home/pros"}
                aria-current={category === c.id ? "page" : undefined}
                className={cn("inline-flex h-8 items-center whitespace-nowrap rounded-lg border px-3 text-compact", category === c.id ? "border-brand bg-brand-subtle font-medium text-brand-text" : "border-border bg-surface text-secondary hover:text-primary")}
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <ul className="flex flex-col gap-3">
        {list.map((p) => (
          <li key={p.orgId}>
            <Link href={`/pros/${p.slug}`} className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-body font-semibold text-primary">
                  {p.name} {p.verifiedAt && <BadgeCheck className="size-4 text-success" aria-label="Verified" />}
                </span>
                <span className="mt-0.5 block truncate text-compact text-secondary">{p.categories.map(categoryName).join(" · ")} · {(areas.get(p.orgId) ?? []).slice(0, 3).join(", ")}{(areas.get(p.orgId)?.length ?? 0) > 3 ? "…" : ""}</span>
                <TrustScoreSummary trust={trust.get(p.orgId)!} className="mt-3" />
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
