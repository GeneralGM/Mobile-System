import { useMemo, useRef, useState, useEffect } from "react";
import { arabicMatch } from "@/lib/arabic";
import { Search, ChevronDown } from "lucide-react";

export interface SSOption {
  value: string;
  label: string;
  hint?: string;
  group?: string;
}

interface Props {
  options: SSOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({ options, value, onChange, placeholder = "ابحث أو اختر...", className = "", disabled }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const list = q ? options.filter((o) => arabicMatch(o.label + " " + (o.hint || "") + " " + (o.group || ""), q)) : options;
    return list.slice(0, 80);
  }, [options, q]);

  // Group filtered by group
  const groups = useMemo(() => {
    const map = new Map<string, SSOption[]>();
    for (const o of filtered) {
      const g = o.group || "";
      const arr = map.get(g) || [];
      arr.push(o);
      map.set(g, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <div className="relative">
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={open ? q : selected?.label || ""}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => { if (!disabled) { setOpen(true); setQ(""); } }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          className="w-full h-10 ps-8 pe-7 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">لا توجد نتائج</div>
          ) : (
            groups.map(([g, items]) => (
              <div key={g}>
                {g && <div className="px-3 py-1 text-[11px] font-bold bg-secondary/50 text-muted-foreground sticky top-0">{g}</div>}
                {items.map((o) => (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => { onChange(o.value); setOpen(false); setQ(""); }}
                    className={`w-full text-right px-3 py-2 hover:bg-accent text-sm flex justify-between items-center gap-2 ${o.value === value ? "bg-accent/50" : ""}`}
                  >
                    <span className="font-medium">{o.label}</span>
                    {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
