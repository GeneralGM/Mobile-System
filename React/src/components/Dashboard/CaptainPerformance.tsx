/* eslint-disable prettier/prettier */
import React, { useMemo, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Trophy, TrendingUp } from "lucide-react";

import type { Meal, Item } from "@/lib/store";
import { expandMealToBase } from "@/lib/store";

interface OrderItem {
  mealId: string;
  qty: number;
  unitPrice?: number;
  price?: number;
}

interface Invoice {
  id: string;

  captain_name?: string | null;
  captainName?: string | null;

  items: OrderItem[];

  total: number;
  createdAt: number;

  type: "dinein" | "takeaway" | "delivery" | "staff" | "hospitality";
}

interface CaptainPerformanceProps {
  invoices: Invoice[];
  meals: Meal[];
  items: Item[];
}

type SortDirection = "asc" | "desc";

interface CaptainData {
  name: string;
  sales: number;
  cost: number;
  profit: number;
  invoices: number;
  averageProfit: number;
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);

function getCaptainName(invoice: Invoice) {
  return String(invoice.captain_name || invoice.captainName || "").trim();
}

export default function CaptainPerformance({
  invoices,
  meals,
  items,
}: CaptainPerformanceProps) {
  const [direction, setDirection] = useState<SortDirection>("desc");

  const captains = useMemo<CaptainData[]>(() => {
    const map: Record<
      string,
      {
        name: string;
        sales: number;
        cost: number;
        profit: number;
        invoices: number;
      }
    > = {};

    invoices.forEach((invoice) => {
      const captainName = getCaptainName(invoice);

      // لا نحسب الفواتير التي ليس لها كابتن
      if (!captainName) return;

      if (!map[captainName]) {
        map[captainName] = {
          name: captainName,
          sales: 0,
          cost: 0,
          profit: 0,
          invoices: 0,
        };
      }

      let invoiceSales = 0;
      let invoiceCost = 0;

      for (const line of invoice.items || []) {
        const qty = Number(line.qty || 0);

        if (qty <= 0) continue;

        const meal = meals.find((m) => m.id === line.mealId);

        if (!meal) {
          const fallbackPrice = Number(line.unitPrice ?? line.price ?? 0);

          invoiceSales += fallbackPrice * qty;
          continue;
        }

        const sellingPrice = Number(
          line.unitPrice ?? line.price ?? meal.sellingPrice ?? 0,
        );

        invoiceSales += sellingPrice * qty;

        // تكلفة Recipe للوجبة الواحدة
        const recipe = expandMealToBase(meal, meals, items);

        let unitCost = 0;

        for (const [, info] of recipe) {
          unitCost += Number(info.cost || 0);
        }

        invoiceCost += unitCost * qty;
      }

      map[captainName].sales += invoiceSales;
      map[captainName].cost += invoiceCost;
      map[captainName].profit += invoiceSales - invoiceCost;

      map[captainName].invoices += 1;
    });

    return Object.values(map).map((captain) => ({
      ...captain,
      averageProfit:
        captain.invoices > 0 ? captain.profit / captain.invoices : 0,
    }));
  }, [invoices, meals, items]);

  const sortedCaptains = useMemo(() => {
    return [...captains]
      .sort((a, b) =>
        direction === "desc" ? b.profit - a.profit : a.profit - b.profit,
      )
      .slice(0, 10);
  }, [captains, direction]);

  const maxProfit = Math.max(
    ...sortedCaptains.map((captain) => Math.max(captain.profit, 0)),
    1,
  );

  const totalProfit = captains.reduce(
    (sum, captain) => sum + captain.profit,
    0,
  );

  const toggleDirection = () => {
    setDirection((current) => (current === "desc" ? "asc" : "desc"));
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl shadow-xl overflow-hidden">
      {/* HEADER */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>

            <div>
              <h2 className="text-xl font-black text-white">أداء الكباتن</h2>

              <p className="text-sm font-bold text-zinc-400 mt-1">
                {direction === "desc"
                  ? "أعلى الكباتن تحقيقًا لصافي الربح"
                  : "أقل الكباتن تحقيقًا لصافي الربح"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-left">
              <div className="text-[11px] font-bold text-zinc-500">
                إجمالي صافي الربح
              </div>

              <div className="text-lg font-black text-emerald-400">
                {formatMoney(totalProfit)} EGP
              </div>
            </div>

            <button
              type="button"
              onClick={toggleDirection}
              className="h-10 px-4 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white inline-flex items-center gap-2 text-xs font-black"
            >
              {direction === "desc" ? (
                <ArrowDownAZ className="w-4 h-4" />
              ) : (
                <ArrowUpAZ className="w-4 h-4" />
              )}

              {direction === "desc" ? "تنازلي" : "تصاعدي"}
            </button>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="p-6">
        {sortedCaptains.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-base font-bold text-zinc-500">
            لا توجد بيانات كباتن في الفترة المحددة
          </div>
        ) : (
          <div className="space-y-7">
            {sortedCaptains.map((captain, index) => {
              const progress =
                captain.profit > 0 ? (captain.profit / maxProfit) * 100 : 0;

              const margin =
                captain.sales > 0 ? (captain.profit / captain.sales) * 100 : 0;

              return (
                <div key={captain.name}>
                  {/* TOP */}
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-black ${
                          index === 0
                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                            : "bg-zinc-950 text-zinc-400 border border-zinc-800"
                        }`}
                      >
                        {index + 1}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {index === 0 && (
                            <TrendingUp className="w-4 h-4 text-amber-400 shrink-0" />
                          )}

                          <div className="font-black text-base text-white truncate">
                            {captain.name}
                          </div>
                        </div>

                        <div className="text-xs font-bold text-zinc-500 mt-1">
                          {captain.invoices} فاتورة
                        </div>
                      </div>
                    </div>

                    {/* PROFIT */}
                    <div className="text-left shrink-0">
                      <div className="font-black text-lg text-emerald-400">
                        {formatMoney(captain.profit)} EGP
                      </div>

                      <div className="text-[11px] font-bold text-zinc-500">
                        صافي الربح
                      </div>
                    </div>
                  </div>

                  {/* BAR */}
                  <div className="h-3 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        index === 0
                          ? "bg-gradient-to-r from-amber-400 to-orange-400"
                          : "bg-gradient-to-r from-emerald-500 to-teal-400"
                      }`}
                      style={{
                        width: `${Math.min(Math.max(progress, 0), 100)}%`,
                      }}
                    />
                  </div>

                  {/* DETAILS */}
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3">
                      <div className="text-[10px] font-bold text-zinc-500">
                        المبيعات
                      </div>

                      <div className="text-xs font-black text-white mt-1">
                        {formatMoney(captain.sales)} EGP
                      </div>
                    </div>

                    <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3">
                      <div className="text-[10px] font-bold text-zinc-500">
                        تكلفة المكونات
                      </div>

                      <div className="text-xs font-black text-red-400 mt-1">
                        {formatMoney(captain.cost)} EGP
                      </div>
                    </div>

                    <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3">
                      <div className="text-[10px] font-bold text-zinc-500">
                        هامش الربح
                      </div>

                      <div className="text-xs font-black text-emerald-400 mt-1">
                        {margin.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] font-bold text-zinc-500 mt-2">
                    متوسط صافي الربح للفـاتورة:{" "}
                    <span className="text-zinc-300">
                      {formatMoney(captain.averageProfit)} EGP
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
