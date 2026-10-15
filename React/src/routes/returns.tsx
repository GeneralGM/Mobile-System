/* eslint-disable prettier/prettier */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "../lib/api-client";
import {
  Search,
  RotateCcw,
  FileText,
  CheckCircle2,
  X,
  User,
  Phone,
  ArrowLeftRight,
  History,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/returns")({ component: ReturnsPage });

type PaymentMethod = "cash" | "credit" | "installment";
type ReturnReason = "defect" | "change_mind" | "unsuitable" | "other";
type DeviceCondition = "sound" | "damaged" | "inspection_needed";
type SettlementMethod =
  | "cash_refund"
  | "store_credit"
  | "remaining_settlement"
  | "exchange";

interface SaleInstallment {
  number: number;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAmount?: number;
}
interface CartItem {
  deviceId: string;
  brand: string;
  series: string;
  model: string;
  color: string;
  ram: string;
  storage: string;
  originalPrice: number;
  cashPrice: number;
  installmentPrice: number;
  cashFinalPrice: number;
  installmentFinalPrice: number;
  finalPrice: number;
  offerName?: string;
  quantity: number;
  warehouseBatchId?: string;
  unitCost?: number;
  isNewStock?: boolean;
  returnedQuantity?: number;
}
interface Sale {
  id: string;
  invoiceNumber: string;
  createdAt: string | number;
  items: CartItem[];
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  total: number;
  amountPaid: number;
  remainingAmount: number;
  /** Total amount of returns already applied against installment debt. */
  returnBalanceReduced?: number;
  originalInstallmentAmount?: number;
  installmentsCount?: number;
  installments?: SaleInstallment[];
  notes?: string;
  status: string;
}
interface ReturnRecord {
  returnId: string;
  createdAt: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  itemIndex: number;
  deviceId: string;
  model: string;
  quantityReturned: number;
  unitPrice: number;
  totalRefundAmount: number;
  /** Usage fee retained for complete months the customer had the device. */
  usageFee?: number;
  /** Return value after deducting the usage fee. */
  netReturnAmount?: number;
  balanceReduced: number;
  customerRefundAmount: number;
  returnNumber: string;
  settlementStatus: "pending" | "completed";
  reason: ReturnReason;
  deviceCondition: DeviceCondition;
  settlementMethod: SettlementMethod;
  status: "completed";
  linkedNewInvoiceNumber?: string;
}

const money = (n: number) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })} ج.م`;

function getUnitPrice(item: CartItem, method: PaymentMethod) {
  // Use the actual final price stored on the sold line first.
  const candidates =
    method === "installment"
      ? [item.installmentFinalPrice, item.finalPrice, item.installmentPrice]
      : [item.cashFinalPrice, item.finalPrice, item.cashPrice];
  return candidates.find((value) => Number.isFinite(value) && value > 0) ?? 0;
}

function getScheduleOutstanding(sale: Sale): number {
  return (sale.installments ?? []).reduce((sum, installment) => {
    const amount = Math.max(0, Number(installment.amount) || 0);
    const paidAmount = Math.min(
      amount,
      Math.max(
        0,
        Number(installment.paidAmount ?? (installment.paid ? amount : 0)) || 0,
      ),
    );
    return sum + Math.max(0, amount - paidAmount);
  }, 0);
}

function completedMonthsBetween(
  startValue: string | number,
  endDate = new Date(),
): number {
  const startDate = new Date(startValue);
  if (Number.isNaN(startDate.getTime()) || endDate < startDate) return 0;

  let months =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());
  const anniversary = new Date(startDate);
  anniversary.setDate(1);
  anniversary.setMonth(startDate.getMonth() + months);
  const lastDayOfMonth = new Date(
    anniversary.getFullYear(),
    anniversary.getMonth() + 1,
    0,
  ).getDate();
  anniversary.setDate(Math.min(startDate.getDate(), lastDayOfMonth));
  if (endDate < anniversary) months -= 1;
  return Math.max(0, months);
}

function getMonthlyInstallmentRate(sale: Sale): number {
  const originalRate = Math.max(0, Number(sale.originalInstallmentAmount) || 0);
  if (originalRate > 0) return originalRate;

  const amounts = (sale.installments ?? [])
    .map((installment) => Math.max(0, Number(installment.amount) || 0))
    .filter((amount) => amount > 0);
  if (amounts.length === 0) return 0;

  // Prefer the most common scheduled installment amount. This remains reliable if
  // a few installments were reduced by a previous return.
  const counts = new Map<number, number>();
  for (const amount of amounts) {
    const normalized = Math.round(amount * 100) / 100;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

function getUsageFee(
  sale: Sale,
  grossReturnAmount: number,
  endDate = new Date(),
): number {
  // This policy is based on the installment plan: a complete month costs one
  // scheduled monthly installment, prorated when only part of a multi-item invoice is returned.
  if (sale.paymentMethod !== "installment" || grossReturnAmount <= 0) return 0;
  const monthsUsed = completedMonthsBetween(sale.createdAt, endDate);
  const monthlyRate = getMonthlyInstallmentRate(sale);
  const invoiceTotal = Math.max(0, Number(sale.total) || 0);
  if (monthsUsed <= 0 || monthlyRate <= 0 || invoiceTotal <= 0) return 0;
  const returnedShare = Math.min(1, grossReturnAmount / invoiceTotal);
  return (
    Math.round(
      Math.min(grossReturnAmount, monthlyRate * monthsUsed * returnedShare) *
        100,
    ) / 100
  );
}

function getDebtReductionPreview(sale: Sale, netReturnAmount: number): number {
  if (sale.paymentMethod === "cash") return 0;
  const remainingDebt = Math.max(0, Number(sale.remainingAmount) || 0);
  const availableDebt =
    sale.paymentMethod === "installment"
      ? Math.min(remainingDebt, getScheduleOutstanding(sale))
      : remainingDebt;
  return (
    Math.round(Math.min(Math.max(0, netReturnAmount), availableDebt) * 100) /
    100
  );
}

function ReturnsPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(
    null,
  );
  const [selectedInvoice, setSelectedInvoice] = useState<Sale | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<{
    item: CartItem;
    index: number;
  } | null>(null);
  const [returnQty, setReturnQty] = useState(1);
  const [returnReason, setReturnReason] = useState<ReturnReason>("defect");
  const [deviceCondition, setDeviceCondition] =
    useState<DeviceCondition>("sound");
  const [settlementMethod, setSettlementMethod] =
    useState<SettlementMethod>("cash_refund");
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getSales(), api.getReturns()])
      .then(([saleRows, returnRows]) => {
        if (cancelled) return;
        setSales(saleRows as Sale[]);
        setReturns(returnRows as ReturnRecord[]);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setNotification({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "تعذر تحميل بيانات المرتجعات من الخادم.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const customersList = useMemo(() => {
    const map = new Map<
      string,
      {
        customerName: string;
        customerPhone: string;
        invoicesCount: number;
        sales: Sale[];
      }
    >();
    sales.forEach((sale) => {
      const customerName = sale.customerName || "عميل غير محدد";
      const customerPhone = sale.customerPhone || "بدون رقم";
      const key = `${customerPhone}_${customerName}`;
      const entry = map.get(key) ?? {
        customerName,
        customerPhone,
        invoicesCount: 0,
        sales: [],
      };
      entry.invoicesCount += 1;
      entry.sales.push(sale);
      map.set(key, entry);
    });
    return [...map.values()];
  }, [sales]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase("ar");
    if (!q) return customersList;
    return customersList.filter(
      (c) =>
        c.customerName.toLocaleLowerCase("ar").includes(q) ||
        c.customerPhone.includes(q),
    );
  }, [customersList, searchQuery]);

  const currentCustomerData = useMemo(
    () =>
      customersList.find(
        (c) => `${c.customerPhone}_${c.customerName}` === selectedCustomerKey,
      ) ?? null,
    [customersList, selectedCustomerKey],
  );

  const activeUnitPrice =
    activeItem && selectedInvoice
      ? getUnitPrice(activeItem.item, selectedInvoice.paymentMethod)
      : 0;
  const totalReturnAmount = activeUnitPrice * returnQty;
  const previewUsageFee = selectedInvoice
    ? getUsageFee(selectedInvoice, totalReturnAmount)
    : 0;
  const previewNetReturnAmount = Math.max(
    0,
    totalReturnAmount - previewUsageFee,
  );

  const handleOpenReturnModal = (
    item: CartItem,
    index: number,
    invoice: Sale,
  ) => {
    setSelectedInvoice(invoice);
    setActiveItem({ item, index });
    setReturnQty(1);
    setReturnReason("defect");
    setDeviceCondition("sound");
    setSettlementMethod(
      invoice.remainingAmount > 0 ? "remaining_settlement" : "cash_refund",
    );
    setIsModalOpen(true);
  };

  const handleConfirmReturn = async () => {
    if (!selectedInvoice || !activeItem) return;
    const invoiceId = selectedInvoice.id;
    const { index } = activeItem;

    try {
      // Fetch fresh rows before submitting; the server revalidates quantity and computes
      // usage fees, debt reduction and any amount due to the customer in one transaction.
      const [freshSales, freshReturns] = await Promise.all([
        api.getSales(),
        api.getReturns(),
      ]);
      const latestInvoice = freshSales.find((sale) => sale.id === invoiceId) as
        | Sale
        | undefined;
      if (!latestInvoice)
        throw new Error("الفاتورة الأصلية غير موجودة في قاعدة البيانات.");
      const latestItem = latestInvoice.items[index];
      if (!latestItem)
        throw new Error("لم يتم العثور على المنتج داخل الفاتورة.");
      const alreadyReturned = freshReturns
        .filter(
          (record) =>
            record.invoiceId === latestInvoice.id && record.itemIndex === index,
        )
        .reduce(
          (sum, record) =>
            sum + Math.max(0, Number(record.quantityReturned) || 0),
          0,
        );
      const maxAvailable = Math.max(
        0,
        Number(latestItem.quantity) -
          Math.max(alreadyReturned, Number(latestItem.returnedQuantity) || 0),
      );
      if (
        !Number.isInteger(returnQty) ||
        returnQty < 1 ||
        returnQty > maxAvailable
      ) {
        throw new Error(`الكمية غير صحيحة. المتاح للإرجاع: ${maxAvailable}.`);
      }
      const grossPreview =
        Math.round(
          getUnitPrice(latestItem, latestInvoice.paymentMethod) *
            returnQty *
            100,
        ) / 100;
      if (grossPreview <= 0)
        throw new Error("لم يتم العثور على سعر بيع صالح لهذا المنتج.");

      const savedReturn = await api.createReturn({
        invoiceId: latestInvoice.id,
        itemIndex: index,
        quantityReturned: returnQty,
        reason: returnReason,
        deviceCondition,
        settlementMethod,
      });
      const [updatedSales, updatedReturns] = await Promise.all([
        api.getSales(),
        api.getReturns(),
      ]);
      const refreshedInvoice = updatedSales.find(
        (sale) => sale.id === invoiceId,
      ) as Sale | undefined;
      setSales(updatedSales as Sale[]);
      setReturns(updatedReturns as ReturnRecord[]);
      setSelectedInvoice(refreshedInvoice ?? null);
      setIsModalOpen(false);
      const amount = Number(savedReturn.totalRefundAmount) || grossPreview;
      const fee = Number(savedReturn.usageFee) || 0;
      const net =
        Number(savedReturn.netReturnAmount) || Math.max(0, amount - fee);
      const reduced = Number(savedReturn.balanceReduced) || 0;
      const refund = Number(savedReturn.customerRefundAmount) || 0;
      setNotification({
        type: "success",
        message: `تم إنشاء فاتورة المرتجع ${savedReturn.returnNumber || savedReturn.returnId}. قيمة المرتجع ${money(amount)}، خصم الاستخدام ${money(fee)}، صافي المرتجع ${money(net)}. خُصم ${money(reduced)} من المديونية، والمستحق رده للعميل ${money(refund)}. إجمالي الفاتورة الأصلية والتحصيلات السابقة لم يتغيرا.`,
      });
    } catch (error) {
      console.error("Error creating return invoice:", error);
      setNotification({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "تعذر تسجيل المرتجع في قاعدة البيانات. لم يتم تأكيد العملية.",
      });
    }
  };

  return (
    <div
      className="mx-auto max-w-7xl p-4 md:p-6 text-right font-sans"
      dir="rtl"
    >
      <div className="mb-8 flex flex-col items-start justify-between gap-4 border-b pb-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
            <RotateCcw className="h-7 w-7 text-indigo-600" /> إدارة مرتجعات
            المبيعات
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            أنشئ فاتورة مرتجع مستقلة؛ إجمالي البيع يظل كما هو، وتُخصم قيمة
            المرتجع من مديونية التقسيط أولًا.
          </p>
        </div>
      </div>

      {notification && (
        <div
          className={`mb-6 flex items-center justify-between gap-3 rounded-lg border p-4 ${notification.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            aria-label="إغلاق التنبيه"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-1">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800">
            <User className="h-5 w-5 text-indigo-500" /> بحث عن العميل
          </h2>
          <div className="relative mb-4">
            <Search className="absolute right-3 top-3 h-5 w-5 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="اسم العميل أو رقم الهاتف..."
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="max-h-[500px] space-y-2 overflow-y-auto">
            {filteredCustomers.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                لا توجد نتائج مطابقة.
              </p>
            ) : (
              filteredCustomers.map((customer) => {
                const key = `${customer.customerPhone}_${customer.customerName}`;
                const selected = selectedCustomerKey === key;
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => {
                      setSelectedCustomerKey(key);
                      setSelectedInvoice(null);
                    }}
                    className={`w-full rounded-lg border p-3.5 text-right transition-all ${selected ? "border-indigo-600 bg-indigo-50/50" : "border-gray-200 hover:bg-gray-50"}`}
                  >
                    <div className="font-medium text-gray-900">
                      {customer.customerName}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                      <Phone className="h-3.5 w-3.5" />
                      {customer.customerPhone}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                        الفواتير: {customer.invoicesCount}
                      </span>
                      <span className="font-medium text-indigo-600">
                        عرض الفواتير ←
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
          {!currentCustomerData ? (
            <div className="flex h-full flex-col items-center justify-center py-20 text-center text-gray-400">
              <FileText className="mb-3 h-16 w-16 stroke-1 text-gray-300" />
              <p>اختار عميل من القائمة لعرض فواتيره.</p>
            </div>
          ) : selectedInvoice ? (
            <div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="mb-4 text-xs font-medium text-indigo-600 hover:underline"
              >
                → العودة لفواتير العميل
              </button>
              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div>
                    <span className="block text-xs text-gray-500">
                      رقم الفاتورة
                    </span>
                    <strong>{selectedInvoice.invoiceNumber}</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500">
                      تاريخ البيع
                    </span>
                    <strong>
                      {new Date(selectedInvoice.createdAt).toLocaleDateString(
                        "ar-EG",
                      )}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500">
                      طريقة الدفع
                    </span>
                    <strong className="text-indigo-600">
                      {selectedInvoice.paymentMethod}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500">
                      إجمالي الفاتورة الأصلية
                    </span>
                    <strong className="text-emerald-600">
                      {money(selectedInvoice.total)}
                    </strong>
                  </div>
                </div>
                {selectedInvoice.paymentMethod === "installment" && (
                  <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    <Info className="h-4 w-4 shrink-0" /> فاتورة المرتجع مستقلة،
                    وإجمالي فاتورة البيع لا يتغير. قيمة المرتجع تخصم من
                    المديونية والأقساط غير المسددة أولًا؛ لو قيمة المرتجع أكبر
                    من المتبقي يظهر الفرق كمبلغ مستحق للعميل.
                  </p>
                )}
              </div>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">
                منتجات الفاتورة
              </h3>
              <div className="space-y-3">
                {selectedInvoice.items.map((item, idx) => {
                  const returned = returns
                    .filter(
                      (r) =>
                        r.invoiceId === selectedInvoice.id &&
                        r.itemIndex === idx,
                    )
                    .reduce((sum, r) => sum + r.quantityReturned, 0);
                  const available = Math.max(0, item.quantity - returned);
                  const unitPrice = getUnitPrice(
                    item,
                    selectedInvoice.paymentMethod,
                  );
                  return (
                    <div
                      key={`${item.deviceId}-${idx}`}
                      className="flex flex-col items-start justify-between gap-3 rounded-lg border bg-white p-3.5 shadow-sm sm:flex-row sm:items-center"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          {item.brand} {item.model} - {item.storage} /{" "}
                          {item.color}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                          <span>
                            المشتراة: <strong>{item.quantity}</strong>
                          </span>
                          <span>
                            المرتجعة:{" "}
                            <strong className="text-amber-600">
                              {returned}
                            </strong>
                          </span>
                          <span>
                            المتاح:{" "}
                            <strong className="text-emerald-600">
                              {available}
                            </strong>
                          </span>
                          <span>
                            سعر الوحدة: <strong>{money(unitPrice)}</strong>
                          </span>
                        </div>
                      </div>
                      {available <= 0 ? (
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
                          تم إرجاع الكمية بالكامل
                        </span>
                      ) : (
                        <button
                          onClick={() =>
                            handleOpenReturnModal(item, idx, selectedInvoice)
                          }
                          className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> مرتجع
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {returns.some((r) => r.invoiceId === selectedInvoice.id) && (
                <div className="mt-6 border-t pt-4">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800">
                    <History className="h-4 w-4" /> سجل مرتجعات الفاتورة
                  </h3>
                  <div className="space-y-2">
                    {returns
                      .filter((r) => r.invoiceId === selectedInvoice.id)
                      .map((r) => (
                        <div
                          key={r.returnId}
                          className="rounded-lg border p-3 text-xs"
                        >
                          <div className="flex flex-wrap justify-between gap-2">
                            <strong>
                              فاتورة مرتجع: {r.returnNumber || r.returnId}
                            </strong>
                            <span>
                              {new Date(r.createdAt).toLocaleString("ar-EG")}
                            </span>
                          </div>
                          <div className="mt-1">
                            {r.model} · الكمية: {r.quantityReturned} · القيمة:{" "}
                            {money(r.totalRefundAmount)}
                          </div>
                          <div className="mt-1 text-gray-600">
                            قيمة المرتجع: {money(r.totalRefundAmount)} · خصم
                            الاستخدام: {money(r.usageFee || 0)} · المخصوم من
                            المديونية: {money(r.balanceReduced || 0)} · المستحق
                            رده للعميل: {money(r.customerRefundAmount || 0)} ·
                            طريقة التسوية: {r.settlementMethod}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-4 flex flex-col justify-between gap-2 border-b pb-3 sm:flex-row sm:items-center">
                <h2 className="text-lg font-semibold text-gray-800">
                  فواتير العميل:{" "}
                  <span className="text-indigo-600">
                    {currentCustomerData.customerName}
                  </span>
                </h2>
                <span className="text-xs text-gray-500">
                  الهاتف: {currentCustomerData.customerPhone}
                </span>
              </div>
              <div className="space-y-3">
                {currentCustomerData.sales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-4 transition-all hover:bg-gray-50"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-800">
                        <span>فاتورة: {sale.invoiceNumber}</span>
                        <span className="text-xs font-normal text-gray-500">
                          (
                          {new Date(sale.createdAt).toLocaleDateString("ar-EG")}
                          )
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>
                          إجمالي الفاتورة الأصلية:{" "}
                          <strong>{money(sale.total)}</strong>
                        </span>
                        <span>
                          المتبقي:{" "}
                          <strong className="text-red-600">
                            {money(sale.remainingAmount)}
                          </strong>
                        </span>
                        <span>
                          الدفع:{" "}
                          <strong className="text-indigo-600">
                            {sale.paymentMethod}
                          </strong>
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedInvoice(sale)}
                      className="shrink-0 rounded-lg border border-indigo-600 px-3.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                    >
                      عرض المنتجات
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {isModalOpen && activeItem && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 text-right shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between border-b pb-3">
              <h3 className="flex items-center gap-2 text-lg font-bold text-gray-800">
                <RotateCcw className="h-5 w-5 text-indigo-600" /> تأكيد مرتجع
                منتج
              </h3>
              <button onClick={() => setIsModalOpen(false)} aria-label="إغلاق">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <div className="space-y-1.5 rounded-lg border bg-gray-50 p-3.5 text-xs">
                <div>
                  العميل: <strong>{selectedInvoice.customerName}</strong>
                </div>
                <div>
                  رقم الفاتورة: <strong>{selectedInvoice.invoiceNumber}</strong>
                </div>
                <div>
                  المنتج:{" "}
                  <strong className="text-indigo-600">
                    {activeItem.item.brand} {activeItem.item.model}
                  </strong>
                </div>
                <div>
                  المتاح للإرجاع:{" "}
                  <strong>
                    {Math.max(
                      0,
                      activeItem.item.quantity -
                        returns
                          .filter(
                            (r) =>
                              r.invoiceId === selectedInvoice.id &&
                              r.itemIndex === activeItem.index,
                          )
                          .reduce((sum, r) => sum + r.quantityReturned, 0),
                    )}
                  </strong>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  الكمية المرتجعة
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(
                    0,
                    activeItem.item.quantity -
                      returns
                        .filter(
                          (r) =>
                            r.invoiceId === selectedInvoice.id &&
                            r.itemIndex === activeItem.index,
                        )
                        .reduce((sum, r) => sum + r.quantityReturned, 0),
                  )}
                  step={1}
                  value={returnQty}
                  onChange={(e) => setReturnQty(Number(e.target.value))}
                  className="w-full rounded-lg border p-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    سبب المرتجع
                  </label>
                  <select
                    value={returnReason}
                    onChange={(e) =>
                      setReturnReason(e.target.value as ReturnReason)
                    }
                    className="w-full rounded-lg border bg-white p-2.5 text-sm"
                  >
                    <option value="defect">عيب بالجهاز</option>
                    <option value="change_mind">تغيير رأي العميل</option>
                    <option value="unsuitable">جهاز غير مناسب</option>
                    <option value="other">سبب آخر</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    حالة الجهاز
                  </label>
                  <select
                    value={deviceCondition}
                    onChange={(e) =>
                      setDeviceCondition(e.target.value as DeviceCondition)
                    }
                    className="w-full rounded-lg border bg-white p-2.5 text-sm"
                  >
                    <option value="sound">سليم وقابل للبيع</option>
                    <option value="damaged">تالف</option>
                    <option value="inspection_needed">يحتاج فحصًا</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  طريقة التسوية
                </label>
                <select
                  value={settlementMethod}
                  onChange={(e) =>
                    setSettlementMethod(e.target.value as SettlementMethod)
                  }
                  className="w-full rounded-lg border bg-white p-2.5 text-sm"
                >
                  <option value="cash_refund">رد المبلغ المستحق نقدًا</option>
                  <option value="store_credit">رصيد للعميل</option>
                  <option value="remaining_settlement">
                    تسوية المديونية أولًا
                  </option>
                  <option value="exchange">
                    استبدال: المرتجع الآن وبيع الجهاز البديل بفاتورة منفصلة
                  </option>
                </select>
              </div>
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-indigo-900">
                    قيمة المرتجع الإجمالية
                  </span>
                  <strong className="text-base text-indigo-700">
                    {money(totalReturnAmount)}
                  </strong>
                </div>
                {selectedInvoice.paymentMethod === "installment" && (
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                    <span>خصم الاستخدام عن الشهور المكتملة</span>
                    <strong className="text-amber-700">
                      − {money(previewUsageFee)}
                    </strong>
                  </div>
                )}
                <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                  <span>صافي قيمة المرتجع</span>
                  <strong>{money(previewNetReturnAmount)}</strong>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span>الفاتورة الأصلية</span>
                  <strong>{selectedInvoice.invoiceNumber}</strong>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                  <span>الخصم من المديونية غير المسددة</span>
                  <strong>
                    {money(
                      getDebtReductionPreview(
                        selectedInvoice,
                        previewNetReturnAmount,
                      ),
                    )}
                  </strong>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                  <span>المستحق رده للعميل بعد خصم المديونية</span>
                  <strong>
                    {money(
                      Math.max(
                        0,
                        previewNetReturnAmount -
                          getDebtReductionPreview(
                            selectedInvoice,
                            previewNetReturnAmount,
                          ),
                      ),
                    )}
                  </strong>
                </div>
              </div>
              {settlementMethod === "exchange" && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <ArrowLeftRight className="h-4 w-4 shrink-0" /> سيتم تسجيل
                  المرتجع فقط. بعد نجاحه، أنشئ فاتورة بيع منفصلة للجهاز البديل،
                  وبعد التأكيد، انسخ مرجع العملية الظاهر في رسالة النجاح
                  (RET-...) إلى ملاحظات فاتورة البيع البديلة لربط العمليتين. لا
                  يتم إنشاء بيع جديد تلقائيًا من هذه الصفحة.
                </p>
              )}
              {selectedInvoice.paymentMethod === "installment" && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <Info className="h-4 w-4 shrink-0" /> في التقسيط، كل شهر كامل
                  من تاريخ الفاتورة يتحسب عليه خصم استخدام بقيمة القسط الشهري
                  (والجزء الخاص بالمنتج المرتجع لو الفاتورة فيها أكثر من جهاز).
                  اليوم أو الأسبوع لا يتحسب شهرًا كاملًا. بعد خصم الاستخدام،
                  صافي المرتجع يقلل المديونية غير المسددة من آخر قسط للأول.
                  الأقساط المحصلة تفضل محفوظة، والخصم لا يُسجل كفلوس دفعها
                  العميل.
                </p>
              )}
              {deviceCondition !== "sound" && (
                <p className="text-xs text-amber-700">
                  تنبيه: هذا الكود لا يغيّر المخزون لأن بنية تخزين المخزون لم
                  تُحدّد في الكود المرفق. لا تعتبر الجهاز مضافًا للمخزون بمجرد
                  تسجيل المرتجع.
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t pt-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmReturn}
                disabled={
                  !Number.isInteger(returnQty) ||
                  returnQty <= 0 ||
                  returnQty >
                    Math.max(
                      0,
                      activeItem.item.quantity -
                        returns
                          .filter(
                            (r) =>
                              r.invoiceId === selectedInvoice.id &&
                              r.itemIndex === activeItem.index,
                          )
                          .reduce((sum, r) => sum + r.quantityReturned, 0),
                    )
                }
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                تأكيد وإتمام المرتجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
