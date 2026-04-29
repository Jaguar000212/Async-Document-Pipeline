"use client";

import { X } from "lucide-react";

export type ToastKind = "info" | "success" | "error";

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastStackProps {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}

const kindClassMap: Record<ToastKind, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
};

export default function ToastStack({ items, onDismiss }: ToastStackProps) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow ${kindClassMap[item.kind]}`}
          role="status"
          aria-live="polite"
        >
          <p>{item.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(item.id)}
            className="rounded p-0.5 hover:bg-black/5"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

