import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { ArrowLeft, BadgeCheck, MapPin, Star, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { ComplianceBadge, complianceState } from "@/components/app/status";
import { TrustScorePanel } from "@/components/app/trust-score";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { categoryName } from "@/features/requests/catalog";
import { listServiceAreas } from "@/features/service-areas/queries";
import { getTrustScore } from "@/features/trust/queries";
import { getUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getMemberships } from "@/lib/workspace";

async function load(slug: string) {
  const db = await getDb();
  const [row] = await db
    .select({ org: s.organizations, profile: s.providerProfiles })
    .from(s.organizations)
    .innerJoin(s.providerProfiles, eq(s.providerProfiles.orgId, s.organizations.id))
    .where(eq(s.organizations.slug, slug));
  return row ?? null;
}

export async function generateMetadata({ params }: PageProps<"/pros/[slug]">): Promise<Metadata> {
  const row = await load((await params).slug);
  return { title: row?.org.name ?? "Professional", description: row?.profile.headline };
}

/**
 * Provider profile. Public: identity, verified credentials, TrustScore with its evidence,
 * recent verified work and reviews. Customer names are never shown.
 */
export default async function ProviderProfilePage({ params }: PageProps<"/pros/[slug]">) {
  const { slug } = await params;
  const row = await load(slug);
  if (!row) notFound();
  const { org, profile } = row;
  const user = await getUser();
  const memberships = user ? await getMemberships(user.id) : [];
  const enterprise = memberships.find((m) => m.kind === "enterprise");
  const own = memberships.find((m) => m.orgId === org.id);
  const db = await getDb();
  const now = new Date();

  const [trust, areas, recent, reviews, history] = await Promise.all([
    getTrustScore(org.id),
    listServiceAreas(org.id),
    db
      .select({ id: s.workOrders.id, title: s.workOrders.title, categoryId: s.workOrders.categoryId, verifiedAt: s.workOrders.verifiedAt, rating: s.reviews.rating })
      .from(s.workOrders)
      .leftJoin(s.reviews, eq(s.reviews.workOrderId, s.workOrders.id))
      .where(and(eq(s.workOrders.providerOrgId, org.id), eq(s.workOrders.status, "completed"), isNotNull(s.workOrders.verifiedAt)))
      .orderBy(desc(s.workOrders.verifiedAt))
      .limit(6),
    db
      .select({ id: s.reviews.id, rating: s.reviews.rating, comment: s.reviews.comment, createdAt: s.reviews.createdAt, author: s.users.name, categoryId: s.workOrders.categoryId })
      .from(s.reviews)
      .innerJoin(s.users, eq(s.users.id, s.reviews.authorUserId))
      .innerJoin(s.workOrders, eq(s.workOrders.id, s.reviews.workOrderId))
      .where(and(eq(s.reviews.providerOrgId, org.id), isNotNull(s.reviews.comment)))
      .orderBy(desc(s.reviews.createdAt))
      .limit(5),
    enterprise
      ? db
          .select({
            jobs: sql<number>`count(*)::int`,
            slaMet: sql<number>`(count(*) filter (where ${s.workOrders.completedAt} <= ${s.workOrders.slaDueAt}))::int`,
            judged: sql<number>`(count(*) filter (where ${s.workOrders.completedAt} is not null and ${s.workOrders.slaDueAt} is not null))::int`,
          })
          .from(s.workOrders)
          .where(and(eq(s.workOrders.providerOrgId, org.id), eq(s.workOrders.clientOrgId, enterprise.orgId)))
      : Promise.resolve([]),
  ]);
  const yours = history[0];
  const firstName = (n: string) => `${n.split(" ")[0]} ${n.split(" ")[1]?.[0] ?? ""}.`;

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href={user ? "/" : "/login"} aria-label="TrustCraft" className="rounded-md">
            <Logo suffix="Network" />
          </Link>
          {!user && (
            <Link href={`/login?next=/pros/${slug}`} className={buttonClass({ size: "sm" })}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main id="main" className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:py-12">
        <div className="flex min-w-0 flex-col gap-10">
          {user && (
            <Link href="/" className="-mb-6 inline-flex items-center gap-1 self-start rounded text-compact text-secondary hover:text-primary">
              <ArrowLeft className="size-3.5" aria-hidden /> Back
            </Link>
          )}
          <section aria-labelledby="identity" className="flex flex-col gap-5">
            <div className="flex items-start gap-4">
              <Avatar name={org.name} kind="org" size="xl" />
              <div className="min-w-0">
                <h1 id="identity" className="text-title text-primary">
                  {org.name}
                </h1>
                <p className="mt-1 text-body text-secondary">{profile.headline}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-compact text-secondary">
                  {profile.verifiedAt ? (
                    <span className="inline-flex items-center gap-1 font-medium text-success">
                      <BadgeCheck className="size-4" aria-hidden /> Identity verified
                    </span>
                  ) : (
                    <span className="text-muted">Verification in progress</span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5 text-muted" aria-hidden /> {profile.teamSize === 1 ? "Independent professional" : `Team of ${profile.teamSize}`}
                  </span>
                  {profile.foundedYear && <span>Since {profile.foundedYear}</span>}
                </p>
              </div>
            </div>
            {!own && (
              <div className="flex flex-wrap gap-2">
                <Link href={`/home/request?category=${profile.categories[0] ?? ""}`} className={buttonClass({ variant: "primary", size: "lg" })}>
                  Request a quote
                </Link>
              </div>
            )}
            <p className="max-w-prose text-body text-secondary">{profile.about}</p>
          </section>

          <div className="grid gap-8 sm:grid-cols-2">
            <section aria-labelledby="services" className="flex flex-col gap-2">
              <h2 id="services" className="text-heading text-primary">Services</h2>
              <ul className="flex flex-wrap gap-1.5">
                {profile.categories.map((c) => (
                  <li key={c} className="rounded-md border border-border bg-surface px-2 py-1 text-compact text-primary">{categoryName(c)}</li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="areas" className="flex flex-col gap-2">
              <h2 id="areas" className="text-heading text-primary">Service areas</h2>
              <p className="flex items-start gap-1.5 text-body text-secondary">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> {areas.length ? areas.map((a) => a.city).join(", ") : "Not listed yet"}
              </p>
            </section>
          </div>

          <section aria-labelledby="credentials" className="flex flex-col gap-3">
            <h2 id="credentials" className="text-heading text-primary">Credentials</h2>
            {profile.credentials.length ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {profile.credentials.map((c) => (
                  <li key={c.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="min-w-0">
                      <span className="block text-body text-primary">{c.name}</span>
                      <span className="block text-compact text-muted">
                        {c.issuer}
                        {c.expiresOn && ` · ${c.expiresOn < now.toISOString().slice(0, 10) ? "expired" : "valid until"} ${formatDate(c.expiresOn)}`}
                      </span>
                    </span>
                    <ComplianceBadge state={complianceState(c.expiresOn, now)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-muted">No credentials submitted yet.</p>
            )}
          </section>

          {yours && yours.jobs > 0 && (
            <section aria-labelledby="yours" className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-4">
              <h2 id="yours" className="text-heading text-primary">With {enterprise!.name}</h2>
              <p className="text-body text-secondary">
                {yours.jobs} work orders for your sites · {yours.judged ? `${Math.round((yours.slaMet / yours.judged) * 100)}% finished within SLA` : "no completed SLA work yet"}
              </p>
            </section>
          )}

          <section aria-labelledby="recent" className="flex flex-col gap-3">
            <h2 id="recent" className="text-heading text-primary">Recent verified work</h2>
            {recent.length ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {recent.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-body text-primary">{w.title}</span>
                      <span className="block text-compact text-muted">
                        {categoryName(w.categoryId)} · signed off by the customer {formatDate(w.verifiedAt!)}
                      </span>
                    </span>
                    {w.rating && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-compact tabular-nums text-secondary" aria-label={`Rated ${w.rating} out of 5`}>
                        <Star className="size-3.5 fill-warning text-warning" aria-hidden /> {w.rating}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-muted">No verified work on TrustCraft yet.</p>
            )}
          </section>

          {reviews.length > 0 && (
            <section aria-labelledby="reviews" className="flex flex-col gap-3">
              <h2 id="reviews" className="text-heading text-primary">What customers say</h2>
              <ul className="flex flex-col gap-4">
                {reviews.map((r) => (
                  <li key={r.id}>
                    <figure>
                      <div className="flex items-center gap-0.5" aria-label={`${r.rating} out of 5`}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star key={i} className={i <= r.rating ? "size-3.5 fill-warning text-warning" : "size-3.5 text-border-strong"} aria-hidden />
                        ))}
                      </div>
                      <blockquote className="mt-1.5 text-body text-primary">“{r.comment}”</blockquote>
                      <figcaption className="mt-1 text-compact text-muted">
                        {firstName(r.author)} · {categoryName(r.categoryId)} · {formatDate(r.createdAt)} · Verified job
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-xl border border-border bg-surface p-5">
            <TrustScorePanel trust={trust} audience={enterprise ? "enterprise" : "consumer"} />
          </div>
        </aside>
      </main>
    </div>
  );
}
