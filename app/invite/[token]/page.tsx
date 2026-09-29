import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/app/auth-shell";
import { buttonClass } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { AcceptInvite } from "@/features/org/components/accept-invite";
import { findInvitation } from "@/features/org/commands";
import { getUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";

export const metadata: Metadata = { title: "Join your team", robots: { index: false } };

/**
 * A personal invitation link. It only ever tells the holder about the one organization that
 * invited them; a bad or used link says nothing about who else exists.
 */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const found = await findInvitation(await getDb(), token);
  const user = await getUser();
  const valid = found && !found.invitation.acceptedAt && found.invitation.expiresAt > new Date();
  const next = encodeURIComponent(`/invite/${token}`);

  if (!valid) {
    return (
      <AuthShell>
        <h1 className="text-title text-primary">This invitation isn&apos;t valid</h1>
        <p className="mt-1 text-body text-secondary">It may have expired, been used already, or been withdrawn. Ask the person who invited you to send a new one.</p>
        <Link href="/login" className={buttonClass({ variant: "secondary", className: "mt-6 self-start" })}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  const email = found.invitation.email;
  return (
    <AuthShell>
      <h1 className="text-title text-primary">Join {found.orgName}</h1>
      <p className="mt-1 text-body text-secondary">
        You&apos;ve been invited as <span className="font-medium text-primary">{ROLE_LABEL[found.invitation.role]}</span>
        {found.invitation.title ? ` (${found.invitation.title})` : ""} for <span className="font-medium text-primary">{email}</span>.
      </p>
      <div className="mt-6">
        {!user ? (
          <div className="flex flex-col gap-3">
            <Link href={`/signup?as=consumer&next=${next}`} className={buttonClass({ variant: "primary", size: "lg" })}>
              Create an account to join
            </Link>
            <Link href={`/login?next=${next}`} className={buttonClass({ variant: "secondary", size: "lg" })}>
              I already have an account
            </Link>
            <p className="text-compact text-muted">Use {email} so the invitation matches.</p>
          </div>
        ) : user.email.toLowerCase() !== email.toLowerCase() ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="rounded-md bg-warning-subtle px-3 py-2 text-compact text-warning">
              You&apos;re signed in as {user.email}, but this invitation is for {email}.
            </p>
            <form action={signOut}>
              <button type="submit" className={buttonClass({ variant: "secondary" })}>
                Sign out and switch account
              </button>
            </form>
          </div>
        ) : (
          <AcceptInvite token={token} orgName={found.orgName} />
        )}
      </div>
    </AuthShell>
  );
}
