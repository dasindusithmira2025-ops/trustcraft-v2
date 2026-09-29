"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Input, Select, Textarea } from "@/components/ui/field";
import { categoryName } from "@/features/requests/catalog";
import { cn } from "@/lib/cn";
import { assignWorkOrder, previewAssignment, type ActionResult, type AssignmentPreview } from "../actions";

export type AssignableTechnician = {
  id: string;
  name: string;
  title: string | null;
  skills: string[];
  activeJobs: number;
  onSiteNow: string | null;
  /** Upcoming leave, as local calendar days — used to flag someone who is off on the chosen date. */
  leave?: { startsOn: string; endsOn: string; reason: string }[];
};

export type AssignDefaults = { assigneeUserId: string | null; date: string; time: string; timezoneOffset: string; skill: string; durationMinutes?: number };

const DURATIONS = [
  { value: 60, label: "1 hour" },
  { value: 90, label: "1½ hours" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 240, label: "Half day" },
  { value: 480, label: "Full day" },
];

/**
 * Who and when, in one step. Technicians with the job's skill come first, each showing their
 * load (and leave, on the chosen date). Before anything is saved the server says what looks
 * wrong; a dispatcher can go ahead anyway, but has to say why — and that reason is recorded.
 */
export function AssignForm({ workOrderId, technicians, defaults, onDone, submitLabel }: { workOrderId: string; technicians: AssignableTechnician[]; defaults: AssignDefaults; onDone: () => void; submitLabel?: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(assignWorkOrder, {});
  const [tech, setTech] = useState(defaults.assigneeUserId ?? "");
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [duration, setDuration] = useState(String(defaults.durationMinutes ?? 120));
  // The server's verdict for one specific choice. "Checking" is simply: the verdict is for an older choice.
  const choice = `${tech}|${date}|${time}|${duration}`;
  const [verdict, setVerdict] = useState<{ choice: string; result: AssignmentPreview }>({ choice: "", result: { warnings: [] } });
  const checking = Boolean(tech && date && time) && verdict.choice !== choice;
  const preview = verdict.choice === choice ? verdict.result : { warnings: [] };
  const err = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  // Ask the server what is wrong with the current choice, a moment after the person stops changing it.
  useEffect(() => {
    if (!tech || !date || !time) return;
    let stale = false;
    const t = setTimeout(async () => {
      const result = await previewAssignment({ workOrderId, assigneeUserId: tech, date, time, durationMinutes: Number(duration), timezoneOffset: defaults.timezoneOffset });
      if (!stale) setVerdict({ choice, result });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [tech, date, time, duration, choice, workOrderId, defaults.timezoneOffset]);

  const sorted = useMemo(
    () => [...technicians].sort((a, b) => Number(b.skills.includes(defaults.skill)) - Number(a.skills.includes(defaults.skill)) || a.activeJobs - b.activeJobs),
    [technicians, defaults.skill],
  );
  const warnings = preview.warnings;
  const blocked = warnings.some((w) => w.severity === "block");
  const needsReason = warnings.some((w) => w.severity === "warn");

  return (
    <form action={action} className="flex flex-col gap-5 p-5">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <input type="hidden" name="timezoneOffset" value={defaults.timezoneOffset} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-compact font-medium text-primary">Technician</legend>
        {sorted.map((t) => {
          const skilled = t.skills.includes(defaults.skill);
          const off = t.leave?.find((l) => l.startsOn <= date && l.endsOn >= date);
          return (
            <label
              key={t.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-surface-hover",
                "has-checked:border-brand has-checked:bg-brand-subtle has-focus-visible:outline-2 has-focus-visible:outline-focus",
              )}
            >
              <input type="radio" name="assigneeUserId" value={t.id} checked={tech === t.id} onChange={() => setTech(t.id)} className="sr-only" required />
              <Avatar name={t.name} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate text-body font-medium text-primary">{t.name}</span>
                  {skilled && <Badge tone="success">{categoryName(defaults.skill)}</Badge>}
                  {off && <Badge tone="warning">Off · {off.reason.toLowerCase()}</Badge>}
                </span>
                <span className="block truncate text-compact text-muted">{t.onSiteNow ? `On site · ${t.onSiteNow}` : (t.title ?? "Technician")}</span>
              </span>
              <span className={cn("shrink-0 text-meta tabular-nums", t.activeJobs >= 3 ? "font-medium text-warning" : "text-muted")}>{t.activeJobs} active</span>
            </label>
          );
        })}
        {err.assigneeUserId && (
          <p className="text-meta text-danger" role="alert">
            {err.assigneeUserId}
          </p>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field id="date" label="Date" error={err.date}>
          <Input {...describedBy("date", err.date)} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field id="time" label="Start time" error={err.time}>
          <Input {...describedBy("time", err.time)} type="time" value={time} onChange={(e) => setTime(e.target.value)} step={900} required />
        </Field>
      </div>
      <Field id="durationMinutes" label="Expected duration">
        <Select id="durationMinutes" name="durationMinutes" value={duration} onChange={(e) => setDuration(e.target.value)}>
          {DURATIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
      </Field>

      <div aria-live="polite" className="flex flex-col gap-2">
        {warnings.length > 0 && (
          <ul className={cn("flex flex-col gap-1.5 rounded-lg border px-3.5 py-3", blocked ? "border-danger/30 bg-danger-subtle" : "border-warning/30 bg-warning-subtle")}>
            {warnings.map((w) => (
              <li key={w.code + w.message} className="flex items-start gap-2 text-compact text-primary">
                {w.severity === "block" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
                {w.message}
              </li>
            ))}
          </ul>
        )}
        {warnings.length === 0 && tech && !checking && <p className="text-compact text-success">No conflicts found.</p>}
        {checking && <p className="text-compact text-muted">Checking the schedule…</p>}
      </div>

      {needsReason && !blocked && (
        <Field id="overrideReason" label="Why go ahead anyway?" error={err.overrideReason} hint="Kept on the work order's timeline so everyone knows this was a decision, not an accident.">
          <Textarea {...describedBy("overrideReason", err.overrideReason, true)} required maxLength={300} className="min-h-16" placeholder="e.g. Customer has no other slot this week" />
        </Field>
      )}

      {state.error && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-compact text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" pending={pending} disabled={blocked || !tech}>
        {submitLabel ?? (needsReason ? "Assign anyway" : "Assign and notify technician")}
      </Button>
    </form>
  );
}
