// 1. استدعاء المكتبات الأساسية
import express from "express";
import cors from "cors";
import pg from "pg";
const { Pool } = pg;
import dotenv from "dotenv";
import crypto from "crypto";
import { exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import multer from "multer";

import { kitchenPrinter } from "./utils/kitchenPrinter.js";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ipsConfigPath = path.join(__dirname, "ips-config.json");

const ipsConfig = JSON.parse(fs.readFileSync(ipsConfigPath, "utf8"));

const MICROS_IPS = Array.isArray(ipsConfig.MICROS_IPS)
  ? ipsConfig.MICROS_IPS
  : [];

const Sec_chasierIPs = Array.isArray(ipsConfig.Sec_chasierIPs)
  ? ipsConfig.Sec_chasierIPs
  : [];

console.log("✅ Device IP config loaded:", {
  micros: MICROS_IPS,
  secCashiers: Sec_chasierIPs,
});

dotenv.config();

// إعداد الاتصال بقاعدة البيانات PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost", // 👈 هيقرأ الـ IP بتاع الجهاز الرئيسي لو جهاز فرعي
  database: process.env.DB_DATABASE || "mall_erp",
  password: process.env.DB_PASSWORD || "123456",
  port: Number(process.env.DB_PORT) || 5432,

  options: "-c timezone=Africa/Cairo",

  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 3000,
});
async function ensureDatabaseIndexes() {
  try {
    // active_orders: البحث عن الطلبات حسب الحالة
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_active_orders_state
      ON active_orders (state);
    `);

    // shifts: البحث عن الوردية المفتوحة الخاصة بالجهاز
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shifts_open_terminal
      ON shifts (terminal_id)
      WHERE closed_at IS NULL;
    `);

    // invoices: تسريع جلب فواتير الجهاز خلال فترة زمنية
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_terminal_created_at
      ON invoices (terminal_id, created_at);
    `);
    // invoices: تسريع البحث والترتيب حسب تاريخ الفاتورة
    await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_invoices_created_at
  ON invoices (created_at DESC);
`);
    // shifts: تسريع جلب وترتيب الشيفتات حسب تاريخ الفتح
    await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_shifts_opened_at
  ON shifts (opened_at DESC);
`);
    console.log("✅ Database indexes are ready");
  } catch (err) {
    console.error("❌ Failed to ensure database indexes:", err);
  }
}

ensureDatabaseIndexes();

// اختبار الاتصال بقاعدة البيانات للتأكد من نجاحه
pool.connect((err, client, release) => {
  if (err) {
    return console.error("❌ فشل الاتصال بقاعدة البيانات:", err.stack);
  }
  console.log("🚀 تم الاتصال بقاعدة البيانات PostgreSQL بنجاح يا بطل!");
  release();
});

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// المسارات الأساسية (Routes)
// ==========================================

app.get("/", (req, res) => {
  res.send("مرحباً بك في سيرفر إدارة المول! 🚀");
});

app.get("/api/test", (req, res) => {
  res.json({ message: "تم الاتصال بالباك إند بنجاح!", status: "success" });
});

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// --- مسارات الموظفين (Employees) ---

// 🌟 1. جلب الموظفين مع توليد الهاش الحقيقي SHA256 للفرونت إند
app.get("/api/employees", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, role, pin_hash FROM employees",
    );

    const formattedEmployees = result.rows.map((row) => {
      const clearPin = row.pin_hash || ""; // البين الصافي المخزن بالداتابيز
      // توليد الهاش عشان الفرونت إند لما يقارن بـ sha256 يلاقيها متطابقة
      const generatedHash = crypto
        .createHash("sha256")
        .update(clearPin)
        .digest("hex");

      return {
        id: row.id,
        name: row.name,
        role: row.role,
        pinHash: generatedHash, // الهاش للمقارنات المؤمنة
        pin: clearPin, // الصافي لزرار العين
      };
    });

    res.json(formattedEmployees);
  } catch (err) {
    console.error("❌ خطأ في جلب الموظفين:", err);
    res.status(500).json({ error: "خطأ في جلب البيانات" });
  }
});

// 🌟 2. إضافة موظف جديد
app.post("/api/employees", async (req, res) => {
  const { name, role } = req.body;
  const inputPin = req.body.pin || req.body.pinHash || req.body.password || "";
  const id = req.body.id || crypto.randomUUID();

  if (!name || !inputPin) {
    return res.status(400).json({ message: "الاسم والرقم السري مطلوبان" });
  }

  try {
    // بنخزن الصافي في الداتابيز للحفاظ على كودك القديم
    const query = `
      INSERT INTO employees (id, name, role, pin_hash) 
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, role, pin_hash
    `;
    const result = await pool.query(query, [
      id,
      name,
      role || "cashier",
      inputPin,
    ]);
    const emp = result.rows[0];

    const generatedHash = crypto
      .createHash("sha256")
      .update(emp.pin_hash || "")
      .digest("hex");

    res.status(201).json({
      id: emp.id,
      name: emp.name,
      role: emp.role,
      pinHash: generatedHash,
      pin: emp.pin || emp.pin_hash,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res
        .status(400)
        .json({ message: "عذراً، هذا الرقم السري مستخدم بالفعل!" });
    }
    res.status(500).json({ message: "حدث خطأ داخلي في السيرفر" });
  }
});

// 🌟 3. تعديل بيانات موظف
app.put("/api/employees/:id", async (req, res) => {
  const { id } = req.params;
  const { name, role } = req.body;
  const inputPin = req.body.pin || req.body.pinHash || req.body.password;

  try {
    let query, values;
    if (inputPin) {
      query = `UPDATE employees SET name = $1, role = $2, pin_hash = $3 WHERE id = $4 RETURNING id, name, role, pin_hash`;
      values = [name, role, inputPin, id];
    } else {
      query = `UPDATE employees SET name = $1, role = $2 WHERE id = $3 RETURNING id, name, role, pin_hash`;
      values = [name, role, id];
    }

    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "الموظف غير موجود" });
    }

    const emp = result.rows[0];
    const generatedHash = crypto
      .createHash("sha256")
      .update(emp.pin_hash || "")
      .digest("hex");

    res.json({
      id: emp.id,
      name: emp.name,
      role: emp.role,
      pinHash: generatedHash,
      pin: emp.pin_hash,
    });
  } catch (error) {
    res.status(500).json({ message: "فشل التعديل في قاعدة البيانات" });
  }
});

// --- مسار الحذف (DELETE) ---
// 🌟 مسار حذف موظف - متوافق تماماً مع الفرونت إند
app.delete("/api/employees/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // بنعمل RETURNING * عشان نضمن إن العملية تمت بنجاح وبيرجع الصف اللي اتمسح
    const result = await pool.query(
      "DELETE FROM employees WHERE id = $1 RETURNING *",
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "الموظف غير موجود أصلاً!" });
    }

    const deletedEmp = result.rows[0];

    // بنولد الهاش عشان التوافق التام
    const generatedHash = crypto
      .createHash("sha256")
      .update(deletedEmp.pin_hash || "")
      .digest("hex");

    // بنرجع الاستجابة بنجاح
    res.json({
      success: true,
      message: "تم حذف الموظف بنجاح",
      employee: {
        id: deletedEmp.id,
        name: deletedEmp.name,
        role: deletedEmp.role,
        pinHash: generatedHash,
        pin: deletedEmp.pin_hash,
      },
    });
  } catch (err) {
    console.error("❌ خطأ في حذف الموظف:", err);
    res.status(500).json({ message: "فشل حذف الموظف من قاعدة البيانات" });
  }
});
// --- مسارات الفواتير (Invoices) ---

// 🌟 تحديث الدالة المساعدة لضمان قراءة الضريبة والخصم بأي شكل وهي راجعة للفرونت إند
function formatInvoiceToFrontend(inv) {
  if (!inv) return null;

  return {
    id: inv.id,
    invoiceNumber: Number(inv.invoice_number || inv.invoiceNumber || 0),
    type: inv.type,
    tableCode: inv.table_code || inv.tableCode || "",
    zone: inv.zone || "",
    customerName: inv.customer_name || inv.customerName || "",
    customerAddress: inv.customer_address || inv.customerAddress || "",
    customerPhone: inv.customer_phone || inv.customerPhone || "", // 🌟 المطابقة مع customer_phone
    cashierId: inv.cashier_id || inv.cashierId || "",
    cashierName: inv.cashier_name || inv.cashierName || "",
    captainName: inv.captain_name || inv.captainName || "",
    items:
      typeof inv.items === "string" ? JSON.parse(inv.items) : inv.items || [],
    subtotal: Number(inv.subtotal || 0),
    discountPct: Number(inv.discount_pct || inv.discountPct || 0),
    discountValue: Number(inv.discount_value || inv.discountValue || 0),
    taxPct: Number(inv.tax_pct || inv.taxPct || 0),
    taxValue: Number(inv.tax_value || inv.taxValue || 0),
    deliveryPrice: Number(inv.delivery_price || inv.deliveryPrice || 0),
    total: Number(inv.total || 0),
    createdAt: inv.created_at
      ? new Date(inv.created_at).getTime()
      : Number(inv.createdAt) || Date.now(),
    terminalId: inv.terminal_id || inv.terminalId || "Main",
    createdBy: inv.created_by || inv.createdBy || "",
    orderCategory: inv.order_category || inv.orderCategory || "normal",
    commissionValue: Number(inv.commission_value || inv.commissionValue || 0),
    takeawayDailyNumber:
      inv.takeaway_daily_number ?? inv.takeawayDailyNumber ?? null,
  };
}

// 1️⃣ تعديل مسار حفظ الفاتورة (POST) لضمان تسلسل الأرقام بناءً على الداتا بيس كاملة
app.post("/api/invoices", async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      id,
      type,
      tableCode,
      zone,
      customerName,
      customerAddress,
      customerPhone,
      cashierId,
      cashierName,
      captainName,
      items,
      subtotal,
      discountPct,
      discountValue,
      taxPct,
      taxValue,
      deliveryPrice,
      total,
      createdAt,
      terminalId,
      createdBy,
      orderCategory,
      commissionValue,
    } = req.body;

    // =========================================================
    // Validation
    // =========================================================

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invoice ID is required",
      });
    }

    // =========================================================
    // Numbers
    // =========================================================

    const finalSubtotal = Number(subtotal) || 0;
    const finalDiscountPct = Number(discountPct) || 0;
    const finalDiscountValue = Number(discountValue) || 0;
    const finalTaxPct = Number(taxPct) || 0;
    const finalTaxValue = Number(taxValue) || 0;
    const finalDeliveryPrice = Number(deliveryPrice) || 0;
    const finalTotal = Math.max(0, Number(total) || 0);
    const finalCommissionValue = Number(commissionValue) || 0;

    // =========================================================
    // Items
    // =========================================================

    const finalItems = Array.isArray(items) ? items : [];

    // =========================================================
    // Date
    // =========================================================

    const createdAtMs = Number(createdAt);

    const finalCreatedAt =
      Number.isFinite(createdAtMs) && createdAtMs > 0
        ? new Date(createdAtMs)
        : new Date();

    // =========================================================
    // Takeaway / Delivery
    // =========================================================

    const isTakeaway =
      type === "takeaway" || type === "delivery" || zone === "takeaway";

    // =========================================================
    // Terminal
    // =========================================================

    const finalTerminalId = terminalId || "Main";

    // =========================================================
    // BEGIN TRANSACTION
    // =========================================================

    await client.query("BEGIN");

    // =========================================================
    // Lock OPEN SHIFT
    // =========================================================

    const shiftResult = await client.query(
      `
  SELECT id
  FROM shifts
  WHERE terminal_id = $1
    AND closed_at IS NULL
  ORDER BY opened_at DESC
  LIMIT 1
  FOR UPDATE
  `,
      [finalTerminalId],
    );

    if (shiftResult.rowCount === 0) {
      throw new Error(`لا يوجد وردية مفتوحة على الجهاز ${finalTerminalId}`);
    }

    // =========================================================
    // Takeaway Daily Number
    // =========================================================

    let takeawayDailyNumber = null;

    if (isTakeaway) {
      const numberResult = await client.query(`
  SELECT COALESCE(
    MAX(takeaway_daily_number),
    0
  ) + 1 AS next_number
  FROM invoices
  WHERE created_at >= CURRENT_DATE
    AND created_at < CURRENT_DATE + INTERVAL '1 day'
    AND (
      type = 'takeaway'
      OR type = 'delivery'
      OR order_type = 'takeaway'
    )
`);

      takeawayDailyNumber = Number(numberResult.rows[0]?.next_number) || 1;
    }

    // =========================================================
    // INSERT INVOICE
    // =========================================================

    const invoiceResult = await client.query(
      `
      INSERT INTO invoices (
        id,
        type,
        table_code,
        zone,
        customer_name,
        customer_address,
        cashier_id,
        cashier_name,
        items,
        subtotal,
        discount_pct,
        discount_value,
        tax_pct,
        tax_value,
        total,
        created_at,
        order_type,
        customer_phone,
        delivery_price,
        captain_name,
        terminal_id,
        created_by,
        order_category,
        commission_value,
        takeaway_daily_number
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19,
        $20,
        $21,
        $22,
        $23,
        $24,
        $25
      )
      RETURNING *
      `,
      [
        id,
        type || "normal",
        tableCode || null,
        zone || null,
        customerName || null,
        customerAddress || null,
        cashierId || null,
        cashierName || null,

        JSON.stringify(finalItems),

        finalSubtotal,
        finalDiscountPct,
        finalDiscountValue,
        finalTaxPct,
        finalTaxValue,
        finalTotal,

        finalCreatedAt,

        isTakeaway ? "takeaway" : "dine_in",

        customerPhone || null,
        finalDeliveryPrice,
        captainName || null,
        finalTerminalId,
        createdBy || null,
        orderCategory || "normal",
        finalCommissionValue,
        takeawayDailyNumber,
      ],
    );

    // =========================================================
    // COMMIT
    // =========================================================

    await client.query("COMMIT");

    console.log(`✅ INVOICE CREATED: ${id}`);

    res.status(201).json(invoiceResult.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");

    console.error("❌ CREATE INVOICE FAILED:", err);

    res.status(500).json({
      success: false,
      message: err?.message || "Failed to create invoice",
    });
  } finally {
    client.release();
  }
});

// 2️⃣ حماية وتعديل مسار جلب الفواتير (GET) للأرشيف والتقارير
app.get("/api/invoices", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = `
  SELECT
    id,
    invoice_number,
    type,
    table_code,
    zone,
    customer_name,
    customer_address,
    customer_phone,
    cashier_id,
    cashier_name,
    captain_name,
    items,
    subtotal,
    discount_pct,
    discount_value,
    tax_pct,
    tax_value,
    delivery_price,
    total,
    created_at,
    terminal_id,
    created_by,
    order_category,
    commission_value,
    takeaway_daily_number
  FROM invoices
`;
    let params = [];

    if (startDate && endDate) {
      query += `
  WHERE created_at >= $1::timestamptz
    AND created_at < $2::timestamptz
`;
      params.push(startDate, endDate);
    }

    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, params);

    const formattedInvoices = result.rows.map((row) =>
      formatInvoiceToFrontend(row),
    );
    res.json(formattedInvoices);
  } catch (err) {
    console.error("❌ خطأ أثناء جلب الفواتير والأرشيف:", err.message);
    res
      .status(500)
      .json({ error: "حدث خطأ أثناء جلب الفواتير", details: err.message });
  }
});
// ==========================================
// 🕒 مسارات الورديات (Shifts) بالمنطق الجديد
// ==========================================

// 🌟 1. فحص الوردية الحالية (للمزامنة) مخصصة للجهاز نفسه
app.get("/api/pos/shift", async (req, res) => {
  // استقبال الـ terminalId المبعوث من التابلت أو الرئيسي
  const terminalId = req.query.terminalId || "Main";

  try {
    const result = await pool.query(
      "SELECT * FROM shifts WHERE terminal_id = $1 AND closed_at IS NULL LIMIT 1",
      [terminalId],
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      res.json({
        ...row,
        openedAt: Number(row.opened_at),
        closedAt: row.closed_at ? Number(row.closed_at) : null,
      });
    } else {
      res.json(null); // لو مفيش شيفت مفتوح للجهاز ده يرجع null
    }
  } catch (err) {
    console.error("❌ خطأ في جلب الوردية:", err.message);
    res.status(500).json({ error: "حدث خطأ في السيرفر" });
  }
});

// 🌟 2. فتح وردية جديدة (بداية الشيفت)
app.post("/api/pos/shift/open", async (req, res) => {
  const { cashierId, cashierName, openedAt, terminalId } = req.body; // 🌟 استلمنا terminalId

  try {
    const id = crypto.randomUUID();
    const finalOpenedAt = openedAt ? Number(openedAt) : Date.now();
    const termId = terminalId || "Main";

    // 💡 حماية: نتأكد إن مفيش وردية مفتوحة لنفس الجهاز
    const checkQuery = await pool.query(
      "SELECT id FROM shifts WHERE terminal_id = $1 AND closed_at IS NULL LIMIT 1",
      [termId],
    );
    if (checkQuery.rows.length > 0) {
      return res
        .status(400)
        .json({ success: false, error: "الوردية مفتوحة بالفعل لهذا الجهاز" });
    }

    const query = `
      INSERT INTO shifts (id, cashier_id, cashier_name, opened_at, created_at, terminal_id) 
      VALUES ($1, $2, $3, $4, NOW(), $5) 
      RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      cashierId,
      cashierName,
      finalOpenedAt,
      termId,
    ]);

    res.status(201).json({ success: true, shift: result.rows[0] });
  } catch (err) {
    console.error("🚨 خطأ أثناء فتح الوردية:", err.message);
    res
      .status(500)
      .json({ success: false, error: "حدث خطأ أثناء فتح الوردية" });
  }
});

// 🌟 3. إغلاق الوردية الحالية باللوجيك الأصلي كاملاً + حماية ودعم الأجهزة المنفصلة
app.post("/api/shifts", async (req, res) => {
  const { terminalId, actualCash } = req.body;

  try {
    const termId = terminalId || "Main";
    const finalClosedAt = Date.now();
    const finalActualCash = Number(actualCash) || 0;

    // =====================================================
    // 1️⃣ نجيب الوردية المفتوحة من DB نفسها
    // لا نعتمد على openedAt القادم من الفرونت
    // =====================================================
    const shiftResult = await pool.query(
      `
      SELECT *
      FROM shifts
      WHERE terminal_id = $1
        AND closed_at IS NULL
      ORDER BY opened_at DESC
      LIMIT 1
      `,
      [termId],
    );

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({
        error: `لا توجد وردية مفتوحة للجهاز ${termId}`,
      });
    }

    const shift = shiftResult.rows[0];

    const openedAt = Number(shift.opened_at);

    // =====================================================
    // 2️⃣ نحسب كل شيء من invoices في PostgreSQL
    // =====================================================
    const invoiceResult = await pool.query(
      `
      SELECT
        id,
        type,
        items,
        subtotal,
        discount_value,
        tax_value,
        delivery_price,
        total,
        order_category,
        commission_value,
        created_at
      FROM invoices
      WHERE terminal_id = $1
        AND created_at >= TO_TIMESTAMP($2 / 1000.0)
        AND created_at <= TO_TIMESTAMP($3 / 1000.0)
      `,
      [termId, openedAt, finalClosedAt],
    );

    const invoices = invoiceResult.rows;

    // =====================================================
    // 3️⃣ الحسابات الرسمية من DB فقط
    // =====================================================
    let totalRevenue = 0;

    let dineinSales = 0;
    let takeawaySales = 0;
    let deliverySales = 0;

    let kitchenSales = 0;
    let barSales = 0;
    let shishaSales = 0;

    let subtotal = 0;
    let discountValue = 0;
    let taxValue = 0;

    let deliveryFees = 0;

    let fastSales = 0;
    let talabatSales = 0;

    let fastCommission = 0;
    let talabatCommission = 0;

    for (const inv of invoices) {
      const invoiceTotal = Number(inv.total) || 0;
      const invoiceSubtotal = Number(inv.subtotal) || 0;
      const invoiceDiscount = Number(inv.discount_value) || 0;
      const invoiceTax = Number(inv.tax_value) || 0;
      const invoiceDelivery = Number(inv.delivery_price) || 0;

      totalRevenue += invoiceTotal;
      subtotal += invoiceSubtotal;
      discountValue += invoiceDiscount;
      taxValue += invoiceTax;
      deliveryFees += invoiceDelivery;

      // ---------------------------------------------
      // أنواع الطلب
      // ---------------------------------------------
      if (inv.type === "dinein") {
        dineinSales += invoiceTotal;
      }

      if (inv.type === "takeaway") {
        takeawaySales += Math.max(0, invoiceTotal - invoiceDelivery);
      }

      if (inv.type === "delivery") {
        deliverySales += Math.max(0, invoiceTotal - invoiceDelivery);
      }

      // ---------------------------------------------
      // المنصات والعمولات
      // ---------------------------------------------
      const category = inv.order_category || "normal";
      const commission = Number(inv.commission_value) || 0;

      if (category === "fast") {
        fastSales += invoiceTotal;
        fastCommission += commission;
      }

      if (category === "talabat") {
        talabatSales += invoiceTotal;
        talabatCommission += commission;
      }

      // ---------------------------------------------
      // تفاصيل الأصناف
      // ---------------------------------------------
      let items = [];

      try {
        items =
          typeof inv.items === "string"
            ? JSON.parse(inv.items)
            : inv.items || [];
      } catch {
        items = [];
      }

      for (const line of items) {
        const qty = Number(line.qty) || 0;

        if (qty <= 0) continue;

        const extrasTotal = Array.isArray(line.extras)
          ? line.extras.reduce(
              (sum, extra) => sum + (Number(extra.price) || 0),
              0,
            )
          : 0;

        const lineValue =
          (Number(line.unitPrice ?? line.price ?? 0) + extrasTotal) * qty;

        const dept = String(line.department || "")
          .trim()
          .toLowerCase();

        if (dept.includes("شيش") || dept === "shisha" || dept === "hookah") {
          shishaSales += lineValue;
        } else if (dept.includes("بار")) {
          barSales += lineValue;
        } else {
          kitchenSales += lineValue;
        }
      }
    }

    // =====================================================
    // 4️⃣ نتيجة الجرد النقدي
    // =====================================================
    const variance = finalActualCash - totalRevenue;

    // =====================================================
    // 5️⃣ تحديث الوردية في DB
    // =====================================================
    const updateResult = await pool.query(
      `
  UPDATE shifts
  SET
    closed_at = $1,
    kitchen_sales = $2,
    bar_sales = $3,
    shisha_sales = $4,
    tax_value = $5,
    discount_value = $6,
    total_revenue = $7,
    dinein_sales = $8,
    takeaway_sales = $9,
    delivery_sales = $10,
    cashier_name = COALESCE($11, cashier_name)
  WHERE id = $12
    AND closed_at IS NULL
  RETURNING *
  `,
      [
        finalClosedAt,
        round2(kitchenSales),
        round2(barSales),
        round2(shishaSales),
        round2(taxValue),
        round2(discountValue),
        round2(totalRevenue),
        round2(dineinSales),
        round2(takeawaySales),
        round2(deliverySales),
        shift.cashier_name || null,
        shift.id,
      ],
    );
    if (updateResult.rows.length === 0) {
      return res.status(409).json({
        error: "تم إغلاق الوردية بالفعل أو لم تعد موجودة.",
      });
    }

    const row = updateResult.rows[0];

    // =====================================================
    // 6️⃣ نرجع التقرير الرسمي من DB
    // =====================================================
    return res.status(200).json({
      ...row,

      openedAt: Number(row.opened_at),
      closedAt: Number(row.closed_at),

      cashierName: row.cashier_name,
      terminalId: row.terminal_id,

      auditReport: {
        terminalId: termId,
        cashierName: row.cashier_name,

        invoiceCount: invoices.length,

        databaseTotalSales: round2(totalRevenue),

        subtotal: round2(subtotal),
        discountValue: round2(discountValue),
        taxValue: round2(taxValue),

        kitchenTotal: round2(kitchenSales),
        barTotal: round2(barSales),
        shishaTotal: round2(shishaSales),

        dineinTotal: round2(dineinSales),
        takeawayTotal: round2(takeawaySales),
        deliveryTotal: round2(deliverySales),

        deliveryFees: round2(deliveryFees),

        fastTotal: round2(fastSales),
        fastCommission: round2(fastCommission),

        talabatTotal: round2(talabatSales),
        talabatCommission: round2(talabatCommission),

        actualCashReceived: round2(finalActualCash),

        variance: round2(variance),
      },
    });
  } catch (err) {
    console.error("❌ خطأ أثناء إغلاق الوردية:", err.message);

    res.status(500).json({
      error: "حدث خطأ أثناء إغلاق الوردية",
      details: err.message,
    });
  }
});
// 🌟 4. جلب أرشيف كل الورديات (لشاشة التقارير)
app.get("/api/shifts", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = `
  SELECT
    id,
    cashier_id,
    cashier_name,
    opened_at,
    closed_at,
    kitchen_sales,
    bar_sales,
    shisha_sales,
    tax_value,
    discount_value,
    total_revenue,
    dinein_sales,
    takeaway_sales,
    delivery_sales,
    terminal_id
  FROM shifts
`;
    let params = [];

    // 🌟 السر هنا: opened_at متخزن كـ BIGINT مش تاريخ عادي!
    if (startDate && endDate) {
      // بنحول التواريخ لأرقام ملي ثانية عشان نقارنها صح بالداتابيز
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      query += " WHERE opened_at >= $1 AND opened_at <= $2";
      params.push(startMs, endMs);
    }

    query += " ORDER BY opened_at DESC";
    const result = await pool.query(query, params);

    const formattedShifts = result.rows.map((row) => ({
      id: row.id,
      cashierName: row.cashier_name,
      cashierId: row.cashier_id,
      openedAt: row.opened_at ? Number(row.opened_at) : Date.now(),
      closedAt: row.closed_at ? Number(row.closed_at) : null,
      kitchenSales: Number(row.kitchen_sales) || 0,
      barSales: Number(row.bar_sales) || 0,
      shishaSales: Number(row.shisha_sales) || 0,
      taxValue: Number(row.tax_value) || 0,
      discountValue: Number(row.discount_value) || 0,
      totalRevenue: Number(row.total_revenue) || 0,
      dineinSales: Number(row.dinein_sales) || 0,
      takeawaySales: Number(row.takeaway_sales) || 0,
      deliverySales: Number(row.delivery_sales) || 0,
      // 👇 التعديل السحري: ضفنا المتغيرات الناقصة اللي كانت بتخلي الفرونت يرفض الداتا!
      initialCash: Number(row.initial_cash) || 0,
      actualCash: Number(row.actual_cash) || 0,
      state: row.state || (row.closed_at ? "closed" : "open"),
      terminalId: row.terminal_id || "Main",
    }));

    res.json(formattedShifts);
  } catch (err) {
    console.error("🚨 خطأ أثناء جلب الورديات:", err.message);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الورديات" });
  }
});
app.get("/api/shifts/summary", async (req, res) => {
  try {
    const terminalId = String(req.query.terminalId || "Main");

    const shiftResult = await pool.query(
      `
  SELECT
    opened_at,
    cashier_name
  FROM shifts
  WHERE terminal_id = $1
    AND closed_at IS NULL
  ORDER BY opened_at DESC
  LIMIT 1
  `,
      [terminalId],
    );

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({
        error: "لا توجد وردية مفتوحة",
      });
    }

    const shift = shiftResult.rows[0];
    // const now = Date.now();

    const openedAt = Number(shift.opened_at);

    const invoiceResult = await pool.query(
      `
      SELECT
        type,
        items,
        subtotal,
        discount_value,
        tax_value,
        delivery_price,
        total,
        order_category,
        commission_value,
        created_at
      FROM invoices
      WHERE terminal_id = $1
        AND created_at >= TO_TIMESTAMP($2 / 1000.0)
      `,
      [terminalId, openedAt],
    );

    let totalRevenue = 0;
    let kitchenSales = 0;
    let barSales = 0;
    let shishaSales = 0;

    let dineinSales = 0;
    let takeawaySales = 0;
    let deliverySales = 0;

    let subtotal = 0;
    let discountValue = 0;
    let taxValue = 0;
    let deliveryFees = 0;

    let fastSales = 0;
    let talabatSales = 0;
    let fastCommission = 0;
    let talabatCommission = 0;

    for (const inv of invoiceResult.rows) {
      const total = Number(inv.total) || 0;
      const delivery = Number(inv.delivery_price) || 0;

      totalRevenue += total;
      subtotal += Number(inv.subtotal) || 0;
      discountValue += Number(inv.discount_value) || 0;
      taxValue += Number(inv.tax_value) || 0;
      deliveryFees += delivery;

      if (inv.type === "dinein") {
        dineinSales += total;
      }

      if (inv.type === "takeaway") {
        takeawaySales += Math.max(0, total - delivery);
      }

      if (inv.type === "delivery") {
        deliverySales += Math.max(0, total - delivery);
      }

      const category = inv.order_category || "normal";
      const commission = Number(inv.commission_value) || 0;

      if (category === "fast") {
        fastSales += total;
        fastCommission += commission;
      }

      if (category === "talabat") {
        talabatSales += total;
        talabatCommission += commission;
      }

      let items = [];

      try {
        items =
          typeof inv.items === "string"
            ? JSON.parse(inv.items)
            : inv.items || [];
      } catch {
        items = [];
      }

      for (const line of items) {
        const qty = Number(line.qty) || 0;
        if (qty <= 0) continue;

        const extrasTotal = Array.isArray(line.extras)
          ? line.extras.reduce(
              (sum, extra) => sum + (Number(extra.price) || 0),
              0,
            )
          : 0;

        const value =
          (Number(line.unitPrice ?? line.price ?? 0) + extrasTotal) * qty;

        const dept = String(line.department || "")
          .trim()
          .toLowerCase();

        if (dept.includes("شيش") || dept === "shisha" || dept === "hookah") {
          shishaSales += value;
        } else if (dept.includes("بار")) {
          barSales += value;
        } else {
          kitchenSales += value;
        }
      }
    }

    res.json({
      terminalId,
      cashierName: shift.cashier_name,
      openedAt,
      invoiceCount: invoiceResult.rows.length,

      totalRevenue: round2(totalRevenue),

      kitchenSales: round2(kitchenSales),
      barSales: round2(barSales),
      shishaSales: round2(shishaSales),

      dineinSales: round2(dineinSales),
      takeawaySales: round2(takeawaySales),
      deliverySales: round2(deliverySales),

      subtotal: round2(subtotal),
      discountValue: round2(discountValue),
      taxValue: round2(taxValue),
      deliveryFees: round2(deliveryFees),

      fastSales: round2(fastSales),
      talabatSales: round2(talabatSales),

      fastCommission: round2(fastCommission),
      talabatCommission: round2(talabatCommission),
    });
  } catch (err) {
    console.error("❌ SHIFTS SUMMARY ERROR:", err);

    res.status(500).json({
      error: "فشل حساب ملخص الوردية",
      details: err.message,
    });
  }
});

// --- مسارات المخزن الرئيسي (Main Inventory) ---

app.get("/api/inventory", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM inventory_items ORDER BY name ASC",
    );
    const formattedRows = result.rows.map((row) => ({
      id: row.id,
      department: row.department || "",
      code: row.code || "",
      name: row.name,
      unit: row.unit,
      qty: Number(row.qty) || 0,
      avgPrice: Number(row.avg_price) || 0,
      critical: Number(row.critical) || 0,
      conversionFactor: Number(row.conversion_factor) || 1,
      subUnitQty: Number(row.sub_unit_qty) || 0,
      subUnitType: row.sub_unit_type || "",
      kind: row.kind || "standard",
      yieldDef: row.yield_def || null,
      lastYieldDeltas: row.last_yield_deltas || [],
      notes: row.notes || "",
    }));
    res.json(formattedRows);
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ في جلب أصناف المخزن" });
  }
});

app.post("/api/inventory", async (req, res) => {
  const {
    id,
    department,
    code,
    name,
    unit,
    qty,
    avgPrice,
    critical,
    conversionFactor,
    subUnitQty,
    subUnitType,
    kind,
    yieldDef,
    lastYieldDeltas,
    notes,
  } = req.body;
  try {
    const query = `
      INSERT INTO inventory_items (
        id, department, code, name, unit, qty, avg_price, critical, 
        conversion_factor, sub_unit_qty, sub_unit_type, kind, yield_def, last_yield_deltas, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET
        department = EXCLUDED.department, code = EXCLUDED.code, name = EXCLUDED.name, unit = EXCLUDED.unit,
        qty = EXCLUDED.qty, avg_price = EXCLUDED.avg_price, critical = EXCLUDED.critical, conversion_factor = EXCLUDED.conversion_factor,
        sub_unit_qty = EXCLUDED.sub_unit_qty, sub_unit_type = EXCLUDED.sub_unit_type, kind = EXCLUDED.kind,
        yield_def = EXCLUDED.yield_def, last_yield_deltas = EXCLUDED.last_yield_deltas, notes = EXCLUDED.notes
      RETURNING *
    `;
    const values = [
      id,
      department || "",
      code || "",
      name,
      unit,
      Number(qty) || 0,
      Number(avgPrice) || 0,
      Number(critical) || 0,
      Number(conversionFactor) || 1,
      Number(subUnitQty) || 0,
      subUnitType || null,
      kind || "standard",
      yieldDef
        ? typeof yieldDef === "string"
          ? yieldDef
          : JSON.stringify(yieldDef)
        : null,
      lastYieldDeltas
        ? typeof lastYieldDeltas === "string"
          ? lastYieldDeltas
          : JSON.stringify(lastYieldDeltas)
        : null,
      notes || "",
    ];
    const result = await pool.query(query, values);
    const row = result.rows[0];

    // تحويل البيانات لنفس الشكل الذي تفهمه الواجهة الأمامية
    const formattedItem = {
      id: row.id,
      department: row.department || "",
      code: row.code || "",
      name: row.name,
      unit: row.unit,
      qty: Number(row.qty) || 0,
      avgPrice: Number(row.avg_price) || 0,
      critical: Number(row.critical) || 0,
      conversionFactor: Number(row.conversion_factor) || 1,
      subUnitQty: Number(row.sub_unit_qty) || 0,
      subUnitType: row.sub_unit_type || "",
      kind: row.kind || "standard",
      yieldDef: row.yield_def || null,
      lastYieldDeltas: row.last_yield_deltas || [],
      notes: row.notes || "",
    };

    res.status(201).json(formattedItem);
  } catch (err) {
    res.status(500).json({
      error: "حدث خطأ أثناء إضافة الصنف للداتابيز",
      details: err.message,
    });
  }
});

app.delete("/api/inventory/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM inventory_items WHERE id = $1", [
      req.params.id,
    ]);
    res.json({ success: true, message: "تم حذف الصنف بنجاح" });
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ أثناء الحذف" });
  }
});

// --- مسارات أذونات المخزن (Vouchers) ---

app.post("/api/vouchers", async (req, res) => {
  const { id, type, date, supplier, department, lines, createdAt } = req.body;
  try {
    const query = `
      INSERT INTO inventory_vouchers (id, type, date, supplier, department, lines, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `;
    const result = await pool.query(query, [
      id,
      type,
      date,
      supplier || null,
      department || null,
      JSON.stringify(lines),
      createdAt || Date.now(),
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ أثناء حفظ الإذن" });
  }
});

app.get("/api/vouchers", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM inventory_vouchers ORDER BY created_at DESC",
    );
    const formattedVouchers = result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      date: row.date,
      supplier: row.supplier,
      department: row.department,
      lines: typeof row.lines === "string" ? JSON.parse(row.lines) : row.lines,
      createdAt: Number(row.created_at),
    }));
    res.json(formattedVouchers);
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ أثناء جلب الأذونات" });
  }
});

// --- مسارات المخازن الفرعية (Department Stock) ---

app.get("/api/dept-stock", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT item_id, department, qty, item_name FROM department_stock",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ في جلب أرصدة الأقسام" });
  }
});

app.post("/api/dept-stock", async (req, res) => {
  const { itemId, itemName, department, qty } = req.body;
  try {
    const query = `
      INSERT INTO department_stock (item_id, item_name, department, qty) VALUES ($1, $2, $3, $4)
      ON CONFLICT (item_id, department) DO UPDATE SET qty = EXCLUDED.qty, item_name = EXCLUDED.item_name
      RETURNING *
    `;
    const result = await pool.query(query, [
      itemId,
      itemName || "غير محدد",
      department,
      Number(qty) || 0,
    ]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ أثناء تحديث المخزن الفرعي" });
  }
});

// --- مسارات الوجبات والوصفات (Meals / Recipes) ---

app.get("/api/meals", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM meals ORDER BY category, name ASC",
    );
    const formattedMeals = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      department: row.department,
      category: row.category,
      kind: row.kind,
      sellingPrice: Number(row.selling_price) || 0,
      wasteMargin: Number(row.waste_margin) || 0,
      wasteMode: row.waste_mode,
      hasModifiers: row.has_modifiers,
      ingredients:
        typeof row.ingredients === "string"
          ? JSON.parse(row.ingredients)
          : row.ingredients || [],
      modifierGroups:
        typeof row.modifier_groups === "string"
          ? JSON.parse(row.modifier_groups)
          : row.modifier_groups || [],
    }));
    res.json(formattedMeals);
  } catch (err) {
    console.error("❌ GET /api/meals ERROR:", err);
    res.status(500).json({
      error: "حدث خطأ في جلب بيانات الأصناف",
      details: err.message,
    });
  }
});

app.post("/api/meals", async (req, res) => {
  const {
    id,
    name,
    department,
    category,
    kind,
    sellingPrice,
    wasteMargin,
    wasteMode,
    ingredients,
    hasModifiers,
    modifierGroups,
  } = req.body;
  try {
    const query = `
      INSERT INTO meals (id, name, department, category, kind, selling_price, waste_margin, waste_mode, ingredients, has_modifiers, modifier_groups)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, department = EXCLUDED.department, category = EXCLUDED.category, kind = EXCLUDED.kind,
        selling_price = EXCLUDED.selling_price, waste_margin = EXCLUDED.waste_margin, waste_mode = EXCLUDED.waste_mode,
        ingredients = EXCLUDED.ingredients, has_modifiers = EXCLUDED.has_modifiers, modifier_groups = EXCLUDED.modifier_groups
      RETURNING *
    `;
    await pool.query(query, [
      id,
      name,
      department,
      category || "",
      kind || "menu",
      Number(sellingPrice) || 0,
      Number(wasteMargin) || 0,
      wasteMode || "fixed",
      JSON.stringify(ingredients || []),
      hasModifiers || false,
      JSON.stringify(modifierGroups || []),
    ]);
    res.status(201).json({ success: true, message: "تم حفظ الصنف بنجاح" });
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ أثناء حفظ الصنف" });
  }
});

app.delete("/api/meals/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM meals WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: "تم حذف الصنف بنجاح" });
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ أثناء الحذف" });
  }
});

// --- مسارات المبيعات (Sales) ---

app.get("/api/sales", async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;

    let query = `
      SELECT
        id,
        date::text,
        department,
        lines,
        total_sales,
        total_cost,
        created_at
      FROM sales
    `;

    const conditions = [];
    const params = [];

    // فلترة حسب تاريخ المبيعات نفسه
    if (startDate) {
      params.push(String(startDate));
      conditions.push(`date >= $${params.length}::date`);
    }

    if (endDate) {
      params.push(String(endDate));
      conditions.push(`date <= $${params.length}::date`);
    }

    // فلترة القسم لو مطلوبة
    if (department) {
      params.push(String(department));
      conditions.push(`department = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);

    const formattedSales = result.rows.map((row) => ({
      id: row.id,
      date: row.date,
      department: row.department,
      lines: typeof row.lines === "string" ? JSON.parse(row.lines) : row.lines,
      totalSales: Number(row.total_sales) || 0,
      totalCost: Number(row.total_cost) || 0,
      createdAt: new Date(row.created_at).getTime(),
    }));

    res.json(formattedSales);
  } catch (err) {
    console.error("🚨 خطأ في جلب المبيعات:", err.message);

    res.status(500).json({
      error: "حدث خطأ في جلب المبيعات",
      details: err.message,
    });
  }
});

app.post("/api/sales", async (req, res) => {
  const { id, date, department, lines, totalSales, totalCost, createdAt } =
    req.body;

  try {
    const saleId =
      id || `sale_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const existing = await pool.query(
      `SELECT id FROM sales WHERE id = $1 LIMIT 1`,
      [saleId],
    );

    if (existing.rows.length > 0) {
      console.log("♻️ DUPLICATE SALE REQUEST - already exists:", saleId);

      return res.status(200).json({
        success: true,
        duplicate: true,
        message: "البيع موجود بالفعل",
      });
    }

    const query = `
      INSERT INTO sales (
        id,
        date,
        department,
        lines,
        total_sales,
        total_cost,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;

    const result = await pool.query(query, [
      saleId,
      date,
      department,
      JSON.stringify(lines || []),
      Number(totalSales) || 0,
      Number(totalCost) || 0,
      createdAt ? new Date(createdAt) : new Date(),
    ]);

    return res.status(201).json({
      success: true,
      duplicate: result.rows.length === 0,
      message:
        result.rows.length === 0
          ? "المبيعات مسجلة بالفعل"
          : "تم حفظ المبيعات بنجاح",
    });
  } catch (err) {
    console.error("🚨 خطأ في قاعدة البيانات أثناء حفظ المبيعات:", err.message);

    if (err.code === "23505") {
      console.log("♻️ SALE DUPLICATE CAUGHT BY PRIMARY KEY:", id);

      return res.status(200).json({
        success: true,
        duplicate: true,
        message: "البيع موجود بالفعل",
      });
    }

    return res.status(500).json({
      error: "حدث خطأ أثناء حفظ المبيعات",
      details: err.message,
    });
  }
});

// --- مسار الجرد (Audits) ---
app.post("/api/audits", async (req, res) => {
  const { id, date, department, rows, shortageValue, penaltyValue, createdAt } =
    req.body;

  // هنستخدم Transaction عشان نضمن إن حفظ الجرد وتحديث المخزن بيتموا مع بعض
  const client = await pool.connect();

  try {
    await client.query("BEGIN"); // بداية العملية

    // 1. تسجيل الجرد في جدول audits (نفس كودك الأصلي)
    const auditQuery = `
      INSERT INTO audits (id, date, department, rows, shortage_value, penalty_value, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (date, department) 
      DO UPDATE SET 
        rows = EXCLUDED.rows,
        shortage_value = EXCLUDED.shortage_value,
        penalty_value = EXCLUDED.penalty_value,
        created_at = EXCLUDED.created_at;
    `;
    await client.query(auditQuery, [
      id,
      date,
      department,
      JSON.stringify(rows),
      shortageValue,
      penaltyValue,
      new Date(createdAt),
    ]);

    // 2. السحر هنا: تحديث المخازن الفرعية بالكميات الفعلية
    for (const item of rows) {
      // item.actual هي الكمية اللي اليوزر دخلها بإيده في الجرد
      const updateStockQuery = `
        UPDATE department_stock 
        SET qty = $1 
        WHERE item_id = $2 AND department = $3;
      `;
      await client.query(updateStockQuery, [
        item.actual,
        item.itemId,
        department,
      ]);
    }

    await client.query("COMMIT"); // تأكيد حفظ كل التعديلات
    res
      .status(201)
      .json({ success: true, message: "تم تسجيل الجرد وتحديث المخازن بنجاح" });
  } catch (err) {
    await client.query("ROLLBACK"); // لو حصل أي مشكلة، ارجع في كل حاجة
    console.error("🚨 خطأ في تسجيل الجرد وتحديث المخزن:", err.message);
    res.status(500).json({ error: "خطأ في السيرفر أثناء معالجة الجرد" });
  } finally {
    client.release(); // لازم نقفل الاتصال
  }
});
app.get("/api/audits", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM audits ORDER BY created_at DESC",
    );
    const formattedAudits = result.rows.map((row) => ({
      id: row.id,
      date: row.date,
      department: row.department,
      rows: typeof row.rows === "string" ? JSON.parse(row.rows) : row.rows,
      shortageValue: Number(row.shortage_value) || 0,
      penaltyValue: Number(row.penalty_value) || 0,
      createdAt: new Date(row.created_at).getTime(),
    }));
    res.json(formattedAudits);
  } catch (err) {
    console.error("🚨 خطأ في جلب الجرد:", err.message);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الجرد" });
  }
});
///////////////////////////////////////////////// IP /////////////////////////////////////////////////
// 🔍 تعديل الـ API لقراءة القوائم ديناميكياً عند كل فحص
app.get("/api/device-check", (req, res) => {
  let clientIp =
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";

  if (Array.isArray(clientIp)) {
    clientIp = clientIp[0];
  }

  // لو فيه Proxy
  if (typeof clientIp === "string" && clientIp.includes(",")) {
    clientIp = clientIp.split(",")[0].trim();
  }

  // تنظيف IPv4 داخل IPv6
  if (clientIp && clientIp.includes("::ffff:")) {
    clientIp = clientIp.split("::ffff:")[1];
  }

  // تنظيف الفراغ
  clientIp = String(clientIp).trim();

  const microsIndex = MICROS_IPS.indexOf(clientIp);
  const secIndex = Sec_chasierIPs.indexOf(clientIp);

  let deviceType = "main";
  let terminalId = "Main";

  if (microsIndex >= 0) {
    deviceType = "micros";
    terminalId = `Micros-${microsIndex + 1}`;
  } else if (secIndex >= 0) {
    deviceType = "sec_cashier";
    terminalId = `Sub-${secIndex + 1}`;
  }

  res.json({
    ip: clientIp,
    deviceType,
    terminalId,
  });
});
// ============================================================================
// 📡 مسارات مزامنة الطاولات النشطة لحظياً (POS Active Orders)
// ============================================================================
// عشان نفس الطاوله ما تفتح ما تفتح علي جهازين مختلفين
app.post("/api/pos/tables/lock", async (req, res) => {
  const { tableCode, terminalId } = req.body;

  if (!tableCode || !terminalId) {
    return res.status(400).json({
      success: false,
      error: "كود الطاولة والجهاز مطلوبان",
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT table_code, terminal_id, locked_at
      FROM table_locks
      WHERE table_code = $1
      `,
      [tableCode],
    );

    const now = Date.now();
    const LOCK_TIMEOUT = 30000;

    if (result.rows.length > 0) {
      const lock = result.rows[0];

      const expired = now - Number(lock.locked_at) > LOCK_TIMEOUT;

      if (!expired && lock.terminal_id !== terminalId) {
        return res.status(409).json({
          success: false,
          locked: true,
          error: "الطاولة مفتوحة بالفعل على جهاز آخر",
        });
      }

      await pool.query(
        `
        UPDATE table_locks
        SET terminal_id = $1,
            locked_at = $2
        WHERE table_code = $3
        `,
        [terminalId, now, tableCode],
      );

      return res.json({
        success: true,
        locked: true,
      });
    }

    await pool.query(
      `
      INSERT INTO table_locks (
        table_code,
        terminal_id,
        locked_at
      )
      VALUES ($1, $2, $3)
      `,
      [tableCode, terminalId, now],
    );

    return res.json({
      success: true,
      locked: true,
    });
  } catch (err) {
    console.error("🚨 خطأ أثناء حجز الطاولة:", err);

    return res.status(500).json({
      success: false,
      error: "فشل حجز الطاولة",
    });
  }
});
// فك القفل علي الطاوله
app.post("/api/pos/tables/unlock", async (req, res) => {
  const { tableCode, terminalId } = req.body;

  if (!tableCode || !terminalId) {
    return res.status(400).json({
      success: false,
      error: "كود الطاولة والجهاز مطلوبان",
    });
  }

  try {
    await pool.query(
      `
      DELETE FROM table_locks
      WHERE table_code = $1
        AND terminal_id = $2
      `,
      [tableCode, terminalId],
    );

    return res.json({
      success: true,
    });
  } catch (err) {
    console.error("🚨 خطأ أثناء فك حجز الطاولة:", err);

    return res.status(500).json({
      success: false,
      error: "فشل فك حجز الطاولة",
    });
  }
});
// عشان لو المتصفح قفل فجأه
app.post("/api/pos/tables/heartbeat", async (req, res) => {
  const { tableCode, terminalId } = req.body;

  if (!tableCode || !terminalId) {
    return res.status(400).json({
      success: false,
      error: "بيانات ناقصة",
    });
  }

  try {
    const result = await pool.query(
      `
      UPDATE table_locks
      SET locked_at = $1
      WHERE table_code = $2
        AND terminal_id = $3
      RETURNING *
      `,
      [Date.now(), tableCode, terminalId],
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        error: "الـ Lock لم يعد مملوكًا لهذا الجهاز",
      });
    }

    res.json({
      success: true,
    });
  } catch (err) {
    console.error("🚨 heartbeat failed:", err);

    res.status(500).json({
      success: false,
      error: "فشل تحديث حجز الطاولة",
    });
  }
});
// 🌟 1. حفظ أو تحديث طاولة (Upsert) جوه الداتا بيس
app.post("/api/pos/orders/upsert", async (req, res) => {
  const { tableCode, orderData } = req.body;

  if (!tableCode || !orderData) {
    return res.status(400).json({
      success: true,
      updatedAt,
      message: `تم تحديث الطاولة ${tableCode} بنجاح`,
    });
  }

  // =========================================================
  // 🚫 TAKE AWAY / DELIVERY
  // لا يتم حفظهم في active_orders نهائيًا
  // =========================================================

  const zone = String(orderData.zone || "")
    .trim()
    .toLowerCase();

  const type = String(orderData.type || "")
    .trim()
    .toLowerCase();

  const isTakeaway =
    zone === "takeaway" ||
    zone === "take away" ||
    zone === "تيك اواي" ||
    zone === "تيك أواي";

  const isDelivery = type === "delivery";

  if (isTakeaway || isDelivery) {
    try {
      // Takeaway / Delivery لا يتم حفظه في active_orders
      // ولو فيه سجل قديم لنفس الأوردر يتم تنظيفه
      await pool.query("DELETE FROM active_orders WHERE table_code = $1", [
        tableCode,
      ]);

      return res.json({
        success: true,
        skipped: true,
        message: "Take Away / Delivery لا يتم حفظه في الطلبات النشطة",
      });
    } catch (err) {
      console.error("🚨 خطأ أثناء منع حفظ Take Away / Delivery:", err);

      return res.status(500).json({
        success: false,
        error: "فشل تنظيف الطلب من الطلبات النشطة",
      });
    }
  }

  // =========================================================
  // ✅ الطلبات العادية فقط
  // =========================================================

  const state = orderData.state || "active";
  const updatedAt = Date.now();

  const captainName = orderData.captainName || null;
  const customerName = orderData.customerName || null;

  try {
    const query = `
      INSERT INTO active_orders (
        table_code,
        state,
        order_data,
        updated_at,
        captain_name,
        customer_name
      )
      VALUES ($1, $2, $3, $4, $5, $6)

      ON CONFLICT (table_code)
      DO UPDATE SET
        state = $2,
        order_data = $3,
        updated_at = $4,
        captain_name = $5,
        customer_name = $6;
    `;

    await pool.query(query, [
      tableCode,
      state,
      JSON.stringify(orderData),
      updatedAt,
      captainName,
      customerName,
    ]);

    res.json({
      success: true,
      message: `تم تحديث الطاولة ${tableCode} بنجاح`,
    });
  } catch (err) {
    console.error("🚨 خطأ في داتا بيس الطلبات النشطة:", err);

    res.status(500).json({
      success: false,
      error: "فشل حفظ الطلب",
    });
  }
});

app.get("/api/pos/orders", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_code, order_data, updated_at
      FROM active_orders
      WHERE state IN ('active', 'printed')
    `);

    const ordersMap = {};

    for (const row of result.rows) {
      ordersMap[row.table_code] = {
        orderData: row.order_data,
        updatedAt: Number(row.updated_at),
      };
    }

    res.json(ordersMap);
  } catch (err) {
    console.error("🚨 خطأ أثناء جلب الطلبات النشطة:", err);

    res.status(500).json({
      error: "فشل جلب البيانات من السيرفر",
    });
  }
});

app.get("/api/pos/orders/meta", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_code, updated_at
      FROM active_orders
      WHERE state IN ('active', 'printed')
    `);

    const ordersMeta = {};

    for (const row of result.rows) {
      ordersMeta[row.table_code] = Number(row.updated_at || 0);
    }

    res.json(ordersMeta);
  } catch (err) {
    console.error("🚨 خطأ أثناء جلب metadata للطلبات:", err);

    res.status(500).json({
      error: "فشل جلب حالة الطلبات من السيرفر",
    });
  }
});
app.post("/api/pos/orders/changed", async (req, res) => {
  try {
    const { tableCodes } = req.body;

    if (!Array.isArray(tableCodes) || tableCodes.length === 0) {
      return res.json({});
    }

    const result = await pool.query(
      `
      SELECT table_code, order_data, updated_at
      FROM active_orders
      WHERE table_code = ANY($1::text[])
        AND state IN ('active', 'printed')
      `,
      [tableCodes],
    );

    const ordersMap = {};

    for (const row of result.rows) {
      ordersMap[row.table_code] = {
        orderData: row.order_data,
        updatedAt: Number(row.updated_at || 0),
      };
    }

    res.json(ordersMap);
  } catch (err) {
    console.error("🚨 خطأ أثناء جلب الطلبات المتغيرة:", err);

    res.status(500).json({
      error: "فشل جلب الطلبات المتغيرة من السيرفر",
    });
  }
});
// 🌟 4. مسح الطاولة (لما الفاتورة تتقفل وتتحول لـ finish)
app.post("/api/pos/orders/clear", async (req, res) => {
  const { tableCode } = req.body;
  if (!tableCode) {
    return res.status(400).json({ success: false, error: "كود الطاولة مطلوب" });
  }

  try {
    await pool.query("DELETE FROM active_orders WHERE table_code = $1", [
      tableCode,
    ]);
    res.json({ success: true, message: `تم تفريغ الطاولة ${tableCode} بنجاح` });
  } catch (err) {
    console.error("🚨 خطأ أثناء مسح الطاولة:", err);
    res
      .status(500)
      .json({ success: false, error: "فشل مسح الطاولة من السيرفر" });
  }
});

// 🌟 مسار التحويل بين الطاولات (مهم جداً لنقل الأوردرات في الداتابيز)
app.post("/api/pos/orders/transfer", async (req, res) => {
  const { fromCode, toCode, fromOrder, toOrder } = req.body;

  if (!fromCode || !toCode || !toOrder) {
    return res.status(400).json({
      success: false,
      error: "بيانات التحويل ناقصة",
    });
  }

  // =========================================================
  // 🚫 منع Take Away / Delivery من active_orders
  // =========================================================

  const toZone = String(toOrder.zone || "")
    .trim()
    .toLowerCase();

  const toType = String(toOrder.type || "")
    .trim()
    .toLowerCase();

  const toIsTakeaway =
    toZone === "takeaway" ||
    toZone === "take away" ||
    toZone === "تيك اواي" ||
    toZone === "تيك أواي";

  const toIsDelivery = toType === "delivery";

  if (toIsTakeaway || toIsDelivery) {
    try {
      await pool.query("DELETE FROM active_orders WHERE table_code = $1", [
        toCode,
      ]);

      return res.json({
        success: true,
        skipped: true,
        message: "Take Away / Delivery لا يتم حفظه في active_orders",
      });
    } catch (err) {
      console.error("🚨 خطأ أثناء تنظيف Take Away / Delivery:", err);

      return res.status(500).json({
        success: false,
        error: "فشل تنظيف الطلب",
      });
    }
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const toCaptainName = toOrder.captainName || null;
    const toCustomerName = toOrder.customerName || null;

    // =========================================================
    // 1. تحديث / إنشاء الطاولة الجديدة
    // =========================================================

    const upsertToQuery = `
      INSERT INTO active_orders (
        table_code,
        state,
        order_data,
        updated_at,
        captain_name,
        customer_name
      )
      VALUES ($1, $2, $3, $4, $5, $6)

      ON CONFLICT (table_code)
      DO UPDATE SET
        state = $2,
        order_data = $3,
        updated_at = $4,
        captain_name = $5,
        customer_name = $6;
    `;

    await client.query(upsertToQuery, [
      toCode,
      toOrder.state || "active",
      JSON.stringify(toOrder),
      Date.now(),
      toCaptainName,
      toCustomerName,
    ]);

    // =========================================================
    // 2. تحديث / حذف الطاولة القديمة
    // =========================================================

    if (!fromOrder || !fromOrder.items || fromOrder.items.length === 0) {
      await client.query("DELETE FROM active_orders WHERE table_code = $1", [
        fromCode,
      ]);
    } else {
      const fromCaptainName = fromOrder.captainName || null;

      const fromCustomerName = fromOrder.customerName || null;

      const updateFromQuery = `
        UPDATE active_orders
        SET
          order_data = $1,
          updated_at = $2,
          captain_name = $4,
          customer_name = $5
        WHERE table_code = $3;
      `;

      await client.query(updateFromQuery, [
        JSON.stringify(fromOrder),
        Date.now(),
        fromCode,
        fromCaptainName,
        fromCustomerName,
      ]);
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "تم تحويل الأصناف بنجاح",
    });
  } catch (err) {
    await client.query("ROLLBACK");

    console.error("🚨 خطأ أثناء تحويل الأصناف:", err);

    res.status(500).json({
      success: false,
      error: "فشل التحويل في قاعدة البيانات",
    });
  } finally {
    client.release();
  }
});

// 🌟 مسار تحويل الكابتن المسؤول عن الطاولة النشطة في قاعدة البيانات
app.post("/api/pos/orders/transfer-captain", async (req, res) => {
  const { tableCode, newCaptainName } = req.body;
  if (!tableCode || !newCaptainName) {
    return res
      .status(400)
      .json({ success: false, error: "كود الطاولة واسم الكابتن مطلوبان" });
  }

  try {
    const resOrder = await pool.query(
      "SELECT order_data FROM active_orders WHERE table_code = $1",
      [tableCode],
    );

    if (resOrder.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "الطاولة غير نشطة في السيرفر حالياً" });
    }

    // قراءة الأوردر سواء كان متخزن JSONB أو TEXT
    let orderData =
      typeof resOrder.rows[0].order_data === "string"
        ? JSON.parse(resOrder.rows[0].order_data)
        : resOrder.rows[0].order_data;

    // تغيير اسم الكابتن داخل الـ JSON
    orderData.captainName = newCaptainName;

    // 👇 تحديث الـ JSON وتحديث عمود captain_name معاً
    await pool.query(
      `UPDATE active_orders 
       SET order_data = $1, updated_at = $2, captain_name = $4 
       WHERE table_code = $3`,
      [JSON.stringify(orderData), Date.now(), tableCode, newCaptainName],
    );

    res.json({
      success: true,
      message: `تم نقل الطاولة ${tableCode} إلى الكابتن ${newCaptainName} بنجاح`,
    });
  } catch (err) {
    console.error("🚨 خطأ أثناء تحويل الكابتن في الداتابيز:", err);
    res
      .status(500)
      .json({ success: false, error: "فشل تحويل الكابتن في قاعدة البيانات" });
  }
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////// Vertify Captian /////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.post("/api/pos/verify-captain", async (req, res) => {
  const { password, expectedCaptainName } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, error: "الرمز السري مطلوب" });
  }

  try {
    // 🌟 توليد الهاش عشان ندعم الكباتن القدام (الهاش) والجداد (الصافي) مع بعض
    const hashedInput = crypto
      .createHash("sha256")
      .update(String(password))
      .digest("hex");

    // 1. نبحث بالباسوورد الصافي أو الهاش وتكون رتبته كابتن صالة
    const result = await pool.query(
      "SELECT name, role FROM employees WHERE (pin_hash = $1 OR pin_hash = $2) AND role = 'كابتن صالة' LIMIT 1",
      [String(password), hashedInput],
    );

    if (result.rows.length > 0) {
      const foundCaptainName = result.rows[0].name;

      if (expectedCaptainName && expectedCaptainName !== foundCaptainName) {
        return res.status(403).json({
          success: false,
          error: `عفواً، هذه الطاولة محصورة لبصمة كابتن: ${expectedCaptainName}`,
        });
      }

      return res.json({ success: true, captainName: foundCaptainName });
    } else {
      return res
        .status(401)
        .json({ success: false, error: "رمز كابتن غير صحيح أو غير مصرح له" });
    }
  } catch (err) {
    console.error("🚨 خطأ أثناء التحقق من الكابتن:", err.message);
    res.status(500).json({ success: false, error: "حدث خطأ في السيرفر" });
  }
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////// Add Customer /////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// 🌟 مسار حفظ عميل جديد
app.post("/api/customers", async (req, res) => {
  const { id, name, phone, address, orderCount, createdAt } = req.body;
  try {
    await pool.query(
      "INSERT INTO customers (id, name, phone, address, order_count, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, name, phone, address, orderCount || 0, new Date(createdAt)],
    );
    res.status(201).json({ success: true, message: "تم حفظ العميل بنجاح" });
  } catch (err) {
    console.error("❌ خطأ أثناء حفظ العميل:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🌟 مسار تحديث بيانات العميل
app.put("/api/customers/:id", async (req, res) => {
  const { id } = req.params;
  const { name, phone, address } = req.body;
  try {
    await pool.query(
      "UPDATE customers SET name = $1, phone = $2, address = $3 WHERE id = $4",
      [name, phone, address, id],
    );
    res.json({ success: true, message: "تم تحديث العميل بنجاح" });
  } catch (err) {
    console.error("❌ خطأ أثناء تحديث العميل:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// 🌟 1. مسار جلب كل العملاء (عشان الأجهزة التانية تشوفهم لحظياً)
app.get("/api/customers", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 100);

    const offset = (page - 1) * limit;

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        phone,
        address,
        order_count,
        created_at,
        COUNT(*) OVER() AS total_count
      FROM customers
      WHERE
        $1 = ''
        OR name ILIKE '%' || $1 || '%'
        OR phone ILIKE '%' || $1 || '%'
        OR address ILIKE '%' || $1 || '%'
      ORDER BY
        CASE
          WHEN LOWER(TRIM(name)) = 'زبون' THEN 0
          WHEN LOWER(TRIM(name)) = 'عميل' THEN 1
          ELSE 2
        END,
        order_count DESC,
        name ASC
      LIMIT $2
      OFFSET $3
      `,
      [search, limit, offset],
    );

    const total =
      result.rows.length > 0 ? Number(result.rows[0].total_count) || 0 : 0;

    const customers = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone || "",
      address: row.address || "",
      orderCount: Number(row.order_count) || 0,
      createdAt: new Date(row.created_at).getTime(),
    }));

    res.json({
      customers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("❌ خطأ أثناء جلب العملاء:", err.message);

    res.status(500).json({
      error: "فشل جلب العملاء",
    });
  }
});
// 🌟 2. مسار تزويد عداد طلبات العميل
app.patch("/api/customers/:id/increment", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE customers SET order_count = order_count + 1 WHERE id = $1 RETURNING *",
      [id],
    );
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "العميل غير موجود" });
    }
    res.json({ success: true, customer: result.rows[0] });
  } catch (err) {
    console.error("❌ خطأ أثناء تزويد عداد العميل:", err.message);
    res.status(500).json({ success: false, error: "فشل تحديث العداد" });
  }
});
// 🌟 مسار جلب أرشيف الشيفتات بالكامل لصفحة الإعدادات
app.get("/api/pos/shifts-archive", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, cashier_id, cashier_name, opened_at, closed_at, initial_cash, actual_cash, state FROM shifts ORDER BY opened_at DESC",
    );

    // تحويل الأسماء لـ camelCase عشان الفرونت إند يفهمها علطول
    const formattedShifts = result.rows.map((row) => ({
      id: row.id,
      cashierId: row.cashier_id,
      cashierName: row.cashier_name,
      openedAt: row.opened_at ? Number(row.opened_at) : null,
      closedAt: row.closed_at ? Number(row.closed_at) : null,
      initialCash: Number(row.initial_cash) || 0,
      actualCash: Number(row.actual_cash) || 0,
      state: row.state,
    }));

    res.json(formattedShifts);
  } catch (err) {
    console.error("❌ خطأ أثناء جلب أرشيف الشيفتات:", err.message);
    res.status(500).json({ error: "فشل جلب أرشيف الشيفتات" });
  }
});
// 🌟 مسار تحديث وخصم المخازن الفرعية من قاعدة البيانات
app.post("/api/inventory/deduct-substock", async (req, res) => {
  const { department, items } = req.body; // items = [{ itemId, baseQty }]

  if (!department || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: "بيانات غير مكتملة" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const item of items) {
      // 🌟 تم تصحيح اسم الجدول لـ department_stock والعمود لـ qty
      const queryText = `
        UPDATE department_stock 
        SET qty = COALESCE(qty, 0) - $1 
        WHERE item_id = $2 AND department = $3
      `;
      await client.query(queryText, [item.baseQty, item.itemId, department]);
    }

    await client.query("COMMIT");
    res.json({
      success: true,
      message: "تم خصم الكميات من قاعدة البيانات بنجاح!",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ خطأ أثناء خصم المخزن من الداتابيز:", err.message);
    res.status(500).json({ error: "فشل تحديث كميات المخزن في قاعدة البيانات" });
  } finally {
    client.release();
  }
});

app.post("/api/print-kitchen", async (req, res) => {
  try {
    const result = await kitchenPrinter(req.body);

    res.json({
      success: true,
      printedItems: result?.printedItems || [],
    });
  } catch (err) {
    console.error("❌ KITCHEN PRINT ERROR:", err);

    res.status(500).json({
      success: false,
      error: err?.message || "Kitchen printer failed",
    });
  }
});
// ============================================================================
// 🖨️ مسارات إدارة الطابعات والشبكة (Printers Settings)
// ============================================================================

// 1. جلب كل الطابعات المسجلة في قاعدة البيانات
app.get("/api/printers", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM printers ORDER BY id ASC");
    // تحويل صيغة أسم الأعمدة (snake_case) לצيغة الرياكت (camelCase)
    const formattedPrinters = result.rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      ip: row.ip,
      port: String(row.port),
      targetDept: row.target_dept,
    }));
    res.json(formattedPrinters);
  } catch (err) {
    console.error("❌ خطأ في جلب الطابعات من الداتابيز:", err.message);
    res.status(500).json({ error: "فشل جلب إعدادات الطابعات" });
  }
});

// 2. مزامنة وحفظ الطابعات دفعة واحدة (Bulk Sync)
app.post("/api/printers/bulk", async (req, res) => {
  const printers = req.body; // استلام مصفوفة الطابعات بالكامل

  if (!Array.isArray(printers)) {
    return res
      .status(400)
      .json({ error: "البيانات المرسلة يجب أن تكون مصفوفة" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN"); // بداية عملية المزامنة المحكمة

    // مسح القائمة القديمة لإعادة تشكيلها بما يطابق الفرونت إند تماماً
    await client.query("DELETE FROM printers");

    // إدخال الطابعات الجديدة
    for (const p of printers) {
      const query = `
        INSERT INTO printers (id, name, ip, port, target_dept)
        VALUES ($1, $2, $3, $4, $5)
      `;
      await client.query(query, [
        String(p.id || Date.now()),
        p.name || "طابعة بدون اسم",
        p.ip || "127.0.0.1",
        Number(p.port) || 9100,
        p.targetDept || "مطبخ",
      ]);
    }

    await client.query("COMMIT"); // اعتماد الحفظ بنجاح
    console.log("🖨️ تم تحديث جدول الطابعات في الداتابيز بنجاح!");
    res.json({ success: true, message: "تم حفظ الطابعات في قاعدة البيانات" });
  } catch (err) {
    await client.query("ROLLBACK"); // التراجع في حالة حدوث خطأ
    console.error("🚨 خطأ أثناء حفظ الطابعات بالداتابيز:", err.message);
    res.status(500).json({ error: "فشل حفظ الطابعات في قاعدة البيانات" });
  } finally {
    client.release();
  }
});

// إعداد مسار مؤقت لاستقبال ملفات الـ Backup
const upload = multer({ dest: os.tmpdir() });

// ==========================================
// 📦 مسارات النسخ الاحتياطي والاستعادة بصيغة SQL
// ==========================================

// مسار PostgreSQL من بيئة العمل (إن وُجد)
const getPgToolPath = (toolName) => {
  return process.env.PG_BIN_PATH
    ? `"${path.join(process.env.PG_BIN_PATH, toolName)}"`
    : toolName; // لو مش موجود في .env هيحاول يشغله افتراضياً
};

// 1️⃣ مسار إنشاء وحفظ نسخة احتياطية (Save Backup / Download)
app.get("/api/backup/download", (req, res) => {
  const dbUser = process.env.DB_USER || "postgres";
  const dbHost = process.env.DB_HOST || "localhost";
  const dbName = process.env.DB_DATABASE || "mall_erp";
  const dbPass = process.env.DB_PASSWORD || "123456";
  const dbPort = process.env.DB_PORT || 5432;

  const fileName = `backup_${dbName}_${new Date().toISOString().slice(0, 10)}.sql`;
  const filePath = path.join(os.tmpdir(), fileName);

  // تحديد أداة pg_dump ديناميكياً
  const pgDump = getPgToolPath("pg_dump");
  const dumpCmd = `${pgDump} -U ${dbUser} -h ${dbHost} -p ${dbPort} -d ${dbName} --clean --if-exists -f "${filePath}"`;

  exec(
    dumpCmd,
    { env: { ...process.env, PGPASSWORD: dbPass } },
    (error, stdout, stderr) => {
      if (error) {
        console.error(
          "❌ خطأ أثناء إنشاء النسخة الاحتياطية (التفاصيل):",
          stderr || error.message,
        );
        return res.status(500).json({
          error:
            "فشل إنشاء النسخة الاحتياطية من قاعدة البيانات. تأكد من مسار PG_BIN_PATH في ملف .env",
        });
      }
      if (!fs.existsSync(filePath)) {
        return res.status(500).json({
          error: "Backup file was not created.",
        });
      }
      res.download(filePath, fileName, (err) => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    },
  );
});

// 2️⃣ مسار استعادة النسخة الاحتياطية (Restore Backup)
app.post("/api/backup/restore", upload.single("backupFile"), (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "لم يتم رفع أي ملف، يرجى المحاولة مرة أخرى." });
  }

  const filePath = req.file.path;

  const dbUser = process.env.DB_USER || "postgres";
  const dbHost = process.env.DB_HOST || "localhost";
  const dbName = process.env.DB_NAME || "mall_erp";
  const dbPass = process.env.DB_PASSWORD || "123456";
  const dbPort = process.env.DB_PORT || 5432;

  // تحديد أداة psql ديناميكياً
  const psqlTool = getPgToolPath("psql");
  const restoreCmd = `${psqlTool} -U ${dbUser} -h ${dbHost} -p ${dbPort} -d ${dbName} -f "${filePath}"`;

  exec(
    restoreCmd,
    { env: { ...process.env, PGPASSWORD: dbPass } },
    (error, stdout, stderr) => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      if (error) {
        console.error(
          "❌ خطأ في عملية الاستعادة (التفاصيل):",
          stderr || error.message,
        );
        return res.status(500).json({
          error:
            "فشلت عملية استعادة البيانات. تأكد من مسار PG_BIN_PATH وصلاحيات الملف.",
        });
      }

      res.json({
        success: true,
        message: "تمت استعادة النسخة الاحتياطية بنجاح 100%!",
      });
    },
  );
});
async function ensureDatabaseTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS table_locks (
        table_code TEXT PRIMARY KEY,
        terminal_id TEXT NOT NULL,
        locked_at BIGINT NOT NULL
      );
    `);

    console.log("✅ table_locks table is ready");
  } catch (err) {
    console.error("❌ Failed to create table_locks:", err);
    throw err;
  }
}

ensureDatabaseTables().catch((err) => {
  console.error("🚨 Database initialization failed:", err);
  process.exit(1);
});
// =========================================================
// 🛡️ HEALTH CHECK - للـ Watchdog
// =========================================================
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      ok: true,
      database: true,
    });
  } catch (err) {
    console.error("❌ Health check failed:", err.message);

    res.status(503).json({
      ok: false,
      database: false,
    });
  }
});

const PORT = 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on all network interfaces on port ${PORT}`);
});
