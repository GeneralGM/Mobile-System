/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  Wine,
  Flame,
  ArrowDownUp,
} from "lucide-react";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import type { Invoice, OrderItem } from "@/lib/pos-store";
import { useDB } from "@/lib/store";

ChartJS.register(ArcElement, Tooltip, Legend);

import { createFileRoute } from "@tanstack/react-router";

import DashboardKPIs from "@/components/Dashboard/DashboardKPIs";
import CashierPerformance from "@/components/Dashboard/CashierPerformance";
import TablePerformance from "@/components/Dashboard/ZonePerformance";
import HourlySales from "@/components/Dashboard/HourlySales";
import ExternalSales from "@/components/Dashboard/ExternalSales";
import ProfitTrend from "@/components/Dashboard/ProfitTrend";
import TakeawayCustomers from "@/components/Dashboard/TakeawayCustomers";
import CaptainPerformance from "@/components/Dashboard/CaptainPerformance";
import MonthlySalesHeatmap from "@/components/Dashboard/MonthlySalesHeatmap";

import { getApiUrl } from "@/api";
const API_URL = getApiUrl();

export const Route = createFileRoute("/Dashboard")({
  component: Dashboard,
});

type DepartmentKey = "kitchen" | "bar" | "shisha";

interface DepartmentData {
  key: DepartmentKey;
  name: string;
  total: number;
  previousTotal: number;
  change: number;
  icon: React.ReactNode;
}

interface DailyDepartmentData {
  date: string;
  label: string;
  kitchen: number;
  bar: number;
  shisha: number;
  total: number;
}

const DEPARTMENTS: Record<
  DepartmentKey,
  {
    name: string;
    icon: React.ReactNode;
  }
> = {
  kitchen: {
    name: "المطبخ",
    icon: <UtensilsCrossed className="w-7 h-7 text-indigo-400" />,
  },
  bar: {
    name: "البار",
    icon: <Wine className="w-7 h-7 text-emerald-400" />,
  },
  shisha: {
    name: "الشيشة",
    icon: <Flame className="w-7 h-7 text-amber-400" />,
  },
};

function normalizeDepartment(value?: string): DepartmentKey | null {
  const dept = String(value || "")
    .trim()
    .toLowerCase();

  if (dept === "مطبخ" || dept === "مطبخ رئيسي" || dept === "kitchen") {
    return "kitchen";
  }

  if (
    dept === "بار" ||
    dept === "bar" ||
    dept === "drinks" ||
    dept === "مشروبات"
  ) {
    return "bar";
  }

  if (
    dept === "شيشة" ||
    dept === "شيشه" ||
    dept === "شيشة ومعسل" ||
    dept === "شيشه ومعسل" ||
    dept === "shisha"
  ) {
    return "shisha";
  }

  return null;
}

function getItemRevenue(item: OrderItem) {
  const price = Number(item.unitPrice ?? item.price ?? 0);
  const qty = Number(item.qty ?? 0);
  return price * qty;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getArabicDayName(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "short",
  }).format(date);
}

function getDateKey(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRangeDays(startDate: string, endDate: string) {
  const result: string[] = [];
  const current = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);

  while (current <= end) {
    result.push(formatDateInput(current));
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function getPreviousPeriod(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const diff =
    Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const previousEnd = new Date(start);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - diff + 1);

  return {
    startDate: formatDateInput(previousStart),
    endDate: formatDateInput(previousEnd),
  };
}

function calculateDepartmentTotals(invoices: Invoice[]) {
  const totals: Record<DepartmentKey, number> = {
    kitchen: 0,
    bar: 0,
    shisha: 0,
  };

  for (const invoice of invoices) {
    for (const item of invoice.items || []) {
      const department = normalizeDepartment(item.department);
      if (!department) continue;
      totals[department] += getItemRevenue(item);
    }
  }

  return totals;
}

export default function Dashboard() {
  const today = new Date();
  const { db } = useDB();

  const [startDate, setStartDate] = useState(
    formatDateInput(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6),
    ),
  );

  const [endDate, setEndDate] = useState(formatDateInput(today));
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [previousInvoices, setPreviousInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [top10SortDirection, setTop10SortDirection] = useState<"asc" | "desc">(
    "desc",
  );

  const [top10SortBy, setTop10SortBy] = useState<"qty" | "revenue">("qty");

  const fetchInvoices = async (from: string, to: string) => {
    const response = await fetch(
      `http://${API_URL}:5000/api/invoices?startDate=${encodeURIComponent(
        from,
      )}&endDate=${encodeURIComponent(to)}`,
    );

    if (!response.ok) {
      throw new Error(`فشل جلب الفواتير (${response.status})`);
    }

    return (await response.json()) as Invoice[];
  };

  const loadDashboard = async () => {
    if (!startDate || !endDate) return;

    if (startDate > endDate) {
      setError("تاريخ البداية يجب أن يكون قبل تاريخ النهاية");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const previousPeriod = getPreviousPeriod(startDate, endDate);

      const [current, previous] = await Promise.all([
        fetchInvoices(startDate, endDate),
        fetchInvoices(previousPeriod.startDate, previousPeriod.endDate),
      ]);

      setInvoices(current || []);
      setPreviousInvoices(previous || []);
    } catch (err: any) {
      console.error("Dashboard invoices error:", err);
      setError(err?.message || "حدث خطأ أثناء تحميل بيانات لوحة التحكم");
      setInvoices([]);
      setPreviousInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const currentTotals = useMemo(
    () => calculateDepartmentTotals(invoices),
    [invoices],
  );

  const previousTotals = useMemo(
    () => calculateDepartmentTotals(previousInvoices),
    [previousInvoices],
  );

  const departmentCards: DepartmentData[] = useMemo(() => {
    const keys: DepartmentKey[] = ["kitchen", "bar", "shisha"];

    return keys.map((key) => {
      const total = currentTotals[key];
      const previousTotal = previousTotals[key];
      let change = 0;

      if (previousTotal === 0) {
        change = total > 0 ? 100 : 0;
      } else {
        change = ((total - previousTotal) / previousTotal) * 100;
      }

      return {
        key,
        name: DEPARTMENTS[key].name,
        icon: DEPARTMENTS[key].icon,
        total,
        previousTotal,
        change,
      };
    });
  }, [currentTotals, previousTotals]);

  const dailyData: DailyDepartmentData[] = useMemo(() => {
    const days = getDateRangeDays(startDate, endDate);
    const map: Record<
      string,
      { kitchen: number; bar: number; shisha: number }
    > = {};

    for (const day of days) {
      map[day] = { kitchen: 0, bar: 0, shisha: 0 };
    }

    for (const invoice of invoices) {
      const dateKey = getDateKey(invoice.createdAt);
      if (!map[dateKey]) continue;

      for (const item of invoice.items || []) {
        const department = normalizeDepartment(item.department);
        if (!department) continue;
        map[dateKey][department] += getItemRevenue(item);
      }
    }

    return days.map((day) => ({
      date: day,
      label: getArabicDayName(day),
      kitchen: map[day].kitchen,
      bar: map[day].bar,
      shisha: map[day].shisha,
      total: map[day].kitchen + map[day].bar + map[day].shisha,
    }));
  }, [invoices, startDate, endDate]);

  const maxDailyValue = useMemo(() => {
    const max = Math.max(
      ...dailyData.map((day) => Math.max(day.kitchen, day.bar, day.shisha)),
      0,
    );
    return max || 1;
  }, [dailyData]);

  const totalDepartmentSales =
    currentTotals.kitchen + currentTotals.bar + currentTotals.shisha;

  const top10Items = useMemo(() => {
    const itemsMap: Record<
      string,
      {
        name: string;
        qty: number;
        revenue: number;
      }
    > = {};

    invoices.forEach((invoice) => {
      (invoice.items || []).forEach((item: any) => {
        const name = item.name || item.mealName || "صنف غير معروف";

        const qty = Number(item.qty || 0);

        const price = Number(item.unitPrice || item.price || 0);

        if (!itemsMap[name]) {
          itemsMap[name] = {
            name,
            qty: 0,
            revenue: 0,
          };
        }

        itemsMap[name].qty += qty;
        itemsMap[name].revenue += qty * price;
      });
    });

    const result = Object.values(itemsMap);

    result.sort((a, b) => {
      const aValue = top10SortBy === "qty" ? a.qty : a.revenue;

      const bValue = top10SortBy === "qty" ? b.qty : b.revenue;

      return top10SortDirection === "desc" ? bValue - aValue : aValue - bValue;
    });

    return result.slice(0, 10);
  }, [invoices, top10SortBy, top10SortDirection]);

  const departmentDonutData = {
    labels: ["المطبخ", "البار", "الشيشة"],
    datasets: [
      {
        data: [
          departmentCards.find((d) => d.key === "kitchen")?.total || 0,
          departmentCards.find((d) => d.key === "bar")?.total || 0,
          departmentCards.find((d) => d.key === "shisha")?.total || 0,
        ],
        backgroundColor: ["#6366f1", "#10b981", "#f59e0b"],
        borderWidth: 0,
        spacing: 6,
        borderRadius: 8,
      },
    ],
  };

  const totalDonutRevenue = departmentCards.reduce(
    (sum, d) => sum + d.total,
    0,
  );

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 lg:p-8 font-sans selection:bg-emerald-500 selection:text-black"
    >
      <div className="max-w-[1600px] mx-auto space-y-8">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 border-b border-zinc-800/80 pb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              <span className="bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
                لوحة التحكم
              </span>
            </h1>
            <p className="text-base font-medium text-zinc-400 mt-2">
              تحليل مبيعات الأقسام وحركة الإيرادات والتحليلات اليومية
            </p>
          </div>

          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex items-center justify-center gap-3 h-12 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold shadow-lg shadow-emerald-950/40 border border-emerald-500/30 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            تحديث البيانات
          </button>
        </div>

        {/* DATE FILTER */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col md:flex-row md:items-end gap-5">
            <div className="flex-1">
              <label className="block text-sm font-bold text-zinc-300 mb-2">
                من تاريخ
              </label>
              <div className="relative">
                <CalendarDays className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 pointer-events-none" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-12 rounded-xl border border-zinc-700/80 bg-zinc-950/80 pr-12 pl-4 text-base font-bold text-zinc-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-bold text-zinc-300 mb-2">
                إلى تاريخ
              </label>
              <div className="relative">
                <CalendarDays className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 pointer-events-none" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-12 rounded-xl border border-zinc-700/80 bg-zinc-950/80 pr-12 pl-4 text-base font-bold text-zinc-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={loadDashboard}
              disabled={loading}
              className="h-12 px-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-base font-black transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              عرض البيانات
            </button>
          </div>

          <div className="mt-6">
            <ProfitTrend
              invoices={invoices}
              meals={db.meals}
              items={db.items}
              formatMoney={formatMoney}
            />
          </div>

          {error && (
            <div className="mt-5 rounded-2xl bg-red-950/80 border border-red-800 text-red-200 px-5 py-4 text-base font-bold">
              {error}
            </div>
          )}
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 text-white rounded-3xl p-6 shadow-xl border border-emerald-500/30 relative overflow-hidden group">
            <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
            <div className="text-sm text-emerald-400 font-bold mb-3 tracking-wide">
              إجمالي مبيعات الأقسام
            </div>
            <div className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              {formatMoney(totalDepartmentSales)}
              <span className="text-base mr-2 font-extrabold text-emerald-400">
                EGP
              </span>
            </div>
            <div className="text-sm font-bold text-zinc-400 mt-3 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              {invoices.length} فاتورة مسجلة
            </div>
          </div>

          {departmentCards.map((department) => {
            const positive = department.change >= 0;

            return (
              <div
                key={department.key}
                className="bg-zinc-900/80 border border-zinc-800/90 rounded-3xl p-6 shadow-xl hover:border-zinc-700 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center shadow-inner">
                      {department.icon}
                    </div>
                    <div>
                      <div className="text-lg font-black text-white">
                        {department.name}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`flex items-center gap-1 text-sm font-black px-3 py-1.5 rounded-full ${
                      positive
                        ? "bg-emerald-950/80 border border-emerald-800/80 text-emerald-400"
                        : "bg-red-950/80 border border-red-800/80 text-red-400"
                    }`}
                  >
                    {positive ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    {positive ? "+" : ""}
                    {department.change.toFixed(1)}%
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-3xl font-black text-white">
                    {formatMoney(department.total)}
                    <span className="text-sm mr-2 font-bold text-zinc-400">
                      EGP
                    </span>
                  </div>
                </div>

                <div className="mt-4 h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      positive ? "bg-emerald-500" : "bg-red-500"
                    }`}
                    style={{
                      width: `${Math.min(Math.abs(department.change), 100)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <DashboardKPIs
          invoices={invoices}
          previousInvoices={previousInvoices}
        />

        <HourlySales invoices={invoices} />

        {/* DAILY BAR CHART */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl shadow-xl overflow-hidden">
          <div className="p-6 border-b border-zinc-800">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white">
                  مبيعات الأقسام اليومية
                </h2>
              </div>

              <div className="flex items-center gap-6 text-sm font-bold text-zinc-300 bg-zinc-950/60 px-4 py-2 rounded-2xl border border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-md bg-indigo-500 shadow-sm" />
                  المطبخ
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-md bg-emerald-500 shadow-sm" />
                  البار
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-md bg-amber-500 shadow-sm" />
                  الشيشة
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 overflow-x-auto">
            {dailyData.length === 0 ? (
              <div className="h-[380px] flex items-center justify-center text-base font-bold text-zinc-500">
                لا توجد بيانات في الفترة المحددة
              </div>
            ) : (
              <div className="relative min-w-[760px]" style={{ height: 390 }}>
                {/* GRID */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  {[0, 1, 2, 3, 4].map((line) => (
                    <div
                      key={line}
                      className="border-t border-zinc-800/80 w-full"
                    />
                  ))}
                </div>

                {/* BARS */}
                <div className="absolute inset-x-0 bottom-10 top-4 flex items-end justify-between gap-3 px-4">
                  {dailyData.map((day) => {
                    const bars = [
                      {
                        key: "kitchen",
                        value: day.kitchen,
                        className: "bg-indigo-500 hover:bg-indigo-400",
                      },
                      {
                        key: "bar",
                        value: day.bar,
                        className: "bg-emerald-500 hover:bg-emerald-400",
                      },
                      {
                        key: "shisha",
                        value: day.shisha,
                        className: "bg-amber-500 hover:bg-amber-400",
                      },
                    ];

                    return (
                      <div
                        key={day.date}
                        className="flex-1 h-full flex items-end justify-center gap-2 group"
                      >
                        {bars.map((bar) => {
                          const height = (bar.value / maxDailyValue) * 100;

                          return (
                            <div
                              key={bar.key}
                              className="relative flex-1 max-w-[28px] h-full flex items-end"
                            >
                              <div
                                className={`w-full ${bar.className} rounded-t-lg transition-all duration-300 shadow-lg`}
                                style={{
                                  height: `${
                                    bar.value > 0 ? Math.max(height, 3) : 0
                                  }%`,
                                }}
                              >
                                {bar.value > 0 && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30">
                                    <div className="bg-zinc-950 text-white text-xs font-black rounded-xl px-3 py-1.5 shadow-2xl border border-zinc-700">
                                      {formatMoney(bar.value)} EGP
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* DAYS */}
                <div className="absolute bottom-0 inset-x-0 h-8 flex items-center justify-between gap-3 px-4">
                  {dailyData.map((day) => (
                    <div
                      key={day.date}
                      className="flex-1 text-center text-xs font-extrabold text-zinc-400"
                    >
                      <div>{day.label}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {day.date.slice(5)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DONUT & TOP 10 ITEMS */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* REVENUE DONUT */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl shadow-xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-xl font-black text-white">توزيع الإيرادات</h2>
            </div>

            <div className="p-6">
              <div className="relative h-[320px] flex items-center justify-center">
                <Doughnut
                  data={departmentDonutData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "75%",
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (context) => {
                            const value = Number(context.raw) || 0;
                            const percentage =
                              totalDonutRevenue > 0
                                ? (value / totalDonutRevenue) * 100
                                : 0;
                            return ` ${formatMoney(
                              value,
                            )} EGP (${percentage.toFixed(1)}%)`;
                          },
                        },
                      },
                    },
                  }}
                />

                {/* CENTER */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold text-zinc-400">
                    إجمالي الإيرادات
                  </span>
                  <span className="text-3xl font-black text-white mt-1">
                    {formatMoney(totalDonutRevenue)}
                  </span>
                  <span className="text-xs font-bold text-emerald-400">
                    EGP
                  </span>
                </div>
              </div>

              {/* DEPARTMENTS LEGEND */}
              <div className="grid grid-cols-3 gap-4 mt-6">
                {[
                  { key: "kitchen", name: "المطبخ", color: "bg-indigo-500" },
                  { key: "bar", name: "البار", color: "bg-emerald-500" },
                  { key: "shisha", name: "الشيشة", color: "bg-amber-500" },
                ].map((dept) => {
                  const value =
                    departmentCards.find((d) => d.key === dept.key)?.total || 0;
                  const percentage =
                    totalDonutRevenue > 0
                      ? (value / totalDonutRevenue) * 100
                      : 0;

                  return (
                    <div
                      key={dept.key}
                      className="rounded-2xl bg-zinc-950/80 border border-zinc-800 p-4 shadow-sm"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`w-3.5 h-3.5 rounded-full ${dept.color}`}
                        />
                        <span className="text-sm font-black text-zinc-300">
                          {dept.name}
                        </span>
                      </div>
                      <div className="text-base font-black text-white">
                        {formatMoney(value)}
                        <span className="text-xs font-bold text-zinc-500 mr-1">
                          EGP
                        </span>
                      </div>
                      <div className="text-xs font-bold text-emerald-400 mt-1">
                        {percentage.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <TablePerformance invoices={invoices} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="col-start-1 col-end-2 space-y-8">
            <CashierPerformance invoices={invoices} />
            <MonthlySalesHeatmap
              invoices={invoices}
              formatMoney={formatMoney}
            />
          </div>
          {/* TOP 10 ITEMS */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl shadow-xl overflow-hidden">
            {/* HEADER */}
            <div className="p-6 border-b border-zinc-800">
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-white">
                    {top10SortDirection === "desc"
                      ? "أفضل 10 أصناف مبيعًا"
                      : "أقل 10 أصناف مبيعًا"}
                  </h2>
                </div>

                {/* CONTROLS */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* SORT BY */}
                  <div className="relative">
                    <select
                      value={top10SortBy}
                      onChange={(e) =>
                        setTop10SortBy(e.target.value as "qty" | "revenue")
                      }
                      className="appearance-none h-10 min-w-[150px] rounded-xl border border-zinc-700 bg-zinc-950 text-white pr-4 pl-9 text-xs font-black outline-none focus:border-emerald-500 transition"
                    >
                      <option value="qty">عدد المبيعات</option>

                      <option value="revenue">قيمة الإيرادات</option>
                    </select>

                    <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  </div>

                  {/* DIRECTION */}
                  <button
                    type="button"
                    onClick={() =>
                      setTop10SortDirection((current) =>
                        current === "desc" ? "asc" : "desc",
                      )
                    }
                    className="h-10 px-4 rounded-xl border border-zinc-700 bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-black flex items-center gap-2 transition"
                  >
                    <ArrowDownUp className="w-4 h-4 text-emerald-400" />

                    {top10SortDirection === "desc" ? "تنازلي" : "تصاعدي"}
                  </button>
                </div>
              </div>
            </div>

            {/* CONTENT */}
            <div className="p-6">
              {top10Items.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-base font-bold text-zinc-500">
                  لا توجد بيانات في الفترة المحددة
                </div>
              ) : (
                <div className="space-y-4">
                  {top10Items.map((item, index) => {
                    const maxValue = Math.max(
                      ...top10Items.map((current) =>
                        top10SortBy === "qty" ? current.qty : current.revenue,
                      ),
                      1,
                    );

                    const currentValue =
                      top10SortBy === "qty" ? item.qty : item.revenue;

                    const progress = (currentValue / maxValue) * 100;

                    return (
                      <div key={item.name} className="group">
                        <div className="flex items-center gap-4">
                          {/* NUMBER */}
                          <div
                            className={`w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center text-sm font-black ${
                              index === 0
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : "bg-zinc-950 border-zinc-800 text-zinc-400"
                            }`}
                          >
                            {index + 1}
                          </div>

                          {/* NAME + PROGRESS */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-base font-extrabold text-white truncate">
                                {item.name}
                              </span>

                              <span className="text-xs font-black text-zinc-400 whitespace-nowrap">
                                {item.qty} مبيعات
                              </span>
                            </div>

                            <div className="h-2.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800 mt-2">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                  index === 0
                                    ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                                    : "bg-indigo-500"
                                }`}
                                style={{
                                  width: `${Math.min(progress, 100)}%`,
                                }}
                              />
                            </div>
                          </div>

                          {/* REVENUE */}
                          <div className="text-right min-w-[100px]">
                            <div className="text-base font-black text-white">
                              {formatMoney(item.revenue)}
                            </div>

                            <div className="text-xs font-bold text-zinc-500">
                              EGP
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <ExternalSales invoices={invoices} />
          <CaptainPerformance
            invoices={invoices}
            meals={db.meals}
            items={db.items}
          />
          <TakeawayCustomers invoices={invoices} />
        </div>
      </div>
    </div>
  );
}
