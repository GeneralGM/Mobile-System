/* eslint-disable prettier/prettier */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BadgePercent,
  Check,
  CircleDollarSign,
  Clock3,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Smartphone,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import SearchSelect from "../components/SearchSelect";
import type {
  Brand,
  Device,
  DeviceStatus,
  Offer,
  DeviceForm,
} from "@/types/device";
export const Route = createFileRoute("/devices")({
  component: DevicesPage,
});

const BRANDS_KEY = "mobile-system-brands-v1";
const DEVICES_KEY = "mobile-system-devices-v1";
const DAY_MS = 24 * 60 * 60 * 1000;

const emptyForm: DeviceForm = {
  imei: "",
  brand: "",
  series: "",
  model: "",
  color: "",
  ram: "",
  storage: "",
  salePrice: "",
  offerName: "",
  discountType: "percent",
  discountValue: "",
  durationDays: "7",
  installmentPrice: "",
};

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10";

const labelClass = "mb-2 block text-sm font-medium text-gray-700";

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
  }).format(value);
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function normalizeBrands(raw: unknown): Brand[] {
  if (!Array.isArray(raw)) return [];

  const result: Brand[] = [];

  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      result.push({
        id: makeId(),
        name: item.trim(),
        models: [],
        series: [],
      });
      continue;
    }

    if (!item || typeof item !== "object") continue;

    const value = item as Record<string, unknown>;
    const name = String(value.name ?? value.brand ?? "").trim();
    if (!name) continue;

    const models = Array.isArray(value.models)
      ? value.models
          .map((model) => {
            if (typeof model === "string") return model.trim();
            if (model && typeof model === "object") {
              const entry = model as Record<string, unknown>;
              return String(entry.name ?? entry.model ?? "").trim();
            }
            return "";
          })
          .filter(Boolean)
      : [];

    const rawSeries = Array.isArray(value.series) ? value.series : [];

    const series: Brand["series"] = rawSeries
      .map((entry) => {
        if (typeof entry === "string") {
          return { name: entry.trim(), models: [] };
        }

        if (!entry || typeof entry !== "object") return null;

        const seriesEntry = entry as Record<string, unknown>;
        const seriesName = String(seriesEntry.name ?? "").trim();
        if (!seriesName) return null;

        const seriesModels = Array.isArray(seriesEntry.models)
          ? seriesEntry.models
              .map((model) => {
                if (typeof model === "string") return model.trim();
                if (model && typeof model === "object") {
                  const modelEntry = model as Record<string, unknown>;
                  return String(
                    modelEntry.name ?? modelEntry.model ?? "",
                  ).trim();
                }
                return "";
              })
              .filter(Boolean)
          : [];

        return {
          name: seriesName,
          models: seriesModels,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    // ترحيل الموديلات القديمة إلى السلسلة الافتراضية "عام".
    if (models.length > 0) {
      const generalSeries = series.find(
        (entry) => entry.name.toLowerCase() === "عام",
      );

      if (generalSeries) {
        generalSeries.models = [
          ...new Set([...generalSeries.models, ...models]),
        ];
      } else {
        series.push({ name: "عام", models: [...new Set(models)] });
      }
    }

    // إزالة تكرار أسماء السلاسل مع الحفاظ على موديلاتها.
    const uniqueSeries: Brand["series"] = [];

    for (const entry of series) {
      const existing = uniqueSeries.find(
        (current) => current.name.toLowerCase() === entry.name.toLowerCase(),
      );

      if (existing) {
        existing.models = [...new Set([...existing.models, ...entry.models])];
      } else {
        uniqueSeries.push({
          name: entry.name,
          models: [...new Set(entry.models)],
        });
      }
    }

    result.push({
      id: String(value.id ?? makeId()),
      name,
      models: [
        ...new Set([
          ...models,
          ...uniqueSeries.flatMap((entry) => entry.models),
        ]),
      ],
      series: uniqueSeries,
    });
  }

  return result.filter(
    (brand, index, all) =>
      all.findIndex(
        (other) => other.name.toLowerCase() === brand.name.toLowerCase(),
      ) === index,
  );
}

function normalizeDevice(raw: unknown): Device | null {
  if (!raw || typeof raw !== "object") return null;

  const item = raw as Record<string, unknown>;
  const brand = String(item.brand ?? "").trim();
  const model = String(item.model ?? "").trim();
  const imei = String(item.imei ?? "").trim();

  if (!brand || !model || !imei) return null;
  const series = String(item.series ?? "عام").trim() || "عام";

  const installmentPriceValue = Number(
    item.installmentPrice ??
      item.installment_price ??
      item.salePrice ??
      item.sale_price ??
      item.price ??
      0,
  );

  // محاولة فصل الرام والسعة من السجلات القديمة التي كانت تجمعهما في storage.
  const oldStorage = String(
    item.storageCapacity ?? item.storage ?? item.capacity ?? "",
  );
  const ramMatch = oldStorage.match(/(\d+)\s*GB\s*RAM/i);
  const capacityMatch = oldStorage.match(/(\d+)\s*GB(?!\s*RAM)/i);

  const ram = String(item.ram ?? (ramMatch ? `${ramMatch[1]} GB` : ""));
  const storage = String(
    item.storageCapacity ??
      (capacityMatch ? `${capacityMatch[1]} GB` : oldStorage),
  );

  const rawOffer = item.offer;
  let offer: Offer | null = null;

  if (rawOffer && typeof rawOffer === "object") {
    const offerData = rawOffer as Record<string, unknown>;
    const discountType =
      offerData.discountType === "fixed" ? "fixed" : "percent";
    const discountValue = Number(offerData.discountValue ?? 0);
    const durationDays = Number(offerData.durationDays ?? 7);
    const expiresAt = Number(offerData.expiresAt ?? 0);

    offer = {
      name: String(offerData.name ?? ""),
      discountType,
      discountValue: Number.isFinite(discountValue) ? discountValue : 0,
      durationDays:
        Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 7,
      expiresAt:
        Number.isFinite(expiresAt) && expiresAt > 0
          ? expiresAt
          : Date.now() + DAY_MS * 7,
    };
  }

  const statusValue = String(item.status ?? "available");
  const status: DeviceStatus =
    statusValue === "sold" || statusValue === "reserved"
      ? statusValue
      : "available";

  const salePrice = Number(
    item.salePrice ?? item.sale_price ?? item.price ?? 0,
  );

  return {
    id: String(item.id ?? makeId()),
    imei,
    brand,
    model,
    color: String(item.color ?? ""),
    ram,
    storage,
    salePrice: Number.isFinite(salePrice) ? salePrice : 0,
    offer,
    status,
    createdAt: Number(item.createdAt ?? item.created_at ?? Date.now()),
    series,
    installmentPrice: Number.isFinite(installmentPriceValue)
      ? installmentPriceValue
      : 0,
  };
}

function isOfferActive(offer: Offer | null | undefined) {
  return Boolean(
    offer &&
    offer.name.trim() &&
    offer.expiresAt > Date.now() &&
    offer.discountValue > 0,
  );
}

function getFinalPrice(device: Device) {
  const offer = device.offer;
  if (!isOfferActive(offer) || !offer) return device.salePrice;

  const discount =
    offer.discountType === "percent"
      ? (device.salePrice * offer.discountValue) / 100
      : offer.discountValue;

  return Math.max(0, device.salePrice - discount);
}

function getStatusLabel(status: DeviceStatus) {
  if (status === "sold") return "تم البيع";
  if (status === "reserved") return "محجوز";
  return "متاح";
}

function getStatusClass(status: DeviceStatus) {
  if (status === "sold") return "bg-gray-100 text-gray-600";
  if (status === "reserved") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
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

function DevicesPage() {
  const [ready, setReady] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [form, setForm] = useState<DeviceForm>({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DeviceStatus>("all");
  const [toast, setToast] = useState("");
  const [showForm, setShowForm] = useState(true);

  useEffect(() => {
    const storedBrands = normalizeBrands(readJson(BRANDS_KEY));
    const storedDevices = readJson(DEVICES_KEY);
    const normalizedDevices = Array.isArray(storedDevices)
      ? storedDevices
          .map(normalizeDevice)
          .filter((device): device is Device => device !== null)
      : [];

    // استنتاج الماركات والسلاسل والموديلات من الأجهزة المسجلة.
    const mergedBrands = [...storedBrands];

    for (const device of normalizedDevices) {
      let brand = mergedBrands.find(
        (entry) => entry.name.toLowerCase() === device.brand.toLowerCase(),
      );

      if (!brand) {
        brand = {
          id: makeId(),
          name: device.brand,
          models: [],
          series: [],
        };
        mergedBrands.push(brand);
      }

      const seriesName = device.series.trim() || "عام";

      let seriesEntry = brand.series.find(
        (entry) => entry.name.toLowerCase() === seriesName.toLowerCase(),
      );

      if (!seriesEntry) {
        seriesEntry = { name: seriesName, models: [] };
        brand.series.push(seriesEntry);
      }

      if (
        !seriesEntry.models.some(
          (model) => model.toLowerCase() === device.model.toLowerCase(),
        )
      ) {
        seriesEntry.models.push(device.model);
      }

      if (
        !brand.models.some(
          (model) => model.toLowerCase() === device.model.toLowerCase(),
        )
      ) {
        brand.models.push(device.model);
      }
    }

    setBrands(mergedBrands);
    setDevices(normalizedDevices);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    try {
      localStorage.setItem(BRANDS_KEY, JSON.stringify(brands));
      localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
    } catch {
      setToast("تعذر حفظ البيانات على هذا المتصفح.");
    }
  }, [brands, devices, ready]);

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

  const modelOptions = selectedBrand?.models ?? [];

  const availableCount = devices.filter(
    (device) => device.status === "available",
  ).length;

  const totalStockValue = devices
    .filter((device) => device.status === "available")
    .reduce((sum, device) => sum + getFinalPrice(device), 0);

  const filteredDevices = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return devices
      .filter((device) => {
        const matchesSearch =
          !searchValue ||
          [
            device.imei,
            device.brand,
            device.model,
            device.color,
            device.ram,
            device.storage,
          ].some((value) => value.toLowerCase().includes(searchValue));

        const matchesStatus =
          statusFilter === "all" || device.status === statusFilter;

        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [devices, search, statusFilter]);

  function notify(message: string) {
    setToast(message);
  }

  function updateForm<K extends keyof DeviceForm>(
    key: K,
    value: DeviceForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm({ ...emptyForm });
    setEditingId(null);
  }

  function upsertBrandAndModel(
    brandName: string,
    modelName: string,
    seriesName = "عام",
  ) {
    const cleanBrand = brandName.trim();
    const cleanModel = modelName.trim();
    const cleanSeries = seriesName.trim() || "عام";

    if (!cleanBrand) return;

    setBrands((current) => {
      const existing = current.find(
        (brand) => brand.name.toLowerCase() === cleanBrand.toLowerCase(),
      );

      if (!existing) {
        return [
          ...current,
          {
            id: makeId(),
            name: cleanBrand,
            models: cleanModel ? [cleanModel] : [],
            series: [
              {
                name: cleanSeries,
                models: cleanModel ? [cleanModel] : [],
              },
            ],
          },
        ];
      }

      const nextSeries = [...existing.series];
      const index = nextSeries.findIndex(
        (entry) => entry.name.toLowerCase() === cleanSeries.toLowerCase(),
      );

      if (index === -1) {
        nextSeries.push({
          name: cleanSeries,
          models: cleanModel ? [cleanModel] : [],
        });
      } else if (cleanModel) {
        const selectedSeries = nextSeries[index];

        if (
          !selectedSeries.models.some(
            (model) => model.toLowerCase() === cleanModel.toLowerCase(),
          )
        ) {
          nextSeries[index] = {
            ...selectedSeries,
            models: [...selectedSeries.models, cleanModel],
          };
        }
      }

      const nextModels =
        cleanModel &&
        !existing.models.some(
          (model) => model.toLowerCase() === cleanModel.toLowerCase(),
        )
          ? [...existing.models, cleanModel]
          : existing.models;

      return current.map((brand) =>
        brand.id === existing.id
          ? {
              ...brand,
              models: nextModels,
              series: nextSeries,
            }
          : brand,
      );
    });
  }

  function startEdit(device: Device) {
    const remainingDays = device.offer
      ? Math.max(1, Math.ceil((device.offer.expiresAt - Date.now()) / DAY_MS))
      : 7;

    setForm({
      imei: device.imei,
      brand: device.brand,
      model: device.model,
      color: device.color,
      ram: device.ram,
      storage: device.storage,
      salePrice: String(device.salePrice),
      offerName: device.offer?.name ?? "",
      discountType: device.offer?.discountType ?? "percent",
      discountValue:
        device.offer && device.offer.discountValue > 0
          ? String(device.offer.discountValue)
          : "",
      durationDays: String(device.offer ? remainingDays : 7),
      series: device.series,
      installmentPrice: String(device.installmentPrice),
    });

    setEditingId(device.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const imei = form.imei.trim();
    const brand = form.brand.trim();
    const model = form.model.trim();
    const salePrice = Number(form.salePrice);
    const installmentPrice = Number(form.installmentPrice);
    const discountValue = Number(form.discountValue || 0);
    const durationDays = Number(form.durationDays || 7);

    if (!imei || !brand || !model) {
      notify("من فضلك اكتب رقم IMEI والماركة والموديل.");
      return;
    }

    if (!form.ram.trim() || !form.storage.trim()) {
      notify("من فضلك حدّد الرامات والسعة التخزينية كل واحدة لوحدها.");
      return;
    }

    if (
      form.salePrice.trim() === "" ||
      !Number.isFinite(salePrice) ||
      salePrice < 0
    ) {
      notify("من فضلك أدخل سعر بيع صحيح.");
      return;
    }

    const duplicateImei = devices.some(
      (device) =>
        device.imei.toLowerCase() === imei.toLowerCase() &&
        device.id !== editingId,
    );

    if (duplicateImei) {
      notify("رقم IMEI مسجل بالفعل في المخزن.");
      return;
    }

    const offerName = form.offerName.trim();
    const hasOffer = Boolean(offerName);

    if (
      hasOffer &&
      (!Number.isFinite(discountValue) ||
        discountValue <= 0 ||
        !Number.isFinite(durationDays) ||
        durationDays <= 0)
    ) {
      notify("راجع قيمة الخصم ومدة العرض.");
      return;
    }

    if (hasOffer && form.discountType === "percent" && discountValue > 100) {
      notify("نسبة الخصم لا يمكن أن تتجاوز 100%.");
      return;
    }

    if (
      hasOffer &&
      form.discountType === "fixed" &&
      discountValue > salePrice
    ) {
      notify("قيمة الخصم لا يمكن أن تكون أكبر من سعر البيع.");
      return;
    }

    const oldDevice = editingId
      ? devices.find((device) => device.id === editingId)
      : undefined;

    const offer: Offer | null = hasOffer
      ? {
          name: offerName,
          discountType: form.discountType,
          discountValue,
          durationDays,
          expiresAt: Date.now() + durationDays * DAY_MS,
        }
      : null;

    const newDevice: Device = {
      id: editingId ?? makeId(),
      imei,
      brand,
      model,
      color: form.color.trim(),
      ram: form.ram.trim(),
      storage: form.storage.trim(),
      salePrice,
      offer,
      status: oldDevice?.status ?? "available",
      createdAt: oldDevice?.createdAt ?? Date.now(),
      series: form.series.trim() || "عام",
      installmentPrice,
    };

    upsertBrandAndModel(brand, model, form.series.trim() || "عام");
    if (editingId) {
      setDevices((current) =>
        current.map((device) => (device.id === editingId ? newDevice : device)),
      );
      notify("تم تعديل بيانات الجهاز بنجاح.");
    } else {
      setDevices((current) => [newDevice, ...current]);
      notify("تم تسجيل الجهاز في المخزون بنجاح.");
    }

    resetForm();
    setShowForm(false);
  }

  function deleteDevice(device: Device) {
    const confirmed = window.confirm(
      `هل أنت متأكد من حذف الجهاز ${device.brand} ${device.model}؟`,
    );

    if (!confirmed) return;

    setDevices((current) => current.filter((entry) => entry.id !== device.id));

    if (editingId === device.id) resetForm();

    notify("تم حذف الجهاز من المخزون.");
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
  }

  if (!ready) {
    return (
      <main dir="rtl" className="min-h-screen bg-gray-50 p-6 text-gray-700">
        <div className="mx-auto max-w-7xl animate-pulse rounded-2xl border border-gray-100 bg-white p-8">
          جاري تحميل بيانات المخزون...
        </div>
      </main>
    );
  }
  const series = Array.from(
    new Set(
      brands
        .filter((brand) => brand.name === form.brand)
        .flatMap((brand) =>
          (brand.series ?? []).map((item) =>
            typeof item === "string" ? item : item.name,
          ),
        )
        .filter(Boolean),
    ),
  );

  return (
    <main dir="rtl" lang="ar" className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* عنوان الصفحة */}
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
              <Package size={17} />
              إدارة المخزون
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
              مخزون الموبايلات
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              تسجيل الأجهزة ومتابعة الأسعار والعروض وبيانات كل جهاز.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (showForm && editingId) resetForm();
              setShowForm((current) => !current);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            {showForm ? <X size={18} /> : <Plus size={18} />}
            {showForm ? "إخفاء النموذج" : "إضافة جهاز"}
          </button>
        </header>

        {/* إحصائيات */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={<Smartphone size={20} />}
            title="إجمالي الأجهزة"
            value={numberText(devices.length)}
            note="كل الأجهزة المسجلة"
          />
          <StatCard
            icon={<Package size={20} />}
            title="الأجهزة المتاحة"
            value={numberText(availableCount)}
            note="متاحة للبيع حاليًا"
          />
          <StatCard
            icon={<CircleDollarSign size={20} />}
            title="قيمة أسعار البيع"
            value={money(totalStockValue)}
            note="للأجهزة المتاحة بعد الخصومات الفعالة"
          />
        </section>

        {/* نموذج الإضافة والتعديل */}
        {showForm && (
          <section className="overflow-visible rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-5 md:px-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                {editingId ? <Pencil size={21} /> : <Plus size={21} />}
              </div>
              <div>
                <h2 className="font-bold text-gray-900">
                  {editingId ? "تعديل بيانات الجهاز" : "تسجيل جهاز جديد"}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  الحقول المطلوبة موضحة داخل النموذج.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 p-5 md:p-7">
              <div>
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-800">
                  <Smartphone size={17} className="text-emerald-600" />
                  بيانات الجهاز
                </h3>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="رقم IMEI *">
                    <input
                      value={form.imei}
                      onChange={(event) =>
                        updateForm("imei", event.target.value)
                      }
                      placeholder="مثال: 358123456789012"
                      dir="ltr"
                      lang="en"
                      inputMode="numeric"
                      autoComplete="off"
                      className={`${inputClass} text-left`}
                    />
                  </Field>

                  <Field label="الماركة *">
                    <SearchSelect
                      value={form.brand}
                      options={brandNames}
                      placeholder="ابحث عن ماركة أو اكتب ماركة جديدة"
                      onChange={(value) => {
                        setForm((current) => ({
                          ...current,
                          brand: value,
                          series: "",
                          model: "",
                        }));
                      }}
                    />

                    {form.brand.trim() &&
                      !brandNames.some(
                        (name) =>
                          name.toLowerCase() ===
                          form.brand.trim().toLowerCase(),
                      ) && (
                        <button
                          type="button"
                          onClick={() => {
                            const brandName = form.brand.trim();
                            upsertBrandAndModel(brandName, "");
                            updateForm("brand", brandName);
                            notify(`تمت إضافة الماركة ${brandName}`);
                          }}
                          className="mt-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                          + إضافة ماركة جديدة: {form.brand.trim()}
                        </button>
                      )}
                  </Field>

                  <Field label="السلسلة (Series) *">
                    <SearchSelect
                      value={form.series}
                      options={series}
                      placeholder={
                        form.brand.trim()
                          ? "ابحث عن سلسلة أو اكتب سلسلة جديدة"
                          : "اختار الماركة أولًا"
                      }
                      onChange={(value) => {
                        setForm((current) => ({
                          ...current,
                          series: value,
                          model: "",
                        }));
                      }}
                      disabled={!form.brand.trim()}
                    />
                  </Field>

                  <Field label="الموديل *">
                    <SearchSelect
                      value={form.model}
                      options={modelOptions}
                      placeholder={
                        form.series.trim()
                          ? "ابحث عن موديل أو اكتب موديل جديد"
                          : "اختار السلسلة أولًا"
                      }
                      onChange={(value) => updateForm("model", value)}
                      disabled={!form.brand.trim()}
                    />

                    {form.brand.trim() &&
                      form.model.trim() &&
                      !modelOptions.some(
                        (name) =>
                          name.toLowerCase() ===
                          form.model.trim().toLowerCase(),
                      ) && (
                        <button
                          type="button"
                          onClick={() => {
                            const modelName = form.model.trim();
                            upsertBrandAndModel(
                              form.brand.trim(),
                              modelName,
                              form.series.trim() || "عام",
                            );
                            updateForm("model", modelName);
                            notify(`تمت إضافة الموديل ${modelName}`);
                          }}
                          className="mt-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                          + إضافة موديل جديد: {form.model.trim()}
                        </button>
                      )}
                  </Field>

                  <Field label="اللون">
                    <input
                      value={form.color}
                      onChange={(event) =>
                        updateForm("color", event.target.value)
                      }
                      placeholder="مثال: أسود"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="الرامات *">
                    <SearchSelect
                      value={form.ram}
                      options={[
                        "2 GB",
                        "3 GB",
                        "4 GB",
                        "6 GB",
                        "8 GB",
                        "12 GB",
                        "16 GB",
                        "24 GB",
                      ]}
                      onChange={(value) => updateForm("ram", value)}
                      placeholder="اختر أو اكتب الرام"
                    />
                  </Field>

                  <Field label="السعة التخزينية *">
                    <SearchSelect
                      value={form.storage}
                      options={[
                        "32 GB",
                        "64 GB",
                        "128 GB",
                        "256 GB",
                        "512 GB",
                        "1 TB",
                        "2 TB",
                      ]}
                      onChange={(value) => updateForm("storage", value)}
                      placeholder="اختر أو اكتب السعة"
                    />
                  </Field>

                  <Field label="سعر الكاش (EGP) *">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.salePrice}
                      onChange={(event) =>
                        updateForm("salePrice", event.target.value)
                      }
                      placeholder="سعر البيع كاش"
                      dir="ltr"
                      lang="en"
                      inputMode="decimal"
                      className={`${inputClass} text-left`}
                    />
                  </Field>

                  <Field label="سعر التقسيط (EGP) *">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.installmentPrice}
                      onChange={(event) =>
                        updateForm("installmentPrice", event.target.value)
                      }
                      placeholder="سعر البيع بالتقسيط"
                      dir="ltr"
                      lang="en"
                      inputMode="decimal"
                      className={`${inputClass} text-left`}
                    />
                  </Field>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-800">
                  <BadgePercent size={18} className="text-emerald-600" />
                  العرض والخصم
                  <span className="font-normal text-gray-400">(اختياري)</span>
                </h3>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="اسم العرض">
                    <input
                      value={form.offerName}
                      onChange={(event) =>
                        updateForm("offerName", event.target.value)
                      }
                      placeholder="مثال: عرض الافتتاح"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="نوع الخصم">
                    <select
                      value={form.discountType}
                      onChange={(event) =>
                        updateForm(
                          "discountType",
                          event.target.value as "percent" | "fixed",
                        )
                      }
                      className={inputClass}
                      dir="rtl"
                    >
                      <option value="percent">نسبة مئوية (%)</option>
                      <option value="fixed">مبلغ ثابت (EGP)</option>
                    </select>
                  </Field>

                  <Field label="قيمة الخصم">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.discountValue}
                      onChange={(event) =>
                        updateForm("discountValue", event.target.value)
                      }
                      placeholder={
                        form.discountType === "percent" ? "10" : "500"
                      }
                      dir="ltr"
                      lang="en"
                      inputMode="decimal"
                      className={`${inputClass} text-left`}
                    />
                  </Field>

                  <Field label="مدة العرض (بالأيام)">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.durationDays}
                      onChange={(event) =>
                        updateForm("durationDays", event.target.value)
                      }
                      placeholder="7"
                      dir="ltr"
                      lang="en"
                      inputMode="numeric"
                      className={`${inputClass} text-left`}
                    />
                  </Field>
                </div>

                <p className="mt-3 flex items-start gap-2 text-xs leading-6 text-gray-500">
                  <Clock3 size={15} className="mt-1 shrink-0 text-gray-400" />
                  يبدأ حساب مدة العرض من وقت حفظ الجهاز أو حفظ التعديل. اترك اسم
                  العرض فارغًا إذا لم تكن هناك خصومات.
                </p>

                {form.offerName.trim() &&
                  Number(form.salePrice) >= 0 &&
                  Number(form.discountValue) > 0 && (
                    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-emerald-900">
                            {form.offerName}
                          </p>
                          <p className="mt-1 text-xs text-emerald-800">
                            السعر قبل الخصم: {money(Number(form.salePrice))}
                          </p>
                        </div>
                        <div className="text-left">
                          <p className="text-xs text-emerald-700">
                            السعر بعد الخصم
                          </p>
                          <p className="mt-1 text-lg font-bold text-emerald-900">
                            {money(
                              Math.max(
                                0,
                                Number(form.salePrice) -
                                  (form.discountType === "percent"
                                    ? (Number(form.salePrice) *
                                        Number(form.discountValue)) /
                                      100
                                    : Number(form.discountValue)),
                              ),
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      notify("تم إلغاء التعديل.");
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
                  >
                    <RotateCcw size={16} />
                    إلغاء التعديل
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    notify("تم تفريغ الحقول.");
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
                >
                  <X size={16} />
                  تفريغ الحقول
                </button>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  {editingId ? <Check size={17} /> : <Plus size={17} />}
                  {editingId ? "حفظ التعديلات" : "تسجيل الجهاز في المخزون"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* جدول المخزون */}
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-5 md:flex-row md:items-center md:justify-between md:px-6">
            <div>
              <h2 className="font-bold text-gray-900">الأجهزة المسجلة</h2>
              <p className="mt-1 text-sm text-gray-500">
                عدد النتائج: {numberText(filteredDevices.length)}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative min-w-0 sm:w-64">
                <Search
                  size={17}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="بحث بالموديل أو IMEI..."
                  className={`${inputClass} pr-9`}
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "all" | DeviceStatus)
                }
                className={`${inputClass} sm:w-40`}
                aria-label="تصفية حسب الحالة"
              >
                <option value="all">كل الحالات</option>
                <option value="available">متاح</option>
                <option value="reserved">محجوز</option>
                <option value="sold">تم البيع</option>
              </select>

              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                <RotateCcw size={15} />
                مسح البحث
              </button>
            </div>
          </div>

          {filteredDevices.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                <Smartphone size={26} />
              </div>
              <h3 className="mt-4 font-semibold text-gray-800">
                لا توجد أجهزة لعرضها
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
                {devices.length === 0
                  ? "ابدأ بتسجيل أول جهاز في المخزون باستخدام النموذج بالأعلى."
                  : "جرّب تغيير كلمات البحث أو فلتر الحالة."}
              </p>
              {devices.length > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-4 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  عرض كل الأجهزة
                </button>
              )}
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[1050px] text-right text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500">
                  <tr>
                    <th className="px-5 py-4">الجهاز</th>
                    <th className="px-5 py-4">IMEI</th>
                    <th className="px-5 py-4">اللون</th>
                    <th className="px-5 py-4">الرامات</th>
                    <th className="px-5 py-4">السعة</th>
                    <th className="px-5 py-4">سعر البيع</th>
                    <th className="px-5 py-4">العرض</th>
                    <th className="px-5 py-4">السعر النهائي</th>
                    <th className="px-5 py-4">الحالة</th>
                    <th className="px-5 py-4">الإجراءات</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {filteredDevices.map((device) => {
                    const offerActive = isOfferActive(device.offer);
                    const finalPrice = getFinalPrice(device);

                    return (
                      <tr
                        key={device.id}
                        className={`transition hover:bg-gray-50/80 ${
                          editingId === device.id ? "bg-emerald-50/60" : ""
                        }`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                              <Smartphone size={19} />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">
                                {device.brand}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                {device.model}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td
                          className="px-5 py-4 font-mono text-xs text-gray-600"
                          dir="ltr"
                        >
                          {device.imei}
                        </td>

                        <td className="px-5 py-4 text-gray-600">
                          {device.color || "—"}
                        </td>

                        <td className="px-5 py-4 text-gray-600" dir="ltr">
                          {device.ram || "—"}
                        </td>

                        <td className="px-5 py-4 text-gray-600" dir="ltr">
                          {device.storage || "—"}
                        </td>

                        <td className="px-5 py-4 text-gray-700" dir="ltr">
                          {money(device.salePrice)}
                        </td>

                        <td className="px-5 py-4">
                          {offerActive && device.offer ? (
                            <div className="max-w-36">
                              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                                <Tag size={12} />
                                {device.offer.name}
                              </span>
                              <p className="mt-1 text-xs text-gray-500">
                                {device.offer.discountType === "percent"
                                  ? `${numberText(device.offer.discountValue)}%`
                                  : money(device.offer.discountValue)}
                              </p>
                              <p className="mt-1 text-xs text-gray-400">
                                متبقي{" "}
                                {numberText(
                                  Math.max(
                                    0,
                                    Math.ceil(
                                      (device.offer.expiresAt - Date.now()) /
                                        DAY_MS,
                                    ),
                                  ),
                                )}{" "}
                                يوم
                              </p>
                            </div>
                          ) : device.offer ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-500">
                              <Clock3 size={12} />
                              انتهى العرض
                            </span>
                          ) : (
                            <span className="text-gray-400">بدون عرض</span>
                          )}
                        </td>

                        <td className="px-5 py-4" dir="ltr">
                          <div className="font-bold text-gray-900">
                            {money(finalPrice)}
                          </div>
                          {offerActive && finalPrice < device.salePrice && (
                            <div className="mt-1 text-xs text-gray-400 line-through">
                              {money(device.salePrice)}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-lg px-2.5 py-1.5 text-xs font-semibold ${getStatusClass(
                              device.status,
                            )}`}
                          >
                            {getStatusLabel(device.status)}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(device)}
                              title="تعديل الجهاز"
                              aria-label={`تعديل ${device.brand} ${device.model}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                            >
                              <Pencil size={14} />
                              تعديل
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteDevice(device)}
                              title="حذف الجهاز"
                              aria-label={`حذف ${device.brand} ${device.model}`}
                              className="rounded-lg border border-red-100 p-2 text-red-500 transition hover:bg-red-50"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50/70 px-5 py-4 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              عرض {numberText(filteredDevices.length)} من{" "}
              {numberText(devices.length)} جهاز
            </span>
            <span>بيانات التجربة محفوظة على هذا المتصفح فقط.</span>
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
