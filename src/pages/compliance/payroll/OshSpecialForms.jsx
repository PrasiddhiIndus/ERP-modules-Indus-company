import React from "react";
import { Plus, X } from "lucide-react";
import FormDateInput from "../../../components/FormDateInput";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";

const DATE_KEYS = new Set(["dob", "joiningDate", "issueDate", "exitDate", "lieuPayDate", "leaveFrom", "leaveTo", "dischargeDate"]);
const IMAGE_KEYS = new Set(["photo", "workerSign", "managerSign", "workerSignature"]);

function readImage(file) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function ImageMark({ value, onChange, readOnly }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {value ? <img src={value} alt="" className="h-8 w-12 rounded border border-slate-200 object-contain" /> : null}
      {readOnly ? null : (
        <>
          <label className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 hover:border-accent hover:text-accent">
            <Plus className="h-3.5 w-3.5" />
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (event) => {
                const next = await readImage(event.target.files?.[0]);
                event.target.value = "";
                if (next) onChange(next);
              }}
            />
          </label>
          {value ? (
            <button type="button" className="inline-flex h-6 w-6 items-center justify-center text-slate-400 hover:text-red-600" onClick={() => onChange("")} aria-label="Remove upload">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </>
      )}
    </span>
  );
}

function TextValue({ value, date }) {
  const shown = date ? formatDateDdMmYyyy(value) : value;
  return <p className="min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900">{shown || "—"}</p>;
}

function Entry({ label, value, onChange, readOnly, date, image }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-slate-800">{label}</span>
      {image ? (
        <ImageMark value={value} onChange={onChange} readOnly={readOnly} />
      ) : readOnly ? (
        <TextValue value={value} date={date} />
      ) : date ? (
        <FormDateInput value={value || ""} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white text-sm" />
      ) : (
        <input
          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function Title({ form }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white px-4 py-4 text-center sm:px-5">
      <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{form.title}</h2>
      <p className="mt-1 text-xs text-slate-500">{form.rule}</p>
      <p className="mt-1.5 text-sm font-medium text-slate-800">{form.name}</p>
      {form.note ? <p className="mx-auto mt-2 max-w-2xl text-xs leading-relaxed text-slate-500">{form.note}</p> : null}
    </section>
  );
}

export function OshIdentityCards({ form, rows = [], onRows, readOnly = false }) {
  const cards = rows.length ? rows : [{}];
  const update = (index, key, value) => onRows(cards.map((card, cardIndex) => (cardIndex === index ? { ...card, [key]: value } : card)));

  return (
    <div className="space-y-4">
      <Title form={form} />
      {cards.map((card, index) => (
        <section key={index} className="space-y-4 rounded-lg border border-slate-200 bg-white px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">S.No. {index + 1}</p>
            {readOnly || cards.length < 2 ? null : (
              <button type="button" className="inline-flex h-7 w-7 items-center justify-center text-slate-400 hover:text-red-600" onClick={() => onRows(cards.filter((_, cardIndex) => cardIndex !== index))} aria-label="Remove card">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {form.columns.map((column) => (
              <Entry
                key={column.key}
                label={column.label}
                value={card[column.key]}
                readOnly={readOnly}
                date={DATE_KEYS.has(column.key)}
                image={IMAGE_KEYS.has(column.key)}
                onChange={(value) => update(index, column.key, value)}
              />
            ))}
          </div>
        </section>
      ))}
      {readOnly ? null : (
        <button type="button" className="text-sm font-medium text-accent" onClick={() => onRows([...cards, {}])}>
          Add identity card
        </button>
      )}
    </div>
  );
}

const YEAR_SPLITS = [
  ["calendarYear", "leaveDue", "leaveFrom", "leaveTo", "leaveDays"],
  ["daysWorked", "layOff", "maternity", "leaveEnjoyed", "workingTotal", "regularLeave", "leaveBalance"],
  ["paidLeaveDays", "wageRate", "totalAmount", "dischargeDate", "balanceDays", "dischargeRate", "dischargePayment", "workerSignature"],
];

function blankYear(columns) {
  return Object.fromEntries((columns || []).map((column) => [column.key, ""]));
}

export function OshLeaveRegister({ form, rows = [], onRows, readOnly = false }) {
  const workers = rows.length ? rows : [{}];
  const yearColumns = form.yearColumns || [];
  const columnByKey = Object.fromEntries(yearColumns.map((column) => [column.key, column]));

  const updateWorker = (index, patch) => onRows(workers.map((worker, workerIndex) => (workerIndex === index ? { ...worker, ...patch } : worker)));
  const yearsOf = (worker) => (Array.isArray(worker.years) && worker.years.length ? worker.years : [blankYear(yearColumns)]);

  return (
    <div className="space-y-4">
      <Title form={form} />
      {workers.map((worker, index) => {
        const years = yearsOf(worker);
        const setYears = (next) => updateWorker(index, { years: next });
        return (
          <section key={index} className="space-y-4 rounded-lg border border-slate-200 bg-white px-4 py-4 sm:px-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">S.No. {index + 1}</p>
              {readOnly || workers.length < 2 ? null : (
                <button type="button" className="inline-flex h-7 w-7 items-center justify-center text-slate-400 hover:text-red-600" onClick={() => onRows(workers.filter((_, workerIndex) => workerIndex !== index))} aria-label="Remove worker">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-3">
                {form.columns.slice(0, 7).map((column, fieldIndex) => (
                  <Entry key={column.key} label={`${fieldIndex + 1}. ${column.label}`} value={worker[column.key]} readOnly={readOnly} date={DATE_KEYS.has(column.key)} onChange={(value) => updateWorker(index, { [column.key]: value })} />
                ))}
              </div>
              <div className="space-y-3">
                {form.columns.slice(7, 9).map((column, fieldIndex) => (
                  <Entry key={column.key} label={`${fieldIndex + 8}. ${column.label}`} value={worker[column.key]} readOnly={readOnly} date={DATE_KEYS.has(column.key)} onChange={(value) => updateWorker(index, { [column.key]: value })} />
                ))}
              </div>
              <div>
                {form.columns[9] ? (
                  <Entry label={`10. ${form.columns[9].label}`} value={worker[form.columns[9].key]} readOnly={readOnly} onChange={(value) => updateWorker(index, { [form.columns[9].key]: value })} />
                ) : null}
              </div>
            </div>
            {YEAR_SPLITS.map((keys) => (
              <div key={keys[0]} className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-max min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#eef2f6]">
                      <th className="border border-slate-200 px-2 py-1.5 text-left text-[12px] font-medium text-slate-500">S.No.</th>
                      {keys.map((key) => (
                        <th key={key} className="border border-slate-200 px-2 py-1.5 text-left text-[12px] font-medium text-slate-500">
                          {columnByKey[key]?.group ? <span className="mb-0.5 block text-[11px] font-normal">{columnByKey[key].group}</span> : null}
                          {columnByKey[key]?.label || key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((year, yearIndex) => (
                      <tr key={yearIndex}>
                        <td className="border border-slate-200 px-2 text-center text-slate-500">{yearIndex + 1}</td>
                        {keys.map((key) => (
                          <td key={key} className="border border-slate-200 p-0">
                            {IMAGE_KEYS.has(key) ? (
                              <div className="px-2 py-1">
                                <ImageMark value={year[key]} readOnly={readOnly} onChange={(value) => setYears(years.map((item, itemIndex) => (itemIndex === yearIndex ? { ...item, [key]: value } : item)))} />
                              </div>
                            ) : readOnly ? (
                              <div className="h-7 px-2 text-[13px] leading-7 text-slate-700">{DATE_KEYS.has(key) ? formatDateDdMmYyyy(year[key]) || "—" : year[key] || "—"}</div>
                            ) : DATE_KEYS.has(key) ? (
                              <div className="min-w-[9.5rem] px-1 py-1">
                                <FormDateInput compact value={year[key] || ""} onChange={(event) => setYears(years.map((item, itemIndex) => (itemIndex === yearIndex ? { ...item, [key]: event.target.value } : item)))} className="h-7 rounded border border-slate-300 bg-white text-sm" />
                              </div>
                            ) : (
                              <input
                                className="h-7 w-full min-w-[8rem] bg-transparent px-2 text-[13px] text-slate-700 outline-none focus:ring-2 focus:ring-inset focus:ring-accent/30"
                                value={year[key] || ""}
                                onChange={(event) => setYears(years.map((item, itemIndex) => (itemIndex === yearIndex ? { ...item, [key]: event.target.value } : item)))}
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {readOnly ? null : (
              <button type="button" className="text-sm font-medium text-accent" onClick={() => setYears([...years, blankYear(yearColumns)])}>
                Add a year
              </button>
            )}
          </section>
        );
      })}
      {readOnly ? null : (
        <button type="button" className="text-sm font-medium text-accent" onClick={() => onRows([...workers, {}])}>
          Add a worker
        </button>
      )}
    </div>
  );
}
