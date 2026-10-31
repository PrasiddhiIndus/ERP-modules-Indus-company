import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Save, UserCheck, X } from "lucide-react";
import FireTenderNavbar from "../FireTenderNavbar";
import { useAuth } from "../../../contexts/AuthContext";
import { ocCanEdit } from "../oc/ocAccess";
import { canOpenIevConfigPage } from "../../../lib/ievConfigAccess";
import { toast } from "../../../lib/toast";
import { OC_SIGNOFF_HEADING } from "../oc/ocModel";
import { IEV_OC_DEPARTMENT } from "../oc/ocDepartment";
import { friendlyOcError, listEmployeeOptions, loadSignoffAssignees, saveSignoffAssignee } from "../oc/ocApi";

const optionLabel = (e) => `${e.employee_code} — ${e.full_name}${e.department ? ` (${e.department})` : ""}`;

/** IEV Configuration: who signs each "WO/PO disseminated to concerned departments" box on a PO At Glance. */
export default function OcSignoffAssignmentPage() {
  const { userProfile, accessibleModules } = useAuth();
  const canConfigure =
    canOpenIevConfigPage(userProfile, "oc-sign-off") &&
    ocCanEdit(userProfile, accessibleModules);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <FireTenderNavbar />
      <OcSignoffAssignmentPanel canConfigure={canConfigure} />
    </div>
  );
}

/** Assignment table for one department's sign-off boxes (IEV by default). */
export function OcSignoffAssignmentPanel({ canConfigure, department = IEV_OC_DEPARTMENT }) {
  const SIGNOFF_SLOTS = department.slots;
  const [employees, setEmployees] = useState([]);
  const [saved, setSaved] = useState({});
  const [draft, setDraft] = useState({});
  const [text, setText] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const byLabel = useMemo(() => new Map(employees.map((e) => [optionLabel(e), e])), [employees]);

  const applySaved = (assignees) => {
    setSaved(assignees);
    setDraft(Object.fromEntries(SIGNOFF_SLOTS.map(({ slot }) => [slot, assignees[slot]?.employee_code || ""])));
    setText(Object.fromEntries(SIGNOFF_SLOTS.map(({ slot }) => {
      const a = assignees[slot];
      return [slot, a ? `${a.employee_code} — ${a.employee_name}` : ""];
    })));
  };

  useEffect(() => {
    let alive = true;
    Promise.all([listEmployeeOptions(department), loadSignoffAssignees(department)])
      .then(([emps, assignees]) => {
        if (!alive) return;
        setEmployees(emps);
        applySaved(assignees);
      })
      .catch((err) => alive && toast.error(friendlyOcError(err, "Could not load the sign-off assignment.", department)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applySaved only reads department.slots
  }, [department]);

  const changed = SIGNOFF_SLOTS.filter(({ slot }) => (draft[slot] || "") !== (saved[slot]?.employee_code || ""));
  const unmatched = SIGNOFF_SLOTS.filter(({ slot }) => (text[slot] || "").trim() && !draft[slot]);

  const onType = (slot, value) => {
    setText((t) => ({ ...t, [slot]: value }));
    const match = byLabel.get(value);
    setDraft((d) => ({ ...d, [slot]: match ? match.employee_code : "" }));
  };

  const onClear = (slot) => {
    setText((t) => ({ ...t, [slot]: "" }));
    setDraft((d) => ({ ...d, [slot]: "" }));
  };

  const onSave = async () => {
    if (unmatched.length) {
      toast.error("Pick each person from the list.");
      return;
    }
    setSaving(true);
    try {
      for (const { slot } of changed) {
        const code = draft[slot];
        await saveSignoffAssignee(slot, code ? employees.find((e) => e.employee_code === code) : null, department);
      }
      applySaved(await loadSignoffAssignees(department));
      toast.success("Sign-off assignment saved.");
    } catch (err) {
      toast.error(friendlyOcError(err, "Could not save the sign-off assignment.", department));
    } finally {
      setSaving(false);
    }
  };

  return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">PO At Glance Sign-off Assignment</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Choose who signs each box under “{OC_SIGNOFF_HEADING}”. On a PO At Glance, each person can sign only the box assigned
              to them; every other box is grey and read-only. A box with no one assigned cannot be signed.
            </p>
          </div>
          {canConfigure && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving || loading || changed.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="w-1/3 px-4 py-2">Department box</th>
                <th className="px-4 py-2">Assigned person (Employee Master)</th>
              </tr>
            </thead>
            <tbody>
              {SIGNOFF_SLOTS.map(({ slot, label }) => {
                const isUnmatched = (text[slot] || "").trim() && !draft[slot];
                return (
                  <tr key={slot} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 font-medium text-slate-800">{label}</td>
                    <td className="px-4 py-3">
                      {canConfigure ? (
                        <div className="flex max-w-xl items-center gap-2">
                          <input
                            list="oc-signoff-employees"
                            value={text[slot] || ""}
                            onChange={(e) => onType(slot, e.target.value)}
                            placeholder="Search by employee code or name"
                            aria-label={`${label} — assigned person`}
                            className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-100 ${
                              isUnmatched ? "border-amber-400" : "border-slate-300 focus:border-red-400"
                            }`}
                          />
                          {(text[slot] || draft[slot]) && (
                            <button type="button" onClick={() => onClear(slot)} aria-label={`Clear ${label}`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ) : saved[slot] ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-800">
                          <UserCheck className="h-4 w-4 text-emerald-600" /> {saved[slot].employee_code} — {saved[slot].employee_name}
                        </span>
                      ) : (
                        <span className="text-slate-400">No one assigned</span>
                      )}
                      {isUnmatched && <p className="mt-1 text-xs text-amber-700">Pick a person from the list.</p>}
                      {canConfigure && !draft[slot] && !isUnmatched && <p className="mt-1 text-xs text-slate-400">No one assigned — this box cannot be signed.</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <datalist id="oc-signoff-employees">
          {employees.map((e) => <option key={e.employee_code} value={optionLabel(e)} />)}
        </datalist>
        {!canConfigure && !loading && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">You can view this assignment but not change it.</p>
        )}
      </div>
  );
}
