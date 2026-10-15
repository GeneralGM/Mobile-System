/* eslint-disable prettier/prettier */

import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Search,
} from "lucide-react";
import type { Sale } from "../types/sales";

export const Route = createFileRoute("/invoices")({
  component: InvoicesPage,
});

const SALES_KEY = "mobile-system-sales-v1";
const INPUT_CLASS =
  "w-full rounded-xl border border-gray-400 bg-white px-3.5 py-3 text-sm font-medium text-gray-950 shadow-sm outline-none placeholder:text-gray-500 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/15";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function numberText(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    value,
  );
}

function readSales(): Sale[] {
  try {
    const raw = localStorage.getItem(SALES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Sale[]) : [];
  } catch {
    return [];
  }
}

function paymentLabel(method: Sale["paymentMethod"]) {
  if (method === "cash") return "كاش";
  if (method === "credit") return "آجل";
  return "تقسيط";
}

function InvoicesPage() {
  const [ready, setReady] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSales(readSales());
    setReady(true);
  }, []);

  const filteredSales = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term)
      return [...sales].sort(
        (a, b) => Number(b.createdAt) - Number(a.createdAt),
      );
    return sales
      .filter((sale) => {
        const items = Array.isArray(sale.items) ? sale.items : [];
        return [
          sale.invoiceNumber ?? "",
          sale.customerName ?? "",
          sale.customerPhone ?? "",
          ...items.flatMap((item) => [item.brand ?? "", item.model ?? ""]),
        ].some((value) => String(value).toLocaleLowerCase().includes(term));
      })
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  }, [sales, query]);

  const totalOutstanding = sales.reduce(
    (sum, sale) => sum + Math.max(0, Number(sale.remainingAmount) || 0),
    0,
  );

  if (!ready)
    return (
      <main dir="rtl" className="min-h-screen bg-gray-50 p-6 text-gray-900">
        جاري تحميل الفواتير...
      </main>
    );

  return (
    <main
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-gray-50 p-4 text-gray-950 md:p-8"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-800">
              <FileText size={18} /> سجل المبيعات
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-950">
              الفواتير
            </h1>
            <p className="mt-2 text-sm text-gray-700">
              كل الفواتير المسجلة في النظام، مع تفاصيل الأجهزة وأسعار البيع.
            </p>
          </div>
          <Link
            to="/sales"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-900"
          >
            <ArrowRight size={17} /> رجوع للبيع
          </Link>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-300 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-700">عدد الفواتير</p>
            <p className="mt-3 text-2xl font-extrabold text-gray-950">
              {numberText(sales.length)}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-300 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-700">
              إجمالي المبيعات
            </p>
            <p className="mt-3 text-2xl font-extrabold text-gray-950">
              {money(
                sales.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0),
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-300 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-700">
              المبالغ المتبقية
            </p>
            <p className="mt-3 text-2xl font-extrabold text-amber-900">
              {money(totalOutstanding)}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between md:px-7">
            <div>
              <h2 className="font-bold text-gray-950">كل الفواتير</h2>
              <p className="mt-1 text-sm text-gray-700">
                عدد النتائج: {numberText(filteredSales.length)}
              </p>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search
                size={17}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث برقم الفاتورة أو العميل أو الموديل"
                className={`${INPUT_CLASS} pr-10`}
              />
            </div>
          </div>

          {filteredSales.length === 0 ? (
            <div className="p-12 text-center">
              <FileText size={32} className="mx-auto text-gray-400" />
              <p className="mt-3 font-bold text-gray-900">
                لا توجد فواتير مطابقة
              </p>
              <p className="mt-1 text-sm text-gray-700">
                جرّب تغيير كلمة البحث، أو سجّل عملية بيع جديدة.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-right text-sm">
                <thead className="bg-gray-100 text-xs font-bold text-gray-800">
                  <tr>
                    <th className="px-5 py-4">رقم الفاتورة</th>
                    <th className="px-5 py-4">العميل</th>
                    <th className="px-5 py-4">الأجهزة</th>
                    <th className="px-5 py-4">طريقة الدفع</th>
                    <th className="px-5 py-4">الإجمالي</th>
                    <th className="px-5 py-4">المدفوع</th>
                    <th className="px-5 py-4">المتبقي</th>
                    <th className="px-5 py-4">التاريخ</th>
                    <th className="px-5 py-4">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredSales.map((sale) => {
                    const items = Array.isArray(sale.items) ? sale.items : [];
                    const isExpanded = expanded.has(sale.id);
                    return (
                      <Fragment key={sale.id}>
                        <tr className="hover:bg-gray-50">
                          <td
                            className="px-5 py-4 font-mono text-xs font-bold text-emerald-900"
                            dir="ltr"
                          >
                            {sale.invoiceNumber || "—"}
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-gray-950">
                              {sale.customerName || "عميل نقدي"}
                            </p>
                            {sale.customerPhone && (
                              <p
                                className="mt-1 text-xs text-gray-600"
                                dir="ltr"
                              >
                                {sale.customerPhone}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-4 font-semibold text-gray-900">
                            {numberText(
                              items.reduce(
                                (sum, item) =>
                                  sum + Math.max(1, Number(item.quantity) || 1),
                                0,
                              ),
                            )}{" "}
                            قطعة
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-bold text-gray-900">
                              {paymentLabel(sale.paymentMethod)}
                            </span>
                          </td>
                          <td
                            className="px-5 py-4 font-bold text-gray-950"
                            dir="ltr"
                          >
                            {money(Number(sale.total) || 0)}
                          </td>
                          <td className="px-5 py-4 text-gray-800" dir="ltr">
                            {money(Number(sale.amountPaid) || 0)}
                          </td>
                          <td
                            className="px-5 py-4 font-semibold text-gray-900"
                            dir="ltr"
                          >
                            {money(Number(sale.remainingAmount) || 0)}
                          </td>
                          <td
                            className="px-5 py-4 text-xs text-gray-700"
                            dir="ltr"
                          >
                            {new Date(
                              Number(sale.createdAt) || Date.now(),
                            ).toLocaleString("en-GB", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded((current) => {
                                  const next = new Set(current);
                                  if (next.has(sale.id)) next.delete(sale.id);
                                  else next.add(sale.id);
                                  return next;
                                })
                              }
                              aria-expanded={isExpanded}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-900 hover:bg-gray-100"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp size={15} /> إخفاء
                                </>
                              ) : (
                                <>
                                  <ChevronDown size={15} /> عرض
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={9} className="px-5 py-4">
                              <div className="space-y-3">
                                <p className="font-bold text-gray-900">
                                  تفاصيل الفاتورة {sale.invoiceNumber || ""}
                                </p>
                                {items.length === 0 ? (
                                  <p className="text-sm text-gray-700">
                                    لا توجد تفاصيل أجهزة محفوظة داخل هذه
                                    الفاتورة القديمة.
                                  </p>
                                ) : (
                                  items.map((item) => (
                                    <div
                                      key={item.deviceId}
                                      className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                      <div>
                                        <p className="font-semibold text-gray-950">
                                          {item.brand} {item.series || "عام"}{" "}
                                          {item.model}
                                        </p>

                                        <div>
                                          <p className="font-semibold text-gray-950">
                                            {item.brand} {item.series || "عام"}{" "}
                                            {item.model}
                                          </p>
                                          <p className="mt-1 text-xs text-gray-600">
                                            الكمية:{" "}
                                            {numberText(
                                              Math.max(
                                                1,
                                                Number(item.quantity) || 1,
                                              ),
                                            )}{" "}
                                            قطعة
                                          </p>
                                        </div>
                                      </div>
                                      <p
                                        className="font-bold text-gray-950"
                                        dir="ltr"
                                      >
                                        {money(
                                          Number(
                                            item.finalPrice ??
                                              (sale.paymentMethod ===
                                              "installment"
                                                ? item.installmentFinalPrice
                                                : item.cashFinalPrice),
                                          ) || 0,
                                        )}
                                      </p>
                                    </div>
                                  ))
                                )}
                                {sale.notes && (
                                  <p className="text-sm text-gray-700">
                                    ملاحظات: {sale.notes}
                                  </p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-gray-200 bg-gray-50 px-5 py-3 text-xs text-gray-700">
            الفواتير محفوظة محليًا في المتصفح الحالي.
          </div>
        </section>
      </div>
    </main>
  );
}
