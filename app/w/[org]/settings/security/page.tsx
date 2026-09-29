import type { Metadata } from "next";
import { AccountSecurity } from "@/features/auth/components/account-security";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Security" };

export default async function SecuritySettings({ params }: PageProps<"/w/[org]/settings/security">) {
  const { org } = await params;
  const { user, membership: m } = await requireWorkspace(org);
  return <AccountSecurity user={user} locale={m} />;
}
