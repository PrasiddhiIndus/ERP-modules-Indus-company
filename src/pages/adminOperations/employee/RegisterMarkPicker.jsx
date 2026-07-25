import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  REGISTER_HALF_DAY_SUBMENU_OPTIONS,
  REGISTER_LEAVE_SUBMENU_OPTIONS,
  REGISTER_PRIMARY_MARK_OPTIONS,
  registerMarkCellInlineStyle,
  registerMarkCompositeDisplayParts,
  registerMarkDisplayValue,
  registerMarkOptionLabel,
  registerMarkSelectTextClass,
} from "../../../lib/attendanceDaily";

const MENU_ITEM_CLASS =
  "w-full px-2.5 py-1.5 text-left text-gray-800 hover:bg-gray-100 focus:bg-gray-100 outline-none";

const MENU_MIN_WIDTH = 168;
const MENU_EST_HEIGHT = 260;
const VIEWPORT_PAD = 8;
const SUBMENU_CLOSE_DELAY_MS = 220;

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

function SubmenuFlyout({ options, onPick, openLeft = false }) {
  return (
    <div
      className={`absolute top-0 z-[10000] min-w-[12rem] rounded-md border border-gray-300 bg-white py-1 shadow-lg ${
        openLeft ? "right-full mr-0" : "left-full ml-0"
      }`}
      // Invisible hover bridge so the pointer can cross parent → flyout without a gap.
      style={openLeft ? { paddingRight: 8, marginRight: -8 } : { paddingLeft: 8, marginLeft: -8 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="rounded-md bg-white">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`block ${MENU_ITEM_CLASS}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPick(opt.value);
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SubmenuRow({
  label,
  open,
  onOpen,
  onCloseRequest,
  options,
  openLeft,
  onPick,
}) {
  const closeTimerRef = useRef(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      onCloseRequest();
      closeTimerRef.current = null;
    }, SUBMENU_CLOSE_DELAY_MS);
  };

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        clearCloseTimer();
        onOpen();
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className={`flex items-center justify-between gap-2 ${MENU_ITEM_CLASS} ${
          open ? "bg-gray-100" : ""
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearCloseTimer();
          onOpen();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span>{label}</span>
        <span className="text-gray-400" aria-hidden>
          ›
        </span>
      </button>
      {open ? <SubmenuFlyout options={options} onPick={onPick} openLeft={openLeft} /> : null}
    </div>
  );
}

export function RegisterMarkPicker({ value, onChange, readOnly = false }) {
  const [open, setOpen] = useState(false);
  const [leaveSubmenuOpen, setLeaveSubmenuOpen] = useState(false);
  const [halfDaySubmenuOpen, setHalfDaySubmenuOpen] = useState(false);
  const [submenuOpenLeft, setSubmenuOpenLeft] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const updateMenuPos = useCallback(() => {
    const menuHeight = menuRef.current?.offsetHeight || MENU_EST_HEIGHT;
    const next = computeMenuPosition(buttonRef.current, menuHeight);
    if (next) setMenuPos(next);

    const menuEl = menuRef.current;
    if (menuEl) {
      const rect = menuEl.getBoundingClientRect();
      // Prefer left flyout when the right side would clip.
      setSubmenuOpenLeft(rect.right + 200 > window.innerWidth - VIEWPORT_PAD);
    }
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
  }, [open, leaveSubmenuOpen, halfDaySubmenuOpen, updateMenuPos]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const inRoot = rootRef.current?.contains(e.target);
      const inMenu = menuRef.current?.contains(e.target);
      if (!inRoot && !inMenu) {
        setOpen(false);
        setLeaveSubmenuOpen(false);
        setHalfDaySubmenuOpen(false);
      }
    };
    // pointerdown captures earlier than mousedown on some devices; use both-safe capture.
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [open]);

  const close = () => {
    setOpen(false);
    setLeaveSubmenuOpen(false);
    setHalfDaySubmenuOpen(false);
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
  const compositeParts = registerMarkCompositeDisplayParts(value);
  const displayClass = `${registerMarkSelectTextClass(value)} ${
    compositeParts ? "text-[10px]" : String(value || "").includes("/") ? "text-[10px]" : "text-[11px]"
  }`;

  const renderMarkLabel = () => {
    if (compositeParts) {
      return (
        <span className="flex w-full items-center justify-between px-0.5 leading-none">
          <span className="flex-1 text-center">{compositeParts.present}</span>
          <span className="flex-1 text-center">{compositeParts.leave}</span>
        </span>
      );
    }
    return display;
  };

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
            onPointerDown={(e) => e.stopPropagation()}
          >
            {REGISTER_PRIMARY_MARK_OPTIONS.map((opt) => {
              if (opt.hasSubmenu && opt.submenuKey === "halfDay") {
                return (
                  <SubmenuRow
                    key={opt.value}
                    label={opt.label}
                    open={halfDaySubmenuOpen}
                    openLeft={submenuOpenLeft}
                    options={REGISTER_HALF_DAY_SUBMENU_OPTIONS}
                    onOpen={() => {
                      setHalfDaySubmenuOpen(true);
                      setLeaveSubmenuOpen(false);
                    }}
                    onCloseRequest={() => setHalfDaySubmenuOpen(false)}
                    onPick={pick}
                  />
                );
              }
              if (opt.hasSubmenu) {
                return (
                  <SubmenuRow
                    key={opt.value}
                    label={opt.label}
                    open={leaveSubmenuOpen}
                    openLeft={submenuOpenLeft}
                    options={REGISTER_LEAVE_SUBMENU_OPTIONS}
                    onOpen={() => {
                      setLeaveSubmenuOpen(true);
                      setHalfDaySubmenuOpen(false);
                    }}
                    onCloseRequest={() => setLeaveSubmenuOpen(false)}
                    onPick={pick}
                  />
                );
              }
              return (
                <button
                  key={opt.value || "blank"}
                  type="button"
                  className={`block ${MENU_ITEM_CLASS}`}
                  onClick={() => pick(opt.value)}
                  onMouseDown={(e) => e.stopPropagation()}
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
          className={`${displayClass} block w-full h-8 px-1 font-semibold text-center leading-8 cursor-default`}
        >
          {renderMarkLabel()}
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
          className={`${displayClass} w-full h-8 px-1 font-semibold text-center cursor-pointer bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-white/50 rounded`}
        >
          {renderMarkLabel()}
        </button>
      )}
      {!readOnly && menu}
    </div>
  );
}
