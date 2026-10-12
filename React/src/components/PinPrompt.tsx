import { useState } from "react";
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
import { verifyPin } from "@/lib/store";
import { Lock } from "lucide-react";

interface Props {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onSuccess: () => void;
  onCancel: () => void; // 👈 السطر ده اللي كان ناقص
}

/** Reusable admin PIN modal. Validates against the saved admin password (sha-256). */
export function PinPrompt({
  open,
  title = "تأكيد الصلاحية",
  description = "أدخل كلمة مرور المسؤول للمتابعة.",
  onClose,
  onSuccess,
  onCancel,
}: Props) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const ok = await verifyPin(pin);
    setBusy(false);
    if (!ok) {
      setErr("كلمة المرور غير صحيحة");
      return;
    }
    setPin("");
    onSuccess();
  }
  function close() {
    setPin("");
    setErr("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" autoComplete="off">
          <Input
            type="password"
            autoFocus
            inputMode="numeric"
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="text-center text-lg tracking-widest"
          />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={close}>
              إلغاء
            </Button>
            <Button type="submit" disabled={busy || !pin}>
              تأكيد
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
