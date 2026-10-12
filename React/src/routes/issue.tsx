import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useDB,
  DEPARTMENTS,
  type Department,
  type EntryVoucher,
} from "@/lib/store";
import { ItemPicker } from "@/components/ItemPicker";
import { SearchableSelect } from "@/components/SearchableSelect";
import { fmt2, cleanNumInput } from "@/lib/format";
import { Plus, Trash2, Save, Download, FileInput, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/issue")({
  head: () => ({ meta: [{ title: "إذن صرف - نظام المخزون" }] }),
  component: IssuePage,
});

interface Line {
  id: string;
  itemId: string;
  qty: string;
}

function IssuePage() {
  const { db, addIssueVoucher } = useDB();
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [department, setDepartment] = useState<Department>("مطبخ");
  const [lines, setLines] = useState<Line[]>([
    { id: crypto.randomUUID(), itemId: "", qty: "" },
  ]);
  const [showImport, setShowImport] = useState(false);

  const updateLine = (id: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const valid = lines
      .filter((l) => l.itemId && parseFloat(l.qty) > 0)
      .map((l) => ({ itemId: l.itemId, qty: parseFloat(l.qty) }));

    if (valid.length === 0) {
      toast.error("أضف صنفًا واحدًا على الأقل");
      return;
    }

    try {
      // 🌟 السطر السحري: إضافة await عشان نستنى النتيجة الحقيقية تطلع من الداتابيز والسيرفر
      const res = await addIssueVoucher(date, department, valid);

      if (!res.ok) {
        toast.error(res.error || "حدث خطأ أثناء حفظ الإذن");
        return;
      }

      toast.success("تم حفظ إذن الصرف وخصم الكميات من المخزون");
      navigate({ to: "/history" });
    } catch (err) {
      console.error("خطأ أثناء الحفظ:", err);
      toast.error("حدث خطأ غير متوقع أثناء الحفظ.");
    }
  };

  function importFromInvoice(v: EntryVoucher) {
    const newLines: Line[] = v.lines.map((ln) => ({
      id: crypto.randomUUID(),
      itemId: ln.itemId,
      qty: ln.qty.toString(),
    }));
    if (newLines.length === 0) {
      toast.error("هذه الفاتورة لا تحتوي على أصناف");
      return;
    }
    setLines(newLines);
    setShowImport(false);
    toast.success(`تم استيراد ${newLines.length} صف من فاتورة "${v.supplier}"`);
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">إذن صرف</h1>
          <p className="text-sm text-muted-foreground mt-1">
            صرف أصناف من المخزون إلى الأقسام.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowImport(true)}
          className="h-10 px-4 rounded-lg border border-input text-sm font-medium hover:bg-secondary flex items-center gap-2"
        >
          <FileInput className="w-4 h-4" /> استيراد فاتورة (من سجل التوريد)
        </button>
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
              القسم المصروف له
            </span>
            <SearchableSelect
              options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
              value={department}
              onChange={(v) => setDepartment(v as Department)}
              placeholder="اختر القسم..."
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
                  { id: crypto.randomUUID(), itemId: "", qty: "" },
                ])
              }
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Plus className="w-4 h-4" /> إضافة سطر
            </button>
          </div>

          <div className="space-y-2">
            {lines.map((l) => {
              const item = db.items.find((i) => i.id === l.itemId);
              const req = parseFloat(l.qty) || 0;
              const tooMuch = item && req > item.qty;
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-12 gap-2 items-start bg-secondary/30 p-2 rounded-lg"
                >
                  <div className="col-span-12 md:col-span-6">
                    <ItemPicker
                      items={db.items}
                      value={l.itemId}
                      onChange={(id) => updateLine(l.id, { itemId: id })}
                    />
                    {item && (
                      <div
                        className={`text-xs mt-1 px-1 ${tooMuch ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                      >
                        الوحدة: {item.unit} • المتاح: {fmt2(item.qty)}{" "}
                        {tooMuch && "— الكمية المطلوبة تتجاوز المتاح!"}
                      </div>
                    )}
                  </div>
                  <div className="col-span-8 md:col-span-3">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={l.qty}
                      onChange={(e) =>
                        updateLine(l.id, { qty: cleanNumInput(e.target.value) })
                      }
                      placeholder="الكمية المطلوبة"
                      className={`w-full h-10 px-3 rounded-md border bg-background text-sm ${tooMuch ? "border-destructive" : "border-input"}`}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!item}
                    onClick={() =>
                      item && updateLine(l.id, { qty: item.qty.toString() })
                    }
                    title="خرج كل الكمية المتاحة"
                    className="col-span-3 md:col-span-2 h-10 px-2 rounded-md border border-input text-xs flex items-center justify-center gap-1 hover:bg-secondary disabled:opacity-40"
                  >
                    <Download className="w-3 h-3" /> خرج الكل
                  </button>
                  <div className="col-span-1 flex justify-center">
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
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-border pt-4">
          <button
            type="submit"
            className="flex items-center gap-2 px-5 h-11 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90"
          >
            <Save className="w-4 h-4" /> حفظ الإذن
          </button>
        </div>
      </form>

      {showImport && (
        <ImportInvoiceDialog
          onClose={() => setShowImport(false)}
          onPick={importFromInvoice}
        />
      )}
    </div>
  );
}

function ImportInvoiceDialog({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (v: EntryVoucher) => void;
}) {
  const { db } = useDB();
  const entries = useMemo(
    () => db.vouchers.filter((v): v is EntryVoucher => v.type === "entry"),
    [db.vouchers],
  );
  const suppliers = useMemo(
    () => Array.from(new Set(entries.map((v) => v.supplier).filter(Boolean))),
    [entries],
  );
  const [supplier, setSupplier] = useState<string>("");
  const supplierEntries = supplier
    ? entries.filter((v) => v.supplier === supplier)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileInput className="w-5 h-5" /> استيراد فاتورة توريد
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          اختر اسم مورد ثم فاتورة لتعبئة سطور الإذن تلقائياً بكمياتها (قابلة
          للتعديل بعد ذلك).
        </p>
        <label className="block mb-3">
          <span className="text-xs mb-1 block">المورد</span>
          <SearchableSelect
            options={suppliers.map((s) => ({ value: s, label: s }))}
            value={supplier}
            onChange={setSupplier}
            placeholder="ابحث باسم المورد..."
          />
        </label>
        {supplier && (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs">
                <tr>
                  <th className="text-right p-2">التاريخ</th>
                  <th className="text-right p-2">عدد الأصناف</th>
                  <th className="text-right p-2">الإجمالي</th>
                  <th className="text-right p-2"></th>
                </tr>
              </thead>
              <tbody>
                {supplierEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-4 text-center text-muted-foreground"
                    >
                      لا توجد فواتير لهذا المورد
                    </td>
                  </tr>
                ) : (
                  supplierEntries.map((v) => {
                    const total = v.lines.reduce(
                      (s, l) => s + l.qty * (l.price || 0),
                      0,
                    );
                    return (
                      <tr key={v.id} className="border-t border-border">
                        <td className="p-2">{v.date}</td>
                        <td className="p-2">{v.lines.length}</td>
                        <td className="p-2">{fmt2(total)} ج.م</td>
                        <td className="p-2 text-end">
                          <button
                            onClick={() => onPick(v)}
                            className="px-3 h-8 rounded-md bg-primary text-primary-foreground text-xs"
                          >
                            استخدام هذه الفاتورة
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
