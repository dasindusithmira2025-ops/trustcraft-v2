import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth/session";

/** Setup runs outside the workspace shell: one column, nothing to distract from the next step. */
export default async function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh bg-surface-muted">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <Logo />
          <div className="flex items-center gap-3 text-compact">
            <Link href="/" className="rounded-md px-2 py-1 text-secondary hover:bg-surface-hover hover:text-primary">
              Save and finish later
            </Link>
            <form action={signOut}>
              <button type="submit" className="rounded-md px-2 py-1 text-secondary hover:bg-surface-hover hover:text-primary" aria-label={`Sign out ${user.name}`}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 pb-20 pt-8 sm:pt-12">
        {children}
      </main>
    </div>
  );
}
