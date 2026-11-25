import React, { useEffect, useRef } from "react";

const BTNS = [
  { cmd: "bold", label: "B", title: "Bold", className: "font-bold" },
  { cmd: "italic", label: "I", title: "Italic", className: "italic" },
  { cmd: "underline", label: "U", title: "Underline", className: "underline" },
  { cmd: "insertUnorderedList", label: "• List", title: "Bullet list" },
  { cmd: "insertOrderedList", label: "1. List", title: "Numbered list" },
];

/**
 * Lightweight rich-text editor — contentEditable + document.execCommand.
 * Syncs from props only when not focused so React state updates do not fight typing.
 */
export default function RichTextField({
  id,
  value = "",
  onChange,
  placeholder = "Describe the issue…",
  minHeight = "140px",
  disabled = false,
  className = "",
}) {
  const ref = useRef(null);
  const focusedRef = useRef(false);
  const lastEmittedRef = useRef(value);

  // Mount: seed editor once. Later external resets only apply when blurred.
  useEffect(() => {
    if (!ref.current) return;
    if (focusedRef.current) return;
    const next = value || "";
    if (ref.current.innerHTML !== next) {
      ref.current.innerHTML = next;
    }
    lastEmittedRef.current = next;
  }, [value]);

  const emit = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    lastEmittedRef.current = html;
    onChange?.(html);
  };

  const run = (cmd) => {
    if (disabled) return;
    ref.current?.focus();
    try {
      document.execCommand(cmd, false, null);
    } catch {
      /* ignore */
    }
    emit();
  };

  return (
    <div className={`rounded-control border border-border bg-surface overflow-hidden ${className}`.trim()}>
      <div className="flex flex-wrap gap-1 border-b border-border bg-surface-sunken/60 px-2 py-1.5">
        {BTNS.map((b) => (
          <button
            key={b.cmd}
            type="button"
            title={b.title}
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              run(b.cmd);
            }}
            className={`h-7 px-2 rounded text-[11px] text-ink-secondary hover:bg-surface hover:text-ink border border-transparent hover:border-border disabled:opacity-40 ${b.className || ""}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div
        id={id}
        ref={ref}
        role="textbox"
        tabIndex={disabled ? -1 : 0}
        aria-multiline="true"
        aria-placeholder={placeholder}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          emit();
        }}
        onInput={emit}
        onMouseDown={(e) => {
          // Keep focus in the editor when clicking text; toolbar uses preventDefault separately.
          e.stopPropagation();
        }}
        onPaste={(e) => {
          // After browser inserts pasted HTML/images, constrain any img tags.
          requestAnimationFrame(() => {
            const root = ref.current;
            if (!root) return;
            root.querySelectorAll("img").forEach((img) => {
              img.removeAttribute("width");
              img.removeAttribute("height");
              img.style.maxWidth = "100%";
              img.style.height = "auto";
              img.style.maxHeight = "240px";
              img.style.objectFit = "contain";
            });
            emit();
          });
          // Keep default paste so screenshots still insert; we only normalize size after.
          void e;
        }}
        className={[
          "px-3 py-2 text-sm text-ink outline-none min-h-[140px] cursor-text overflow-x-auto",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-ink-muted empty:before:pointer-events-none",
          "prose prose-sm max-w-none",
          "[&_img]:max-w-full [&_img]:h-auto [&_img]:max-h-60 [&_img]:object-contain",
          "[&_img]:rounded-md [&_img]:border [&_img]:border-border [&_img]:my-2",
        ].join(" ")}
        style={{ minHeight }}
      />
    </div>
  );
}
