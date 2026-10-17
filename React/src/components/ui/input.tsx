import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, autoComplete, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        autoComplete={
          autoComplete ?? (type === "password" ? "new-password" : undefined)
        }
        className={cn(
          // 1. البوردر والخلفية: border-2 ليكون بارز وواضح، مع خلفية بيضاء وتنسيق اللمسات Focus
          "flex h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-none file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:border-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-700/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white",
          // 2. الكلاسات الخرجية (className) بتيجي هنا في الآخر عشان لو حبيت تفرص ارتفاع أو خط معين في شاشة معينة يستجيب معاك
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
