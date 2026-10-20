import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

dotenv.config();
const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || "0.0.0.0";
const API_TOKEN = String(process.env.API_TOKEN || "").trim();
// Keep this secret server-side only; never use VITE_API_TOKEN to sign employee sessions.

const pool = new Pool({
  user: process.env.DB_USER || "mobile_store_app",
  host: process.env.DB_HOST || "127.0.0.1",
  database: process.env.DB_DATABASE || "mobile_store_db",
  password: process.env.DB_PASSWORD || "",
  port: Number(process.env.DB_PORT || 5432),
  options: "-c timezone=Africa/Cairo",
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  application_name: "mobile-system-api",
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/") || req.path === "/api/health" || !API_TOKEN)
    return next();
  const header = String(req.headers.authorization || "");
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(API_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res
      .status(401)
      .json({ error: "غير مصرح بالوصول إلى API. راجع API_TOKEN." });
  }
  next();
});

const newId = (prefix = "") => `${prefix}${crypto.randomUUID()}`;
const nowMs = () => Date.now();
const asText = (value, fallback = "") =>
  value == null ? fallback : String(value).trim();
const asNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const money = (value) =>
  Math.round((asNumber(value) + Number.EPSILON) * 100) / 100;
const keyText = (value) =>
  asText(value).normalize("NFKC").toLocaleLowerCase("en-US");
const validEnum = (value, choices, field) => {
  if (!choices.includes(value))
    throw httpError(400, `قيمة ${field} غير صحيحة.`);
  return value;
};
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* preserve original error */
    }
    throw error;
  } finally {
    client.release();
  }
}

// ---- Employee identity, PIN verification, signed sessions, and role policy ----
const EMPLOYEE_ROLES = new Set([
  "worker",
  "accountant",
  "manager",
  "owner",
  "developer",
]);
const ROLE_WEIGHTS = {
  worker: 1,
  accountant: 2,
  manager: 3,
  owner: 4,
  developer: 5,
};
const EMPLOYEE_SESSION_TTL_SECONDS = Math.max(
  300,
  Math.min(
    8 * 60 * 60,
    Number(process.env.EMPLOYEE_SESSION_TTL_SECONDS) || 1800,
  ),
);
const employeeLoginAttempts = new Map();
const EMPLOYEE_LOGIN_MAX_ATTEMPTS = 8;
const EMPLOYEE_LOGIN_WINDOW_MS = 15 * 60 * 1000;

function constantTimeTextEqual(left, right) {
  const a = Buffer.from(String(left ?? ""));
  const b = Buffer.from(String(right ?? ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function employeeRole(value, { legacyFallback = false } = {}) {
  const role = keyText(value);
  const aliases = new Map([
    ["worker", "worker"],
    ["عامل", "worker"],
    ["موظف", "worker"],
    ["cashier", "worker"],
    ["كاشير", "worker"],
    ["waiter", "worker"],
    ["كابتن صالة", "worker"],
    ["accountant", "accountant"],
    ["محاسب", "accountant"],
    ["manager", "manager"],
    ["مدير", "manager"],
    ["owner", "owner"],
    ["مالك", "owner"],
    ["developer", "developer"],
    ["مبرمج", "developer"],
    ["مطور", "developer"],
  ]);
  const normalized = aliases.get(role);
  if (normalized && EMPLOYEE_ROLES.has(normalized)) return normalized;
  if (legacyFallback) return "worker";
  throw httpError(400, "دور الموظف غير صحيح.");
}

function employeeSessionSecret() {
  const secret = String(process.env.EMPLOYEE_SESSION_SECRET || "").trim();
  if (secret.length < 32) {
    throw httpError(
      503,
      "نظام جلسات الموظفين غير مُعد. اضبط EMPLOYEE_SESSION_SECRET في ملف .env (32 حرفًا على الأقل).",
    );
  }
  return secret;
}

function deriveEmployeePin(pin, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      String(pin),
      String(salt),
      64,
      { maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) return reject(error);
        resolve(key.toString("base64url"));
      },
    );
  });
}

async function hashEmployeePin(pin) {
  const salt = crypto.randomBytes(16).toString("base64url");
  return { pinSalt: salt, pinHash: await deriveEmployeePin(pin, salt) };
}

async function verifyEmployeePin(pin, row) {
  if (!row?.pin_salt || !row?.pin_hash) return false;
  const computed = await deriveEmployeePin(pin, row.pin_salt);
  return constantTimeTextEqual(computed, row.pin_hash);
}

function createEmployeeSession(employee) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: employee.id,
    iat: nowSeconds,
    exp: nowSeconds + EMPLOYEE_SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", employeeSessionSecret())
    .update(encoded)
    .digest("base64url");
  return {
    token: `${encoded}.${signature}`,
    expiresAt: payload.exp * 1000,
  };
}

function readEmployeeSession(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  let payload;
  try {
    const expected = crypto
      .createHmac("sha256", employeeSessionSecret())
      .update(parts[0])
      .digest("base64url");
    if (!constantTimeTextEqual(expected, parts[1])) return null;
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof payload?.sub !== "string" ||
    !Number.isFinite(payload?.exp) ||
    payload.exp <= Math.floor(Date.now() / 1000)
  )
    return null;
  return payload;
}

function employeeSafeRecord(row) {
  return {
    id: row.id,
    name: row.name,
    role: employeeRole(row.role, { legacyFallback: true }),
    managerId: row.manager_id || null,
    isActive: Boolean(row.is_active),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

function validateEmployeeName(value) {
  const name = asText(value);
  if (name.length < 2 || name.length > 100) {
    throw httpError(400, "اسم الموظف يجب أن يكون من حرفين إلى 100 حرف.");
  }
  return name;
}

function validateNewPin(value) {
  const pin = String(value ?? "");
  if (!/^\d{4,12}$/.test(pin)) {
    throw httpError(400, "الرقم السري الجديد يجب أن يتكون من 4 إلى 12 رقمًا.");
  }
  return pin;
}

function employeeAttemptKeys(req, name) {
  return [
    `ip:${req.ip || "unknown"}`,
    `account:${req.ip || "unknown"}:${keyText(name)}`,
  ];
}

function loginIsLimited(keys) {
  const now = Date.now();
  return keys.some((key) => {
    const entry = employeeLoginAttempts.get(key);
    if (!entry || now - entry.startedAt > EMPLOYEE_LOGIN_WINDOW_MS) {
      employeeLoginAttempts.delete(key);
      return false;
    }
    return Boolean(entry.lockedUntil && entry.lockedUntil > now);
  });
}

function recordEmployeeLoginFailure(keys) {
  const now = Date.now();
  for (const key of keys) {
    let entry = employeeLoginAttempts.get(key);
    if (!entry || now - entry.startedAt > EMPLOYEE_LOGIN_WINDOW_MS) {
      entry = { failures: 0, startedAt: now, lockedUntil: 0 };
    }
    entry.failures += 1;
    if (entry.failures >= EMPLOYEE_LOGIN_MAX_ATTEMPTS) {
      entry.lockedUntil = now + EMPLOYEE_LOGIN_WINDOW_MS;
    }
    employeeLoginAttempts.set(key, entry);
  }
}

function clearEmployeeLoginFailures(keys) {
  for (const key of keys) employeeLoginAttempts.delete(key);
}

async function requireEmployeeSession(req, res, next) {
  try {
    employeeSessionSecret();
    const payload = readEmployeeSession(
      asText(req.headers["x-employee-session"]),
    );
    if (!payload) {
      return res.status(401).json({
        error: "جلسة الموظف غير صالحة أو انتهت. سجّل الدخول مرة أخرى.",
      });
    }
    const result = await pool.query(
      "SELECT id,name,role,manager_id,is_active,created_at,updated_at FROM employees WHERE id=$1",
      [payload.sub],
    );
    const row = result.rows[0];
    if (!row || !row.is_active) {
      return res
        .status(401)
        .json({ error: "حساب الموظف غير نشط أو غير موجود." });
    }
    req.employee = employeeSafeRecord(row);
    next();
  } catch (error) {
    next(error);
  }
}

function requireEmployeeRoles(...roles) {
  return (req, res, next) => {
    if (!req.employee || !roles.includes(req.employee.role)) {
      return res.status(403).json({ error: "ليس لديك صلاحية لتنفيذ العملية." });
    }
    next();
  };
}

async function migrateLegacyEmployees() {
  const result = await pool.query(
    "SELECT id,name,role,pin_salt,pin_hash,name_key,manager_id,is_active FROM employees",
  );
  for (const row of result.rows) {
    const normalizedRole = employeeRole(row.role, { legacyFallback: true });
    const normalizedNameKey = keyText(row.name);
    let pinSalt = row.pin_salt;
    let pinHash = row.pin_hash;
    // Older app versions stored the clear PIN in pin_hash. Hash it once before serving routes.
    if (!pinSalt && pinHash != null && String(pinHash).length > 0) {
      const upgraded = await hashEmployeePin(String(pinHash));
      pinSalt = upgraded.pinSalt;
      pinHash = upgraded.pinHash;
    }
    await pool.query(
      `UPDATE employees
       SET name_key=$2, role=$3, pin_salt=$4, pin_hash=$5,
           manager_id=CASE WHEN $3 IN ('owner','developer') THEN NULL ELSE manager_id END,
           is_active=COALESCE(is_active,TRUE), updated_at=COALESCE(updated_at,$6)
       WHERE id=$1`,
      [row.id, normalizedNameKey, normalizedRole, pinSalt, pinHash, nowMs()],
    );
  }
}

function normalizeBrandInput(input) {
  const name = asText(input?.name || input?.brand);
  if (!name) throw httpError(400, "اسم الماركة مطلوب.");
  const rawSeries = Array.isArray(input?.series) ? input.series : [];
  const series = rawSeries.flatMap((entry) => {
    if (typeof entry === "string")
      return entry.trim() ? [{ name: entry.trim(), models: [] }] : [];
    if (!entry || typeof entry !== "object") return [];
    const sName = asText(entry.name);
    if (!sName) return [];
    const models = Array.isArray(entry.models)
      ? entry.models
          .map((v) =>
            typeof v === "object" ? asText(v?.name || v?.model) : asText(v),
          )
          .filter(Boolean)
      : [];
    return [{ name: sName, models }];
  });
  const oldModels = Array.isArray(input?.models)
    ? input.models
        .map((v) =>
          typeof v === "object" ? asText(v?.name || v?.model) : asText(v),
        )
        .filter(Boolean)
    : [];
  if (oldModels.length) {
    const general = series.find((s) => keyText(s.name) === keyText("عام"));
    if (general)
      general.models = [...new Set([...general.models, ...oldModels])];
    else series.push({ name: "عام", models: oldModels });
  }
  if (!series.length) series.push({ name: "عام", models: [] });
  return { id: asText(input?.id) || newId("brand-"), name, series };
}

async function ensureBrand(client, id, name) {
  const cleanName = asText(name);
  if (!cleanName) throw httpError(400, "اسم الماركة مطلوب.");
  const cleanId = asText(id);
  if (cleanId) {
    const byId = await client.query("SELECT id FROM brands WHERE id=$1", [
      cleanId,
    ]);
    if (byId.rowCount) {
      const updated = await client.query(
        "UPDATE brands SET name=$2,name_key=$3 WHERE id=$1 RETURNING id,name",
        [cleanId, cleanName, keyText(cleanName)],
      );
      return updated.rows[0];
    }
  }
  const result = await client.query(
    `INSERT INTO brands(id, name, name_key) VALUES($1,$2,$3)
     ON CONFLICT(name_key) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [cleanId || newId("brand-"), cleanName, keyText(cleanName)],
  );
  return result.rows[0];
}
async function ensureSeries(client, brandId, name, preferredId = "") {
  const cleanName = asText(name) || "عام";
  const result = await client.query(
    `INSERT INTO brand_series(id, brand_id, name, name_key) VALUES($1,$2,$3,$4)
     ON CONFLICT(brand_id, name_key) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [
      asText(preferredId) || newId("series-"),
      brandId,
      cleanName,
      keyText(cleanName),
    ],
  );
  return result.rows[0];
}
async function ensureModel(client, brandId, seriesId, name) {
  const cleanName = asText(name);
  if (!cleanName) throw httpError(400, "اسم الموديل مطلوب.");
  const result = await client.query(
    `INSERT INTO brand_models(id, brand_id, series_id, name, name_key) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(series_id, name_key) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [newId("model-"), brandId, seriesId, cleanName, keyText(cleanName)],
  );
  return result.rows[0];
}
async function saveBrandObject(client, input) {
  const value = normalizeBrandInput(input);
  const brand = await ensureBrand(client, value.id, value.name);
  for (const seriesData of value.series) {
    const series = await ensureSeries(client, brand.id, seriesData.name);
    for (const modelName of [...new Set(seriesData.models)]) {
      await ensureModel(client, brand.id, series.id, modelName);
    }
  }
  return brand;
}
async function getBrands(client = pool) {
  const [brandRows, seriesRows, modelRows] = await Promise.all([
    client.query("SELECT id, name FROM brands ORDER BY name"),
    client.query("SELECT id, brand_id, name FROM brand_series ORDER BY name"),
    client.query(
      "SELECT brand_id, series_id, name FROM brand_models ORDER BY name",
    ),
  ]);
  return brandRows.rows.map((brand) => {
    const series = seriesRows.rows
      .filter((row) => row.brand_id === brand.id)
      .map((row) => ({
        name: row.name,
        models: modelRows.rows
          .filter((model) => model.series_id === row.id)
          .map((model) => model.name),
      }));
    const models = [...new Set(series.flatMap((item) => item.models))];
    return { id: brand.id, name: brand.name, models, series };
  });
}
async function resolveCatalog(client, brandName, seriesName, modelName) {
  const brand = await ensureBrand(client, "", brandName);
  const series = await ensureSeries(client, brand.id, seriesName || "عام");
  const model = await ensureModel(client, brand.id, series.id, modelName);
  return { brandId: brand.id, seriesId: series.id, modelId: model.id };
}
function serializeAccessoryBatch(row) {
  return {
    id: row.id,
    itemType: "accessory",
    category: row.category_name,
    brand: row.brand_name,
    productName: row.product_name,
    model: row.product_name,
    compatibleModel: row.compatible_model || "",
    variantType: row.variant_type || "",
    variantValue: row.variant_value || "",
    receivedQuantity: Number(row.received_quantity),
    availableQuantity: Number(row.available_quantity),
    unitCost: Number(row.unit_cost),
    salePrice: Number(row.sale_price),
    supplierName: row.supplier_name || "",
    receivedAt: Number(row.received_at),
  };
}

async function upsertAccessoryName(client, table, prefix, value) {
  if (!["accessory_categories", "accessory_brands"].includes(table)) {
    throw httpError(400, "نوع البيانات غير صحيح.");
  }

  const name = asText(value);
  if (!name) throw httpError(400, "الاسم مطلوب.");

  const result = await client.query(
    `INSERT INTO ${table} (id, name, name_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (name_key)
     DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [newId(prefix), name, keyText(name)],
  );

  return result.rows[0];
}
async function ensureOffer(client, input) {
  if (!input || typeof input !== "object") return null;
  const name = asText(input.name);
  if (!name) return null;
  const id = asText(input.id) || newId("offer-");
  const discountType = validEnum(
    asText(input.discountType),
    ["percent", "fixed"],
    "نوع الخصم",
  );
  const discountValue = money(asNumber(input.discountValue, NaN));
  const durationDays = Number(input.durationDays);
  const expiresAt = Number(input.expiresAt);
  if (
    !Number.isFinite(discountValue) ||
    discountValue < 0 ||
    !Number.isInteger(durationDays) ||
    durationDays < 0 ||
    !Number.isFinite(expiresAt)
  )
    throw httpError(400, "بيانات العرض غير صحيحة.");
  const found = await client.query("SELECT id FROM offers WHERE id=$1", [id]);
  if (found.rowCount) {
    const updated = await client.query(
      "UPDATE offers SET name=$2,name_key=$3,discount_type=$4,discount_value=$5,duration_days=$6,expires_at=$7 WHERE id=$1 RETURNING id",
      [
        id,
        name,
        keyText(name),
        discountType,
        discountValue,
        durationDays,
        expiresAt,
      ],
    );
    return updated.rows[0].id;
  }
  const inserted = await client.query(
    `INSERT INTO offers(id,name,name_key,discount_type,discount_value,duration_days,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(name_key) DO UPDATE SET discount_type=EXCLUDED.discount_type,discount_value=EXCLUDED.discount_value,duration_days=EXCLUDED.duration_days,expires_at=EXCLUDED.expires_at RETURNING id`,
    [
      id,
      name,
      keyText(name),
      discountType,
      discountValue,
      durationDays,
      expiresAt,
    ],
  );
  return inserted.rows[0].id;
}
async function createDevice(client, input, { importMode = false } = {}) {
  const id = asText(input?.id) || newId("device-");
  const imei = asText(input?.imei);
  const brandName = asText(input?.brand);
  const seriesName = asText(input?.series) || "عام";
  const modelName = asText(input?.model);
  if (!imei || !brandName || !modelName)
    throw httpError(400, "IMEI والماركة والموديل مطلوبون.");
  const existing = await client.query(
    "SELECT id,warehouse_batch_id,status,created_at FROM devices WHERE imei_key=$1",
    [keyText(imei)],
  );
  if (existing.rowCount && !importMode)
    throw httpError(409, "رقم IMEI مسجل بالفعل.");
  const catalog = await resolveCatalog(
    client,
    brandName,
    seriesName,
    modelName,
  );
  const offerId = input?.offer ? await ensureOffer(client, input.offer) : null;
  const batchId = asText(input?.warehouseBatchId) || null;
  let validBatchId = batchId;
  if (batchId) {
    const batch = await client.query(
      "SELECT id FROM warehouse_batches WHERE id=$1",
      [batchId],
    );
    if (!batch.rowCount) {
      if (importMode) validBatchId = null;
      else throw httpError(400, "دفعة المخزون المحددة غير موجودة.");
    }
  }
  const status = validEnum(
    asText(input?.status, existing.rows[0]?.status || "available"),
    ["available", "sold", "reserved"],
    "حالة الجهاز",
  );
  const createdAt =
    Number(input?.createdAt) || Number(existing.rows[0]?.created_at) || nowMs();
  const unitCost = money(asNumber(input?.unitCost));
  const salePrice = money(asNumber(input?.salePrice));
  const installmentPrice = money(asNumber(input?.installmentPrice, salePrice));
  if (existing.rowCount && importMode) {
    const currentId = existing.rows[0].id;
    const linkedBatchId =
      batchId === null ? existing.rows[0].warehouse_batch_id : validBatchId;
    await client.query(
      `UPDATE devices SET brand_id=$2,series_id=$3,model_id=$4,color=$5,ram=$6,storage=$7,sale_price=$8,installment_price=$9,offer_id=$10,status=$11,created_at=$12,warehouse_batch_id=$13,unit_cost=$14 WHERE id=$1`,
      [
        currentId,
        catalog.brandId,
        catalog.seriesId,
        catalog.modelId,
        asText(input?.color),
        asText(input?.ram),
        asText(input?.storage),
        salePrice,
        installmentPrice,
        offerId,
        status,
        createdAt,
        linkedBatchId,
        unitCost,
      ],
    );
    return currentId;
  }
  const insertSql = `INSERT INTO devices(id,imei,imei_key,brand_id,series_id,model_id,color,ram,storage,sale_price,installment_price,offer_id,status,created_at,warehouse_batch_id,unit_cost)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ${importMode ? "ON CONFLICT DO NOTHING" : ""} RETURNING id`;
  const result = await client.query(insertSql, [
    id,
    imei,
    keyText(imei),
    catalog.brandId,
    catalog.seriesId,
    catalog.modelId,
    asText(input?.color),
    asText(input?.ram),
    asText(input?.storage),
    salePrice,
    installmentPrice,
    offerId,
    status,
    createdAt,
    validBatchId,
    unitCost,
  ]);
  if (result.rowCount) return result.rows[0].id;
  const byImei = await client.query(
    "SELECT id FROM devices WHERE imei_key=$1",
    [keyText(imei)],
  );
  return byImei.rowCount ? byImei.rows[0].id : id;
}
async function fetchDevice(id, client = pool) {
  const result = await client.query(
    `SELECT d.*,b.name AS brand,bs.name AS series,bm.name AS model,o.name AS offer_name,o.discount_type,o.discount_value,o.duration_days,o.expires_at
     FROM devices d JOIN brands b ON b.id=d.brand_id JOIN brand_series bs ON bs.id=d.series_id JOIN brand_models bm ON bm.id=d.model_id LEFT JOIN offers o ON o.id=d.offer_id WHERE d.id=$1`,
    [id],
  );
  if (!result.rowCount) return null;
  const r = result.rows[0];
  return {
    id: r.id,
    imei: r.imei,
    brand: r.brand,
    series: r.series,
    model: r.model,
    color: r.color,
    ram: r.ram,
    storage: r.storage,
    salePrice: Number(r.sale_price),
    installmentPrice: Number(r.installment_price),
    offer: r.offer_name
      ? {
          name: r.offer_name,
          discountType: r.discount_type,
          discountValue: Number(r.discount_value),
          durationDays: Number(r.duration_days),
          expiresAt: Number(r.expires_at),
        }
      : null,
    status: r.status,
    createdAt: Number(r.created_at),
    warehouseBatchId: r.warehouse_batch_id || undefined,
    unitCost: Number(r.unit_cost),
  };
}

const BATCH_SELECT = `
  SELECT wb.id, b.name AS brand, bs.name AS series, bm.name AS model,
         wb.received_quantity, wb.available_quantity, wb.unit_cost, wb.sale_price,
         wb.supplier_name, wb.received_at,
         COALESCE((SELECT json_agg(d.imei ORDER BY d.created_at,d.id) FROM devices d WHERE d.warehouse_batch_id=wb.id), '[]'::json) AS imeis
  FROM warehouse_batches wb
  JOIN brands b ON b.id=wb.brand_id
  JOIN brand_series bs ON bs.id=wb.series_id
  JOIN brand_models bm ON bm.id=wb.model_id`;
function serializeBatch(row) {
  return {
    id: row.id,
    brand: row.brand,
    series: row.series || "عام",
    model: row.model,
    receivedQuantity: Number(row.received_quantity),
    availableQuantity: Number(row.available_quantity),
    unitCost: Number(row.unit_cost),
    salePrice: Number(row.sale_price),
    supplierName: row.supplier_name || "",
    receivedAt: Number(row.received_at),
    imeis: Array.isArray(row.imeis) ? row.imeis.map(String) : [],
  };
}
async function createBatch(client, input, { importMode = false } = {}) {
  const id = asText(input?.id) || newId("batch-");
  const brandName = asText(input?.brand);
  const seriesName = asText(input?.series, "عام") || "عام";
  const modelName = asText(input?.model);
  const quantity = Number(input?.receivedQuantity);
  const available = importMode
    ? Number(input?.availableQuantity ?? quantity)
    : quantity;
  const cost = Number(input?.unitCost);
  const price = Number(input?.salePrice);
  const imeis = Array.isArray(input?.imeis)
    ? input.imeis.map((v) => asText(v)).filter(Boolean)
    : [];
  if (!brandName || !modelName)
    throw httpError(400, "الماركة والموديل مطلوبان لدفعة المخزون.");
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    !Number.isInteger(available) ||
    available < 0 ||
    available > quantity
  )
    throw httpError(400, "كمية المخزون غير صحيحة.");
  if (
    !Number.isFinite(cost) ||
    cost < 0 ||
    !Number.isFinite(price) ||
    price < 0
  )
    throw httpError(400, "التكلفة وسعر البيع يجب أن يكونا أرقامًا غير سالبة.");
  if (imeis.length > quantity)
    throw httpError(400, "عدد أرقام IMEI أكبر من كمية الدفعة.");
  if (new Set(imeis.map(keyText)).size !== imeis.length)
    throw httpError(400, "يوجد رقم IMEI مكرر داخل الدفعة.");
  if (!importMode && imeis.length) {
    const duplicate = await client.query(
      "SELECT imei FROM devices WHERE imei_key=ANY($1::text[]) LIMIT 1",
      [imeis.map(keyText)],
    );
    if (duplicate.rowCount)
      throw httpError(409, `رقم IMEI مسجل بالفعل: ${duplicate.rows[0].imei}`);
  }
  const catalog = await resolveCatalog(
    client,
    brandName,
    seriesName,
    modelName,
  );
  const receivedAt = Number.isFinite(Number(input?.receivedAt))
    ? Number(input.receivedAt)
    : nowMs();
  const inserted = await client.query(
    `INSERT INTO warehouse_batches(id,brand_id,series_id,model_id,received_quantity,available_quantity,unit_cost,sale_price,supplier_name,received_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT(id) DO NOTHING RETURNING id`,
    [
      id,
      catalog.brandId,
      catalog.seriesId,
      catalog.modelId,
      quantity,
      available,
      money(cost),
      money(price),
      asText(input?.supplierName),
      receivedAt,
    ],
  );
  if (!inserted.rowCount) return id;
  for (const imei of imeis) {
    await client.query(
      `INSERT INTO devices(id,imei,imei_key,brand_id,series_id,model_id,color,ram,storage,sale_price,installment_price,status,created_at,warehouse_batch_id,unit_cost)
       VALUES($1,$2,$3,$4,$5,$6,'','','',$7,$7,'available',$8,$9,$10) ON CONFLICT(imei_key) DO NOTHING`,
      [
        newId("device-"),
        imei,
        keyText(imei),
        catalog.brandId,
        catalog.seriesId,
        catalog.modelId,
        money(price),
        nowMs(),
        id,
        money(cost),
      ],
    );
  }
  return id;
}
async function getBatch(id, client = pool) {
  const result = await client.query(`${BATCH_SELECT} WHERE wb.id=$1`, [id]);
  return result.rows[0] ? serializeBatch(result.rows[0]) : null;
}
async function listBatches(client = pool) {
  const result = await client.query(
    `${BATCH_SELECT} ORDER BY wb.received_at DESC, wb.id`,
  );
  return result.rows.map(serializeBatch);
}

async function upsertCustomer(client, name, phone) {
  const cleanName = asText(name) || "عميل نقدي";
  const cleanPhone = asText(phone);
  if (!cleanPhone && keyText(cleanName) === keyText("عميل نقدي")) return null;
  const phoneKey = cleanPhone
    ? keyText(cleanPhone).replace(/[\s()-]/g, "")
    : null;
  if (phoneKey) {
    const found = await client.query(
      "SELECT id FROM customers WHERE phone_key=$1",
      [phoneKey],
    );
    if (found.rowCount) {
      const updated = await client.query(
        "UPDATE customers SET name=$2, phone=$3, updated_at=$4 WHERE id=$1 RETURNING id",
        [found.rows[0].id, cleanName, cleanPhone, nowMs()],
      );
      return updated.rows[0].id;
    }
  }
  const id = newId("customer-");
  const result = await client.query(
    `INSERT INTO customers(id,name,phone,phone_key) VALUES($1,$2,$3,$4)
     ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone
     RETURNING id`,
    [id, cleanName, cleanPhone, phoneKey],
  );
  return result.rows[0].id;
}

function serializeSaleItem(row) {
  return {
    deviceId: row.id,
    brand: row.brand,
    series: row.series,
    model: row.model,
    color: row.color,
    ram: row.ram,
    storage: row.storage,
    originalPrice: Number(row.original_price),
    cashPrice: Number(row.cash_price),
    installmentPrice: Number(row.installment_price),
    cashFinalPrice: Number(row.cash_final_price),
    installmentFinalPrice: Number(row.installment_final_price),
    finalPrice: Number(row.final_price),
    offerName: row.offer_name,
    quantity: Number(row.quantity),
    warehouseBatchId: row.warehouse_batch_id || undefined,
    unitCost: Number(row.unit_cost),
    isNewStock: Boolean(row.is_new_stock),
    returnedQuantity: Number(row.returned_quantity || 0),
    itemType: row.item_type === "accessory" ? "accessory" : "mobile",
    accessoryBatchId: row.accessory_batch_id || undefined,
    accessoryCategory: row.accessory_category || undefined,
    accessoryBrand: row.accessory_brand || undefined,
    compatibleModel: row.compatible_model || undefined,
    variantType: row.variant_type || undefined,
    variantValue: row.variant_value || undefined,
  };
}
function serializeInstallment(row) {
  return {
    number: Number(row.installment_number),
    amount: Number(row.amount),
    dueDate:
      typeof row.due_date === "string"
        ? row.due_date.slice(0, 10)
        : new Date(row.due_date).toISOString().slice(0, 10),
    paid: Boolean(row.paid),
    paidAmount: Number(row.paid_amount),
  };
}
async function fetchSales(
  { id = null, query = "", limit = 1000 } = {},
  client = pool,
) {
  const filters = [];
  const params = [];
  if (id) {
    params.push(id);
    filters.push(`s.id=$${params.length}`);
  }
  if (query) {
    params.push(`%${query}%`);
    const p = `$${params.length}`;
    filters.push(
      `(s.invoice_number ILIKE ${p} OR s.customer_name ILIKE ${p} OR s.customer_phone ILIKE ${p} OR EXISTS (SELECT 1 FROM sale_items sx WHERE sx.sale_id=s.id AND (sx.brand ILIKE ${p} OR sx.model ILIKE ${p})))`,
    );
  }
  params.push(Math.max(1, Math.min(5000, Number(limit) || 1000)));
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const salesRes = await client.query(
    `SELECT s.* FROM sales s ${where} ORDER BY s.created_at DESC, s.invoice_number DESC LIMIT $${params.length}`,
    params,
  );
  if (!salesRes.rowCount) return id ? null : [];
  const ids = salesRes.rows.map((row) => row.id);
  const [itemsRes, installmentsRes] = await Promise.all([
    client.query(
      `SELECT si.*, COALESCE((SELECT SUM(r.quantity_returned) FROM returns r WHERE r.sale_item_id=si.id),0) AS returned_quantity
       FROM sale_items si WHERE si.sale_id=ANY($1::text[]) ORDER BY si.sale_id,si.line_number`,
      [ids],
    ),
    client.query(
      "SELECT * FROM sale_installments WHERE sale_id=ANY($1::text[]) ORDER BY sale_id,installment_number",
      [ids],
    ),
  ]);
  const itemsBySale = new Map();
  for (const row of itemsRes.rows) {
    if (!itemsBySale.has(row.sale_id)) itemsBySale.set(row.sale_id, []);
    itemsBySale.get(row.sale_id).push(serializeSaleItem(row));
  }
  const installmentsBySale = new Map();
  for (const row of installmentsRes.rows) {
    if (!installmentsBySale.has(row.sale_id))
      installmentsBySale.set(row.sale_id, []);
    installmentsBySale.get(row.sale_id).push(serializeInstallment(row));
  }
  const mapped = salesRes.rows.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    createdAt: Number(row.created_at),
    items: itemsBySale.get(row.id) || [],
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    paymentMethod: row.payment_method,
    total: Number(row.total),
    amountPaid: Number(row.amount_paid),
    remainingAmount: Number(row.remaining_amount),
    returnBalanceReduced: Number(row.return_balance_reduced),
    originalInstallmentAmount:
      row.original_installment_amount == null
        ? undefined
        : Number(row.original_installment_amount),
    installmentsCount: Number(row.installments_count),
    installments: installmentsBySale.get(row.id) || [],
    notes: row.notes || "",
    status: row.status,
  }));
  return id ? mapped[0] || null : mapped;
}

async function createSale(
  client,
  input,
  { importMode = false, updateStock = true } = {},
) {
  const id = asText(input?.id) || newId("sale-");
  const invoiceNumber =
    asText(input?.invoiceNumber) ||
    `INV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomInt(10000, 99999)}`;
  const paymentMethod = validEnum(
    asText(input?.paymentMethod),
    ["cash", "credit", "installment"],
    "طريقة الدفع",
  );
  const items = Array.isArray(input?.items) ? input.items : [];
  if (!items.length)
    throw httpError(400, "الفاتورة لازم تحتوي على بند واحد على الأقل.");
  const customerName = asText(input?.customerName) || "عميل نقدي";
  const customerPhone = asText(input?.customerPhone);
  const customerId = await upsertCustomer(client, customerName, customerPhone);
  let calculatedTotal = 0;
  const normalizedItems = items.map((item, index) => {
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1)
      throw httpError(400, `كمية البند رقم ${index + 1} غير صحيحة.`);
    const cashFinal = money(
      asNumber(
        item?.cashFinalPrice,
        asNumber(item?.finalPrice, asNumber(item?.cashPrice)),
      ),
    );
    const installmentFinal = money(
      asNumber(
        item?.installmentFinalPrice,
        asNumber(item?.finalPrice, asNumber(item?.installmentPrice)),
      ),
    );
    const chosenPrice =
      paymentMethod === "installment" ? installmentFinal : cashFinal;
    if (chosenPrice < 0 || !Number.isFinite(chosenPrice))
      throw httpError(400, "سعر أحد البنود غير صحيح.");
    calculatedTotal += chosenPrice * quantity;
    return {
      id: asText(item?.deviceId) || newId("sale-item-"),
      lineNumber: index,
      brand: asText(item?.brand),
      series: asText(item?.series) || "عام",
      model: asText(item?.model),
      color: asText(item?.color),
      ram: asText(item?.ram),
      storage: asText(item?.storage),
      originalPrice: money(asNumber(item?.originalPrice)),
      cashPrice: money(asNumber(item?.cashPrice, cashFinal)),
      installmentPrice: money(
        asNumber(item?.installmentPrice, installmentFinal),
      ),
      cashFinalPrice: cashFinal,
      installmentFinalPrice: installmentFinal,
      finalPrice: money(asNumber(item?.finalPrice, chosenPrice)),
      offerName: asText(item?.offerName),
      quantity,
      batchId: asText(item?.warehouseBatchId) || null,
      unitCost: money(asNumber(item?.unitCost)),
      isNewStock: Boolean(item?.isNewStock),
      chosenPrice,
      itemType:
        asText(item?.itemType, "mobile") === "accessory"
          ? "accessory"
          : "mobile",

      accessoryBatchId: asText(item?.accessoryBatchId) || null,
      accessoryCategory: asText(item?.accessoryCategory || item?.category),
      accessoryBrand: asText(item?.accessoryBrand || item?.brand),
      compatibleModel: asText(item?.compatibleModel),
      variantType: asText(item?.variantType),
      variantValue: asText(item?.variantValue),
    };
  });
  calculatedTotal = money(calculatedTotal);
  const createdAt = Number.isFinite(Number(input?.createdAt))
    ? Number(input.createdAt)
    : nowMs();
  const requestedPaid =
    input?.amountPaid == null
      ? paymentMethod === "cash"
        ? calculatedTotal
        : 0
      : money(Number(input.amountPaid));
  if (requestedPaid < 0 || requestedPaid > calculatedTotal + 0.01)
    throw httpError(400, "المبلغ المدفوع أكبر من إجمالي الفاتورة أو غير صحيح.");
  const amountPaid = Math.min(calculatedTotal, requestedPaid);
  const remainingAmount = money(Math.max(0, calculatedTotal - amountPaid));
  const installments =
    paymentMethod === "installment" && Array.isArray(input?.installments)
      ? input.installments
      : [];
  if (
    paymentMethod === "installment" &&
    remainingAmount > 0 &&
    installments.length === 0
  )
    throw httpError(400, "جدول الأقساط مطلوب لفاتورة التقسيط.");
  const installmentCount =
    paymentMethod === "installment"
      ? Number(input?.installmentsCount) || installments.length
      : 0;
  let originalInstallmentAmount = asNumber(input?.originalInstallmentAmount, 0);
  if (!originalInstallmentAmount && installments.length) {
    const counts = new Map();
    for (const row of installments) {
      const amount = money(asNumber(row?.amount));
      if (amount > 0) counts.set(amount, (counts.get(amount) || 0) + 1);
    }
    if (counts.size)
      originalInstallmentAmount = [...counts.entries()].sort(
        (a, b) => b[1] - a[1] || b[0] - a[0],
      )[0][0];
  }
  const status =
    remainingAmount <= 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid";

  const inserted = await client.query(
    `INSERT INTO sales(id,invoice_number,created_at,customer_id,customer_name,customer_phone,payment_method,total,amount_paid,remaining_amount,return_balance_reduced,original_installment_amount,installments_count,notes,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO NOTHING RETURNING id`,
    [
      id,
      invoiceNumber,
      createdAt,
      customerId,
      customerName,
      customerPhone,
      paymentMethod,
      calculatedTotal,
      amountPaid,
      remainingAmount,
      money(asNumber(input?.returnBalanceReduced)),
      originalInstallmentAmount > 0 ? money(originalInstallmentAmount) : null,
      installmentCount,
      asText(input?.notes),
      status,
    ],
  );
  if (!inserted.rowCount) return id;

  for (const item of normalizedItems) {
    if (updateStock && item.itemType === "accessory") {
      if (!item.accessoryBatchId) {
        throw httpError(400, "دفعة الإكسسوار مطلوبة لإتمام البيع.");
      }

      const batchRes = await client.query(
        `SELECT available_quantity
     FROM accessory_batches
     WHERE id = $1
     FOR UPDATE`,
        [item.accessoryBatchId],
      );

      if (!batchRes.rowCount) {
        throw httpError(404, "دفعة الإكسسوار غير موجودة.");
      }

      const available = Number(batchRes.rows[0].available_quantity);

      if (available < item.quantity) {
        throw httpError(
          409,
          `الكمية المتاحة من الإكسسوار هي ${available} فقط.`,
        );
      }

      await client.query(
        `UPDATE accessory_batches
     SET available_quantity = available_quantity - $2
     WHERE id = $1`,
        [item.accessoryBatchId, item.quantity],
      );
    }
    if (updateStock && item.batchId) {
      const batchRes = await client.query(
        "SELECT available_quantity FROM warehouse_batches WHERE id=$1 FOR UPDATE",
        [item.batchId],
      );
      if (!batchRes.rowCount)
        throw httpError(409, `دفعة المخزون ${item.batchId} غير موجودة.`);
      const available = Number(batchRes.rows[0].available_quantity);
      if (available < item.quantity)
        throw httpError(
          409,
          `الكمية المتاحة غير كافية في الدفعة ${item.batchId}. المتاح: ${available}.`,
        );
      await client.query(
        "UPDATE warehouse_batches SET available_quantity=available_quantity-$2,updated_at=$3 WHERE id=$1",
        [item.batchId, item.quantity, nowMs()],
      );
      const serials = await client.query(
        "SELECT id FROM devices WHERE warehouse_batch_id=$1 AND status='available' ORDER BY created_at,id LIMIT $2 FOR UPDATE",
        [item.batchId, item.quantity],
      );
      if (serials.rowCount)
        await client.query(
          "UPDATE devices SET status='sold' WHERE id=ANY($1::text[])",
          [serials.rows.map((r) => r.id)],
        );
    } else if (importMode && item.batchId) {
      // The imported batch already has its historic availableQuantity. Update only its serial statuses.
      const serials = await client.query(
        "SELECT id FROM devices WHERE warehouse_batch_id=$1 AND status='available' ORDER BY created_at,id LIMIT $2 FOR UPDATE",
        [item.batchId, item.quantity],
      );
      if (serials.rowCount)
        await client.query(
          "UPDATE devices SET status='sold' WHERE id=ANY($1::text[])",
          [serials.rows.map((r) => r.id)],
        );
    }
    await client.query(
      `INSERT INTO sale_items(id,sale_id,line_number,brand,series,model,color,ram,storage,original_price,cash_price,installment_price,cash_final_price,installment_final_price,final_price,offer_name,quantity,warehouse_batch_id,unit_cost,is_new_stock,item_type,
accessory_batch_id,
accessory_category,
accessory_brand,
compatible_model,
variant_type,
variant_value)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) ON CONFLICT(id) DO NOTHING`,
      [
        item.id,
        id,
        item.lineNumber,
        item.brand,
        item.series,
        item.model,
        item.color,
        item.ram,
        item.storage,
        item.originalPrice,
        item.cashPrice,
        item.installmentPrice,
        item.cashFinalPrice,
        item.installmentFinalPrice,
        item.finalPrice,
        item.offerName,
        item.quantity,
        item.batchId,
        item.unitCost,
        item.isNewStock,
        item.itemType,
        item.accessoryBatchId,
        item.accessoryCategory,
        item.accessoryBrand,
        item.compatibleModel,
        item.variantType,
        item.variantValue,
      ],
    );
  }
  for (const [idx, installment] of installments.entries()) {
    const number = Number(installment?.number || idx + 1);
    const amount = money(asNumber(installment?.amount));
    const dueDate = asText(installment?.dueDate);
    if (
      !Number.isInteger(number) ||
      number < 1 ||
      amount < 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)
    )
      throw httpError(400, `بيانات القسط رقم ${idx + 1} غير صحيحة.`);
    const paidAmount = Math.min(
      amount,
      Math.max(
        0,
        money(
          asNumber(installment?.paidAmount, installment?.paid ? amount : 0),
        ),
      ),
    );
    await client.query(
      `INSERT INTO sale_installments(sale_id,installment_number,amount,due_date,paid,paid_amount) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(sale_id,installment_number) DO NOTHING`,
      [
        id,
        number,
        amount,
        dueDate,
        Boolean(installment?.paid) || paidAmount >= amount,
        paidAmount,
      ],
    );
  }
  if (amountPaid > 0) {
    await client.query(
      `INSERT INTO payments(id,sale_id,installment_number,amount,record_type,created_at,note) VALUES($1,$2,NULL,$3,'initial_payment',$4,$5) ON CONFLICT(id) DO NOTHING`,
      [
        newId("payment-"),
        id,
        amountPaid,
        createdAt,
        importMode
          ? "ملخص التحصيلات المستوردة من التخزين المحلي"
          : "دفعة أولى / تحصيل عند إنشاء الفاتورة",
      ],
    );
  }
  return id;
}

function completedMonthsBetween(startValue, endDate = new Date()) {
  const start = new Date(Number(startValue));
  if (Number.isNaN(start.getTime()) || endDate < start) return 0;
  let months =
    (endDate.getFullYear() - start.getFullYear()) * 12 +
    endDate.getMonth() -
    start.getMonth();
  const anniversary = new Date(start);
  anniversary.setDate(1);
  anniversary.setMonth(start.getMonth() + months);
  anniversary.setDate(
    Math.min(
      start.getDate(),
      new Date(
        anniversary.getFullYear(),
        anniversary.getMonth() + 1,
        0,
      ).getDate(),
    ),
  );
  if (endDate < anniversary) months -= 1;
  return Math.max(0, months);
}
function monthlyInstallmentRate(sale, installments) {
  const original = Math.max(0, asNumber(sale.original_installment_amount));
  if (original > 0) return original;
  const amounts = installments
    .map((x) => money(asNumber(x.amount)))
    .filter((x) => x > 0);
  if (!amounts.length) return 0;
  const counts = new Map();
  for (const amount of amounts)
    counts.set(amount, (counts.get(amount) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}
function getReturnPrice(item, method) {
  const prices =
    method === "installment"
      ? [item.installment_final_price, item.final_price, item.installment_price]
      : [item.cash_final_price, item.final_price, item.cash_price];
  return prices.map((v) => asNumber(v)).find((v) => v > 0) || 0;
}
async function createReturn(client, input) {
  const saleId = asText(input?.invoiceId || input?.saleId);
  const itemIndex = Number(input?.itemIndex);
  const quantity = Number(input?.quantityReturned);
  if (
    !saleId ||
    !Number.isInteger(itemIndex) ||
    itemIndex < 0 ||
    !Number.isInteger(quantity) ||
    quantity < 1
  )
    throw httpError(400, "بيانات المرتجع غير مكتملة أو غير صحيحة.");
  const saleRes = await client.query(
    "SELECT * FROM sales WHERE id=$1 FOR UPDATE",
    [saleId],
  );
  if (!saleRes.rowCount) throw httpError(404, "الفاتورة الأصلية غير موجودة.");
  const sale = saleRes.rows[0];
  const itemRes = await client.query(
    "SELECT * FROM sale_items WHERE sale_id=$1 AND line_number=$2 FOR UPDATE",
    [saleId, itemIndex],
  );
  if (!itemRes.rowCount)
    throw httpError(404, "لم يتم العثور على البند داخل الفاتورة.");
  const item = itemRes.rows[0];
  const returnedRes = await client.query(
    "SELECT COALESCE(SUM(quantity_returned),0) AS total FROM returns WHERE sale_item_id=$1",
    [item.id],
  );
  const returnedQty = Number(returnedRes.rows[0].total || 0);
  const remainingQty = Number(item.quantity) - returnedQty;
  if (quantity > remainingQty)
    throw httpError(
      409,
      `الكمية أكبر من المتاح للإرجاع. المتاح: ${remainingQty}.`,
    );

  const unitPrice = getReturnPrice(item, sale.payment_method);
  if (unitPrice <= 0)
    throw httpError(400, "لم يتم العثور على سعر بيع صالح لهذا المنتج.");
  const gross = money(unitPrice * quantity);
  const installmentsRes = await client.query(
    "SELECT * FROM sale_installments WHERE sale_id=$1 ORDER BY installment_number FOR UPDATE",
    [saleId],
  );
  const installments = installmentsRes.rows;
  let usageFee = 0;
  if (sale.payment_method === "installment" && gross > 0) {
    const months = completedMonthsBetween(sale.created_at);
    const monthlyRate = monthlyInstallmentRate(sale, installments);
    const total = Math.max(0, Number(sale.total));
    if (months > 0 && monthlyRate > 0 && total > 0) {
      const returnedShare = Math.min(1, gross / total);
      usageFee = money(Math.min(gross, monthlyRate * months * returnedShare));
    }
  }
  const net = money(Math.max(0, gross - usageFee));
  const remaining = Math.max(0, Number(sale.remaining_amount));
  let availableDebt = sale.payment_method === "cash" ? 0 : remaining;
  if (sale.payment_method === "installment") {
    const scheduleOutstanding = installments.reduce((sum, row) => {
      const amt = Math.max(0, Number(row.amount));
      const already = Math.min(
        amt,
        Math.max(0, Number(row.paid_amount ?? (row.paid ? amt : 0))),
      );
      return sum + Math.max(0, amt - already);
    }, 0);
    availableDebt = Math.min(remaining, scheduleOutstanding);
  }
  const wantedReduction = money(Math.min(net, availableDebt));
  let appliedReduction = wantedReduction;
  let newRemaining = money(Math.max(0, remaining - wantedReduction));
  if (sale.payment_method === "installment" && wantedReduction > 0) {
    let toReduce = wantedReduction;
    for (const row of [...installments].sort(
      (a, b) => Number(b.installment_number) - Number(a.installment_number),
    )) {
      if (toReduce <= 0.000001) break;
      const currentAmount = Math.max(0, Number(row.amount));
      const paidAmount = Math.min(
        currentAmount,
        Math.max(0, Number(row.paid_amount ?? (row.paid ? currentAmount : 0))),
      );
      const unpaid = Math.max(0, currentAmount - paidAmount);
      if (unpaid <= 0.000001) continue;
      const applied = Math.min(unpaid, toReduce);
      const nextAmount = money(Math.max(paidAmount, currentAmount - applied));
      const nextPaid = paidAmount >= nextAmount - 0.000001;
      await client.query(
        "UPDATE sale_installments SET amount=$3,paid=$4,paid_amount=$5 WHERE sale_id=$1 AND installment_number=$2",
        [saleId, row.installment_number, nextAmount, nextPaid, paidAmount],
      );
      toReduce = money(Math.max(0, toReduce - applied));
    }
    appliedReduction = money(wantedReduction - toReduce);
    newRemaining = money(Math.max(0, remaining - appliedReduction));
  }

  const customerRefund = money(Math.max(0, net - appliedReduction));
  const returnId = asText(input?.returnId) || newId("RET-");
  const returnNumber =
    asText(input?.returnNumber) ||
    `R-${new Date().getFullYear()}-${String(nowMs()).slice(-6)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const nowIso = new Date().toISOString();
  const reason = validEnum(
    asText(input?.reason, "defect"),
    ["defect", "change_mind", "unsuitable", "other"],
    "سبب المرتجع",
  );
  const condition = validEnum(
    asText(input?.deviceCondition, "sound"),
    ["sound", "damaged", "inspection_needed"],
    "حالة الجهاز",
  );
  const settlementMethod = validEnum(
    asText(
      input?.settlementMethod,
      customerRefund > 0 ? "cash_refund" : "remaining_settlement",
    ),
    ["cash_refund", "store_credit", "remaining_settlement", "exchange"],
    "طريقة التسوية",
  );
  const settlementStatus = customerRefund > 0 ? "pending" : "completed";
  // رجّع الإكسسوار للمخزون فقط إذا كانت القطعة المرتجعة سليمة.
  if (
    condition === "sound" &&
    item.item_type === "accessory" &&
    item.accessory_batch_id
  ) {
    await client.query(
      `UPDATE accessory_batches
     SET available_quantity =
       LEAST(received_quantity, available_quantity + $2)
     WHERE id = $1`,
      [item.accessory_batch_id, quantity],
    );
  }
  const modelLabel =
    `${item.brand} ${item.model}${item.storage ? ` (${item.storage}` : ""}${item.color ? `${item.storage ? ", " : " ("}${item.color}` : ""}${item.storage || item.color ? ")" : ""}`.trim();
  await client.query(
    `INSERT INTO returns(return_id,return_number,created_at,sale_id,invoice_number,customer_name,customer_phone,item_index,sale_item_id,device_id,model,quantity_returned,unit_price,total_refund_amount,usage_fee,net_return_amount,balance_reduced,customer_refund_amount,settlement_status,reason,device_condition,settlement_method,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'completed')`,
    [
      returnId,
      returnNumber,
      nowIso,
      saleId,
      sale.invoice_number,
      sale.customer_name,
      sale.customer_phone,
      itemIndex,
      item.id,
      item.id,
      modelLabel,
      quantity,
      unitPrice,
      gross,
      usageFee,
      net,
      appliedReduction,
      customerRefund,
      settlementStatus,
      reason,
      condition,
      settlementMethod,
    ],
  );
  const status =
    newRemaining <= 0
      ? "paid"
      : Number(sale.amount_paid) > 0
        ? "partial"
        : "unpaid";
  const note = `فاتورة مرتجع ${returnNumber} (${returnId}): قيمة المرتجع ${gross} ج.م، خصم استخدام ${usageFee} ج.م، وصافي المرتجع ${net} ج.م؛ خُصم ${appliedReduction} ج.م من المديونية${customerRefund > 0 ? `، ومستحق للعميل رد ${customerRefund} ج.م` : ""}.`;
  await client.query(
    "UPDATE sales SET remaining_amount=$2, return_balance_reduced=return_balance_reduced+$3, notes=concat_ws(E'\\n',NULLIF(notes,''),$4::text), status=$5 WHERE id=$1",
    [saleId, newRemaining, appliedReduction, note, status],
  );
  return returnId;
}

async function serializeReturn(row) {
  const saleId = row.sale_id || row.invoice_id;
  const linked = row.linked_new_invoice_number || row.linked_from_notes || null;
  return {
    returnId: row.return_id,
    returnNumber: row.return_number,
    createdAt: row.created_at,
    invoiceId: saleId,
    invoiceNumber: row.invoice_number,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    itemIndex: Number(row.item_index),
    deviceId: row.device_id,
    model: row.model,
    quantityReturned: Number(row.quantity_returned),
    unitPrice: Number(row.unit_price),
    totalRefundAmount: Number(row.total_refund_amount),
    usageFee: Number(row.usage_fee),
    netReturnAmount: Number(row.net_return_amount),
    balanceReduced: Number(row.balance_reduced),
    customerRefundAmount: Number(row.customer_refund_amount),
    settlementStatus: row.settlement_status,
    reason: row.reason,
    deviceCondition: row.device_condition,
    settlementMethod: row.settlement_method,
    status: row.status,
    linkedNewInvoiceNumber: linked || undefined,
  };
}
async function fetchReturns(client = pool) {
  const rows = await client.query(
    `SELECT r.*,
       (SELECT s2.invoice_number FROM sales s2
        WHERE s2.id <> r.sale_id
          AND (s2.notes LIKE '%' || r.return_id || '%' OR s2.notes LIKE '%' || r.return_number || '%')
        ORDER BY s2.created_at DESC LIMIT 1) AS linked_from_notes
     FROM returns r ORDER BY r.created_at DESC, r.return_number DESC`,
  );
  return await Promise.all(rows.rows.map((row) => serializeReturn(row)));
}

// Liveness and DB readiness.
app.get("/api/health", async (_req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, current_user AS db_user, version() AS version",
    );
    res.json({
      ok: true,
      api: "up",
      database: "up",
      databaseName: result.rows[0].database,
      databaseUser: result.rows[0].db_user,
      postgresVersion: result.rows[0].version,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/employees/authenticate", async (req, res, next) => {
  try {
    employeeSessionSecret();
    const name = asText(req.body?.name);
    const pin = String(req.body?.pin ?? "");
    const keys = employeeAttemptKeys(req, name);
    if (loginIsLimited(keys)) {
      return res.status(429).json({
        error: "محاولات تسجيل الدخول كثيرة. حاول مرة أخرى بعد 15 دقيقة.",
      });
    }
    const result = await pool.query(
      `SELECT id,name,role,manager_id,is_active,created_at,updated_at,pin_salt,pin_hash
       FROM employees WHERE name_key=$1 LIMIT 2`,
      [keyText(name)],
    );
    const row = result.rows.length === 1 ? result.rows[0] : null;
    const valid = Boolean(
      row &&
      row.is_active &&
      pin.length >= 4 &&
      pin.length <= 128 &&
      (await verifyEmployeePin(pin, row)),
    );
    if (!valid) {
      recordEmployeeLoginFailure(keys);
      return res
        .status(401)
        .json({ error: "اسم الموظف أو الرقم السري غير صحيح." });
    }
    clearEmployeeLoginFailures(keys);
    const session = createEmployeeSession(row);
    res.json({ ...session, employee: employeeSafeRecord(row) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/employees/authenticate-pin", async (req, res, next) => {
  try {
    employeeSessionSecret();
    const pin = String(req.body?.pin ?? "");
    const keys = employeeAttemptKeys(req, "__pin_only__");
    if (loginIsLimited(keys)) {
      return res.status(429).json({
        error: "محاولات التحقق كثيرة. حاول مرة أخرى بعد 15 دقيقة.",
      });
    }

    if (!/^\d{4,12}$/.test(pin)) {
      recordEmployeeLoginFailure(keys);
      return res
        .status(401)
        .json({ error: "الرقم السري غير صحيح أو غير صالح." });
    }

    const result = await pool.query(
      `SELECT id,name,role,manager_id,is_active,created_at,updated_at,pin_salt,pin_hash
       FROM employees WHERE is_active=TRUE`,
    );
    const matches = [];
    for (const row of result.rows) {
      if (await verifyEmployeePin(pin, row)) matches.push(row);
    }

    if (matches.length !== 1) {
      recordEmployeeLoginFailure(keys);
      return res
        .status(401)
        .json({ error: "الرقم السري غير صحيح أو غير صالح." });
    }

    const row = matches[0];
    clearEmployeeLoginFailures(keys);
    const session = createEmployeeSession(row);
    return res.json({ ...session, employee: employeeSafeRecord(row) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/employees/directory", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id,name,role,manager_id,is_active,created_at,updated_at FROM employees
       ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'developer' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, name`,
    );
    res.json(result.rows.map(employeeSafeRecord));
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/employees",
  requireEmployeeSession,
  requireEmployeeRoles("developer", "owner", "manager"),
  async (req, res, next) => {
    try {
      let result;
      if (req.employee.role === "manager") {
        result = await pool.query(
          `SELECT id,name,role,manager_id,is_active,created_at,updated_at FROM employees
           WHERE id=$1 OR manager_id=$1 OR role IN ('owner','developer')
           ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'developer' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, name`,
          [req.employee.id],
        );
      } else {
        result = await pool.query(
          `SELECT id,name,role,manager_id,is_active,created_at,updated_at FROM employees
           ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'developer' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, name`,
        );
      }
      res.json(result.rows.map(employeeSafeRecord));
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/employees",
  requireEmployeeSession,
  requireEmployeeRoles("developer", "owner", "manager"),
  async (req, res, next) => {
    try {
      const name = validateEmployeeName(req.body?.name);
      const pin = validateNewPin(req.body?.pin);
      const role = employeeRole(req.body?.role);
      const actorWeight = ROLE_WEIGHTS[req.employee.role] || 1;
      const targetWeight = ROLE_WEIGHTS[role] || 1;
      if (targetWeight > actorWeight) {
        throw httpError(
          403,
          "لا يمكنك إنشاء أو تعيين موظف برتبة أعلى من رتبتك.",
        );
      }
      const actorRole = req.employee.role;

      const mayCreateWorker =
        role === "worker" &&
        ["developer", "owner", "manager"].includes(actorRole);

      const mayCreateAccountant =
        role === "accountant" && ["developer", "owner"].includes(actorRole);

      const mayCreateManager =
        role === "manager" && ["developer", "owner"].includes(actorRole);

      const mayCreateOwner = role === "owner" && actorRole === "developer";

      if (
        !mayCreateWorker &&
        !mayCreateAccountant &&
        !mayCreateManager &&
        !mayCreateOwner
      ) {
        throw httpError(403, "لا يمكنك إنشاء حساب بهذا الدور.");
      }
      const requestedManagerId = asText(req.body?.managerId) || null;
      const created = await transaction(async (client) => {
        await client.query("LOCK TABLE employees IN EXCLUSIVE MODE");
        if (role === "developer") {
          const existingDeveloper = await client.query(
            "SELECT id FROM employees WHERE role='developer' LIMIT 1",
          );
          if (existingDeveloper.rowCount) {
            throw httpError(
              409,
              "يوجد حساب مطور بالفعل؛ لا يمكن إنشاء حساب مطور آخر من هذه الصفحة.",
            );
          }
        }
        const duplicate = await client.query(
          "SELECT id FROM employees WHERE name_key=$1 LIMIT 1",
          [keyText(name)],
        );
        if (duplicate.rowCount)
          throw httpError(409, "اسم الموظف مستخدم بالفعل.");
        let managerId = null;
        if (role === "developer") {
          managerId = null;
        } else if (role === "manager") {
          managerId = req.employee.id;
        } else if (req.employee.role === "manager") {
          managerId = req.employee.id;
        } else if (requestedManagerId) {
          const manager = await client.query(
            "SELECT id FROM employees WHERE id=$1 AND role='manager' AND is_active=TRUE",
            [requestedManagerId],
          );
          if (!manager.rowCount)
            throw httpError(400, "المدير المباشر المحدد غير صالح.");
          managerId = manager.rows[0].id;
        }
        const hashed = await hashEmployeePin(pin);
        const now = nowMs();
        const id = newId("employee-");
        const result = await client.query(
          `INSERT INTO employees(id,name,name_key,role,pin_salt,pin_hash,manager_id,is_active,created_at,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$8)
           RETURNING id,name,role,manager_id,is_active,created_at,updated_at`,
          [
            id,
            name,
            keyText(name),
            role,
            hashed.pinSalt,
            hashed.pinHash,
            managerId,
            now,
          ],
        );
        return result.rows[0];
      });
      res.status(201).json(employeeSafeRecord(created));
    } catch (error) {
      next(error);
    }
  },
);

app.put(
  "/api/employees/:id",
  requireEmployeeSession,
  requireEmployeeRoles("developer", "owner", "manager"),
  async (req, res, next) => {
    try {
      const name = validateEmployeeName(req.body?.name);
      const requestedRole = employeeRole(req.body?.role);
      const actorWeight = ROLE_WEIGHTS[req.employee.role] || 1;
      const targetWeight = ROLE_WEIGHTS[requestedRole] || 1;
      if (targetWeight > actorWeight) {
        throw httpError(
          403,
          "لا يمكنك ترقية أو تعيين موظف برتبة أعلى من رتبتك.",
        );
      }
      const requestedManagerId = asText(req.body?.managerId) || null;
      const requestedPin =
        req.body?.pin == null || req.body?.pin === ""
          ? null
          : validateNewPin(req.body.pin);
      const saved = await transaction(async (client) => {
        await client.query("LOCK TABLE employees IN EXCLUSIVE MODE");
        const targetResult = await client.query(
          "SELECT id,name,role,manager_id,is_active FROM employees WHERE id=$1 FOR UPDATE",
          [req.params.id],
        );
        if (!targetResult.rowCount) throw httpError(404, "الموظف غير موجود.");
        const target = targetResult.rows[0];
        const targetRole = employeeRole(target.role, { legacyFallback: true });
        if (!["worker", "manager"].includes(targetRole)) {
          throw httpError(
            403,
            "حساب المالك أو المطور محمي ولا يمكن تعديله من صفحة الموظفين.",
          );
        }
        if (
          req.employee.role === "manager" &&
          (targetRole !== "worker" || target.manager_id !== req.employee.id)
        ) {
          throw httpError(403, "يمكن للمدير تعديل الموظفين التابعين له فقط.");
        }
        if (req.employee.role === "manager" && requestedRole !== "worker") {
          throw httpError(403, "لا يمكن للمدير تغيير رتبة الموظف إلى مدير.");
        }
        if (
          !["worker", "manager"].includes(requestedRole) ||
          (requestedRole === "manager" && req.employee.role !== "owner")
        ) {
          throw httpError(403, "الدور المحدد غير مسموح به.");
        }
        if (requestedRole !== targetRole) {
          const childCount = await client.query(
            "SELECT COUNT(*)::int AS count FROM employees WHERE manager_id=$1",
            [target.id],
          );
          if (Number(childCount.rows[0].count) > 0) {
            throw httpError(
              409,
              "انقل الموظفين التابعين لهذا الحساب أولاً قبل تغيير دوره.",
            );
          }
        }
        const duplicate = await client.query(
          "SELECT id FROM employees WHERE name_key=$1 AND id<>$2 LIMIT 1",
          [keyText(name), target.id],
        );
        if (duplicate.rowCount)
          throw httpError(409, "اسم الموظف مستخدم بالفعل.");

        let managerId = target.manager_id || null;
        if (requestedRole === "manager") {
          managerId = req.employee.id;
        } else if (req.employee.role === "manager") {
          managerId = req.employee.id;
        } else if (requestedManagerId) {
          const manager = await client.query(
            "SELECT id FROM employees WHERE id=$1 AND role='manager' AND is_active=TRUE",
            [requestedManagerId],
          );
          if (!manager.rowCount)
            throw httpError(400, "المدير المباشر المحدد غير صالح.");
          managerId = manager.rows[0].id;
        } else {
          managerId = null;
        }
        let pinSalt = null;
        let pinHash = null;
        if (requestedPin) {
          const hashed = await hashEmployeePin(requestedPin);
          pinSalt = hashed.pinSalt;
          pinHash = hashed.pinHash;
        }
        const now = nowMs();
        const result = await client.query(
          `UPDATE employees SET name=$2,name_key=$3,role=$4,manager_id=$5,
             pin_salt=COALESCE($6,pin_salt),pin_hash=COALESCE($7,pin_hash),updated_at=$8
           WHERE id=$1 RETURNING id,name,role,manager_id,is_active,created_at,updated_at`,
          [
            target.id,
            name,
            keyText(name),
            requestedRole,
            managerId,
            pinSalt,
            pinHash,
            now,
          ],
        );
        return result.rows[0];
      });
      res.json(employeeSafeRecord(saved));
    } catch (error) {
      next(error);
    }
  },
);

app.delete(
  "/api/employees/:id",
  requireEmployeeSession,
  requireEmployeeRoles("developer", "owner", "manager"),
  async (req, res, next) => {
    try {
      const deleted = await transaction(async (client) => {
        await client.query("LOCK TABLE employees IN EXCLUSIVE MODE");
        const result = await client.query(
          "SELECT id,name,role,manager_id FROM employees WHERE id=$1 FOR UPDATE",
          [req.params.id],
        );
        if (!result.rowCount) throw httpError(404, "الموظف غير موجود.");
        const target = result.rows[0];
        const role = employeeRole(target.role, { legacyFallback: true });
        if (!["worker", "manager"].includes(role)) {
          throw httpError(
            403,
            "حساب المالك أو المطور محمي ولا يمكن حذفه من صفحة الموظفين.",
          );
        }
        if (
          req.employee.role === "manager" &&
          (role !== "worker" || target.manager_id !== req.employee.id)
        ) {
          throw httpError(403, "يمكن للمدير حذف الموظفين التابعين له فقط.");
        }
        const children = await client.query(
          "SELECT COUNT(*)::int AS count FROM employees WHERE manager_id=$1",
          [target.id],
        );
        if (Number(children.rows[0].count) > 0) {
          throw httpError(
            409,
            "انقل الموظفين التابعين لهذا الحساب أولاً قبل حذفه.",
          );
        }
        const removed = await client.query(
          "DELETE FROM employees WHERE id=$1 RETURNING id,name,role,manager_id,is_active,created_at,updated_at",
          [target.id],
        );
        return removed.rows[0];
      });
      res.json({ ok: true, employee: employeeSafeRecord(deleted) });
    } catch (error) {
      next(error);
    }
  },
);

// Brands and their normalized series/models.
app.get("/api/brands", async (_req, res, next) => {
  try {
    res.json(await getBrands());
  } catch (e) {
    next(e);
  }
});
app.post("/api/brands", async (req, res, next) => {
  try {
    const saved = await transaction((client) =>
      saveBrandObject(client, req.body),
    );
    const brands = await getBrands();
    res
      .status(201)
      .json(
        brands.find((x) => x.id === saved.id) ||
          brands.find((x) => keyText(x.name) === keyText(req.body?.name)),
      );
  } catch (e) {
    next(e);
  }
});
app.put("/api/brands/:id", async (req, res, next) => {
  try {
    const id = asText(req.params.id);
    const name = asText(req.body?.name);
    if (!name) throw httpError(400, "اسم الماركة مطلوب.");
    await transaction(async (client) => {
      const found = await client.query("SELECT id FROM brands WHERE id=$1", [
        id,
      ]);
      if (!found.rowCount) throw httpError(404, "الماركة غير موجودة.");
      await client.query("UPDATE brands SET name=$2,name_key=$3 WHERE id=$1", [
        id,
        name,
        keyText(name),
      ]);
      await saveBrandObject(client, { ...req.body, id, name });
    });
    const brands = await getBrands();
    res.json(brands.find((x) => x.id === id));
  } catch (e) {
    next(e);
  }
});
app.delete("/api/brands/:id", async (req, res, next) => {
  try {
    const result = await pool.query(
      "DELETE FROM brands WHERE id=$1 RETURNING id",
      [req.params.id],
    );
    if (!result.rowCount) throw httpError(404, "الماركة غير موجودة.");
    res.json({ ok: true, id: result.rows[0].id });
  } catch (e) {
    next(e);
  }
});

// Warehouse batches are the stock unit used by the uploaded sales screen.
app.get("/api/warehouse-batches", async (_req, res, next) => {
  try {
    res.json(await listBatches());
  } catch (e) {
    next(e);
  }
});
app.get("/api/warehouse", async (_req, res, next) => {
  try {
    res.json(await listBatches());
  } catch (e) {
    next(e);
  }
});
app.post("/api/warehouse-batches", async (req, res, next) => {
  try {
    const id = await transaction((client) => createBatch(client, req.body));
    res.status(201).json(await getBatch(id));
  } catch (e) {
    next(e);
  }
});
app.post("/api/warehouse", async (req, res, next) => {
  try {
    const id = await transaction((client) => createBatch(client, req.body));
    res.status(201).json(await getBatch(id));
  } catch (e) {
    next(e);
  }
});
app.put("/api/warehouse-batches/:id", async (req, res, next) => {
  try {
    const id = asText(req.params.id);
    const batch = await transaction(async (client) => {
      const oldRes = await client.query(
        "SELECT * FROM warehouse_batches WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!oldRes.rowCount) throw httpError(404, "دفعة المخزون غير موجودة.");
      const old = oldRes.rows[0];
      const received = Number(
        req.body?.receivedQuantity ?? old.received_quantity,
      );
      const cost = money(asNumber(req.body?.unitCost, Number(old.unit_cost)));
      const price = money(
        asNumber(req.body?.salePrice, Number(old.sale_price)),
      );
      const outgoing =
        Number(old.received_quantity) - Number(old.available_quantity);
      if (!Number.isInteger(received) || received < 1 || received < outgoing)
        throw httpError(
          409,
          "الكمية الجديدة لا يمكن أن تقل عن عدد القطع التي خرجت من المخزون.",
        );
      const brandName = asText(req.body?.brand, "");
      const seriesName = asText(req.body?.series, "عام") || "عام";
      const modelName = asText(req.body?.model, "");
      const catalog =
        brandName && modelName
          ? await resolveCatalog(client, brandName, seriesName, modelName)
          : {
              brandId: old.brand_id,
              seriesId: old.series_id,
              modelId: old.model_id,
            };
      await client.query(
        `UPDATE warehouse_batches SET brand_id=$2,series_id=$3,model_id=$4,received_quantity=$5,available_quantity=$6,unit_cost=$7,sale_price=$8,supplier_name=$9,received_at=$10,updated_at=$11 WHERE id=$1`,
        [
          id,
          catalog.brandId,
          catalog.seriesId,
          catalog.modelId,
          received,
          received - outgoing,
          cost,
          price,
          asText(req.body?.supplierName, ""),
          Number(req.body?.receivedAt ?? old.received_at),
          nowMs(),
        ],
      );
      await client.query(
        "UPDATE devices SET brand_id=$2,series_id=$3,model_id=$4,sale_price=$5,installment_price=$5,unit_cost=$6 WHERE warehouse_batch_id=$1",
        [id, catalog.brandId, catalog.seriesId, catalog.modelId, price, cost],
      );
      if (Array.isArray(req.body?.imeis)) {
        const imeis = req.body.imeis.map((v) => asText(v)).filter(Boolean);
        if (imeis.length > received)
          throw httpError(400, "عدد أرقام IMEI أكبر من كمية الدفعة.");
        if (new Set(imeis.map(keyText)).size !== imeis.length)
          throw httpError(400, "يوجد رقم IMEI مكرر داخل الدفعة.");
        const anySales = await client.query(
          "SELECT 1 FROM sale_items WHERE warehouse_batch_id=$1 LIMIT 1",
          [id],
        );
        if (anySales.rowCount)
          throw httpError(
            409,
            "لا يمكن تغيير قائمة IMEI بعد ارتباط الدفعة بفاتورة بيع.",
          );
        await client.query("DELETE FROM devices WHERE warehouse_batch_id=$1", [
          id,
        ]);
        for (const imei of imeis) {
          await client.query(
            `INSERT INTO devices(id,imei,imei_key,brand_id,series_id,model_id,color,ram,storage,sale_price,installment_price,status,created_at,warehouse_batch_id,unit_cost)
             VALUES($1,$2,$3,$4,$5,$6,'','','',$7,$7,'available',$8,$9,$10)`,
            [
              newId("device-"),
              imei,
              keyText(imei),
              catalog.brandId,
              catalog.seriesId,
              catalog.modelId,
              price,
              nowMs(),
              id,
              cost,
            ],
          );
        }
      }
      return id;
    });
    res.json(await getBatch(batch));
  } catch (e) {
    next(e);
  }
});
app.delete("/api/warehouse-batches/:id", async (req, res, next) => {
  try {
    const id = asText(req.params.id);
    await transaction(async (client) => {
      const found = await client.query(
        "SELECT * FROM warehouse_batches WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!found.rowCount) throw httpError(404, "دفعة المخزون غير موجودة.");
      if (
        Number(found.rows[0].available_quantity) !==
        Number(found.rows[0].received_quantity)
      )
        throw httpError(
          409,
          "لا يمكن حذف دفعة خرجت منها قطع؛ حفاظًا على سجل المبيعات.",
        );
      const linked = await client.query(
        "SELECT 1 FROM sale_items WHERE warehouse_batch_id=$1 LIMIT 1",
        [id],
      );
      if (linked.rowCount)
        throw httpError(409, "لا يمكن حذف دفعة مرتبطة بسجل مبيعات.");
      await client.query("DELETE FROM warehouse_batches WHERE id=$1", [id]);
    });
    res.json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

// Compatibility read route for registered IMEIs; sales currently reserve/consume quantities by batch.
app.get("/api/devices", async (req, res, next) => {
  try {
    const params = [];
    let where = "";
    if (req.query.q) {
      params.push(`%${asText(req.query.q)}%`);
      where = "WHERE (d.imei ILIKE $1 OR b.name ILIKE $1 OR bm.name ILIKE $1)";
    }
    const result = await pool.query(
      `SELECT d.*,b.name AS brand,bs.name AS series,bm.name AS model,o.name AS offer_name,
              o.discount_type,o.discount_value,o.duration_days,o.expires_at
       FROM devices d JOIN brands b ON b.id=d.brand_id JOIN brand_series bs ON bs.id=d.series_id
       JOIN brand_models bm ON bm.id=d.model_id LEFT JOIN offers o ON o.id=d.offer_id
       ${where} ORDER BY d.created_at DESC LIMIT 5000`,
      params,
    );
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        imei: r.imei,
        brand: r.brand,
        series: r.series,
        model: r.model,
        color: r.color,
        ram: r.ram,
        storage: r.storage,
        salePrice: Number(r.sale_price),
        installmentPrice: Number(r.installment_price),
        offer: r.offer_name
          ? {
              name: r.offer_name,
              discountType: r.discount_type,
              discountValue: Number(r.discount_value),
              durationDays: Number(r.duration_days),
              expiresAt: Number(r.expires_at),
            }
          : null,
        status: r.status,
        createdAt: Number(r.created_at),
        warehouseBatchId: r.warehouse_batch_id || undefined,
        unitCost: Number(r.unit_cost),
      })),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/devices", async (req, res, next) => {
  try {
    const id = await transaction((client) => createDevice(client, req.body));
    const row = await fetchDevice(id);
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});
app.put("/api/devices/:id", async (req, res, next) => {
  try {
    const id = asText(req.params.id);
    await transaction(async (client) => {
      const old = await client.query(
        "SELECT id FROM devices WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!old.rowCount) throw httpError(404, "الجهاز غير موجود.");
      const existingRecord = await fetchDevice(id, client);
      const record = { ...existingRecord, ...req.body };
      const catalog = await resolveCatalog(
        client,
        asText(record.brand),
        asText(record.series) || "عام",
        asText(record.model),
      );
      const imei = asText(record.imei);
      if (!imei) throw httpError(400, "رقم IMEI مطلوب.");
      const duplicate = await client.query(
        "SELECT id FROM devices WHERE imei_key=$1 AND id<>$2",
        [keyText(imei), id],
      );
      if (duplicate.rowCount) throw httpError(409, "رقم IMEI مسجل بالفعل.");
      const offerId = record.offer
        ? await ensureOffer(client, record.offer)
        : null;
      await client.query(
        `UPDATE devices SET imei=$2,imei_key=$3,brand_id=$4,series_id=$5,model_id=$6,color=$7,ram=$8,storage=$9,sale_price=$10,installment_price=$11,offer_id=$12,status=$13,created_at=$14,warehouse_batch_id=$15,unit_cost=$16 WHERE id=$1`,
        [
          id,
          imei,
          keyText(imei),
          catalog.brandId,
          catalog.seriesId,
          catalog.modelId,
          asText(record.color),
          asText(record.ram),
          asText(record.storage),
          money(asNumber(record.salePrice)),
          money(asNumber(record.installmentPrice)),
          offerId,
          validEnum(
            asText(record.status, "available"),
            ["available", "sold", "reserved"],
            "حالة الجهاز",
          ),
          Number(record.createdAt) || nowMs(),
          asText(record.warehouseBatchId) || null,
          money(asNumber(record.unitCost)),
        ],
      );
    });
    res.json(await fetchDevice(id));
  } catch (e) {
    next(e);
  }
});
app.delete("/api/devices/:id", async (req, res, next) => {
  try {
    const result = await pool.query(
      "DELETE FROM devices WHERE id=$1 RETURNING id",
      [req.params.id],
    );
    if (!result.rowCount) throw httpError(404, "الجهاز غير موجود.");
    res.json({ ok: true, id: result.rows[0].id });
  } catch (e) {
    next(e);
  }
});

// Offers and simple key/value app settings are separate business tables, not generic JSON records.
app.get("/api/offers", async (_req, res, next) => {
  try {
    const rows = await pool.query("SELECT * FROM offers ORDER BY name");
    res.json(
      rows.rows.map((r) => ({
        id: r.id,
        name: r.name,
        discountType: r.discount_type,
        discountValue: Number(r.discount_value),
        durationDays: Number(r.duration_days),
        expiresAt: Number(r.expires_at),
      })),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/offers", async (req, res, next) => {
  try {
    const id = await transaction((client) => ensureOffer(client, req.body));
    const result = await pool.query("SELECT * FROM offers WHERE id=$1", [id]);
    const r = result.rows[0];
    res.status(201).json({
      id: r.id,
      name: r.name,
      discountType: r.discount_type,
      discountValue: Number(r.discount_value),
      durationDays: Number(r.duration_days),
      expiresAt: Number(r.expires_at),
    });
  } catch (e) {
    next(e);
  }
});
app.put("/api/offers/:id", async (req, res, next) => {
  try {
    const payload = { ...req.body, id: req.params.id };
    const id = await transaction((client) => ensureOffer(client, payload));
    const result = await pool.query("SELECT * FROM offers WHERE id=$1", [id]);
    const r = result.rows[0];
    res.json({
      id: r.id,
      name: r.name,
      discountType: r.discount_type,
      discountValue: Number(r.discount_value),
      durationDays: Number(r.duration_days),
      expiresAt: Number(r.expires_at),
    });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/offers/:id", async (req, res, next) => {
  try {
    const result = await pool.query(
      "DELETE FROM offers WHERE id=$1 RETURNING id",
      [req.params.id],
    );
    if (!result.rowCount) throw httpError(404, "العرض غير موجود.");
    res.json({ ok: true, id: result.rows[0].id });
  } catch (e) {
    next(e);
  }
});
app.get("/api/settings", async (_req, res, next) => {
  try {
    const rows = await pool.query(
      "SELECT key,value,updated_at FROM app_settings ORDER BY key",
    );
    res.json(
      rows.rows.map((r) => ({
        key: r.key,
        value: r.value,
        updatedAt: Number(r.updated_at),
      })),
    );
  } catch (e) {
    next(e);
  }
});
app.put("/api/settings/:key", async (req, res, next) => {
  try {
    if (!asText(req.params.key)) throw httpError(400, "مفتاح الإعداد مطلوب.");
    const result = await pool.query(
      "INSERT INTO app_settings(key,value,updated_at) VALUES($1,$2::jsonb,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at RETURNING key,value,updated_at",
      [req.params.key, JSON.stringify(req.body?.value ?? null), nowMs()],
    );
    res.json({
      key: result.rows[0].key,
      value: result.rows[0].value,
      updatedAt: Number(result.rows[0].updated_at),
    });
  } catch (e) {
    next(e);
  }
});

// Sales and invoice read routes.
app.get("/api/sales", async (req, res, next) => {
  try {
    res.json(
      await fetchSales({ query: asText(req.query.q), limit: req.query.limit }),
    );
  } catch (e) {
    next(e);
  }
});
app.get("/api/sales/:id", async (req, res, next) => {
  try {
    const sale = await fetchSales({ id: req.params.id });
    if (!sale) throw httpError(404, "الفاتورة غير موجودة.");
    res.json(sale);
  } catch (e) {
    next(e);
  }
});
app.post("/api/sales", async (req, res, next) => {
  try {
    const id = await transaction((client) => createSale(client, req.body));
    const sale = await fetchSales({ id });
    res.status(201).json(sale);
  } catch (e) {
    next(e);
  }
});

// Payments update the collection ledger, installment schedule, and outstanding amount atomically.
app.get("/api/payments", async (req, res, next) => {
  try {
    const params = [];
    let where = "";
    if (req.query.saleId) {
      params.push(asText(req.query.saleId));
      where = "WHERE p.sale_id=$1";
    }
    const result = await pool.query(
      `SELECT p.* FROM payments p ${where} ORDER BY p.created_at DESC`,
      params,
    );
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        saleId: r.sale_id,
        installmentNumber:
          r.installment_number == null
            ? undefined
            : Number(r.installment_number),
        amount: Number(r.amount),
        recordType: r.record_type,
        createdAt: Number(r.created_at),
        note: r.note,
      })),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/payments", async (req, res, next) => {
  try {
    const result = await transaction(async (client) => {
      const saleId = asText(req.body?.saleId || req.body?.invoiceId);
      const amount = money(Number(req.body?.amount));
      const installmentNumber =
        req.body?.installmentNumber == null
          ? null
          : Number(req.body.installmentNumber);
      if (!saleId || !Number.isFinite(amount) || amount <= 0)
        throw httpError(
          400,
          "الفاتورة والمبلغ مطلوبان، والمبلغ يجب أن يكون أكبر من صفر.",
        );
      const saleRes = await client.query(
        "SELECT * FROM sales WHERE id=$1 FOR UPDATE",
        [saleId],
      );
      if (!saleRes.rowCount) throw httpError(404, "الفاتورة غير موجودة.");
      const sale = saleRes.rows[0];
      if (Number(sale.remaining_amount) <= 0)
        throw httpError(409, "الفاتورة مسددة بالكامل بالفعل.");
      let maxAllowed = Number(sale.remaining_amount);
      let installment = null;
      if (installmentNumber != null) {
        if (!Number.isInteger(installmentNumber) || installmentNumber < 1)
          throw httpError(400, "رقم القسط غير صحيح.");
        const installmentRes = await client.query(
          "SELECT * FROM sale_installments WHERE sale_id=$1 AND installment_number=$2 FOR UPDATE",
          [saleId, installmentNumber],
        );
        if (!installmentRes.rowCount) throw httpError(404, "القسط غير موجود.");
        installment = installmentRes.rows[0];
        maxAllowed = Math.min(
          maxAllowed,
          Math.max(
            0,
            Number(installment.amount) - Number(installment.paid_amount),
          ),
        );
      }
      if (amount > maxAllowed + 0.001)
        throw httpError(
          409,
          `المبلغ أكبر من المديونية المتاحة للتحصيل (${money(maxAllowed)} ج.م).`,
        );
      if (installment) {
        const paidAmount = money(Number(installment.paid_amount) + amount);
        await client.query(
          "UPDATE sale_installments SET paid_amount=$3,paid=$4 WHERE sale_id=$1 AND installment_number=$2",
          [
            saleId,
            installmentNumber,
            paidAmount,
            paidAmount >= Number(installment.amount) - 0.001,
          ],
        );
      }
      const amountPaid = money(Number(sale.amount_paid) + amount);
      const remainingAmount = money(
        Math.max(0, Number(sale.remaining_amount) - amount),
      );
      const status =
        remainingAmount <= 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid";
      const note = asText(req.body?.note);
      await client.query(
        "UPDATE sales SET amount_paid=$2,remaining_amount=$3,status=$4,notes=concat_ws(E'\\n',NULLIF(notes,''),NULLIF($5,'')) WHERE id=$1",
        [
          saleId,
          amountPaid,
          remainingAmount,
          status,
          note
            ? `${new Date().toISOString()} — تحصيل${installmentNumber ? ` القسط رقم ${installmentNumber}` : " مبلغ مستحق"}: ${amount} ج.م${note ? ` — ${note}` : ""}`
            : `${new Date().toISOString()} — تحصيل: ${amount} ج.م`,
        ],
      );
      const recordType =
        installmentNumber == null ? "debt_payment" : "installment_payment";
      const paymentId = newId("payment-");
      await client.query(
        "INSERT INTO payments(id,sale_id,installment_number,amount,record_type,created_at,note) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          paymentId,
          saleId,
          installmentNumber,
          amount,
          recordType,
          nowMs(),
          note,
        ],
      );
      return { paymentId, saleId };
    });
    res.status(201).json({
      ok: true,
      paymentId: result.paymentId,
      sale: await fetchSales({ id: result.saleId }),
    });
  } catch (e) {
    next(e);
  }
});

// Returns are separate records; original invoice totals and sold lines are preserved.
app.get("/api/returns", async (_req, res, next) => {
  try {
    res.json(await fetchReturns());
  } catch (e) {
    next(e);
  }
});
app.post("/api/returns", async (req, res, next) => {
  try {
    const id = await transaction((client) => createReturn(client, req.body));
    const all = await fetchReturns();
    res.status(201).json(all.find((x) => x.returnId === id));
  } catch (e) {
    next(e);
  }
});
app.put("/api/returns/:returnId/settlement", async (req, res, next) => {
  try {
    const result = await pool.query(
      "UPDATE returns SET settlement_status='completed' WHERE return_id=$1 RETURNING *",
      [req.params.returnId],
    );
    if (!result.rowCount) throw httpError(404, "سجل المرتجع غير موجود.");
    res.json(await serializeReturn(result.rows[0]));
  } catch (e) {
    next(e);
  }
});
app.patch("/api/returns/:returnId/settlement", async (req, res, next) => {
  try {
    const result = await pool.query(
      "UPDATE returns SET settlement_status='completed' WHERE return_id=$1 RETURNING *",
      [req.params.returnId],
    );
    if (!result.rowCount) throw httpError(404, "سجل المرتجع غير موجود.");
    res.json(await serializeReturn(result.rows[0]));
  } catch (e) {
    next(e);
  }
});

app.get("/api/customers", async (req, res, next) => {
  try {
    const search = asText(req.query.q);
    const params = [];
    let where = "";
    if (search) {
      params.push(`%${search}%`);
      where = "WHERE (name ILIKE $1 OR phone ILIKE $1)";
    }
    const rows = await pool.query(
      `SELECT id,name,phone,created_at,updated_at FROM customers ${where} ORDER BY updated_at DESC LIMIT 1000`,
      params,
    );
    res.json(
      rows.rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        createdAt: Number(r.created_at),
        updatedAt: Number(r.updated_at),
      })),
    );
  } catch (e) {
    next(e);
  }
});
app.get("/api/stats", async (_req, res, next) => {
  try {
    const [sales, batches, customers, returns] = await Promise.all([
      pool.query(
        "SELECT COUNT(*) AS count,COALESCE(SUM(total),0) AS total,COALESCE(SUM(remaining_amount),0) AS outstanding FROM sales",
      ),
      pool.query(
        "SELECT COALESCE(SUM(available_quantity),0) AS available,COALESCE(SUM(available_quantity*unit_cost),0) AS stock_cost FROM warehouse_batches",
      ),
      pool.query("SELECT COUNT(*) AS count FROM customers"),
      pool.query(
        "SELECT COUNT(*) AS count,COALESCE(SUM(total_refund_amount),0) AS total FROM returns",
      ),
    ]);
    res.json({
      salesCount: Number(sales.rows[0].count),
      salesTotal: Number(sales.rows[0].total),
      outstanding: Number(sales.rows[0].outstanding),
      unitsAvailable: Number(batches.rows[0].available),
      stockCost: Number(batches.rows[0].stock_cost),
      customersCount: Number(customers.rows[0].count),
      returnsCount: Number(returns.rows[0].count),
      returnsTotal: Number(returns.rows[0].total),
    });
  } catch (e) {
    next(e);
  }
});
// Accessory categories
app.get("/api/accessory-categories", async (_req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, name FROM accessory_categories ORDER BY name",
    );
    res.json(result.rows);
  } catch (e) {
    next(e);
  }
});

app.post("/api/accessory-categories", async (req, res, next) => {
  try {
    const row = await transaction((client) =>
      upsertAccessoryName(
        client,
        "accessory_categories",
        "accessory-category-",
        req.body?.name,
      ),
    );
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

// Accessory brands
app.get("/api/accessory-brands", async (_req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, name FROM accessory_brands ORDER BY name",
    );
    res.json(result.rows);
  } catch (e) {
    next(e);
  }
});

app.post("/api/accessory-brands", async (req, res, next) => {
  try {
    const row = await transaction((client) =>
      upsertAccessoryName(
        client,
        "accessory_brands",
        "accessory-brand-",
        req.body?.name,
      ),
    );
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

// Accessory stock batches
app.get("/api/accessory-batches", async (req, res, next) => {
  try {
    const search = asText(req.query.q);
    const result = search
      ? await pool.query(
          `SELECT * FROM accessory_batches
           WHERE category_name ILIKE $1
              OR brand_name ILIKE $1
              OR product_name ILIKE $1
              OR compatible_model ILIKE $1
              OR variant_value ILIKE $1
           ORDER BY received_at DESC`,
          [`%${search}%`],
        )
      : await pool.query(
          "SELECT * FROM accessory_batches ORDER BY received_at DESC",
        );

    res.json(result.rows.map(serializeAccessoryBatch));
  } catch (e) {
    next(e);
  }
});

app.post("/api/accessory-batches", async (req, res, next) => {
  try {
    const input = req.body || {};
    const categoryName = asText(input.category);
    const brandName = asText(input.brand);
    const productName = asText(input.productName || input.model);
    const quantity = Number(input.receivedQuantity);
    const unitCost = Number(input.unitCost);
    const salePrice = Number(input.salePrice);

    if (!categoryName || !brandName || !productName) {
      throw httpError(400, "نوع الإكسسوار والماركة واسم المنتج مطلوبون.");
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw httpError(400, "الكمية لازم تكون عددًا صحيحًا أكبر من صفر.");
    }

    if (
      !Number.isFinite(unitCost) ||
      unitCost < 0 ||
      !Number.isFinite(salePrice) ||
      salePrice < 0
    ) {
      throw httpError(400, "التكلفة وسعر البيع لازم يكونوا أرقامًا صحيحة.");
    }

    const id = await transaction(async (client) => {
      const category = await upsertAccessoryName(
        client,
        "accessory_categories",
        "accessory-category-",
        categoryName,
      );

      const brand = await upsertAccessoryName(
        client,
        "accessory_brands",
        "accessory-brand-",
        brandName,
      );

      const batchId = asText(input.id) || newId("accessory-batch-");
      const receivedAt = Number(input.receivedAt) || nowMs();

      await client.query(
        `INSERT INTO accessory_batches (
          id, category_id, brand_id,
          category_name, brand_name, product_name,
          compatible_model, variant_type, variant_value,
          received_quantity, available_quantity,
          unit_cost, sale_price, supplier_name, received_at
        )
        VALUES (
          $1, $2, $3,
          $4, $5, $6,
          $7, $8, $9,
          $10, $10,
          $11, $12, $13, $14
        )`,
        [
          batchId,
          category.id,
          brand.id,
          category.name,
          brand.name,
          productName,
          asText(input.compatibleModel),
          asText(input.variantType),
          asText(input.variantValue),
          quantity,
          money(unitCost),
          money(salePrice),
          asText(input.supplierName),
          receivedAt,
        ],
      );

      return batchId;
    });

    const result = await pool.query(
      "SELECT * FROM accessory_batches WHERE id = $1",
      [id],
    );

    res.status(201).json(serializeAccessoryBatch(result.rows[0]));
  } catch (e) {
    next(e);
  }
});

// One-time localStorage migration. Existing IDs are used so retrying the same import is safe.
// Stock quantities are imported as already recorded (do not subtract imported sales again).
app.post("/api/import/localstorage", async (req, res, next) => {
  try {
    const importKey = asText(req.body?.importKey) || newId("local-import-");
    const summary = await transaction(async (client) => {
      const seen = await client.query(
        "SELECT summary FROM import_batches WHERE import_key=$1",
        [importKey],
      );
      if (seen.rowCount)
        return { ...seen.rows[0].summary, alreadyImported: true, importKey };
      const brands = Array.isArray(req.body?.brands) ? req.body.brands : [];
      const batches = Array.isArray(req.body?.warehouse)
        ? req.body.warehouse
        : Array.isArray(req.body?.batches)
          ? req.body.batches
          : [];
      const devices = Array.isArray(req.body?.devices) ? req.body.devices : [];
      const sales = Array.isArray(req.body?.sales) ? req.body.sales : [];
      const returns = Array.isArray(req.body?.returns) ? req.body.returns : [];
      for (const brand of brands) await saveBrandObject(client, brand);
      for (const batch of batches)
        await createBatch(client, batch, { importMode: true });
      for (const device of devices)
        await createDevice(client, device, { importMode: true });
      for (const sale of sales)
        await createSale(client, sale, {
          importMode: true,
          updateStock: false,
        });
      // Imported sales and installments already include historic debt adjustments; import return rows without applying them a second time.
      for (const record of returns) {
        const saleId = asText(record?.invoiceId);
        const itemIndex = Number(record?.itemIndex);
        const saleItem = await client.query(
          "SELECT id FROM sale_items WHERE sale_id=$1 AND line_number=$2",
          [saleId, itemIndex],
        );
        if (!saleItem.rowCount) continue;
        const returnId =
          asText(record?.returnId || record?.returnNumber) || newId("RET-");
        const returnNumber =
          asText(record?.returnNumber) || `R-IMPORT-${returnId.slice(-12)}`;
        await client.query(
          `INSERT INTO returns(return_id,return_number,created_at,sale_id,invoice_number,customer_name,customer_phone,item_index,sale_item_id,device_id,model,quantity_returned,unit_price,total_refund_amount,usage_fee,net_return_amount,balance_reduced,customer_refund_amount,settlement_status,reason,device_condition,settlement_method,status,linked_new_invoice_number)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) ON CONFLICT(return_id) DO NOTHING`,
          [
            returnId,
            returnNumber,
            String(record?.createdAt ?? new Date().toISOString()),
            saleId,
            asText(record?.invoiceNumber),
            asText(record?.customerName),
            asText(record?.customerPhone),
            Math.max(0, itemIndex),
            saleItem.rows[0].id,
            asText(record?.deviceId),
            asText(record?.model),
            Math.max(1, Number(record?.quantityReturned) || 1),
            Math.max(0, money(asNumber(record?.unitPrice))),
            Math.max(0, money(asNumber(record?.totalRefundAmount))),
            Math.max(0, money(asNumber(record?.usageFee))),
            Math.max(
              0,
              money(
                asNumber(
                  record?.netReturnAmount,
                  asNumber(record?.totalRefundAmount) -
                    asNumber(record?.usageFee),
                ),
              ),
            ),
            Math.max(0, money(asNumber(record?.balanceReduced))),
            Math.max(0, money(asNumber(record?.customerRefundAmount))),
            ["pending", "completed"].includes(record?.settlementStatus)
              ? record.settlementStatus
              : "completed",
            ["defect", "change_mind", "unsuitable", "other"].includes(
              record?.reason,
            )
              ? record.reason
              : "other",
            ["sound", "damaged", "inspection_needed"].includes(
              record?.deviceCondition,
            )
              ? record.deviceCondition
              : "inspection_needed",
            [
              "cash_refund",
              "store_credit",
              "remaining_settlement",
              "exchange",
            ].includes(record?.settlementMethod)
              ? record.settlementMethod
              : "remaining_settlement",
            asText(record?.status) || "completed",
            asText(record?.linkedNewInvoiceNumber) || null,
          ],
        );
      }
      await client.query(
        `UPDATE sales s SET return_balance_reduced = x.total_reduced
         FROM (SELECT sale_id, SUM(balance_reduced) AS total_reduced FROM returns GROUP BY sale_id) x
         WHERE x.sale_id=s.id AND s.return_balance_reduced <= 0 AND x.total_reduced > 0`,
      );
      const info = {
        importKey,
        brands: brands.length,
        warehouseBatches: batches.length,
        devices: devices.length,
        sales: sales.length,
        returns: returns.length,
        alreadyImported: false,
      };
      await client.query(
        "INSERT INTO import_batches(import_key,imported_at,summary) VALUES($1,$2,$3::jsonb)",
        [importKey, nowMs(), JSON.stringify(info)],
      );
      return info;
    });
    res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    next(e);
  }
});
// ---- Electronic wallets / InstaPay transfers ----
const TRANSFER_COMMISSION_DEFAULTS = Object.freeze({
  wallet_withdrawal: 0,
  wallet_transfer: 0,
  instapay_withdrawal: 0,
  instapay_transfer: 0,
  instapay_vodafone_transfer: 0,
});

function transferLineDto(row) {
  const dailyLimit = money(row.daily_limit);
  const monthlyLimit = money(row.monthly_limit);
  const dailyUsed = money(row.daily_used);
  const monthlyUsed = money(row.monthly_used);
  return {
    id: row.id,
    phone: row.phone,
    ownerName: row.owner_name,
    walletType: row.wallet_type || "",
    bankName: row.bank_name || "",
    lastFour: row.last_four || "",
    supportsWallet: Boolean(row.supports_wallet),
    supportsInstapay: Boolean(row.supports_instapay),
    dailyLimit,
    monthlyLimit,
    dailyUsed,
    monthlyUsed,
    dailyRemaining: money(Math.max(0, dailyLimit - dailyUsed)),
    monthlyRemaining: money(Math.max(0, monthlyLimit - monthlyUsed)),
    balance: money(row.balance),
    isActive: Boolean(row.is_active),
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
  };
}

function transferTransactionDto(row) {
  return {
    id: row.id,
    referenceNumber: row.reference_number,
    operationType: row.operation_type,
    serviceType: row.service_type,
    commissionType: row.commission_type,
    sourceLineId: row.source_line_id,
    sourcePhone: row.source_phone_snapshot,
    sourceOwnerName: row.source_owner_snapshot,
    destinationLineId: row.destination_line_id || null,
    destinationPhone: row.destination_phone_snapshot || "",
    recipientPhone: row.recipient_phone || "",
    recipientName: row.recipient_name || "",
    amount: money(row.amount),
    commission: money(row.commission),
    transferCost: money(row.transfer_cost),
    profit: money(row.profit),
    transferToVodafone: Boolean(row.transfer_to_vodafone),
    createdAt: asNumber(row.created_at),
  };
}

async function resetTransferLinePeriods(queryable = pool) {
  // PostgreSQL sessions are configured to Africa/Cairo; CURRENT_DATE therefore
  // follows Egypt's local midnight without relying on a browser timer.
  await queryable.query(
    `UPDATE transfer_lines
       SET daily_used = CASE WHEN daily_period < CURRENT_DATE THEN 0 ELSE daily_used END,
           monthly_used = CASE
             WHEN monthly_period < date_trunc('month', CURRENT_DATE)::date THEN 0
             ELSE monthly_used
           END,
           daily_period = CASE WHEN daily_period < CURRENT_DATE THEN CURRENT_DATE ELSE daily_period END,
           monthly_period = CASE
             WHEN monthly_period < date_trunc('month', CURRENT_DATE)::date
               THEN date_trunc('month', CURRENT_DATE)::date
             ELSE monthly_period
           END,
           updated_at = (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT
     WHERE daily_period < CURRENT_DATE
        OR monthly_period < date_trunc('month', CURRENT_DATE)::date`,
  );
}

function validateTransferLineInput(body) {
  const phone = asText(body?.phone);
  const phoneDigits = phone.replace(/\D/g, "");
  const ownerName = asText(body?.ownerName);
  const supportsWallet = body?.supportsWallet === true;
  const supportsInstapay = body?.supportsInstapay === true;
  const walletType = asText(body?.walletType);
  const bankName = asText(body?.bankName);
  const lastFour = asText(body?.lastFour);
  const dailyLimit = money(asNumber(body?.dailyLimit, NaN));
  const monthlyLimit = money(asNumber(body?.monthlyLimit, NaN));
  const balance = money(asNumber(body?.balance, NaN));

  if (phoneDigits.length < 10 || phoneDigits.length > 15)
    throw httpError(400, "رقم الخط لازم يكون من 10 إلى 15 رقمًا.");
  if (!ownerName) throw httpError(400, "اكتب اسم صاحب الخط.");
  if (!supportsWallet && !supportsInstapay)
    throw httpError(400, "اختار المحفظة الإلكترونية أو إنستا باي على الأقل.");
  if (supportsWallet && !walletType)
    throw httpError(400, "اختار نوع المحفظة الإلكترونية.");
  if (supportsInstapay && !bankName)
    throw httpError(400, "اختار البنك الخاص بخط إنستا باي.");
  if (lastFour && !/^\d{4}$/.test(lastFour))
    throw httpError(400, "آخر أربع أرقام لازم تكون أرقامًا فقط.");
  if (
    ![dailyLimit, monthlyLimit, balance].every(
      (n) => Number.isFinite(n) && n >= 0,
    )
  )
    throw httpError(400, "الليميت والرصيد لازم يكونوا أرقامًا موجبة أو صفرًا.");

  return {
    phone,
    phoneKey: phoneDigits,
    ownerName,
    walletType: supportsWallet ? walletType : "",
    bankName: supportsInstapay ? bankName : "",
    lastFour: supportsInstapay ? lastFour : "",
    supportsWallet,
    supportsInstapay,
    dailyLimit,
    monthlyLimit,
    balance,
  };
}

async function readTransferCommissions(queryable = pool) {
  const result = await queryable.query(
    "SELECT value FROM app_settings WHERE key = 'transfer_commissions' LIMIT 1",
  );
  const stored = result.rows[0]?.value;
  const values = { ...TRANSFER_COMMISSION_DEFAULTS };
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const key of Object.keys(values)) {
      const value = Number(stored[key]);
      if (Number.isFinite(value) && value >= 0) values[key] = money(value);
    }
  }
  return values;
}

app.get("/api/transfer-lines", async (_req, res, next) => {
  try {
    await resetTransferLinePeriods();
    const result = await pool.query(
      "SELECT * FROM transfer_lines ORDER BY is_active DESC, updated_at DESC, owner_name ASC",
    );
    res.json(result.rows.map(transferLineDto));
  } catch (error) {
    next(error);
  }
});

app.post("/api/transfer-lines", async (req, res, next) => {
  try {
    const line = validateTransferLineInput(req.body);
    const now = nowMs();
    const id = asText(req.body?.id) || newId("transfer-line-");
    const result = await pool.query(
      `INSERT INTO transfer_lines
        (id,phone,phone_key,owner_name,wallet_type,bank_name,last_four,
         supports_wallet,supports_instapay,daily_limit,monthly_limit,balance,
         daily_used,monthly_used,daily_period,monthly_period,is_active,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,0,CURRENT_DATE,
         date_trunc('month',CURRENT_DATE)::date,TRUE,$13,$13)
       RETURNING *`,
      [
        id,
        line.phone,
        line.phoneKey,
        line.ownerName,
        line.walletType,
        line.bankName,
        line.lastFour,
        line.supportsWallet,
        line.supportsInstapay,
        line.dailyLimit,
        line.monthlyLimit,
        line.balance,
        now,
      ],
    );
    res.status(201).json(transferLineDto(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.put("/api/transfer-lines/:id", async (req, res, next) => {
  try {
    const line = validateTransferLineInput(req.body);
    const now = nowMs();
    const result = await pool.query(
      `UPDATE transfer_lines SET
         phone=$2, phone_key=$3, owner_name=$4, wallet_type=$5, bank_name=$6,
         last_four=$7, supports_wallet=$8, supports_instapay=$9, daily_limit=$10,
         monthly_limit=$11, balance=$12, is_active=COALESCE($13,is_active), updated_at=$14
       WHERE id=$1 RETURNING *`,
      [
        asText(req.params.id),
        line.phone,
        line.phoneKey,
        line.ownerName,
        line.walletType,
        line.bankName,
        line.lastFour,
        line.supportsWallet,
        line.supportsInstapay,
        line.dailyLimit,
        line.monthlyLimit,
        line.balance,
        typeof req.body?.isActive === "boolean" ? req.body.isActive : null,
        now,
      ],
    );
    if (!result.rowCount) throw httpError(404, "الخط غير موجود.");
    res.json(transferLineDto(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/transfer-lines/:id", async (req, res, next) => {
  try {
    const result = await pool.query(
      "UPDATE transfer_lines SET is_active=FALSE, updated_at=$2 WHERE id=$1 RETURNING *",
      [asText(req.params.id), nowMs()],
    );
    if (!result.rowCount) throw httpError(404, "الخط غير موجود.");
    res.json({ ok: true, line: transferLineDto(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/transfer-commissions", async (_req, res, next) => {
  try {
    res.json(await readTransferCommissions());
  } catch (error) {
    next(error);
  }
});

app.put("/api/transfer-commissions", async (req, res, next) => {
  try {
    const input = req.body && typeof req.body === "object" ? req.body : {};
    const values = {};
    for (const key of Object.keys(TRANSFER_COMMISSION_DEFAULTS)) {
      const value = Number(input[key]);
      if (!Number.isFinite(value) || value < 0)
        throw httpError(400, "كل عمولة لازم تكون رقمًا موجبًا أو صفرًا.");
      values[key] = money(value);
    }
    const now = nowMs();
    await pool.query(
      `INSERT INTO app_settings(key,value,updated_at)
       VALUES('transfer_commissions',$1::jsonb,$2)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
      [JSON.stringify(values), now],
    );
    res.json(values);
  } catch (error) {
    next(error);
  }
});

app.post("/api/transfers", async (req, res, next) => {
  try {
    const operationType = validEnum(
      req.body?.operationType,
      ["transfer", "withdrawal"],
      "نوع العملية",
    );
    const serviceType = validEnum(
      req.body?.serviceType,
      ["wallet", "instapay"],
      "الخدمة",
    );
    const sourceLineId = asText(req.body?.sourceLineId);
    const destinationLineId = asText(req.body?.destinationLineId) || null;
    const recipientPhoneRaw = asText(req.body?.recipientPhone);
    const recipientPhone = recipientPhoneRaw.replace(/[^\d+]/g, "");
    const recipientName = asText(req.body?.recipientName);
    const amount = money(asNumber(req.body?.amount, NaN));
    const transferCost = money(asNumber(req.body?.transferCost, NaN));
    const transferToVodafone = req.body?.transferToVodafone === true;

    if (!sourceLineId)
      throw httpError(400, "اختار الخط اللي هتتنفذ عليه العملية.");
    if (!Number.isFinite(amount) || amount <= 0)
      throw httpError(400, "مبلغ العملية لازم يكون أكبر من صفر.");
    if (!Number.isFinite(transferCost) || transferCost < 0)
      throw httpError(400, "تكلفة التحويل لازم تكون صفرًا أو أكثر.");
    if (operationType === "withdrawal" && destinationLineId)
      throw httpError(400, "السحب لا يقبل اختيار خط داخلي كوجهة.");
    if (destinationLineId && destinationLineId === sourceLineId)
      throw httpError(400, "اختار خطًا مختلفًا لتحويل الرصيد لنفسك.");
    if (
      (operationType === "withdrawal" || !destinationLineId) &&
      recipientPhone.replace(/\D/g, "").length < 10
    )
      throw httpError(400, "اكتب رقم العميل بشكل صحيح.");
    if (
      transferToVodafone &&
      (operationType !== "transfer" ||
        serviceType !== "instapay" ||
        destinationLineId)
    )
      throw httpError(
        400,
        "خيار التحويل لفودافون متاح لتحويل إنستا باي إلى عميل فقط.",
      );

    const commissionType =
      serviceType === "wallet"
        ? operationType === "withdrawal"
          ? "wallet_withdrawal"
          : "wallet_transfer"
        : operationType === "withdrawal"
          ? "instapay_withdrawal"
          : transferToVodafone
            ? "instapay_vodafone_transfer"
            : "instapay_transfer";

    const operation = await transaction(async (client) => {
      const lineIds = [
        ...new Set([
          sourceLineId,
          ...(destinationLineId ? [destinationLineId] : []),
        ]),
      ].sort();
      const locked = await client.query(
        "SELECT * FROM transfer_lines WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE",
        [lineIds],
      );
      if (locked.rowCount !== lineIds.length)
        throw httpError(404, "الخط المختار غير موجود.");
      await client.query(
        `UPDATE transfer_lines
         SET daily_used=CASE WHEN daily_period < CURRENT_DATE THEN 0 ELSE daily_used END,
             monthly_used=CASE WHEN monthly_period < date_trunc('month',CURRENT_DATE)::date THEN 0 ELSE monthly_used END,
             daily_period=CASE WHEN daily_period < CURRENT_DATE THEN CURRENT_DATE ELSE daily_period END,
             monthly_period=CASE WHEN monthly_period < date_trunc('month',CURRENT_DATE)::date THEN date_trunc('month',CURRENT_DATE)::date ELSE monthly_period END,
             updated_at=$2
         WHERE id = ANY($1::text[])`,
        [lineIds, nowMs()],
      );
      const reread = await client.query(
        "SELECT * FROM transfer_lines WHERE id = ANY($1::text[]) ORDER BY id",
        [lineIds],
      );
      const rowsById = new Map(reread.rows.map((row) => [row.id, row]));
      const source = rowsById.get(sourceLineId);
      const destination = destinationLineId
        ? rowsById.get(destinationLineId)
        : null;
      if (!source?.is_active)
        throw httpError(
          409,
          "الخط المختار موقوف. فعّله من إدارة الخطوط أولًا.",
        );
      if (serviceType === "wallet" && !source.supports_wallet)
        throw httpError(400, "الخط المحدد لا يدعم المحافظ الإلكترونية.");
      if (serviceType === "instapay" && !source.supports_instapay)
        throw httpError(400, "الخط المحدد لا يدعم إنستا باي.");
      if (destinationLineId) {
        if (!destination?.is_active)
          throw httpError(409, "خط الاستقبال الداخلي غير نشط.");
        if (serviceType === "wallet" && !destination.supports_wallet)
          throw httpError(
            400,
            "خط الاستقبال لا يدعم المحافظ الإلكترونية المختارة.",
          );
        if (serviceType === "instapay" && !destination.supports_instapay)
          throw httpError(400, "خط الاستقبال لا يدعم إنستا باي المختار.");
      }

      const dailyRemaining = money(
        Math.max(0, asNumber(source.daily_limit) - asNumber(source.daily_used)),
      );
      const monthlyRemaining = money(
        Math.max(
          0,
          asNumber(source.monthly_limit) - asNumber(source.monthly_used),
        ),
      );
      if (amount > dailyRemaining + 0.001)
        throw httpError(
          409,
          `العملية مرفوضة: المتبقي من الليميت اليومي ${dailyRemaining.toFixed(2)} ج.م فقط.`,
        );
      if (amount > monthlyRemaining + 0.001)
        throw httpError(
          409,
          `العملية مرفوضة: المتبقي من الليميت الشهري ${monthlyRemaining.toFixed(2)} ج.م فقط.`,
        );
      if (
        operationType === "transfer" &&
        asNumber(source.balance) + 0.001 < amount
      )
        throw httpError(
          409,
          `رصيد الخط غير كافٍ. الرصيد المتاح ${money(source.balance).toFixed(2)} ج.م.`,
        );

      const commissions = await readTransferCommissions(client);
      const commission = money(commissions[commissionType]);
      const profit = money(commission - transferCost);
      const id = newId("transfer-");
      const referenceNumber = `TR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const destinationPhone = destination ? destination.phone : recipientPhone;
      const now = nowMs();

      await client.query(
        `UPDATE transfer_lines
           SET balance = CASE WHEN $2='withdrawal' THEN balance + $3 ELSE balance - $3 END,
               daily_used=daily_used+$3,
               monthly_used=monthly_used+$3,
               updated_at=$4
         WHERE id=$1`,
        [sourceLineId, operationType, amount, now],
      );
      if (destination) {
        await client.query(
          "UPDATE transfer_lines SET balance=balance+$2, updated_at=$3 WHERE id=$1",
          [destination.id, amount, now],
        );
      }

      const inserted = await client.query(
        `INSERT INTO transfer_transactions
          (id,reference_number,operation_type,service_type,commission_type,
           source_line_id,source_phone_snapshot,source_owner_snapshot,
           destination_line_id,destination_phone_snapshot,recipient_phone,recipient_name,
           amount,commission,transfer_cost,profit,transfer_to_vodafone,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING *`,
        [
          id,
          referenceNumber,
          operationType,
          serviceType,
          commissionType,
          source.id,
          source.phone,
          source.owner_name,
          destination?.id || null,
          destinationPhone,
          recipientPhone,
          recipientName,
          amount,
          commission,
          transferCost,
          profit,
          transferToVodafone,
          now,
        ],
      );
      return transferTransactionDto(inserted.rows[0]);
    });
    res.status(201).json(operation);
  } catch (error) {
    next(error);
  }
});

app.get("/api/transfers", async (req, res, next) => {
  try {
    const where = [];
    const values = [];
    const add = (sql, value) => {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    };
    const q = asText(req.query.q);
    const operationType = asText(req.query.operationType);
    const serviceType = asText(req.query.serviceType);
    const sourceLineId = asText(req.query.sourceLineId);
    const dateFrom = asText(req.query.dateFrom);
    const dateTo = asText(req.query.dateTo);
    const profitMin =
      req.query.profitMin === undefined || req.query.profitMin === ""
        ? null
        : Number(req.query.profitMin);
    const profitMax =
      req.query.profitMax === undefined || req.query.profitMax === ""
        ? null
        : Number(req.query.profitMax);

    if (q) {
      values.push(`%${q}%`);
      const p = `$${values.length}`;
      where.push(
        `(t.reference_number ILIKE ${p} OR t.source_phone_snapshot ILIKE ${p} OR t.source_owner_snapshot ILIKE ${p} OR t.recipient_phone ILIKE ${p} OR t.recipient_name ILIKE ${p} OR t.destination_phone_snapshot ILIKE ${p})`,
      );
    }
    if (["transfer", "withdrawal"].includes(operationType))
      add("t.operation_type = ?", operationType);
    if (["wallet", "instapay"].includes(serviceType))
      add("t.service_type = ?", serviceType);
    if (sourceLineId) add("t.source_line_id = ?", sourceLineId);
    if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom))
      add(
        "t.created_at >= (extract(epoch FROM (?::date::timestamp AT TIME ZONE 'Africa/Cairo')) * 1000)::bigint",
        dateFrom,
      );
    if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo))
      add(
        "t.created_at < (extract(epoch FROM (((?::date + 1)::timestamp) AT TIME ZONE 'Africa/Cairo')) * 1000)::bigint",
        dateTo,
      );
    if (profitMin !== null && Number.isFinite(profitMin))
      add("t.profit >= ?", money(profitMin));
    if (profitMax !== null && Number.isFinite(profitMax))
      add("t.profit <= ?", money(profitMax));
    const limit = Math.max(
      1,
      Math.min(1000, Math.trunc(asNumber(req.query.limit, 500))),
    );
    values.push(limit);
    const query = `SELECT t.* FROM transfer_transactions t ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY t.created_at DESC LIMIT $${values.length}`;
    const result = await pool.query(query, values);
    res.json(result.rows.map(transferTransactionDto));
  } catch (error) {
    next(error);
  }
});

// Also runs while the server is open. Every read/operation independently rolls over
// stale periods, so a closed PC does not preserve yesterday's consumed limit.
const transferRolloverTimer = setInterval(() => {
  resetTransferLinePeriods().catch((error) =>
    console.error("Transfer limit rollover failed:", error.message),
  );
}, 30_000);
transferRolloverTimer.unref?.();

app.use((req, res) =>
  res
    .status(404)
    .json({ error: `المسار غير موجود: ${req.method} ${req.path}` }),
);
app.use((error, _req, res, _next) => {
  if (error?.code === "23505") {
    return res.status(409).json({
      error: "يوجد سجل بنفس المعرّف أو القيمة الفريدة بالفعل.",
      code: error.code,
      detail: error.detail,
    });
  }
  if (error?.code === "23503") {
    return res.status(409).json({
      error: "لا يمكن تنفيذ العملية لوجود سجلات مرتبطة بها.",
      code: error.code,
    });
  }
  if (error?.code === "23514" || error?.code === "22P02") {
    return res.status(400).json({
      error: "البيانات المدخلة غير صحيحة.",
      code: error.code,
      detail: error.detail,
    });
  }
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error("API error:", error);
  res.status(status).json({
    error: status >= 500 ? "حدث خطأ داخلي في الخادم." : error.message,
    ...(process.env.NODE_ENV === "development" && error?.detail
      ? { detail: error.detail }
      : {}),
  });
});

async function start() {
  // Applies additive CREATE TABLE / INDEX statements; keeps prior generic tables untouched.
  const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));
  const schema = await fs.readFile(schemaPath, "utf8");
  await pool.query(schema);
  await migrateLegacyEmployees();
  const dbInfo = await pool.query(
    "SELECT current_database() AS database, current_user AS db_user, version() AS version",
  );
  console.log("PostgreSQL connection OK");
  console.log(`Database: ${dbInfo.rows[0].database}`);
  console.log(`User: ${dbInfo.rows[0].db_user}`);
  console.log(dbInfo.rows[0].version);
  app.listen(PORT, HOST, () => {
    console.log(
      `Mobile System normalized API listening on http://${HOST}:${PORT}`,
    );
    console.log(`Health check: http://127.0.0.1:${PORT}/api/health`);
    console.log(
      "Tables: brands, brand_series, brand_models, customers, employees, warehouse_batches, sale_items, sales, sale_installments, payments, returns",
    );
    if (!API_TOKEN)
      console.warn(
        "WARNING: API_TOKEN is empty. Keep port 5000 inside a trusted LAN and configure a token for shared use.",
      );
  });
}
start().catch((error) => {
  console.error("Backend startup failed:", error.message);
  process.exitCode = 1;
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});
