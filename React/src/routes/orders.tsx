/* eslint-disable prettier/prettier */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useDB,
  deptKey,
  SHISHA_CATEGORY,
  expandMealToBase,
  type Meal,
  type SubDept,
  type Item,
  type ModifierGroup,
  type KitchenPrinter,
  type PrinterJob,
} from "@/lib/store";
import {
  usePosDB,
  ZONES,
  PAGE_SIZE,
  setGlobalEditingTable,
  computeTotals,
  type ZoneId,
  type ActiveOrder,
  type OrderItem,
  type Invoice,
} from "@/lib/pos-store.ts";
import { fmt2, round2, clamp0, cleanNumInput } from "@/lib/format";
import ActionGate from "@/components/ui/ActionGate"; // أو مسار الملف الصحيح عندك
import { PinPrompt } from "@/components/PinPrompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Printer,
  ArrowLeftRight,
  CheckCircle2,
  UserPlus,
  Trash2,
  AlertTriangle,
  Lock,
  ShieldCheck,
  Monitor,
  RefreshCw,
} from "lucide-react";
import { buildInvoiceHtml } from "@/utils/printing/invoiceTemplate";
import { getApiUrl } from "@/api";
import PancakeLoader from "@/components/loader";
const API_URL = getApiUrl();
export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "الطلبات - نقطة البيع" }] }),
  component: OrdersGate,
});

// ✅ الكود الجديد المحمي من السيرفر والـ SSR
function OrdersGate() {
  const { db: pos, shiftHydrated } = usePosDB();

  const DEVICE_CACHE_KEY = "pos-device-cache";

  type DeviceType = "loading" | "main" | "micros" | "sec_cashier";

  function getCachedDeviceType(): DeviceType {
    if (typeof window === "undefined") {
      return "loading";
    }

    try {
      const raw = localStorage.getItem(DEVICE_CACHE_KEY);

      if (!raw) {
        return "loading";
      }

      const data = JSON.parse(raw);

      const type = data?.deviceType;

      if (type === "main" || type === "micros" || type === "sec_cashier") {
        return type;
      }

      return "loading";
    } catch {
      return "loading";
    }
  }

  // ✅ نوع الجهاز: نبدأ من الكاش المحلي عشان الواجهة ما تستناش السيرفر
  const [deviceType, setDeviceType] = useState<DeviceType>(getCachedDeviceType);

  // ✅ اسم الكاشير الفرعي
  const [secCashierName, setSecCashierName] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("secCashierName");
    }

    return null;
  });

  // ✅ تحديث نوع الجهاز من السيرفر في الخلفية
  useEffect(() => {
    let cancelled = false;

    async function detectDevice() {
      try {
        const res = await fetch(`http://${API_URL}:5000/api/device-check`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error("فشل تحديد الجهاز");
        }

        const data = await res.json();

        if (cancelled) return;

        const detectedType: DeviceType =
          data?.deviceType === "sec_cashier"
            ? "sec_cashier"
            : data?.deviceType === "micros"
              ? "micros"
              : "main";

        setDeviceType(detectedType);

        // ✅ نحفظ آخر Device Info المعروف
        localStorage.setItem(
          DEVICE_CACHE_KEY,
          JSON.stringify({
            ...data,
            deviceType: detectedType,
            cachedAt: Date.now(),
          }),
        );
      } catch (err) {
        console.error("❌ فشل معرفة نوع الجهاز:", err);

        // ✅ لو السيرفر فشل، نفضل على الكاش المحلي
        // ومش نبوظ الواجهة
      }
    }

    detectDevice();

    return () => {
      cancelled = true;
    };
  }, []);

  // =========================================================
  // 1) لسه مش عارفين نوع الجهاز
  // =========================================================
  if (deviceType === "loading") {
    return (
      <div className="min-h-[70vh] grid place-items-center">
        جاري التحقق من نوع الجهاز...
      </div>
    );
  }

  // =========================================================
  // 2) الكاشير الفرعي معروف لكن لسه مفيش Login محلي
  // =========================================================
  if (deviceType === "sec_cashier" && !secCashierName) {
    return (
      <SecCashierLogin
        onLogin={(name, id) => {
          localStorage.setItem("secCashierName", name);

          localStorage.setItem("secCashierId", id);

          setSecCashierName(name);
        }}
      />
    );
  }

  // =========================================================
  // ✅ Micros لا يحتاج Shift نهائيًا
  // يدخل مباشرة على PosScreen
  // =========================================================
  if (deviceType === "micros") {
    return <PosScreen />;
  }

  // =========================================================
  // ✅ باقي الأجهزة تستنى Hydration للشيفت
  // =========================================================
  if (!shiftHydrated) {
    return <PancakeLoader />;
  }

  // =========================================================
  // ✅ لا يوجد Shift
  // =========================================================
  if (!pos.shift) {
    if (deviceType === "sec_cashier") {
      return <ShiftLogin forceSecondary />;
    }

    return <ShiftLogin />;
  }

  // =========================================================
  // ✅ كل شيء تمام
  // =========================================================
  return <PosScreen />;
}
// 🌟 شاشة تسجيل الدخول الأنيقة المخصصة للكاشير الفرعي فقط (محدثة)
function SecCashierLogin({
  onLogin,
}: {
  onLogin: (name: string, id: string) => void;
}) {
  const { db: pos, findByPin } = usePosDB();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const [serverEmployees, setServerEmployees] = useState<any[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);

  // 🌟 جلب الموظفين من السيرفر لو الكاش المحلي فاضي
  useEffect(() => {
    async function fetchEmployeesFallback() {
      if (pos.employees && pos.employees.length > 0) return;
      try {
        setIsLoadingEmployees(true);
        const response = await fetch(`http://${API_URL}:5000/api/employees`);
        if (response.ok) {
          const data = await response.json();
          setServerEmployees(data);
        }
      } catch (error) {
        console.error("❌ خطأ أثناء جلب الكاشيرية:", error);
      } finally {
        setIsLoadingEmployees(false);
      }
    }
    fetchEmployeesFallback();
  }, [pos.employees.length]);

  const activeEmployeesList = useMemo(() => {
    const map = new Map();
    if (pos.employees) pos.employees.forEach((e) => map.set(e.name, e));
    if (serverEmployees) serverEmployees.forEach((e) => map.set(e.name, e));
    return Array.from(map.values());
  }, [pos.employees, serverEmployees]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    // 1️⃣ الفحص الأول: بدون تشفير (عشان يقبل الباسووردات القديمة أو اللي متسجلة نص عادي)
    let emp = activeEmployeesList.find(
      (x) =>
        (x.pin === pin || x.pinHash === pin || x.pin_hash === pin) &&
        x.role === "كاشير",
    );

    // 2️⃣ الفحص التاني: بالتشفير لو الأول فشل (زي الشاشة الرئيسية بالظبط)
    if (!emp) {
      emp = await findByPin(pin, "كاشير");
    }

    if (!emp) {
      setErr("الرمز السري غير صحيح أو ليس لديك صلاحية كاشير");
      return;
    }

    toast.success(`مرحباً بك يا ${emp.name} في جهاز الكاشير الفرعي`);
    onLogin(emp.name, emp.id);
  }

  if (isLoadingEmployees) {
    return (
      <div className="flex items-center justify-center h-[70vh]" dir="rtl">
        <p className="text-xl font-medium text-emerald-600 animate-pulse font-bold">
          جاري التحقق من الكاشيرية المسجلين في السيرفر...
        </p>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-[70vh] grid place-items-center animate-in fade-in zoom-in-95 duration-300"
    >
      <form
        autoComplete="off"
        onSubmit={submit}
        className="bg-white border border-gray-200 rounded-3xl p-8 w-full max-w-sm space-y-6 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-teal-500" />
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4 border border-emerald-100">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-800">
            الكاشير الفرعي
          </h1>
          <p className="text-sm font-medium text-gray-500">
            أدخل الرمز السري لبدء العمل
          </p>
        </div>
        <Input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="text-center text-3xl tracking-widest h-14 font-bold text-emerald-700 bg-gray-50 border-gray-200 rounded-xl focus-visible:ring-emerald-500"
          placeholder="••••"
        />
        {err && (
          <p className="text-sm font-bold text-red-500 text-center bg-red-50 py-2 rounded-lg">
            {err}
          </p>
        )}
        <Button
          type="submit"
          className="w-full h-14 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-500/20"
          disabled={!pin}
        >
          تسجيل الدخول
        </Button>
      </form>
    </div>
  );
}

/* ---------------- Shift login (Cashier PIN) ---------------- */
function ShiftLogin({ forceSecondary = false }: { forceSecondary?: boolean }) {
  const { db: pos, findByPin, openShift } = usePosDB();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const [serverEmployees, setServerEmployees] = useState<any[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);

  // 🌟 نقلنا الـ useState دي فوق عشان تتنفذ بالترتيب الصحيح
  const [isMicros, setIsMicros] = useState(() => {
    return localStorage.getItem("isMicrosDevice") === "true";
  });

  // 2. الـ State الجديدة بتاعة الكاشير الفرعي 🌟
  const [isSecCashier, setIsSecCashier] = useState(() => {
    return localStorage.getItem("isSecCashierDevice") === "true";
  });

  // 🌟 الـ useEffect اللي بتشيك أول ما الجهاز يفتح
  useEffect(() => {
    const checkMicros = localStorage.getItem("isMicrosDevice") === "true";
    const checkSecCashier =
      localStorage.getItem("isSecCashierDevice") === "true";

    setIsMicros(checkMicros);
    setIsSecCashier(checkSecCashier); // تحديث حالة الكاشير الفرعي
  }, []);

  useEffect(() => {
    async function fetchEmployeesFallback() {
      if (pos.employees && pos.employees.length > 0) return;
      try {
        setIsLoadingEmployees(true);
        const response = await fetch(`http://${API_URL}:5000/api/employees`);
        if (response.ok) {
          const data = await response.json();
          setServerEmployees(data);
        }
      } catch (error) {
        console.error("❌ خطأ أثناء جلب الكاشيرية:", error);
      } finally {
        setIsLoadingEmployees(false);
      }
    }
    fetchEmployeesFallback();
  }, [pos.employees.length]);

  const activeEmployeesList = useMemo(() => {
    const map = new Map();
    if (pos.employees) pos.employees.forEach((e) => map.set(e.name, e));
    if (serverEmployees) serverEmployees.forEach((e) => map.set(e.name, e));
    return Array.from(map.values());
  }, [pos.employees, serverEmployees]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    const emp = activeEmployeesList.find(
      (x) =>
        (x.pin === pin || x.pinHash === pin || x.pin_hash === pin) &&
        x.role === "كاشير",
    );

    if (!emp) {
      const fallbackEmp = await findByPin(pin, "كاشير");
      if (!fallbackEmp) {
        setErr("كلمة سر الكاشير غير صحيحة");
        return;
      }
      openShift(fallbackEmp.id, fallbackEmp.name);
      toast.success(`أهلاً ${fallbackEmp.name} — بدأت الشيفت`);
      return;
    }

    openShift(emp.id, emp.name);
    toast.success(`أهلاً ${emp.name} — بدأت الشيفت`);
  }

  // 🌟 الـ Return المشروط ده بقى تحت الـ Hooks فكده السيرفر والـ React مش هيعترضوا
  if (isLoadingEmployees) {
    return (
      <div className="flex items-center justify-center h-[70vh]" dir="rtl">
        <p className="text-xl font-medium text-amber-600 animate-pulse font-bold">
          جاري التحقق من الكاشيرية المسجلين في السيرفر...
        </p>
      </div>
    );
  }

  const cashiersCount = activeEmployeesList.filter(
    (e) => e.role === "كاشير",
  ).length;

  return (
    <>
      {!isMicros && (!isSecCashier || forceSecondary) && (
        <div dir="rtl" className="min-h-[70vh] grid place-items-center p-4">
          <form
            autoComplete="off"
            onSubmit={submit}
            className="bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl p-8 w-full max-w-sm space-y-5 shadow-2xl transition-all"
          >
            {/* الهيدر */}
            <div className="text-center space-y-1.5">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center justify-center gap-2">
                🔑 بدء شيفت الكاشير
              </h1>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                أدخل كلمة سر الكاشير لفتح شاشة الطلبات.
              </p>
            </div>

            {/* حقل الإدخال */}
            <div className="space-y-2">
              <Input
                type="password"
                inputMode="numeric"
                autoFocus
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="text-center text-2xl font-black tracking-[0.3em] h-14 border-2 border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 shadow-sm outline-none transition-all"
              />

              {/* رسالة الخطأ */}
              {err && (
                <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 text-center">
                  {err}
                </div>
              )}
            </div>

            {/* زر الدخول */}
            <Button
              type="submit"
              className="w-full h-11 rounded-xl bg-slate-900 hover:bg-emerald-600 text-white font-black border-2 border-slate-900 hover:border-emerald-600 shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-900"
              disabled={!pin || cashiersCount === 0}
            >
              دخول
            </Button>

            {/* تنبيه عدم وجود كاشير */}
            {cashiersCount === 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400 text-center font-bold">
                ⚠️ لا يوجد كاشير مسجل — أضف من صفحة بصمات الموظفين.
              </div>
            )}
          </form>
        </div>
      )}
    </>
  );
}

/* ---------------- Main POS screen ---------------- */
function PosScreen() {
  const { db } = useDB();
  const { db: pos, closeShift, clearOrder, upsertOrder } = usePosDB();
  const [zone, setZone] = useState<ZoneId>("close");
  const [page, setPage] = useState(0);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [search, setSearch] = useState(""); // دي اللي هتفلتر الطاولات فعلياً
  const [searchInput, setSearchInput] = useState(""); // دي اللي هتمسك الكلام اللي بيتكتب في المربع
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [printOrder, setPrintOrder] = useState<string | null>(null);
  const [checkoutConfirm, setCheckoutConfirm] = useState<string | null>(null);
  const [isMicros, setIsMicros] = useState(() => {
    return localStorage.getItem("isMicrosDevice") === "true";
  });
  const isSecCashier = localStorage.getItem("isSecCashierDevice") === "true";
  const [transferCaptainOpen, setTransferCaptainOpen] = useState(false);

  const [othersPromptOpen, setOthersPromptOpen] = useState<string | null>(null);
  const [othersName, setOthersName] = useState("");
  const [othersType, setOthersType] = useState<"staff" | "hospitality">(
    "staff",
  );

  const [printCustomerPrompt, setPrintCustomerPrompt] = useState<string | null>(
    null,
  );

  const [openOrderDraft, setOpenOrderDraft] = useState<ActiveOrder | null>(
    null,
  );

  // تعطيل قفل الطاولات لفتره تصليح الاعطال
  const ENABLE_TABLE_LOCK = false;
  const [printCustomerData, setPrintCustomerData] = useState({
    name: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [terminalId, setTerminalId] = useState("Main");

  useEffect(() => {
    let cancelled = false;

    async function loadTerminal() {
      try {
        const res = await fetch(`http://${API_URL}:5000/api/device-check`, {
          cache: "no-store",
        });

        if (!res.ok) return;

        const data = await res.json();

        if (!cancelled) {
          setTerminalId(data.terminalId || "Main");
        }
      } catch (err) {
        console.error("❌ فشل معرفة رقم الجهاز:", err);
      }
    }

    loadTerminal();

    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!ENABLE_TABLE_LOCK || !openOrder) return;
    if (!openOrder || !terminalId) return;

    const sendHeartbeat = () => {
      fetch(`http://${API_URL}:5000/api/pos/tables/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tableCode: openOrder,
          terminalId,
        }),
        keepalive: true,
      }).catch(() => {});
    };

    sendHeartbeat();

    const interval = setInterval(sendHeartbeat, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [openOrder, terminalId]);
  async function lockTable(code: string) {
    if (!ENABLE_TABLE_LOCK) return true;
    try {
      const res = await fetch(`http://${API_URL}:5000/api/pos/tables/lock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tableCode: code,
          terminalId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        if (res.status === 409) {
          toast.error(`🔒 الطاولة ${code} مفتوحة بالفعل على جهاز آخر`);
        } else {
          toast.error(data.error || "فشل حجز الطاولة");
        }

        return false;
      }

      return true;
    } catch (err) {
      console.error("🚨 خطأ في حجز الطاولة:", err);

      toast.error("⚠️ تعذر الاتصال بالسيرفر لحجز الطاولة");

      return false;
    }
  }
  async function unlockTable(code: string) {
    if (!ENABLE_TABLE_LOCK) return;
    try {
      await fetch(`http://${API_URL}:5000/api/pos/tables/unlock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tableCode: code,
          terminalId,
        }),
      });
    } catch (err) {
      console.error("🚨 فشل فك حجز الطاولة:", err);
    }
  }
  // 🌟 دالة فتح الطاولة وإرسال قفل الحماية للستور بالترتيب الصحيح
  function handleOpenOrder(code: string | null, draftOrder?: ActiveOrder) {
    setOpenOrder(code);
    setOpenOrderDraft(draftOrder || null);
    setGlobalEditingTable(code);
  }
  async function handleOrderClose() {
    if (openOrder) {
      const currentOrder = pos.orders[openOrder] || openOrderDraft;

      const isTakeaway =
        currentOrder?.zone === "takeaway" ||
        currentOrder?.type === "takeaway" ||
        currentOrder?.type === "delivery";

      if (!isTakeaway) {
        await unlockTable(openOrder);
      }
    }

    setOpenOrder(null);
    setOpenOrderDraft(null);
    setGlobalEditingTable(null);
  }

  // 🌟 State الخاصة بنافذة الكابتن
  const [captainPromptOpen, setCaptainPromptOpen] = useState(false);
  const [captainPromptMode, setCaptainPromptMode] = useState<
    "new" | "verify_existing" | "verify_any"
  >("new");
  const [targetTable, setTargetTable] = useState<string | null>(null);
  const [captainPin, setCaptainPin] = useState("");

  useEffect(() => {
    const checkDevice = localStorage.getItem("isMicrosDevice") === "true";
    setIsMicros(checkDevice);
  }, []);

  const currentZone = ZONES.find((z) => z.id === zone)!;
  useEffect(() => {
    setPage(0);
    setSelectedTable(null);
  }, [zone]);

  const tableCodes = useMemo(() => {
    const arr: string[] = [];
    for (let i = 1; i <= currentZone.count; i++)
      arr.push(`${currentZone.prefix}${i}`);
    return arr;
  }, [currentZone]);
  const pageCount = Math.max(1, Math.ceil(tableCodes.length / PAGE_SIZE));
  const visible = tableCodes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // 🌟 تجميع كل طاولات جميع الصالات للبحث الشامل
  const allSystemTables = useMemo(() => {
    const list: string[] = [];
    ZONES.forEach((z) => {
      if (z.id !== "takeaway") {
        for (let i = 1; i <= z.count; i++) {
          list.push(`${z.prefix}${i}`);
        }
      }
    });
    return list;
  }, []);

  // 🌟 بحث شامل يعرض نتائج البحث من كل الصالات لو حقل البحث فيه كود أو اسم
  const filteredTables = useMemo(() => {
    if (!search.trim()) return visible;
    const query = search.trim().toUpperCase();
    return allSystemTables.filter((code) => {
      const order = pos.orders[code] as any;
      const matchCode = code.toUpperCase().includes(query);
      const matchCustomer =
        order?.customerName && order.customerName.toUpperCase().includes(query);
      return matchCode || matchCustomer;
    });
  }, [visible, search, allSystemTables, pos.orders]);

  function tableState(code: string) {
    const o = pos.orders[code];
    if (!o) return "empty" as const;
    return o.state;
  }

  function jumpToCode(code: string) {
    const c = code.trim();
    if (!c) return;
    const z = ZONES.find((z) => c.startsWith(z.prefix) && z.id !== "takeaway");
    if (!z) return;
    const n = parseInt(c.slice(z.prefix.length));
    if (!n || n < 1 || n > z.count)
      return toast.error("رقم الطاولة خارج النطاق");
    setZone(z.id);
    setPage(Math.floor((n - 1) / PAGE_SIZE));
    setSelectedTable(c);
  }

  // 🌟 المنطق السحري لفتح الطاولة
  async function actionOpen(overrideCode?: string | any) {
    const targetCode =
      typeof overrideCode === "string" ? overrideCode : selectedTable;

    if (!targetCode) {
      return toast.error("اختر طاولة أولاً");
    }

    const storedOrder = pos.orders[targetCode] as any;

    // الطاولة تعتبر مفتوحة فعليًا فقط لو عليها أصناف
    const hasItems =
      Array.isArray(storedOrder?.items) && storedOrder.items.length > 0;

    const order = hasItems ? storedOrder : null;

    const isTakeaway =
      zone === "takeaway" ||
      order?.zone === "takeaway" ||
      order?.type === "takeaway" ||
      order?.type === "delivery";

    // Lock متوقف عندك حاليًا، فمش بنعمل أي حاجة هنا

    if (zone === "others") {
      if (!order) {
        setOthersPromptOpen(targetCode);
        return;
      }

      handleOpenOrder(targetCode);
      return;
    }

    if (!isMicros) {
      if (!order) {
        upsertOrder({
          tableCode: targetCode,
          zone,
          items: [],
          state: "active",
          discountPct: 0,
          taxPct: 14,
          openedAt: Date.now(),
          openedBy: "cashier",
          cashierName: pos.shift?.cashierName || "كاشير",
        } as any);
      }

      handleOpenOrder(targetCode);
    } else {
      if (!order) {
        setTargetTable(targetCode);
        setCaptainPromptMode("new");
        setCaptainPin("");
        setCaptainPromptOpen(true);
      } else {
        setTargetTable(targetCode);
        setCaptainPromptMode(
          order.openedBy === "captain" ? "verify_existing" : "verify_any",
        );
        setCaptainPin("");
        setCaptainPromptOpen(true);
      }
    }
  }

  // 🌟 التحقق من باسوورد الكابتن ومنع التداخل بين الكباتن
  async function handleCaptainSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captainPin) return;

    const order = pos.orders[targetTable!] as any;

    // تحديد هل الطاولة مفتوحة بكابتن وعايزين نتحقق منه هو بالذات؟
    const expectedCaptain =
      captainPromptMode === "verify_existing" ? order?.captainName : undefined;

    try {
      const res = await fetch(`http://${API_URL}:5000/api/pos/verify-captain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: captainPin,
          expectedCaptainName: expectedCaptain, // 🌟 بنبعت للسيرفر الاسم اللي فاتح الطاولة حالياً
        }),
      });
      const data = await res.json();

      if (data.success) {
        if (captainPromptMode === "new") {
          // طاولة جديدة
          upsertOrder({
            tableCode: targetTable!,
            zone,
            items: [],
            state: "active",
            discountPct: 0,
            taxPct: 14,
            openedAt: Date.now(),
            openedBy: "captain",
            captainName: data.captainName,
          } as any);
        } else if (captainPromptMode === "verify_any") {
          // كانت مفتوحة بكاشير ودخل أول كابتن مسكها
          upsertOrder({
            ...order,
            captainName: data.captainName,
          } as any);
        }

        // لو نجح في الـ verify_existing هيدخل علطول من غير ما يغير أي داتا
        handleOpenOrder(targetTable);
        setCaptainPromptOpen(false);
      } else {
        // ❌ السيرفر هيطلع رسالة الخطأ الصارمة (اسم الكابتن الأصلي) والسيستم هيرفض يدخله
        toast.error(data.error || "رمز غير صحيح أو غير مصرح لك");
      }
    } catch (err) {
      toast.error("خطأ في الاتصال بالسيرفر");
    }
  }

  function actionPrint(codeOverride?: string) {
    const code = codeOverride ?? selectedTable;
    const order = code ? pos.orders[code] : null;

    if (!code || !order) {
      return toast.error("لا يوجد طلب");
    }

    if (!order.items || order.items.length === 0) {
      return toast.error("لا يمكن طباعة طلب فارغ من الأصناف");
    }

    if (
      zone === "takeaway" ||
      order.type === "takeaway" ||
      order.type === "delivery"
    ) {
      setPrintCustomerData({
        name: order.customerName || "",
        phone: (order as any).customerPhone || "",
        address: order.customerAddress || "",
        notes: (order as any).customerNotes || "",
      });

      setPrintCustomerPrompt(code);
    } else {
      setPrintOrder(code);
    }
  }

  function actionCheckout(codeOverride?: string) {
    const code = codeOverride ?? selectedTable;
    const order = code ? pos.orders[code] : null;

    if (!code || !order) {
      return toast.error("لا يوجد طلب");
    }

    if (!order.items || order.items.length === 0) {
      clearOrder(code);

      if (selectedTable === code) {
        setSelectedTable(null);
      }

      return toast.success("تم إلغاء الطلب لأنه فارغ");
    }

    setCheckoutConfirm(code);
  }
  // 🌟 1. تحديد بيانات الكاشير الفرعي ودالة تسجيل الخروج الذكية
  const secCashierName = localStorage.getItem("secCashierName");
  function handleLogout() {
    if (isSecCashier) {
      localStorage.removeItem("secCashierName");
      localStorage.removeItem("secCashierId");
      window.location.reload();
    } else {
      closeShift({
        actualCash: 0,
      });
    }
  }

  const currentCashierName = isSecCashier
    ? secCashierName || "كاشير فرعي"
    : pos.shift?.cashierName || "جاري التحميل...";

  if (zone === "takeaway") {
    return (
      <PosFrame
        onLogout={handleLogout}
        cashierName={currentCashierName}
        zoneTabs={<ZoneTabs zone={zone} setZone={setZone} />}
      >
        <TakeawayView
          onOpenOrder={(code, draftOrder) => handleOpenOrder(code, draftOrder)}
          onPrintOrder={(code) => {
            setSelectedTable(code);
            actionPrint(code);
          }}
          onCheckoutOrder={(code) => {
            setSelectedTable(code);
            actionCheckout(code);
          }}
        />

        {/* ===============================
          فتح الأوردر
      =============================== */}
        {openOrder && (pos.orders[openOrder] || openOrderDraft) && (
          <OrderEntryDialog
            tableCode={openOrder}
            order={pos.orders[openOrder] || openOrderDraft!}
            meals={db.meals}
            items={db.items}
            onClose={handleOrderClose}
          />
        )}

        {/* ===============================
          الطباعة
      =============================== */}
        {printOrder && pos.orders[printOrder] && (
          <PrintDialog
            tableCode={printOrder}
            order={pos.orders[printOrder]}
            onClose={() => setPrintOrder(null)}
            onPrinted={() => {
              const o = pos.orders[printOrder];

              if (o) {
                upsertOrder({
                  ...o,
                  state: "printed",
                });
              }

              setPrintOrder(null);
            }}
          />
        )}

        {/* ===============================
          إنهاء
      =============================== */}
        {checkoutConfirm && pos.orders[checkoutConfirm] && (
          <CheckoutDialog
            tableCode={checkoutConfirm}
            order={pos.orders[checkoutConfirm]}
            onClose={() => setCheckoutConfirm(null)}
            onDone={() => {
              clearOrder(checkoutConfirm);
              setCheckoutConfirm(null);
              setSelectedTable(null);
            }}
          />
        )}

        {/* ===============================
          بيانات العميل للطباعة
      =============================== */}
        {printCustomerPrompt && (
          <Dialog
            open={!!printCustomerPrompt}
            onOpenChange={(o) => !o && setPrintCustomerPrompt(null)}
          >
            <DialogContent dir="rtl" className="max-w-sm">
              <DialogHeader>
                <DialogTitle>بيانات العميل (اختياري)</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-xs font-bold mb-1 block">
                    اسم العميل
                  </label>

                  <Input
                    placeholder="الاسم..."
                    value={printCustomerData.name}
                    onChange={(e) =>
                      setPrintCustomerData({
                        ...printCustomerData,
                        name: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="text-xs font-bold mb-1 block">
                    رقم الهاتف
                  </label>

                  <Input
                    placeholder="الهاتف..."
                    value={printCustomerData.phone}
                    onChange={(e) =>
                      setPrintCustomerData({
                        ...printCustomerData,
                        phone: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="text-xs font-bold mb-1 block">
                    العنوان
                  </label>

                  <Input
                    placeholder="العنوان..."
                    value={printCustomerData.address}
                    onChange={(e) =>
                      setPrintCustomerData({
                        ...printCustomerData,
                        address: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="text-xs font-bold mb-1 block">
                    ملاحظات إضافية
                  </label>

                  <Input
                    placeholder="أي ملاحظات..."
                    value={printCustomerData.notes}
                    onChange={(e) =>
                      setPrintCustomerData({
                        ...printCustomerData,
                        notes: e.target.value,
                      })
                    }
                  />
                </div>

                <Button
                  className="w-full h-11 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    const order = pos.orders[printCustomerPrompt];

                    if (order) {
                      upsertOrder({
                        ...order,
                        customerName: printCustomerData.name,
                        customerAddress: printCustomerData.address,
                        customerPhone: printCustomerData.phone,
                        customerNotes: printCustomerData.notes,
                      } as any);
                    }

                    setPrintOrder(printCustomerPrompt);

                    setPrintCustomerPrompt(null);
                  }}
                >
                  متابعة وطباعة الشيك
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </PosFrame>
    );
  }

  return (
    <PosFrame
      onLogout={handleLogout} // 👈 التعديل هنا
      cashierName={currentCashierName} // 👈 التعديل هنا
      zoneTabs={<ZoneTabs zone={zone} setZone={setZone} />}
    >
      <Dialog
        open={!!othersPromptOpen}
        onOpenChange={(o) => !o && setOthersPromptOpen(null)}
      >
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>بيانات الطلب الداخلي</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-xs font-bold mb-1 block">
                اسم الشخص (موظف / إدارة)
              </label>
              <Input
                autoFocus
                placeholder="مثال: يوسف، أحمد المحاسب..."
                value={othersName}
                onChange={(e) => setOthersName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block">نوع الطلب</label>
              <select
                value={othersType}
                onChange={(e) => setOthersType(e.target.value as any)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-bold"
              >
                <option value="staff">مسحوبات موظفين (Staff)</option>
                <option value="hospitality">ضيافة (Hospitality)</option>
              </select>
            </div>
            <Button
              className="w-full h-11 font-bold"
              onClick={() => {
                if (!othersName.trim()) return toast.error("يجب إدخال الاسم");

                upsertOrder({
                  tableCode: othersPromptOpen!,
                  zone: "others",
                  items: [],
                  state: "active",
                  discountPct: 0,
                  taxPct: 0,
                  customerName: othersName.trim(),
                  orderCategory: othersType,
                  openedAt: Date.now(),
                  openedBy: "cashier",
                  cashierName: pos.shift?.cashierName || "كاشير",
                } as any);

                handleOpenOrder(othersPromptOpen);
                setOthersPromptOpen(null);
                setOthersName("");
                setOthersType("staff");
              }}
            >
              فتح الطاولة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      ;
      <div className="px-4 pt-3 flex gap-2 items-center shrink-0">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 text-black/70 z-10 pointer-events-none" />
          <Input
            dir="rtl"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              if (e.target.value === "") setSearch("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearch(searchInput);
                jumpToCode(searchInput);
              }
            }}
            className="h-11 ps-11 pe-4 bg-white text-black text-base font-bold border-2 border-slate-900 shadow-lg placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-black"
            placeholder="اكتب رقم الطاولة أو اسم العميل واضغط Enter ↵"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setSearch(searchInput); // تفعيل فلترة الطاولات
            jumpToCode(searchInput); // الانتقال المباشر لكود الطاولة لو موجود
          }}
        >
          اذهب
        </Button>
      </div>
      <div className="flex-1 flex gap-3 px-4 pt-3 min-h-0 overflow-hidden">
        <div className="flex-1 grid grid-cols-5 grid-rows-4 gap-4 lg:gap-5 p-2 min-h-0 overflow-hidden">
          {filteredTables.map((code) => {
            const order = pos.orders[code] as any;
            const st = tableState(code);
            const sel = selectedTable === code;
            const matchSearch =
              search && code.toUpperCase().includes(search.toUpperCase());
            const hasItems =
              order && Array.isArray(order.items) && order.items.length > 0;

            // 🌟 خلفية رمادية صريحة وتباين عالي جداً
            const colors = !hasItems
              ? "bg-slate-200 border-slate-500 text-slate-800 hover:bg-slate-300" // طاولة فارغة (رمادي واضح وحدود بارزة)
              : st === "active"
                ? "bg-amber-500 border-amber-700 text-white font-bold shadow-lg ring-2 ring-amber-300" // طاولة مشغولة (برتقالي صريح وكتابة بيضاء غامقة)
                : st === "printed"
                  ? "bg-blue-600 border-blue-800 text-white font-bold shadow-lg ring-2 ring-blue-300" // طاولة مطبوعة (أزرق زاهي واضح جداً)
                  : "bg-slate-200 border-slate-500 text-slate-800";

            // أنيميشن ومؤثرات الضغط
            const animations =
              "transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg active:scale-95";

            // تمييز الطاولة المحددة بحلقة برتقالية/خضراء سميكة جداً
            const selectionStyle = sel
              ? "ring-[2px] ring-emerald-600 ring-offset-2 scale-[1.02] z-10 border-emerald-600"
              : "";

            return (
              <button
                key={code}
                onClick={() => setSelectedTable(code)} // الضغطة العادية للتحديد
                onDoubleClick={() => {
                  setSelectedTable(code); // نحددها
                  actionOpen(code); // ونفتحها فورا بالكود بتاعها
                }}
                className={`relative rounded-2xl border-[5px] flex flex-col items-center justify-center gap-1.5 overflow-hidden p-2 border-black-500
        ${colors} ${animations} ${selectionStyle}`}
              >
                <div
                  className={`transition-transform duration-300 ${sel ? "scale-110" : ""}`}
                >
                  <TableChairsSvg opacity={hasItems ? "0.9" : "0.7"} />
                </div>

                {/* اسم الطاولة بخط أسود عريض وواضح */}
                <span className="font-black text-xl text-center break-words px-1 leading-tight tracking-wide text-gray-900">
                  {order?.customerName || code}
                </span>

                {/* بطاقات الكابتن والكاشير بألوان صلبة داكنة للوضوح */}
                {hasItems && (
                  <div className="flex flex-col items-center gap-1 mt-1 w-full px-1">
                    {order?.captainName && (
                      <span className="text-[11px] bg-emerald-700 text-white px-2 py-0.5 rounded-md font-bold truncate max-w-full text-center shadow">
                        كابتن: {order.captainName}
                      </span>
                    )}
                  </div>
                )}

                {/* شارة المطبوع */}
                {st === "printed" && (
                  <span className="absolute top-2 left-2 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded shadow uppercase tracking-wider font-extrabold animate-pulse">
                    مطبوع
                  </span>
                )}
              </button>
            );
          })}

          {/* الخانات الفاضية من الشبكة */}
          {Array.from({ length: PAGE_SIZE - visible.length }).map((_, i) => (
            <div
              key={`pad-${i}`}
              className="rounded-2xl border-[3px] border-dashed border-gray-300 bg-gray-100/60"
            />
          ))}
        </div>

        <aside className="w-44 shrink-0 flex flex-col gap-2">
          <Button onClick={actionOpen} className="h-16 text-base gap-2">
            <Plus className="w-5 h-5" /> فتح
          </Button>
          {!isMicros && (
            <>
              <Button
                onClick={() => actionPrint()}
                variant="secondary"
                className="h-16 text-base gap-2"
              >
                <Printer className="w-5 h-5" /> طباعة
              </Button>
              <Button
                onClick={() => {
                  const o = selectedTable ? pos.orders[selectedTable] : null;
                  if (!selectedTable || !o)
                    return toast.error("اختر طاولة نشطة أولاً");
                  // التعديل: منع التحويل لطاولة فاضية
                  if (!o.items || o.items.length === 0)
                    return toast.error("لا يمكن تحويل طاولة فارغة");
                  setTransferOpen(true);
                }}
                variant="secondary"
                className="h-16 text-base gap-2"
              >
                <ArrowLeftRight className="w-5 h-5" /> تحويل الطاولة
              </Button>
              <Button
                onClick={() => {
                  const o = selectedTable ? pos.orders[selectedTable] : null;
                  if (!selectedTable || !o)
                    return toast.error("اختر طاولة نشطة أولاً");
                  // التعديل: منع تحويل الكابتن لطاولة فاضية
                  if (!o.items || o.items.length === 0)
                    return toast.error("لا يمكن تحويل كابتن لطاولة فارغة");
                  setTransferCaptainOpen(true);
                }}
                variant="secondary"
                className="h-16 text-base gap-2"
              >
                <UserPlus className="w-5 h-5" /> تحويل الكابتن
              </Button>
              <Button
                onClick={() => actionCheckout()}
                variant="destructive"
                className="h-16 text-base gap-2"
              >
                <CheckCircle2 className="w-5 h-5" /> إنهاء
              </Button>
            </>
          )}
        </aside>
      </div>
      <div className="px-4 py-3 flex items-center justify-between gap-3 shrink-0 border-t-2 border-slate-300 bg-slate-50 dark:bg-slate-900 dir-rtl">
        {/* أزرار التنقل وعرض رقم الصفحة */}
        <div className="flex items-center gap-3 w-full justify-between sm:justify-start">
          {/* زر الصفحة السابقة (يمين في RTL) */}
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="h-12 px-4 rounded-xl border-2 border-slate-400 font-black text-slate-800 bg-white hover:bg-emerald-600 hover:text-white hover:border-emerald-600 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-800 shadow-sm active:scale-95 transition-all"
          >
            <ChevronRight className="w-6 h-6 ml-1 stroke-[3]" />
            <span>السابق</span>
          </Button>

          {/* مؤشر رقم الصفحة البارز */}
          <div className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white rounded-xl shadow-inner border border-slate-700">
            <span className="text-sm font-medium text-slate-400">صفحة</span>
            <span className="text-lg font-black text-emerald-400">
              {page + 1}
            </span>
            <span className="text-sm font-medium text-slate-400">من</span>
            <span className="text-lg font-black text-white">
              {pageCount || 1}
            </span>
          </div>

          {/* زر الصفحة التالية (يسار في RTL) */}
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="h-12 px-4 rounded-xl border-2 border-slate-400 font-black text-slate-800 bg-white hover:bg-emerald-600 hover:text-white hover:border-emerald-600 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-800 shadow-sm active:scale-95 transition-all"
          >
            <span>التالي</span>
            <ChevronLeft className="w-6 h-6 mr-1 stroke-[3]" />
          </Button>
        </div>
      </div>
      {/* 🌟 نافذة الكابتن (محدثة: الدوائر تظهر عند الكتابة فقط) */}
      <Dialog
        open={captainPromptOpen}
        onOpenChange={async (open) => {
          setCaptainPromptOpen(open);

          if (!open) {
            setCaptainPin("");

            if (targetTable) {
              await fetch(`http://${API_URL}:5000/api/pos/tables/unlock`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  tableCode: targetTable,
                  terminalId,
                }),
              }).catch(() => {});

              setTargetTable(null);
            }
          }
        }}
      >
        <DialogContent dir="rtl" className="max-w-sm rounded-3xl p-6">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center justify-center gap-2 text-xl">
              <Lock className="w-6 h-6 text-amber-600" />
              {captainPromptMode === "verify_existing"
                ? "تأكيد بصمة الكابتن"
                : "تسجيل دخول الكابتن"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* مؤشرات الرقم السري (تظهر فقط عند الكتابة) */}
            <div
              className="flex justify-center gap-3 flex-wrap min-h-[28px] items-center"
              dir="ltr"
            >
              {Array.from({ length: captainPin.length }).map((_, i) => (
                <div
                  key={i}
                  className="w-5 h-5 rounded-full border-2 bg-emerald-500 border-emerald-500 scale-110 shadow-sm shadow-emerald-500/50 transition-all duration-300 animate-in zoom-in"
                />
              ))}
            </div>

            {/* لوحة الأرقام (Numpad) */}
            <div
              className="grid grid-cols-3 gap-3 w-full max-w-[260px] mx-auto"
              dir="ltr"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  key={num}
                  type="button"
                  variant="outline"
                  className="h-16 text-2xl font-bold rounded-2xl bg-gray-50 hover:bg-gray-200 border-gray-200 shadow-sm active:scale-95 transition-all text-gray-800"
                  onClick={() => setCaptainPin((p) => p + num)}
                >
                  {num}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-16 text-xl font-bold rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 border-red-100 active:scale-95 transition-all"
                onClick={() => setCaptainPin("")}
              >
                C
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-16 text-2xl font-bold rounded-2xl bg-gray-50 hover:bg-gray-200 border-gray-200 shadow-sm active:scale-95 transition-all text-gray-800"
                onClick={() => setCaptainPin((p) => p + "0")}
              >
                0
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-16 text-2xl font-bold rounded-2xl bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-100 active:scale-95 transition-all"
                onClick={() => setCaptainPin((p) => p.slice(0, -1))}
              >
                ⌫
              </Button>
            </div>

            <Button
              className="w-full h-14 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md"
              disabled={!captainPin}
              onClick={(e) => handleCaptainSubmit(e)}
            >
              دخول للطاولة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Modals */}
      {openOrder && pos.orders[openOrder] && (
        <OrderEntryDialog
          tableCode={openOrder}
          order={pos.orders[openOrder]}
          meals={db.meals}
          items={db.items}
          onClose={handleOrderClose}
        />
      )}
      {transferOpen && selectedTable && (
        <TransferDialog
          sourceTable={selectedTable}
          onClose={() => setTransferOpen(false)}
        />
      )}
      {transferCaptainOpen && selectedTable && pos.orders[selectedTable] && (
        <TransferCaptainDialog
          tableCode={selectedTable}
          currentCaptain={pos.orders[selectedTable].captainName || "غير محدد"}
          onClose={() => setTransferCaptainOpen(false)}
        />
      )}
      {printOrder && pos.orders[printOrder] && (
        <PrintDialog
          tableCode={printOrder}
          order={pos.orders[printOrder]}
          onClose={() => setPrintOrder(null)}
          onPrinted={() => {
            const o = pos.orders[printOrder!];
            upsertOrder({ ...o, state: "printed" });
            setPrintOrder(null);
          }}
        />
      )}
      {checkoutConfirm && pos.orders[checkoutConfirm] && (
        <CheckoutDialog
          tableCode={checkoutConfirm}
          order={pos.orders[checkoutConfirm]}
          onClose={() => setCheckoutConfirm(null)}
          onDone={async () => {
            const code = checkoutConfirm!;

            clearOrder(code);

            await fetch(`http://${API_URL}:5000/api/pos/tables/unlock`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                tableCode: code,
                terminalId,
              }),
            }).catch(() => {});

            setCheckoutConfirm(null);
            setSelectedTable(null);
          }}
        />
      )}
      {printCustomerPrompt && (
        <Dialog
          open={!!printCustomerPrompt}
          onOpenChange={(o) => !o && setPrintCustomerPrompt(null)}
        >
          <DialogContent dir="rtl" className="max-w-sm">
            <DialogHeader>
              <DialogTitle>بيانات العميل (اختياري)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <label className="text-xs font-bold mb-1 block">
                  اسم العميل
                </label>
                <Input
                  placeholder="الاسم..."
                  value={printCustomerData.name}
                  onChange={(e) =>
                    setPrintCustomerData({
                      ...printCustomerData,
                      name: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block">
                  رقم الهاتف
                </label>
                <Input
                  placeholder="الهاتف..."
                  value={printCustomerData.phone}
                  onChange={(e) =>
                    setPrintCustomerData({
                      ...printCustomerData,
                      phone: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block">العنوان</label>
                <Input
                  placeholder="العنوان..."
                  value={printCustomerData.address}
                  onChange={(e) =>
                    setPrintCustomerData({
                      ...printCustomerData,
                      address: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block">
                  ملاحظات إضافية
                </label>
                <Input
                  placeholder="أي ملاحظات..."
                  value={printCustomerData.notes}
                  onChange={(e) =>
                    setPrintCustomerData({
                      ...printCustomerData,
                      notes: e.target.value,
                    })
                  }
                />
              </div>
              <Button
                className="w-full h-11 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  const order = pos.orders[printCustomerPrompt];
                  if (order) {
                    upsertOrder({
                      ...order,
                      customerName: printCustomerData.name,
                      customerAddress: printCustomerData.address,
                      // يتم إضافة الخصائص الجديدة للطلب
                      customerPhone: printCustomerData.phone,
                      customerNotes: printCustomerData.notes,
                    } as any);
                  }
                  setPrintOrder(printCustomerPrompt); // تشغيل الطباعة
                  setPrintCustomerPrompt(null); // إغلاق الصندوق
                }}
              >
                متابعة وطباعة الشيك
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PosFrame>
  );
}

function ZoneTabs({
  zone,
  setZone,
}: {
  zone: ZoneId;
  setZone: (z: ZoneId) => void;
}) {
  const [isMicros, setIsMicros] = useState(
    () => localStorage.getItem("isMicrosDevice") === "true",
  );

  useEffect(() => {
    setIsMicros(localStorage.getItem("isMicrosDevice") === "true");
  }, []);

  const allowedZones = isMicros
    ? ZONES.filter((z) => z.id !== "takeaway" && z.id !== "others")
    : ZONES;

  return (
    <div className="flex gap-2 overflow-x-auto px-2 py-1.5 dir-rtl scrollbar-none">
      {allowedZones.map((z) => {
        const isActive = zone === z.id;
        return (
          <button
            key={z.id}
            type="button"
            onClick={() => setZone(z.id)}
            className={`shrink-0 px-4 h-11 rounded-xl text-base font-black transition-all duration-200 border-2 flex items-center justify-center shadow-sm active:scale-95 ${
              isActive
                ? "bg-slate-900 text-white border-emerald-500 shadow-md scale-105 ring-2 ring-emerald-400/30"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400 hover:text-slate-900"
            }`}
          >
            {z.label}
          </button>
        );
      })}
    </div>
  );
}

function PosFrame({
  children,
  onLogout,
  cashierName,
  zoneTabs,
}: {
  children: React.ReactNode;
  onLogout: () => void;
  cashierName: string;
  zoneTabs: React.ReactNode;
}) {
  const [isMicros, setIsMicros] = useState(
    () => localStorage.getItem("isMicrosDevice") === "true",
  );
  return (
    <div
      dir="rtl"
      className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden -my-6 -mx-4"
    >
      {children}
      <footer className="border-t border-border bg-card/60 py-2 flex items-center justify-between gap-2 px-3 shrink-0">
        {zoneTabs}
        {!isMicros && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground text-[15px]">
              الكاشير:{" "}
              <strong className="text-foreground">{cashierName}</strong>
            </span>
          </div>
        )}
      </footer>
    </div>
  );
}

function TableChairsSvg({ opacity = "0.6" }: { opacity?: string }) {
  return (
    <svg width="46" height="32" viewBox="0 0 46 32" style={{ opacity }}>
      <rect
        x="11"
        y="10"
        width="24"
        height="12"
        rx="3"
        fill="currentColor"
        opacity="0.35"
      />
      {[8, 18, 28].map((x) => (
        <rect
          key={`t-${x}`}
          x={x}
          y="4"
          width="6"
          height="3"
          rx="1"
          fill="currentColor"
          opacity="0.8"
        />
      ))}
      {[8, 18, 28].map((x) => (
        <rect
          key={`b-${x}`}
          x={x}
          y="25"
          width="6"
          height="3"
          rx="1"
          fill="currentColor"
          opacity="0.8"
        />
      ))}
    </svg>
  );
}
function TakeawayView({
  onOpenOrder,
  onPrintOrder,
  onCheckoutOrder,
}: {
  onOpenOrder: (code: string, draftOrder?: ActiveOrder) => void;
  onPrintOrder: (code: string) => void;
  onCheckoutOrder: (code: string) => void;
}) {
  const { db: pos, addCustomer, updateCustomer } = usePosDB();

  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerError, setCustomerError] = useState("");

  const [page, setPage] = useState(1);
  const [customerLimit, setCustomerLimit] = useState(15);

  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [q, setQ] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [selectedPendingOrder, setSelectedPendingOrder] = useState<
    string | null
  >(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const [activeTab, setActiveTab] = useState<"pending" | "customers">(
    "customers",
  );

  const [, setClock] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const calculateCustomerLimit = useCallback(() => {
    if (typeof window === "undefined") {
      return 15;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    let columns = 2;

    if (width >= 1536) {
      columns = 6;
    } else if (width >= 1280) {
      columns = 5;
    } else if (width >= 1024) {
      columns = 4;
    } else if (width >= 768) {
      columns = 3;
    }

    let rows = 2;

    if (height >= 1000) {
      rows = 4;
    } else if (height >= 800) {
      rows = 3;
    }

    if (width < 640) {
      rows = height >= 850 ? 3 : 2;
    }

    return Math.max(4, Math.min(24, columns * rows));
  }, []);

  useEffect(() => {
    const updateLimit = () => {
      const nextLimit = calculateCustomerLimit();

      setCustomerLimit((current) => {
        if (current === nextLimit) {
          return current;
        }

        setPage(1);
        return nextLimit;
      });
    };

    updateLimit();

    window.addEventListener("resize", updateLimit);

    return () => {
      window.removeEventListener("resize", updateLimit);
    };
  }, [calculateCustomerLimit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(q.trim());
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    let cancelled = false;

    async function fetchCustomers() {
      try {
        setLoadingCustomers(true);
        setCustomerError("");

        const params = new URLSearchParams({
          search: debouncedSearch,
          page: String(page),
          limit: String(customerLimit),
        });

        const res = await fetch(
          `http://${API_URL}:5000/api/customers?${params.toString()}`,
        );

        if (!res.ok) {
          throw new Error(`CUSTOMERS_FETCH_FAILED_${res.status}`);
        }

        const data = await res.json();

        if (!Array.isArray(data.customers)) {
          throw new Error("CUSTOMERS_FETCH_FAILED_INVALID_RESPONSE");
        }

        if (cancelled) {
          return;
        }

        setCustomers(data.customers);
        setTotalCustomers(Number(data.total) || 0);
        setTotalPages(Math.max(1, Number(data.totalPages) || 1));
        setHasLoadedOnce(true);
      } catch (err) {
        console.error("❌ خطأ في تحميل العملاء:", err);

        if (!cancelled) {
          setCustomerError("فشل تحميل العملاء من السيرفر");
        }
      } finally {
        if (!cancelled) {
          setLoadingCustomers(false);
        }
      }
    }

    fetchCustomers();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, page, customerLimit, refreshKey]);

  const TIERS = [
    {
      min: 0,
      max: 0,
      label: "عميل جديد",
      badge:
        "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
      bar: "bg-slate-400",
      topBar: "bg-slate-400",
      glow: "",
      cardBorder: "",
    },
    {
      min: 1,
      max: 3,
      label: "برونزي",
      badge:
        "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300",
      bar: "bg-amber-700",
      topBar: "bg-amber-700",
      glow: "",
      cardBorder: "",
    },
    {
      min: 4,
      max: 7,
      label: "فضـي",
      badge:
        "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100 border border-slate-300",
      bar: "bg-slate-400",
      topBar: "bg-slate-400",
      glow: "",
      cardBorder: "",
    },
    {
      min: 8,
      max: 12,
      label: "ذهبـي",
      badge:
        "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-400",
      bar: "bg-amber-500",
      topBar: "bg-amber-500",
      glow: "",
      cardBorder: "",
    },
    {
      min: 13,
      max: 19,
      label: "ماسي",
      badge:
        "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-400",
      bar: "bg-sky-500",
      topBar: "bg-sky-500",
      glow: "",
      cardBorder: "",
    },
    {
      min: 20,
      max: 29,
      label: "عميل مميز",
      badge:
        "bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300 border border-teal-400",
      bar: "bg-teal-500",
      topBar: "bg-teal-500",
      glow: "",
      cardBorder: "",
    },
    {
      min: 30,
      max: 49,
      label: "زبون دائم",
      badge:
        "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-400",
      bar: "bg-blue-500",
      topBar: "bg-blue-500",
      glow: "",
      cardBorder: "",
    },
    {
      min: 50,
      max: 74,
      label: "عميل VIP 🌟",
      badge:
        "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-400",
      bar: "bg-indigo-500",
      topBar: "bg-indigo-500",
      glow: "ring-1 ring-indigo-400/40",
      cardBorder: "border-indigo-300 dark:border-indigo-800",
    },
    {
      min: 75,
      max: 99,
      label: "كبير العملاء",
      badge:
        "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm font-black",
      bar: "bg-gradient-to-r from-violet-600 to-indigo-600",
      topBar: "bg-gradient-to-r from-violet-600 to-indigo-600",
      glow: "ring-2 ring-violet-500/40",
      cardBorder: "border-violet-400 dark:border-violet-600",
    },
    {
      min: 100,
      max: Infinity,
      label: "LEGEND",
      badge:
        "bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 text-white shadow-md font-black",
      bar: "bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500",
      topBar: "bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500",
      glow: "ring-2 ring-amber-400/60 shadow-md shadow-amber-500/20",
      cardBorder: "border-amber-400 dark:border-amber-500",
    },
  ];

  const getTier = (orderCount: number) => {
    const n = Number(orderCount) || 0;

    return (
      TIERS.find((t) => n >= t.min && n <= t.max) || TIERS[TIERS.length - 1]
    );
  };

  const filtered = customers;

  const maxOrders = useMemo(() => {
    return Math.max(1, ...customers.map((c) => Number(c.orderCount) || 0));
  }, [customers]);

  const pendingOrders = useMemo(() => {
    return Object.values(pos.orders || {})
      .filter((order: any) => {
        if (!order) {
          return false;
        }

        return (
          order.zone === "takeaway" &&
          (order.type === "takeaway" || order.type === "delivery")
        );
      })
      .sort((a: any, b: any) => {
        return Number(a.openedAt || 0) - Number(b.openedAt || 0);
      });
  }, [pos.orders]);

  function formatOrderAge(openedAt: number) {
    const totalSeconds = Math.max(
      0,
      Math.floor((Date.now() - Number(openedAt || Date.now())) / 1000),
    );

    const hours = Math.floor(totalSeconds / 3600);

    const minutes = Math.floor((totalSeconds % 3600) / 60);

    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(
        seconds,
      ).padStart(2, "0")}`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function openModal(customer?: any, prefilledPhone = "") {
    if (customer) {
      setEditingId(customer.id);
      setNewName(customer.name || "");
      setNewPhone(customer.phone || "");
      setNewAddress(customer.address || "");
    } else {
      setEditingId(null);
      setNewName("");
      setNewPhone(prefilledPhone);
      setNewAddress("");
    }

    setModalOpen(true);
  }

  function getPhoneFromSearch() {
    const digitsOnly = q.replace(/\D/g, "");

    if (digitsOnly.length >= 7) {
      return q.trim();
    }

    return "";
  }

  function openFor(c: any, isDelivery = false) {
    const prefix = isDelivery ? "DEL" : "TAK";

    const openedAt = Date.now();

    const customerId = String(c?.id || "");

    const code = `${prefix}-${customerId.slice(0, 6)}-${openedAt.toString(36)}`;

    const draftOrder: ActiveOrder = {
      tableCode: code,
      zone: "takeaway",
      type: isDelivery ? "delivery" : "takeaway",
      items: [],
      customerId: c.id,
      state: "active",
      discountPct: 0,
      taxPct: 0,
      customerName: c.name || "",
      customerAddress: c.address || "",
      customerPhone: c.phone || "",
      deliveryPrice: 0,
      openedAt,
    };

    onOpenOrder(code, draftOrder);
  }

  async function handleSave() {
    if (!newName.trim()) {
      toast.error("اسم العميل مطلوب على الأقل");
      return;
    }

    try {
      if (editingId && updateCustomer) {
        const result = await updateCustomer(
          editingId,
          newName.trim(),
          newPhone.trim(),
          newAddress.trim(),
        );

        if (result === false) {
          return;
        }

        toast.success("تم تعديل بيانات العميل");

        setModalOpen(false);
        setPage(1);
        setRefreshKey((value) => value + 1);

        return;
      }

      await addCustomer(newName.trim(), newPhone.trim(), newAddress.trim());

      toast.success("تم إضافة العميل بنجاح");

      setModalOpen(false);

      try {
        const searchValue = newPhone.trim() || newName.trim();

        const params = new URLSearchParams({
          search: searchValue,
          page: "1",
          limit: "20",
        });

        const res = await fetch(
          `http://${API_URL}:5000/api/customers?${params.toString()}`,
        );

        if (res.ok) {
          const data = await res.json();

          if (Array.isArray(data.customers)) {
            const createdCustomer =
              data.customers.find(
                (customer: any) =>
                  newPhone.trim() &&
                  String(customer.phone || "").trim() === newPhone.trim(),
              ) ||
              data.customers.find(
                (customer: any) =>
                  String(customer.name || "").trim() === newName.trim(),
              );

            if (createdCustomer) {
              openFor(createdCustomer, false);
              return;
            }
          }
        }
      } catch (fetchError) {
        console.error("❌ فشل العثور على العميل الجديد:", fetchError);
      }

      setPage(1);
      setRefreshKey((value) => value + 1);
    } catch (err) {
      console.error("❌ فشل حفظ العميل:", err);

      toast.error("فشل حفظ بيانات العميل");
    }
  }

  const getRank = (index: number) => {
    const absoluteIndex = index + 1 + (page - 1) * customerLimit;

    if (absoluteIndex === 1) {
      return {
        icon: "🥇",
        cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
      };
    }

    if (absoluteIndex === 2) {
      return {
        icon: "🥈",
        cls: "bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200",
      };
    }

    if (absoluteIndex === 3) {
      return {
        icon: "🥉",
        cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
      };
    }

    return {
      icon: `#${absoluteIndex}`,
      cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    };
  };

  const getActivityPercent = (orderCount: number) => {
    if (orderCount <= 0) {
      return 5;
    }

    return Math.max(8, Math.min(100, (orderCount / maxOrders) * 100));
  };

  const getTierProgress = (
    orderCount: number,
    tier: (typeof TIERS)[number],
  ) => {
    const current = Number(orderCount) || 0;

    const maxStars = 3;

    if (tier.min === 0 && tier.max === 0) {
      return {
        stars: 0,
        maxStars,
      };
    }

    if (tier.max === Infinity) {
      return {
        stars: maxStars,
        maxStars,
      };
    }

    const totalTierOrders = tier.max - tier.min + 1;

    const ordersInCurrentTier = current - tier.min + 1;

    const step = totalTierOrders / maxStars;

    const stars = Math.min(
      maxStars,
      Math.max(1, Math.ceil(ordersInCurrentTier / step)),
    );

    return {
      stars,
      maxStars,
    };
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden px-3 pt-2 gap-3">
      <div className="shrink-0 flex gap-2 items-center">
        <div className="relative flex-1 group">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />

          <Input
            dir="rtl"
            placeholder="بحث باسم العميل أو رقمه أو عنوانه..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="pr-10 pl-3 h-10 rounded-xl border bg-card shadow-sm text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500"
          />
        </div>

        <div className="hidden md:flex h-10 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 items-center gap-1.5">
          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
            العملاء
          </span>

          <span className="text-sm font-black text-emerald-800 dark:text-emerald-300">
            {totalCustomers}
          </span>
        </div>

        <Button
          onClick={() => openModal()}
          className="h-10 px-3.5 gap-1.5 rounded-xl font-black text-xs"
        >
          <UserPlus className="w-3.5 h-3.5" />
          إضافة عميل
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden" dir="rtl">
        <div className="w-36 sm:w-40 shrink-0 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`w-full rounded-2xl border-2 p-3 transition-all ${
              activeTab === "pending"
                ? "bg-amber-500 text-white border-amber-700 shadow-lg"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-amber-50"
            }`}
            disabled={true}
          >
            <div className="text-2xl mb-1">🧾</div>

            <div className="font-black text-sm">الفواتير المعلقة</div>

            <div className="mt-1.5">
              <span className="inline-flex min-w-7 justify-center rounded-full px-2 py-0.5 text-[10px] font-black bg-white/20">
                {pendingOrders.length}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("customers")}
            className={`w-full rounded-2xl border-2 p-3 transition-all ${
              activeTab === "customers"
                ? "bg-emerald-600 text-white border-emerald-700 shadow-lg"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-emerald-50"
            }`}
          >
            <div className="text-2xl mb-1">👥</div>

            <div className="font-black text-sm">العملاء</div>

            <div className="mt-1.5">
              <span className="inline-flex min-w-7 justify-center rounded-full px-2 py-0.5 text-[10px] font-black bg-white/20">
                {totalCustomers}
              </span>
            </div>
          </button>
        </div>

        <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {activeTab === "pending" && (
            <div className="h-full min-h-0 flex flex-col gap-3">
              <div className="shrink-0 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black">الفواتير المعلقة</h2>

                  <p className="text-[10px] text-muted-foreground font-bold mt-0.5">
                    الأوردرات اللي لسه ما اتعملهاش إنهاء
                  </p>
                </div>

                <span className="text-[10px] font-black px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                  {pendingOrders.length} أوردر
                </span>
              </div>

              <div className="flex flex-1 min-h-0 gap-3">
                <div className="flex-1 min-w-0 min-h-0 overflow-auto px-4">
                  {pendingOrders.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="w-full max-w-md rounded-3xl border-2 border-dashed border-slate-300 bg-card/60 p-10 text-center">
                        <div className="text-6xl mb-4">🧾</div>

                        <h3 className="font-black text-lg">
                          لا توجد فواتير معلقة
                        </h3>

                        <p className="text-xs font-bold text-slate-400 mt-1">
                          أي أوردر Takeaway أو Delivery هتلاقيه هنا بعد الحفظ.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 content-start pt-2">
                      {pendingOrders.map((order: any) => {
                        const selected =
                          selectedPendingOrder === order.tableCode;

                        const hasItems =
                          Array.isArray(order.items) && order.items.length > 0;

                        const isDelivery = order.type === "delivery";

                        return (
                          <button
                            key={order.tableCode}
                            type="button"
                            onClick={() =>
                              setSelectedPendingOrder(order.tableCode)
                            }
                            onDoubleClick={() => onOpenOrder(order.tableCode)}
                            className={`relative w-full min-w-[200px] min-h-[105px] rounded-2xl border-[3px] p-4 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                              isDelivery
                                ? "bg-blue-50 border-blue-400"
                                : "bg-emerald-50 border-emerald-400"
                            } ${
                              selected
                                ? "ring-[3px] ring-emerald-500 ring-offset-2 scale-[1.01] border-emerald-500"
                                : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="mb-1 text-[18px] font-black truncate">
                                  {order.customerName || "عميل"}
                                </div>

                                <div className="text-[11px] font-black text-slate-500">
                                  {isDelivery ? "Delivery" : "Takeaway"}
                                </div>
                              </div>

                              <span className="shrink-0 rounded-lg border px-2.5 py-1 text-[9px] font-black">
                                {isDelivery ? "DELIVERY" : "TAKEAWAY"}
                              </span>
                            </div>

                            <div className="my-4 h-px w-full bg-slate-200" />

                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <span className="text-[9px] font-bold text-slate-400 block">
                                  عدد الأصناف
                                </span>

                                <span className="text-[15px] font-black">
                                  {hasItems
                                    ? `${order.items.length} صنف`
                                    : "لم يضف أصناف"}
                                </span>
                              </div>

                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[9px] font-bold text-slate-400">
                                  وقت الطلب
                                </span>

                                <span className="rounded-lg bg-white border border-slate-200 px-2.5 py-1 font-mono text-[15px] font-black">
                                  {formatOrderAge(order.openedAt)}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="w-36 sm:w-40 shrink-0 border-r pr-3 flex flex-col gap-2">
                  <div className="text-[10px] font-black text-slate-500 mb-1">
                    إجراءات الأوردر
                  </div>

                  <Button
                    type="button"
                    disabled={!selectedPendingOrder}
                    onClick={() => {
                      if (selectedPendingOrder) {
                        onOpenOrder(
                          selectedPendingOrder,
                          pos.orders[selectedPendingOrder],
                        );
                      }
                    }}
                    className="h-12 w-full rounded-xl font-black"
                  >
                    فتح
                  </Button>

                  <Button
                    type="button"
                    disabled={!selectedPendingOrder}
                    onClick={() => {
                      if (selectedPendingOrder) {
                        onPrintOrder(selectedPendingOrder);
                      }
                    }}
                    className="h-12 w-full rounded-xl font-black bg-blue-700 hover:bg-blue-800 text-white"
                  >
                    <Printer className="w-4 h-4 ml-2" />
                    طباعة
                  </Button>

                  <Button
                    type="button"
                    disabled
                    className="h-12 w-full rounded-xl font-black opacity-40 bg-slate-200 text-slate-500"
                  >
                    <CheckCircle2 className="w-4 h-4 ml-2" />
                    جاهز
                  </Button>

                  <Button
                    type="button"
                    disabled={!selectedPendingOrder}
                    onClick={() => {
                      if (selectedPendingOrder) {
                        onCheckoutOrder(selectedPendingOrder);
                      }
                    }}
                    className="h-12 w-full rounded-xl font-black bg-red-600 hover:bg-red-700 text-white"
                  >
                    إنهاء
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "customers" && (
            <div className="h-full min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-hidden relative">
                {customerError ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-5 text-center text-sm text-destructive">
                      {customerError}
                    </div>
                  </div>
                ) : !hasLoadedOnce && loadingCustomers ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-2.5">
                    {Array.from({
                      length: customerLimit,
                    }).map((_, i) => (
                      <div
                        key={i}
                        className="h-[170px] rounded-xl border bg-secondary/30 animate-pulse"
                      />
                    ))}
                  </div>
                ) : filtered.length === 0 && !loadingCustomers ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="max-w-sm w-full rounded-2xl border border-dashed p-8 text-center bg-card/70">
                      <div className="text-4xl mb-3">
                        {q.trim() ? "🔎" : "👤"}
                      </div>

                      <h3 className="font-black text-base mb-1">
                        {q.trim() ? "العميل غير موجود" : "لا يوجد عملاء"}
                      </h3>

                      <p className="text-xs text-muted-foreground mb-4">
                        {q.trim()
                          ? `لايوجد عميل مطابق لـ "${q.trim()}"`
                          : "لا توجد نتائج مطابقة للبحث."}
                      </p>

                      {q.trim() ? (
                        <Button
                          onClick={() =>
                            openModal(undefined, getPhoneFromSearch())
                          }
                          className="rounded-xl font-black gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <UserPlus className="w-4 h-4" />
                          إضافة العميل
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setQ("")}
                        >
                          عرض الكل
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid h-full overflow-y-auto overflow-x-hidden grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-2.5 content-start pt-2">
                    {filtered.map((c, index) => {
                      const orderCount = Number(c.orderCount) || 0;

                      const tier = getTier(orderCount);

                      const rank = getRank(index);

                      const { stars, maxStars } = getTierProgress(
                        orderCount,
                        tier,
                      );

                      return (
                        <div
                          key={c.id}
                          className={`group relative overflow-hidden rounded-xl border-2 h-[170px] bg-card shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5 ${
                            tier.cardBorder || "border-slate-300"
                          }`}
                        >
                          <div className={`h-1.5 w-full ${tier.topBar}`} />

                          <div className="flex flex-col h-[calc(100%-6px)] p-2.5 pb-0 bg-white dark:bg-slate-900">
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${rank.cls}`}
                              >
                                {rank.icon}
                              </span>

                              <button
                                type="button"
                                onClick={() => openModal(c)}
                                className="w-6 h-6 rounded flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition-all"
                              >
                                ✏️
                              </button>
                            </div>

                            <h3 className="text-sm font-black truncate text-slate-900 dark:text-white mb-1">
                              {c.name}
                            </h3>

                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-black">
                                  {orderCount}
                                </span>

                                <span className="text-[10px] font-bold text-slate-500">
                                  طلب
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <div className="flex gap-0.5 text-[10px]">
                                  {Array.from({
                                    length: maxStars,
                                  }).map((_, i) => (
                                    <span
                                      key={i}
                                      className={
                                        i < stars
                                          ? "opacity-100"
                                          : "opacity-20 grayscale"
                                      }
                                    >
                                      ⭐
                                    </span>
                                  ))}
                                </div>

                                <span
                                  className={`text-[8px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap ${tier.badge}`}
                                >
                                  {tier.label}
                                </span>
                              </div>
                            </div>

                            <div className="h-1 rounded-full bg-secondary overflow-hidden mb-1.5">
                              <div
                                className={`h-full rounded-full ${tier.bar}`}
                                style={{
                                  width: `${getActivityPercent(orderCount)}%`,
                                }}
                              />
                            </div>

                            <div className="flex items-center gap-1.5 text-[9px] text-slate-600 truncate">
                              <span>📞</span>
                              <span className="font-bold truncate">
                                {c.phone || "بدون رقم"}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 text-[9px] text-slate-600 truncate mt-0.5">
                              <span>📍</span>
                              <span className="font-bold truncate">
                                {c.address || "بدون عنوان"}
                              </span>
                            </div>

                            <Button
                              size="sm"
                              className="mt-auto -mx-2.5 w-[calc(100%+20px)] h-8 rounded-none rounded-b-lg font-black text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => openFor(c, false)}
                            >
                              🛍️ أوردر
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {loadingCustomers && hasLoadedOnce && filtered.length > 0 && (
                  <div className="absolute top-2 right-2 z-20 pointer-events-none flex items-center gap-1.5 rounded-lg border bg-card/90 px-2.5 py-1.5 shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-[9px] font-bold text-muted-foreground">
                      جاري التحديث...
                    </span>
                  </div>
                )}
              </div>

              {!loadingCustomers && totalPages > 1 && (
                <div className="shrink-0 flex items-center justify-center gap-2 border-t pt-2 pb-1 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg h-8 text-xs"
                  >
                    السابق
                  </Button>

                  <div className="min-w-24 text-center text-xs font-black">
                    صفحة {page} من {totalPages}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg h-8 text-xs"
                  >
                    التالي
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <Dialog open onOpenChange={(o) => !o && setModalOpen(false)}>
          <DialogContent
            dir="rtl"
            className="max-w-md rounded-3xl p-0 overflow-hidden bg-white"
          >
            <DialogHeader className="p-5 bg-gradient-to-r from-slate-100 to-emerald-50 border-b">
              <DialogTitle className="font-black text-lg">
                {editingId ? "✏️ تعديل بيانات عميل" : "👤 إضافة عميل جديد"}
              </DialogTitle>
            </DialogHeader>

            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-black block">
                  الاسم <span className="text-red-600">*</span>
                </label>

                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="أدخل اسم العميل..."
                  className="h-11 border-2 rounded-xl font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-black block">رقم الهاتف</label>

                <Input
                  type="tel"
                  inputMode="numeric"
                  value={newPhone}
                  onChange={(e) =>
                    setNewPhone(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="01xxxxxxxxx"
                  maxLength={11}
                  className="h-11 border-2 rounded-xl font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-black block">العنوان</label>

                <Input
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="أدخل عنوان العميل..."
                  className="h-11 border-2 rounded-xl font-bold"
                />
              </div>
            </div>

            <DialogFooter className="p-4 bg-slate-50 border-t flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="h-10 px-5 rounded-xl font-black"
              >
                إلغاء
              </Button>

              <Button
                type="button"
                onClick={handleSave}
                className="h-10 px-6 rounded-xl bg-slate-900 hover:bg-emerald-600 text-white font-black"
              >
                💾 حفظ البيانات
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
/* ---------------- Order entry (فتح) ---------------- */
function OrderEntryDialog({
  tableCode,
  order,
  meals,
  items,
  onClose,
}: {
  tableCode: string;
  order: ActiveOrder;
  meals: Meal[];
  items: Item[];
  onClose: () => void;
}) {
  const { db, deductSubStock } = useDB();
  const {
    db: pos,
    upsertOrder,
    addInvoice,
    clearOrder,
    incCustomerOrders,
  } = usePosDB();
  const submittingRef = useRef(false);

  const [draftItems, setDraftItems] = useState<OrderItem[]>(order.items || []);
  const [microsOrderStarted, setMicrosOrderStarted] = useState(false);

  const [q, setQ] = useState("");
  const [modifierMeal, setModifierMeal] = useState<Meal | null>(null);
  const [activeDepartment, setActiveDepartment] = useState<
    "بار" | "شيشه" | "مطبخ" | null
  >(null);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // 🌟 States الخاصة ببوكس طباعة وإنهاء التيك أواي
  const [takeawayConfirmOpen, setTakeawayConfirmOpen] = useState(false);
  const [takeawayDiscount, setTakeawayDiscount] = useState(
    order.discountPct || 0,
  );
  const [pendingTakeawayDiscount, setPendingTakeawayDiscount] = useState<
    number | null
  >(null);
  const [takeawayDeliveryFee, setTakeawayDeliveryFee] = useState<number>(0);
  const [takeawayOrderType, setTakeawayOrderType] = useState<
    "takeaway" | "delivery"
  >(order.type === "delivery" ? "delivery" : "takeaway");

  const sellable = meals.filter((m) => m.kind === "menu");
  const [isMicros, setIsMicros] = useState(
    () => localStorage.getItem("isMicrosDevice") === "true",
  );

  function changeNotes(lineId: string, notes: string) {
    setDraftItems(
      draftItems.map((l) => (l.id === lineId ? { ...l, notes } : l)),
    );
  }

  useEffect(() => {
    setIsMicros(localStorage.getItem("isMicrosDevice") === "true");
  }, []);
  // 2. الـ State الجديدة بتاعة الكاشير الفرعي 🌟
  const [isSecCashier, setIsSecCashier] = useState(() => {
    return localStorage.getItem("isSecCashierDevice") === "true";
  });
  // =========================================================
  // 🔤 ترتيب ثابت للأقسام والأصناف
  // =========================================================

  const arabicSort = (a: string, b: string) =>
    a.localeCompare(b, "ar", {
      numeric: true,
      sensitivity: "base",
    });

  const filtered = useMemo(() => {
    const search = q.trim().toLocaleLowerCase("ar");

    return sellable
      .filter((m) => {
        if (activeDepartment && m.department !== activeDepartment) {
          return false;
        }

        if (!search) {
          return true;
        }

        return String(m.name || "")
          .toLocaleLowerCase("ar")
          .includes(search);
      })
      .sort((a, b) => arabicSort(String(a.name || ""), String(b.name || "")));
  }, [sellable, q, activeDepartment]);

  const categories = useMemo(() => {
    const source = activeDepartment
      ? sellable.filter((m) => m.department === activeDepartment)
      : [];

    const uniqueCategories = Array.from(
      new Set(
        source.map((m) => String(m.category || "").trim()).filter(Boolean),
      ),
    );

    return uniqueCategories.sort(arabicSort);
  }, [sellable, activeDepartment]);

  function manufacturable(meal: Meal): number | null {
    if (meal.category === SHISHA_CATEGORY) return null;
    if (!meal.ingredients || meal.ingredients.length === 0) return 0;

    const dbRaw = db as unknown as Record<string, unknown>;
    const allOrders = Object.values(pos.orders || {});

    const baseIngredients = expandMealToBase(meal, db.meals, db.items);
    let min = Infinity;

    for (const [itemId, info] of baseIngredients) {
      const it = items.find((x) => x.id === itemId);
      if (!it) return 0;

      const reservedQty = allOrders.reduce((sum: number, order: any) => {
        const itemsList = order.items || [];
        const mealsUsingIt = itemsList.filter((i: any) => i.mealId === meal.id);
        const count = mealsUsingIt.reduce(
          (s: number, i: any) => s + (i.qty || 0),
          0,
        );
        return sum + count * info.qty;
      }, 0);

      const targetDept = (meal.department || it.department) as "بار" | "مطبخ";
      const totalHave =
        (dbRaw.deptStock as Record<string, number>)?.[
          deptKey(targetDept, it.id)
        ] || 0;

      const have = clamp0(totalHave - reservedQty);

      if (info.qty <= 0) continue;
      min = Math.min(min, Math.floor(have / info.qty));
    }
    return min === Infinity ? 99 : Math.max(0, min);
  }

  function deductInventoryForTakeaway() {
    const perDept: Record<string, Record<string, number>> = {};
    for (const line of draftItems) {
      const meal = db.meals.find((m) => m.id === line.mealId);
      if (!meal || meal.category === SHISHA_CATEGORY) continue;

      const dept = meal.department || "عام";
      if (!perDept[dept]) perDept[dept] = {};

      const baseIngredients = expandMealToBase(meal, db.meals, db.items);

      for (const [itemId, info] of baseIngredients) {
        const baseQty = round2(clamp0(info.qty * line.qty));
        if (baseQty <= 0) continue;
        perDept[dept][itemId] = (perDept[dept][itemId] || 0) + baseQty;
      }
    }
    for (const [deptName, itemsMap] of Object.entries(perDept)) {
      const arr = Object.entries(itemsMap).map(([itemId, baseQty]) => ({
        itemId,
        baseQty,
      }));
      deductSubStock(deptName as SubDept, arr);
    }
  }

  function addLine(
    meal: Meal,
    extras: { label: string; price: number }[] = [],
    summary?: string,
  ) {
    const existingLineIndex = draftItems.findIndex(
      (item) => item.mealId === meal.id && item.modifiersSummary === summary,
    );

    if (existingLineIndex >= 0) {
      const newDraftItems = [...draftItems];
      newDraftItems[existingLineIndex].qty += 1;
      setDraftItems(newDraftItems);
    } else {
      const line: OrderItem = {
        id: crypto.randomUUID(),
        mealId: meal.id,
        name: meal.name,
        qty: 1,
        unitPrice: round2(meal.sellingPrice),
        extras,
        modifiersSummary: summary,
        mealName: undefined,
        department: meal.department || "مطبخ",
        price: 0,
        notes: "", // 🌟 هنا
        printedQty: 0,
      };
      setDraftItems([...draftItems, line]);
    }
  }

  function changeQty(lineId: string, qty: number) {
    setDraftItems(
      draftItems.map((l) => (l.id === lineId ? { ...l, qty: clamp0(qty) } : l)),
    );
  }

  function removeLine(lineId: string) {
    setDraftItems(draftItems.filter((l) => l.id !== lineId));
  }

  function onPickMeal(meal: Meal) {
    if (meal.hasModifiers && (meal.modifierGroups?.length || 0) > 0)
      setModifierMeal(meal);
    else addLine(meal);
  }

  const totals = computeTotals(
    draftItems,
    order.discountPct,
    order.taxPct,
    order.orderCategory || "normal",
  );
  function formatModifiersForPrint(summary: any) {
    if (!summary) return "";

    let raw = String(summary).trim();

    // لو جاي JSON Array
    try {
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        raw = parsed
          .map((x) => {
            if (typeof x === "string") return x;
            if (x && typeof x === "object") {
              return x.value ?? x.name ?? Object.values(x).join(" ");
            }
            return "";
          })
          .join("، ");
      }
    } catch {
      /* empty */
    }

    return raw
      .replace(/[\r\n]+/g, " ")
      .split(/\s*(?:•|,|،|\|)\s*/)
      .map((part) => {
        // التحميصة: وسط
        // الحجم: كبير
        // الإضافة: جبنة
        return part.replace(/^\s*[^:：]+[:：]\s*/, "").trim();
      })
      .filter(Boolean)
      .join(" - ");
  }

  async function handleSendToKitchenPrinters(
    currentOrder: any,
    isNewOrder = false,
    persistOrder = true,
  ) {
    if (!currentOrder) return currentOrder;

    // =========================================================
    // الأوردر القديم
    // =========================================================

    const oldOrder = isNewOrder ? null : pos.orders[currentOrder.tableCode];

    const oldItems: OrderItem[] = Array.isArray(currentOrder.originalItems)
      ? currentOrder.originalItems
      : oldOrder?.items || [];

    // =========================================================
    // توحيد الأقسام
    // =========================================================

    const matchDept = (itemDept: string, targetDept: string) => {
      const cleanItem = String(itemDept || "")
        .trim()
        .toLowerCase();

      const cleanTarget = String(targetDept || "")
        .trim()
        .toLowerCase();

      if (cleanTarget === "مطبخ" || cleanTarget === "kitchen") {
        return (
          cleanItem === "مطبخ" ||
          cleanItem === "kitchen" ||
          cleanItem === "صالة"
        );
      }

      if (cleanTarget === "بار" || cleanTarget === "bar") {
        return cleanItem === "بار" || cleanItem === "bar";
      }

      if (
        cleanTarget === "شيشة" ||
        cleanTarget === "شيشه" ||
        cleanTarget === "shisha"
      ) {
        return (
          cleanItem === "شيشة" ||
          cleanItem === "شيشه" ||
          cleanItem === "شيشة ومعسل" ||
          cleanItem === "شيشه ومعسل" ||
          cleanItem === "shisha"
        );
      }

      if (cleanTarget === "كاشير فرعي" || cleanTarget === "عام") {
        return (
          cleanItem === "كاشير فرعي" ||
          cleanItem === "عام" ||
          cleanItem === "other"
        );
      }

      return cleanItem === cleanTarget;
    };

    // =========================================================
    // توحيد الاختيارات
    // =========================================================

    const normalizeModifierKey = (value: any) => {
      if (!value) return "";

      return String(value)
        .replace(/[\r\n]+/g, " ")
        .split(/\s*(?:•|,|،|\|)\s*/)
        .map((part) => part.replace(/^\s*[^:：]+[:：]\s*/, "").trim())
        .filter(Boolean)
        .join(" • ");
    };

    const getUniqueKey = (item: OrderItem) =>
      `${item.mealId}___${normalizeModifierKey(item.modifiersSummary)}`;

    // =========================================================
    // تجهيز بيانات القديم
    // =========================================================

    const oldQtyMap: Record<string, number> = {};
    const oldDetailsMap: Record<string, OrderItem> = {};

    oldItems.forEach((item) => {
      const key = getUniqueKey(item);

      oldQtyMap[key] = (oldQtyMap[key] || 0) + Number(item.qty || 0);

      oldDetailsMap[key] = item;
    });

    // =========================================================
    // تجهيز الحالي
    //
    // مهم:
    // - item جديد مش موجود في القديم => printedQty = 0
    // - item قديم بدون printedQty => نعتبره مطبوع بالكامل
    // - item عنده printedQty => نحافظ عليه
    // =========================================================

    const currentItems: OrderItem[] = (currentOrder.items || []).map(
      (item: OrderItem) => {
        const key = getUniqueKey(item);

        let printedQty: number;

        if (typeof item.printedQty === "number") {
          printedQty = Math.max(0, Number(item.printedQty));
        } else if (Object.prototype.hasOwnProperty.call(oldQtyMap, key)) {
          // صنف قديم من أوردر موجود بالفعل
          printedQty = Math.max(0, Number(item.qty || 0));
        } else {
          // صنف جديد
          printedQty = 0;
        }

        return {
          ...item,
          printedQty,
        };
      },
    );

    // =========================================================
    // تجميع الحالي
    // =========================================================

    const currentQtyMap: Record<string, number> = {};
    const currentPrintedQtyMap: Record<string, number> = {};
    const currentDetailsMap: Record<string, OrderItem> = {};

    currentItems.forEach((item) => {
      const key = getUniqueKey(item);

      currentQtyMap[key] = (currentQtyMap[key] || 0) + Number(item.qty || 0);

      currentPrintedQtyMap[key] =
        (currentPrintedQtyMap[key] || 0) + Number(item.printedQty || 0);

      currentDetailsMap[key] = item;
    });

    // =========================================================
    // حساب الفرق
    // =========================================================

    const diffItems: any[] = [];

    Object.keys(currentQtyMap).forEach((key) => {
      const currentQty = Number(currentQtyMap[key] || 0);

      const printedQty = Math.min(
        currentQty,
        Math.max(0, Number(currentPrintedQtyMap[key] || 0)),
      );

      const diffQty = currentQty - printedQty;

      if (diffQty === 0) return;

      const item = currentDetailsMap[key];

      if (!item) return;

      const originalMeal = db.meals.find((m) => m.id === item.mealId);

      const department = item.department || originalMeal?.department || "مطبخ";

      const formattedModifiers = formatModifiersForPrint(item.modifiersSummary);

      const fullName = formattedModifiers
        ? `${item.name} (${formattedModifiers})`
        : item.name;

      diffItems.push({
        uniqueKey: key,
        itemId: item.mealId,
        name: fullName,
        diffQty: diffQty,
        department,
        notes: item.notes || "",
      });
    });

    // =========================================================
    // أصناف اتحذفت بالكامل
    // =========================================================

    Object.keys(oldQtyMap).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(currentQtyMap, key)) {
        return;
      }

      const oldQty = Number(oldQtyMap[key] || 0);

      if (oldQty === 0) return;

      const item = oldDetailsMap[key];

      if (!item) return;

      const originalMeal = db.meals.find((m) => m.id === item.mealId);

      const department = item.department || originalMeal?.department || "مطبخ";

      const formattedModifiers = formatModifiersForPrint(item.modifiersSummary);

      const fullName = formattedModifiers
        ? `${item.name} (${formattedModifiers})`
        : item.name;

      diffItems.push({
        uniqueKey: key,
        itemId: item.mealId,
        name: fullName,
        diffQty: -oldQty,
        department,
        notes: item.notes || "",
      });
    });

    // =========================================================
    // مفيش أي فرق
    // مهم جدًا:
    // هنا مش هنبعت أي Request للطابعة
    // =========================================================

    if (diffItems.length === 0) {
      const normalizedOrder = {
        ...currentOrder,
        items: currentItems,
      };

      if (persistOrder) {
        await upsertOrder(normalizedOrder, { silent: true });
      }

      console.log("🟢 NO KITCHEN PRINT NEEDED:", currentOrder.tableCode);

      return normalizedOrder;
    }

    // =========================================================
    // طباعة البار للكاشير الفرعي
    // =========================================================

    if (isSecCashier) {
      const barDiffItems = diffItems.filter((item) =>
        matchDept(item.department, "بار"),
      );

      if (barDiffItems.length > 0) {
        triggerBarDiffPrint({
          ...currentOrder,
          items: barDiffItems,
          tableCode: currentOrder.tableCode,
          zoneName: currentOrder.zone,
          createdAt: currentOrder.createdAt || Date.now(),
        });
      }
    }

    // =========================================================
    // الطابعات
    // =========================================================

    const savedPrinters = JSON.parse(
      localStorage.getItem("pos_dynamic_printers") || "[]",
    );

    const printersToUse =
      savedPrinters.length > 0
        ? savedPrinters
        : [
            {
              id: "1",
              name: "طابعة المطبخ الرئيسي",
              ip: "127.0.0.1",
              port: 9100,
              targetDept: "مطبخ",
            },
            {
              id: "2",
              name: "طابعة البار والمشروبات",
              ip: "127.0.0.1",
              port: 9101,
              targetDept: "بار",
            },
            {
              id: "3",
              name: "طابعة الشيشة الخارجية",
              ip: "127.0.0.1",
              port: 9102,
              targetDept: "شيشة",
            },
          ];

    // =========================================================
    // تجهيز Jobs
    // =========================================================

    const printerJobs: PrinterJob[] = printersToUse
      .map(
        (printer: KitchenPrinter): PrinterJob => ({
          printer,
          printerItems: diffItems.filter((item) =>
            matchDept(item.department, printer.targetDept),
          ),
        }),
      )
      .filter(({ printerItems }: PrinterJob) => printerItems.length > 0);

    // =========================================================
    // تنفيذ الطباعة
    // =========================================================

    await Promise.all(
      printerJobs.map(async ({ printer, printerItems }) => {
        try {
          console.log("🖨️ KITCHEN PRINT REQUEST:", printer.name, printerItems);

          const response = await fetch(
            `http://${API_URL}:5000/api/print-kitchen`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                printerIP: printer.ip,
                printerPort: Number(printer.port) || 9100,

                deptName: printer.name,

                tableName: currentOrder.tableCode,

                zoneName: currentOrder.zone,

                items: printerItems,

                orderCategory: currentOrder.orderCategory || "dinein",

                customerName: currentOrder.customerName || "",

                captainName:
                  currentOrder.captainName ||
                  currentOrder.captain ||
                  currentOrder.captainCode ||
                  "",
              }),
            },
          );

          if (!response.ok) {
            throw new Error(`Printer HTTP ${response.status}`);
          }

          const result = await response.json();

          if (!result.success) {
            throw new Error(result.error || "Printer failed");
          }

          // =================================================
          // الكميات التي تم اعتبارها مطبوعة
          // =================================================

          const printedItems = Array.isArray(result.printedItems)
            ? result.printedItems
            : [];

          for (const printed of printedItems) {
            const printedKey = String(printed.uniqueKey || "");

            let remainingPrinted = Math.max(0, Number(printed.printedQty || 0));

            if (!printedKey || remainingPrinted <= 0) {
              continue;
            }

            // =================================================
            // وزّع الكمية المطبوعة على الـ rows المطابقة
            // بدل ما تضيفها لكل row مرة واحدة
            // =================================================

            const matchingItems = currentItems.filter(
              (item) =>
                getUniqueKey(item) === printedKey &&
                matchDept(item.department, printer.targetDept),
            );

            for (const item of matchingItems) {
              if (remainingPrinted <= 0) {
                break;
              }

              const qty = Number(item.qty || 0);

              const alreadyPrinted = Math.max(0, Number(item.printedQty || 0));

              const remainingForItem = Math.max(0, qty - alreadyPrinted);

              if (remainingForItem <= 0) {
                continue;
              }

              const addPrinted = Math.min(remainingPrinted, remainingForItem);

              item.printedQty = alreadyPrinted + addPrinted;

              remainingPrinted -= addPrinted;
            }
          }

          console.log("✅ KITCHEN PRINT RESULT:", printer.name, result);
        } catch (err) {
          console.error(`❌ فشل الاتصال بالطابعة: ${printer.name}`, err);
        }
      }),
    );

    // =========================================================
    // حفظ الحالة النهائية
    // =========================================================

    const { originalItems: _originalItems, ...orderToSave } = currentOrder;

    const finalOrder = {
      ...orderToSave,
      items: currentItems,
    };

    if (persistOrder) {
      await upsertOrder(finalOrder, { silent: true });
    }

    return finalOrder;
  }
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🌟 تعديل هنا: دالة "حفظ" تفرق بين التيك أواي والصالة
  async function handleSaveClick(code: string) {
    if (isSubmitting) return;

    if (draftItems.length === 0) {
      toast.error("لا يمكن حفظ أوردر بدون أصناف");
      return;
    }

    setIsSubmitting(true);

    try {
      // =====================================================
      // ✅ لو الأوردر جاي من الفواتير المعلقة
      // نعدله ونحفظه مباشرة بدون بوكس Takeaway
      // =====================================================

      const existingOrder = pos.orders[code];

      const isExistingPendingOrder =
        !!existingOrder &&
        Array.isArray(existingOrder.items) &&
        existingOrder.items.length > 0;

      if (order.zone === "takeaway" && isExistingPendingOrder) {
        const savedOrder = await handleSendToKitchenPrinters(
          {
            ...order,
            tableCode: code,
            items: draftItems,
            originalItems: order.items || [],
            zone: "takeaway",
            type: order.type === "delivery" ? "delivery" : "takeaway",
          },
          false,
          true,
        );

        await upsertOrder({
          ...savedOrder,
          tableCode: code,
          zone: "takeaway",
          type: order.type === "delivery" ? "delivery" : "takeaway",
          items: draftItems,
          state: "active",
        });

        toast.success("تم تحديث الأوردر المعلق بنجاح ✅");

        onClose();
        return;
      }

      // =====================================================
      // ✅ عميل جديد / Takeaway جديد
      // هنا فقط يظهر بوكس الدفع والتأكيد
      // =====================================================

      if (order.zone === "takeaway") {
        const currentOrder: ActiveOrder = {
          ...order,
          tableCode: code,
          items: draftItems,
          state: "active",
          taxPct: 0,
          openedAt: order.openedAt || Date.now(),
        };

        setTakeawayOrderType(
          order.type === "delivery" ? "delivery" : "takeaway",
        );

        setTakeawayConfirmOpen(true);

        return;
      }

      // =====================================================
      // ✅ طلبات الصالة
      // =====================================================

      const savedOrder = await handleSendToKitchenPrinters(
        {
          ...order,
          items: draftItems,
          tableCode: code,
          originalItems: order.items || [],
        },
        false,
      );

      await upsertOrder({
        ...savedOrder,
        state: "active",
      });

      toast.success("تم حفظ طلب الصالة على الطاولة! 🍽️");

      onClose();
    } catch (error: any) {
      console.error("❌ HANDLE SAVE FAILED:", error);

      toast.error(error?.message || "حدث خطأ أثناء حفظ الأوردر");
    } finally {
      setIsSubmitting(false);
    }
  }
  async function saveDeliveryAsActiveOrder() {
    try {
      const currentOrder: ActiveOrder = {
        ...order,
        tableCode,
        zone: "takeaway",
        type: "delivery",
        items: draftItems,
        state: "active",
        taxPct: 0,
        deliveryPrice: Number(takeawayDeliveryFee) || 0,
        openedAt: order.openedAt || Date.now(),
      };

      const savedOrder = await handleSendToKitchenPrinters(
        {
          ...currentOrder,
          originalItems: order.items || [],
        },
        !pos.orders[tableCode],
        true,
      );

      await upsertOrder({
        ...savedOrder,
        tableCode,
        zone: "takeaway",
        type: "delivery",
        items: draftItems,
        state: "active",
        taxPct: 0,
        deliveryPrice: Number(takeawayDeliveryFee) || 0,
      });

      setTakeawayConfirmOpen(false);

      toast.success("تم حفظ الدليفري في الفواتير المعلقة 🛵");

      onClose();
    } catch (error: any) {
      console.error("❌ SAVE DELIVERY FAILED:", error);
      throw error;
    }
  }
  // 🌟 الدالة الجديدة اللي هتنفذ حفظ وطباعة التيك أواي الفعلي بعد البوكس
  async function executeTakeawaySave() {
    if (submittingRef.current) {
      console.warn("⚠️ TAKEAWAY SAVE blocked: already submitting");
      return;
    }

    if (takeawayOrderType === "delivery") {
      submittingRef.current = true;
      setIsSubmitting(true);

      try {
        await saveDeliveryAsActiveOrder();
        return;
      } catch (error: any) {
        console.error("❌ DELIVERY SAVE FAILED:", error);

        toast.error(error?.message || "حدث خطأ أثناء حفظ طلب التوصيل");
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      // ======================================================
      // 1️⃣ الإجماليات
      // ======================================================

      const finalDiscountPct = Number(takeawayDiscount || 0);

      const finalDeliveryPrice = Number(takeawayDeliveryFee || 0);

      const computedType =
        order.type === "delivery" || finalDeliveryPrice > 0
          ? "delivery"
          : "takeaway";

      const updatedTotals = computeTotals(
        draftItems,
        finalDiscountPct,
        0,
        order.orderCategory || "normal",
      );

      const takeawayFinalTotal = round2(
        Number(updatedTotals.subtotal || 0) -
          Number(updatedTotals.discountValue || 0) +
          finalDeliveryPrice +
          Number(updatedTotals.commissionValue || 0),
      );
      // ======================================================
      // 3️⃣ الكاشير
      // ======================================================

      const isSecDevice = localStorage.getItem("isSecCashierDevice") === "true";

      const secName = localStorage.getItem("secCashierName") || "كاشير فرعي";

      const currentCashierName = isSecDevice
        ? secName
        : pos.shift?.cashierName || "كاشير رئيسي";

      const currentCashierId = isSecDevice
        ? localStorage.getItem("secCashierId")
        : pos.shift?.cashierId;

      // ======================================================
      // 4️⃣ الجهاز
      // ======================================================

      const deviceRes = await fetch(`http://${API_URL}:5000/api/device-check`, {
        cache: "no-store",
      });

      if (!deviceRes.ok) {
        throw new Error("فشل تحديد نوع الجهاز");
      }

      const device = await deviceRes.json();

      const currentTerminalId = device.terminalId || "Main";

      // ======================================================
      // 5️⃣ الفاتورة
      // ======================================================

      const inv: any = {
        id:
          (order as any).invoiceRequestId ||
          `inv_${tableCode}_${order.openedAt || crypto.randomUUID()}`,

        type: computedType,

        tableCode,

        zone: "takeaway",

        customerName: order.customerName || null,

        customerAddress: order.customerAddress || null,

        customerPhone:
          (order as any).customerPhone || (order as any).phone || null,

        cashierId: currentCashierId || null,

        cashierName: currentCashierName,

        captainName: (order as any).captainName || null,

        items: draftItems,

        subtotal: updatedTotals.subtotal,

        discountPct: finalDiscountPct,

        discountValue: updatedTotals.discountValue,

        taxPct: 0,

        taxValue: 0,

        deliveryPrice: finalDeliveryPrice,

        commissionValue: updatedTotals.commissionValue,

        total: takeawayFinalTotal,

        createdAt: Date.now(),

        terminalId: currentTerminalId,

        createdBy: currentCashierName,

        orderCategory: order.orderCategory || "normal",
      };

      // ======================================================
      // 6️⃣ طباعة المطبخ
      // ======================================================

      await handleSendToKitchenPrinters(
        {
          ...order,
          items: draftItems,
          tableCode,
          zone: "takeaway",
          type: "takeaway",
        },
        true,
        false,
      );

      // ======================================================
      // 7️⃣ حفظ الفاتورة
      // ======================================================

      const savedInvoice = await addInvoice(inv);

      if (!savedInvoice || !savedInvoice.id) {
        throw new Error("لم يتم استلام الفاتورة الرسمية من السيرفر");
      }

      // ======================================================
      // 8️⃣ تقسيم المبيعات بالأقسام
      // ======================================================

      const salesByDept: Record<string, any[]> = {};

      draftItems.forEach((item: any) => {
        const meal = db.meals.find((m) => m.id === item.mealId);

        const dept = meal?.department || item.department || "عام";

        if (!salesByDept[dept]) {
          salesByDept[dept] = [];
        }

        salesByDept[dept].push(item);
      });

      // ======================================================
      // 9️⃣ حفظ sales
      // ======================================================

      for (const [deptName, deptLines] of Object.entries(salesByDept)) {
        const lines = deptLines as any[];

        if (lines.length === 0) {
          continue;
        }

        const totalSales = lines.reduce(
          (sum: number, line: any) =>
            sum +
            Number(line.unitPrice ?? line.price ?? 0) * Number(line.qty || 0),
          0,
        );

        let totalCost = 0;

        const historicalLines = lines.map((line: any) => {
          const meal = db.meals.find((m) => m.id === line.mealId);

          let costPerUnit = Number(line.costPerUnit);

          if (!Number.isFinite(costPerUnit) || costPerUnit < 0) {
            if (meal) {
              const baseDeds = expandMealToBase(meal, db.meals, db.items);

              costPerUnit = 0;

              for (const [, info] of baseDeds) {
                costPerUnit += info.cost;
              }

              costPerUnit = round2(clamp0(costPerUnit));
            } else {
              costPerUnit = 0;
            }
          }

          const qty = Number(line.qty || 0);

          totalCost += costPerUnit * qty;

          const sellingPrice = Number(
            line.unitPrice ?? line.price ?? meal?.sellingPrice ?? 0,
          );

          return {
            ...line,

            unitPrice: sellingPrice,

            price: sellingPrice,

            costPerUnit,

            department: line.department || meal?.department || deptName,

            name: line.name || meal?.name || `صنف ${line.mealId}`,
          };
        });

        const newSale = {
          id: `sale_${savedInvoice.id}_${deptName}`,

          date: new Date().toISOString().split("T")[0],

          department: deptName,

          lines: historicalLines,

          totalSales: round2(clamp0(totalSales)),

          totalCost: round2(clamp0(totalCost)),

          createdAt: Date.now(),
        };

        const response = await fetch(`http://${API_URL}:5000/api/sales`, {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(newSale),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");

          throw new Error(
            `فشل تسجيل مبيعات ${deptName} - HTTP ${response.status}${
              errorText ? ` - ${errorText}` : ""
            }`,
          );
        }
      }

      // ======================================================
      // 🔟 خصم المخزون
      // ======================================================

      await Promise.resolve(deductInventoryForTakeaway());

      // ======================================================
      // 1️⃣1️⃣ طباعة الفاتورة
      // ======================================================

      triggerPrint(
        {
          ...savedInvoice,
          type: takeawayOrderType,
        },
        true,
      );

      // ======================================================
      // 1️⃣2️⃣ العملاء
      // ======================================================

      if (order.customerId) {
        await Promise.resolve(incCustomerOrders(order.customerId));
      }

      // ======================================================
      // 1️⃣3️⃣ إنهاء العملية
      // ======================================================

      clearOrder(tableCode);

      setTakeawayConfirmOpen(false);

      onClose();

      if (computedType === "delivery") {
        toast.success(`تم حفظ وطباعة الفاتورة 🛵 (+${finalDeliveryPrice} ج.م)`);
      } else {
        toast.success("تم حفظ وطباعة فاتورة التيك أواي بنجاح 🛍️");
      }
    } catch (error: any) {
      console.error("❌ EXECUTE TAKEAWAY FAILED:", error);

      toast.error(error?.message || "حدث خطأ أثناء حفظ الفاتورة");
    } finally {
      submittingRef.current = false;

      setIsSubmitting(false);
    }
  }
const renderMealCard = (m: any) => {
  const addedInCart =
    draftItems.find((it) => it.mealId === m.id)?.qty || 0;

  return (
    <button
      key={m.id}
      type="button"
      onClick={() => onPickMeal(m)}
      className="
        h-full
        min-h-[120px]
        w-full
        cursor-pointer
        rounded-2xl
        border-2
        p-3
        flex
        flex-col
        items-center
        justify-between
        gap-2
        text-center
        relative
        overflow-hidden

        bg-white
        border-stone-200
        shadow-sm

        transition-all
        duration-200
        ease-out

        hover:border-emerald-300
        hover:bg-emerald-50/50
        hover:shadow-md

        active:bg-emerald-100
        active:border-emerald-400
        active:shadow-[0_0_0_4px_rgba(16,185,129,0.10)]
        active:duration-100
      "
    >
      <span className="font-black text-sm sm:text-base leading-tight text-slate-900 w-full pt-1 break-words">
        {m.name}
      </span>

      <span className="text-sm sm:text-lg font-black text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-lg border border-emerald-300/60 w-full break-words">
        {fmt2(m.sellingPrice)} ج.م
      </span>
    </button>
  );
};
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          dir="rtl"
          className="
          max-w-7xl
          w-[100vw]
          h-[85vh]
          max-h-[85vh]
          p-0
          overflow-hidden
          flex
          flex-col
          bg-stone-50
          text-stone-900
        "
        >
          <DialogTitle className="sr-only">صلي علي النبي</DialogTitle>

          <div className="flex flex-1 min-h-0 h-full">
            {/* ========================= */}
            {/* PRODUCTS AREA */}
            {/* ========================= */}

            <div className="flex-1 flex flex-col min-w-0 border-l border-stone-200 bg-stone-50">
              {/* SEARCH HEADER */}
              <div
                className="
                p-3
                border-b
                border-stone-200
                bg-white
                space-y-2
                shadow-[0_1px_4px_rgba(28,25,23,0.04)]
              "
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm flex items-center gap-3">
                    {order.customerName && (
                      <span className="text-stone-600 font-bold">
                        {order.customerName}
                      </span>
                    )}
                  </div>
                </div>

                <Input
                  dir="rtl"
                  placeholder="ابحث عن صنف..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="
                  h-11
                  px-4
                  bg-stone-50
                  text-stone-900
                  text-base
                  font-bold
                  border
                  border-stone-300
                  shadow-none
                  placeholder:text-stone-400
                  focus-visible:ring-2
                  focus-visible:ring-emerald-100
                  focus-visible:border-emerald-600
                  transition-[border-color,box-shadow,background-color]
                  duration-150
                "
                />
              </div>
              {/* PRODUCTS / CATEGORIES */}
              <div className="flex-1 overflow-auto p-3 dir-rtl bg-stone-50">
                {/* ==============================
      DEPARTMENT FILTER
      ============================== */}
                <div className="sticky top-0 z-20 bg-stone-50 pb-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        id: "بار" as const,
                        title: "البار",
                        icon: "🍹",
                      },
                      {
                        id: "شيشه" as const,
                        title: "الشيشة",
                        icon: "🚬",
                      },
                      {
                        id: "مطبخ" as const,
                        title: "المطبخ",
                        icon: "🍳",
                      },
                    ].map((dept) => {
                      const isActive = activeDepartment === dept.id;

                      return (
                        <button
                          key={dept.id}
                          type="button"
                          onClick={() => {
                            setActiveDepartment(dept.id);
                            setActiveCategory(null);
                            setQ("");
                          }}
                          className={`
              h-14
              rounded-2xl
              border-2
              flex
              items-center
              justify-center
              gap-2
              text-sm sm:text-base
              font-black
              shadow-sm
              active:scale-[0.97]
              transition-[background-color,border-color,color,box-shadow,transform]
              duration-150
              ${
                isActive
                  ? "bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-200"
                  : "bg-white text-stone-700 border-stone-300 hover:bg-emerald-50 hover:border-emerald-300"
              }
            `}
                        >
                          <span className="text-xl leading-none">
                            {dept.icon}
                          </span>
                          <span>{dept.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* SEARCH */}
                <div className="pb-3">
                  <Input
                    dir="rtl"
                    placeholder={
                      activeDepartment
                        ? `ابحث في منيو ${activeDepartment}...`
                        : "اختار المنيو الأول..."
                    }
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    disabled={!activeDepartment}
                    className="
        h-11
        px-4
        bg-white
        text-stone-900
        text-base
        font-bold
        border
        border-stone-300
        shadow-none
        placeholder:text-stone-400
        focus-visible:ring-2
        focus-visible:ring-emerald-100
        focus-visible:border-emerald-600
      "
                  />
                </div>

                {/* ==============================
      NO DEPARTMENT
      ============================== */}
                {!activeDepartment ? (
                  <div className="h-full min-h-[220px] flex items-center justify-center">
                    <div className="text-center text-stone-400">
                      <div className="text-5xl mb-3">🧾</div>
                      <div className="font-black text-lg">
                        اختار المنيو من فوق
                      </div>
                    </div>
                  </div>
                ) : q ? (
                  /* ==============================
       SEARCH RESULTS
       ============================== */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {filtered.map((m) => renderMealCard(m))}
                  </div>
                ) : !activeCategory ? (
                  /* ==============================
       CATEGORIES
       ============================== */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 border-b border-stone-200 pb-3">
                      <h4 className="font-black text-xl text-stone-800">
                        منيو {activeDepartment}
                      </h4>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setActiveCategory(cat)}
                          className="
              min-h-[100px]
              rounded-2xl
              border
              border-stone-200
              bg-white
              text-stone-800
              p-3
              flex
              items-center
              justify-center
              text-center
              font-black
              text-base sm:text-lg
              shadow-[0_2px_6px_rgba(28,25,23,0.05)]
              hover:bg-emerald-50
              hover:border-emerald-300
              hover:-translate-y-[1px]
              active:scale-[0.97]
              transition-[transform,background-color,border-color,box-shadow]
              duration-150
            "
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* ==============================
       ITEMS
       ============================== */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 border-b border-stone-200 pb-3">
                      <h4 className="font-black text-xl text-stone-800">
                        {activeCategory}
                      </h4>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveCategory(null)}
                        className="
            shrink-0
            font-bold
            text-stone-700
            border-stone-300
            bg-white
            hover:bg-stone-50
            active:scale-[0.96]
          "
                      >
                        رجوع
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {filtered
                        .filter((m) => m.category === activeCategory)
                        .map((m) => renderMealCard(m))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ========================= */}
            {/* CART */}
            {/* ========================= */}

            <div
              className="
              w-72
              lg:w-80
              shrink-0
              grid
              grid-rows-[auto_minmax(0,1fr)_auto]
              min-h-0
              h-full
              bg-stone-100
              overflow-hidden
              border-r
              border-stone-300
              dir-rtl
            "
            >
              {/* HEADER */}
              <div
                className="
                p-2.5
                border-b
                border-stone-200
                bg-white
                shrink-0
                flex
                items-center
                justify-between
                shadow-[0_1px_4px_rgba(28,25,23,0.05)]
                z-10
              "
              >
                <h3 className="font-black text-sm text-stone-800 flex items-center gap-2">
                  <span>🛒 السلة</span>

                  <span
                    className="
                    bg-emerald-700
                    text-white
                    px-2
                    py-0.5
                    rounded-full
                    text-xs
                    font-bold
                    min-w-[24px]
                    text-center
                  "
                  >
                    {draftItems.length}
                  </span>
                </h3>
              </div>

              {/* DRAFT ITEMS */}
              <div className="min-h-0 overflow-y-auto overflow-x-hidden p-2 space-y-1.5 overscroll-contain bg-stone-100">
                {draftItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-stone-400 gap-1">
                    <p className="font-bold text-xs text-center">السلة فارغة</p>
                  </div>
                ) : (
                  draftItems.map((l, index) => (
                    <div
                      key={`${l.id}-${index}`}
                      className="
                      bg-white
                      border
                      border-stone-200
                      border-r-4
                      border-r-emerald-600
                      rounded-lg
                      p-2.5
                      text-xs
                      shadow-[0_1px_4px_rgba(28,25,23,0.04)]
                      hover:border-emerald-200
                      hover:border-r-emerald-700
                      hover:shadow-[0_3px_10px_rgba(6,95,70,0.10)]
                      hover:-translate-y-[1px]
                      transition-[transform,border-color,box-shadow]
                      duration-150
                      space-y-1.5
                    "
                    >
                      {/* اسم الصنف */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-[13px] text-stone-900 truncate">
                            {l.name}
                          </div>

                          {l.modifiersSummary && (
                            <div className="text-[9px] font-bold text-stone-500 truncate">
                              {l.modifiersSummary}
                            </div>
                          )}
                        </div>

                        {(isMicros
                          ? Number(l.printedQty || 0) === 0
                          : true) && (
                          <button
                            type="button"
                            onClick={() => removeLine(l.id)}
                            className="
                            text-red-600
                            bg-red-50
                            hover:text-white
                            hover:bg-red-600
                            p-1
                            rounded-md
                            shrink-0
                            transition-[transform,color,background-color]
                            duration-100
                            active:scale-90
                          "
                            title="حذف الصنف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* الملاحظات */}
                      <div>
                        <input
                          dir="rtl"
                          type="text"
                          placeholder="اكتب ملاحظة للصنف..."
                          value={l.notes || ""}
                          onChange={(e) => changeNotes(l.id, e.target.value)}
                          className="
                            w-full
                            h-10

                            text-sm
                            !font-black
                            leading-5

                            px-3
                            py-2

                            bg-white
                            text-stone-900

                            border-2
                            border-stone-400
                            rounded-md

                            shadow-[0_1px_3px_rgba(28,25,23,0.08)]

                            placeholder:text-stone-500
                            placeholder:font-bold
                            placeholder:opacity-100

                            hover:border-stone-500

                            focus:border-emerald-700
                            focus:bg-white
                            focus:shadow-[0_0_0_2px_rgba(5,150,105,0.12)]

                            outline-none

                            transition-[border-color,box-shadow,background-color]
                            duration-150
                          "
                        />
                      </div>

                      {/* السعر والكمية */}
                      <div className="flex items-center justify-between pt-1 border-t border-stone-100">
                        <span className="font-black text-stone-700 text-xs">
                          {fmt2(
                            (l.unitPrice +
                              l.extras.reduce((s, e) => s + e.price, 0)) *
                              l.qty,
                          )}{" "}
                          ج.م
                        </span>

                        <div
                          className="
                          flex
                          items-center
                          gap-1
                          bg-stone-50
                          p-0.5
                          rounded-md
                          border
                          border-stone-200
                        "
                        >
                          {!isMicros && (
                            <button
                              type="button"
                              onClick={() => changeQty(l.id, l.qty - 1)}
                              className="
                              w-5
                              h-5
                              flex
                              items-center
                              justify-center
                              rounded-md
                              bg-emerald-700
                              text-white
                              font-black
                              text-xs
                              hover:bg-emerald-800
                              transition-[transform,background-color]
                              duration-100
                              ease-out
                              active:scale-90
                            "
                            >
                              -
                            </button>
                          )}

                          <span className="w-4 text-center text-xs font-black text-stone-900">
                            {l.qty}
                          </span>

                          <button
                            type="button"
                            onClick={() => changeQty(l.id, l.qty + 1)}
                            className="
                            w-5
                            h-5
                            flex
                            items-center
                            justify-center
                            rounded-md
                            bg-emerald-700
                            text-white
                            font-black
                            text-xs
                            hover:bg-emerald-800
                            transition-[transform,background-color]
                            duration-100
                            ease-out
                            active:scale-90
                          "
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* FOOTER */}
              <div className="shrink-0 bg-white border-t border-stone-300 shadow-[0_-2px_8px_rgba(28,25,23,0.06)] z-20">
                {/* الإجماليات */}
                <div className="p-2 space-y-0.5 text-[11px] bg-white">
                  <Row label="المجموع" value={fmt2(totals.subtotal)} />

                  <Row
                    label={`الخصم (${order.discountPct}%)`}
                    value={fmt2(totals.discountValue)}
                  />

                  <Row
                    label={`الضريبة (${order.taxPct}%)`}
                    value={fmt2(totals.taxValue)}
                  />

                  {totals.commissionValue > 0 && (
                    <Row
                      label="نسبة المنصة (+5%)"
                      value={fmt2(totals.commissionValue)}
                    />
                  )}

                  <div className="pt-1 border-t border-stone-200 mt-1">
                    <Row
                      label="الإجمالي النهائي"
                      value={`${fmt2(totals.total)} ج.م`}
                      bold
                    />
                  </div>
                </div>

                {/* خيارات التيك أواي */}
                {order.zone === "takeaway" && (
                  <div className="p-2 border-t border-stone-200 space-y-2 bg-stone-50">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          order.orderCategory === "talabat"
                            ? "default"
                            : "outline"
                        }
                        className={`h-8 text-[10px] font-black border transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out active:scale-[0.97] ${
                          order.orderCategory === "talabat"
                            ? "bg-orange-600 hover:bg-orange-700 text-white border-orange-700 shadow-sm"
                            : "text-orange-700 border-orange-200 hover:bg-orange-50 bg-white"
                        }`}
                        onClick={() => {
                          const nextCat: ActiveOrder["orderCategory"] =
                            order.orderCategory === "talabat"
                              ? "normal"
                              : "talabat";
                          upsertOrder({
                            ...order,
                            items: draftItems,
                            orderCategory: nextCat,
                          });
                        }}
                      >
                        طلبات
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant={
                          order.orderCategory === "fast" ? "default" : "outline"
                        }
                        className={`h-8 text-[10px] font-black border transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out active:scale-[0.97] ${
                          order.orderCategory === "fast"
                            ? "bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-800 shadow-sm"
                            : "text-emerald-700 border-emerald-200 hover:bg-emerald-50 bg-white"
                        }`}
                        onClick={() => {
                          const nextCat: ActiveOrder["orderCategory"] =
                            order.orderCategory === "talabat"
                              ? "normal"
                              : "talabat";
                          upsertOrder({
                            ...order,
                            items: draftItems,
                            orderCategory: nextCat,
                          });
                        }}
                      >
                        فاست (Fast)
                      </Button>
                    </div>
                  </div>
                )}

                {/* زر بدأ الطلب */}
                <div className="p-2 border-t border-stone-200 bg-white">
                  <Button
                    type="button"
                    onClick={() => handleSaveClick(tableCode)}
                    disabled={draftItems.length === 0 || isSubmitting}
                    className="
                    w-full
                    text-xs
                    font-black
                    h-9
                    rounded-lg
                    transition-[transform,background-color,border-color,box-shadow]
                    duration-150
                    ease-out
                    active:scale-[0.97]
                    border
                    shadow-sm
                    bg-emerald-800
                    hover:bg-emerald-900
                    border-emerald-900
                    text-white
                  "
                  >
                    بدأ
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {modifierMeal && (
            <ModifierDialog
              meal={modifierMeal}
              onCancel={() => setModifierMeal(null)}
              onConfirm={(extras, summary) => {
                addLine(modifierMeal, extras, summary);
                setModifierMeal(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 🌟 البوكس الجديد المخصص للتيك أواي 🌟 */}
      {takeawayConfirmOpen && (
        <Dialog
          open={takeawayConfirmOpen}
          onOpenChange={(o) => !o && setTakeawayConfirmOpen(false)}
        >
          <DialogContent
            dir="rtl"
            className="
            max-w-sm
            bg-white
            border
            border-stone-200
            shadow-2xl
          "
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-stone-900">
                <Printer className="w-5 h-5 text-emerald-700" />
                إنهاء وطباعة - تيك أواي
              </DialogTitle>
            </DialogHeader>

            {/* الفاتورة */}
            <div
              className="
              bg-white
              text-black
              border
              border-stone-300
              rounded-lg
              p-4
              font-mono
              text-xs
              space-y-1
              print:block
              shadow-sm
            "
            >
              {/* <div className="text-center font-bold text-sm">
                مراجعة الفاتورة
              </div>

              <div className="text-center">النوع: تيك أواي / دليفري</div>

              <hr className="border-dashed border-stone-300 my-2" />

              {draftItems.map((l) => (
                <div key={l.id} className="flex justify-between">
                  <span>
                    {l.name} ×{l.qty}
                  </span>

                  <span>
                    {fmt2(
                      (l.unitPrice +
                        l.extras.reduce((s, e) => s + e.price, 0)) *
                        l.qty,
                    )}
                  </span>
                </div>
              ))}

              <hr className="border-dashed border-stone-300 my-2" /> */}

              {/* حساب الإجماليات اللحظية */}
              {(() => {
                const twTotals = computeTotals(
                  draftItems,
                  takeawayDiscount,
                  order.taxPct,
                  order.orderCategory || "normal",
                );

                return (
                  <>
                    <div className="flex justify-between">
                      <span>المجموع</span>
                      <span>{fmt2(twTotals.subtotal)}</span>
                    </div>

                    {takeawayDiscount > 0 && (
                      <div className="flex justify-between text-red-600 font-bold">
                        <span>خصم {takeawayDiscount}%</span>
                        <span>-{fmt2(twTotals.discountValue)}</span>
                      </div>
                    )}

                    {twTotals.commissionValue > 0 && (
                      <div className="flex justify-between text-amber-600">
                        <span>عمولة المنصة</span>
                        <span>+{fmt2(twTotals.commissionValue)}</span>
                      </div>
                    )}

                    {takeawayDeliveryFee > 0 && (
                      <div className="flex justify-between text-blue-600">
                        <span>مصاريف التوصيل</span>
                        <span>+{fmt2(takeawayDeliveryFee)}</span>
                      </div>
                    )}

                    <div className="flex justify-between font-bold text-sm border-t border-stone-800 pt-1">
                      <span>الإجمالي</span>
                      <span>{fmt2(twTotals.total + takeawayDeliveryFee)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
            {/* نوع الطباعة - للطباعة فقط ولا يتم حفظه في الداتا بيز */}
            <div className="space-y-2 no-print">
              <label className="text-sm font-black text-stone-800">
                نوع الأوردر
              </label>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={() => setTakeawayOrderType("takeaway")}
                  className={`
        h-11
        rounded-xl
        border-2
        font-black
        text-sm
        transition-all
        duration-150
        active:scale-[0.97]
        ${
          takeawayOrderType === "takeaway"
            ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-md ring-2 ring-emerald-200"
            : "bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-200"
        }
      `}
                >
                  🛍️ تيك أواي
                </Button>

                <Button
                  type="button"
                  onClick={() => setTakeawayOrderType("delivery")}
                  className={`
        h-11
        rounded-xl
        border-2
        font-black
        text-sm
        transition-all
        duration-150
        active:scale-[0.97]
        ${
          takeawayOrderType === "delivery"
            ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-700 shadow-md ring-2 ring-blue-200"
            : "bg-white hover:bg-blue-50 text-blue-800 border-blue-200"
        }
      `}
                  disabled={true}
                >
                  🛵 ديلفري
                </Button>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 no-print">
                <label className="text-xs font-bold w-16 text-stone-700">
                  خصم %
                </label>

                <Input
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={
                    pendingTakeawayDiscount !== null
                      ? pendingTakeawayDiscount
                      : takeawayDiscount === 0
                        ? ""
                        : takeawayDiscount
                  }
                  onChange={(e) => {
                    const val = e.target.value;

                    if (val === "") {
                      setPendingTakeawayDiscount("" as any);
                    } else {
                      setPendingTakeawayDiscount(clamp0(parseFloat(val) || 0));
                    }
                  }}
                  className="
                  h-8
                  w-24
                  bg-stone-50
                  border
                  border-stone-300
                  focus-visible:border-emerald-600
                  focus-visible:ring-2
                  focus-visible:ring-emerald-100
                "
                />

                {pendingTakeawayDiscount !== null &&
                  pendingTakeawayDiscount !== takeawayDiscount && (
                    <ActionGate
                      requiredRole="محاسب"
                      actionName="تطبيق نسبة الخصم"
                      onSuccess={(employee) => {
                        setTakeawayDiscount(pendingTakeawayDiscount);

                        toast.success(
                          `تم تطبيق خصم ${pendingTakeawayDiscount}% بواسطة: ${employee.name} 🛡️`,
                        );

                        setPendingTakeawayDiscount(null);
                      }}
                    >
                      <Button
                        size="sm"
                        className="
                        bg-emerald-700
                        hover:bg-emerald-800
                        text-white
                        font-bold
                        transition-[transform,background-color]
                        duration-100
                        active:scale-95
                      "
                      >
                        تطبيق
                      </Button>
                    </ActionGate>
                  )}
              </div>

              <div className="flex items-center gap-2 no-print">
                <label className="text-xs font-bold w-16 text-stone-700">
                  توصيل
                </label>

                <Input
                  type="number"
                  min="0"
                  value={takeawayDeliveryFee === 0 ? "" : takeawayDeliveryFee}
                  onChange={(e) =>
                    setTakeawayDeliveryFee(
                      e.target.value === ""
                        ? ("" as any)
                        : Number(e.target.value),
                    )
                  }
                  placeholder="0"
                  className="
                  h-8
                  w-24
                  bg-stone-50
                  border
                  border-stone-300
                  focus-visible:border-emerald-600
                  focus-visible:ring-2
                  focus-visible:ring-emerald-100
                "
                />

                <span className="text-xs text-stone-500 font-bold">
                  ج.م (للدليفري)
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2 no-print mt-2">
              <Button
                variant="outline"
                onClick={() => setTakeawayConfirmOpen(false)}
                disabled={isSubmitting}
                className="
                border
                border-stone-300
                text-stone-700
                bg-white
                hover:bg-stone-50
                transition-[transform,background-color,border-color]
                duration-100
                active:scale-[0.97]
              "
              >
                إلغاء
              </Button>

              <Button
                onClick={executeTakeawaySave}
                disabled={isSubmitting}
                className={`
    gap-2
    text-white
    font-black
    px-6
    border
    transition-[transform,background-color]
    duration-150
    active:scale-[0.97]
    ${
      takeawayOrderType === "delivery"
        ? "bg-blue-700 hover:bg-blue-800 border-blue-800"
        : "bg-emerald-800 hover:bg-emerald-900 border-emerald-900"
    }
  `}
              >
                {isSubmitting ? (
                  "جاري..."
                ) : takeawayOrderType === "delivery" ? (
                  <>
                    <Printer className="w-4 h-4" />
                    حفظ الدليفري 🛵
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    حفظ وطباعة وإنهاء 🛍️
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${bold ? "text-base font-bold pt-1 border-t border-border" : "text-muted-foreground"}`}
    >
      <span>{label}</span>
      <span>{value} ج.م</span>
    </div>
  );
}

function ModifierDialog({
  meal,
  onCancel,
  onConfirm,
}: {
  meal: Meal;
  onCancel: () => void;
  onConfirm: (
    extras: { label: string; price: number }[],
    summary: string,
  ) => void;
}) {
  const groups = meal.modifierGroups || [];
  const [picks, setPicks] = useState<Record<string, string>>({});
  function confirm() {
    const extras: { label: string; price: number }[] = [];
    const parts: string[] = [];
    for (const g of groups) {
      const oid = picks[g.id];
      if (!oid && g.required) return toast.error(`اختر من ${g.name}`);
      if (!oid) continue;
      const opt = g.options.find((o) => o.id === oid)!;
      extras.push({ label: `${g.name}: ${opt.label}`, price: opt.extraPrice });
      parts.push(opt.label);
    }
    onConfirm(extras, parts.join(" • "));
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{meal.name} — الخيارات والإضافات</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-auto">
          {groups.map((g: ModifierGroup) => (
            <div key={g.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">
                  {g.name}{" "}
                  {g.required && (
                    <span className="text-destructive text-xs">*مطلوب</span>
                  )}
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {g.options.map((o) => {
                  const sel = picks[g.id] === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => setPicks((p) => ({ ...p, [g.id]: o.id }))}
                      className={`px-3 py-2 rounded-lg border text-sm flex items-center justify-between ${sel ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
                    >
                      <span>{o.label}</span>
                      {o.extraPrice > 0 && (
                        <span className="text-xs">+{fmt2(o.extraPrice)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            إلغاء
          </Button>
          <Button onClick={confirm}>إضافة للسلة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function TransferDialog({
  sourceTable,
  onClose,
}: {
  sourceTable: string;
  onClose: () => void;
}) {
  const { db: pos, transferItems } = usePosDB();

  // 🌟 التعديل 2: ثبتنا الطاولة المنقول منها (from) بالـ sourceTable ومفيش setFrom لأنها مقفولة
  const [from] = useState(sourceTable);
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [showList, setShowList] = useState(false);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [isTransferring, setIsTransferring] = useState(false);

  // 🌟 التعديل: إرجاع قائمة الطاولات مع عرض اسم الشخص إذا كانت الطاولة مفتوحة في منطقة others
  const allTables = useMemo(() => {
    const cTables = Array.from({ length: 70 }, (_, i) => `C${i + 1}`);
    const oTables = Array.from({ length: 70 }, (_, i) => `O${i + 1}`);
    const smallTables = Array.from({ length: 30 }, (_, i) => `ص${i + 1}`);
    const largeTables = Array.from({ length: 70 }, (_, i) => `ك${i + 1}`);
    const kidsTables = Array.from({ length: 20 }, (_, i) => `K${i + 1}`);

    // 🌟 فحص طاولات others المفتوحة فقط وجلب اسم الموظف (مثلاً: يوسف)
    const othersTables = Array.from({ length: 50 }, (_, i) => {
      const code = `X${i + 1}`;
      const order = pos.orders[code] as any;
      // لو الطاولة مفتوحة وفيها اسم شخص، نعرض الاسم بجانب الكود
      if (order && order.customerName) {
        return `${code} - (${order.customerName})`;
      }
      return code;
    });

    return [
      ...cTables,
      ...oTables,
      ...smallTables,
      ...largeTables,
      ...kidsTables,
      ...othersTables, // 👈 أضفنا others للقائمة بنفس الطريقة
    ];
  }, [pos.orders]);

  const filteredTables = allTables.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase()),
  );

  const src = from ? pos.orders[from.trim()] : null;

  async function doTransfer() {
    const rawInput = to.trim();

    if (!rawInput) {
      return toast.error("أدخل الطاولة أو اسم الشخص المنقول إليه");
    }

    // =========================================================
    // 1. استخراج كود الطاولة لو المستخدم اختار من القائمة
    //    مثال:
    //    X5 - (أحمد)  → X5
    // =========================================================

    const selectedCode = rawInput.split(" - ")[0].trim().toUpperCase();

    const allTableCodes = new Set(
      allTables.map((table) => table.split(" - ")[0].trim().toUpperCase()),
    );

    let targetCode = selectedCode;
    let targetCustomerName: string | undefined;
    let targetOrderCategory: ActiveOrder["orderCategory"] | undefined;

    // =========================================================
    // 2. لو المستخدم كتب اسم شخص موجود بالفعل في Other
    //    مثال: أحمد
    //    ولو X3 فيه customerName = أحمد
    //    نستخدم X3 بدل ما نعمل X جديد
    // =========================================================

    const normalizedInput = rawInput.trim().toLowerCase();

    const existingOtherEntry = Object.entries(pos.orders).find(
      ([code, order]) => {
        if (!/^X\d+$/i.test(code)) return false;

        const customerName = String((order as any)?.customerName || "")
          .trim()
          .toLowerCase();

        return customerName === normalizedInput;
      },
    );

    if (existingOtherEntry) {
      targetCode = existingOtherEntry[0];

      targetCustomerName = String(
        (existingOtherEntry[1] as any)?.customerName || rawInput,
      ).trim();

      targetOrderCategory = (existingOtherEntry[1] as any)?.orderCategory;
    }

    // =========================================================
    // 3. لو الكود فعلاً طاولة موجودة في النظام
    // =========================================================
    else if (allTableCodes.has(selectedCode)) {
      targetCode = selectedCode;

      const existingOrder = pos.orders[targetCode];

      if (existingOrder?.zone === "others") {
        targetCustomerName = existingOrder.customerName;
        targetOrderCategory = existingOrder.orderCategory;
      }
    }

    // =========================================================
    // 4. لو المستخدم كتب اسم جديد مش طاولة موجودة
    //    نجيب أول X فاضية
    // =========================================================
    else {
      const freeOtherCode = Array.from(
        { length: 50 },
        (_, i) => `X${i + 1}`,
      ).find((code) => !pos.orders[code]);

      if (!freeOtherCode) {
        return toast.error("لا توجد طاولة Other فارغة حالياً");
      }

      targetCode = freeOtherCode;
      targetCustomerName = rawInput;

      // نفس النظام المستخدم عند فتح Other يدوياً
      targetOrderCategory = "normal";
    }

    // =========================================================
    // 5. ممنوع التحويل لنفس الطاولة
    // =========================================================

    if (from.trim().toUpperCase() === targetCode) {
      return toast.error("لا يمكن التحويل لنفس الطاولة!");
    }

    // =========================================================
    // 6. الأصناف المختارة
    // =========================================================

    const itemsToMove = Object.entries(picks).map(([id, qty]) => ({
      id,
      qty,
    }));

    if (itemsToMove.length === 0) {
      return toast.error("اختر أصنافاً للنقل");
    }

    // =========================================================
    // 7. التنفيذ
    // =========================================================

    setIsTransferring(true);

    const r = await transferItems(
      from.trim(),
      targetCode,
      itemsToMove,
      "dining",
      {
        customerName: targetCustomerName,
        orderCategory: targetOrderCategory,
      },
    );

    setIsTransferring(false);

    if (!r.ok) {
      return toast.error((r as any).error || "فشل نقل الأصناف");
    }

    toast.success(
      targetCustomerName
        ? `تم نقل الأصناف إلى Other - ${targetCustomerName}`
        : `تم نقل الأصناف بنجاح إلى ${targetCode}`,
    );

    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-w-2xl bg-stone-50 border-stone-200"
      >
        <DialogHeader>
          <DialogTitle className="text-stone-800">
            تحويل أصناف من طاولة ({sourceTable})
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-500">
              المنقول منها (ثابتة)
            </label>
            {/* 🌟 التعديل 4: قفلنا حقل الإدخال ده تماماً (disabled) */}
            <Input
              value={from}
              disabled
              className="bg-stone-100 text-stone-700 font-bold cursor-not-allowed border-stone-200"
            />
            {src && (
              <>
                <div className="flex items-center gap-3 mb-2 px-2 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                  <input
                    type="checkbox"
                    className="w-5 h-5 cursor-pointer accent-emerald-700"
                    checked={
                      !!src &&
                      src.items.length > 0 &&
                      src.items.every((item) => picks[item.id] !== undefined)
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        const allPicks: Record<string, number> = {};

                        src.items.forEach((item) => {
                          allPicks[item.id] = item.qty;
                        });

                        setPicks(allPicks);
                      } else {
                        setPicks({});
                      }
                    }}
                  />

                  <span className="font-bold text-emerald-800 cursor-pointer">
                    تحديد كل الأصناف
                  </span>
                </div>
                <div className="border border-stone-200 rounded-lg max-h-60 overflow-auto p-2 bg-white">
                  {src.items.map((l) => {
                    const isSelected = picks[l.id] !== undefined;
                    return (
                      <div
                        key={l.id}
                        className={`flex items-center gap-2 border-b border-stone-100 py-2 text-sm transition-colors ${
                          isSelected ? "bg-emerald-50/70" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          className="w-4 h-4 cursor-pointer accent-emerald-700"
                          onChange={(e) => {
                            if (e.target.checked)
                              setPicks((prev) => ({ ...prev, [l.id]: l.qty }));
                            else
                              setPicks((prev) => {
                                const n = { ...prev };
                                delete n[l.id];
                                return n;
                              });
                          }}
                        />
                        <span className="flex-1 font-medium text-stone-700">
                          {l.name}
                        </span>
                        {isSelected && (
                          <div className="flex items-center gap-1 bg-white border border-emerald-200 rounded px-2 shadow-sm">
                            <button
                              className="w-6 h-6 flex items-center justify-center hover:bg-emerald-50 text-stone-700 rounded font-bold transition-colors"
                              onClick={() =>
                                setPicks((p) => ({
                                  ...p,
                                  [l.id]: Math.min(l.qty, (p[l.id] || 0) + 1),
                                }))
                              }
                            >
                              +
                            </button>
                            <span className="w-6 text-center font-bold text-emerald-700">
                              {picks[l.id]}
                            </span>
                            <button
                              className="w-6 h-6 flex items-center justify-center hover:bg-emerald-50 text-stone-700 rounded font-bold transition-colors"
                              onClick={() =>
                                setPicks((p) => ({
                                  ...p,
                                  [l.id]: Math.max(1, (p[l.id] || 0) - 1),
                                }))
                              }
                            >
                              -
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2 relative">
            <label className="text-xs font-bold text-emerald-700">
              إلى الطاولة (الجديدة)
            </label>
            <Input
              value={search}
              placeholder="ابحث واختر طاولة (مثال: C5)..."
              onChange={(e) => {
                setSearch(e.target.value);
                setTo(e.target.value.toUpperCase());
                setShowList(true);
              }}
              onFocus={() => setShowList(true)}
              className="border-stone-300 text-stone-800 focus-visible:ring-emerald-600 focus-visible:border-emerald-600"
            />
            {showList && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-md shadow-lg max-h-48 overflow-auto">
                {filteredTables.length === 0 ? (
                  <div className="p-3 text-center text-sm text-stone-400">
                    لا توجد طاولات مطابقة
                  </div>
                ) : (
                  filteredTables.map((t) => (
                    <div
                      key={t}
                      className="p-2 cursor-pointer hover:bg-emerald-50 hover:text-emerald-700 text-stone-700 font-medium text-sm border-b border-stone-100 transition-colors"
                      onClick={() => {
                        setTo(t);
                        setSearch(t);
                        setShowList(false);
                      }}
                    >
                      طاولة {t}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isTransferring}
            className="border-stone-300 text-stone-600 hover:bg-stone-100"
          >
            إلغاء
          </Button>
          <Button
            onClick={doTransfer}
            disabled={isTransferring}
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            {isTransferring ? "جاري التحويل..." : "تنفيذ التحويل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrintDialog({
  tableCode,
  order,
  onClose,
  onPrinted,
}: {
  tableCode: string;
  order: ActiveOrder;
  onClose: () => void;
  onPrinted: () => void;
}) {
  const { upsertOrder } = usePosDB();
  const [discount, setDiscount] = useState(order.discountPct);
  const [pinOpen, setPinOpen] = useState(false);
  const [pendingDiscount, setPendingDiscount] = useState<number | null>(null);
  const totals = computeTotals(order.items, discount, order.taxPct);

  function requestDiscount(v: number) {
    if (v === order.discountPct) {
      setDiscount(v);
      return;
    }
    setPendingDiscount(v);
    setPinOpen(true);
  }
  function doPrint() {
    // 1. تحديث الأوردر بالخصم والحالة الجديدة
    const updatedOrder = { ...order, discountPct: discount, state: "printed" };

    // 2. حساب المجاميع عشان تتبعت للطباعة صح
    const printData = {
      ...updatedOrder,
      subtotal: totals.subtotal,
      discountValue: totals.discountValue,
      taxValue: totals.taxValue,
      total: totals.total,
    };

    upsertOrder(updatedOrder as any);

    // 3. استدعاء الطباعة كـ "بون مبدئي" (false)
    triggerPrint(printData, false);

    onPrinted();
  }
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" /> طباعة الفاتورة
            </DialogTitle>
          </DialogHeader>
          <div className="bg-white text-black rounded p-4 font-mono text-xs space-y-1 print:block">
            <div className="text-center font-bold text-sm">فاتورة</div>
            <div className="text-center">
              {order.zone === "takeaway" ? "تيك أواي" : `طاولة: ${tableCode}`}
            </div>
            <hr className="border-dashed border-black my-2" />
            {order.items.map((l) => (
              <div key={l.id} className="flex justify-between">
                <span>
                  {l.name} ×{l.qty}
                </span>
                <span>
                  {fmt2(
                    (l.unitPrice + l.extras.reduce((s, e) => s + e.price, 0)) *
                      l.qty,
                  )}
                </span>
              </div>
            ))}
            <hr className="border-dashed border-black my-2" />
            <div className="flex justify-between">
              <span>المجموع</span>
              <span>{fmt2(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>خصم {discount}%</span>
              <span>{fmt2(totals.discountValue)}</span>
            </div>
            <div className="flex justify-between">
              <span>ضريبة {order.taxPct}%</span>
              <span>{fmt2(totals.taxValue)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm border-t border-black pt-1">
              <span>الإجمالي</span>
              <span>{fmt2(totals.total)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 no-print">
            <label className="text-xs">خصم %</label>
            <Input
              type="number"
              step="any"
              min="0"
              max="100"
              value={
                pendingDiscount !== null
                  ? pendingDiscount
                  : discount === 0
                    ? ""
                    : discount
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setPendingDiscount("" as any);
                } else {
                  setPendingDiscount(clamp0(parseFloat(val) || 0));
                }
              }}
              className="h-8 w-24"
            />
            {pendingDiscount !== null && pendingDiscount !== discount && (
              /* 🌟 لفينا زرار "تطبيق" بالـ ActionGate بتاعك مباشرة */
              <ActionGate
                requiredRole="محاسب"
                actionName="تطبيق نسبة الخصم"
                onSuccess={(employee) => {
                  // عند نجاح البصمة وتأكيد صلاحية (محاسب فما فوق)
                  setDiscount(pendingDiscount);
                  upsertOrder({ ...order, discountPct: pendingDiscount });
                  toast.success(
                    `تم تطبيق خصم ${pendingDiscount}% بواسطة: ${employee.name} 🛡️`,
                  );
                  setPendingDiscount(null);
                }}
              >
                <Button size="sm">تطبيق</Button>
              </ActionGate>
            )}
          </div>

          <DialogFooter className="gap-2 no-print">
            <Button variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button onClick={doPrint} className="gap-2">
              <Printer className="w-4 h-4" /> طباعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CheckoutDialog({
  tableCode,
  order,
  onClose,
  onDone,
}: {
  tableCode: string;
  order: ActiveOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const { db, deductSubStock } = useDB();
  const { db: pos, addInvoice, incCustomerOrders } = usePosDB();

  type PaymentMethod = "cash" | "visa" | "wallet" | "mixed";

  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  const [cashAmount, setCashAmount] = useState(0);
  const [visaAmount, setVisaAmount] = useState(0);
  const [walletAmount, setWalletAmount] = useState(0);

  const submittingRef = useRef(false);

  const currentOrder = pos.orders[tableCode] || order;

  const isTakeaway =
    currentOrder.zone === "takeaway" ||
    tableCode === "تيك أواي" ||
    currentOrder.tableCode === "تيك أواي" ||
    String(tableCode || "")
      .toUpperCase()
      .startsWith("T") ||
    String(currentOrder.tableCode || "")
      .toUpperCase()
      .startsWith("T");

  const deliveryPrice = Number((currentOrder as any).deliveryPrice) || 0;

  const totals = computeTotals(
    currentOrder.items,
    currentOrder.discountPct || 0,
    isTakeaway ? 0 : (currentOrder as any).taxPct || 14,
  );

  const finalTotal = round2(Number(totals.total || 0) + deliveryPrice);

  const paidAmount = round2(
    Number(cashAmount || 0) +
      Number(visaAmount || 0) +
      Number(walletAmount || 0),
  );

  const remainingAmount = round2(Math.max(0, finalTotal - paidAmount));

  const changeAmount = round2(Math.max(0, paidAmount - finalTotal));

  const isPaymentValid = paidAmount >= finalTotal;

  function setCashPayment() {
    setPaymentMethod("cash");
    setCashAmount(finalTotal);
    setVisaAmount(0);
    setWalletAmount(0);
  }

  function setVisaPayment() {
    setPaymentMethod("visa");
    setCashAmount(0);
    setVisaAmount(finalTotal);
    setWalletAmount(0);
  }

  function setWalletPayment() {
    setPaymentMethod("wallet");
    setCashAmount(0);
    setVisaAmount(0);
    setWalletAmount(finalTotal);
  }

  function updateCash(value: number) {
    setPaymentMethod("mixed");
    setCashAmount(Math.max(0, Number(value) || 0));
  }

  function updateVisa(value: number) {
    setPaymentMethod("mixed");
    setVisaAmount(Math.max(0, Number(value) || 0));
  }

  function updateWallet(value: number) {
    setPaymentMethod("mixed");
    setWalletAmount(Math.max(0, Number(value) || 0));
  }

  useEffect(() => {
    if (!cashAmount && !visaAmount && !walletAmount) {
      setCashAmount(finalTotal);
      setVisaAmount(0);
      setWalletAmount(0);
      setPaymentMethod("cash");
    }
  }, [finalTotal]);

  function deductInventory() {
    const perDept: Record<string, Record<string, number>> = {};

    for (const line of currentOrder.items) {
      const meal = db.meals.find((m) => m.id === line.mealId);

      if (!meal || meal.category === SHISHA_CATEGORY) {
        continue;
      }

      const dept = meal.department;

      if (!perDept[dept]) {
        perDept[dept] = {};
      }

      const baseIngredients = expandMealToBase(meal, db.meals, db.items);

      for (const [itemId, info] of baseIngredients) {
        const baseQty = round2(clamp0(info.qty * line.qty));

        if (baseQty <= 0) continue;

        perDept[dept][itemId] = (perDept[dept][itemId] || 0) + baseQty;
      }
    }

    for (const [deptName, itemsMap] of Object.entries(perDept)) {
      const arr = Object.entries(itemsMap).map(([itemId, baseQty]) => ({
        itemId,
        baseQty,
      }));

      deductSubStock(deptName as SubDept, arr);
    }
  }

  async function finalize() {
    if (submittingRef.current) {
      console.warn("⚠️ FINALIZE blocked: already submitting");
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const todayStr = new Date().toISOString().split("T")[0];

      const isOthers = currentOrder.zone === "others";

      let computedType = isTakeaway
        ? deliveryPrice > 0
          ? "delivery"
          : "takeaway"
        : "dinein";

      if (isOthers) {
        computedType = currentOrder.orderCategory || "staff";
      }

      const currentTotals = computeTotals(
        currentOrder.items,
        currentOrder.discountPct || 0,
        isTakeaway ? 0 : (currentOrder as any).taxPct || 14,
      );

      const totalWithDelivery = round2(
        Number(currentTotals.total || 0) + deliveryPrice,
      );

      const isSecCashier =
        localStorage.getItem("isSecCashierDevice") === "true";

      const secName = localStorage.getItem("secCashierName") || "كاشير فرعي";

      const currentCashierName = isSecCashier
        ? secName
        : pos.shift?.cashierName;

      const currentCashierId = isSecCashier
        ? localStorage.getItem("secCashierId")
        : pos.shift?.cashierId;

      const deviceRes = await fetch(`http://${API_URL}:5000/api/device-check`, {
        cache: "no-store",
      });

      if (!deviceRes.ok) {
        throw new Error("فشل تحديد نوع الجهاز");
      }

      const device = await deviceRes.json();

      const currentTerminalId = device.terminalId || "Main";

      const inv: any = {
        id:
          (currentOrder as any).invoiceRequestId ||
          `inv_${tableCode}_${currentOrder.openedAt || crypto.randomUUID()}`,

        type: computedType,

        tableCode: tableCode || currentOrder.tableCode,

        zone: currentOrder.zone || (isTakeaway ? "takeaway" : "dine-in"),

        customerName: currentOrder.customerName || null,

        customerAddress: currentOrder.customerAddress || null,

        customerPhone:
          (currentOrder as any).customerPhone ||
          (currentOrder as any).phone ||
          null,

        cashierId: currentCashierId || null,

        cashierName: currentCashierName || null,

        captainName: (order as any).captainName || null,

        items: currentOrder.items,

        subtotal: currentTotals.subtotal,

        discountPct: currentOrder.discountPct || 0,

        discountValue: currentTotals.discountValue,

        taxPct: currentTotals.taxPct,

        taxValue: currentTotals.taxValue,

        deliveryPrice,

        total: totalWithDelivery,

        createdAt: Date.now(),

        terminalId: currentTerminalId,

        createdBy: currentCashierName || "كاشير رئيسي",
      };

      const savedInvoice = await addInvoice(inv);

      if (!savedInvoice || !savedInvoice.id) {
        throw new Error("لم يتم استلام الفاتورة الرسمية من السيرفر");
      }

      const salesByDept: Record<string, any[]> = {};

      currentOrder.items.forEach((item: any) => {
        const meal = db.meals.find((m) => m.id === item.mealId);

        const dept = meal?.department || item.department || "عام";

        if (!salesByDept[dept]) {
          salesByDept[dept] = [];
        }

        salesByDept[dept].push(item);
      });

      for (const [deptName, deptLines] of Object.entries(salesByDept)) {
        const lines = deptLines as any[];

        if (lines.length === 0) {
          continue;
        }

        const totalSales = lines.reduce(
          (sum: number, line: any) =>
            sum +
            Number(line.unitPrice ?? line.price ?? 0) * Number(line.qty || 0),
          0,
        );

        let totalCost = 0;

        const historicalLines = lines.map((line: any) => {
          const meal = db.meals.find((m) => m.id === line.mealId);

          let costPerUnit = Number(line.costPerUnit);

          if (!Number.isFinite(costPerUnit) || costPerUnit < 0) {
            if (meal) {
              const baseDeds = expandMealToBase(meal, db.meals, db.items);

              costPerUnit = 0;

              for (const [, info] of baseDeds) {
                costPerUnit += info.cost;
              }

              costPerUnit = round2(clamp0(costPerUnit));
            } else {
              costPerUnit = 0;
            }
          }

          const qty = Number(line.qty || 0);

          totalCost += costPerUnit * qty;

          const sellingPrice = Number(
            line.unitPrice ?? line.price ?? meal?.sellingPrice ?? 0,
          );

          return {
            ...line,
            unitPrice: sellingPrice,
            price: sellingPrice,
            costPerUnit,
            department: line.department || meal?.department || deptName,
            name: line.name || meal?.name || `صنف ${line.mealId}`,
          };
        });

        const newSale = {
          id: `sale_${savedInvoice.id}_${deptName}`,

          date: todayStr,

          department: deptName,

          lines: historicalLines,

          totalSales: round2(clamp0(totalSales)),

          totalCost: round2(clamp0(totalCost)),

          createdAt: Date.now(),
        };

        const salesResponse = await fetch(`http://${API_URL}:5000/api/sales`, {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(newSale),
        });

        if (!salesResponse.ok) {
          const errorText = await salesResponse.text().catch(() => "");

          throw new Error(
            `فشل تسجيل المبيعات للقسم ${deptName} - HTTP ${salesResponse.status}${
              errorText ? ` - ${errorText}` : ""
            }`,
          );
        }
      }

      await Promise.resolve(deductInventory());

      triggerPrint(savedInvoice, true);

      if (currentOrder.customerId) {
        await Promise.resolve(incCustomerOrders(currentOrder.customerId));
      }

      onDone();

      toast.success(
        `✅ تم إنهاء الفاتورة رقم ${savedInvoice.invoiceNumber} بنجاح`,
      );
    } catch (error: any) {
      console.error("❌ FINALIZE FAILED:", error);

      toast.error(error?.message || "حدث خطأ أثناء إنهاء الفاتورة");
    } finally {
      submittingRef.current = false;

      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            تأكيد الإنهاء والدفع
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p>
            سيتم إنهاء طلب{" "}
            <strong>
              {currentOrder.zone === "takeaway" ? "تيك أواي" : tableCode}
            </strong>{" "}
            وخصم الكميات من المخزن الفرعي.
          </p>

          <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
            <Row label="المجموع" value={fmt2(totals.subtotal)} />

            <Row label="الخصم" value={fmt2(totals.discountValue)} />

            <Row label="الضريبة" value={fmt2(totals.taxValue)} />

            {totals.commissionValue > 0 && (
              <Row
                label="نسبة المنصة (+5%)"
                value={fmt2(totals.commissionValue)}
              />
            )}

            {deliveryPrice > 0 && (
              <Row label="التوصيل" value={fmt2(deliveryPrice)} />
            )}

            <Row label="الإجمالي" value={fmt2(finalTotal)} bold />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            إلغاء
          </Button>

          {!confirmed && !isTakeaway ? (
            <Button
              variant="destructive"
              onClick={() => setConfirmed(true)}
              disabled={isSubmitting || !isPaymentValid}
            >
              إنهاء ودفع
            </Button>
          ) : (
            <Button
              variant={isPaymentValid ? "default" : "destructive"}
              onClick={finalize}
              disabled={isSubmitting || !isPaymentValid}
              className="font-bold px-6"
            >
              {isSubmitting ? "جاري التأكيد..." : "تأكيد نهائي"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 🌟 دالة الطباعة الذكية (بون مبدئي أو فاتورة نهائية) مدمجة مع التصميم الأنيق
export const triggerPrint = (data: any, isFinal: boolean = false) => {
  const printWindow = window.open("", "_blank", "width=400,height=600");
  if (!printWindow) return;

  // نجيب التاريخ من أي صيغة ممكنة
  const rawCreatedAt = data?.createdAt ?? data?.created_at;

  let createdAt: number;

  if (typeof rawCreatedAt === "number") {
    createdAt = rawCreatedAt;
  } else if (rawCreatedAt) {
    createdAt = new Date(rawCreatedAt).getTime();
  } else {
    createdAt = Date.now();
  }

  // حماية من أي تاريخ غير صالح
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    createdAt = Date.now();
  }

  const printData = {
    ...data,
    createdAt,
  };

  console.log("🖨️ PRINT TIME:", {
    rawCreatedAt,
    createdAt,
    local: new Date(createdAt).toString(),
    iso: new Date(createdAt).toISOString(),
  });

  const html = buildInvoiceHtml(printData, {
    includeKitchenBon: false,
  });

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};
export const triggerBarDiffPrint = (data: any) => {
  const printWindow = window.open("", "_blank", "width=400,height=600");

  if (!printWindow) return;

  const itemsArray =
    typeof data.items === "string"
      ? JSON.parse(data.items)
      : Array.isArray(data.items)
        ? data.items
        : [];

  if (itemsArray.length === 0) {
    printWindow.close();
    return;
  }

  const createdAt = data.createdAt || Date.now();

  const formattedDate = new Date(createdAt).toLocaleDateString("en-GB");

  const formattedTime = new Date(createdAt).toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const tableName = data.tableCode || data.customerName || "..........";

  const orderTypeArabic =
    data.type === "delivery"
      ? "توصيل 🛵"
      : data.type === "takeaway"
        ? "تيك أواي 🛍️"
        : "صالة 🍽️";

  const html = `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />

        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
            font-family: Arial, sans-serif;
            direction: rtl;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .receipt {
            width: 80mm;
            padding: 6px 4px;
          }

          .center {
            text-align: center;
          }

          .brand {
            font-size: 20px;
            font-weight: 900;
            margin-bottom: 4px;
          }

          .title {
            border: 2px solid #000;
            border-radius: 5px;
            padding: 4px;
            font-size: 16px;
            font-weight: 900;
            margin-bottom: 6px;
          }

          .meta {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            font-weight: 700;
            margin-bottom: 5px;
          }

          .line {
            border-top: 1px dashed #000;
            margin: 5px 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }

          th,
          td {
            padding: 5px 2px;
            text-align: center;
            font-size: 13px;
            font-weight: 700;
            border-bottom: 1px dashed #000;
          }

          th {
            font-size: 12px;
            font-weight: 900;
            border-bottom: 2px solid #000;
          }

          .qty {
            width: 25%;
            font-size: 15px;
            font-weight: 900;
          }

          .name {
            width: 75%;
            font-weight: 900;
            word-break: break-word;
          }

          .cancelled {
            background: #000;
            color: #fff;
          }

          .cancelled td {
            color: #fff;
            border-bottom-color: #fff;
          }

          .note {
            display: block;
            margin-top: 2px;
            font-size: 10px;
            font-weight: 700;
          }

          .footer {
            text-align: center;
            margin-top: 8px;
            font-size: 11px;
            font-weight: 900;
          }
        </style>
      </head>

      <body>
        <div class="receipt">

          <div class="brand center">
            Zayed Mall
          </div>

          <div class="title center">
            طلب بار
          </div>

          <div class="meta">
            <span>
              ${data.zoneName || data.zone || "-"}
            </span>

            <span>
              ${tableName}
            </span>
          </div>

          <div class="meta">
            <span>
              ${orderTypeArabic}
            </span>

            <span>
              ${formattedTime}
            </span>
          </div>

          <div class="meta">
            <span>
              ${formattedDate}
            </span>

            <span>
              تغيير بار
            </span>
          </div>

          <div class="line"></div>

          <table>
            <thead>
              <tr>
                <th class="qty">الكمية</th>
                <th class="name">الصنف</th>
              </tr>
            </thead>

            <tbody>
              ${itemsArray
                .map((item: any) => {
                  const cancelled = Number(item.diffQty) < 0;

                  const qty = Math.abs(Number(item.diffQty ?? item.qty ?? 0));

                  const name = item.name || item.mealName || "صنف غير معروف";

                  const note = item.notes || "";

                  return `
                    <tr class="${cancelled ? "cancelled" : ""}">
                      <td class="qty">
                        ${qty}
                      </td>

                      <td class="name">
                        ${name}

                        ${
                          note
                            ? `
                              <span class="note">
                                ملاحظة: ${note}
                              </span>
                            `
                            : ""
                        }

                        ${
                          cancelled
                            ? `
                              <span class="note">
                                ملغي
                              </span>
                            `
                            : ""
                        }
                      </td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>

          <div class="line"></div>

          <div class="footer">
            بالهنا والشفا 🍽️
          </div>

        </div>

        <script>
          window.onload = function () {
            setTimeout(function () {
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
// 🌟 نافذة تحويل الكابتن الذكية (بالبصمة للميكروس وبضغطة واحدة للكاشير)
function TransferCaptainDialog({
  tableCode,
  currentCaptain,
  onClose,
}: {
  tableCode: string;
  currentCaptain: string;
  onClose: () => void;
}) {
  const { db: pos, transferCaptain } = usePosDB();
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverEmployees, setServerEmployees] = useState<any[]>([]);
  const [isMicros] = useState(
    () => localStorage.getItem("isMicrosDevice") === "true",
  );

  // جلب الموظفين لضمان ظهور كل الكباتن في قائمة الكاشير
  useEffect(() => {
    if (isMicros) return;
    async function fetchEmps() {
      try {
        const res = await fetch(`http://${API_URL}:5000/api/employees`);
        if (res.ok) setServerEmployees(await res.json());
      } catch (e) {
        console.error(e);
      }
    }
    fetchEmps();
  }, [isMicros]);

  const captainsList = useMemo(() => {
    const map = new Map();
    if (pos.employees) {
      pos.employees.forEach((e) => {
        if (e.role === "كابتن صالة" || (e as any).role === "captain")
          map.set(e.name, e);
      });
    }
    if (serverEmployees) {
      serverEmployees.forEach((e) => {
        if (e.role === "كابتن صالة" || e.role === "captain") map.set(e.name, e);
      });
    }
    return Array.from(map.values()).filter((c) => c.name !== currentCaptain);
  }, [pos.employees, serverEmployees, currentCaptain]);

  // التحويل عن طريق إدخال بصمة الكابتن المستلم (لأجهزة الميكروس)
  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`http://${API_URL}:5000/api/pos/verify-captain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pin }),
      });
      const data = await res.json();

      if (data.success) {
        if (data.captainName === currentCaptain) {
          toast.error("هذا هو نفس الكابتن المسؤول عن الطاولة حالياً!");
          setIsSubmitting(false);
          return;
        }
        const r = await transferCaptain(tableCode, data.captainName);
        if (r.ok) {
          toast.success(
            `🎉 تم نقل عهدة الطاولة بنجاح إلى الكابتن: ${data.captainName}`,
          );
          onClose();
        }
      } else {
        toast.error(data.error || "رمز الكابتن غير صحيح");
      }
    } catch (err) {
      toast.error("خطأ في الاتصال بالسيرفر");
    } finally {
      setIsSubmitting(false);
    }
  }

  // التحويل المباشر بالضغط (لأجهزة الكاشير)
  async function handleDirectTransfer(newCapName: string) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const r = await transferCaptain(tableCode, newCapName);
    setIsSubmitting(false);
    if (r.ok) {
      toast.success(`🎉 تم نقل عهدة الطاولة بنجاح إلى الكابتن: ${newCapName}`);
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* 1. هنا خفت الـ max-w-md وخليت الأبعاد المباشرة 75vw و 75vh مع جعلها flex لتوزيع العناصر رأساً */}
      <DialogContent
        dir="rtl"
        className="w-[75vw] h-[75vh] max-w-none flex flex-col p-6"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <UserPlus className="w-5 h-5 text-primary" /> تحويل الطاولة (
            {tableCode}) لكابتن آخر
          </DialogTitle>
        </DialogHeader>

        <div className="bg-secondary/40 p-3 rounded-xl border border-border flex items-center justify-between text-sm shrink-0">
          <span className="text-muted-foreground font-medium">
            الكابتن المسؤول حالياً:
          </span>
          <span className="font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 px-2.5 py-1 rounded-md">
            {currentCaptain}
          </span>
        </div>

        {isMicros ? (
          <form
            autoComplete="off"
            onSubmit={handlePinSubmit}
            className="space-y-4 pt-2 flex-1 flex flex-col justify-center max-w-md mx-auto w-full"
          >
            <p className="text-xs text-muted-foreground text-center font-medium">
              يرجى من الكابتن الجديد المستلم للطاولة إدخال الرمز السري (PIN)
              للتأكيد والاستلام:
            </p>
            <Input
              type="password"
              inputMode="numeric"
              autoFocus
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="text-center text-2xl tracking-widest h-14 font-bold"
            />
            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                className="flex-1 font-bold"
                disabled={!pin || isSubmitting}
              >
                {isSubmitting
                  ? "جاري التحقق والنقل..."
                  : "تأكيد الاستلام والتحويل"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          /* 2. الـ container الرئيسي للكاشير بياخد باقي مساحة الارتفاع المتاحة بديناميكية */
          <div className="flex-1 flex flex-col space-y-3 pt-2 min-h-0">
            <p className="text-xs text-muted-foreground font-medium shrink-0">
              اختر اسم الكابتن الجديد الذي سيتم نقل الطاولة إلى عهدته:
            </p>

            {captainsList.length === 0 ? (
              <div className="text-center p-6 border rounded-xl bg-muted/30 text-xs text-muted-foreground flex-1 flex items-center justify-center">
                لا يوجد كباتن آخرون متاحون للتحويل حالياً.
              </div>
            ) : (
              /* 3. قمنا بإلغاء الارتفاع الثابت max-h-60 وجعلناه flex-1 ومطاطي مع إضافة Scroll ذكي وتوزيع الأزرار في شبكة متجاوبة */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 overflow-y-auto p-1 flex-1 content-start custom-scrollbar">
                {captainsList.map((cap) => (
                  <button
                    key={cap.id || cap.name}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleDirectTransfer(cap.name)}
                    className="p-4 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition flex items-center justify-center font-bold text-sm shadow-sm active:scale-95 h-16"
                  >
                    {cap.name}
                  </button>
                ))}
              </div>
            )}

            <DialogFooter className="pt-2 shrink-0">
              <Button variant="outline" onClick={onClose} className="w-full">
                إغلاق
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
