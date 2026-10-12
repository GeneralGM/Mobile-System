/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================
// Shared Invoice Print Template - Optimized
// ============================================================

export function buildInvoiceHtml(
  data: any,
  options?: {
    includeKitchenBon?: boolean;
  },
) {
  const includeKitchenBon = options?.includeKitchenBon ?? false;

  // ==========================================================
  // 1) Basic values
  // ==========================================================

  const commVal =
    Number(data.commissionValue) || Number(data.commission_value) || 0;

  const dPrice = Number(data.deliveryPrice) || Number(data.delivery_price) || 0;

  const finalDiscVal =
    Number(data.discountValue) || Number(data.discount_value) || 0;

  const finalTaxVal = Number(data.taxValue) || Number(data.tax_value) || 0;

  const subtotal = Number(data.subtotal || 0);

  const discountPct =
    Number(data.discountPct) || Number(data.discount_pct) || 0;

  const taxPct = Number(data.taxPct) || Number(data.tax_pct) || 0;

  const computedTotal =
    Number(data.total) ||
    subtotal - finalDiscVal + finalTaxVal + dPrice + commVal;

  // ==========================================================
  // 2) Invoice / order number
  // ==========================================================

  const invoiceNumber = data.invoiceNumber || data.invoice_number || "000000";

  const takeawayDailyNumber =
    data.takeawayDailyNumber ?? data.takeaway_daily_number ?? null;

  const displayOrderNumber =
    data.type === "takeaway" || data.type === "delivery"
      ? (takeawayDailyNumber ?? "-")
      : invoiceNumber;

  // ==========================================================
  // 3) Order type
  // ==========================================================

  const orderTypeArabic =
    data.type === "delivery"
      ? "توصيل 🛵"
      : data.type === "takeaway"
        ? "تيك أواي 🛍️"
        : "صالة 🍽️";

  // ==========================================================
  // 4) Date / time
  // ==========================================================

  const createdAt =
    data.createdAt ||
    (data.created_at ? new Date(data.created_at).getTime() : Date.now());

  const dateObj = new Date(createdAt);

  const formattedDate = dateObj.toLocaleDateString("en-GB");

  const formattedTime = dateObj.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // ==========================================================
  // 5) Customer
  // ==========================================================

  const custName = data.customerName || data.customer_name || "";

  const custPhone =
    data.customerPhone || data.customer_phone || data.phone || "";

  const custAddress = data.customerAddress || data.customer_address || "";

  // ==========================================================
  // 6) Cashier / table
  // ==========================================================

  const tableName =
    data.tableCode ||
    data.table_code ||
    data.table_name ||
    data.customerName ||
    "..........";

  const cashierName = data.cashierName || data.cashier_name || "..........";

  const captainName =
    data.captainName || data.captain_name || data.captain || "—";

  // ==========================================================
  // 7) Items
  // ==========================================================

  const itemsArray =
    typeof data.items === "string" ? JSON.parse(data.items) : data.items || [];

  // ==========================================================
  // 8) Build receipt items once
  // ==========================================================

  const itemsHtml = itemsArray
    .map(
      (line: {
        extras?: any[];
        mealName?: any;
        name?: any;
        unitPrice?: any;
        price?: any;
        qty?: any;
        notes?: string;
      }) => {
        const extras = Array.isArray(line.extras) ? line.extras : [];

        const extraNames = extras.length
          ? extras
              .map((e: { name?: any; label?: any }) => e.name || e.label || "")
              .filter(Boolean)
              .join(", ")
          : "";

        const displayName = line.mealName || line.name || "صنف غير معروف";

        const basePrice = Number(line.unitPrice ?? line.price ?? 0) || 0;

        const extrasPrice = extras.reduce(
          (sum: number, e: { price?: any }) => sum + Number(e.price || 0),
          0,
        );

        const singlePrice = basePrice + extrasPrice;

        const qty = Number(line.qty || 1) || 1;

        const lineTotal = singlePrice * qty;

        const extrasHtml = extraNames
          ? `
              <span class="item-extras">
                (+ ${extraNames})
              </span>
            `
          : "";

        const notesText = line.notes && String(line.notes).trim();

        const notesHtml = notesText
          ? `
              <span class="item-notes">
                ${notesText}
              </span>
            `
          : "";

        return `
          <tr>
            <td class="cell-total">
              ${lineTotal.toFixed(0)}
            </td>

            <td class="cell-price">
              ${singlePrice.toFixed(0)}
            </td>

            <td class="cell-qty">
              ${line.qty ?? 0}
            </td>

            <td class="cell-name">
              ${displayName}
              ${extrasHtml}
              ${notesHtml}
            </td>
          </tr>
        `;
      },
    )
    .join("");

  // ==========================================================
  // 9) Customer block
  // ==========================================================

  const customerHtml =
    custName || custAddress || custPhone
      ? `
        <div class="customer-box">

          ${
            custName || custPhone
              ? `
                <div class="customer-row">

                  <strong class="customer-label">
                    العميل:
                  </strong>

                  <span class="customer-value">
                    ${custName}
                  </span>

                  ${
                    custPhone
                      ? `
                        <span
                          class="customer-phone"
                          dir="ltr"
                        >
                          ${custPhone}
                        </span>
                      `
                      : ""
                  }

                </div>
              `
              : ""
          }

          ${
            custAddress
              ? `
                <div class="customer-row">
                  <strong class="customer-label">
                    العنوان:
                  </strong>

                  <span class="customer-address">
                    ${custAddress}
                  </span>
                </div>
              `
              : ""
          }

        </div>
      `
      : "";

  // ==========================================================
  // 10) Info blocks
  // ==========================================================

  const shortTableName =
    String(tableName).length > 8
      ? String(tableName).substring(0, 3) + "..."
      : String(tableName);

  const infoHtml = `
    <div class="info-grid">

      ${
        data.type === "takeaway" || data.type === "delivery"
          ? `
            <div class="info-item">
              <div class="info-label">
                الرقم
              </div>

              <div class="info-value">
                ${displayOrderNumber}
              </div>
            </div>
          `
          : `
            <div class="info-item">
              <div class="info-label">
                التاريخ
              </div>

              <div class="info-value">
                ${formattedDate}
              </div>
            </div>
          `
      }

      <div class="info-item">
        <div class="info-label">
          الوقت
        </div>

        <div class="info-value">
          ${formattedTime}
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">
          الطاولة
        </div>

        <div class="info-value-bold">
          ${shortTableName}
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">
          اسم الكاشير
        </div>

        <div class="info-value-bold">
          ${cashierName}
        </div>
      </div>

      ${
        data.type === "dinein"
          ? `
            <div class="info-item">
              <div class="info-label">
                اسم الكابتن
              </div>

              <div class="info-value-bold">
                ${captainName}
              </div>
            </div>
          `
          : ""
      }

    </div>
  `;

  // ==========================================================
  // 11) Platform
  // ==========================================================

  const platformHtml =
    (data.type === "takeaway" || data.type === "delivery") &&
    data.orderCategory &&
    data.orderCategory !== "normal"
      ? `
        <div class="platform-banner">
          منصة التوصيل:
          <span>
            ${
              data.orderCategory === "talabat"
                ? "طلبات (Talabat)"
                : data.orderCategory === "fast"
                  ? "فاست (Fast)"
                  : data.orderCategory
            }
          </span>
        </div>
      `
      : "";

  // ==========================================================
  // 12) Kitchen bon CSS - included ONLY when needed
  // ==========================================================

  const kitchenCss = includeKitchenBon
    ? `
      .cut-paper {
        break-after: page;
        page-break-after: always;
      }

      .kitchen-bon {
        margin-top: 2px;
        padding-top: 2px;
      }

      .kb-scissors-row {
        text-align: center;
        font-size: 0.7rem;
        letter-spacing: 3px;
        margin-bottom: 6px;
      }

      .kitchen-bon-header {
        text-align: center;
        margin-bottom: 8px;
      }

      .kitchen-bon-eyebrow {
        font-size: 0.62rem;
        font-weight: 900;
        letter-spacing: 2px;
        margin-bottom: 3px;
      }

      .kitchen-bon-title {
        display: inline-block;
        font-size: 1.15rem;
        font-weight: 900;
        border: 2px solid #000;
        border-radius: 6px;
        padding: 4px 22px;
      }

      .kitchen-bon-title::before,
      .kitchen-bon-title::after {
        content: "★";
        font-size: 0.65rem;
        margin: 0 6px;
        vertical-align: middle;
      }

      .kb-invoice-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-top: 8px;
      }

      .kb-inv-label {
        font-size: 0.68rem;
        font-weight: 900;
      }

      .kb-inv-number {
        font-size: 1rem;
        font-weight: 900;
        color: #fff;
        background: #000;
        border-radius: 4px;
        padding: 2px 12px;
        letter-spacing: 1px;
      }

      .kitchen-bon-meta {
        display: flex;
        justify-content: space-between;
        font-size: 0.7rem;
        font-weight: bold;
        margin-top: 7px;
        padding: 3px 4px 0;
        border-top: 1px dashed #000;
      }

      .kitchen-bon-meta span {
        display: flex;
        align-items: center;
        gap: 3px;
      }

      .kitchen-items-table {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        text-align: center;
        font-size: 0.8rem;
        margin-top: 8px;
      }

      .kitchen-items-table thead tr {
        border-bottom: 2px solid #000;
      }

      .kitchen-items-table th {
        font-weight: 900;
        padding: 4px 0;
        font-size: 0.8rem;
      }

      .kb-col-qty {
        width: 25%;
      }

      .kb-col-name {
        width: 75%;
      }

      .kitchen-items-table tbody tr {
        border-bottom: 1px dashed #000;
      }

      .kitchen-items-table td {
        padding: 5px 0;
        text-align: center;
        font-weight: bold;
      }

      .kb-cell-qty {
        font-weight: 900;
        white-space: nowrap;
      }

      .kb-cell-name {
        font-weight: 900;
        overflow-wrap: anywhere;
      }

      .kb-item-extras {
        display: block;
        font-size: 0.65rem;
        font-weight: bold;
        margin-top: 1px;
      }

      .kitchen-bon-footer {
        text-align: center;
        margin-top: 10px;
        padding-top: 6px;
      }

      .kb-footer-line {
        border-top: 1px dashed #000;
        margin-bottom: 6px;
      }

      .kb-footer-message {
        font-size: 0.78rem;
        font-weight: 900;
      }

      .kb-footer-sub {
        font-size: 0.62rem;
        font-weight: bold;
        margin-top: 2px;
        letter-spacing: 0.5px;
      }
    `
    : "";

  // ==========================================================
  // 13) Kitchen bon HTML - built ONLY when needed
  // ==========================================================

  const kitchenItemsHtml = includeKitchenBon
    ? itemsArray
        .map(
          (line: { extras?: any[]; mealName?: any; name?: any; qty?: any }) => {
            const extras = Array.isArray(line.extras) ? line.extras : [];

            const extraNames = extras.length
              ? extras
                  .map(
                    (e: { name?: any; label?: any }) => e.name || e.label || "",
                  )
                  .filter(Boolean)
                  .join(", ")
              : "";

            const displayName = line.mealName || line.name || "صنف غير معروف";

            return `
              <tr>
                <td class="kb-cell-qty">
                  ${line.qty ?? 0}
                </td>

                <td class="kb-cell-name">
                  ${displayName}

                  ${
                    extraNames
                      ? `
                        <span class="kb-item-extras">
                          (+ ${extraNames})
                        </span>
                      `
                      : ""
                  }
                </td>
              </tr>
            `;
          },
        )
        .join("")
    : "";

  const kitchenBonHtml = includeKitchenBon
    ? `
      <div class="cut-paper"></div>

      <div class="kitchen-bon">

        <div class="kb-scissors-row">
          ✂ - - - - - - - - - - - - - - - - - - - - - - - - -
        </div>

        <div class="kitchen-bon-header">

          <div class="kitchen-bon-eyebrow">
            Zayed Mall
          </div>

          <h2 class="kitchen-bon-title">
            بون طلب
          </h2>

          <div class="kb-invoice-badge">

            <span class="kb-inv-label">
              رقم الفاتورة
            </span>

            <span class="kb-inv-number">
              #${displayOrderNumber}
            </span>

          </div>

          <div class="kitchen-bon-meta">

            <span>
              🕒 ${formattedTime}
            </span>

            <span>
              ${orderTypeArabic}
            </span>

          </div>

        </div>

        <table class="kitchen-items-table">

          <thead>
            <tr>
              <th class="kb-col-qty">
                الكمية
              </th>

              <th class="kb-col-name">
                الصنف
              </th>
            </tr>
          </thead>

          <tbody>
            ${kitchenItemsHtml}
          </tbody>

        </table>

        <div class="kitchen-bon-footer">

          <div class="kb-footer-line"></div>

          <div class="kb-footer-message">
            بالهنا والشفا 🍽️
          </div>

          <div class="kb-footer-sub">
            Powered by BMO-TEC Systems
          </div>

        </div>

      </div>
    `
    : "";

  // ==========================================================
  // 14) Final HTML
  // ==========================================================

  return `
<!doctype html>
<html lang="ar" dir="rtl">

<head>

  <meta charset="UTF-8">

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
      margin: 0;
      padding: 0;
    }

    body {
      background: #fff;
      direction: rtl;
      font-family: Arial, sans-serif;
      color: #000;
    }

    h2 {
      margin: 0;
    }

    img {
      display: block;
    }

    .receipt-container {
      width: 72mm;
      margin: 0;
      padding: 3px 2mm;
      overflow: hidden;
      background: #fff;
    }

    .separator-line {
      border-top: 1px dashed #000;
      margin: 3px 0;
    }

    .separator-solid {
      border-top: 2px solid #000;
      margin: 5px 0;
    }

    /* Header */

    .header-section {
      margin-bottom: 0.2rem;
      text-align: center;
    }

    .logo {
      width: 52px;
      height: 52px;
      margin: 0 auto;
    }

    .shop-name {
      font-size: 1.35rem;
      line-height: 1;
      font-weight: 900;
      margin-bottom: 0.08rem;
    }

    /* Order type */

    .order-type-wrapper {
      text-align: center;
      margin-bottom: 0.2rem;
    }

    .order-type-title {
      display: inline-block;
      font-size: 0.92rem;
      line-height: 1.1;
      font-weight: 900;
      border: 1.5px solid #000;
      padding: 2px 5px;
      border-radius: 4px;
    }

    /* Customer */

    .customer-box {
      width: 100%;
      margin-bottom: 4px;
      padding: 4px 5px;
      border: 1px solid #000;
      border-radius: 5px;
      text-align: right;
      font-size: 0.82rem;
      line-height: 1.3;
      font-weight: bold;
      overflow: hidden;
    }

    .customer-row {
      margin-bottom: 2px;
      overflow-wrap: anywhere;
    }

    .customer-label {
      font-size: 0.79rem;
      font-weight: 900;
      margin-left: 2px;
    }

    .customer-value {
      font-size: 0.82rem;
      font-weight: 900;
    }

    .customer-phone {
      font-size: 0.8rem;
      font-weight: 900;
      margin-right: 4px;
      white-space: nowrap;
    }

    .customer-address {
      font-size: 0.8rem;
      font-weight: 900;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    /* Info */

    .info-grid {
      width: 100%;
      display: flex;
      flex-wrap: wrap;
      margin-bottom: 0.2rem;
      text-align: center;
      font-size: 0.72rem;
    }

    .info-item {
      width: 50%;
      padding: 1px;
    }

    .info-label {
      font-size: 0.65rem;
      font-weight: bold;
      margin-bottom: 0.02rem;
    }

    .info-value {
      font-size: 0.74rem;
      font-weight: 900;
      line-height: 1.05;
    }

    .info-value-bold {
      font-size: 0.74rem;
      font-weight: 900;
      line-height: 1.05;
      border-bottom: 1px solid #000;
      padding-bottom: 0.01rem;
      overflow-wrap: anywhere;
    }

    /* Platform */

    .platform-banner {
      border: 1.5px solid #000;
      border-radius: 4px;
      padding: 2px 4px;
      text-align: center;
      font-size: 0.74rem;
      line-height: 1.1;
      font-weight: 900;
      margin-bottom: 0.2rem;
    }

    /* Items */

    .items-wrapper {
      width: 100%;
      margin-bottom: 0.2rem;
      overflow: hidden;
    }

    .items-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border-spacing: 0;
      text-align: center;
      font-size: 0.76rem;
      margin-bottom: 0.05rem;
    }

    .items-table thead tr {
      border-bottom: 2px solid #000;
    }

    .items-table th {
      font-weight: 900;
      padding: 2px 0;
      font-size: 0.74rem;
      line-height: 1.05;
      text-align: center;
    }

    .items-table tbody tr {
      border-bottom: 1px dashed #000;
    }

    .items-table td {
      padding: 3px 1px;
      text-align: center;
      font-weight: bold;
      line-height: 1.1;
      vertical-align: top;
      overflow-wrap: anywhere;
    }

    .col-total {
      width: 21%;
    }

    .col-price {
      width: 19%;
    }

    .col-qty {
      width: 13%;
    }

    .col-name {
      width: 47%;
    }

    .cell-total {
      font-size: 0.76rem;
      font-weight: 900;
      white-space: nowrap;
    }

    .cell-price {
      font-size: 0.74rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .cell-qty {
      font-size: 0.78rem;
      font-weight: 900;
      white-space: nowrap;
    }

    .cell-name {
      font-size: 0.78rem;
      font-weight: 900;
      text-align: center;
      line-height: 1.18;
      padding: 0 2px;
    }

    .item-extras {
      display: block;
      margin-top: 1px;
      font-size: 0.68rem;
      line-height: 1.12;
      font-weight: bold;
    }

    .item-notes {
      display: block;
      margin-top: 1px;
      font-size: 0.7rem;
      line-height: 1.12;
      font-weight: 900;
    }

    /* Totals */

    .totals-section {
      width: 100%;
      margin-bottom: 0.2rem;
      font-size: 0.79rem;
      line-height: 1.1;
      font-weight: bold;
    }

    .totals-section > div + div {
      margin-top: 2px;
    }

    .totals-row {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }

    .grand-total {
      font-size: 1rem;
      line-height: 1.1;
      font-weight: 900;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 4px 0;
      margin-top: 4px;
    }

    /* Contact */

    .contact-section {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 4px;
      margin-bottom: 0.2rem;
      text-align: center;
      font-size: 0.72rem;
    }

    .contact-title {
      font-size: 0.72rem;
      font-weight: 900;
    }

    .contact-list {
      line-height: 1.1;
    }

    .phone-number {
      font-size: 0.72rem;
      text-align: left;
      font-weight: bold;
      white-space: nowrap;
    }

    /* Footer */

    .footer-section {
      border-top: 1.5px dashed #000;
      margin-top: 4px;
      padding-top: 4px;
      font-size: 9px;
      line-height: 1.15;
      font-weight: bold;
      text-align: center;
    }

    .footer-brand {
      font-weight: 900;
      font-family: Arial, sans-serif;
      letter-spacing: 0.5px;
    }

    .footer-brand-badge {
      font-weight: 900;
      border: 1.5px solid #000;
      padding: 0 3px;
      border-radius: 2px;
    }

    .footer-whatsapp {
      margin-top: 2px;
    }

    ${kitchenCss}

  </style>

</head>

<body>

  <div class="receipt-container">

    <div class="header-section">
      <img
        src="/Inv_logo.png"
        alt="Logo"
        class="logo"
        width="52"
        height="52"
      >

      <div class="shop-name">
        Zayed Mall
      </div>
    </div>

    <div class="separator-solid"></div>

    <div class="order-type-wrapper">
      <h2 class="order-type-title">
        ${orderTypeArabic}
      </h2>
    </div>

    ${customerHtml}

    ${infoHtml}

    ${platformHtml}

    <div class="separator-line"></div>

    <div class="items-wrapper">

      <table class="items-table">

        <thead>
          <tr>
            <th class="col-total">
              الإجمالي
            </th>

            <th class="col-price">
              السعر
            </th>

            <th class="col-qty">
              الكمية
            </th>

            <th class="col-name">
              الصنف
            </th>
          </tr>
        </thead>

        <tbody>
          ${itemsHtml}
        </tbody>

      </table>

    </div>

    <div class="separator-solid"></div>

    <div class="totals-section">

      <div class="totals-row">
        <span>
          المجموع الأصلي:
        </span>

        <span>
          ${subtotal.toFixed(2)}
        </span>
      </div>

      ${
        finalDiscVal > 0
          ? `
            <div class="totals-row">
              <span>
                الخصم (${discountPct}%):
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
            <div class="totals-row">
              <span>
                الخدمة(${taxPct}%):
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
            <div class="totals-row">
              <span>
                منصة (
                ${data.orderCategory === "talabat" ? "طلبات" : "فاست"}
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
            <div class="totals-row">
              <span>
                خدمة التوصيل:
              </span>

              <span>
                +${dPrice.toFixed(2)}
              </span>
            </div>
          `
          : ""
      }

      <div class="totals-row grand-total">

        <span>
          الإجمالي الكلي:
        </span>

        <span>
          ${computedTotal.toFixed(2)}
        </span>

      </div>

    </div>

    <div class="contact-section">

      <div class="contact-title">
        أرقام التواصل
      </div>

      <div
        class="contact-list"
        dir="ltr"
      >

        <div class="phone-number">
          +20 103 554 4179
        </div>

        <div class="phone-number">
          +20 101 450 4046
        </div>

      </div>

    </div>

    <div class="footer-section">

      <div class="footer-brand">
        Powered by
        <span class="footer-brand-badge">
          BMO-TEC
        </span>
        Systems
      </div>

      <div
        class="footer-whatsapp"
        dir="ltr"
      >
        WhatsApp:
        <span>
          01553610767
        </span>
      </div>

    </div>

  </div>

  ${kitchenBonHtml}

  <script>
    window.onload = function () {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.print();
          window.close();
        });
      });
    };
  </script>

</body>

</html>
`;
}
