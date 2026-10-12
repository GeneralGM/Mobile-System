/* eslint-disable prettier/prettier */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Check,
  ChevronLeft,
  CircleDollarSign,
  History,
  Plus,
  ShoppingCart,
  Smartphone,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import SearchSelect from "../components/SearchSelect";
import type { Device } from "../types/device";
import type { WarehouseBatch } from "../types/warehouse";
import type { CartItem, Installment, Method, Sale } from "../types/sales";

export const Route = createFileRoute("/sales")({ component: SalesPage });

const DEVICES_KEY = "mobile-system-devices-v1";
const SALES_KEY = "mobile-system-sales-v1";
const WAREHOUSE_KEY = "mobile-system-warehouse-v1";

const INPUT_CLASS =
  "w-full rounded-xl border border-gray-400 bg-white px-3.5 py-3 text-sm font-medium text-gray-950 shadow-sm outline-none placeholder:text-gray-500 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/15 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";
const LABEL_CLASS = "mb-2 block text-sm font-semibold text-gray-900";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function numberText(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function invoiceNumber() {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `INV-${date}-${Math.random().toString(10).slice(2, 7).padEnd(5, "0")}`;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  result.setDate(
    Math.min(
      day,
      new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate(),
    ),
  );
  return result;
}

function dateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className={LABEL_CLASS}>{label}</label>
      {children}
    </div>
  );
}

type ModelOption = { brand: string; series: string; model: string };

function sameText(a: string | undefined, b: string | undefined) {
  return (
    String(a ?? "")
      .trim()
      .toLocaleLowerCase() ===
    String(b ?? "")
      .trim()
      .toLocaleLowerCase()
  );
}

// IMEIs stored on a batch represent units that must be sold by their exact serial.
// A blank-IMEI sale may only consume stock that has no remaining registered IMEI.
function trackedImeisInBatch(batch: WarehouseBatch, devices: Device[]) {
  const soldImeis = new Set(
    devices
      .filter(
        (device) =>
          device.status === "sold" && String(device.imei ?? "").trim(),
      )
      .map((device) => String(device.imei).trim().toLocaleLowerCase()),
  );
  const uniqueImeis = new Set(
    (Array.isArray(batch.imeis) ? batch.imeis : [])
      .map((imei) =>
        String(imei ?? "")
          .trim()
          .toLocaleLowerCase(),
      )
      .filter(Boolean),
  );
  return [...uniqueImeis].filter((imei) => !soldImeis.has(imei)).length;
}

function untrackedAvailableInBatch(
  batch: WarehouseBatch,
  devices: Device[],
  cart: CartItem[],
) {
  const alreadyAddedWithoutImei = cart.filter(
    (item) => item.warehouseBatchId === batch.id && !item.imei.trim(),
  ).length;
  return Math.max(
    0,
    (Number(batch.availableQuantity) || 0) -
      trackedImeisInBatch(batch, devices) -
      alreadyAddedWithoutImei,
  );
}

function SalesPage() {
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [batches, setBatches] = useState<WarehouseBatch[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [brand, setBrand] = useState("");
  const [series, setSeries] = useState("");
  const [model, setModel] = useState("");
  const [imeiInput, setImeiInput] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [paidInput, setPaidInput] = useState("");
  const [installmentCount, setInstallmentCount] = useState("6");
  const [notes, setNotes] = useState("");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDevices(readArray<Device>(DEVICES_KEY));
    setBatches(readArray<WarehouseBatch>(WAREHOUSE_KEY));
    setSales(readArray<Sale>(SALES_KEY));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeBatches = useMemo(
    () => batches.filter((batch) => Number(batch.availableQuantity) > 0),
    [batches],
  );

  const modelCatalog = useMemo<ModelOption[]>(() => {
    const entries: ModelOption[] = [];
    const seen = new Set<string>();
    const add = (b: string, s: string, m: string) => {
      const cleanBrand = b.trim();
      const cleanSeries = s.trim() || "عام";
      const cleanModel = m.trim();
      if (!cleanBrand || !cleanModel) return;
      const key = JSON.stringify([
        cleanBrand.toLocaleLowerCase(),
        cleanSeries.toLocaleLowerCase(),
        cleanModel.toLocaleLowerCase(),
      ]);
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({
          brand: cleanBrand,
          series: cleanSeries,
          model: cleanModel,
        });
      }
    };
    activeBatches.forEach((batch) =>
      add(batch.brand, batch.series, batch.model),
    );
    // Keep legacy, individually registered devices sellable even if they predate warehouse linking.
    devices
      .filter((device) => device.status === "available" && device.imei?.trim())
      .forEach((device) => {
        const hasMatchingBatch = activeBatches.some(
          (batch) =>
            sameText(batch.brand, device.brand) &&
            sameText(batch.series || "عام", device.series || "عام") &&
            sameText(batch.model, device.model),
        );
        if (!hasMatchingBatch)
          add(device.brand, device.series || "عام", device.model);
      });
    return entries.sort((a, b) =>
      `${a.brand} ${a.series} ${a.model}`.localeCompare(
        `${b.brand} ${b.series} ${b.model}`,
      ),
    );
  }, [activeBatches, devices]);

  const brands = useMemo(
    () =>
      [...new Set(modelCatalog.map((entry) => entry.brand))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [modelCatalog],
  );
  const seriesOptions = useMemo(() => {
    if (!brand) return [];
    return [
      ...new Set(
        modelCatalog
          .filter((entry) => sameText(entry.brand, brand))
          .map((entry) => entry.series),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [modelCatalog, brand]);
  const modelOptions = useMemo(() => {
    if (brand) {
      return [
        ...new Set(
          modelCatalog
            .filter(
              (entry) =>
                sameText(entry.brand, brand) &&
                (!series || sameText(entry.series, series)),
            )
            .map((entry) => entry.model),
        ),
      ].sort((a, b) => a.localeCompare(b));
    }
    // Model-first search remains easy to type; when the same model name belongs to multiple brands,
    // pickModel asks the user to choose the brand rather than guessing.
    return [...new Set(modelCatalog.map((entry) => entry.model))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [modelCatalog, brand, series]);

  const chosenBatches = useMemo(
    () =>
      batches
        .filter(
          (batch) =>
            Number(batch.availableQuantity) > 0 &&
            sameText(batch.brand, brand) &&
            sameText(batch.model, model) &&
            (!series || sameText(batch.series || "عام", series)),
        )
        .sort((a, b) => Number(a.receivedAt) - Number(b.receivedAt)),
    [batches, brand, model, series],
  );

  const availableCount = useMemo(() => {
    const batchQty = batches.reduce(
      (sum, batch) => sum + Math.max(0, Number(batch.availableQuantity) || 0),
      0,
    );
    const legacyQty = devices.filter((device) => {
      if (device.status !== "available" || !device.imei?.trim()) return false;
      if (
        device.warehouseBatchId &&
        batches.some((batch) => batch.id === device.warehouseBatchId)
      )
        return false;
      const hasStockBatch = batches.some(
        (batch) =>
          Number(batch.availableQuantity) > 0 &&
          sameText(batch.brand, device.brand) &&
          sameText(batch.series || "عام", device.series || "عام") &&
          sameText(batch.model, device.model),
      );
      return !hasStockBatch;
    }).length;
    return batchQty + legacyQty;
  }, [batches, devices]);

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum +
          (method === "installment"
            ? item.installmentFinalPrice
            : item.cashFinalPrice),
        0,
      ),
    [cart, method],
  );
  const paidAmount = method === "cash" ? cartTotal : Number(paidInput || 0);
  const remaining = Math.max(
    0,
    Math.round((cartTotal - paidAmount) * 100) / 100,
  );

  const installments = useMemo<Installment[]>(() => {
    const count = Math.floor(Number(installmentCount));
    if (method !== "installment" || count < 1 || count > 120 || remaining <= 0)
      return [];
    const each = Math.floor((remaining / count) * 100) / 100;
    let assigned = 0;
    const today = new Date();
    return Array.from({ length: count }, (_, index) => {
      const amount =
        index === count - 1
          ? Math.round((remaining - assigned) * 100) / 100
          : each;
      assigned += amount;
      return {
        number: index + 1,
        amount,
        dueDate: dateInput(addMonths(today, index + 1)),
        paid: false,
      };
    });
  }, [installmentCount, method, remaining]);

  function notify(message: string) {
    setToast(message);
  }

  function resetAddForm() {
    setBrand("");
    setSeries("");
    setModel("");
    setImeiInput("");
    setSelectedBatchId("");
  }

  function pickModel(value: string) {
    if (!brand) {
      const query = value.trim().toLocaleLowerCase();
      const exactModelMatches = modelCatalog.filter((entry) =>
        sameText(entry.model, value),
      );
      const matches = exactModelMatches.length
        ? exactModelMatches
        : modelCatalog.filter((entry) => {
            const brandAndModel =
              `${entry.brand} ${entry.model}`.toLocaleLowerCase();
            const fullName =
              `${entry.brand} ${entry.series} ${entry.model}`.toLocaleLowerCase();
            return brandAndModel.includes(query) || fullName.includes(query);
          });
      const distinct = matches.filter(
        (entry, index, all) =>
          all.findIndex(
            (candidate) =>
              sameText(candidate.brand, entry.brand) &&
              sameText(candidate.series, entry.series) &&
              sameText(candidate.model, entry.model),
          ) === index,
      );
      if (distinct.length === 1) {
        setBrand(distinct[0].brand);
        setSeries(distinct[0].series);
        setModel(distinct[0].model);
        setSelectedBatchId("");
        return;
      }
      setModel(value);
      if (distinct.length > 1)
        notify(
          "الموديل موجود لأكتر من ماركة أو سلسلة؛ اختار الماركة والسلسلة لتحديده بدقة.",
        );
      return;
    }
    setModel(value);
    setSelectedBatchId("");
    // If the selected model belongs to exactly one series under the selected brand, infer it automatically.
    if (!series) {
      const matchingSeries = [
        ...new Set(
          modelCatalog
            .filter(
              (entry) =>
                sameText(entry.brand, brand) && sameText(entry.model, value),
            )
            .map((entry) => entry.series),
        ),
      ];
      if (matchingSeries.length === 1) setSeries(matchingSeries[0]);
    }
  }

  function updateItemPrice(deviceId: string, rawValue: string) {
    if (rawValue.trim() === "") {
      setCart((current) =>
        current.map((item) =>
          item.deviceId === deviceId
            ? {
                ...item,
                cashFinalPrice: 0,
                installmentFinalPrice: 0,
                finalPrice: 0,
              }
            : item,
        ),
      );
      return;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) {
      notify("أدخل سعر بيع صحيح.");
      return;
    }
    const price = Math.round(value * 100) / 100;
    setCart((current) =>
      current.map((item) =>
        item.deviceId === deviceId
          ? {
              ...item,
              cashFinalPrice: price,
              installmentFinalPrice: price,
              finalPrice: price,
            }
          : item,
      ),
    );
  }

  function addDeviceToCart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanImei = imeiInput.trim();
    if (!brand.trim() || !model.trim()) {
      notify("اختار الماركة والموديل أولًا.");
      return;
    }

    const imeiKey = cleanImei.toLocaleLowerCase();
    if (
      cleanImei &&
      cart.some((item) => item.imei.trim().toLocaleLowerCase() === imeiKey)
    ) {
      notify("رقم IMEI ده موجود بالفعل في الفاتورة.");
      return;
    }

    const currentDevices = readArray<Device>(DEVICES_KEY);
    const matchingDevices = cleanImei
      ? currentDevices.filter(
          (device) =>
            String(device.imei ?? "")
              .trim()
              .toLocaleLowerCase() === imeiKey,
        )
      : [];
    if (matchingDevices.length > 1) {
      notify("رقم IMEI مكرر في سجلات الأجهزة؛ صحّح التكرار قبل البيع.");
      return;
    }
    const existingDevice = matchingDevices[0];
    if (existingDevice && existingDevice.status !== "available") {
      notify(
        existingDevice.status === "sold"
          ? "الجهاز ده اتباع بالفعل."
          : "الجهاز محجوز حاليًا ومش متاح للبيع.",
      );
      return;
    }
    if (
      existingDevice &&
      (!sameText(existingDevice.brand, brand) ||
        !sameText(existingDevice.model, model) ||
        (series && !sameText(existingDevice.series || "عام", series)))
    ) {
      notify(
        `رقم IMEI مسجل على ${existingDevice.brand} ${existingDevice.model}، وليس الموديل المختار.`,
      );
      return;
    }

    const allCurrentBatches = readArray<WarehouseBatch>(WAREHOUSE_KEY);
    const typedBatch = selectedBatchId
      ? allCurrentBatches.find((batch) => batch.id === selectedBatchId)
      : undefined;
    const imeiBatch = cleanImei
      ? allCurrentBatches.find(
          (batch) =>
            Array.isArray(batch.imeis) &&
            batch.imeis.some(
              (value) => value.trim().toLocaleLowerCase() === imeiKey,
            ),
        )
      : undefined;
    if (
      imeiBatch &&
      (!sameText(imeiBatch.brand, brand) ||
        !sameText(imeiBatch.model, model) ||
        (series && !sameText(imeiBatch.series || "عام", series)))
    ) {
      notify(
        `رقم IMEI ده مسجل ضمن شحنة ${imeiBatch.brand} ${imeiBatch.model}، راجع اختيار الموديل.`,
      );
      return;
    }

    let chosenBatch: WarehouseBatch | undefined;
    if (existingDevice?.warehouseBatchId) {
      chosenBatch = allCurrentBatches.find(
        (batch) => batch.id === existingDevice.warehouseBatchId,
      );
    }
    if (!chosenBatch && imeiBatch) chosenBatch = imeiBatch;
    if (!chosenBatch && typedBatch) chosenBatch = typedBatch;

    if (
      chosenBatch &&
      (!sameText(chosenBatch.brand, brand) ||
        !sameText(chosenBatch.model, model) ||
        (series && !sameText(chosenBatch.series || "عام", series)))
    ) {
      notify("الشحنة المختارة لا تطابق الماركة والموديل المحددين.");
      return;
    }

    const cartCounts = new Map<string, number>();
    cart.forEach((item) => {
      if (item.warehouseBatchId)
        cartCounts.set(
          item.warehouseBatchId,
          (cartCounts.get(item.warehouseBatchId) || 0) + 1,
        );
    });
    const currentAvailable = (batch: WarehouseBatch) =>
      Math.max(0, Number(batch.availableQuantity) || 0) -
      (cartCounts.get(batch.id) || 0);

    // Automatically assign the oldest batch only for stock-based sales. Existing
    // legacy devices without a batch must not accidentally deduct a second unit.
    if (!chosenBatch && !existingDevice) {
      const candidates = allCurrentBatches
        .filter(
          (batch) =>
            sameText(batch.brand, brand) &&
            sameText(batch.model, model) &&
            (!series || sameText(batch.series || "عام", series)) &&
            (cleanImei
              ? currentAvailable(batch) > 0
              : untrackedAvailableInBatch(batch, currentDevices, cart) > 0),
        )
        .sort((a, b) => Number(a.receivedAt) - Number(b.receivedAt));
      chosenBatch = candidates[0]; // FIFO: oldest eligible batch first.
    }

    if (!existingDevice && !chosenBatch) {
      notify(
        cleanImei
          ? "مفيش رصيد متاح للموديل ده في المخزن. راجع الشحنة أو الكمية المتاحة."
          : "مفيش وحدات متاحة من غير IMEI للموديل ده. اختار شحنة فيها وحدات غير مسجلة بالرقم أو أدخل IMEI للجهاز.",
      );
      return;
    }
    if (chosenBatch && currentAvailable(chosenBatch) <= 0) {
      notify(
        "الشحنة المختارة نفد رصيدها أو اتضافت كل وحداتها للسلة. اختار شحنة أخرى.",
      );
      return;
    }
    if (
      chosenBatch &&
      !cleanImei &&
      untrackedAvailableInBatch(chosenBatch, currentDevices, cart) <= 0
    ) {
      notify(
        "الوحدات المتاحة في الشحنة دي مسجلة بأرقام IMEI؛ أدخل رقم الجهاز أو اختار شحنة فيها وحدات غير مسجلة.",
      );
      return;
    }

    const duplicateInOtherBatch =
      cleanImei &&
      allCurrentBatches.some(
        (batch) =>
          batch.id !== chosenBatch?.id &&
          Array.isArray(batch.imeis) &&
          batch.imeis.some(
            (value) => value.trim().toLocaleLowerCase() === imeiKey,
          ),
      );
    if (duplicateInOtherBatch) {
      notify("رقم IMEI ده مسجل في شحنة مختلفة؛ اختار الشحنة الصحيحة.");
      return;
    }

    const fromBatch = chosenBatch;
    const defaultPrice = Number(
      fromBatch?.salePrice ?? existingDevice?.salePrice,
    );
    if (!Number.isFinite(defaultPrice) || defaultPrice < 0) {
      notify(
        "سعر البيع غير محدد لهذا الجهاز أو الشحنة. حدّد سعر البيع في المخزن أولًا.",
      );
      return;
    }
    const installmentPrice = Number(
      existingDevice?.installmentPrice ?? defaultPrice,
    );
    const deviceId = existingDevice?.id ?? makeId();
    const item: CartItem = {
      deviceId,
      imei: cleanImei,
      brand: fromBatch?.brand ?? existingDevice?.brand ?? brand,
      series: fromBatch?.series ?? existingDevice?.series ?? series ?? "عام",
      model: fromBatch?.model ?? existingDevice?.model ?? model,
      color: existingDevice?.color ?? "",
      ram: existingDevice?.ram ?? "",
      storage: existingDevice?.storage ?? "",
      originalPrice: defaultPrice,
      cashPrice: defaultPrice,
      installmentPrice,
      cashFinalPrice: defaultPrice,
      installmentFinalPrice: installmentPrice,
      finalPrice: defaultPrice,
      offerName: "",
      ...(fromBatch
        ? {
            warehouseBatchId: fromBatch.id,
            unitCost: Number(fromBatch.unitCost) || 0,
          }
        : {}),
      ...(existingDevice ? {} : { isNewStock: true }),
    };
    setCart((current) => [...current, item]);
    setDevices(currentDevices);
    setImeiInput("");
    setSelectedBatchId("");
    setShowAddForm(false);
    notify(
      `اتضاف ${item.brand} ${item.model} للفاتورة${cleanImei ? ` · IMEI: ${cleanImei}` : " · بدون IMEI"}${fromBatch ? ` — ${fromBatch.supplierName || "شحنة المخزن"}` : ""}.`,
    );
  }

  function removeItem(deviceId: string) {
    setCart((current) => current.filter((item) => item.deviceId !== deviceId));
  }

  function resetSale() {
    setCart([]);
    resetAddForm();
    setShowAddForm(false);
    setCustomerName("");
    setCustomerPhone("");
    setMethod("cash");
    setPaidInput("");
    setInstallmentCount("6");
    setNotes("");
  }

  function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!cart.length) {
      notify("أضف جهازًا واحدًا على الأقل للفاتورة.");
      return;
    }

    const currentDevices = readArray<Device>(DEVICES_KEY);
    const currentBatches = readArray<WarehouseBatch>(WAREHOUSE_KEY);
    const currentSales = readArray<Sale>(SALES_KEY);
    const currentById = new Map(
      currentDevices.map((device) => [device.id, device]),
    );
    const imeis = cart
      .map((item) => item.imei.trim().toLocaleLowerCase())
      .filter(Boolean);
    if (new Set(imeis).size !== imeis.length) {
      notify("يوجد IMEI مكرر في الفاتورة.");
      return;
    }

    for (const item of cart) {
      const current = currentById.get(item.deviceId);
      if (current && current.status !== "available") {
        setDevices(currentDevices);
        notify(`الجهاز ${item.imei} لم يعد متاحًا للبيع.`);
        return;
      }
      if (!current && !item.isNewStock) {
        notify(
          `تعذر العثور على سجل الجهاز ${item.imei}. احذفه من الفاتورة وأضفه مجددًا.`,
        );
        return;
      }
      if (item.imei.trim()) {
        const matchingImei = currentDevices.find(
          (device) =>
            String(device.imei ?? "")
              .trim()
              .toLocaleLowerCase() === item.imei.trim().toLocaleLowerCase() &&
            device.id !== item.deviceId,
        );
        if (matchingImei) {
          notify(`رقم IMEI ${item.imei} مسجل بالفعل لجهاز آخر.`);
          return;
        }
      }
    }

    const batchCounts = new Map<string, number>();
    const anonymousBatchCounts = new Map<string, number>();
    cart.forEach((item) => {
      if (!item.warehouseBatchId) return;
      batchCounts.set(
        item.warehouseBatchId,
        (batchCounts.get(item.warehouseBatchId) || 0) + 1,
      );
      if (!item.imei.trim())
        anonymousBatchCounts.set(
          item.warehouseBatchId,
          (anonymousBatchCounts.get(item.warehouseBatchId) || 0) + 1,
        );
    });
    for (const [batchId, count] of batchCounts) {
      const batch = currentBatches.find((entry) => entry.id === batchId);
      if (!batch || Number(batch.availableQuantity) < count) {
        notify(
          "رصيد إحدى الشحنات اتغير ومبقاش يكفي الفاتورة. راجع الأجهزة وحاول تاني.",
        );
        return;
      }
      const anonymousCount = anonymousBatchCounts.get(batchId) || 0;
      const untrackedCount = Math.max(
        0,
        Number(batch.availableQuantity) -
          trackedImeisInBatch(batch, currentDevices),
      );
      if (anonymousCount > untrackedCount) {
        notify(
          "عدد الأجهزة المضافة بدون IMEI أكبر من الوحدات غير المسجلة المتاحة في إحدى الشحنات.",
        );
        return;
      }
    }

    const finalItems = cart.map((item) => {
      const price =
        Math.round(
          (method === "installment"
            ? item.installmentFinalPrice
            : item.cashFinalPrice) * 100,
        ) / 100;
      return {
        ...item,
        originalPrice:
          method === "installment" ? item.installmentPrice : item.cashPrice,
        finalPrice: price,
      };
    });
    const total =
      Math.round(
        finalItems.reduce((sum, item) => sum + item.finalPrice, 0) * 100,
      ) / 100;
    const paid = method === "cash" ? total : Number(paidInput || 0);
    if (!Number.isFinite(paid) || paid < 0 || paid > total) {
      notify("راجع المبلغ المدفوع؛ لازم يكون بين صفر وإجمالي الفاتورة.");
      return;
    }
    if (method === "installment") {
      const count = Number(installmentCount);
      if (!Number.isInteger(count) || count < 1 || count > 120) {
        notify("عدد الأقساط لازم يكون بين 1 و120.");
        return;
      }
      if (total - paid <= 0 || installments.length !== count) {
        notify("لازم يكون فيه مبلغ متبقٍ لتسجيل التقسيط.");
        return;
      }
    }
    if (method === "credit" && total - paid <= 0) {
      notify("المتبقي صفر؛ اختار الكاش بدل الآجل.");
      return;
    }
    const phone = customerPhone.trim();
    if (phone && !/^[0-9+\-\s()]+$/.test(phone)) {
      notify("راجع رقم هاتف العميل.");
      return;
    }
    if (
      finalItems.some(
        (item) => !Number.isFinite(item.finalPrice) || item.finalPrice < 0,
      )
    ) {
      notify("راجع أسعار الأجهزة في الفاتورة.");
      return;
    }

    const roundedPaid = Math.round(paid * 100) / 100;
    const roundedRemaining = Math.round((total - roundedPaid) * 100) / 100;
    const sale: Sale = {
      id: makeId(),
      invoiceNumber: invoiceNumber(),
      createdAt: Date.now(),
      items: finalItems,
      customerName: customerName.trim() || "عميل نقدي",
      customerPhone: phone,
      paymentMethod: method,
      total,
      amountPaid: roundedPaid,
      remainingAmount: roundedRemaining,
      installmentsCount: method === "installment" ? installments.length : 0,
      installments: method === "installment" ? installments : [],
      notes: notes.trim(),
      status:
        roundedRemaining <= 0 ? "paid" : roundedPaid > 0 ? "partial" : "unpaid",
    };

    const soldIds = new Set(finalItems.map((item) => item.deviceId));
    const itemById = new Map(finalItems.map((item) => [item.deviceId, item]));
    const nextDevices: Device[] = currentDevices.map((device) => {
      if (!soldIds.has(device.id)) return device;
      const item = itemById.get(device.id)!;
      return {
        ...device,
        status: "sold",
        warehouseBatchId: item.warehouseBatchId ?? device.warehouseBatchId,
        unitCost: item.unitCost ?? device.unitCost,
      };
    });
    for (const item of finalItems) {
      if (currentById.has(item.deviceId)) continue;
      nextDevices.push({
        id: item.deviceId,
        imei: item.imei,
        brand: item.brand,
        series: item.series,
        model: item.model,
        color: item.color,
        ram: item.ram,
        storage: item.storage,
        salePrice: item.cashPrice,
        installmentPrice: item.installmentPrice,
        offer: null,
        status: "sold",
        createdAt: Date.now(),
        ...(item.warehouseBatchId
          ? { warehouseBatchId: item.warehouseBatchId }
          : {}),
        ...(item.unitCost !== undefined ? { unitCost: item.unitCost } : {}),
      });
    }
    const soldPerBatch = new Map<string, number>();
    const soldImeisPerBatch = new Map<string, Set<string>>();
    finalItems.forEach((item) => {
      if (!item.warehouseBatchId) return;
      soldPerBatch.set(
        item.warehouseBatchId,
        (soldPerBatch.get(item.warehouseBatchId) || 0) + 1,
      );
      if (item.imei.trim()) {
        if (!soldImeisPerBatch.has(item.warehouseBatchId))
          soldImeisPerBatch.set(item.warehouseBatchId, new Set());
        soldImeisPerBatch
          .get(item.warehouseBatchId)!
          .add(item.imei.trim().toLocaleLowerCase());
      }
    });
    const nextBatches = currentBatches.map((batch) => {
      const quantity = soldPerBatch.get(batch.id) || 0;
      const soldImeis = soldImeisPerBatch.get(batch.id);
      if (!quantity && !soldImeis?.size) return batch;
      return {
        ...batch,
        availableQuantity: Math.max(
          0,
          Number(batch.availableQuantity) - quantity,
        ),
        imeis: (Array.isArray(batch.imeis) ? batch.imeis : []).filter(
          (imei) => !soldImeis?.has(String(imei).trim().toLocaleLowerCase()),
        ),
      };
    });

    setSaving(true);
    const oldValues = new Map<string, string | null>();
    [SALES_KEY, DEVICES_KEY, WAREHOUSE_KEY].forEach((key) =>
      oldValues.set(key, localStorage.getItem(key)),
    );
    try {
      localStorage.setItem(SALES_KEY, JSON.stringify([sale, ...currentSales]));
      localStorage.setItem(DEVICES_KEY, JSON.stringify(nextDevices));
      localStorage.setItem(WAREHOUSE_KEY, JSON.stringify(nextBatches));
      setSales([sale, ...currentSales]);
      setDevices(nextDevices);
      setBatches(nextBatches);
      resetSale();
      notify(`تم تسجيل الفاتورة ${sale.invoiceNumber} وتحديث المخزن بنجاح.`);
    } catch {
      oldValues.forEach((value, key) => {
        try {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        } catch {
          /* Best effort rollback. */
        }
      });
      notify(
        "تعذر حفظ الفاتورة وتحديث المخزن. لم يتم تأكيد البيع؛ راجع مساحة التخزين وحاول مرة أخرى.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!ready)
    return (
      <main dir="rtl" className="min-h-screen bg-gray-50 p-6 text-gray-900">
        جاري تحميل المبيعات...
      </main>
    );

  return (
    <main
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-gray-50 p-4 text-gray-950 md:p-8"
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-800">
              <CircleDollarSign size={18} /> نقطة البيع
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-950">
              فاتورة بيع جديدة
            </h1>
            <p className="mt-2 text-sm text-gray-700">
              اختار الموديل وسجّل البيع؛ رقم IMEI اختياري لو الجهاز غير مسجل
              برقم تسلسلي.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/invoices"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-400 bg-white px-4 py-3 text-sm font-bold text-gray-900 shadow-sm hover:bg-gray-100"
            >
              <History size={17} /> سجل الفواتير <ChevronLeft size={16} />
            </Link>
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-950">
              المتاح للبيع: {numberText(availableCount)} قطعة
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-gray-300 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-5 md:px-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-900">
                <ShoppingCart size={21} />
              </div>
              <div>
                <h2 className="font-bold text-gray-950">أجهزة الفاتورة</h2>
                <p className="mt-1 text-sm text-gray-700">
                  {numberText(cart.length)} جهاز
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm((value) => !value)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-extrabold text-white hover:bg-emerald-900"
            >
              {showAddForm ? <X size={17} /> : <Plus size={17} />}
              {showAddForm ? "إغلاق نموذج الجهاز" : "إضافة جهاز"}
            </button>
          </div>

          {showAddForm && (
            <form
              onSubmit={addDeviceToCart}
              className="space-y-5 border-b border-gray-200 bg-emerald-50/50 p-5 md:p-7"
            >
              <div>
                <h3 className="font-bold text-gray-950">إضافة جهاز للفاتورة</h3>
                <p className="mt-1 text-sm leading-6 text-gray-700">
                  ابحث بالماركة والسلسلة والموديل، أو اختار الموديل مباشرة من
                  القائمة وسيتم ملء الماركة والسلسلة تلقائيًا. تحديد الشحنة
                  اختياري.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="الماركة">
                  <SearchSelect
                    value={brand}
                    options={brands}
                    placeholder="ابحث عن الماركة"
                    onChange={(value) => {
                      setBrand(value);
                      setSeries("");
                      setModel("");
                      setSelectedBatchId("");
                    }}
                  />
                </Field>
                <Field label="السلسلة">
                  <SearchSelect
                    value={series}
                    options={seriesOptions}
                    placeholder={
                      brand ? "اختار السلسلة (اختياري)" : "اختار الماركة أولًا"
                    }
                    disabled={!brand}
                    onChange={(value) => {
                      setSeries(value);
                      setModel("");
                      setSelectedBatchId("");
                    }}
                  />
                </Field>
                <Field label="الموديل">
                  <SearchSelect
                    value={model}
                    options={modelOptions}
                    placeholder="ابحث أو اختار الموديل مباشرة"
                    onChange={pickModel}
                  />
                </Field>
              </div>
              {brand && model && (
                <div className="rounded-xl border border-emerald-200 bg-white p-3 text-sm text-gray-800">
                  <span className="font-bold">الموديل المحدد:</span> {brand} ·{" "}
                  {series || "كل السلاسل"} · {model}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="رقم IMEI (اختياري)">
                  <input
                    value={imeiInput}
                    onChange={(event) => setImeiInput(event.target.value)}
                    placeholder="سيبه فارغًا لو الرقم غير متاح"
                    dir="ltr"
                    autoComplete="off"
                    className={`${INPUT_CLASS} text-left font-mono`}
                  />
                </Field>
                <Field label="الشحنة (اختياري)">
                  <select
                    value={selectedBatchId}
                    onChange={(event) => setSelectedBatchId(event.target.value)}
                    disabled={!chosenBatches.length}
                    className={INPUT_CLASS}
                  >
                    <option value="">تحديد تلقائي — أقدم شحنة متاحة</option>
                    {chosenBatches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {new Date(batch.receivedAt).toLocaleDateString("ar-EG")}{" "}
                        · {batch.supplierName || "بدون مورد"} · متاح{" "}
                        {numberText(batch.availableQuantity)} ·{" "}
                        {batch.salePrice == null
                          ? "سعر البيع غير محدد"
                          : money(Number(batch.salePrice))}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-gray-600">
                    لو مش عارف الجهاز من أنهي شحنة، سيبها تلقائي؛ هنختار أقدم
                    شحنة مناسبة. البيع بدون IMEI يستخدم الوحدات غير المسجلة برقم
                    فقط لتجنب بيع جهاز معروف رقمه مرتين.
                  </p>
                </Field>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetAddForm}
                  className="rounded-xl border border-gray-400 bg-white px-5 py-3 text-sm font-bold text-gray-900 hover:bg-gray-100"
                >
                  مسح الحقول
                </button>
                <button
                  type="submit"
                  disabled={!model || !brand}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-6 py-3 text-sm font-extrabold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={17} /> إضافة الجهاز للفاتورة
                </button>
              </div>
            </form>
          )}

          {cart.length === 0 ? (
            <div className="p-10 text-center">
              <Smartphone size={32} className="mx-auto text-gray-400" />
              <p className="mt-3 font-bold text-gray-900">الفاتورة فارغة</p>
              <p className="mt-1 text-sm text-gray-700">
                اضغط «إضافة جهاز» لبدء تسجيل الأجهزة.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {cart.map((item) => {
                const price =
                  method === "installment"
                    ? item.installmentFinalPrice
                    : item.cashFinalPrice;
                const batch = batches.find(
                  (entry) => entry.id === item.warehouseBatchId,
                );
                return (
                  <div
                    key={item.deviceId}
                    className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[1fr_220px_auto] md:items-end md:px-7"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800">
                        <Smartphone size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-950">
                          {item.brand} {item.series || "عام"} {item.model}
                        </p>
                        <p
                          className="mt-1 font-mono text-sm text-gray-800"
                          dir="ltr"
                        >
                          IMEI: {item.imei.trim() || "غير مسجل"}
                        </p>
                        <p className="mt-1 text-sm text-gray-700">
                          {batch
                            ? `الشحنة: ${batch.supplierName || "بدون مورد"} · ${new Date(batch.receivedAt).toLocaleDateString("ar-EG")}`
                            : "جهاز مسجل سابقًا (بدون ربط بشحنة)"}
                        </p>
                      </div>
                    </div>
                    <Field label="سعر البيع الفعلي (ج.م)">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={Number.isFinite(price) ? price : ""}
                        onChange={(event) =>
                          updateItemPrice(item.deviceId, event.target.value)
                        }
                        dir="ltr"
                        inputMode="decimal"
                        className={`${INPUT_CLASS} text-left`}
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => removeItem(item.deviceId)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-bold text-red-800 hover:bg-red-50"
                    >
                      <Trash2 size={17} /> حذف
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-5 py-5 md:px-7">
            <div>
              <p className="text-sm font-semibold text-gray-700">
                إجمالي الفاتورة
              </p>
              <p className="mt-1 text-xs text-gray-600">
                السعر النهائي حسب الأسعار الظاهرة أعلاه
              </p>
            </div>
            <p className="text-2xl font-extrabold text-emerald-900" dir="ltr">
              {money(cartTotal)}
            </p>
          </div>
        </section>

        <form onSubmit={submitSale} className="space-y-6">
          <section className="rounded-2xl border border-gray-300 bg-white p-5 shadow-sm md:p-7">
            <h2 className="mb-5 flex items-center gap-2 font-bold text-gray-950">
              <UserRound size={19} className="text-emerald-800" /> بيانات البيع
              والدفع
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="اسم العميل (اختياري)">
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="اسم العميل"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="رقم الهاتف (اختياري)">
                <input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                  inputMode="tel"
                  className={`${INPUT_CLASS} text-left`}
                />
              </Field>
              <Field label="طريقة الدفع">
                <select
                  value={method}
                  onChange={(event) => {
                    setMethod(event.target.value as Method);
                    setPaidInput("");
                  }}
                  className={INPUT_CLASS}
                >
                  <option value="cash">كاش — دفع كامل</option>
                  <option value="credit">آجل</option>
                  <option value="installment">تقسيط</option>
                </select>
              </Field>
              {method !== "cash" && (
                <Field
                  label={
                    method === "installment"
                      ? "الدفعة المقدمة (ج.م)"
                      : "المدفوع الآن (ج.م)"
                  }
                >
                  <input
                    type="number"
                    min="0"
                    max={cartTotal}
                    step="0.01"
                    value={paidInput}
                    onChange={(event) => setPaidInput(event.target.value)}
                    placeholder="0.00"
                    dir="ltr"
                    inputMode="decimal"
                    className={`${INPUT_CLASS} text-left`}
                  />
                </Field>
              )}
              {method === "installment" && (
                <Field label="عدد الأقساط">
                  <select
                    value={installmentCount}
                    onChange={(event) =>
                      setInstallmentCount(event.target.value)
                    }
                    className={INPUT_CLASS}
                  >
                    {[2, 3, 4, 5, 6, 8, 10, 12, 18, 24, 36, 48, 60, 120].map(
                      (count) => (
                        <option key={count} value={count}>
                          {count} قسط
                        </option>
                      ),
                    )}
                  </select>
                </Field>
              )}
            </div>
            {method === "installment" && installments.length > 0 && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                المتبقي {money(remaining)} موزع على{" "}
                {numberText(installments.length)} قسط، يبدأ أول استحقاق في{" "}
                {installments[0]?.dueDate}.
              </div>
            )}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Summary label="الإجمالي" value={money(cartTotal)} />
              <Summary
                label="المدفوع الآن"
                value={money(Math.max(0, Math.min(cartTotal, paidAmount)))}
              />
              <Summary
                label="المتبقي"
                value={money(remaining)}
                warning={remaining > 0}
              />
            </div>
            <div className="mt-4">
              <Field label="ملاحظات (اختياري)">
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  placeholder="ملاحظة على عملية البيع"
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetSale}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-400 bg-white px-5 py-3 text-sm font-bold text-gray-900 hover:bg-gray-100"
              >
                <X size={17} /> إلغاء البيع
              </button>
              <button
                type="submit"
                disabled={saving || cart.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-6 py-3 text-sm font-extrabold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check size={18} />{" "}
                {saving ? "جارٍ الحفظ..." : "تأكيد البيع وتحديث المخزن"}
              </button>
            </div>
          </section>
        </form>
      </div>
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-[100] flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-950 shadow-xl"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-900">
            <Check size={16} />
          </span>
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast("")}
            aria-label="إغلاق التنبيه"
            className="mr-1 rounded-md p-1 text-gray-600 hover:bg-gray-100"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </main>
  );
}

function Summary({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${warning ? "border-amber-300 bg-amber-50" : "border-gray-300 bg-gray-50"}`}
    >
      <p
        className={`text-sm font-semibold ${warning ? "text-amber-950" : "text-gray-800"}`}
      >
        {label}
      </p>
      <p
        className={`mt-2 text-lg font-extrabold ${warning ? "text-amber-950" : "text-gray-950"}`}
        dir="ltr"
      >
        {value}
      </p>
    </div>
  );
}
