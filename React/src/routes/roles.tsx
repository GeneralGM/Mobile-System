/* eslint-disable prettier/prettier */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, type EmployeeRecord, type EmployeeRole } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import ActionGate from "@/components/ui/ActionGate";
import {
  Plus,
  Pencil,
  Trash2,
  Fingerprint,
  Users,
  ShieldAlert,
  Lock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/roles")({
  head: () => ({
    meta: [{ title: "إدارة الموظفين والصلاحيات - Mobile System" }],
  }),
  component: RolesPage,
});

type ActiveTab = "staff" | "management";
type EmployeeDraft = {
  name: string;
  role: EmployeeRole;
  pin?: string;
  managerId?: string | null;
};

type GateSuccess = (employee: EmployeeRecord, sessionToken: string) => void;

const ROLE_LABEL: Record<EmployeeRole, string> = {
  worker: "عامل / موظف",
  accountant: "محاسب",
  manager: "مدير",
  owner: "مالك",
  developer: "مطور",
};

const ROLE_STYLE: Record<EmployeeRole, string> = {
  worker: "bg-primary/10 text-primary",
  accountant: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
  manager:
    "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  developer:
    "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

function isEmployeeManager(
  role: EmployeeRole | undefined,
): role is "developer" | "owner" | "manager" {
  return role === "developer" || role === "owner" || role === "manager";
}

function roleName(role: EmployeeRole) {
  return ROLE_LABEL[role] ?? role;
}

function canManageTarget(operator: EmployeeRecord, target: EmployeeRecord) {
  const weight: Record<EmployeeRole, number> = {
    worker: 1,
    accountant: 2,
    manager: 3,
    owner: 4,
    developer: 5,
  };

  if (weight[operator.role] <= weight[target.role]) return false;

  if (operator.role === "developer") return true;
  if (operator.role === "owner") {
    return target.role === "worker" || target.role === "manager";
  }
  if (operator.role === "manager") {
    return target.role === "worker" && target.managerId === operator.id;
  }

  return false;
}

function RolesPage() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("staff");
  const [editing, setEditing] = useState<EmployeeRecord | "new" | null>(null);
  const [currentOperator, setCurrentOperator] = useState<EmployeeRecord | null>(
    null,
  );
  const [currentOperatorSessionToken, setCurrentOperatorSessionToken] =
    useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function refreshEmployees() {
    setIsLoading(true);
    setLoadError("");
    try {
      const list = await api.getEmployeeDirectory();
      setEmployees(Array.isArray(list) ? list : []);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر جلب الموظفين.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshEmployees();
    // Load only the read-only directory on entry; privileged actions verify PIN on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const managerNames = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((employee) => map.set(employee.id, employee.name));
    return map;
  }, [employees]);

  const displayedEmployees = useMemo(() => {
    return employees.filter((employee) => {
      if (activeTab === "staff") return employee.role === "worker";
      return ["accountant", "manager", "owner", "developer"].includes(
        employee.role,
      );
    });
  }, [employees, activeTab]);

  function closeDialog() {
    setEditing(null);
    setCurrentOperator(null);
    setCurrentOperatorSessionToken(null);
  }

  async function handleSaveEmployee(data: EmployeeDraft) {
    if (!editing || !currentOperator || !currentOperatorSessionToken) {
      toast.error(
        "انتهت صلاحية التحقق. افتح الإجراء مرة أخرى وأدخل الرقم السري.",
      );
      closeDialog();
      return;
    }
    if (!isEmployeeManager(currentOperator.role)) {
      toast.error("إدارة الموظفين متاحة للمالك والمدير فقط.");
      closeDialog();
      return;
    }
    setIsSaving(true);
    try {
      if (editing === "new") {
        await api.createEmployee(data, currentOperatorSessionToken);
        toast.success("تم إنشاء الموظف بنجاح.");
      } else {
        if (!canManageTarget(currentOperator, editing)) {
          toast.error("لا تسمح رتبتك بتعديل هذا الموظف.");
          return;
        }
        await api.updateEmployee(editing.id, data, currentOperatorSessionToken);
        toast.success("تم تحديث بيانات الموظف بنجاح.");
      }
      closeDialog();
      await refreshEmployees();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر حفظ بيانات الموظف.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteEmployee(
    employee: EmployeeRecord,
    operator: EmployeeRecord,
    sessionToken: string,
  ) {
    if (!canManageTarget(operator, employee)) {
      toast.error("لا تسمح رتبتك بحذف هذا الموظف.");
      return;
    }

    try {
      await api.deleteEmployee(employee.id, sessionToken);
      toast.success("تم حذف الموظف.");
      await refreshEmployees();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حذف الموظف.");
    }
  }

  const onAddSuccess: GateSuccess = (operator, sessionToken) => {
    if (!isEmployeeManager(operator.role)) {
      toast.error("إضافة الموظفين متاحة للمالك والمدير والمطوّر.");
      return;
    }

    if (
      activeTab === "management" &&
      operator.role !== "owner" &&
      operator.role !== "developer"
    ) {
      toast.error("الإدارة العليا متاحة للمالك والمطوّر فقط.");
      return;
    }

    setCurrentOperator(operator);
    setCurrentOperatorSessionToken(sessionToken);
    setEditing("new");
  };

  const onEditSuccess =
    (target: EmployeeRecord): GateSuccess =>
    (operator, sessionToken) => {
      if (!canManageTarget(operator, target)) {
        toast.error(
          operator.role === "manager"
            ? "المدير يستطيع تعديل الموظفين التابعين له فقط."
            : "لا يمكن تعديل حساب المالك أو المطور من هذه الصفحة.",
        );
        return;
      }
      setCurrentOperator(operator);
      setCurrentOperatorSessionToken(sessionToken);
      setEditing(target);
    };

  const onDeleteSuccess =
    (target: EmployeeRecord): GateSuccess =>
    (operator, sessionToken) => {
      void handleDeleteEmployee(target, operator, sessionToken);
    };

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Fingerprint className="h-6 w-6" /> إدارة الموظفين والصلاحيات
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            عرض الموظفين بدون تسجيل دخول عند فتح الصفحة. يتم طلب الرقم السري فقط
            عند تنفيذ إجراء إداري.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ActionGate
            requiredRole="accountant"
            actionName="إضافة موظف جديد"
            onSuccess={onAddSuccess}
          >
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> إضافة موظف
            </Button>
          </ActionGate>
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="تحديث القائمة"
            disabled={isLoading}
            onClick={() => void refreshEmployees()}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg bg-secondary/30 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("staff")}
          className={`flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-all ${activeTab === "staff" ? "bg-primary text-primary-foreground shadow" : "hover:bg-secondary"}`}
        >
          <Users className="h-4 w-4" /> التشغيل (العاملون)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("management")}
          className={`flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-all ${activeTab === "management" ? "bg-primary text-primary-foreground shadow" : "hover:bg-secondary"}`}
        >
          <ShieldAlert className="h-4 w-4" /> الإدارة (المالك والمدير والمطور)
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs">
              <tr>
                <th className="p-3 text-right">اسم الموظف</th>
                <th className="p-3 text-right">الدور</th>
                <th className="p-3 text-right">المدير المباشر</th>
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="p-8 text-center text-muted-foreground"
                  >
                    جارٍ تحميل الموظفين...
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-destructive">
                    {loadError}
                  </td>
                </tr>
              ) : displayedEmployees.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="p-8 text-center text-muted-foreground"
                  >
                    لا يوجد موظفون في هذا القسم.
                  </td>
                </tr>
              ) : (
                displayedEmployees.map((employee) => {
                  const protectedAccount =
                    employee.role === "owner" || employee.role === "developer";
                  const targetCanBeManaged =
                    employee.role === "worker" || employee.role === "manager";
                  return (
                    <tr key={employee.id} className="border-t border-border">
                      <td className="p-3 font-semibold">{employee.name}</td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-1 text-xs font-semibold ${ROLE_STYLE[employee.role]}`}
                        >
                          {roleName(employee.role)}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {employee.managerId
                          ? managerNames.get(employee.managerId) || "مدير مسجل"
                          : "—"}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${employee.isActive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-muted text-muted-foreground"}`}
                        >
                          {employee.isActive ? "نشط" : "موقوف"}
                        </span>
                      </td>
                      <td className="p-3">
                        {protectedAccount ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                            <Lock className="h-3.5 w-3.5" /> حساب محمي
                          </span>
                        ) : targetCanBeManaged ? (
                          <div className="flex gap-1">
                            <ActionGate
                              requiredRole="accountant"
                              actionName={`تعديل بيانات الموظف: ${employee.name}`}
                              onSuccess={onEditSuccess(employee)}
                            >
                              <button
                                type="button"
                                className="rounded p-1.5 text-blue-600 hover:bg-secondary"
                                aria-label={`تعديل ${employee.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </ActionGate>
                            <ActionGate
                              requiredRole="accountant"
                              actionName={`حذف الموظف: ${employee.name}`}
                              onSuccess={onDeleteSuccess(employee)}
                            >
                              <button
                                type="button"
                                className="rounded p-1.5 text-destructive hover:bg-secondary"
                                aria-label={`حذف ${employee.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </ActionGate>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            لا توجد إجراءات متاحة
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && currentOperator && (
        <EmployeeDialog
          employee={editing === "new" ? null : editing}
          activeTab={activeTab}
          operator={currentOperator}
          employees={employees}
          isSaving={isSaving}
          onClose={closeDialog}
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
  employees,
  isSaving,
  onClose,
  onSave,
}: {
  employee: EmployeeRecord | null;
  activeTab: ActiveTab;
  operator: EmployeeRecord;
  employees: EmployeeRecord[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: EmployeeDraft) => void | Promise<void>;
}) {
  const isOwner = operator.role === "owner";
  const isDeveloper = operator.role === "developer";
  const canManageEmployees = isOwner || isDeveloper;

  const availableRoles: EmployeeRole[] = employee
    ? canManageEmployees
      ? employee.role === "worker" || employee.role === "manager"
        ? (["worker", "manager"].filter(
            (role) =>
              role === "worker" || (canManageEmployees && role === "manager"),
          ) as EmployeeRole[])
        : []
      : operator.role === "manager" && employee.role === "worker"
        ? ["worker"]
        : []
    : canManageEmployees
      ? activeTab === "management"
        ? ["accountant", "manager"]
        : ["worker"]
      : activeTab === "staff"
        ? ["worker"]
        : [];

  const [name, setName] = useState(employee?.name ?? "");
  const [role, setRole] = useState<EmployeeRole>(
    employee?.role && availableRoles.includes(employee.role)
      ? employee.role
      : (availableRoles[0] ?? "worker"),
  );
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [managerId, setManagerId] = useState(employee?.managerId ?? "");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (name.trim().length < 2)
      return setError("اسم الموظف يجب أن يكون حرفين على الأقل.");
    if (!employee && !/^\d{4,12}$/.test(pin))
      return setError("الرقم السري يجب أن يكون من 4 إلى 12 رقمًا.");
    if (pin && !/^\d{4,12}$/.test(pin))
      return setError("الرقم السري الجديد يجب أن يكون من 4 إلى 12 رقمًا.");
    if (pin !== pin2) return setError("الرقم السري وتأكيده غير متطابقين.");
    if (!availableRoles.includes(role))
      return setError("الدور المحدد غير متاح لحسابك.");

    void onSave({
      name: name.trim(),
      role,
      pin: pin || undefined,
      managerId:
        canManageEmployees && role === "worker" ? managerId || null : undefined,
    });
  }

  const managerOptions = employees.filter(
    (item) =>
      item.role === "manager" && item.isActive && item.id !== employee?.id,
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-w-md overflow-hidden rounded-2xl p-0"
      >
        <DialogHeader className="border-b bg-secondary/40 p-4">
          <DialogTitle className="text-lg font-black">
            {employee ? "تعديل بيانات موظف" : "إضافة موظف جديد"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 p-5" autoComplete="off">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold">اسم الموظف</label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder="أدخل اسم الموظف"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold">
              الرتب المتاحة لحسابك
            </label>
            <div className="flex flex-wrap gap-2">
              {availableRoles.map((availableRole) => (
                <button
                  type="button"
                  key={availableRole}
                  onClick={() => setRole(availableRole)}
                  className={`min-w-24 flex-1 rounded-xl border-2 px-3 py-2 text-sm font-bold transition ${role === availableRole ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary/40 hover:bg-secondary"}`}
                >
                  {roleName(availableRole)}
                </button>
              ))}
              {availableRoles.length === 0 && (
                <p className="w-full rounded-lg border border-destructive/30 p-3 text-center text-sm text-destructive">
                  لا توجد رتب متاحة لهذا الإجراء حسب صلاحيات حسابك.
                </p>
              )}
            </div>
          </div>
          {canManageEmployees &&
            role === "worker" &&
            managerOptions.length > 0 && (
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold">
                  المدير المباشر (اختياري)
                </label>
                <select
                  value={managerId}
                  onChange={(event) => setManagerId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">بدون مدير مباشر</option>
                  {managerOptions.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold">
              {employee ? "رقم سري جديد (اختياري)" : "الرقم السري للموظف"}
            </label>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, 12))
              }
              required={!employee}
              placeholder="4 إلى 12 رقمًا"
            />
          </div>
          {(!employee || pin) && (
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">
                تأكيد الرقم السري
              </label>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={pin2}
                onChange={(event) =>
                  setPin2(event.target.value.replace(/\D/g, "").slice(0, 12))
                }
                required={!employee || Boolean(pin)}
                placeholder="أعد كتابة الرقم السري"
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            لا يتم عرض الرقم السري الحالي أو قيمة الـ hash؛ الخادم يخزّن الرقم
            السري بصورة مشفّرة باستخدام scrypt.
          </p>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-center text-sm font-semibold text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={isSaving || availableRoles.length === 0}
              className="gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              {isSaving ? "جارٍ الحفظ..." : "حفظ الموظف"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
