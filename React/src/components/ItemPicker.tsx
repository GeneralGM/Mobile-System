import { useMemo, useRef, useState, useEffect } from "react";
import { arabicMatch } from "@/lib/arabic";
import type { Item } from "@/lib/store";
import { Search } from "lucide-react";

interface Props {
  items: Item[];
  value?: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

export function ItemPicker({
  items,
  value,
  onChange,
  placeholder = "ابحث عن صنف...",
}: Props) {
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

  const selected = items.find((i) => i.id === value);
  const filtered = useMemo(
    () => items.filter((i) => arabicMatch(i.name, q)).slice(0, 50),
    [items, q],
  );

  useEffect(() => {
    if (selected && !open) setQ(selected.name);
  }, [selected, open]);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={q}
          onFocus={() => {
            setOpen(true);
            setQ("");
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full h-10 ps-8 pe-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">
              لا توجد نتائج
            </div>
          ) : (
            filtered.map((i) => (
              <button
                type="button"
                key={i.id}
                onClick={() => {
                  onChange(i.id);
                  setQ(i.name);
                  setOpen(false);
                }}
                className="w-full text-right px-3 py-2 hover:bg-accent text-sm flex justify-between items-center gap-2"
              >
                <span className="font-medium">{i.name}</span>
                <span className="text-xs text-muted-foreground">
                  {i.qty} {i.unit}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
