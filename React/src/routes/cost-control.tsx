/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  useDB,
  SUB_DEPTS,
  RECIPE_UNITS,
  deptKey,
  convertToBase,
  expandMealToBase,
  SHISHA_CATEGORY,
  type SubDept,
  type Meal,
  type MealKind,
  type RecipeIngredient,
  type RecipeUnit,
  type SaleLine,
  type AuditEntry,
  type ModifierGroup,
  type ModifierOption,
  SaleEntry,
} from "@/lib/store";
import { fmt2, round2, cleanNumInput, clamp0 } from "@/lib/format";
import { SearchableSelect } from "@/components/SearchableSelect";
import { PrintAuditSheet } from "@/components/PrintAudit";
import { PinPrompt } from "@/components/PinPrompt";
import ActionGate from "@/components/ui/ActionGate";
import {
  Plus,
  Trash2,
  Save,
  Printer,
  Pencil,
  X,
  ClipboardCheck,
  ChefHat,
  Boxes,
  Copy,
  ChevronDown,
  ChevronLeft,
  AlertTriangle,
  History,
} from "lucide-react";
import { printThermalSales } from "@/components/SalesReport/SalesReport";
import React from "react";
export const Route = createFileRoute("/cost-control")({
  head: () => ({ meta: [{ title: "مراقبة التكاليف - نظام المخزون" }] }),
  component: CostControlPage,
});

type TabId = "stock" | "recipes" | "sales" | "results";

function CostControlPage() {
  const [tab, setTab] = useState<TabId>("stock");

  const tabs: {
    id: TabId;
    label: string;
    icon: any;
  }[] = [
    {
      id: "stock",
      label: "مخزن الأقسام",
      icon: Boxes,
    },
    {
      id: "recipes",
      label: "الأصناف والريسبي",
      icon: ChefHat,
    },
    {
      id: "results",
      label: "النتائج والجرد",
      icon: ClipboardCheck,
    },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      <div className="no-print">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
          مراقبة التكاليف
        </h1>

        <p className="text-sm text-foreground/70 mt-1 font-medium">
          إدارة مخزن الأقسام، الريسبي، المبيعات، والجرد اليومي.
        </p>
      </div>

      {/* التابات الرئيسية */}
      <div className="no-print">
        <div className="inline-flex flex-wrap gap-2 p-2 rounded-2xl border-2 border-border bg-background shadow-sm">
          {tabs.map((t) => {
            const Icon = t.icon;

            const handlePress = () => {
              setTab(t.id);
            };

            if (t.id === "results") {
              return (
                <ActionGate
                  key={t.id}
                  requiredRole="محاسب"
                  onSuccess={handlePress}
                >
                  <button
                    type="button"
                    className={[
                      "min-h-11",
                      "px-5",
                      "rounded-xl",
                      "border-2",
                      "font-extrabold",
                      "text-sm",
                      "flex",
                      "items-center",
                      "justify-center",
                      "gap-2",
                      "transition-all",
                      "duration-200",
                      "active:scale-95",
                      tab === t.id
                        ? "bg-primary text-primary-foreground border-primary shadow-md"
                        : "bg-card text-foreground border-border hover:bg-secondary hover:border-primary/40",
                    ].join(" ")}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {t.label}
                  </button>
                </ActionGate>
              );
            }

            return (
              <button
                key={t.id}
                type="button"
                onClick={handlePress}
                className={[
                  "min-h-11",
                  "px-5",
                  "rounded-xl",
                  "border-2",
                  "font-extrabold",
                  "text-sm",
                  "flex",
                  "items-center",
                  "justify-center",
                  "gap-2",
                  "transition-all",
                  "duration-200",
                  "active:scale-95",
                  tab === t.id
                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                    : "bg-card text-foreground border-border hover:bg-secondary hover:border-primary/40",
                ].join(" ")}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "stock" && <DeptStockTab />}

      {tab === "recipes" && <RecipesTab />}

      {tab === "results" && <ResultsTab />}
    </div>
  );
}

/* ============== TAB 1: Department Inventory ============== */
function DeptStockTab() {
  const { db = { items: [], deptStock: {} }, setDeptStockQty } = useDB() || {};
  const [dept, setDept] = useState<SubDept>("مطبخ");
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<string>("");

  const rows = useMemo(() => {
    const items = (db as any)?.items || [];
    const stock = ((db as any)?.deptStock as Record<string, number>) || {};

    return items.map((it: any) => {
      const key = it?.id ? deptKey(dept, it.id) : "";
      return {
        item: it,
        qty: clamp0(stock[key] || 0),
      };
    });
  }, [db, dept]);
  const filled = rows.filter((r: any) => r.qty > 0);
  const totalValue = clamp0(
    filled.reduce((s: number, r: any) => s + r.qty * r.item.avgPrice, 0),
  );

  function startAdjust(itemId: string, current: number) {
    // setPinFor(itemId); // ❌ امسح أو الغي السطر ده عشان ميتكررش الباسوورد
    setEditingId(itemId); //  تفعيل وضع التعديل للسطر ده مباشرة
    setEditVal(fmt2(current));
  }

  function onPinOk() {
    setEditingId(pinFor); // الباسورد صح؟ افتح وضع التعديل
    setPinFor(null); // اقفل شاشة الباسورد
  }

  function saveAdjust(itemId: string) {
    const v = clamp0(parseFloat(editVal) || 0);
    // هنا بننادي على الدالة اللي بتسيف في الداتا بيس
    if (setDeptStockQty) setDeptStockQty(dept, itemId, v);
    toast.success("تم تعديل الكمية");
    setEditingId(null);
  }

  return (
    <div className="space-y-4 no-print" dir="rtl">
      {/* 🔴 التعديل الأول: إضافة شاشة طلب كلمة السر هنا 🔴 */}
      {/* 🔴 التعديل الصحيح لاستدعاء شاشة الباسورد 🔴 */}
      {pinFor && (
        <PinPrompt
          open={!!pinFor} // هيفضل مفتوح طول ما في itemId متسيف هنا
          onSuccess={onPinOk}
          onClose={() => setPinFor(null)} // بيقفل المودال لو داس بره أو داس إلغاء
          onCancel={() => setPinFor(null)}
        />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {SUB_DEPTS.map((d) => (
          <button
            key={d}
            onClick={() => setDept(d)}
            className={`px-4 h-9 rounded-md text-sm font-medium ${dept === d ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs">
            <tr>
              <th className="text-right p-3">الكود</th>
              <th className="text-right p-3">اسم الصنف</th>
              <th className="text-right p-3">الكمية في {dept}</th>
              <th className="text-right p-3">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {filled.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="p-8 text-center text-muted-foreground"
                >
                  لا توجد أصناف
                </td>
              </tr>
            ) : (
              filled.map((r: any) => (
                <tr key={r.item.id} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">{r.item.code}</td>
                  <td className="p-3 font-medium">{r.item.name}</td>
                  <td className="p-3 font-bold">
                    {/* 🔴 التعديل التاني: إظهار مربع إدخال لو الصنف ده اللي بيتعدل 🔴 */}
                    {editingId === r.item.id ? (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        className="w-24 h-8 px-2 rounded-md border border-input bg-background text-sm"
                      />
                    ) : (
                      fmt2(r.qty)
                    )}
                  </td>
                  <td className="p-3">
                    {/* إذا كان السطر في حالة تعديل، اظهر أزرار الحفظ والإلغاء */}
                    {editingId === r.item.id ? (
                      <div className="flex gap-2">
                        <button
                          className="px-2 h-7 rounded bg-primary text-primary-foreground text-xs flex items-center gap-1"
                          onClick={() => saveAdjust(r.item.id)}
                        >
                          <Save className="w-3 h-3" /> حفظ
                        </button>

                        <button
                          onClick={() => setEditingId(null)}
                          className="px-2 h-7 rounded bg-secondary text-xs"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      /* إذا لم يكن في حالة تعديل، اظهر زرار التعديل محمي بباسوورد المدير */
                      <ActionGate
                        requiredRole="مدير"
                        onSuccess={() => startAdjust(r.item.id, r.qty)}
                      >
                        <button className="px-2 h-7 rounded bg-amber-100 text-xs text-amber-900">
                          تعديل الكمية
                        </button>
                      </ActionGate>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============== TAB 2: Recipes (Menu / Processed + folders) ============== */
function RecipesTab() {
  const { db, saveMeal, deleteMeal, bulkAddMeals } = useDB();
  const [editing, setEditing] = useState<Meal | null>(null);
  const [newKind, setNewKind] = useState<MealKind | null>(null);
  const [newCategory, setNewCategory] = useState<string>("");
  const [mealsKind, setMealsKind] = useState<MealKind>("menu");
  const [mealsDept, setMealsDept] = useState<SubDept>("مطبخ");
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const visibleMeals = useMemo(
    () =>
      db.meals.filter(
        (m) => (m.kind || "menu") === mealsKind && m.department === mealsDept,
      ),
    [db.meals, mealsKind, mealsDept],
  );

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, Meal[]>();
    for (const m of visibleMeals) {
      const c = (m.category || "").trim() || "غير مصنف";
      const arr = map.get(c) || [];
      arr.push(m);
      map.set(c, arr);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "ar"),
    );
  }, [visibleMeals]);

  function computeCost(meal: Meal): number {
    const map = expandMealToBase(meal, db.meals, db.items);
    let c = 0;
    for (const [, info] of map) c += info.cost;
    return round2(clamp0(c));
  }

  function importExcel(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        const groups = new Map<string, RecipeIngredient[]>();
        let skipped = 0;
        for (const row of json) {
          const mealName = String(
            row["اسم الوجبة"] || row["الوجبة"] || "",
          ).trim();
          const ingName = String(
            row["اسم المكون"] || row["المكون"] || "",
          ).trim();
          const qty = clamp0(parseFloat(row["الكمية"]) || 0);
          const unit = String(
            row["الوحده"] || row["الوحدة"] || "",
          ).trim() as RecipeUnit;
          if (!mealName || qty <= 0 || !ingName) {
            skipped++;
            continue;
          }
          const item =
            db.items.find((i) => i.name.trim() === ingName) ||
            db.items.find(
              (i) =>
                i.name.trim().includes(ingName) ||
                ingName.includes(i.name.trim()),
            );
          if (!item) {
            skipped++;
            continue;
          }
          const useUnit: RecipeUnit = (RECIPE_UNITS as string[]).includes(unit)
            ? unit
            : item.unit;
          const arr = groups.get(mealName) || [];
          arr.push({ itemId: item.id, qty, unit: useUnit, refKind: "item" });
          groups.set(mealName, arr);
        }
        const meals: Meal[] = [];
        for (const [name, ingredients] of groups) {
          meals.push({
            id: crypto.randomUUID(),
            name,
            department: mealsDept,
            sellingPrice: 0,
            wasteMargin: 0,
            wasteMode: "percent",
            kind: mealsKind,
            category: "",
            ingredients,
          });
        }
        if (meals.length === 0) {
          toast.error("لم يتم استيراد أي وجبة.");
          return;
        }
        bulkAddMeals(meals);
        toast.success(
          `تم استيراد ${meals.length} وجبة. ${skipped > 0 ? `(تخطي ${skipped} صف)` : ""}`,
        );
      } catch (err: any) {
        toast.error("فشل قراءة الملف: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function cloneMeal(m: Meal) {
    setEditing({
      ...m,
      id: crypto.randomUUID(),
      name: m.name + " (نسخة)",
      ingredients: m.ingredients.map((x) => ({ ...x })),
    });
  }

  function addCategory() {
    const name = prompt("اسم القسم الجديد:");
    if (!name?.trim()) return;
    setOpenCats({ ...openCats, [name.trim()]: true });
    toast.success("تم إضافة القسم — أضف وجبات إليه باستخدام زر 'إضافة صنف'.");
  }

  function startNewItem(category?: string) {
    setNewKind(mealsKind);
    setNewCategory(category || "");
    setEditing(null);
  }

  return (
    <div className="space-y-4 no-print">
      <div className="flex flex-wrap items-center gap-3">
        {/* نوع الصنف */}
        <div className="inline-flex items-center gap-1 p-1 rounded-2xl border-2 border-border bg-card shadow-sm">
          <button
            type="button"
            onClick={() => setMealsKind("menu")}
            className={[
              "h-10 px-4 rounded-xl text-sm font-extrabold transition-colors",
              mealsKind === "menu"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            ].join(" ")}
          >
            الأصناف
          </button>

          <button
            type="button"
            onClick={() => setMealsKind("processed")}
            className={[
              "h-10 px-4 rounded-xl text-sm font-extrabold transition-colors",
              mealsKind === "processed"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            ].join(" ")}
          >
            المواد المصنعة
          </button>
        </div>

        {/* القسم */}
        <div className="inline-flex items-center gap-1 p-1 rounded-2xl border-2 border-border bg-card shadow-sm">
          {SUB_DEPTS.map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setMealsDept(d)}
              className={[
                "h-10 px-4 rounded-xl text-sm font-extrabold transition-colors",
                mealsDept === d
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
              ].join(" ")}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {grouped.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
            لا توجد {mealsKind === "menu" ? "أصناف" : "مواد مصنعة"} في{" "}
            {mealsDept} — استخدم "إضافة صنف" للبدء.
          </div>
        ) : (
          grouped.map(([cat, meals]) => {
            const isOpen = openCats[cat] === true;
            return (
              <div
                key={cat}
                className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-sm"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-secondary/30 border-b border-border">
                  <button
                    type="button"
                    onClick={() => setOpenCats({ ...openCats, [cat]: !isOpen })}
                    className="group flex items-center gap-3 min-w-0 text-right"
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0 transition-colors group-hover:bg-primary/15">
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronLeft className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-foreground truncate">
                        {cat}
                      </div>

                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {meals.length} صنف
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => startNewItem(cat === "غير مصنف" ? "" : cat)}
                    className="shrink-0 h-9 px-3 rounded-xl bg-background border border-border text-xs font-extrabold text-primary hover:bg-primary/5 hover:border-primary/30 transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    إضافة صنف
                  </button>
                </div>
                {isOpen && (
                  <table className="w-full text-sm border-separate border-spacing-0">
                    <thead className="bg-secondary/15 text-[11px] text-muted-foreground">
                      <tr>
                        <th className="text-right px-4 py-3 font-extrabold">
                          الاسم
                        </th>
                        <th className="text-right px-4 py-3 font-extrabold">
                          المكونات
                        </th>
                        <th className="text-right px-4 py-3 font-extrabold">
                          سعر التصنيع
                        </th>
                        <th className="text-right px-4 py-3 font-extrabold">
                          سعر البيع
                        </th>
                        <th className="text-right px-4 py-3 font-extrabold">
                          إجراءات
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {meals.map((m) => {
                        const cost = computeCost(m);
                        const profit = m.sellingPrice - cost;
                        return (
                          <tr
                            key={m.id}
                            className="border-t border-border/70 bg-card transition-all duration-150 hover:bg-primary/10 hover:shadow-[inset_4px_0_0_hsl(var(--primary))] hover:relative hover:z-10"
                          >
                            <td className="p-3 font-medium">{m.name}</td>
                            <td className="p-3">{m.ingredients.length}</td>
                            <td className="p-3">{fmt2(cost)}</td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-foreground">
                                  {fmt2(m.sellingPrice)}
                                </span>

                                {m.kind === "menu" && (
                                  <span
                                    className={`text-[11px] font-bold ${
                                      profit >= 0
                                        ? "text-success"
                                        : "text-destructive"
                                    }`}
                                  >
                                    ({fmt2(profit)})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex gap-1">
                                <button
                                  onClick={() => setEditing(m)}
                                  title="تعديل"
                                  className="p-1.5 rounded hover:bg-secondary"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => cloneMeal(m)}
                                  title="نسخ"
                                  className="p-1.5 rounded hover:bg-secondary text-primary"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(`حذف "${m.name}"؟`))
                                      deleteMeal(m.id);
                                  }}
                                  title="حذف"
                                  className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })
        )}
      </div>

      {(newKind !== null || editing) && (
        <MealDialog
          initial={editing}
          defaultKind={newKind || mealsKind}
          defaultDept={mealsDept}
          defaultCategory={newCategory}
          onClose={() => {
            setNewKind(null);
            setEditing(null);
            setNewCategory("");
          }}
          onSave={(m) => {
            saveMeal(m);
            setNewKind(null);
            setEditing(null);
            setNewCategory("");
          }}
        />
      )}
    </div>
  );
}

function MealDialog({
  initial,
  defaultKind,
  defaultDept,
  defaultCategory,
  onClose,
  onSave,
}: {
  initial: Meal | null;
  defaultKind: MealKind;
  defaultDept: SubDept;
  defaultCategory: string;
  onClose: () => void;
  onSave: (m: Meal) => void;
}) {
  const { db } = useDB();
  const [name, setName] = useState(initial?.name || "");
  const [dept, setDept] = useState<SubDept>(initial?.department || defaultDept);
  const [kind, setKind] = useState<MealKind>(initial?.kind || defaultKind);
  const [category, setCategory] = useState(
    initial?.category || defaultCategory,
  );
  const [price, setPrice] = useState(initial?.sellingPrice?.toString() || "0");
  const [waste, setWaste] = useState(initial?.wasteMargin?.toString() || "0");
  const [wasteMode, setWasteMode] = useState<"percent" | "fixed">(
    initial?.wasteMode || "percent",
  );
  const [ings, setIngs] = useState<RecipeIngredient[]>(
    initial?.ingredients.map((x) => ({ ...x, refKind: x.refKind || "item" })) ||
      [],
  );
  const [hasModifiers, setHasModifiers] = useState<boolean>(
    !!initial?.hasModifiers,
  );
  const [modGroups, setModGroups] = useState<ModifierGroup[]>(
    initial?.modifierGroups || [],
  );
  const isShishaCat = (category || "").trim() === SHISHA_CATEGORY;

  function addGroup() {
    setModGroups([
      ...modGroups,
      { id: crypto.randomUUID(), name: "", required: true, options: [] },
    ]);
  }
  function updateGroup(gid: string, patch: Partial<ModifierGroup>) {
    setModGroups(modGroups.map((g) => (g.id === gid ? { ...g, ...patch } : g)));
  }
  function removeGroup(gid: string) {
    setModGroups(modGroups.filter((g) => g.id !== gid));
  }
  function addOption(gid: string) {
    updateGroup(gid, {
      options: [
        ...(modGroups.find((g) => g.id === gid)?.options || []),
        { id: crypto.randomUUID(), label: "", extraPrice: 0 },
      ],
    });
  }
  function updateOption(
    gid: string,
    oid: string,
    patch: Partial<ModifierOption>,
  ) {
    const g = modGroups.find((x) => x.id === gid);
    if (!g) return;
    updateGroup(gid, {
      options: g.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)),
    });
  }
  function removeOption(gid: string, oid: string) {
    const g = modGroups.find((x) => x.id === gid);
    if (!g) return;
    updateGroup(gid, { options: g.options.filter((o) => o.id !== oid) });
  }

  const cost = useMemo(() => {
    const tmpMeal: Meal = {
      id: initial?.id || "tmp",
      name,
      department: dept,
      sellingPrice: clamp0(price),
      wasteMargin: clamp0(waste),
      wasteMode,
      kind,
      category,
      ingredients: ings.filter((i) => i.itemId && i.qty > 0),
    };
    const map = expandMealToBase(tmpMeal, db.meals, db.items);
    let c = 0;
    for (const [, info] of map) c += info.cost;
    return round2(clamp0(c));
  }, [
    ings,
    db.items,
    db.meals,
    name,
    dept,
    price,
    waste,
    wasteMode,
    kind,
    category,
    initial?.id,
  ]);

  // Options for ingredient picker: items + meals (both menu & processed), excluding self
  const ingredientOptions = useMemo(() => {
    const items = db.items.map((i) => ({
      value: `item:${i.id}`,
      label: i.name,
      hint: i.unit,
      group: i.kind === "processed" ? "مصنع (مخزن)" : "مكونات المخزن",
    }));
    const processed = db.meals
      .filter((m) => m.id !== initial?.id && (m.kind || "menu") === "processed")
      .map((m) => ({
        value: `meal:${m.id}`,
        label: "🍳 " + m.name,
        hint: m.department,
        group: "مواد مصنعة (وصفات)",
      }));
    const menus = db.meals
      .filter((m) => m.id !== initial?.id && (m.kind || "menu") === "menu")
      .map((m) => ({
        value: `meal:${m.id}`,
        label: "🍽 " + m.name,
        hint: m.department,
        group: "أصناف جاهزة",
      }));
    return [...items, ...processed, ...menus];
  }, [db.items, db.meals, initial?.id]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-5xl p-5 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">
            {initial ? "تعديل" : "جديد"} —{" "}
            {kind === "menu" ? "صنف للبيع" : "مادة مصنعة"}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <label className="block col-span-2">
            <span className="text-xs mb-1 block">الاسم</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs mb-1 block">النوع</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MealKind)}
              className="w-full h-10 px-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="menu">صنف للبيع</option>
              <option value="processed">مادة مصنعة</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs mb-1 block">القسم</span>
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value as SubDept)}
              className="w-full h-10 px-2 rounded-md border border-input bg-background text-sm"
            >
              {SUB_DEPTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block col-span-2">
            <span className="text-xs mb-1 block">القسم (مجلد/فئة)</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="مثلاً: مشاوي، بيتزا، عصائر"
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            />
          </label>
          {kind === "menu" && (
            <label className="block">
              <span className="text-xs mb-1 block">سعر البيع</span>
              <input
                type="number"
                min="0"
                step="any"
                value={price}
                onChange={(e) => setPrice(cleanNumInput(e.target.value))}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              />
            </label>
          )}
          <div className="block col-span-2 md:col-span-4 text-xs bg-secondary/40 rounded-md px-3 py-2 text-muted-foreground">
            حدّد{" "}
            <strong className="text-foreground">
              هامش الخطأ المسموح (جرام)
            </strong>{" "}
            يدوياً لكل مكون أدناه. يُستخدم في صفحة الجرد لاحتساب الهدر المسموح
            به فقط للأصناف التي بِيعت اليوم.
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">
            المكونات (مخزون، مواد مصنعة، أو وجبات)
          </h3>
          <button
            onClick={() =>
              setIngs([
                ...ings,
                { itemId: "", qty: 0, unit: "كيلوجرام", refKind: "item" },
              ])
            }
            className="text-sm text-primary flex items-center gap-1 hover:underline"
          >
            <Plus className="w-4 h-4" /> إضافة مكون
          </button>
        </div>
        <div className="space-y-2">
          {ings.map((ing, idx) => {
            const isMeal = ing.refKind === "meal";
            const it = !isMeal
              ? db.items.find((i) => i.id === ing.itemId)
              : undefined;
            const ml = isMeal
              ? db.meals.find((m) => m.id === ing.itemId)
              : undefined;
            const base = it
              ? convertToBase(
                  ing.qty,
                  ing.unit,
                  it.unit,
                  it.conversionFactor,
                  it.subUnitType,
                )
              : 0;
            const currentValue = ing.itemId
              ? `${isMeal ? "meal" : "item"}:${ing.itemId}`
              : "";
            return (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-start bg-secondary/30 p-2 rounded-lg"
              >
                <div className="col-span-12 md:col-span-6">
                  <SearchableSelect
                    options={ingredientOptions}
                    value={currentValue}
                    placeholder="ابحث عن مكون أو وصفة..."
                    onChange={(v) => {
                      const [refKind, id] = v.split(":");
                      const c = [...ings];
                      if (refKind === "meal")
                        c[idx] = {
                          itemId: id,
                          qty: c[idx].qty || 1,
                          unit: "قطعة",
                          refKind: "meal",
                        };
                      else {
                        const it2 = db.items.find((i) => i.id === id);
                        c[idx] = {
                          itemId: id,
                          qty: c[idx].qty,
                          unit: it2?.unit || "كيلوجرام",
                          refKind: "item",
                        };
                      }
                      setIngs(c);
                    }}
                  />
                  {it && (
                    <div className="text-xs text-muted-foreground mt-1 px-1">
                      وحدة المخزن: {it.unit}{" "}
                      {it.subUnitQty
                        ? `(1 ${it.unit} = ${it.subUnitQty} ${it.subUnitType})`
                        : ""}{" "}
                      • سعر: {fmt2(it.avgPrice)}
                    </div>
                  )}
                  {ml && (
                    <div className="text-xs text-muted-foreground mt-1 px-1">
                      من قسم: {ml.department} • {ml.ingredients.length} مكون
                    </div>
                  )}
                </div>
                <div className="col-span-5 md:col-span-3">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={ing.qty || ""}
                    placeholder={isMeal ? "العدد" : "الكمية"}
                    onChange={(e) => {
                      const c = [...ings];
                      c[idx] = {
                        ...c[idx],
                        qty: clamp0(cleanNumInput(e.target.value)),
                      };
                      setIngs(c);
                    }}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  />
                </div>
                <div className="col-span-5 md:col-span-2">
                  {isMeal ? (
                    <div className="h-10 grid place-items-center text-xs text-muted-foreground bg-background border border-input rounded-md">
                      وحدة
                    </div>
                  ) : (
                    <select
                      value={ing.unit}
                      onChange={(e) => {
                        const c = [...ings];
                        c[idx] = {
                          ...c[idx],
                          unit: e.target.value as RecipeUnit,
                        };
                        setIngs(c);
                      }}
                      className="w-full h-10 px-2 rounded-md border border-input bg-background text-sm"
                    >
                      {RECIPE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="col-span-2 md:col-span-1 flex justify-center">
                  <button
                    onClick={() => setIngs(ings.filter((_, i) => i !== idx))}
                    className="h-10 w-10 grid place-items-center rounded-md text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {it && base > 0 && (
                  <div className="col-span-12 text-xs text-muted-foreground px-1">
                    يعادل: {fmt2(base)} {it.unit}
                  </div>
                )}
                {!isMeal && (
                  <div className="col-span-12 md:col-span-6 flex items-center gap-2 px-1">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      هامش الخطأ المسموح (جرام):
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={ing.errorMargin ?? ""}
                      placeholder="0"
                      onChange={(e) => {
                        const c = [...ings];
                        c[idx] = {
                          ...c[idx],
                          errorMargin: clamp0(cleanNumInput(e.target.value)),
                        };
                        setIngs(c);
                      }}
                      className="w-28 h-8 px-2 rounded-md border border-input bg-background text-xs"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Shisha hint */}
        {isShishaCat && kind === "menu" && (
          <div className="mt-4 p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 text-xs text-purple-800 dark:text-purple-200">
            ✨ هذا الصنف ضمن فئة <strong>الشيشة</strong> — لن يتم خصمه من المخزن
            الفرعي ولن يظهر "العدد الممكن تصنيعه" في شاشة الطلبات.
          </div>
        )}

        {/* Modifiers */}
        {kind === "menu" && (
          <div className="mt-4 border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={hasModifiers}
                onChange={(e) => setHasModifiers(e.target.checked)}
              />
              هل توجد خيارات أو إضافات لهذا المنتج؟
            </label>
            {hasModifiers && (
              <div className="mt-3 space-y-3">
                {modGroups.map((g) => (
                  <div
                    key={g.id}
                    className="border border-border rounded-lg p-3 bg-secondary/30 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        value={g.name}
                        onChange={(e) =>
                          updateGroup(g.id, { name: e.target.value })
                        }
                        placeholder="اسم المجموعة (مثلاً: نوع البن)"
                        className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm"
                      />
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={g.required}
                          onChange={(e) =>
                            updateGroup(g.id, { required: e.target.checked })
                          }
                        />
                        مطلوب
                      </label>
                      <button
                        onClick={() => removeGroup(g.id)}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {g.options.map((o) => (
                        <div
                          key={o.id}
                          className="grid grid-cols-12 gap-2 items-center"
                        >
                          <input
                            value={o.label}
                            onChange={(e) =>
                              updateOption(g.id, o.id, {
                                label: e.target.value,
                              })
                            }
                            placeholder="الخيار (مثلاً: سادة)"
                            className="col-span-7 h-9 px-3 rounded-md border border-input bg-background text-sm"
                          />
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={o.extraPrice || ""}
                            onChange={(e) =>
                              updateOption(g.id, o.id, {
                                extraPrice: clamp0(
                                  parseFloat(cleanNumInput(e.target.value)) ||
                                    0,
                                ),
                              })
                            }
                            placeholder="سعر إضافي"
                            className="col-span-4 h-9 px-3 rounded-md border border-input bg-background text-sm"
                          />
                          <button
                            onClick={() => removeOption(g.id, o.id)}
                            className="col-span-1 p-2 text-destructive hover:bg-destructive/10 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addOption(g.id)}
                        className="text-xs text-primary flex items-center gap-1 hover:underline mt-1"
                      >
                        <Plus className="w-3 h-3" /> إضافة خيار
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addGroup}
                  className="px-3 h-9 rounded-md bg-secondary text-sm flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> إضافة مجموعة خيارات
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-4 mt-4">
          <div className="text-sm">
            سعر التصنيع:{" "}
            <strong className="text-primary text-lg">{fmt2(cost)}</strong> ج.م
          </div>
          <button
            onClick={() => {
              if (!name.trim()) {
                toast.error("أدخل الاسم");
                return;
              }
              const cleanIngs = ings.filter((i) => i.itemId && i.qty > 0);
              if (cleanIngs.length === 0 && !isShishaCat) {
                toast.error("أضف مكون واحدًا على الأقل");
                return;
              }
              const cleanGroups = hasModifiers
                ? modGroups
                    .map((g) => ({
                      ...g,
                      name: g.name.trim(),
                      options: g.options.filter((o) => o.label.trim()),
                    }))
                    .filter((g) => g.name && g.options.length > 0)
                : [];
              onSave({
                id: initial?.id || crypto.randomUUID(),
                name: name.trim(),
                department: dept,
                kind,
                category: category.trim(),
                sellingPrice: kind === "menu" ? clamp0(price) : 0,
                wasteMargin: clamp0(waste),
                wasteMode,
                ingredients: cleanIngs,
                hasModifiers: hasModifiers && cleanGroups.length > 0,
                modifierGroups: cleanGroups,
              });
            }}
            className="px-5 h-11 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> حفظ
          </button>
        </div>
      </div>
    </div>
  );
}

function aggregateDailySales(
  sales: any[],
  date: string,
  dept: SubDept,
  meals: Meal[],
) {
  const map = new Map<
    string,
    { name: string; qty: number; price: number; total: number }
  >();

  const mealsMap = new Map(meals.map((meal) => [meal.id, meal]));

  for (const s of sales) {
    const cleanSaleDate = new Date(s.createdAt || s.date).toLocaleDateString(
      "en-CA",
    );

    if (cleanSaleDate !== date || s.department !== dept) {
      continue;
    }

    for (const ln of s.lines || []) {
      const m = mealsMap.get(ln.mealId);

      if (!m) continue;

      const cur = map.get(m.id) || {
        name: m.name,
        qty: 0,
        price: m.sellingPrice,
        total: 0,
      };

      cur.qty += Number(ln.qty || 0);
      cur.total += m.sellingPrice * Number(ln.qty || 0);

      map.set(m.id, cur);
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ar"),
  );
}

function normalizeDepartment(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/\s+/g, " ");
}

function isShishaDepartment(value: string | null | undefined) {
  const normalized = normalizeDepartment(value);

  return (
    normalized === "شيشه" || normalized === "shisha" || normalized === "hookah"
  );
}
/* ============== TAB 4: Results & Audit ============== */
// 1. شيلنا الـ shisha من الأنواع عشان مش عايزينها تظهر لوحدها في الأزرار
type ResultsView = "all" | "kitchen" | "bar" | "shisha" | "audit";

function ResultsTab() {
  const { db, fetchSales } = useDB();

  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);

  const [view, setView] = useState<ResultsView>("all");

  // =========================================================
  // Helpers
  // =========================================================

  function pad2(value: number) {
    return String(value).padStart(2, "0");
  }

  function getLocalDate(date = new Date()) {
    return [
      date.getFullYear(),
      pad2(date.getMonth() + 1),
      pad2(date.getDate()),
    ].join("-");
  }

  function getLocalDateTime(date = new Date()) {
    return `${getLocalDate(date)}T${pad2(
      date.getHours(),
    )}:${pad2(date.getMinutes())}`;
  }

  function getDateOnly(value: string) {
    return value.slice(0, 10);
  }

  function formatDateTimeLabel(value: string) {
    if (!value) return "غير محدد";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "غير محدد";
    }

    return new Intl.DateTimeFormat("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function getSaleTimestamp(sale: SaleEntry) {
    const raw = Number(sale.createdAt || 0);

    if (raw > 0) {
      return raw;
    }

    const parsed = new Date(sale.date).getTime();

    return Number.isNaN(parsed) ? 0 : parsed;
  }

  // =========================================================
  // Business shift range
  // 08:00 AM -> 06:00 AM next day
  // =========================================================

  function getDefaultBusinessRange() {
    const now = new Date();

    // لو إحنا قبل 8 الصبح،
    // يبقى إحنا لسه في شيفت اليوم السابق.
    const businessDate = new Date(now);

    if (now.getHours() < 8) {
      businessDate.setDate(businessDate.getDate() - 1);
    }

    const start = new Date(
      businessDate.getFullYear(),
      businessDate.getMonth(),
      businessDate.getDate(),
      8,
      0,
      0,
      0,
    );

    const end = new Date(
      businessDate.getFullYear(),
      businessDate.getMonth(),
      businessDate.getDate() + 1,
      6,
      0,
      0,
      0,
    );

    return {
      start: getLocalDateTime(start),
      end: getLocalDateTime(end),
    };
  }

  // =========================================================
  // Time filter
  // =========================================================

  const [timeFilterOpen, setTimeFilterOpen] = useState(false);

  const defaultRange = getDefaultBusinessRange();

  const [filterStart, setFilterStart] = useState(defaultRange.start);

  const [filterEnd, setFilterEnd] = useState(defaultRange.end);

  const [draftStart, setDraftStart] = useState(defaultRange.start);

  const [draftEnd, setDraftEnd] = useState(defaultRange.end);

  // =========================================================
  // Categories
  // =========================================================

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const [categorySearch, setCategorySearch] = useState("");

  const [categorySearchOpen, setCategorySearchOpen] = useState(false);

  const mainDepartment =
    view === "kitchen"
      ? "مطبخ"
      : view === "bar"
        ? "بار"
        : view === "shisha"
          ? "شيشه"
          : undefined;

  // =========================================================
  // Available categories
  // =========================================================

  const availableCategories = useMemo(() => {
    const source = mainDepartment
      ? db.meals.filter((m) => {
          if (view === "shisha") {
            return isShishaDepartment(m.department);
          }

          return m.department === mainDepartment;
        })
      : db.meals;

    return Array.from(
      new Set(source.map((m) => (m.category || "").trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, "ar"));
  }, [db.meals, mainDepartment, view]);

  const visibleCategories = useMemo(() => {
    const search = categorySearch.trim().toLowerCase();

    return availableCategories.filter((category) => {
      if (!search) return true;

      return category.toLowerCase().includes(search);
    });
  }, [availableCategories, categorySearch]);

  // =========================================================
  // Load sales
  // =========================================================

  useEffect(() => {
    let cancelled = false;

    async function loadSales() {
      setLoadingSales(true);

      try {
        // السيرفر بيجيب اليوم/الأيام المطلوبة،
        // والفلترة الدقيقة بالساعة بتحصل تحت باستخدام createdAt.
        const result = await fetchSales(
          getDateOnly(filterStart),
          getDateOnly(filterEnd),
          mainDepartment,
        );

        if (!cancelled) {
          setSales(result);
        }
      } catch (err) {
        console.error("fetchSales failed:", err);

        if (!cancelled) {
          setSales([]);
          toast.error("فشل تحميل المبيعات من السيرفر");
        }
      } finally {
        if (!cancelled) {
          setLoadingSales(false);
        }
      }
    }

    if (view !== "audit") {
      loadSales();
    }

    return () => {
      cancelled = true;
    };
  }, [fetchSales, filterStart, filterEnd, mainDepartment, view]);

  // =========================================================
  // Category actions
  // =========================================================

  function toggleCategory(category: string) {
    setSelectedCategories((prev) => {
      if (prev.includes(category)) {
        return prev.filter((x) => x !== category);
      }

      return [...prev, category];
    });
  }

  function removeCategory(category: string) {
    setSelectedCategories((prev) => prev.filter((x) => x !== category));
  }

  function clearCategories() {
    setSelectedCategories([]);
  }

  function changeView(nextView: ResultsView) {
    setView(nextView);
    setSelectedCategories([]);
    setCategorySearch("");
    setCategorySearchOpen(false);
  }

  // =========================================================
  // Time actions
  // =========================================================

  function openTimeFilter() {
    setDraftStart(filterStart);
    setDraftEnd(filterEnd);
    setTimeFilterOpen(true);
  }

  function applyTimeFilter() {
    const start = new Date(draftStart).getTime();
    const end = new Date(draftEnd).getTime();

    if (Number.isNaN(start) || Number.isNaN(end)) {
      toast.error("حدد التاريخ والوقت بشكل صحيح");
      return;
    }

    if (start > end) {
      toast.error("وقت البداية لا يمكن أن يكون بعد وقت النهاية");
      return;
    }

    setFilterStart(draftStart);
    setFilterEnd(draftEnd);
    setTimeFilterOpen(false);
  }

  // =========================================================
  // Reset to business shift
  // 08:00 AM -> 06:00 AM next day
  // =========================================================

  function resetTimeFilter() {
    const range = getDefaultBusinessRange();

    setDraftStart(range.start);
    setDraftEnd(range.end);

    // مهم:
    // زر "الفترة الافتراضية" يطبق مباشرة
    // نفس فترة الشيفت.
    setFilterStart(range.start);
    setFilterEnd(range.end);
    setTimeFilterOpen(false);
  }

  // =========================================================
  // Exact time filter
  // =========================================================

  const filteredSales = useMemo(() => {
    const startTs = new Date(filterStart).getTime();
    const endTs = new Date(filterEnd).getTime();

    return sales.filter((sale) => {
      const saleTs = getSaleTimestamp(sale);

      if (!saleTs) {
        return false;
      }

      if (saleTs < startTs || saleTs > endTs) {
        return false;
      }

      if (view === "kitchen" && sale.department !== "مطبخ") {
        return false;
      }

      if (view === "bar" && sale.department !== "بار") {
        return false;
      }

      if (view === "shisha" && !isShishaDepartment(sale.department)) {
        return false;
      }

      return true;
    });
  }, [sales, filterStart, filterEnd, view]);

  // =========================================================
  // Aggregate
  // =========================================================

  const aggregatedItems = useMemo(() => {
    const map = new Map<
      string,
      {
        meal: Meal;
        qty: number;
        cost: number;
        price: number;
        dept: string;
        category: string;
      }
    >();

    filteredSales.forEach((sale) => {
      (sale.lines || []).forEach((line) => {
        const meal = db.meals.find((m) => m.id === line.mealId);

        if (!meal) {
          return;
        }

        const category = (meal.category || "").trim();

        // Multi select
        if (
          selectedCategories.length > 0 &&
          !selectedCategories.includes(category)
        ) {
          return;
        }

        const expandMap = expandMealToBase(meal, db.meals, db.items);

        let c = 0;

        for (const [, info] of expandMap) {
          c += info.cost;
        }

        const cost = round2(clamp0(c));

        const existing = map.get(meal.id);

        if (existing) {
          existing.qty += Number(line.qty || 0);
        } else {
          map.set(meal.id, {
            meal,
            qty: Number(line.qty || 0),
            cost,
            price: meal.sellingPrice,
            dept: sale.department,
            category,
          });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) =>
      a.meal.name.localeCompare(b.meal.name, "ar"),
    );
  }, [filteredSales, db.meals, db.items, selectedCategories]);

  // =========================================================
  // Totals
  // =========================================================

  const totalSales = clamp0(
    aggregatedItems.reduce((sum, row) => sum + row.price * row.qty, 0),
  );

  const totalCost = clamp0(
    aggregatedItems.reduce((sum, row) => sum + row.cost * row.qty, 0),
  );

  const profit = totalSales - totalCost;

  // =========================================================
  // Print
  // =========================================================

  function printSalesReport() {
    const items = aggregatedItems.map((row) => ({
      name: row.meal.name,
      qty: row.qty,
      unitPrice: row.price,
      total: row.price * row.qty,
    }));

    const mainLabel =
      view === "kitchen"
        ? "المطبخ"
        : view === "bar"
          ? "البار"
          : view === "shisha"
            ? "الشيشة"
            : "كل الأقسام";

    const categoryLabel =
      selectedCategories.length > 0
        ? ` - ${selectedCategories.join(" + ")}`
        : "";

    printThermalSales({
      title: "تقرير المبيعات",
      department: `${mainLabel}${categoryLabel}`,
      fromDate: filterStart,
      toDate: filterEnd,
      items,
    });
  }

  // =========================================================
  // Render
  // =========================================================

  return (
    <div className="space-y-5" dir="rtl">
      {/* =====================================================
          Header
      ===================================================== */}

      <div className="no-print bg-card border-2 border-border rounded-2xl p-3 shadow-sm">
        <div className="flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
          {/* Main tabs */}

          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all", label: "الكل" },
                { id: "kitchen", label: "المطبخ" },
                { id: "bar", label: "البار" },
                { id: "shisha", label: "الشيشة" },
                { id: "audit", label: "الجرد" },
              ] as {
                id: ResultsView;
                label: string;
              }[]
            ).map((t) => {
              const button = (
                <button
                  type="button"
                  onClick={
                    t.id === "audit" ? undefined : () => changeView(t.id)
                  }
                  className={[
                    "min-w-[92px]",
                    "h-10",
                    "px-4",
                    "rounded-xl",
                    "border-2",
                    "font-bold",
                    "text-sm",
                    "flex",
                    "items-center",
                    "justify-center",
                    "transition-all",
                    "duration-200",
                    "active:scale-95",
                    view === t.id
                      ? "bg-primary text-primary-foreground border-primary shadow-md"
                      : "bg-background text-foreground border-border hover:bg-secondary hover:border-primary/40",
                  ].join(" ")}
                >
                  {t.label}
                </button>
              );

              if (t.id === "audit") {
                return (
                  <ActionGate
                    key={t.id}
                    requiredRole="مدير"
                    onSuccess={() => setView("audit")}
                  >
                    {button}
                  </ActionGate>
                );
              }

              return <React.Fragment key={t.id}>{button}</React.Fragment>;
            })}
          </div>

          {/* Time + Print */}

          {view !== "audit" && (
            <div className="flex flex-wrap items-center gap-3">
              {/* Current period */}

              <button
                type="button"
                onClick={openTimeFilter}
                className="group min-h-12 h-auto px-3.5 py-2 rounded-2xl border-2 border-border bg-card hover:border-primary/40 hover:bg-secondary/40 transition-all duration-150 flex items-center gap-3 shadow-sm"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <History className="w-4 h-4" />
                </div>

                <div className="text-right leading-tight">
                  <div className="text-[10px] font-bold text-muted-foreground mb-1">
                    فترة التقرير
                  </div>

                  <div className="flex items-center gap-2 text-sm font-extrabold text-foreground whitespace-nowrap">
                    <span>{filterStart.slice(0, 10)}</span>

                    <span className="text-muted-foreground">←</span>

                    <span>{filterEnd.slice(0, 10)}</span>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 mt-1 text-[11px] font-bold whitespace-nowrap">
                    <span className="text-primary">
                      {filterStart.slice(11, 16)}
                    </span>

                    <span className="text-muted-foreground">→</span>

                    <span className="text-primary">
                      {filterEnd.slice(11, 16)}
                    </span>
                  </div>
                </div>

                <ChevronDown className="w-4 h-4 ms-2 text-muted-foreground shrink-0" />
              </button>

              {/* Print */}

              <button
                type="button"
                onClick={printSalesReport}
                disabled={loadingSales || aggregatedItems.length === 0}
                className="h-12 px-5 rounded-2xl bg-primary text-primary-foreground font-extrabold text-sm flex items-center gap-2.5 shadow-sm transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 rounded-xl bg-primary-foreground/10 grid place-items-center">
                  <Printer className="w-4 h-4" />
                </div>

                <span>طباعة التقرير</span>
              </button>
            </div>
          )}
        </div>

        {/* =====================================================
            Categories
        ===================================================== */}

        {view !== "audit" && availableCategories.length > 0 && (
          <div className="mt-4 pt-4 border-t-2 border-border">
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-extrabold text-foreground">
                  الاصناف
                </div>
              </div>

              {/* Selected chips */}

              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedCategories.map((category) => (
                    <div
                      key={category}
                      className="inline-flex items-center gap-2 h-9 px-3 rounded-full bg-emerald-100 border-2 border-emerald-300 text-emerald-800 text-xs font-extrabold"
                    >
                      <span>{category}</span>

                      <button
                        type="button"
                        onClick={() => removeCategory(category)}
                        className="w-5 h-5 rounded-full bg-emerald-200 hover:bg-emerald-300 flex items-center justify-center font-black transition-colors"
                        title="إزالة القسم"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={clearCategories}
                    className="h-9 px-3 rounded-full border-2 border-border bg-background hover:bg-secondary text-xs font-bold transition-colors"
                  >
                    مسح الكل
                  </button>
                </div>
              )}

              {/* Search */}

              <div className="relative w-full max-w-xl">
                <div
                  className={[
                    "flex items-center gap-2",
                    "h-12 px-4",
                    "rounded-xl",
                    "border-2",
                    categorySearchOpen
                      ? "border-primary ring-2 ring-primary/10"
                      : "border-border",
                    "bg-background",
                  ].join(" ")}
                >
                  <span className="text-base opacity-70">🔎</span>

                  <input
                    value={categorySearch}
                    onFocus={() => setCategorySearchOpen(true)}
                    onChange={(e) => {
                      setCategorySearch(e.target.value);
                      setCategorySearchOpen(true);
                    }}
                    placeholder="ابحث عن قسم مثل: مشويات..."
                    className="flex-1 bg-transparent outline-none text-sm font-bold text-foreground placeholder:text-muted-foreground"
                  />

                  {categorySearch && (
                    <button
                      type="button"
                      onClick={() => setCategorySearch("")}
                      className="w-7 h-7 rounded-lg hover:bg-secondary text-muted-foreground font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                {categorySearchOpen && (
                  <div className="absolute top-full mt-2 z-50 w-full bg-card border-2 border-border rounded-2xl shadow-2xl overflow-hidden">
                    <div className="max-h-64 overflow-y-auto p-2">
                      {visibleCategories.length === 0 ? (
                        <div className="p-5 text-center text-sm text-muted-foreground font-bold">
                          لا يوجد قسم مطابق للبحث
                        </div>
                      ) : (
                        visibleCategories.map((category) => {
                          const selected =
                            selectedCategories.includes(category);

                          return (
                            <button
                              type="button"
                              key={category}
                              onClick={() => toggleCategory(category)}
                              className={[
                                "w-full",
                                "min-h-11",
                                "px-3",
                                "rounded-xl",
                                "flex",
                                "items-center",
                                "justify-between",
                                "gap-3",
                                "text-sm",
                                "font-bold",
                                "mb-1 last:mb-0",
                                selected
                                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                  : "text-foreground hover:bg-secondary",
                              ].join(" ")}
                            >
                              <span>{category}</span>

                              <span
                                className={[
                                  "w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black",
                                  selected
                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                    : "border-border text-transparent",
                                ].join(" ")}
                              >
                                ✓
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="border-t-2 border-border px-3 py-2 bg-secondary/30 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground font-bold">
                        {selectedCategories.length} قسم محدد
                      </span>

                      <button
                        type="button"
                        onClick={() => setCategorySearchOpen(false)}
                        className="text-xs font-extrabold text-primary hover:underline"
                      >
                        تم
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Close category search */}

      {categorySearchOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setCategorySearchOpen(false)}
        />
      )}

      {/* =====================================================
          Stats
      ===================================================== */}

      {view !== "audit" && (
        <>
          <div className="no-print grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="إجمالي المبيعات"
              value={fmt2(totalSales) + " ج.م"}
              highlight="text-sky-700"
              bg="bg-sky-50 border-sky-200"
            />

            <Stat
              label="إجمالي التكلفة"
              value={fmt2(totalCost) + " ج.م"}
              highlight="text-slate-700"
              bg="bg-slate-100 border-slate-200"
            />

            <Stat
              label="صافي الربح"
              value={fmt2(profit) + " ج.م"}
              highlight={profit >= 0 ? "text-emerald-700" : "text-red-700"}
              bg={
                profit >= 0
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-red-50 border-red-200"
              }
            />

            <Stat
              label="عدد الأصناف المباعة"
              value={aggregatedItems.length.toString()}
              highlight="text-foreground"
              bg="bg-background border-border"
            />
          </div>

          {/* Selected filters */}

          <div className="no-print flex flex-wrap items-center justify-between gap-2 px-1">
            {selectedCategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedCategories.map((category) => (
                  <span
                    key={category}
                    className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-extrabold"
                  >
                    {category}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* =================================================
              Sales table
          ================================================= */}

          <div className="no-print bg-card border-2 border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b-2 border-border bg-secondary/30 flex items-center justify-between gap-2">
              <div>
                <h2 className="font-extrabold text-sm">
                  تفاصيل المبيعات والتكاليف
                </h2>
              </div>

              {selectedCategories.length > 0 && (
                <div className="text-xs font-extrabold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {selectedCategories.length} أقسام محددة
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs">
                  <tr>
                    <th className="text-right px-4 py-3 font-extrabold">
                      الصنف
                    </th>

                    <th className="text-right px-4 py-3 font-extrabold">
                      القسم
                    </th>

                    <th className="text-right px-4 py-3 font-extrabold">
                      القسم الفرعي
                    </th>

                    <th className="text-right px-4 py-3 font-extrabold">
                      الكمية المباعة
                    </th>

                    <th className="text-right px-4 py-3 font-extrabold">
                      سعر التصنيع
                    </th>

                    <th className="text-right px-4 py-3 font-extrabold">
                      سعر البيع
                    </th>

                    <th className="text-right px-4 py-3 font-extrabold">
                      إجمالي التكلفة
                    </th>

                    <th className="text-right px-4 py-3 font-extrabold">
                      إجمالي المبيعات
                    </th>

                    <th className="text-right px-4 py-3 font-extrabold">
                      الربح
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loadingSales ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="p-10 text-center font-bold text-muted-foreground"
                      >
                        جاري تحميل المبيعات...
                      </td>
                    </tr>
                  ) : aggregatedItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="p-10 text-center font-bold text-muted-foreground"
                      >
                        لا توجد بيانات مبيعات في هذه الفترة
                      </td>
                    </tr>
                  ) : (
                    aggregatedItems.map((row) => {
                      const totalRowCost = row.cost * row.qty;

                      const totalRowSales = row.price * row.qty;

                      const rowProfit = totalRowSales - totalRowCost;

                      return (
                        <tr
                          key={row.meal.id}
                          className="border-t-2 border-border hover:bg-secondary/20 transition-colors"
                        >
                          <td className="p-3 font-bold">{row.meal.name}</td>

                          <td className="p-3 font-bold">{row.dept}</td>

                          <td className="p-3 text-xs font-semibold text-muted-foreground">
                            {row.category || "غير مصنف"}
                          </td>

                          <td className="p-3 font-extrabold">
                            {fmt2(row.qty)}
                          </td>

                          <td className="p-3 text-red-600 font-bold">
                            {fmt2(row.cost)}
                          </td>

                          <td className="p-3 text-primary font-bold">
                            {fmt2(row.price)}
                          </td>

                          <td className="p-3 font-semibold">
                            {fmt2(totalRowCost)}
                          </td>

                          <td className="p-3 font-semibold">
                            {fmt2(totalRowSales)}
                          </td>

                          <td
                            className={`p-3 font-extrabold ${
                              rowProfit >= 0
                                ? "text-emerald-700"
                                : "text-red-700"
                            }`}
                          >
                            {fmt2(rowProfit)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* =====================================================
          Audit
      ===================================================== */}

      {view === "audit" && <AuditView />}

      {/* =====================================================
          Time Filter Modal
      ===================================================== */}

      {timeFilterOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setTimeFilterOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}

            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-foreground">
                  تحديد فترة المبيعات
                </h3>

                <p className="text-xs text-muted-foreground mt-1">
                  اختر وقت البداية والنهاية بدقة
                </p>
              </div>

              <button
                type="button"
                onClick={() => setTimeFilterOpen(false)}
                className="w-9 h-9 rounded-lg border border-border bg-background hover:bg-secondary transition-colors font-bold"
              >
                ×
              </button>
            </div>

            {/* Body */}

            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-3">
                {/* ================= البداية ================= */}

                <div className="rounded-xl border-2 border-primary/20 bg-primary/[0.03] p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-extrabold">
                      1
                    </div>

                    <div>
                      <div className="text-sm font-extrabold">البداية</div>

                      <div className="text-[11px] text-muted-foreground">
                        من هنا يبدأ التقرير
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-xs font-bold text-muted-foreground block mb-1.5">
                        التاريخ
                      </span>

                      <input
                        type="date"
                        value={draftStart.slice(0, 10)}
                        onChange={(e) => {
                          const time = draftStart.slice(11, 16) || "08:00";

                          setDraftStart(`${e.target.value}T${time}`);
                        }}
                        className="w-full h-11 px-3 rounded-lg border-2 border-input bg-background text-sm font-bold text-foreground outline-none focus:border-primary transition-colors"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-bold text-muted-foreground block mb-1.5">
                        الوقت
                      </span>

                      <input
                        type="time"
                        value={draftStart.slice(11, 16)}
                        onChange={(e) => {
                          const date =
                            draftStart.slice(0, 10) || getDateOnly(filterStart);

                          setDraftStart(`${date}T${e.target.value}`);
                        }}
                        className="w-full h-11 px-3 rounded-lg border-2 border-input bg-background text-sm font-bold text-foreground outline-none focus:border-primary transition-colors"
                      />
                    </label>
                  </div>

                  <div className="mt-4 rounded-lg bg-background border border-border px-3 py-2.5">
                    <div className="text-[10px] text-muted-foreground font-bold mb-1">
                      البداية المختارة
                    </div>

                    <div className="text-sm font-extrabold text-foreground">
                      {formatDateTimeLabel(draftStart)}
                    </div>
                  </div>
                </div>

                {/* ================= السهم ================= */}

                <div className="flex items-center justify-center">
                  <div className="w-9 h-9 md:w-10 md:h-10 rounded-full border-2 border-border bg-background shadow-sm flex items-center justify-center text-muted-foreground font-bold">
                    ←
                  </div>
                </div>

                {/* ================= النهاية ================= */}

                <div className="rounded-xl border-2 border-emerald-500/20 bg-emerald-500/[0.03] p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-700 flex items-center justify-center text-sm font-extrabold">
                      2
                    </div>

                    <div>
                      <div className="text-sm font-extrabold">النهاية</div>

                      <div className="text-[11px] text-muted-foreground">
                        إلى هنا ينتهي التقرير
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-xs font-bold text-muted-foreground block mb-1.5">
                        التاريخ
                      </span>

                      <input
                        type="date"
                        value={draftEnd.slice(0, 10)}
                        onChange={(e) => {
                          const time = draftEnd.slice(11, 16) || "06:00";

                          setDraftEnd(`${e.target.value}T${time}`);
                        }}
                        className="w-full h-11 px-3 rounded-lg border-2 border-input bg-background text-sm font-bold text-foreground outline-none focus:border-emerald-500 transition-colors"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-bold text-muted-foreground block mb-1.5">
                        الوقت
                      </span>

                      <input
                        type="time"
                        value={draftEnd.slice(11, 16)}
                        onChange={(e) => {
                          const date =
                            draftEnd.slice(0, 10) || getDateOnly(filterEnd);

                          setDraftEnd(`${date}T${e.target.value}`);
                        }}
                        className="w-full h-11 px-3 rounded-lg border-2 border-input bg-background text-sm font-bold text-foreground outline-none focus:border-emerald-500 transition-colors"
                      />
                    </label>
                  </div>

                  <div className="mt-4 rounded-lg bg-background border border-border px-3 py-2.5">
                    <div className="text-[10px] text-muted-foreground font-bold mb-1">
                      النهاية المختارة
                    </div>

                    <div className="text-sm font-extrabold text-foreground">
                      {formatDateTimeLabel(draftEnd)}
                    </div>
                  </div>
                </div>
              </div>

              {/* ================= Preview ================= */}

              <div className="mt-4 rounded-xl border-2 border-border bg-secondary/40 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] text-muted-foreground font-bold mb-1">
                      التقرير سيعرض
                    </div>

                    <div className="text-sm font-extrabold text-foreground">
                      المبيعات من
                      <span className="text-primary mx-1.5">
                        {new Intl.DateTimeFormat("ar-EG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(draftStart))}
                      </span>
                      الساعة
                      <span className="text-primary mx-1.5">
                        {draftStart.slice(11, 16)}
                      </span>
                      إلى
                      <span className="text-emerald-700 mx-1.5">
                        {new Intl.DateTimeFormat("ar-EG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(draftEnd))}
                      </span>
                      الساعة
                      <span className="text-emerald-700 mx-1.5">
                        {draftEnd.slice(11, 16)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ================= Footer ================= */}

              <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={resetTimeFilter}
                  className="w-full sm:w-auto h-10 px-4 rounded-lg border-2 border-border bg-background hover:bg-secondary font-bold text-sm transition-colors"
                >
                  فترة الشيفت 08:00 → 06:00
                </button>

                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setTimeFilterOpen(false)}
                    className="flex-1 sm:flex-none h-10 px-5 rounded-lg border-2 border-border bg-background hover:bg-secondary font-bold text-sm transition-colors"
                  >
                    إلغاء
                  </button>

                  <button
                    type="button"
                    onClick={applyTimeFilter}
                    className="flex-1 sm:flex-none h-10 px-6 rounded-lg bg-primary text-primary-foreground font-extrabold text-sm shadow-sm hover:opacity-95 active:scale-[0.98] transition-all"
                  >
                    تطبيق الفترة
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
/* --- Audit View (history + new audit per dept/date) --- */
function AuditView() {
  const { db, addAudit, fetchSales } = useDB();

  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dept, setDept] = useState<SubDept>("مطبخ");
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [pendingOverwrite, setPendingOverwrite] = useState<AuditEntry | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;

    async function loadSales() {
      setLoadingSales(true);

      try {
        const result = await fetchSales(date, date, dept);

        if (!cancelled) {
          setSales(result);
        }
      } catch (err) {
        console.error("Audit sales fetch failed:", err);

        if (!cancelled) {
          setSales([]);
          toast.error("فشل تحميل مبيعات الجرد من السيرفر");
        }
      } finally {
        if (!cancelled) {
          setLoadingSales(false);
        }
      }
    }

    loadSales();

    return () => {
      cancelled = true;
    };
  }, [fetchSales, date, dept]);
  const [printChecklist, setPrintChecklist] = useState(false);
  const [printReceipt, setPrintReceipt] = useState<AuditEntry | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const isPast = date < today;

  const existing = useMemo(
    () => db.audits.find((a) => a.date === date && a.department === dept),
    [db.audits, date, dept],
  );

  // 1. تم نقل allowedWasteMap هنا للأعلى عشان الـ rows تقدر تعتمد عليها في الفلترة
  const allowedWasteMap = useMemo(() => {
    const map = new Map<string, number>();

    function walk(mealId: any, multiplier: number, visited: Set<string>) {
      const mealStrId = String(mealId);
      if (visited.has(mealStrId)) return;
      visited.add(mealStrId);

      const meal = db.meals.find((m: any) => String(m.id) === mealStrId);
      if (!meal) return;
      if (!meal.ingredients) return;

      for (const ing of meal.ingredients) {
        if (ing.refKind === "meal") {
          // بما إن qty رقم، هنستخدمه مباشرة ونحط 1 كقيمة افتراضية لو مش موجود
          const ingQty = ing.qty ?? 1;
          walk(ing.itemId, multiplier * ingQty, new Set(visited));
        } else {
          // بما إن errorMargin رقم أو undefined، هناخده مباشرة بـ clamp0
          const grams = clamp0(ing.errorMargin || 0) * multiplier;
          if (grams > 0) {
            const itemStrId = String(ing.itemId);
            map.set(itemStrId, (map.get(itemStrId) || 0) + grams);
          }
        }
      }
    }

    for (const s of sales) {
      if (!s.date) continue;

      // 🌟 السطر السحري: تحويل تاريخ الفاتورة أياً كان شكله (ISO أو طابع زمني) إلى صيغة YYYY-MM-DD النظيفة
      const cleanSaleDate = new Date(s.date).toLocaleDateString("en-CA");

      // المقارنة الآن أصبحت آمنة 100% ومقاومة لفرق التوقيت
      if (cleanSaleDate !== date) continue;

      if (!s.lines) continue;

      for (const ln of s.lines) {
        const q = clamp0(ln.qty);
        if (q <= 0) continue;

        const meal = db.meals.find(
          (m: any) => String(m.id) === String(ln.mealId),
        );
        if (meal && meal.department === dept) {
          walk(ln.mealId, q, new Set());
        }
      }
    }
    return map;
  }, [sales, db.meals, date, dept]);
  // 2. تحديث الفلتر ليظهر الأصناف اللي ليها رصيد أو حصل عليها مبيعات وهدر اليوم
  const rows = useMemo(
    () =>
      db.items
        .map((it) => ({
          item: it,
          expected: clamp0(db.deptStock[deptKey(dept, it.id)] || 0),
        }))
        .filter(
          (r) => r.expected > 0 || (allowedWasteMap.get(r.item.id) || 0) > 0,
        ),
    [db.items, db.deptStock, dept, allowedWasteMap],
  );

  const soldCount = useMemo(() => {
    let n = 0;

    for (const s of sales) {
      for (const ln of s.lines || []) {
        n += clamp0(ln.qty);
      }
    }

    return n;
  }, [sales]);

  // 3. تحديث الفانكشن عشان تدعم لو الصنف نفسه بيتخزن بالجرام أو الملي في المخزن الرئيسي
  // Convert allowed grams → allowed in inventory units (only meaningful for weight/volume items).
  function allowedInInvUnits(unit: string, grams: number): number {
    if (unit === "كيلوجرام" || unit === "لتر") return grams / 1000;
    // لازم نضيف السطر ده عشان الهدر يتخصم لو الوحدة جرام أو مللي
    if (unit === "جرام" || unit === "جم" || unit === "مللي" || unit === "مل")
      return grams;
    return 0;
  }

  // 4. حل مشكلة الـ Empty String عند مسح الخانة وحساب العجز بدقة
  const { shortageValue, totalAllowedValue, totalItemShortageMoney } =
    useMemo(() => {
      let sv = 0;
      let av = 0;
      let rv = 0;

      for (const r of rows) {
        const inputVal = actuals[r.item.id];
        const actual =
          inputVal === undefined || inputVal === ""
            ? r.expected
            : clamp0(inputVal);

        // إذا كان الفعلي أكبر من المتوقع، مفيش عجز
        if (actual >= r.expected) continue;

        // 1. العجز الخام بالكمية (مثلاً: 8.40 كيس)
        const rawShort = r.expected - actual;

        // 2. حساب قيمة العجز الإجمالية قبل الخصم (بالجنيه)
        const totalItemShortageMoney = rawShort * r.item.avgPrice;

        // 3. جلب الهدر المسموح بالجرام من المبيعات (مثلاً: 114 جرام)
        const allowedG = allowedWasteMap.get(r.item.id) || 0;

        // 4. تحويل الهدر المسموح لقيمة مالية (تمن الـ 114 جرام دول كام جنيه؟)
        // بنقسم على 1000 لو الصنف بالكيلو/اللتر/الكيس عشان نجيب سعر الجرام الواحد ونضربه في كمية الهدر
        const unitClean = String(r.item.unit || "")
          .trim()
          .toLowerCase();
        const isBigUnit =
          unitClean.includes("كيلو") ||
          unitClean.includes("كجم") ||
          unitClean.includes("لتر") ||
          unitClean.includes("كيس") ||
          unitClean.includes("kg") ||
          unitClean.includes("l");

        const allowedPricePerGram = isBigUnit
          ? r.item.avgPrice / 1000
          : r.item.avgPrice;
        const allowedMoneyValue = allowedG * allowedPricePerGram;

        // 5. الطرح المباشر والصافي اللي أنت عايزه (قيمة العجز بالفلوس - قيمة الهدر بالفلوس)
        const finalItemShortageMoney = Math.max(
          0,
          totalItemShortageMoney - allowedMoneyValue,
        );

        // تجميع الإجماليات للسيستم تحت
        rv += totalItemShortageMoney; // العجز الاصلي باقرب رقم عشري
        sv += finalItemShortageMoney; // العجز الصافي بالفلوس
        av += Math.min(allowedMoneyValue, totalItemShortageMoney); // المسموح المخصوم بالفلوس
      }

      return {
        shortageValue: sv,
        totalAllowedValue: av,
        totalItemShortageMoney: rv,
      };
    }, [actuals, rows, allowedWasteMap]);

  const penalty = Math.max(0, shortageValue);

  // 5. تعديل بناء الجرد ليتناسب مع الإصلاحات السابقة وعدم تزييف الزيادات (Surplus)
  function buildAudit(): AuditEntry {
    const auditRows = rows.map((r) => {
      const inputVal = actuals[r.item.id];
      const actual =
        inputVal === undefined || inputVal === ""
          ? r.expected
          : clamp0(inputVal);

      return {
        itemId: r.item.id,
        expected: r.expected,
        actual, // تم إلغاء السقف الافتراضي هنا عشان لو فيه زيادة تتسجل في الـ الرو صح والمخزن يتعدل بها
        match: actual === r.expected,
      };
    });
    return {
      id: crypto.randomUUID(),
      date,
      department: dept,
      rows: auditRows,
      shortageValue: round2(shortageValue),
      penaltyValue: round2(penalty),
      createdAt: Date.now(),
    };
  }

  // ضفنا كلمة async هنا
  async function doSave(audit: AuditEntry, overwrite: boolean) {
    try {
      // ضفنا كلمة await هنا عشان نستنى الرد الفعلي من السيرفر
      const res = await addAudit(audit, { overwrite, deduct: true });

      if (!res.ok) {
        if (res.error === "duplicate") {
          setPendingOverwrite(audit);
          return;
        }
        // لو فيه خطأ تاني جاي من السيرفر يظهر للمستخدم
        toast.error(res.error || "حدث خطأ أثناء حفظ الجرد");
        return;
      }

      toast.success("تم حفظ الجرد وخصم العجز من المخزون");
      setActuals({});
      setPrintReceipt(audit);
      setTimeout(() => {
        window.print();
        setTimeout(() => setPrintReceipt(null), 500);
      }, 150);
    } catch (err) {
      console.error(err);
      toast.error("فشل الاتصال بالسيرفر لحفظ الجرد");
    }
  }

  function saveNew() {
    if (isPast) {
      toast.error("لا يمكن حفظ جرد لتاريخ سابق.");
      return;
    }
    const audit = buildAudit();
    doSave(audit, false);
  }

  function printChecklistNow() {
    setPrintChecklist(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintChecklist(false), 500);
    }, 100);
  }
  return (
    <div className="space-y-4">
      <div className="no-print bg-card border border-border rounded-xl p-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs mb-1 block">تاريخ الجرد</span>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setActuals({});
            }}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          />
        </label>
        <label className="block min-w-[160px]">
          <span className="text-xs mb-1 block">القسم</span>
          <SearchableSelect
            options={SUB_DEPTS.map((d) => ({ value: d, label: d }))}
            value={dept}
            onChange={(v) => {
              setDept(v as SubDept);
              setActuals({});
            }}
          />
        </label>
        {isPast && existing && (
          <div className="text-xs px-3 py-2 rounded-md bg-secondary flex items-center gap-2">
            <History className="w-4 h-4" /> عرض جرد سابق محفوظ بتاريخ {date}
          </div>
        )}
        <div className="ms-auto flex gap-2">
          <button
            onClick={printChecklistNow}
            disabled={isPast}
            className="h-10 px-4 rounded-md border border-input text-sm flex items-center gap-2 hover:bg-secondary disabled:opacity-40"
          >
            <Printer className="w-4 h-4" /> طباعة قائمة الجرد
          </button>
        </div>
      </div>

      {isPast && existing ? (
        <PastAuditView audit={existing} items={db.items} />
      ) : isPast && !existing ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          لا يوجد جرد محفوظ بتاريخ {date} لقسم {dept}.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          {existing && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-md text-xs">
              <AlertTriangle className="w-4 h-4" /> تم عمل جرد مسبقاً اليوم لـ{" "}
              {dept}. الحفظ سيستبدل الجرد القديم.
            </div>
          )}
          <h2 className="font-bold text-sm">الجرد الإلكتروني — {dept}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs">
                <tr>
                  <th className="text-right p-2">الكود</th>
                  <th className="text-right p-2">الصنف</th>
                  <th className="text-right p-2">القيمة الافتراضية</th>
                  <th className="text-right p-2">القيمة الفعلية</th>
                  <th className="text-right p-2">الهدر المسموح به (جرام)</th>
                  <th className="text-right p-2">العجز</th>
                  <th className="text-right p-2">قيمة العجز</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-6 text-center text-muted-foreground"
                    >
                      لا توجد مخزون في {dept}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const rawActual = actuals[r.item.id];
                    const actualNum = clamp0(
                      rawActual ?? r.expected.toString(),
                    );
                    const exceeds = actualNum > r.expected;
                    const rawShortage = Math.max(0, r.expected - actualNum);
                    const allowedG = allowedWasteMap.get(r.item.id) || 0;
                    const allowedUnits = Math.min(
                      allowedInInvUnits(r.item.unit, allowedG),
                      rawShortage,
                    );
                    const effShortage = Math.max(0, rawShortage - allowedUnits);
                    const shortageVal = effShortage * r.item.avgPrice;

                    return (
                      <tr key={r.item.id} className="border-t border-border">
                        <td className="p-2 font-mono text-xs">{r.item.code}</td>
                        <td className="p-2">{r.item.name}</td>
                        <td className="p-2 text-muted-foreground">
                          {fmt2(r.expected)} {r.item.unit}
                        </td>
                        <td className="p-2">
                          {(() => {
                            // 1. تحديد هل الصنف ليه وحدة فرعية ومعامل تحويل ولا لأ
                            const hasSubUnit =
                              !!r.item.subUnitType &&
                              (r.item.conversionFactor || 0) > 1;
                            const factor = hasSubUnit
                              ? r.item.conversionFactor
                              : 1;
                            const unitLabel = hasSubUnit
                              ? r.item.subUnitType
                              : r.item.unit;

                            // 2. تحويل القيمة الافتراضية عشان تتعرض بالوحدة الفرعية (لو موجودة)
                            const displayExpected = r.expected * factor;

                            // 3. تحويل القيمة الفعلية اللي متسجلة في الـ state عشان تتعرض للمستخدم بالوحدة الفرعية
                            const displayActual =
                              rawActual !== undefined && rawActual !== ""
                                ? (parseFloat(rawActual) * factor).toString()
                                : "";

                            return (
                              <div className="relative w-32">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={displayActual}
                                  placeholder={fmt2(displayExpected)}
                                  onChange={(e) => {
                                    const v = cleanNumInput(e.target.value);
                                    const num = parseFloat(v);

                                    // لو المستخدم مسح الخانة خالص
                                    if (isNaN(num)) {
                                      setActuals({
                                        ...actuals,
                                        [r.item.id]: "",
                                      });
                                      return;
                                    }

                                    // 4. الحسبة: نقسم الرقم اللي دخله على الـ factor عشان نرجعه للوحدة الأساسية
                                    const baseNum = num / factor;

                                    // التحقق من إن القيمة الفعلية مش أكبر من الافتراضية[cite: 8]
                                    if (baseNum > r.expected) {
                                      toast.error(
                                        `الكمية الفعلية يجب ألا تتجاوز الكمية الافتراضية (${fmt2(displayExpected)} ${unitLabel})`,
                                      );
                                      setActuals({
                                        ...actuals,
                                        [r.item.id]: r.expected.toString(),
                                      });
                                      return;
                                    }

                                    // 5. بنحفظ في السيستم القيمة بالوحدة الأساسية عشان باقي الحسابات (العجز والغرامة) تفضل مظبوطة[cite: 8]
                                    setActuals({
                                      ...actuals,
                                      [r.item.id]: baseNum.toString(),
                                    });
                                  }}
                                  className={`w-full h-8 px-2 pl-12 rounded-md border bg-background text-xs ${exceeds ? "border-destructive" : "border-input"}`}
                                />
                                {/* 6. عرض اسم الوحدة كـ Suffix جوا الخانة */}
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none whitespace-nowrap">
                                  {unitLabel}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-2">
                          <span
                            className={
                              allowedG > 0
                                ? "text-emerald-600 dark:text-emerald-400 font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {fmt2(allowedG)}
                          </span>
                        </td>
                        <td className="p-2">
                          {effShortage > 0 ? (
                            <span className="text-destructive font-medium">
                              {fmt2(effShortage)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2">
                          {shortageVal > 0 ? (
                            <span className="text-destructive">
                              {fmt2(shortageVal)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-6 border-t border-border pt-4 text-sm">
            <div>
              العجز الكلي:{" "}
              <strong className="text-destructive font-bold text-base">
                {fmt2(totalItemShortageMoney)} ج.م
              </strong>
            </div>

            <div>
              مسموح ب:{" "}
              <strong className="text-green-600 font-bold text-base">
                {fmt2(totalAllowedValue)} ج.م
              </strong>
            </div>

            <div className="text-muted-foreground">
              مبيعات اليوم:{" "}
              <strong className="text-foreground">{soldCount} صنف</strong>
            </div>

            {penalty > 0 && (
              <div className="px-3 py-1.5 rounded-md bg-destructive/10 text-destructive font-bold border border-destructive/20 animate-pulse">
                ⚠️ الغرامة المطلوبة: {fmt2(penalty)} ج.م
              </div>
            )}

            <button
              onClick={saveNew}
              className="ms-auto h-10 px-5 rounded-md bg-primary hover:bg-primary/95 text-primary-foreground text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" /> ترحيل وحفظ الجرد
            </button>
          </div>
        </div>
      )}

      {pendingOverwrite && (
        <div
          className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
          onClick={() => setPendingOverwrite(null)}
        >
          <div
            className="bg-card border border-border rounded-xl max-w-md w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" /> تم عمل جرد مسبقاً اليوم
            </h3>
            <p className="text-sm text-muted-foreground">
              يوجد جرد محفوظ لتاريخ {pendingOverwrite.date} لقسم{" "}
              {pendingOverwrite.department}. هل تريد استبداله؟
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setPendingOverwrite(null)}
                className="flex-1 h-10 rounded-md border border-input text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  const a = pendingOverwrite;
                  setPendingOverwrite(null);
                  doSave(a, true);
                }}
                className="flex-1 h-10 rounded-md bg-destructive text-destructive-foreground text-sm"
              >
                اعتماد الجرد الجديد
              </button>
            </div>
          </div>
        </div>
      )}

      {printChecklist && (
        <div className="print-area">
          <PrintAuditSheet date={date} department={dept} items={rows} />
        </div>
      )}
      {printReceipt && (
        <div className="print-area">
          <AuditReceiptPrint audit={printReceipt} items={db.items} />
        </div>
      )}
    </div>
  );
}

function PastAuditView({ audit, items }: { audit: AuditEntry; items: any[] }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h2 className="font-bold text-sm">
        جرد محفوظ — {audit.department} • {audit.date}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs">
            <tr>
              <th className="text-right p-2">الصنف</th>
              <th className="text-right p-2">القيمة الافتراضية</th>
              <th className="text-right p-2">القيمة الفعلية</th>
              <th className="text-right p-2">العجز</th>
            </tr>
          </thead>
          <tbody>
            {audit.rows.map((r) => {
              const it = items.find((x) => x.id === r.itemId);
              const short = Math.max(0, r.expected - r.actual);
              return (
                <tr key={r.itemId} className="border-t border-border">
                  <td className="p-2">{it?.name || r.itemId}</td>
                  <td className="p-2">{fmt2(r.expected)}</td>
                  <td className="p-2">{fmt2(r.actual)}</td>
                  <td className="p-2">
                    {short > 0 ? (
                      <span className="text-destructive">{fmt2(short)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 text-sm border-t border-border pt-3">
        <div>
          قيمة العجز:{" "}
          <strong className="text-destructive">
            {fmt2(audit.shortageValue)} ج.م
          </strong>
        </div>
        {audit.penaltyValue > 0 && (
          <div>
            غرامة:{" "}
            <strong className="text-destructive">
              {fmt2(audit.penaltyValue)} ج.م
            </strong>
          </div>
        )}
      </div>
    </div>
  );
}

/* --- Auto-downloaded PDF Audit Receipt --- */
function AuditReceiptPrint({
  audit,
  items,
}: {
  audit: AuditEntry;
  items: any[];
}) {
  const shortRows = audit.rows.filter((r) => r.expected > r.actual);
  return (
    <div className="print-voucher">
      <div className="text-center border-b border-black pb-2 mb-2">
        <h1 className="text-base font-bold">إيصال عجز الجرد</h1>
        <div className="text-xs">
          القسم: {audit.department} • التاريخ: {audit.date}
        </div>
      </div>
      {shortRows.length === 0 ? (
        <div className="text-center text-sm py-4">
          لا يوجد عجز — الجرد مطابق تماماً.
        </div>
      ) : (
        <table className="print-table w-full">
          <thead>
            <tr>
              <th style={{ width: "26px" }}>#</th>
              <th>اسم الصنف</th>
              <th style={{ width: "60px" }}>المتوقع</th>
              <th style={{ width: "60px" }}>الفعلي</th>
              <th style={{ width: "60px" }}>العجز</th>
              <th style={{ width: "80px" }}>قيمة العجز</th>
            </tr>
          </thead>
          <tbody>
            {shortRows.map((r, i) => {
              const it = items.find((x) => x.id === r.itemId);
              const short = r.expected - r.actual;
              return (
                <tr key={r.itemId}>
                  <td>{i + 1}</td>
                  <td>{it?.name || r.itemId}</td>
                  <td>{fmt2(r.expected)}</td>
                  <td>{fmt2(r.actual)}</td>
                  <td>{fmt2(short)}</td>
                  <td>{fmt2(short * (it?.avgPrice || 0))}</td>
                </tr>
              );
            })}
            <tr style={{ fontWeight: "bold", background: "#eee" }}>
              <td colSpan={5}>إجمالي قيمة العجز</td>
              <td>{fmt2(audit.shortageValue)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <div className="mt-3 text-xs">
        ملاحظة: تم خصم كميات العجز تلقائياً من مخزون القسم.
        {audit.penaltyValue > 0 && (
          <>
            {" "}
            • هذا القسم يتحمل غرامة قدرها{" "}
            <strong>{fmt2(audit.penaltyValue)}</strong> جنيه.
          </>
        )}
      </div>
      <div className="flex justify-between mt-4 text-xs">
        <div>اسم المسؤول: ____________</div>
        <div>التوقيع: ____________</div>
      </div>
    </div>
  );
}

/* --- End of Day PDF (Kitchen | Bar split) --- */
function EndOfDayPrint({ date, sales }: { date: string; sales: SaleEntry[] }) {
  const { db } = useDB();

  const todaySales = sales;

  const sumS = clamp0(
    todaySales.reduce((s, x) => s + Number(x.totalSales || 0), 0),
  );

  const sumC = clamp0(
    todaySales.reduce((s, x) => s + Number(x.totalCost || 0), 0),
  );

  const net = sumS - sumC;

  const todayAudits = db.audits.filter((a) => {
    const cleanAuditDate = new Date(a.createdAt || a.date).toLocaleDateString(
      "en-CA",
    );

    return cleanAuditDate === date || a.date === date;
  });

  const kRows = aggregateDailySales(sales, date, "مطبخ", db.meals);

  const bRows = aggregateDailySales(sales, date, "بار", db.meals);

  const sRows = aggregateDailySales(sales, date, "شيشه", db.meals);

  return (
    <div className="print-voucher">
      <div className="text-center border-b-2 border-black pb-2 mb-3">
        <h1 className="text-lg font-bold">تقرير تقفيل اليوم</h1>
        <div className="text-xs">التاريخ: {date}</div>
      </div>

      <table className="print-table w-full" style={{ marginBottom: "10px" }}>
        <tbody>
          <tr>
            <td style={{ width: "50%" }}>
              <strong>إجمالي المبيعات</strong>
            </td>
            <td>{fmt2(sumS)} ج.م</td>
          </tr>

          <tr>
            <td>
              <strong>إجمالي التكلفة</strong>
            </td>
            <td>{fmt2(sumC)} ج.م</td>
          </tr>

          <tr style={{ background: "#eee" }}>
            <td>
              <strong>صافي الربح/الخسارة</strong>
            </td>
            <td>
              <strong>{fmt2(net)} ج.م</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <SalesPdfSection title="مبيعات المطبخ" rows={kRows} />

      <div
        style={{
          borderTop: "2px solid #000",
          margin: "10px 0",
        }}
      />

      <SalesPdfSection title="مبيعات البار" rows={bRows} />

      <div
        style={{
          borderTop: "2px solid #000",
          margin: "10px 0",
        }}
      />

      <SalesPdfSection title="مبيعات الشيشة" rows={sRows} />

      <h2 className="text-sm font-bold mt-3 mb-1">نتائج الجرد</h2>

      {todayAudits.length === 0 ? (
        <div className="text-xs">لم يتم إجراء جرد لهذا اليوم</div>
      ) : (
        <table className="print-table w-full">
          <thead>
            <tr>
              <th>القسم</th>
              <th>قيمة العجز</th>
              <th>قيمة الغرامة</th>
            </tr>
          </thead>

          <tbody>
            {todayAudits.map((a) => (
              <tr key={a.id}>
                <td>{a.department}</td>
                <td>{fmt2(a.shortageValue)} ج.م</td>
                <td>{fmt2(a.penaltyValue)} ج.م</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// دالة مساعدة لطباعة جداول مبيعات الأقسام داخل تقرير نهاية اليوم بدون تكرار كود
function SalesPdfSection({ title, rows }: { title: string; rows: any[] }) {
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalVal = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div className="my-2">
      <h3 className="text-xs font-bold mb-1">{title}</h3>
      {rows.length === 0 ? (
        <div className="text-[10px] text-muted-foreground">لا توجد مبيعات</div>
      ) : (
        <table className="print-table w-full text-[11px]">
          <thead>
            <tr>
              <th>الصنف</th>
              <th>السعر</th>
              <th>الكمية</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{r.name}</td>
                <td>{fmt2(r.price)}</td>
                <td>{fmt2(r.qty)}</td>
                <td>{fmt2(r.total)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: "bold", background: "#f5f5f5" }}>
              <td colSpan={2}>الإجمالي</td>
              <td>{fmt2(totalQty)}</td>
              <td>{fmt2(totalVal)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  bg,
}: {
  label: string;
  value: string;
  highlight?: string;
  bg?: string;
}) {
  return (
    <div
      className={`
      bg-card border border-border rounded-xl p-4 ${bg || ""} 
      transition-all duration-300 ease-in-out hover:shadow-md hover:-translate-y-1
      ${bg ? `hover:border-${bg}-200` : ""}`}
    >
      <div className={`text-2xl font-bold ${highlight || ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
