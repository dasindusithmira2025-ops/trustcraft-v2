import { CalendarDays, Clock, Paperclip } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney } from "@/lib/format";
import type { QuoteLine } from "@/lib/db/schema";
import { bpsToPercent, computeTotals, lineTotal } from "@/features/commercial/totals";

type Doc = {
  lines: QuoteLine[];
  discountMinor: number;
  taxBps: number;
  currency: string;
  inclusions: string | null;
  exclusions: string | null;
  note: string | null;
  earliestStart: Date | null;
  validUntil: Date | null;
};

const KIND: Record<string, string> = { labor: "Labour", material: "Materials", other: "" };

/**
 * A quote as the customer reads it: what will be done, what it costs line by line, what is and
 * isn't covered, and how long the offer stands. Figures are recomputed from the lines, so the page
 * can never disagree with itself. Older quotes (single amount, no tax) render the same way.
 */
export function QuoteDocument({ quote, locale, timezone, taxLabel = "Tax", attachments = [], next, className }: { quote: Doc; locale: string; timezone: string; taxLabel?: string; attachments?: { id: string; name: string }[]; next?: ReactNode; className?: string }) {
  const totals = computeTotals(quote.lines, { discountMinor: quote.discountMinor, taxBps: quote.taxBps });
  const money = (n: number) => formatMoney(n, quote.currency, locale);
  const loc = { locale, timezone };
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <table className="w-full text-body">
        <caption className="sr-only">Quote lines</caption>
        <thead>
          <tr className="border-b border-border text-meta text-muted">
            <th scope="col" className="pb-1.5 text-left font-medium">
              What will be done
            </th>
            <th scope="col" className="pb-1.5 text-right font-medium">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((l, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <td className="py-2.5 pr-4 align-top">
                <span className="block text-primary">{l.description}</span>
                <span className="block text-compact text-muted">
                  {[l.kind && KIND[l.kind], l.quantity !== 1 || l.unit ? `${l.quantity}${l.unit ? ` ${l.unit}` : ""} × ${money(l.unitMinor)}` : null].filter(Boolean).join(" · ")}
                </span>
              </td>
              <td className="py-2.5 text-right align-top tabular-nums text-primary">{money(lineTotal(l))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {(quote.discountMinor > 0 || quote.taxBps > 0) && (
            <tr className="border-t border-border">
              <th scope="row" className="pt-2 text-left text-compact font-normal text-secondary">
                Subtotal
              </th>
              <td className="pt-2 text-right text-compact tabular-nums text-secondary">{money(totals.subtotalMinor)}</td>
            </tr>
          )}
          {totals.discountMinor > 0 && (
            <tr>
              <th scope="row" className="text-left text-compact font-normal text-secondary">
                Discount
              </th>
              <td className="text-right text-compact tabular-nums text-secondary">−{money(totals.discountMinor)}</td>
            </tr>
          )}
          {totals.taxMinor > 0 && (
            <tr>
              <th scope="row" className="text-left text-compact font-normal text-secondary">
                {taxLabel} ({bpsToPercent(quote.taxBps)})
              </th>
              <td className="text-right text-compact tabular-nums text-secondary">{money(totals.taxMinor)}</td>
            </tr>
          )}
          <tr>
            <th scope="row" className="pt-2 text-left text-heading text-primary">
              Total
            </th>
            <td className="pt-2 text-right text-heading tabular-nums text-primary">{money(totals.totalMinor)}</td>
          </tr>
        </tfoot>
      </table>

      {(quote.inclusions || quote.exclusions) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {quote.inclusions && (
            <section aria-label="What's included">
              <h4 className="text-compact font-medium text-primary">Included</h4>
              <p className="mt-0.5 whitespace-pre-line text-compact text-secondary">{quote.inclusions}</p>
            </section>
          )}
          {quote.exclusions && (
            <section aria-label="What's not included">
              <h4 className="text-compact font-medium text-primary">Not included</h4>
              <p className="mt-0.5 whitespace-pre-line text-compact text-secondary">{quote.exclusions}</p>
            </section>
          )}
        </div>
      )}
      {quote.note && <p className="text-compact text-secondary">“{quote.note}”</p>}
      {attachments.length > 0 && (
        <ul aria-label="Attachments" className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <li key={a.id}>
              <a href={`/api/files/${a.id}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-compact text-primary hover:bg-surface-hover">
                <Paperclip className="size-3.5 text-muted" aria-hidden /> {a.name}
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="flex flex-wrap gap-x-5 gap-y-1 text-meta text-muted">
        {quote.earliestStart && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden /> Can start {formatDate(quote.earliestStart, loc)}
          </span>
        )}
        {quote.validUntil && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> Valid until {formatDate(quote.validUntil, loc)}
          </span>
        )}
      </p>
      {next}
    </div>
  );
}
