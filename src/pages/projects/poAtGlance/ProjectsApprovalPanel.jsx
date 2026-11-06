import React, { useState } from "react";
import { AlertTriangle, BadgeCheck, Clock, History, Loader2, RotateCcw, Send, Undo2, UserPlus, X } from "lucide-react";
import { formatSignedAt, isBlank } from "../oc/ocModel";

const ACTION_META = {
  CREATED: { label: "OC created", icon: UserPlus, cls: "text-slate-600" },
  APPROVED: { label: "Approved", icon: BadgeCheck, cls: "text-emerald-700" },
  MODIFICATION_REQUESTED: { label: "Modification requested", icon: Undo2, cls: "text-amber-700" },
  RESUBMITTED: { label: "Resubmitted", icon: Send, cls: "text-sky-700" },
  SIGNATURE_REMOVED: { label: "Signature removed", icon: RotateCcw, cls: "text-slate-500" },
};

/** Latest Request Modification that has not yet been answered by a resubmission, or null. */
export function openModificationRequest(log) {
  for (let i = (log || []).length - 1; i >= 0; i -= 1) {
    const e = log[i];
    if (e.action === "RESUBMITTED") return null;
    if (e.action === "MODIFICATION_REQUESTED") return e;
  }
  return null;
}

function RequestModificationModal({ open, saving, onClose, onSubmit }) {
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  if (!open) return null;
  const submit = () => {
    if (!remarks.trim()) {
      setError("Remarks are required.");
      return;
    }
    onSubmit(remarks.trim());
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Send for revision</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Remarks are required. The PO goes back to the person who created it, and approval starts again from the first stage.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-3">
          <label className="text-xs font-medium text-slate-700">
            Remarks<span className="ml-0.5 text-red-600">*</span>
            <textarea
              rows={4}
              autoFocus
              className={`mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 ${error ? "border-red-400" : "border-slate-300"}`}
              placeholder="What needs to be revised?"
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value);
                if (error) setError("");
              }}
            />
          </label>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Send for revision
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Projects PO At Glance: current approval status, stage-wise status, Department Head "Request Modification",
 * and the full approval / modification history of the OC.
 */
export default function ProjectsApprovalPanel({ slots, signoff, log, loading, canRequestModification, iAmCreator, onRequestModification }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const returned = openModificationRequest(log);
  const signed = (slot) => !isBlank(signoff?.[slot]?.saved_by);
  const nextIndex = slots.findIndex((s) => !signed(s.slot));
  const labelOf = (slot) => slots.find((s) => s.slot === slot)?.label || "";
  const stageNo = (slot) => slots.findIndex((s) => s.slot === slot) + 1;

  let current;
  if (returned) {
    current = { cls: "border-amber-200 bg-amber-50 text-amber-900", text: "Returned to the creator for modification" };
  } else if (nextIndex === -1) {
    current = { cls: "border-emerald-200 bg-emerald-50 text-emerald-900", text: "All stages approved" };
  } else {
    current = {
      cls: "border-sky-200 bg-sky-50 text-sky-900",
      text: `Awaiting ${slots[nextIndex].label} approval (Stage ${nextIndex + 1} of ${slots.length})`,
    };
  }

  const submit = async (remarks) => {
    setSaving(true);
    try {
      const ok = await onRequestModification(remarks);
      if (ok) setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <History className="h-4 w-4 text-slate-500" /> Approval status &amp; history
        </p>
        {canRequestModification && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <Undo2 className="h-3.5 w-3.5" /> Send for revision
          </button>
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className={`rounded-lg border px-3 py-2 text-xs ${current.cls}`}>
          <p className="font-semibold">Current status: {current.text}</p>
          {returned && (
            <p className="mt-1 flex items-start gap-1">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                {returned.actor_name} on {formatSignedAt(returned.created_at)}: “{returned.remarks}”
                {iAmCreator ? " — make the corrections and use Resubmit for approval." : " — waiting for the creator to resubmit."}
              </span>
            </p>
          )}
        </div>

        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {slots.map(({ slot, label }, i) => {
            const done = signed(slot);
            const status = returned && i === 0 && !done
              ? "Returned"
              : done ? "Approved" : i === nextIndex && !returned ? "Pending — current stage" : "Pending";
            const chip = status === "Approved"
              ? "bg-emerald-100 text-emerald-800"
              : status === "Returned" ? "bg-amber-100 text-amber-800"
                : status.startsWith("Pending — ") ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600";
            return (
              <li key={slot} className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-[11px] text-slate-500">Stage {i + 1}</p>
                <p className="text-xs font-semibold text-slate-800">{label}</p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip}`}>{status}</span>
                {done && (
                  <p className="mt-1 text-[11px] text-slate-600">
                    {signoff[slot].saved_by} · {formatSignedAt(signoff[slot].signed_at)}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        <div className="overflow-x-auto">
          {loading ? (
            <p className="flex items-center gap-1.5 py-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
            </p>
          ) : !log?.length ? (
            <p className="py-2 text-xs text-slate-400">No history recorded yet.</p>
          ) : (
            <table className="w-full min-w-[40rem] text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-1.5 pr-3 font-medium">Date &amp; time</th>
                  <th className="py-1.5 pr-3 font-medium">Action</th>
                  <th className="py-1.5 pr-3 font-medium">Stage</th>
                  <th className="py-1.5 pr-3 font-medium">User</th>
                  <th className="py-1.5 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {[...log].reverse().map((e) => {
                  const meta = ACTION_META[e.action] || { label: e.action, icon: Clock, cls: "text-slate-600" };
                  const Icon = meta.icon;
                  return (
                    <tr key={e.id} className="border-b border-slate-100 align-top last:border-0">
                      <td className="whitespace-nowrap py-1.5 pr-3 text-slate-700">{formatSignedAt(e.created_at)}</td>
                      <td className={`whitespace-nowrap py-1.5 pr-3 font-medium ${meta.cls}`}>
                        <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" /> {meta.label}</span>
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-slate-700">
                        {e.slot ? `Stage ${stageNo(e.slot)} · ${labelOf(e.slot)}` : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-700">{e.actor_name}</td>
                      <td className="py-1.5 text-slate-700">
                        {e.remarks || (e.backfilled ? <span className="text-slate-400">Recorded before history tracking</span> : "—")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <RequestModificationModal key={modalOpen ? "open" : "closed"} open={modalOpen} saving={saving} onClose={() => setModalOpen(false)} onSubmit={submit} />
    </div>
  );
}
