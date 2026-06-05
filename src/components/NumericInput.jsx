import React from "react";

/**
 * Numeric-only field without browser spinner arrows.
 * Uses text + inputMode so only digits (and optional decimal) are accepted.
 */
export function NumericInput({
  value,
  onChange,
  allowDecimal = true,
  allowNegative = false,
  className = "",
  readOnly = false,
  disabled = false,
  placeholder,
  onBlur,
  onFocus,
  name,
  id,
  "aria-label": ariaLabel,
}) {
  const handleChange = (e) => {
    if (readOnly || disabled) return;
    const raw = e.target.value;
    if (raw === "") {
      onChange?.("");
      return;
    }
    const pattern = allowDecimal
      ? allowNegative
        ? /^-?\d*\.?\d*$/
        : /^\d*\.?\d*$/
      : allowNegative
        ? /^-?\d*$/
        : /^\d*$/;
    if (!pattern.test(raw)) return;
    onChange?.(raw);
  };

  return (
    <input
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      autoComplete="off"
      value={value ?? ""}
      onChange={handleChange}
      readOnly={readOnly}
      disabled={disabled}
      placeholder={placeholder}
      onBlur={onBlur}
      onFocus={onFocus}
      name={name}
      id={id}
      aria-label={ariaLabel}
      className={`erp-numeric-input ${className}`.trim()}
    />
  );
}

export function parseNumericInput(value, fallback = 0) {
  if (value === "" || value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
