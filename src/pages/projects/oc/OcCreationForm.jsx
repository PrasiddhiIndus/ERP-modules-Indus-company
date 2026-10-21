import React, { useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { ArrowLeft, BadgeCheck, Clock, FileDown, Loader2, Lock, Mail, PenLine, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "../../../lib/toast";
import {
  OC_COMPANY_NAME, OC_CONTACTS_HEADING, OC_DOC_REF, OC_FORM_TITLE, OC_SECURITY_HEADING,
  OC_SIGNOFF_HEADING, PERIOD_UNITS, SECURITY_TYPES, SIGNOFF_SLOTS, blankContact, blankMilestone,
  blankSecurityRow, contractValueInWords, emptyOcForm, formFromRecord, formatSignedAt, isBlank, milestoneTotal,
  ocExportFileName, signoffPending, toSavePayload, validateOcForm,
} from "./ocModel";
import {
  amFinance, friendlyOcError, loadOc, loadSignoffAssignees, myEmployeeCode, notifyOcSignoff, saveOc,
} from "./ocApi";
import { buildOcDocx } from "./ocWordExport";

const inputCls =
  "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:bg-slate-50 disabled:text-slate-600";
const errCls = "border-red-400 ring-1 ring-red-200";
const labelCellCls = "border-b border-r border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700";
const valueCellCls = "border-b border-r border-slate-300 px-3 py-2";
const headingCls = "md:col-span-4 flex items-center justify-between gap-2 border-b border-r border-slate-300 bg-slate-200/70 px-3 py-2 text-xs font-bold text-slate-800";
const smallBtn =
  "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

function FieldError({ msg }) {
  return msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null;
}

function Label({ children, required }) {
  return (
    <div className={labelCellCls}>
      {children}
      {required && <span className="ml-0.5 text-red-600">*</span>}
    </div>
  );
}

function Value({ children, full = false }) {
  return <div className={`${valueCellCls} ${full ? "md:col-span-3" : ""}`}>{children}</div>;
}

/** Yes / No with a third "not filled" state (click the selected option again to clear). */
function YesNo({ value, onChange, name }) {
  const opt = (v, label) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      onClick={() => onChange(value === v ? null : v)}
      className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
        value === v ? "border-red-300 bg-red-50 text-red-800" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-2">
      {opt(true, "Yes")}
      {opt(false, "No")}
    </div>
  );
}

/** Digital sign-off: the signer types their name; the date and time are recorded on save. */
function SignatureBox({ label, value, onChange, disabled, assignee, locked, onRequestSign }) {
  const pending = signoffPending(value);
  const signedAt = !pending && !isBlank(value.signed_by) ? formatSignedAt(value.signed_at) : "";
  const signName = assignee?.employee_name;

  return (
    <div className={`flex flex-col gap-2 border-b border-r border-slate-300 p-3 ${locked ? "bg-slate-100" : ""}`}>
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      <p className="flex items-center gap-1 text-[11px] text-slate-500">
        {locked && <Lock className="h-3 w-3 shrink-0" />}
        {assignee ? `Assigned to ${assignee.employee_name} (${assignee.employee_code})` : "No one assigned yet"}
      </p>
      <label className="text-[11px] text-slate-500">
        Name (digital signature)
        <input
          className={inputCls}
          placeholder={locked ? "" : "Type your name to sign"}
          value={value.signed_by}
          disabled={locked}
          readOnly={locked}
          onChange={(e) => onChange({ ...value, signed_by: e.target.value })}
        />
      </label>
      {!disabled && !locked && isBlank(value.signed_by) && signName && (
        <button
          type="button"
          className={`${smallBtn} self-start`}
          onClick={() => {
            if (typeof onRequestSign === "function") onRequestSign(signName);
            else onChange({ ...value, signed_by: signName });
          }}
        >
          <PenLine className="h-3 w-3" /> Sign as {signName}
        </button>
      )}
      <p className="flex items-start gap-1 text-[11px] leading-snug">
        {signedAt ? (
          <>
            <BadgeCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="text-emerald-800">Digitally signed on {signedAt}</span>
          </>
        ) : pending ? (
          <>
            <Clock className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span className="text-amber-800">Date and time are recorded when you save. The four assigned users will be emailed.</span>
          </>
        ) : (
          <span className="text-slate-400">Not signed</span>
        )}
      </p>
    </div>
  );
}

/** Confirm sign-off + show email result to the four assigned users. */
function SignNotifyModal({ state, onClose, onConfirmSign }) {
  if (!state?.open) return null;
  const mode = state.mode || "result";
  const signs = state.signatures || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {mode === "confirm" ? "Confirm PO signature" : state.ok ? "PO signed — email sent" : "PO signed — email not sent"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {state.ocNo ? `OC No. ${state.ocNo}` : "PO At Glance"}
              {state.client ? ` · ${state.client}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3 text-sm text-slate-700">
          {signs.length ? (
            <ul className="list-disc space-y-1 pl-5 text-xs">
              {signs.map((s) => (
                <li key={s.slot}>
                  <span className="font-medium">{s.label}</span> — {s.signed_by}
                </li>
              ))}
            </ul>
          ) : null}

          {mode === "confirm" ? (
            <p className="text-xs text-slate-600">
              On save, a notification will be emailed from the Outreach module&apos;s verified From mailbox to the four
              users assigned under PO At Glance Sign-off.
            </p>
          ) : state.ok ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <p className="flex items-center gap-1.5 font-medium">
                <Mail className="h-3.5 w-3.5" /> Notification emailed
                {state.from ? ` from ${state.from}` : ""}.
              </p>
              {state.sent?.length ? (
                <p className="mt-1 text-emerald-800">Sent to: {state.sent.join(", ")}</p>
              ) : null}
              {state.skipped?.length ? (
                <p className="mt-1 text-amber-800">
                  Skipped (no email): {state.skipped.map((s) => s.name || s.code).join(", ")}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <p className="font-medium">This PO signature was saved, but the email was not sent to the assigned users.</p>
              <p className="mt-1 text-amber-900">{state.error || "Please try saving again, or check Outreach sender mailboxes and employee emails."}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          {mode === "confirm" ? (
            <>
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmSign}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                <PenLine className="h-3.5 w-3.5" /> Sign &amp; continue
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * PO At Glance form (create / edit). Field order and grid follow the paper form.
 * @param {{ ocId: string|null, canEdit: boolean, onBack: () => void, onSaved: (id: string) => void }} props
 */
export default function OcCreationForm({ ocId, canEdit, onBack, onSaved }) {
  const [form, setForm] = useState(() => emptyOcForm());
  const [initial, setInitial] = useState(() => JSON.stringify(emptyOcForm()));
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(Boolean(ocId));
  const [saving, setSaving] = useState(false);
  const [signNotify, setSignNotify] = useState(null);
  const [pendingSignSlot, setPendingSignSlot] = useState(null);
  const [exporting, setExporting] = useState(false);
  const topRef = useRef(null);
  const [assignees, setAssignees] = useState({});
  const [myCode, setMyCode] = useState("");
  const [codeLoaded, setCodeLoaded] = useState(false);
  const [isFinance, setIsFinance] = useState(false);

  useEffect(() => {
    let alive = true;
    amFinance().then((f) => alive && setIsFinance(f));
    Promise.all([loadSignoffAssignees(), myEmployeeCode()])
      .then(([a, code]) => {
        if (!alive) return;
        setAssignees(a);
        setMyCode(code);
        setCodeLoaded(true);
      })
      .catch((err) => console.error("[PO At Glance] sign-off assignment", err));
    return () => {
      alive = false;
    };
  }, []);

  const isLockedFor = (slot) => {
    const a = assignees[slot];
    return !a || !myCode || String(a.employee_code).trim().toLowerCase() !== String(myCode).trim().toLowerCase();
  };

  useEffect(() => {
    if (!ocId) {
      const blank = emptyOcForm();
      setForm(blank);
      setInitial(JSON.stringify(blank));
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    loadOc(ocId)
      .then((bundle) => {
        if (!alive) return;
        const f = formFromRecord(bundle);
        setForm(f);
        setInitial(JSON.stringify(f));
      })
      .catch((err) => alive && toast.error(friendlyOcError(err, "Could not load this PO At Glance.")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ocId]);

  const dirty = useMemo(() => JSON.stringify(form) !== initial, [form, initial]);
  const words = useMemo(() => contractValueInWords(form.contract_value, form.currency), [form.contract_value, form.currency]);
  const msTotal = milestoneTotal(form.payment_milestones);
  const readOnly = !canEdit;
  const saved = Boolean(form.id);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setIn = (group, key, value) => setForm((f) => ({ ...f, [group]: { ...f[group], [key]: value } }));
  const setRow = (list, index, patch) =>
    setForm((f) => ({ ...f, [list]: f[list].map((r, i) => (i === index ? { ...r, ...patch } : r)) }));
  const addRow = (list, make) => setForm((f) => ({ ...f, [list]: [...f[list], make()] }));
  const removeRow = (list, index) => setForm((f) => ({ ...f, [list]: f[list].filter((_, i) => i !== index) }));
  const err = (k) => errors[k];
  const cls = (k) => `${inputCls} ${errors[k] ? errCls : ""}`;

  const handleSave = async () => {
    const found = validateOcForm(form);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Please fix the highlighted fields.");
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const newSignatures = SIGNOFF_SLOTS.filter(({ slot }) => signoffPending(form.signoff[slot])).map(({ slot, label }) => ({
      slot,
      label,
      signed_by: String(form.signoff[slot]?.signed_by || "").trim(),
    }));
    setSaving(true);
    try {
      const res = await saveOc(toSavePayload(form));
      const bundle = await loadOc(res.id);
      const f = formFromRecord(bundle);
      setForm(f);
      setInitial(JSON.stringify(f));
      toast.success(saved ? "PO At Glance updated." : res.oc_no ? `PO At Glance for OC No. ${res.oc_no} created.` : "PO At Glance created.");
      onSaved?.(res.id);

      if (newSignatures.length) {
        try {
          const mail = await notifyOcSignoff({
            ocId: res.id,
            signatures: newSignatures.map(({ slot, signed_by }) => ({ slot, signed_by })),
            signerName: newSignatures[0]?.signed_by,
          });
          setSignNotify({
            open: true,
            mode: "result",
            ok: true,
            signatures: newSignatures,
            ocNo: res.oc_no || f.oc_no || form.oc_no,
            client: f.client_name || form.client_name,
            from: mail?.from,
            sent: mail?.sent || [],
            skipped: mail?.skipped || [],
          });
        } catch (mailErr) {
          console.error("[PO At Glance] sign-off email failed", mailErr);
          setSignNotify({
            open: true,
            mode: "result",
            ok: false,
            signatures: newSignatures,
            ocNo: res.oc_no || f.oc_no || form.oc_no,
            client: f.client_name || form.client_name,
            error: mailErr?.message || "Could not send the notification email.",
          });
        }
      }
    } catch (e) {
      toast.error(friendlyOcError(e, "Could not save the PO At Glance."));
    } finally {
      setSaving(false);
    }
  };

  const handleExportWord = async () => {
    setExporting(true);
    try {
      const blob = await buildOcDocx(form);
      saveAs(blob, `${ocExportFileName(form)}.docx`);
    } catch (e) {
      toast.error(friendlyOcError(e, "Could not export the Word file."));
    } finally {
      setExporting(false);
    }
  };

  const handleBack = () => {
    if (dirty && canEdit && !window.confirm("Discard unsaved changes?")) return;
    onBack();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-16 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading PO At Glance…
      </div>
    );
  }

  return (
    <div ref={topRef} className="space-y-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-2 shadow-sm backdrop-blur">
        <button type="button" onClick={handleBack} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> All PO At Glance
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">View only</span>}
          {dirty && canEdit && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <button
            type="button"
            onClick={handleExportWord}
            disabled={!saved || dirty || exporting}
            title={!saved ? "Save the PO At Glance first" : dirty ? "Save your changes first" : "Download as Word"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Export Word
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="flex flex-col gap-1 border-b border-slate-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold tracking-wide text-slate-900">{OC_COMPANY_NAME}</p>
          <p className="text-[11px] text-slate-500">{OC_DOC_REF}</p>
        </div>
        <h2 className="border-b border-slate-300 py-2 text-center text-base font-bold tracking-wider text-slate-900">{OC_FORM_TITLE}</h2>

        <fieldset disabled={readOnly} className="min-w-0">
          <div className="grid grid-cols-1 border-l border-slate-300 md:grid-cols-[minmax(9rem,18%)_1fr_minmax(9rem,16%)_1fr]">
            {/* Section 1 */}
            <Label>Cost Center in Tally</Label>
            <Value full>
              <input className={inputCls} value={form.cost_center_tally} onChange={(e) => set("cost_center_tally", e.target.value)} />
            </Value>

            <Label>OC No.</Label>
            <Value>
              <input
                className={`${cls("oc_no")} font-mono read-only:bg-slate-50 read-only:text-slate-600`}
                maxLength={80}
                value={form.oc_no}
                readOnly={!isFinance}
                placeholder={isFinance ? "" : "Filled by Finance"}
                title={isFinance ? undefined : "Only the Finance Department can fill or change the OC No."}
                onChange={(e) => set("oc_no", e.target.value)}
              />
              {!isFinance && canEdit && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  <Lock className="h-3 w-3" /> Only the Finance Department can fill or change the OC No.
                </p>
              )}
              <FieldError msg={err("oc_no")} />
            </Value>
            <Label>OC No. Date</Label>
            <Value>
              <input type="date" className={inputCls} value={form.oc_date} onChange={(e) => set("oc_date", e.target.value)} />
            </Value>

            <Label required>Client Name &amp; Address</Label>
            <Value>
              <input className={cls("client_name")} placeholder="Client name" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} />
              <FieldError msg={err("client_name")} />
              <textarea rows={2} className={`${inputCls} mt-1`} placeholder="Address" value={form.client_address} onChange={(e) => set("client_address", e.target.value)} />
            </Value>
            <Label>Whether SEZ</Label>
            <Value>
              <YesNo name="Whether SEZ" value={form.is_sez} onChange={(v) => set("is_sez", v)} />
            </Value>

            <Label required>PO/WO No.</Label>
            <Value>
              <input className={cls("po_wo_no")} value={form.po_wo_no} onChange={(e) => set("po_wo_no", e.target.value)} />
              <FieldError msg={err("po_wo_no")} />
            </Value>
            <Label required>PO/WO Date</Label>
            <Value>
              <input type="date" className={cls("po_date")} value={form.po_date} onChange={(e) => set("po_date", e.target.value)} />
              <FieldError msg={err("po_date")} />
            </Value>

            <Label required>Project Description</Label>
            <Value full>
              <textarea rows={2} className={cls("project_description")} value={form.project_description} onChange={(e) => set("project_description", e.target.value)} />
              <FieldError msg={err("project_description")} />
            </Value>

            <Label>Duration of Job</Label>
            <Value>
              <input className={inputCls} value={form.duration_of_job} onChange={(e) => set("duration_of_job", e.target.value)} />
            </Value>
            <Label required>Delivery Date</Label>
            <Value>
              <input type="date" className={cls("delivery_date")} value={form.delivery_date} onChange={(e) => set("delivery_date", e.target.value)} />
              <FieldError msg={err("delivery_date")} />
            </Value>

            <Label required>Contract Value (Excluding Taxes)</Label>
            <Value>
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                  {form.currency === "INR" ? "₹" : form.currency}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className={`${cls("contract_value")} ${form.currency === "INR" ? "pl-6" : "pl-11"}`}
                  value={form.contract_value}
                  onChange={(e) => set("contract_value", e.target.value.replace(/[^\d.]/g, ""))}
                />
              </div>
              <FieldError msg={err("contract_value")} />
              {words && <p className="mt-1 text-[11px] italic text-slate-600">{words}</p>}
            </Value>
            <Label>GST Applicability (%)</Label>
            <Value>
              <input type="number" min="0" max="100" step="0.01" className={cls("gst_pct")} value={form.gst_pct} onChange={(e) => set("gst_pct", e.target.value)} />
              <FieldError msg={err("gst_pct")} />
            </Value>

            <Label>Payment Terms</Label>
            <Value full>
              <textarea rows={2} className={inputCls} value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} />
              {form.payment_milestones.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="w-20 py-1 pr-2 font-medium">%</th>
                        <th className="py-1 pr-2 font-medium">Milestone / trigger</th>
                        <th className="w-24 py-1 pr-2 font-medium">Due (days)</th>
                        <th className="py-1 pr-2 font-medium">Notes</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {form.payment_milestones.map((m, i) => (
                        <tr key={m.key} className="align-top">
                          <td className="py-1 pr-2">
                            <input type="number" min="0" max="100" step="0.01" className={cls(`payment_milestones.${i}.percent`)} value={m.percent} onChange={(e) => setRow("payment_milestones", i, { percent: e.target.value })} />
                            <FieldError msg={err(`payment_milestones.${i}.percent`)} />
                          </td>
                          <td className="py-1 pr-2"><input className={inputCls} value={m.trigger} onChange={(e) => setRow("payment_milestones", i, { trigger: e.target.value })} /></td>
                          <td className="py-1 pr-2">
                            <input type="number" min="0" step="1" className={cls(`payment_milestones.${i}.due_days`)} value={m.due_days} onChange={(e) => setRow("payment_milestones", i, { due_days: e.target.value })} />
                          </td>
                          <td className="py-1 pr-2"><input className={inputCls} value={m.notes} onChange={(e) => setRow("payment_milestones", i, { notes: e.target.value })} /></td>
                          <td className="py-1">
                            {canEdit && (
                              <button type="button" aria-label="Remove milestone" onClick={() => removeRow("payment_milestones", i)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className={`mt-1 text-[11px] ${Math.abs(msTotal - 100) < 0.001 ? "text-emerald-700" : "text-amber-700"}`}>Total: {msTotal}% (must be 100%)</p>
                  <FieldError msg={err("payment_milestones")} />
                </div>
              )}
              {canEdit && (
                <button type="button" className={`${smallBtn} mt-2`} onClick={() => addRow("payment_milestones", blankMilestone)}>
                  <Plus className="h-3 w-3" /> Add milestone
                </button>
              )}
            </Value>

            <Label>LD / Penalty Clause, if any</Label>
            <Value>
              <YesNo name="LD / Penalty Clause" value={form.penalty.enabled} onChange={(v) => setIn("penalty", "enabled", v)} />
            </Value>
            <Label>Details</Label>
            <Value>
              {form.penalty.enabled === true ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-500">
                    Rate (%)<span className="text-red-600">*</span>
                    <input type="number" min="0" max="100" step="0.001" className={cls("penalty.rate")} value={form.penalty.rate} onChange={(e) => setIn("penalty", "rate", e.target.value)} />
                    <FieldError msg={err("penalty.rate")} />
                  </label>
                  <label className="text-[11px] text-slate-500">
                    Per<span className="text-red-600">*</span>
                    <select className={cls("penalty.period_unit")} value={form.penalty.period_unit} onChange={(e) => setIn("penalty", "period_unit", e.target.value)}>
                      {PERIOD_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] text-slate-500">
                    Max (% of contract value)
                    <input type="number" min="0" max="100" step="0.01" className={cls("penalty.cap_percent")} value={form.penalty.cap_percent} onChange={(e) => setIn("penalty", "cap_percent", e.target.value)} />
                    <FieldError msg={err("penalty.cap_percent")} />
                  </label>
                  <label className="text-[11px] text-slate-500">
                    Applicable from
                    <input className={inputCls} placeholder="e.g. after delivery date" value={form.penalty.applicable_from_text} onChange={(e) => setIn("penalty", "applicable_from_text", e.target.value)} />
                  </label>
                </div>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              )}
            </Value>

            {/* Section 2 — security items */}
            <div className={headingCls}>
              <span>{OC_SECURITY_HEADING}</span>
              {canEdit && (
                <button type="button" className={smallBtn} onClick={() => addRow("security_items", blankSecurityRow)}>
                  <Plus className="h-3 w-3" /> Add
                </button>
              )}
            </div>
            {["Security type", "% of contract value", "Due within (days from PO date)", "Validity period"].map((h) => (
              <div key={h} className={`${labelCellCls} hidden md:block`}>{h}</div>
            ))}
            {form.security_items.length === 0 && (
              <div className="md:col-span-4 border-b border-r border-slate-300 px-3 py-3 text-xs text-slate-400">No security items. Use Add to include SD, ABG or PBG.</div>
            )}
            {form.security_items.map((r, i) => (
              <React.Fragment key={r.key}>
                <div className={valueCellCls}>
                  <div className="flex items-center gap-1">
                    <select className={cls(`security_items.${i}.type`)} value={r.type} aria-label="Security type"
                      onChange={(e) => setRow("security_items", i, { type: e.target.value, applicable: e.target.value === "SD" ? r.applicable : null })}>
                      <option value="">Select</option>
                      {SECURITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {canEdit && (
                      <button type="button" aria-label="Remove security item" onClick={() => removeRow("security_items", i)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {r.type === "SD" && (
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                      Applicable <YesNo name="SD applicable" value={r.applicable} onChange={(v) => setRow("security_items", i, { applicable: v })} />
                    </div>
                  )}
                  <FieldError msg={err(`security_items.${i}.type`)} />
                </div>
                <div className={valueCellCls}>
                  <span className="text-[11px] text-slate-500 md:hidden">% of contract value</span>
                  <input type="number" min="0" max="100" step="0.01" className={cls(`security_items.${i}.pct`)} value={r.pct} onChange={(e) => setRow("security_items", i, { pct: e.target.value })} />
                  <FieldError msg={err(`security_items.${i}.pct`)} />
                </div>
                <div className={valueCellCls}>
                  <span className="text-[11px] text-slate-500 md:hidden">Due within (days from PO date)</span>
                  <input type="number" min="0" step="1" className={cls(`security_items.${i}.due_days`)} value={r.due_days} onChange={(e) => setRow("security_items", i, { due_days: e.target.value })} />
                  <FieldError msg={err(`security_items.${i}.due_days`)} />
                </div>
                <div className={valueCellCls}>
                  <span className="text-[11px] text-slate-500 md:hidden">Validity period</span>
                  <input className={inputCls} value={r.validity_text} onChange={(e) => setRow("security_items", i, { validity_text: e.target.value })} />
                </div>
              </React.Fragment>
            ))}

            {/* Section 3 */}
            <Label>EMD</Label>
            <Value>
              <YesNo name="EMD" value={form.emd.enabled} onChange={(v) => setIn("emd", "enabled", v)} />
            </Value>
            <Label>Release date / adjust against SD</Label>
            <Value>
              {form.emd.enabled === true ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap gap-3 text-xs text-slate-700">
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" name="emd-mode" checked={form.emd.release_or_adjust === "RELEASE"} onChange={() => setIn("emd", "release_or_adjust", "RELEASE")} /> Release date
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" name="emd-mode" checked={form.emd.release_or_adjust === "ADJUST_SD"} onChange={() => setIn("emd", "release_or_adjust", "ADJUST_SD")} /> Adjust against SD
                    </label>
                  </div>
                  {form.emd.release_or_adjust === "RELEASE" && (
                    <input type="date" className={cls("emd.release_date")} value={form.emd.release_date} onChange={(e) => setIn("emd", "release_date", e.target.value)} />
                  )}
                  <FieldError msg={err("emd.release_or_adjust") || err("emd.release_date")} />
                </div>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              )}
            </Value>

            <Label>Defect Liability Period</Label>
            <Value>
              <YesNo name="Defect Liability Period" value={form.dlp.enabled} onChange={(v) => setIn("dlp", "enabled", v)} />
            </Value>
            <Label>Details</Label>
            <Value>
              {form.dlp.enabled === true ? (
                <>
                  <input className={cls("dlp.detail_text")} value={form.dlp.detail_text} onChange={(e) => setIn("dlp", "detail_text", e.target.value)} />
                  <FieldError msg={err("dlp.detail_text")} />
                </>
              ) : <span className="text-xs text-slate-400">—</span>}
            </Value>

            <Label>Warranty</Label>
            <Value>
              <YesNo name="Warranty" value={form.warranty.enabled} onChange={(v) => setIn("warranty", "enabled", v)} />
            </Value>
            <Label>Details</Label>
            <Value>
              {form.warranty.enabled === true ? (
                <>
                  <input className={cls("warranty.detail_text")} value={form.warranty.detail_text} onChange={(e) => setIn("warranty", "detail_text", e.target.value)} />
                  <FieldError msg={err("warranty.detail_text")} />
                </>
              ) : <span className="text-xs text-slate-400">—</span>}
            </Value>

            <Label>RTO / Insurance</Label>
            <Value full>
              <input className={inputCls} value={form.rto_insurance} onChange={(e) => set("rto_insurance", e.target.value)} />
            </Value>

            <Label>Any Other Information</Label>
            <Value full>
              <textarea rows={2} className={inputCls} value={form.other_information} onChange={(e) => set("other_information", e.target.value)} />
            </Value>

            {/* Section 4 — contacts */}
            <div className={headingCls}>
              <span>{OC_CONTACTS_HEADING}</span>
              {canEdit && (
                <button type="button" className={smallBtn} onClick={() => addRow("contacts", blankContact)}>
                  <Plus className="h-3 w-3" /> Add contact
                </button>
              )}
            </div>
            {["Department", "Name", "Mobile No.", "E-mail address"].map((h) => (
              <div key={h} className={`${labelCellCls} hidden md:block`}>{h}</div>
            ))}
            {form.contacts.map((c, i) => (
              <React.Fragment key={c.key}>
                <div className={valueCellCls}>
                  <div className="flex items-center gap-1">
                    <input className={inputCls} placeholder="Department" value={c.department} onChange={(e) => setRow("contacts", i, { department: e.target.value })} />
                    {canEdit && (
                      <button type="button" aria-label="Remove contact" onClick={() => removeRow("contacts", i)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className={valueCellCls}>
                  <input className={inputCls} placeholder="Name" value={c.names} onChange={(e) => setRow("contacts", i, { names: e.target.value })} />
                </div>
                <div className={valueCellCls}>
                  <textarea rows={1} className={cls(`contacts.${i}.mobiles`)} placeholder="Mobile No. (separate with commas)" value={c.mobiles} onChange={(e) => setRow("contacts", i, { mobiles: e.target.value })} />
                  <FieldError msg={err(`contacts.${i}.mobiles`)} />
                </div>
                <div className={valueCellCls}>
                  <textarea rows={1} className={cls(`contacts.${i}.emails`)} placeholder="E-mail (separate with commas)" value={c.emails} onChange={(e) => setRow("contacts", i, { emails: e.target.value })} />
                  <FieldError msg={err(`contacts.${i}.emails`)} />
                </div>
              </React.Fragment>
            ))}

            {/* Section 5 — remarks */}
            <Label>Remarks</Label>
            <Value full>
              <textarea rows={2} className={inputCls} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
            </Value>
            <Label>Date</Label>
            <Value full>
              <input type="date" className={`${inputCls} max-w-xs`} value={form.remarks_date} onChange={(e) => set("remarks_date", e.target.value)} />
            </Value>

            {/* Section 6 — dissemination */}
            <div className={`${headingCls} flex-wrap`}>
              <span>{OC_SIGNOFF_HEADING}</span>
              {canEdit && codeLoaded && !myCode && (
                <span className="font-normal text-amber-700">
                  Your login is not linked to an employee code, so you cannot sign. Ask an administrator to link it in User Management.
                </span>
              )}
            </div>
            {SIGNOFF_SLOTS.map(({ slot, label }) => (
              <SignatureBox
                key={slot}
                label={label}
                value={form.signoff[slot]}
                disabled={readOnly}
                assignee={assignees[slot]}
                locked={isLockedFor(slot)}
                onChange={(v) => setForm((f) => ({ ...f, signoff: { ...f.signoff, [slot]: v } }))}
                onRequestSign={(signName) => {
                  setPendingSignSlot(slot);
                  setSignNotify({
                    open: true,
                    mode: "confirm",
                    signatures: [{ slot, label, signed_by: signName }],
                    ocNo: form.oc_no,
                    client: form.client_name,
                  });
                }}
              />
            ))}
          </div>
        </fieldset>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <button type="button" onClick={handleBack} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saved ? "Save changes" : "Save PO At Glance"}
          </button>
        </div>
      )}

      <SignNotifyModal
        state={signNotify}
        onClose={() => {
          setSignNotify(null);
          setPendingSignSlot(null);
        }}
        onConfirmSign={() => {
          if (!pendingSignSlot || !signNotify?.signatures?.[0]?.signed_by) {
            setSignNotify(null);
            setPendingSignSlot(null);
            return;
          }
          const name = signNotify.signatures[0].signed_by;
          const slot = pendingSignSlot;
          setForm((f) => ({
            ...f,
            signoff: { ...f.signoff, [slot]: { ...f.signoff[slot], signed_by: name } },
          }));
          setSignNotify(null);
          setPendingSignSlot(null);
          toast.success("Name filled. Save the PO At Glance to record the signature and email the four assigned users.");
        }}
      />
    </div>
  );
}
