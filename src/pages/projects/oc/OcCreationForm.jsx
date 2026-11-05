import React, { useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { ArrowLeft, BadgeCheck, Clock, Eye, FileDown, Loader2, Lock, Mail, PenLine, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "../../../lib/toast";
import { useAuth } from "../../../contexts/AuthContext";
import {
  OC_CONTACTS_HEADING, OC_SECURITY_HEADING,
  OC_SIGNOFF_HEADING, PERIOD_UNITS, SECURITY_TYPES, blankContact, blankMilestone,
  blankSecurityRow, contractValueInWords, emptyOcForm, formFromRecord, formatSignedAt, isBlank, milestoneTotal,
  ocExportFileName, signoffPending, toSavePayload, validateOcForm,
} from "./ocModel";
import {
  amFinance, fetchOcSignatureUrl, friendlyOcError, listEmployeeOptions, loadOc, loadSignoffAssignees,
  loadProjectApprovalLog, myEmployeeCode, notifyOcSignoff, projectPoDocumentUrl, requestProjectOcModification, saveOc,
  signProjectOcStage, uploadProjectPoDocument,
} from "./ocApi";
import { getFinancePoDetail, setFinancePoOcNo, signFinancePo, friendlyFinancePoError } from "../../finance/poAtGlance/financePoApi";
import { IEV_OC_DEPARTMENT } from "./ocDepartment";
import ProjectsApprovalPanel, { openModificationRequest } from "../poAtGlance/ProjectsApprovalPanel";
import PjDocumentPreviewModal from "../poAtGlance/PjDocumentPreviewModal";

const inputCls =
  "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:bg-slate-50 disabled:text-slate-600";
const errCls = "border-red-400 ring-1 ring-red-200";
const labelCellCls = "border-b border-r border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700";
const valueCellCls = "border-b border-r border-slate-300 px-3 py-2";
const headingCls = "md:col-span-4 flex items-center justify-between gap-2 border-b border-r border-slate-300 bg-slate-200/70 px-3 py-2 text-xs font-bold text-slate-800";
const smallBtn =
  "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const freezeCls =
  "[&_*]:pointer-events-none [&_button]:opacity-60 [&_input]:bg-slate-100 [&_input]:text-slate-500 [&_select]:bg-slate-100 [&_select]:text-slate-500 [&_textarea]:bg-slate-100 [&_textarea]:text-slate-500 [&_[data-active]]:pointer-events-auto [&_[data-active]]:opacity-100";

/** Finance preview uses tighter spacing. Department PO screens stay on the regular density. */
const OcDensityContext = React.createContext(false);
function useDense() {
  return React.useContext(OcDensityContext);
}

/** Keeps grid placement (`display: contents`) while greying a block for the Finance preview. */
function Freeze({ on, children }) {
  return <div className={on ? `contents ${freezeCls}` : "contents"}>{children}</div>;
}

function FieldError({ msg }) {
  return msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null;
}

function Label({ children, required }) {
  const dense = useDense();
  return (
    <div className={dense ? "border-b border-r border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-semibold leading-tight text-slate-700" : labelCellCls}>
      {children}
      {required && <span className="ml-0.5 text-red-600">*</span>}
    </div>
  );
}

function Value({ children, full = false }) {
  const dense = useDense();
  return <div className={`${dense ? "border-b border-r border-slate-300 px-2 py-1" : valueCellCls} ${full ? "md:col-span-3" : ""}`}>{children}</div>;
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

const STAGE_CHIP = {
  Pending: "bg-amber-100 text-amber-800",
  Approved: "bg-sky-100 text-sky-800",
  Completed: "bg-emerald-100 text-emerald-800",
  Returned: "bg-amber-100 text-amber-800",
};

/** Digital sign-off: the signer types their name; the date and time are recorded on save. */
function SignatureBox({
  label, value, onChange, disabled, assignee, locked, onRequestSign, assigneeCount, status, signatureUrl, caption, note,
  oneClickSign = false, onSign, signing = false, signBlockedReason = "", mySignatureUrl = "",
}) {
  const dense = useDense();
  const pending = signoffPending(value);
  const signedAt = !pending && !isBlank(value.signed_by) ? formatSignedAt(value.signed_at) : "";
  const signName = assignee?.employee_name;

  return (
    <div className={`flex flex-col border-b border-r border-slate-300 ${dense ? "gap-1 p-2" : "gap-2 p-3"} ${locked ? "bg-slate-100" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        {status && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE_CHIP[status] || "bg-slate-100 text-slate-600"}`}>
            {status}
          </span>
        )}
      </div>
      <p className="flex items-center gap-1 text-[11px] text-slate-500">
        {locked && <Lock className="h-3 w-3 shrink-0" />}
        {caption || (assignee ? `Assigned to ${assignee.employee_name} (${assignee.employee_code})` : "No one assigned yet")}
      </p>
      {signatureUrl && (
        <img src={signatureUrl} alt="" className={`object-contain object-left ${dense ? "h-10 max-w-[140px]" : "h-16 max-w-[180px]"}`} />
      )}
      <label className="text-[11px] text-slate-500">
        Name (digital signature)
        <input
          className={inputCls}
          placeholder={locked || oneClickSign ? "" : "Type your name to sign"}
          value={value.signed_by}
          disabled={locked}
          readOnly={locked || oneClickSign}
          onChange={(e) => onChange({ ...value, signed_by: e.target.value })}
        />
      </label>
      {oneClickSign && !disabled && !locked && isBlank(value.saved_by) && (
        <>
          {mySignatureUrl && (
            <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-1">
              <p className="text-[10px] text-slate-500">Your signature (Indus One)</p>
              <img src={mySignatureUrl} alt="Your digital signature" className="h-12 max-w-[170px] object-contain object-left" />
            </div>
          )}
          <button
            type="button"
            data-active
            disabled={signing || Boolean(signBlockedReason)}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onSign}
          >
            {signing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />} Sign
          </button>
          {signBlockedReason && <p className="text-[11px] text-amber-800">{signBlockedReason}</p>}
        </>
      )}
      {!oneClickSign && !disabled && !locked && isBlank(value.signed_by) && signName && (
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
        ) : pending && !oneClickSign ? (
          <>
            <Clock className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span className="text-amber-800">Date and time are recorded when you save. The {assigneeCount} assigned users will be emailed.</span>
          </>
        ) : (
          <span className="text-slate-400">{status === "Pending" ? "Pending" : "Not signed"}</span>
        )}
      </p>
      {note && <p className="text-[11px] text-slate-500">{note}</p>}
    </div>
  );
}

/** Confirm sign-off + show email result to the assigned users. */
function SignNotifyModal({ state, onClose, onConfirmSign, assigneeCount }) {
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

          {mode === "confirm" && state.signatureUrl ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Your digital signature (from Indus One)</p>
              <img src={state.signatureUrl} alt="Your digital signature" className="mt-1 h-16 max-w-[200px] object-contain object-left" />
            </div>
          ) : null}

          {mode === "confirm" && state.direct ? (
            <p className="text-xs text-slate-600">
              Your signature will be placed on this PO now and the signing date and time recorded. A notification will be
              emailed to the {assigneeCount} users assigned under PO At Glance Sign-off.
            </p>
          ) : mode === "confirm" ? (
            <p className="text-xs text-slate-600">
              On save, a notification will be emailed from the Outreach module&apos;s verified From mailbox to the {assigneeCount}
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
 * `financeReview` is the Finance Master PO preview: every department field stays grey,
 * Finance may sign their own box, and OC No. unlocks only after the other signatories have signed.
 * Department create/edit is unchanged when this flag is omitted.
 * @param {{ ocId: string|null, canEdit: boolean, onBack: () => void, onSaved: (id: string) => void, department?: object, financeReview?: boolean }} props
 */
export default function OcCreationForm({ ocId, canEdit, onBack, onSaved, department = IEV_OC_DEPARTMENT, financeReview = false }) {
  const { user, userProfile } = useAuth();
  const SIGNOFF_SLOTS = department.slots;
  const [form, setForm] = useState(() => emptyOcForm(SIGNOFF_SLOTS));
  const [initial, setInitial] = useState(() => JSON.stringify(emptyOcForm(SIGNOFF_SLOTS)));
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
  const [creatorName, setCreatorName] = useState("");
  const [creatorSignatureUrl, setCreatorSignatureUrl] = useState("");
  const [uploadingPo, setUploadingPo] = useState(false);
  const [approvalLog, setApprovalLog] = useState([]);
  const [approvalLogLoading, setApprovalLogLoading] = useState(false);
  const showApprovalAudit = Boolean(department.approvalAudit) && !financeReview;
  const oneClickSign = Boolean(department.ownSignature) && !financeReview;
  const [mySignatureUrl, setMySignatureUrl] = useState("");
  const [mySignatureLoaded, setMySignatureLoaded] = useState(false);
  const [slotSignatureUrls, setSlotSignatureUrls] = useState({});
  const [signingSlot, setSigningSlot] = useState(null);
  const [docPreview, setDocPreview] = useState(null);
  const showDocPreview = Boolean(department.documentPreview) && !financeReview;

  const refreshApprovalLog = async (id) => {
    if (!showApprovalAudit || !id) return;
    setApprovalLogLoading(true);
    try {
      setApprovalLog(await loadProjectApprovalLog(id));
    } catch (err) {
      console.error("[PO At Glance] approval history", err);
    } finally {
      setApprovalLogLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    amFinance().then((f) => alive && setIsFinance(f));
    const codeLoad = myEmployeeCode()
      .then((code) => {
        if (!alive) return;
        setMyCode(code);
        setCodeLoaded(true);
      })
      .catch((err) => console.error("[PO At Glance] employee code", err));
    if (financeReview) {
      return () => {
        alive = false;
      };
    }
    Promise.all([loadSignoffAssignees(department), codeLoad])
      .then(([a]) => {
        if (!alive) return;
        setAssignees(a);
      })
      .catch((err) => console.error("[PO At Glance] sign-off assignment", err));
    return () => {
      alive = false;
    };
  }, [department, financeReview]);

  useEffect(() => {
    const slot = department.autoCreatorSlot;
    if (!slot || financeReview) return undefined;
    if (!myCode) {
      setCreatorName(userProfile?.full_name || user?.email || "");
      return undefined;
    }
    let alive = true;
    listEmployeeOptions(department)
      .then((people) => {
        if (!alive) return;
        const me = (people || []).find(
          (e) => String(e.employee_code).trim().toLowerCase() === String(myCode).trim().toLowerCase()
        );
        setCreatorName(me?.full_name || userProfile?.full_name || user?.email || "");
      })
      .catch((err) => console.error("[PO At Glance] creator name", err));
    return () => {
      alive = false;
    };
  }, [department, financeReview, myCode, user?.email, userProfile?.full_name]);

  const autoSignedUserId = department.autoCreatorSlot
    ? form.signoff?.[department.autoCreatorSlot]?.signed_user_id
    : "";

  useEffect(() => {
    const slot = department.autoCreatorSlot;
    if (!slot) return undefined;
    const iAmCreator = !form.created_by || form.created_by === user?.id;
    const target = autoSignedUserId || (iAmCreator ? user?.id : "");
    if (!target) {
      setCreatorSignatureUrl("");
      return undefined;
    }
    let alive = true;
    fetchOcSignatureUrl(target).then((url) => {
      if (alive) setCreatorSignatureUrl(url || "");
    });
    return () => {
      alive = false;
    };
  }, [department.autoCreatorSlot, autoSignedUserId, form.created_by, user?.id]);

  // Projects: the logged-in employee's own signature, fetched from Indus One by their employee code.
  useEffect(() => {
    if (!oneClickSign || !user?.id) return undefined;
    let alive = true;
    setMySignatureLoaded(false);
    fetchOcSignatureUrl(user.id).then((url) => {
      if (!alive) return;
      setMySignatureUrl(url || "");
      setMySignatureLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [oneClickSign, user?.id]);

  // Projects: each signed stage shows the signature of the login that signed it.
  const signedStageKey = oneClickSign
    ? SIGNOFF_SLOTS.filter(({ slot }) => slot !== department.autoCreatorSlot)
      .map(({ slot }) => `${slot}:${form.signoff?.[slot]?.saved_by ? form.signoff[slot].signed_user_id || "" : ""}`)
      .join("|")
    : "";
  useEffect(() => {
    if (!signedStageKey) return undefined;
    let alive = true;
    const pairs = signedStageKey.split("|").map((p) => p.split(":")).filter(([, uid]) => uid);
    Promise.all(pairs.map(([slot, uid]) => fetchOcSignatureUrl(uid).then((url) => [slot, url || ""])))
      .then((entries) => alive && setSlotSignatureUrls(Object.fromEntries(entries)));
    return () => {
      alive = false;
    };
  }, [signedStageKey]);

  useEffect(() => {
    const slot = department.autoCreatorSlot;
    if (!slot || !creatorName || financeReview || department.ownSignature) return;
    const iAmCreator = !form.created_by || form.created_by === user?.id;
    if (!iAmCreator) return;
    setForm((f) => {
      const current = f.signoff?.[slot];
      if (!current || current.saved_by || current.signed_by) return f;
      return { ...f, signoff: { ...f.signoff, [slot]: { ...current, signed_by: creatorName } } };
    });
    setInitial((prev) => {
      try {
        const parsed = JSON.parse(prev);
        const current = parsed.signoff?.[slot];
        if (!current || current.saved_by || current.signed_by) return prev;
        current.signed_by = creatorName;
        return JSON.stringify(parsed);
      } catch {
        return prev;
      }
    });
  }, [creatorName, department.autoCreatorSlot, department.ownSignature, financeReview, form.created_by, user?.id]);

  const isLockedFor = (slot) => {
    const a = assignees[slot];
    return !a || !myCode || String(a.employee_code).trim().toLowerCase() !== String(myCode).trim().toLowerCase();
  };

  useEffect(() => {
    if (!ocId) {
      const blank = emptyOcForm(SIGNOFF_SLOTS);
      setApprovalLog([]);
      setForm(blank);
      setInitial(JSON.stringify(blank));
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    const load = financeReview
      ? getFinancePoDetail(department.key, ocId).then((bundle) => {
          if (!alive || !bundle) return;
          const mapped = Object.fromEntries(
            (bundle.assignees || []).map((a) => [a.slot, { employee_code: a.employee_code, employee_name: a.employee_name }])
          );
          setAssignees(mapped);
          const f = formFromRecord(bundle, SIGNOFF_SLOTS);
          f.updated_at = bundle.master?.updated_at || null;
          setForm(f);
          setInitial(JSON.stringify(f));
        })
      : loadOc(ocId, department).then((bundle) => {
          if (!alive) return;
          const f = formFromRecord(bundle, SIGNOFF_SLOTS);
          setForm(f);
          setInitial(JSON.stringify(f));
          refreshApprovalLog(ocId);
        });
    load
      .catch((err) => {
        if (!alive) return;
        const message = financeReview
          ? friendlyFinancePoError(err, "Could not load this PO At Glance.")
          : friendlyOcError(err, "Could not load this PO At Glance.", department);
        toast.error(message);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- SIGNOFF_SLOTS comes from department
  }, [ocId, department, financeReview]);

  const dirty = useMemo(() => JSON.stringify(form) !== initial, [form, initial]);
  const words = useMemo(() => contractValueInWords(form.contract_value, form.currency), [form.contract_value, form.currency]);
  const msTotal = milestoneTotal(form.payment_milestones);
  const readOnly = !canEdit;
  const saved = Boolean(form.id);
  const waitingSignoffs = SIGNOFF_SLOTS.filter(
    (s) => s.slot !== "FINANCE" && isBlank(form.signoff?.[s.slot]?.saved_by)
  );
  const ocUnlocked = !financeReview || waitingSignoffs.length === 0;
  const ocReadOnly = financeReview ? !ocUnlocked : !isFinance;
  const allStagesSigned = department.sequentialSignoff
    && SIGNOFF_SLOTS.every((s) => !isBlank(form.signoff?.[s.slot]?.saved_by));
  const previousStageApproved = (slot) => {
    if (!department.sequentialSignoff) return true;
    const index = SIGNOFF_SLOTS.findIndex((s) => s.slot === slot);
    if (index <= 0) return true;
    return !isBlank(form.signoff?.[SIGNOFF_SLOTS[index - 1].slot]?.saved_by);
  };
  const openReturn = showApprovalAudit ? openModificationRequest(approvalLog) : null;
  const iAmOcCreator = !form.created_by || form.created_by === user?.id;
  const canRequestModification = showApprovalAudit && saved && !dirty && !openReturn
    && !isBlank(form.signoff?.PLANNING?.saved_by)
    && isBlank(form.signoff?.VERTICAL_HEAD?.saved_by)
    && isBlank(form.signoff?.FINANCE?.saved_by)
    && !isLockedFor("VERTICAL_HEAD");
  const stageStatus = (slot) => {
    if (!department.sequentialSignoff) return null;
    const signed = !isBlank(form.signoff?.[slot]?.saved_by);
    if (openReturn && slot === SIGNOFF_SLOTS[0].slot && !signed) return "Returned";
    if (allStagesSigned && signed) return "Completed";
    if (signed) return "Approved";
    return "Pending";
  };

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setIn = (group, key, value) => setForm((f) => ({ ...f, [group]: { ...f[group], [key]: value } }));
  const setRow = (list, index, patch) =>
    setForm((f) => ({ ...f, [list]: f[list].map((r, i) => (i === index ? { ...r, ...patch } : r)) }));
  const addRow = (list, make) => setForm((f) => ({ ...f, [list]: [...f[list], make()] }));
  const removeRow = (list, index) => setForm((f) => ({ ...f, [list]: f[list].filter((_, i) => i !== index) }));
  const err = (k) => errors[k];
  const cls = (k) => `${inputCls} ${errors[k] ? errCls : ""}`;

  const openPoDocument = async () => {
    try {
      const url = await projectPoDocumentUrl(form.po_document_path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(friendlyOcError(err, "Could not open the purchase order.", department));
    }
  };

  const onPoFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !form.id) return;
    setUploadingPo(true);
    try {
      const savedDoc = await uploadProjectPoDocument(form.id, file);
      setForm((f) => ({ ...f, ...savedDoc }));
      setInitial((prev) => {
        try {
          return JSON.stringify({ ...JSON.parse(prev), ...savedDoc });
        } catch {
          return prev;
        }
      });
      toast.success("Original purchase order uploaded.");
    } catch (err) {
      toast.error(friendlyOcError(err, "Could not upload the purchase order.", department));
    } finally {
      setUploadingPo(false);
    }
  };

  const handleSave = async () => {
    if (department.sequentialSignoff) {
      let previousReady = true;
      for (const stage of SIGNOFF_SLOTS) {
        const row = form.signoff[stage.slot] || {};
        const hasName = !isBlank(row.signed_by);
        if (hasName && !previousReady) {
          toast.error(`${stage.label} can sign only after the previous stage is approved.`);
          return null;
        }
        previousReady = !isBlank(row.saved_by) || hasName;
      }
    }
    const found = validateOcForm(form);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Please fix the highlighted fields.");
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return null;
    }
    const payload = toSavePayload(form, SIGNOFF_SLOTS);
    if (oneClickSign) {
      payload.signoff = (payload.signoff || []).filter((s) => !isBlank(form.signoff?.[s.slot]?.saved_by));
    }
    const newSignatures = oneClickSign
      ? []
      : SIGNOFF_SLOTS.filter(({ slot }) => signoffPending(form.signoff[slot])).map(({ slot, label }) => ({
        slot,
        label,
        signed_by: String(form.signoff[slot]?.signed_by || "").trim(),
      }));
    setSaving(true);
    try {
      const res = await saveOc(payload, department);
      const bundle = await loadOc(res.id, department);
      const f = formFromRecord(bundle, SIGNOFF_SLOTS);
      setForm(f);
      setInitial(JSON.stringify(f));
      refreshApprovalLog(res.id);
      toast.success(openReturn && !isBlank(f.signoff?.[SIGNOFF_SLOTS[0].slot]?.saved_by)
        ? "PO At Glance resubmitted. Approval restarts from Stage 1." : saved ? "PO At Glance updated." : res.oc_no ? `PO At Glance for OC No. ${res.oc_no} created.` : "PO At Glance created.");
      onSaved?.(res.id);

      if (newSignatures.length) {
        try {
          const mail = await notifyOcSignoff({
            ocId: res.id,
            signatures: newSignatures.map(({ slot, signed_by }) => ({ slot, signed_by })),
            signerName: newSignatures[0]?.signed_by,
          }, department);
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
      return res.id;
    } catch (e) {
      toast.error(friendlyOcError(e, "Could not save the PO At Glance.", department));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleFinanceSave = async () => {
    const financeSlot = form.signoff?.FINANCE;
    const signaturePending = signoffPending(financeSlot);
    const ocChanged = String(form.oc_no || "").trim() !== String(JSON.parse(initial).oc_no || "").trim()
      || String(form.oc_date || "") !== String(JSON.parse(initial).oc_date || "");
    if (!signaturePending && !ocChanged) return;
    if (ocChanged && !ocUnlocked) {
      toast.error("OC Number stays locked until every other required signatory has signed.");
      return;
    }
    if (ocChanged && !String(form.oc_no || "").trim()) {
      setErrors({ oc_no: "OC No. is required." });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      let expectedUpdatedAt = form.updated_at || null;
      if (signaturePending) {
        await signFinancePo({
          department: department.key,
          id: form.id,
          signedBy: String(financeSlot.signed_by || "").trim(),
        });
        const afterSign = await getFinancePoDetail(department.key, form.id);
        expectedUpdatedAt = afterSign?.master?.updated_at || expectedUpdatedAt;
        try {
          const mail = await notifyOcSignoff({
            ocId: form.id,
            signatures: [{ slot: "FINANCE", signed_by: String(financeSlot.signed_by || "").trim() }],
            signerName: String(financeSlot.signed_by || "").trim(),
          }, department);
          setSignNotify({
            open: true,
            mode: "result",
            ok: true,
            signatures: [{ slot: "FINANCE", label: "Finance Department", signed_by: financeSlot.signed_by }],
            ocNo: form.oc_no,
            client: form.client_name,
            from: mail?.from,
            sent: mail?.sent || [],
            skipped: mail?.skipped || [],
          });
        } catch (mailErr) {
          console.error("[PO At Glance] finance sign-off email failed", mailErr);
          toast.error("Signature saved. The notification email could not be sent.");
        }
      }
      if (ocChanged) {
        await setFinancePoOcNo({
          department: department.key,
          id: form.id,
          ocNo: String(form.oc_no || "").trim(),
          ocDate: form.oc_date || null,
          expectedUpdatedAt,
        });
      }
      const bundle = await getFinancePoDetail(department.key, form.id);
      const mapped = Object.fromEntries(
        (bundle.assignees || []).map((a) => [a.slot, { employee_code: a.employee_code, employee_name: a.employee_name }])
      );
      setAssignees(mapped);
      const f = formFromRecord(bundle, SIGNOFF_SLOTS);
      f.updated_at = bundle.master?.updated_at || null;
      setForm(f);
      setInitial(JSON.stringify(f));
      toast.success(signaturePending && ocChanged ? "Finance signature and OC Number saved." : signaturePending ? "Finance signature saved." : "OC Number saved.");
      onSaved?.(form.id);
    } catch (e) {
      toast.error(friendlyFinancePoError(e, "Could not save the Finance update."));
    } finally {
      setSaving(false);
    }
  };

  /** Projects: Sign → save the PO if needed, confirm with the user's own signature, then sign that stage. */
  const handleStageSign = async (slot, label) => {
    if (!mySignatureUrl) {
      toast.error("No digital signature was found for your employee code. Upload your signature in Indus One first.");
      return;
    }
    let ocId = form.id;
    if (!ocId || dirty) {
      ocId = await handleSave();
      if (!ocId) return;
    }
    setPendingSignSlot(slot);
    setSignNotify({
      open: true,
      mode: "confirm",
      direct: true,
      ocId,
      signatureUrl: mySignatureUrl,
      signatures: [{ slot, label, signed_by: assignees[slot]?.employee_name || creatorName || "" }],
      ocNo: form.oc_no,
      client: form.client_name,
    });
  };

  const signStageNow = async (slot, ocId = form.id) => {
    const label = SIGNOFF_SLOTS.find((s) => s.slot === slot)?.label || slot;
    setSigningSlot(slot);
    try {
      const res = await signProjectOcStage(ocId, slot);
      const bundle = await loadOc(ocId, department);
      const f = formFromRecord(bundle, SIGNOFF_SLOTS);
      setForm(f);
      setInitial(JSON.stringify(f));
      refreshApprovalLog(ocId);
      onSaved?.(ocId);
      const signedBy = String(res?.signed_by || f.signoff?.[slot]?.saved_by || "").trim();
      toast.success(`${label} signed on ${formatSignedAt(res?.signed_at || f.signoff?.[slot]?.signed_at)}.`);
      const showSigned = (notice) => {
        if (showDocPreview) {
          setDocPreview({ form: f, title: `Signed PO preview — ${label}`, notice });
          return true;
        }
        return false;
      };
      try {
        const mail = await notifyOcSignoff({ ocId, signatures: [{ slot, signed_by: signedBy }], signerName: signedBy }, department);
        const sentTo = (mail?.sent || []).join(", ");
        if (!showSigned({ ok: true, text: `Notification emailed${mail?.from ? ` from ${mail.from}` : ""}${sentTo ? ` to ${sentTo}` : ""}.` })) {
          setSignNotify({
            open: true, mode: "result", ok: true, signatures: [{ slot, label, signed_by: signedBy }],
            ocNo: f.oc_no, client: f.client_name, from: mail?.from, sent: mail?.sent || [], skipped: mail?.skipped || [],
          });
        }
      } catch (mailErr) {
        console.error("[PO At Glance] sign-off email failed", mailErr);
        const text = mailErr?.message || "Could not send the notification email.";
        if (!showSigned({ ok: false, text: `Signature saved, but the notification email was not sent: ${text}` })) {
          setSignNotify({
            open: true, mode: "result", ok: false, signatures: [{ slot, label, signed_by: signedBy }],
            ocNo: f.oc_no, client: f.client_name, error: text,
          });
        }
      }
    } catch (e) {
      toast.error(friendlyOcError(e, "Could not sign this stage.", department));
    } finally {
      setSigningSlot(null);
    }
  };

  /** Department Head → back to the creator. Returns true when done so the dialog can close. */
  const handleRequestModification = async (remarks) => {
    try {
      await requestProjectOcModification(form.id, remarks);
      const bundle = await loadOc(form.id, department);
      const f = formFromRecord(bundle, SIGNOFF_SLOTS);
      setForm(f);
      setInitial(JSON.stringify(f));
      await refreshApprovalLog(form.id);
      toast.success("Modification requested. The OC has been returned to its creator.");
      onSaved?.(form.id);
      return true;
    } catch (e) {
      toast.error(friendlyOcError(e, "Could not request the modification.", department));
      return false;
    }
  };

  const handleExportWord = async () => {
    setExporting(true);
    try {
      const blob = await department.buildDocx(form);
      saveAs(blob, `${ocExportFileName(form)}.docx`);
    } catch (e) {
      toast.error(friendlyOcError(e, "Could not export the Word file.", department));
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

  const sectionHead = financeReview
    ? "md:col-span-4 flex items-center justify-between gap-2 border-b border-r border-slate-300 bg-slate-200/70 px-2 py-1 text-[11px] font-bold leading-tight text-slate-800"
    : headingCls;

  return (
    <OcDensityContext.Provider value={financeReview}>
    <div ref={topRef} className={financeReview ? "space-y-2" : "space-y-3"}>
      <div className={`sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border border-slate-200 bg-white/95 shadow-sm backdrop-blur ${financeReview ? "rounded-lg px-3 py-1.5" : "rounded-xl px-4 py-2"}`}>
        <button type="button" onClick={handleBack} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> All PO At Glance
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && !financeReview && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">View only</span>}
          {financeReview && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Finance review · other fields are read only</span>}
          {dirty && canEdit && <span className="text-xs text-amber-700">Unsaved changes</span>}
          {showDocPreview && (
            <button
              type="button"
              onClick={() => setDocPreview({ form, title: "PO preview", notice: null })}
              disabled={!saved || dirty}
              title={!saved ? "Save the PO At Glance first" : dirty ? "Save your changes first" : "Preview the PO with its signatures"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Eye className="h-4 w-4" /> Preview
            </button>
          )}
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

      {showApprovalAudit && saved && (
        <ProjectsApprovalPanel
          slots={SIGNOFF_SLOTS}
          signoff={form.signoff}
          log={approvalLog}
          loading={approvalLogLoading}
          canRequestModification={canRequestModification}
          iAmCreator={iAmOcCreator}
          onRequestModification={handleRequestModification}
        />
      )}

      <div className={`overflow-hidden border border-slate-300 bg-white shadow-sm ${financeReview ? "rounded-lg" : "rounded-xl"}`}>
        <div className={`flex flex-col border-b border-slate-300 sm:flex-row sm:items-center sm:justify-between ${financeReview ? "gap-0.5 px-3 py-1.5" : "gap-1 px-4 py-3"}`}>
          <p className={`font-bold tracking-wide text-slate-900 ${financeReview ? "text-xs" : "text-sm"}`}>{department.companyName}</p>
          <p className="text-[11px] text-slate-500">{department.docRef}</p>
        </div>
        <h2 className={`border-b border-slate-300 text-center font-bold tracking-wider text-slate-900 ${financeReview ? "py-1 text-sm" : "py-2 text-base"}`}>{department.formTitle}</h2>

        <fieldset
          disabled={readOnly && !financeReview}
          className={financeReview ? "min-w-0 [&_input]:!py-1 [&_input]:!text-xs [&_select]:!py-1 [&_select]:!text-xs [&_textarea]:!py-1 [&_textarea]:!text-xs" : "min-w-0"}
        >
          <div className="grid grid-cols-1 border-l border-slate-300 md:grid-cols-[minmax(9rem,18%)_1fr_minmax(9rem,16%)_1fr]">
            {/* Section 1 */}
            <Freeze on={financeReview}>
            <Label>Cost Center in Tally</Label>
            <Value full>
              <input className={inputCls} value={form.cost_center_tally} onChange={(e) => set("cost_center_tally", e.target.value)} />
            </Value>
            </Freeze>

            <Label>OC No.</Label>
            <Value>
              <input
                className={`${cls("oc_no")} font-mono read-only:bg-slate-100 read-only:text-slate-500`}
                maxLength={80}
                value={form.oc_no}
                readOnly={ocReadOnly}
                disabled={financeReview && !ocUnlocked}
                placeholder={financeReview ? (ocUnlocked ? "" : "Locked until the other departments sign") : isFinance ? "" : "Filled by Finance"}
                title={ocReadOnly && !financeReview ? "Only the Finance Department can fill or change the OC No." : undefined}
                onChange={(e) => set("oc_no", e.target.value)}
              />
              {financeReview && !ocUnlocked && (
                <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-800">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                  OC Number stays locked until every other required signatory has signed
                  {waitingSignoffs.length ? ` (${waitingSignoffs.map((s) => s.label).join(", ")})` : ""}.
                  It unlocks after those signatures are complete.
                </p>
              )}
              {!financeReview && !isFinance && canEdit && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  <Lock className="h-3 w-3" /> Only the Finance Department can fill or change the OC No.
                </p>
              )}
              <FieldError msg={err("oc_no")} />
            </Value>
            <Label>OC No. Date</Label>
            <Value>
              <input type="date" className={`${inputCls} read-only:bg-slate-100 read-only:text-slate-500 disabled:bg-slate-100 disabled:text-slate-500`} value={form.oc_date} readOnly={ocReadOnly} disabled={financeReview && !ocUnlocked} onChange={(e) => set("oc_date", e.target.value)} />
            </Value>

            <Freeze on={financeReview}>
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

            {department.poDocument && (
              <>
                <Label>Original PO</Label>
                <Value full>
                  <div className="flex flex-wrap items-center gap-2">
                    {form.po_document_name ? (
                      <button type="button" data-active className={smallBtn} onClick={openPoDocument}>
                        View {form.po_document_name}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">No original purchase order uploaded.</span>
                    )}
                    {canEdit && !financeReview && (
                      <label className={`${smallBtn} cursor-pointer ${!form.id || uploadingPo ? "opacity-50" : ""}`}>
                        {uploadingPo ? "Uploading…" : form.po_document_name ? "Replace original PO" : "Upload original PO"}
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                          disabled={!form.id || uploadingPo}
                          onChange={onPoFile}
                        />
                      </label>
                    )}
                  </div>
                  {canEdit && !financeReview && !form.id && (
                    <p className="mt-1 text-[11px] text-slate-500">Save this PO first, then upload the original document.</p>
                  )}
                </Value>
              </>
            )}

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

            {department.key === "iev" ? (
              <>
                <Label>No. of Fire Tenders</Label>
                <Value full>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputCls}
                    value={form.no_of_fire_tenders}
                    onChange={(e) => set("no_of_fire_tenders", e.target.value.replace(/[^\d]/g, ""))}
                  />
                </Value>
              </>
            ) : null}

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
            <div className={sectionHead}>
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
            <div className={sectionHead}>
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

            </Freeze>

            {/* Section 6 — dissemination */}
            <div className={`${sectionHead} flex-wrap`}>
              <span>{OC_SIGNOFF_HEADING}</span>
              {(canEdit || financeReview) && codeLoaded && !myCode && (
                <span className="font-normal text-amber-700">
                  Your login is not linked to an employee code, so you cannot sign. Ask an administrator to link it in User Management.
                </span>
              )}
            </div>
            {department.sequentialSignoff && (
              <p className="md:col-span-4 border-b border-r border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                Each stage opens only after the previous stage is approved. OC Creation uses the signature of the person creating this OC.
              </p>
            )}
            {SIGNOFF_SLOTS.map(({ slot, label }) => {
              const auto = department.autoCreatorSlot === slot;
              const open = previousStageApproved(slot);
              const iAmCreator = !form.created_by || form.created_by === user?.id;
              const stageUnsigned = isBlank(form.signoff[slot]?.saved_by);
              const creatorCanSign = auto && oneClickSign && iAmCreator && stageUnsigned;
              const locked = auto
                ? !creatorCanSign
                : isLockedFor(slot) || !open || (financeReview && slot !== "FINANCE");
              const note = !open
                ? "This stage opens after the previous stage is approved."
                : auto && isBlank(form.signoff[slot]?.saved_by) && !iAmCreator
                  ? "Waiting for the person who created this OC."
                  : "";
              return (
              <Freeze key={slot} on={financeReview && slot !== "FINANCE"}>
              <SignatureBox
                label={label}
                value={form.signoff[slot]}
                disabled={financeReview ? slot !== "FINANCE" : readOnly}
                assignee={auto ? null : assignees[slot]}
                assigneeCount={department.assigneeCount}
                locked={locked}
                status={stageStatus(slot)}
                signatureUrl={auto ? (stageUnsigned ? "" : creatorSignatureUrl) : oneClickSign ? slotSignatureUrls[slot] || "" : ""}
                oneClickSign={oneClickSign && (!auto || iAmCreator)}
                signing={signingSlot === slot}
                signBlockedReason={
                  mySignatureLoaded && !mySignatureUrl ? "No digital signature found for your employee code. Upload it in Indus One." : ""
                }
                onSign={() => handleStageSign(slot, label)}
                mySignatureUrl={oneClickSign ? mySignatureUrl : ""}
                caption={auto ? "Signed by the person who creates this OC." : undefined}
                note={note}
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
              </Freeze>
              );
            })}
          </div>
        </fieldset>
      </div>

      {(canEdit || financeReview) && (
        <div className={`flex flex-wrap items-center justify-end border border-slate-200 bg-white shadow-sm ${financeReview ? "gap-2 rounded-lg px-3 py-2" : "gap-3 rounded-xl px-4 py-3"}`}>
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <button type="button" onClick={handleBack} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={financeReview ? handleFinanceSave : handleSave}
            disabled={saving || (financeReview && !dirty)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {financeReview
              ? "Save Finance update"
              : openReturn && iAmOcCreator ? "Resubmit for approval" : saved ? "Save changes" : "Save PO At Glance"}
          </button>
        </div>
      )}

      {showDocPreview && (
        <PjDocumentPreviewModal
          open={Boolean(docPreview)}
          title={docPreview?.title}
          notice={docPreview?.notice}
          fileName={`${ocExportFileName(docPreview?.form || form)}.docx`}
          buildBlob={() => department.buildDocx(docPreview?.form || form)}
          onClose={() => setDocPreview(null)}
        />
      )}

      <SignNotifyModal
        state={signNotify}
        assigneeCount={department.assigneeCount}
        onClose={() => {
          setSignNotify(null);
          setPendingSignSlot(null);
        }}
        onConfirmSign={() => {
          if (signNotify?.direct && pendingSignSlot) {
            const slot = pendingSignSlot;
            const ocId = signNotify.ocId;
            setSignNotify(null);
            setPendingSignSlot(null);
            signStageNow(slot, ocId);
            return;
          }
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
          toast.success(`Name filled. Save the PO At Glance to record the signature and email the ${department.assigneeCount} assigned users.`);
        }}
      />
    </div>
    </OcDensityContext.Provider>
  );
}
