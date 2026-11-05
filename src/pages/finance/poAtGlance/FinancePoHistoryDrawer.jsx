import React, { useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { Drawer } from "../../../components/erpUi";
import { friendlyFinancePoError, listFinancePoFieldHistory } from "./financePoApi";

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return String(iso);
  }
}

function displayValue(v) {
  const s = v == null ? "" : String(v).trim();
  return s || "(empty)";
}

function historySentence(row) {
  const who = String(row?.changed_by_name || "Someone").trim() || "Someone";
  const when = formatWhen(row?.changed_at);
  const field = String(row?.field_label || "a field").trim();
  if (row?.field_key === "__created__") {
    return when ? `${who} created this PO on ${when}.` : `${who} created this PO.`;
  }
  const body = `${who} changed ${field} from ${displayValue(row?.old_value)} to ${displayValue(row?.new_value)}`;
  return when ? `${body} on ${when}.` : `${body}.`;
}

export default function FinancePoHistoryDrawer({ open, onClose, po }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const poId = po?.id;
  const department = po?.department;
  const titleName = String(po?.po_wo_no || po?.client_name || "PO").trim();

  async function load() {
    if (!poId || !department) return;
    setLoading(true);
    setError("");
    try {
      setRows(await listFinancePoFieldHistory(department, poId));
    } catch (err) {
      setRows([]);
      setError(friendlyFinancePoError(err, "Could not load the audit trail."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !poId) {
      setRows([]);
      setError("");
      return undefined;
    }
    void load();
    return undefined;
    // Reload when this PO's history is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, poId, department]);

  return (
    <Drawer open={open} onClose={onClose} title={`Audit trail — ${titleName}`} widthClass="max-w-xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Who changed what, the previous value, the new value, and when.</p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-700 hover:text-slate-900 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading audit trail…</p>
      ) : error ? (
        <p className="py-4 text-sm text-red-700">{error}</p>
      ) : !rows.length ? (
        <div className="py-10 text-center text-slate-500">
          <History className="mx-auto mb-2 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No changes recorded yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs">
            Edits made after the audit trail was turned on appear here, including OC Number and signatures.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800">
              <p className="whitespace-pre-wrap leading-snug">{historySentence(row)}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                <dt className="font-medium text-slate-600">Field</dt>
                <dd>{row.field_label || "Field"}</dd>
                {row.field_key !== "__created__" ? (
                  <>
                    <dt className="font-medium text-slate-600">Previous</dt>
                    <dd className="whitespace-pre-wrap break-words">{displayValue(row.old_value)}</dd>
                    <dt className="font-medium text-slate-600">New</dt>
                    <dd className="whitespace-pre-wrap break-words">{displayValue(row.new_value)}</dd>
                  </>
                ) : null}
                <dt className="font-medium text-slate-600">By</dt>
                <dd>{row.changed_by_name || "—"}</dd>
                <dt className="font-medium text-slate-600">When</dt>
                <dd>{formatWhen(row.changed_at) || "—"}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
