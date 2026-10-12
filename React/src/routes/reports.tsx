/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useDB } from "@/lib/store";
import { usePosDB } from "@/lib/pos-store.ts";
import { fmt2, clamp0, round2 } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  ChefHat,
  Wine,
  Cloud,
  ShoppingBag,
  Percent,
  Receipt,
  Minus,
  Wallet,
  Printer,
  LogOut,
  Bike,
  Zap,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { getApiUrl } from "@/api";
const API_URL = getApiUrl();

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "التقارير - تقفيل الشيفت" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { db } = useDB();
  const { db: pos, closeShift } = usePosDB();
  const [serverSummary, setServerSummary] = useState<any>(null);
  const [serverInvoices, setServerInvoices] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    if (pos.shift) {
      void syncShiftFromServer();
    }
  }, [pos.shift?.id]);
  async function getCurrentTerminalId(): Promise<string> {
    try {
      const response = await fetch(`http://${API_URL}:5000/api/device-check`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("فشل تحديد الجهاز");
      }

      const data = await response.json();

      return data?.terminalId || "Main";
    } catch (error) {
      console.error("❌ فشل تحديد Terminal ID في التقارير:", error);

      // fallback فقط، وليس المصدر الأساسي
      return pos.shift?.terminalId || "Main";
    }
  }
  async function syncShiftFromServer() {
    if (!pos.shift) {
      toast.error("لا توجد وردية مفتوحة للمزامنة");
      return;
    }

    try {
      setSyncing(true);

      const terminalId = await getCurrentTerminalId();
      // الفترة الدقيقة للوردية الحالية
      const openedAt = Number(pos.shift.openedAt);
      const now = Date.now();

      if (!Number.isFinite(openedAt) || openedAt <= 0) {
        throw new Error("تاريخ بداية الوردية غير صالح");
      }

      // 1) الحساب الرسمي من PostgreSQL
      const summaryRes = await fetch(
        `http://${API_URL}:5000/api/shifts/summary?terminalId=${encodeURIComponent(
          terminalId,
        )}`,
      );

      if (!summaryRes.ok) {
        const details = await summaryRes.text().catch(() => "");
        throw new Error(
          `SUMMARY_FAILED_${summaryRes.status}${details ? `: ${details}` : ""}`,
        );
      }

      const summary = await summaryRes.json();
      // 2) الفواتير الرسمية للعرض من PostgreSQL فقط
      const startDate = new Date(openedAt).toISOString();
      const endDate = new Date(now).toISOString();

      const invoicesRes = await fetch(
        `http://${API_URL}:5000/api/invoices?startDate=${encodeURIComponent(
          startDate,
        )}&endDate=${encodeURIComponent(endDate)}`,
      );

      if (!invoicesRes.ok) {
        const details = await invoicesRes.text().catch(() => "");
        throw new Error(
          `INVOICES_FAILED_${invoicesRes.status}${
            details ? `: ${details}` : ""
          }`,
        );
      }

      const allInvoices = await invoicesRes.json();

      if (!Array.isArray(allInvoices)) {
        throw new Error("INVOICES_FAILED: response is not an array");
      }

      // نتأكد أن جدول الفواتير المعروض هو نفس الجهاز ونفس الوردية.
      const filteredInvoices = allInvoices.filter((inv: any) => {
        const createdAt = Number(inv.createdAt || 0);
        const invTerminal = inv.terminalId || inv.terminal_id || "Main";

        return (
          invTerminal === terminalId &&
          createdAt >= openedAt &&
          createdAt <= now
        );
      });

      setServerSummary(summary);
      setServerInvoices(filteredInvoices);

      toast.success(`تمت المزامنة`);
    } catch (err) {
      console.error("❌ SYNC SHIFT ERROR:", err);
      setServerSummary(null);
      setServerInvoices([]);
      toast.error("فشل مزامنة حساب الوردية من السيرفر");
    } finally {
      setSyncing(false);
    }
  }

  // مزامنة أولية للوردية الحالية من PostgreSQL
  useEffect(() => {
    if (pos.shift) {
      void syncShiftFromServer();
    }
  }, [pos.shift?.id]);

  // 🌟 الستيت بتاعت البوكس: ضفنا العهدة
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [actualCashInput, setActualCashInput] = useState("");
  const [floatCashInput, setFloatCashInput] = useState(""); // العهدة

  const currentShiftInvoices = useMemo(() => {
    if (!pos.shift) return [];

    const currentTerminalId = pos.shift.terminalId || "Main";

    return pos.invoices.filter(
      (inv) =>
        inv.createdAt >= pos.shift!.openedAt &&
        (inv.terminalId === currentTerminalId ||
          inv.terminal_id === currentTerminalId),
    );
  }, [pos.invoices, pos.shift]);

  const stats = useMemo(() => {
    let kitchen = 0,
      bar = 0,
      shisha = 0;
    let takeawayOnly = 0,
      deliveryOnly = 0,
      deliveryFeesOnly = 0;
    let subtotal = 0,
      discount = 0,
      tax = 0;
    let fastTotal = 0,
      fastCount = 0,
      totalFastCommission = 0;
    let talabatTotal = 0,
      talabatCount = 0,
      totalTalabatCommission = 0;

    for (const inv of currentShiftInvoices) {
      subtotal += inv.subtotal;
      discount += inv.discountValue;
      tax += inv.taxValue || 0;

      const deliveryFee =
        Number(inv.deliveryPrice) || Number((inv as any).delivery_price) || 0;
      deliveryFeesOnly += deliveryFee;

      if (inv.type === "takeaway") {
        takeawayOnly += inv.total - deliveryFee;
      } else if (inv.type === "delivery") {
        deliveryOnly += inv.total - deliveryFee;
      }

      const cat = inv.orderCategory || (inv as any).order_category || "normal";
      if (cat === "fast") {
        fastTotal += inv.total;
        fastCount++;
        totalFastCommission += Number(
          inv.commissionValue || (inv as any).commission_value || 0,
        );
      } else if (cat === "talabat") {
        talabatTotal += inv.total;
        talabatCount++;
        totalTalabatCommission += Number(
          inv.commissionValue || (inv as any).commission_value || 0,
        );
      }

      for (const line of inv.items) {
        const extras =
          line.extras?.reduce((s, e) => s + Number(e.price || 0), 0) || 0;
        const v =
          (Number(line.unitPrice || line.price || 0) + extras) *
          Number(line.qty || 1);

        let deptName = line.department || "مطبخ";
        const meal = db.meals.find((m) => m.id === line.mealId);
        if (meal) {
          const isShisha =
            meal.department === "شيشه" ||
            (meal.category || "").trim().replace("ة", "ه") === "شيشه";
          if (isShisha) deptName = "شيشة";
          else if (meal.department) deptName = meal.department;
        }

        if (deptName.includes("شيش")) shisha += v;
        else if (deptName.includes("بار")) bar += v;
        else kitchen += v;
      }
    }

    const finalNetCash =
      kitchen + bar + totalTalabatCommission + shisha + tax - discount;

    return {
      kitchen: clamp0(kitchen),
      bar: clamp0(bar),
      shisha: clamp0(shisha),
      takeaway: clamp0(takeawayOnly),
      deliveryTotal: clamp0(deliveryOnly),
      deliveryFees: clamp0(deliveryFeesOnly),
      subtotal: clamp0(subtotal),
      discount: clamp0(discount),
      tax: clamp0(tax),
      total: clamp0(finalNetCash),
      revenues: clamp0(finalNetCash),
      fastTotal: clamp0(fastTotal),
      fastCount,
      fastComission: clamp0(totalFastCommission),
      talabatTotal: clamp0(talabatTotal),
      talabatCount,
      talabatCommission: clamp0(totalTalabatCommission),
    };
  }, [currentShiftInvoices, db.meals]);

  const displayStats = serverSummary
    ? {
        kitchen: Number(serverSummary.kitchenSales) || 0,
        bar: Number(serverSummary.barSales) || 0,
        shisha: Number(serverSummary.shishaSales) || 0,
        takeaway: Number(serverSummary.takeawaySales) || 0,
        deliveryTotal: Number(serverSummary.deliverySales) || 0,
        deliveryFees: Number(serverSummary.deliveryFees) || 0,
        subtotal: Number(serverSummary.subtotal) || 0,
        discount: Number(serverSummary.discountValue) || 0,
        tax: Number(serverSummary.taxValue) || 0,
        total: Number(serverSummary.totalRevenue) || 0,
        revenues: Number(serverSummary.totalRevenue) || 0,
        fastTotal: Number(serverSummary.fastSales) || 0,
        fastCount: Number(serverSummary.fastCount) || 0,
        fastComission: Number(serverSummary.fastCommission) || 0,
        talabatTotal: Number(serverSummary.talabatSales) || 0,
        talabatCount: Number(serverSummary.talabatCount) || 0,
        talabatCommission: Number(serverSummary.talabatCommission) || 0,
      }
    : stats;

  async function confirmCloseShift() {
    if (!actualCashInput && actualCashInput !== "0") {
      toast.error("برجاء إدخال إجمالي الكاش بالدرج أولاً");
      return;
    }

    const actualCashInDrawer = Number(actualCashInput) || 0;

    const floatCash = Number(floatCashInput) || 0;

    const actualCashForSystem = actualCashInDrawer - floatCash;

    setIsCloseModalOpen(false);

    const responseData = await closeShift({
      actualCash: actualCashForSystem,
    });

    if (!responseData) return;

    const report = responseData.auditReport;

    if (!report) {
      toast.error("السيرفر لم يرجع تقرير الإغلاق");
      return;
    }

    const variance = Number(report.variance) || 0;

    let varianceStatus = "متطابق 🟢";

    if (variance < 0) {
      varianceStatus = `عجز: ${Math.abs(variance).toFixed(2)} ج.م 🔴`;
    } else if (variance > 0) {
      varianceStatus = `زيادة: ${variance.toFixed(2)} ج.م 🔵`;
    }

    const shiftOpenTime = new Date(
      Number(responseData.openedAt),
    ).toLocaleString("ar-EG");

    const shiftCloseTime = new Date(
      Number(responseData.closedAt),
    ).toLocaleString("ar-EG");

    const printWindow = window.open("", "_blank", "width=600,height=800");

    if (!printWindow) {
      toast.error("برجاء السماح بالنوافذ المنبثقة للطباعة");
      return;
    }

    // مهم:
    // كل الأرقام التالية جاية من PostgreSQL
    const kitchen = Number(report.kitchenTotal || 0);

    const bar = Number(report.barTotal || 0);

    const shisha = Number(report.shishaTotal || 0);

    const takeaway = Number(report.takeawayTotal || 0);

    const delivery = Number(report.deliveryTotal || 0);

    const deliveryFees = Number(report.deliveryFees || 0);

    const fastTotal = Number(report.fastTotal || 0);

    const talabatTotal = Number(report.talabatTotal || 0);

    const talabatCommission = Number(report.talabatCommission || 0);

    const tax = Number(report.taxValue || 0);

    const discount = Number(report.discountValue || 0);

    const databaseTotalSales = Number(report.databaseTotalSales || 0);

    const actualCashReceived = Number(report.actualCashReceived || 0);

    printWindow.document.write(`
    <html dir="rtl">
      <head>
        <title>تقرير تقفيل وردية نهائي</title>
        <style>
          @page { margin: 0; size: auto; }

          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            width: 100%;
            max-width: 80mm;
            margin: 0 auto;
            padding: 10px 5px;
            color: #000;
            background: #fff;
            font-size: 13px;
            line-height: 1.5;
            box-sizing: border-box;
          }

          h2 {
            text-align: center;
            margin: 0 0 10px 0;
            font-size: 18px;
            font-weight: bold;
            text-decoration: underline;
          }

          .header-box {
            border: 1.5px solid #000;
            padding: 6px;
            margin-bottom: 12px;
            font-size: 12px;
            font-weight: bold;
          }

          .header-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            font-size: 13px;
          }

          th, td {
            border: 1.5px solid #000;
            padding: 5px;
          }

          td:first-child {
            width: 65%;
            font-weight: bold;
          }

          td:last-child {
            width: 35%;
            text-align: center;
            font-family: monospace;
            font-size: 14px;
          }

          .table-header {
            text-align: center !important;
            background-color: #f0f0f0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-weight: bold;
            font-size: 14px;
          }

          .bold {
            font-weight: bold;
          }

          .variance-row td {
            background-color: #eee;
            -webkit-print-color-adjust: exact;
          }

          @media print {
            .cut-paper {
              page-break-after: always;
            }
          }
        </style>
      </head>

      <body
        onload="setTimeout(() => {
          window.print();
          window.close();
        }, 500)"
      >

        <h2>Z-Report تقرير وردية</h2>

        <div class="header-box">
          <div class="header-row">
            <span>الجهاز:</span>
            <span dir="ltr">
              ${report.terminalId}
            </span>
          </div>

          <div class="header-row">
            <span>من:</span>
            <span dir="ltr">
              ${shiftOpenTime}
            </span>
          </div>

          <div class="header-row">
            <span>إلى:</span>
            <span dir="ltr">
              ${shiftCloseTime}
            </span>
          </div>

          <div class="header-row">
            <span>الكاشير:</span>
            <span>
              ${report.cashierName || "غير معروف"}
            </span>
          </div>
        </div>

        <table>
          <tr>
            <td colspan="2" class="table-header">
              تفاصيل المبيعات
            </td>
          </tr>

          <tr>
            <td>المطبخ</td>
            <td class="bold">
              ${kitchen.toFixed(2)}
            </td>
          </tr>

          <tr>
            <td>بار</td>
            <td class="bold">
              ${bar.toFixed(2)}
            </td>
          </tr>

          <tr>
            <td>شيشة</td>
            <td class="bold">
              ${shisha.toFixed(2)}
            </td>
          </tr>
        </table>

        <table>
          <tr>
            <td colspan="2" class="table-header">
              توزيع الطلبات والمنصات
            </td>
          </tr>

          <tr>
            <td>تيك أواي</td>
            <td class="bold">
              ${takeaway.toFixed(2)}
            </td>
          </tr>

          <tr>
            <td>دليفري</td>
            <td class="bold">
              ${delivery.toFixed(2)}
            </td>
          </tr>

          <tr>
            <td>Fast</td>
            <td class="bold">
              ${fastTotal.toFixed(2)}
            </td>
          </tr>

          <tr>
            <td>Talabat</td>
            <td class="bold">
              ${talabatTotal.toFixed(2)}
            </td>
          </tr>

          <tr>
            <td>عمولة طلبات</td>
            <td class="bold">
              ${talabatCommission.toFixed(2)}
            </td>
          </tr>

          <tr>
            <td>رسوم التوصيل</td>
            <td class="bold">
              ${deliveryFees.toFixed(2)}
            </td>
          </tr>
        </table>

        <table>
          <tr>
            <td colspan="2" class="table-header">
              المجموع النهائي
            </td>
          </tr>

          <tr>
            <td>إجمالي الضريبة</td>
            <td class="bold">
              ${tax.toFixed(2)}
            </td>
          </tr>

          <tr>
            <td>إجمالي الخصم</td>
            <td class="bold">
              ${discount.toFixed(2)}
            </td>
          </tr>

          <tr>
            <td>إجمالي الإيرادات</td>
            <td class="bold">
              ${databaseTotalSales.toFixed(2)}
            </td>
          </tr>
        </table>

        <div class="cut-paper"></div>

        <table>
          <tr>
            <td colspan="2" class="table-header">
              تسوية العهدة
            </td>
          </tr>

          <tr>
            <td>مبيعات السيستم</td>
            <td class="bold">
              ${databaseTotalSales.toFixed(2)}
            </td>
          </tr>

          <tr>
            <td>العهدة المستلمة</td>
            <td class="bold">
              + ${floatCash.toFixed(2)}
            </td>
          </tr>

          <tr>
            <td>الكاش الفعلي</td>
            <td class="bold">
              ${actualCashReceived.toFixed(2)}
            </td>
          </tr>

          <tr class="variance-row">
            <td>نتيجة الجرد</td>
            <td class="bold">
              ${varianceStatus}
            </td>
          </tr>
        </table>

      </body>
    </html>
  `);
    printWindow.document.close();
  }

  return (
    <div dir="rtl" className="space-y-4 relative">
      {/* 🌟 البوكس المعدل فيه خانتين: العهدة وإجمالي الدرج */}
      {isCloseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-2xl p-6 w-[95%] md:w-[450px] shadow-2xl">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">التسوية</h3>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1 text-muted-foreground">
                العهدة
              </label>
              <input
                type="number"
                className="w-full p-3 border rounded-xl bg-secondary/30 text-xl font-bold text-center focus:ring-2 focus:ring-primary outline-none"
                placeholder="مثال: 500"
                value={floatCashInput}
                onChange={(e) => setFloatCashInput(e.target.value)}
                autoFocus
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold mb-1 text-muted-foreground">
                الكاش الموجود في الدرج
              </label>
              <input
                type="number"
                className="w-full p-4 border-2 border-primary/50 rounded-xl bg-secondary/50 text-2xl font-bold text-center focus:ring-2 focus:ring-primary outline-none"
                placeholder="0.00 ج.م"
                value={actualCashInput}
                onChange={(e) => setActualCashInput(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 py-6 text-lg"
                onClick={() => setIsCloseModalOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                className="flex-1 gap-2 py-6 text-lg"
                onClick={confirmCloseShift}
              >
                <Printer className="w-5 h-5" /> تأكيد وطباعة
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2 no-print">
        <div>
          <h1 className="text-2xl font-bold">إيراد الشيفت الحالي</h1>
          <p className="text-sm text-muted-foreground">
            {pos.shift
              ? `مفتوح بواسطة: ${pos.shift.cashierName}`
              : "لا يوجد شيفت مفتوح"}
          </p>
        </div>
        {pos.shift && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={syncShiftFromServer}
              disabled={syncing}
            >
              {syncing ? "جاري المزامنة..." : "🔄 مزامنة"}
            </Button>
            <Button
              onDoubleClick={() => {
                setActualCashInput("");
                setFloatCashInput(""); // تصفير العهدة لما يفتح البوكس
                setIsCloseModalOpen(true);
              }}
              variant="destructive"
              className="gap-2"
            >
              <Printer className="w-4 h-4" /> طباعة وتقفيل الشيفت{" "}
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card
          icon={ChefHat}
          label="المطبخ"
          value={displayStats.kitchen}
          accent="orange"
        />
        <Card
          icon={Wine}
          label="البار"
          value={displayStats.bar}
          accent="rose"
        />
        <Card
          icon={Cloud}
          label="الشيشة"
          value={displayStats.shisha}
          accent="purple"
        />
        <Card
          icon={ShoppingBag}
          label="التيك أواي"
          value={displayStats.takeaway}
          accent="sky"
        />
        <CardWithCommission
          icon={Zap}
          label="فاست"
          value={displayStats.fastTotal}
          commission={displayStats.fastComission}
          count={displayStats.fastCount}
          accent="amber"
        />
        <CardWithCommission
          icon={Store}
          label="طلبات"
          value={displayStats.talabatTotal}
          commission={displayStats.talabatCommission}
          count={displayStats.talabatCount}
          accent="orange"
        />
        <Card
          icon={Bike}
          label="أوردر التوصيل"
          value={displayStats.deliveryTotal}
          accent="orange"
        />
        <Card
          icon={DollarSign}
          label="رسوم التوصيل"
          value={displayStats.deliveryFees}
          accent="emerald"
        />
        <Card
          icon={Receipt}
          label="الايرادات الاساسية"
          value={displayStats.subtotal}
          accent="slate"
        />
        <Card
          icon={Percent}
          label="القيمة المضافة (14%)"
          value={displayStats.tax}
          accent="indigo"
        />
        <Card
          icon={Minus}
          label="الخصم"
          value={displayStats.discount}
          accent="amber"
        />
        <Card
          icon={DollarSign}
          label="الايرادات الكليه"
          value={displayStats.revenues}
          accent="emerald"
        />
      </div>

      <div className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <Wallet className="w-10 h-10 opacity-80" />
          <div className="flex-1">
            <p className="text-sm opacity-80">
              التوتال النهائي للشيفت (شامل إجمالي نسبة طلبات المضافة)
            </p>
            <p className="text-4xl font-bold mt-1">
              {fmt2(displayStats.total)}{" "}
              <span className="text-lg font-normal opacity-80">ج.م</span>
            </p>
          </div>
          <div className="text-sm opacity-80 text-end">
            <div>
              {serverSummary
                ? serverInvoices.length
                : currentShiftInvoices.length}{" "}
              فاتورة
            </div>
            <div className="text-xs text-emerald-300 font-bold mt-1">
              مضاف عوائد طلبات: +{fmt2(displayStats.talabatCommission)} ج.م
            </div>
            {pos.shift && (
              <div className="mt-1">الكاشير: {pos.shift.cashierName}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value, accent }: any) {
  const colors: Record<string, string> = {
    emerald:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    orange:
      "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    purple:
      "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
    sky: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    indigo:
      "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    slate:
      "bg-slate-50 text-slate-700 dark:bg-slate-950/40 dark:text-slate-300",
    amber:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between">
      <div
        className={`w-10 h-10 rounded-lg grid place-items-center ${colors[accent]}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mt-2">{label}</p>
        <p className="text-xl font-bold mt-1">
          {fmt2(value)}{" "}
          <span className="text-xs font-normal text-muted-foreground">ج.م</span>
        </p>
      </div>
    </div>
  );
}

function CardWithCommission({
  icon: Icon,
  label,
  value,
  commission,
  count,
  accent,
}: any) {
  const colors: Record<string, string> = {
    orange:
      "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  };
  return (
    <div className="bg-card border-1 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
      <div className="flex justify-between items-start">
        <div
          className={`w-10 h-10 rounded-lg grid place-items-center ${colors[accent] || colors.orange}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-[11px] font-extrabold bg-pink-50 text-pink-700 px-2 py-1 rounded-md border border-pink-200">
          {fmt2(commission)}
        </span>
      </div>
      <div className="mt-2">
        <div className="flex justify-between items-baseline">
          <p className="text-xs font-bold text-foreground">{label}</p>
          <span className="text-[10px] text-muted-foreground">
            ({count} أوردر)
          </span>
        </div>
        <p className="text-xl font-black mt-1 text-primary">
          {fmt2(value)}{" "}
          <span className="text-xs font-normal text-muted-foreground">ج.م</span>
        </p>
      </div>
    </div>
  );
}
