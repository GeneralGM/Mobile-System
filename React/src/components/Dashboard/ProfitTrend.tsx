/* eslint-disable prettier/prettier */

import React, { useMemo, useState } from "react";
import type { Invoice } from "@/lib/pos-store";
import type { Meal, Item } from "@/lib/store";
import { expandMealToBase } from "@/lib/store";

interface ProfitTrendProps {
  invoices: Invoice[];
  meals: Meal[];
  items: Item[];
  formatMoney: (value: number) => string;
}

interface Point {
  date: string;
  label: string;
  profit: number;
}

interface GraphPoint extends Point {
  x: number;
  y: number;
}

export default function ProfitTrend({
  invoices,
  meals,
  items,
  formatMoney,
}: ProfitTrendProps) {
  const [hoveredPoint, setHoveredPoint] = useState<GraphPoint | null>(null);

  /*
   * ============================================================
   * DAILY PROFIT
   * ============================================================
   */

  const dailyProfit = useMemo<Point[]>(() => {
    const map: Record<string, number> = {};

    invoices.forEach((invoice) => {
      const date = new Date(invoice.createdAt);

      if (Number.isNaN(date.getTime())) return;

      const key = date.toISOString().slice(0, 10);

      let invoiceProfit = 0;

      invoice.items?.forEach((line) => {
        const meal = meals.find((m) => m.id === line.mealId);

        if (!meal) return;

        const recipe = expandMealToBase(meal, meals, items);

        let unitCost = 0;

        for (const [, info] of recipe) {
          unitCost += info.cost;
        }

        const sellingPrice = Number(
          line.unitPrice || line.price || meal.sellingPrice || 0,
        );

        const qty = Number(line.qty || 0);

        invoiceProfit += (sellingPrice - unitCost) * qty;
      });

      map[key] = (map[key] || 0) + invoiceProfit;
    });

    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, profit]) => {
        const d = new Date(`${date}T12:00:00`);

        return {
          date,
          profit,
          label: d.toLocaleDateString("ar-EG", {
            weekday: "short",
          }),
        };
      });
  }, [invoices, meals, items]);

  /*
   * ============================================================
   * GRAPH CALCULATIONS
   * ============================================================
   */

  const maxProfit = Math.max(
    ...dailyProfit.map((point) => Math.max(point.profit, 0)),
    1,
  );

  const minProfit = Math.min(...dailyProfit.map((point) => point.profit), 0);

  const width = 1000;
  const height = 360;

  const paddingX = 55;
  const paddingY = 35;

  const graphWidth = width - paddingX * 2;
  const graphHeight = height - paddingY * 2;

  const range = Math.max(maxProfit - minProfit, 1);

  /*
   * تحويل البيانات إلى نقاط SVG
   */

  const points: GraphPoint[] = dailyProfit.map((point, index) => {
    const x =
      dailyProfit.length === 1
        ? width / 2
        : paddingX + (index / (dailyProfit.length - 1)) * graphWidth;

    const y = paddingY + ((maxProfit - point.profit) / range) * graphHeight;

    return {
      ...point,
      x,
      y,
    };
  });

  /*
   * ============================================================
   * STRAIGHT TREND LINE
   * ============================================================
   */

  const linePath =
    points.length > 0
      ? points
          .map((point, index) => {
            if (index === 0) {
              return `M ${point.x} ${point.y}`;
            }

            return `L ${point.x} ${point.y}`;
          })
          .join(" ")
      : "";

  /*
   * ============================================================
   * AREA UNDER LINE
   * ============================================================
   */

  const areaPath =
    points.length > 0
      ? `
        ${linePath}
        L ${points[points.length - 1].x} ${height - paddingY}
        L ${points[0].x} ${height - paddingY}
        Z
      `
      : "";

  /*
   * ============================================================
   * TOTAL PROFIT & TREND %
   * ============================================================
   */

  const totalProfit = dailyProfit.reduce((sum, point) => sum + point.profit, 0);

  // تحديد ما إذا كانت النتيجة الإجمالية خسارة للتحكم بألوان الثيم
  const isTotalLoss = totalProfit < 0;

  const previousProfit =
    dailyProfit.length >= 2 ? dailyProfit[dailyProfit.length - 2].profit : 0;

  const currentProfit =
    dailyProfit.length > 0 ? dailyProfit[dailyProfit.length - 1].profit : 0;

  const trend =
    previousProfit === 0
      ? 0
      : ((currentProfit - previousProfit) / Math.abs(previousProfit)) * 100;

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl shadow-xl overflow-hidden mt-6">
      {/* HEADER */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-2xl shadow-inner ${isTotalLoss ? "text-red-500" : "text-emerald-400"}`}
            >
              {isTotalLoss ? "📉" : "📈"}
            </div>

            <div>
              <h2 className="text-xl font-black text-white">الأربــــاح</h2>
              <p className="text-xs font-bold text-zinc-500 mt-1">
                حركة صافي الربح اليومية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* TOTAL */}
            <div>
              <div className="text-xs font-bold text-zinc-400">
                إجمالي الربح
              </div>

              <div className="text-2xl font-black text-white flex items-baseline gap-1">
                <span
                  dir="ltr"
                  className={`inline-block ${isTotalLoss ? "text-red-400" : ""}`}
                >
                  {formatMoney(totalProfit)}
                </span>
                <span
                  className={`text-xs mr-1 ${isTotalLoss ? "text-red-400" : "text-emerald-400"}`}
                >
                  ج.م
                </span>
              </div>
            </div>

            {/* TREND */}
            <div
              className={`
                flex items-center gap-1
                px-3 py-1.5
                rounded-full
                text-xs font-black
                border
                ${
                  trend >= 0
                    ? "bg-emerald-950/80 border-emerald-800 text-emerald-400"
                    : "bg-red-950/80 border-red-800 text-red-400"
                }
              `}
            >
              <span className="text-base leading-none">
                {trend >= 0 ? "↗" : "↘"}
              </span>
              {Math.abs(trend).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* CHART */}
      <div className="p-5 sm:p-7">
        {dailyProfit.length === 0 ? (
          <div className="h-[380px] flex items-center justify-center text-base font-bold text-zinc-500">
            لا توجد بيانات أرباح في الفترة المحددة
          </div>
        ) : (
          <div className="relative w-full h-[420px]">
            {/* TOOLTIP */}
            {hoveredPoint && (
              <div
                className={`
                  absolute z-50 pointer-events-none min-w-[155px] bg-zinc-950/95
                  border rounded-2xl px-4 py-3 shadow-2xl backdrop-blur-md transition-all duration-150
                  ${hoveredPoint.profit < 0 ? "border-red-500/30" : "border-emerald-500/30"}
                `}
                style={{
                  left: `${(hoveredPoint.x / width) * 100}%`,
                  top: `${(hoveredPoint.y / height) * 100}%`,
                  transform: "translate(-50%, calc(-100% - 18px))",
                }}
              >
                <div className="text-[11px] font-bold text-zinc-400">
                  {hoveredPoint.label}
                </div>

                <div className="text-[10px] font-bold text-zinc-600 mt-0.5">
                  {hoveredPoint.date}
                </div>

                <div className="mt-2 flex items-baseline gap-1">
                  <span
                    dir="ltr"
                    className={`text-lg font-black inline-block ${hoveredPoint.profit < 0 ? "text-red-500" : "text-emerald-400"}`}
                  >
                    {formatMoney(hoveredPoint.profit)}
                  </span>
                  <span className="text-[10px] font-bold text-zinc-500">
                    ج.م
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${hoveredPoint.profit < 0 ? "bg-red-500" : "bg-emerald-400"}`}
                  />
                  <span className="text-[9px] font-bold text-zinc-500">
                    صافي الربح
                  </span>
                </div>
              </div>
            )}

            {/* SVG */}
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              className="w-full h-full overflow-visible"
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <defs>
                <pattern
                  id="profitGridDark"
                  width="42"
                  height="42"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 42 0 L 0 0 0 42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-zinc-800/60"
                  />
                </pattern>

                <linearGradient id="profitAreaDark" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    className={
                      isTotalLoss ? "text-red-500" : "text-emerald-500"
                    }
                    stopOpacity={isTotalLoss ? "0.40" : "0.20"}
                  />
                  <stop
                    offset="100%"
                    className={
                      isTotalLoss ? "text-red-500" : "text-emerald-500"
                    }
                    stopOpacity="0"
                  />
                </linearGradient>

                <filter
                  id="profitGlow"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <rect
                x="0"
                y="0"
                width={width}
                height={height}
                fill="url(#profitGridDark)"
                rx="18"
              />

              {[0, 25, 50, 75, 100].map((percent) => {
                const y = paddingY + ((100 - percent) / 100) * graphHeight;
                return (
                  <line
                    key={percent}
                    x1={paddingX}
                    x2={width - paddingX}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-zinc-800"
                    strokeDasharray="3 8"
                  />
                );
              })}

              {areaPath && <path d={areaPath} fill="url(#profitAreaDark)" />}

              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={isTotalLoss ? "text-red-500" : "text-emerald-400"}
                  filter="url(#profitGlow)"
                />
              )}

              {points.length >= 2 &&
                points.slice(1).map((point, index) => {
                  const previous = points[index];
                  return (
                    <line
                      key={`segment-${point.date}`}
                      x1={previous.x}
                      y1={previous.y}
                      x2={point.x}
                      y2={point.y}
                      stroke="transparent"
                      strokeWidth="24"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredPoint(point)}
                    />
                  );
                })}

              {points.map((point) => {
                const isHovered = hoveredPoint?.date === point.date;
                const isPointLoss = point.profit < 0;

                return (
                  <g
                    key={point.date}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPoint(point)}
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={isHovered ? 13 : 11}
                      className={`transition-all duration-200 ${isPointLoss ? "fill-red-500/10" : "fill-emerald-400/10"}`}
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={isHovered ? 8 : 7}
                      className={`fill-zinc-950 transition-all duration-200 ${isPointLoss ? "stroke-red-500" : "stroke-emerald-400"}`}
                      strokeWidth="3"
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={isHovered ? 3.5 : 3}
                      className={`transition-all duration-200 ${isPointLoss ? "fill-red-500" : "fill-emerald-400"}`}
                    />
                  </g>
                );
              })}
            </svg>

            {/* DATE LABELS (تم ضبط الاتجاه هنا لحل مشكلة عكس الأيام) */}
            <div
              className="absolute inset-x-0 bottom-0 flex justify-between px-[5.5%]"
              dir="ltr"
            >
              {points.map((point) => (
                <div key={point.date} className="text-center min-w-0">
                  <div className="text-xs font-black text-zinc-400">
                    {point.label}
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">
                    {point.date.slice(5)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
