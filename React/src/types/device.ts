/* eslint-disable prettier/prettier */

export type DeviceStatus = "available" | "sold" | "reserved";

export type Offer = {
  name: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  durationDays: number;
  expiresAt: number;
};

export type Brand = {
  id: string;
  name: string;
  models: string[];
  series: { name: string; models: string[] }[];
};

export type Device = {
  id: string;
  imei: string;
  brand: string;
  series: string;
  model: string;
  color: string;
  ram: string;
  storage: string;
  salePrice: number;
  installmentPrice: number;
  offer: Offer | null;
  status: DeviceStatus;
  createdAt: number;
  // Optional for backwards compatibility with existing device records.
  warehouseBatchId?: string;
  unitCost?: number;
};

export type DeviceForm = {
  imei: string;
  brand: string;
  series: string;
  model: string;
  color: string;
  ram: string;
  storage: string;
  salePrice: string;
  offerName: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  durationDays: string;
  installmentPrice: string;
};
