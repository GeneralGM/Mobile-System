import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  ChevronLeft,
  Download,
  FilterX,
  History,
  Landmark,
  LoaderCircle,
  Search,
  Wallet,
} from "lucide-react";
import {
  api,
  type TransferLineRecord,
  type TransferTransactionRecord,
} from "../lib/api-client";

export const Route = createFileRoute("/transfer-history")({
  head: () => ({ meta: [{ title: "سجل التحويلات | BMO Mobile" }] }),
  component: TransferHistoryPage,
});

const asMoney = (value: number) =>
  `${(Number.isFinite(value) ? value : 0).toLocaleString("en-EG", { maximumFractionDigits: 2 })} ج.م`;
const readError = (error: unknown) => error instanceof Error ? error.message : "حصل خطأ غير متوقع.";
const dateLabel = (value: number) => new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(new Date(value));

type Filters = {
  q: string;
  operationType: "" | "transfer" | "withdrawal";
  serviceType: "" | "wallet" | "instapay";
  sourceLineId: string;
  dateFrom: string;
  dateTo: string;
  profitMin: string;
  profitMax: string;
};
const emptyFilters = (): Filters => ({ q: "", operationType: "", serviceType: "", sourceLineId: "", dateFrom: "", dateTo: "", profitMin: "", profitMax: "" });

function TransferHistoryPage() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [records, setRecords] = useState<TransferTransactionRecord[]>([]);
  const [lines, setLines] = useState<TransferLineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);

  const loadHistory = async (nextFilters = filters) => {
    setLoading(true);
    try {
      const [history, nextLines] = await Promise.all([
        api.getTransfers({
          q: nextFilters.q,
          operationType: nextFilters.operationType || undefined,
          serviceType: nextFilters.serviceType || undefined,
          sourceLineId: nextFilters.sourceLineId || undefined,
          dateFrom: nextFilters.dateFrom || undefined,
          dateTo: nextFilters.dateTo || undefined,
          profitMin: nextFilters.profitMin === "" ? undefined : Number(nextFilters.profitMin),
          profitMax: nextFilters.profitMax === "" ? undefined : Number(nextFilters.profitMax),
          limit: 1000,
        }),
        api.getTransferLines(),
      ]);
      setRecords(history);
      setLines(nextLines);
      setSearched(true);
    } catch (error) {
      toast.error(`تعذر تحميل سجل التحويلات: ${readError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let live = true;
    Promise.all([api.getTransfers({ limit: 1000 }), api.getTransferLines()])
      .then(([history, nextLines]) => {
        if (!live) return;
        setRecords(history);
        setLines(nextLines);
        setSearched(true);
      })
      .catch((error) => { if (live) toast.error(`تعذر تحميل سجل التحويلات: ${readError(error)}`); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const profitTotal = useMemo(() => records.reduce((sum, row) => sum + row.profit, 0), [records]);
  const commissionTotal = useMemo(() => records.reduce((sum, row) => sum + row.commission, 0), [records]);
  const costTotal = useMemo(() => records.reduce((sum, row) => sum + row.transferCost, 0), [records]);

  const change = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((old) => ({ ...old, [key]: value }));
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      toast.error("تاريخ البداية لازم يكون قبل تاريخ النهاية.");
      return;
    }
    if (filters.profitMin !== "" && filters.profitMax !== "" && Number(filters.profitMin) > Number(filters.profitMax)) {
      toast.error("الحد الأدنى للربح لازم يكون أقل من أو يساوي الحد الأعلى.");
      return;
    }
    void loadHistory(filters);
  };
  const clearFilters = () => {
    const empty = emptyFilters();
    setFilters(empty);
    void loadHistory(empty);
  };
  const exportCsv = () => {
    const columns = ["رقم العملية","النوع","الخدمة","خط المحل","اسم صاحب الخط","رقم العميل/الوجهة","المبلغ","العمولة","التكلفة","صافي الربح","التاريخ"];
    const data = records.map((row) => [
      row.referenceNumber,
      row.operationType === "transfer" ? "تحويل" : "سحب",
      row.serviceType === "wallet" ? "محفظة إلكترونية" : "إنستا باي",
      row.sourcePhone,
      row.sourceOwnerName,
      row.destinationPhone || row.recipientPhone,
      row.amount.toFixed(2),
      row.commission.toFixed(2),
      row.transferCost.toFixed(2),
      row.profit.toFixed(2),
      dateLabel(row.createdAt),
    ]);
    const csv = [columns, ...data].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `transfer-history-${new Date().toISOString().slice(0,10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-6 pb-10">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><span>الإدارة المالية</span><ChevronLeft size={15} /><Link to="/transfers" className="hover:underline">التحويلات</Link><ChevronLeft size={15} /><span className="text-foreground">السجل</span></div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">سجل التحويلات</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">كل عمليات السحب والتحويل، بعمولتها وتكلفتها وصافي ربحها المحفوظ وقت التنفيذ.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportCsv} disabled={!records.length} className="inline-flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-bold transition hover:bg-muted disabled:opacity-50"><Download size={16} /> تصدير CSV</button>
          <Link to="/transfers" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground"><ArrowLeftRight size={17} /> عملية جديدة</Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="العمليات المعروضة" value={records.length.toLocaleString("en-US")} icon={<History size={18} />} tone="neutral" />
        <SummaryCard title="إجمالي العمولات" value={asMoney(commissionTotal)} icon={<Banknote size={18} />} tone="violet" />
        <SummaryCard title="إجمالي التكلفة" value={asMoney(costTotal)} icon={<Wallet size={18} />} tone="amber" />
        <SummaryCard title="صافي الربح" value={asMoney(profitTotal)} icon={<Banknote size={18} />} tone={profitTotal < 0 ? "rose" : "green"} />
      </section>

      <form onSubmit={submitSearch} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Search size={17} /></span><div><h2 className="font-extrabold">بحث وفلترة ذكية</h2><p className="mt-1 text-xs text-muted-foreground">بحث بالرقم أو اسم صاحب الخط أو رقم العميل أو رقم العملية.</p></div></div><button type="button" onClick={clearFilters} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted"><FilterX size={15} /> مسح</button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold">كلمة البحث</span><span className="relative block"><Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.q} onChange={(e) => change("q", e.target.value)} placeholder="رقم العملية، رقم الخط، العميل..." className={`${inputClass} pr-9`} /></span></label>
          <label><span className="mb-1.5 block text-xs font-bold">نوع العملية</span><select value={filters.operationType} onChange={(e) => change("operationType", e.target.value as Filters["operationType"])} className={inputClass}><option value="">كل العمليات</option><option value="transfer">تحويل</option><option value="withdrawal">سحب</option></select></label>
          <label><span className="mb-1.5 block text-xs font-bold">الخدمة</span><select value={filters.serviceType} onChange={(e) => change("serviceType", e.target.value as Filters["serviceType"])} className={inputClass}><option value="">كل الخدمات</option><option value="wallet">محفظة إلكترونية</option><option value="instapay">إنستا باي</option></select></label>
          <label><span className="mb-1.5 block text-xs font-bold">خط المحل</span><select value={filters.sourceLineId} onChange={(e) => change("sourceLineId", e.target.value)} className={inputClass}><option value="">كل الخطوط</option>{lines.map((line) => <option key={line.id} value={line.id}>{line.phone} — {line.ownerName}</option>)}</select></label>
          <label><span className="mb-1.5 block text-xs font-bold">من تاريخ</span><span className="relative block"><CalendarDays size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="date" value={filters.dateFrom} onChange={(e) => change("dateFrom", e.target.value)} className={`${inputClass} pr-9`} /></span></label>
          <label><span className="mb-1.5 block text-xs font-bold">إلى تاريخ</span><span className="relative block"><CalendarDays size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="date" value={filters.dateTo} onChange={(e) => change("dateTo", e.target.value)} className={`${inputClass} pr-9`} /></span></label>
          <label><span className="mb-1.5 block text-xs font-bold">أقل صافي ربح</span><input type="number" step="0.01" value={filters.profitMin} onChange={(e) => change("profitMin", e.target.value)} placeholder="من" className={inputClass} /></label>
          <label><span className="mb-1.5 block text-xs font-bold">أعلى صافي ربح</span><input type="number" step="0.01" value={filters.profitMax} onChange={(e) => change("profitMax", e.target.value)} placeholder="إلى" className={inputClass} /></label>
        </div>
        <button type="submit" disabled={loading} className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-50">{loading ? <LoaderCircle size={17} className="animate-spin" /> : <Search size={17} />} تطبيق الفلاتر</button>
      </form>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col justify-between gap-2 border-b p-4 sm:flex-row sm:items-center"><div><h2 className="font-extrabold">تفاصيل العمليات</h2><p className="mt-1 text-xs text-muted-foreground">الأحدث أولًا · يعرض حتى 1000 عملية لكل بحث.</p></div><span className="self-start rounded-full bg-muted px-3 py-1 text-xs font-bold">{records.length} نتيجة</span></div>
        {loading ? <div className="grid min-h-56 place-items-center text-sm text-muted-foreground"><LoaderCircle size={22} className="animate-spin" /> جارٍ تحميل السجل...</div> : !records.length ? <div className="grid min-h-64 place-items-center px-6 py-12 text-center"><span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><History size={25} /></span><h3 className="font-extrabold">مفيش عمليات مطابقة</h3><p className="mt-1 text-sm text-muted-foreground">غيّر الفلاتر أو نفّذ عملية جديدة عشان تظهر في السجل.</p></div> : (
          <>
            <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[1100px] border-collapse text-right text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["العملية والتاريخ","الخدمة","خط المحل","العميل / الوجهة","المبلغ","العمولة","التكلفة","صافي الربح"].map((title) => <th key={title} className="whitespace-nowrap px-4 py-3 font-bold">{title}</th>)}</tr></thead><tbody>{records.map((row) => <HistoryRow key={row.id} row={row} />)}</tbody></table></div>
            <div className="space-y-3 p-3 lg:hidden">{records.map((row) => <HistoryCard key={row.id} row={row} />)}</div>
          </>
        )}
        {searched && records.length === 1000 && <div className="border-t bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">تم عرض أول 1000 نتيجة فقط. استخدم نطاقًا زمنيًا أضيق لعرض عمليات أقدم.</div>}
      </section>
    </main>
  );
}

function HistoryRow({ row }: { row: TransferTransactionRecord }) {
  return <tr className="border-t transition hover:bg-muted/25"><td className="px-4 py-3"><p className="font-extrabold tabular-nums">{row.referenceNumber}</p><p className="mt-1 text-[11px] text-muted-foreground">{dateLabel(row.createdAt)}</p><span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${row.operationType === "transfer" ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800"}`}>{row.operationType === "transfer" ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}{row.operationType === "transfer" ? "تحويل" : "سحب"}</span></td><td className="px-4 py-3"><ServicePill service={row.serviceType} vodafone={row.transferToVodafone} /></td><td className="px-4 py-3"><p className="font-bold tabular-nums">{row.sourcePhone}</p><p className="mt-1 text-xs text-muted-foreground">{row.sourceOwnerName}</p></td><td className="px-4 py-3"><p className="font-bold tabular-nums">{row.destinationPhone || row.recipientPhone || "—"}</p>{row.recipientName && <p className="mt-1 text-xs text-muted-foreground">{row.recipientName}</p>}{row.destinationLineId && <span className="mt-1 inline-block text-[10px] text-violet-700">تحويل داخلي</span>}</td><td className="whitespace-nowrap px-4 py-3 font-extrabold tabular-nums">{asMoney(row.amount)}</td><td className="whitespace-nowrap px-4 py-3 tabular-nums">{asMoney(row.commission)}</td><td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{asMoney(row.transferCost)}</td><td className="whitespace-nowrap px-4 py-3"><span className={`font-black tabular-nums ${row.profit < 0 ? "text-rose-700" : "text-emerald-700"}`}>{asMoney(row.profit)}</span></td></tr>;
}

function HistoryCard({ row }: { row: TransferTransactionRecord }) {
  return <article className="rounded-xl border p-3.5"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold tabular-nums">{row.referenceNumber}</p><p className="mt-1 text-[11px] text-muted-foreground">{dateLabel(row.createdAt)}</p></div><ServicePill service={row.serviceType} vodafone={row.transferToVodafone} /></div><div className="mt-3 grid grid-cols-2 gap-3 border-y py-3"><div><p className="text-[11px] text-muted-foreground">نوع العملية</p><p className="mt-1 flex items-center gap-1.5 text-sm font-bold">{row.operationType === "transfer" ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}{row.operationType === "transfer" ? "تحويل" : "سحب"}</p></div><div><p className="text-[11px] text-muted-foreground">المبلغ</p><p className="mt-1 font-extrabold tabular-nums">{asMoney(row.amount)}</p></div><div><p className="text-[11px] text-muted-foreground">خط المحل</p><p className="mt-1 text-sm font-bold">{row.sourcePhone}</p><p className="text-[11px] text-muted-foreground">{row.sourceOwnerName}</p></div><div><p className="text-[11px] text-muted-foreground">العميل / الوجهة</p><p className="mt-1 text-sm font-bold">{row.destinationPhone || row.recipientPhone || "—"}</p><p className="text-[11px] text-muted-foreground">{row.recipientName || (row.destinationLineId ? "تحويل داخلي" : "")}</p></div></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><p className="text-muted-foreground">العمولة</p><p className="mt-1 font-bold tabular-nums">{asMoney(row.commission)}</p></div><div><p className="text-muted-foreground">التكلفة</p><p className="mt-1 font-bold tabular-nums">{asMoney(row.transferCost)}</p></div><div><p className="text-muted-foreground">صافي الربح</p><p className={`mt-1 font-black tabular-nums ${row.profit < 0 ? "text-rose-700" : "text-emerald-700"}`}>{asMoney(row.profit)}</p></div></div></article>;
}

function ServicePill({ service, vodafone }: { service: "wallet" | "instapay"; vodafone: boolean }) {
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${service === "wallet" ? "bg-emerald-50 text-emerald-800" : "bg-violet-50 text-violet-800"}`}>{service === "wallet" ? <Wallet size={13} /> : <Landmark size={13} />}{service === "wallet" ? "محفظة إلكترونية" : vodafone ? "إنستا باي ← فودافون" : "إنستا باي"}</span>;
}

function SummaryCard({ title, value, icon, tone }: { title: string; value: string; icon: ReactNode; tone: "neutral" | "violet" | "amber" | "green" | "rose" }) {
  const toneClass = tone === "violet" ? "bg-violet-50 text-violet-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "rose" ? "bg-rose-50 text-rose-700" : "bg-muted text-foreground";
  return <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toneClass}`}>{icon}</span><div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">{title}</p><p className="mt-1 truncate text-lg font-black tabular-nums">{value}</p></div></div>;
}

const inputClass = "w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15";
