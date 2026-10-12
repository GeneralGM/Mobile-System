/* eslint-disable prettier/prettier */
import React, { useState, useEffect } from "react";

interface BeginningReloaderProps {
  onComplete?: () => void;
  duration?: number;
}

const BeginningReloader: React.FC<BeginningReloaderProps> = ({
  onComplete,
  duration = 3500,
}) => {
  const [loadingText, setLoadingText] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  useEffect(() => {
    const texts = ["جاري التحميل", "يتم إعداد المول", "تحضير التجربة"];
    let currentText = 0;
    let currentChar = 0;

    const interval = setInterval(() => {
      if (currentChar < texts[currentText].length) {
        setLoadingText(texts[currentText].slice(0, currentChar + 1));
        currentChar++;
      } else {
        currentText = (currentText + 1) % texts.length;
        currentChar = 0;
        setLoadingText("");
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 right-10 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute bottom-20 left-10 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        ></div>
      </div>

      {/* Main content container */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-8">
        {/* Building/Mall structure */}
        <div className="relative w-48 h-48 flex items-center justify-center">
          {/* Central loading circle */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-32 h-32">
              <svg
                className="w-full h-full animate-spin"
                style={{ animationDuration: "3s" }}
                viewBox="0 0 120 120"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Outer ring */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="url(#gradient1)"
                  strokeWidth="3"
                  strokeDasharray="157 314"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient
                    id="gradient1"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#FBBF24" />
                    <stop offset="100%" stopColor="#60A5FA" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Center mall icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-300 to-amber-500 rounded-lg shadow-lg flex items-center justify-center transform hover:scale-110 transition-transform">
                  {/* Stylized building */}
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 40 40"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Building facade */}
                    <rect
                      x="8"
                      y="6"
                      width="24"
                      height="28"
                      fill="white"
                      rx="2"
                    />
                    {/* Windows grid */}
                    <rect
                      x="12"
                      y="10"
                      width="4"
                      height="4"
                      fill="#374151"
                      rx="1"
                    />
                    <rect
                      x="18"
                      y="10"
                      width="4"
                      height="4"
                      fill="#374151"
                      rx="1"
                    />
                    <rect
                      x="24"
                      y="10"
                      width="4"
                      height="4"
                      fill="#374151"
                      rx="1"
                    />
                    <rect
                      x="12"
                      y="18"
                      width="4"
                      height="4"
                      fill="#374151"
                      rx="1"
                    />
                    <rect
                      x="18"
                      y="18"
                      width="4"
                      height="4"
                      fill="#374151"
                      rx="1"
                    />
                    <rect
                      x="24"
                      y="18"
                      width="4"
                      height="4"
                      fill="#374151"
                      rx="1"
                    />
                    <rect
                      x="12"
                      y="26"
                      width="4"
                      height="4"
                      fill="#374151"
                      rx="1"
                    />
                    <rect
                      x="18"
                      y="26"
                      width="4"
                      height="4"
                      fill="#374151"
                      rx="1"
                    />
                    <rect
                      x="24"
                      y="26"
                      width="4"
                      height="4"
                      fill="#374151"
                      rx="1"
                    />
                    {/* Door */}
                    <rect
                      x="16"
                      y="30"
                      width="8"
                      height="6"
                      fill="#78350F"
                      rx="1"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Rotating amenity icons */}
          <div className="absolute inset-0 flex items-center justify-center">
            {[
              { icon: "🍽️", label: "مطخ", angle: 0 },
              { icon: "🍷", label: "بار", angle: 90 },
              { icon: "💺", label: "قاعات", angle: 180 },
              { icon: "🎵", label: "ترفيه", angle: 270 },
            ].map((item, idx) => (
              <div
                key={idx}
                className="absolute w-24 h-24 flex items-center justify-center"
                style={{
                  transform: `rotate(${item.angle}deg)`,
                  animation: `orbit 8s linear infinite`,
                  animationDelay: `${idx * 0.5}s`,
                }}
              >
                <div
                  className="flex flex-col items-center gap-1 bg-white rounded-full p-3 shadow-lg hover:shadow-xl transition-shadow"
                  style={{
                    transform: `rotate(-${item.angle}deg)`,
                  }}
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-xs font-semibold text-slate-700 text-center">
                    {item.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Loading text */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">مول الشيخ زايد</h2>
          <p className="text-amber-300 text-lg font-medium min-h-8">
            {loadingText}
            <span className="animate-pulse">|</span>
          </p>
        </div>

        {/* Decorative progress indicator */}
        <div className="w-48 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-300 via-blue-400 to-amber-300 rounded-full"
            style={{
              animation: "shimmer 2s infinite",
              backgroundSize: "200% 100%",
            }}
          ></div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes orbit {
          from {
            transform: rotate(0deg) translateX(60px) rotate(0deg);
          }
          to {
            transform: rotate(360deg) translateX(60px) rotate(-360deg);
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
      `}</style>
    </div>
  );
};

export default BeginningReloader;
