import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useCallback,
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
  Eye,
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
  type TransferCommissionValue,
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
type LinePickerTarget = "source" | "destination";

const ZERO_FEE: TransferCommissionValue = { value: 0, unit: "egp" };
const ZERO_FEES: TransferCommissionSettings = {
  wallet_withdrawal: { ...ZERO_FEE },
  wallet_transfer: { ...ZERO_FEE },
  instapay_withdrawal: { ...ZERO_FEE },
  instapay_transfer: { ...ZERO_FEE },
  instapay_vodafone_transfer: { ...ZERO_FEE },
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
  walletBalance: 0,
  instapayBalance: 0,
});

const normalizeTransferLine = (
  line: TransferLineRecord,
): TransferLineRecord => {
  const legacyBalance = Number(line.balance) || 0;
  const walletRaw = Number(
    (line as TransferLineRecord & { walletBalance?: number }).walletBalance,
  );
  const instapayRaw = Number(
    (line as TransferLineRecord & { instapayBalance?: number }).instapayBalance,
  );
  const walletBalance = Number.isFinite(walletRaw)
    ? walletRaw
    : line.supportsWallet
      ? legacyBalance
      : 0;
  const instapayBalance = Number.isFinite(instapayRaw)
    ? instapayRaw
    : line.supportsInstapay && !line.supportsWallet
      ? legacyBalance
      : 0;
  return {
    ...line,
    walletBalance,
    instapayBalance,
    balance: walletBalance + instapayBalance,
  };
};

const walletProviders = [
  {
    key: "vodafone_cash",
    label: "فودافون كاش",
    short: "فودافون",
    tone: "rose",
  },
  { key: "we_pay", label: "WE Pay", short: "WE", tone: "blue" },
  { key: "orange_cash", label: "أورنج كاش", short: "أورنج", tone: "orange" },
  {
    key: "etisalat_cash",
    label: "اتصالات كاش",
    short: "اتصالات",
    tone: "emerald",
  },
  { key: "other", label: "محافظ أخرى", short: "أخرى", tone: "slate" },
] as const;

function serviceBalance(
  line:
    | Pick<TransferLineRecord, "balance" | "walletBalance" | "instapayBalance">
    | (TransferLineInput & Partial<TransferLineRecord>),
  service: TransferService,
) {
  const value =
    service === "wallet" ? line.walletBalance : line.instapayBalance;
  return Number.isFinite(Number(value))
    ? Number(value)
    : Number(line.balance) || 0;
}

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
  const [linePickerTarget, setLinePickerTarget] =
    useState<LinePickerTarget | null>(null);
  const [operationDialogOpen, setOperationDialogOpen] = useState(false);
  const [balanceDetailsLineId, setBalanceDetailsLineId] = useState<
    string | null
  >(null);

  const reload = async () => {
    const [nextLines, nextFees] = await Promise.all([
      api.getTransferLines(),
      api.getTransferCommissions(),
    ]);
    setLines(nextLines.map(normalizeTransferLine));
    setFees(nextFees);
  };

  useEffect(() => {
    let live = true;
    Promise.all([api.getTransferLines(), api.getTransferCommissions()])
      .then(([nextLines, nextFees]) => {
        if (!live) return;
        setLines(nextLines.map(normalizeTransferLine));
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
  const selectedServiceBalance = selectedLine
    ? serviceBalance(selectedLine, service)
    : 0;
  const selectedDestinationServiceBalance = selectedDestination
    ? serviceBalance(selectedDestination, service)
    : 0;
  const balanceDetailsLine = balanceDetailsLineId
    ? (lines.find((line) => line.id === balanceDetailsLineId) ?? null)
    : null;
  const isInternalTransfer =
    operationType === "transfer" && destinationMode === "self";
  const toVodafone =
    service === "instapay" &&
    operationType === "transfer" &&
    destinationMode === "customer" &&
    transferToVodafone;
  const selectedFeeKey = feeKey(service, operationType, toVodafone);
  const currentFee = fees[selectedFeeKey] ?? ZERO_FEE;
  const currentCommission = currentFee.value;
  const numericAmount = Number(amount) || 0;
  const numericCost = Number(transferCost) || 0;
  // تحويل الرصيد بين خطوط المحل عملية داخلية وليست خدمة مدفوعة لعميل.
  const commissionAmount = isInternalTransfer
    ? 0
    : currentFee.unit === "percent"
      ? (numericAmount * currentCommission) / 100
      : currentCommission;
  const estimatedProfit = isInternalTransfer
    ? 0
    : commissionAmount - numericCost;
  const limitWarning = selectedLine
    ? selectedLine.dailyRemaining <= 0 || selectedLine.monthlyRemaining <= 0
      ? "blocked"
      : selectedServiceBalance > 0 &&
          ((selectedLine.dailyLimit > 0 &&
            selectedLine.dailyRemaining / selectedLine.dailyLimit <= 0.2) ||
            (selectedLine.monthlyLimit > 0 &&
              selectedLine.monthlyRemaining / selectedLine.monthlyLimit <= 0.2))
        ? "near"
        : "ok"
    : "ok";
  const activeLines = lines.filter((line) => line.isActive);
  const walletBalanceTotal = activeLines.reduce(
    (sum, line) => sum + (line.supportsWallet ? line.walletBalance : 0),
    0,
  );
  const instapayBalanceTotal = activeLines.reduce(
    (sum, line) => sum + (line.supportsInstapay ? line.instapayBalance : 0),
    0,
  );
  const totalBalance = walletBalanceTotal + instapayBalanceTotal;
  const instapayBankTotals = Array.from(
    new Set(
      activeLines
        .filter((line) => line.supportsInstapay)
        .map((line) => line.bankName || "بنك غير محدد"),
    ),
  )
    .map((bankName) => ({
      bankName,
      balance: activeLines
        .filter(
          (line) =>
            line.supportsInstapay &&
            (line.bankName || "بنك غير محدد") === bankName,
        )
        .reduce((sum, line) => sum + line.instapayBalance, 0),
      count: activeLines.filter(
        (line) =>
          line.supportsInstapay &&
          (line.bankName || "بنك غير محدد") === bankName,
      ).length,
    }))
    .sort((a, b) => b.balance - a.balance);
  const lineSearchResults = lines.filter((line) => {
    const value =
      `${line.phone} ${line.ownerName} ${line.walletType} ${line.bankName}`.toLocaleLowerCase(
        "ar-EG",
      );
    return value.includes(lineSearch.toLocaleLowerCase("ar-EG"));
  });

  useEffect(() => {
    if (
      sourceLineId &&
      !sourceCandidates.some((line) => line.id === sourceLineId)
    )
      setSourceLineId("");
    if (
      destinationLineId &&
      !destinationCandidates.some((line) => line.id === destinationLineId)
    )
      setDestinationLineId("");
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

  useEffect(() => {
    if (!operationDialogOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        setOperationDialogOpen(false);
        setLinePickerTarget(null);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [operationDialogOpen, saving]);

  const resetOperation = () => {
    setRecipientPhone("");
    setRecipientName("");
    setAmount("");
    setTransferCost("");
    setSourceLineId("");
    setDestinationLineId("");
    setTransferToVodafone(false);
    setLinePickerTarget(null);
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
    if (operationType === "transfer" && selectedServiceBalance < numericAmount)
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
        transferCost: isInternalTransfer ? 0 : numericCost,
        transferToVodafone: toVodafone,
      });
      toast.success(
        isInternalTransfer
          ? "تم التحويل الداخلي بنجاح — بدون احتساب عمولة أو ربح."
          : `تمت العملية بنجاح — صافي الربح ${asMoney(result.profit)}`,
      );
      resetOperation();
      setOperationDialogOpen(false);
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
      balance: line.walletBalance + line.instapayBalance,
      walletBalance: line.walletBalance,
      instapayBalance: line.instapayBalance,
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
        balance: line.walletBalance + line.instapayBalance,
        walletBalance: line.walletBalance,
        instapayBalance: line.instapayBalance,
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

      <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="flex flex-col gap-2 border-b bg-gradient-to-l from-slate-950 via-slate-900 to-indigo-950 p-4 text-white sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Wallet size={20} /> أرصدة الخدمات
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              إجمالي الرصيد الفعلي للمحافظ وإنستا باي على الخطوط النشطة.
            </p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm">
            <span className="text-slate-300">الإجمالي التشغيلي</span>
            <strong className="mr-2 font-black tabular-nums">
              {asMoney(totalBalance)}
            </strong>
          </div>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 sm:p-4">
          {walletProviders.map((provider) => {
            const providerLines = activeLines.filter(
              (line) => line.supportsWallet && line.walletType === provider.key,
            );
            const balance = providerLines.reduce(
              (sum, line) => sum + line.walletBalance,
              0,
            );
            const tone =
              provider.tone === "rose"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : provider.tone === "blue"
                  ? "border-sky-200 bg-sky-50 text-sky-900"
                  : provider.tone === "orange"
                    ? "border-orange-200 bg-orange-50 text-orange-900"
                    : provider.tone === "emerald"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-slate-50 text-slate-900";
            return (
              <div
                key={provider.key}
                className={`rounded-2xl border p-3 ${tone}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold">
                    {provider.label}
                  </span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold">
                    {providerLines.length} خط
                  </span>
                </div>
                <p className="mt-3 text-xl font-black tabular-nums">
                  {asMoney(balance)}
                </p>
                <p className="mt-1 text-[10px] opacity-75">رصيد المحفظة فقط</p>
              </div>
            );
          })}
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-violet-950">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-extrabold">
                <Landmark size={15} /> إنستا باي
              </span>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold">
                {activeLines.filter((line) => line.supportsInstapay).length} خط
              </span>
            </div>
            <p className="mt-3 text-xl font-black tabular-nums">
              {asMoney(instapayBalanceTotal)}
            </p>
            <div className="mt-2 space-y-1 border-t border-violet-200/80 pt-2">
              {instapayBankTotals.length ? (
                instapayBankTotals.slice(0, 3).map((bank) => (
                  <div
                    key={bank.bankName}
                    className="flex items-center justify-between gap-2 text-[10px]"
                  >
                    <span className="truncate">{bank.bankName}</span>
                    <strong className="shrink-0 tabular-nums">
                      {asMoney(bank.balance)}
                    </strong>
                  </div>
                ))
              ) : (
                <p className="text-[10px] opacity-70">
                  لا توجد خطوط إنستا باي نشطة
                </p>
              )}
            </div>
          </div>
        </div>
        <p className="px-4 pb-4 text-[10px] leading-5 text-muted-foreground">
          لو الخط بيدعم المحفظة وإنستا باي معًا، لكل خدمة رصيد مستقل. راجع أرصدة
          الخطوط القديمة من زر «تفاصيل الأرصدة» لأن النظام القديم كان يسجل
          رصيدًا واحدًا فقط.
        </p>
      </section>

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
        className="grid grid-cols-2 gap-1.5 rounded-2xl border bg-card p-1.5 shadow-sm sm:grid-cols-4"
        aria-label="أقسام التحويلات"
      >
        <TabButton
          active={tab === "operation"}
          icon={<ArrowLeftRight size={17} />}
          onClick={() => setTab("operation")}
        >
          تحويل / استلام
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
        <Link
          to="/shifts"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-extrabold text-violet-950 transition hover:bg-violet-100"
          title="مراجعة أرصدة المحافظ وإنستا باي والنقدية داخل تقرير الشيفت"
        >
          <ShieldCheck size={17} /> مراجعة العهدة في الشيفتات
        </Link>
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
          <aside className="order-2 space-y-4 xl:order-1">
            <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-lg">
              <div className="absolute -left-12 -top-12 h-40 w-40 rounded-full bg-violet-400/10 blur-2xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-300">
                    مركز التشغيل
                  </p>
                  <h2 className="mt-1 text-lg font-black">جاهز للعمل</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    اختار نوع العملية والخط، وراجع مسار المبلغ قبل التأكيد.
                  </p>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10">
                  <ArrowLeftRight size={22} />
                </span>
              </div>
              <div className="relative mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <span className="text-[11px] text-slate-300">
                    الخطوط النشطة
                  </span>
                  <strong className="mt-1 block text-2xl font-black tabular-nums">
                    {activeLines.length}
                  </strong>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <span className="text-[11px] text-slate-300">
                    إجمالي الرصيد
                  </span>
                  <strong className="mt-1 block truncate text-lg font-black tabular-nums">
                    {asMoney(totalBalance)}
                  </strong>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-extrabold">توزيع الخدمات</h3>
                <Smartphone size={17} className="text-muted-foreground" />
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl bg-emerald-50/80 p-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
                    <Wallet size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-emerald-950">
                      المحافظ الإلكترونية
                    </span>
                    <span className="mt-1 block text-[11px] text-emerald-800/80">
                      خطوط نشطة تدعم المحافظ
                    </span>
                  </span>
                  <strong className="text-xl font-black tabular-nums text-emerald-900">
                    {activeLines.filter((line) => line.supportsWallet).length}
                  </strong>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-violet-50/80 p-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-800">
                    <Landmark size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-violet-950">
                      إنستا باي
                    </span>
                    <span className="mt-1 block text-[11px] text-violet-800/80">
                      خطوط نشطة تدعم إنستا باي
                    </span>
                  </span>
                  <strong className="text-xl font-black tabular-nums text-violet-900">
                    {activeLines.filter((line) => line.supportsInstapay).length}
                  </strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLinePickerTarget("source")}
                disabled={sourceCandidates.length === 0}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-sm font-extrabold transition hover:border-primary hover:bg-muted/40 disabled:opacity-50"
              >
                <Smartphone size={17} />{" "}
                {selectedLine ? "تغيير خط العملية" : "اختيار خط العملية"}
              </button>
            </div>
            {selectedLine ? (
              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${service === "wallet" ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800"}`}
                  >
                    {service === "wallet" ? (
                      <Wallet size={18} />
                    ) : (
                      <Landmark size={18} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      الخط المختار حاليًا
                    </p>
                    <h3 className="mt-1 truncate font-black tabular-nums">
                      {selectedLine.phone}
                    </h3>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {selectedLine.ownerName || "بدون اسم مالك"}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-extrabold text-emerald-800">
                    نشط
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-muted/50 p-3">
                    <span className="text-[10px] text-muted-foreground">
                      {service === "wallet" ? "رصيد المحفظة" : "رصيد إنستا باي"}
                    </span>
                    <p className="mt-1 font-black tabular-nums">
                      {asMoney(selectedServiceBalance)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <span className="text-[10px] text-muted-foreground">
                      المتبقي اليوم
                    </span>
                    <p
                      className={`mt-1 font-black tabular-nums ${selectedLine.dailyRemaining <= 0 ? "text-rose-700" : ""}`}
                    >
                      {asMoney(selectedLine.dailyRemaining)}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-xl bg-muted/50 p-3">
                    <div className="mb-2 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>المتبقي من الليميت الشهري</span>
                      <strong className="text-xs font-black text-foreground">
                        {asMoney(selectedLine.monthlyRemaining)}
                      </strong>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-border">
                      <div
                        className={`h-full rounded-full ${selectedLine.monthlyRemaining <= 0 ? "bg-rose-500" : "bg-gradient-to-l from-emerald-500 to-teal-400"}`}
                        style={{
                          width: `${selectedLine.monthlyLimit > 0 ? Math.min(100, Math.max(0, (selectedLine.monthlyRemaining / selectedLine.monthlyLimit) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-muted/20 p-4">
                <div className="flex items-center gap-2 font-extrabold">
                  <CircleAlert size={17} className="text-amber-600" /> مستني
                  اختيار الخط
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  اضغط على «تحويل» أو «استلام» أو زر اختيار الخط لفتح نافذة
                  الخطوط.
                </p>
              </div>
            )}
            <div className="rounded-xl border bg-muted/30 p-4 text-xs leading-6 text-muted-foreground">
              <div className="mb-1 flex items-center gap-2 font-extrabold text-foreground">
                <ShieldCheck size={16} /> حماية العملية
              </div>
              النظام بيراجع الرصيد والليميت من قاعدة البيانات قبل الحفظ، وبيمنع
              العملية لو الحد اليومي أو الشهري مش كافي.
            </div>
          </aside>
          {!operationDialogOpen ? (
            <div className="order-1 space-y-4 xl:order-2">
              <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-lg sm:p-6">
                <div className="absolute -left-12 -top-12 h-40 w-40 rounded-full bg-violet-400/10 blur-2xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-300">
                      مركز التشغيل
                    </p>
                    <h2 className="mt-1 text-xl font-black">
                      تنفيذ عملية جديدة
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      افتح نافذة مستقلة للتحويل أو الاستلام، واختار الخط وراجع
                      العمولة قبل التأكيد.
                    </p>
                  </div>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10">
                    <ArrowLeftRight size={22} />
                  </span>
                </div>
                <div className="relative mt-5 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-300">
                      الخدمة المحددة حاليًا
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${service === "wallet" ? "bg-emerald-400/15 text-emerald-200" : "bg-violet-400/15 text-violet-200"}`}
                    >
                      {service === "wallet" ? (
                        <Wallet size={14} />
                      ) : (
                        <Landmark size={14} />
                      )}
                      {service === "wallet" ? "محفظة إلكترونية" : "إنستا باي"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-white">
                    {selectedLine
                      ? `آخر خط مختار: ${selectedLine.phone}`
                      : "اختيار الخط هيكون من داخل النافذة"}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    تقدر تقفل النافذة وترجع للصفحة من غير ما الفورم يفضل واخد
                    مساحة.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOperationDialogOpen(true)}
                  className="relative mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 text-sm font-black text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                  <ArrowLeftRight size={19} /> فتح نافذة التحويل والاستلام{" "}
                  <ChevronLeft size={17} />
                </button>
              </div>
              <div className="flex items-start gap-3 rounded-xl border bg-card p-4 text-xs leading-6 text-muted-foreground">
                <ShieldCheck
                  size={19}
                  className="mt-0.5 shrink-0 text-emerald-600"
                />
                <p>
                  تفاصيل العملية هتظهر عند الطلب فقط. النظام بيراجع الرصيد
                  والليميت، وبيحسب الربح للعمليات مع العملاء فقط؛ التحويل
                  الداخلي بين خطوط المحل ربحه صفر.
                </p>
              </div>
            </div>
          ) : (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-5"
              onClick={(event) => {
                if (event.target === event.currentTarget && !saving) {
                  setOperationDialogOpen(false);
                  setLinePickerTarget(null);
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="operation-dialog-title"
                className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/20 bg-background p-3 shadow-2xl sm:p-5"
              >
                <div className="mb-4 flex items-center justify-between gap-3 border-b pb-4">
                  <div className="min-w-0">
                    <h2
                      id="operation-dialog-title"
                      className="text-lg font-black sm:text-xl"
                    >
                      تنفيذ عملية جديدة
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {operationType === "transfer"
                        ? "تحويل مبلغ"
                        : "استلام مبلغ"}{" "}
                      · {service === "wallet" ? "محفظة إلكترونية" : "إنستا باي"}{" "}
                      — راجع التفاصيل قبل التأكيد.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!saving) {
                        setOperationDialogOpen(false);
                        setLinePickerTarget(null);
                      }
                    }}
                    disabled={saving}
                    aria-label="إغلاق نافذة العملية"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-card transition hover:bg-muted disabled:opacity-50"
                  >
                    <X size={19} />
                  </button>
                </div>
                <div className="space-y-5">
                  <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
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

                    <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setOperationType("transfer");
                          setDestinationMode("customer");
                          setDestinationLineId("");
                          setLinePickerTarget("source");
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
                          setLinePickerTarget("source");
                        }}
                        className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-extrabold transition ${operationType === "withdrawal" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background"}`}
                      >
                        <ArrowDownLeft size={17} /> استلام
                      </button>
                    </div>

                    <form onSubmit={submitOperation} className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-sm font-bold">
                          خط المحل اللي هتتنفذ منه العملية
                        </label>
                        <button
                          type="button"
                          onClick={() => setLinePickerTarget("source")}
                          className={`group flex w-full items-center gap-3 rounded-2xl border p-3.5 text-right transition hover:-translate-y-0.5 hover:shadow-md ${selectedLine ? lineTint(selectedLine) : "border-dashed bg-muted/20 hover:border-primary/50"}`}
                        >
                          <span
                            className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl shadow-sm ${selectedLine?.supportsWallet && selectedLine?.supportsInstapay ? "bg-gradient-to-br from-emerald-100 to-violet-100 text-slate-700" : service === "wallet" ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800"}`}
                          >
                            {selectedLine?.supportsWallet &&
                            selectedLine?.supportsInstapay ? (
                              <ArrowLeftRight size={21} />
                            ) : service === "wallet" ? (
                              <Wallet size={21} />
                            ) : (
                              <Landmark size={21} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-semibold text-muted-foreground">
                              {selectedLine
                                ? "الخط المحدد — اضغط للتغيير"
                                : "لسه ما اخترتش خط"}
                            </span>
                            <span className="mt-1 block truncate text-base font-black tabular-nums">
                              {selectedLine
                                ? selectedLine.phone
                                : "اختار خط المحل"}
                            </span>
                            <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {selectedLine
                                ? `${selectedLine.ownerName || "بدون اسم"} · ${service === "wallet" ? "رصيد المحفظة" : "رصيد إنستا باي"} ${asMoney(selectedServiceBalance)}`
                                : "هتظهر الخطوط المناسبة للخدمة في نافذة اختيار"}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-xl bg-background/80 px-3 py-2 text-xs font-extrabold text-foreground shadow-sm">
                            اختيار خط
                          </span>
                        </button>
                        {selectedLine && (
                          <div className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-3">
                            <MiniValue
                              label="رصيد الخط"
                              value={asMoney(selectedServiceBalance)}
                            />
                            <MiniValue
                              label="المتاح اليوم"
                              value={asMoney(selectedLine.dailyRemaining)}
                              warn={selectedLine.dailyRemaining <= 0}
                            />
                            <MiniValue
                              label="المتاح الشهر"
                              value={asMoney(selectedLine.monthlyRemaining)}
                              warn={selectedLine.monthlyRemaining <= 0}
                            />
                          </div>
                        )}
                        {selectedLine && (
                          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs sm:text-sm">
                            <span className="rounded-lg bg-white px-2.5 py-1.5 font-bold shadow-sm">
                              {operationType === "transfer"
                                ? `من: ${selectedLine.phone}`
                                : `من: ${recipientPhone.trim() || "العميل"}`}
                            </span>
                            <ArrowLeftRight
                              size={16}
                              className="text-slate-500"
                            />
                            <span className="rounded-lg bg-white px-2.5 py-1.5 font-bold shadow-sm">
                              {operationType === "withdrawal"
                                ? `إلى: ${selectedLine.phone}`
                                : destinationMode === "self" &&
                                    selectedDestination
                                  ? `إلى: ${selectedDestination.phone}`
                                  : `إلى: ${recipientPhone.trim() || "رقم العميل"}`}
                            </span>
                            <span className="mr-auto rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-extrabold text-primary">
                              معاينة المسار
                            </span>
                          </div>
                        )}
                      </div>
                      {operationType === "transfer" && (
                        <div className="space-y-2">
                          <label className="text-sm font-bold">
                            هتحوّل لمين؟
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <DestinationButton
                              active={destinationMode === "customer"}
                              onClick={() => {
                                setDestinationMode("customer");
                                setDestinationLineId("");
                              }}
                              icon={<Smartphone size={18} />}
                              title="عميل"
                              detail="رقم خارج المحل"
                            />
                            <DestinationButton
                              active={destinationMode === "self"}
                              onClick={() => {
                                setDestinationMode("self");
                                setDestinationLineId("");
                                setLinePickerTarget(
                                  selectedLine ? "destination" : "source",
                                );
                              }}
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
                              onChange={(e) =>
                                setRecipientPhone(e.target.value)
                              }
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
                          <button
                            type="button"
                            disabled={!destinationCandidates.length}
                            onClick={() => setLinePickerTarget("destination")}
                            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-right transition hover:border-primary/50 hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50 ${selectedDestination ? lineTint(selectedDestination) : "bg-background"}`}
                          >
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-100 to-indigo-100 text-indigo-700">
                              <Landmark size={19} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-extrabold">
                                {selectedDestination
                                  ? selectedDestination.phone
                                  : "اختار خط الاستقبال"}
                              </span>
                              <span className="mt-1 block truncate text-xs text-muted-foreground">
                                {selectedDestination
                                  ? `${selectedDestination.ownerName || "بدون اسم"} · رصيد الخدمة ${asMoney(selectedDestinationServiceBalance)}`
                                  : "حدد الخط اللي هيستقبل المبلغ"}
                              </span>
                            </span>
                            <span className="rounded-lg bg-background px-3 py-2 text-xs font-bold">
                              اختيار
                            </span>
                          </button>
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
                                عند تفعيله، النظام يستخدم العمولة الخاصة بالخدمة
                                دي بدل عمولة تحويل إنستا باي العادية.
                              </span>
                            </span>
                          </label>
                        )}

                      <div
                        className={`grid gap-3 ${isInternalTransfer ? "grid-cols-1" : "sm:grid-cols-2"}`}
                      >
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
                        {!isInternalTransfer && (
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
                        )}
                      </div>

                      {isInternalTransfer ? (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
                          <div className="flex items-start gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-sky-700 shadow-sm">
                              <ArrowLeftRight size={20} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-extrabold">
                                تحويل داخلي بين خطوط المحل
                              </h3>
                              <p className="mt-1 text-sm leading-6">
                                العملية دي مجرد نقل رصيد بين خطين تابعين للمحل؛
                                لذلك مش هيتحسب عليها عمولة أو تكلفة أو ربح،
                                والربح المسجّل للعملية هيكون صفر.
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2 text-xs font-extrabold">
                                <span className="rounded-lg bg-white px-3 py-2">
                                  العمولة: 0 ج.م
                                </span>
                                <span className="rounded-lg bg-white px-3 py-2">
                                  صافي الربح: 0 ج.م
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border bg-muted/30 p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <span className="text-sm text-muted-foreground">
                              عمولة العملية{" "}
                              {currentFee.unit === "percent"
                                ? `(${currentCommission}%)`
                                : "(مبلغ ثابت)"}
                            </span>
                            <span className="font-extrabold tabular-nums">
                              {asMoney(commissionAmount)}
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
                            <span className="font-extrabold">
                              صافي الربح المتوقع
                            </span>
                            <span
                              className={`text-xl font-black tabular-nums ${estimatedProfit < 0 ? "text-rose-700" : "text-emerald-700"}`}
                            >
                              {asMoney(estimatedProfit)}
                            </span>
                          </div>
                          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                            {currentFee.unit === "percent"
                              ? `العمولة محسوبة بنسبة ${currentCommission}% من مبلغ العملية.`
                              : "العمولة مبلغ ثابت بالجنيه حسب إعدادات المحل."}{" "}
                            التكلفة تُحفظ مع العملية، وصافي الربح = العمولة −
                            التكلفة.
                          </p>
                        </div>
                      )}

                      {selectedLine &&
                        (selectedLine.dailyRemaining <= 0 ||
                          selectedLine.monthlyRemaining <= 0 ||
                          (numericAmount > 0 &&
                            (numericAmount > selectedLine.dailyRemaining ||
                              numericAmount >
                                selectedLine.monthlyRemaining))) && (
                          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800">
                            <CircleAlert
                              size={18}
                              className="mt-0.5 shrink-0"
                            />
                            <span>
                              المبلغ أكبر من الليميت المتبقي للخط. مش هيتسمح
                              بتنفيذ العملية حتى تختار خطًا مناسبًا أو يتجدد
                              الليميت.
                            </span>
                          </div>
                        )}
                      {selectedLine &&
                        operationType === "transfer" &&
                        numericAmount > selectedServiceBalance && (
                          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            <CircleAlert size={18} className="shrink-0" />
                            رصيد الخط أقل من المبلغ المطلوب.
                          </div>
                        )}
                      {limitWarning === "near" && (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          <CircleAlert size={18} className="shrink-0" />
                          الليميت قرب يخلص على الخط المحدد؛ راجع المتبقي قبل
                          التنفيذ.
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
                            (!isInternalTransfer && !transferCost) ||
                            (operationType === "transfer" &&
                              numericAmount > selectedServiceBalance) ||
                            numericAmount >
                              (selectedLine?.dailyRemaining ?? 0) ||
                            numericAmount >
                              (selectedLine?.monthlyRemaining ?? 0) ||
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
                              : "تأكيد الاستلام"}
                        </button>
                      </div>
                    </form>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border bg-card p-4 text-xs leading-5 text-muted-foreground">
                    <ShieldCheck
                      size={19}
                      className="shrink-0 text-emerald-600"
                    />
                    <p>
                      الحفظ وتحديث الرصيد والليميت والسجل بيتموا مع بعض في قاعدة
                      البيانات. التحويل بين خطوط المحل بيتسجل من غير عمولة أو
                      ربح.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
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
              {lineDraft.supportsWallet && (
                <Field
                  label="الرصيد الحالي للمحفظة"
                  required
                  hint="رصيد المحفظة فقط"
                >
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={lineDraft.walletBalance}
                    onChange={(e) =>
                      setLineDraft((old) => {
                        const walletBalance = Number(e.target.value);
                        return {
                          ...old,
                          walletBalance,
                          balance: walletBalance + old.instapayBalance,
                        };
                      })
                    }
                    className={inputClass}
                  />
                </Field>
              )}
              {lineDraft.supportsInstapay && (
                <Field
                  label="رصيد إنستا باي"
                  required
                  hint="الرصيد البنكي المتاح لإنستا باي"
                >
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={lineDraft.instapayBalance}
                    onChange={(e) =>
                      setLineDraft((old) => {
                        const instapayBalance = Number(e.target.value);
                        return {
                          ...old,
                          instapayBalance,
                          balance: old.walletBalance + instapayBalance,
                        };
                      })
                    }
                    className={inputClass}
                  />
                </Field>
              )}
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
                          {line.supportsWallet && (
                            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-950">
                              <span className="text-emerald-800">
                                رصيد{" "}
                                {walletProviders.find(
                                  (provider) =>
                                    provider.key === line.walletType,
                                )?.short || "المحفظة"}
                              </span>
                              <p className="mt-1 font-extrabold tabular-nums">
                                {asMoney(line.walletBalance)}
                              </p>
                            </div>
                          )}
                          {line.supportsInstapay && (
                            <div className="rounded-lg bg-violet-50 p-2 text-violet-950">
                              <span className="text-violet-800">
                                رصيد إنستا باي
                              </span>
                              <p className="mt-1 font-extrabold tabular-nums">
                                {asMoney(line.instapayBalance)}
                              </p>
                            </div>
                          )}
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
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 self-end sm:self-start">
                        <button
                          type="button"
                          onClick={() => setBalanceDetailsLineId(line.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-background px-3 py-2 text-xs font-bold text-violet-800 hover:bg-violet-50"
                        >
                          <Eye size={14} /> تفاصيل الأرصدة
                        </button>
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
              label="استلام من المحفظة الإلكترونية"
              setting={fees.wallet_withdrawal ?? ZERO_FEE}
              onChange={(setting) =>
                setFees((old) => ({ ...old, wallet_withdrawal: setting }))
              }
              icon={<Wallet size={18} />}
              tone="green"
            />
            <FeeField
              label="تحويل من المحفظة الإلكترونية"
              setting={fees.wallet_transfer ?? ZERO_FEE}
              onChange={(setting) =>
                setFees((old) => ({ ...old, wallet_transfer: setting }))
              }
              icon={<ArrowLeftRight size={18} />}
              tone="green"
            />
            <FeeField
              label="استلام من إنستا باي"
              setting={fees.instapay_withdrawal ?? ZERO_FEE}
              onChange={(setting) =>
                setFees((old) => ({ ...old, instapay_withdrawal: setting }))
              }
              icon={<Landmark size={18} />}
              tone="violet"
            />
            <FeeField
              label="تحويل من إنستا باي"
              setting={fees.instapay_transfer ?? ZERO_FEE}
              onChange={(setting) =>
                setFees((old) => ({ ...old, instapay_transfer: setting }))
              }
              icon={<ArrowLeftRight size={18} />}
              tone="violet"
            />
            <FeeField
              label="تحويل من إنستا باي لفودافون كاش"
              setting={fees.instapay_vodafone_transfer ?? ZERO_FEE}
              onChange={(setting) =>
                setFees((old) => ({
                  ...old,
                  instapay_vodafone_transfer: setting,
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
      <LinePickerDialog
        target={linePickerTarget}
        lines={
          linePickerTarget === "destination"
            ? destinationCandidates
            : sourceCandidates
        }
        service={service}
        operationType={operationType}
        selectedId={
          linePickerTarget === "destination" ? destinationLineId : sourceLineId
        }
        onClose={() => setLinePickerTarget(null)}
        onSelect={(line) => {
          if (linePickerTarget === "destination") setDestinationLineId(line.id);
          else setSourceLineId(line.id);
          setLinePickerTarget(null);
        }}
      />
      <LineBalanceDetailsDialog
        line={balanceDetailsLine}
        onClose={() => setBalanceDetailsLineId(null)}
      />
    </main>
  );
}

function LineBalanceDetailsDialog({
  line,
  onClose,
}: {
  line: TransferLineRecord | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!line) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [line, onClose]);
  if (!line) return null;
  const walletLabel =
    walletProviders.find((provider) => provider.key === line.walletType)
      ?.label ||
    line.walletType.replaceAll("_", " ") ||
    "المحفظة";
  const total =
    (line.supportsWallet ? line.walletBalance : 0) +
    (line.supportsInstapay ? line.instapayBalance : 0);
  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="line-balances-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-3xl border bg-background shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 bg-gradient-to-l from-slate-950 via-slate-900 to-indigo-950 p-5 text-white">
          <div>
            <p className="text-xs text-slate-300">تفاصيل رصيد الخط</p>
            <h2
              id="line-balances-title"
              className="mt-1 text-xl font-black tabular-nums"
            >
              {line.phone}
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              {line.ownerName || "بدون اسم مالك"}
            </p>
          </div>
          <button
            type="button"
            aria-label="إغلاق"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/10 hover:bg-white/20"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 p-4 sm:p-5">
          {line.supportsWallet && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-emerald-800">
                <Wallet size={21} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-emerald-950">
                  {walletLabel}
                </p>
                <p className="mt-1 text-[11px] text-emerald-800">
                  رصيد المحفظة الإلكترونية
                </p>
              </div>
              <strong className="text-lg font-black tabular-nums text-emerald-950">
                {asMoney(line.walletBalance)}
              </strong>
            </div>
          )}
          {line.supportsInstapay && (
            <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-violet-800">
                <Landmark size={21} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-violet-950">
                  إنستا باي
                </p>
                <p className="mt-1 text-[11px] text-violet-800">
                  {line.bankName || "البنك غير محدد"}
                  {line.lastFour ? ` · آخر 4 أرقام ${line.lastFour}` : ""}
                </p>
              </div>
              <strong className="text-lg font-black tabular-nums text-violet-950">
                {asMoney(line.instapayBalance)}
              </strong>
            </div>
          )}
          <div className="flex items-center justify-between rounded-2xl border bg-muted/40 p-4">
            <span className="text-sm font-bold">
              إجمالي أرصدة الخدمات المسجلة
            </span>
            <strong className="text-xl font-black tabular-nums">
              {asMoney(total)}
            </strong>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border p-3">
              <p className="text-[11px] text-muted-foreground">
                الليميت اليومي المتبقي
              </p>
              <p className="mt-1 font-black tabular-nums">
                {asMoney(line.dailyRemaining)}
              </p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-[11px] text-muted-foreground">
                الليميت الشهري المتبقي
              </p>
              <p className="mt-1 font-black tabular-nums">
                {asMoney(line.monthlyRemaining)}
              </p>
            </div>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">
            رصيد المحفظة ورصيد إنستا باي مستقلان عن بعضهما. أي عملية تخصم من
            رصيد الخدمة المختارة فقط.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground"
          >
            تمام
          </button>
        </div>
      </section>
    </div>
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
  setting,
  onChange,
  icon,
  tone,
}: {
  label: string;
  setting: TransferCommissionValue;
  onChange: (setting: TransferCommissionValue) => void;
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
    <div className="rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-4 flex items-center gap-2.5 text-sm font-extrabold">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toneClass}`}
        >
          {icon}
        </span>
        <span>{label}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_118px] gap-2">
        <label className="min-w-0">
          <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">
            قيمة العمولة
          </span>
          <span className="relative block">
            <input
              type="number"
              min="0"
              max={setting.unit === "percent" ? 100 : undefined}
              step="0.01"
              required
              value={setting.value}
              onChange={(e) =>
                onChange({ ...setting, value: Number(e.target.value) })
              }
              className={`${inputClass} pl-14 text-lg font-black tabular-nums`}
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
              {setting.unit === "percent" ? "%" : "ج.م"}
            </span>
          </span>
        </label>
        <label className="min-w-0">
          <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">
            نوع العمولة
          </span>
          <select
            value={setting.unit}
            onChange={(e) =>
              onChange({
                ...setting,
                unit: e.target.value as TransferCommissionValue["unit"],
              })
            }
            className={`${inputClass} h-[43px] px-2 text-xs font-bold`}
          >
            <option value="egp">جنيه ثابت</option>
            <option value="percent">نسبة مئوية</option>
          </select>
        </label>
      </div>
      <p className="mt-3 rounded-lg bg-muted/50 px-2.5 py-2 text-[11px] leading-5 text-muted-foreground">
        {setting.unit === "percent"
          ? `العمولة = مبلغ العملية × ${setting.value}%`
          : `عمولة ثابتة قدرها ${setting.value.toLocaleString("en-EG")} جنيه لكل عملية`}
      </p>
    </div>
  );
}

function LinePickerDialog({
  target,
  lines,
  service,
  operationType,
  selectedId,
  onClose,
  onSelect,
}: {
  target: LinePickerTarget | null;
  lines: TransferLineRecord[];
  service: TransferService;
  operationType: OperationType;
  selectedId: string;
  onClose: () => void;
  onSelect: (line: TransferLineRecord) => void;
}) {
  const [search, setSearch] = useState("");
  useEffect(() => {
    setSearch("");
  }, [target, service]);
  if (!target) return null;
  const query = search.trim().toLocaleLowerCase("ar-EG");
  const filtered = lines.filter((line) =>
    `${line.phone} ${line.ownerName} ${line.walletType} ${line.bankName}`
      .toLocaleLowerCase("ar-EG")
      .includes(query),
  );
  const title =
    target === "source"
      ? `${service === "wallet" ? "اختار خط المحفظة" : "اختار خط إنستا باي"} ${operationType === "transfer" ? "للتحويل" : "للاستلام"}`
      : "اختار خط الاستقبال";
  const subtitle =
    target === "source"
      ? "اختار الخط اللي هتبدأ منه العملية. تفاصيل الرصيد والليميت ظاهرة على كل كارت."
      : "اختار الخط التاني اللي هيستقبل المبلغ داخل المحل.";
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="line-picker-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-background shadow-2xl"
      >
        <div className="relative overflow-hidden bg-gradient-to-l from-slate-900 via-slate-800 to-indigo-950 p-5 text-white sm:p-6">
          <div className="absolute -left-10 -top-16 h-44 w-44 rounded-full bg-violet-400/10 blur-2xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10">
                <ArrowLeftRight size={23} />
              </span>
              <div>
                <h2
                  id="line-picker-title"
                  className="text-lg font-black sm:text-xl"
                >
                  {title}
                </h2>
                <p className="mt-1 max-w-xl text-xs leading-5 text-slate-200 sm:text-sm">
                  {subtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق نافذة اختيار الخط"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 transition hover:bg-white/20"
            >
              <X size={18} />
            </button>
          </div>
          <div className="relative mt-4">
            <Search
              size={17}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث برقم الخط أو الاسم أو البنك..."
              className="w-full rounded-xl border border-white/15 bg-white/10 py-3 pl-3 pr-10 text-sm text-white outline-none placeholder:text-slate-300 focus:border-white/40 focus:ring-2 focus:ring-white/10"
            />
          </div>
          <div className="relative mt-3 flex items-center justify-between text-xs text-slate-300">
            <span>{filtered.length} خط متاح</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
              {service === "wallet" ? "محافظ إلكترونية" : "إنستا باي"}
            </span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {filtered.length === 0 ? (
            <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed text-center">
              <div>
                <Smartphone
                  size={30}
                  className="mx-auto mb-2 text-muted-foreground"
                />
                <p className="font-extrabold">مفيش خطوط مطابقة</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  جرّب كلمة بحث مختلفة أو أضف خطًا من إدارة الخطوط.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((line) => {
                const both = line.supportsWallet && line.supportsInstapay;
                const selected = selectedId === line.id;
                const tone = both
                  ? "from-emerald-500 via-slate-100 to-violet-500"
                  : line.supportsInstapay
                    ? "from-violet-500 to-indigo-500"
                    : "from-emerald-500 to-teal-400";
                return (
                  <button
                    type="button"
                    key={line.id}
                    onClick={() => onSelect(line)}
                    className={`group relative overflow-hidden rounded-2xl border bg-card p-4 text-right transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${selected ? "border-primary ring-2 ring-primary/20 shadow-md" : "border-border hover:border-primary/50"}`}
                  >
                    <span
                      className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-l ${tone}`}
                    />
                    <div className="flex items-start gap-3">
                      <span
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${both ? "bg-gradient-to-br from-emerald-100 to-violet-100 text-slate-700" : line.supportsInstapay ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}
                      >
                        {both ? (
                          <ArrowLeftRight size={20} />
                        ) : line.supportsInstapay ? (
                          <Landmark size={20} />
                        ) : (
                          <Wallet size={20} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-base font-black tabular-nums">
                            {line.phone}
                          </span>
                          {selected && (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                              محدد
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {line.ownerName || "بدون اسم مالك"}
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {line.supportsWallet && (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">
                              محفظة · {line.walletType.replaceAll("_", " ")}
                            </span>
                          )}
                          {line.supportsInstapay && (
                            <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-800">
                              إنستا باي
                              {line.bankName ? ` · ${line.bankName}` : ""}
                              {line.lastFour ? ` ·••${line.lastFour}` : ""}
                            </span>
                          )}
                        </span>
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3">
                      <div className="rounded-xl bg-muted/60 p-2">
                        <span className="block text-[10px] text-muted-foreground">
                          الرصيد
                        </span>
                        <span className="mt-1 block truncate text-xs font-black tabular-nums">
                          {asMoney(serviceBalance(line, service))}
                        </span>
                      </div>
                      <div className="rounded-xl bg-muted/60 p-2">
                        <span className="block text-[10px] text-muted-foreground">
                          متاح اليوم
                        </span>
                        <span
                          className={`mt-1 block truncate text-xs font-black tabular-nums ${line.dailyRemaining <= 0 ? "text-rose-700" : ""}`}
                        >
                          {asMoney(line.dailyRemaining)}
                        </span>
                      </div>
                      <div className="rounded-xl bg-muted/60 p-2">
                        <span className="block text-[10px] text-muted-foreground">
                          متاح الشهر
                        </span>
                        <span
                          className={`mt-1 block truncate text-xs font-black tabular-nums ${line.monthlyRemaining <= 0 ? "text-rose-700" : ""}`}
                        >
                          {asMoney(line.monthlyRemaining)}
                        </span>
                      </div>
                    </div>
                    {(line.dailyRemaining <= 0 ||
                      line.monthlyRemaining <= 0) && (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-rose-700">
                        <CircleAlert size={13} /> الليميت المتاح انتهى
                      </p>
                    )}
                    <span
                      className={`mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-extrabold transition ${selected ? "bg-primary text-primary-foreground" : "bg-muted/70 text-foreground group-hover:bg-primary/10"}`}
                    >
                      {selected ? (
                        <Check size={15} />
                      ) : (
                        <ArrowLeftRight size={15} />
                      )}
                      {selected
                        ? "الخط المحدد حاليًا"
                        : target === "source"
                          ? "استخدام هذا الخط"
                          : "اختيار خط الاستقبال"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3 sm:px-5">
          <p className="text-[11px] leading-5 text-muted-foreground">
            اختيار الخط لا ينفذ العملية؛ العملية تتسجل بعد مراجعة المبلغ والضغط
            على التأكيد.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border bg-background px-4 py-2 text-xs font-bold hover:bg-muted"
          >
            إلغاء
          </button>
        </div>
      </section>
    </div>
  );
}

const inputClass =
  "w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15";
