/* eslint-disable prettier/prettier */
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, type EmployeeRecord, type EmployeeRole } from "@/lib/api-client";
import { ShieldCheck } from "lucide-react";

type ActionGateProps = {
  children: React.ReactNode;
  requiredRole?: EmployeeRole;
  actionName?: string;
  onSuccess: (employee: EmployeeRecord, sessionToken: string) => void;
};

const ROLE_WEIGHT: Record<EmployeeRole, number> = {
  worker: 1,
  accountant: 2,
  manager: 3,
  owner: 4,
  developer: 5,
};

const ROLE_LABEL: Record<EmployeeRole, string> = {
  worker: "عامل / موظف",
  accountant: "محاسب",
  manager: "مدير",
  owner: "مالك",
  developer: "مطور",
};

export default function ActionGate({
  children,
  requiredRole = "accountant",
  actionName = "هذا الإجراء",
  onSuccess,
}: ActionGateProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  function close() {
    setIsOpen(false);
    setPin("");
    setError("");
  }

  async function handleVerify(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (isVerifying) return;

    setError("");
    setIsVerifying(true);

    try {
      const session = await api.authenticateEmployeeByPin(pin);
      const employee = session.employee;

      if (
        (ROLE_WEIGHT[employee.role] ?? 0) < (ROLE_WEIGHT[requiredRole] ?? 0)
      ) {
        setError(
          `صلاحياتك لا تسمح بتنفيذ الإجراء. المطلوب: ${
            ROLE_LABEL[requiredRole]
          } أو أعلى.`,
        );
        setPin("");
        return;
      }
      close();
      onSuccess(employee, session.token);
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "تعذر التحقق من الرقم السري.",
      );
      setPin("");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <>
      <div
        onClick={() => {
          setError("");
          setIsOpen(true);
        }}
        className="inline-block cursor-pointer"
      >
        {children}
      </div>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) close();
          else setIsOpen(true);
        }}
      >
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              تأكيد الصلاحية
            </DialogTitle>

            <DialogDescription>
              لتنفيذ «{actionName}»، أدخل الرقم السري. سيحدد النظام رتبتك ويتحقق
              من صلاحيتك تلقائيًا. الرتب الأعلى تستطيع تنفيذ الإجراءات المسموحة
              للرتب الأقل.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleVerify} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الرقم السري (PIN)</label>

              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 12))
                }
                required
                minLength={4}
                placeholder="أدخل الرقم السري"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-center text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={isVerifying}
              >
                إلغاء
              </Button>

              <Button
                type="submit"
                disabled={isVerifying || pin.length < 4}
                className="gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                {isVerifying ? "جارٍ التحقق..." : "تأكيد"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
