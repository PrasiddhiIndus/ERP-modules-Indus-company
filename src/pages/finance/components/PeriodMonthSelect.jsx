import React from "react";
import {
  buildYearOptions,
  MONTH_NUMBERS,
  parsePeriodKey,
  currentPeriodKey,
} from "../lib/periods";

/**
 * Year + month pickers for any timeline within PERIOD_START_YEAR–PERIOD_END_YEAR.
 */
export function PeriodMonthSelect({
  value,
  onChange,
  className = "",
  selectClassName = "",
  allowEmpty = false,
  emptyLabel = "—",
}) {
  const cur = parsePeriodKey(value) || parsePeriodKey(currentPeriodKey());
  const years = buildYearOptions();

  if (allowEmpty && !value) {
    return (
      <div className={`period-month-select ${className}`}>
        <select
          className={selectClassName}
          value=""
          onChange={(e) => {
            if (!e.target.value) onChange("");
            else {
              const [, y, m] = e.target.value.match(/^(\d{4})-(\d{2})$/) || [];
              if (y && m) onChange(`${y}-${m}`);
            }
          }}
        >
          <option value="">{emptyLabel}</option>
          {years.flatMap((y) =>
            MONTH_NUMBERS.map((mn) => (
              <option key={`${y}-${mn.value}`} value={`${y}-${String(mn.value).padStart(2, "0")}`}>
                {mn.label} {y}
              </option>
            )),
          )}
        </select>
      </div>
    );
  }

  const parsed = cur || { year: years[0], month: 1 };

  const setYear = (y) => {
    onChange(`${Number(y)}-${String(parsed.month).padStart(2, "0")}`);
  };
  const setMonth = (m) => {
    onChange(`${parsed.year}-${String(Number(m)).padStart(2, "0")}`);
  };

  return (
    <div className={`period-month-select ${className}`}>
      <select className={selectClassName} value={parsed.month} onChange={(e) => setMonth(e.target.value)}>
        {MONTH_NUMBERS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select className={selectClassName} value={parsed.year} onChange={(e) => setYear(e.target.value)}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
