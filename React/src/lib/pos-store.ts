/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { round2, clamp0 } from "./format";
import { sha256 as jsSha256 } from "js-sha256";
import { toast } from "sonner";

import { getApiUrl } from "@/api";
const API_URL = getApiUrl();
async function getCurrentDevice() {
  const response = await fetch(`http://${API_URL}:5000/api/device-check`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("تعذر معرفة نوع الجهاز من السيرفر");
  }

  return await response.json();
}
const ACTIVE_SHIFT_CACHE_KEY = "pos-active-shift-cache";
const DEVICE_CACHE_KEY = "pos-device-cache";

type DeviceInfo = {
  ip?: string;
  deviceType: "main" | "micros" | "sec_cashier";
  terminalId: string;
};

function loadCachedShift(): ShiftState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(ACTIVE_SHIFT_CACHE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);

    if (!data?.shift || !data?.terminalId) return null;

    return {
      ...data.shift,
      terminalId: data.terminalId,
    };
  } catch {
    return null;
  }
}

function saveCachedShift(shift: ShiftState) {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    ACTIVE_SHIFT_CACHE_KEY,
    JSON.stringify({
      terminalId: shift.terminalId || "Main",
      shift,
      cachedAt: Date.now(),
    }),
  );
}

function clearCachedShift() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACTIVE_SHIFT_CACHE_KEY);
}

function loadCachedDevice(): DeviceInfo | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(DEVICE_CACHE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);

    if (!data?.deviceType || !data?.terminalId) return null;

    return data;
  } catch {
    return null;
  }
}

function saveCachedDevice(device: DeviceInfo) {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    DEVICE_CACHE_KEY,
    JSON.stringify({
      ...device,
      cachedAt: Date.now(),
    }),
  );
}

// 🛡️ قفل المزامنة العالمي - بره الـ Hook تماماً عشان يحمي الطاولة المفتوحة
interface SyncLocks {
  editingTable: string | null;
  isPollingOrders: boolean;
}

const syncLocks: SyncLocks = {
  editingTable: null,
  isPollingOrders: false,
};

export function setGlobalEditingTable(code: string | null) {
  syncLocks.editingTable = code;
}

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

export type EmployeeRole = "كاشير" | "كابتن صالة";
export interface Employee {
  id: string;
  name: string;
  role: EmployeeRole;
  pinHash: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  orderCount: number;
  createdAt: number;
}

export type ZoneId =
  | "close"
  | "open"
  | "takeaway"
  | "others"
  | "small"
  | "large"
  | "kids";
export interface Zone {
  id: ZoneId;
  label: string;
  prefix: string;
  count: number;
}

export const ZONES: Zone[] = [
  { id: "close", label: "صالة مغلقة", prefix: "C", count: 70 },
  { id: "open", label: "صالة مفتوحة", prefix: "O", count: 70 },
  { id: "takeaway", label: "Take-away", prefix: "T", count: 0 },
  { id: "others", label: "Others", prefix: "X", count: 50 },
  { id: "small", label: "القاعة الصغيرة", prefix: "ص", count: 75 },
  { id: "large", label: "القاعة الكبيرة", prefix: "ك", count: 100 },
  { id: "kids", label: "منطقة الأطفال", prefix: "K", count: 20 },
];

export const PAGE_SIZE = 20;
export type TableState = "empty" | "active" | "printed";

export interface OrderItem {
  price: number;
  department: string;
  mealName: any;
  id: string;
  mealId: string;
  name: string;
  qty: number;
  unitPrice: number;
  extras: { name?: any; label: string; price: number }[];
  modifiersSummary?: string;
  notes?: string;
  transferred?: boolean;
  printedQty?: number;
}

export interface ActiveOrder {
  tableCode: string;
  zone: ZoneId;
  items: OrderItem[];
  state: TableState;

  // آخر تحديث للأوردر من السيرفر
  updatedAt?: number;

  customerId?: string;
  discountPct: number;
  taxPct: number;
  customerName?: string;
  customerAddress?: string;
  openedAt: number;
  inventoryDeducted?: boolean;
  type?: "takeaway" | "delivery";
  customerPhone?: string | null;
  deliveryPrice?: number;
  openedByPassword?: string;
  captainName?: string;
  cashierName?: string;
  orderCategory?: "normal" | "talabat" | "fast";
  commissionValue?: number;
}

export interface Invoice {
  captain_name: string | null | undefined;
  id: string;
  type: "dinein" | "takeaway" | "delivery" | "staff" | "hospitality";
  deliveryPrice?: number;
  invoiceNumber: number;
  tableCode?: string;
  zone?: ZoneId;
  customerName?: string;
  customerAddress?: string;
  cashierId?: string;
  cashierName?: string;
  captainName?: string | null;
  items: OrderItem[];
  subtotal: number;
  discountPct: number;
  discountValue: number;
  taxPct: number;
  taxValue: number;
  total: number;
  createdAt: number;
  // 🌟 ضيف السطرين دول هنا عشان الـ TypeScript يتعرف عليهم:
  terminalId?: string;
  createdBy?: string;
  // لو الباك إند بيبعتهم أحياناً بـ snake_case ممكن تضيفهم برضه كأمان:
  terminal_id?: string;
  created_by?: string;
  orderCategory: "normal" | "talabat" | "fast"; // الخانة الجديدة للباك إند
  commissionValue: number;
}

export interface ShiftState {
  cashier_name?: string;
  id?: string; // 👈 ضفنا الـ id كاختياري
  cashierId: string;
  cashierName: string;
  openedAt: number;
  closedAt?: number | null; // 👈 خليناه يقبل null أو undefined عشان الأخطاء تموت
  terminalId?: string;
}

interface PosDB {
  employees: Employee[];
  customers: Customer[];
  orders: Record<string, ActiveOrder>;
  invoices: Invoice[];
  shift: ShiftState | null;
  shifts: ShiftState[];
}

const KEY = "rest-pos-db-v1";
const ORDER_SYNC_META_KEY = "pos-order-sync-meta";

function loadOrderSyncMeta(): Record<string, number> {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(ORDER_SYNC_META_KEY);

    if (!raw) return {};

    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveOrderSyncMeta(meta: Record<string, number>) {
  if (typeof window === "undefined") return;

  localStorage.setItem(ORDER_SYNC_META_KEY, JSON.stringify(meta));
}

export const hashPin = async (s: string): Promise<string> => jsSha256(s);

function defaultDB(): PosDB {
  return {
    employees: [],
    customers: [],
    orders: {},
    invoices: [],
    shift: null,
    shifts: [],
  };
}

function load(): PosDB {
  if (typeof window === "undefined") return defaultDB();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultDB();
    return JSON.parse(raw);
  } catch {
    return defaultDB();
  }
}

function save(db: PosDB) {
  localStorage.setItem(KEY, JSON.stringify(db));
  window.dispatchEvent(new Event("pos-update"));
}

export function usePosDB() {
  // 1. نبدأ بالديفولت عشان نتجنب أخطاء الريفريش
  const cachedShift = loadCachedShift();

  const [db, setDb] = useState<PosDB>(() => {
    const initial = defaultDB();

    if (cachedShift) {
      initial.shift = cachedShift;
    }

    return initial;
  });

  const [isLoadingEmployees] = useState(false);

  const [shiftHydrated, setShiftHydrated] = useState(!!cachedShift);

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(() =>
    loadCachedDevice(),
  );

  useEffect(() => {
    const initialDb = load();

    const cached = loadCachedShift();

    if (cached) {
      initialDb.shift = cached;
    }

    setDb(initialDb);

    if (cached) {
      setShiftHydrated(true);
    }

    const r = () => {
      const next = load();

      const cachedShift = loadCachedShift();

      if (!next.shift && cachedShift) {
        next.shift = cachedShift;
      }

      setDb(next);
    };

    window.addEventListener("pos-update", r);
    window.addEventListener("storage", r);

    return () => {
      window.removeEventListener("pos-update", r);
      window.removeEventListener("storage", r);
    };
  }, []);

  // 1. مزامنة منفصلة تطلب شيفت الجهاز الحالي بس وتترجم البيانات للواجهة
  useEffect(() => {
    if (typeof window === "undefined" || syncLocks.isPollingOrders) {
      return;
    }

    if (!deviceInfo?.terminalId) {
      return;
    }

    syncLocks.isPollingOrders = true;

    const currentTerminalId = deviceInfo.terminalId;

    const fetchActiveOrders = async () => {
      try {
        const [ordersRes, shiftRes] = await Promise.all([
          fetch(`http://${API_URL}:5000/api/pos/orders/meta`).catch(() => null),

          fetch(
            `http://${API_URL}:5000/api/pos/shift?terminalId=${encodeURIComponent(
              currentTerminalId,
            )}`,
          ).catch(() => null),
        ]);

        let cur: PosDB | null = null;
        let hasChanges = false;

        // نقرأ الـDB الكبيرة فقط لو احتجناها
        const getCurrentDB = () => {
          if (!cur) {
            cur = load();
          }

          return cur;
        };

        // =====================================================
        // SHIFT
        // =====================================================
        if (shiftRes?.ok) {
          const rawShift = await shiftRes.json();

          let serverShift: ShiftState | null = null;

          if (rawShift) {
            serverShift = {
              id: rawShift.id,

              cashierId: rawShift.cashier_id || rawShift.cashierId || "",

              cashierName:
                rawShift.cashier_name || rawShift.cashierName || "كاشير",

              openedAt: Number(rawShift.opened_at || rawShift.openedAt || 0),

              closedAt:
                rawShift.closed_at != null
                  ? Number(rawShift.closed_at)
                  : undefined,

              terminalId:
                rawShift.terminal_id ||
                rawShift.terminalId ||
                currentTerminalId,
            };
          }

          const cachedShift = loadCachedShift();

          let shiftChanged = false;

          if (serverShift) {
            shiftChanged =
              !cachedShift ||
              cachedShift.id !== serverShift.id ||
              cachedShift.cashierId !== serverShift.cashierId ||
              cachedShift.cashierName !== serverShift.cashierName ||
              cachedShift.openedAt !== serverShift.openedAt ||
              cachedShift.closedAt !== serverShift.closedAt ||
              cachedShift.terminalId !== serverShift.terminalId;

            if (shiftChanged) {
              const db = getCurrentDB();

              db.shift = serverShift;

              saveCachedShift(serverShift);

              hasChanges = true;
            }
          } else if (cachedShift) {
            const db = getCurrentDB();

            db.shift = null;

            clearCachedShift();

            hasChanges = true;
          }

          setShiftHydrated(true);
        }

        // =====================================================
        // ORDERS SYNC
        // =====================================================
        if (ordersRes?.ok) {
          const serverOrdersMeta = await ordersRes.json();

          const syncMeta = loadOrderSyncMeta();

          const changedTableCodes: string[] = [];

          // -----------------------------------------------------
          // اكتشاف الطاولات التي تغيرت
          // -----------------------------------------------------
          for (const code in serverOrdersMeta) {
            if (code === syncLocks.editingTable) {
              continue;
            }

            const serverUpdatedAt = Number(serverOrdersMeta[code] || 0);

            const currentUpdatedAt = Number(syncMeta[code] || 0);

            if (serverUpdatedAt > currentUpdatedAt) {
              changedTableCodes.push(code);
            }
          }

          // -----------------------------------------------------
          // جلب الأوردرات المتغيرة فقط
          // -----------------------------------------------------
          if (changedTableCodes.length > 0) {
            try {
              const changedRes = await fetch(
                `http://${API_URL}:5000/api/pos/orders/changed`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    tableCodes: changedTableCodes,
                  }),
                },
              );

              if (changedRes.ok) {
                const changedOrders = await changedRes.json();

                for (const code of changedTableCodes) {
                  const serverEntry = changedOrders[code];

                  if (!serverEntry) {
                    continue;
                  }

                  const serverOrder = serverEntry.orderData;

                  const serverUpdatedAt = Number(serverEntry.updatedAt || 0);

                  if (!serverOrder) {
                    continue;
                  }

                  const db = getCurrentDB();

                  db.orders[code] = {
                    ...serverOrder,
                    updatedAt: serverUpdatedAt,
                  };

                  syncMeta[code] = serverUpdatedAt;

                  hasChanges = true;
                }
              }
            } catch (err) {
              console.error("🚨 خطأ أثناء جلب الطلبات المتغيرة:", err);
            }
          }

          // -----------------------------------------------------
          // اكتشاف الطاولات التي اختفت من السيرفر
          // -----------------------------------------------------
          for (const code of Object.keys(syncMeta)) {
            if (code === syncLocks.editingTable) {
              continue;
            }

            if (!serverOrdersMeta[code]) {
              const db = getCurrentDB();

              delete db.orders[code];
              delete syncMeta[code];

              hasChanges = true;
            }
          }

          // -----------------------------------------------------
          // حفظ الـtimestamps فقط لو حصل تغيير
          // -----------------------------------------------------
          if (changedTableCodes.length > 0 || hasChanges) {
            saveOrderSyncMeta(syncMeta);
          }
        }
        // =====================================================
        // SAVE فقط عند وجود تغيير
        // =====================================================
        if (hasChanges && cur) {
          save(cur);
          setDb(cur);
        }
      } catch (err) {
        console.error("❌ فشل مزامنة الجهاز/الشيفت/الأوردرات:", err);

        if (loadCachedShift()) {
          setShiftHydrated(true);
        }
      }
    };

    fetchActiveOrders();

    const interval = setInterval(fetchActiveOrders, 1500);

    return () => {
      clearInterval(interval);
      syncLocks.isPollingOrders = false;
    };
  }, [deviceInfo?.terminalId]);

  // 🌟 دالة فتح الشيفت المتوافقة تماماً والمترجمة للواجهة
  const openShift = useCallback(
    async (cashierId: string, cashierName: string) => {
      try {
        const device = await getCurrentDevice();

        const currentTerminalId = device.terminalId || "Main";

        const newShiftData = {
          cashierId,
          cashierName,
          openedAt: Date.now(),
          terminalId: currentTerminalId,
        };

        const res = await fetch(`http://${API_URL}:5000/api/pos/shift/open`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newShiftData),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));

          throw new Error(errData.error || "فشل فتح الوردية بالسيرفر");
        }

        const serverResponse = await res.json();

        if (!serverResponse.success || !serverResponse.shift) {
          throw new Error("استجابة غير صالحة من السيرفر");
        }

        const savedShift = serverResponse.shift;

        const formattedShift = {
          id: savedShift.id,
          cashierId: savedShift.cashier_id || savedShift.cashierId || cashierId,

          cashierName:
            savedShift.cashier_name || savedShift.cashierName || cashierName,

          openedAt: Number(
            savedShift.opened_at || savedShift.openedAt || Date.now(),
          ),

          closedAt: savedShift.closed_at
            ? Number(savedShift.closed_at)
            : undefined,

          terminalId:
            savedShift.terminal_id ||
            savedShift.terminalId ||
            currentTerminalId,
        };

        const cur = load();

        cur.shift = formattedShift;
        saveCachedShift(formattedShift);

        save(cur);
        setDb(cur);

        localStorage.setItem("backupCashierName", formattedShift.cashierName);

        toast.success(`🚀 تم بدء الوردية بنجاح للجهاز ${currentTerminalId}`);

        return true;
      } catch (err: any) {
        toast.error(err.message || "خطأ في الاتصال بالسيرفر");

        return false;
      }
    },
    [],
  );

  // 3. دالة إغلاق الشيفت للجهاز الحالي حصراً
  const closeShift = useCallback(async (data: { actualCash?: number } = {}) => {
    const device = await getCurrentDevice();
    const currentTerminalId = device.terminalId || "Main";
    const activeShift = load().shift;

    const fallbackName =
      localStorage.getItem("backupCashierName") || "كاشير احتياطي";

    if (!activeShift) {
      toast.error("لا توجد وردية مفتوحة لإغلاقها على هذا الجهاز!");
      return false;
    }

    const closedShiftData = {
      terminalId: currentTerminalId,
      actualCash: Number(data.actualCash) || 0,
    };

    try {
      const res = await fetch(`http://${API_URL}:5000/api/shifts`, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(closedShiftData),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "فشل إغلاق الوردية على السيرفر");
      }

      const savedShiftFromServer = await res.json();

      const cur = load();

      cur.shifts = [savedShiftFromServer, ...cur.shifts];

      cur.shift = null;
      clearCachedShift();

      localStorage.removeItem("backupCashierName");

      save(cur);
      setDb(cur);

      toast.success(`🎉 تم إغلاق الوردية للجهاز ${currentTerminalId}`);

      return savedShiftFromServer;
    } catch (err: any) {
      toast.error(err.message || "فشل الاتصال بالسيرفر");
      return false;
    }
  }, []);

  const addEmployee = useCallback(
    async (name: string, role: EmployeeRole, pin: string) => {
      const cur = load();
      const pinHash = await hashPin(pin);

      // 🔍 التحقق من تكرار الـ PIN قبل الإضافة لمنع الأخطاء
      const isDuplicate = cur.employees.some((emp) => emp.pinHash === pinHash);
      if (isDuplicate) {
        toast.error(
          "عذراً، هذا الرقم السري مستخدم بالفعل لموظف آخر! اختر رقماً مختلفاً.",
        );
        return; // بيوقف التنفيذ ومبيضيفش حاجة
      }

      cur.employees.push({
        id: crypto.randomUUID(),
        name: name.trim(),
        role,
        pinHash,
      });
      save(cur);
      setDb(cur);
      toast.success("تم إضافة الموظف بنجاح");
    },
    [],
  );

  const updateEmployee = useCallback(async (id: string, patch: any) => {
    const cur = load();
    const e = cur.employees.find((x) => x.id === id);
    if (!e) return;

    // 🔍 لو المستخدم بيعدل الـ PIN، نتحقق إنه مش متكرر مع موظف تاني غير نفسه
    if (patch.newPin) {
      const newHash = await hashPin(patch.newPin);
      const isDuplicate = cur.employees.some(
        (emp) => emp.pinHash === newHash && emp.id !== id,
      );

      if (isDuplicate) {
        toast.error("عذراً، الرقم السري الجديد مستخدم بالفعل لموظف آخر!");
        return; // بيوقف التعديل
      }
      e.pinHash = newHash;
    }

    if (patch.name !== undefined) e.name = patch.name.trim();
    if (patch.role !== undefined) e.role = patch.role;

    save(cur);
    setDb(cur);
    toast.success("تم التحديث بنجاح");
  }, []);

  const deleteEmployee = useCallback((id: string) => {
    const cur = load();
    cur.employees = cur.employees.filter((e) => e.id !== id);
    save(cur);
    setDb(cur);
    toast.success("تم حذف الموظف");
  }, []);

  const verifyEmployeePin = useCallback(async (id: string, pin: string) => {
    const cur = load();
    const e = cur.employees.find((x) => x.id === id);
    if (!e) return false;
    return (await hashPin(pin)) === e.pinHash;
  }, []);

  const findByPin = useCallback(async (pin: string, role?: EmployeeRole) => {
    const cur = load();
    const h = await hashPin(pin);
    return (
      cur.employees.find(
        (e) => e.pinHash === h && (!role || e.role === role),
      ) || null
    );
  }, []);

  const addCustomer = useCallback(
    async (name: string, phone?: string, address?: string) => {
      const newCustomer = {
        id: crypto.randomUUID(),
        name: name.trim(),
        phone: phone || "",
        address: address || "",
        orderCount: 0,
        createdAt: Date.now(),
      };

      try {
        const res = await fetch(`http://${API_URL}:5000/api/customers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newCustomer),
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          throw new Error(errorText || `فشل حفظ العميل (${res.status})`);
        }

        // ✅ مهم: لا نضيف العميل لقائمة customers المحلية
        // TakeawayView هيعمل refetch من السيرفر.
        toast.success("تم إضافة العميل بنجاح 🎉");

        return newCustomer;
      } catch (err: any) {
        console.error("❌ فشل حفظ العميل في قاعدة البيانات:", err);

        toast.error(err?.message || "فشل حفظ العميل");

        throw err;
      }
    },
    [],
  );
  const updateCustomer = useCallback(
    async (id: string, name: string, phone?: string, address?: string) => {
      const updatedCustomer = {
        id,
        name: name.trim(),
        phone: phone || "",
        address: address || "",
      };

      try {
        const res = await fetch(`http://${API_URL}:5000/api/customers/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedCustomer),
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          throw new Error(errorText || `فشل تحديث العميل (${res.status})`);
        }

        toast.success("تم تعديل بيانات العميل");

        return true;
      } catch (err: any) {
        console.error("❌ فشل تحديث العميل في قاعدة البيانات:", err);

        toast.error(err?.message || "فشل تحديث العميل");

        return false;
      }
    },
    [],
  );
  const upsertOrder = useCallback(
    async (order: ActiveOrder, options: { silent?: boolean } = {}) => {
      const cur = load();

      // حفظ محلي فوري
      cur.orders[order.tableCode] = order;

      if (options.silent) {
        localStorage.setItem(KEY, JSON.stringify(cur));
        window.dispatchEvent(new Event("pos-update"));
      } else {
        save(cur);
      }

      setDb(cur);

      try {
        const response = await fetch(
          `http://${API_URL}:5000/api/pos/orders/upsert`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tableCode: order.tableCode,
              orderData: order,
            }),
          },
        );

        if (!response.ok) {
          toast.error("⚠️ لم يتم حفظ الطاولة على السيرفر، تأكد من الشبكة!");
          return;
        }

        const result = await response.json();

        const updatedAt = Number(result.updatedAt || Date.now());

        // نخزن timestamp فقط في مساحة صغيرة منفصلة
        const syncMeta = loadOrderSyncMeta();

        syncMeta[order.tableCode] = updatedAt;

        saveOrderSyncMeta(syncMeta);

        // مهم:
        // لا نعمل save() للـDB كاملة مرة ثانية.
      } catch (err) {
        console.error("🚨 خطأ أثناء تحديث الطاولة على السيرفر:", err);

        toast.error("⚠️ خطأ في الاتصال بالسيرفر الرئيسي!");
      }
    },
    [],
  );

  const clearOrder = useCallback(async (tableCode: string) => {
    // 1️⃣ مسح الطاولة محلياً فوراً عشان ترجع خضراء وفاضية عندك
    const cur = load();
    delete cur.orders[tableCode];
    save(cur);
    setDb(cur);

    // 2️⃣ إبلاغ السيرفر بمسح الطاولة عشان تتشال من عند الميكروس برضه
    try {
      await fetch(`http://${API_URL}:5000/api/pos/orders/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableCode }),
      });
    } catch (err) {
      console.error("🚨 خطأ أثناء مسح الطاولة من السيرفر:", err);
    }
  }, []);

  const addInvoice = useCallback(
    async (inv: Omit<Invoice, "invoiceNumber" | "createdAt">) => {
      const cur = load();
      const createdAt = Date.now();

      const totals = computeTotals(
        inv.items,
        inv.discountPct || 0,
        inv.type === "dinein" ? 14 : 0,
        inv.orderCategory || "normal",
      );

      const deliveryPrice = Number(inv.deliveryPrice || 0);

      const fullInvoice: any = {
        ...inv,

        // ✅ السيرفر هو مصدر رقم الفاتورة
        id: crypto.randomUUID(),

        customerPhone:
          (inv as any).customerPhone ||
          (inv as any).customer_phone ||
          (inv as any).phone ||
          "",

        createdAt,

        subtotal: totals.subtotal,
        discountValue: totals.discountValue,

        deliveryPrice,

        taxPct: totals.taxPct,
        taxValue: totals.taxValue,

        orderCategory: inv.orderCategory || "normal",

        commissionValue: totals.commissionValue,

        total: totals.total + deliveryPrice,

        terminalId: inv.terminalId || "Main",

        createdBy: inv.cashierName || "Main Cashier",
      };
      try {
        // ======================================================
        // 1️⃣ حفظ الفاتورة في السيرفر
        // ======================================================
        const response = await fetch(`http://${API_URL}:5000/api/invoices`, {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fullInvoice),
        });

        // ❌ السيرفر رفض الفاتورة
        if (!response.ok) {
          const errorText = await response.text().catch(() => "");

          throw new Error(
            `فشل حفظ الفاتورة على السيرفر (${response.status})${
              errorText ? ` - ${errorText}` : ""
            }`,
          );
        }

        // ======================================================
        // 2️⃣ استقبال النسخة الرسمية
        // ======================================================
        const serverInvoice = await response.json();

        if (!serverInvoice || !serverInvoice.id) {
          throw new Error("السيرفر رجع بيانات فاتورة غير صالحة");
        }

        console.log("✅ تم حفظ الفاتورة رسميًا:", serverInvoice.invoiceNumber);

        toast.success(
          `🎉 تم اعتماد الفاتورة رقم: ${serverInvoice.invoiceNumber}`,
        );
        // ✅ لا نرجع الفاتورة إلا بعد نجاح كل ما سبق
        return serverInvoice;
      } catch (error) {
        console.error("❌ addInvoice FAILED:", error);

        // ⭐ مهم جدًا:
        // لا تبلع الخطأ
        throw error;
      }
    },
    [],
  );
  // 🌟 دالة تزويد العداد مربوطة بالسيرفر
  const incCustomerOrders = useCallback(async (id?: string) => {
    if (!id) return;

    try {
      const res = await fetch(
        `http://${API_URL}:5000/api/customers/${id}/increment`,
        {
          method: "PATCH",
        },
      );

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(errorText || `فشل تحديث عداد العميل (${res.status})`);
      }

      const data = await res.json();

      return data.customer || null;
    } catch (err) {
      console.error("❌ فشل تزويد عداد العميل في الداتابيز:", err);

      throw err;
    }
  }, []);

  // 🌟 تعديل الـ transferItems عشان يرمي التعديل في السيرفر
  // 🌟 تحويل الأصناف بين الطاولات
  const transferItems = useCallback(
    async (
      from: string,
      to: string,
      itemsToMove: { id: string; qty: number }[],
      targetZone: string,
      targetMeta?: {
        customerName?: string;
        orderCategory?: ActiveOrder["orderCategory"];
      },
    ) => {
      const cur = load();

      const src = cur.orders[from];

      if (!src) {
        return {
          ok: false,
          error: "الطاولة غير موجودة",
        };
      }

      // =========================================================
      // 1. تحديد الـ Zone الحقيقي
      // =========================================================

      let finalZone: ZoneId = targetZone as ZoneId;

      const foundZone = ZONES.find(
        (z) =>
          z.id === targetZone ||
          z.prefix === targetZone ||
          (to && to.startsWith(z.prefix)),
      );

      if (foundZone) {
        finalZone = foundZone.id;
      }

      // =========================================================
      // 2. إنشاء / جلب الأوردر الهدف
      // =========================================================

      const existingDst = cur.orders[to];

      const dst: ActiveOrder = existingDst
        ? {
            ...existingDst,
            items: [...existingDst.items],
          }
        : {
            ...src,
            tableCode: to,
            zone: finalZone,
            items: [],
            state: src.state || "active",
            discountPct: src.discountPct !== undefined ? src.discountPct : 0,
            taxPct: src.taxPct !== undefined ? src.taxPct : 14,
            openedAt: src.openedAt || Date.now(),

            // 🌟 لو الهدف Other جديد، نحط الاسم هنا
            ...(targetMeta?.customerName
              ? {
                  customerName: targetMeta.customerName,
                }
              : {}),

            ...(targetMeta?.orderCategory
              ? {
                  orderCategory: targetMeta.orderCategory,
                }
              : {}),
          };

      // =========================================================
      // 3. لو الهدف Other موجود بالفعل
      //    نقدر نحدّث الاسم / التصنيف لو اتبعت بيانات جديدة
      // =========================================================

      if (targetMeta?.customerName) {
        dst.customerName = targetMeta.customerName;
      }

      if (targetMeta?.orderCategory) {
        dst.orderCategory = targetMeta.orderCategory;
      }

      // الـ takeaway ممنوع هنا
      if (finalZone !== "takeaway") {
        delete (dst as any).type;
      }

      // =========================================================
      // 4. حفظ نسخة من الحالة الأصلية قبل النقل
      //    عشان نقدر نرجعها لو السيرفر فشل
      // =========================================================

      const originalOrders = cur.orders;

      // =========================================================
      // 5. نقل الأصناف
      // =========================================================

      for (const move of itemsToMove) {
        const idx = src.items.findIndex((i) => i.id === move.id);

        if (idx === -1) continue;

        const sourceItem = src.items[idx];

        if (move.qty >= sourceItem.qty) {
          src.items.splice(idx, 1);

          dst.items.push({
            ...sourceItem,
            printedQty: sourceItem.qty,
          });
        } else {
          sourceItem.qty -= move.qty;

          dst.items.push({
            ...sourceItem,
            id: crypto.randomUUID(),
            qty: move.qty,
            printedQty: move.qty,
          });

          sourceItem.printedQty = Math.min(
            sourceItem.printedQty || 0,
            sourceItem.qty,
          );
        }
      }

      // =========================================================
      // 6. تجهيز حالة الـ orders الجديدة
      // =========================================================

      cur.orders[to] = dst;

      const remainingFromOrder =
        src.items.length > 0
          ? {
              ...src,
              items: [...src.items],
            }
          : null;

      if (!remainingFromOrder) {
        delete cur.orders[from];
      } else {
        cur.orders[from] = remainingFromOrder;
      }

      // =========================================================
      // 7. السيرفر أولاً
      // =========================================================

      try {
        const response = await fetch(
          `http://${API_URL}:5000/api/pos/orders/transfer`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fromCode: from,
              toCode: to,

              // 🌟 مهم جداً:
              // نبعت الأوردر بعد النقل فعلاً
              fromOrder: remainingFromOrder,
              toOrder: dst,
            }),
          },
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
          throw new Error(data.error || "فشل التحويل في السيرفر");
        }
      } catch (err) {
        console.error("🚨 خطأ أثناء مزامنة التحويل مع السيرفر:", err);

        // =======================================================
        // رجّع الحالة المحلية القديمة لو السيرفر فشل
        // =======================================================

        cur.orders = originalOrders;

        save(cur);
        setDb(cur);

        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : "فشل الاتصال بالسيرفر أثناء التحويل",
        };
      }

      // =========================================================
      // 8. السيرفر نجح → نحفظ محلياً
      // =========================================================

      save(cur);
      setDb(cur);

      return {
        ok: true,
      };
    },
    [],
  );

  // 🌟 دالة تحويل الكابتن (تحدث محلياً فوراً وترمي التعديل على السيرفر)
  const transferCaptain = useCallback(
    async (tableCode: string, newCaptainName: string) => {
      const cur = load();
      const order = cur.orders[tableCode];
      if (!order) return { ok: false, error: "الطاولة غير موجودة أو غير نشطة" };

      // 1. التحديث المحلي اللحظي
      order.captainName = newCaptainName;
      save(cur);
      setDb(cur);

      // 2. المزامنة مع السيرفر (PostgreSQL)
      try {
        const res = await fetch(
          `http://${API_URL}:5000/api/pos/orders/transfer-captain`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableCode,
              newCaptainName,
            }),
          },
        );

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "فشل الحفظ على السيرفر");
        }
      } catch (err: any) {
        console.error("🚨 خطأ أثناء مزامنة تحويل الكابتن مع السيرفر:", err);
        toast.error(
          "⚠️ تنبيه: حدث خطأ في الاتصال بالسيرفر أثناء تحويل الكابتن!",
        );
        return { ok: false, error: err.message || "فشل الاتصال بالسيرفر" };
      }

      return { ok: true };
    },
    [],
  );
  return {
    db,
    isLoadingEmployees,
    shiftHydrated,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    verifyEmployeePin,
    findByPin,
    addCustomer,
    updateCustomer,
    upsertOrder,
    clearOrder,
    transferItems,
    transferCaptain,
    addInvoice,
    openShift,
    closeShift,
    incCustomerOrders,
  };
}
export function computeTotals(
  items: OrderItem[],
  discountPct: number,
  taxPct: number, // الـ 14%
  orderCategory: "normal" | "talabat" | "fast" = "normal",
) {
  // 1. حساب المجموع الأساسي من أسعار الأصناف والإضافات
  const baseSubtotal = round2(
    items.reduce(
      (s, l) =>
        s +
        (clamp0(l.unitPrice) +
          l.extras.reduce((x, e) => x + clamp0(e.price), 0)) *
          clamp0(l.qty),
      0,
    ),
  );

  // 2. حساب قيمة عمولة المنصة بناءً على المجموع الأساسي
  let commissionValue = 0;
  if (orderCategory === "talabat") {
    commissionValue = round2((baseSubtotal * 15) / 100);
  } else if (orderCategory === "fast") {
    commissionValue = round2((baseSubtotal * 0) / 100);
  }

  // 3. 🌟 دمج العمولة مباشرة داخل الـ subtotal الكلي عشان يسمع في السيستم كله تلقائياً!
  const subtotal = round2(baseSubtotal + commissionValue);

  // 4. حساب الخصم والضريبة بناءً على الـ subtotal الجديد المدمج فيه النسبة
  const discountValue = round2((subtotal * clamp0(discountPct)) / 100);
  const afterDiscount = round2(subtotal - discountValue);
  const taxValue = round2((afterDiscount * clamp0(taxPct)) / 100);

  // 5. الإجمالي النهائي الكلي
  const total = round2(afterDiscount + taxValue);

  return {
    subtotal, // 🌟 مدمج جواه الـ 5% لطلبات أو فاست وجاهز لكل الصفحات
    baseSubtotal, // المجموع الأصلي الصافي للأصناف فقط بدون النسبة
    discountValue,
    taxValue,
    tax_value: taxValue,
    taxPct,
    tax_pct: taxPct,
    commissionValue, // قيمة النسبة بالجنيه لعرضها لو أحببت
    total,
  };
}
