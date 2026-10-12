/* eslint-disable prettier/prettier */
import React, { useMemo } from "react";

interface InvoiceItem {
  qty: number;
}

interface Invoice {
  invoiceNumber: number;
  cashierName?: string;
  cashier_name?: string;
  total: number;
  items: InvoiceItem[];
}

interface CashierPerformanceProps {
  invoices: Invoice[];
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);

export default function CashierPerformance({
  invoices,
}: CashierPerformanceProps) {
  const cashiers = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        sales: number;
        invoices: number;
      }
    > = {};

    invoices.forEach((invoice) => {
      const name = invoice.cashierName || invoice.cashier_name || "غير محدد";

      if (!map[name]) {
        map[name] = { name, sales: 0, invoices: 0 };
      }

      map[name].sales += Number(invoice.total || 0);
      map[name].invoices += 1;
    });

    return Object.values(map)
      .map((cashier) => ({
        ...cashier,
        average: cashier.invoices > 0 ? cashier.sales / cashier.invoices : 0,
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [invoices]);

  const maxSales = Math.max(...cashiers.map((cashier) => cashier.sales), 1);

  if (cashiers.length === 0) {
    return (
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl shadow-xl p-6">
        <h2 className="text-xl font-black text-white">أداء الكاشيرين</h2>
        <div className="h-48 flex items-center justify-center text-base font-bold text-zinc-500">
          لا توجد بيانات كافية
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl shadow-xl overflow-hidden">
      <div className="p-6 border-b border-zinc-800">
        <h2 className="text-xl font-black text-white">أداء الكاشيرين</h2>
      </div>

      <div className="p-6 space-y-6">
        {cashiers.map((cashier, index) => {
          const percentage = (cashier.sales / maxSales) * 100;

          return (
            <div key={cashier.name}>
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-sm font-black text-emerald-400">
                    {index + 1}
                  </div>

                  <div>
                    <div className="font-extrabold text-base text-white">
                      {cashier.name}
                    </div>
                    <div className="text-xs font-bold text-zinc-400 mt-0.5">
                      {cashier.invoices} فاتورة
                    </div>
                  </div>
                </div>

                <div className="text-left">
                  <div className="font-black text-base text-white">
                    {formatMoney(cashier.sales)} EGP
                  </div>
                  <div className="text-xs font-bold text-emerald-400 mt-0.5">
                    متوسط {formatMoney(cashier.average)} EGP
                  </div>
                </div>
              </div>

              <div className="h-3 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
