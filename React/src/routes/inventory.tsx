/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useDB,
  UNITS,
  BASIC_UNITS,
  SUB_UNIT_TYPES,
  YIELD_UNITS,
  yieldToSubUnit,
  type Item,
  type Unit,
  type SubUnitType,
  type ItemKind,
  type YieldComponent,
  type YieldUnit,
} from "@/lib/store";
import { SearchableSelect } from "@/components/SearchableSelect";
import { arabicMatch } from "@/lib/arabic";
import { fmt2, cleanNumInput, clamp0, round2 } from "@/lib/format";
import { Plus, Search, Pencil, Trash2, X, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "المخزون - نظام المخزون" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { db, addItem, updateItem, deleteItem } = useDB();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(
    () =>
      db.items.filter(
        (i) =>
          arabicMatch(i.name, q) ||
          (i.code || "").toLowerCase().includes(q.toLowerCase()),
      ),
    [db.items, q],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">المخزون</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {db.items.length} صنف مسجل
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> إضافة صنف
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم أو الكود..."
              className="w-full h-10 ps-9 pe-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs">
              <tr>
                <th className="text-right p-3 font-semibold">الكود</th>
                <th className="text-right p-3 font-semibold">اسم الصنف</th>
                <th className="text-right p-3 font-semibold">النوع</th>
                <th className="text-right p-3 font-semibold">الوحدة</th>
                <th className="text-right p-3 font-semibold">الكمية</th>
                <th className="text-right p-3 font-semibold">متوسط السعر</th>
                <th className="text-right p-3 font-semibold">حرج</th>
                <th className="text-right p-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-8 text-center text-muted-foreground"
                  >
                    لا توجد أصناف
                  </td>
                </tr>
              ) : (
                filtered.map((i) => {
                  const low = i.qty <= i.critical;
                  const kindLabel = i.kind === "processed" ? "مصنع" : "عادي";
                  return (
                    <tr
                      key={i.id}
                      className={`border-t border-border ${low ? "bg-destructive/10" : ""}`}
                    >
                      <td className="p-3 font-mono text-xs">{i.code}</td>
                      <td className="p-3 font-medium">{i.name}</td>
                      <td className="p-3 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded-full ${i.kind === "processed" ? "bg-blue-500/15 text-blue-700 dark:text-blue-400" : "bg-secondary"}`}
                        >
                          {kindLabel}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {i.unit}
                        {i.subUnitQty
                          ? ` (1=${fmt2(i.subUnitQty)} ${i.subUnitType})`
                          : ""}
                      </td>
                      <td
                        className={`p-3 font-bold ${low ? "text-destructive" : ""}`}
                      >
                        {fmt2(i.qty)}
                      </td>
                      <td className="p-3">{fmt2(i.avgPrice)}</td>
                      <td className="p-3">{fmt2(i.critical)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditing(i)}
                            className="p-1.5 rounded hover:bg-secondary text-muted-foreground"
                            title="تعديل"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`حذف "${i.name}"؟`)) deleteItem(i.id);
                            }}
                            className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(showAdd || editing) && (
        <ItemDialog
          initial={editing}
          allItems={db.items}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSave={(data) => {
            if (editing) updateItem(editing.id, data);
            else addItem(data);
            setShowAdd(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ItemDialog({
  initial,
  allItems,
  onClose,
  onSave,
}: {
  initial: Item | null;
  allItems: Item[];
  onClose: () => void;
  onSave: (data: Omit<Item, "id">) => void;
}) {
  const [code, setCode] = useState(initial?.code || "");
  const [name, setName] = useState(initial?.name || "");
  const [unit, setUnit] = useState<Unit>(initial?.unit || "كيلوجرام");
  const [qty, setQty] = useState(initial?.qty?.toString() || "0");
  const [avgPrice, setAvg] = useState(initial?.avgPrice?.toString() || "0");
  const [critical, setCritical] = useState(
    initial?.critical?.toString() || "0",
  );
  const [subQty, setSubQty] = useState(initial?.subUnitQty?.toString() || "");
  const [subType, setSubType] = useState<SubUnitType>(
    initial?.subUnitType || "كيلوجرام",
  );
  const [notes, setNotes] = useState(initial?.notes || "");
  const [kind, setKind] = useState<ItemKind>(initial?.kind || "standard");
  const [yieldComps, setYieldComps] = useState<YieldComponent[]>(
    initial?.yieldDef?.components.map((c) => ({
      ...c,
      unit: c.unit || "كيلوجرام",
    })) || [],
  );
  const [wasteQty, setWasteQty] = useState(
    initial?.yieldDef?.wasteQty?.toString() || "0",
  );
  const [wasteMode, setWasteMode] = useState<"percent" | "fixed">(
    initial?.yieldDef?.wasteMode || "fixed",
  );

  const isBasic = (BASIC_UNITS as string[]).includes(unit);
  const showSub = !isBasic;
  const subQtyNum = clamp0(subQty);
  const pieces = clamp0(qty);

  // For processed kind, the capacity per piece = subUnitQty if a sub-unit defined; else 1 (using base unit)
  const capacityPerPiece = showSub ? subQtyNum : 1;
  const capacityUnit: SubUnitType = (
    showSub ? subType : (unit as any)
  ) as SubUnitType;

  // Sum of component values converted to capacity unit
  const compTotal = useMemo(() => {
    let s = 0;
    let invalid = false;
    for (const c of yieldComps) {
      if (!c.itemId || !c.qty) continue;
      const v = yieldToSubUnit(c.qty, c.unit, capacityUnit);
      if (v == null) {
        invalid = true;
        continue;
      }
      s += v;
    }
    return { total: s, invalid };
  }, [yieldComps, capacityUnit]);

  const wasteInCapacity = useMemo(() => {
    const w = clamp0(wasteQty);
    if (wasteMode === "percent") return capacityPerPiece * (w / 100);
    return w;
  }, [wasteQty, wasteMode, capacityPerPiece]);

  const remaining = round2(
    capacityPerPiece - compTotal.total - wasteInCapacity,
  );
  const remainingOk =
    kind !== "processed" ||
    (Math.abs(remaining) < 0.001 && !compTotal.invalid && capacityPerPiece > 0);

  const itemOptions = allItems
    .filter((x) => x.id !== initial?.id)
    .map((x) => ({
      value: x.id,
      label: x.name,
      hint: x.unit,
      group: x.kind === "processed" ? "مصنع" : "عادي",
    }));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-4xl p-5 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">
            {initial ? "تعديل صنف" : "إضافة صنف جديد"}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            if (kind === "processed") {
              if (capacityPerPiece <= 0) {
                toast.error("حدد السعة الفرعية للقطعة الواحدة أولاً");
                return;
              }
              if (compTotal.invalid) {
                toast.error("تحقق من توحيد وحدات المكونات المستخرجة");
                return;
              }
              if (Math.abs(remaining) > 0.001) {
                toast.error(
                  `المتبقي من سعة القطعة الواحدة يجب أن يساوي صفر (متبقي حالياً ${fmt2(remaining)} ${capacityUnit})`,
                );
                return;
              }
            }
            const subQ = showSub ? clamp0(subQtyNum) : 0;
            const data: Omit<Item, "id"> = {
              code: code.trim(),
              name: name.trim(),
              unit,
              qty: clamp0(qty),
              avgPrice: clamp0(avgPrice),
              critical: clamp0(critical),
              conversionFactor: showSub && subQ > 0 ? subQ : 1,
              subUnitQty: showSub && subQ > 0 ? subQ : undefined,
              subUnitType: showSub && subQ > 0 ? subType : undefined,
              notes: notes.trim() || undefined,
              kind,
              lastYieldDeltas: initial?.lastYieldDeltas,
              department: "",
            };
            if (kind === "processed") {
              data.yieldDef = {
                components: yieldComps
                  .filter((c) => c.itemId && c.qty > 0)
                  .map((c) => ({
                    itemId: c.itemId,
                    qty: round2(clamp0(c.qty)),
                    unit: c.unit,
                  })),
                wasteQty: round2(clamp0(wasteQty)),
                wasteMode,
                sourceName: name.trim(),
              };
            }
            onSave(data);
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 dir-rtl">
            {/* كود المكون (حقل مقفول تلقائي) */}
            <Field label="كود المكون">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="تلقائي ING-XXX"
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-300 bg-slate-200/70 text-slate-800 font-bold text-sm cursor-not-allowed shadow-inner"
                readOnly
              />
            </Field>

            {/* اسم الصنف */}
            <Field label="اسم الصنف">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none shadow-sm"
              />
            </Field>

            {/* نوع الصنف */}
            <Field label="نوع الصنف">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ItemKind)}
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none shadow-sm cursor-pointer"
              >
                <option value="standard">عادي</option>
                <option value="processed">مصنع (تفكيك)</option>
              </select>
            </Field>

            {/* وحدة التعبئة */}
            <Field label="وحدة التعبئة">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none shadow-sm cursor-pointer"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>

            {/* الكمية الحالية */}
            <Field label="الكمية الحالية (عدد القطع)">
              <input
                type="number"
                min="0"
                step="any"
                value={qty}
                onChange={(e) => setQty(cleanNumInput(e.target.value))}
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none shadow-sm"
              />
            </Field>

            {/* النقطة الحرجة */}
            <Field label="النقطة الحرجة">
              <input
                type="number"
                min="0"
                step="any"
                value={critical}
                onChange={(e) => setCritical(cleanNumInput(e.target.value))}
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none shadow-sm"
              />
            </Field>

            {/* الحقول الإضافية للوحدة الفرعية */}
            {showSub && (
              <>
                <Field label="السعة الفرعية للقطعة الواحدة">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={subQty}
                    onChange={(e) => setSubQty(cleanNumInput(e.target.value))}
                    placeholder="مثلاً 5"
                    className="w-full h-11 px-3 rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none shadow-sm placeholder:font-normal placeholder:text-slate-400"
                  />
                </Field>

                <Field label="الوحدة الفرعية">
                  <select
                    value={subType}
                    onChange={(e) => setSubType(e.target.value as SubUnitType)}
                    className="w-full h-11 px-3 rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none shadow-sm cursor-pointer"
                  >
                    {SUB_UNIT_TYPES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="متوسط السعر">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={avgPrice}
                    onChange={(e) => setAvg(cleanNumInput(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none shadow-sm"
                  />
                </Field>

                {/* شريط توضيح معادلة التحويل */}
                {subQtyNum > 0 && (
                  <div className="col-span-1 md:col-span-3 text-sm bg-slate-900 text-white rounded-xl px-4 py-2.5 font-bold flex items-center gap-2 border border-slate-700 shadow-md">
                    <span>المعامل:</span>
                    <span className="text-emerald-400">
                      1 {unit} = {fmt2(subQtyNum)} {subType}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* متوسط السعر في حالة عدم وجود وحدة فرعية */}
            {!showSub && (
              <Field label="متوسط السعر">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={avgPrice}
                  onChange={(e) => setAvg(cleanNumInput(e.target.value))}
                  className="w-full h-11 px-3 rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none shadow-sm"
                />
              </Field>
            )}
          </div>
          {kind === "processed" && (
            <div className="border border-amber-500/40 rounded-lg p-3 bg-amber-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600" /> المكونات
                  المستخرجة من القطعة الواحدة (Yield)
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setYieldComps([
                      ...yieldComps,
                      { itemId: "", qty: 0, unit: "كيلوجرام" },
                    ])
                  }
                  className="text-xs text-primary flex items-center gap-1 hover:underline"
                >
                  <Plus className="w-3 h-3" /> إضافة مكون
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                أدخل المكونات المستخرجة من <strong>قطعة واحدة</strong> فقط. عند
                الحفظ سيتم ضرب القيم في عدد القطع ({fmt2(pieces)}) وإضافتها إلى
                مخزون الأصناف المستهدفة، مع تسجيل ملاحظة آلية في حقل ملاحظات
                الصنف الهدف.
              </p>
              {yieldComps.length === 0 && (
                <div className="text-xs text-center py-3 text-muted-foreground">
                  لم تتم إضافة مكونات بعد
                </div>
              )}
              {yieldComps.map((c, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-12 md:col-span-5">
                    <SearchableSelect
                      options={itemOptions}
                      value={c.itemId}
                      onChange={(v) => {
                        const cp = [...yieldComps];
                        cp[idx] = { ...cp[idx], itemId: v };
                        setYieldComps(cp);
                      }}
                      placeholder="ابحث عن صنف..."
                    />
                  </div>
                  <div className="col-span-7 md:col-span-3">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={c.qty || ""}
                      placeholder="الكمية / قطعة"
                      onChange={(e) => {
                        const cp = [...yieldComps];
                        cp[idx] = {
                          ...cp[idx],
                          qty: clamp0(cleanNumInput(e.target.value)),
                        };
                        setYieldComps(cp);
                      }}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    />
                  </div>
                  <div className="col-span-3 md:col-span-3">
                    <select
                      value={c.unit}
                      onChange={(e) => {
                        const cp = [...yieldComps];
                        cp[idx] = {
                          ...cp[idx],
                          unit: e.target.value as YieldUnit,
                        };
                        setYieldComps(cp);
                      }}
                      className="w-full h-10 px-2 rounded-md border border-input bg-background text-sm"
                    >
                      {YIELD_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setYieldComps(yieldComps.filter((_, i) => i !== idx))
                    }
                    className="col-span-2 md:col-span-1 h-10 grid place-items-center rounded-md text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-12 gap-2 items-end border-t border-amber-500/30 pt-2">
                <div className="col-span-7">
                  <Field label="الهدر للقطعة الواحدة">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={wasteQty}
                      onChange={(e) =>
                        setWasteQty(cleanNumInput(e.target.value))
                      }
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    />
                  </Field>
                </div>
                <div className="col-span-5">
                  <Field label="النوع">
                    <div className="flex gap-1 h-10">
                      <button
                        type="button"
                        onClick={() => setWasteMode("fixed")}
                        className={`flex-1 rounded-md text-xs ${wasteMode === "fixed" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                      >
                        {capacityUnit}
                      </button>
                      <button
                        type="button"
                        onClick={() => setWasteMode("percent")}
                        className={`flex-1 rounded-md text-xs ${wasteMode === "percent" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                      >
                        نسبة %
                      </button>
                    </div>
                  </Field>
                </div>
              </div>
              <div
                className={`rounded-md px-3 py-2 text-sm font-medium ${remainingOk ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-destructive/15 text-destructive"}`}
              >
                المتبقي من سعة القطعة الواحدة:{" "}
                <strong>
                  {fmt2(remaining)} {capacityUnit}
                </strong>
                {!remainingOk && (
                  <span className="text-xs ms-2">
                    (لا يمكن الحفظ — يجب أن يساوي 0)
                  </span>
                )}
                {compTotal.invalid && (
                  <span className="text-xs ms-2 block">
                    ⚠ بعض المكونات لها وحدة لا تتوافق مع وحدة السعة
                  </span>
                )}
              </div>
            </div>
          )}

          <Field label="حقل الملاحظات">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="ملاحظات تلقائية وملاحظات إضافية..."
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </Field>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 rounded-md border border-input text-sm font-medium hover:bg-secondary"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={kind === "processed" && !remainingOk}
              className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              حفظ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}
