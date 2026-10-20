import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Check,
  ChevronLeft,
  CircleAlert,
  Clock3,
  History,
  Landmark,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wallet,
  X,
  Pencil,
} from "lucide-react";
import {
  api,
  type TransferCommissionSettings,
  type TransferLineInput,
  type TransferLineRecord,
  type TransferService,
} from "../lib/api-client";

export const Route = createFileRoute("/transfers")({
  head: () => ({ meta: [{ title: "التحويلات والمحافظ | BMO Mobile" }] }),
  component: TransfersPage,
});

type PageTab = "operation" | "lines" | "commissions";
type OperationType = "transfer" | "withdrawal";
type DestinationMode = "customer" | "self";

const ZERO_FEES: TransferCommissionSettings = {
  wallet_withdrawal: 0,
  wallet_transfer: 0,
  instapay_withdrawal: 0,
  instapay_transfer: 0,
  instapay_vodafone_transfer: 0,
};

const emptyLine = (): TransferLineInput => ({
  phone: "",
  ownerName: "",
  walletType: "vodafone_cash",
  bankName: "",
  lastFour: "",
  supportsWallet: true,
  supportsInstapay: false,
  dailyLimit: 0,
  monthlyLimit: 0,
  balance: 0,
});

const asMoney = (value: number) =>
  `${(Number.isFinite(value) ? value : 0).toLocaleString("en-EG", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })} ج.م`;
const readError = (error: unknown) =>
  error instanceof Error ? error.message : "حصل خطأ غير متوقع. جرّب مرة تانية.";

function lineTint(line: TransferLineRecord | TransferLineInput) {
  if (line.supportsWallet && line.supportsInstapay)
    return "border-violet-200 bg-gradient-to-l from-emerald-50 via-white to-violet-50";
  if (line.supportsInstapay) return "border-violet-200 bg-violet-50/70";
  return "border-emerald-200 bg-emerald-50/70";
}

function feeKey(
  service: TransferService,
  operation: OperationType,
  toVodafone = false,
): keyof TransferCommissionSettings {
  if (service === "wallet")
    return operation === "withdrawal" ? "wallet_withdrawal" : "wallet_transfer";
  if (operation === "withdrawal") return "instapay_withdrawal";
  return toVodafone ? "instapay_vodafone_transfer" : "instapay_transfer";
}

function TransfersPage() {
  const [tab, setTab] = useState<PageTab>("operation");
  const [lines, setLines] = useState<TransferLineRecord[]>([]);
  const [fees, setFees] = useState<TransferCommissionSettings>(ZERO_FEES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [service, setService] = useState<TransferService>("wallet");
  const [operationType, setOperationType] = useState<OperationType>("transfer");
  const [destinationMode, setDestinationMode] =
    useState<DestinationMode>("customer");
  const [sourceLineId, setSourceLineId] = useState("");
  const [destinationLineId, setDestinationLineId] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [amount, setAmount] = useState("");
  const [transferCost, setTransferCost] = useState("");
  const [transferToVodafone, setTransferToVodafone] = useState(false);
  const [lineDraft, setLineDraft] = useState<TransferLineInput>(emptyLine);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineSearch, setLineSearch] = useState("");

  const reload = async () => {
    const [nextLines, nextFees] = await Promise.all([
      api.getTransferLines(),
      api.getTransferCommissions(),
    ]);
    setLines(nextLines);
    setFees(nextFees);
  };

  useEffect(() => {
    let live = true;
    Promise.all([api.getTransferLines(), api.getTransferCommissions()])
      .then(([nextLines, nextFees]) => {
        if (!live) return;
        setLines(nextLines);
        setFees(nextFees);
      })
      .catch((error) => {
        if (live)
          toast.error(`تعذر تحميل بيانات التحويلات: ${readError(error)}`);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const sourceCandidates = useMemo(
    () =>
      lines.filter(
        (line) =>
          line.isActive &&
          (service === "wallet" ? line.supportsWallet : line.supportsInstapay),
      ),
    [lines, service],
  );
  const destinationCandidates = useMemo(
    () => sourceCandidates.filter((line) => line.id !== sourceLineId),
    [sourceCandidates, sourceLineId],
  );
  const selectedLine =
    sourceCandidates.find((line) => line.id === sourceLineId) ?? null;
  const selectedDestination =
    destinationCandidates.find((line) => line.id === destinationLineId) ?? null;
  const toVodafone =
    service === "instapay" &&
    operationType === "transfer" &&
    destinationMode === "customer" &&
    transferToVodafone;
  const selectedFeeKey = feeKey(service, operationType, toVodafone);
  const currentCommission = fees[selectedFeeKey] ?? 0;
  const numericAmount = Number(amount) || 0;
  const numericCost = Number(transferCost) || 0;
  const estimatedProfit = currentCommission - numericCost;
  const limitWarning = selectedLine
    ? selectedLine.dailyRemaining <= 0 || selectedLine.monthlyRemaining <= 0
      ? "blocked"
      : selectedLine.balance > 0 &&
          ((selectedLine.dailyLimit > 0 &&
            selectedLine.dailyRemaining / selectedLine.dailyLimit <= 0.2) ||
            (selectedLine.monthlyLimit > 0 &&
              selectedLine.monthlyRemaining / selectedLine.monthlyLimit <= 0.2))
        ? "near"
        : "ok"
    : "ok";
  const activeLines = lines.filter((line) => line.isActive);
  const totalBalance = activeLines.reduce((sum, line) => sum + line.balance, 0);
  const lineSearchResults = lines.filter((line) => {
    const value =
      `${line.phone} ${line.ownerName} ${line.walletType} ${line.bankName}`.toLocaleLowerCase(
        "ar-EG",
      );
    return value.includes(lineSearch.toLocaleLowerCase("ar-EG"));
  });

  useEffect(() => {
    if (!sourceCandidates.some((line) => line.id === sourceLineId))
      setSourceLineId(sourceCandidates[0]?.id ?? "");
    if (!destinationCandidates.some((line) => line.id === destinationLineId))
      setDestinationLineId(destinationCandidates[0]?.id ?? "");
  }, [
    sourceCandidates,
    destinationCandidates,
    sourceLineId,
    destinationLineId,
  ]);

  useEffect(() => {
    if (service !== "instapay" || operationType !== "transfer")
      setTransferToVodafone(false);
  }, [service, operationType]);

  const resetOperation = () => {
    setRecipientPhone("");
    setRecipientName("");
    setAmount("");
    setTransferCost("");
    setDestinationLineId("");
    setTransferToVodafone(false);
  };

  const submitOperation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLine)
      return toast.error("أضف خطًا نشطًا يدعم الخدمة المختارة أولًا.");
    if (
      operationType === "transfer" &&
      destinationMode === "self" &&
      !selectedDestination
    )
      return toast.error("اختار خط الاستقبال الداخلي.");
    if (selectedLine.dailyRemaining < numericAmount)
      return toast.error(
        `المتبقي من الليميت اليومي ${asMoney(selectedLine.dailyRemaining)} فقط.`,
      );
    if (selectedLine.monthlyRemaining < numericAmount)
      return toast.error(
        `المتبقي من الليميت الشهري ${asMoney(selectedLine.monthlyRemaining)} فقط.`,
      );
    if (operationType === "transfer" && selectedLine.balance < numericAmount)
      return toast.error("رصيد الخط غير كافٍ لتنفيذ التحويل.");

    setSaving(true);
    try {
      const result = await api.createTransfer({
        operationType,
        serviceType: service,
        sourceLineId,
        ...(operationType === "transfer" &&
        destinationMode === "self" &&
        selectedDestination
          ? { destinationLineId: selectedDestination.id }
          : {}),
        recipientPhone:
          operationType === "withdrawal" || destinationMode === "customer"
            ? recipientPhone.trim()
            : "",
        recipientName: recipientName.trim(),
        amount: numericAmount,
        transferCost: numericCost,
        transferToVodafone: toVodafone,
      });
      toast.success(`تمت العملية بنجاح — صافي الربح ${asMoney(result.profit)}`);
      resetOperation();
      await reload();
    } catch (error) {
      toast.error(readError(error));
    } finally {
      setSaving(false);
    }
  };

  const startEditLine = (line: TransferLineRecord) => {
    setEditingLineId(line.id);
    setLineDraft({
      phone: line.phone,
      ownerName: line.ownerName,
      walletType: line.walletType || "vodafone_cash",
      bankName: line.bankName || "",
      lastFour: line.lastFour || "",
      supportsWallet: line.supportsWallet,
      supportsInstapay: line.supportsInstapay,
      dailyLimit: line.dailyLimit,
      monthlyLimit: line.monthlyLimit,
      balance: line.balance,
    });
    setTab("lines");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitLine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingLineId) await api.updateTransferLine(editingLineId, lineDraft);
      else await api.createTransferLine(lineDraft);
      toast.success(
        editingLineId ? "تم تحديث بيانات الخط." : "تمت إضافة الخط بنجاح.",
      );
      setLineDraft(emptyLine());
      setEditingLineId(null);
      await reload();
    } catch (error) {
      toast.error(readError(error));
    } finally {
      setSaving(false);
    }
  };

  const disableLine = async (line: TransferLineRecord) => {
    if (
      !window.confirm(`إيقاف الخط ${line.phone}؟ سيظل ظاهرًا في السجل القديم.`)
    )
      return;
    try {
      await api.deactivateTransferLine(line.id);
      toast.success("تم إيقاف الخط، والسجل القديم محفوظ.");
      if (sourceLineId === line.id) setSourceLineId("");
      await reload();
    } catch (error) {
      toast.error(readError(error));
    }
  };

  const activateLine = async (line: TransferLineRecord) => {
    try {
      await api.updateTransferLine(line.id, {
        phone: line.phone,
        ownerName: line.ownerName,
        walletType: line.walletType,
        bankName: line.bankName,
        lastFour: line.lastFour,
        supportsWallet: line.supportsWallet,
        supportsInstapay: line.supportsInstapay,
        dailyLimit: line.dailyLimit,
        monthlyLimit: line.monthlyLimit,
        balance: line.balance,
        isActive: true,
      });
      toast.success("تم تفعيل الخط مرة أخرى.");
      await reload();
    } catch (error) {
      toast.error(readError(error));
    }
  };

  const submitFees = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await api.saveTransferCommissions(fees);
      setFees(saved);
      toast.success("تم حفظ العمولات.");
    } catch (error) {
      toast.error(readError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-6 pb-10">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span>الإدارة المالية</span>
            <ChevronLeft size={15} />
            <span className="text-foreground">التحويلات</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            مركز التحويلات
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            المحافظ الإلكترونية وإنستا باي، مع متابعة الرصيد والليميت والربح من
            مكان واحد.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/transfer-history"
            className="inline-flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-bold transition hover:bg-muted"
          >
            <History size={17} /> سجل التحويلات <ChevronLeft size={15} />
          </Link>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              reload()
                .catch((error) => toast.error(readError(error)))
                .finally(() => setLoading(false));
            }}
            className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm font-semibold transition hover:bg-muted"
            aria-label="تحديث البيانات"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />{" "}
            تحديث
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="الخطوط النشطة"
          value={String(activeLines.length)}
          note="خطوط متاحة للتشغيل"
          icon={<Smartphone size={19} />}
          tint="green"
        />
        <MetricCard
          label="إجمالي رصيد الخطوط"
          value={asMoney(totalBalance)}
          note="رصيد تشغيلي للخطوط النشطة"
          icon={<Wallet size={19} />}
          tint="violet"
        />
        <MetricCard
          label="التجديد التلقائي"
          value="12:00 منتصف الليل"
          note="بالتوقيت المحلي لمصر"
          icon={<Clock3 size={19} />}
          tint="amber"
        />
      </section>

      <nav
        className="grid grid-cols-3 rounded-2xl border bg-card p-1.5 shadow-sm"
        aria-label="أقسام التحويلات"
      >
        <TabButton
          active={tab === "operation"}
          icon={<ArrowLeftRight size={17} />}
          onClick={() => setTab("operation")}
        >
          تحويل / سحب
        </TabButton>
        <TabButton
          active={tab === "lines"}
          icon={<Smartphone size={17} />}
          onClick={() => setTab("lines")}
        >
          إدارة الخطوط
        </TabButton>
        <TabButton
          active={tab === "commissions"}
          icon={<Banknote size={17} />}
          onClick={() => setTab("commissions")}
        >
          العمولات
        </TabButton>
      </nav>

      {loading ? (
        <div className="grid min-h-64 place-items-center rounded-2xl border bg-card text-muted-foreground">
          <div className="flex items-center gap-3">
            <LoaderCircle size={22} className="animate-spin" /> تحميل بيانات
            التحويلات...
          </div>
        </div>
      ) : tab === "operation" ? (
        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <aside className="order-2 space-y-3 xl:order-1">
            <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-extrabold">خطوط المحل</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    اختار الخط اللي هتنفذ منه العملية.
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">
                  {sourceCandidates.length} خط
                </span>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2">
                <ServiceButton
                  active={service === "wallet"}
                  onClick={() => setService("wallet")}
                  icon={<Wallet size={19} />}
                  title="محفظة إلكترونية"
                  subtitle="Vodafone / Etisalat / غيره"
                  tone="wallet"
                />
                <ServiceButton
                  active={service === "instapay"}
                  onClick={() => setService("instapay")}
                  icon={<Landmark size={19} />}
                  title="إنستا باي"
                  subtitle="حساب بنكي"
                  tone="instapay"
                />
              </div>
              <div className="space-y-2">
                {sourceCandidates.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-center">
                    <Smartphone
                      size={26}
                      className="mx-auto mb-2 text-muted-foreground"
                    />
                    <p className="text-sm font-bold">
                      مفيش خطوط متاحة للخدمة دي
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      أضف خطًا من إدارة الخطوط وفعّل الخدمة المطلوبة.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab("lines")}
                      className="mt-3 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
                    >
                      إضافة خط
                    </button>
                  </div>
                ) : (
                  sourceCandidates.map((line) => (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() => setSourceLineId(line.id)}
                      className={`w-full rounded-xl border p-3.5 text-right transition ${lineTint(line)} ${sourceLineId === line.id ? "ring-2 ring-primary ring-offset-1" : "hover:-translate-y-px hover:shadow-sm"}`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${line.supportsWallet && line.supportsInstapay ? "bg-gradient-to-br from-emerald-100 to-violet-100 text-slate-700" : line.supportsInstapay ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}
                        >
                          {line.supportsWallet && line.supportsInstapay ? (
                            <ArrowLeftRight size={19} />
                          ) : line.supportsInstapay ? (
                            <Landmark size={19} />
                          ) : (
                            <Wallet size={19} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-extrabold tabular-nums">
                              {line.phone}
                            </span>
                            {sourceLineId === line.id && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                                <Check size={12} /> محدد
                              </span>
                            )}
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {line.ownerName} ·{" "}
                            {line.supportsWallet && line.supportsInstapay
                              ? "محفظة + إنستا باي"
                              : line.supportsInstapay
                                ? `إنستا باي · ${line.bankName}`
                                : line.walletType.replaceAll("_", " ")}
                          </p>
                          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-black/5 pt-3">
                            <MiniValue
                              label="الرصيد"
                              value={asMoney(line.balance)}
                            />
                            <MiniValue
                              label="متبقي يومي"
                              value={asMoney(line.dailyRemaining)}
                              warn={line.dailyRemaining <= 0}
                            />
                            <MiniValue
                              label="متبقي شهري"
                              value={asMoney(line.monthlyRemaining)}
                              warn={line.monthlyRemaining <= 0}
                            />
                          </div>
                          {(line.dailyRemaining <= 0 ||
                            line.monthlyRemaining <= 0) && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-rose-700">
                              <CircleAlert size={14} /> الليميت انتهى — الخط
                              متوقف مؤقتًا
                            </p>
                          )}
                          {line.isActive &&
                            line.balance > 0 &&
                            line.dailyRemaining > 0 &&
                            line.monthlyRemaining > 0 &&
                            ((line.dailyLimit > 0 &&
                              line.dailyRemaining / line.dailyLimit <= 0.2) ||
                              (line.monthlyLimit > 0 &&
                                line.monthlyRemaining / line.monthlyLimit <=
                                  0.2)) && (
                              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-700">
                                <CircleAlert size={14} /> تنبيه: الليميت قرب
                                يخلص
                              </p>
                            )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4 text-xs leading-6 text-muted-foreground">
              <div className="mb-1 flex items-center gap-2 font-extrabold text-foreground">
                <ShieldCheck size={16} /> حماية العملية
              </div>
              النظام بيراجع الرصيد والليميت مرة تانية من قاعدة البيانات قبل
              الحفظ، وبيمنع العملية لو الحد اليومي أو الشهري مش كافي.
            </div>
          </aside>

          <div className="order-1 space-y-5 xl:order-2">
            <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
              <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-lg font-extrabold">تنفيذ عملية جديدة</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    كل عملية محفوظة في سجل مستقل.
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-extrabold ${service === "wallet" ? "bg-emerald-50 text-emerald-800" : "bg-violet-50 text-violet-800"}`}
                >
                  {service === "wallet" ? (
                    <Wallet size={15} />
                  ) : (
                    <Landmark size={15} />
                  )}
                  {service === "wallet" ? "محفظة إلكترونية" : "إنستا باي"}
                </span>
              </div>

              <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setOperationType("transfer");
                    if (destinationMode !== "customer")
                      setDestinationMode("customer");
                  }}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-extrabold transition ${operationType === "transfer" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background"}`}
                >
                  <ArrowUpRight size={17} /> تحويل
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOperationType("withdrawal");
                    setDestinationMode("customer");
                    setDestinationLineId("");
                  }}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-extrabold transition ${operationType === "withdrawal" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background"}`}
                >
                  <ArrowDownLeft size={17} /> سحب
                </button>
              </div>

              <form onSubmit={submitOperation} className="space-y-5">
                {operationType === "transfer" && (
                  <div className="space-y-2">
                    <label className="text-sm font-bold">هتحوّل لمين؟</label>
                    <div className="grid grid-cols-2 gap-2">
                      <DestinationButton
                        active={destinationMode === "customer"}
                        onClick={() => setDestinationMode("customer")}
                        icon={<Smartphone size={18} />}
                        title="عميل"
                        detail="رقم خارج المحل"
                      />
                      <DestinationButton
                        active={destinationMode === "self"}
                        onClick={() => setDestinationMode("self")}
                        icon={<ArrowLeftRight size={18} />}
                        title="خط تاني بتاعي"
                        detail="تحويل داخلي بين خطوط المحل"
                      />
                    </div>
                  </div>
                )}

                {operationType === "withdrawal" ||
                destinationMode === "customer" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="رقم العميل" required>
                      <input
                        required
                        inputMode="tel"
                        autoComplete="off"
                        value={recipientPhone}
                        onChange={(e) => setRecipientPhone(e.target.value)}
                        placeholder="01xxxxxxxxx"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="اسم العميل" hint="اختياري">
                      <input
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="اسم العميل"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-bold">
                      خط الاستقبال الداخلي
                    </label>
                    <div className="relative">
                      <Search
                        size={17}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <select
                        required
                        value={destinationLineId}
                        onChange={(e) => setDestinationLineId(e.target.value)}
                        className={`${inputClass} pr-10`}
                      >
                        <option value="">اختار خطًا تابعًا للمحل</option>
                        {destinationCandidates.map((line) => (
                          <option key={line.id} value={line.id}>
                            {line.phone} — {line.ownerName} — الرصيد{" "}
                            {asMoney(line.balance)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {destinationCandidates.length === 0 && (
                      <p className="text-xs text-amber-700">
                        مفيش خط تاني نشط يدعم نفس الخدمة.
                      </p>
                    )}
                  </div>
                )}

                {service === "instapay" &&
                  operationType === "transfer" &&
                  destinationMode === "customer" && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3.5">
                      <input
                        type="checkbox"
                        checked={transferToVodafone}
                        onChange={(e) =>
                          setTransferToVodafone(e.target.checked)
                        }
                        className="mt-1 h-4 w-4 accent-violet-700"
                      />
                      <span className="flex-1">
                        <span className="block text-sm font-extrabold text-violet-950">
                          تحويل من إنستا باي لفودافون كاش
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-violet-800/80">
                          عند تفعيله، النظام يستخدم العمولة الخاصة بالخدمة دي
                          بدل عمولة تحويل إنستا باي العادية.
                        </span>
                      </span>
                    </label>
                  )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="مبلغ العملية بالجنيه" required>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className={`${inputClass} text-lg font-extrabold tabular-nums`}
                    />
                  </Field>
                  <Field
                    label="تكلفة التحويل بالجنيه"
                    required
                    hint="يدخلها الموظف"
                  >
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={transferCost}
                      onChange={(e) => setTransferCost(e.target.value)}
                      placeholder="0.00"
                      className={`${inputClass} text-lg font-extrabold tabular-nums`}
                    />
                  </Field>
                </div>

                <div className="rounded-2xl border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      عمولة العملية
                    </span>
                    <span className="font-extrabold tabular-nums">
                      {asMoney(currentCommission)}
                    </span>
                  </div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      تكلفة التحويل
                    </span>
                    <span className="font-bold tabular-nums">
                      − {asMoney(numericCost)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t pt-3">
                    <span className="font-extrabold">صافي الربح المتوقع</span>
                    <span
                      className={`text-xl font-black tabular-nums ${estimatedProfit < 0 ? "text-rose-700" : "text-emerald-700"}`}
                    >
                      {asMoney(estimatedProfit)}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    العمولة تُقرأ من إعدادات المحل، والتكلفة تُحفظ مع العملية.
                    الربح = العمولة − التكلفة.
                  </p>
                </div>

                {selectedLine &&
                  (selectedLine.dailyRemaining <= 0 ||
                    selectedLine.monthlyRemaining <= 0 ||
                    (numericAmount > 0 &&
                      (numericAmount > selectedLine.dailyRemaining ||
                        numericAmount > selectedLine.monthlyRemaining))) && (
                    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800">
                      <CircleAlert size={18} className="mt-0.5 shrink-0" />
                      <span>
                        المبلغ أكبر من الليميت المتبقي للخط. مش هيتسمح بتنفيذ
                        العملية حتى تختار خطًا مناسبًا أو يتجدد الليميت.
                      </span>
                    </div>
                  )}
                {selectedLine &&
                  operationType === "transfer" &&
                  numericAmount > selectedLine.balance && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <CircleAlert size={18} className="shrink-0" />
                      رصيد الخط أقل من المبلغ المطلوب.
                    </div>
                  )}
                {limitWarning === "near" && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <CircleAlert size={18} className="shrink-0" />
                    الليميت قرب يخلص على الخط المحدد؛ راجع المتبقي قبل التنفيذ.
                  </div>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={resetOperation}
                    className="rounded-xl border px-4 py-3 text-sm font-bold hover:bg-muted sm:w-32"
                  >
                    مسح الحقول
                  </button>
                  <button
                    type="submit"
                    disabled={
                      saving ||
                      !selectedLine ||
                      !amount ||
                      numericAmount <= 0 ||
                      !transferCost ||
                      (operationType === "transfer" &&
                        numericAmount > selectedLine.balance) ||
                      numericAmount > (selectedLine?.dailyRemaining ?? 0) ||
                      numericAmount > (selectedLine?.monthlyRemaining ?? 0) ||
                      (operationType === "transfer" &&
                        destinationMode === "self" &&
                        !selectedDestination)
                    }
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-extrabold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <LoaderCircle size={18} className="animate-spin" />
                    ) : (
                      <Check size={18} />
                    )}
                    {saving
                      ? "جارٍ تسجيل العملية..."
                      : operationType === "transfer"
                        ? "تأكيد التحويل"
                        : "تأكيد السحب"}
                  </button>
                </div>
              </form>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4 text-xs leading-5 text-muted-foreground">
              <ShieldCheck size={19} className="shrink-0 text-emerald-600" />
              <p>
                الحفظ وتحديث الرصيد والليميت وسجل الربح بيتموا مع بعض في قاعدة
                البيانات. لو فشل فحص واحد، العملية كلها بتتلغي.
              </p>
            </div>
          </div>
        </section>
      ) : tab === "lines" ? (
        <section className="grid items-start gap-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
          <form
            onSubmit={submitLine}
            className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold">
                  {editingLineId ? "تعديل بيانات الخط" : "إضافة خط جديد"}
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  ممكن نفس الرقم يدعم المحفظة وإنستا باي معًا.
                </p>
              </div>
              {editingLineId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingLineId(null);
                    setLineDraft(emptyLine());
                  }}
                  className="rounded-lg border p-2"
                  aria-label="إلغاء التعديل"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="رقم الخط" required>
                <input
                  required
                  inputMode="tel"
                  value={lineDraft.phone}
                  onChange={(e) =>
                    setLineDraft((old) => ({ ...old, phone: e.target.value }))
                  }
                  placeholder="01xxxxxxxxx"
                  className={inputClass}
                />
              </Field>
              <Field label="اسم صاحب الخط" required>
                <input
                  required
                  value={lineDraft.ownerName}
                  onChange={(e) =>
                    setLineDraft((old) => ({
                      ...old,
                      ownerName: e.target.value,
                    }))
                  }
                  placeholder="اسم صاحب الخط"
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold">الخدمات على الخط</label>
              <div className="grid grid-cols-2 gap-2">
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-bold ${lineDraft.supportsWallet ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "bg-background text-muted-foreground"}`}
                >
                  <input
                    type="checkbox"
                    checked={lineDraft.supportsWallet}
                    onChange={(e) =>
                      setLineDraft((old) => ({
                        ...old,
                        supportsWallet: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-emerald-700"
                  />
                  <Wallet size={17} /> محفظة إلكترونية
                </label>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-bold ${lineDraft.supportsInstapay ? "border-violet-300 bg-violet-50 text-violet-900" : "bg-background text-muted-foreground"}`}
                >
                  <input
                    type="checkbox"
                    checked={lineDraft.supportsInstapay}
                    onChange={(e) =>
                      setLineDraft((old) => ({
                        ...old,
                        supportsInstapay: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-violet-700"
                  />
                  <Landmark size={17} /> إنستا باي
                </label>
              </div>
            </div>
            {lineDraft.supportsWallet && (
              <Field label="نوع المحفظة" required>
                <select
                  required
                  value={lineDraft.walletType}
                  onChange={(e) =>
                    setLineDraft((old) => ({
                      ...old,
                      walletType: e.target.value,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="vodafone_cash">فودافون كاش</option>
                  <option value="etisalat_cash">اتصالات كاش</option>
                  <option value="orange_cash">أورنج كاش</option>
                  <option value="we_pay">WE Pay</option>
                  <option value="other">أخرى</option>
                </select>
              </Field>
            )}
            {lineDraft.supportsInstapay && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="اسم البنك" required>
                  <select
                    required
                    value={lineDraft.bankName}
                    onChange={(e) =>
                      setLineDraft((old) => ({
                        ...old,
                        bankName: e.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="">اختار البنك</option>
                    <option value="البنك الأهلي المصري">
                      البنك الأهلي المصري
                    </option>
                    <option value="بنك مصر">بنك مصر</option>
                    <option value="CIB">CIB</option>
                    <option value="QNB">QNB</option>
                    <option value="بنك الإسكندرية">بنك الإسكندرية</option>
                    <option value="بنك آخر">بنك آخر</option>
                  </select>
                </Field>
                <Field label="آخر أربع أرقام" hint="اختياري">
                  <input
                    inputMode="numeric"
                    maxLength={4}
                    pattern="[0-9]{4}"
                    value={lineDraft.lastFour}
                    onChange={(e) =>
                      setLineDraft((old) => ({
                        ...old,
                        lastFour: e.target.value.replace(/\D/g, "").slice(0, 4),
                      }))
                    }
                    placeholder="1234"
                    className={inputClass}
                  />
                </Field>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الليميت اليومي" required>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={lineDraft.dailyLimit}
                  onChange={(e) =>
                    setLineDraft((old) => ({
                      ...old,
                      dailyLimit: Number(e.target.value),
                    }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="الليميت الشهري" required>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={lineDraft.monthlyLimit}
                  onChange={(e) =>
                    setLineDraft((old) => ({
                      ...old,
                      monthlyLimit: Number(e.target.value),
                    }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field
                label="الرصيد الحالي للخط"
                required
                hint="قيمة الرصيد الفعلي الحالية"
              >
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={lineDraft.balance}
                  onChange={(e) =>
                    setLineDraft((old) => ({
                      ...old,
                      balance: Number(e.target.value),
                    }))
                  }
                  className={inputClass}
                />
              </Field>
            </div>
            <button
              type="submit"
              disabled={
                saving ||
                (!lineDraft.supportsWallet && !lineDraft.supportsInstapay)
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
            >
              {saving ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : editingLineId ? (
                <Save size={17} />
              ) : (
                <Plus size={17} />
              )}
              {editingLineId ? "حفظ التعديلات" : "إضافة الخط"}
            </button>
          </form>

          <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-extrabold">كل الخطوط</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lines.length} خط مسجل — الخطوط الموقوفة تظل محفوظة في السجل.
                </p>
              </div>
              <div className="relative sm:w-64">
                <Search
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={lineSearch}
                  onChange={(e) => setLineSearch(e.target.value)}
                  placeholder="بحث بالرقم أو الاسم أو البنك"
                  className={`${inputClass} pr-9`}
                />
              </div>
            </div>
            <div className="space-y-2">
              {lineSearchResults.length === 0 ? (
                <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                  لا توجد خطوط مطابقة للبحث.
                </div>
              ) : (
                lineSearchResults.map((line) => (
                  <div
                    key={line.id}
                    className={`rounded-xl border p-3.5 ${lineTint(line)}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-background/80">
                        {line.supportsWallet && line.supportsInstapay ? (
                          <ArrowLeftRight size={18} />
                        ) : line.supportsInstapay ? (
                          <Landmark size={18} />
                        ) : (
                          <Wallet size={18} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold tabular-nums">
                            {line.phone}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${line.isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}`}
                          >
                            {line.isActive ? "نشط" : "موقوف"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {line.ownerName} ·{" "}
                          {line.supportsWallet
                            ? line.walletType.replaceAll("_", " ")
                            : ""}
                          {line.supportsWallet && line.supportsInstapay
                            ? " + "
                            : ""}
                          {line.supportsInstapay
                            ? `إنستا باي (${line.bankName}${line.lastFour ? ` •••• ${line.lastFour}` : ""})`
                            : ""}
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <div className="rounded-lg bg-background/80 p-2">
                            <span className="text-muted-foreground">
                              الرصيد
                            </span>
                            <p className="mt-1 font-extrabold">
                              {asMoney(line.balance)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-background/80 p-2">
                            <span className="text-muted-foreground">
                              متبقي اليوم
                            </span>
                            <p className="mt-1 font-extrabold">
                              {asMoney(line.dailyRemaining)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-background/80 p-2">
                            <span className="text-muted-foreground">
                              متبقي الشهر
                            </span>
                            <p className="mt-1 font-extrabold">
                              {asMoney(line.monthlyRemaining)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-background/80 p-2">
                            <span className="text-muted-foreground">
                              نوع الخدمة
                            </span>
                            <p className="mt-1 font-extrabold">
                              {line.supportsWallet && line.supportsInstapay
                                ? "الخدمتان"
                                : line.supportsWallet
                                  ? "محفظة"
                                  : "إنستا باي"}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2 self-end sm:self-start">
                        <button
                          type="button"
                          onClick={() => startEditLine(line)}
                          className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-bold hover:bg-muted"
                        >
                          <Pencil size={14} /> تعديل
                        </button>
                        {line.isActive ? (
                          <button
                            type="button"
                            onClick={() => void disableLine(line)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-background px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 size={14} /> إيقاف
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void activateLine(line)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-background px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                          >
                            <Check size={14} /> تفعيل
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-6 flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <Banknote size={22} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold">إعداد عمولات المحل</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                كل خدمة لها عمولة منفصلة. العمولة اللي تتسجل وقت العملية تفضل
                محفوظة حتى لو اتغيرت الإعدادات بعدين.
              </p>
            </div>
          </div>
          <form
            onSubmit={submitFees}
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            <FeeField
              label="سحب من المحفظة الإلكترونية"
              value={fees.wallet_withdrawal}
              onChange={(value) =>
                setFees((old) => ({ ...old, wallet_withdrawal: value }))
              }
              icon={<Wallet size={18} />}
              tone="green"
            />
            <FeeField
              label="تحويل من المحفظة الإلكترونية"
              value={fees.wallet_transfer}
              onChange={(value) =>
                setFees((old) => ({ ...old, wallet_transfer: value }))
              }
              icon={<ArrowLeftRight size={18} />}
              tone="green"
            />
            <FeeField
              label="سحب من إنستا باي"
              value={fees.instapay_withdrawal}
              onChange={(value) =>
                setFees((old) => ({ ...old, instapay_withdrawal: value }))
              }
              icon={<Landmark size={18} />}
              tone="violet"
            />
            <FeeField
              label="تحويل من إنستا باي"
              value={fees.instapay_transfer}
              onChange={(value) =>
                setFees((old) => ({ ...old, instapay_transfer: value }))
              }
              icon={<ArrowLeftRight size={18} />}
              tone="violet"
            />
            <FeeField
              label="تحويل من إنستا باي لفودافون كاش"
              value={fees.instapay_vodafone_transfer}
              onChange={(value) =>
                setFees((old) => ({
                  ...old,
                  instapay_vodafone_transfer: value,
                }))
              }
              icon={<Smartphone size={18} />}
              tone="rose"
            />
            <div className="flex flex-col justify-between rounded-xl border border-dashed p-4">
              <p className="text-sm font-bold">طريقة حساب الربح</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                صافي الربح = العمولة المحددة − تكلفة التحويل التي يدخلها الموظف
                لكل عملية.
              </p>
              <button
                type="submit"
                disabled={saving}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
              >
                {saving ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <Save size={17} />
                )}{" "}
                حفظ العمولات
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon,
  tint,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  tint: "green" | "violet" | "amber";
}) {
  const tintClass =
    tint === "green"
      ? "bg-emerald-50 text-emerald-700"
      : tint === "violet"
        ? "bg-violet-50 text-violet-700"
        : "bg-amber-50 text-amber-700";
  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tintClass}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-xl font-black tabular-nums">{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-extrabold transition sm:px-4 sm:text-sm ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function ServiceButton({
  active,
  onClick,
  icon,
  title,
  subtitle,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
  tone: "wallet" | "instapay";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-right transition ${active ? (tone === "wallet" ? "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200" : "border-violet-300 bg-violet-50 ring-1 ring-violet-200") : "bg-background hover:bg-muted/60"}`}
    >
      <span
        className={`mb-2 inline-grid h-9 w-9 place-items-center rounded-lg ${active ? (tone === "wallet" ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800") : "bg-muted text-muted-foreground"}`}
      >
        {icon}
      </span>
      <span className="block text-xs font-extrabold sm:text-sm">{title}</span>
      <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
        {subtitle}
      </span>
    </button>
  );
}

function DestinationButton({
  active,
  onClick,
  icon,
  title,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-right transition ${active ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
    >
      <span
        className={`mb-2 inline-grid h-9 w-9 place-items-center rounded-lg ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
      >
        {icon}
      </span>
      <span className="block text-sm font-extrabold">{title}</span>
      <span className="mt-1 block text-[11px] text-muted-foreground">
        {detail}
      </span>
    </button>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      data-required={required ? "true" : undefined}
      className="block min-w-0 space-y-1.5"
    >
      <span className="flex items-center gap-2 text-sm font-bold">
        {label}
        {hint && (
          <span className="text-[11px] font-normal text-muted-foreground">
            ({hint})
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function MiniValue({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] text-muted-foreground">{label}</span>
      <span
        className={`mt-1 block truncate text-xs font-extrabold tabular-nums ${warn ? "text-rose-700" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

function FeeField({
  label,
  value,
  onChange,
  icon,
  tone,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  icon: ReactNode;
  tone: "green" | "violet" | "rose";
}) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "violet"
        ? "bg-violet-50 text-violet-700"
        : "bg-rose-50 text-rose-700";
  return (
    <label className="rounded-xl border p-4">
      <span className="mb-3 flex items-center gap-2 text-sm font-bold">
        <span
          className={`grid h-9 w-9 place-items-center rounded-lg ${toneClass}`}
        >
          {icon}
        </span>
        {label}
      </span>
      <span className="relative block">
        <input
          type="number"
          min="0"
          step="0.01"
          required
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`${inputClass} pl-14 text-lg font-extrabold tabular-nums`}
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          ج.م
        </span>
      </span>
    </label>
  );
}

const inputClass =
  "w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15";
