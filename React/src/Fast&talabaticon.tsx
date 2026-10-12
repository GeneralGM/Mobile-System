/* eslint-disable prettier/prettier */
import React from "react";

// أيقونة Fast (السرعة)
export const FastIcon = ({ size = 24, color = "#FF6B35" }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13 2L3 14H9L11 22L21 10H15L13 2Z"
        fill={color}
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke={color}
        strokeWidth="0.5"
        opacity="0.3"
      />
    </svg>
  );
};

// أيقونة Talabat (التوصيل/الطلب)
export const TalabatIcon = ({ size = 24, color = "#00A859" }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* الكيس/الحقيبة */}
      <path
        d="M7 3H17C18.1046 3 19 3.89543 19 5V19C19 20.1046 18.1046 21 17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* مقبض الكيس */}
      <path
        d="M8 3C8 1.5 9 1 12 1C15 1 16 1.5 16 3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* خطوط داخلية */}
      <line
        x1="8"
        y1="8"
        x2="16"
        y2="8"
        stroke={color}
        strokeWidth="1"
        opacity="0.5"
      />
      <line
        x1="8"
        y1="14"
        x2="16"
        y2="14"
        stroke={color}
        strokeWidth="1"
        opacity="0.5"
      />
    </svg>
  );
};

// صفحة تجريبية لعرض الأيقونات
export const IconsDemo = () => {
  return (
    <div
      style={{
        padding: "40px",
        textAlign: "center",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>🎨 Fast & Talabat Icons</h1>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "60px",
          marginTop: "40px",
          flexWrap: "wrap",
        }}
      >
        {/* Fast Icon */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "100px",
              height: "100px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#f0f0f0",
              borderRadius: "12px",
              marginBottom: "16px",
            }}
          >
            <FastIcon size={48} color="#FF6B35" />
          </div>
          <p style={{ fontSize: "16px", fontWeight: "bold", margin: "0" }}>
            Fast Icon
          </p>
          <p style={{ fontSize: "12px", color: "#666", margin: "8px 0 0 0" }}>
            السرعة والتوصيل السريع
          </p>
        </div>

        {/* Talabat Icon */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "100px",
              height: "100px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#f0f0f0",
              borderRadius: "12px",
              marginBottom: "16px",
            }}
          >
            <TalabatIcon size={48} color="#00A859" />
          </div>
          <p style={{ fontSize: "16px", fontWeight: "bold", margin: "0" }}>
            Talabat Icon
          </p>
          <p style={{ fontSize: "12px", color: "#666", margin: "8px 0 0 0" }}>
            الطلب والتوصيل
          </p>
        </div>
      </div>

      {/* أمثلة على أحجام مختلفة */}
      <div
        style={{
          marginTop: "60px",
          textAlign: "left",
          maxWidth: "600px",
          margin: "60px auto 0",
        }}
      >
        <h3>أحجام مختلفة:</h3>
        <div
          style={{
            display: "flex",
            gap: "20px",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <FastIcon size={16} />
          <FastIcon size={24} />
          <FastIcon size={32} />
          <FastIcon size={48} />
          <span style={{ color: "#666" }}>Fast Icon</span>
        </div>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          <TalabatIcon size={16} />
          <TalabatIcon size={24} />
          <TalabatIcon size={32} />
          <TalabatIcon size={48} />
          <span style={{ color: "#666" }}>Talabat Icon</span>
        </div>
      </div>
    </div>
  );
};

export default IconsDemo;
