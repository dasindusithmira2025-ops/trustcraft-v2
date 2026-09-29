import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/app/auth-shell";
import { INTENTS } from "@/features/auth/rules";
import { getUser } from "@/lib/auth/session";
import { safePath } from "@/lib/forms";
import { oneOf, param } from "@/lib/url";
import { resolveHome } from "@/lib/workspace";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const user = await getUser();
  if (user) redirect(await resolveHome(user.id));
  const sp = await searchParams;
  const next = safePath(param(sp, "next"));
  const intent = oneOf(param(sp, "as"), INTENTS, "consumer");

  return (
    <AuthShell>
      <h1 className="text-title text-primary">Create your TrustCraft account</h1>
      <p className="mt-1 text-body text-secondary">Tell us what you&apos;re here for — we&apos;ll set up the right workspace.</p>
      <div className="mt-8">
        <SignupForm next={next} defaultIntent={intent} />
      </div>
      <p className="mt-4 text-compact text-secondary">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-brand-text hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
