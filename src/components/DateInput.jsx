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
    if (isoValue && isCompleteIsoDate(isoValue)) {
      picker.value = isoValue;
    }
    try {
      if (typeof picker.showPicker === "function") {
        picker.showPicker();
        return;
      }
    } catch {
      // showPicker can throw outside a direct user gesture in some browsers
    }
    picker.focus({ preventScroll: true });
    picker.click();
  };

  return (
    <div className={`erp-date-input flex w-full items-stretch gap-0 overflow-hidden ${className}`.trim()}>
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
        className={`erp-date-input-text min-w-0 flex-1 border-0 bg-transparent px-3 text-inherit placeholder:text-slate-400 focus:outline-none focus:ring-0 ${
          compact ? "py-1 text-xs" : "text-sm"
        }`}
      />
      <div
        className={`erp-date-input-calendar relative shrink-0 flex items-center justify-center border-l border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 ${
          disabled || readOnly ? "opacity-50 pointer-events-none" : "cursor-pointer"
        } ${compact ? "px-2" : "px-2.5"}`}
        onClick={openCalendar}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openCalendar();
          }
        }}
        role="button"
        tabIndex={disabled || readOnly ? -1 : 0}
        title="Open calendar"
        aria-label="Open calendar"
      >
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          value={isoValue}
          min={min}
          max={max}
          onChange={handlePickerChange}
          disabled={disabled || readOnly}
        />
        <Calendar className={`pointer-events-none relative z-0 ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
      </div>
    </div>
  );
}

export default DateInput;
