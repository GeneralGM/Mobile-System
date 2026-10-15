/* eslint-disable prettier/prettier */

import { useEffect, useMemo, useState } from "react";

import {
  Banknote,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  FileText,
  Filter,
  HandCoins,
  Plus,
  Search,
  Wallet,
  X,
} from "lucide-react";

import { createFileRoute } from "@tanstack/react-router";
import { api } from "../lib/api-client";

export const Route = createFileRoute("/installlments")({
  component: InstallmentsPage,
});

type InstallmentStatus = "paid" | "partial" | "due" | "overdue" | "upcoming";

type ContractStatus = "active" | "overdue" | "completed";

type Installment = {
  id: string;

  number: number;

  dueDate: string;

  amount: number;

  paidAmount: number;

  paidDate?: string;

  status: InstallmentStatus;
};

type Contract = {
  id: string;

  customerName: string;

  phone: string;

  invoiceNo: string;

  startDate: string;

  totalAmount: number;

  downPayment: number;

  installmentAmount: number;

  installmentCount: number;

  installments: Installment[];
};

const currency = (value: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",

    currency: "EGP",

    maximumFractionDigits: 0,
  }).format(value);

const dateText = (value: string) =>
  new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",

    month: "short",

    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));

const today = new Date();

today.setHours(0, 0, 0, 0);

const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

function addMonths(date: Date, count: number) {
  const result = new Date(date);

  const day = result.getDate();

  result.setDate(1);

  result.setMonth(result.getMonth() + count);

  const lastDay = new Date(
    result.getFullYear(),

    result.getMonth() + 1,

    0,
  ).getDate();

  result.setDate(Math.min(day, lastDay));

  return result;
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type SaleInstallment = {
  number: number;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAmount?: number;
};

type SaleRecord = {
  id: string;
  invoiceNumber: string;
  createdAt: number;
  customerName: string;
  customerPhone: string;
  paymentMethod: "cash" | "credit" | "installment";
  total: number;
  amountPaid: number;
  remainingAmount: number;
  /** Amount of unpaid installment debt waived by returned items; not a cash collection. */
  returnBalanceReduced?: number;
  installmentsCount: number;
  installments: SaleInstallment[];
  notes: string;
  status: "paid" | "partial" | "unpaid";
};

function toContract(sale: SaleRecord): Contract {
  const installments: Installment[] = sale.installments.map((item) => {
    const paidAmount = Math.min(
      item.amount,
      Math.max(0, Number(item.paidAmount ?? (item.paid ? item.amount : 0))),
    );
    const installment: Installment = {
      id: `${sale.id}-${item.number}`,
      number: item.number,
      dueDate: item.dueDate,
      amount: item.amount,
      paidAmount,
      status: "upcoming",
    };
    return refreshInstallmentStatus(installment);
  });
  const scheduleTotal = installments.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const startDate = isoDate(new Date(sale.createdAt));
  return {
    id: sale.id,
    customerName: sale.customerName || "عميل نقدي",
    phone: sale.customerPhone || "",
    invoiceNo: sale.invoiceNumber,
    startDate,
    totalAmount: sale.total,
    // Keep the real down payment stable when the return page reduces installment amounts.
    // Without this offset, the waived debt would be incorrectly counted as customer-paid money.
    downPayment: Math.max(
      0,
      sale.total -
        scheduleTotal -
        Math.max(0, Number(sale.returnBalanceReduced) || 0),
    ),
    installmentAmount:
      installments.length > 0
        ? installments.reduce((sum, item) => sum + item.amount, 0) /
          installments.length
        : 0,
    installmentCount: sale.installmentsCount || installments.length,
    installments,
  };
}

const statusMeta: Record<
  InstallmentStatus,
  { label: string; className: string }
> = {
  paid: {
    label: "مدفوع",

    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  },

  partial: {
    label: "مدفوع جزئيًا",

    className: "bg-blue-50 text-blue-700 ring-blue-600/15",
  },

  due: {
    label: "مستحق اليوم",

    className: "bg-amber-50 text-amber-700 ring-amber-600/15",
  },

  overdue: {
    label: "متأخر",

    className: "bg-rose-50 text-rose-700 ring-rose-600/15",
  },

  upcoming: {
    label: "قادم",

    className: "bg-slate-100 text-slate-600 ring-slate-500/15",
  },
};

const contractStatus = (contract: Contract): ContractStatus => {
  const outstanding = contract.installments.filter(
    (item) => item.status !== "paid",
  );

  if (outstanding.length === 0) return "completed";

  if (outstanding.some((item) => item.status === "overdue")) return "overdue";

  return "active";
};

function refreshInstallmentStatus(installment: Installment): Installment {
  if (installment.paidAmount >= installment.amount)
    return { ...installment, status: "paid" };

  if (installment.paidAmount > 0) return { ...installment, status: "partial" };

  if (installment.dueDate < todayISO)
    return { ...installment, status: "overdue" };

  if (installment.dueDate === todayISO)
    return { ...installment, status: "due" };

  return { ...installment, status: "upcoming" };
}

export default function InstallmentsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getSales()
      .then((rows) => {
        if (cancelled) return;
        setContracts(
          rows
            .filter((sale) => sale.paymentMethod === "installment")
            .map((sale) => toContract(sale as SaleRecord)),
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPaymentError(
          error instanceof Error
            ? error.message
            : "تعذر تحميل الأقساط من الخادم.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [query, setQuery] = useState("");

  const [statusFilter, setStatusFilter] = useState<"all" | ContractStatus>(
    "all",
  );

  const [startDate, setStartDate] = useState("");

  const [endDate, setEndDate] = useState("");

  const [page, setPage] = useState(1);

  const [pageSize, setPageSize] = useState(20);

  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    null,
  );

  const [paymentTarget, setPaymentTarget] = useState<{
    contractId: string;

    installmentId: string;
  } | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");

  const [paymentNote, setPaymentNote] = useState("");

  const [paymentError, setPaymentError] = useState("");

  const selectedContract =
    contracts.find((contract) => contract.id === selectedContractId) ?? null;

  const paymentContract = paymentTarget
    ? (contracts.find((contract) => contract.id === paymentTarget.contractId) ??
      null)
    : null;

  const paymentInstallment =
    paymentTarget && paymentContract
      ? (paymentContract.installments.find(
          (item) => item.id === paymentTarget.installmentId,
        ) ?? null)
      : null;

  const filteredContracts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ar");

    return contracts.filter((contract) => {
      const matchesQuery =
        !normalized ||
        contract.customerName.toLocaleLowerCase("ar").includes(normalized) ||
        contract.phone.includes(normalized) ||
        contract.invoiceNo.toLocaleLowerCase("ar").includes(normalized) ||
        contract.id.toLocaleLowerCase("ar").includes(normalized);

      const state = contractStatus(contract);

      const matchesStatus = statusFilter === "all" || state === statusFilter;

      const matchesStart = !startDate || contract.startDate >= startDate;

      const matchesEnd = !endDate || contract.startDate <= endDate;

      return matchesQuery && matchesStatus && matchesStart && matchesEnd;
    });
  }, [contracts, query, statusFilter, startDate, endDate]);

  const pageCount = Math.max(1, Math.ceil(filteredContracts.length / pageSize));

  const safePage = Math.min(page, pageCount);

  const visibleContracts = filteredContracts.slice(
    (safePage - 1) * pageSize,

    safePage * pageSize,
  );

  const summary = useMemo(() => {
    const allInstallments = contracts.flatMap(
      (contract) => contract.installments,
    );

    const totalOutstanding = allInstallments.reduce(
      (sum, item) => sum + item.amount - item.paidAmount,

      0,
    );

    const paidTotal =
      allInstallments.reduce((sum, item) => sum + item.paidAmount, 0) +
      contracts.reduce((sum, contract) => sum + contract.downPayment, 0);

    const dueTotal = allInstallments

      .filter(
        (item) =>
          item.status === "due" ||
          item.status === "overdue" ||
          item.status === "partial",
      )

      .reduce((sum, item) => sum + item.amount - item.paidAmount, 0);

    return {
      active: contracts.filter(
        (contract) => contractStatus(contract) === "active",
      ).length,

      overdue: contracts.filter(
        (contract) => contractStatus(contract) === "overdue",
      ).length,

      outstanding: totalOutstanding,

      paid: paidTotal,

      due: dueTotal,
    };
  }, [contracts]);

  const openPayment = (contract: Contract, installment: Installment) => {
    setPaymentTarget({
      contractId: contract.id,

      installmentId: installment.id,
    });

    setPaymentAmount(String(installment.amount - installment.paidAmount));

    setPaymentNote("");

    setPaymentError("");
  };

  const savePayment = async () => {
    if (!paymentTarget || !paymentInstallment) return;
    const amount = Number(paymentAmount);
    const remaining = paymentInstallment.amount - paymentInstallment.paidAmount;

    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("اكتب مبلغًا صحيحًا أكبر من صفر.");
      return;
    }
    if (amount > remaining + 0.000001) {
      setPaymentError(`المبلغ أكبر من المتبقي (${currency(remaining)}).`);
      return;
    }

    try {
      await api.recordPayment({
        saleId: paymentTarget.contractId,
        installmentNumber: paymentInstallment.number,
        amount,
        note: paymentNote.trim(),
      });
      const rows = await api.getSales();
      setContracts(
        rows
          .filter((sale) => sale.paymentMethod === "installment")
          .map((sale) => toContract(sale as SaleRecord)),
      );
      setSelectedContractId(paymentTarget.contractId);
      setPaymentTarget(null);
      setPaymentAmount("");
      setPaymentNote("");
      setPaymentError("");
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "تعذر تسجيل التحصيل في قاعدة البيانات. حاول مرة أخرى.",
      );
    }
  };

  const money = (value: number) => currency(value);

  const selectClass =
    "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10";

  const inputClass =
    "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10";

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-6 lg:p-8"
    >
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
              <span>الإدارة المالية</span>

              <ChevronLeft size={14} />

              <span className="text-indigo-600">إدارة الأقساط</span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              إدارة الأقساط
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              تابع عقود التقسيط، مواعيد الاستحقاق، والمدفوعات من مكان واحد.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              window.alert(
                "إضافة عقد تقسيط ستُربط بعملية البيع عند دمج الصفحة مع النظام.",
              )
            }
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/20"
          >
            <Plus size={18} /> إضافة عقد تقسيط
          </button>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="العقود النشطة"
            value={String(summary.active)}
            detail="عقد قيد السداد"
            icon={<FileText size={20} />}
            accent="indigo"
          />

          <SummaryCard
            title="إجمالي المتبقي"
            value={money(summary.outstanding)}
            detail="على جميع العقود"
            icon={<Wallet size={20} />}
            accent="blue"
          />

          <SummaryCard
            title="المستحق والمتأخر"
            value={money(summary.due)}
            detail={`${summary.overdue} عقد به أقساط متأخرة`}
            icon={<CircleAlert size={20} />}
            accent="rose"
          />

          <SummaryCard
            title="إجمالي المحصل"
            value={money(summary.paid)}
            detail="يشمل المقدم والدفعات المسجلة"
            icon={<HandCoins size={20} />}
            accent="emerald"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <Filter size={18} className="text-indigo-600" /> البحث والتصفية
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_auto]">
            <div className="relative">
              <Search
                size={17}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                className={`${inputClass} pr-10`}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);

                  setPage(1);
                }}
                placeholder="ابحث بالاسم أو الموبايل أو الفاتورة..."
                aria-label="البحث في عقود التقسيط"
              />
            </div>

            <select
              className={selectClass}
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as typeof statusFilter);

                setPage(1);
              }}
              aria-label="حالة العقد"
            >
              <option value="all">كل الحالات</option>

              <option value="active">نشط</option>

              <option value="overdue">به تأخير</option>

              <option value="completed">مكتمل</option>
            </select>

            <label className="relative">
              <span className="sr-only">من تاريخ</span>

              <CalendarDays
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="date"
                className={`${inputClass} pr-9`}
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);

                  setPage(1);
                }}
                aria-label="من تاريخ"
              />
            </label>

            <label className="relative">
              <span className="sr-only">إلى تاريخ</span>

              <CalendarDays
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="date"
                className={`${inputClass} pr-9`}
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);

                  setPage(1);
                }}
                aria-label="إلى تاريخ"
              />
            </label>

            <button
              type="button"
              onClick={() => {
                setQuery("");

                setStatusFilter("all");

                setStartDate("");

                setEndDate("");

                setPage(1);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <X size={16} /> مسح
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="font-bold text-slate-900">عقود التقسيط</h2>

              <p className="mt-1 text-xs text-slate-500">
                عدد النتائج: {filteredContracts.length}
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-500">
              عرض
              <select
                className={`${selectClass} h-9`}
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));

                  setPage(1);
                }}
              >
                <option value={20}>20</option>

                <option value={10}>10</option>

                <option value={50}>50</option>
              </select>
              صفوف
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-right">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="px-5 py-4">العميل</th>

                  <th className="px-4 py-4">رقم العقد / الفاتورة</th>

                  <th className="px-4 py-4">قيمة العقد</th>

                  <th className="px-4 py-4">المقدم</th>

                  <th className="px-4 py-4">المتبقي</th>

                  <th className="px-4 py-4">الأقساط</th>

                  <th className="px-4 py-4">أقرب استحقاق</th>

                  <th className="px-4 py-4">الحالة</th>

                  <th className="px-5 py-4">الإجراءات</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {visibleContracts.map((contract) => {
                  const outstanding = contract.installments.reduce(
                    (sum, item) => sum + item.amount - item.paidAmount,

                    0,
                  );

                  const paidCount = contract.installments.filter(
                    (item) => item.status === "paid",
                  ).length;

                  const next = contract.installments.find(
                    (item) => item.status !== "paid",
                  );

                  const state = contractStatus(contract);

                  return (
                    <tr
                      key={contract.id}
                      className="transition hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => setSelectedContractId(contract.id)}
                          className="text-right font-semibold text-slate-800 hover:text-indigo-600"
                        >
                          {contract.customerName}
                        </button>

                        <div className="mt-1 text-xs text-slate-500" dir="ltr">
                          {contract.phone}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-700">
                          {contract.id}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {contract.invoiceNo}
                        </div>
                      </td>

                      <td className="px-4 py-4 font-semibold tabular-nums">
                        {money(contract.totalAmount)}
                      </td>

                      <td className="px-4 py-4 tabular-nums">
                        {money(contract.downPayment)}
                      </td>

                      <td className="px-4 py-4 font-semibold tabular-nums text-rose-600">
                        {money(outstanding)}
                      </td>

                      <td className="px-4 py-4">
                        <div className="text-sm font-medium">
                          {paidCount} / {contract.installmentCount}
                        </div>

                        <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{
                              width: `${(paidCount / contract.installmentCount) * 100}%`,
                            }}
                          />
                        </div>
                      </td>

                      <td className="px-4 py-4 text-sm">
                        {next ? dateText(next.dueDate) : "—"}
                      </td>

                      <td className="px-4 py-4">
                        <ContractBadge status={state} />
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedContractId(contract.id)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                          >
                            التفاصيل
                          </button>

                          {next && (
                            <button
                              type="button"
                              onClick={() => openPayment(contract, next)}
                              title="تسجيل دفعة"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition hover:bg-indigo-100"
                            >
                              <Banknote size={17} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {visibleContracts.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-14 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                        <Search size={21} />
                      </div>

                      <p className="font-semibold text-slate-700">
                        مفيش نتائج مطابقة
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        جرّب تغيير البحث أو الفلاتر.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-sm text-slate-500">
              عرض {filteredContracts.length ? (safePage - 1) * pageSize + 1 : 0}{" "}
              إلى {Math.min(safePage * pageSize, filteredContracts.length)} من{" "}
              {filteredContracts.length}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={16} /> السابق
              </button>

              <span className="min-w-20 text-center text-sm text-slate-600">
                صفحة {safePage} من {pageCount}
              </span>

              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() =>
                  setPage((value) => Math.min(pageCount, value + 1))
                }
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                التالي <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        </section>

        <p className="text-xs leading-6 text-slate-400">
          هذه نسخة واجهة ببيانات تجريبية داخل الذاكرة؛ الدفعات المسجلة هنا لا
          تُحفظ بعد إعادة تحميل الصفحة ولا تُنشئ قيودًا محاسبية حقيقية.
        </p>
      </div>

      {selectedContract && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setSelectedContractId(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-dialog-title"
            className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-5 sm:px-7">
              <div>
                <p className="mb-1 text-xs font-semibold text-indigo-600">
                  {selectedContract.id} · {selectedContract.invoiceNo}
                </p>

                <h2
                  id="contract-dialog-title"
                  className="text-xl font-bold text-slate-900"
                >
                  {selectedContract.customerName}
                </h2>

                <p className="mt-1 text-sm text-slate-500" dir="ltr">
                  {selectedContract.phone}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedContractId(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[calc(92vh-90px)] overflow-y-auto p-5 sm:p-7">
              <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <DetailMetric
                  label="إجمالي العقد"
                  value={money(selectedContract.totalAmount)}
                />

                <DetailMetric
                  label="المقدم"
                  value={money(selectedContract.downPayment)}
                />

                <DetailMetric
                  label="المتبقي"
                  value={money(
                    selectedContract.installments.reduce(
                      (sum, item) => sum + item.amount - item.paidAmount,

                      0,
                    ),
                  )}
                />

                <DetailMetric
                  label="عدد الأقساط"
                  value={`${selectedContract.installments.filter((item) => item.status === "paid").length} / ${selectedContract.installmentCount}`}
                />
              </div>

              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold text-slate-800">جدول الأقساط</h3>

                <span className="text-xs text-slate-500">
                  بداية العقد: {dateText(selectedContract.startDate)}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[720px] text-right">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3">القسط</th>

                      <th className="px-4 py-3">تاريخ الاستحقاق</th>

                      <th className="px-4 py-3">قيمة القسط</th>

                      <th className="px-4 py-3">المدفوع</th>

                      <th className="px-4 py-3">المتبقي</th>

                      <th className="px-4 py-3">الحالة</th>

                      <th className="px-4 py-3">الإجراء</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {selectedContract.installments.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-sm font-semibold">
                          #{item.number}
                        </td>

                        <td className="px-4 py-3 text-sm">
                          {dateText(item.dueDate)}
                        </td>

                        <td className="px-4 py-3 text-sm tabular-nums">
                          {money(item.amount)}
                        </td>

                        <td className="px-4 py-3 text-sm tabular-nums text-emerald-700">
                          {money(item.paidAmount)}
                        </td>

                        <td className="px-4 py-3 text-sm tabular-nums">
                          {money(item.amount - item.paidAmount)}
                        </td>

                        <td className="px-4 py-3">
                          <InstallmentBadge status={item.status} />
                        </td>

                        <td className="px-4 py-3">
                          {item.status !== "paid" ? (
                            <button
                              type="button"
                              onClick={() =>
                                openPayment(selectedContract, item)
                              }
                              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                            >
                              تسجيل دفع
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                              <Check size={14} /> تم السداد
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}

      {paymentTarget && paymentContract && paymentInstallment && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPaymentTarget(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-dialog-title"
            className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <CreditCard size={20} />
                </div>

                <h2
                  id="payment-dialog-title"
                  className="mt-3 text-xl font-bold text-slate-900"
                >
                  تسجيل دفعة
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {paymentContract.customerName} · القسط رقم{" "}
                  {paymentInstallment.number}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPaymentTarget(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3">
              <DetailMetric
                label="قيمة القسط"
                value={money(paymentInstallment.amount)}
              />

              <DetailMetric
                label="المتبقي"
                value={money(
                  paymentInstallment.amount - paymentInstallment.paidAmount,
                )}
              />
            </div>

            <label
              className="mb-2 block text-sm font-semibold text-slate-700"
              htmlFor="payment-amount"
            >
              المبلغ المدفوع (جنيه)
            </label>

            <input
              id="payment-amount"
              autoFocus
              type="number"
              min="0.01"
              step="0.01"
              max={paymentInstallment.amount - paymentInstallment.paidAmount}
              value={paymentAmount}
              onChange={(event) => {
                setPaymentAmount(event.target.value);

                setPaymentError("");
              }}
              className={inputClass}
              placeholder="اكتب المبلغ"
            />

            <p className="mt-2 text-xs text-slate-500">
              تقدر تسجل دفعة جزئية، بشرط ألا تتجاوز المبلغ المتبقي.
            </p>

            <label
              className="mb-2 mt-4 block text-sm font-semibold text-slate-700"
              htmlFor="payment-note"
            >
              ملاحظات (اختياري)
            </label>

            <textarea
              id="payment-note"
              rows={2}
              value={paymentNote}
              onChange={(event) => setPaymentNote(event.target.value)}
              className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
              placeholder="رقم إيصال أو ملاحظات..."
            />

            {paymentError && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {paymentError}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setPaymentTarget(null)}
                className="h-11 flex-1 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={savePayment}
                className="h-11 flex-1 rounded-xl bg-indigo-600 font-semibold text-white hover:bg-indigo-700"
              >
                تأكيد الدفعة
              </button>
            </div>
          </section>
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

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>

      <p className="mt-2 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function InstallmentBadge({ status }: { status: InstallmentStatus }) {
  const meta = statusMeta[status];

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function ContractBadge({ status }: { status: ContractStatus }) {
  const meta =
    status === "completed"
      ? {
          label: "مكتمل",

          className: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
        }
      : status === "overdue"
        ? {
            label: "به تأخير",

            className: "bg-rose-50 text-rose-700 ring-rose-600/15",
          }
        : {
            label: "نشط",

            className: "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
          };

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
