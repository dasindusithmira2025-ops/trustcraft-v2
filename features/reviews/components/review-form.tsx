"use client";

import { Star } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import type { ActionResult } from "@/features/work-orders/actions";
import { cn } from "@/lib/cn";
import { submitReview } from "../actions";

const WORDS = ["", "Poor", "Below expectations", "Okay", "Good", "Excellent"];

export function ReviewForm({ workOrderId, providerName }: { workOrderId: string; providerName: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(submitReview, {});
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const shown = hover || rating;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <fieldset>
        <legend className="text-compact font-medium text-primary">How was {providerName}?</legend>
        <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <label key={i} className="cursor-pointer rounded-md p-1 has-focus-visible:outline-2 has-focus-visible:outline-focus" onMouseEnter={() => setHover(i)}>
              <input type="radio" name="rating" value={i} checked={rating === i} onChange={() => setRating(i)} className="sr-only" aria-label={`${i} — ${WORDS[i]}`} />
              <Star className={cn("size-8 transition-colors", i <= shown ? "fill-warning text-warning" : "text-border-strong")} aria-hidden />
            </label>
          ))}
          <span className="ml-2 text-compact text-secondary" aria-live="polite">{WORDS[shown]}</span>
        </div>
        {state.fieldErrors?.rating && <p role="alert" className="mt-1 text-meta text-danger">{state.fieldErrors.rating}</p>}
      </fieldset>
      <Field id="comment" label="Anything others should know?" optional>
        <Textarea id="comment" name="comment" maxLength={1000} placeholder="Were they on time? Did they explain the work? Was the price as quoted?" />
      </Field>
      {state.error && <p role="alert" className="text-compact text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" size="lg" pending={pending} disabled={!rating} className="self-start">
        Post review
      </Button>
    </form>
  );
}
