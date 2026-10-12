/* eslint-disable prettier/prettier */
import React, { useMemo } from "react";
import {
  MapPin,
  Store,
  DoorOpen,
  DoorClosed,
  Armchair,
  Utensils,
  Baby,
} from "lucide-react";

interface Invoice {
  zone?: string;
  total: number;
}

interface ZonePerformanceProps {
  invoices: Invoice[];
}

interface ZoneConfig {
  key: string;
  name: string;
  aliases: string[];
  icon: React.ReactNode;
}

const ZONES: ZoneConfig[] = [
  {
    key: "close",
    name: "Close",
    aliases: ["close"],
    icon: <DoorClosed className="w-4 h-4 text-zinc-400" />,
  },
  {
    key: "open",
    name: "Open",
    aliases: ["open"],
    icon: <DoorOpen className="w-4 h-4 text-zinc-400" />,
  },
  {
    key: "small",
    name: "قاعة صغيرة",
    aliases: [
      "small",
      "قاعة صغيرة",
      "قاعة صغيره",
      "قاعة صغرى",
      "small hall",
      "small-hall",
      "small_hall",
      "smallhall",
      "smallhall ",
    ],
    icon: <Armchair className="w-4 h-4 text-zinc-400" />,
  },
  {
    key: "large",
    name: "قاعة كبيرة",
    aliases: [
      "large",
      "قاعة كبيرة",
      "قاعة كبيره",
      "قاعة كبرى",
      "large hall",
      "large-hall",
      "large_hall",
      "largehall",
      "largehall ",
    ],
    icon: <Store className="w-4 h-4 text-zinc-400" />,
  },
  {
    key: "takeaway",
    name: "Take Away",
    aliases: [
      "take away",
      "takeaway",
      "take-away",
      "take away ",
      "تيك اواي",
      "تيك أواي",
    ],
    icon: <Utensils className="w-4 h-4 text-zinc-400" />,
  },
  {
    key: "kids",
    name: "Kids",
    aliases: ["kids", "kid", "أطفال", "اطفال", "منطقة الأطفال"],
    icon: <Baby className="w-4 h-4 text-zinc-400" />,
  },
];

const normalize = (value: string) => {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      // توحيد أشكال الألف
      .replace(/[أإآ]/g, "ا")
      // توحيد التاء المربوطة والهاء في نهاية الكلمات
      .replace(/ة/g, "ه")
      // إزالة التطويل
      .replace(/ـ/g, "")
      // توحيد المسافات
      .replace(/\s+/g, " ")
      // توحيد الفواصل والشرطات
      .replace(/[_-]+/g, " ")
      .trim()
  );
};

function getZoneConfig(zone?: string) {
  const normalized = normalize(String(zone || ""));

  if (!normalized) return null;

  // المطابقة المباشرة
  const directMatch = ZONES.find((item) =>
    item.aliases.some((alias) => normalize(alias) === normalized),
  );

  if (directMatch) return directMatch;

  // مطابقة إضافية للمناطق العربية
  if (
    normalized.includes("قاعة") &&
    (normalized.includes("صغير") || normalized.includes("صغرى"))
  ) {
    return ZONES.find((zone) => zone.key === "small") || null;
  }

  if (
    normalized.includes("قاعة") &&
    (normalized.includes("كبير") || normalized.includes("كبرى"))
  ) {
    return ZONES.find((zone) => zone.key === "large") || null;
  }

  // Small Hall
  if (normalized.includes("small") && normalized.includes("hall")) {
    return ZONES.find((zone) => zone.key === "small") || null;
  }

  // Large Hall
  if (normalized.includes("large") && normalized.includes("hall")) {
    return ZONES.find((zone) => zone.key === "large") || null;
  }

  // احتمالات إضافية
  if (normalized === "smallhall" || normalized === "small hall") {
    return ZONES.find((zone) => zone.key === "small") || null;
  }

  if (normalized === "largehall" || normalized === "large hall") {
    return ZONES.find((zone) => zone.key === "large") || null;
  }

  return null;
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);

export default function ZonePerformance({ invoices }: ZonePerformanceProps) {
  const zones = useMemo(() => {
    const map: Record<
      string,
      {
        config: ZoneConfig;
        sales: number;
        invoices: number;
      }
    > = {};

    ZONES.forEach((zone) => {
      map[zone.key] = { config: zone, sales: 0, invoices: 0 };
    });

    invoices.forEach((invoice) => {
      const config = getZoneConfig(invoice.zone);
      if (!config) return;

      map[config.key].sales += Number(invoice.total || 0);
      map[config.key].invoices += 1;
    });

    return ZONES.map((config) => {
      const data = map[config.key];
      return {
        key: config.key,
        name: config.name,
        icon: config.icon,
        sales: data.sales,
        invoices: data.invoices,
        average: data.invoices > 0 ? data.sales / data.invoices : 0,
      };
    });
  }, [invoices]);

  const totalZoneSales = useMemo(
    () => zones.reduce((sum, zone) => sum + zone.sales, 0),
    [zones],
  );

  const maxSales = Math.max(...zones.map((zone) => zone.sales), 1);

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl shadow-xl overflow-hidden">
      {/* HEADER */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 text-emerald-400 flex items-center justify-center shadow-inner">
              <MapPin className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-xl font-black text-white">أداء المناطق 📍</h2>
            </div>
          </div>

          <div className="text-left">
            <div className="text-xs font-bold text-zinc-400">
              إجمالي المناطق
            </div>
            <div className="text-xl font-black text-white">
              {formatMoney(totalZoneSales)}{" "}
              <span className="text-xs text-emerald-400">ج.م</span>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="p-6">
        <div className="hidden sm:grid grid-cols-[190px_1fr_110px] gap-4 items-center mb-4 px-2">
          <div className="text-xs font-black text-zinc-400">المنطقة</div>
          <div className="text-xs font-black text-zinc-400">
            مستوى الإيرادات
          </div>
          <div className="text-xs font-black text-zinc-400 text-left">
            الإيرادات
          </div>
        </div>

        <div className="space-y-6">
          {zones.map((zone, index) => {
            const progress = (zone.sales / maxSales) * 100;
            const percentage =
              totalZoneSales > 0 ? (zone.sales / totalZoneSales) * 100 : 0;

            return (
              <div
                key={zone.key}
                className="group grid grid-cols-1 sm:grid-cols-[190px_1fr_110px] gap-4 items-center"
              >
                {/* ZONE NAME */}
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-xs font-black border ${
                      index === 0
                        ? "bg-emerald-950 border-emerald-800 text-emerald-400"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400"
                    }`}
                  >
                    {index + 1}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {zone.icon}
                      <span className="font-extrabold text-base text-white truncate">
                        {zone.name}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-zinc-500 mt-0.5">
                      {percentage.toFixed(1)}% من الإجمالي
                    </div>
                  </div>
                </div>

                {/* PROGRESS BAR */}
                <div className="min-w-0">
                  <div className="h-8 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 relative">
                    <div
                      className={`h-full rounded-xl transition-all duration-700 ease-out ${
                        index === 0
                          ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                          : "bg-zinc-700"
                      }`}
                      style={{
                        width: `${Math.max(progress, zone.sales > 0 ? 3 : 0)}%`,
                      }}
                    />

                    {zone.sales > 0 && progress >= 18 && (
                      <div className="absolute inset-y-0 right-3 flex items-center text-xs font-black text-white pointer-events-none">
                        {percentage.toFixed(1)}%
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs font-bold text-zinc-400">
                      {zone.invoices} فاتورة
                    </span>
                    <span className="text-xs font-bold text-zinc-400">
                      متوسط {formatMoney(zone.average)} ج.م
                    </span>
                  </div>
                </div>

                {/* SALES */}
                <div className="text-left">
                  <div className="text-base sm:text-lg font-black text-white">
                    {formatMoney(zone.sales)}
                  </div>
                  <div className="text-xs font-bold text-emerald-400">ج.م</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
