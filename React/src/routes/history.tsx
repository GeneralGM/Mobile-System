/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useDB, type Voucher } from "@/lib/store";
import { PrintVoucher } from "@/components/PrintVoucher";
import { PrintReport } from "@/components/PrintReport";
import {
  Printer,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  CalendarRange,
} from "lucide-react";
import { getApiUrl } from "@/api";
import PancakeLoader from "@/components/loader";
const API_URL = getApiUrl();

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "سجل العمليات - نظام المخزون" }] }),
  component: HistoryPage,
});

type Tab = "entry" | "issue";

const AR_DAYS = [
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
  "الأحد",
];

function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { year: d.getUTCFullYear(), week };
}

function pad(n: number) {
  return n < 10 ? "0" + n : "" + n;
}

function fmtDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function getDatesOfISOWeek(year: number, week: number): string[] {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const start = new Date(simple);
  if (dow <= 4) start.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else start.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return fmtDate(d);
  });
}

function HistoryPage() {
  const { db } = useDB();
  const [tab, setTab] = useState<Tab>("entry");

  // 🌟 1. ستيت (State) لتخزين البيانات القادمة من السيرفر كبديل احتياطي
  const [serverVouchers, setServerVouchers] = useState<Voucher[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 🌟 2. جلب الأذونات من الداتابيز (pgAdmin) لو الـ LocalStorage اتمسح
  // 🌟 جلب البيانات من السيرفر بشكل دائم
  useEffect(() => {
    async function fetchVouchersFromDB() {
      try {
        const response = await fetch(`http://${API_URL}:5000/api/vouchers`);
        if (response.ok) {
          const data = await response.json();
          setServerVouchers(data);
        }
      } catch (error) {
        console.error("❌ خطأ أثناء جلب الأذونات:", error);
      }
    }
    fetchVouchersFromDB();
  }, []);

  // 🌟 الدمج الذكي (المحلي + السيرفر)
  const activeVouchers = useMemo(() => {
    const allVouchers = new Map();
    // نحط السيرفر الأول
    serverVouchers.forEach((v) => allVouchers.set(v.id, v));
    // نحط المحلي فوقه عشان يظهر معانا
    (db.vouchers || []).forEach((v) => allVouchers.set(v.id, v));

    return Array.from(allVouchers.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }, [db.vouchers, serverVouchers]);

  const today = new Date();
  const currentISO = getISOWeek(today);
  const year = currentISO.year;

  const [week, setWeek] = useState<number>(currentISO.week);
  const [day, setDay] = useState<string>("all"); // "all" or YYYY-MM-DD
  const [printing, setPrinting] = useState<{
    vouchers: Voucher[];
    mode: "single" | "daily" | "weekly";
    label: string;
  } | null>(null);

  const weekDates = useMemo(() => getDatesOfISOWeek(year, week), [year, week]);

  // // 🌟 3. المصدر الذكي للبيانات (يختار المحلي أولاً ثم السيرفر)
  // const activeVouchers =
  //   db.vouchers && db.vouchers.length > 0 ? db.vouchers : serverVouchers;

  const tabVouchers = useMemo(
    () =>
      activeVouchers
        .filter((v) => v.type === tab)
        .sort((a, b) => b.createdAt - a.createdAt),
    [activeVouchers, tab],
  );

  const weekVouchers = useMemo(
    () => tabVouchers.filter((v) => weekDates.includes(v.date)),
    [tabVouchers, weekDates],
  );

  const filtered = useMemo(
    () =>
      day === "all" ? weekVouchers : weekVouchers.filter((v) => v.date === day),
    [weekVouchers, day],
  );

  const triggerPrint = (payload: typeof printing) => {
    setPrinting(payload);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrinting(null), 500);
    }, 100);
  };

  const printOne = (v: Voucher) =>
    triggerPrint({ vouchers: [v], mode: "single", label: v.date });

  const printDaily = () => {
    if (day === "all" || filtered.length === 0) return;
    triggerPrint({ vouchers: filtered, mode: "daily", label: day });
  };

  const printWeekly = () => {
    if (weekVouchers.length === 0) return;
    triggerPrint({
      vouchers: weekVouchers,
      mode: "weekly",
      label: `الأسبوع ${week} - ${year}`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="no-print">
        <h1 className="text-2xl font-bold">سجل العمليات والتقارير</h1>
        <p className="text-sm text-muted-foreground mt-1">
          تنظيم الحركات بحسب أسابيع وأيام السنة، مع تقارير يومية وأسبوعية.
        </p>
      </div>

      {/* Tabs */}
      <div className="no-print flex gap-1 bg-secondary p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab("entry")}
          className={`px-4 h-9 rounded-md text-sm font-medium flex items-center gap-2 transition ${tab === "entry" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
        >
          <ArrowDownToLine className="w-4 h-4" /> أذونات التوريد
        </button>
        <button
          onClick={() => setTab("issue")}
          className={`px-4 h-9 rounded-md text-sm font-medium flex items-center gap-2 transition ${tab === "issue" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
        >
          <ArrowUpFromLine className="w-4 h-4" /> أذونات الصرف
        </button>
      </div>

      {/* Filters & report print */}
      <div className="no-print bg-card border border-border rounded-xl p-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground mb-1 block">
            الأسبوع (ISO) — سنة {year}
          </span>
          <select
            value={week}
            onChange={(e) => {
              setWeek(parseInt(e.target.value));
              setDay("all");
            }}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm min-w-40"
          >
            {Array.from(
              { length: currentISO.week },
              (_, i) => currentISO.week - i,
            ).map((w) => (
              <option key={w} value={w}>
                الأسبوع {w}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground mb-1 block">
            اليوم
          </span>
          <select
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm min-w-52"
          >
            <option value="all">كل أيام الأسبوع</option>
            {weekDates.map((d, i) => {
              const count = tabVouchers.filter((v) => v.date === d).length;
              return (
                <option key={d} value={d}>
                  {AR_DAYS[i]} — {d} ({count})
                </option>
              );
            })}
          </select>
        </label>

        <div className="flex items-end gap-2 ms-auto">
          <button
            onClick={printDaily}
            disabled={day === "all" || filtered.length === 0}
            className="h-10 px-4 rounded-md border border-input text-sm font-medium hover:bg-secondary flex items-center gap-2 disabled:opacity-50"
            title={day === "all" ? "اختر يوماً محدداً" : "طباعة التقرير اليومي"}
          >
            <CalendarDays className="w-4 h-4" />
            طباعة التقرير اليومي
          </button>
          <button
            onClick={printWeekly}
            disabled={weekVouchers.length === 0}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 flex items-center gap-2 disabled:opacity-50"
          >
            <CalendarRange className="w-4 h-4" />
            طباعة التقرير الأسبوعي
          </button>
        </div>
      </div>

      <div className="no-print text-xs text-muted-foreground bg-accent/30 border border-accent rounded-lg p-3">
        <strong>تنبيه:</strong> جميع التقارير اليومية والأسبوعية تعرض فقط حركات
        من نوع
        <strong> {tab === "entry" ? "التوريد" : "الصرف"} </strong>— لا يُسمح
        بدمج التوريد والصرف في تقرير واحد.
      </div>

      {/* List */}
      <div className="no-print space-y-2">
        {isLoading ? (
          <div className="bg-card border border-border rounded-xl p-10 text-center text-amber-600 font-bold animate-pulse">
            <PancakeLoader />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
            لا توجد أذونات ضمن هذا التصفية
          </div>
        ) : (
          filtered.map((v, idx) => (
            <div
              key={v.id}
              className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center gap-3"
            >
              <div className="w-10 h-10 grid place-items-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">
                  {v.type === "entry"
                    ? `توريد من: ${(v as any).supplier}`
                    : `صرف إلى: ${(v as any).department}`}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {v.date} • {v.lines.length} أصناف
                  {v.type === "entry" && (
                    <>
                      {" "}
                      • الإجمالي:{" "}
                      {v.lines
                        .reduce(
                          (s: number, l: { price: any; qty: number }) =>
                            s + (l.price || 0) * l.qty,
                          0,
                        )
                        .toFixed(2)}
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => printOne(v)}
                className="px-3 h-9 rounded-md border border-input text-sm hover:bg-secondary flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> طباعة الإذن
              </button>
            </div>
          ))
        )}
      </div>

      {/* Print area */}
      {printing && (
        <div className="print-area">
          {printing.mode === "single" &&
            printing.vouchers.map((v) => (
              <PrintVoucher key={v.id} voucher={v} />
            ))}
          {printing.mode === "daily" && (
            <PrintReport
              vouchers={printing.vouchers}
              title={`التقرير اليومي — ${tab === "entry" ? "أذونات التوريد" : "أذونات الصرف"}`}
              subtitle={`اليوم: ${printing.label} • تاريخ الطباعة: ${new Date().toLocaleDateString("ar-EG")}`}
            />
          )}
          {printing.mode === "weekly" && (
            <PrintReport
              vouchers={printing.vouchers}
              title={`التقرير الأسبوعي — ${tab === "entry" ? "أذونات التوريد" : "أذونات الصرف"}`}
              subtitle={`${printing.label} • من ${weekDates[0]} إلى ${weekDates[6]} • تاريخ الطباعة: ${new Date().toLocaleDateString("ar-EG")}`}
            />
          )}
        </div>
      )}
    </div>
  );
}
