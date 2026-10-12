/* eslint-disable prettier/prettier */
import React, { useMemo, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, ShoppingBag, Users } from "lucide-react";

interface Invoice {
  id: string;
  type: "dinein" | "takeaway" | "delivery" | "staff" | "hospitality";
  customerName?: string;
  total: number;
}

interface TakeawayCustomersProps {
  invoices: Invoice[];
}

type SortBy = "orders" | "value";
type SortDirection = "asc" | "desc";

interface CustomerData {
  name: string;
  orders: number;
  value: number;
  average: number;
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);

function normalizeCustomerName(value?: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function isValidCustomerName(name: string) {
  const normalized = name.toLowerCase();

  if (!normalized) return false;

  const ignoredNames = [
    "عميل",
    "زبون",
    "customer",
    "client",
    "guest",
    "walk in",
    "walk-in",
    "walkin",
    "-",
    "--",
  ];

  return !ignoredNames.includes(normalized);
}

export default function TakeawayCustomers({
  invoices,
}: TakeawayCustomersProps) {
  const [sortBy, setSortBy] = useState<SortBy>("orders");
  const [direction, setDirection] = useState<SortDirection>("desc");

  const customers = useMemo<CustomerData[]>(() => {
    const map: Record<
      string,
      {
        name: string;
        orders: number;
        value: number;
      }
    > = {};

    invoices.forEach((invoice) => {
      // نجيب الـ takeaway فقط
      if (invoice.type !== "takeaway") return;

      const name = normalizeCustomerName(invoice.customerName);

      // استبعاد عميل / زبون / الفاضي
      if (!isValidCustomerName(name)) return;

      if (!map[name]) {
        map[name] = {
          name,
          orders: 0,
          value: 0,
        };
      }

      map[name].orders += 1;
      map[name].value += Number(invoice.total || 0);
    });

    return Object.values(map).map((customer) => ({
      ...customer,
      average: customer.orders > 0 ? customer.value / customer.orders : 0,
    }));
  }, [invoices]);

  const sortedCustomers = useMemo(() => {
    return [...customers]
      .sort((a, b) => {
        const aValue = sortBy === "orders" ? a.orders : a.value;
        const bValue = sortBy === "orders" ? b.orders : b.value;

        return direction === "desc" ? bValue - aValue : aValue - bValue;
      })
      .slice(0, 10);
  }, [customers, sortBy, direction]);

  const maxValue = useMemo(() => {
    if (sortedCustomers.length === 0) return 1;

    return Math.max(
      ...sortedCustomers.map((customer) =>
        sortBy === "orders" ? customer.orders : customer.value,
      ),
      1,
    );
  }, [sortedCustomers, sortBy]);

  const toggleDirection = () => {
    setDirection((current) => (current === "desc" ? "asc" : "desc"));
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl shadow-xl overflow-hidden">
      {/* HEADER */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>

              <div>
                <h2 className="text-xl font-black text-white">
                  {direction === "desc"
                    ? "أفضل 10 عملاء تيك أواي"
                    : "أقل 10 عملاء تيك أواي"}{" "}
                </h2>
              </div>
            </div>
          </div>

          {/* CONTROLS */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSortBy("orders")}
              className={`h-10 px-4 rounded-xl text-xs font-black transition ${
                sortBy === "orders"
                  ? "bg-emerald-500 text-zinc-950"
                  : "bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              عدد الطلبات
            </button>

            <button
              type="button"
              onClick={() => setSortBy("value")}
              className={`h-10 px-4 rounded-xl text-xs font-black transition ${
                sortBy === "value"
                  ? "bg-emerald-500 text-zinc-950"
                  : "bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              قيمة المشتريات
            </button>

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
        {sortedCustomers.length === 0 ? (
          <div className="h-52 flex flex-col items-center justify-center text-zinc-500">
            <ShoppingBag className="w-10 h-10 mb-3 opacity-40" />

            <div className="text-base font-black">لا توجد بيانات عملاء</div>

            <div className="text-xs font-bold mt-1">
              لا توجد أسماء عملاء حقيقية في طلبات التيك أواي
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedCustomers.map((customer, index) => {
              const currentValue =
                sortBy === "orders" ? customer.orders : customer.value;

              const progress = (currentValue / maxValue) * 100;

              return (
                <div key={customer.name} className="group">
                  <div className="flex items-center gap-4">
                    {/* RANK */}
                    <div
                      className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-black ${
                        index === 0
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                          : "bg-zinc-950 text-zinc-400 border border-zinc-800"
                      }`}
                    >
                      {index + 1}
                    </div>

                    {/* CUSTOMER */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-black text-white truncate">
                          {customer.name}
                        </div>

                        <div className="text-xs font-black text-zinc-400 whitespace-nowrap">
                          {customer.orders} طلب
                        </div>
                      </div>

                      <div className="h-3 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800 mt-2">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            index === 0
                              ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                              : "bg-emerald-600/80"
                          }`}
                          style={{
                            width: `${progress}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* VALUE */}
                    <div className="text-left min-w-[120px]">
                      <div className="text-base font-black text-white">
                        {formatMoney(customer.value)}
                      </div>

                      <div className="text-xs font-bold text-zinc-500">EGP</div>

                      <div className="text-[11px] font-bold text-emerald-400 mt-1">
                        متوسط {formatMoney(customer.average)}
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
  );
}
