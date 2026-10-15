/* eslint-disable prettier/prettier */
import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Smartphone,
  Package,
  ShoppingCart,
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
  Construction,
  BadgeDollarSign,
  ReceiptText,
  HandCoins,
} from "lucide-react";

type AppShellProps = {
  children: ReactNode;
};

const navigation = [
  { label: "لوحة التحكم", icon: LayoutDashboard, to: "/", active: true },
  {
    label: "المبيعات",
    to: "/sales",
    icon: BadgeDollarSign,
  },
  {
    label: "المخزن",
    to: "/warehouse",
    icon: Package,
  },
  {
    label: "الفواتير",
    to: "/invoices",
    icon: ReceiptText,
  },
  {
    label: "الأقساط",
    to: "/installlments",
    icon: HandCoins,
  },
  {
    label: "المرتجعات",
    to: "/returns",
    icon: RotateCcw,
  },
  {
    label: "سجل المرتحعات",
    to: "/returns-history",
    icon: RotateCcw,
  },
  { label: "الإكسسوارات", icon: Package },
  { label: "العملاء والموردون", icon: Users },
  { label: "الأقساط والتحصيل", icon: CreditCard },
  { label: "التقارير", icon: ChartNoAxesCombined },
  { label: "الإعدادات", icon: Settings },
] as const;

export function AppShell({ children }: AppShellProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");

  return (
    <div dir="rtl" className="min-h-screen bg-[#f6f8f7] text-slate-900">
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[270px] flex-col border-l border-slate-200 bg-white transition-transform duration-300 ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex h-[84px] items-center justify-between border-b border-slate-100 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#123b32] text-white shadow-sm">
              <Store size={23} />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">
                BMO Mobile
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                إدارة محل الموبايلات
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="إغلاق القائمة"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4 pt-6">
          <p className="mb-3 px-3 text-[11px] font-bold tracking-widest text-slate-400">
            القائمة الرئيسية
          </p>

          <nav className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = "to" in item && pathname === item.to;

              if ("to" in item) {
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                      isActive
                        ? "bg-[#123b32] text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                  >
                    <Icon size={19} />
                    <span className="flex-1">{item.label}</span>
                    {isActive && <ChevronLeft size={16} />}
                  </Link>
                );
              }

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setNotice(item.label);
                    setMobileMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                >
                  <Icon size={19} />
                  <span className="flex-1">{item.label}</span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-1 text-[9px] font-bold text-slate-500">
                    قريبًا
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="mb-2 flex items-center gap-2 text-[#123b32]">
              <Smartphone size={18} />
              <span className="text-sm font-bold">نظام إدارة المحل</span>
            </div>
            <p className="text-xs leading-6 text-slate-600">
              نظام جديد لإدارة الأجهزة والمخزون والمبيعات والحسابات.
            </p>
            <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              مرحلة التجهيز
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:mr-[270px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="فتح القائمة"
              className="rounded-xl border border-slate-200 p-2.5 text-slate-700 hover:bg-slate-50 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>

            <div>
              <p className="text-xs text-slate-500">BMO Mobile</p>
              <h2 className="mt-1 text-sm font-bold sm:text-base">
                إدارة محل الموبايلات
              </h2>
            </div>
          </div>

          <button
            type="button"
            aria-label="الإشعارات"
            onClick={() => setNotice("الإشعارات")}
            className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50"
          >
            <Bell size={19} />
          </button>
        </header>

        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-7 lg:p-8">
  

          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
