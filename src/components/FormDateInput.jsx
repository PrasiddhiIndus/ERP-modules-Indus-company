import React from "react";
import { DateInput } from "./DateInput";

/**
 * Drop-in replacement for `<input type="date">`.
 * Displays dd/mm/yyyy; onChange emits synthetic event with ISO YYYY-MM-DD in target.value.
 */
export function FormDateInput({
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  className = "",
  disabled,
  readOnly,
  required,
  name,
  id,
  min,
  max,
  title,
  compact = false,
  "aria-label": ariaLabel,
}) {
  const isoValue = value !== undefined && value !== null ? value : defaultValue;

  const handleChange = (nextIso) => {
    const v = nextIso ?? "";
    onChange?.({
      target: { value: v, name, id },
      currentTarget: { value: v, name, id },
    });
  };

  return (
    <DateInput
      value={isoValue ?? ""}
      onChange={handleChange}
      onBlur={onBlur}
      onFocus={onFocus}
      className={className}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      name={name}
      id={id}
      min={min}
      max={max}
      title={title}
      compact={compact}
      aria-label={ariaLabel}
    />
  );
}

export default FormDateInput;
