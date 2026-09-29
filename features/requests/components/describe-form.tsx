"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { CATEGORIES, CITIES, URGENCY_META } from "../catalog";
import { classify } from "../classify";

type Defaults = { d: string; category: string; city: string; address: string; urgency: string };

/**
 * Step 1 — the customer describes the problem in plain words. A deterministic classifier
 * suggests the category as they type; they can always override it. Submits as a GET so the
 * next step is a real, back-button-friendly URL.
 */
export function DescribeForm({ defaults }: { defaults: Defaults }) {
  const [text, setText] = useState(defaults.d);
  const [category, setCategory] = useState(defaults.category);
  const [touched, setTouched] = useState(Boolean(defaults.category));
  const suggestion = useMemo(() => classify(text), [text]);
  const effective = touched ? category : (suggestion?.categoryId ?? category);

  return (
    <form action="/home/request" className="flex flex-col gap-6">
      <input type="hidden" name="step" value="match" />
      <Field id="d" label="What's the problem?" hint="Say what you see or hear. You don't need to know the technical name.">
        <Textarea id="d" name="d" value={text} onChange={(e) => setText(e.target.value)} required minLength={12} maxLength={2000} rows={4} aria-describedby="d-desc" className="text-[1rem]" />
      </Field>

      <fieldset>
        <legend className="text-compact font-medium text-primary">Kind of help</legend>
        {suggestion && !touched && (
          <p className="mt-1 flex items-center gap-1.5 text-meta text-brand-text" aria-live="polite">
            <Sparkles className="size-3.5" aria-hidden /> Suggested from your description — change it if it&apos;s wrong.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <label
              key={c.id}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center rounded-lg border px-3 text-body transition-colors has-focus-visible:outline-2 has-focus-visible:outline-focus",
                effective === c.id ? "border-brand bg-brand-subtle font-medium text-brand-text" : "border-border bg-surface text-primary hover:bg-surface-hover",
              )}
            >
              <input
                type="radio"
                name="category"
                value={c.id}
                checked={effective === c.id}
                onChange={() => {
                  setCategory(c.id);
                  setTouched(true);
                }}
                className="sr-only"
                required
              />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Field id="city" label="Area">
          <Select id="city" name="city" defaultValue={defaults.city || ""} required>
            <option value="" disabled>
              Choose…
            </option>
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field id="address" label="Address">
          <Input id="address" name="address" defaultValue={defaults.address} autoComplete="street-address" required minLength={5} placeholder="House number, street" />
        </Field>
      </div>

      <fieldset>
        <legend className="text-compact font-medium text-primary">How soon?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(URGENCY_META) as (keyof typeof URGENCY_META)[]).map((u) => (
            <label key={u} className="flex cursor-pointer flex-col gap-0.5 rounded-lg border border-border bg-surface p-3 transition-colors hover:bg-surface-hover has-checked:border-brand has-checked:bg-brand-subtle has-focus-visible:outline-2 has-focus-visible:outline-focus">
              <input type="radio" name="urgency" value={u} defaultChecked={(defaults.urgency || "soon") === u} className="sr-only" />
              <span className="text-body font-medium text-primary">{URGENCY_META[u].label}</span>
              <span className="text-meta text-secondary">{URGENCY_META[u].hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" variant="primary" size="xl" className="w-full sm:w-auto sm:self-end">
        See matched professionals <ArrowRight aria-hidden />
      </Button>
    </form>
  );
}
