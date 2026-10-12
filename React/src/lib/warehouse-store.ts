/* eslint-disable prettier/prettier */

import type { WarehouseBatch } from "../types/warehouse";

export const WAREHOUSE_KEY = "mobile-system-warehouse-v1";

export function readWarehouse(): WarehouseBatch[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(WAREHOUSE_KEY);

    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);

    return Array.isArray(parsed)
      ? (parsed as WarehouseBatch[])
      : [];
  } catch {
    return [];
  }
}

export function saveWarehouse(
  batches: WarehouseBatch[],
): void {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    WAREHOUSE_KEY,
    JSON.stringify(batches),
  );
}
