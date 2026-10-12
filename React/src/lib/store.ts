/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { sha256 } from "js-sha256";
import { useEffect, useState, useCallback } from "react";
import { round2, clamp0 } from "./format";
import { toast } from "sonner";
import { getApiUrl } from "@/api";
const API_URL = getApiUrl();
// أضف هذا الكود تحت الـ imports مباشرة
if (typeof window !== "undefined") {
  if (!window.crypto) {
    (window as any).crypto = {};
  }
  if (!window.crypto.randomUUID) {
    (window as any).crypto.randomUUID = () => {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };
  }
}

export type Unit = "كيلوجرام" | "لتر" | "قطعة" | "طبق" | "كيس" | "علبة";
export const UNITS: Unit[] = ["كيلوجرام", "لتر", "قطعة", "طبق", "كيس", "علبة"];

// Sub-unit dropdown
export type SubUnitType = "جرام" | "مل" | "قطعة" | "كيلوجرام" | "لتر";
export const SUB_UNIT_TYPES: SubUnitType[] = [
  "كيلوجرام",
  "جرام",
  "لتر",
  "مل",
  "قطعة",
];

// Yield component units restricted set
export type YieldUnit = "كيلوجرام" | "جرام" | "لتر" | "مل";
export const YIELD_UNITS: YieldUnit[] = ["كيلوجرام", "جرام", "لتر", "مل"];

// Recipe units include sub-units + base units
export type RecipeUnit = Unit | "جرام" | "مل";
export const RECIPE_UNITS: RecipeUnit[] = [
  "جرام",
  "مل",
  "كيلوجرام",
  "لتر",
  "قطعة",
  "طبق",
  "كيس",
  "علبة",
];

export type KitchenPrinter = {
  id: string;
  name: string;
  ip: string;
  port: number;
  targetDept: string;
};

export type PrinterJob = {
  printer: KitchenPrinter;
  printerItems: any[];
};

export const BASIC_UNITS: Unit[] = ["كيلوجرام", "لتر"];

// 🔥 التعديل: إضافة "شيشه" كقسم رسمي
export const DEPARTMENTS = ["مطبخ", "بار", "صالة", "شيشه"] as const;
export type Department = (typeof DEPARTMENTS)[number];

// 🔥 التعديل: إضافة "شيشه" كقسم فرعي
export type SubDept = "مطبخ" | "بار" | "شيشه";
export const SUB_DEPTS: SubDept[] = ["مطبخ", "بار", "شيشه"];

export const deptKey = (dept: SubDept, itemId: string) => `${dept}_${itemId}`;

export type ItemKind = "standard" | "processed";

export interface YieldComponent {
  itemId: string;
  qty: number;
  unit: YieldUnit;
}
export interface ItemYield {
  components: YieldComponent[];
  wasteQty: number;
  wasteMode: "percent" | "fixed";
  sourceName?: string;
}

export interface AppliedDelta {
  itemId: string;
  addedBase: number;
}

export interface Item {
  department: string;
  id: string;
  code: string;
  name: string;
  unit: Unit;
  qty: number;
  avgPrice: number;
  critical: number;
  conversionFactor: number;
  subUnitQty?: number;
  subUnitType?: SubUnitType;
  kind?: ItemKind;
  yieldDef?: ItemYield;
  lastYieldDeltas?: AppliedDelta[];
  notes?: string;
}

export interface VoucherLine {
  itemId: string;
  itemName: string;
  unit: Unit;
  qty: number;
  price?: number;
}

export interface EntryVoucher {
  id: string;
  type: "entry";
  date: string;
  supplier: string;
  lines: VoucherLine[];
  createdAt: number;
}

export interface IssueVoucher {
  id: string;
  type: "issue";
  date: string;
  department: Department;
  lines: VoucherLine[];
  createdAt: number;
}

export type Voucher = EntryVoucher | IssueVoucher;

export interface RecipeIngredient {
  itemId: string;
  qty: number;
  unit: RecipeUnit;
  refKind?: "item" | "meal";
  errorMargin?: number;
}

export type MealKind = "menu" | "processed";

export const DEFAULT_ERROR_MARGIN_GRAMS = 2;
export const SHISHA_CATEGORY = "شيشه";

export interface ModifierOption {
  id: string;
  label: string;
  extraPrice: number;
}
export interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  options: ModifierOption[];
}

export interface Meal {
  id: string;
  name: string;
  department: SubDept;
  sellingPrice: number;
  wasteMargin: number;
  wasteMode?: "percent" | "fixed";
  kind?: MealKind;
  category?: string;
  ingredients: RecipeIngredient[];
  hasModifiers?: boolean;
  modifierGroups?: ModifierGroup[];
}

export interface SaleLine {
  mealId: string;
  qty: number;
}
export interface SaleEntry {
  id: string;
  date: string;
  department: SubDept;
  lines: SaleLine[];
  totalSales: number;
  totalCost: number;
  createdAt: number;
}

export interface AuditRow {
  itemId: string;
  expected: number;
  actual: number;
  match: boolean;
}
export interface AuditEntry {
  id: string;
  date: string;
  department: SubDept;
  rows: AuditRow[];
  shortageValue: number;
  penaltyValue: number;
  createdAt: number;
}

export type DeptStock = Record<string, number>;

interface DB {
  shifts: any;
  invoices: any;
  shift: any;
  orders: any;
  updateDeptStock: any;
  items: Item[];
  vouchers: Voucher[];
  meals: Meal[];
  audits: AuditEntry[];
  deptStock: DeptStock;
}

const KEY = "rest-inv-db-v1";
const PASS_KEY = "rest-inv-auth-v1";
const PASS_HASH_KEY = "rest-inv-password-hash";

function nextCode(items: Item[]): string {
  let max = 0;
  for (const it of items) {
    const m = (it.code || "").match(/ING-(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1]));
  }
  return "ING-" + String(max + 1).padStart(3, "0");
}

function defaultDB(): DB {
  const items: Item[] = [
    {
      id: crypto.randomUUID(),
      code: "ING-001",
      name: "طماطم",
      unit: "كيلوجرام",
      qty: 25,
      avgPrice: 12,
      critical: 10,
      conversionFactor: 1,
      kind: "standard",
      department: "",
    },
    {
      id: crypto.randomUUID(),
      code: "ING-002",
      name: "أرز بسمتي",
      unit: "كيس",
      qty: 8,
      avgPrice: 180,
      critical: 5,
      conversionFactor: 25000,
      subUnitQty: 25000,
      subUnitType: "جرام",
      kind: "standard",
      department: "",
    },
    {
      id: crypto.randomUUID(),
      code: "ING-003",
      name: "زيت دوار الشمس",
      unit: "لتر",
      qty: 4,
      avgPrice: 55,
      critical: 6,
      conversionFactor: 1,
      kind: "standard",
      department: "",
    },
    {
      id: crypto.randomUUID(),
      code: "ING-004",
      name: "دجاج",
      unit: "كيلوجرام",
      qty: 18,
      avgPrice: 85,
      critical: 10,
      conversionFactor: 1,
      kind: "standard",
      department: "",
    },
    {
      id: crypto.randomUUID(),
      code: "ING-005",
      name: "أكواب زجاجية",
      unit: "قطعة",
      qty: 120,
      avgPrice: 7,
      critical: 50,
      conversionFactor: 1,
      kind: "standard",
      department: "",
    },
  ];
  // 🔥 التعديل: إزالة المفاتيح المكررة التي كانت تمسح البيانات
  return {
    orders: undefined as any,
    updateDeptStock: undefined as any,
    items,
    vouchers: [],
    deptStock: {},
    meals: [],
    audits: [],
    shifts: [], // 🌟 ضفنا دي
    invoices: [], // 🌟 وضفنا دي
    shift: null, // 🌟 الـ shift مطلوب في الـ DB
    // shift: [], // 🌟 حطينا المصفوفة الاحتياطية للورديات
  };
}

function fixUnit(u: any): Unit {
  if (u === "كيلو") return "كيلوجرام";
  if ((UNITS as string[]).includes(u)) return u as Unit;
  return "قطعة";
}

function migrate(db: any): DB {
  const base = defaultDB();
  const out: DB = {
    orders: db.orders,
    shifts: Array.isArray(db.shifts) ? db.shifts : base.shifts, // 🌟 تحديث المايجريشن
    invoices: Array.isArray(db.invoices) ? db.invoices : base.invoices, // 🌟 تحديث المايجريشن
    updateDeptStock: db.updateDeptStock,
    items: Array.isArray(db.items) ? db.items : base.items,
    vouchers: Array.isArray(db.vouchers) ? db.vouchers : [],
    deptStock:
      db.deptStock && typeof db.deptStock === "object" ? db.deptStock : {},
    meals: Array.isArray(db.meals) ? db.meals : [],
    audits: Array.isArray(db.audits) ? db.audits : [],
    shift: db.shift !== undefined ? db.shift : base.shift, // 🌟 مابين الـ shift القديم أو الديفولت
  };
  for (const it of out.items) {
    if (!it.code) it.code = nextCode(out.items.filter((x) => x.code));
    it.unit = fixUnit(it.unit);
    if (typeof it.conversionFactor !== "number" || it.conversionFactor <= 0)
      it.conversionFactor = 1;
    if (it.qty < 0) it.qty = 0;
    if (it.avgPrice < 0) it.avgPrice = 0;
    if ((it as any).kind === "raw") it.kind = "processed";
    if (!it.kind) it.kind = "standard";
    delete (it as any).yieldedFrom;
    if (it.yieldDef && Array.isArray(it.yieldDef.components)) {
      for (const c of it.yieldDef.components) {
        if (!(c as any).unit) {
          const tgt = out.items.find((x) => x.id === c.itemId);
          (c as any).unit = (
            tgt?.unit === "لتر" ? "لتر" : "كيلوجرام"
          ) as YieldUnit;
        }
      }
      if (!it.yieldDef.wasteMode) it.yieldDef.wasteMode = "fixed";
    }
  }
  for (const v of out.vouchers) {
    for (const ln of v.lines) ln.unit = fixUnit(ln.unit);
  }
  for (const m of out.meals) {
    if (!m.kind) m.kind = "menu";
    if (!m.wasteMode) m.wasteMode = "percent";
    if (!m.category) m.category = "";
    for (const ing of m.ingredients) {
      if ((ing.unit as any) === "كيلو") ing.unit = "كيلوجرام";
      if (typeof ing.errorMargin !== "number" || ing.errorMargin < 0)
        ing.errorMargin = 0;
    }
  }
  return out;
}

function load(): DB {
  if (typeof window === "undefined") return defaultDB();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const d = defaultDB();
      localStorage.setItem(KEY, JSON.stringify(d));
      return d;
    }
    return migrate(JSON.parse(raw));
  } catch {
    return defaultDB();
  }
}

function save(db: DB) {
  localStorage.setItem(KEY, JSON.stringify(db));
  window.dispatchEvent(new Event("db-update"));
}

export function yieldToBase(
  qty: number,
  fromUnit: YieldUnit,
  targetUnit: Unit,
): number {
  if (fromUnit === targetUnit) return qty;
  if (fromUnit === "جرام" && targetUnit === "كيلوجرام") return qty / 1000;
  if (fromUnit === "كيلوجرام" && targetUnit === "كيلوجرام") return qty;
  if (fromUnit === "مل" && targetUnit === "لتر") return qty / 1000;
  if (fromUnit === "لتر" && targetUnit === "لتر") return qty;
  return 0;
}

export function yieldToSubUnit(
  qty: number,
  fromUnit: YieldUnit,
  subUnit?: SubUnitType,
): number | null {
  if (!subUnit) return null;
  if ((fromUnit as string) === (subUnit as string)) return qty;
  if (fromUnit === "جرام" && subUnit === "كيلوجرام") return qty / 1000;
  if (fromUnit === "كيلوجرام" && subUnit === "جرام") return qty * 1000;
  if (fromUnit === "مل" && subUnit === "لتر") return qty / 1000;
  if (fromUnit === "لتر" && subUnit === "مل") return qty * 1000;
  return null;
}

function reapplyYield(cur: DB, processed: Item) {
  if (Array.isArray(processed.lastYieldDeltas)) {
    for (const d of processed.lastYieldDeltas) {
      const t = cur.items.find((i) => i.id === d.itemId);
      if (!t) continue;
      t.qty = round2(clamp0(t.qty - d.addedBase));
    }
  }
  processed.lastYieldDeltas = [];
  if (
    processed.kind !== "processed" ||
    !processed.yieldDef ||
    processed.yieldDef.components.length === 0
  )
    return;
  const pieces = clamp0(processed.qty);
  if (pieces <= 0) return;
  const deltas: AppliedDelta[] = [];
  for (const c of processed.yieldDef.components) {
    const target = cur.items.find((i) => i.id === c.itemId);
    if (!target) continue;
    const perPieceBase = yieldToBase(c.qty, c.unit, target.unit);
    if (perPieceBase <= 0) continue;
    const total = round2(perPieceBase * pieces);
    target.qty = round2(clamp0(target.qty + total));
    const note = `تم إضافة ${c.qty} ${c.unit} من ${processed.name} (× ${pieces} قطعة = ${fmt(total)} ${target.unit})`;
    target.notes = (target.notes ? target.notes + "\n" : "") + note;
    deltas.push({ itemId: target.id, addedBase: total });
  }
  processed.lastYieldDeltas = deltas;
}

function fmt(n: number): string {
  return round2(n).toString();
}
// 🌟 المتغيرات دي برة الـ Hook عشان تبقى Global وتمنع التكرار
let isSyncing = false;
let hasSyncedInitialData = false;

export function useDB() {
  const [db, setDb] = useState<DB>(() =>
    typeof window !== "undefined"
      ? load()
      : {
          orders: undefined as any,
          updateDeptStock: undefined as any,
          shifts: [], // 🌟 إضافة عشان التايب سكريبت
          invoices: [], // 🌟 إضافة عشان التايب سكريبت
          items: [],
          vouchers: [],
          deptStock: {},
          meals: [],
          sales: [],
          audits: [],
          shift: null, // 🌟 ضفنا الـ shift هنا عشان التايب سكريبت يرتاح
        },
  );
  useEffect(() => {
    const refresh = () => setDb(load());
    refresh();
    window.addEventListener("db-update", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("db-update", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const fetchSales = useCallback(
    async (
      startDate: string,
      endDate: string,
      department?: string,
    ): Promise<SaleEntry[]> => {
      const params = new URLSearchParams();

      params.set("startDate", startDate);
      params.set("endDate", endDate);

      if (department) {
        params.set("department", department);
      }

      const res = await fetch(
        `http://${API_URL}:5000/api/sales?${params.toString()}`,
      );

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(
          `SALES_FETCH_FAILED: ${res.status}${
            errorText ? ` - ${errorText}` : ""
          }`,
        );
      }

      const data = await res.json();

      if (!Array.isArray(data)) {
        throw new Error("SALES_FETCH_FAILED: invalid response");
      }

      return data as SaleEntry[];
    },
    [],
  );

  // 1️⃣ دالة إضافة صنف جديد (ترمي في الـ pgAdmin + تحدث الكاش المحلي)
  const addItem = useCallback(async (item: Omit<Item, "id">) => {
    // 🧹 تنظيف وتأمين البيانات وبناء الـ UUID من الـ window مباشرة
    const cleanItem: Item = {
      id:
        typeof window !== "undefined" && window.crypto?.randomUUID
          ? window.crypto.randomUUID()
          : "local-" + Date.now(),
      department: item.department || "",
      code: item.code || "",
      name: item.name || "",
      unit: item.unit,
      qty: Number(item.qty) || 0,
      avgPrice: Number(item.avgPrice) || 0,
      critical: Number(item.critical) || 0,
      conversionFactor: Number(item.conversionFactor) || 1,
      subUnitQty: Number(item.subUnitQty) || 0,
      subUnitType: item.subUnitType,
      kind: item.kind || "standard",
      yieldDef: item.yieldDef || undefined,
      lastYieldDeltas: item.lastYieldDeltas || [],
      notes: item.notes || "",
    };

    console.log("🚀 البيانات اللي طالعة من الفورمة للسيرفر:", cleanItem);

    try {
      const response = await fetch(`http://${API_URL}:5000/api/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanItem),
      });

      if (response.ok) {
        const savedItem = await response.json();

        const cur = load();
        cur.items = [...cur.items, savedItem];
        save(cur);
        setDb(cur);
        toast.success(
          `✅ تم تسجيل الصنف "${savedItem.name}" في الداتابيز بنجاح!`,
        );
        return savedItem;
      } else {
        const errorText = await response.text();
        console.error("⚠️ رد السيرفر بالرفض:", errorText);
        toast.error("⚠️ السيرفر رفض حفظ الصنف الجديد");
      }
    } catch (error) {
      console.error("❌ السيرفر واقع أو مش شغال:", error);
      toast.error("مش قادر أتصل بالسيرفر أصلاً.");
    }
  }, []);
  // 2️⃣ دالة تحديث صنف بالكامل
  // ملحوظة: غيرنا الرابط لـ POST لأن السيرفر فيه (ON CONFLICT) يعني هيعمل تدوير وتحديث تلقائي لو الـ ID موجود
  const updateItem = useCallback(
    async (id: string, updatedFields: Partial<Item>) => {
      const cur = load();
      const currentItem = cur.items.find((i) => i.id === id);
      if (!currentItem) return;

      const fullUpdatedItem = { ...currentItem, ...updatedFields };

      try {
        const response = await fetch(`http://${API_URL}:5000/api/inventory`, {
          method: "POST", // السيرفر بيستقبلها وبيدخل في الـ UPDATE علطول بسبب الـ ON CONFLICT
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fullUpdatedItem),
        });

        if (response.ok) {
          const savedItem = await response.json();

          cur.items = cur.items.map((i) => (i.id === id ? savedItem : i));
          save(cur);
          setDb(cur);
          toast.success("✅ تم تحديث بيانات الصنف بنجاح");
        } else {
          toast.error("⚠️ فشل تحديث بيانات الصنف بالسيرفر");
        }
      } catch (error) {
        console.error("❌ خطأ أثناء تحديث الصنف:", error);
        toast.error("خطأ في الاتصال بالسيرفر أثناء التعديل");
      }
    },
    [],
  );

  // 3️⃣ دالة حذف صنف تماماً
  const deleteItem = useCallback(async (id: string) => {
    try {
      const response = await fetch(
        `http://${API_URL}:5000/api/inventory/${id}`,
        {
          method: "DELETE",
        },
      );

      if (response.ok) {
        const cur = load();
        cur.items = cur.items.filter((i) => i.id !== id);
        save(cur);
        setDb(cur);
        toast.success("🗑️ تم حذف الصنف نهائياً من الداتابيز والكاش");
      } else {
        toast.error("⚠️ السيرفر رفض عملية الحذف");
      }
    } catch (error) {
      console.error("❌ خطأ أثناء حذف الصنف:", error);
      toast.error("خطأ في الاتصال بالسيرفر أثناء الحذف");
    }
  }, []);
  const syncFromServer = useCallback(async () => {
    if (hasSyncedInitialData || isSyncing) return;

    isSyncing = true;

    try {
      // 1️⃣ نعرف نوع الجهاز من السيرفر
      const deviceRes = await fetch(`http://${API_URL}:5000/api/device-check`);

      if (!deviceRes.ok) {
        throw new Error(`DEVICE_CHECK_FAILED: ${deviceRes.status}`);
      }

      const deviceData = await deviceRes.json();

      console.log("🖥️ DEVICE TYPE:", deviceData.deviceType);

      // 2️⃣ كل الأجهزة تجيب البيانات الأساسية فقط
      // ❌ لا Sales هنا
      // ❌ لا Invoices هنا
      const responses = await Promise.all([
        fetch(`http://${API_URL}:5000/api/inventory`),
        fetch(`http://${API_URL}:5000/api/dept-stock`),
        fetch(`http://${API_URL}:5000/api/meals`),
      ]);

      const [invRes, deptRes, mealsRes] = responses;

      if (!invRes.ok || !deptRes.ok || !mealsRes.ok) {
        throw new Error(
          `SYNC_FAILED: inventory=${invRes.status}, deptStock=${deptRes.status}, meals=${mealsRes.status}`,
        );
      }

      // 3️⃣ نقرأ البيانات الأساسية
      const serverItems = await invRes.json();
      const deptStockData = await deptRes.json();
      const serverMeals = await mealsRes.json();

      // 4️⃣ Validation
      if (
        !Array.isArray(serverItems) ||
        !Array.isArray(deptStockData) ||
        !Array.isArray(serverMeals)
      ) {
        throw new Error("SYNC_FAILED: server returned invalid data");
      }

      // 5️⃣ تجهيز Dept Stock
      const cur = load();

      const newDeptStock: Record<string, number> = {};

      deptStockData.forEach((row) => {
        const key = deptKey(row.department, row.item_id);

        newDeptStock[key] = Number(row.qty) || 0;
      });

      // 6️⃣ نبني DB الجديدة
      // ⚠️ مهم:
      // sales الموجودة محليًا لا نلمسها
      const nextDb = {
        ...cur,
        items: serverItems,
        meals: serverMeals,
        deptStock: newDeptStock,
        sales: [], // المبيعات لا تُخزن محليًا
      };

      // 7️⃣ نحفظ البيانات الأساسية فقط
      save(nextDb);
      setDb(nextDb);

      hasSyncedInitialData = true;
    } catch (error) {
      console.error(
        "⚠️ INITIAL SYNC FAILED - LOCAL DATA WAS NOT TOUCHED:",
        error,
      );

      // ❌ لا save()
      // ❌ لا setDb()
      // ❌ لا نمسح أي بيانات محلية
    } finally {
      isSyncing = false;
    }
  }, []);
  // 2. تشغيل المزامنة أول ما التطبيق يفتح
  useEffect(() => {
    syncFromServer();

    // باقي الـ Event Listeners زي ما هي عندك
    const refresh = () => setDb(load());
    window.addEventListener("db-update", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("db-update", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [syncFromServer]);
  const addEntryVoucher = useCallback(
    async (
      // 🌟 تحويل الدالة لـ async
      date: string,
      supplier: string,
      lines: { itemId: string; qty: number; price: number }[],
    ) => {
      const cur = load();
      const fullLines: VoucherLine[] = [];
      const itemsToUpdateDB: Item[] = []; // 🌟 مصفوفة لحفظ الأصناف التي تغيرت

      for (const l of lines) {
        const qty = clamp0(l.qty);
        const price = clamp0(l.price);
        if (qty <= 0) continue;
        const item = cur.items.find((i) => i.id === l.itemId);
        if (!item) continue;

        const newQty = item.qty + qty;
        // معادلة متوسط السعر الخاصة بك
        const newAvg =
          newQty > 0
            ? (item.qty * item.avgPrice + qty * price) / newQty
            : price;

        item.qty = round2(clamp0(newQty));
        item.avgPrice = round2(clamp0(newAvg));

        itemsToUpdateDB.push(item); // 🌟 حفظ الصنف بعد تحديثه

        fullLines.push({
          itemId: item.id,
          itemName: item.name,
          unit: item.unit,
          qty: round2(qty),
          price: round2(price),
        });
      }

      const v: EntryVoucher = {
        id: crypto.randomUUID(),
        type: "entry",
        date,
        supplier,
        lines: fullLines,
        createdAt: Date.now(),
      };
      // إرسال إذن التوريد للسيرفر ليظهر في الـ History
      fetch(`http://${API_URL}:5000/api/vouchers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      }).catch((err) => console.error("❌ فشل إرسال إذن التوريد:", err));
      cur.vouchers.unshift(v);
      save(cur);
      setDb(cur);

      // 🌟 السحر هنا: نرسل الأصناف التي تغير سعرها وكميتها إلى PostgreSQL
      for (const updatedItem of itemsToUpdateDB) {
        try {
          await fetch(`http://${API_URL}:5000/api/inventory`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedItem),
          });
        } catch (err) {
          console.error("❌ فشل مزامنة الصنف مع الداتابيز بعد التوريد:", err);
        }
      }

      return v;
    },
    [],
  );

  const addIssueVoucher = useCallback(
    async (
      // 🌟 تحويل الدالة لـ async
      date: string,
      department: Department,
      lines: { itemId: string; qty: number }[],
    ): Promise<
      { ok: true; voucher: IssueVoucher } | { ok: false; error: string }
    > => {
      const cur = load();

      for (const l of lines) {
        const q = clamp0(l.qty);
        if (q <= 0)
          return { ok: false, error: "الكمية يجب أن تكون أكبر من صفر" };
        const item = cur.items.find((i) => i.id === l.itemId);
        if (!item) return { ok: false, error: "صنف غير موجود" };
        if (q > item.qty)
          return {
            ok: false,
            error: `الكمية المطلوبة من "${item.name}" تتجاوز المتاح (${round2(item.qty)} ${item.unit})`,
          };
      }

      const fullLines: VoucherLine[] = [];
      const itemsToUpdateDB: Item[] = []; // 🌟 مصفوفة للحفظ في الداتابيز (المخزن الرئيسي)

      // 🌟 مصفوفة جديدة لحفظ أرصدة الأقسام الفرعية في الداتابيز
      const deptStocksToUpdateDB: {
        department: string;
        itemId: string;
        itemName: string;
        qty: number;
      }[] = [];

      const isSubDept = (SUB_DEPTS as readonly string[]).includes(department);

      for (const l of lines) {
        const q = clamp0(l.qty);
        const item = cur.items.find((i) => i.id === l.itemId)!;

        item.qty = round2(clamp0(item.qty - q));
        itemsToUpdateDB.push(item); // 🌟 حفظ الصنف بعد خصم الكمية

        fullLines.push({
          itemId: item.id,
          itemName: item.name,
          unit: item.unit,
          qty: round2(q),
        });

        if (isSubDept) {
          const k = deptKey(department as SubDept, item.id);
          const newDeptQty = round2(clamp0((cur.deptStock[k] || 0) + q));
          cur.deptStock[k] = newDeptQty;

          // 🌟 ضفنا اسم الصنف هنا عشان يروح للسيرفر
          deptStocksToUpdateDB.push({
            department: department,
            itemId: item.id,
            itemName: item.name,
            qty: newDeptQty,
          });
        }
      }

      const v: IssueVoucher = {
        id: crypto.randomUUID(),
        type: "issue",
        date,
        department,
        lines: fullLines,
        createdAt: Date.now(),
      };

      // إرسال إذن الصرف للسيرفر ليظهر في الـ History
      fetch(`http://${API_URL}:5000/api/vouchers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      }).catch((err) => console.error("❌ فشل إرسال إذن الصرف:", err));

      cur.vouchers.unshift(v);
      save(cur);
      setDb(cur);

      // 🌟 إرسال الأصناف المخصومة (المخزن الرئيسي) للسيرفر
      for (const updatedItem of itemsToUpdateDB) {
        try {
          await fetch(`http://${API_URL}:5000/api/inventory`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedItem),
          });
        } catch (err) {
          console.error("❌ فشل خصم الصنف من الداتابيز بعد الصرف:", err);
        }
      }

      // 🌟 السطر السحري الجديد: إرسال أرصدة الأقسام (المطبخ) للسيرفر والداتابيز
      for (const ds of deptStocksToUpdateDB) {
        try {
          await fetch(`http://${API_URL}:5000/api/dept-stock`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ds),
          });
        } catch (err) {
          console.error(`❌ فشل حفظ رصيد ${ds.department} في الداتابيز:`, err);
        }
      }

      return { ok: true, voucher: v };
    },
    [],
  );

  const saveMeal = useCallback(async (meal: Meal) => {
    const cur = load();
    const m: Meal = {
      ...meal,
      sellingPrice: round2(clamp0(meal.sellingPrice)),
      wasteMargin: 0,
      wasteMode: "fixed",
      kind: meal.kind || "menu",
    };

    // حفظ محلي سريع (عشان الـ UI يبقى سريع)
    const idx = cur.meals.findIndex((x) => x.id === m.id);
    if (idx >= 0) cur.meals[idx] = m;
    else cur.meals.push(m);
    save(cur);
    setDb(cur);

    // 🌟 إرسال للباك إند
    try {
      await fetch(`http://${API_URL}:5000/api/meals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(m),
      });
    } catch (e) {
      console.error("❌ فشل حفظ الريسبي في السيرفر:", e);
    }
  }, []);

  const deleteMeal = useCallback(async (id: string) => {
    const cur = load();
    cur.meals = cur.meals.filter((m) => m.id !== id);
    save(cur);
    setDb(cur);

    // 🌟 حذف من الباك إند
    try {
      await fetch(`http://${API_URL}:5000/api/meals/${id}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.error("❌ فشل حذف الريسبي من السيرفر:", e);
    }
  }, []);

  const bulkAddMeals = useCallback(async (meals: Meal[]) => {
    const cur = load();
    const formattedMeals = meals.map((m) => ({
      ...m,
      wasteMargin: 0,
      wasteMode: "fixed" as const,
      kind: m.kind || "menu",
    }));

    cur.meals.push(...formattedMeals);
    save(cur);
    setDb(cur);

    // 🌟 إرسال للباك إند بالدور (يفضل عمل مسار Bulk في الباك اند لو العدد ضخم جداً بس كدا هيشتغل تمام)
    for (const m of formattedMeals) {
      try {
        await fetch(`http://${API_URL}:5000/api/meals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(m),
        });
      } catch (e) {
        console.error("❌ فشل رفع أحد الأصناف:", e);
      }
    }
  }, []);

  const addSale = useCallback(
    async (
      date: string,
      department: SubDept,
      lines: SaleLine[],
    ): Promise<
      { ok: true; sale: SaleEntry } | { ok: false; error: string }
    > => {
      const cur = load();
      const deductions = new Map<string, number>();
      let totalSales = 0;
      let totalCost = 0;
      for (const sl of lines) {
        const qty = clamp0(sl.qty);
        if (qty <= 0) continue;
        const meal = cur.meals.find((m) => m.id === sl.mealId);
        if (!meal) continue;
        if (meal.department !== department) {
          return {
            ok: false,
            error: `الصنف "${meal.name}" لا ينتمي لقسم ${department}`,
          };
        }
        totalSales += meal.sellingPrice * qty;
        const baseDeds = expandMealToBase(meal, cur.meals, cur.items);
        for (const [itemId, info] of baseDeds) {
          const total = info.qty * qty;
          deductions.set(itemId, (deductions.get(itemId) || 0) + total);
          totalCost += info.cost * qty;
        }
      }
      for (const [itemId, qty] of deductions) {
        const k = deptKey(department, itemId);
        const have = cur.deptStock[k] || 0;
        if (qty > have + 1e-9) {
          const it = cur.items.find((i) => i.id === itemId);
          return {
            ok: false,
            error: `عفواً، لا يمكن إتمام البيع بسبب نقص الموارد! (نقص في: ${it?.name || "صنف"})`,
          };
        }
      }

      // تجهيز بيانات البيع
      const sale: SaleEntry = {
        id: crypto.randomUUID(),
        date,
        department,
        lines,
        totalSales: round2(clamp0(totalSales)),
        totalCost: round2(clamp0(totalCost)),
        createdAt: Date.now(),
      };

      // 1. ترحيل البيانات للسيرفر أولاً للتأكد من حفظها في الداتا بيس
      try {
        const response = await fetch(`http://${API_URL}:5000/api/sales`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sale),
        });

        if (!response.ok) {
          return {
            ok: false,
            error: "فشل تسجيل المبيعات في خادم قاعدة البيانات",
          };
        }
      } catch (err) {
        console.error("❌ فشل الاتصال بالسيرفر لحفظ البيع:", err);
        return {
          ok: false,
          error: "خطأ في الاتصال بالسيرفر، لم يتم حفظ العملية.",
        };
      }

      // 2. تحديث المخزون المحلي والـ Local Storage بعد نجاح حفظ السيرفر
      for (const [itemId, qty] of deductions) {
        const k = deptKey(department, itemId);
        cur.deptStock[k] = round2(clamp0((cur.deptStock[k] || 0) - qty));
      }

      return { ok: true, sale };
    },
    [],
  );

  const addAudit = useCallback(
    async (
      audit: AuditEntry,
      opts: { overwrite?: boolean; deduct?: boolean } = {},
    ): Promise<
      | { ok: true; audit: AuditEntry }
      | { ok: false; error: "duplicate" | string }
    > => {
      const cur = load();
      const prior = cur.audits.find(
        (a) => a.date === audit.date && a.department === audit.department,
      );
      if (prior && !opts.overwrite) return { ok: false, error: "duplicate" };

      // 1. ترحيل الجرد للسيرفر ليتم حفظه أو تحديثه بناءً على الـ ON CONFLICT في الباك إند
      try {
        const response = await fetch(`http://${API_URL}:5000/api/audits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(audit),
        });

        if (!response.ok) {
          return { ok: false, error: "فشل حفظ الجرد في قاعدة البيانات" };
        }
      } catch (err) {
        console.error("❌ فشل الاتصال بالسيرفر لحفظ الجرد:", err);
        return { ok: false, error: "خطأ في الاتصال بالسيرفر" };
      }

      // 2. التعامل المحلي مع الـ Overwrite وإرجاع الكميات المخصومة سابقاً
      if (prior) {
        for (const r of prior.rows) {
          if (r.expected > r.actual) {
            const k = deptKey(prior.department, r.itemId);
            cur.deptStock[k] = round2(
              clamp0((cur.deptStock[k] || 0) + (r.expected - r.actual)),
            );
          }
        }
        cur.audits = cur.audits.filter((a) => a.id !== prior.id);
      }

      // 3. تطبيق الخصم الجديد محلياً لو خيار الـ deduct مفعّل
      if (opts.deduct) {
        for (const r of audit.rows) {
          if (r.expected > r.actual) {
            const k = deptKey(audit.department, r.itemId);
            cur.deptStock[k] = round2(
              clamp0((cur.deptStock[k] || 0) - (r.expected - r.actual)),
            );
          }
        }
      }

      cur.audits.unshift(audit);
      save(cur);
      setDb(cur); // تحديث الـ React State لو موجودة

      return { ok: true, audit };
    },
    [],
  );

  const setDeptStockQty = useCallback(
    async (dept: SubDept, itemId: string, newQty: number) => {
      // 1. تحميل البيانات الحالية من الـ Local Storage
      const cur = load();
      const safeQty = Math.max(0, newQty); // التأكد إن الكمية مش بالسالب

      // تجهيز المفتاح القياسي (مطبخ_123)
      const key = deptKey(dept, itemId);

      // 3. تحديث الكمية في الكاش المحلي والـ Local Storage فوراً
      cur.deptStock[key] = safeQty;
      save(cur);
      setDb(cur);

      // جلب اسم الصنف لإرساله للسيرفر
      const itemName =
        cur.items.find((i) => i.id === itemId)?.name || "غير محدد";

      // 4. رمي التحديث للداتابيز في الخلفية
      try {
        await fetch(`http://${API_URL}:5000/api/dept-stock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId,
            itemName,
            department: dept,
            qty: safeQty,
          }),
        });
        console.log(
          `✅ تم حفظ رصيد ${dept} للصنف ${itemName} في الداتابيز بنجاح!`,
        );
      } catch (err) {
        console.error("❌ فشل تحديث رصيد القسم في السيرفر:", err);
      }
    },
    [],
  );

  const deductSubStock = useCallback(
    async (dept: SubDept, deltas: { itemId: string; baseQty: number }[]) => {
      const cur = load();
      const payloadItems = [];

      for (const d of deltas) {
        const k = deptKey(dept, d.itemId);
        // تحديث الكاش المحلي
        const newQty = round2(
          clamp0((cur.deptStock[k] || 0) - clamp0(d.baseQty)),
        );
        cur.deptStock[k] = newQty;

        // 🌟 نبعت الكمية المسحوبة (الخصم) للسيرفر وهو يتصرف
        payloadItems.push({
          itemId: d.itemId,
          baseQty: d.baseQty,
        });
      }

      save(cur);
      setDb(cur); // تحديث الشاشة

      // 🌟 رفع الخصم على الداتابيز دفعة واحدة بمسار الخصم الدقيق
      if (payloadItems.length > 0) {
        try {
          await fetch(`http://${API_URL}:5000/api/inventory/deduct-substock`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              department: dept,
              items: payloadItems,
            }),
          });
        } catch (err) {
          console.error(`❌ فشل خصم رصيد ${dept} من الداتابيز:`, err);
        }
      }
    },
    [],
  );

  return {
    db,
    syncFromServer,
    fetchSales,
    addItem,
    updateItem,
    deleteItem,
    addEntryVoucher,
    addIssueVoucher,
    saveMeal,
    deleteMeal,
    bulkAddMeals,
    addSale,
    addAudit,
    setDeptStockQty,
    deductSubStock,
  };
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(PASS_HASH_KEY);
  if (!stored || !pin) return false;

  // استخدام المكتبة الجديدة بدلاً من crypto القديمة
  const h = sha256(pin);
  return h === stored;
}

export function expandMealToBase(
  meal: Meal,
  allMeals: Meal[],
  allItems: Item[],
  visited: Set<string> = new Set(),
): Map<string, { qty: number; cost: number }> {
  const out = new Map<string, { qty: number; cost: number }>();
  if (visited.has(meal.id)) return out;
  visited.add(meal.id);
  for (const ing of meal.ingredients) {
    if (ing.refKind === "meal") {
      const sub = allMeals.find((m) => m.id === ing.itemId);
      if (!sub) continue;
      const subMap = expandMealToBase(
        sub,
        allMeals,
        allItems,
        new Set(visited),
      );
      for (const [iid, info] of subMap) {
        const scaled = { qty: info.qty * ing.qty, cost: info.cost * ing.qty };
        const cur = out.get(iid) || { qty: 0, cost: 0 };
        cur.qty += scaled.qty;
        cur.cost += scaled.cost;
        out.set(iid, cur);
      }
    } else {
      const item = allItems.find((i) => i.id === ing.itemId);
      if (!item) continue;
      const base = convertToBase(
        ing.qty,
        ing.unit,
        item.unit,
        item.conversionFactor,
        item.subUnitType,
      );
      const cost = base * item.avgPrice;
      const cur = out.get(item.id) || { qty: 0, cost: 0 };
      cur.qty += base;
      cur.cost += cost;
      out.set(item.id, cur);
    }
  }
  return out;
}

export function convertToBase(
  qty: number,
  recipeUnit: RecipeUnit,
  invUnit: Unit,
  conv: number,
  subUnitType?: SubUnitType,
): number {
  if (recipeUnit === invUnit) return qty;
  if (recipeUnit === "جرام" && invUnit === "كيلوجرام") return qty / 1000;
  if (recipeUnit === "كيلوجرام" && invUnit === "كيلوجرام") return qty;
  if (recipeUnit === "مل" && invUnit === "لتر") return qty / 1000;
  if (
    subUnitType &&
    (recipeUnit as string) === (subUnitType as string) &&
    conv > 0
  )
    return qty / conv;
  if (subUnitType === "كيلوجرام" && recipeUnit === "جرام" && conv > 0)
    return qty / (conv * 1000);
  if (subUnitType === "لتر" && recipeUnit === "مل" && conv > 0)
    return qty / (conv * 1000);
  if (
    recipeUnit === "قطعة" &&
    (invUnit === "كيس" || invUnit === "طبق" || invUnit === "علبة")
  )
    return qty / (conv || 1);
  if (
    recipeUnit === "جرام" &&
    (invUnit === "كيس" ||
      invUnit === "طبق" ||
      invUnit === "قطعة" ||
      invUnit === "علبة") &&
    conv > 0
  )
    return qty / conv;
  if (
    recipeUnit === "مل" &&
    (invUnit === "كيس" ||
      invUnit === "طبق" ||
      invUnit === "قطعة" ||
      invUnit === "علبة") &&
    conv > 0
  )
    return qty / conv;
  return qty;
}

async function hashPassword(password: string): Promise<string> {
  // كود سطر واحد سريع وبسيط وبيشتغل أوفلاين وفي أي بيئة
  return sha256(password);
}
export function hasPassword(): boolean {
  if (typeof window === "undefined") return false;
  const legacy = localStorage.getItem("rest-inv-password");
  if (legacy && !localStorage.getItem(PASS_HASH_KEY)) {
    hashPassword(legacy).then((h) => {
      localStorage.setItem(PASS_HASH_KEY, h);
      localStorage.removeItem("rest-inv-password");
    });
    return true;
  }
  return !!localStorage.getItem(PASS_HASH_KEY);
}
export function isAuthenticated() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(PASS_KEY) === "1";
}
export async function setPassword(password: string): Promise<void> {
  if (!password || password.length < 4)
    throw new Error("كلمة المرور يجب أن تكون 4 أحرف على الأقل");
  const h = await hashPassword(password);
  localStorage.setItem(PASS_HASH_KEY, h);
  localStorage.removeItem("rest-inv-password");
  sessionStorage.setItem(PASS_KEY, "1");
  window.dispatchEvent(new Event("auth-change"));
}
export async function login(password: string): Promise<boolean> {
  const stored = localStorage.getItem(PASS_HASH_KEY);
  if (!stored) return false;
  const h = await hashPassword(password);
  if (h === stored) {
    sessionStorage.setItem(PASS_KEY, "1");
    window.dispatchEvent(new Event("auth-change"));
    return true;
  }
  return false;
}
export function logout() {
  sessionStorage.removeItem(PASS_KEY);
  window.dispatchEvent(new Event("auth-change"));
}

export function getWeekNumber(date: Date, anchor: Date): number {
  const ms = date.getTime() - anchor.getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1;
}
export function getAnchorDate(vouchers: Voucher[]): Date {
  if (vouchers.length === 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = (day + 1) % 7;
    d.setDate(d.getDate() - diff);
    return d;
  }
  const earliest = vouchers.reduce(
    (min, v) => (v.createdAt < min ? v.createdAt : min),
    vouchers[0].createdAt,
  );
  const d = new Date(earliest);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 1) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
