import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDB } from "@/lib/store";
import { ItemPicker } from "@/components/ItemPicker";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/entry")({
  head: () => ({ meta: [{ title: "إذن توريد - نظام المخزون" }] }),
  component: EntryPage,
});

interface Line {
  id: string;
  itemId: string;
  qty: string;
  price: string;
}

function EntryPage() {
  const { db, addEntryVoucher } = useDB();
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { id: crypto.randomUUID(), itemId: "", qty: "", price: "" },
  ]);

  const updateLine = (id: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const total = lines.reduce(
    (s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0),
    0,
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = lines
      .filter(
        (l) => l.itemId && parseFloat(l.qty) > 0 && parseFloat(l.price) >= 0,
      )
      .map((l) => ({
        itemId: l.itemId,
        qty: parseFloat(l.qty),
        price: parseFloat(l.price),
      }));
    if (valid.length === 0) {
      toast.error("أضف صنفًا واحدًا على الأقل");
      return;
    }
    if (!supplier.trim()) {
      toast.error("أدخل اسم المورد");
      return;
    }
    addEntryVoucher(date, supplier.trim(), valid);
    toast.success("تم حفظ إذن التوريد وتحديث المخزون");
    navigate({ to: "/history" });
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">إذن توريد / دخول</h1>
        <p className="text-sm text-muted-foreground mt-1">
          إضافة أصناف جديدة للمخزون. يتم احتساب متوسط السعر تلقائيًا.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="bg-card border border-border rounded-xl p-5 space-y-4"
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground mb-1 block">
              التاريخ
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground mb-1 block">
              اسم المورد
            </span>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              required
              placeholder="مثال: شركة الفجر"
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm">الأصناف</h2>
            <button
              type="button"
              onClick={() =>
                setLines([
                  ...lines,
                  { id: crypto.randomUUID(), itemId: "", qty: "", price: "" },
                ])
              }
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Plus className="w-4 h-4" /> إضافة سطر
            </button>
          </div>

          <div className="space-y-2">
            {lines.map((l, idx) => {
              const item = db.items.find((i) => i.id === l.itemId);
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-12 gap-2 items-start bg-secondary/30 p-2 rounded-lg"
                >
                  <div className="col-span-12 md:col-span-5">
                    <ItemPicker
                      items={db.items}
                      value={l.itemId}
                      onChange={(id) => updateLine(l.id, { itemId: id })}
                    />
                    {item && (
                      <div className="text-xs text-muted-foreground mt-1 px-1">
                        الوحدة: {item.unit} • المتاح: {item.qty} • متوسط حالي:{" "}
                        {item.avgPrice.toFixed(2)}
                      </div>
                    )}
                  </div>
                  <div className="col-span-5 md:col-span-3">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={l.qty}
                      onChange={(e) =>
                        updateLine(l.id, {
                          qty: e.target.value.replace(/^-/, ""),
                        })
                      }
                      placeholder="الكمية المضافة"
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    />
                  </div>
                  <div className="col-span-5 md:col-span-3">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={l.price}
                      onChange={(e) =>
                        updateLine(l.id, {
                          price: e.target.value.replace(/^-/, ""),
                        })
                      }
                      placeholder="السعر الجديد"
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1 flex justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        setLines(lines.filter((x) => x.id !== l.id))
                      }
                      disabled={lines.length === 1}
                      className="h-10 w-10 grid place-items-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="col-span-12 text-xs text-muted-foreground px-1">
                    سطر {idx + 1} • الإجمالي:{" "}
                    {(
                      (parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0)
                    ).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="text-sm">
            <span className="text-muted-foreground">الإجمالي الكلي: </span>
            <span className="font-bold text-lg text-primary">
              {total.toFixed(2)}
            </span>
          </div>
          <button
            type="submit"
            className="flex items-center gap-2 px-5 h-11 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90"
          >
            <Save className="w-4 h-4" />
            حفظ الإذن
          </button>
        </div>
      </form>
    </div>
  );
}
