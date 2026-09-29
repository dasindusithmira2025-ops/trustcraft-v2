import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/app/auth-shell";
import { DEMO_ACCOUNTS, DEMO_ENABLED } from "@/features/auth/demo-accounts";
import { getUser } from "@/lib/auth/session";
import { safePath } from "@/lib/forms";
import { resolveHome } from "@/lib/workspace";
import { DemoSignIn, LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getUser();
  if (user) redirect(await resolveHome(user.id));
  const { next } = await searchParams;
  const safeNext = safePath(next);
  const groups = Object.groupBy(DEMO_ACCOUNTS, (a) => a.experience);

  return (
    <AuthShell>
      <h1 className="text-title text-primary">Sign in to TrustCraft</h1>
      <p className="mt-1 text-body text-secondary">One account for requesting, delivering and managing service work.</p>
      <div className="mt-8">
        <LoginForm next={safeNext} />
      </div>
      <p className="mt-4 text-compact text-secondary">
        New to TrustCraft?{" "}
        <Link href={safeNext ? `/signup?next=${encodeURIComponent(safeNext)}` : "/signup"} className="font-medium text-brand-text hover:underline">
          Create an account
        </Link>
      </p>

      {DEMO_ENABLED && (
        <section aria-labelledby="demo-heading" className="mt-10 border-t border-border pt-6">
          <div className="flex items-baseline justify-between">
            <h2 id="demo-heading" className="text-compact font-semibold text-primary">
              Demo accounts
            </h2>
            <span className="text-meta text-muted">Development data</span>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {Object.entries(groups).map(([experience, accounts]) => (
              <div key={experience}>
                <p className="px-2.5 text-meta font-medium text-muted">TrustCraft {experience}</p>
                {accounts!.map((a) => (
                  <DemoSignIn key={a.email} email={a.email} name={a.name} role={a.role} />
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </AuthShell>
  );
}
