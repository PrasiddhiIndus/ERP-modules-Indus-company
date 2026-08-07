import React, { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

const TONE = {
  default:
    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300",
  accent: "border-accent/30 bg-accent/5 text-accent hover:bg-accent/10",
  success: "border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-50",
  warning: "border-amber-200 bg-amber-50/70 text-amber-900 hover:bg-amber-50",
  danger: "border-red-200 bg-red-50/70 text-red-800 hover:bg-red-50",
};

/**
 * Action strip for Calling Master tables — separates actions from data columns.
 */
export function CallingActionBar({ children, className = "" }) {
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1.5 pl-3 ml-0.5 border-l border-slate-200/90 ${className}`.trim()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

/**
 * Compact table action control. Prefer icon + short label, or icon-only with title.
 */
export function CallingActionBtn({
  icon: Icon,
  label,
  title,
  onClick,
  disabled = false,
  tone = "default",
  iconOnly = false,
}) {
  const tip = title || label || undefined;
  return (
    <button
      type="button"
      title={tip}
      aria-label={tip}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        iconOnly ? "w-8 px-0" : "px-2.5"
      } ${TONE[tone] || TONE.default}`}
    >
      {Icon ? <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden /> : null}
      {!iconOnly && label ? <span className="whitespace-nowrap">{label}</span> : null}
    </button>
  );
}

/**
 * Overflow menu for secondary table actions (keeps primary row actions compact).
 * @param {{ items: Array<{ key: string, label: string, icon?: any, onClick: Function, disabled?: boolean, tone?: string }> }} props
 */
export function CallingActionMenu({ items = [], label = "More actions" }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const menuId = useId();
  const visible = (items || []).filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    place();
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!visible.length) return null;

  return (
    <div className="relative" ref={rootRef}>
      <span ref={btnRef} className="inline-flex">
        <CallingActionBtn
          icon={MoreHorizontal}
          iconOnly
          title={label}
          label={label}
          onClick={() => setOpen((v) => !v)}
        />
      </span>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="fixed z-[80] min-w-[11rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          style={{ top: coords.top, right: coords.right }}
        >
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium disabled:opacity-40 ${
                  item.tone === "danger"
                    ? "text-red-800 hover:bg-red-50"
                    : item.tone === "accent"
                      ? "text-accent hover:bg-accent/5"
                      : "text-slate-700 hover:bg-slate-50"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.disabled) return;
                  setOpen(false);
                  item.onClick?.(e);
                }}
              >
                {Icon ? <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden /> : null}
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Muted status text inside action cells (e.g. Joined date). */
export function CallingActionHint({ children }) {
  return <span className="text-[11px] text-slate-500 px-1 self-center whitespace-nowrap">{children}</span>;
}
