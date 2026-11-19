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
 * No TipTap / Quill dependency.
 */
export default function RichTextField({
  value = "",
  onChange,
  placeholder = "Describe the issue…",
  minHeight = "140px",
  disabled = false,
  className = "",
}) {
  const ref = useRef(null);
  const lastExternal = useRef(value);

  useEffect(() => {
    if (!ref.current) return;
    if (value !== lastExternal.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || "";
      lastExternal.current = value;
    }
  }, [value]);

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

  const emit = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    lastExternal.current = html;
    onChange?.(html);
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
        ref={ref}
        role="textbox"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        className="px-3 py-2 text-sm text-ink outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-ink-muted prose prose-sm max-w-none"
        style={{ minHeight }}
      />
    </div>
  );
}
