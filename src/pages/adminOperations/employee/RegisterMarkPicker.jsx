import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  REGISTER_LEAVE_SUBMENU_OPTIONS,
  REGISTER_PRIMARY_MARK_OPTIONS,
  registerMarkCellInlineStyle,
  registerMarkDisplayValue,
  registerMarkOptionLabel,
  registerMarkSelectTextClass,
} from "../../../lib/attendanceDaily";

const MENU_ITEM_CLASS =
  "w-full px-2.5 py-1.5 text-left text-gray-800 hover:bg-gray-100 focus:bg-gray-100 outline-none";

const MENU_MIN_WIDTH = 168;
const MENU_EST_HEIGHT = 220;
const VIEWPORT_PAD = 8;

function getScrollParents(node) {
  const parents = [];
  let el = node?.parentElement;
  while (el) {
    const style = getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`)) {
      parents.push(el);
    }
    el = el.parentElement;
  }
  return parents;
}

function computeMenuPosition(anchorEl, menuHeight = MENU_EST_HEIGHT) {
  if (!anchorEl) return null;
  const r = anchorEl.getBoundingClientRect();
  if (!r.width && !r.height) return null;

  const minWidth = Math.max(r.width, MENU_MIN_WIDTH);
  let top = r.bottom + 2;
  let left = r.left;

  if (top + menuHeight > window.innerHeight - VIEWPORT_PAD) {
    const above = r.top - menuHeight - 2;
    if (above >= VIEWPORT_PAD) top = above;
  }

  const maxLeft = window.innerWidth - minWidth - VIEWPORT_PAD;
  if (left > maxLeft) left = maxLeft;
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;

  return { top, left, minWidth };
}

export function RegisterMarkPicker({ value, onChange, readOnly = false }) {
  const [open, setOpen] = useState(false);
  const [leaveSubmenuOpen, setLeaveSubmenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const updateMenuPos = useCallback(() => {
    const menuHeight = menuRef.current?.offsetHeight || MENU_EST_HEIGHT;
    const next = computeMenuPosition(buttonRef.current, menuHeight);
    if (next) setMenuPos(next);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return undefined;
    }
    updateMenuPos();

    const scrollParents = getScrollParents(buttonRef.current);
    scrollParents.forEach((el) => el.addEventListener("scroll", updateMenuPos, { passive: true }));
    window.addEventListener("resize", updateMenuPos);

    return () => {
      scrollParents.forEach((el) => el.removeEventListener("scroll", updateMenuPos));
      window.removeEventListener("resize", updateMenuPos);
    };
  }, [open, updateMenuPos]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return undefined;
    updateMenuPos();
    return undefined;
  }, [open, leaveSubmenuOpen, updateMenuPos]);

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

  const close = () => {
    setOpen(false);
    setLeaveSubmenuOpen(false);
  };

  const pick = (next) => {
    onChange(next);
    close();
  };

  const toggleOpen = (e) => {
    e.stopPropagation();
    if (open) {
      close();
      return;
    }
    const nextPos = computeMenuPosition(e.currentTarget);
    if (nextPos) setMenuPos(nextPos);
    setOpen(true);
  };

  const display = registerMarkDisplayValue(value);

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: `${menuPos.top}px`,
              left: `${menuPos.left}px`,
              minWidth: `${menuPos.minWidth}px`,
              zIndex: 9999,
            }}
            className="rounded-md border border-gray-300 bg-white py-1 text-[11px] text-gray-900 shadow-lg"
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
                      className={`flex items-center justify-between gap-2 ${MENU_ITEM_CLASS}`}
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
                            className={`block ${MENU_ITEM_CLASS}`}
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
                  className={`block ${MENU_ITEM_CLASS}`}
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
      {readOnly ? (
        <span
          aria-label={registerMarkOptionLabel(value)}
          className={`${registerMarkSelectTextClass(value)} block w-full h-8 px-1 text-[11px] font-semibold text-center leading-8 cursor-default`}
        >
          {display}
        </span>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          aria-label={registerMarkOptionLabel(value)}
          aria-expanded={open}
          onClick={toggleOpen}
          onMouseDown={(e) => e.stopPropagation()}
          style={registerMarkCellInlineStyle(value)}
          className={`${registerMarkSelectTextClass(value)} w-full h-8 px-1 text-[11px] font-semibold text-center cursor-pointer bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-white/50 rounded`}
        >
          {display}
        </button>
      )}
      {!readOnly && menu}
    </div>
  );
}
