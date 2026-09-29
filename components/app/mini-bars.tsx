import { cn } from "@/lib/cn";

/**
 * A small bar chart for a question worth a chart: how did each of the last weeks go? Plain CSS bars
 * with a table for screen readers — no chart library, nothing to hydrate. The latest bar is emphasised.
 */
export function MiniBars({ title, unit, data, format = (n) => String(n), className }: { title: string; unit?: string; data: { label: string; value: number }[]; format?: (n: number) => string; className?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <figcaption className="text-compact font-medium text-primary">
        {title}
        {unit && <span className="ml-1.5 font-normal text-muted">{unit}</span>}
      </figcaption>
      <div className="flex h-14 items-end gap-1.5" aria-hidden>
        {data.map((d, i) => (
          <div key={d.label} className="group relative flex h-full flex-1 items-end" title={`${d.label}: ${format(d.value)}`}>
            <span className={cn("w-full rounded-t-[3px]", i === data.length - 1 ? "bg-brand" : "bg-brand/35 group-hover:bg-brand/60")} style={{ height: `${Math.max(d.value > 0 ? 6 : 2, (d.value / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-meta text-muted" aria-hidden>
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
