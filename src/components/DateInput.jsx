import React, { useEffect, useId, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import {
  DATE_INPUT_MAX,
  DATE_INPUT_MIN,
  finalizeDateInputValue,
  isoToDisplayDate,
  isCompleteIsoDate,
  isValidDateInputValue,
  normalizeDateInputValue,
  parseDisplayDateToIso,
} from "../utils/dateInput";

/**
 * Date field: type day → month → year in dd/mm/yyyy, plus native calendar picker.
 * Stores/emits ISO YYYY-MM-DD for existing form state.
 */
export function DateInput({
  value,
  onChange,
  min = DATE_INPUT_MIN,
  max = DATE_INPUT_MAX,
  className = "",
  compact = false,
  disabled = false,
  readOnly = false,
  name,
  id,
  required = false,
  title,
  onBlur,
  onFocus,
  placeholder = "dd/mm/yyyy",
  "aria-label": ariaLabel,
}) {
  const autoId = useId();
  const inputId = id || `date-input-${autoId}`;
  const pickerRef = useRef(null);
  const isoValue = value ? String(value).slice(0, 10) : "";
  const [textValue, setTextValue] = useState(() => isoToDisplayDate(isoValue));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setTextValue(isoToDisplayDate(isoValue));
    }
  }, [isoValue, focused]);

  const emitIso = (nextIso) => {
    const normalized = normalizeDateInputValue(nextIso);
    onChange?.(normalized);
  };

  const handleTextChange = (event) => {
    if (readOnly || disabled) return;
    const nextText = event.target.value;
    setTextValue(nextText);

    if (!nextText.trim()) {
      emitIso("");
      return;
    }

    const parsed = parseDisplayDateToIso(nextText);
    if (parsed === null) return;
    if (!parsed) return;
    if (!isValidDateInputValue(parsed)) return;

    const finalized = finalizeDateInputValue(parsed);
    if (finalized && finalized >= min && finalized <= max) {
      emitIso(finalized);
    }
  };

  const handleTextBlur = (event) => {
    setFocused(false);
    const parsed = parseDisplayDateToIso(textValue);
    if (!textValue.trim()) {
      emitIso("");
      setTextValue("");
    } else if (isCompleteIsoDate(parsed)) {
      const finalized = finalizeDateInputValue(parsed);
      if (finalized && finalized >= min && finalized <= max) {
        emitIso(finalized);
        setTextValue(isoToDisplayDate(finalized));
      } else {
        emitIso("");
        setTextValue("");
      }
    } else {
      setTextValue(isoToDisplayDate(isoValue));
    }
    onBlur?.(event);
  };

  const handlePickerChange = (event) => {
    if (readOnly || disabled) return;
    const next = event.target.value;
    if (!isValidDateInputValue(next)) return;
    const normalized = finalizeDateInputValue(normalizeDateInputValue(next));
    if (normalized && normalized >= min && normalized <= max) {
      emitIso(normalized);
      setTextValue(isoToDisplayDate(normalized));
    }
  };

  const openCalendar = () => {
    if (readOnly || disabled) return;
    const picker = pickerRef.current;
    if (!picker) return;
    if (isoValue && isCompleteIsoDate(isoValue)) picker.value = isoValue;
    if (typeof picker.showPicker === "function") {
      picker.showPicker();
    } else {
      picker.click();
    }
  };

  return (
    <div className={`erp-date-input flex items-center gap-1 ${className}`.trim()}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={inputId}
        name={name}
        value={textValue}
        onChange={handleTextChange}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={handleTextBlur}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        title={title || "Enter date as dd/mm/yyyy or use calendar"}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={`erp-date-input-text min-w-0 flex-1 rounded border border-inherit bg-inherit px-2 text-inherit ${
          compact ? "py-1 text-xs" : "py-1.5"
        }`}
      />
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        value={isoValue}
        min={min}
        max={max}
        onChange={handlePickerChange}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={openCalendar}
        disabled={disabled || readOnly}
        title="Open calendar"
        className={`erp-date-input-calendar shrink-0 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 ${
          compact ? "p-1" : "p-1.5"
        }`}
      >
        <Calendar className="h-4 w-4" />
      </button>
    </div>
  );
}

export default DateInput;
