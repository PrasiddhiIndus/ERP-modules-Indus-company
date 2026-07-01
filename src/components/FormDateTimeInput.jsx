import React, { useEffect, useId, useRef, useState } from "react";
import { Calendar, Clock } from "lucide-react";
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

function splitDateTimeLocal(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { dateIso: "", time: "" };
  const [dateIso, timePart] = raw.split("T");
  return {
    dateIso: dateIso || "",
    time: (timePart || "").slice(0, 5),
  };
}

function combineDateTimeLocal(dateIso, time) {
  if (!dateIso) return "";
  const normalizedTime = String(time || "00:00").slice(0, 5);
  return `${dateIso}T${normalizedTime}`;
}

function openNativePicker(input) {
  if (!input) return;
  try {
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
  } catch {
    // showPicker may throw outside a user gesture in some browsers
  }
  input.focus({ preventScroll: true });
  input.click();
}

const triggerClass =
  "relative shrink-0 flex items-center justify-center border-l border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 cursor-pointer";

/**
 * Date + time field: dd/mm/yyyy text + calendar icon | HH:mm + clock icon.
 * Emits datetime-local string (YYYY-MM-DDTHH:mm) via synthetic change events.
 */
export function FormDateTimeInput({
  value,
  onChange,
  onBlur,
  onFocus,
  className = "",
  disabled = false,
  readOnly = false,
  required,
  name,
  id,
  min,
  max,
  title,
  datePlaceholder = "dd/mm/yyyy",
  timePlaceholder = "HH:mm",
  "aria-label": ariaLabel,
}) {
  const autoId = useId();
  const inputId = id || `datetime-input-${autoId}`;
  const datePickerRef = useRef(null);
  const timePickerRef = useRef(null);

  const { dateIso, time } = splitDateTimeLocal(value);
  const [dateText, setDateText] = useState(() => isoToDisplayDate(dateIso));
  const [dateFocused, setDateFocused] = useState(false);

  useEffect(() => {
    if (!dateFocused) {
      setDateText(isoToDisplayDate(dateIso));
    }
  }, [dateIso, dateFocused]);

  const emitValue = (nextDateIso, nextTime) => {
    const combined = combineDateTimeLocal(nextDateIso, nextTime);
    onChange?.({
      target: { value: combined, name, id: inputId },
      currentTarget: { value: combined, name, id: inputId },
    });
  };

  const handleDateTextChange = (event) => {
    if (readOnly || disabled) return;
    const nextText = event.target.value;
    setDateText(nextText);

    if (!nextText.trim()) {
      emitValue("", time);
      return;
    }

    const parsed = parseDisplayDateToIso(nextText);
    if (!parsed || !isValidDateInputValue(parsed)) return;
    const finalized = finalizeDateInputValue(parsed);
    if (finalized && finalized >= DATE_INPUT_MIN && finalized <= DATE_INPUT_MAX) {
      emitValue(finalized, time || "00:00");
    }
  };

  const handleDateTextBlur = (event) => {
    setDateFocused(false);
    const parsed = parseDisplayDateToIso(dateText);
    if (!dateText.trim()) {
      emitValue("", time);
      setDateText("");
    } else if (isCompleteIsoDate(parsed)) {
      const finalized = finalizeDateInputValue(parsed);
      if (finalized && finalized >= DATE_INPUT_MIN && finalized <= DATE_INPUT_MAX) {
        emitValue(finalized, time || "00:00");
        setDateText(isoToDisplayDate(finalized));
      } else {
        emitValue("", time);
        setDateText("");
      }
    } else {
      setDateText(isoToDisplayDate(dateIso));
    }
    onBlur?.(event);
  };

  const handleDatePickerChange = (event) => {
    if (readOnly || disabled) return;
    const next = event.target.value;
    if (!isValidDateInputValue(next)) return;
    const normalized = finalizeDateInputValue(normalizeDateInputValue(next));
    if (normalized && normalized >= DATE_INPUT_MIN && normalized <= DATE_INPUT_MAX) {
      emitValue(normalized, time || "00:00");
      setDateText(isoToDisplayDate(normalized));
    }
  };

  const handleTimeChange = (event) => {
    if (readOnly || disabled) return;
    const nextTime = event.target.value;
    if (!dateIso) {
      const today = new Date().toISOString().slice(0, 10);
      emitValue(today, nextTime);
      setDateText(isoToDisplayDate(today));
      return;
    }
    emitValue(dateIso, nextTime);
  };

  const openDatePicker = () => {
    if (readOnly || disabled) return;
    const picker = datePickerRef.current;
    if (dateIso && isCompleteIsoDate(dateIso)) picker.value = dateIso;
    openNativePicker(picker);
  };

  const openTimePicker = () => {
    if (readOnly || disabled) return;
    openNativePicker(timePickerRef.current);
  };

  const isInactive = disabled || readOnly;

  return (
    <div
      className={`erp-datetime-input flex w-full items-stretch overflow-hidden ${className}`.trim()}
      title={title}
      aria-label={ariaLabel}
    >
      <div className="flex min-w-0 flex-[1.15] items-stretch border-r border-slate-200">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={dateText}
          onChange={handleDateTextChange}
          onFocus={(e) => {
            setDateFocused(true);
            onFocus?.(e);
          }}
          onBlur={handleDateTextBlur}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          placeholder={datePlaceholder}
          aria-label={ariaLabel ? `${ariaLabel} date` : "Date"}
          className="erp-datetime-date-text min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-inherit placeholder:text-slate-400 focus:outline-none focus:ring-0"
        />
        <div
          className={`${triggerClass} px-2.5 ${isInactive ? "opacity-50 pointer-events-none" : ""}`}
          onClick={openDatePicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openDatePicker();
            }
          }}
          role="button"
          tabIndex={isInactive ? -1 : 0}
          title="Open calendar"
          aria-label="Open calendar"
        >
          <input
            ref={datePickerRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            value={dateIso}
            min={min ? String(min).slice(0, 10) : DATE_INPUT_MIN}
            max={max ? String(max).slice(0, 10) : DATE_INPUT_MAX}
            onChange={handleDatePickerChange}
            disabled={isInactive}
          />
          <Calendar className="pointer-events-none relative z-0 h-4 w-4" />
        </div>
      </div>

      <div className="flex min-w-0 flex-[0.85] items-stretch">
        <input
          ref={timePickerRef}
          type="time"
          value={time}
          onChange={handleTimeChange}
          disabled={disabled}
          readOnly={readOnly}
          step={60}
          placeholder={timePlaceholder}
          aria-label={ariaLabel ? `${ariaLabel} time` : "Time"}
          className="erp-datetime-time min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-inherit focus:outline-none focus:ring-0 appearance-none [&::-webkit-calendar-picker-indicator]:hidden [color-scheme:light]"
        />
        <div
          className={`${triggerClass} px-2.5 ${isInactive ? "opacity-50 pointer-events-none" : ""}`}
          onClick={openTimePicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openTimePicker();
            }
          }}
          role="button"
          tabIndex={isInactive ? -1 : 0}
          title="Open time picker"
          aria-label="Open time picker"
        >
          <Clock className="pointer-events-none h-4 w-4" />
        </div>
      </div>

      <input type="hidden" name={name} value={value ?? ""} />
    </div>
  );
}

export default FormDateTimeInput;
