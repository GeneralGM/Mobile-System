/* eslint-disable prettier/prettier */
// src/config.ts

// نضع الـ IP الافتراضي أولاً، ونقرأ hostname فقط إذا كنا في المتصفح
let serverIp =
  typeof window !== "undefined" ? window.location.hostname : "localhost";

// دالة تقرأ ملف config.json قبل أي حاجة
export const loadAppConfig = async () => {
  try {
    const res = await fetch("/config.json?v=" + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data.SERVER_IP) serverIp = data.SERVER_IP;
    }
  } catch (err) {
    console.warn(
      "⚠️ لم يتم العثور على config.json، سيتم استخدام الـ IP الافتراضي",
    );
  }
};

export const getApiUrl = () => {
  return serverIp;
};
