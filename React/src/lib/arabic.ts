// Arabic text normalization for smart search
export function normalizeArabic(input: string): string {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // diacritics
    .replace(/[ةه]/g, "ه")
    .replace(/[أإآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ");
}

export function arabicMatch(haystack: string, needle: string): boolean {
  const n = normalizeArabic(needle);
  if (!n) return true;
  return normalizeArabic(haystack).includes(n);
}
