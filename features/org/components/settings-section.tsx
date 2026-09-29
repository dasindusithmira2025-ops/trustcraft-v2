import type { ReactNode } from "react";

/** A settings screen block: one title, a sentence of context, then the form in a panel. */
export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-heading text-primary">{title}</h2>
        {description && <p className="mt-0.5 max-w-xl text-compact text-muted">{description}</p>}
      </div>
      <div className="rounded-lg border border-border bg-surface p-5">{children}</div>
    </section>
  );
}
