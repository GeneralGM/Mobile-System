/* eslint-disable prettier/prettier */
import React, { useMemo, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";

interface Invoice {
  createdAt: number;
  created_at?: string | number;
  total: number;
}

interface HourlySalesProps {
  invoices: Invoice[];
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getInvoiceTimestamp(invoice: Invoice) {
  if (invoice.createdAt) {
    return Number(invoice.createdAt);
  }

  if (invoice.created_at) {
    const raw = invoice.created_at;

    if (typeof raw === "number") {
      return raw;
    }

    const parsed = new Date(raw).getTime();

    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

export default function HourlySales({ invoices }: HourlySalesProps) {
  /**
   * التاريخ الخاص بالشارت فقط
   * مستقل تمامًا عن فلتر Dashboard الرئيسي.
   */
  const [selectedDate, setSelectedDate] = useState(formatDateInput(new Date()));

  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      sales: 0,
      invoices: 0,
    }));

    invoices.forEach((invoice) => {
      const timestamp = getInvoiceTimestamp(invoice);

      if (!timestamp) return;

      const date = new Date(timestamp);

      if (Number.isNaN(date.getTime())) return;

      const invoiceDate = formatDateInput(date);

      // لا نأخذ إلا اليوم المختار لهذا الشارت
      if (invoiceDate !== selectedDate) return;

      const hour = date.getHours();

      if (hour < 0 || hour > 23) return;

      hours[hour].sales += Number(invoice.total || 0);
      hours[hour].invoices += 1;
    });

    return hours;
  }, [invoices, selectedDate]);

  const maxSales = Math.max(...hourlyData.map((item) => item.sales), 1);

  const peakHour = hourlyData.reduce(
    (best, current) => (current.sales > best.sales ? current : best),
    hourlyData[0],
  );

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return "";

    const date = new Date(`${selectedDate}T12:00:00`);

    return new Intl.DateTimeFormat("ar-EG", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  }, [selectedDate]);

  const totalDaySales = useMemo(
    () => hourlyData.reduce((sum, item) => sum + item.sales, 0),
    [hourlyData],
  );

  const totalDayInvoices = useMemo(
    () => hourlyData.reduce((sum, item) => sum + item.invoices, 0),
    [hourlyData],
  );

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl shadow-xl overflow-hidden">
      {/* HEADER */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
          {/* TITLE */}
          <div>
            <h2 className="text-xl font-black text-white">
              المبيعات بالساعة ⏰
            </h2>
          </div>

          {/* DATE SELECTOR */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-black text-zinc-400">
              <CalendarDays className="w-4 h-4" />
              التاريخ
            </div>

            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-11 min-w-[190px] rounded-xl border border-zinc-700 bg-zinc-950 text-white px-4 font-black outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
        </div>

        {/* SELECTED DATE + SUMMARY */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-xs font-bold text-zinc-500">اليوم</span>

            <div className="text-sm font-black text-white mt-0.5">
              {selectedDateLabel}
            </div>
          </div>

          <div className="px-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-xs font-bold text-zinc-500">
              مبيعات اليوم
            </span>

            <div className="text-sm font-black text-emerald-400 mt-0.5">
              {formatMoney(totalDaySales)} EGP
            </div>
          </div>

          <div className="px-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-xs font-bold text-zinc-500">الفواتير</span>

            <div className="text-sm font-black text-white mt-0.5">
              {totalDayInvoices}
            </div>
          </div>

          {/* PEAK */}
          {peakHour && peakHour.sales > 0 && (
            <div className="mr-auto bg-amber-950/70 border border-amber-800 rounded-xl px-4 py-2 text-center">
              <div className="text-[11px] text-amber-300 font-bold">
                ساعة الذروة
              </div>

              <div className="font-black text-amber-400 text-lg mt-0.5">
                {String(peakHour.hour).padStart(2, "0")}:00
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CHART */}
      <div className="p-6 overflow-x-auto">
        <div className="min-w-[800px] px-4">
          <div className="relative h-[330px]">
            {/* GRID */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 grid grid-rows-6">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="border-t border-zinc-800" />
                ))}
              </div>
            </div>

            {/* BARS */}
            <div className="absolute inset-x-0 bottom-8 top-16 flex items-end gap-2">
              {hourlyData.map((item) => {
                const height = (item.sales / maxSales) * 100;

                const isPeak =
                  peakHour && peakHour.hour === item.hour && item.sales > 0;

                return (
                  <div
                    key={item.hour}
                    className="flex-1 h-full flex flex-col justify-end items-center group relative"
                  >
                    {/* TOOLTIP */}
                    {item.sales > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 pointer-events-none flex flex-col items-center">
                        {" "}
                        <div className="bg-zinc-950 border border-zinc-700 text-white rounded-xl px-3 py-2 text-xs font-black whitespace-nowrap shadow-xl">
                          <div>{formatMoney(item.sales)} EGP</div>

                          <div className="text-zinc-500 mt-0.5">
                            {item.invoices} فاتورة
                          </div>
                        </div>
                      </div>
                    )}

                    {/* BAR */}
                    <div
                      className={`w-full max-w-[30px] rounded-t-lg transition-all duration-500 ${
                        isPeak
                          ? "bg-amber-500 shadow-lg shadow-amber-500/20"
                          : "bg-indigo-500 hover:bg-indigo-400"
                      }`}
                      style={{
                        height: `${item.sales > 0 ? Math.max(height, 3) : 0}%`,
                      }}
                    />

                    {/* HOUR */}
                    <div className="text-[11px] font-black text-zinc-500 mt-2">
                      {String(item.hour).padStart(2, "0")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
