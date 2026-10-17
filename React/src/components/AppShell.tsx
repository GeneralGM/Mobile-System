/* eslint-disable prettier/prettier */
import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Smartphone,
  Package,
  Users,
  CreditCard,
  RotateCcw,
  ChartNoAxesCombined,
  Settings,
  Bell,
  Menu,
  X,
  ChevronLeft,
  Store,
  BadgeDollarSign,
  ReceiptText,
  HandCoins,
} from "lucide-react";

type AppShellProps = {
  children: ReactNode;
};

const navigation = [
  { label: "لوحة التحكم", icon: LayoutDashboard, to: "/" },
  { label: "المبيعات", to: "/sales", icon: BadgeDollarSign },
  { label: "المخزن", to: "/warehouse", icon: Package },
  { label: "الفواتير", to: "/invoices", icon: ReceiptText },
  { label: "الأقساط", to: "/installlments", icon: HandCoins },
  { label: "المرتجعات", to: "/returns", icon: RotateCcw },
  { label: "سجل المرتجعات", to: "/returns-history", icon: RotateCcw },
] as const;

const upcoming = [
  { label: "الإكسسوارات", icon: Package },
  { label: "العملاء والموردون", icon: Users },
  { label: "الأقساط والتحصيل", icon: CreditCard },
  { label: "التقارير", icon: ChartNoAxesCombined },
  { label: "الإعدادات", icon: Settings },
] as const;

const pageTitles: Record<string, string> = {
  "/": "لوحة التحكم",
  "/sales": "المبيعات",
  "/warehouse": "المخزن",
  "/invoices": "الفواتير",
  "/installlments": "الأقساط",
  "/returns": "المرتجعات",
  "/returns-history": "سجل المرتجعات",
};

export function AppShell({ children }: AppShellProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const currentTitle = pageTitles[pathname] || "إدارة محل الموبايلات";

  return (
    <div dir="rtl" className="min-h-screen bg-[var(--background)] text-slate-900">
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[270px] flex-col border-l border-slate-200 bg-white ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex h-[76px] items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#123b32] text-white">
              <Store size={20} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">BMO Mobile</h1>
              <p className="mt-0.5 text-xs text-slate-600">إدارة محل الموبايلات</p>
            </div>
          </div>

          <button
            type="button"
            aria-label="إغلاق القائمة"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-3 text-[11px] font-bold text-slate-500">
            القائمة الرئيسية
          </p>
          <div className="space-y-0.5">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.to;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${
                    isActive
                      ? "bg-[#123b32] text-white"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <Icon size={18} />
                  <span className="flex-1">{item.label}</span>
                  {isActive && <ChevronLeft size={16} />}
                </Link>
              );
            })}
          </div>

          <p className="mb-2 mt-5 px-3 text-[11px] font-bold text-slate-500">
            قيد التجهيز
          </p>
          <div className="space-y-0.5">
            {upcoming.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setNotice(`صفحة «${item.label}» غير متاحة بعد.`);
                    setMobileMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-right text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                >
                  <Icon size={18} />
                  <span className="flex-1">{item.label}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                    قريبًا
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-[#123b32]">
              <Smartphone size={16} />
              <span className="text-sm font-bold">نظام إدارة المحل</span>
            </div>
            <p className="text-xs leading-6 text-slate-600">
              الأجهزة، المخزون، المبيعات، الأقساط، والمرتجعات في شاشة واحدة.
            </p>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:mr-[270px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="فتح القائمة"
              className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div>
              <p className="text-xs text-slate-500">BMO Mobile</p>
              <h2 className="text-sm font-bold text-slate-900 sm:text-base">
                {currentTitle}
              </h2>
            </div>
          </div>

          <button
            type="button"
            aria-label="الإشعارات"
            onClick={() => setNotice("لا توجد إشعارات جديدة.")}
            className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
          >
            <Bell size={18} />
          </button>
        </header>

        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
          {notice ? (
            <div
              role="status"
              className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800"
            >
              <span>{notice}</span>
              <button
                type="button"
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label="إغلاق التنبيه"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
