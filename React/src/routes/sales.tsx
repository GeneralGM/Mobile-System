/* eslint-disable prettier/prettier */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Check,
  ChevronLeft,
  CircleDollarSign,
  History,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import SearchSelect from "../components/SearchSelect";
import type { WarehouseBatch } from "../types/warehouse";
import type { CartItem, Installment, Method, Sale } from "../types/sales";
import { api, type AccessoryBatchRecord } from "../lib/api-client";
import { formatDate, formatMoney, formatNumber } from "../lib/format";
import {
  APP_INPUT_CLASS,
  APP_LABEL_CLASS,
  PageHeader,
} from "../components/ui/app-chrome";

export const Route = createFileRoute("/sales")({ component: SalesPage });

const INPUT_CLASS = APP_INPUT_CLASS;
const LABEL_CLASS = APP_LABEL_CLASS;

type ItemType = "mobile" | "accessory";
type SalesCartItem = CartItem & {
  itemType?: ItemType;
  accessoryBatchId?: string;
  accessoryCategory?: string;
  accessoryBrand?: string;
  compatibleModel?: string;
  variantType?: string;
  variantValue?: string;
};
type ModelOption = { brand: string; series: string; model: string };

function money(value: number) {
  return formatMoney(value);
}

function numberText(value: number) {
  return formatNumber(value, { maxFraction: 2 });
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

function splitCompatibleModels(value?: string) {
  return String(value ?? "")
    .split(/[,،;؛\n]+/)
    .map((model) => model.trim())
    .filter(Boolean);
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function accessoryMatchesSearch(batch: AccessoryBatchRecord, query: string) {
  const models = splitCompatibleModels(batch.compatibleModel);
  // Search fields independently so a query such as "جراب A14" can match
  // the product name and compatible model without depending on their order.
  const fields = [
    batch.productName,
    batch.model,
    batch.category, // accessory type/category
    batch.brand,
    batch.compatibleModel,
    ...models,
    batch.variantType,
    batch.variantValue,
  ]
    .map(normalizeSearchText)
    .filter(Boolean);

  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}

function accessorySearchRank(batch: AccessoryBatchRecord, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 9;
  const name = normalizeSearchText(batch.productName || batch.model);
  const category = normalizeSearchText(batch.category);
  const compatibility = normalizeSearchText(batch.compatibleModel);
  if (name.includes(normalizedQuery)) return 0;
  if (category.includes(normalizedQuery)) return 1;
  if (compatibility.includes(normalizedQuery)) return 2;
  return 3;
}

function SalesPage() {
  const [ready, setReady] = useState(false);
  const [batches, setBatches] = useState<WarehouseBatch[]>([]);
  const [accessoryBatches, setAccessoryBatches] = useState<
    AccessoryBatchRecord[]
  >([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [itemType, setItemType] = useState<ItemType>("mobile");
  const [brand, setBrand] = useState("");
  const [series, setSeries] = useState("");
  const [model, setModel] = useState("");
  const [quantityInput, setQuantityInput] = useState("1");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [accessorySearch, setAccessorySearch] = useState("");
  const [selectedAccessoryBatchId, setSelectedAccessoryBatchId] = useState("");
  const [cart, setCart] = useState<SalesCartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [paidInput, setPaidInput] = useState("");
  const [installmentCount, setInstallmentCount] = useState("6");
  const [notes, setNotes] = useState("");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getWarehouseBatches(),
      api.getAccessoryBatches(),
      api.getSales(),
    ])
      .then(([freshBatches, freshAccessories, freshSales]) => {
        if (cancelled) return;
        setBatches(freshBatches);
        setAccessoryBatches(freshAccessories);
        setSales(freshSales as Sale[]);
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        notify(
          error instanceof Error
            ? error.message
            : "تعذر الاتصال بقاعدة البيانات.",
        );
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
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
  const activeAccessoryBatches = useMemo(
    () =>
      accessoryBatches.filter((batch) => Number(batch.availableQuantity) > 0),
    [accessoryBatches],
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
        cleanBrand.toLowerCase(),
        cleanSeries.toLowerCase(),
        cleanModel.toLowerCase(),
      ]);
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({
        brand: cleanBrand,
        series: cleanSeries,
        model: cleanModel,
      });
    };
    activeBatches.forEach((batch) =>
      add(batch.brand, batch.series, batch.model),
    );
    return entries.sort((a, b) =>
      `${a.brand} ${a.series} ${a.model}`.localeCompare(
        `${b.brand} ${b.series} ${b.model}`,
      ),
    );
  }, [activeBatches]);

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

  const filteredAccessoryBatches = useMemo(() => {
    const query = accessorySearch.trim();
    return activeAccessoryBatches
      .filter((batch) => accessoryMatchesSearch(batch, query))
      .sort((a, b) => {
        const rankDifference =
          accessorySearchRank(a, query) - accessorySearchRank(b, query);
        if (rankDifference !== 0) return rankDifference;
        return `${a.category} ${a.productName} ${a.brand}`.localeCompare(
          `${b.category} ${b.productName} ${b.brand}`,
        );
      });
  }, [activeAccessoryBatches, accessorySearch]);

  const availableCount = useMemo(
    () =>
      [...batches, ...accessoryBatches].reduce(
        (sum, batch) => sum + Math.max(0, Number(batch.availableQuantity) || 0),
        0,
      ),
    [batches, accessoryBatches],
  );
  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum +
          (method === "installment"
            ? item.installmentFinalPrice
            : item.cashFinalPrice) *
            Math.max(1, Number(item.quantity) || 1),
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
    setItemType("mobile");
    setBrand("");
    setSeries("");
    setModel("");
    setQuantityInput("1");
    setSelectedBatchId("");
    setAccessorySearch("");
    setSelectedAccessoryBatchId("");
  }

  function pickModel(value: string) {
    if (!brand) {
      const query = value.trim().toLocaleLowerCase();
      const exactModelMatches = modelCatalog.filter((entry) =>
        sameText(entry.model, value),
      );
      const matches = exactModelMatches.length
        ? exactModelMatches
        : modelCatalog.filter(
            (entry) =>
              `${entry.brand} ${entry.model}`.toLowerCase().includes(query) ||
              `${entry.brand} ${entry.series} ${entry.model}`
                .toLowerCase()
                .includes(query),
          );
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

  function addMobileToCart(requestedQuantity: number) {
    if (!brand.trim() || !model.trim()) {
      notify("اختار الماركة والموديل أولًا.");
      return;
    }
    const matchingBatches = batches
      .filter(
        (batch) =>
          Number(batch.availableQuantity) > 0 &&
          sameText(batch.brand, brand) &&
          sameText(batch.model, model) &&
          (!series || sameText(batch.series || "عام", series)),
      )
      .sort((a, b) => Number(a.receivedAt) - Number(b.receivedAt));
    const chosenBatch =
      matchingBatches.find((batch) => batch.id === selectedBatchId) ??
      matchingBatches.find((batch) => !selectedBatchId);
    if (!chosenBatch) {
      notify("مفيش شحنة متاحة للموديل ده.");
      return;
    }
    const alreadyInCart = cart
      .filter(
        (item) =>
          item.itemType !== "accessory" &&
          item.warehouseBatchId === chosenBatch.id,
      )
      .reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
    const available = Math.max(
      0,
      Number(chosenBatch.availableQuantity) - alreadyInCart,
    );
    if (requestedQuantity > available) {
      notify(
        `الكمية المطلوبة ${requestedQuantity}، والمتاح ${available} قطعة.`,
      );
      return;
    }
    const defaultPrice = Number(chosenBatch.salePrice);
    if (!Number.isFinite(defaultPrice) || defaultPrice < 0) {
      notify("سعر البيع غير محدد أو غير صحيح للشحنة.");
      return;
    }
    const item: SalesCartItem = {
      deviceId: makeId(),
      brand: chosenBatch.brand,
      series: chosenBatch.series || "عام",
      model: chosenBatch.model,
      color: "",
      ram: "",
      storage: "",
      originalPrice: defaultPrice,
      cashPrice: defaultPrice,
      installmentPrice: defaultPrice,
      cashFinalPrice: defaultPrice,
      installmentFinalPrice: defaultPrice,
      finalPrice: defaultPrice,
      offerName: "",
      quantity: requestedQuantity,
      warehouseBatchId: chosenBatch.id,
      unitCost: Number(chosenBatch.unitCost) || 0,
      isNewStock: true,
      itemType: "mobile",
    };
    setCart((current) => [...current, item]);
    setSelectedBatchId("");
    setShowAddForm(false);
    setQuantityInput("1");
    notify(
      `اتضاف ${numberText(requestedQuantity)} قطعة من ${item.brand} ${item.model} للفاتورة.`,
    );
  }

  function addAccessoryToCart(requestedQuantity: number) {
    const chosen = activeAccessoryBatches.find(
      (batch) => batch.id === selectedAccessoryBatchId,
    );
    if (!chosen) {
      notify("اختار الإكسسوار والنسخة المطلوبة من القائمة.");
      return;
    }
    const alreadyInCart = cart
      .filter(
        (item) =>
          item.itemType === "accessory" && item.accessoryBatchId === chosen.id,
      )
      .reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
    const available = Math.max(
      0,
      Number(chosen.availableQuantity) - alreadyInCart,
    );
    if (requestedQuantity > available) {
      notify(
        `الكمية المطلوبة ${requestedQuantity}، والمتاح من الإكسسوار ${available} قطعة.`,
      );
      return;
    }
    const defaultPrice = Number(chosen.salePrice);
    if (!Number.isFinite(defaultPrice) || defaultPrice < 0) {
      notify("سعر بيع الإكسسوار غير صحيح.");
      return;
    }
    const item: SalesCartItem = {
      deviceId: makeId(),
      brand: chosen.brand,
      series: chosen.category || "إكسسوار",
      model: chosen.productName || chosen.model,
      color: "",
      ram: "",
      storage: "",
      originalPrice: defaultPrice,
      cashPrice: defaultPrice,
      installmentPrice: defaultPrice,
      cashFinalPrice: defaultPrice,
      installmentFinalPrice: defaultPrice,
      finalPrice: defaultPrice,
      offerName: "",
      quantity: requestedQuantity,
      unitCost: Number(chosen.unitCost) || 0,
      isNewStock: true,
      itemType: "accessory",
      accessoryBatchId: chosen.id,
      accessoryCategory: chosen.category,
      accessoryBrand: chosen.brand,
      compatibleModel: chosen.compatibleModel || "",
      variantType: chosen.variantType || "",
      variantValue: chosen.variantValue || "",
    };
    setCart((current) => [...current, item]);
    setSelectedAccessoryBatchId("");
    setShowAddForm(false);
    setQuantityInput("1");
    notify(
      `اتضاف ${numberText(requestedQuantity)} قطعة من ${item.model} للفاتورة.`,
    );
  }

  function handleAddToCart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(quantityInput);
    if (!Number.isInteger(quantity) || quantity < 1) {
      notify("الكمية لازم تكون عددًا صحيحًا أكبر من صفر.");
      return;
    }
    if (itemType === "accessory") {
      addAccessoryToCart(quantity);
      return;
    }
    addMobileToCart(quantity);
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

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!cart.length) {
      notify("أضف قطعة واحدة على الأقل للفاتورة.");
      return;
    }

    let currentBatches: WarehouseBatch[];
    let currentAccessoryBatches: AccessoryBatchRecord[];
    let currentSales: Sale[];
    try {
      [currentBatches, currentAccessoryBatches, currentSales] =
        (await Promise.all([
          api.getWarehouseBatches(),
          api.getAccessoryBatches(),
          api.getSales(),
        ])) as [WarehouseBatch[], AccessoryBatchRecord[], Sale[]];
      setBatches(currentBatches);
      setAccessoryBatches(currentAccessoryBatches);
      setSales(currentSales);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "تعذر تحديث بيانات المخزن والفواتير.",
      );
      return;
    }

    const mobileCounts = new Map<string, number>();
    const accessoryCounts = new Map<string, number>();
    for (const item of cart) {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        notify("الكمية لازم تكون عددًا صحيحًا أكبر من صفر.");
        return;
      }
      if (item.itemType === "accessory") {
        if (!item.accessoryBatchId) {
          notify("فيه إكسسوار في الفاتورة غير مرتبط بدفعة مخزون.");
          return;
        }
        accessoryCounts.set(
          item.accessoryBatchId,
          (accessoryCounts.get(item.accessoryBatchId) || 0) + quantity,
        );
      } else {
        if (!item.warehouseBatchId) {
          notify("فيه موبايل في الفاتورة غير مرتبط بشحنة مخزون.");
          return;
        }
        mobileCounts.set(
          item.warehouseBatchId,
          (mobileCounts.get(item.warehouseBatchId) || 0) + quantity,
        );
      }
    }
    for (const [batchId, count] of mobileCounts) {
      const batch = currentBatches.find((entry) => entry.id === batchId);
      if (!batch || Number(batch.availableQuantity) < count) {
        notify("رصيد شحنة الموبايل لم يعد يكفي الكمية المطلوبة. راجع المخزون.");
        return;
      }
    }
    for (const [batchId, count] of accessoryCounts) {
      const batch = currentAccessoryBatches.find(
        (entry) => entry.id === batchId,
      );
      if (!batch || Number(batch.availableQuantity) < count) {
        notify(
          "رصيد دفعة الإكسسوار لم يعد يكفي الكمية المطلوبة. راجع المخزون.",
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
        finalItems.reduce(
          (sum, item) =>
            sum + item.finalPrice * Math.max(1, Number(item.quantity) || 1),
          0,
        ) * 100,
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
      notify("راجع أسعار البنود في الفاتورة.");
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

    setSaving(true);
    try {
      const savedSale = await api.createSale(sale);
      const [freshSales, freshBatches, freshAccessoryBatches] =
        await Promise.all([
          api.getSales(),
          api.getWarehouseBatches(),
          api.getAccessoryBatches(),
        ]);
      setSales(freshSales as Sale[]);
      setBatches(freshBatches);
      setAccessoryBatches(freshAccessoryBatches);
      resetSale();
      notify(
        `تم تسجيل الفاتورة ${savedSale.invoiceNumber} وتحديث المخزن في قاعدة البيانات بنجاح.`,
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "تعذر حفظ الفاتورة. لم يتم تأكيد البيع.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!ready)
    return (
      <div
        dir="rtl"
        className="rounded-xl border border-slate-200 bg-white p-6 text-slate-700"
      >
        جاري تحميل المبيعات...
      </div>
    );

  return (
    <div dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow={
          <>
            <CircleDollarSign size={18} /> نقطة البيع
          </>
        }
        title="فاتورة بيع جديدة"
        description="بيع الموبايلات والإكسسوارات في نفس الفاتورة، مع دعم الكاش والآجل والتقسيط."
        actions={
          <>
            <Link to="/invoices" className="app-btn-secondary">
              <History size={17} /> سجل الفواتير <ChevronLeft size={16} />
            </Link>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-950">
              المتاح للبيع: {numberText(availableCount)} قطعة
            </div>
          </>
        }
      />

      <section className="rounded-2xl border border-gray-300 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-5 md:px-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-900">
              <ShoppingCart size={21} />
            </div>
            <div>
              <h2 className="font-bold text-gray-950">بنود الفاتورة</h2>
              <p className="mt-1 text-sm text-gray-700">
                {numberText(
                  cart.reduce(
                    (sum, item) =>
                      sum + Math.max(1, Number(item.quantity) || 1),
                    0,
                  ),
                )}{" "}
                قطعة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((value) => !value)}
            className="app-btn-primary"
          >
            {showAddForm ? <X size={17} /> : <Plus size={17} />}
            {showAddForm ? "إغلاق نموذج الإضافة" : "إضافة منتج"}
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleAddToCart}
            className="space-y-5 border-b border-gray-200 bg-emerald-50/50 p-5 md:p-7"
          >
            <div>
              <h3 className="font-bold text-gray-950">إضافة منتج للفاتورة</h3>
              <p className="mt-1 text-sm leading-6 text-gray-700">
                اختار نوع الصنف أولًا. تقدر تضيف موبايلات وإكسسوارات مع بعض في
                نفس الفاتورة.
              </p>
            </div>
            <Field label="نوع الصنف">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setItemType("mobile");
                    setSelectedAccessoryBatchId("");
                  }}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold ${itemType === "mobile" ? "border-emerald-700 bg-emerald-100 text-emerald-950" : "border-gray-300 bg-white text-gray-800"}`}
                >
                  <Smartphone size={18} /> موبايل
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItemType("accessory");
                    setBrand("");
                    setSeries("");
                    setModel("");
                    setSelectedBatchId("");
                  }}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold ${itemType === "accessory" ? "border-emerald-700 bg-emerald-100 text-emerald-950" : "border-gray-300 bg-white text-gray-800"}`}
                >
                  <Package size={18} /> إكسسوار
                </button>
              </div>
            </Field>

            {itemType === "mobile" ? (
              <>
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
                        brand
                          ? "اختار السلسلة (اختياري)"
                          : "اختار الماركة أولًا"
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
                        {formatDate(batch.receivedAt)} ·{" "}
                        {batch.supplierName || "بدون مورد"} · متاح{" "}
                        {numberText(batch.availableQuantity)} ·{" "}
                        {batch.salePrice == null
                          ? "سعر البيع غير محدد"
                          : money(Number(batch.salePrice))}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-gray-600">
                    لو ما اخترتش شحنة، هنختار أقدم شحنة مناسبة تلقائيًا.
                  </p>
                </Field>
              </>
            ) : (
              <>
                <Field label="ابحث عن الإكسسوار بالاسم أو النوع أو الموديل المتوافق">
                  <div className="relative">
                    <Search
                      size={17}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      value={accessorySearch}
                      onChange={(event) => {
                        setAccessorySearch(event.target.value);
                        setSelectedAccessoryBatchId("");
                      }}
                      placeholder="اكتب مثلًا: جراب أو A14 أو اسكرينة خصوصية..."
                      autoComplete="off"
                      className={`${INPUT_CLASS} pr-9`}
                    />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-gray-600">
                    اكتب كلمة البحث وهتظهر أسماء المنتجات تحت الخانة مباشرة.
                    اضغط على المنتج المطلوب لاختياره.
                  </p>
                  <div
                    className="mt-3 space-y-2"
                    role="listbox"
                    aria-label="نتائج البحث عن الإكسسوارات"
                  >
                    {filteredAccessoryBatches.length === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        مفيش إكسسوارات متاحة مطابقة للبحث.
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-emerald-800">
                          {numberText(filteredAccessoryBatches.length)} منتج
                          متاح — اختار المنتج من النتائج:
                        </p>
                        {filteredAccessoryBatches.slice(0, 40).map((batch) => {
                          const selected =
                            selectedAccessoryBatchId === batch.id;
                          return (
                            <button
                              key={batch.id}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() =>
                                setSelectedAccessoryBatchId(batch.id)
                              }
                              className={`block w-full rounded-xl border p-3 text-right transition ${
                                selected
                                  ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-100"
                                  : "border-gray-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/50"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-bold text-gray-950">
                                    {batch.productName || batch.model}
                                  </p>
                                  <p className="mt-1 text-sm text-gray-700">
                                    {batch.category} · {batch.brand}
                                    {batch.compatibleModel
                                      ? ` · مناسب لـ ${splitCompatibleModels(batch.compatibleModel).join("، ")}`
                                      : ""}
                                  </p>
                                  {(batch.variantType ||
                                    batch.variantValue) && (
                                    <p className="mt-1 text-xs text-gray-600">
                                      المواصفة:{" "}
                                      {[batch.variantType, batch.variantValue]
                                        .filter(Boolean)
                                        .join(": ")}
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0 text-left">
                                  <p
                                    className="font-extrabold text-emerald-800"
                                    dir="ltr"
                                  >
                                    {money(Number(batch.salePrice) || 0)} ج.م
                                  </p>
                                  <p className="mt-1 text-xs text-gray-600">
                                    متاح {numberText(batch.availableQuantity)}
                                  </p>
                                  {selected && (
                                    <p className="mt-1 text-xs font-bold text-emerald-800">
                                      تم الاختيار ✓
                                    </p>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                        {filteredAccessoryBatches.length > 40 && (
                          <p className="text-xs text-gray-600">
                            ظهر أول 40 نتيجة. زوّد كلمات البحث لتحديد المنتج
                            أسرع.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </Field>
                {selectedAccessoryBatchId &&
                  (() => {
                    const selected = activeAccessoryBatches.find(
                      (batch) => batch.id === selectedAccessoryBatchId,
                    );
                    return selected ? (
                      <div className="rounded-xl border border-emerald-200 bg-white p-3 text-sm leading-6 text-gray-800">
                        <p>
                          <span className="font-bold">المنتج المختار:</span>{" "}
                          {selected.productName} — {selected.category} /{" "}
                          {selected.brand}
                        </p>
                        {selected.compatibleModel && (
                          <p>
                            <span className="font-bold">متوافق مع:</span>{" "}
                            {splitCompatibleModels(
                              selected.compatibleModel,
                            ).join("، ")}
                          </p>
                        )}
                        {(selected.variantType || selected.variantValue) && (
                          <p>
                            <span className="font-bold">المواصفة:</span>{" "}
                            {[selected.variantType, selected.variantValue]
                              .filter(Boolean)
                              .join(": ")}
                          </p>
                        )}
                        <p>
                          <span className="font-bold">المتاح:</span>{" "}
                          {numberText(selected.availableQuantity)} ·{" "}
                          <span className="font-bold">السعر:</span>{" "}
                          {money(Number(selected.salePrice) || 0)}
                        </p>
                      </div>
                    ) : null;
                  })()}
              </>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="الكمية">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantityInput}
                  onChange={(event) => setQuantityInput(event.target.value)}
                  className={INPUT_CLASS}
                  dir="ltr"
                />
              </Field>
              <div className="flex items-end text-sm text-gray-700">
                {itemType === "mobile"
                  ? "سيتم خصم الكمية من شحنة الموبايل المحددة."
                  : "سيتم خصم الكمية من دفعة الإكسسوار المحددة."}
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetAddForm}
                className="app-btn-secondary"
              >
                <X size={16} /> مسح الحقول
              </button>
              <button
                type="submit"
                disabled={
                  itemType === "mobile"
                    ? !model || !brand
                    : !selectedAccessoryBatchId
                }
                className="app-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={17} /> إضافة للفاتورة
              </button>
            </div>
          </form>
        )}

        {cart.length === 0 ? (
          <div className="p-10 text-center">
            <ShoppingCart size={32} className="mx-auto text-gray-400" />
            <p className="mt-3 font-bold text-gray-900">الفاتورة فارغة</p>
            <p className="mt-1 text-sm text-gray-700">
              اضغط «إضافة منتج» لبدء تسجيل البيع.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {cart.map((item) => {
              const price =
                method === "installment"
                  ? item.installmentFinalPrice
                  : item.cashFinalPrice;
              const batch =
                item.itemType === "accessory"
                  ? undefined
                  : batches.find((entry) => entry.id === item.warehouseBatchId);
              const accessoryBatch =
                item.itemType === "accessory"
                  ? accessoryBatches.find(
                      (entry) => entry.id === item.accessoryBatchId,
                    )
                  : undefined;
              return (
                <div
                  key={item.deviceId}
                  className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[1fr_220px_auto] md:items-end md:px-7"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800">
                      {item.itemType === "accessory" ? (
                        <Package size={20} />
                      ) : (
                        <Smartphone size={20} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-950">
                        {item.itemType === "accessory"
                          ? `${item.model} · ${item.accessoryBrand || item.brand}`
                          : `${item.brand} ${item.series || "عام"} ${item.model}`}
                      </p>
                      <p className="mt-1 text-sm text-gray-700">
                        {item.itemType === "accessory"
                          ? `إكسسوار: ${item.accessoryCategory || item.series}${item.compatibleModel ? ` · متوافق مع ${splitCompatibleModels(item.compatibleModel).join("، ")}` : ""}${item.variantType || item.variantValue ? ` · ${[item.variantType, item.variantValue].filter(Boolean).join(": ")}` : ""}`
                          : batch
                            ? `الشحنة: ${batch.supplierName || "بدون مورد"} · ${formatDate(batch.receivedAt)}`
                            : "الشحنة غير موجودة"}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        الكمية: {numberText(item.quantity)} · تكلفة الوحدة:{" "}
                        {money(Number(item.unitCost) || 0)}
                      </p>
                      {item.itemType === "accessory" && !accessoryBatch && (
                        <p className="mt-1 text-xs text-amber-800">
                          تنبيه: دفعة الإكسسوار غير ظاهرة في المخزون الحالي.
                        </p>
                      )}
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
                  onChange={(event) => setInstallmentCount(event.target.value)}
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
    </div>
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
