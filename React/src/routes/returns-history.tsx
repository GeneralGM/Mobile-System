/* eslint-disable prettier/prettier */
/** eslint-disable prettier/prettier **/

/** eslint-disable prefer-const **/

import React, { useEffect, useMemo, useState } from "react";

import { createFileRoute } from "@tanstack/react-router";

import {
  Search,
  History,
  FileText,
  X,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/returns-history")({
  component: ReturnsHistoryPage,
});

//* الأنواع المستوردة/المتواطئة مع النظام الحالي*

type ReturnReason = "defect" | "change_mind" | "unsuitable" | "other";

type DeviceCondition = "sound" | "damaged" | "inspection_needed";

type SettlementMethod =
  | "cash_refund"
  | "store_credit"
  | "remaining_settlement"
  | "exchange";

interface ReturnRecord {
  returnId: string;
  returnNumber?: string;
  createdAt: string | number;
  invoiceId?: string;
  invoiceNumber?: string;
  customerName?: string;
  customerPhone?: string;
  itemIndex?: number;
  deviceId?: string;
  model?: string;
  quantityReturned?: number;
  unitPrice?: number;
  totalRefundAmount?: number;
  usageFee?: number;
  netReturnAmount?: number;
  balanceReduced?: number;
  customerRefundAmount?: number;
  settlementStatus?: "pending" | "completed";
  reason?: ReturnReason;
  deviceCondition?: DeviceCondition;
  settlementMethod?: SettlementMethod;
  status?: string;
  linkedNewInvoiceNumber?: string;
}

const RETURNS_STORAGE_KEY = "mobile-system-returns-v1";
const SALES_STORAGE_KEY = "mobile-system-sales-v1";

const money = (n: number) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })} ج.م`;

function safeRead<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readReturnRecords(): ReturnRecord[] {
  const rawReturns = safeRead<unknown>(RETURNS_STORAGE_KEY, []);
  const rawRecords = Array.isArray(rawReturns)
    ? rawReturns.filter(
        (item): item is ReturnRecord => !!item && typeof item === "object",
      )
    : [];
  // Normalize missing IDs/dates in older or partially written records to keep the history usable.
  const records = rawRecords.map((record, index) => ({
    ...record,
    returnId: String(
      record.returnId || record.returnNumber || `legacy-return-${index + 1}`,
    ),
    createdAt: record.createdAt ?? "",
  }));
  const rawSales = safeRead<unknown>(SALES_STORAGE_KEY, []);
  const sales = Array.isArray(rawSales)
    ? rawSales.filter(
        (item): item is { invoiceNumber?: string; notes?: string } =>
          !!item && typeof item === "object",
      )
    : [];

  // For exchanges, the replacement sale is intentionally a separate invoice. Resolve the link
  // from its notes (containing the return ID/number) without changing the original sale record.
  return records.map((record) => {
    if (record.linkedNewInvoiceNumber) return record;
    const identifiers = [record.returnId, record.returnNumber].filter(
      Boolean,
    ) as string[];
    if (identifiers.length === 0) return record;
    const linkedSale = sales.find(
      (sale) =>
        typeof sale.notes === "string" &&
        identifiers.some((identifier) => sale.notes!.includes(identifier)),
    );
    return linkedSale?.invoiceNumber
      ? { ...record, linkedNewInvoiceNumber: linkedSale.invoiceNumber }
      : record;
  });
}

function numeric(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function dateKey(value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toISOString().slice(0, 10);
}

function formatDate(
  value: string | number | undefined,
  withTime = true,
): string {
  if (value === undefined || value === null || value === "") return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return withTime
    ? parsed.toLocaleString("ar-EG")
    : parsed.toLocaleDateString("ar-EG");
}

function returnAmount(record: ReturnRecord): number {
  return Math.max(0, numeric(record.totalRefundAmount));
}

function usageFee(record: ReturnRecord): number {
  return Math.max(0, numeric(record.usageFee));
}

function balanceReduction(record: ReturnRecord): number {
  return Math.max(0, numeric(record.balanceReduced));
}

function customerAmountDue(record: ReturnRecord): number {
  if (
    record.customerRefundAmount !== undefined &&
    record.customerRefundAmount !== null
  ) {
    return Math.max(0, numeric(record.customerRefundAmount));
  }
  return Math.max(
    0,
    returnAmount(record) - usageFee(record) - balanceReduction(record),
  );
}

function settlementState(record: ReturnRecord): "pending" | "completed" {
  // If the whole return was applied to debt, there is no separate customer payout to settle.
  if (customerAmountDue(record) <= 0) return "completed";
  return record.settlementStatus === "completed" ? "completed" : "pending";
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

const reasonLabels: Record<ReturnReason, string> = {
  defect: "عيب بالجهاز",

  change_mind: "تغيير رأي العميل",

  unsuitable: "جهاز غير مناسب",

  other: "سبب آخر",
};

const conditionLabels: Record<DeviceCondition, string> = {
  sound: "سليم وقابل للبيع",

  damaged: "تالف",

  inspection_needed: "يحتاج فحصًا",
};

const settlementLabels: Record<SettlementMethod, string> = {
  cash_refund: "رد نقدي",

  store_credit: "رصيد متجر",

  remaining_settlement: "تسوية مديونية",

  exchange: "استبدال",
};

function ReturnsHistoryPage() {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);

  const [query, setQuery] = useState("");

  const [startDate, setStartDate] = useState("");

  const [endDate, setEndDate] = useState("");

  const [selectedReason, setSelectedReason] = useState<string>("all");

  const [selectedCondition, setSelectedCondition] = useState<string>("all");

  const [selectedSettlement, setSelectedSettlement] = useState<string>("all");
  const [selectedSettlementStatus, setSelectedSettlementStatus] =
    useState<string>("all");

  const [page, setPage] = useState(1);

  const [pageSize, setPageSize] = useState(15);

  const [selectedReturn, setSelectedReturn] = useState<ReturnRecord | null>(
    null,
  );

  useEffect(() => {
    setReturns(readReturnRecords());
  }, []);

  //* الحسابات المالية لبطاقات الملخص*
  const summary = useMemo(() => {
    let totalReturnAmountValue = 0;
    let totalBalanceReduced = 0;
    let totalCustomerRefundPending = 0;
    let totalCashRefunded = 0;
    let totalStoreCreditIssued = 0;
    let pendingSettlementCount = 0;

    returns.forEach((record) => {
      const amount = returnAmount(record);
      const reduced = balanceReduction(record);
      const due = customerAmountDue(record);
      const state = settlementState(record);

      totalReturnAmountValue += amount;
      totalBalanceReduced += reduced;

      if (state === "pending" && due > 0) {
        pendingSettlementCount += 1;
        totalCustomerRefundPending += due;
      }
      if (state === "completed" && record.settlementMethod === "cash_refund") {
        totalCashRefunded += due;
      }
      if (state === "completed" && record.settlementMethod === "store_credit") {
        totalStoreCreditIssued += due;
      }
    });

    return {
      totalReturnsCount: returns.length,
      totalReturnAmountValue,
      totalBalanceReduced,
      totalCustomerRefundPending,
      totalCashRefunded,
      totalStoreCreditIssued,
      pendingSettlementCount,
    };
  }, [returns]);

  //* التصفية والبحث*
  const filteredReturns = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ar");
    return returns.filter((record) => {
      const searchable = [
        record.returnNumber,
        record.returnId,
        record.invoiceNumber,
        record.customerName,
        record.customerPhone,
        record.model,
        record.linkedNewInvoiceNumber,
      ].map((value) => String(value ?? "").toLocaleLowerCase("ar"));
      const matchQuery = !q || searchable.some((value) => value.includes(q));
      const recordDate = dateKey(record.createdAt);
      const matchStart =
        !startDate || (!!recordDate && recordDate >= startDate);
      const matchEnd = !endDate || (!!recordDate && recordDate <= endDate);
      const matchReason =
        selectedReason === "all" || record.reason === selectedReason;
      const matchCondition =
        selectedCondition === "all" ||
        record.deviceCondition === selectedCondition;
      const matchSettlement =
        selectedSettlement === "all" ||
        record.settlementMethod === selectedSettlement;
      const matchStatus =
        selectedSettlementStatus === "all" ||
        settlementState(record) === selectedSettlementStatus;
      return (
        matchQuery &&
        matchStart &&
        matchEnd &&
        matchReason &&
        matchCondition &&
        matchSettlement &&
        matchStatus
      );
    });
  }, [
    returns,
    query,
    startDate,
    endDate,
    selectedReason,
    selectedCondition,
    selectedSettlement,
    selectedSettlementStatus,
  ]);

  const pageCount = Math.max(1, Math.ceil(filteredReturns.length / pageSize));

  const safePage = Math.min(page, pageCount);

  const visibleReturns = filteredReturns.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  //* تصدير CSV*
  const exportCSV = () => {
    const headers = [
      "رقم المرتجع",
      "التاريخ",
      "اسم العميل",
      "رقم الهاتف",
      "الفاتورة الأصلية",
      "الموديل",
      "الكمية",
      "قيمة المرتجع",
      "خصم الاستخدام",
      "صافي المرتجع",
      "المخصوم من المديونية",
      "المستحق للعميل",
      "سبب الإرجاع",
      "طريقة التسوية",
      "حالة التسوية",
      "فاتورة البديل",
    ];
    const rows = filteredReturns.map((record) => [
      record.returnNumber || record.returnId,
      formatDate(record.createdAt),
      record.customerName || "عميل غير محدد",
      record.customerPhone || "",
      record.invoiceNumber || "",
      record.model || "",
      numeric(record.quantityReturned),
      returnAmount(record),
      usageFee(record),
      Math.max(0, returnAmount(record) - usageFee(record)),
      balanceReduction(record),
      customerAmountDue(record),
      record.reason ? reasonLabels[record.reason] : "غير محدد",
      record.settlementMethod
        ? settlementLabels[record.settlementMethod]
        : "غير محدد",
      settlementState(record) === "completed" ? "مكتمل" : "قيد الانتظار",
      record.linkedNewInvoiceNumber || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `returns-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const confirmSettlement = (returnId: string) => {
    const latestRecords = readReturnRecords();
    const target = latestRecords.find((record) => record.returnId === returnId);
    if (!target) {
      window.alert(
        "سجل المرتجع غير موجود في التخزين. حدّث الصفحة وحاول مرة أخرى.",
      );
      return;
    }
    const due = customerAmountDue(target);
    if (due <= 0) {
      window.alert(
        "لا يوجد مبلغ منفصل مستحق للعميل؛ قيمة المرتجع تمت تسويتها مع المديونية.",
      );
      return;
    }
    if (settlementState(target) === "completed") return;

    const channel =
      target.settlementMethod === "store_credit"
        ? "إصدار رصيد العميل"
        : target.settlementMethod === "cash_refund"
          ? "رد المبلغ نقدًا"
          : "تسوية المبلغ المستحق للعميل";
    const confirmed = window.confirm(
      `هل تم تنفيذ ${channel} بمبلغ ${money(due)} بالفعل؟\n\nسيتم تحديث حالة التسوية في سجل المرتجع فقط. لن يتم إنشاء حركة خزنة أو رصيد متجر منفصل تلقائيًا.`,
    );
    if (!confirmed) return;

    const updatedRecords = latestRecords.map((record) =>
      record.returnId === returnId
        ? { ...record, settlementStatus: "completed" as const }
        : record,
    );
    try {
      window.localStorage.setItem(
        RETURNS_STORAGE_KEY,
        JSON.stringify(updatedRecords),
      );
      setReturns(updatedRecords);
      setSelectedReturn((current) =>
        current?.returnId === returnId
          ? { ...current, settlementStatus: "completed" }
          : current,
      );
    } catch {
      window.alert(
        "تعذر حفظ حالة التسوية. تأكد أن التخزين المحلي متاح وحاول مرة أخرى.",
      );
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <main
      dir="rtl"
      className="mx-auto max-w-[1500px] p-4 text-slate-800 sm:p-6 lg:p-8 font-sans"
    >
      <header className="mb-6 flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 sm:text-3xl">
            <History className="h-7 w-7 text-indigo-600" /> سجل المرتجعات
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            متابعة جميع فواتير المرتجعات المسجلة، تحليل التأثير المالي، وتتبع
            التسويات والمديونيات.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <Download size={16} /> تصدير CSV
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
          >
            <Printer size={16} /> طباعة السجل
          </button>
        </div>
      </header>

      {/** بطاقات الملخص المالي **/}

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="إجمالي المرتجعات"
          value={String(summary.totalReturnsCount)}
          detail={`القيمة الإجمالية: ${money(summary.totalReturnAmountValue)}`}
          icon={<History size={20} />}
          accent="indigo"
        />

        <SummaryCard
          title="خصومات المديونية"
          value={money(summary.totalBalanceReduced)}
          detail="تم خصمها من أقساط/ديون العملاء"
          icon={<FileText size={20} />}
          accent="blue"
        />

        <SummaryCard
          title="مستحقات غير مسوية"
          value={money(summary.totalCustomerRefundPending)}
          detail={`${summary.pendingSettlementCount} عملية تنتظر التسوية`}
          icon={<AlertCircle size={20} />}
          accent="rose"
        />

        <SummaryCard
          title="المدفوعات النقدية الفعلية"
          value={money(summary.totalCashRefunded)}
          detail={`رصيد متجر تم تأكيد إصداره يدويًا: ${money(summary.totalStoreCreditIssued)}`}
          icon={<CheckCircle2 size={20} />}
          accent="emerald"
        />
      </section>

      {/** شريط البحث والفلاتر **/}

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 font-semibold text-slate-800 text-sm flex items-center gap-2">
          <Search size={16} className="text-indigo-600" /> بحث وفلترة سجل
          المرتجعات
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-[minmax(220px,1.5fr)_repeat(6,minmax(130px,1fr))_auto]">
          <div className="relative">
            <Search
              size={17}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="ابحث برقم المرتجع، الفاتورة، العميل..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pr-10 pl-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
            />
          </div>

          <select
            value={selectedReason}
            onChange={(e) => {
              setSelectedReason(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400"
          >
            <option value="all">كل الأسباب</option>

            <option value="defect">عيب بالجهاز</option>

            <option value="change_mind">تغيير رأي العميل</option>

            <option value="unsuitable">جهاز غير مناسب</option>

            <option value="other">سبب آخر</option>
          </select>

          <select
            value={selectedCondition}
            onChange={(e) => {
              setSelectedCondition(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400"
          >
            <option value="all">كل حالات الأجهزة</option>

            <option value="sound">سليم</option>

            <option value="damaged">تالف</option>

            <option value="inspection_needed">يحتاج فحصًا</option>
          </select>

          <select
            value={selectedSettlement}
            onChange={(e) => {
              setSelectedSettlement(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400"
          >
            <option value="all">طريقة التسوية</option>

            <option value="cash_refund">رد نقدي</option>

            <option value="store_credit">رصيد متجر</option>

            <option value="remaining_settlement">تسوية مديونية</option>

            <option value="exchange">استبدال</option>
          </select>

          <select
            value={selectedSettlementStatus}
            onChange={(e) => {
              setSelectedSettlementStatus(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400"
          >
            <option value="all">كل حالات التسوية</option>
            <option value="pending">قيد الانتظار</option>
            <option value="completed">مكتمل / لا يوجد رد منفصل</option>
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400"
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400"
          />

          <button
            onClick={() => {
              setQuery("");

              setStartDate("");

              setEndDate("");

              setSelectedReason("all");

              setSelectedCondition("all");

              setSelectedSettlement("all");

              setSelectedSettlementStatus("all");

              setPage(1);
            }}
            className="h-10 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            مسح الفلاتر
          </button>
        </div>
      </section>

      {/** جدول السجلات **/}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <span className="text-sm font-bold text-slate-800">
            النتائج المعروضة: {filteredReturns.length} سجل
          </span>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            عرض
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border px-2 py-1 outline-none"
            >
              <option value={15}>15</option>

              <option value={30}>30</option>

              <option value={50}>50</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-right text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">رقم المرتجع</th>

                <th className="px-4 py-3">التاريخ والوقت</th>

                <th className="px-4 py-3">العميل</th>

                <th className="px-4 py-3">الفاتورة الأصلية</th>

                <th className="px-4 py-3">الموديل والكمية</th>

                <th className="px-4 py-3">قيمة المرتجع</th>

                <th className="px-4 py-3">خصم الاستخدام</th>

                <th className="px-4 py-3">الخصم من المديونية</th>

                <th className="px-4 py-3">المستحق للعميل</th>

                <th className="px-4 py-3">الحالة والتسوية</th>

                <th className="px-4 py-3">الإجراء</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {visibleReturns.map((r) => (
                <tr
                  key={r.returnId}
                  className="transition hover:bg-slate-50/70"
                >
                  <td className="px-4 py-3 font-semibold text-indigo-600">
                    <div>{r.returnNumber || r.returnId || "—"}</div>
                    {r.returnId && r.returnNumber && (
                      <div
                        className="mt-1 text-[10px] font-normal text-slate-400"
                        dir="ltr"
                      >
                        {r.returnId}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3 text-xs text-slate-500">
                    {formatDate(r.createdAt)}
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">
                      {r.customerName || "عميل غير محدد"}
                    </div>

                    <div className="text-xs text-slate-400" dir="ltr">
                      {r.customerPhone || "—"}
                    </div>
                  </td>

                  <td className="px-4 py-3 font-medium text-slate-700">
                    {r.invoiceNumber || "—"}
                  </td>

                  <td className="px-4 py-3">
                    <div className="text-xs font-medium text-slate-800">
                      {r.model || "—"}
                    </div>

                    <div className="text-xs text-slate-500">
                      الكمية: {numeric(r.quantityReturned)}
                    </div>
                  </td>

                  <td className="px-4 py-3 font-bold tabular-nums text-slate-900">
                    {money(returnAmount(r))}
                  </td>

                  <td className="px-4 py-3 tabular-nums text-amber-700">
                    {money(usageFee(r))}
                  </td>

                  <td className="px-4 py-3 tabular-nums text-blue-600">
                    {money(balanceReduction(r))}
                  </td>

                  <td className="px-4 py-3 tabular-nums font-semibold text-emerald-600">
                    {money(customerAmountDue(r))}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex w-fit rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {r.settlementMethod
                          ? settlementLabels[r.settlementMethod]
                          : "غير محدد"}
                      </span>

                      <span
                        className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${settlementState(r) === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                      >
                        {customerAmountDue(r) <= 0
                          ? "تمت تسوية المديونية"
                          : settlementState(r) === "completed"
                            ? "مكتمل التسوية"
                            : "قيد الانتظار"}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setSelectedReturn(r)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition"
                      >
                        التفاصيل
                      </button>
                      {customerAmountDue(r) > 0 &&
                        settlementState(r) === "pending" && (
                          <button
                            onClick={() => confirmSettlement(r.returnId)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                          >
                            تأكيد التسوية
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}

              {visibleReturns.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-12 text-center text-slate-400"
                  >
                    لا توجد سجلات مرتجعات مطابقة لخيارات البحث.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/** الترقيم (Pagination) **/}

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
          <span>
            عرض {filteredReturns.length ? (safePage - 1) * pageSize + 1 : 0} إلى{" "}
            {Math.min(safePage * pageSize, filteredReturns.length)} من{" "}
            {filteredReturns.length}
          </span>

          <div className="flex items-center gap-2">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 disabled:opacity-40"
            >
              <ChevronRight size={16} /> السابق
            </button>

            <span className="text-xs">
              صفحة {safePage} من {pageCount}
            </span>

            <button
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 disabled:opacity-40"
            >
              التالي <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      </section>

      {/** نافذة تفاصيل المرتجع (Drawer / Modal) **/}

      {selectedReturn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedReturn(null);
          }}
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl text-right">
            <div className="mb-4 flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-xs font-bold text-indigo-600">
                  فاتورة مرتجع:{" "}
                  {selectedReturn.returnNumber ||
                    selectedReturn.returnId ||
                    "—"}
                </span>
                {selectedReturn.returnId && (
                  <div className="mt-1 text-[11px] text-slate-400" dir="ltr">
                    مرجع العملية: {selectedReturn.returnId}
                  </div>
                )}
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  تفاصيل عملية الإرجاع
                </h3>
              </div>

              <button
                onClick={() => setSelectedReturn(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border">
                <div>
                  <span className="text-xs text-slate-500 block">
                    اسم العميل
                  </span>

                  <strong className="text-slate-800">
                    {selectedReturn.customerName || "عميل غير محدد"}
                  </strong>
                </div>

                <div>
                  <span className="text-xs text-slate-500 block">
                    رقم الهاتف
                  </span>

                  <strong className="text-slate-800" dir="ltr">
                    {selectedReturn.customerPhone || "—"}
                  </strong>
                </div>

                <div>
                  <span className="text-xs text-slate-500 block">
                    رقم فاتورة البيع الأصلية
                  </span>

                  <strong className="text-indigo-600">
                    {selectedReturn.invoiceNumber || "—"}
                  </strong>
                </div>

                <div>
                  <span className="text-xs text-slate-500 block">
                    تاريخ ووقت المرتجع
                  </span>

                  <strong className="text-slate-800">
                    {formatDate(selectedReturn.createdAt)}
                  </strong>
                </div>
              </div>

              <div className="border rounded-xl p-4 space-y-2">
                <h4 className="font-semibold text-slate-800 text-xs">
                  بيانات المنتج المرتجع
                </h4>

                <div className="text-sm font-bold text-slate-900">
                  {selectedReturn.model || "—"}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 pt-1">
                  <div>
                    الكمية المرتجعة:{" "}
                    <strong>{numeric(selectedReturn.quantityReturned)}</strong>
                  </div>

                  <div>
                    سعر الوحدة:{" "}
                    <strong>{money(numeric(selectedReturn.unitPrice))}</strong>
                  </div>

                  <div>
                    سبب الإرجاع:{" "}
                    <strong className="text-indigo-600">
                      {selectedReturn.reason
                        ? reasonLabels[selectedReturn.reason]
                        : "غير محدد"}
                    </strong>
                  </div>
                </div>

                <div className="text-xs text-slate-600 pt-1">
                  حالة الجهاز عند الاستلام:{" "}
                  <strong className="text-amber-700">
                    {selectedReturn.deviceCondition
                      ? conditionLabels[selectedReturn.deviceCondition]
                      : "غير محدد"}
                  </strong>
                </div>
              </div>

              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 space-y-2">
                <h4 className="font-semibold text-indigo-900 text-xs">
                  التفاصيل المالية والتسوية
                </h4>

                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">
                    قيمة المرتجع الإجمالية:
                  </span>

                  <strong className="text-indigo-700">
                    {money(returnAmount(selectedReturn))}
                  </strong>
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">
                    خصم الاستخدام عن الشهور المكتملة:
                  </span>

                  <strong className="text-amber-700">
                    {money(usageFee(selectedReturn))}
                  </strong>
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">
                    صافي قيمة المرتجع بعد خصم الاستخدام:
                  </span>

                  <strong className="text-slate-800">
                    {money(
                      Math.max(
                        0,
                        returnAmount(selectedReturn) - usageFee(selectedReturn),
                      ),
                    )}
                  </strong>
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">
                    المبلغ المخصوم من مديونية التقسيط:
                  </span>

                  <strong className="text-blue-700">
                    {money(balanceReduction(selectedReturn))}
                  </strong>
                </div>

                <div className="flex justify-between text-xs border-t pt-2">
                  <span className="text-slate-700 font-medium">
                    المبلغ المستحق للعميل بعد الخصم:
                  </span>

                  <strong className="text-emerald-700 font-bold">
                    {money(customerAmountDue(selectedReturn))}
                  </strong>
                </div>

                <div className="flex justify-between text-xs pt-1">
                  <span className="text-slate-600">طريقة التسوية المسجلة:</span>
                  <strong className="text-slate-800">
                    {selectedReturn.settlementMethod
                      ? settlementLabels[selectedReturn.settlementMethod]
                      : "غير محدد"}
                  </strong>
                </div>
                <div className="flex justify-between text-xs pt-1">
                  <span className="text-slate-600">حالة التسوية:</span>
                  <strong
                    className={
                      settlementState(selectedReturn) === "completed"
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }
                  >
                    {customerAmountDue(selectedReturn) <= 0
                      ? "تمت تسوية المديونية ولا يوجد رد منفصل"
                      : settlementState(selectedReturn) === "completed"
                        ? "مكتملة"
                        : "قيد الانتظار"}
                  </strong>
                </div>
              </div>
            </div>

            {selectedReturn.linkedNewInvoiceNumber && (
              <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs text-sky-800">
                رقم فاتورة الجهاز البديل:{" "}
                <strong>{selectedReturn.linkedNewInvoiceNumber}</strong>
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3 border-t pt-4">
              {customerAmountDue(selectedReturn) > 0 &&
                settlementState(selectedReturn) === "pending" && (
                  <button
                    onClick={() => confirmSettlement(selectedReturn.returnId)}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    تأكيد تنفيذ التسوية
                  </button>
                )}
              <button
                onClick={() => setSelectedReturn(null)}
                className="rounded-xl border px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  title,

  value,

  detail,

  icon,

  accent,
}: {
  title: string;

  value: string;

  detail: string;

  icon: React.ReactNode;

  accent: "indigo" | "blue" | "rose" | "emerald";
}) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-600",

    blue: "bg-sky-50 text-sky-600",

    rose: "bg-rose-50 text-rose-600",

    emerald: "bg-emerald-50 text-emerald-600",
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>

          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
        </div>

        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[accent]}`}
        >
          {icon}
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">{detail}</p>
    </article>
  );
}
