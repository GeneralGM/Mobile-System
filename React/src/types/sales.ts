/* eslint-disable prettier/prettier */

import type { Device } from "./device";

export type Method = "cash" | "credit" | "installment";

export type CartItem = {
  deviceId: Device["id"];
  imei: Device["imei"];
  brand: Device["brand"];
  series: Device["series"];
  model: Device["model"];
  color: string;
  ram: string;
  storage: string;
  originalPrice: number;
  cashPrice: number;
  installmentPrice: number;
  cashFinalPrice: number;
  installmentFinalPrice: number;
  finalPrice: number;
  offerName: string;
  // Optional reference to the original warehouse shipment.
  warehouseBatchId?: string;
  unitCost?: number;
  // New device records are created only when the sale is confirmed.
  isNewStock?: boolean;
};

export type Installment = {
  number: number;
  amount: number;
  dueDate: string;
  paid: boolean;
};

export type Sale = {
  id: string;
  invoiceNumber: string;
  createdAt: number;
  items: CartItem[];
  customerName: string;
  customerPhone: string;
  paymentMethod: Method;
  total: number;
  amountPaid: number;
  remainingAmount: number;
  installmentsCount: number;
  installments: Installment[];
  notes: string;
  status: "paid" | "partial" | "unpaid";
};
