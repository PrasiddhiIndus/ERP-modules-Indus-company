import React from "react";
import {
  currentPeriodDateIso,
  currentPeriodKey,
  dateToPeriodKey,
  periodKeyToDateInput,
  formatPeriodDateDDMMYYYY,
  parsePeriodKey,
} from "../lib/periods";

/**
 * Period picker shown as DD/MM/YYYY (native date input).
 * Internally maps to monthly period keys (YYYY-MM) for backward-compatible storage.
 */
export function PeriodDateSelect({
  value,
  onChange,
  className = "",
  inputClassName = "",
  maxDate,
  showFormattedHint = true,
}) {
  const periodKey = value || currentPeriodKey();
  const dateVal = periodKeyToDateInput(periodKey);
  const max = maxDate || currentPeriodDateIso();

  return (
    <div className={`period-date-select ${className}`}>
      <input
        type="date"
        className={inputClassName || "pl-date-input"}
        value={dateVal}
        max={max}
        onChange={(e) => {
          const pk = dateToPeriodKey(e.target.value);
          if (pk) onChange(pk);
        }}
        aria-label="Period date"
      />
      {showFormattedHint && parsePeriodKey(periodKey) && (
        <span className="pl-date-hint" aria-hidden>
          {formatPeriodDateDDMMYYYY(periodKey)}
        </span>
      )}
    </div>
  );
}

export { formatPeriodDateDDMMYYYY };
