/* eslint-disable prettier/prettier */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  FileText,
  ArrowLeftRight,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type EmployeeShift,
  type EmployeeShiftReport,
  type TransferDailyLineBalance,
  type TransferDailyServiceBalance,
  type TransferDailySummary,
} from "../lib/api-client";
import { useEmployeeAuth } from "../components/EmployeeAuthGate";

export const Route = createFileRoute("/shifts")({
  head: () => ({ meta: [{ title: "الشيفتات والمحاسبة | BMO Mobile" }] }),
  component: ShiftsPage,
});

const egp = (value: number | null | undefined) =>
  `${(Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;

const dateTime = (value: number | string | null | undefined) => {
  if (value == null || value === "") return "—";
  const d = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    timeZone: "Africa/Cairo",
    dateStyle: "short",
    timeStyle: "short",
  });
};

function Metric({
  label,
  value,
  hint,
  warning = false,
  tone = "default",
  fullWidth = false,
}: {
  label: string;
  value: string;
  hint?: string;
  warning?: boolean;
  tone?: "default" | "success" | "warning" | "info" | "purple" | "show";
  fullWidth?: boolean;
}) {
  const toneClasses = {
    default: "border-2 border-slate-300 bg-slate-50 text-slate-950",
    success: "border-2 border-emerald-400 bg-emerald-100/90 text-emerald-950",
    warning: "border-2 border-amber-400 bg-amber-100/90 text-amber-950",
    info: "border-2 border-sky-400 bg-sky-100/90 text-sky-950",
    purple: "border-2 border-violet-400 bg-violet-100/90 text-violet-950",
    show: "border-4 border-amber-500 bg-amber-300 text-amber-950 shadow-md ring-2 ring-amber-400 col-span-full",
  };

  const selectedTone = warning ? toneClasses.warning : toneClasses[tone];

  return (
    <div
      className={`rounded-2xl p-4 shadow-sm transition-all hover:shadow-md ${selectedTone} ${fullWidth ? "col-span-full" : ""}`}
    >
      <p
        className={`text-xs font-black ${tone === "show" ? "text-amber-950 uppercase tracking-wide text-sm" : "text-slate-900"}`}
      >
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-black tabular-nums tracking-tight ${tone === "show" ? "text-black text-4xl font-black" : "text-slate-950"}`}
        dir="auto"
      >
        {value}
      </p>
      {hint && (
        <p
          className={`mt-1.5 text-xs font-extrabold leading-relaxed ${tone === "show" ? "text-amber-950 text-sm" : "text-slate-800"}`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function DropdownSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-3xl border-2 bg-card p-4 sm:p-5 shadow-sm transition hover:border-slate-400">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 marker:content-none">
        <div className="flex items-center gap-3">
          <h3 className="font-black text-lg text-slate-950">{title}</h3>
          <span className="rounded-full bg-slate-200 text-slate-950 px-3 py-1 text-xs font-extrabold tabular-nums">
            {count.toLocaleString("en-US")} سجل
          </span>
        </div>
        <ChevronDown
          size={20}
          className="text-slate-900 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-4 border-t-2 border-slate-200 pt-4">{children}</div>
    </details>
  );
}

function ShiftReportDetails({
  report,
  installmentCollections,
}: {
  report: EmployeeShiftReport;
  installmentCollections: number;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="إجمالي المبيعات"
          value={egp(report.summary.salesTotal)}
          hint={`${(report.summary.salesCount || 0).toLocaleString("en-US")} فاتورة`}
          tone="info"
        />
        <Metric
          label="ربح المبيعات"
          value={egp(report.summary.salesProfit)}
          hint="سعر البيع ناقص تكلفة البضاعة"
          tone="success"
        />
        <Metric
          label="صافي المرتجعات"
          value={egp(report.summary.returnsTotal)}
          hint={`${(report.summary.returnsCount || 0).toLocaleString("en-US")} مرتجع · بعد خصم رسوم الاستخدام`}
          warning={report.summary.returnsTotal > 0}
        />
        <Metric
          label="الأقساط المحصلة"
          value={egp(installmentCollections)}
          hint="يستثني دفعة البيع الأولى لتجنب تكرارها مع إجمالي المبيعات"
          tone="purple"
        />
        <Metric
          label="نقدية خارجة للسحب"
          value={egp(report.summary.transferCashOutgoing)}
          hint="النقدية التي سلّمها المحل للعملاء في عمليات الاستلام"
          tone="warning"
        />
        <Metric
          label="نقدية داخلة من التحويلات"
          value={egp(report.summary.transferCashIncoming)}
          hint="النقدية التي استلمها المحل من العملاء عند التحويل"
          tone="info"
        />
        <Metric
          label="تكلفة التحويلات"
          value={egp(report.summary.transferCost)}
          tone="default"
        />
        <Metric
          label="ربح التحويلات"
          value={egp(report.summary.transferProfit)}
          hint={`${(report.summary.transferCount || 0).toLocaleString("en-US")} عملية تحويل/استلام`}
          tone="purple"
        />
        <Metric
          label="المتوقع في الدرج"
          value={egp(report.summary.expectedCash)}
          hint={`عهدة البداية ${egp(report.summary.openingCash)}`}
          tone="show"
          fullWidth
        />
      </div>

      {report.shift.status === "closed" &&
        report.summary.cashDifference != null && (
          <div
            className={`flex items-start gap-3 rounded-2xl border-2 p-4 shadow-sm ${Math.abs(report.summary.cashDifference) < 0.001 ? "border-emerald-400 bg-emerald-100 text-emerald-950" : report.summary.cashDifference < 0 ? "border-rose-400 bg-rose-100 text-rose-950" : "border-amber-400 bg-amber-100 text-amber-950"}`}
          >
            <AlertTriangle size={22} className="mt-0.5 shrink-0" />
            <div>
              <h3 className="font-black text-base">
                {Math.abs(report.summary.cashDifference) < 0.001
                  ? "العهدة النقدية مطابقة تماماً"
                  : report.summary.cashDifference < 0
                    ? "تنبيه: عجز نقدي في الدرج"
                    : "تنبيه: زيادة نقدية في الدرج"}
              </h3>
              <p className="mt-1 text-sm font-extrabold">
                الفعلي:{" "}
                <span className="font-mono font-black">
                  {egp(report.summary.closingCash)}
                </span>{" "}
                · المتوقع:{" "}
                <span className="font-mono font-black">
                  {egp(report.summary.expectedCash)}
                </span>{" "}
                · الفرق:{" "}
                <span className="font-mono font-black">
                  {egp(report.summary.cashDifference)}
                </span>
              </p>
            </div>
          </div>
        )}

      <div className="space-y-4">
        <DropdownSection title="فواتير البيع" count={report.sales.length}>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[620px] text-right text-sm">
              <thead className="sticky top-0 bg-slate-200 text-xs font-black text-slate-950">
                <tr>
                  <th className="p-2.5">الفاتورة</th>
                  <th className="p-2.5">العميل</th>
                  <th className="p-2.5">الإجمالي</th>
                  <th className="p-2.5">ربح البضاعة</th>
                  <th className="p-2.5">الوقت</th>
                </tr>
              </thead>
              <tbody>
                {report.sales.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <td className="p-2.5 font-black font-mono text-black">
                      {row.invoiceNumber}
                    </td>
                    <td className="p-2.5 font-bold text-slate-950">
                      {row.customerName}
                    </td>
                    <td className="p-2.5 font-black font-mono tabular-nums text-black">
                      {egp(row.total)}
                    </td>
                    <td className="p-2.5 font-black font-mono tabular-nums text-emerald-800">
                      {egp(row.profit)}
                    </td>
                    <td className="p-2.5 text-xs text-slate-800 font-mono font-bold">
                      {dateTime(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.sales.length && (
              <p className="p-6 text-center text-sm font-extrabold text-slate-800">
                لا توجد فواتير على الشيفت ده.
              </p>
            )}
          </div>
        </DropdownSection>

        <DropdownSection title="التحصيلات" count={report.payments.length}>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[560px] text-right text-sm">
              <thead className="sticky top-0 bg-slate-200 text-xs font-black text-slate-950">
                <tr>
                  <th className="p-2.5">الفاتورة</th>
                  <th className="p-2.5">النوع</th>
                  <th className="p-2.5">المبلغ</th>
                  <th className="p-2.5">الوقت</th>
                </tr>
              </thead>
              <tbody>
                {report.payments.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <td className="p-2.5 font-black font-mono text-black">
                      {row.invoiceNumber || row.saleId}
                    </td>
                    <td className="p-2.5 font-bold text-slate-950">
                      {row.recordType === "initial_payment"
                        ? "دفع عند البيع"
                        : row.recordType === "installment_payment"
                          ? "تحصيل قسط"
                          : "تحصيل مديونية"}
                    </td>
                    <td className="p-2.5 font-black font-mono tabular-nums text-emerald-800">
                      {egp(row.amount)}
                    </td>
                    <td className="p-2.5 text-xs text-slate-800 font-mono font-bold">
                      {dateTime(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.payments.length && (
              <p className="p-6 text-center text-sm font-extrabold text-slate-800">
                لا توجد تحصيلات على الشيفت ده.
              </p>
            )}
          </div>
        </DropdownSection>

        <DropdownSection title="المرتجعات" count={report.returns.length}>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[560px] text-right text-sm">
              <thead className="sticky top-0 bg-slate-200 text-xs font-black text-slate-950">
                <tr>
                  <th className="p-2.5">رقم المرتجع</th>
                  <th className="p-2.5">العميل</th>
                  <th className="p-2.5">الصافي</th>
                  <th className="p-2.5">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {report.returns.map((row) => (
                  <tr
                    key={row.returnId}
                    className="border-t border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <td className="p-2.5 font-black font-mono text-black">
                      {row.returnNumber}
                    </td>
                    <td className="p-2.5 font-bold text-slate-950">
                      {row.customerName}
                    </td>
                    <td className="p-2.5 font-black font-mono tabular-nums text-rose-800">
                      {egp(row.netRefund)}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-black ${row.settlementStatus === "completed" ? "bg-emerald-200 text-emerald-950 border border-emerald-400" : "bg-amber-200 text-amber-950 border border-amber-400"}`}
                      >
                        {row.settlementStatus === "completed"
                          ? "تمت التسوية"
                          : "بانتظار التسوية"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.returns.length && (
              <p className="p-6 text-center text-sm font-extrabold text-slate-800">
                لا توجد مرتجعات على الشيفت ده.
              </p>
            )}
          </div>
        </DropdownSection>

        <DropdownSection
          title="تسويات وردّ المبالغ"
          count={report.settlements.length}
        >
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[540px] text-right text-sm">
              <thead className="sticky top-0 bg-slate-200 text-xs font-black text-slate-950">
                <tr>
                  <th className="p-2.5">رقم المرتجع</th>
                  <th className="p-2.5">الفاتورة</th>
                  <th className="p-2.5">العميل</th>
                  <th className="p-2.5">طريقة التسوية</th>
                  <th className="p-2.5">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {report.settlements.map((row) => (
                  <tr
                    key={row.returnId}
                    className="border-t border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <td className="p-2.5 font-black font-mono text-black">
                      {row.returnNumber}
                    </td>
                    <td className="p-2.5 font-mono font-bold text-black">
                      {row.invoiceNumber || "—"}
                    </td>
                    <td className="p-2.5 font-bold text-slate-950">
                      {row.customerName}
                    </td>
                    <td className="p-2.5 font-bold text-slate-950">
                      {row.settlementMethod === "cash_refund"
                        ? "رد نقدي"
                        : row.settlementMethod === "store_credit"
                          ? "رصيد للمحل"
                          : row.settlementMethod === "exchange"
                            ? "استبدال"
                            : "تسوية مديونية"}
                    </td>
                    <td className="p-2.5 font-black font-mono tabular-nums text-black">
                      {egp(row.customerRefund)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.settlements.length && (
              <p className="p-6 text-center text-sm font-extrabold text-slate-800">
                لا توجد تسويات مرتجعات على الشيفت ده.
              </p>
            )}
          </div>
        </DropdownSection>

        <DropdownSection title="عمليات التحويل" count={report.transfers.length}>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[620px] text-right text-sm">
              <thead className="sticky top-0 bg-slate-200 text-xs font-black text-slate-950">
                <tr>
                  <th className="p-2.5">المرجع</th>
                  <th className="p-2.5">الخدمة / العملية</th>
                  <th className="p-2.5">المبلغ</th>
                  <th className="p-2.5">العمولة</th>
                  <th className="p-2.5">الربح</th>
                </tr>
              </thead>
              <tbody>
                {report.transfers.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <td className="p-2.5 font-black font-mono text-black">
                      {row.referenceNumber}
                    </td>
                    <td className="p-2.5">
                      <span className="font-black text-black">
                        {row.serviceType === "wallet"
                          ? "محفظة إلكترونية"
                          : "إنستا باي"}
                      </span>{" "}
                      ·{" "}
                      <span
                        className={
                          row.operationType === "transfer"
                            ? "text-blue-800 font-black"
                            : "text-emerald-800 font-black"
                        }
                      >
                        {row.operationType === "transfer" ? "تحويل" : "استلام"}
                      </span>
                    </td>
                    <td className="p-2.5 font-black font-mono tabular-nums text-black">
                      {egp(row.amount)}
                    </td>
                    <td className="p-2.5 font-bold font-mono tabular-nums text-slate-800">
                      {egp(row.commission)}
                    </td>
                    <td className="p-2.5 font-black font-mono tabular-nums text-violet-800">
                      {egp(row.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.transfers.length && (
              <p className="p-6 text-center text-sm font-extrabold text-slate-800">
                لا توجد تحويلات على الشيفت ده.
              </p>
            )}
          </div>
        </DropdownSection>
      </div>
    </div>
  );
}

function ShiftsPage() {
  const { employee, lockSystem } = useEmployeeAuth();
  const [activeShift, setActiveShift] = useState<EmployeeShift | null>(null);
  const [history, setHistory] = useState<EmployeeShift[]>([]);
  const [report, setReport] = useState<EmployeeShiftReport | null>(null);
  const [historyReport, setHistoryReport] =
    useState<EmployeeShiftReport | null>(null);
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [openNote, setOpenNote] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");

  useEffect(() => {
    let live = true;
    if (!employee) {
      setInitialLoading(false);
      return () => {
        live = false;
      };
    }
    setInitialLoading(true);
    Promise.all([api.getCurrentShift(), api.getShifts({ limit: 100 })])
      .then(async ([current, rows]) => {
        if (!live) return;
        setActiveShift(current.shift);
        setHistory(rows);
        if (current.shift) {
          setSelectedHistoryId(current.shift.id);
          const freshReport = await api.getShiftReport(current.shift.id);
          if (!live) return;
          setReport(freshReport);
          setClosingCash(String(freshReport.summary.expectedCash));
        } else {
          setReport(null);
          setSelectedHistoryId("");
        }
      })
      .catch((error) => {
        if (live)
          toast.error(
            error instanceof Error
              ? error.message
              : "تعذر تحميل بيانات الشيفت.",
          );
      })
      .finally(() => {
        if (live) setInitialLoading(false);
      });
    return () => {
      live = false;
    };
  }, [employee?.id]);

  const canSeeAll = employee
    ? ["accountant", "manager", "owner", "developer"].includes(employee.role)
    : false;
  const activeLabel =
    activeShift?.status === "open"
      ? "الشيفت مفتوح"
      : activeShift?.status === "closed"
        ? "الشيفت مقفول"
        : "لا يوجد شيفت مفتوح";

  const getInstallmentCollections = (rpt: EmployeeShiftReport | null) =>
    (rpt?.payments ?? []).reduce(
      (total, payment) =>
        total +
        (payment.recordType === "installment_payment"
          ? Number(payment.amount || 0)
          : 0),
      0,
    );

  async function handleOpenShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee || saving) return;
    const cash = Number(openingCash);
    if (!Number.isFinite(cash) || cash < 0)
      return toast.error("اكتب عهدة بداية صحيحة.");
    setSaving(true);
    try {
      const result = await api.openShift({
        openingCash: cash,
        note: openNote.trim(),
      });
      setActiveShift(result.shift);
      setSelectedHistoryId(result.shift.id);
      setOpenNote("");
      setClosingCash(String(result.shift.openingCash));
      const [freshReport, rows] = await Promise.all([
        api.getShiftReport(result.shift.id),
        api.getShifts({ limit: 100 }),
      ]);
      setReport(freshReport);
      setHistory(rows);
      toast.success("تم فتح الشيفت. أي عملية جديدة هتتسجل على الشيفت ده.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر فتح الشيفت.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeShift || activeShift.status !== "open" || saving) return;
    const cash = Number(closingCash);
    if (!Number.isFinite(cash) || cash < 0)
      return toast.error("اكتب النقدية الفعلية بشكل صحيح.");
    if (
      !window.confirm(
        "تأكيد إغلاق الشيفت؟ بعد الإغلاق لن تُسجّل عمليات جديدة عليه، وسيتم إنهاء جلسة الموظف وطلب تسجيل الدخول مجددًا.",
      )
    )
      return;
    setSaving(true);
    try {
      const finalReport = await api.closeShift(activeShift.id, {
        closingCash: cash,
        note: closeNote.trim(),
      });
      setReport(finalReport);
      setActiveShift(finalReport.shift);
      setClosingCash(String(finalReport.summary.closingCash ?? cash));
      setCloseNote("");
      setHistory((rows) => [
        finalReport.shift,
        ...rows.filter((row) => row.id !== finalReport.shift.id),
      ]);
      toast.success("تم إغلاق الشيفت وحفظ التقرير. تم إنهاء جلسة الموظف.");
      lockSystem();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر إغلاق الشيفت.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function selectHistoryShift(shift: EmployeeShift) {
    if (!employee || loadingReport) return;
    setSelectedHistoryId(shift.id);
    setLoadingReport(true);
    try {
      const fetchedReport = await api.getShiftReport(shift.id);
      setHistoryReport(fetchedReport);
      setHistoryDialogOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تحميل تقرير الشيفت.",
      );
    } finally {
      setLoadingReport(false);
    }
  }

  if (!employee) return null;

  return (
    <main
      dir="rtl"
      lang="ar"
      className="mx-auto w-full max-w-[1500px] space-y-6 pb-10 px-4 sm:px-6"
    >
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end border-b-2 pb-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-slate-700">
            <span>الإدارة المالية</span>
            <ChevronLeft size={15} />
            <span className="text-black font-black">الشيفتات والمحاسبة</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-slate-950">
            الشيفتات والمحاسبة
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-800">
            كل بيع وتحصيل ومرتجع وتحويل بيتربط بالشيفت المفتوح للموظف المسجل
            دخوله، مع تقرير وأرصدة وقت الإغلاق.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-200 p-1.5 rounded-2xl border-2 border-slate-300">
          <button
            type="button"
            onClick={() => setActiveTab("current")}
            className={`px-4 py-2 rounded-xl text-sm font-black transition ${activeTab === "current" ? "bg-white text-black shadow-sm" : "text-slate-700 hover:text-black"}`}
          >
            الشيفت الحالي والتقرير
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 rounded-xl text-sm font-black transition ${activeTab === "history" ? "bg-white text-black shadow-sm" : "text-slate-700 hover:text-black"}`}
          >
            سجل الشيفتات السابقة
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/sales"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-950 shadow-sm transition hover:bg-slate-100"
          >
            نقطة البيع <ChevronLeft size={15} />
          </Link>
          <Link
            to="/transfers"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-950 shadow-sm transition hover:bg-slate-100"
          >
            التحويلات <ChevronLeft size={15} />
          </Link>
        </div>
      </header>

      {initialLoading ? (
        <section className="rounded-3xl border-2 bg-card p-6 text-sm font-extrabold text-slate-800 shadow-sm text-center">
          <RefreshCw size={17} className="ml-2 inline animate-spin" /> جارٍ
          تحميل شيفتك وتقاريرك...
        </section>
      ) : activeTab === "history" ? (
        <section className="rounded-3xl border-2 bg-card p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center border-b-2 pb-3">
            <div>
              <h2 className="flex items-center gap-2 font-black text-xl text-slate-950">
                <FileText size={21} /> سجل الشيفتات السابقة
              </h2>
              <p className="mt-0.5 text-xs font-bold text-slate-800">
                {canSeeAll
                  ? "تقدر تعرض تقارير كل الموظفين."
                  : "الموظف يعرض شيفتاته فقط."}
              </p>
            </div>
            <span className="rounded-full border-2 bg-slate-200 text-slate-950 px-3 py-1 text-xs font-black tabular-nums">
              {(history.length || 0).toLocaleString("en-US")} شيفت
            </span>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[720px] text-right text-sm">
              <thead className="bg-slate-200 text-xs font-black text-slate-950">
                <tr>
                  <th className="p-3">الموظف</th>
                  <th className="p-3">الفتح</th>
                  <th className="p-3">الإغلاق</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">عهدة البداية</th>
                  <th className="p-3">الفرق النقدي</th>
                  <th className="p-3">التقرير</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t border-slate-200 hover:bg-slate-100 transition-colors ${row.id === selectedHistoryId ? "bg-primary/10 font-bold" : ""}`}
                  >
                    <td className="p-3 font-black text-black">
                      {row.employeeName}
                    </td>
                    <td className="p-3 text-xs font-mono font-bold text-slate-800">
                      {dateTime(row.openedAt)}
                    </td>
                    <td className="p-3 text-xs font-mono font-bold text-slate-800">
                      {dateTime(row.closedAt)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-black ${row.status === "open" ? "bg-emerald-200 text-emerald-950 border border-emerald-400" : "bg-slate-200 text-slate-950 border border-slate-400"}`}
                      >
                        {row.status === "open" ? "مفتوح" : "مغلق"}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-black tabular-nums text-black">
                      {egp(row.openingCash)}
                    </td>
                    <td className="p-3 font-mono tabular-nums font-black">
                      {row.cashDifference == null ? (
                        "—"
                      ) : (
                        <span
                          className={
                            Math.abs(row.cashDifference) < 0.001
                              ? "text-emerald-800"
                              : row.cashDifference < 0
                                ? "text-rose-800"
                                : "text-amber-800"
                          }
                        >
                          {egp(row.cashDifference)}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => void selectHistoryShift(row)}
                        disabled={loadingReport}
                        className="inline-flex items-center gap-1 rounded-xl border-2 border-slate-300 bg-white px-3 py-1.5 text-xs font-black shadow-sm transition hover:bg-slate-100 disabled:opacity-50 text-black"
                      >
                        عرض التفاصيل <ChevronLeft size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!history.length && (
              <p className="p-8 text-center text-sm font-extrabold text-slate-800">
                لسه مفيش شيفتات مسجلة.
              </p>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="flex flex-col justify-between gap-4 rounded-3xl border-2 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:p-6 border-l-8 border-l-primary">
            <div className="flex items-center gap-4">
              <span
                className={`grid h-14 w-14 place-items-center rounded-2xl shadow-inner ${activeShift?.status === "open" ? "bg-emerald-200 text-emerald-950 border border-emerald-400" : "bg-slate-200 text-slate-900 border border-slate-400"}`}
              >
                <CalendarClock size={26} />
              </span>
              <div>
                <p className="text-xs font-black text-slate-800">
                  الموظف المسجل
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  {employee.name}
                </h2>
                <p className="mt-1 text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${activeShift?.status === "open" ? "bg-emerald-600 animate-pulse" : "bg-slate-500"}`}
                  ></span>
                  {activeLabel}
                  {activeShift
                    ? ` · بدأ ${dateTime(activeShift.openedAt)}`
                    : ""}
                </p>
              </div>
            </div>
          </section>

          {activeShift?.status !== "open" && (
            <section className="rounded-3xl border-2 border-emerald-400 bg-emerald-100/80 p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-300 text-emerald-950 shadow-sm">
                  <Wallet size={22} />
                </span>
                <div>
                  <h2 className="font-black text-emerald-950 text-lg">
                    فتح شيفت جديد
                  </h2>
                  <p className="mt-0.5 text-sm font-extrabold text-emerald-950">
                    سجّل عهدة النقدية الموجودة مع الموظف في بداية الفترة.
                  </p>
                </div>
              </div>
              <form
                onSubmit={handleOpenShift}
                className="grid gap-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end"
              >
                <div>
                  <label className="mb-1.5 block text-sm font-black text-emerald-950">
                    عهدة بداية الشيفت (EGP)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={openingCash}
                    onChange={(event) => setOpeningCash(event.target.value)}
                    dir="ltr"
                    className="min-h-12 w-full rounded-xl border-2 border-emerald-400 bg-white px-3 text-left font-mono font-black text-black focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-black text-emerald-950">
                    ملاحظة (اختياري)
                  </label>
                  <input
                    value={openNote}
                    onChange={(event) => setOpenNote(event.target.value)}
                    placeholder="مثال: استلام درج الكاشير"
                    className="min-h-12 w-full rounded-xl border-2 border-emerald-400 bg-white px-3 font-bold text-black focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-6 font-black text-white shadow-md transition hover:bg-emerald-900 disabled:opacity-50"
                >
                  {saving ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}{" "}
                  فتح الشيفت
                </button>
              </form>
            </section>
          )}

          {activeShift?.status === "open" && (
            <section className="rounded-3xl border-2 border-amber-400 bg-amber-100/80 p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-300 text-amber-950 shadow-sm">
                  <LogOut size={22} />
                </span>
                <div>
                  <h2 className="font-black text-amber-950 text-lg">
                    إغلاق الشيفت والمحاسبة
                  </h2>
                  <p className="mt-0.5 text-sm font-extrabold text-amber-950">
                    راجع النقدية الفعلية في الدرج، وقارنها بالمتوقع قبل الإغلاق.
                  </p>
                </div>
              </div>
              <form
                onSubmit={handleCloseShift}
                className="grid gap-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end"
              >
                <div>
                  <label className="mb-1.5 block text-sm font-black text-amber-950">
                    النقدية الفعلية (EGP)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={closingCash}
                    onChange={(event) => setClosingCash(event.target.value)}
                    dir="ltr"
                    className="min-h-12 w-full rounded-xl border-2 border-amber-400 bg-white px-3 text-left font-mono font-black text-black focus:ring-2 focus:ring-amber-600"
                  />
                  <p className="mt-1.5 text-xs font-black text-amber-950">
                    المتوقع في الدرج:{" "}
                    <span className="font-mono bg-amber-300 px-1.5 py-0.5 rounded border border-amber-500 font-black">
                      {egp(
                        report?.shift.id === activeShift.id
                          ? report.summary.expectedCash
                          : activeShift.openingCash,
                      )}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-black text-amber-950">
                    ملاحظة الإغلاق (اختياري)
                  </label>
                  <input
                    value={closeNote}
                    onChange={(event) => setCloseNote(event.target.value)}
                    placeholder="ملاحظات تسليم الدرج أو العجز/الزيادة"
                    className="min-h-12 w-full rounded-xl border-2 border-amber-400 bg-white px-3 font-bold text-black focus:ring-2 focus:ring-amber-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-800 px-6 font-black text-white shadow-md transition hover:bg-amber-900 disabled:opacity-50"
                >
                  {saving ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    <LogOut size={18} />
                  )}{" "}
                  إغلاق وحفظ التقرير
                </button>
              </form>
            </section>
          )}

          {report && (
            <section className="space-y-6 rounded-3xl border-2 bg-card p-5 sm:p-7 shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b-2 pb-4">
                <div>
                  <h2 className="text-xl font-black text-slate-950">
                    تقرير الشيفت الحالي
                  </h2>
                  <p className="mt-1 text-sm font-black text-slate-800">
                    <span className="font-black text-black">
                      {report.shift.employeeName}
                    </span>{" "}
                    · فتح {dateTime(report.shift.openedAt)} ·{" "}
                    {report.shift.status === "open" ? (
                      <span className="text-emerald-700 font-black">
                        مفتوح حالياً
                      </span>
                    ) : (
                      `مغلق في ${dateTime(report.shift.closedAt)}`
                    )}
                  </p>
                </div>
              </div>

              <ShiftReportDetails
                report={report}
                installmentCollections={getInstallmentCollections(report)}
              />
            </section>
          )}
        </>
      )}

      {/* النافذة المنبثقة (Modal) لتقرير الشيفتات السابقة عند الضغط على عرض التفاصيل */}
      {historyDialogOpen && historyReport && (
        <section
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[11000] overflow-y-auto bg-black/70 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
        >
          <div className="mx-auto max-w-[1500px] w-full max-h-[90vh] overflow-y-auto space-y-6 rounded-3xl border-2 bg-background p-5 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-3 border-b-2 pb-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  تفاصيل تقرير الشيفت السالف
                </h2>
                <p className="mt-1 text-sm font-black text-slate-800">
                  <span className="font-black text-black">
                    {historyReport.shift.employeeName}
                  </span>{" "}
                  · فتح {dateTime(historyReport.shift.openedAt)} ·{" "}
                  {historyReport.shift.status === "open" ? (
                    <span className="text-emerald-700 font-black">
                      مفتوح حالياً
                    </span>
                  ) : (
                    `مغلق في ${dateTime(historyReport.shift.closedAt)}`
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryDialogOpen(false)}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-300 bg-background px-4 py-2 text-sm font-black shadow-sm transition hover:bg-slate-100"
              >
                <X size={16} /> إغلاق
              </button>
            </div>

            <ShiftReportDetails
              report={historyReport}
              installmentCollections={getInstallmentCollections(historyReport)}
            />
          </div>
        </section>
      )}

      <div className="flex items-start gap-3 rounded-2xl border-2 border-sky-300 bg-sky-100/60 p-4 text-xs font-extrabold leading-6 text-sky-950 shadow-sm">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-sky-800" />
        <p className="font-bold">
          نقدية التحويلات مدمجة في نقدية الدرج المتوقعة أعلاه، ولا توجد عهدة
          نقدية منفصلة للتحويلات. رصيد بداية كل محفظة وإنستا باي هو الرصيد
          الفعلي وقت فتح الشيفت، وتُحفظ لقطة التسوية عند الإغلاق بدقة.
        </p>
      </div>
    </main>
  );
}
