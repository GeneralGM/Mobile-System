import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../lib/api-client";
import { formatMoney, formatNumber } from "../lib/format";
import { PageHeader, StatCard } from "../components/ui/app-chrome";
import {
  Banknote,
  ChevronLeft,
  CirclePlus,
  CreditCard,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم | BMO Mobile" },
      {
        name: "description",
        content: "إدارة محل الموبايلات والمخزون والمبيعات",
      },
    ],
  }),
  component: Dashboard,
});

const shortcuts = [
  {
    title: "فاتورة بيع جديدة",
    description: "تسجيل بيع كاش أو آجل أو تقسيط",
    icon: CirclePlus,
    to: "/sales" as const,
  },
  {
    title: "إدارة المخزون",
    description: "استلام الدفعات ومتابعة الرصيد",
    icon: Smartphone,
    to: "/warehouse" as const,
  },
  {
    title: "الأقساط",
    description: "متابعة العقود والتحصيل",
    icon: CreditCard,
    to: "/installlments" as const,
  },
];

function Dashboard() {
  const [backendStats, setBackendStats] = useState<{
    salesCount: number;
    salesTotal: number;
    outstanding: number;
    unitsAvailable: number;
    customersCount: number;
  } | null>(null);
  const [apiReady, setApiReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .stats()
      .then((value) => {
        if (!cancelled) {
          setBackendStats(value);
          setApiReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setApiReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayStats = [
    {
      title: "إجمالي المبيعات",
      value: backendStats ? formatMoney(backendStats.salesTotal) : "—",
      note: backendStats
        ? `${formatNumber(backendStats.salesCount)} فاتورة مسجلة`
        : "سيظهر بعد الاتصال بقاعدة البيانات",
      icon: Banknote,
      tone: "success" as const,
    },
    {
      title: "أجهزة في المخزون",
      value: backendStats ? formatNumber(backendStats.unitsAvailable) : "—",
      note: "الوحدات المتاحة للبيع",
      icon: Smartphone,
      tone: "info" as const,
    },
    {
      title: "مبالغ مستحقة",
      value: backendStats ? formatMoney(backendStats.outstanding) : "—",
      note: "الأقساط والبيع الآجل",
      icon: Wallet,
      tone: "warning" as const,
    },
    {
      title: "عدد العملاء",
      value: backendStats ? formatNumber(backendStats.customersCount) : "—",
      note: "العملاء المسجلون في النظام",
      icon: Users,
      tone: "neutral" as const,
    },
  ];

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="نظرة عامة على المحل"
        description="ملخص يومي للمبيعات، المخزون، والمستحقات من قاعدة البيانات المشتركة."
        actions={
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <span
              className={`h-2 w-2 rounded-full ${apiReady ? "bg-emerald-600" : "bg-amber-500"}`}
            />
            <span className="text-slate-700">
              {apiReady
                ? "متصل بقاعدة البيانات المشتركة"
                : "تعذر الاتصال بقاعدة البيانات"}
            </span>
          </div>
        }
      />

      <section className="rounded-xl border border-slate-200 bg-[#123b32] p-5 text-white sm:p-6">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div className="max-w-xl">
            <p className="mb-2 text-sm font-semibold text-emerald-200">
              BMO Mobile
            </p>
            <h2 className="text-xl font-bold leading-relaxed sm:text-2xl">
              المخزون والمبيعات والحسابات في مكان واحد
            </h2>
            <p className="mt-2 max-w-md text-sm leading-7 text-white/80">
              تابع الأجهزة بأرقام IMEI، سجّل الفواتير، وراجع الأقساط والمرتجعات
              دون تكرار البيانات.
            </p>
            <Link
              to="/warehouse"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-[#123b32] hover:bg-emerald-50"
            >
              فتح المخزن
              <ChevronLeft size={16} />
            </Link>
          </div>
          <div className="hidden h-28 w-28 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 md:flex">
            <Smartphone size={56} strokeWidth={1.25} className="text-emerald-200" />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-900">ملخص النشاط</h2>
          <p className="mt-1 text-sm text-slate-600">
            مؤشرات مباشرة من قاعدة بيانات المحل.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {displayStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <StatCard
                key={stat.title}
                title={stat.title}
                value={stat.value}
                note={stat.note}
                icon={<Icon size={20} />}
                tone={stat.tone}
              />
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-900">الوصول السريع</h2>
          <p className="mt-1 text-sm text-slate-600">ابدأ العملية اليومية مباشرة.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.title}
                to={item.to}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 hover:border-emerald-700 hover:bg-emerald-50/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                  <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {item.description}
                  </p>
                </div>
                <ChevronLeft size={18} className="shrink-0 text-slate-500" />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
