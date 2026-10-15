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
import { api } from "../lib/api-client";

export const Route = createFileRoute("/warehouse")({
  component: WarehousePage,
});

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10";
const labelClass = "mb-2 block text-sm font-medium text-gray-700";

type WarehouseForm = {
  brand: string;
  series: string;
  model: string;
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
  brand: "",
  series: "",
  model: "",
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function numberText(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
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
        setReady(true);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
      <main dir="rtl" className="min-h-screen bg-gray-50 p-6 text-gray-700">
        جاري تحميل بيانات المخزن...
      </main>
    );
  }

  return (
    <main dir="rtl" lang="ar" className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
              <Package size={17} /> إدارة المخزن
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
              استلام بضاعة المخزن
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              سجّل الكميات الواردة وسعر البيع بالقطعة، وأضف أرقام IMEI المتاحة
              عند الاستلام.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            {showForm ? <X size={18} /> : <Plus size={18} />}
            {showForm ? "إخفاء النموذج" : "استلام دفعة جديدة"}
          </button>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<ClipboardList size={20} />}
            title="إجمالي الوارد"
            value={numberText(totalReceived)}
            note="كل الوحدات التي تم تسجيل استلامها"
          />
          <StatCard
            icon={<Smartphone size={20} />}
            title="إجمالي المنصرف"
            value={numberText(totalOutgoing)}
            note="الوارد ناقص الرصيد المتاح"
          />
          <StatCard
            icon={<Package size={20} />}
            title="الرصيد المتاح"
            value={numberText(totalAvailable)}
            note="الوحدات المتاحة حسب دفعات المخزن"
          />
          <StatCard
            icon={<Package size={20} />}
            title="قيمة الرصيد بالتكلفة"
            value={money(totalCostValue)}
            note="الكمية المتاحة × تكلفة الوحدة"
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
                  أدخل تكلفة الشراء وسعر البيع بالقطعة. أرقام IMEI اختيارية عند
                  الاستلام.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 p-5 md:p-7">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

                <Field label="تكلفة الوحدة (EGP) *">
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

                <Field label="سعر البيع بالقطعة (EGP) *">
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
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
                >
                  <X size={16} /> تفريغ الحقول
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <Check size={17} /> تسجيل الدفعة
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-5 md:flex-row md:items-center md:justify-between md:px-6">
            <div>
              <h2 className="font-bold text-gray-900">
                رصيد المخزن حسب الموديل
              </h2>
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
              <table className="w-full min-w-[1250px] text-right text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500">
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
                        group.batches.map(
                          (batch) => Number(batch.unitCost) || 0,
                        ),
                      ),
                    ];
                    const unitCostLabel =
                      uniqueCosts.length === 1
                        ? money(uniqueCosts[0])
                        : "متغير";

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
                            {group.lastReceivedAt
                              ? new Date(
                                  group.lastReceivedAt,
                                ).toLocaleDateString("ar-EG")
                              : "—"}
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
                                  if (next.has(group.key))
                                    next.delete(group.key);
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
                            const received =
                              Number(batch.receivedQuantity) || 0;
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
                                  {batch.receivedAt
                                    ? new Date(
                                        batch.receivedAt,
                                      ).toLocaleDateString("ar-EG")
                                    : "—"}
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
                                <td
                                  className="px-5 py-4 text-gray-700"
                                  dir="ltr"
                                >
                                  {money(Number(batch.unitCost) || 0)}
                                </td>
                                <td
                                  className="px-5 py-4 text-gray-700"
                                  dir="ltr"
                                >
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
              إجمالي الشحنات: {numberText(batches.length)} · البيانات محفوظة على
              هذا المتصفح فقط.
            </span>
          </div>
        </section>
      </div>

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
    </main>
  );
}

function StatCard({
  icon,
  title,
  value,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-gray-900">
            {value}
          </p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-400">{note}</p>
    </div>
  );
}
