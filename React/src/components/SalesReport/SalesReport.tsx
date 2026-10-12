/* eslint-disable prettier/prettier */
type PrintSaleItem = {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
};

type PrintSalesOptions = {
  title?: string;
  department?: string;
  fromDate: string;
  toDate: string;
  items: PrintSaleItem[];
};


export function printThermalSales({
  title = "تقرير مبيعات",
  department,
  fromDate,
  toDate,
  items,
}: PrintSalesOptions) {
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const totalSales = items.reduce((sum, item) => sum + item.total, 0);

  const rows = items
    .map(
      (item, index) => `
        <tr>
          <td class="idx">${index + 1}</td>
          <td class="name">${(item.name)}</td>
          <td class="qty">${(item.qty)}</td>
          <td class="unit">${(item.unitPrice)}</td>
          <td class="total">${(item.total)}</td>
        </tr>
      `,
    )
    .join("");

  const html = `
  <!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>معاينة التقرير</title>
<style>
  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #555; /* لون خلفية للمعاينة فقط */
  }

  body {
    /* خطوط السيستم الأساسية عشان تضمن القراءة الواضحة */
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, Tahoma, sans-serif;
    color: #000; /* أسود صريح للحراري */
    font-size: 11.5px;
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
    font-variant-numeric: tabular-nums;
    display: flex;
    justify-content: center;
    padding: 20px;
  }

  /* مقاس 80mm هو القياسي والأشيك للطابعات الحرارية */
  .receipt {
    width: 75mm; 
    padding: 5mm;
    background: #fff;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  }

  /* ===== الرأس ===== */
  .header { 
    text-align: center; 
    margin-bottom: 4mm; 
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* أيقونة شيك (ممكن تبدلها بلوجو حقيقي مستقبلاً) */
  .logo-icon {
    width: 35px;
    height: 35px;
    background: #000;
    color: #fff;
    border-radius: 8px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 2mm;
  }
  .logo-icon svg { width: 20px; height: 20px; fill: currentColor; }

  .title-wrapper {
    background: #000;
    color: #fff;
    padding: 1mm 6mm;
    border-radius: 4px;
    margin-bottom: 2mm;
  }

  .title {
    font-size: 16px;
    font-weight: 900;
    letter-spacing: 0.5px;
    margin: 0;
  }

  /* ===== معلومات التقرير ===== */
  .meta-box {
    border: 1.5px solid #000;
    border-radius: 4px;
    padding: 2mm;
    margin-bottom: 3mm;
    text-align: right;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1mm;
  }
  .meta-row:last-child { margin-bottom: 0; }
  
  .meta-label { font-weight: 900; font-size: 10px; }
  .meta-value { font-weight: 700; font-size: 11px; }

  /* ===== جدول الأصناف ===== */
  table.items {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-bottom: 3mm;
  }

  /* هيدر الجدول بلون أسود قوي يعطي فخامة */
  table.items thead th {
    background-color: #000;
    color: #fff;
    font-size: 10px;
    font-weight: 900;
    text-align: center;
    padding: 1.5mm 1mm;
    border: 1px solid #000;
  }

  table.items thead th.name { text-align: right; }

  table.items col.col-idx    { width: 6mm; }
  table.items col.col-name   { width: auto; }
  table.items col.col-qty    { width: 10mm; }
  table.items col.col-unit   { width: 13mm; }
  table.items col.col-total  { width: 15mm; }

  table.items tbody td {
    font-size: 11px;
    font-weight: 700;
    padding: 2mm 1mm;
    border-bottom: 1px solid #000; /* خط أسود صريح بدل المنقط الضعيف */
    vertical-align: middle;
  }

  table.items tbody tr { break-inside: avoid; page-break-inside: avoid; }

  table.items td.idx { text-align: center; font-weight: 900; font-size: 9px; }
  
  table.items td.name {
    text-align: right;
    font-weight: 900;
    font-size: 11px;
    white-space: normal;
    word-break: break-word;
  }

  table.items td.qty   { text-align: center; white-space: nowrap; font-weight: 900; }
  table.items td.unit  { text-align: center; white-space: nowrap; }
  table.items td.total { text-align: center; white-space: nowrap; font-weight: 900; }

  /* ===== الملخص ===== */
  .summary {
    border-top: 2px dashed #000;
    padding-top: 2mm;
    margin-top: 2mm;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 700;
    padding: 1mm 0;
  }

  /* بلوك الإجمالي العام المقلوب (Premium Look) */
  .grand-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 16px;
    font-weight: 900;
    background: #000;
    color: #fff;
    margin-top: 2mm;
    padding: 3mm;
    border-radius: 4px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ===== الفوتر ===== */
  .footer {
    text-align: center;
    margin-top: 4mm;
  }

  .qr-placeholder {
    width: 45px;
    height: 45px;
    margin: 0 auto 2mm;
  }

  .footer-text {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.5px;
  }

  @page { size: 75mm auto; margin: 0; }

  @media print {
    html, body {
      width: 75mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }
    .receipt {
      width: 75mm !important;
      padding: 3mm !important;
      box-shadow: none !important;
    }
    .title-wrapper, table.items thead th, .grand-total, .logo-icon {
      background-color: #000 !important;
      color: #fff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    table.items tr { break-inside: avoid; page-break-inside: avoid; }
  }
</style>
</head>
<body>

  <div class="receipt">

    <div class="header">
      <!-- أيقونة احترافية بتدي طابع مؤسسي -->
      <div class="logo-icon">
        <svg viewBox="0 0 24 24">
          <path d="M7,18A2,2 0 0,1 5,16V4A2,2 0 0,1 7,2H17A2,2 0 0,1 19,4V16A2,2 0 0,1 17,18H7M7,4V16H17V4H7M9,13H15V15H9V13M9,9H15V11H9V9M9,5H15V7H9V5M3,6H5V18H17V20H5A2,2 0 0,1 3,18V6Z" />
        </svg>
      </div>
      
      <div class="title-wrapper">
        <h1 class="title">${escapeHtml(title)}</h1>
      </div>
    </div>

    <!-- شبكة معلومات التقرير الشيك -->
    <div class="meta-box">
      ${
        department
          ? `<div class="meta-row">
              <span class="meta-label">القسم/الفرع:</span>
              <span class="meta-value">${escapeHtml(department)}</span>
            </div>`
          : ""
      }
      <div class="meta-row">
        <span class="meta-label">من تاريخ:</span>
        <span class="meta-value">${escapeHtml(fromDate)}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">إلى تاريخ:</span>
        <span class="meta-value">${escapeHtml(toDate)}</span>
      </div>
    </div>

    <table class="items">
      <colgroup>
        <col class="col-idx" />
        <col class="col-name" />
        <col class="col-qty" />
        <col class="col-unit" />
        <col class="col-total" />
      </colgroup>
      <thead>
        <tr>
          <th>#</th>
          <th class="name">الصنف</th>
          <th>الكمية</th>
          <th>السعر</th>
          <th>الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="summary">
      <div class="summary-row">
        <span>إجمالي عدد الأصناف</span>
        <span>${(items.length)}</span>
      </div>
      <div class="summary-row">
        <span>إجمالي الكميات المباعة</span>
        <span>${(totalQty)}</span>
      </div>
      
      <div class="grand-total">
        <span>صافي المبيعات</span>
        <span>${(totalSales)} ج.م</span>
      </div>
    </div>

    <div class="footer">
      <!-- باركود/QR وهمي لزيادة الفخامة والإيحاء بنظام متقدم -->
      <svg class="qr-placeholder" viewBox="0 0 24 24" fill="#000">
        <path d="M4,4H10V10H4V4M20,4V10H14V4H20M14,15H16V13H14V11H16V13H18V11H20V13H18V15H20V18H18V20H16V18H13V20H11V16H14V15M16,15V18H18V15H16M4,20V14H10V20H4M6,6V8H8V6H6M16,6V8H18V6H16M6,16V18H8V16H6M4,11H6V13H4V11M9,11H13V15H11V13H9V11M11,6H13V10H11V6M2,2V6H0V2A2,2 0 0,1 2,0H6V2H2M22,0A2,2 0 0,1 24,2V6H22V2H18V0H22M2,18V22H6V24H2A2,2 0 0,1 0,22V18H2M22,22V18H24V22A2,2 0 0,1 22,24H18V22H22Z" />
      </svg>
      <div class="footer-text" style="font-weight: normal; margin-top: 1mm;">• نهاية التقرير •</div>
    </div>

  </div>

</body></html>
`;

  const printWindow = window.open(
    "",
    "_blank",
    "width=400,height=700,menubar=no,toolbar=no,location=no,status=no",
  );

  if (!printWindow) {
    alert("المتصفح منع نافذة الطباعة");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      setTimeout(() => {
        printWindow.close();
      }, 1000);
    }, 250);
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
