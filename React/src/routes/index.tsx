import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../lib/api-client";
import {
  ArrowLeft,
  Banknote,
  ChartNoAxesCombined,
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

const stats = [
  {
    title: "إجمالي المبيعات",
    value: "—",
    note: "سيظهر بعد ربط قاعدة البيانات",
    icon: Banknote,
    color: "bg-emerald-50 text-emerald-700",
  },
  {
    title: "أجهزة في المخزون",
    value: "—",
    note: "كل جهاز مسجل برقم IMEI",
    icon: Smartphone,
    color: "bg-blue-50 text-blue-700",
  },
  {
    title: "مبالغ مستحقة",
    value: "—",
    note: "الأقساط والبيع الآجل",
    icon: Wallet,
    color: "bg-amber-50 text-amber-700",
  },
  {
    title: "عدد العملاء",
    value: "—",
    note: "إجمالي العملاء المسجلين",
    icon: Users,
    color: "bg-violet-50 text-violet-700",
  },
];

const shortcuts = [
  {
    title: "فاتورة بيع جديدة",
    description: "بيع موبايل أو إكسسوار",
    icon: CirclePlus,
    to: "/sales" as const,
    color: "bg-emerald-50 text-emerald-700",
  },
  {
    title: "إدارة المخزون",
    description: "عرض الأصناف والأجهزة",
    icon: Smartphone,
    to: "/warehouse" as const,
    color: "bg-violet-50 text-violet-700",
  },
  {
    title: "التقارير",
    description: "مراجعة حركة البيع والمخزون",
    icon: ChartNoAxesCombined,
    to: "/reports" as const,
    color: "bg-amber-50 text-amber-700",
  },
  {
    title: "التحويلات والمحافظ",
    description: "تنفيذ سحب وتحويل ومتابعة الليميت والربح",
    icon: Wallet,
    to: "/transfers" as const,
    color: "bg-emerald-50 text-emerald-700",
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
  const displayStats = stats.map((stat, index) => ({
    ...stat,
    value: backendStats
      ? [
          new Intl.NumberFormat("ar-EG", {
            style: "currency",
            currency: "EGP",
            maximumFractionDigits: 0,
          }).format(backendStats.salesTotal),
          new Intl.NumberFormat("ar-EG").format(backendStats.unitsAvailable),
          new Intl.NumberFormat("ar-EG", {
            style: "currency",
            currency: "EGP",
            maximumFractionDigits: 0,
          }).format(backendStats.outstanding),
          new Intl.NumberFormat("ar-EG").format(backendStats.customersCount),
        ][index]
      : "—",
  }));
  return (
    <main dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-7 pb-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span>الرئيسية</span>
            <ChevronLeft size={15} />
            <span className="text-foreground">لوحة التحكم</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            أهلاً بيك 👋
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            دي نظرة عامة على إدارة محل الموبايلات.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start rounded-xl border bg-card px-3 py-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">
            {apiReady
              ? "متصل بقاعدة البيانات المشتركة"
              : "تعذر الاتصال بقاعدة البيانات"}
          </span>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-2xl bg-[#102b25] p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -left-12 -top-20 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-xl">
            <div className="mb-3 flex items-center gap-2 text-sm text-emerald-300">
              <Smartphone size={18} />
              <span>BMO MOBILE MANAGEMENT</span>
            </div>

            <h2 className="text-2xl font-bold leading-relaxed sm:text-3xl">
              كل تفاصيل محلك،
              <br />
              في مكان واحد.
            </h2>

            <p className="mt-3 max-w-md text-sm leading-7 text-white/70">
              تابع الأجهزة بأرقام IMEI، وإدارة الإكسسوارات والمبيعات والعملاء
              والأقساط من خلال نظام واحد.
            </p>

            <Link
              to="/warehouse"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#102b25] transition hover:bg-emerald-50"
            >
              استكشف المخزون
              <ArrowLeft size={17} />
            </Link>
          </div>

          <div className="hidden h-36 w-36 shrink-0 items-center justify-center rounded-[2rem] border border-white/10 bg-white/5 md:flex">
            <Smartphone
              size={76}
              strokeWidth={1.1}
              className="text-emerald-300"
            />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">ملخص النشاط</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              مؤشرات مباشرة من قاعدة بيانات المحل المشتركة.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {displayStats.map((stat) => {
            const Icon = stat.icon;

            return (
              <article
                key={stat.title}
                className="rounded-2xl border border-border bg-card p-5 transition duration-200 hover:-translate-y-1 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {stat.title}
                    </p>
                    <p className="mt-4 text-3xl font-bold tracking-tight">
                      {stat.value}
                    </p>
                  </div>

                  <div className={`rounded-xl p-3 ${stat.color}`}>
                    <Icon size={22} />
                  </div>
                </div>

                <p className="mt-4 text-xs leading-6 text-muted-foreground">
                  {stat.note}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold">الوصول السريع</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            اختار العملية اللي عايز تبدأ بيها.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {shortcuts.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.title}
                to={item.to}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-emerald-600/40 hover:shadow-md"
              >
                <div className={`shrink-0 rounded-xl p-3 ${item.color}`}>
                  <Icon size={23} />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="font-bold">{item.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </p>
                </div>

                <ChevronLeft
                  size={18}
                  className="shrink-0 text-muted-foreground transition group-hover:-translate-x-1 group-hover:text-emerald-700"
                />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-muted p-3">
            <CreditCard size={23} />
          </div>

          <div className="flex-1">
            <h2 className="font-bold">المبيعات والأقساط</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
              هنجهّز دورة بيع تدعم الكاش والآجل والتقسيط، مع تسجيل المدفوعات
              والمتبقي على كل فاتورة، وربط كل جهاز برقم IMEI لمنع بيعه مرتين.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
