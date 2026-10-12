// Global numeric helpers used across UI, PDFs and Excel exports.
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
