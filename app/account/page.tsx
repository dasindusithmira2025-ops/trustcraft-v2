import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { AccountSecurity } from "@/features/auth/components/account-security";
import { SettingsSection } from "@/features/org/components/settings-section";
import { NotificationPrefsForm } from "@/features/org/components/team-forms";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { DEFAULT_LOCALE } from "@/lib/format";
import { resolveHome } from "@/lib/workspace";

export const metadata: Metadata = { title: "Your account" };

/** Account settings for everyone — including people (customers, technicians) who have no workspace of their own. */
export default async function AccountPage() {
  const user = await requireUser();
  const [row] = await (await getDb()).select({ prefs: s.users.notificationPrefs }).from(s.users).where(eq(s.users.id, user.id));
  const back = await resolveHome(user.id);
  return (
    <div className="min-h-dvh bg-surface-muted">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Logo />
          <Link href={back} className="inline-flex items-center gap-1.5 text-compact text-secondary hover:text-primary">
            <ArrowLeft className="size-3.5" aria-hidden /> Back
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pb-20 pt-8">
        <div>
          <h1 className="text-title text-primary">Your account</h1>
          <p className="mt-1 text-body text-secondary">
            {user.name} · {user.email}
          </p>
        </div>
        <AccountSecurity user={user} locale={DEFAULT_LOCALE} />
        <SettingsSection title="What you're told about" description="Your own preferences, across every organization you belong to.">
          <NotificationPrefsForm muted={row?.prefs ?? {}} />
        </SettingsSection>
      </main>
    </div>
  );
}
