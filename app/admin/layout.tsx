import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { AdminNav } from "@/features/admin/components/admin-ui";
import { requireAdmin } from "@/lib/auth/session";

export const metadata = { title: { default: "Admin", template: "%s · TrustCraft Admin" }, robots: { index: false, follow: false } };

/**
 * TrustCraft Admin: internal, privileged, visually a cousin of the product but unmistakably a
 * different room. Anyone who is not staff gets a 404 from `requireAdmin` — the URL never confirms it exists.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  return (
    <div className="flex min-h-dvh border-t-[3px] border-danger">
      <a href="#main" className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex items-center gap-2 p-3">
          <Logo suffix="Admin" />
        </div>
        <div className="flex-1 overflow-y-auto px-2.5 pb-4 pt-2">
          <AdminNav />
        </div>
        <div className="border-t border-border p-3 text-meta text-muted">
          <p className="truncate">{admin.email}</p>
          <Link href="/" className="mt-1 inline-block text-compact font-medium text-brand-text hover:underline">
            Leave admin
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border bg-danger-subtle/50 px-4 py-2 text-compact text-secondary sm:px-6">
          <span className="rounded bg-danger-solid px-1.5 py-0.5 text-meta font-semibold text-white">Privileged</span>
          Everything you change here is recorded with your name.
          <nav aria-label="Admin (small screens)" className="ml-auto flex gap-3 lg:hidden">
            <Link href="/admin" className="font-medium text-brand-text">
              Menu
            </Link>
          </nav>
        </div>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
