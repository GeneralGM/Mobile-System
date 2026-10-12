/* eslint-disable prettier/prettier */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

type SearchSelectProps = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function SearchSelect({
  value,
  options,
  onChange,
  placeholder = "ابحث أو اكتب...",
  disabled = false,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery(value);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [value]);

  const filteredOptions = options.filter((option) =>
    option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  function chooseOption(option: string) {
    onChange(option);
    setQuery(option);
    setOpen(false);
  }

  function commitQuery() {
    const nextValue = query.trim();
    if (nextValue) onChange(nextValue);
    setQuery(nextValue);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative w-full" dir="rtl">
      <div className="relative">
        <Search
          size={17}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
        />

        <input
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (filteredOptions.length === 1) {
                chooseOption(filteredOptions[0]);
              } else {
                commitQuery();
              }
            }

            if (event.key === "Escape") {
              setOpen(false);
              setQuery(value);
            }
          }}
          className="w-full rounded-xl border border-gray-200 bg-white py-3 pr-10 pl-10 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-gray-100"
        />

        {query && !disabled ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              onChange("");
              setOpen(true);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="مسح"
          >
            <X size={15} />
          </button>
        ) : (
          <ChevronDown
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseOption(option)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-right text-sm text-gray-700 transition hover:bg-emerald-50 hover:text-emerald-800"
            >
              <span>{option}</span>
              {value === option && (
                <Check size={16} className="text-emerald-600" />
              )}
            </button>
          ))}

          {query.trim() &&
            !options.some(
              (option) =>
                option.toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
            ) && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={commitQuery}
                className="w-full rounded-lg bg-emerald-50 px-3 py-2.5 text-right text-sm text-emerald-800 hover:bg-emerald-100"
              >
                استخدام «{query.trim()}»
              </button>
            )}

          {filteredOptions.length === 0 && !query.trim() && (
            <p className="px-3 py-3 text-center text-sm text-gray-400">
              اكتب للبحث أو لإضافة قيمة جديدة
            </p>
          )}
        </div>
      )}
    </div>
  );
}
