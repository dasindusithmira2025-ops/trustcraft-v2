import { ArrowLeft, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/page";
import { buttonClass } from "@/components/ui/button";
import { CATEGORIES, CITIES, categoryName, URGENCY_META } from "@/features/requests/catalog";
import { ChooseProviders, type Match } from "@/features/requests/components/choose-providers";
import { DescribeForm } from "@/features/requests/components/describe-form";
import { matchProviders } from "@/features/requests/queries";
import { requireUser } from "@/lib/auth/session";
import { oneOf, param, withParams } from "@/lib/url";

export const metadata: Metadata = { title: "Get help" };

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
const URGENCY_IDS = ["emergency", "soon", "flexible"] as const;

export default async function RequestPage({ searchParams }: PageProps<"/home/request">) {
  await requireUser();
  const sp = await searchParams;
  const values = {
    d: (param(sp, "d") ?? "").slice(0, 2000),
    category: oneOf(param(sp, "category"), ["", ...CATEGORY_IDS] as const, ""),
    city: oneOf(param(sp, "city"), ["", ...CITIES] as const, ""),
    address: (param(sp, "address") ?? "").slice(0, 300),
    urgency: oneOf(param(sp, "urgency"), URGENCY_IDS, "soon"),
  };
  const ready = param(sp, "step") === "match" && values.d.length >= 12 && values.category && values.city && values.address.length >= 5;

  if (!ready) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-compact font-medium text-brand-text">Step 1 of 2</p>
          <h1 className="mt-1 text-title text-primary">Tell us what&apos;s wrong</h1>
          <p className="mt-1 text-body text-secondary">The more you share, the more accurate your quotes will be.</p>
        </div>
        <DescribeForm defaults={values} />
      </div>
    );
  }

  const found = await matchProviders(values.category, values.city);
  const matches: Match[] = found.map((p) => {
    const response = p.trust.dimensions.find((d) => d.key === "response");
    const sla = p.trust.dimensions.find((d) => d.key === "sla");
    const reasons = [
      p.categoryJobs > 0 ? `${p.categoryJobs.toLocaleString("en")} verified ${categoryName(values.category).toLowerCase()} jobs` : `Offers ${categoryName(values.category).toLowerCase()}`,
      `Works in ${values.city}`,
    ];
    if (response?.score !== null && response?.score !== undefined && response.score >= 70) reasons.push(response.basis);
    if (sla?.score !== null && sla?.score !== undefined && sla.score >= 90) reasons.push(`${sla.score}% of jobs finished on time`);
    return { orgId: p.orgId, slug: p.slug, name: p.name, headline: p.headline, verified: Boolean(p.verifiedAt), trust: p.trust, reasons };
  });
  const back = withParams("/home/request", { ...values }, {});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={back} className="-ml-1 inline-flex items-center gap-1 rounded px-1 text-compact text-secondary hover:text-primary">
          <ArrowLeft className="size-3.5" aria-hidden /> Edit details
        </Link>
        <p className="mt-3 text-compact font-medium text-brand-text">Step 2 of 2</p>
        <h1 className="mt-1 text-title text-primary">Choose who to ask</h1>
        <p className="mt-1 text-body text-secondary">
          {categoryName(values.category)} · {values.city} · {URGENCY_META[values.urgency].label}. Ask up to three — you&apos;ll compare their quotes before deciding.
        </p>
      </div>
      <blockquote className="rounded-lg border-l-2 border-border-strong bg-surface-muted px-4 py-3 text-body text-secondary">{values.d}</blockquote>
      {matches.length ? (
        <ChooseProviders matches={matches} hidden={{ description: values.d, categoryId: values.category, city: values.city, address: values.address, urgency: values.urgency }} />
      ) : (
        <EmptyState
          icon={<SearchX />}
          title="No verified professionals here yet"
          body={`We don't have ${categoryName(values.category).toLowerCase()} professionals covering ${values.city} right now. Try a nearby area or a different kind of help.`}
          action={
            <Link href={back} className={buttonClass()}>
              Change details
            </Link>
          }
        />
      )}
    </div>
  );
}
