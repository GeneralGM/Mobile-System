/* eslint-disable prettier/prettier */
import React, { useMemo } from "react";

interface DashboardInvoice {
  total: number;
  createdAt: number;
}

interface DashboardKPIsProps {
  invoices: DashboardInvoice[];
  previousInvoices?: DashboardInvoice[];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function getChange(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

function ChangeBadge({ value }: { value: number }) {
  const positive = value >= 0;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${
        positive
          ? "bg-emerald-950/80 border-emerald-800/80 text-emerald-400"
          : "bg-red-950/80 border-red-800/80 text-red-400"
      }`}
    >
      <span>{positive ? "↑" : "↓"}</span>
      <span>{Math.abs(value).toFixed(1)}%</span>
    </div>
  );
}

function MiniProgress({ value, max }: { value: number; max: number }) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div className="w-full h-2.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
      <div
        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export default function DashboardKPIs({
  invoices,
  previousInvoices = [],
}: DashboardKPIsProps) {
  const data = useMemo(() => {
    const revenue = invoices.reduce(
      (sum, invoice) => sum + Number(invoice.total || 0),
      0,
    );

    const previousRevenue = previousInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.total || 0),
      0,
    );

    const invoiceCount = invoices.length;
    const previousInvoiceCount = previousInvoices.length;

    const averageInvoice = invoiceCount > 0 ? revenue / invoiceCount : 0;
    const previousAverage =
      previousInvoiceCount > 0 ? previousRevenue / previousInvoiceCount : 0;

    return {
      revenue,
      previousRevenue,
      invoiceCount,
      previousInvoiceCount,
      averageInvoice,
      previousAverage,
    };
  }, [invoices, previousInvoices]);

  const revenueChange = getChange(data.revenue, data.previousRevenue);
  const invoiceChange = getChange(data.invoiceCount, data.previousInvoiceCount);
  const averageChange = getChange(data.averageInvoice, data.previousAverage);

  const maxRevenue = Math.max(data.revenue, data.previousRevenue);
  const maxInvoices = Math.max(data.invoiceCount, data.previousInvoiceCount);
  const maxAverage = Math.max(data.averageInvoice, data.previousAverage);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* إجمالي المبيعات */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-zinc-400 font-bold">إجمالي المبيعات</p>
            <h3 className="mt-2 text-3xl sm:text-4xl font-black text-white">
              {formatMoney(data.revenue)}
              <span className="text-base mr-2 text-emerald-400">EGP</span>
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-800 flex items-center justify-center text-2xl shadow-inner">
            💰
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <ChangeBadge value={revenueChange} />
        </div>

        <div className="mt-5">
          <MiniProgress value={data.revenue} max={maxRevenue} />
        </div>
      </div>

      {/* عدد الفواتير */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-zinc-400 font-bold">عدد الفواتير</p>
            <h3 className="mt-2 text-3xl sm:text-4xl font-black text-white">
              {data.invoiceCount.toLocaleString("en-US")}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-950/80 border border-blue-800 flex items-center justify-center text-2xl shadow-inner">
            🧾
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <ChangeBadge value={invoiceChange} />
        </div>

        <div className="mt-5">
          <MiniProgress value={data.invoiceCount} max={maxInvoices} />
        </div>
      </div>

      {/* متوسط الفاتورة */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-zinc-400 font-bold">
              متوسط قيمة الفاتورة
            </p>
            <h3 className="mt-2 text-3xl sm:text-4xl font-black text-white">
              {formatMoney(data.averageInvoice)}
              <span className="text-base mr-2 text-violet-400">EGP</span>
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-violet-950/80 border border-violet-800 flex items-center justify-center text-2xl shadow-inner">
            🛒
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <ChangeBadge value={averageChange} />
        </div>

        <div className="mt-5">
          <MiniProgress value={data.averageInvoice} max={maxAverage} />
        </div>
      </div>
    </div>
  );
}
