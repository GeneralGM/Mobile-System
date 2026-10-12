/* eslint-disable prettier/prettier */
export function compactNumber(value: number): string {
  const n = Number(value) || 0;
  const abs = Math.abs(n);

  if (abs >= 1_000_000) {
    // بيقسم على مليون وبيحتفظ بـ 3 أرقام عشرية كحد أقصى بدون أصفار زائدة
    return `${Number((n / 1_000_000).toFixed(3))}M`;
  }

  if (Number.isInteger(n)) {
    return String(n);
  }

  // للأرقام العادية اللي فيها كسور
  return String(Number(n.toFixed(2)));
}