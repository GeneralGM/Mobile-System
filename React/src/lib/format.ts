// Global numeric helpers used across UI, PDFs and Excel exports.
const NUMBER_LOCALE = "en-US";
const LTR_EMBED = "\u2066";
const POP_DIR = "\u2069";

export function round2(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function fmt2(n: number): string {
  return round2(n || 0).toFixed(2);
}

// Strip leading minus & clamp to >= 0
export function clamp0(v: string | number): number {
  if (typeof v === "string") v = parseFloat(v.replace(/^-+/, "")) || 0;
  return Math.max(0, v);
}

// For input onChange: returns the cleaned string (allow decimals, block negatives)
export function cleanNumInput(raw: string): string {
  return raw
    .replace(/^-+/, "")
    .replace(/[^\d.]/g, "")
    .replace(/(\..*?)\./g, "$1");
}

/** Convert Arabic-Indic / Eastern Arabic digits to Western 0-9. */
export function toWesternDigits(input: string): string {
  return String(input ?? "")
    .replace(/[\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0660),
    )
    .replace(/[\u06f0-\u06f9]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    );
}

function isolateLtr(text: string): string {
  return `${LTR_EMBED}${toWesternDigits(text)}${POP_DIR}`;
}

export function formatNumber(
  value: number,
  options?: { minFraction?: number; maxFraction?: number },
): string {
  const n = Number.isFinite(value) ? value : 0;
  const maxFraction = options?.maxFraction ?? 0;
  const minFraction = options?.minFraction ?? 0;
  return isolateLtr(
    new Intl.NumberFormat(NUMBER_LOCALE, {
      useGrouping: true,
      minimumFractionDigits: minFraction,
      maximumFractionDigits: maxFraction,
    }).format(n),
  );
}

/**
 * Currency display: Western digits + "EG" suffix.
 * Whole amounts omit trailing decimals; fractional amounts keep two places.
 */
export function formatMoney(value: number): string {
  const n = round2(Number.isFinite(value) ? value : 0);
  const isWhole = Math.abs(n - Math.round(n)) < 0.005;
  const amount = new Intl.NumberFormat(NUMBER_LOCALE, {
    useGrouping: true,
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
  return isolateLtr(`${amount} EG`);
}

function asDate(value: string | number | Date | null | undefined): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const asNumber = Number(raw);
  if (raw !== "" && Number.isFinite(asNumber) && /^\d+$/.test(raw)) {
    const parsed = new Date(asNumber);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(
  value: string | number | Date | null | undefined,
): string {
  const parsed = asDate(value);
  if (!parsed) return "—";
  return isolateLtr(
    new Intl.DateTimeFormat(NUMBER_LOCALE, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(parsed),
  );
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
): string {
  const parsed = asDate(value);
  if (!parsed) return "—";
  return isolateLtr(
    new Intl.DateTimeFormat(NUMBER_LOCALE, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed),
  );
}

export function formatPhone(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  return text ? isolateLtr(text) : "—";
}

export function formatId(value: string | number | null | undefined): string {
  const text = String(value ?? "").trim();
  return text ? isolateLtr(text) : "—";
}
