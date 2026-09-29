import { asc, eq } from "drizzle-orm";
import { ArrowLeft, ArrowRight, CircleCheck, ExternalLink, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass, Button } from "@/components/ui/button";
import { CredentialForm, HoursForm, ProviderPicker, ServiceAreasForm, ServicesForm, SiteForm } from "@/features/org/components/setup-forms";
import { InviteForm } from "@/features/org/components/team-forms";
import { finishOnboarding } from "@/features/onboarding/actions";
import { BusinessForm, FacilityForm, PathPicker, ProfessionalForm } from "@/features/onboarding/components/forms";
import { loadOnboarding } from "@/features/onboarding/state";
import { nextStepId, prevStepId, STEPS, stepHref, stepIndex } from "@/features/onboarding/steps";
import { categoryName } from "@/features/requests/catalog";
import { listServiceAreas } from "@/features/service-areas/queries";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { ASSIGNABLE_ROLES } from "@/lib/permissions";
import { oneOf, param } from "@/lib/url";
import { getMemberships, resolveHome } from "@/lib/workspace";

export const metadata: Metadata = { title: "Set up TrustCraft" };

const PATH_TITLE = { professional: "Set up your professional workspace", business: "Set up your business", facility: "Set up your organization" } as const;

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser();
  const sp = await searchParams;
  const memberships = await getMemberships(user.id);
  const ob = await loadOnboarding(user.id, param(sp, "step"));

  if (ob?.completedAt) redirect(await resolveHome(user.id));
  // Nothing to set up: someone who already belongs to an organization and never started setup.
  if (!ob && memberships.length > 0) redirect(await resolveHome(user.id));

  // No path chosen yet.
  if (!ob) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-title text-primary">What are you setting up?</h1>
          <p className="mt-1 text-body text-secondary">Pick the closest fit — you can add more later. It takes a few minutes and you can stop at any point.</p>
        </div>
        <PathPicker />
        <Link href="/home" className="text-compact text-secondary hover:text-primary">
          I just need work done — take me to TrustCraft Home
        </Link>
      </div>
    );
  }

  const { path } = ob;
  const steps = STEPS[path];
  const stepId = oneOf(ob.step, steps.map((x) => x.id) as readonly string[], steps[0]!.id);
  const step = steps[stepIndex(path, stepId)]!;
  const total = steps.length - 1; // "done" is not a step of work
  const position = Math.min(stepIndex(path, stepId) + 1, total);
  const next = nextStepId(path, stepId);
  const prev = prevStepId(path, stepId);
  const org = ob.orgId ? memberships.find((m) => m.orgId === ob.orgId) : undefined;
  const db = await getDb();

  const skip = (
    <Link href={stepHref(next)} className={buttonClass({ variant: "ghost" })}>
      Skip for now
    </Link>
  );
  const nextUrl = stepHref(next);

  let body: React.ReactNode = null;
  if (!org) {
    // Before the organization exists, the first step creates it.
    body =
      path === "professional" ? <ProfessionalForm name={user.name} phone="" /> : path === "business" ? <BusinessForm /> : <FacilityForm />;
  } else if (stepId === "services") {
    const [profile] = await db.select({ categories: s.providerProfiles.categories }).from(s.providerProfiles).where(eq(s.providerProfiles.orgId, org.orgId));
    body = <ServicesForm org={org.slug} selected={profile?.categories ?? []} next={nextUrl} submit="Continue" secondary={skip} />;
  } else if (stepId === "area") {
    const areas = await listServiceAreas(org.orgId);
    body = <ServiceAreasForm org={org.slug} selected={areas.map((a) => ({ city: a.city, radiusKm: a.radiusKm }))} next={nextUrl} submit="Continue" secondary={skip} />;
  } else if (stepId === "hours") {
    body = <HoursForm org={org.slug} hours={org.businessHours} next={nextUrl} submit="Continue" secondary={skip} />;
  } else if (stepId === "verify") {
    const [profile] = await db.select({ credentials: s.providerProfiles.credentials }).from(s.providerProfiles).where(eq(s.providerProfiles.orgId, org.orgId));
    body = (
      <div className="flex flex-col gap-6">
        <div className="flex gap-3 rounded-lg border border-border bg-surface p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-text" aria-hidden />
          <div className="text-compact text-secondary">
            <p className="text-body font-medium text-primary">What verification looks at</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              <li>A trade licence, certificate or registration for the work you do</li>
              <li>Insurance, if you carry it</li>
              <li>Your first jobs signed off by customers — that is what builds your TrustScore</li>
            </ul>
          </div>
        </div>
        {profile && profile.credentials.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {profile.credentials.map((c) => (
              <li key={c.name} className="flex items-center gap-2 px-4 py-2.5 text-body text-primary">
                <CircleCheck className="size-4 text-success" aria-hidden /> {c.name}
                <span className="text-compact text-muted">· {c.issuer}</span>
              </li>
            ))}
          </ul>
        )}
        <CredentialForm org={org.slug} submit="Add credential" secondary={<Link href={nextUrl} className={buttonClass({ variant: "secondary" })}>{profile?.credentials.length ? "Continue" : "Skip for now"}</Link>} />
      </div>
    );
  } else if (stepId === "team") {
    const [invites, members] = await Promise.all([
      db.select({ email: s.invitations.email, role: s.invitations.role }).from(s.invitations).where(eq(s.invitations.orgId, org.orgId)).orderBy(asc(s.invitations.createdAt)),
      db.select({ id: s.memberships.userId }).from(s.memberships).where(eq(s.memberships.orgId, org.orgId)),
    ]);
    body = (
      <div className="flex flex-col gap-6">
        <InviteForm org={org.slug} roles={ASSIGNABLE_ROLES[org.kind]} compact />
        {invites.length > 0 && (
          <div>
            <p className="mb-2 text-compact font-medium text-primary">Invited so far</p>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {invites.map((i) => (
                <li key={i.email} className="flex items-center justify-between gap-3 px-4 py-2.5 text-body">
                  <span className="truncate text-primary">{i.email}</span>
                  <span className="text-compact capitalize text-muted">{i.role.replace("_", " ")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-compact text-muted">{members.length} {members.length === 1 ? "person is" : "people are"} on the team. You can invite more any time from Settings › Members.</p>
        <Link href={nextUrl} className={buttonClass({ variant: invites.length ? "primary" : "secondary", size: "lg", className: "self-start" })}>
          {invites.length ? "Continue" : "Skip for now"} <ArrowRight aria-hidden />
        </Link>
      </div>
    );
  } else if (stepId === "site") {
    body = <SiteForm org={org.slug} next={nextUrl} submit="Add site and continue" secondary={skip} />;
  } else if (stepId === "providers") {
    const [providers, approved] = await Promise.all([
      db
        .select({ id: s.organizations.id, name: s.organizations.name, headline: s.providerProfiles.headline, categories: s.providerProfiles.categories, verifiedAt: s.providerProfiles.verifiedAt })
        .from(s.organizations)
        .innerJoin(s.providerProfiles, eq(s.providerProfiles.orgId, s.organizations.id))
        .orderBy(asc(s.organizations.name)),
      db.select({ id: s.customers.providerOrgId }).from(s.customers).where(eq(s.customers.clientOrgId, org.orgId)),
    ]);
    body = (
      <ProviderPicker
        org={org.slug}
        providers={providers.map((p) => ({ id: p.id, name: p.name, headline: p.headline, categories: p.categories, verified: p.verifiedAt !== null }))}
        approved={approved.map((a) => a.id)}
        next={nextUrl}
        submit="Approve and continue"
        secondary={skip}
      />
    );
  } else if (stepId === "done") {
    body = <Done path={path} org={org} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        {stepId !== "done" && (
          <div className="mb-4 flex items-center gap-3">
            <p className="text-compact font-medium text-secondary" aria-live="polite">
              Step {position} of {total}
            </p>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-subtle" role="progressbar" aria-label="Setup progress" aria-valuenow={position} aria-valuemin={1} aria-valuemax={total}>
              <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${(position / total) * 100}%` }} />
            </div>
          </div>
        )}
        <h1 className="text-title text-primary">{step.title}</h1>
        {(step.description || !org) && <p className="mt-1 text-body text-secondary">{step.description || PATH_TITLE[path]}</p>}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">{body}</div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {prev && org && stepId !== "done" ? (
          <Link href={stepHref(prev)} className="inline-flex items-center gap-1.5 text-compact text-secondary hover:text-primary">
            <ArrowLeft className="size-3.5" aria-hidden /> Back
          </Link>
        ) : (
          <span />
        )}
        {org && stepId !== "done" && (
          <form action={finishOnboarding}>
            <Button type="submit" variant="ghost">
              Go to my workspace <ExternalLink aria-hidden />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

async function Done({ path, org }: { path: keyof typeof PATH_TITLE; org: { slug: string; name: string; orgId: string } }) {
  const db = await getDb();
  const [profile] = path === "facility" ? [] : await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.orgId, org.orgId));
  const [areas, members, sites] = await Promise.all([
    path === "facility" ? [] : listServiceAreas(org.orgId),
    db.select({ id: s.memberships.userId }).from(s.memberships).where(eq(s.memberships.orgId, org.orgId)),
    path === "facility" ? db.select({ id: s.locations.id }).from(s.locations).where(eq(s.locations.orgId, org.orgId)) : [],
  ]);
  const rows =
    path === "facility"
      ? [
          { label: "Sites", value: sites.length ? `${sites.length} added` : "None yet — add one in Locations" },
          { label: "Team", value: `${members.length} ${members.length === 1 ? "person" : "people"}` },
        ]
      : [
          { label: "Services", value: profile?.categories.length ? profile.categories.map(categoryName).join(", ") : "Not chosen yet — customers can't find you until you do" },
          { label: "Service areas", value: areas.length ? areas.map((a) => a.city).join(", ") : "None yet — you won't be matched to requests" },
          { label: "Team", value: `${members.length} ${members.length === 1 ? "person" : "people"}` },
        ];
  return (
    <div className="flex flex-col gap-6">
      <dl className="divide-y divide-border rounded-lg border border-border">
        {rows.map((r) => (
          <div key={r.label} className="grid gap-x-4 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="text-compact text-secondary">{r.label}</dt>
            <dd className="text-body text-primary">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-compact text-muted">Anything unfinished waits for you as a short checklist on your overview.</p>
      <form action={finishOnboarding}>
        <Button type="submit" variant="primary" size="lg">
          Open {org.name} <ArrowRight aria-hidden />
        </Button>
      </form>
    </div>
  );
}
