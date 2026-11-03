/** Employee multi-select for survey audiences — search by code / name / department / site. */
import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { TinyInput, TinySelect, SecondaryButton } from "../../../components/erpUi";

const MAX_VISIBLE = 200;

function keyOf(code) {
  return String(code || "").trim().toUpperCase();
}

export default function SurveyAudiencePicker({ employees, loading, selectedCodes, onChange }) {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [site, setSite] = useState("");

  const selectedKeys = useMemo(() => new Set(selectedCodes.map(keyOf)), [selectedCodes]);
  const byKey = useMemo(() => new Map(employees.map((e) => [keyOf(e.employee_code), e])), [employees]);

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(),
    [employees]
  );
  const sites = useMemo(() => [...new Set(employees.map((e) => e.site).filter(Boolean))].sort(), [employees]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (department && e.department !== department) return false;
      if (site && e.site !== site) return false;
      if (!q) return true;
      return `${e.employee_code} ${e.full_name} ${e.department} ${e.designation} ${e.site}`.toLowerCase().includes(q);
    });
  }, [employees, search, department, site]);

  const toggle = (code) => {
    const k = keyOf(code);
    onChange(selectedKeys.has(k) ? selectedCodes.filter((c) => keyOf(c) !== k) : [...selectedCodes, code]);
  };

  const addAllMatches = () => {
    const next = [...selectedCodes];
    matches.forEach((e) => {
      if (!selectedKeys.has(keyOf(e.employee_code))) next.push(e.employee_code);
    });
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <TinyInput
          type="search"
          placeholder="Search code, name, designation"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-64 text-sm font-medium text-ink-strong placeholder:text-ink-muted"
          aria-label="Search employees"
        />
        <TinySelect
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          aria-label="Department"
          className="h-10 text-sm font-medium text-ink-strong"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </TinySelect>
        <TinySelect
          value={site}
          onChange={(e) => setSite(e.target.value)}
          aria-label="Site"
          className="h-10 text-sm font-medium text-ink-strong"
        >
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </TinySelect>
        <SecondaryButton onClick={addAllMatches} disabled={!matches.length}>
          Add all {matches.length} matching
        </SecondaryButton>
        {selectedCodes.length ? (
          <SecondaryButton onClick={() => onChange([])}>Clear selection</SecondaryButton>
        ) : null}
      </div>

      {selectedCodes.length ? (
        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
          {selectedCodes.map((code) => {
            const emp = byKey.get(keyOf(code));
            return (
              <span
                key={code}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-accent-soft px-2.5 py-1 text-xs font-medium text-ink-strong"
              >
                <span className="font-mono">{code}</span>
                {emp?.full_name ? <span className="text-ink-secondary">{emp.full_name}</span> : null}
                {!emp && !loading ? <span className="text-critical">not active</span> : null}
                <button
                  type="button"
                  onClick={() => toggle(code)}
                  className="text-ink-muted hover:text-ink"
                  aria-label={`Remove ${code}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="rounded-lg border border-border max-h-72 overflow-y-auto">
        {loading ? (
          <p className="px-3 py-6 text-center text-sm text-ink-secondary">Loading employees…</p>
        ) : matches.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-ink-secondary">No active employees match.</p>
        ) : (
          <ul className="divide-y divide-divider">
            {matches.slice(0, MAX_VISIBLE).map((e) => {
              const checked = selectedKeys.has(keyOf(e.employee_code));
              return (
                <li key={e.employee_code}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-row-hover">
                    <input type="checkbox" checked={checked} onChange={() => toggle(e.employee_code)} />
                    <span className="w-24 shrink-0 font-mono font-medium text-ink-strong">{e.employee_code}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink-strong">{e.full_name || "—"}</span>
                    <span className="hidden w-40 truncate text-ink-secondary md:block">{e.department}</span>
                    <span className="hidden w-40 truncate text-ink-secondary lg:block">{e.site}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {matches.length > MAX_VISIBLE ? (
          <p className="border-t border-divider px-3 py-2.5 text-xs text-ink-secondary">
            Showing first {MAX_VISIBLE} of {matches.length}. Narrow the search, or use &quot;Add all matching&quot;.
          </p>
        ) : null}
      </div>
    </div>
  );
}
