import React from "react";
import { currentPeriodKey, formatPeriodDateDDMMYYYY, parsePeriodKey } from "../lib/periods";
import { PeriodMonthSelect } from "./PeriodMonthSelect";

/**
 * Monthly period picker (year + month) — avoids native date inputs that show mm/dd/yyyy in US locale.
 */
export function PeriodDateSelect({
  value,
  onChange,
  className = "",
  inputClassName = "",
  showFormattedHint = false,
}) {
  const periodKey = value || currentPeriodKey();

  return (
    <div className={`period-date-select ${className}`}>
      <PeriodMonthSelect
        value={periodKey}
        onChange={onChange}
        selectClassName={inputClassName || "pl-date-input"}
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
