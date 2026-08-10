import React, { useEffect, useState } from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { dismissToast, subscribeToasts } from "../lib/toast";

function toneClasses(tone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-white text-slate-900";
}

function ToneIcon({ tone }) {
  if (tone === "success") return <Check className="h-4 w-4" aria-hidden />;
  if (tone === "warning") return <AlertTriangle className="h-4 w-4" aria-hidden />;
  return <Info className="h-4 w-4" aria-hidden />;
}

/**
 * Global toast stack — mount once at app root.
 */
export default function AppToaster() {
  const [items, setItems] = useState([]);

  useEffect(() => subscribeToasts(setItems), []);

  if (!items.length) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-20 z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {items.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-lg ${toneClasses(toast.tone)}`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <ToneIcon tone={toast.tone} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.message ? <p className="mt-1 text-xs opacity-90">{toast.message}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
