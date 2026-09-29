"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Input, Select } from "@/components/ui/field";
import { formatMoney, parseMoney } from "@/lib/format";
import { QUOTE_LINE_KINDS, type QuoteLineKind } from "@/lib/db/schema";
import { computeTotals, parseQuantity, parseTaxPercent } from "../totals";

export type EditorLine = { description: string; kind?: QuoteLineKind; quantity: number; unit?: string; unitMinor: number };
type Row = { key: number; description: string; kind: QuoteLineKind; quantity: string; unit: string; amount: string };

const KIND_LABEL: Record<QuoteLineKind, string> = { labor: "Labour", material: "Materials", other: "Other" };

const toRow = (l: EditorLine, key: number): Row => ({ key, description: l.description, kind: l.kind ?? "other", quantity: String(l.quantity), unit: l.unit ?? "", amount: l.unitMinor ? String(l.unitMinor / 100) : "" });

/**
 * Line items with a live total: what it is, how many, how much each. Discount and tax sit under
 * the lines and change the total as you type. The form posts plain fields; the server recomputes
 * every figure from them and never trusts this sum.
 */
export function LineItemsEditor({
  currency,
  locale,
  initial,
  initialDiscount = 0,
  initialTaxBps = 0,
  taxLabel = "Tax",
  errors = {},
  starter,
}: {
  currency: string;
  locale: string;
  initial?: EditorLine[];
  initialDiscount?: number;
  initialTaxBps?: number;
  taxLabel?: string;
  errors?: Record<string, string>;
  /** Suggested first lines for an empty form. */
  starter?: EditorLine[];
}) {
  const seed = initial?.length ? initial : (starter ?? [{ description: "", kind: "labor" as const, quantity: 1, unitMinor: 0 }]);
  const [rows, setRows] = useState<Row[]>(() => seed.map((l, i) => toRow(l, i + 1)));
  const [discount, setDiscount] = useState(initialDiscount ? String(initialDiscount / 100) : "");
  const [tax, setTax] = useState(initialTaxBps ? String(initialTaxBps / 100) : "");
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const symbol = formatMoney(0, currency, locale).replace(/[\d.,\s]/g, "");
  const money = (n: number) => formatMoney(n, currency, locale);

  const priced = rows.map((r) => ({ quantity: parseQuantity(r.quantity || "1") ?? 0, unitMinor: parseMoney(r.amount, currency) ?? 0 }));
  const totals = computeTotals(priced, { discountMinor: parseMoney(discount, currency) ?? 0, taxBps: parseTaxPercent(tax) ?? 0 });

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2" aria-describedby={errors.lines ? "lines-error" : undefined}>
        <legend className="mb-1.5 text-compact font-medium text-primary">Price breakdown</legend>
        <div className="hidden grid-cols-[6.5rem_minmax(0,1fr)_4.5rem_4.5rem_7.5rem_6rem_2rem] gap-2 px-px text-meta text-muted sm:grid" aria-hidden>
          <span>Type</span>
          <span>Description</span>
          <span>Qty</span>
          <span>Unit</span>
          <span className="text-right">Price</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-2 rounded-lg border border-border p-2 sm:grid-cols-[6.5rem_minmax(0,1fr)_4.5rem_4.5rem_7.5rem_6rem_2rem] sm:border-0 sm:p-0">
            <Select name="lineKind" aria-label={`Line ${i + 1} type`} value={r.kind} onChange={(e) => update(r.key, { kind: e.target.value as QuoteLineKind })} className="col-span-3 h-9 sm:col-span-1">
              {QUOTE_LINE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <Input name="lineDescription" aria-label={`Line ${i + 1} description`} value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} placeholder="What's included" maxLength={200} className="col-span-3 sm:col-span-1" />
            <Input name="lineQuantity" aria-label={`Line ${i + 1} quantity`} value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} inputMode="decimal" className="text-right tabular-nums" />
            <Input name="lineUnit" aria-label={`Line ${i + 1} unit`} value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} placeholder="job" maxLength={12} />
            <div className="relative col-span-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-compact text-muted">{symbol}</span>
              <Input name="lineAmount" aria-label={`Line ${i + 1} amount`} value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} inputMode="decimal" placeholder="0" className="pl-8 text-right tabular-nums" />
            </div>
            <span className="text-right text-body tabular-nums text-primary" aria-label={`Line ${i + 1} total`}>
              {money(Math.round((priced[i]?.quantity ?? 0) * (priced[i]?.unitMinor ?? 0)))}
            </span>
            <button
              type="button"
              aria-label={`Remove line ${i + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              className="flex size-8 items-center justify-center justify-self-end rounded-md text-muted hover:bg-surface-hover hover:text-danger disabled:opacity-30"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={rows.length >= 20}
          onClick={() => setRows((rs) => [...rs, { key: Math.max(...rs.map((x) => x.key)) + 1, description: "", kind: "labor", quantity: "1", unit: "", amount: "" }])}
          className="flex items-center gap-1.5 self-start rounded text-compact font-medium text-brand-text hover:underline disabled:opacity-40"
        >
          <Plus className="size-3.5" aria-hidden /> Add line
        </button>
        {errors.lines && (
          <p id="lines-error" role="alert" className="text-meta text-danger">
            {errors.lines}
          </p>
        )}
      </fieldset>

      <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 border-t border-border pt-3 text-body sm:w-72">
        <dt className="text-secondary">Subtotal</dt>
        <dd className="text-right tabular-nums text-primary">{money(totals.subtotalMinor)}</dd>
        <dt>
          <label htmlFor="discount" className="text-secondary">
            Discount
          </label>
        </dt>
        <dd className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-meta text-muted">{symbol}</span>
          <Input id="discount" name="discount" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0" aria-invalid={errors.discount ? true : undefined} className="h-8 w-28 pl-7 text-right tabular-nums" />
        </dd>
        <dt>
          <label htmlFor="taxPercent" className="text-secondary">
            {taxLabel} (%)
          </label>
        </dt>
        <dd>
          <Input id="taxPercent" name="taxPercent" value={tax} onChange={(e) => setTax(e.target.value)} inputMode="decimal" placeholder="0" aria-invalid={errors.taxPercent ? true : undefined} className="ml-auto h-8 w-20 text-right tabular-nums" />
        </dd>
        {totals.taxMinor > 0 && (
          <>
            <dt className="text-secondary">{taxLabel}</dt>
            <dd className="text-right tabular-nums text-primary">{money(totals.taxMinor)}</dd>
          </>
        )}
        <dt className="border-t border-border pt-2 text-heading text-primary">Total</dt>
        <dd className="border-t border-border pt-2 text-right text-heading tabular-nums text-primary" aria-live="polite">
          {money(totals.totalMinor)}
        </dd>
      </dl>
      {(errors.discount || errors.taxPercent) && (
        <p role="alert" className="text-meta text-danger">
          {errors.discount ?? errors.taxPercent}
        </p>
      )}
    </div>
  );
}
