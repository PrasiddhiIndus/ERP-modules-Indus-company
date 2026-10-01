import React, { useEffect, useState } from "react";
import { Modal } from "../adminOperations/components/AdminUi";
import { ManagerSearchSelect } from "../../components/employee/ManagerSearchSelect";
import { supabase } from "../../lib/supabase";
import { formatPeopleDirectoryError, setPeopleHrLeads } from "../../lib/peopleDirectoryApi";
import { toast } from "../../lib/toast";

/**
 * Bulk assign L1 / L2 HR leads to the selected people.
 * Each lead is opt-in so an unrelated lead is never overwritten by accident.
 */
export default function HrLeadsAssignModal({ open, personIds, hrTeam, onClose, onSaved }) {
  const [changeL1, setChangeL1] = useState(true);
  const [changeL2, setChangeL2] = useState(false);
  const [l1, setL1] = useState({ code: "", name: "" });
  const [l2, setL2] = useState({ code: "", name: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setChangeL1(true);
    setChangeL2(false);
    setL1({ code: "", name: "" });
    setL2({ code: "", name: "" });
    setError("");
  }, [open]);

  const count = personIds?.length || 0;

  const save = async () => {
    setError("");
    if (!changeL1 && !changeL2) {
      setError("Choose at least one lead to change.");
      return;
    }
    if (changeL1 && changeL2 && l1.code && l1.code === l2.code) {
      setError("L1 and L2 must be different people.");
      return;
    }
    setSaving(true);
    try {
      const updated = await setPeopleHrLeads(supabase, {
        personIds,
        setL1: changeL1,
        l1Code: l1.code,
        setL2: changeL2,
        l2Code: l2.code,
      });
      toast.success("HR leads updated", `${updated} employee${updated === 1 ? "" : "s"} updated.`);
      onSaved?.();
    } catch (err) {
      console.error("Bulk HR lead update failed", err);
      setError(formatPeopleDirectoryError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Assign HR leads · ${count} selected`}
      onClose={saving ? () => {} : onClose}
      widthClass="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-8 px-3 rounded-md text-xs font-medium border border-gray-300 bg-white hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || count === 0}
            className="h-8 px-3 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-deep disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save leads"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-600">
          Leads are chosen from the active HR team in Employee Master. Leave a lead empty to clear it. Previous leads stay in
          each employee&apos;s change history.
        </p>

        <div className="space-y-2">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
            <input type="checkbox" checked={changeL1} onChange={(e) => setChangeL1(e.target.checked)} />
            Change L1 lead
          </label>
          {changeL1 ? (
            <ManagerSearchSelect
              label="L1 lead (direct)"
              valueCode={l1.code}
              valueName={l1.name}
              candidates={hrTeam}
              onChange={setL1}
              placeholder="Search HR team by name or code…"
            />
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
            <input type="checkbox" checked={changeL2} onChange={(e) => setChangeL2(e.target.checked)} />
            Change L2 lead
          </label>
          {changeL2 ? (
            <ManagerSearchSelect
              label="L2 lead (skip-level)"
              valueCode={l2.code}
              valueName={l2.name}
              candidates={hrTeam}
              onChange={setL2}
              placeholder="Search HR team by name or code…"
            />
          ) : null}
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
