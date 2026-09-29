import { BadgeCheck, Camera, Scale } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/app/logo";

const PRINCIPLES = [
  { icon: BadgeCheck, title: "Verified by the customer", body: "Work only counts once the person who asked for it signs it off." },
  { icon: Camera, title: "Evidence on every visit", body: "Photos, checklists and scans are attached as the work happens." },
  { icon: Scale, title: "Reputation you can explain", body: "Every TrustScore shows exactly which jobs and reviews it comes from." },
];

/** Two-column frame for sign-in and sign-up: the form on the left, what TrustCraft stands for on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main id="main" className="flex flex-col px-5 py-6 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</div>
        <p className="text-meta text-muted">© {new Date().getFullYear()} TrustCraft</p>
      </main>

      <aside className="hidden border-l border-border bg-surface-muted lg:flex lg:flex-col lg:justify-center lg:px-16 xl:px-24">
        <div className="max-w-md">
          <p className="text-compact font-medium text-brand-text">Service operations and trust</p>
          <p className="mt-3 text-display text-primary">Physical-world work, on the record.</p>
          <p className="mt-4 text-body text-secondary">
            From a leaking tap to a portfolio of hotels, TrustCraft connects the people who need work done with verified professionals — and keeps the evidence of every job.
          </p>
          <ul className="mt-10 flex flex-col gap-6">
            {PRINCIPLES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-brand-text">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-body font-medium text-primary">{title}</span>
                  <span className="mt-0.5 block text-compact text-secondary">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
