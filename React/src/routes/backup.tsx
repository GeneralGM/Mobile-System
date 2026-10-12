/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import {
  Download,
  RefreshCw,
  Database,
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react";
import { getApiUrl } from "@/api";

const API_URL = getApiUrl();

export const Route = createFileRoute("/backup")({
  component: BackupPage,
});

function BackupPage() {
  const [loadingSave, setLoadingSave] = useState(false);
  const [loadingRestore, setLoadingRestore] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // States للتحكم في المودال والملف المرفوع
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🌟 1. حفظ النسخة الاحتياطية (Download .sql)
  const handleSaveBackup = async () => {
    setLoadingSave(true);
    setStatusMsg(null);
    try {
      const response = await fetch(
        `http://${API_URL}:5000/api/backup/download`,
      );
      if (!response.ok) throw new Error("فشل في تحميل النسخة الاحتياطية");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // تسمية الملف الافتراضية
      a.download = `backup_${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setStatusMsg({
        type: "success",
        text: "تم تحميل النسخة الاحتياطية بنجاح!",
      });
    } catch (error: any) {
      setStatusMsg({
        type: "error",
        text: error.message || "حدث خطأ غير متوقع",
      });
    } finally {
      setLoadingSave(false);
    }
  };

  // 🌟 2. التقاط الملف وفتح المودال التحذيري
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".sql")) {
      setStatusMsg({
        type: "error",
        text: "الرجاء اختيار ملف بصيغة .sql فقط!",
      });
      return;
    }

    setSelectedFile(file);
    setIsModalOpen(true); // فتح المودال

    // تفريغ الـ input عشان لو اليوزر اختار نفس الملف تاني يشتغل
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 🌟 3. تأكيد الاستعادة من المودال
  const confirmRestore = async () => {
    if (!selectedFile) return;

    setIsModalOpen(false);
    setLoadingRestore(true);
    setStatusMsg(null);

    const formData = new FormData();
    formData.append("backupFile", selectedFile);

    try {
      const response = await fetch(
        `http://${API_URL}:5000/api/backup/restore`,
        {
          method: "POST",
          body: formData, // استخدام FormData لرفع الملف الحقيقي
        },
      );

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "فشل استعادة البيانات");

      setStatusMsg({
        type: "success",
        text: "تمت استعادة البيانات بنجاح! سيتم إعادة تحميل الصفحة...",
      });

      // إعادة تحميل الصفحة بعد ثانيتين لتطبيق الداتا الجديدة
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      setStatusMsg({
        type: "error",
        text: error.message || "حدث خطأ غير متوقع",
      });
    } finally {
      setLoadingRestore(false);
      setSelectedFile(null);
    }
  };

  return (
    <div
      className="p-6 max-w-4xl mx-auto flex flex-col gap-8 text-right"
      dir="rtl"
    >
      {/* العنوان والتفاصيل */}
      <div className="flex items-center gap-3 border-b pb-4 border-gray-200">
        <Database className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            النسخ الاحتياطي (SQL)
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            إدارة قواعد البيانات، أخذ نسخة احتياطية بصيغة .sql، واستعادة
            البيانات بكل أمان.
          </p>
        </div>
      </div>

      {/* رسائل التنبيه (نجاح / خطأ) */}
      {statusMsg && (
        <div
          className={`flex items-center gap-2 p-4 rounded-lg font-medium text-sm transition-all ${
            statusMsg.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {statusMsg.type === "success" ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <AlertTriangle className="w-5 h-5" />
          )}
          {statusMsg.text}
        </div>
      )}

      {/* الأزرار الأساسية */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* كارت سحب النسخة */}
        <div className="bg-white border rounded-xl p-6 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md transition-shadow">
          <div className="bg-blue-50 p-4 rounded-full mb-4">
            <Download className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">
            أخذ نسخة احتياطية
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            تحميل نسخة كاملة من النظام بصيغة .sql متوافقة تماماً مع PostgreSQL.
          </p>
          <button
            onClick={handleSaveBackup}
            disabled={loadingSave || loadingRestore}
            className="w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {loadingSave ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Download className="w-5 h-5" />
            )}
            تحميل النسخة الآن
          </button>
        </div>

        {/* كارت استعادة النسخة */}
        <div className="bg-white border rounded-xl p-6 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md transition-shadow">
          <div className="bg-red-50 p-4 rounded-full mb-4">
            <RefreshCw className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">
            استعادة البيانات
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            رفع ملف .sql لاستعادة النظام. سيتم مسح كافة البيانات الحالية
            واستبدالها.
          </p>
          <input
            type="file"
            accept=".sql"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loadingSave || loadingRestore}
            className="w-full flex justify-center items-center gap-2 bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {loadingRestore ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <RefreshCw className="w-5 h-5" />
            )}
            اختيار ملف الاستعادة
          </button>
        </div>
      </div>

      {/* ⚠️ المودال التحذيري (Modal) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-red-50 p-6 text-center border-b border-red-100">
              <div className="mx-auto bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-red-700">
                تحذير هام جداً!
              </h2>
            </div>

            <div className="p-6">
              <p className="text-gray-700 mb-4 text-center leading-relaxed">
                هل أنت متأكد من رغبتك في استعادة الملف
                <span className="font-bold text-black mx-1 block my-2 p-2 bg-gray-100 rounded">
                  {selectedFile?.name}
                </span>
                القيام بهذه الخطوة سيؤدي إلى{" "}
                <strong>مسح جميع البيانات الحالية بالكامل</strong> واستبدالها
                ببيانات الملف المرفوع.
              </p>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={confirmRestore}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-bold transition-colors"
                >
                  نعم، استعادة الآن
                </button>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedFile(null);
                  }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-lg font-bold transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BackupPage;
