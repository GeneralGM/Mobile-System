import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-bold leading-snug tracking-tight text-slate-900 sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function StatCard({
  title,
  value,
  note,
  icon,
  tone = "neutral",
}: {
  title: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    success: "bg-emerald-50 text-emerald-800",
    warning: "bg-amber-50 text-amber-800",
    danger: "bg-rose-50 text-rose-800",
    info: "bg-sky-50 text-sky-800",
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-600">{title}</p>
          <p className="app-num mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
        </div>
        {icon ? (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
          >
            {icon}
          </div>
        ) : null}
      </div>
      {note ? (
        <p className="mt-3 text-xs leading-6 text-slate-600">{note}</p>
      ) : null}
    </article>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-800 ring-slate-200",
    success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    warning: "bg-amber-50 text-amber-900 ring-amber-200",
    danger: "bg-rose-50 text-rose-800 ring-rose-200",
    info: "bg-sky-50 text-sky-800 ring-sky-200",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function DefList({
  items,
  className,
}: {
  items: Array<{ label: string; value: ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">{item.label}</dt>
          <dd className="mt-1 text-sm font-semibold leading-6 text-slate-900">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export const APP_INPUT_CLASS =
  "app-input w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-500 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

export const APP_LABEL_CLASS = "mb-1.5 block text-sm font-semibold text-slate-800";
