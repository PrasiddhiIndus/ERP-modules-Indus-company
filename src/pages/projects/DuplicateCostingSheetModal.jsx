import React, { useEffect, useState } from "react";
import { Copy, Loader2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { duplicateCostingSheet } from "../../lib/fireTenderDuplicate";

const SOURCES = ["Mail", "E-Procurement", "Gem Portal", "Consultant", "Individual", "Other"];

const field =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/25";
const label = "block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5";

const emptyForm = {
  client: "",
  phone: "",
  email: "",
  street: "",
  city: "",
  state: "",
  zip: "",
  country: "",
  source: "",
};

/**
 * Modal that duplicates an existing costing sheet onto a new client.
 *
 * Props:
 *  - sourceTender: { id, tender_number, client, source }
 *  - onClose(): close without doing anything
 *  - onDuplicated(newTender): called after a successful copy
 */
export default function DuplicateCostingSheetModal({ sourceTender, onClose, onDuplicated }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sourceTender) {
      setForm({ ...emptyForm, source: sourceTender.source || "" });
      setError("");
      setBusy(false);
    }
  }, [sourceTender]);

  if (!sourceTender) return null;

  const update = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.client.trim()) {
      setError("Enter the new client name to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const newTender = await duplicateCostingSheet(supabase, {
        sourceTenderId: sourceTender.id,
        newClient: form,
      });
      onDuplicated?.(newTender);
    } catch (err) {
      console.error("Duplicate costing sheet failed:", err);
      setError(err?.message || "Could not duplicate the costing sheet. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-costing-title"
    >
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] ring-1 ring-slate-900/10">
        <div className="h-1.5 shrink-0 bg-gradient-to-r from-red-600 via-red-500 to-amber-400" aria-hidden />
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 ring-1 ring-red-100">
              <Copy className="h-5 w-5 text-red-600" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 id="duplicate-costing-title" className="text-lg font-bold tracking-tight text-slate-900">
                Duplicate costing sheet
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                Creates a new approved tender for a new client and copies the full costing sheet
                (costing rows, accessories, MOC prices, and NET TOTAL) from{" "}
                <span className="font-semibold text-slate-700">
                  {sourceTender.tender_number || sourceTender.client || "the selected sheet"}
                </span>
                . You can then edit anything in the new sheet.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/80 to-white px-5 py-5 sm:px-7">
          <div className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600">
            Copying from:{" "}
            <span className="font-semibold text-slate-800">
              {sourceTender.client || "—"}
            </span>{" "}
            {sourceTender.tender_number ? `· ${sourceTender.tender_number}` : ""}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label}>
                New client name <span className="text-red-600">*</span>
              </label>
              <input
                value={form.client}
                onChange={update("client")}
                className={field}
                placeholder="Organization or client name"
                autoFocus
              />
            </div>
            <div>
              <label className={label}>Phone</label>
              <input value={form.phone} onChange={update("phone")} className={field} placeholder="+91 …" inputMode="tel" />
            </div>
            <div>
              <label className={label}>Email</label>
              <input value={form.email} onChange={update("email")} className={field} placeholder="name@company.com" type="email" />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Address</label>
              <input value={form.street} onChange={update("street")} className={field} placeholder="Street / address line" />
            </div>
            <div>
              <label className={label}>City</label>
              <input value={form.city} onChange={update("city")} className={field} placeholder="City" />
            </div>
            <div>
              <label className={label}>State</label>
              <input value={form.state} onChange={update("state")} className={field} placeholder="State" />
            </div>
            <div>
              <label className={label}>PIN / ZIP</label>
              <input value={form.zip} onChange={update("zip")} className={field} placeholder="PIN / ZIP" />
            </div>
            <div>
              <label className={label}>Country</label>
              <input value={form.country} onChange={update("country")} className={field} placeholder="Country" />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Tender source</label>
              <select value={form.source} onChange={update("source")} className={field}>
                <option value="">Same as original{sourceTender.source ? ` (${sourceTender.source})` : ""}</option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Source decides whether the Gem-only NET TOTAL rows (Tender mode &amp; Gem cost) appear.
              </p>
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm font-medium text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className={`inline-flex min-h-[44px] min-w-[170px] items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all ${
              busy
                ? "cursor-not-allowed bg-red-400 shadow-none"
                : "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:shadow-lg"
            }`}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Duplicating…
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Duplicate sheet
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
