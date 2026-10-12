/* eslint-disable prettier/prettier */

export type WarehouseBatch = {
  id: string;
  brand: string;
  series: string;
  model: string;

  // الكمية المستلمة في الدفعة
  receivedQuantity: number;

  // الكمية الحالية المتاحة
  availableQuantity: number;

  // تكلفة شراء الوحدة
  unitCost: number;

  // سعر البيع بالقطعة؛ اختياري للتوافق مع الدفعات القديمة
  salePrice?: number;

  supplierName: string;
  receivedAt: number;

  // قد تكون بعض الأجهزة فقط مسجلة بـ IMEI
  imeis: string[];
};
