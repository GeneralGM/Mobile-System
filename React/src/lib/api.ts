/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/api.ts
import { getApiUrl } from "@/api";
const API_URL = getApiUrl();
const BASE_URL = `http://${API_URL}:5000/api`; // اكتب الـ IP بتاعك هنا وبورت السيرفر
export async function fetchEmployees() {
  const res = await fetch(`${BASE_URL}/employees`);
  if (!res.ok) throw new Error("فشل جلب الموظفين");
  return res.json();
}

export async function addEmployeeToDB(employee: any) {
  const res = await fetch(`${BASE_URL}/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(employee),
  });
  return res.json();
}

// جلب الفواتير
export async function fetchInvoices() {
  const res = await fetch(`${BASE_URL}/invoices`);
  if (!res.ok) throw new Error("فشل جلب الفواتير");
  return res.json();
}

// حفظ فاتورة مع معالجة الأخطاء الحقيقية
export async function addInvoiceToDB(invoice: any) {
  const res = await fetch(`${BASE_URL}/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invoice),
  });

  // لو السيرفر رجع خطأ (مثل 500 أو 400) ارمي خطأ حقيقي للـ Store
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      errorData.error || errorData.details || "فشل حفظ الفاتورة بالسيرفر",
    );
  }

  return res.json();
}

// حفظ أو إغلاق شيفت
export async function saveShiftToDB(shift: any) {
  const res = await fetch(`${BASE_URL}/shifts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shift),
  });
  return res.json();
}
