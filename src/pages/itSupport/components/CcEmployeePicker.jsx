import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { TinyInput } from "../../../components/erpUi";
import { searchEmployeesForCc } from "../itSupportApi";

/**
 * Typeahead against Employee Master / Indus One logins.
 * Typing a name shows matches to select; selected people appear as chips (CC list).
 */
export default function CcEmployeePicker({ value = [], onChange, disabled = false }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hint, setHint] = useState("");
  const timer = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setHint(q.length === 1 ? "Keep typing to search Employee Master…" : "");
      return undefined;
    }
    setSearching(true);
    setHint("Select a person from Employee Master");
    timer.current = setTimeout(async () => {
      try {
        const rows = await searchEmployeesForCc(q);
        const selected = new Set((value || []).map((p) => p.profileId));
        setResults((rows || []).filter((r) => r.profileId && !selected.has(r.profileId)));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [term, value]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setResults([]);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const add = (person) => {
    if (!person?.profileId) return;
    if ((value || []).some((p) => p.profileId === person.profileId)) return;
    onChange?.([...(value || []), person]);
    setTerm("");
    setResults([]);
    setHint("");
  };

  const remove = (profileId) => {
    onChange?.((value || []).filter((p) => p.profileId !== profileId));
  };

  return (
    <div ref={wrapRef} className="space-y-2">
      {(value || []).length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {(value || []).map((p) => (
            <li
              key={p.profileId}
              className="inline-flex items-center gap-1 max-w-full rounded-full border border-border bg-surface-sunken pl-2.5 pr-1 py-0.5 text-[11px] text-ink-strong"
            >
              <span className="truncate">
                {p.fullName}
                {p.employeeCode ? (
                  <span className="text-ink-muted"> · {p.employeeCode}</span>
                ) : null}
              </span>
              {!disabled ? (
                <button
                  type="button"
                  className="shrink-0 rounded-full p-0.5 text-ink-muted hover:bg-surface hover:text-ink-strong"
                  aria-label={`Remove ${p.fullName} from CC`}
                  onClick={() => remove(p.profileId)}
                >
                  <X className="w-3 h-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <TinyInput
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Type a name or employee code…"
          className="w-full"
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
        />
        {hint || searching ? (
          <p className="mt-1 text-[10px] text-ink-muted">
            {searching ? "Searching Employee Master…" : hint}
          </p>
        ) : null}
        {results.length > 0 ? (
          <ul className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-card">
            {results.map((r) => (
              <li key={r.profileId}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-xs hover:bg-surface-sunken"
                  onClick={() => add(r)}
                >
                  <span className="font-medium text-ink-strong">{r.fullName}</span>
                  <span className="text-ink-muted">
                    {" "}
                    {[r.employeeCode, r.designation].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : term.trim().length >= 2 && !searching ? (
          <p className="mt-1 text-[10px] text-ink-muted">
            No matching employee with an Indus One login. Try another spelling.
          </p>
        ) : null}
      </div>
    </div>
  );
}
