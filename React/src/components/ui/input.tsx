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
          "flex w-full rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 font-bold text-slate-900 dark:text-white shadow-sm transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 text-base md:text-base h-11",
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
