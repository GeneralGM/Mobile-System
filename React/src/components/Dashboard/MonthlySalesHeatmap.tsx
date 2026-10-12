/* eslint-disable prettier/prettier */
import React, { useMemo, useState } from "react";
import type { Invoice } from "@/lib/pos-store";

interface MonthlySalesHeatmapProps {
  invoices: Invoice[];
  formatMoney?: (value: number) => string;
}

interface DayData {
  date: Date;
  key: string;
  sales: number;
  invoices: number;
}

const DEFAULT_FORMAT_MONEY = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);

const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const WEEK_DAYS_AR = [
  "السبت",
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
];

const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getLevel = (sales: number) => {
  if (sales <= 0) return 0;
  if (sales < 20000) return 1;
  if (sales < 30000) return 2;
  if (sales < 40000) return 3;
  if (sales < 60000) return 4;

  return 5;
};

const getLevelClass = (level: number) => {
  switch (level) {
    case 1:
      return "bg-emerald-950/70 border-emerald-900/70";
    case 2:
      return "bg-emerald-900/80 border-emerald-800";
    case 3:
      return "bg-emerald-800/85 border-emerald-700";
    case 4:
      return "bg-emerald-600 border-emerald-500";
    case 5:
      return "bg-emerald-400 border-emerald-300";
    default:
      return "bg-zinc-950/70 border-zinc-800";
  }
};

const getLevelTextClass = (level: number) => {
  if (level >= 4) return "text-zinc-950";

  if (level >= 2) return "text-emerald-100";

  return "text-zinc-400";
};

export default function MonthlySalesHeatmap({
  invoices,
  formatMoney = DEFAULT_FORMAT_MONEY,
}: MonthlySalesHeatmapProps) {
  const now = new Date();

  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const monthlyData = useMemo(() => {
    const map: Record<
      string,
      {
        sales: number;
        invoices: number;
      }
    > = {};

    invoices.forEach((invoice) => {
      const timestamp = Number(invoice.createdAt || 0);

      if (!timestamp) return;

      const date = new Date(timestamp);

      if (Number.isNaN(date.getTime())) return;

      if (
        date.getFullYear() !== selectedYear ||
        date.getMonth() !== selectedMonth
      ) {
        return;
      }

      const key = getDateKey(date);

      if (!map[key]) {
        map[key] = {
          sales: 0,
          invoices: 0,
        };
      }

      map[key].sales += Number(invoice.total || 0);
      map[key].invoices += 1;
    });

    return map;
  }, [invoices, selectedMonth, selectedYear]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth, 1);

    const lastDay = new Date(selectedYear, selectedMonth + 1, 0);

    /*
     * JS:
     * Sunday = 0
     * Monday = 1
     * ...
     * Saturday = 6
     *
     * إحنا عايزين الأسبوع يبدأ السبت.
     */
    const firstDaySaturdayIndex = (firstDay.getDay() + 1) % 7;

    const days: Array<DayData | null> = [];

    for (let i = 0; i < firstDaySaturdayIndex; i++) {
      days.push(null);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(selectedYear, selectedMonth, day);

      const key = getDateKey(date);

      days.push({
        date,
        key,
        sales: monthlyData[key]?.sales || 0,
        invoices: monthlyData[key]?.invoices || 0,
      });
    }

    return days;
  }, [selectedMonth, selectedYear, monthlyData]);

  const monthTotal = useMemo(
    () => Object.values(monthlyData).reduce((sum, item) => sum + item.sales, 0),
    [monthlyData],
  );

  const monthInvoices = useMemo(
    () =>
      Object.values(monthlyData).reduce((sum, item) => sum + item.invoices, 0),
    [monthlyData],
  );

  const bestDay = useMemo(() => {
    return Object.entries(monthlyData).reduce<{
      key: string;
      sales: number;
      invoices: number;
    } | null>((best, [key, value]) => {
      if (!best || value.sales > best.sales) {
        return {
          key,
          ...value,
        };
      }

      return best;
    }, null);
  }, [monthlyData]);

  const changeMonth = (direction: number) => {
    const next = new Date(selectedYear, selectedMonth + direction, 1);

    setSelectedMonth(next.getMonth());
    setSelectedYear(next.getFullYear());
  };

  return (
    <div className="bg-zinc-900/90 border text-center align-center border-zinc-800 rounded-3xl shadow-xl">
      {/* HEADER */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          {/* MONTH NAVIGATION */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition"
            >
              ‹
            </button>

            <div className="min-w-[180px] h-10 px-4 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center">
              <span className="text-sm font-black text-white">
                {MONTHS_AR[selectedMonth]} {selectedYear}
              </span>
            </div>

            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition"
            >
              ›
            </button>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="h-10 px-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-black text-white outline-none"
            >
              {Array.from(
                { length: 7 },
                (_, index) => now.getFullYear() - 3 + index,
              ).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* SUMMARY */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <div className="rounded-2xl bg-zinc-950/70 border border-zinc-800 p-4">
            <div className="text-xs font-bold text-zinc-500">
              إجمالي مبيعات الشهر
            </div>

            <div className="text-xl font-black text-white mt-1">
              {formatMoney(monthTotal)}
              <span className="text-xs text-emerald-400 mr-1">ج.م</span>
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-950/70 border border-zinc-800 p-4">
            <div className="text-xs font-bold text-zinc-500">عدد الفواتير</div>

            <div className="text-xl font-black text-white mt-1">
              {monthInvoices}
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-950/70 border border-zinc-800 p-4">
            <div className="text-xs font-bold text-zinc-500">أفضل يوم</div>

            <div className="text-xl font-black text-emerald-400 mt-1">
              {bestDay ? formatMoney(bestDay.sales) : "0"}
              <span className="text-xs mr-1">ج.م</span>
            </div>
          </div>
        </div>
      </div>

      {/* CALENDAR */}
      <div className="p-5 sm:p-6">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {WEEK_DAYS_AR.map((day) => (
            <div
              key={day}
              className="text-center text-[11px] sm:text-xs font-black text-zinc-500 py-2"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-x-6 gap-y-3 sm:gap-x-8 sm:gap-y-4 max-w-3xl mx-auto">
          {calendarDays.map((day, index) => {
            if (!day) {
              return (
                <div
                  key={`empty-${index}`}
                  className="h-[31px] flex flex-col items-center justify-end"
                >
                  <div className="w-[15px] h-[15px]" />
                </div>
              );
            }

            const level = getLevel(day.sales);
            const levelClass = getLevelClass(level);
            const textClass = getLevelTextClass(level);

            return (
              <div
                key={day.key}
                className="group relative h-[31px] flex flex-col items-center justify-end cursor-default"
              >
                {/* DAY */}
                <div
                  className={`text-[11px] leading-none font-black mb-1.5 ${textClass}`}
                >
                  {day.date.getDate()}
                </div>

                {/* SMALL HEATMAP SQUARE */}
                <div
                  className={`
                    w-[15px] h-[15px]
                    shrink-0
                    rounded-[4px]
                    border
                    ${levelClass}
                    transition-all duration-200
                    group-hover:scale-125
                    group-hover:shadow-lg
                  `}
                />

                {/* TOOLTIP */}
                <div className="pointer-events-none absolute z-50 hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-3 w-48">
                  <div className="bg-zinc-950 border border-zinc-700 rounded-2xl shadow-2xl p-4">
                    <div className="text-xs font-black text-white mb-2">
                      {day.date.toLocaleDateString("ar-EG", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-bold text-zinc-500">
                        الإيرادات
                      </span>

                      <span className="text-sm font-black text-emerald-400">
                        {formatMoney(day.sales)} ج.م
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-2">
                      <span className="text-[11px] font-bold text-zinc-500">
                        الفواتير
                      </span>

                      <span className="text-sm font-black text-white">
                        {day.invoices}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* LEGEND */}
        <div className="mt-6 pt-5 border-t border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-[15px] h-[15px] rounded-[4px] bg-emerald-950 border border-emerald-900" />
                <span className="text-[15px] font-bold text-zinc-500">
                  أقل من 20K
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-[15px] h-[15px] rounded-[4px] bg-emerald-900 border border-emerald-800" />
                <span className="text-[15px] font-bold text-zinc-500">
                  20K–30K
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-[15px] h-[15px] rounded-[4px] bg-emerald-800 border border-emerald-700" />
                <span className="text-[15px] font-bold text-zinc-500">
                  30K–40K
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-[15px] h-[15px] rounded-[4px] bg-emerald-600 border border-emerald-500" />
                <span className="text-[15px] font-bold text-zinc-500">
                  40K–60K
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-[15px] h-[15px] rounded-[4px] bg-emerald-400 border border-emerald-300" />
                <span className="text-[15px] font-bold text-zinc-500">
                  60K+
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
