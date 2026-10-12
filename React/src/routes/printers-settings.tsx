/* eslint-disable prettier/prettier */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2, Shield, Network } from "lucide-react";
import { getApiUrl } from "@/api";
const API_URL = getApiUrl();

// 🌟 السطر السحري اللي بيعرف الـ Router إن دي صفحة وليها مسار
export const Route = createFileRoute("/printers-settings")({
  component: PrintersSettingsTab,
});

interface PrinterConfig {
  id: string;
  name: string;
  ip: string;
  port: string;
  targetDept: "مطبخ" | "بار" | "شيشة" | "كاشير فرعي";
}

export function PrintersSettingsTab() {
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);

  // 1. تحميل الإعدادات من الـ localStorage فوراً لسرعة العرض، ثم جلب أحدث داتا من السيرفر
  useEffect(() => {
    const saved = localStorage.getItem("pos_dynamic_printers");
    if (saved) {
      setPrinters(JSON.parse(saved));
    } else {
      // طابعات افتراضية أولية للمحاكي والتست لو مفيش أي بيانات
      const defaultPrinters: PrinterConfig[] = [
        {
          id: "1",
          name: "طابعة المطبخ الرئيسي",
          ip: "127.0.0.1",
          port: "9100",
          targetDept: "مطبخ",
        },
        {
          id: "2",
          name: "طابعة البار والمشروبات",
          ip: "127.0.0.1",
          port: "9101",
          targetDept: "بار",
        },
        {
          id: "3",
          name: "طابعة الشيشة الخارجية",
          ip: "127.0.0.1",
          port: "9102",
          targetDept: "شيشة",
        },
      ];
      setPrinters(defaultPrinters);
      localStorage.setItem(
        "pos_dynamic_printers",
        JSON.stringify(defaultPrinters),
      );
    }

    // جلب أحدث نسخة من الداتابيز في الخلفية لضمان التطابق
    fetch(`http://${API_URL}:5000/api/printers`)
      .then((res) => (res.ok ? res.json() : null))
      .then((dbData) => {
        if (dbData && Array.isArray(dbData)) {
          setPrinters(dbData);
          localStorage.setItem("pos_dynamic_printers", JSON.stringify(dbData));
        }
      })
      .catch(() => console.log(" يعمل أوفلاين بالاعتماد على الكاش المحلي"));
  }, []);

  // 2. حفظ الإعدادات في قاعدة البيانات أولاً ثم في الـ LocalStorage
  const handleSaveAll = async () => {
    try {
      toast.loading("جاري حفظ إعدادات الطابعات في السيرفر...", {
        id: "save-printers",
      });

      // إرسال المصفوفة للباك إند
      const response = await fetch(`http://${API_URL}:5000/api/printers/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(printers),
      });

      if (response.ok) {
        // تحديث الـ LocalStorage فوراً بعد نجاح السيرفر
        localStorage.setItem("pos_dynamic_printers", JSON.stringify(printers));
        toast.success(
          "✅ تم حفظ إعدادات الطابعات بنجاح في قاعدة البيانات والذاكرة المحلية!",
          { id: "save-printers" },
        );
      } else {
        throw new Error("السيرفر رفض حفظ البيانات");
      }
    } catch (error) {
      console.error("❌ فشل الحفظ في السيرفر:", error);
      // حماية العمل الأوفلاين: حتى لو السيرفر واقع، بنحفظ في الـ LocalStorage عشان الشغل ما يقفش!
      localStorage.setItem("pos_dynamic_printers", JSON.stringify(printers));
      toast.warning(
        "⚠️ تعذر الاتصال بالسيرفر! تم حفظ الإعدادات محلياً في الـ LocalStorage فقط.",
        { id: "save-printers" },
      );
    }
  };
  const addPrinter = () => {
    const newP: PrinterConfig = {
      id: Date.now().toString(),
      name: "طابعة جديدة",
      ip: "192.168.1.100",
      port: "9100",
      targetDept: "مطبخ",
    };
    setPrinters([...printers, newP]);
  };

  const updatePrinter = (
    id: string,
    field: keyof PrinterConfig,
    val: string,
  ) => {
    setPrinters((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: val } : p)),
    );
  };

  const removePrinter = (id: string) => {
    setPrinters((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 pb-20 mt-10">
      {/* الهيدر */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-5 rounded-2xl border shadow-sm">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" />
            إدارة طابعات الأقسام (IP Printers)
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            قم بتوجيه كل قسم (مطبخ، بار، شيشة) إلى طابعة الشبكة الخاصة به
          </p>
        </div>
        <Button onClick={addPrinter} className="gap-2 shrink-0 rounded-xl">
          <Plus className="h-4 w-4" />
          إضافة طابعة جديدة
        </Button>
      </div>

      {printers.length === 0 ? (
        <div className="text-center p-12 bg-card border rounded-2xl border-dashed">
          <Network className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-bold">لا توجد طابعات مضافة</h3>
          <p className="text-sm text-muted-foreground">
            اضغط على "إضافة طابعة جديدة" للبدء في توجيه طلبات الأقسام.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {printers.map((printer) => (
            <div
              key={printer.id}
              className="bg-card border rounded-2xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-start md:items-center hover:border-primary/30 transition-colors shadow-sm"
            >
              {/* اسم الطابعة */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">
                  اسم الطابعة (للتوضيح)
                </label>
                <Input
                  value={printer.name}
                  onChange={(e) =>
                    updatePrinter(printer.id, "name", e.target.value)
                  }
                  className="font-bold border-muted-foreground/20 h-10 rounded-xl"
                  placeholder="مثال: طابعة المطبخ الساخن..."
                />
              </div>

              {/* IP الطابعة */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">
                  رقم الـ IP (الشبكة)
                </label>
                <Input
                  dir="ltr"
                  value={printer.ip}
                  onChange={(e) =>
                    updatePrinter(printer.id, "ip", e.target.value)
                  }
                  className="font-mono text-center border-muted-foreground/20 h-10 rounded-xl"
                  placeholder="192.168.1.100"
                />
              </div>

              {/* Port الطابعة */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">
                  البورت (Port)
                </label>
                <Input
                  dir="ltr"
                  value={printer.port}
                  onChange={(e) =>
                    updatePrinter(printer.id, "port", e.target.value)
                  }
                  className="font-mono text-center border-muted-foreground/20 h-10 rounded-xl"
                  placeholder="9100"
                />
              </div>

              {/* القسم المستهدف */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">
                  تستقبل طلبات قسم
                </label>
                <select
                  value={printer.targetDept}
                  onChange={(e) =>
                    updatePrinter(printer.id, "targetDept", e.target.value)
                  }
                  className="w-full h-10 px-3 rounded-xl border border-muted-foreground/20 bg-background text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="مطبخ">🍽️ قسم المطبخ (أكل)</option>
                  <option value="بار">🍹 قسم البار (مشروبات)</option>
                  <option value="شيشة">💨 قسم الشيشة والمعسل</option>
                </select>
              </div>

              {/* زر الحذف السريع للسجل */}
              <div className="md:col-span-1 pt-4 md:pt-0 flex justify-end md:justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removePrinter(printer.id)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9 rounded-xl"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/10 p-3 rounded-xl">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Shield className="h-3.5 w-3.5 text-yellow-600" />
          ملاحظة: تأكد من تثبيت الـ IP من إعدادات الراوتر لكل طابعة (Static IP)
          لضمان استقرار الاتصال دوماً.
        </span>
        <Button
          onClick={handleSaveAll}
          className="w-full sm:w-auto h-11 px-8 rounded-xl font-bold shadow-md hover:shadow-lg transition-all"
        >
          حفظ إعدادات الطابعات
        </Button>
      </div>
    </div>
  );
}