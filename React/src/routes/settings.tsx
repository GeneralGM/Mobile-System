/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { usePosDB, type Invoice, type ShiftState } from "@/lib/pos-store";
import { useDB, SHISHA_CATEGORY } from "@/lib/store";
import { fmt2, clamp0 } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Settings as SettingsIcon,
  Search,
  Receipt,
  Clock,
  Download,
  Printer,
  Info,
  DollarSign,
  ChefHat,
  Wine,
  Cloud,
  ShoppingBag,
  Percent,
  Minus,
  Wallet,
  Bike,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { FastIcon, TalabatIcon } from "@/Fast&talabaticon";

import { getApiUrl } from "@/api";
const API_URL = getApiUrl();

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "السجل - أرشيف الفواتير" }] }),
  component: SettingsPage,
});

type Tab = "invoices" | "shifts";

const printInvoice = (invoice: Invoice) => {
  const printWindow = window.open("", "_blank", "width=500,height=750");
  if (!printWindow) return;

  // =========================
  // الحسابات
  // =========================
  const dPrice =
    Number(invoice.deliveryPrice) ||
    Number((invoice as any).delivery_price) ||
    0;

  const taxVal =
    Number(invoice.taxValue) || Number((invoice as any).tax_value) || 0;

  const discVal =
    Number(invoice.discountValue) ||
    Number((invoice as any).discount_value) ||
    0;

  const finalDiscVal =
    discVal ||
    (Number(invoice.subtotal || 0) *
      Number(invoice.discountPct || (invoice as any).discount_pct || 0)) /
      100 ||
    0;

  const finalTaxVal =
    taxVal ||
    ((Number(invoice.subtotal || 0) - discVal) *
      Number(invoice.taxPct || (invoice as any).tax_pct || 0)) /
      100 ||
    0;

  const computedTotal =
    Number(invoice.total) ||
    Number(invoice.subtotal || 0) - discVal + finalTaxVal + dPrice;

  // =========================
  // تجهيز الـ items
  // =========================
  const itemsArray =
    typeof invoice.items === "string"
      ? JSON.parse(invoice.items)
      : invoice.items || [];

  const commVal =
    Number(invoice.commissionValue) ||
    Number((invoice as any).commission_value) ||
    0;

  // =========================
  // نوع الطلب
  // =========================
  const orderTypeArabic =
    invoice.type === "delivery"
      ? "توصيل (Delivery)"
      : invoice.type === "takeaway"
        ? "تيك أواي (Takeaway)"
        : "صالة (Dine-In)";

  // =========================
  // التاريخ والوقت
  // =========================
  const formattedDate = invoice.createdAt
    ? new Date(invoice.createdAt).toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : new Date().toLocaleDateString("ar-EG");

  const formattedTime = invoice.createdAt
    ? new Date(invoice.createdAt).toLocaleTimeString("ar-EG", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : new Date().toLocaleTimeString("ar-EG", {
        hour: "2-digit",
        minute: "2-digit",
      });

  // =========================
  // البيانات
  // =========================
  const cashierName =
    (invoice as any).cashierName ||
    (invoice as any).cashier_name ||
    "...........";

  const captainName =
    (invoice as any).captainName ||
    (invoice as any).captain_name ||
    (invoice as any).captain ||
    "—";

  const tableName =
    (invoice as any).table_name || invoice.tableCode || "...........";

  const custName = invoice.customerName || "";

  const custPhone =
    (invoice as any).customerPhone ||
    (invoice as any).phone ||
    (invoice as any).customer_phone ||
    "";

  const custAddress = invoice.customerAddress || "";

  // =========================
  // HTML
  // =========================
  const html = `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />

        <title>فاتورة - مول زايد</title>

        <style>
          @page {
            size: 72mm auto;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            width: 72mm;
            max-width: 72mm;
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
            direction: rtl;
            font-family: Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
            text-rendering: optimizeLegibility;
          }

          body {
            font-size: 11px;
          }

          h2,
          p {
            margin: 0;
          }

          table {
            border-collapse: collapse;
            border-spacing: 0;
          }

          img {
            display: block;
            max-width: 100%;
          }

          .receipt-container {
            width: 72mm;
            max-width: 72mm;
            margin: 0 auto;
            padding: 3px 2mm 4px;
          }

          /* =========================
             HEADER
             ========================= */

          .header-section {
            text-align: center;
            margin-bottom: 3px;
          }

          .logo {
            width: 62px;
            height: 62px;
            margin: 0 auto 2px;
            object-fit: contain;
          }

          .shop-name {
            font-size: 19px;
            line-height: 1;
            font-weight: 900;
            margin: 0;
          }

          .separator-solid {
            border-top: 1px solid #000;
            margin: 4px 0;
          }

          .separator-line {
            border-top: 1px dashed #000;
            margin: 3px 0;
          }

          /* =========================
             ORDER TYPE
             ========================= */

          .order-type-wrapper {
            text-align: center;
            margin-bottom: 4px;
          }

          .order-type-title {
            font-size: 13px;
            line-height: 1.2;
            font-weight: 900;
            border: 1px solid #000;
            border-radius: 3px;
            padding: 3px 0;
          }

          /* =========================
             CUSTOMER
             ========================= */

          .customer-box {
            border: 1px solid #000;
            padding: 4px 5px;
            margin-bottom: 4px;
            border-radius: 4px;
            text-align: right;
            font-size: 10px;
            line-height: 1.35;
          }

          /* =========================
             INFO
             ========================= */

          .info-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 2px 4px;
            margin-bottom: 4px;
            text-align: center;
            font-size: 10px;
          }

          .info-label {
            font-size: 9px;
            font-weight: 700;
            margin-bottom: 1px;
          }

          .info-value-xs {
            font-size: 10px;
            font-weight: 900;
          }

          .info-value-bold {
            font-size: 10px;
            font-weight: 900;
            border-bottom: 1px solid #000;
            padding-bottom: 1px;
          }

          /* =========================
             PLATFORM
             ========================= */

          .platform-banner {
            border: 1px solid #000;
            border-radius: 3px;
            padding: 3px 4px;
            text-align: center;
            font-size: 10px;
            font-weight: 900;
            margin-bottom: 4px;
          }

          /* =========================
             ITEMS
             ========================= */

          .items-wrapper {
            margin-bottom: 3px;
          }

          .items-table {
            width: 100%;
            table-layout: fixed;
            text-align: center;
            font-size: 10px;
            margin: 0;
          }

          .items-table thead tr {
            border-bottom: 1px solid #000;
          }

          .items-table th {
            font-size: 10px;
            font-weight: 900;
            padding: 2px 0;
            text-align: center;
            white-space: nowrap;
          }

          .items-table tbody tr {
            border-bottom: 1px dashed #000;
          }

          .items-table td {
            padding: 3px 0;
            text-align: center;
            font-weight: 700;
            vertical-align: middle;
          }

          .col-total {
            width: 22%;
          }

          .col-price {
            width: 20%;
          }

          .col-qty {
            width: 13%;
          }

          .col-name {
            width: 45%;
          }

          .cell-total {
            font-weight: 900;
            white-space: nowrap;
          }

          .cell-price {
            white-space: nowrap;
          }

          .cell-qty {
            font-weight: 900;
            white-space: nowrap;
          }

          .cell-name {
            font-weight: 900;
            text-align: center;
            word-wrap: break-word;
            white-space: normal;
            line-height: 1.2;
            padding-right: 2px;
          }

          .item-extras {
            display: block;
            margin-top: 1px;
            font-size: 8px;
            font-weight: 700;
            line-height: 1.1;
          }

          /* =========================
             TOTALS
             ========================= */

          .totals-section {
            margin-bottom: 4px;
            font-size: 10px;
            font-weight: 700;
          }

          .totals-section > div + div {
            margin-top: 2px;
          }

          .totals-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 5px;
          }

          .totals-row.subtotal,
          .totals-row.discount,
          .totals-row.tax,
          .totals-row.commission,
          .totals-row.delivery {
            font-weight: 900;
          }

          .totals-row.grand-total {
            font-size: 14px;
            font-weight: 900;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 4px 0;
            margin-top: 4px;
          }

          /* =========================
             CONTACT
             ========================= */

          .contact-section {
            margin-bottom: 4px;
            text-align: center;
            font-size: 9px;
          }

          .contact-title {
            font-weight: 900;
            margin-bottom: 1px;
          }

          .contact-list {
            font-weight: 700;
            line-height: 1.2;
          }

          /* =========================
             FOOTER
             ========================= */

          .footer-section {
            border-top: 1px dashed #000;
            margin-top: 4px;
            padding-top: 3px;
            font-size: 8px;
            text-align: center;
            font-weight: 700;
            line-height: 1.2;
          }

          @media print {
            body {
              background: #fff;
              margin: 0;
              padding: 0;
            }

            .receipt-container {
              width: 72mm;
              max-width: 72mm;
              padding: 3px 2mm 4px;
              margin: 0;
            }
          }
        </style>
      </head>

      <body>
        <div class="receipt-container">

          <!-- HEADER -->
          <div class="header-section">
            <img
              src="/Inv_logo.png"
              alt="Logo"
              class="logo"
            />

            <div class="shop-name">
              Zayed Mall
            </div>
          </div>

          <div class="separator-solid"></div>

          <!-- ORDER TYPE -->
          <div class="order-type-wrapper">
            <h2 class="order-type-title">
              ${orderTypeArabic}
            </h2>
          </div>

          <!-- CUSTOMER -->
          ${
            custName || custAddress || custPhone
              ? `
                <div class="customer-box">
                  ${
                    custName || custPhone
                      ? `
                        <div>
                          <strong>العميل:</strong>
                          ${custName}
                          ${
                            custPhone
                              ? `<span dir="ltr"> ${custPhone}</span>`
                              : ""
                          }
                        </div>
                      `
                      : ""
                  }

                  ${
                    custAddress
                      ? `
                        <div>
                          <strong>العنوان:</strong>
                          ${custAddress}
                        </div>
                      `
                      : ""
                  }
                </div>
              `
              : ""
          }

          <!-- INFO -->
          <div class="info-grid">

            <div>
              <div class="info-label">التاريخ</div>
              <div class="info-value-xs">
                ${formattedDate}
              </div>
            </div>

            <div>
              <div class="info-label">الوقت</div>
              <div class="info-value-xs">
                ${formattedTime}
              </div>
            </div>

            <div>
              <div class="info-label">اسم الطاولة / الطلب</div>
              <div class="info-value-bold">
                ${
                  tableName.length > 8
                    ? tableName.substring(0, 3) + "..."
                    : tableName
                }
              </div>
            </div>

            <div>
              <div class="info-label">اسم الكاشير</div>
              <div class="info-value-bold">
                ${cashierName}
              </div>
            </div>

            ${
              invoice.type === "dinein"
                ? `
                  <div>
                    <div class="info-label">اسم الكابتن</div>
                    <div class="info-value-bold">
                      ${captainName}
                    </div>
                  </div>
                `
                : ""
            }

          </div>

          <!-- PLATFORM -->
          ${
            (invoice.type === "takeaway" || invoice.type === "delivery") &&
            invoice.orderCategory &&
            invoice.orderCategory !== "normal"
              ? `
                <div class="platform-banner">
                  منصة التوصيل:
                  <span>
                    ${
                      invoice.orderCategory === "talabat"
                        ? "طلبات (Talabat)"
                        : invoice.orderCategory === "fast"
                          ? "فاست (Fast)"
                          : invoice.orderCategory
                    }
                  </span>
                </div>
              `
              : ""
          }

          <div class="separator-line"></div>

          <!-- ITEMS -->
          <div class="items-wrapper">
            <table class="items-table">
              <thead>
                <tr>
                  <th class="col-total">الإجمالي</th>
                  <th class="col-price">السعر</th>
                  <th class="col-qty">الكمية</th>
                  <th class="col-name">الصنف</th>
                </tr>
              </thead>

              <tbody>
                ${itemsArray
                  .map(
                    (line: {
                      extras: any[];
                      mealName: any;
                      name: any;
                      unitPrice: any;
                      price: any;
                      qty: any;
                    }) => {
                      const exStr =
                        line.extras && line.extras.length
                          ? `
                            <span class="item-extras">
                              (+ ${line.extras
                                .map(
                                  (e: { name: any; label: any }) =>
                                    e.name || e.label,
                                )
                                .join(", ")})
                            </span>
                          `
                          : "";

                      const displayName =
                        line.mealName || line.name || "صنف غير معروف";

                      const singlePrice =
                        Number(line.unitPrice || line.price || 0) +
                        (line.extras
                          ? line.extras.reduce(
                              (s: number, e: { price: any }) =>
                                s + Number(e.price || 0),
                              0,
                            )
                          : 0);

                      const lineTotal = singlePrice * Number(line.qty || 1);

                      return `
                        <tr>
                          <td class="cell-total">
                            ${lineTotal.toFixed(0)}
                          </td>

                          <td class="cell-price">
                            ${singlePrice.toFixed(0)}
                          </td>

                          <td class="cell-qty">
                            ${line.qty}
                          </td>

                          <td class="cell-name">
                            ${displayName}
                            ${exStr}
                          </td>
                        </tr>
                      `;
                    },
                  )
                  .join("")}
              </tbody>
            </table>
          </div>

          <div class="separator-solid"></div>

          <!-- TOTALS -->
          <div class="totals-section">

            <div class="totals-row subtotal">
              <span>المجموع الأصلي:</span>
              <span>
                ${Number(invoice.subtotal || 0).toFixed(2)}
              </span>
            </div>

            ${
              finalDiscVal > 0
                ? `
                  <div class="totals-row discount">
                    <span>
                      الخصم (${invoice.discountPct || 0}%):
                    </span>
                    <span>
                      -${finalDiscVal.toFixed(2)}
                    </span>
                  </div>
                `
                : ""
            }

            ${
              finalTaxVal > 0
                ? `
                  <div class="totals-row tax">
                    <span>
                      الضريبة (${invoice.taxPct || 0}%):
                    </span>
                    <span>
                      ${finalTaxVal.toFixed(2)}
                    </span>
                  </div>
                `
                : ""
            }

            ${
              commVal > 0
                ? `
                  <div class="totals-row commission">
                    <span>
                      منصة (
                      ${invoice.orderCategory === "talabat" ? "طلبات" : "فاست"}
                      ):
                    </span>

                    <span>
                      +${commVal.toFixed(2)}
                    </span>
                  </div>
                `
                : ""
            }

            ${
              dPrice > 0
                ? `
                  <div class="totals-row delivery">
                    <span>خدمة التوصيل:</span>
                    <span>
                      +${dPrice.toFixed(2)}
                    </span>
                  </div>
                `
                : ""
            }

            <div class="totals-row grand-total">
              <span>الإجمالي الكلي:</span>

              <span>
                ${computedTotal.toFixed(2)}
              </span>
            </div>

          </div>

          <!-- CONTACT -->
          <div class="contact-section">
            <div class="contact-title">
              أرقام التواصل
            </div>

            <div class="contact-list" dir="ltr">
              <div>+20 103 554 4179</div>
              <div>+20 101 450 4046</div>
            </div>
          </div>

          <!-- FOOTER -->
          <div class="footer-section">
            <div>
              Powered by
              <span
                style="
                  font-weight:900;
                  border:1px solid #000;
                  padding:0 2px;
                  border-radius:2px;
                "
              >
                BMO-TECH66
              </span>
              Systems
            </div>

            <div dir="ltr">
              WhatsApp: 01553610767
            </div>
          </div>

        </div>

        <script>
          window.onload = function () {
            setTimeout(() => {
              window.print();
              window.close();
            }, 300);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};

function SettingsPage() {
  const [tab, setTab] = useState<Tab>("invoices");

  return (
    <div dir="rtl" className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">السجل</h1>
        <p className="text-sm text-muted-foreground">
          أرشيف الفواتير وإعدادات النظام.
        </p>
      </div>
      <div className="flex gap-1 bg-secondary p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab("invoices")}
          className={`px-4 h-9 rounded-md text-sm font-medium flex items-center gap-2 ${tab === "invoices" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
        >
          <Receipt className="w-4 h-4" /> الفواتير
        </button>
        <button
          onClick={() => setTab("shifts")}
          className={`px-4 h-9 rounded-md text-sm font-medium flex items-center gap-2 ${tab === "shifts" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
        >
          <Clock className="w-4 h-4" /> الشيفتات
        </button>
      </div>
      {tab === "invoices" && <InvoicesTab />}
      {tab === "shifts" && <ShiftsTab />}
    </div>
  );
}
function InvoicesTab() {
  const { db: pos } = usePosDB();
  const [q, setQ] = useState("");

  // 🌟 1. فلاتر التاريخ (الافتراضي: اليوم الحالي) - متساب زي ما هو
  const [fromDate, setFromDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));

  // 🌟 2. الفلاتر المتقدمة المدمجة
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [amountFilter, setAmountFilter] = useState<string>("all");

  // ✨ الفلتر الجديد الخاص بالموظفين (كاشير وكابتن)
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");

  const [serverInvoices, setServerInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 🔄 جلب الفواتير من السيرفر
  useEffect(() => {
    async function fetchInvoicesFromPostgres() {
      try {
        setIsLoading(true);
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);

        const response = await fetch(
          `http://${API_URL}:5000/api/invoices?startDate=${start.toISOString()}&endDate=${end.toISOString()}`,
        );
        if (response.ok) {
          const data = await response.json();
          setServerInvoices(data);
        }
      } catch (error) {
        console.error("❌ خطأ أثناء جلب الفواتير من الأرشيف:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchInvoicesFromPostgres();
  }, [fromDate, toDate]);

  // ✨ استخراج قائمة أسماء الموظفين (الكاشيرية والكباتن) من الفواتير الحالية بدون تكرار
  const employeesList = useMemo(() => {
    const names = new Set<string>();
    const allInvoices = [...pos.invoices, ...serverInvoices];

    allInvoices.forEach((inv) => {
      const cashier = inv.cashierName || (inv as any).cashier_name;
      const captain =
        inv.captainName || (inv as any).captain_name || (inv as any).captain;

      if (
        cashier &&
        cashier.trim() !== "" &&
        cashier !== "—" &&
        !cashier.includes("...........")
      ) {
        names.add(cashier.trim());
      }
      if (
        captain &&
        captain.trim() !== "" &&
        captain !== "—" &&
        !captain.includes("...........")
      ) {
        names.add(captain.trim());
      }
    });
    return Array.from(names).sort();
  }, [pos.invoices, serverInvoices]);

  // 🌟 دمج الفواتير وتطبيق الفلاتر المتقدمة (الطاولة + المبلغ + الموظف + البحث)
  const rows: Invoice[] = useMemo(() => {
    const map = new Map<string, Invoice>();
    pos.invoices.forEach((inv) => map.set(inv.id, inv));
    serverInvoices.forEach((inv) => map.set(inv.id, inv));

    const mergedInvoices = Array.from(map.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );

    return mergedInvoices.filter((inv) => {
      // 1️⃣ فلترة نوع الطاولة / المنطقة
      if (tableFilter !== "all") {
        const code = (inv.tableCode || "").trim().toUpperCase();
        const type = inv.type || "";

        if (tableFilter === "takeaway") {
          if (
            type !== "takeaway" &&
            type !== "delivery" &&
            !code.startsWith("TAK") &&
            !code.startsWith("DEL") &&
            !code.startsWith("T") &&
            !code.startsWith("D")
          )
            return false;
        } else if (tableFilter === "X") {
          if (
            !code.startsWith("X") &&
            type !== "staff" &&
            type !== "hospitality" &&
            inv.zone !== "others"
          )
            return false;
        } else {
          if (!code.startsWith(tableFilter.toUpperCase())) return false;
        }
      }

      // 2️⃣ فلترة المبلغ النهائي
      if (amountFilter !== "all") {
        const total = Number(inv.total) || 0;
        if (amountFilter === "lt200" && total >= 200) return false;
        if (amountFilter === "200-500" && (total < 200 || total > 500))
          return false;
        if (amountFilter === "500-700" && (total < 500 || total > 700))
          return false;
        if (amountFilter === "700-1000" && (total < 700 || total > 1000))
          return false;
        if (amountFilter === "gt1000" && total <= 1000) return false;
      }

      // ✨ 3️⃣ فلترة الموظف (سواء كان كاشير أو كابتن)
      if (employeeFilter !== "all") {
        const cashier = (
          inv.cashierName ||
          (inv as any).cashier_name ||
          ""
        ).trim();
        const captain = (
          inv.captainName ||
          (inv as any).captain_name ||
          (inv as any).captain ||
          ""
        ).trim();

        if (cashier !== employeeFilter && captain !== employeeFilter) {
          return false; // لو الاسم اللي اخترناه مش هو الكاشير ولا هو الكابتن، استبعد الفاتورة
        }
      }

      // 4️⃣ البحث النصي السريع
      if (q) {
        const hay =
          `${inv.invoiceNumber || ""} ${inv.tableCode || ""} ${inv.customerName || ""} ${inv.customerAddress || ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }

      return true;
    });
  }, [
    pos.invoices,
    serverInvoices,
    tableFilter,
    amountFilter,
    employeeFilter,
    q,
  ]);

  // 🌟 حسابات شريط العدادات الذكية المدمجة
  const stats = useMemo(() => {
    const totalCount = rows.length;
    const totalMoney = rows.reduce(
      (sum, inv) => sum + (Number(inv.total) || 0),
      0,
    );
    return { count: totalCount, sum: totalMoney };
  }, [rows]);

  function exportToExcel() {
    const data = rows.map((inv) => {
      const shift = pos.shifts.find(
        (s) =>
          inv.createdAt >= s.openedAt &&
          (!s.closedAt || inv.createdAt <= s.closedAt),
      );
      const soldItems =
        inv.items?.map((i) => `${i.name}×${i.qty}`).join(" , ") || "";
      return {
        "الأصناف المباعة": soldItems,
        الشيفت: shift
          ? `${shift.cashierName} (${new Date(shift.openedAt).toLocaleDateString("ar-EG")})`
          : "—",
        التاريخ: new Date(inv.createdAt).toLocaleString("ar-EG"),
        "المجموع النهائي": fmt2(inv.total),
        "نوع الطلب":
          inv.type === "staff"
            ? "موظفين"
            : inv.type === "hospitality"
              ? "ضيافة"
              : inv.type,
        "رقم الطاولة": inv.tableCode || "تيك أواي",
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 60 },
      { wch: 30 },
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];
    ws["!dir"] = "rtl";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الفواتير");
    const fileName = `فواتير_أرشيف_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  return (
    <div className="space-y-3">
      {/* 🌟 شريط التحكم الموحد */}
      <div className="bg-card p-2.5 rounded-xl border border-border shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Input
            dir="rtl"
            placeholder="ابحث برقم الفاتورة، الطاولة، العميل..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pe-9 h-9 text-xs bg-secondary/30 focus:bg-background transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ✨ دروب داون الموظفين (الجديد) */}
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-input bg-secondary/50 text-xs font-bold text-foreground focus:ring-2 focus:ring-primary outline-none cursor-pointer"
          >
            <option value="all">👨‍💼 كل الموظفين</option>
            {employeesList.map((name, idx) => (
              <option key={idx} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-input bg-secondary/50 text-xs font-bold text-foreground focus:ring-2 focus:ring-primary outline-none cursor-pointer"
          >
            <option value="all">🌐 كل المناطق</option>
            <option value="C">🔒 صالة (C)</option>
            <option value="O">☀️ صالة (O)</option>
            <option value="X">👥 داخلي / موظفين (X)</option>
            <option value="K">🧸 أطفال (K)</option>
            <option value="ص">🏠 قاعة صغيرة (ص)</option>
            <option value="ك">🏛️ قاعة كبيرة (ك)</option>
            <option value="takeaway">🛍️ تيك أواي / دليفري</option>
          </select>

          <select
            value={amountFilter}
            onChange={(e) => setAmountFilter(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-input bg-secondary/50 text-xs font-bold text-foreground focus:ring-2 focus:ring-primary outline-none cursor-pointer"
          >
            <option value="all">💰 كل المبالغ</option>
            <option value="lt200">🔻 أقل من 200 ج.م</option>
            <option value="200-500">💵 200 : 500 ج.م</option>
            <option value="500-700">💵 500 : 700 ج.م</option>
            <option value="700-1000">💵 700 : 1000 ج.م</option>
            <option value="gt1000">💎 أكبر من 1000 ج.م</option>
          </select>

          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1 px-2 border border-input">
            <span className="text-[11px] font-bold text-muted-foreground">
              من:
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-7 text-xs rounded bg-background border-none px-1 text-primary font-bold cursor-pointer outline-none"
            />
            <span className="text-[11px] font-bold text-muted-foreground">
              إلى:
            </span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-7 text-xs rounded bg-background border-none px-1 text-primary font-bold cursor-pointer outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/20 p-2 rounded-xl border border-border/60">
        <div className="flex items-center gap-4 px-2">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground font-semibold">
              عدد الفواتير:
            </span>
            <span className="font-extrabold bg-primary/10 text-primary px-2 py-0.5 rounded-md font-mono">
              {stats.count}
            </span>
          </div>
          <div className="h-4 w-[1px] bg-border" />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground font-semibold">
              الإجمالي النهائي:
            </span>
            <span className="font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md font-mono">
              {fmt2(stats.sum)} ج.م
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={exportToExcel}
          className="gap-1.5 h-8 text-xs font-bold bg-card hover:bg-secondary shadow-sm"
        >
          <Download className="w-3.5 h-3.5 text-emerald-600" /> تصدير Excel
        </Button>
      </div>

      {/* 🌟 جدول عرض الفواتير */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs">
            <tr>
              <th className="text-center p-3">رقم الفاتورة</th>
              <th className="text-center p-3">التاريخ والوقت</th>
              <th className="text-center p-3">نوع الطلب</th>
              <th className="text-center p-3">الطاولة</th>
              <th className="text-center p-3">الكاشير</th>
              <th className="text-center p-3">الأصناف</th>
              <th className="text-center p-3">المجموع</th>
              <th className="text-center p-3">الخصم</th>
              <th className="text-center p-3 text-purple-600 font-bold">
                الضريبة / المنصة
              </th>
              <th className="text-center p-3 text-blue-600 font-bold">
                الكابتن / التوصيل
              </th>
              <th className="text-center p-3 text-emerald-600 font-bold">
                الإجمالي النهائي
              </th>
              <th className="text-center p-3">طباعة</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={12}
                  className="p-8 text-center text-amber-600 font-medium animate-pulse"
                >
                  جاري جلب الفواتير من الأرشيف (pgAdmin)...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className="p-8 text-center text-muted-foreground"
                >
                  لا توجد فواتير مطابقة للفلاتر المحددة حالياً.
                </td>
              </tr>
            ) : (
              rows.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-t border-border hover:bg-secondary/30 transition-colors"
                >
                  <td className="p-3 font-mono text-center text-xs font-bold">
                    {inv.invoiceNumber || "-"}
                  </td>
                  <td className="p-3 font-mono text-center text-xs" dir="ltr">
                    {new Date(inv.createdAt)
                      .toLocaleString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                        day: "2-digit",
                        month: "2-digit",
                      })
                      .replace(",", " ||")}
                  </td>
                  <td className="p-3 text-right text-xs">
                    {inv.orderCategory === "talabat" ? (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-100 text-amber-900 font-semibold text-sm border border-amber-300">
                        <TalabatIcon size={16} color="#FF5E00" /> طلبات
                      </span>
                    ) : inv.orderCategory === "fast" ? (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-100 text-amber-900 font-semibold text-sm border border-amber-300">
                        <FastIcon size={16} color="#FF5E00" /> فاست
                      </span>
                    ) : inv.type === "delivery" ? (
                      <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 font-medium">
                        توصيل 🛵
                      </span>
                    ) : inv.type === "takeaway" ? (
                      <span className="px-2 py-1 rounded bg-green-100 text-green-800 font-medium">
                        تيك أواي 🛍️
                      </span>
                    ) : inv.type === "staff" ? (
                      <span className="px-2 py-1 rounded bg-purple-100 text-purple-800 font-bold">
                        موظفين 👤
                      </span>
                    ) : inv.type === "hospitality" ? (
                      <span className="px-2 py-1 rounded bg-pink-100 text-pink-800 font-bold">
                        ضيافة ☕
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 font-medium">
                        صالة 🍽️
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {inv.type === "takeaway" || inv.type === "delivery" ? (
                      <div>
                        <div className="font-medium">
                          {inv.customerName || "عميل نقدي"}
                        </div>
                        {inv.customerAddress && (
                          <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                            {inv.customerAddress}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="font-mono font-bold text-primary text-base">
                        {inv.tableCode || "—"}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center text-muted-foreground text-xs font-medium">
                    {inv.cashierName || "—"}
                  </td>
                  <td className="p-3 text-center font-bold text-center">
                    {(typeof inv.items === "string"
                      ? JSON.parse(inv.items)
                      : inv.items || []
                    ).reduce(
                      (sum: number, item: any) => sum + (Number(item.qty) || 1),
                      0,
                    )}
                  </td>
                  <td className="p-3 text-center font-medium">
                    {fmt2(inv.subtotal)}
                  </td>
                  <td className="p-3 text-center text-xs">
                    {Math.floor(
                      +fmt2(inv.discountPct || (inv as any).discount_pct || 0),
                    )}
                    % &asymp;&nbsp;
                    <span className="text-red-600 font-bold">
                      {fmt2(
                        inv.discountValue || (inv as any).discount_value || 0,
                      )}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {inv.commissionValue ? (
                      <span className="text-purple-600 font-bold text-sm">
                        {fmt2(inv.commissionValue)}
                      </span>
                    ) : (
                      <span className="text-blue-600 font-medium text-sm">
                        {fmt2(inv.taxValue || (inv as any).tax_value || 0)}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center font-bold text-xs">
                    {inv.type === "delivery" || inv.type === "takeaway" ? (
                      <span className="text-amber-600">
                        {inv.deliveryPrice && inv.deliveryPrice > 0
                          ? `+${fmt2(inv.deliveryPrice)} ج.م`
                          : "—"}
                      </span>
                    ) : (
                      <span className="text-blue-600">
                        {(inv as any).captainName ||
                          (inv as any).captain_name ||
                          (inv as any).captain ||
                          "—"}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center font-black text-emerald-600 text-base">
                    {fmt2(inv.total)}
                  </td>
                  <td className="p-3 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => printInvoice(inv)}
                      className="gap-1.5 h-8 font-bold"
                    >
                      <Printer className="w-3.5 h-3.5" /> طباعة
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ShiftReport {
  shift: ShiftState;
  invoiceCount: number;
  kitchen: number;
  bar: number;
  shisha: number;
  takeaway: number;
  delivery: number;
  deliveryFees: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  revenues: number;
  // 🌟 الحقول الجديدة لدعم فاست وطلبات
  fastTotal: number;
  fastCount: number;
  fastCommission: number;
  talabatTotal: number;
  talabatCount: number;
  talabatCommission: number;
}

function ShiftsTab() {
  const { db: pos } = usePosDB();
  const { db } = useDB();
  const [detailShift, setDetailShift] = useState<ShiftReport | null>(null);

  // 🌟 فلاتر التاريخ الجديدة (الافتراضي: من أمس لليوم = آخر 24 ساعة تقريباً)
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1); // من إمبارح
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));

  const [serverShifts, setServerShifts] = useState<any[]>([]);
  const [serverInvoices, setServerInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchShiftsAndInvoices() {
      try {
        setIsLoading(true);
        // تجهيز التواريخ للباك إند
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        const startIso = start.toISOString();
        const endIso = end.toISOString();

        // التعديل هنا: بنضمن إننا بنجيب الشيفتات الشاملة للمحل كله من السيرفر المركزي
        const [shiftsRes, invoicesRes] = await Promise.all([
          fetch(
            `http://${API_URL}:5000/api/shifts?startDate=${startIso}&endDate=${endIso}`,
          ),
          fetch(
            `http://${API_URL}:5000/api/invoices?startDate=${startIso}&endDate=${endIso}`,
          ),
        ]);

        if (shiftsRes.ok && invoicesRes.ok) {
          const shiftsData = await shiftsRes.json();
          const invoicesData = await invoicesRes.json();

          // حفظ الداتا القادمة من السيرفر مباشرة في الـ States المخصصة لها بدون تغيير أسامي
          if (Array.isArray(shiftsData)) setServerShifts(shiftsData);
          if (Array.isArray(invoicesData)) setServerInvoices(invoicesData);
        }
      } catch (err) {
        console.error("❌ خطأ أثناء جلب الشيفتات من قاعدة البيانات:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchShiftsAndInvoices();
  }, [fromDate, toDate]); // 👈 تتحدث فوراً لو اخترت تاريخ مختلف

  const shiftsWithData: ShiftReport[] = useMemo(() => {
    const mealsMap = new Map((db.meals || []).map((meal) => [meal.id, meal]));

    const shiftsMap = new Map();
    serverShifts.forEach((s) => shiftsMap.set(s.id, s));
    pos.shifts.forEach((s) => shiftsMap.set(s.id, s));
    const sourceShifts = Array.from(shiftsMap.values());

    const invoicesMap = new Map();
    serverInvoices.forEach((i) => invoicesMap.set(i.id, i));
    pos.invoices.forEach((i) => invoicesMap.set(i.id, i));
    const sourceInvoices = Array.from(invoicesMap.values());

    const sortedShifts = [...sourceShifts].sort(
      (a, b) => (b.closedAt || 0) - (a.closedAt || 0),
    );

    return sortedShifts.map((shift) => {
      const shiftInvoices = sourceInvoices.filter((inv) => {
        if (inv.createdAt < shift.openedAt) return false;
        if (shift.closedAt && inv.createdAt > shift.closedAt) return false;
        return true;
      });

      let kitchen = Number(shift.kitchenSales) || 0;
      let bar = Number(shift.barSales) || 0;
      let shisha = Number(shift.shishaSales) || 0;
      let takeawayOnly = Number(shift.takeawaySales) || 0;
      let deliveryOnly = Number(shift.deliverySales) || 0;
      let tax = Number(shift.taxValue || (shift as any).tax_value) || 0;
      let discount =
        Number(shift.discountValue || (shift as any).discount_value) || 0;

      let subtotal = kitchen + bar + shisha;

      // 🌟 متغيرات تتبع المنصات لكل شيفت بشكل منفصل
      let fastTotal = 0;
      let fastCount = 0;
      let fastCommission = 0;
      let talabatTotal = 0;
      let talabatCount = 0;
      let talabatCommission = 0;

      if (shiftInvoices.length > 0 && db.meals && db.meals.length > 0) {
        kitchen = 0;
        bar = 0;
        shisha = 0;
        takeawayOnly = 0;
        deliveryOnly = 0;
        let deliveryFeesOnly = 0;
        subtotal = 0;
        discount = 0;
        tax = 0;

        for (const inv of shiftInvoices) {
          subtotal += inv.subtotal;
          discount +=
            Number(inv.discountValue || (inv as any).discount_value) || 0;
          const invDiscount =
            Number(inv.discountValue || (inv as any).discount_value) || 0;
          const invTaxPct = Number(inv.taxPct || (inv as any).tax_pct) || 0;
          tax +=
            Number(inv.taxValue || (inv as any).tax_value) ||
            ((Number(inv.subtotal) - invDiscount) * invTaxPct) / 100 ||
            0;

          const deliveryFee = Number(inv.deliveryPrice) || 0;
          deliveryFeesOnly += deliveryFee;

          if (inv.type === "takeaway") {
            takeawayOnly += inv.total - deliveryFee;
          } else if (inv.type === "delivery") {
            deliveryOnly += inv.total - deliveryFee;
          }

          // 🌟 فرز وحساب منصات فاست وطلبات للشيفتات المجمعة لأرشيف التفاصيل
          const cat =
            inv.orderCategory || (inv as any).order_category || "normal";
          if (cat === "fast") {
            fastTotal += inv.total;
            fastCount++;
            fastCommission += Number(
              inv.commissionValue || (inv as any).commission_value || 0,
            );
          } else if (cat === "talabat") {
            talabatTotal += inv.total;
            talabatCount++;
            talabatCommission += Number(
              inv.commissionValue || (inv as any).commission_value || 0,
            );
          }

          for (const line of inv.items) {
            const meal = mealsMap.get(line.mealId);
            const extras =
              line.extras?.reduce(
                (s: any, e: any) => s + Number(e.price || 0),
                0,
              ) || 0;
            const v =
              (Number(line.unitPrice || line.price || 0) + extras) *
              Number(line.qty || 1);

            let deptName = line.department || "مطبخ";
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
      }
      let deliveryFeesOnly = 0; // 👈 التأكد من وجود المتغير

      // المعادلة النهائية المتناسقة
      const finalNetCash = kitchen + bar + shisha + tax - discount;
      for (const inv of shiftInvoices) {
        // ...
        const deliveryFee =
          Number(inv.deliveryPrice || (inv as any).delivery_price) || 0;
        deliveryFeesOnly += deliveryFee; // 👈 تجميع رسوم التوصيل لكل فواتير الشيفت
        // ...
      }
      return {
        shift,
        invoiceCount:
          shiftInvoices.length || Number((shift as any).invoice_count) || 0,
        kitchen: clamp0(kitchen),
        bar: clamp0(bar),
        shisha: clamp0(shisha),
        takeaway: clamp0(takeawayOnly),
        delivery: clamp0(deliveryOnly),
        deliveryFees: clamp0(
          deliveryFeesOnly || Number(shift.deliverySales) || 0,
        ),
        subtotal: clamp0(subtotal),
        discount: clamp0(discount),
        tax: clamp0(tax),
        total: clamp0(finalNetCash),
        revenues: clamp0(finalNetCash),
        // 🌟 إرسال البيانات المحدثة للمودال
        fastTotal: clamp0(fastTotal),
        fastCount,
        fastCommission: clamp0(fastCommission),
        talabatTotal: clamp0(talabatTotal),
        talabatCount,
        talabatCommission: clamp0(talabatCommission),
      };
    });
  }, [pos.shifts, serverShifts, pos.invoices, serverInvoices, db.meals]);

  // 🌟 دالة طباعة تقرير الشيفت المحدثة بالكامل (مطابقة للشاشة والتقارير)
  const printShiftReport = (shift: any, shiftInvoices: any[]) => {
    let totalDineIn = 0;
    let totalTakeaway = 0;
    let totalDelivery = 0;
    let totalStaff = 0;
    let totalHospitality = 0;

    let grossSales = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    let totalDeliveryFee = 0;

    let cashTotal = 0;
    let visaTotal = 0;

    let kitchenSales = 0;
    let barSales = 0;
    let shishaSales = 0;

    // 🌟 متغيرات المنصات المضافة حديثاً للطباعة
    let fastTotal = 0;
    let talabatTotal = 0;
    let talabatCommission = 0;

    shiftInvoices.forEach((inv) => {
      if (inv.type === "dinein" || inv.type === "dine-in")
        totalDineIn += Number(inv.total) || 0;
      else if (inv.type === "takeaway") totalTakeaway += Number(inv.total) || 0;
      else if (inv.type === "delivery") totalDelivery += Number(inv.total) || 0;
      else if (inv.type === "staff" || inv.type === "موظفين")
        totalStaff += Number(inv.total) || 0;
      else if (inv.type === "hospitality" || inv.type === "ضيافة")
        totalHospitality += Number(inv.total) || 0;

      grossSales += Number(inv.subtotal) || 0;
      const invDiscount =
        Number(inv.discountValue || (inv as any).discount_value) || 0;
      totalDiscount += invDiscount;

      const invTaxPct = Number(inv.taxPct || (inv as any).tax_pct) || 0;
      totalTax +=
        Number(inv.taxValue || (inv as any).tax_value) ||
        ((Number(inv.subtotal) - invDiscount) * invTaxPct) / 100 ||
        0;

      totalDeliveryFee +=
        Number(inv.deliveryPrice || (inv as any).delivery_price) || 0;

      // 🌟 تجميع حسابات فاست وطلبات جوه لوب الطباعة
      const cat = inv.orderCategory || (inv as any).order_category || "normal";
      if (cat === "fast") {
        fastTotal += Number(inv.total) || 0;
      } else if (cat === "talabat") {
        talabatTotal += Number(inv.total) || 0;
        talabatCommission += Number(
          inv.commissionValue || (inv as any).commission_value || 0,
        );
      }

      if (inv.paymentMethod === "visa" || inv.paymentMethod === "فيزا") {
        visaTotal += Number(inv.total) || 0;
      } else {
        cashTotal += Number(inv.total) || 0;
      }

      const itemsArray =
        typeof inv.items === "string" ? JSON.parse(inv.items) : inv.items || [];
      itemsArray.forEach((item: any) => {
        const extrasPrice =
          item.extras?.reduce(
            (s: number, e: any) => s + Number(e.price || 0),
            0,
          ) || 0;
        const lineTotal =
          (Number(item.unitPrice || item.price || 0) + extrasPrice) *
          Number(item.qty || 1);

        const meal = db.meals?.find((m: any) => m.id === item.mealId);
        let deptName = item.department || "مطبخ";
        if (meal) {
          const isShisha =
            meal.department === "شيشه" ||
            (meal.category || "").trim().replace("ة", "ه") === "شيشه";
          if (isShisha) deptName = "شيشة";
          else if (meal.department) deptName = meal.department;
        }

        if (deptName.includes("شيش")) shishaSales += lineTotal;
        else if (deptName.includes("بار")) barSales += lineTotal;
        else kitchenSales += lineTotal;
      });
    });

    // 🌟 المعادلة الموحدة والنهائية للتوتال الصافي تطابق شاشة الـ Reports تماماً
    const finalNetSales =
      kitchenSales +
      barSales +
      shishaSales +
      talabatCommission +
      totalTax -
      totalDiscount;

    const shiftOpenTime = shift.openedAt
      ? new Date(shift.openedAt).toLocaleString("ar-EG")
      : "غير محدد";
    const shiftCloseTime = shift.closedAt
      ? new Date(shift.closedAt).toLocaleString("ar-EG")
      : "ما زال مفتوحاً";
    const openingBalance =
      Number(shift.startingCash) || Number(shift.initialCash) || 0;
    const expectedDrawer = openingBalance + cashTotal;

    const printWindow = window.open("", "_blank", "width=600,height=800");
    if (!printWindow) {
      toast.error("يرجى السماح بالنوافذ المنبثقة (Pop-ups) للطباعة");
      return;
    }

    const htmlContent = `
      <html dir="rtl">
        <head>
          <title>تقرير الوردية</title>
          <style>
            @page { margin: 0; size: auto; }
            body { 
              font-family: 'Segoe UI', Tahoma, sans-serif; 
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
            h2 { text-align: center; margin: 0 0 10px 0; font-size: 18px; font-weight: bold; text-decoration: underline; }
            .header-box { border: 1.5px solid #000; padding: 6px; margin-bottom: 12px; font-size: 12px; font-weight: bold; }
            .header-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 13px; }
            th, td { border: 1.5px solid #000; padding: 5px; }
            td:first-child { width: 65%; font-weight: bold; }
            td:last-child { width: 35%; text-align: center; font-family: monospace; font-size: 14px;}
            .table-header { text-align: center !important; background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: bold; font-size: 14px; }
            .bold { font-weight: bold; }
            
            /* أمر القطع الخاص بالمتصفح والطابعة */
            @media print {
              .cut-paper {
                page-break-after: always;
              }
            }
          </style>
        </head>
        <body onload="setTimeout(() => { window.print(); window.close(); }, 500);">
          
          <h2>تقرير وردية</h2>
          
          <div class="header-box">
            <div class="header-row"><span>من:</span><span dir="ltr">${shiftOpenTime}</span></div>
            <div class="header-row"><span>إلى:</span><span dir="ltr">${shiftCloseTime}</span></div>
            <div class="header-row"><span>الكاشير:</span><span>${shift.cashierName || shift.cashier_name || "غير معروف"}</span></div> 
          </div>
            
          <table>
            <tr><td colspan="2" class="table-header">إيرادات الأقسام</td></tr>
            <tr><td>إجمالي المطبخ</td><td class="bold">${kitchenSales.toFixed(2)}</td></tr>
            <tr><td>إجمالي البار</td><td class="bold">${barSales.toFixed(2)}</td></tr>
            <tr><td>إجمالي الشيشة</td><td class="bold">${shishaSales.toFixed(2)}</td></tr>
          </table>
            
          <table>
            <tr><td colspan="2" class="table-header">توزيع الطلبات والمنصات</td></tr>
            <tr><td>التيك أواي</td><td class="bold">${totalTakeaway.toFixed(2)}</td></tr>
            <tr><td>الدليفري</td><td class="bold">${totalDelivery.toFixed(2)}</td></tr>
            <tr><td>Fast</td><td class="bold">${fastTotal.toFixed(2)}</td></tr>
            <tr><td>Talabat</td><td class="bold">${talabatTotal.toFixed(2)}</td></tr>
            ${totalHospitality > 0 ? `<tr><td>ضيافة</td><td class="bold">${totalHospitality.toFixed(2)}</td></tr>` : ""}
            ${totalStaff > 0 ? `<tr><td>وجبات موظفين</td><td class="bold">${totalStaff.toFixed(2)}</td></tr>` : ""}
            <tr><td>رسوم التوصيل</td><td class="bold">${totalDeliveryFee.toFixed(2)}</td></tr>
          </table>
            
          <table>
            <tr><td colspan="2" class="table-header">المجموع النهائي</td></tr>
            <tr><td>إجمالي الضريبة</td><td class="bold">${totalTax.toFixed(2)}</td></tr>
            <tr><td>إجمالي الخصم</td><td class="bold">${totalDiscount.toFixed(2)}</td></tr>
            <tr><td>نسبة طالبات</td><td class="bold">${talabatCommission.toFixed(2)}</td></tr>
            <tr style="background:#eee; -webkit-print-color-adjust: exact;"><td>الإيرادات الصافية (شاملة النسبة)</td><td class="bold">${finalNetSales.toFixed(2)}</td></tr>
          </table>

          <table>
            <tr><td colspan="2" class="table-header">طرق الدفع</td></tr>
            <tr><td>كاش (نقدي)</td><td class="bold">${cashTotal.toFixed(2)}</td></tr>
            <tr><td>فيزا / بطاقة</td><td class="bold">${visaTotal.toFixed(2)}</td></tr>
          </table>

          <table>
            <tr style="background:#000; color:#fff; -webkit-print-color-adjust: exact;"><td>الرصيد المتوقع بالدرج</td><td class="bold">${expectedDrawer.toFixed(2)}</td></tr>
          </table>

          <!-- أمر القطع في نهاية التقرير -->
          <div class="cut-paper"></div>

        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-3">
      {/* 🌟 فلاتر التاريخ (من - إلى) للشيفتات */}
      <div className="flex flex-wrap items-center gap-3 bg-secondary/30 p-2 rounded-xl border border-border w-fit">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-primary">من تاريخ:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 text-sm font-bold rounded-md bg-background border border-input px-2 cursor-pointer text-emerald-700"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-primary">إلى تاريخ:</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 text-sm font-bold rounded-md bg-background border border-input px-2 cursor-pointer text-emerald-700"
          />
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs">
            <tr>
              <th className="text-right p-3">تاريخ ووقت الشيفت</th>
              <th className="text-right p-3">الكاشير</th>
              <th className="text-right p-3">عدد الفواتير</th>
              <th className="text-right p-3">التوتال النهائي (Net Cash)</th>
              <th className="text-right p-3">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              /* ⏳ مؤشر تحميل من السيرفر */
              <tr>
                <td
                  colSpan={5}
                  className="p-8 text-center text-amber-600 font-medium animate-pulse"
                >
                  جاري استرجاع الورديات والتقارير من السيرفر (pgAdmin)...
                </td>
              </tr>
            ) : shiftsWithData.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="p-8 text-center text-muted-foreground"
                >
                  لا توجد شيفتات مسجلة.
                </td>
              </tr>
            ) : (
              shiftsWithData.map((report, idx) => (
                <tr key={idx} className="border-t border-border">
                  <td className="p-3 text-xs">
                    <div>
                      {new Date(Number(report.shift.openedAt)).toLocaleString(
                        "ar-EG",
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      إلى:{" "}
                      {report.shift.closedAt
                        ? new Date(
                            Number(report.shift.closedAt),
                          ).toLocaleTimeString("ar-EG")
                        : "الآن"}
                    </div>
                  </td>
                  <td className="p-3 font-medium">
                    {report.shift.cashierName ||
                      report.shift.cashier_name ||
                      "Unkonwn يا يوسف"}
                  </td>
                  <td className="p-3">{report.invoiceCount}</td>
                  <td className="p-3 font-bold text-emerald-600">
                    {fmt2(report.total)} ج.م
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailShift(report)}
                      >
                        <Info className="w-3 h-3" />
                        <span className="mr-1">التفاصيل</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // 🌟 تجميع فواتير الشيفت ده مخصوص عشان نبعتها لدالة الطباعة الجديدة
                          const sourceInvoices =
                            pos.invoices.length > 0
                              ? pos.invoices
                              : serverInvoices;
                          const shiftInvoices = sourceInvoices.filter((inv) => {
                            if (inv.createdAt < report.shift.openedAt)
                              return false;
                            if (
                              report.shift.closedAt &&
                              inv.createdAt > report.shift.closedAt
                            )
                              return false;
                            return true;
                          });

                          // 🌟 نداء الدالة باسمها الجديد (printShiftReport) وبِعَتْنَالها الشيفت وفواتيره
                          printShiftReport(report.shift, shiftInvoices);
                        }}
                      >
                        <Printer className="w-3 h-3" />
                        <span className="mr-1">طباعة</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detailShift && (
        <Dialog open onOpenChange={() => setDetailShift(null)}>
          <DialogContent
            dir="rtl"
            className="max-w-5xl p-6 overflow-y-auto max-h-[90vh]"
          >
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 border-b pb-3 text-primary">
                <Clock className="w-5 h-5 text-emerald-600" />
                <span>
                  تقرير تفاصيل وردية الكاشير: ({detailShift.shift.cashierName})
                </span>
              </DialogTitle>
            </DialogHeader>

            {/* 📅 الميتا داتا الخاصة بالوردية */}
            <div className="bg-secondary/40 rounded-xl p-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-4 border border-border">
              <div>
                <span className="font-semibold text-muted-foreground">
                  تاريخ ووقت الفتح:{" "}
                </span>
                <span className="font-mono text-foreground">
                  {new Date(Number(detailShift.shift.openedAt)).toLocaleString(
                    "ar-EG",
                  )}
                </span>
              </div>
              <div>
                <span className="font-semibold text-muted-foreground">
                  تاريخ ووقت الإغلاق:{" "}
                </span>
                <span className="font-mono text-foreground">
                  {detailShift.shift.closedAt
                    ? new Date(
                        Number(detailShift.shift.closedAt),
                      ).toLocaleString("ar-EG")
                    : "لا يزال مفتوحاً الأن"}
                </span>
              </div>
            </div>

            {/* 📊 شبكة الكروت الإحصائية الموحدة وشاملة المنصات والعمولة */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card
                icon={ChefHat}
                label="المطبخ"
                value={detailShift.kitchen}
                accent="orange"
              />
              <Card
                icon={Wine}
                label="البار"
                value={detailShift.bar}
                accent="rose"
              />
              <Card
                icon={Cloud}
                label="الشيشة"
                value={detailShift.shisha}
                accent="purple"
              />

              {/* 🌟 إضافة كروت المنصات والنسبة بالجنيه بشكل مطابق تماماً لصفحة التقرير */}
              <CardWithCommission
                icon={Receipt}
                label="فاست"
                value={detailShift.fastTotal}
                commission={detailShift.fastCommission}
                count={detailShift.fastCount}
                accent="amber"
              />
              <CardWithCommission
                icon={ShoppingBag}
                label="طلبات"
                value={detailShift.talabatTotal}
                commission={detailShift.talabatCommission}
                count={detailShift.talabatCount}
                accent="orange"
              />

              <Card
                icon={ShoppingBag}
                label="التيك أواي"
                value={detailShift.takeaway}
                accent="sky"
              />
              <Card
                icon={Bike}
                label="أوردر التوصيل"
                value={detailShift.delivery}
                accent="amber"
              />
              <Card
                icon={DollarSign}
                label="رسوم التوصيل"
                value={detailShift.deliveryFees}
                accent="emerald"
              />

              <Card
                icon={DollarSign}
                label="الإيرادات الأساسية"
                value={detailShift.subtotal}
                accent="slate"
              />
              <Card
                icon={Minus}
                label="الخصم"
                value={detailShift.discount}
                accent="rose"
              />
              <Card
                icon={Percent}
                label="القيمة المضافة (14%)"
                value={detailShift.tax}
                accent="indigo"
              />
              <Card
                icon={Receipt}
                label="الايرادات الكليمه"
                value={
                  detailShift.subtotal +
                  detailShift.tax +
                  detailShift.deliveryFees
                }
                accent="slate"
              />
            </div>

            {/* 💰 الشريط السفلي العريض للتوتال النهائي الصافي (Net Cash) */}
            <div className="mt-5 bg-emerald-600 text-white rounded-xl p-4 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-white/20 grid place-items-center">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-emerald-100">
                    التوتال النهائي (Net Cash in Drawer)
                  </p>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    عدد الفواتير المسجلة: {detailShift.invoiceCount} فاتورة
                  </p>
                </div>
              </div>
              <div className="text-left">
                <p className="text-2xl font-black">
                  {fmt2(detailShift.total)}{" "}
                  <span className="text-xs font-normal text-emerald-100">
                    ج.م
                  </span>
                </p>
              </div>
            </div>

            <DialogFooter className="mt-4 border-t pt-3 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDetailShift(null)}>
                إغلاق النافذة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: number;
  accent: string;
}) {
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
    <div className="bg-card border border-border rounded-xl p-4">
      <div
        className={`w-10 h-10 rounded-lg grid place-items-center ${colors[accent]}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xs text-muted-foreground mt-2">{label}</p>
      <p className="text-xl font-bold mt-1">
        {fmt2(value)}{" "}
        <span className="text-xs font-normal text-muted-foreground">ج.م</span>
      </p>
    </div>
  );
}
// 🌟 الكومبوننت المساعد لعرض كروت فاست وطلبات شاملة النسبة المضافة بالجنيه
function CardWithCommission({
  icon: Icon,
  label,
  value,
  commission,
  count,
  accent,
}: {
  icon: any;
  label: string;
  value: number;
  commission: number;
  count: number;
  accent: string;
}) {
  const colors: Record<string, string> = {
    orange: "bg-orange-50 text-orange-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="bg-card border rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
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
