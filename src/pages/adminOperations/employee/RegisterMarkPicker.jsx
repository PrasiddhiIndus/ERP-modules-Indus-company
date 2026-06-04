import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  REGISTER_LEAVE_SUBMENU_OPTIONS,
  REGISTER_PRIMARY_MARK_OPTIONS,
  registerMarkOptionLabel,
  registerMarkSelectTextClass,
} from "../../../lib/attendanceDaily";

export function RegisterMarkPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [leaveSubmenuOpen, setLeaveSubmenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuPos(null);
      return;
    }
    const update = () => {
      const r = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 2, left: r.left, minWidth: Math.max(r.width, 168) });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const inRoot = rootRef.current?.contains(e.target);
      const inMenu = menuRef.current?.contains(e.target);
      if (!inRoot && !inMenu) {
        setOpen(false);
        setLeaveSubmenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (next) => {
    onChange(next);
    setOpen(false);
    setLeaveSubmenuOpen(false);
  };

  const display = value || "-";

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: menuPos.top, left: menuPos.left, minWidth: menuPos.minWidth }}
            className="z-[9999] rounded-md border border-gray-300 bg-white py-1 text-[11px] text-gray-900 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {REGISTER_PRIMARY_MARK_OPTIONS.map((opt) => {
              if (opt.hasSubmenu) {
                return (
                  <div
                    key={opt.value}
                    className="relative"
                    onMouseEnter={() => setLeaveSubmenuOpen(true)}
                    onMouseLeave={() => setLeaveSubmenuOpen(false)}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-gray-100"
                      onClick={() => pick("L")}
                    >
                      <span>{opt.label}</span>
                      <span className="text-gray-400" aria-hidden>
                        ›
                      </span>
                    </button>
                    {leaveSubmenuOpen && (
                      <div className="absolute left-full top-0 z-[10000] ml-0.5 min-w-[11rem] rounded-md border border-gray-300 bg-white py-1 shadow-lg">
                        {REGISTER_LEAVE_SUBMENU_OPTIONS.map((leave) => (
                          <button
                            key={leave.value}
                            type="button"
                            className="block w-full px-2.5 py-1.5 text-left hover:bg-gray-100"
                            onClick={() => pick(leave.value)}
                          >
                            {leave.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <button
                  key={opt.value || "blank"}
                  type="button"
                  className="block w-full px-2.5 py-1.5 text-left hover:bg-gray-100"
                  onClick={() => pick(opt.value)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative w-full" data-register-mark-picker>
      <button
        ref={buttonRef}
        type="button"
        aria-label={registerMarkOptionLabel(value)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className={`${registerMarkSelectTextClass(value)} w-full h-8 px-1 text-[11px] font-semibold text-center cursor-pointer bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-white/50 rounded`}
      >
        {display}
      </button>
      {menu}
    </div>
  );
}
