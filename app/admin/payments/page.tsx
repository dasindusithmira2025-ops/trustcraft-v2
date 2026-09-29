import type { Metadata } from "next";
import { AdminSearch, SimpleTable } from "@/features/admin/components/simple-table";
import { adminPayments } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_LOCALE, formatDateTime, formatMoney, invoiceNumber } from "@/lib/format";
import { param } from "@/lib/url";

export const metadata: Metadata = { title: "Payments" };

export default async function AdminPayments({ searchParams }: PageProps<"/admin/payments">) {
  await requireAdmin();
  const q = param(await searchParams, "q")?.trim() || undefined;
  const rows = await adminPayments(q);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-title text-primary">Payments</h1>
        <p className="mt-1 text-body text-secondary">{q ? `Payments matching “${q}”.` : "The most recent payments. Search by reference, invoice number or a party's name."}</p>
      </div>
      <AdminSearch placeholder="Reference, invoice number or name" q={q} />
      <SimpleTable
        caption="Payments"
        rows={rows}
        rowKey={(r) => r.id}
        empty="No payments match."
        columns={[
          { header: "When", cell: (r) => <span className="whitespace-nowrap text-secondary">{formatDateTime(r.at, DEFAULT_LOCALE)}</span> },
          { header: "Reference", cell: (r) => <span className="font-medium tabular-nums text-primary">{r.reference}</span> },
          { header: "Invoice", cell: (r) => <span className="tabular-nums text-secondary">{invoiceNumber(r.invoice)} · {r.invoiceStatus.replace("_", " ")}</span> },
          { header: "Customer", cell: (r) => <span className="text-secondary">{r.customer}</span> },
          { header: "Provider", cell: (r) => <span className="text-secondary">{r.provider}</span> },
          { header: "Method", cell: (r) => <span className="text-secondary">{r.method}</span> },
          { header: "Amount", align: "right", cell: (r) => <span className={r.amount < 0 ? "text-danger" : "text-primary"}>{formatMoney(r.amount, r.currency)}</span> },
        ]}
      />
    </div>
  );
}
