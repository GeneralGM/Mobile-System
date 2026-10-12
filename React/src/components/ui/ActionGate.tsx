/* eslint-disable prettier/prettier */
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getApiUrl } from "@/api";

// 🌟 السحر هنا: استخدمنا الدالة بدل اللينك الثابت
const API_URL = getApiUrl();

// 🌟 الحل: تم إضافة "مالك" هنا في الأنواع المسموحة
export type EmployeeRole =
  | "مالك"
  | "مبرمج"
  | "مدير"
  | "محاسب"
  | "كاشير"
  | "كابتن صالة";

interface Employee {
  id: string;
  name: string;
  role: EmployeeRole;
  pinHash: string;
  pin?: string;
}

interface ActionGateProps {
  children: React.ReactNode;
  requiredRole?: EmployeeRole;
  actionName?: string;
  onSuccess: (employee: Employee) => void;
}

const ROLE_WEIGHTS: Record<EmployeeRole, number> = {
  مالك: 5,
  مبرمج: 4,
  مدير: 3,
  محاسب: 2,
  كاشير: 1,
  "كابتن صالة": 1,
};

export default function ActionGate({
  children,
  requiredRole = "محاسب",
  actionName = "هذا الإجراء",
  onSuccess,
}: ActionGateProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    if (isOpen && employees.length === 0) {
      fetch(`http://${API_URL}:5000/api/employees`)
        .then((res) => res.json())
        .then((data: Employee[]) => setEmployees(data))
        .catch((err) => console.error("Error fetching employees:", err));
    }
  }, [isOpen, employees.length]);

  const handleVerify = () => {
    setError("");

    // 🌟 التعديل هنا: بنقارن الـ pin المدخل بالـ pin الصافي اللي جاي من السيرفر، أو الـ pinHash كزيادة أمان
    const employee = employees.find(
      (emp) => emp.pin === pin || emp.pinHash === pin,
    );

    if (!employee) {
      setError("الرقم السري غير صحيح!");
      return;
    }

    const requiredWeight = ROLE_WEIGHTS[requiredRole] || 1;
    const employeeWeight = ROLE_WEIGHTS[employee.role] || 0;

    if (employeeWeight >= requiredWeight) {
      setIsOpen(false);
      setPin("");
      onSuccess(employee);
    } else {
      setError(`صلاحياتك لا تسمح بإجراء هذه العملية. مطلوب: ${requiredRole}`);
    }
  };

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className="inline-block cursor-pointer"
      >
        {children}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>صلاحية مطلوبة</DialogTitle>
            <DialogDescription>
              لإتمام ({actionName})، يرجى إدخال الرقم السري لموظف بصلاحية{" "}
              {requiredRole} أو أعلى.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="أدخل الـ PIN هنا..."
              className="w-full border rounded p-2 text-center text-xl tracking-widest bg-background text-foreground"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleVerify();
              }}
            />
            {error && (
              <p className="text-destructive text-sm mt-2 text-center font-medium">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="bg-secondary text-foreground p-2 rounded px-4 w-full sm:w-auto"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleVerify}
              className="bg-primary text-primary-foreground p-2 rounded px-4 w-full sm:w-auto mt-2 sm:mt-0"
            >
              تأكيد
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
