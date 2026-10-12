/* eslint-disable prettier/prettier */
import React, { useMemo } from "react";

interface Invoice {
  type: "dinein" | "takeaway" | "delivery" | "staff" | "hospitality";
  orderCategory: "normal" | "talabat" | "fast";
  total: number;
  commissionValue: number;
  deliveryPrice?: number;
}

interface ExternalSalesProps {
  invoices: Invoice[];
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);

export default function ExternalSales({ invoices }: ExternalSalesProps) {
  const data = useMemo(() => {
    const result = {
      delivery: { sales: 0, invoices: 0, commission: 0, delivery: 0 },
      talabat: { sales: 0, invoices: 0, commission: 0, delivery: 0 },
      fast: { sales: 0, invoices: 0, commission: 0, delivery: 0 },
    };

    invoices.forEach((invoice) => {
      let key: "delivery" | "talabat" | "fast" | null = null;

      if (invoice.orderCategory === "talabat") {
        key = "talabat";
      } else if (invoice.orderCategory === "fast") {
        key = "fast";
      } else if (invoice.type === "delivery") {
        key = "delivery";
      }

      if (!key) return;

      result[key].sales += Number(invoice.total || 0);
      result[key].invoices += 1;
      result[key].commission += Number(invoice.commissionValue || 0);
      result[key].delivery += Number(invoice.deliveryPrice || 0);
    });

    return result;
  }, [invoices]);

  const total = Object.values(data).reduce((sum, item) => sum + item.sales, 0);

  const sections = [
    {
      key: "delivery",
      name: "Delivery",
      color: "bg-orange-500",
      light: "bg-orange-950/40 border-orange-800/50 text-orange-200",
      text: "text-orange-400",
      data: data.delivery,
    },
    {
      key: "talabat",
      name: "Talabat",
      color: "bg-red-500",
      light: "bg-red-950/40 border-red-800/50 text-red-200",
      text: "text-red-400",
      data: data.talabat,
    },
    {
      key: "fast",
      name: "Fast",
      color: "bg-blue-500",
      light: "bg-blue-950/40 border-blue-800/50 text-blue-200",
      text: "text-blue-400",
      data: data.fast,
    },
  ];

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl col-span-2 shadow-xl overflow-hidden">
      <div className="p-6 border-b border-zinc-800">
        <h2 className="text-2xl font-black text-white">
          Delivery / Talabat / Fast 🛵
        </h2>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {sections.map((section) => {
            const percentage =
              total > 0 ? (section.data.sales / total) * 100 : 0;

            return (
              <div
                key={section.key}
                className={`${section.light} rounded-2xl p-4 border shadow-sm`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`w-3.5 h-3.5 rounded-full ${section.color}`}
                  />
                  <span className="text-xl font-black text-white">
                    {section.name}
                  </span>
                </div>

                <div className="text-2xl font-black text-white">
                  {formatMoney(section.data.sales)} EGP
                </div>

                <div className={`text-base font-black mt-1 ${section.text}`}>
                  {percentage.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.key}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3.5 h-3.5 rounded-full ${section.color}`}
                  />
                  <span className="font-black text-base text-white">
                    {section.name}
                  </span>
                </div>

                <span className="font-black text-base text-white">
                  {formatMoney(section.data.sales)} EGP
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3">
                  <div className="text-xs text-zinc-400 font-bold">
                    الفواتير
                  </div>
                  <div className="font-black text-base text-white mt-1">
                    {section.data.invoices}
                  </div>
                </div>

                <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3">
                  <div className="text-xs text-zinc-400 font-bold">العمولة</div>
                  <div className="font-black text-base text-white mt-1">
                    {formatMoney(section.data.commission)}
                  </div>
                </div>

                <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3">
                  <div className="text-xs text-zinc-400 font-bold">
                    الدليفري
                  </div>
                  <div className="font-black text-base text-white mt-1">
                    {formatMoney(section.data.delivery)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 pt-6 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-base font-bold text-zinc-400">
            إجمالي المبيعات الخارجية
          </span>
          <span className="text-3xl font-black text-white">
            {formatMoney(total)}{" "}
            <span className="text-base font-bold text-emerald-400">EGP</span>
          </span>
        </div>
      </div>
    </div>
  );
}
