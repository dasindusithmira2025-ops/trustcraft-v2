import type { Metadata } from "next";
import { EnterpriseDashboard } from "@/features/dashboard/enterprise-dashboard";
import { ProviderDashboard } from "@/features/dashboard/provider-dashboard";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: PageProps<"/w/[org]">) {
  const ws = await requireWorkspace((await params).org);
  return ws.membership.kind === "provider" ? <ProviderDashboard ws={ws} /> : <EnterpriseDashboard ws={ws} />;
}
