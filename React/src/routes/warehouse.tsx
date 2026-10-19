/* eslint-disable prettier/prettier */

import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Package,
  Plus,
  Search,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import SearchSelect from "../components/SearchSelect";
import type { Brand } from "@/types/device";
import type { WarehouseBatch } from "@/types/warehouse";
import { api, type AccessoryBatchRecord } from "../lib/api-client";
import { formatDate, formatMoney, formatNumber } from "../lib/format";
import {
  APP_INPUT_CLASS,
  APP_LABEL_CLASS,
  PageHeader,
  StatCard,
} from "../components/ui/app-chrome";

export const Route = createFileRoute("/warehouse")({
  component: WarehousePage,
});

const inputClass = APP_INPUT_CLASS;
const labelClass = APP_LABEL_CLASS;

type WarehouseForm = {
  itemType: "mobile" | "accessory";
  brand: string;
  series: string;
  model: string;
  category: string;
  compatibleModel: string;
  compatibleModels: string[];
  variantType: string;
  variantValue: string;
  caseColor: string;
  caseMaterial: string;
  quantity: string;
  unitCost: string;
  salePrice: string;
  supplierName: string;
  imeisText: string;
};

type WarehouseModelGroup = {
  key: string;
  brand: string;
  series: string;
  model: string;
  batches: WarehouseBatch[];
  totalReceived: number;
  totalAvailable: number;
  totalOutgoing: number;
  totalValue: number;
  totalImeis: number;
  suppliers: string[];
  lastReceivedAt: number;
};

const emptyForm: WarehouseForm = {
  itemType: "mobile",
  brand: "",
  series: "",
  model: "",
  category: "",
  compatibleModel: "",
  compatibleModels: [],
  variantType: "",
  variantValue: "",
  caseColor: "",
  caseMaterial: "",
  quantity: "1",
  unitCost: "",
  salePrice: "",
  supplierName: "",
  imeisText: "",
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function money(value: number) {
  return formatMoney(value);
}

function numberText(value: number) {
  return formatNumber(value);
}

function normalizeBrands(raw: unknown): Brand[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item): Brand[] => {
    if (!item || typeof item !== "object") return [];

    const value = item as Record<string, unknown>;
    const name = String(value.name ?? value.brand ?? "").trim();
    if (!name) return [];

    const oldModels = Array.isArray(value.models)
      ? value.models
          .map((model) =>
            typeof model === "string"
              ? model.trim()
              : model && typeof model === "object"
                ? String(
                    (model as Record<string, unknown>).name ??
                      (model as Record<string, unknown>).model ??
                      "",
                  ).trim()
                : "",
          )
          .filter(Boolean)
      : [];

    const series = Array.isArray(value.series)
      ? value.series.flatMap((entry) => {
          if (typeof entry === "string") {
            const seriesName = entry.trim();
            return seriesName
              ? [{ name: seriesName, models: [] as string[] }]
              : [];
          }

          if (!entry || typeof entry !== "object") return [];
          const seriesEntry = entry as Record<string, unknown>;
          const seriesName = String(seriesEntry.name ?? "").trim();
          if (!seriesName) return [];

          const models = Array.isArray(seriesEntry.models)
            ? seriesEntry.models
                .map((model) =>
                  typeof model === "string"
                    ? model.trim()
                    : model && typeof model === "object"
                      ? String(
                          (model as Record<string, unknown>).name ??
                            (model as Record<string, unknown>).model ??
                            "",
                        ).trim()
                      : "",
                )
                .filter(Boolean)
            : [];

          return [{ name: seriesName, models }];
        })
      : [];

    if (oldModels.length) {
      const general = series.find(
        (entry) => entry.name.toLowerCase() === "عام",
      );
      if (general) {
        general.models = [...new Set([...general.models, ...oldModels])];
      } else {
        series.push({ name: "عام", models: [...new Set(oldModels)] });
      }
    }

    return [
      {
        id: String(value.id ?? makeId()),
        name,
        models: [
          ...new Set([
            ...oldModels,
            ...series.flatMap((entry) => entry.models),
          ]),
        ],
        series,
      },
    ];
  });
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
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

function WarehousePage() {
  const [ready, setReady] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [batches, setBatches] = useState<WarehouseBatch[]>([]);
  const [accessoryBatches, setAccessoryBatches] = useState<
    AccessoryBatchRecord[]
  >([]);
  const [accessoryCategories, setAccessoryCategories] = useState<string[]>([]);
  const [accessoryBrands, setAccessoryBrands] = useState<string[]>([]);
  const [form, setForm] = useState<WarehouseForm>({ ...emptyForm });
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(true);
  const [toast, setToast] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    let cancelled = false;

    Promise.all([api.getBrands(), api.getWarehouseBatches()])
      .then(([storedBrands, storedBatches]) => {
        if (cancelled) return;

        setBrands(normalizeBrands(storedBrands));
        setBatches(
          storedBatches.map((item) => ({
            ...item,
            receivedQuantity: Number(item.receivedQuantity),
            availableQuantity: Number(item.availableQuantity),
            unitCost: Number(item.unitCost) || 0,
            salePrice:
              item.salePrice == null ? undefined : Number(item.salePrice),
            imeis: Array.isArray(item.imeis) ? item.imeis.map(String) : [],
          })),
        );

        // Keep mobile inventory usable even if accessory routes are not deployed yet.
        Promise.all([
          api.getAccessoryBatches(),
          api.getAccessoryCategories(),
          api.getAccessoryBrands(),
        ])
          .then(
            ([storedAccessories, storedCategories, storedAccessoryBrands]) => {
              if (cancelled) return;
              setAccessoryBatches(
                storedAccessories.map((item) => ({
                  ...item,
                  receivedQuantity: Number(item.receivedQuantity),
                  availableQuantity: Number(item.availableQuantity),
                  unitCost: Number(item.unitCost) || 0,
                  salePrice: Number(item.salePrice) || 0,
                })),
              );
              setAccessoryCategories(
                storedCategories.map((item) => item.name).filter(Boolean),
              );
              setAccessoryBrands(
                storedAccessoryBrands.map((item) => item.name).filter(Boolean),
              );
            },
          )
          .catch((error: unknown) => {
            if (cancelled) return;
            setToast(
              error instanceof Error
                ? `تم تحميل المخزن، لكن تعذر تحميل الإكسسوارات: ${error.message}`
                : "تم تحميل المخزن، لكن تعذر تحميل الإكسسوارات.",
            );
          })
          .finally(() => {
            if (!cancelled) setReady(true);
          });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setToast(
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
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const brandNames = useMemo(
    () => brands.map((brand) => brand.name).sort((a, b) => a.localeCompare(b)),
    [brands],
  );

  const selectedBrand = brands.find(
    (brand) => brand.name.toLowerCase() === form.brand.trim().toLowerCase(),
  );
  const seriesOptions = selectedBrand
    ? selectedBrand.series.map((entry) => entry.name)
    : [];
  const selectedSeries = selectedBrand?.series.find(
    (entry) => entry.name.toLowerCase() === form.series.trim().toLowerCase(),
  );
  const modelOptions = selectedSeries?.models ?? [];
  const compatibleModelOptions = useMemo(
    () =>
      [
        ...new Set(
          brands.flatMap((brand) =>
            (brand.series ?? []).flatMap((series) =>
              (series.models ?? []).map((model) =>
                [brand.name, series.name === "عام" ? "" : series.name, model]
                  .filter(Boolean)
                  .join(" "),
              ),
            ),
          ),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [brands],
  );

  const categoryKey = form.category.trim().toLocaleLowerCase();
  const isCaseCategory = /case|cover|جراب|حافظة|كفر/.test(categoryKey);
  const isScreenProtectorCategory =
    /screen|protector|glass|اسكرينة|سكرينة|واقي|زجاج/.test(categoryKey);

  const totalReceived = batches.reduce(
    (sum, batch) => sum + (Number(batch.receivedQuantity) || 0),
    0,
  );
  const totalAvailable = batches.reduce(
    (sum, batch) => sum + (Number(batch.availableQuantity) || 0),
    0,
  );
  const totalOutgoing = batches.reduce(
    (sum, batch) =>
      sum +
      Math.max(
        0,
        (Number(batch.receivedQuantity) || 0) -
          (Number(batch.availableQuantity) || 0),
      ),
    0,
  );
  const totalCostValue = batches.reduce(
    (sum, batch) =>
      sum +
      (Number(batch.availableQuantity) || 0) * (Number(batch.unitCost) || 0),
    0,
  );

  const accessoryTotals = useMemo(
    () =>
      accessoryBatches.reduce(
        (totals, batch) => ({
          received: totals.received + (Number(batch.receivedQuantity) || 0),
          available: totals.available + (Number(batch.availableQuantity) || 0),
          value:
            totals.value +
            (Number(batch.availableQuantity) || 0) *
              (Number(batch.unitCost) || 0),
        }),
        { received: 0, available: 0, value: 0 },
      ),
    [accessoryBatches],
  );

  const allReceived = totalReceived + accessoryTotals.received;
  const allAvailable = totalAvailable + accessoryTotals.available;
  const allOutgoing =
    totalOutgoing + accessoryTotals.received - accessoryTotals.available;
  const allCostValue = totalCostValue + accessoryTotals.value;

  const filteredAccessories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matches = accessoryBatches.filter((batch) =>
      [
        batch.category,
        batch.brand,
        batch.productName,
        batch.compatibleModel || "",
        batch.variantType || "",
        batch.variantValue || "",
        batch.supplierName || "",
      ].some((value) => String(value).toLocaleLowerCase().includes(query)),
    );
    return matches.sort((a, b) => Number(b.receivedAt) - Number(a.receivedAt));
  }, [accessoryBatches, search]);

  const modelGroups = useMemo<WarehouseModelGroup[]>(() => {
    const groups = new Map<string, WarehouseModelGroup>();

    batches.forEach((batch) => {
      const brand = batch.brand.trim();
      const series = batch.series?.trim() || "عام";
      const model = batch.model.trim();
      const key = JSON.stringify([
        brand.toLocaleLowerCase(),
        series.toLocaleLowerCase(),
        model.toLocaleLowerCase(),
      ]);
      const imeis = Array.isArray(batch.imeis) ? batch.imeis : [];
      const supplier = batch.supplierName?.trim() || "";
      const received = Number(batch.receivedQuantity) || 0;
      const available = Number(batch.availableQuantity) || 0;
      const outgoing = Math.max(0, received - available);
      const batchValue = available * (Number(batch.unitCost) || 0);
      const receivedAt = Number(batch.receivedAt) || 0;
      const existing = groups.get(key);

      if (existing) {
        existing.batches.push(batch);
        existing.totalReceived += received;
        existing.totalAvailable += available;
        existing.totalOutgoing += outgoing;
        existing.totalValue += batchValue;
        existing.totalImeis += imeis.length;
        existing.lastReceivedAt = Math.max(existing.lastReceivedAt, receivedAt);
        if (
          supplier &&
          !existing.suppliers.some(
            (name) => name.toLocaleLowerCase() === supplier.toLocaleLowerCase(),
          )
        ) {
          existing.suppliers.push(supplier);
        }
      } else {
        groups.set(key, {
          key,
          brand,
          series,
          model,
          batches: [batch],
          totalReceived: received,
          totalAvailable: available,
          totalOutgoing: outgoing,
          totalValue: batchValue,
          totalImeis: imeis.length,
          suppliers: supplier ? [supplier] : [],
          lastReceivedAt: receivedAt,
        });
      }
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        batches: [...group.batches].sort(
          (a, b) => (Number(b.receivedAt) || 0) - (Number(a.receivedAt) || 0),
        ),
      }))
      .sort((a, b) => b.lastReceivedAt - a.lastReceivedAt);
  }, [batches]);

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return modelGroups;

    return modelGroups.filter((group) => {
      const modelMatches = [group.brand, group.series, group.model].some(
        (value) => value.toLocaleLowerCase().includes(query),
      );
      const shipmentMatches = group.batches.some((batch) =>
        [
          batch.supplierName || "",
          ...(Array.isArray(batch.imeis) ? batch.imeis : []),
        ].some((value) => String(value).toLocaleLowerCase().includes(query)),
      );
      return modelMatches || shipmentMatches;
    });
  }, [modelGroups, search]);

  function notify(message: string) {
    setToast(message);
  }

  function updateForm<K extends keyof WarehouseForm>(
    key: K,
    value: WarehouseForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm({ ...emptyForm });
  }

  function addCompatibleModel() {
    const model = form.compatibleModel.trim();
    if (!model) {
      notify("ابحث عن موديل أو اكتبه الأول، وبعدها اضغط إضافة موديل.");
      return;
    }

    if (
      form.compatibleModels.some(
        (existing) =>
          existing.toLocaleLowerCase() === model.toLocaleLowerCase(),
      )
    ) {
      notify("الموديل ده مضاف بالفعل.");
      return;
    }

    setForm((current) => ({
      ...current,
      compatibleModels: [...current.compatibleModels, model],
      compatibleModel: "",
    }));
  }

  function removeCompatibleModel(modelToRemove: string) {
    setForm((current) => ({
      ...current,
      compatibleModels: current.compatibleModels.filter(
        (model) => model !== modelToRemove,
      ),
    }));
  }

  async function refreshAccessoryData() {
    const [storedAccessories, storedCategories, storedAccessoryBrands] =
      await Promise.all([
        api.getAccessoryBatches(),
        api.getAccessoryCategories(),
        api.getAccessoryBrands(),
      ]);
    setAccessoryBatches(
      storedAccessories.map((item) => ({
        ...item,
        receivedQuantity: Number(item.receivedQuantity),
        availableQuantity: Number(item.availableQuantity),
        unitCost: Number(item.unitCost) || 0,
        salePrice: Number(item.salePrice) || 0,
      })),
    );
    setAccessoryCategories(
      storedCategories.map((item) => item.name).filter(Boolean),
    );
    setAccessoryBrands(
      storedAccessoryBrands.map((item) => item.name).filter(Boolean),
    );
  }

  async function saveAccessoryCategory() {
    const name = form.category.trim();
    if (!name) {
      notify("اكتب نوع الإكسسوار الأول.");
      return;
    }
    try {
      const saved = await api.saveAccessoryCategory(name);
      setAccessoryCategories((current) =>
        [...new Set([...current, saved.name])].sort((a, b) =>
          a.localeCompare(b),
        ),
      );
      notify("تم حفظ نوع الإكسسوار.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر حفظ النوع.");
    }
  }

  async function saveAccessoryBrand() {
    const name = form.brand.trim();
    if (!name) {
      notify("اكتب ماركة الإكسسوار الأول.");
      return;
    }
    try {
      const saved = await api.saveAccessoryBrand(name);
      setAccessoryBrands((current) =>
        [...new Set([...current, saved.name])].sort((a, b) =>
          a.localeCompare(b),
        ),
      );
      notify("تم حفظ ماركة الإكسسوار.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر حفظ الماركة.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (form.itemType === "accessory") {
      const category = form.category.trim();
      const brand = form.brand.trim();
      const productName = form.model.trim();
      const quantity = Number(form.quantity);
      const unitCost = Number(form.unitCost);
      const salePrice = Number(form.salePrice);

      if (!category || !brand || !productName) {
        notify("حدّد نوع الإكسسوار والماركة واسم المنتج.");
        return;
      }
      if (!Number.isInteger(quantity) || quantity < 1) {
        notify("الكمية لازم تكون عددًا صحيحًا أكبر من صفر.");
        return;
      }
      if (
        form.unitCost.trim() === "" ||
        !Number.isFinite(unitCost) ||
        unitCost < 0
      ) {
        notify("من فضلك أدخل تكلفة وحدة صحيحة.");
        return;
      }
      if (
        form.salePrice.trim() === "" ||
        !Number.isFinite(salePrice) ||
        salePrice < 0
      ) {
        notify("من فضلك أدخل سعر بيع صحيح بالقطعة.");
        return;
      }

      const variantType = isCaseCategory
        ? "اللون والخامة"
        : isScreenProtectorCategory
          ? "نوع الحماية"
          : form.variantType.trim();
      const variantValue = isCaseCategory
        ? [form.caseColor.trim(), form.caseMaterial.trim()]
            .filter(Boolean)
            .join(" / ")
        : isScreenProtectorCategory
          ? form.variantValue.trim()
          : form.variantValue.trim();

      if (
        isCaseCategory &&
        (!form.caseColor.trim() || !form.caseMaterial.trim())
      ) {
        notify("حدّد لون الجراب وخامته.");
        return;
      }
      if (isScreenProtectorCategory && !variantValue) {
        notify("حدّد نوع حماية الشاشة.");
        return;
      }

      const newAccessoryBatch: AccessoryBatchRecord = {
        id: makeId(),
        itemType: "accessory",
        category,
        brand,
        productName,
        model: productName,
        compatibleModel: [
          ...new Set(
            [...form.compatibleModels, form.compatibleModel.trim()].filter(
              Boolean,
            ),
          ),
        ].join("، "),
        variantType,
        variantValue,
        receivedQuantity: quantity,
        availableQuantity: quantity,
        unitCost,
        salePrice,
        supplierName: form.supplierName.trim(),
        receivedAt: Date.now(),
      };

      try {
        await api.createAccessoryBatch(newAccessoryBatch);
        await refreshAccessoryData();
        resetForm();
        notify("تم تسجيل دفعة الإكسسوار في قاعدة البيانات بنجاح.");
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "تعذر حفظ دفعة الإكسسوار في قاعدة البيانات.",
        );
      }
      return;
    }

    const brand = form.brand.trim();
    const series = form.series.trim() || "عام";
    const model = form.model.trim();
    const quantity = Number(form.quantity);
    const unitCost = Number(form.unitCost);
    const salePrice = Number(form.salePrice);
    const imeis = form.imeisText
      .split(/[\n,،;\t ]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (!brand || !model) {
      notify("من فضلك حدّد الماركة والموديل.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      notify("الكمية لازم تكون عددًا صحيحًا أكبر من صفر.");
      return;
    }
    if (
      form.unitCost.trim() === "" ||
      !Number.isFinite(unitCost) ||
      unitCost < 0
    ) {
      notify("من فضلك أدخل تكلفة وحدة صحيحة.");
      return;
    }
    if (
      form.salePrice.trim() === "" ||
      !Number.isFinite(salePrice) ||
      salePrice < 0
    ) {
      notify("من فضلك أدخل سعر بيع صحيح بالقطعة.");
      return;
    }
    if (imeis.length > quantity) {
      notify("عدد أرقام IMEI أكبر من كمية الدفعة.");
      return;
    }

    const normalizedImeis = imeis.map((imei) => imei.toLowerCase());
    if (new Set(normalizedImeis).size !== normalizedImeis.length) {
      notify("يوجد رقم IMEI مكرر في البيانات المدخلة.");
      return;
    }

    const batchImeis = batches.flatMap((batch) =>
      Array.isArray(batch.imeis) ? batch.imeis : [],
    );
    if (
      normalizedImeis.some((imei) =>
        batchImeis.some((known) => String(known).toLowerCase() === imei),
      )
    ) {
      notify(
        "رقم IMEI موجود بالفعل في المخزن. سيتم التحقق مرة أخرى من قاعدة البيانات.",
      );
    }

    const newBatch = {
      id: makeId(),
      brand,
      series,
      model,
      receivedQuantity: quantity,
      availableQuantity: quantity,
      unitCost,
      salePrice,
      supplierName: form.supplierName.trim(),
      receivedAt: Date.now(),
      imeis,
    };
    try {
      await api.createWarehouseBatch(newBatch);
      const [freshBrands, freshBatches] = await Promise.all([
        api.getBrands(),
        api.getWarehouseBatches(),
      ]);
      setBrands(normalizeBrands(freshBrands));
      setBatches(freshBatches);
      resetForm();
      notify("تم تسجيل دفعة المخزن في قاعدة البيانات بنجاح.");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "تعذر حفظ دفعة المخزن في قاعدة البيانات.",
      );
    }
  }

  async function deleteBatch(batch: WarehouseBatch) {
    const received = Number(batch.receivedQuantity) || 0;
    const available = Number(batch.availableQuantity) || 0;
    if (available < received) {
      notify(
        "مينفعش تحذف دفعة خرج منها أجهزة؛ ده هيأثر على سجل المبيعات والمخزن.",
      );
      return;
    }
    const confirmed = window.confirm(
      `هل أنت متأكد من حذف دفعة ${batch.brand} ${batch.model}؟`,
    );
    if (!confirmed) return;
    try {
      await api.deleteWarehouseBatch(batch.id);
      setBatches(await api.getWarehouseBatches());
      notify("تم حذف الدفعة.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر حذف الدفعة.");
    }
  }

  if (!ready) {
    return (
      <div
        dir="rtl"
        className="rounded-xl border border-slate-200 bg-white p-6 text-slate-700"
      >
        جاري تحميل بيانات المخزن...
      </div>
    );
  }

  return (
    <div dir="rtl" lang="ar" className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <Package size={17} /> إدارة المخزن
          </>
        }
        title="استلام بضاعة المخزن"
        description="سجّل الموبايلات والإكسسوارات، والكميات الواردة وتكلفة الشراء وسعر البيع."
        actions={
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="app-btn-primary"
          >
            {showForm ? <X size={18} /> : <Plus size={18} />}
            {showForm ? "إخفاء النموذج" : "استلام دفعة جديدة"}
          </button>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<ClipboardList size={20} />}
          title="إجمالي الوارد"
          value={numberText(allReceived)}
          note="إجمالي الموبايلات والإكسسوارات الواردة"
        />
        <StatCard
          icon={<Smartphone size={20} />}
          title="إجمالي المنصرف"
          value={numberText(allOutgoing)}
          note="الوارد ناقص الرصيد المتاح"
        />
        <StatCard
          icon={<Package size={20} />}
          title="الرصيد المتاح"
          value={numberText(allAvailable)}
          note="الوحدات المتاحة من الموبايلات والإكسسوارات"
          tone="success"
        />
        <StatCard
          icon={<Package size={20} />}
          title="قيمة الرصيد بالتكلفة"
          value={money(allCostValue)}
          note="الكمية المتاحة × تكلفة الوحدة"
          tone="info"
        />
      </section>

      {showForm && (
        <section className="overflow-visible rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-5 md:px-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Plus size={21} />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">استلام دفعة جديدة</h2>
              <p className="mt-1 text-xs text-gray-500">
                اختر نوع الصنف أولًا، ثم أدخل بيانات الاستلام. أرقام IMEI تخص
                الموبايلات فقط.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 p-5 md:p-7">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="نوع الصنف *">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        itemType: "mobile",
                        brand: "",
                        series: "",
                        model: "",
                        category: "",
                        compatibleModel: "",
                        compatibleModels: [],
                        variantType: "",
                        variantValue: "",
                        caseColor: "",
                        caseMaterial: "",
                        imeisText: "",
                      }))
                    }
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                      form.itemType === "mobile"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Smartphone size={16} className="ml-1 inline" />
                    موبايل
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        itemType: "accessory",
                        brand: "",
                        series: "",
                        model: "",
                        category: "",
                        compatibleModel: "",
                        compatibleModels: [],
                        variantType: "",
                        variantValue: "",
                        caseColor: "",
                        caseMaterial: "",
                        imeisText: "",
                      }))
                    }
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                      form.itemType === "accessory"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Package size={16} className="ml-1 inline" />
                    إكسسوار
                  </button>
                </div>
              </Field>

              {form.itemType === "mobile" ? (
                <>
                  <Field label="الماركة *">
                    <SearchSelect
                      value={form.brand}
                      options={brandNames}
                      placeholder="ابحث أو اكتب ماركة"
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          brand: value,
                          series: "",
                          model: "",
                        }))
                      }
                    />
                  </Field>

                  <Field label="السلسلة">
                    <SearchSelect
                      value={form.series}
                      options={seriesOptions}
                      placeholder="اختر أو اكتب سلسلة"
                      disabled={!form.brand.trim()}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          series: value,
                          model: "",
                        }))
                      }
                    />
                  </Field>

                  <Field label="الموديل *">
                    <SearchSelect
                      value={form.model}
                      options={modelOptions}
                      placeholder="ابحث أو اكتب موديل"
                      disabled={!form.brand.trim()}
                      onChange={(value) => updateForm("model", value)}
                    />
                  </Field>

                  <Field label="الكمية الواردة *">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.quantity}
                      onChange={(event) =>
                        updateForm("quantity", event.target.value)
                      }
                      dir="ltr"
                      inputMode="numeric"
                      className={`${inputClass} text-left`}
                    />
                  </Field>

                  <Field label="تكلفة الوحدة (EG) *">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.unitCost}
                      onChange={(event) =>
                        updateForm("unitCost", event.target.value)
                      }
                      placeholder="تكلفة شراء الجهاز الواحد"
                      dir="ltr"
                      inputMode="decimal"
                      className={`${inputClass} text-left`}
                    />
                  </Field>

                  <Field label="سعر البيع بالقطعة (EG) *">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.salePrice}
                      onChange={(event) =>
                        updateForm("salePrice", event.target.value)
                      }
                      placeholder="سعر بيع الجهاز بالقطعة"
                      dir="ltr"
                      inputMode="decimal"
                      className={`${inputClass} text-left`}
                    />
                  </Field>

                  <Field label="اسم المورد">
                    <input
                      value={form.supplierName}
                      onChange={(event) =>
                        updateForm("supplierName", event.target.value)
                      }
                      placeholder="اسم المورد (اختياري)"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="أرقام IMEI (اختياري)">
                    <textarea
                      value={form.imeisText}
                      onChange={(event) =>
                        updateForm("imeisText", event.target.value)
                      }
                      placeholder="كل رقم في سطر أو افصل بينها بفواصل"
                      rows={2}
                      className={inputClass}
                      dir="ltr"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="نوع الإكسسوار *">
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <SearchSelect
                          value={form.category}
                          options={accessoryCategories}
                          placeholder="ابحث أو اكتب النوع"
                          onChange={(value) => {
                            const key = value.trim().toLocaleLowerCase();
                            const isCase = /case|cover|جراب|حافظة|كفر/.test(
                              key,
                            );
                            const isGlass =
                              /screen|protector|glass|اسكرينة|سكرينة|واقي|زجاج/.test(
                                key,
                              );
                            setForm((current) => ({
                              ...current,
                              category: value,
                              variantType: isGlass
                                ? "نوع الحماية"
                                : isCase
                                  ? "اللون والخامة"
                                  : "",
                              variantValue: "",
                              caseColor: "",
                              caseMaterial: "",
                            }));
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={saveAccessoryCategory}
                        className="app-btn-secondary shrink-0 px-3"
                        title="حفظ النوع"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </Field>

                  <Field label="ماركة الإكسسوار *">
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <SearchSelect
                          value={form.brand}
                          options={accessoryBrands}
                          placeholder="ابحث أو اكتب الماركة"
                          onChange={(value) => updateForm("brand", value)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={saveAccessoryBrand}
                        className="app-btn-secondary shrink-0 px-3"
                        title="حفظ الماركة"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </Field>

                  <Field label="اسم الإكسسوار *">
                    <input
                      value={form.model}
                      onChange={(event) =>
                        updateForm("model", event.target.value)
                      }
                      placeholder="مثال: جراب سيليكون أو اسكرينة"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="متوافق مع الموبايلات (اختياري - تقدر تختار أكتر من موديل)">
                    <div className="space-y-2">
                      <SearchSelect
                        value={form.compatibleModel}
                        options={compatibleModelOptions}
                        placeholder="ابحث بالموديل مثل A14 أو اكتب موديل"
                        onChange={(value) =>
                          updateForm("compatibleModel", value)
                        }
                      />
                      <button
                        type="button"
                        onClick={addCompatibleModel}
                        className="app-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm"
                      >
                        <Plus size={15} /> إضافة موديل
                      </button>
                      {form.compatibleModels.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {form.compatibleModels.map((model) => (
                            <span
                              key={model}
                              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800"
                            >
                              {model}
                              <button
                                type="button"
                                onClick={() => removeCompatibleModel(model)}
                                className="rounded-full p-0.5 hover:bg-emerald-100"
                                aria-label={`إزالة موديل ${model}`}
                                title="إزالة الموديل"
                              >
                                <X size={13} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs leading-5 text-gray-500">
                        تقدر تضيف أكتر من جهاز لنفس الإكسسوار، أو تسيب الاختيار
                        فاضي لو الإكسسوار عام.
                      </p>
                    </div>
                  </Field>

                  {isCaseCategory ? (
                    <>
                      <Field label="لون الجراب *">
                        <SearchSelect
                          value={form.caseColor}
                          options={[
                            "أسود",
                            "كحلي",
                            "شفاف",
                            "أزرق",
                            "أحمر",
                            "أخضر",
                            "وردي",
                            "بنفسجي",
                            "بني",
                            "أبيض",
                          ]}
                          placeholder="اختر أو اكتب اللون"
                          onChange={(value) => updateForm("caseColor", value)}
                        />
                      </Field>
                      <Field label="خامة الجراب *">
                        <SearchSelect
                          value={form.caseMaterial}
                          options={[
                            "سيليكون",
                            "جلد",
                            "هارد",
                            "مضاد للصدمات",
                            "Armor",
                          ]}
                          placeholder="اختر أو اكتب الخامة"
                          onChange={(value) =>
                            updateForm("caseMaterial", value)
                          }
                        />
                      </Field>
                    </>
                  ) : isScreenProtectorCategory ? (
                    <Field label="نوع حماية الشاشة *">
                      <SearchSelect
                        value={form.variantValue}
                        options={[
                          "شفافة لامعة",
                          "مات",
                          "خصوصية",
                          "زجاج HD",
                          "زجاج مقوى",
                        ]}
                        placeholder="اختر أو اكتب النوع"
                        onChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            variantType: "نوع الحماية",
                            variantValue: value,
                          }))
                        }
                      />
                    </Field>
                  ) : (
                    <>
                      <Field label="الخاصية / المواصفة (اختياري)">
                        <input
                          value={form.variantType}
                          onChange={(event) =>
                            updateForm("variantType", event.target.value)
                          }
                          placeholder="مثال: قدرة الشاحن، طول الكابل، سعة الباور بنك"
                          className={inputClass}
                        />
                      </Field>
                      <Field label="قيمة الخاصية (اختياري)">
                        <input
                          value={form.variantValue}
                          onChange={(event) =>
                            updateForm("variantValue", event.target.value)
                          }
                          placeholder="مثال: 20 وات، 1 متر، 10000 مللي أمبير"
                          className={inputClass}
                        />
                      </Field>
                      <p className="text-xs leading-5 text-gray-500 sm:col-span-2 lg:col-span-3">
                        الخاصية هي الحاجة اللي بتميز المنتج، والقيمة بتحدد
                        مواصفته بالضبط؛ زي قدرة الشاحن = 20 وات. مش لازم تملأ
                        الخانتين لو مش محتاجهم.
                      </p>
                    </>
                  )}

                  <Field label="الكمية الواردة *">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.quantity}
                      onChange={(event) =>
                        updateForm("quantity", event.target.value)
                      }
                      dir="ltr"
                      inputMode="numeric"
                      className={`${inputClass} text-left`}
                    />
                  </Field>

                  <Field label="تكلفة الوحدة (ج.م) *">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.unitCost}
                      onChange={(event) =>
                        updateForm("unitCost", event.target.value)
                      }
                      placeholder="تكلفة شراء القطعة"
                      dir="ltr"
                      inputMode="decimal"
                      className={`${inputClass} text-left`}
                    />
                  </Field>

                  <Field label="سعر البيع بالقطعة (ج.م) *">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.salePrice}
                      onChange={(event) =>
                        updateForm("salePrice", event.target.value)
                      }
                      placeholder="سعر بيع القطعة"
                      dir="ltr"
                      inputMode="decimal"
                      className={`${inputClass} text-left`}
                    />
                  </Field>

                  <Field label="اسم المورد">
                    <input
                      value={form.supplierName}
                      onChange={(event) =>
                        updateForm("supplierName", event.target.value)
                      }
                      placeholder="اسم المورد (اختياري)"
                      className={inputClass}
                    />
                  </Field>
                </>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetForm}
                className="app-btn-secondary"
              >
                <X size={16} /> تفريغ الحقول
              </button>
              <button type="submit" className="app-btn-primary">
                <Check size={17} /> تسجيل الدفعة
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-5 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <h2 className="font-bold text-gray-900">رصيد المخزن حسب الموديل</h2>
            <p className="mt-1 text-sm text-gray-500">
              {numberText(filteredGroups.length)} موديل ·{" "}
              {numberText(batches.length)} شحنة
            </p>
          </div>
          <div className="relative min-w-0 sm:w-80">
            <Search
              size={17}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="بحث بالماركة أو الموديل أو المورد أو IMEI..."
              className={`${inputClass} pr-9`}
            />
          </div>
        </div>

        {filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
              <Package size={26} />
            </div>
            <h3 className="mt-4 font-semibold text-gray-800">
              لا توجد دفعات مسجلة
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
              {modelGroups.length === 0
                ? "ابدأ بتسجيل أول دفعة من النموذج بالأعلى."
                : "لم يتم العثور على نتائج مطابقة للبحث."}
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="app-table min-w-[1250px]">
              <thead>
                <tr>
                  <th className="px-5 py-4">الجهاز</th>
                  <th className="px-5 py-4">الموردون</th>
                  <th className="px-5 py-4">آخر استلام</th>
                  <th className="px-5 py-4">الوارد</th>
                  <th className="px-5 py-4">المنصرف</th>
                  <th className="px-5 py-4">المتاح</th>
                  <th className="px-5 py-4">تكلفة الوحدة</th>
                  <th className="px-5 py-4">سعر البيع بالقطعة</th>
                  <th className="px-5 py-4">قيمة الرصيد</th>
                  <th className="px-5 py-4">IMEI المسجلة</th>
                  <th className="px-5 py-4">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredGroups.map((group) => {
                  const isExpanded = expandedGroups.has(group.key);
                  const uniqueCosts = [
                    ...new Set(
                      group.batches.map((batch) => Number(batch.unitCost) || 0),
                    ),
                  ];
                  const unitCostLabel =
                    uniqueCosts.length === 1 ? money(uniqueCosts[0]) : "متغير";

                  const salePrices = group.batches.map((batch) =>
                    batch.salePrice == null ||
                    !Number.isFinite(Number(batch.salePrice))
                      ? null
                      : Number(batch.salePrice),
                  );
                  const uniqueSalePrices = [...new Set(salePrices)];
                  const salePriceLabel =
                    uniqueSalePrices.length === 1 &&
                    uniqueSalePrices[0] !== null
                      ? money(uniqueSalePrices[0])
                      : uniqueSalePrices.every((price) => price === null)
                        ? "غير محدد"
                        : "متغير";

                  const supplierLabel =
                    group.suppliers.length === 0
                      ? "—"
                      : group.suppliers.length === 1
                        ? group.suppliers[0]
                        : `${numberText(group.suppliers.length)} موردين`;

                  return (
                    <Fragment key={group.key}>
                      <tr className="bg-white transition hover:bg-gray-50">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-gray-900">
                            {group.brand} {group.model}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            السلسلة: {group.series}
                          </p>
                          <p className="mt-1 text-xs font-medium text-emerald-700">
                            {numberText(group.batches.length)} شحنة
                          </p>
                        </td>
                        <td className="px-5 py-4 text-gray-600">
                          {supplierLabel}
                        </td>
                        <td className="px-5 py-4 text-gray-600">
                          {formatDate(group.lastReceivedAt)}
                        </td>
                        <td className="px-5 py-4 font-semibold text-gray-800">
                          {numberText(group.totalReceived)}
                        </td>
                        <td className="px-5 py-4 font-semibold text-amber-700">
                          {numberText(group.totalOutgoing)}
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
                            {numberText(group.totalAvailable)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-gray-700" dir="ltr">
                          {unitCostLabel}
                        </td>
                        <td className="px-5 py-4 text-gray-700" dir="ltr">
                          {salePriceLabel}
                        </td>
                        <td
                          className="px-5 py-4 font-semibold text-gray-900"
                          dir="ltr"
                        >
                          {money(group.totalValue)}
                        </td>
                        <td className="px-5 py-4 text-gray-600">
                          {numberText(group.totalImeis)} رقم
                        </td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedGroups((current) => {
                                const next = new Set(current);
                                if (next.has(group.key)) next.delete(group.key);
                                else next.add(group.key);
                                return next;
                              })
                            }
                            title={
                              isExpanded
                                ? "إخفاء تفاصيل الشحنات"
                                : "عرض تفاصيل الشحنات"
                            }
                            aria-label={
                              isExpanded
                                ? `إخفاء شحنات ${group.brand} ${group.model}`
                                : `عرض شحنات ${group.brand} ${group.model}`
                            }
                            aria-expanded={isExpanded}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp size={15} /> إخفاء
                              </>
                            ) : (
                              <>
                                <ChevronDown size={15} /> الشحنات
                              </>
                            )}
                          </button>
                        </td>
                      </tr>

                      {isExpanded &&
                        group.batches.map((batch, index) => {
                          const received = Number(batch.receivedQuantity) || 0;
                          const available =
                            Number(batch.availableQuantity) || 0;
                          const outgoing = Math.max(0, received - available);
                          return (
                            <tr
                              key={batch.id}
                              className="bg-gray-50/80 transition hover:bg-emerald-50/40"
                            >
                              <td className="px-5 py-4 pr-10">
                                <p className="text-sm font-medium text-gray-700">
                                  ↳ الشحنة {numberText(index + 1)}
                                </p>
                                <p className="mt-1 text-xs text-gray-400">
                                  {batch.brand} {batch.model}
                                </p>
                              </td>
                              <td className="px-5 py-4 text-gray-600">
                                {batch.supplierName || "—"}
                              </td>
                              <td className="px-5 py-4 text-gray-600">
                                {formatDate(batch.receivedAt)}
                              </td>
                              <td className="px-5 py-4 font-medium text-gray-700">
                                {numberText(received)}
                              </td>
                              <td className="px-5 py-4 font-medium text-amber-700">
                                {numberText(outgoing)}
                              </td>
                              <td className="px-5 py-4">
                                <span className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                                  {numberText(available)}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-gray-700" dir="ltr">
                                {money(Number(batch.unitCost) || 0)}
                              </td>
                              <td className="px-5 py-4 text-gray-700" dir="ltr">
                                {batch.salePrice == null
                                  ? "غير محدد"
                                  : money(Number(batch.salePrice) || 0)}
                              </td>
                              <td
                                className="px-5 py-4 font-medium text-gray-800"
                                dir="ltr"
                              >
                                {money(
                                  available * (Number(batch.unitCost) || 0),
                                )}
                              </td>
                              <td className="px-5 py-4 text-gray-600">
                                {numberText(
                                  Array.isArray(batch.imeis)
                                    ? batch.imeis.length
                                    : 0,
                                )}{" "}
                                رقم
                              </td>
                              <td className="px-5 py-4">
                                <button
                                  type="button"
                                  onClick={() => deleteBatch(batch)}
                                  title="حذف هذه الشحنة فقط"
                                  aria-label={`حذف شحنة ${batch.brand} ${batch.model}`}
                                  className="rounded-lg border border-red-100 p-2 text-red-500 transition hover:bg-red-50"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50/70 px-5 py-4 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            عرض {numberText(filteredGroups.length)} من{" "}
            {numberText(modelGroups.length)} موديل
          </span>
          <span>
            إجمالي الشحنات: {numberText(batches.length)} · البيانات من قاعدة
            البيانات المشتركة.
          </span>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-gray-100 p-5 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <h2 className="font-bold text-gray-900">رصيد الإكسسوارات</h2>
            <p className="mt-1 text-sm text-gray-500">
              {numberText(filteredAccessories.length)} دفعة من أصل{" "}
              {numberText(accessoryBatches.length)}
            </p>
          </div>
          <span className="text-sm font-semibold text-emerald-700">
            المتاح: {numberText(accessoryTotals.available)} قطعة
          </span>
        </div>

        {filteredAccessories.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">
            {accessoryBatches.length === 0
              ? "لسه مفيش إكسسوارات مسجلة. اختار إكسسوار من نموذج الاستلام بالأعلى."
              : "مفيش إكسسوارات مطابقة للبحث."}
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="app-table min-w-[1150px]">
              <thead>
                <tr>
                  <th className="px-5 py-4">الإكسسوار</th>
                  <th className="px-5 py-4">المتوافق مع</th>
                  <th className="px-5 py-4">النوع / المتغير</th>
                  <th className="px-5 py-4">المورد</th>
                  <th className="px-5 py-4">آخر استلام</th>
                  <th className="px-5 py-4">الوارد</th>
                  <th className="px-5 py-4">المنصرف</th>
                  <th className="px-5 py-4">المتاح</th>
                  <th className="px-5 py-4">تكلفة الوحدة</th>
                  <th className="px-5 py-4">سعر البيع</th>
                  <th className="px-5 py-4">قيمة الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAccessories.map((batch) => {
                  const received = Number(batch.receivedQuantity) || 0;
                  const available = Number(batch.availableQuantity) || 0;
                  return (
                    <tr key={batch.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-900">
                          {batch.productName}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {batch.category} · {batch.brand}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {batch.compatibleModel
                          ? batch.compatibleModel
                              .split(/[،,;]+/)
                              .map((model) => model.trim())
                              .filter(Boolean)
                              .join("، ")
                          : "غير محدد"}
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        <p>{batch.variantType || "—"}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {batch.variantValue || "—"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {batch.supplierName || "—"}
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {formatDate(batch.receivedAt)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-gray-800">
                        {numberText(received)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-amber-700">
                        {numberText(Math.max(0, received - available))}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
                          {numberText(available)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-700" dir="ltr">
                        {money(Number(batch.unitCost) || 0)}
                      </td>
                      <td className="px-5 py-4 text-gray-700" dir="ltr">
                        {money(Number(batch.salePrice) || 0)}
                      </td>
                      <td
                        className="px-5 py-4 font-semibold text-gray-900"
                        dir="ltr"
                      >
                        {money(available * (Number(batch.unitCost) || 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-gray-100 bg-gray-50/70 px-5 py-4 text-xs text-gray-500">
          إجمالي دفعات الإكسسوارات: {numberText(accessoryBatches.length)} ·
          تكلفة الرصيد المتاح: {money(accessoryTotals.value)}
        </div>
      </section>

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-[100] flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800 shadow-xl"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <Check size={16} />
          </span>
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast("")}
            className="mr-1 rounded-md p-1 text-gray-400 hover:bg-gray-100"
            aria-label="إغلاق التنبيه"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
