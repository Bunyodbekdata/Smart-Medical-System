"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (opts: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({
      title,
      description,
      variant = "info",
    }: {
      title: string;
      description?: string;
      variant?: ToastVariant;
    }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => [...prev, { id, title, description, variant }]);
      setTimeout(() => remove(id), 4500);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="no-print fixed right-4 bottom-4 z-50 flex max-w-sm flex-col gap-2.5"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-lg transition-all",
              item.variant === "success" && "border-emerald-200",
              item.variant === "error" && "border-rose-200",
              item.variant === "info" && "border-blue-200"
            )}
          >
            {item.variant === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : item.variant === "error" ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            ) : (
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-xs text-slate-600">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Yopish"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: () => {},
    };
  }
  return ctx;
}
