/* eslint-disable prettier/prettier */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  KeyRound,
  LockKeyhole,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  api,
  ApiError,
  type EmployeeRecord,
  type EmployeeSession,
} from "../lib/api-client";

type Props = { children: ReactNode };

// The signed session token is persisted locally so a page/app restart does not require a new PIN.
// The backend remains authoritative: every restoration is verified against the API, which also
// reloads the employee's current active status and role from PostgreSQL.
const EMPLOYEE_SESSION_STORAGE_KEY = "bmo-mobile.employee-session.v1";
let activeEmployeeSession: EmployeeSession | null = null;
const sessionListeners = new Set<() => void>();

function clearStoredEmployeeSession() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
    }
  } catch {
    // Keep the in-memory lock usable if browser storage is unavailable.
  }
}

function saveStoredEmployeeSession(session: EmployeeSession) {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        EMPLOYEE_SESSION_STORAGE_KEY,
        JSON.stringify(session),
      );
    }
  } catch {
    // Login still works for this tab even when browser storage is disabled.
  }
}

function readStoredEmployeeSession(): EmployeeSession | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(EMPLOYEE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<EmployeeSession>;
    const employee = value.employee as Partial<EmployeeRecord> | undefined;
    if (
      typeof value.token !== "string" ||
      !value.token.includes(".") ||
      typeof value.expiresAt !== "number" ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= Date.now() ||
      !employee ||
      typeof employee.id !== "string" ||
      typeof employee.name !== "string"
    ) {
      clearStoredEmployeeSession();
      return null;
    }
    return value as EmployeeSession;
  } catch {
    clearStoredEmployeeSession();
    return null;
  }
}

function publishSession(session: EmployeeSession | null) {
  activeEmployeeSession = session;
  sessionListeners.forEach((listener) => listener());
}

export function useEmployeeAuth() {
  const [session, setSessionState] = useState<EmployeeSession | null>(
    activeEmployeeSession,
  );
  useEffect(() => {
    const sync = () => setSessionState(activeEmployeeSession);
    sessionListeners.add(sync);
    sync();
    return () => {
      sessionListeners.delete(sync);
    };
  }, []);
  const setSession = useCallback(
    (next: EmployeeSession | null) => publishSession(next),
    [],
  );
  const lockSystem = useCallback(() => {
    api.clearEmployeeSessionAuthorization();
    clearStoredEmployeeSession();
    publishSession(null);
  }, []);
  return {
    session,
    employee: session?.employee ?? null,
    setSession,
    lockSystem,
  };
}

const roleLabel = (role: EmployeeRecord["role"]) =>
  ({
    worker: "موظف",
    accountant: "محاسب",
    manager: "مدير",
    owner: "مالك",
    developer: "مبرمج",
  })[role] ?? "موظف";

function normalized(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ar-EG")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim();
}

export default function EmployeeAuthGate({ children }: Props) {
  const { session, setSession, lockSystem } = useEmployeeAuth();
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] =
    useState<EmployeeRecord | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [restoringSession, setRestoringSession] = useState(true);
  const [restoreError, setRestoreError] = useState("");

  const filteredEmployees = useMemo(() => {
    const query = normalized(nameQuery);
    return employees.filter(
      (employee) => !query || normalized(employee.name).includes(query),
    );
  }, [employees, nameQuery]);

  const loadEmployees = useCallback(async () => {
    setDirectoryLoading(true);
    setDirectoryError("");
    try {
      const rows = await api.getEmployeeDirectory();
      setEmployees(rows.filter((row) => row.isActive));
    } catch (error) {
      setDirectoryError(
        error instanceof Error ? error.message : "تعذر تحميل أسماء الموظفين.",
      );
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const restoreSavedSession = useCallback(async () => {
    setRestoringSession(true);
    setRestoreError("");
    try {
      const saved = readStoredEmployeeSession();
      if (!saved) {
        api.clearEmployeeSessionAuthorization();
        setSession(null);
        return;
      }

      api.setEmployeeSessionAuthorization(saved.token);
      try {
        const verified = await api.getCurrentEmployeeSession();
        const restored: EmployeeSession = {
          token: saved.token,
          expiresAt: verified.expiresAt,
          employee: verified.employee,
        };
        saveStoredEmployeeSession(restored);
        setSession(restored);
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.status === 0 || error.status >= 500)
        ) {
          // The backend may still be starting. Keep the saved token and let the user retry.
          setSession(null);
          setRestoreError(
            "تعذر الاتصال بالخادم للتحقق من جلسة الدخول. تأكد أن الباك إند يعمل ثم اضغط إعادة المحاولة. تم الاحتفاظ بالجلسة المحفوظة.",
          );
          return;
        }
        api.clearEmployeeSessionAuthorization();
        clearStoredEmployeeSession();
        setSession(null);
      }
    } finally {
      setRestoringSession(false);
    }
  }, [setSession]);

  useEffect(() => {
    const expire = () => {
      api.clearEmployeeSessionAuthorization();
      clearStoredEmployeeSession();
      publishSession(null);
      setPin("");
      setLoginError("انتهت جلسة الموظف. سجّل الدخول مرة أخرى.");
      setRestoreError("");
      setRestoringSession(false);
    };
    window.addEventListener("mobile-system-auth-expired", expire);
    return () =>
      window.removeEventListener("mobile-system-auth-expired", expire);
  }, []);

  useEffect(() => {
    void restoreSavedSession();
  }, [restoreSavedSession]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== EMPLOYEE_SESSION_STORAGE_KEY) return;
      if (!event.newValue) {
        api.clearEmployeeSessionAuthorization();
        publishSession(null);
        setPin("");
        setLoginError("تم قفل جلسة الدخول في نافذة أخرى.");
        setRestoreError("");
        setRestoringSession(false);
        return;
      }
      void restoreSavedSession();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [restoreSavedSession]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!selectedEmployee) {
      setLoginError("اكتب اسم الموظف واختاره من نتائج البحث.");
      return;
    }
    if (!/^\d{4,12}$/.test(pin)) {
      setLoginError("الرقم السري لازم يكون من 4 إلى 12 رقمًا.");
      return;
    }
    setSubmitting(true);
    setLoginError("");
    try {
      const next = await api.authenticateEmployee({
        employeeId: selectedEmployee.id,
        name: selectedEmployee.name,
        pin,
      });
      saveStoredEmployeeSession(next);
      setSession(next);
      setPin("");
    } catch (error) {
      setPin("");
      setLoginError(
        error instanceof Error ? error.message : "تعذر تسجيل الدخول.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (restoringSession) {
    return (
      <main
        dir="rtl"
        lang="ar"
        className="fixed inset-0 z-[10000] flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-white"
      >
        <section className="w-full max-w-md rounded-[2rem] border border-white/20 bg-white p-8 text-center text-slate-950 shadow-2xl">
          <span className="mx-auto mb-4 block h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-800" />
          <h1 className="text-xl font-black">جارٍ التحقق من جلسة الدخول</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            بنراجع صلاحية جلسة الموظف قبل فتح النظام.
          </p>
        </section>
      </main>
    );
  }

  if (restoreError) {
    return (
      <main
        dir="rtl"
        lang="ar"
        className="fixed inset-0 z-[10000] flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-slate-950"
      >
        <section className="w-full max-w-md rounded-[2rem] border border-white/20 bg-white p-6 text-center shadow-2xl sm:p-8">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-900">
            <LockKeyhole size={26} />
          </span>
          <h1 className="text-xl font-black">تعذر استعادة جلسة الدخول</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-slate-600">
            {restoreError}
          </p>
          <button
            type="button"
            onClick={() => void restoreSavedSession()}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 font-extrabold text-white shadow-lg transition hover:bg-emerald-900"
          >
            إعادة المحاولة
          </button>
        </section>
      </main>
    );
  }

  if (session) {
    return (
      <>
        {children}
        {/* <div
          dir="rtl"
          className="fixed bottom-3 left-3 z-[9000] flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-2xl border bg-background/95 px-3 py-2 shadow-xl backdrop-blur"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck size={17} />
          </span>
          <span className="min-w-0">
            <span className="block max-w-[150px] truncate text-xs font-extrabold">
              {session.employee.name}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              جلسة دخول نشطة
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "هتقفل النظام وتحتاج الرقم السري للدخول مرة أخرى. الشيفت المفتوح سيظل محفوظًا.",
                )
              )
                lockSystem();
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition hover:bg-muted"
          >
            <LockKeyhole size={14} /> قفل النظام
          </button>
        </div> */}
      </>
    );
  }

  return (
    <main
      dir="rtl"
      lang="ar"
      className="fixed inset-0 z-[10000] flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950 px-4 py-8 text-slate-950"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />
      </div>
      <section className="relative w-full max-w-md rounded-[2rem] border border-white/20 bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-900">
            <LockKeyhole size={26} />
          </span>
          <div>
            <p className="text-xs font-black tracking-wide text-emerald-800">
              BMO MOBILE SYSTEM
            </p>
            <h1 className="mt-1 text-2xl font-black">تسجيل دخول الموظف</h1>
            <p className="mt-1 text-sm text-slate-600">
              اكتب اسمك وابحث عنه، ثم أدخل الرقم السري لفتح النظام.
            </p>
          </div>
        </div>
        <form onSubmit={submitLogin} className="space-y-4">
          <div className="relative">
            <label
              htmlFor="employee-name-search"
              className="mb-1.5 block text-sm font-bold"
            >
              اسم الموظف
            </label>
            <div className="relative">
              <Search
                size={17}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="employee-name-search"
                value={nameQuery}
                onFocus={() => setResultsOpen(true)}
                onChange={(event) => {
                  setNameQuery(event.target.value);
                  setSelectedEmployee(null);
                  setResultsOpen(true);
                  setLoginError("");
                }}
                disabled={directoryLoading}
                autoComplete="off"
                placeholder={
                  directoryLoading
                    ? "جاري تحميل الموظفين..."
                    : "اكتب اسم الموظف للبحث"
                }
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pr-10 pl-3 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                aria-expanded={resultsOpen}
                aria-controls="employee-search-results"
              />
            </div>
            {resultsOpen && nameQuery.trim() && !selectedEmployee && (
              <div
                id="employee-search-results"
                className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
              >
                {filteredEmployees.slice(0, 30).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setSelectedEmployee(row);
                      setNameQuery(row.name);
                      setResultsOpen(false);
                      setLoginError("");
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-right transition hover:bg-emerald-50 focus:bg-emerald-50"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
                      <UserRound size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {row.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {roleLabel(row.role)}
                      </span>
                    </span>
                  </button>
                ))}
                {!filteredEmployees.length && (
                  <p className="p-3 text-sm text-slate-500">
                    مفيش موظف بالاسم ده.
                  </p>
                )}
              </div>
            )}
            {selectedEmployee && (
              <p className="mt-2 flex items-center gap-2 text-xs font-bold text-emerald-800">
                <UserRound size={14} /> تم اختيار {selectedEmployee.name} ·{" "}
                {roleLabel(selectedEmployee.role)}{" "}
                <button
                  type="button"
                  className="mr-auto underline"
                  onClick={() => {
                    setSelectedEmployee(null);
                    setNameQuery("");
                    setResultsOpen(true);
                  }}
                >
                  تغيير
                </button>
              </p>
            )}
            {directoryError && (
              <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs leading-5 text-rose-800">
                {directoryError}{" "}
                <button
                  type="button"
                  onClick={() => void loadEmployees()}
                  className="font-bold underline"
                >
                  إعادة المحاولة
                </button>
              </div>
            )}
          </div>
          <div>
            <label
              htmlFor="employee-login-pin"
              className="mb-1.5 block text-sm font-bold"
            >
              الرقم السري
            </label>
            <div className="relative">
              <KeyRound
                size={17}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="employee-login-pin"
                type="password"
                value={pin}
                onChange={(event) => {
                  setPin(event.target.value);
                  setLoginError("");
                }}
                autoComplete="current-password"
                inputMode="numeric"
                maxLength={12}
                placeholder="••••••"
                dir="ltr"
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pr-10 pl-3 text-left tracking-[0.3em] outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
              />
            </div>
          </div>
          {loginError && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900"
            >
              {loginError}
            </p>
          )}
          <button
            type="submit"
            disabled={
              submitting ||
              directoryLoading ||
              !employees.length ||
              !selectedEmployee ||
              !pin
            }
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 font-extrabold text-white shadow-lg transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <LockKeyhole size={18} />
            )}{" "}
            {submitting ? "جارٍ التحقق..." : "فتح النظام"}
          </button>
          <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" /> يتم حفظ جلسة
            موقعة على هذا الجهاز لفترة محددة، ويُعاد التحقق منها مع الخادم عند
            فتح النظام.
          </p>
        </form>
      </section>
    </main>
  );
}
