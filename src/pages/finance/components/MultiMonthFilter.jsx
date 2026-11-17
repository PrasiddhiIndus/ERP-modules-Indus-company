import React, { useEffect, useMemo, useState } from "react";
import { CalendarRange, CheckSquare, XSquare } from "lucide-react";
import {
  currentPeriodKey,
  describeMonthSelection,
  financialYearOf,
  fyLabel,
  fyMonthKeys,
  monthLabelOf,
  normalizeMonthSelection,
  periodKeysBetween,
  comparePeriodKeys,
} from "../lib/periods";
import { PeriodDateSelect } from "./PeriodDateSelect";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Multi-select month filter with Financial Year and date-range shortcuts.
 *
 * value     — array of period keys (YYYY-MM); always emitted de-duplicated and sorted.
 * dataKeys  — optional Set of period keys that have entries (shown with a dot).
 */
export function MultiMonthFilter({ value, onChange, dataKeys, labelFn = monthLabelOf, showMonths = true }) {
  const selected = useMemo(() => normalizeMonthSelection(value), [value]);
  const selSet = useMemo(() => new Set(selected), [selected]);
  const curFy = financialYearOf(currentPeriodKey());

  const [fy, setFy] = useState(() => financialYearOf(selected[selected.length - 1]) ?? curFy);
  const [rangeFrom, setRangeFrom] = useState(selected[0] || currentPeriodKey());
  const [rangeTo, setRangeTo] = useState(selected[selected.length - 1] || currentPeriodKey());

  // Keep the browsed FY in view when the selection jumps elsewhere (e.g. parent reset).
  useEffect(() => {
    if (!selected.length) return;
    if (!selected.some((k) => financialYearOf(k) === fy)) setFy(financialYearOf(selected[selected.length - 1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const fyOptions = useMemo(() => {
    const years = new Set([curFy, curFy - 1, curFy - 2]);
    (dataKeys ? [...dataKeys] : []).forEach((k) => {
      const y = financialYearOf(k);
      if (y != null) years.add(y);
    });
    selected.forEach((k) => years.add(financialYearOf(k)));
    return [...years].filter((y) => y != null).sort((a, b) => b - a);
  }, [curFy, dataKeys, selected]);

  const fyKeys = useMemo(() => fyMonthKeys(fy), [fy]);
  const emit = (keys) => onChange(normalizeMonthSelection(keys));

  const toggle = (k) => emit(selSet.has(k) ? selected.filter((x) => x !== k) : [...selected, k]);
  const selectFy = (y) => {
    setFy(y);
    emit(fyMonthKeys(y));
  };
  const selectAllFy = () => emit([...selected, ...fyKeys]);
  const clearAll = () => emit([]);
  const applyRange = () => {
    const keys = periodKeysBetween(rangeFrom, rangeTo);
    if (!keys.length) return;
    setFy(financialYearOf(keys[keys.length - 1]));
    emit(keys);
  };
  const fytd = () => {
    const cur = currentPeriodKey();
    setFy(curFy);
    emit(fyMonthKeys(curFy).filter((k) => comparePeriodKeys(k, cur) <= 0));
  };

  const outsideFy = selected.filter((k) => financialYearOf(k) !== fy).length;

  return (
    <div className="mmf">
      <div className="mmf-row">
        <label className="ov-filter">
          <span>Financial year</span>
          <select value={fy} onChange={(e) => selectFy(Number(e.target.value))}>
            {fyOptions.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
          </select>
        </label>
        <label className="ov-filter range">
          <span>Date range</span>
          <div className="ov-range">
            <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={rangeFrom} onChange={setRangeFrom} />
            <span>–</span>
            <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={rangeTo} onChange={setRangeTo} />
            <button type="button" className="mmf-btn" onClick={applyRange} title="Select every month in this range">
              <CalendarRange size={13} /> Apply
            </button>
          </div>
        </label>
        <div className="mmf-actions">
          <button type="button" className="mmf-btn" onClick={selectAllFy}><CheckSquare size={13} /> Select all</button>
          <button type="button" className="mmf-btn" onClick={fytd}>FY to date</button>
          <button type="button" className="mmf-btn ghost" onClick={clearAll} disabled={!selected.length}><XSquare size={13} /> Clear selection</button>
        </div>
      </div>
      {showMonths && (
      <div className="mmf-months" role="group" aria-label={`Months of ${fyLabel(fy)}`}>
        {fyKeys.map((k) => {
          const m = Number(k.slice(5, 7));
          const on = selSet.has(k);
          const has = dataKeys?.has(k);
          return (
            <button
              key={k}
              type="button"
              className={"mmf-m" + (on ? " on" : "") + (has ? " has" : "")}
              aria-pressed={on}
              title={`${labelFn(k)}${has ? " · has entries" : " · no entries"}`}
              onClick={() => toggle(k)}
            >
              {MONTH_SHORT[m - 1]}<small>{String(k.slice(2, 4))}</small>
            </button>
          );
        })}
      </div>
      )}
      {showMonths && (
      <div className="mmf-sum">
        <b>{selected.length}</b> month{selected.length === 1 ? "" : "s"} selected · {describeMonthSelection(selected, labelFn)}
        {outsideFy > 0 && <span className="muted-s"> · {outsideFy} outside {fyLabel(fy)}</span>}
      </div>
      )}
    </div>
  );
}

export default MultiMonthFilter;
