import React from "react";
import { DateInput } from "../../../components/DateInput";

/** Date field with calendar picker — display/entry dd/mm/yyyy, stores ISO YYYY-MM-DD. */
export function FinanceDateInput({
  value,
  onChange,
  className = "",
  placeholder = "dd/mm/yyyy",
  disabled,
  readOnly,
  required,
  min,
  max,
  title,
  compact,
  id,
  name,
  "aria-label": ariaLabel,
}) {
  const iso = value ? String(value).slice(0, 10) : "";

  return (
    <DateInput
      value={iso}
      onChange={(next) => onChange?.(next ? next : null)}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      min={min}
      max={max}
      title={title}
      compact={compact}
      id={id}
      name={name}
      aria-label={ariaLabel}
    />
  );
}
