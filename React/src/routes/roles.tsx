/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { usePosDB, type Employee } from "@/lib/pos-store.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PinPrompt } from "@/components/PinPrompt";
import {
  Plus,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Fingerprint,
  Users,
  ShieldAlert,
  Lock,
} from "lucide-react";
import { getApiUrl } from "@/api";
const API_URL = getApiUrl();

// 🌟 استدعاء مكون الحماية
import ActionGate from "@/components/ui/ActionGate";

export const Route = createFileRoute("/roles")({
  head: () => ({ meta: [{ title: "بصمات الموظفين - الصلاحيات" }] }),
  component: RolesPage,
});
const API_BASE_URL = `http://${API_URL}:5000`;

// 🌟 جدول أوزان الصلاحيات للمقارنة الذكية
const ROLE_WEIGHTS: Record<string, number> = {
  مالك: 5,
  owner: 5,
  مبرمج: 4,
  developer: 4,
  مدير: 3,
  manager: 3,
  محاسب: 2,
  accountant: 2,
  كاشير: 1,
  cashier: 1,
  "كابتن صالة": 1,
  waiter: 1,
};

function RolesPage() {
  const { db, addEmployee, updateEmployee, deleteEmployee } = usePosDB();
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);

  // 🌟 تعديل الـ Type لـ any لمنع التضارب مع الـ ActionGate
  const [currentOperator, setCurrentOperator] = useState<any | null>(null);

  const [activeTab, setActiveTab] = useState<"staff" | "management">("staff");
  const [serverEmployees, setServerEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchEmployeesFromPostgres() {
      try {
        setIsLoading(true);
        const response = await fetch(`http://${API_URL}:5000/api/employees`);
        if (response.ok) {
          const data = await response.json();
          setServerEmployees(data);
        }
      } catch (error) {
        console.error("❌ خطأ أثناء جلب الموظفين من pgAdmin:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchEmployeesFromPostgres();
  }, []);

  const employeesList = useMemo(() => {
    const map = new Map();
    // 1. نحط بيانات الكاش المحلي الأول
    db.employees.forEach((e) => map.set(e.name, e));
    // 2. نحط بيانات السيرفر بعدها عشان الـ ID الحقيقي والـ PIN الصافي هما اللي يكسبوا ويظهروا في الشاشة!
    serverEmployees.forEach((e) => map.set(e.name, e));
    return Array.from(map.values());
  }, [serverEmployees, db.employees]);

  const displayedEmployees = employeesList.filter((e) => {
    if (activeTab === "staff") {
      return (
        e.role === "كاشير" || e.role === "كابتن صالة" || e.role === "cashier"
      );
    } else {
      return (
        e.role === "محاسب" ||
        e.role === "مدير" ||
        e.role === "مبرمج" ||
        e.role === "مالك" ||
        e.role === "accountant" ||
        e.role === "manager" ||
        e.role === "developer" ||
        e.role === "owner"
      );
    }
  });

  function hidePassword(id: string) {
    const c = { ...revealed };
    delete c[id];
    setRevealed(c);
  }

  // دالة إظهار الباسوورد (هتشتغل جوه الـ ActionGate بعد الباسوورد ما يطلع صح)
  function showPassword(id: string) {
    setRevealed({ ...revealed, [id]: true });
  }
  // 🌟 دالة منفصلة ومنظمة لإضافة وتعديل الموظفين
  const handleSaveEmployee = async (data: {
    name: string;
    role: any;
    pin?: string;
  }) => {
    try {
      // ==========================================
      // 1. حالة إضافة موظف جديد (تم تأمينها ومنع التكرار)
      // ==========================================
      if (editing === "new") {
        const response = await fetch(`${API_BASE_URL}/api/employees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            role: data.role,
            pin: data.pin, // 🌟 بعتنا الحقل باسم pin عشان السيرفر يفهمه صح كباسوورد صافي
          }),
        });

        if (response.ok) {
          const savedEmp = await response.json();
          // savedEmp الحين يحتوي على: { id, name, role, pin, pinHash }

          // 1. إضافة للمستودع المحلي بالـ pin الصافي (عشان اللوكال ستوريدج يعمل الهاش بتاعه براحته)
          await addEmployee(savedEmp.name, savedEmp.role, savedEmp.pin);

          // 2. تحديث قائمة السيرفر بالـ savedEmp الحقيقي اللي راجع من قاعدة البيانات
          setServerEmployees((prev) => {
            // زيادة أمان: نمنع التكرار بالاسم تماماً جوه الـ State
            const exists = prev.some((emp) => emp.name === savedEmp.name);
            if (exists) {
              return prev.map((emp) =>
                emp.name === savedEmp.name ? savedEmp : emp,
              );
            }
            return [...prev, savedEmp];
          });

          toast.success("تم إضافة الموظف الجديد في السيرفر والكاش بنجاح");
        } else {
          const errorData = await response.json().catch(() => ({}));
          toast.error(errorData.message || "فشل إضافة الموظف في السيرفر");
        }
      }

      // ==========================================
      // 2. حالة تعديل موظف حالي (تمت إضافة الـ fetch وتحديث الـ state لايف)
      // ==========================================
      else {
        const empId = (editing as Employee).id;

        // أرسل التحديث للباك إند أولاً ليحفظ في الـ PostgreSQL
        const response = await fetch(`${API_BASE_URL}/api/employees/${empId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            role: data.role,
            pinHash: data.pin || undefined, // يرسل البين الجديد لو الموظف كتب باسوورد جديد
          }),
        });

        if (response.ok) {
          const updatedEmpFromServer = await response.json();

          // أ) تحديث الكاش المحلي (لوكال ستوريدج)
          await updateEmployee(empId, {
            name: data.name,
            role: data.role,
            newPin: data.pin || undefined,
          });

          // ب) تحديث الـ State الخاص بالسيرفر في الفرونت إند لتحديث الشاشة فوراً
          setServerEmployees((prev) =>
            prev.map((emp) => (emp.id === empId ? updatedEmpFromServer : emp)),
          );

          toast.success("تم تحديث بيانات الموظف في قاعدة البيانات");
        } else {
          const errorData = await response.json().catch(() => ({}));
          toast.error(errorData.message || "فشل تحديث الموظف في السيرفر");
        }
      }
    } catch (err) {
      console.error("Error saving employee:", err);
      toast.error("خطأ في الاتصال بالسيرفر الرئيسي");
    } finally {
      // قفل المودال وتصفير بيانات المشغل الحالي
      setEditing(null);
      setCurrentOperator(null);
    }
  };
  const handleDeleteEmployee = async (empId: string) => {
    try {
      // 🌟 أولاً: نجيب اسم الموظف قبل ما نحذفه عشان نضمن مسحه بالاسم لو الـ ID علق
      const targetEmp = employeesList.find((e) => e.id === empId);

      // 1. أرسل طلب الحذف للسيرفر
      const response = await fetch(`${API_BASE_URL}/api/employees/${empId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // 2. احذفه من الكاش المحلي (لوكال ستوريدج) - مهم جداً!
        await deleteEmployee(empId);

        // 3. حدّث الـ State في الشاشة بفلترة صارمة (بالـ ID وبالاسم كزيادة أمان)
        setServerEmployees((prev) =>
          prev.filter(
            (emp) =>
              emp.id !== empId &&
              (targetEmp ? emp.name !== targetEmp.name : true),
          ),
        );

        toast.success("تم حذف الموظف نهائياً واختفائه من الشاشة");
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.message || "فشل حذف الموظف من السيرفر");
      }
    } catch (err) {
      console.error("Error deleting employee:", err);
      toast.error("خطأ في الاتصال بالسيرفر");
    }
  };

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Fingerprint className="w-6 h-6" /> إدارة الصلاحيات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة صلاحيات التشغيل والإدارة والأكواد السرية.
          </p>
        </div>

        <ActionGate
          requiredRole="محاسب"
          actionName="إضافة موظف جديد"
          onSuccess={(operator: any) => {
            setCurrentOperator(operator);
            setEditing("new");
          }}
        >
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> إضافة موظف
          </Button>
        </ActionGate>
      </div>

      <div className="flex gap-2 p-1 bg-secondary/30 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("staff")}
          className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "staff"
              ? "bg-primary text-primary-foreground shadow"
              : "hover:bg-secondary"
          }`}
        >
          <Users className="w-4 h-4" />
          التشغيل (كاشير و كابتن)
        </button>

        <ActionGate
          requiredRole="محاسب"
          actionName="فتح بيانات الإدارة"
          onSuccess={() => setActiveTab("management")}
        >
          <button
            className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "management"
                ? "bg-primary text-primary-foreground shadow"
                : "hover:bg-secondary"
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            الإدارة العليا (محاسب ومدير)
          </button>
        </ActionGate>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs">
            <tr>
              <th className="text-right p-3">اسم الموظف</th>
              <th className="text-right p-3">الوظيفة</th>
              <th className="text-right p-3">كلمة السر</th>
              <th className="text-right p-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={4}
                  className="p-8 text-center text-amber-600 font-medium animate-pulse"
                >
                  جاري جلب الموظفين من قاعدة البيانات (pgAdmin)...
                </td>
              </tr>
            ) : displayedEmployees.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="p-8 text-center text-muted-foreground"
                >
                  لا يوجد موظفون في هذا القسم.
                </td>
              </tr>
            ) : (
              displayedEmployees.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="p-3 font-medium">{e.name}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        e.role === "كاشير" || e.role === "كابتن صالة"
                          ? "bg-primary/10 text-primary"
                          : "bg-red-100 text-red-700 font-bold"
                      }`}
                    >
                      {e.role}
                    </span>
                  </td>
                  <td className="p-3 font-mono">
                    <div className="flex items-center gap-2">
                      {/* لو الحساب مبرمج أو مالك هيعرض علامات حجب ومش هيظهر زرار العين نهائياً */}
                      {e.role === "مبرمج" ||
                      e.role === "developer" ||
                      e.role === "مالك" ||
                      e.role === "owner" ? (
                        <span className="tracking-widest text-muted-foreground/60 selection:bg-transparent">
                          ••••
                        </span>
                      ) : (
                        <>
                          <span className="tracking-widest">
                            {revealed[e.id]
                              ? e.pin || e.pin_hash || "####"
                              : "####"}
                          </span>
                          {revealed[e.id] ? (
                            // 1. لو الباسوورد ظاهر أصلاً -> زرار عادي للإخفاء بدون طلب باسوورد
                            <button
                              onClick={() => hidePassword(e.id)}
                              className="text-muted-foreground hover:text-foreground"
                              title="إخفاء الرقم السري"
                            >
                              <EyeOff className="w-4 h-4" />
                            </button>
                          ) : (
                            // 2. لو الباسوورد مخفي -> زرار محمي بـ ActionGate للإظهار
                            <ActionGate
                              requiredRole="مالك"
                              actionName="إظهار الرقم السري للموظف"
                              onSuccess={() => showPassword(e.id)}
                            >
                              {/* الزرار جوه ActionGate مبيكونش عليه onClick لأنه بيتولى المهمة */}
                              <button
                                className="text-muted-foreground hover:text-foreground"
                                title="إظهار الرقم السري"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </ActionGate>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {e.role === "مبرمج" ||
                    e.role === "developer" ||
                    e.role === "مالك" ||
                    e.role === "owner" ? (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium text-amber-600 selection:bg-transparent">
                        <Lock className="w-3 h-3" /> نظام محمي
                      </span>
                    ) : (
                      <div className="flex gap-1">
                        <ActionGate
                          requiredRole="محاسب"
                          actionName={`تعديل بيانات الموظف: ${e.name}`}
                          onSuccess={(operator: any) => {
                            setCurrentOperator(operator);
                            // 🌟 التأخير السحري هنا كمان لمنع التداخل
                            setTimeout(() => {
                              setEditing(e);
                            }, 150);
                          }}
                        >
                          <button className="p-1.5 rounded hover:bg-secondary text-blue-600">
                            <Pencil className="w-4 h-4" />
                          </button>
                        </ActionGate>

                        <ActionGate
                          requiredRole="محاسب"
                          actionName={`حذف الموظف: ${e.name} نهائياً`}
                          onSuccess={() => {
                            // نداء دالة الحذف اللي بتكلم السيرفر
                            handleDeleteEmployee(e.id);
                          }}
                        >
                          <button className="p-1.5 rounded hover:bg-secondary text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </ActionGate>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PinPrompt
        open={pinFor !== null}
        title="عرض كلمة السر"
        description="أدخل كلمة مرور المسؤول لعرض الكود السري للموظف."
        onClose={() => setPinFor(null)}
        onSuccess={() => {
          if (pinFor) setRevealed((r) => ({ ...r, [pinFor]: true }));
          setPinFor(null);
        }}
        onCancel={() => setPinFor(null)}
      />

      {editing && (
        <EmployeeDialog
          employee={editing === "new" ? null : editing}
          activeTab={activeTab}
          operator={currentOperator}
          onClose={() => {
            setEditing(null);
            setCurrentOperator(null);
          }}
          // 🌟 سطر واحد نضيف ومقروء وباصينا فيه الدالة اللي فوق
          onSave={handleSaveEmployee}
        />
      )}
    </div>
  );
}

function EmployeeDialog({
  employee,
  activeTab,
  operator,
  onClose,
  onSave,
}: {
  employee: any;
  activeTab: "staff" | "management";
  operator: any;
  onClose: () => void;
  onSave: (d: { name: string; role: any; pin?: string }) => void;
}) {
  const [name, setName] = useState(employee?.name || "");

  const operatorWeight = ROLE_WEIGHTS[operator?.role || "مبرمج"] || 4;

  const baseRoles =
    activeTab === "staff" ? ["كاشير", "كابتن صالة"] : ["محاسب", "مدير"];

  const availableRoles = baseRoles.filter(
    (r) => (ROLE_WEIGHTS[r] || 0) <= operatorWeight,
  );

  const [role, setRole] = useState<any>(employee?.role || availableRoles[0]);

  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [err, setErr] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!employee && (!pin || pin.length < 4))
      return setErr("كلمة السر يجب أن تكون 4 خانات على الأقل");
    if (pin && pin !== pin2) return setErr("كلمة السر غير متطابقة");

    if ((ROLE_WEIGHTS[role] || 0) > operatorWeight) {
      return setErr("خطأ أمني: لا يمكنك تعيين رتبة أعلى من صلاحياتك الحالية!");
    }

    onSave({ name, role, pin: pin || undefined });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-w-md border-2 border-slate-300 dark:border-slate-700 shadow-2xl rounded-2xl p-0 overflow-hidden bg-white dark:bg-slate-900"
      >
        {/* هيدر النافذة */}
        <DialogHeader className="p-4 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <DialogTitle className="font-black text-lg text-slate-900 dark:text-white">
            {employee ? "✏️ تعديل بيانات موظف" : "👤 إضافة موظف جديد"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="p-5 space-y-4" autoComplete="off">
          {/* اسم الموظف */}
          <div className="space-y-1.5">
            <label className="text-sm font-black text-slate-800 dark:text-slate-200 block">
              اسم الموظف <span className="text-red-600">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="أدخل اسم الموظف..."
            />
          </div>

          {/* اختيار الوظيفة */}
          <div className="space-y-1.5">
            <label className="text-sm font-black text-slate-800 dark:text-slate-200 block">
              الوظيفة المتاحة برتبتك
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              {availableRoles.length === 0 ? (
                <div className="w-full p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs font-black text-red-600 dark:text-red-400 text-center">
                  ⚠️ ليس لديك صلاحية لإضافة موظفين في هذا القسم.
                </div>
              ) : (
                availableRoles.map((r) => {
                  const selected = role === r;
                  return (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setRole(r)}
                      className={`flex-1 min-w-[90px] h-10 rounded-xl text-sm font-black transition-all border-2 active:scale-95 ${
                        selected
                          ? "bg-slate-900 text-white border-emerald-500 shadow-md ring-2 ring-emerald-500/20"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* كلمة السر */}
          <div className="space-y-1.5">
            <label className="text-sm font-black text-slate-800 dark:text-slate-200 block">
              {employee ? "كلمة سر جديدة (اختياري)" : "كلمة السر"}
            </label>
            <Input
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/^-+/, ""))}
            />
          </div>

          {/* تأكيد كلمة السر */}
          <div className="space-y-1.5">
            <label className="text-sm font-black text-slate-800 dark:text-slate-200 block">
              تأكيد كلمة السر
            </label>
            <Input
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/^-+/, ""))}
            />
          </div>

          {/* رسالة الخطأ */}
          {err && (
            <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs font-black text-red-600 dark:text-red-400 text-center">
              {err}
            </div>
          )}

          {/* أزرار الإجراءات */}
          <DialogFooter className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-700">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-11 px-5 rounded-xl border-2 border-slate-300 font-black text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-95"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={availableRoles.length === 0}
              className="h-11 px-6 rounded-xl bg-slate-900 hover:bg-emerald-600 text-white font-black border-2 border-slate-900 hover:border-emerald-600 shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              💾 حفظ الموظف
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
