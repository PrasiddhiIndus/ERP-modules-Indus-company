import React, { useMemo, useState } from "react";
import { Modal } from "../../adminOperations/components/AdminUi";

function displayVal(v) {
  const s = v == null ? "" : String(v).trim();
  return s || "—";
}

/**
 * Preview + selective update for Employee Master Excel import.
 */
export default function EmployeeMasterImportModal({
  open,
  onClose,
  preview,
  busy,
  onConfirm,
}) {
  const [updateSelections, setUpdateSelections] = useState(() => ({}));

  // Reset selections when preview identity changes
  const previewKey = useMemo(() => {
    if (!preview) return "";
    return `${preview.newEmployees?.length || 0}-${preview.updates?.length || 0}-${(preview.errors || []).length}`;
  }, [preview]);

  React.useEffect(() => {
    if (!preview?.updates) {
      setUpdateSelections({});
      return;
    }
    const next = {};
    preview.updates.forEach((u, ui) => {
      next[ui] = {};
      (u.changes || []).forEach((c, ci) => {
        next[ui][ci] = c.selected !== false;
      });
    });
    setUpdateSelections(next);
  }, [previewKey, preview]);

  if (!open || !preview) return null;

  const { newEmployees = [], updates = [], errors = [], skippedBlank = 0 } = preview;
  const canProceed =
    !busy &&
    (newEmployees.length > 0 ||
      updates.some((u, ui) => (u.changes || []).some((_, ci) => updateSelections[ui]?.[ci])));

  const toggleField = (ui, ci) => {
    setUpdateSelections((prev) => ({
      ...prev,
      [ui]: { ...(prev[ui] || {}), [ci]: !prev[ui]?.[ci] },
    }));
  };

  const selectAllForUpdate = (ui, value) => {
    const u = updates[ui];
    if (!u) return;
    const map = {};
    (u.changes || []).forEach((_, ci) => {
      map[ci] = value;
    });
    setUpdateSelections((prev) => ({ ...prev, [ui]: map }));
  };

  const handleConfirm = () => {
    const selectedUpdates = updates
      .map((u, ui) => {
        const patch = {};
        (u.changes || []).forEach((c, ci) => {
          if (!updateSelections[ui]?.[ci]) return;
          patch[c.field] = c.importValue !== undefined ? c.importValue : c.newValue;
        });
        if (!Object.keys(patch).length) return null;
        // Coerce numeric other_experience
        if (patch.other_experience != null && patch.other_experience !== "") {
          const n = Number(patch.other_experience);
          patch.other_experience = Number.isFinite(n) ? n : patch.other_experience;
        }
        if (patch.educational_qualification != null) {
          patch.qualification = patch.educational_qualification;
        }
        return {
          employeeId: u.employeeId,
          employeeCode: u.employeeCode,
          patch,
        };
      })
      .filter(Boolean);

    onConfirm({
      newEmployees,
      selectedUpdates,
    });
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose?.();
      }}
      title="Import preview — Employee Master"
      widthClass="max-w-3xl"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
            onClick={handleConfirm}
            disabled={!canProceed}
          >
            {busy ? "Importing…" : "Confirm import"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-xs text-gray-500">
          Review rows before saving. New employees are created as listed. Existing employees are{" "}
          <strong>not</strong> overwritten automatically — tick only the fields you want to update.
          Changes are written to Employee Master and appear in Change history.
        </p>

        {(errors.length > 0 || skippedBlank > 0) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {skippedBlank > 0 ? <p>{skippedBlank} blank row(s) skipped.</p> : null}
            {errors.length ? (
              <ul className="mt-1 list-disc pl-4 space-y-0.5 max-h-28 overflow-y-auto">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
            {errors.length ? (
              <p className="mt-1">Those rows were skipped. You can still confirm valid rows below.</p>
            ) : null}
          </div>
        )}

        <section>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
            New employees ({newEmployees.length})
          </h5>
          {!newEmployees.length ? (
            <p className="text-xs text-gray-500">No new employee codes in this file.</p>
          ) : (
            <div className="max-h-40 overflow-y-auto rounded border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Code</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Name</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Department</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Designation</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {newEmployees.map((n) => (
                    <tr key={n.employeeCode}>
                      <td className="px-2 py-1.5 font-mono">{n.employeeCode}</td>
                      <td className="px-2 py-1.5">{n.fullName}</td>
                      <td className="px-2 py-1.5">{n.summaryFields?.department || "—"}</td>
                      <td className="px-2 py-1.5">{n.summaryFields?.designation || "—"}</td>
                      <td className="px-2 py-1.5">{n.summaryFields?.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
            Existing employees — choose fields to update ({updates.length})
          </h5>
          {!updates.length ? (
            <p className="text-xs text-gray-500">
              No differing fields for existing employee codes (or all values already match).
            </p>
          ) : (
            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
              {updates.map((u, ui) => (
                <div key={u.employeeId} className="rounded-lg border border-orange-200 bg-orange-50/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-gray-900">
                      {u.fullName}{" "}
                      <span className="font-mono text-xs text-gray-600">({u.employeeCode})</span>
                    </p>
                    <div className="flex gap-2 text-[11px]">
                      <button
                        type="button"
                        className="text-blue-700 hover:underline"
                        onClick={() => selectAllForUpdate(ui, true)}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-gray-600 hover:underline"
                        onClick={() => selectAllForUpdate(ui, false)}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-orange-900 mb-2">
                    These details already exist and will only update if checked:
                  </p>
                  <ul className="space-y-1.5">
                    {(u.changes || []).map((c, ci) => (
                      <li key={c.field} className="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="mt-0.5 rounded border-gray-300"
                          checked={Boolean(updateSelections[ui]?.[ci])}
                          onChange={() => toggleField(ui, ci)}
                          id={`imp-${u.employeeId}-${c.field}`}
                        />
                        <label htmlFor={`imp-${u.employeeId}-${c.field}`} className="cursor-pointer min-w-0">
                          <span className="font-medium text-gray-800">{c.label}</span>
                          <span className="block text-gray-600 break-words">
                            {displayVal(c.oldValue)} → <span className="text-gray-900">{displayVal(c.newValue)}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
