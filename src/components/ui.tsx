import Link from "next/link";
import type { ReactNode } from "react";

export const btn = "inline-flex items-center justify-center rounded-md bg-brand px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer";
export const btnGhost = "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer";
export const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
export const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500";

export function Card({ title, children, right, className = "" }: { title?: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const tones: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};
export function Badge({ tone = "slate", children }: { tone?: keyof typeof tones | string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone] ?? tones.slate}`}>{children}</span>;
}

export function Stat({ label: l, value, tone, href }: { label: string; value: ReactNode; tone?: string; href?: string }) {
  const inner = (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${tone === "red" ? "border-rose-200" : tone === "amber" ? "border-amber-200" : "border-slate-200"}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{l}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "red" | "green" | "blue"; children: ReactNode }) {
  const c = { amber: "border-amber-200 bg-amber-50 text-amber-900", red: "border-rose-200 bg-rose-50 text-rose-900", green: "border-emerald-200 bg-emerald-50 text-emerald-900", blue: "border-sky-200 bg-sky-50 text-sky-900" }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>;
}

export const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500";
export const td = "px-3 py-2 text-sm align-top";
