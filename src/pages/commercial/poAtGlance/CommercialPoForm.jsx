import React, { useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { ArrowLeft, BadgeCheck, Clock, FileDown, Loader2, Lock, Mail, PenLine, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "../../../lib/toast";
import { confirmDialog } from "../../../lib/dialog";
import { useAuth } from "../../../contexts/AuthContext";
import {
  CM_OC_APPROVAL_HEADING, CM_OC_LEGACY_SLOTS, CM_OC_SIGNOFF_SLOTS, CM_OC_STAGES, CM_PO_CATEGORIES, COMMERCIAL_OC_DEPARTMENT,
  cmCategoryLabel, cmCategoryStages,
} from "./cmOcDepartment";
import {
  CM_CURRENCIES, CM_MANPOWER_FIELDS, blankCmContact, blankCmDeploymentItem, cmApprovalProgress,
  cmExportFileName, cmFormFromRecord, contractValueInWords, durationDays, emptyCmForm, formatSignedAt, isBlank,
  normalizeWoDocuments, toCmSavePayload, validateCmForm,
} from "./cmOcModel";
import {
  amFinance, clearCmWoDocuments, cmStageSignatureUrl, cmWoDocumentUrl, friendlyCmError, loadCmAssignees, loadCmOc,
  myCmSignatureUrl, myEmployeeCode, notifyCmSignoff, removeCmWoDocument, saveCmOc, signCmStage, uploadCmWoDocuments,
} from "./cmOcApi";

const DEPT = COMMERCIAL_OC_DEPARTMENT;
const STAGE_LABEL = Object.fromEntries(CM_OC_STAGES.map((s) => [s.slot, s.label]));
const SLOTS = CM_OC_SIGNOFF_SLOTS;

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

function Value({ children, full = false, className = "" }) {
  return <div className={`${valueCellCls} ${full ? "md:col-span-3" : ""} ${className}`}>{children}</div>;
}

/** Yes / No with a third "not filled" state (click the selected option again to clear). */
function YesNo({ value, onChange, name, yes = "Yes", no = "No" }) {
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
      {opt(true, yes)}
      {opt(false, no)}
    </div>
  );
}

const STATUS_CHIP = {
  Signed: "bg-emerald-100 text-emerald-800",
  Pending: "bg-amber-100 text-amber-800",
  Waiting: "bg-slate-100 text-slate-600",
};

/** One approval stage: who signs it, its status, and — once signed — the signer's own digital signature. */
function StageBox({ index, label, status, caption, sign, signatureUrl, canSign, signing, onSign, note, preview = "" }) {
  const signedAt = sign?.saved_by ? formatSignedAt(sign.signed_at) : "";
  return (
    <div className={`flex flex-col gap-2 border-b border-r border-slate-300 p-3 ${status === "Waiting" ? "bg-slate-50" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">
          <span className="mr-1 text-slate-400">{index}.</span>{label}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[status]}`}>{status}</span>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-slate-500">
        {status === "Waiting" && <Lock className="h-3 w-3 shrink-0" />}
        {caption}
      </p>
      {sign?.saved_by ? (
        <>
          {signatureUrl ? (
            <img src={signatureUrl} alt={`Signature of ${sign.saved_by}`} className="h-14 max-w-[170px] object-contain object-left" />
          ) : (
            <p className="text-[11px] italic text-slate-400">Signature image not available</p>
          )}
          <p className="text-sm font-semibold text-slate-900">{sign.saved_by}</p>
          <p className="flex items-start gap-1 text-[11px] leading-snug text-emerald-800">
            <BadgeCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" /> Digitally signed on {signedAt}
          </p>
        </>
      ) : preview ? (
        <div className="self-start rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-1">
          <p className="text-[10px] text-slate-500">Your signature (Indus One) — not signed yet</p>
          <img src={preview} alt="Your digital signature" className="h-12 max-w-[170px] object-contain object-left opacity-70" />
        </div>
      ) : canSign ? (
        <button
          type="button"
          disabled={signing}
          onClick={onSign}
          className="inline-flex items-center gap-1.5 self-start rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {signing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />} Sign
        </button>
      ) : (
        <p className="flex items-center gap-1 text-[11px] text-slate-400">
          <Clock className="h-3.5 w-3.5" /> Not signed
        </p>
      )}
      {note && <p className="text-[11px] text-slate-500">{note}</p>}
    </div>
  );
}

/** Confirm a stage signature with the signer's own signature, then show the email result. */
function SignModal({ state, onClose, onConfirm }) {
  if (!state) return null;
  const confirm = state.mode === "confirm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {confirm ? `Sign: ${state.label}` : state.ok ? `${state.label} signed — email sent` : `${state.label} signed — email not sent`}
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
          {confirm ? (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">Your digital signature (from Indus One)</p>
                <img src={state.signatureUrl} alt="Your digital signature" className="mt-1 h-16 max-w-[200px] object-contain object-left" />
              </div>
              <p className="text-xs text-slate-600">
                Your signature will be placed on this stage now and the date and time recorded. The next stage then opens,
                and the users assigned under Commercial PO At Glance Sign-off are emailed.
              </p>
            </>
          ) : state.ok ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <p className="flex items-center gap-1.5 font-medium">
                <Mail className="h-3.5 w-3.5" /> Notification emailed{state.from ? ` from ${state.from}` : ""}.
              </p>
              {state.sent?.length ? <p className="mt-1 text-emerald-800">Sent to: {state.sent.join(", ")}</p> : null}
              {state.skipped?.length ? (
                <p className="mt-1 text-amber-800">Skipped (no email): {state.skipped.map((s) => s.name || s.code).join(", ")}</p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <p className="font-medium">The signature was saved, but the email was not sent to the assigned users.</p>
              <p className="mt-1 text-amber-900">{state.error || "Check Outreach sender mailboxes and employee emails."}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          {confirm ? (
            <>
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">
                <PenLine className="h-3.5 w-3.5" /> Sign
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
 * Commercial PO At Glance form (create / edit), laid out like the Commercial OC format (IFSPL/C&B/06).
 * The PO category picks the approval workflow; stages are signed one after another, each with the
 * signer's own Indus One signature. Stage 1 is signed by the OC creator automatically on first save.
 * `defaultCategory` (the list's category filter) presets the PO category — and so its workflow — on a new PO.
 * @param {{ ocId: string|null, canEdit: boolean, onBack: () => void, onSaved: (id: string) => void, defaultCategory?: string }} props
 */
export default function CommercialPoForm({ ocId, canEdit, onBack, onSaved, defaultCategory = "" }) {
  const { user } = useAuth();
  const [form, setForm] = useState(() => emptyCmForm(SLOTS));
  const [initial, setInitial] = useState(() => JSON.stringify(emptyCmForm(SLOTS)));
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(Boolean(ocId));
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [signModal, setSignModal] = useState(null);
  const [signingSlot, setSigningSlot] = useState(null);
  const [assignees, setAssignees] = useState({});
  const [myCode, setMyCode] = useState("");
  const [codeLoaded, setCodeLoaded] = useState(false);
  const [isFinance, setIsFinance] = useState(false);
  const [mySignatureUrl, setMySignatureUrl] = useState("");
  const [stageSignatureUrls, setStageSignatureUrls] = useState({});
  /** Built-in deployment columns hidden via Remove on this form (cleared on save). */
  const [hiddenManpowerKeys, setHiddenManpowerKeys] = useState(() => new Set());
  const [pendingWoFiles, setPendingWoFiles] = useState([]);
  const [uploadingWo, setUploadingWo] = useState(false);
  const topRef = useRef(null);

  useEffect(() => {
    let alive = true;
    amFinance().then((f) => alive && setIsFinance(f));
    myEmployeeCode()
      .then((code) => alive && setMyCode(code))
      .catch((err) => console.error("[Commercial PO At Glance] employee code", err))
      .finally(() => alive && setCodeLoaded(true));
    loadCmAssignees()
      .then((a) => alive && setAssignees(a || {}))
      .catch((err) => console.error("[Commercial PO At Glance] sign-off assignment", err));
    return () => {
      alive = false;
    };
  }, []);

  // The logged-in user's own signature, fetched by their user id (shown before they sign).
  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;
    myCmSignatureUrl(user.id).then((url) => alive && setMySignatureUrl(url || ""));
    return () => {
      alive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!ocId) {
      const blank = { ...emptyCmForm(SLOTS), po_category: defaultCategory || "" };
      setForm(blank);
      setInitial(JSON.stringify(blank));
      setHiddenManpowerKeys(new Set());
      setPendingWoFiles((prev) => {
        prev.forEach((p) => p?.url && URL.revokeObjectURL(p.url));
        return [];
      });
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    loadCmOc(ocId)
      .then((bundle) => {
        if (!alive) return;
        const f = cmFormFromRecord(bundle, SLOTS);
        setForm(f);
        setInitial(JSON.stringify(f));
        setHiddenManpowerKeys(new Set());
        setPendingWoFiles((prev) => {
          prev.forEach((p) => p?.url && URL.revokeObjectURL(p.url));
          return [];
        });
      })
      .catch((err) => alive && toast.error(friendlyCmError(err, "Could not load this PO At Glance.")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ocId, defaultCategory]);

  // Each signed stage shows the signature of the login that signed it (signed_user_id on the server).
  const signedKey = CM_OC_STAGES
    .filter(({ slot }) => form.signoff[slot]?.saved_by && form.signoff[slot]?.signed_user_id)
    .map(({ slot }) => `${slot}:${form.signoff[slot].signed_user_id}`)
    .join("|");
  useEffect(() => {
    if (!form.id || !signedKey) {
      setStageSignatureUrls({});
      return undefined;
    }
    let alive = true;
    const slots = signedKey.split("|").map((p) => p.split(":")[0]);
    Promise.all(slots.map((slot) => cmStageSignatureUrl(form.id, slot).then((url) => [slot, url])))
      .then((entries) => alive && setStageSignatureUrls(Object.fromEntries(entries)));
    return () => {
      alive = false;
    };
  }, [form.id, signedKey]);

  const dirty = useMemo(
    () => JSON.stringify(form) !== initial || pendingWoFiles.length > 0,
    [form, initial, pendingWoFiles.length],
  );
  const words = useMemo(() => contractValueInWords(form.contract_value, form.currency), [form.contract_value, form.currency]);
  const readOnly = !canEdit;
  const saved = Boolean(form.id);
  const suggestedDuration = durationDays(form.duration_from, form.duration_to);
  const savedCategory = useMemo(() => {
    try {
      return JSON.parse(initial).po_category || "";
    } catch {
      return "";
    }
  }, [initial]);
  // Stages follow the category selected on the form, so the boxes update as soon as it changes.
  // Signing still needs the PO saved with that category (no unsaved changes).
  const liveCategory = form.po_category || "";
  const stages = cmCategoryStages(liveCategory);
  const categoryChanged = saved && liveCategory !== savedCategory;
  const progress = cmApprovalProgress(stages, form.signoff);
  const approvalsStarted = CM_OC_STAGES.some(({ slot }) => !isBlank(form.signoff[slot]?.saved_by));
  const legacySigned = CM_OC_LEGACY_SLOTS.filter(({ slot }) => !isBlank(form.signoff[slot]?.saved_by));
  const iAmCreator = Boolean(form.created_by) && form.created_by === user?.id;

  const isAssignedTo = (slot) => {
    const a = assignees[slot];
    return Boolean(a && myCode && String(a.employee_code).trim().toLowerCase() === String(myCode).trim().toLowerCase());
  };
  const canSignStage = (slot) =>
    saved && !dirty && progress.next?.slot === slot && (slot === "CREATOR" ? iAmCreator : isAssignedTo(slot));

  const set = (key, value) => {
    if (readOnly) return;
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setContact = (index, patch) => {
    if (readOnly) return;
    setForm((f) => ({ ...f, contacts: f.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
  };
  const addContact = () => !readOnly && setForm((f) => ({ ...f, contacts: [...f.contacts, blankCmContact()] }));
  const removeContact = (index) => !readOnly && setForm((f) => ({ ...f, contacts: f.contacts.filter((_, i) => i !== index) }));
  const addDeploymentItem = () =>
    !readOnly && setForm((f) => ({ ...f, extra_deployment: [...(f.extra_deployment || []), blankCmDeploymentItem()] }));
  const setDeploymentItem = (index, patch) => {
    if (readOnly) return;
    setForm((f) => ({
      ...f,
      extra_deployment: (f.extra_deployment || []).map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };
  const removeDeploymentItem = (index) =>
    !readOnly && setForm((f) => ({ ...f, extra_deployment: (f.extra_deployment || []).filter((_, i) => i !== index) }));
  const removeBuiltinDeployment = (key) => {
    if (readOnly) return;
    set(key, "");
    setHiddenManpowerKeys((prev) => new Set(prev).add(key));
  };
  const visibleManpowerFields = CM_MANPOWER_FIELDS.filter(({ key }) => !hiddenManpowerKeys.has(key));
  const err = (k) => errors[k];
  const cls = (k) => `${inputCls} ${errors[k] ? errCls : ""}`;
  const digits = (v) => v.replace(/[^\d]/g, "");

  const dropPendingWoFiles = () => {
    pendingWoFiles.forEach((p) => {
      if (p?.url) URL.revokeObjectURL(p.url);
    });
    setPendingWoFiles([]);
  };

  const applyWoDocuments = (docs) => {
    const next = normalizeWoDocuments(docs);
    setForm((f) => ({ ...f, wo_documents: next }));
    setInitial((prev) => {
      try {
        return JSON.stringify({ ...JSON.parse(prev), wo_documents: next });
      } catch {
        return prev;
      }
    });
  };

  const openWoDocument = async (doc) => {
    if (doc?.url) {
      window.open(doc.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!doc?.path) return;
    try {
      const url = await cmWoDocumentUrl(doc.path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(friendlyCmError(err, "Could not open the work order file."));
    }
  };

  const onWoFile = async (event) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    if (!picked.length || readOnly) return;
    if (!form.id) {
      setPendingWoFiles((prev) => [
        ...prev,
        ...picked.map((file) => ({ file, url: URL.createObjectURL(file) })),
      ]);
      return;
    }
    setUploadingWo(true);
    try {
      const savedDocs = await uploadCmWoDocuments(form.id, picked);
      applyWoDocuments(savedDocs);
      toast.success(picked.length > 1 ? `${picked.length} work order files uploaded.` : "Work order file uploaded.");
    } catch (err) {
      toast.error(friendlyCmError(err, "Could not upload the work order file."));
    } finally {
      setUploadingWo(false);
    }
  };

  const removePendingWoFile = (index) => {
    setPendingWoFiles((prev) => {
      const next = [...prev];
      const [gone] = next.splice(index, 1);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return next;
    });
  };

  const removeWoFile = async (doc) => {
    if (!form.id || !doc?.path || readOnly) return;
    if (!(await confirmDialog({
      title: "Remove work order file",
      message: `Remove ${doc.name || "this work order file"}?`,
      confirmLabel: "Remove",
      tone: "danger",
    }))) return;
    setUploadingWo(true);
    try {
      const updated = await removeCmWoDocument(form.id, doc.path);
      applyWoDocuments(updated);
      toast.success("Work order file removed.");
    } catch (err) {
      toast.error(friendlyCmError(err, "Could not remove the work order file."));
    } finally {
      setUploadingWo(false);
    }
  };

  const clearAllWoFiles = async () => {
    if (pendingWoFiles.length) {
      dropPendingWoFiles();
      return;
    }
    const docs = form.wo_documents?.length ? form.wo_documents : normalizeWoDocuments(form);
    if (!form.id || !docs.length || readOnly) return;
    if (!(await confirmDialog({
      title: "Remove all work order files",
      message: "Remove all work order files from this record?",
      confirmLabel: "Remove all",
      tone: "danger",
    }))) return;
    setUploadingWo(true);
    try {
      await clearCmWoDocuments(form.id, docs.map((d) => d.path));
      applyWoDocuments([]);
      toast.success("Work order files removed.");
    } catch (err) {
      toast.error(friendlyCmError(err, "Could not remove the work order files."));
    } finally {
      setUploadingWo(false);
    }
  };

  const reload = async (id) => {
    const f = cmFormFromRecord(await loadCmOc(id), SLOTS);
    setForm(f);
    setInitial(JSON.stringify(f));
    return f;
  };

  /** Signs one stage with the caller's own signature, reloads, and emails the assigned users. */
  const signStage = async (id, slot, { quiet = false } = {}) => {
    const label = STAGE_LABEL[slot] || slot;
    setSigningSlot(slot);
    try {
      const res = await signCmStage(id, slot);
      const f = await reload(id);
      onSaved?.(id);
      const base = { mode: "result", label, ocNo: f.oc_no, client: f.client_name };
      try {
        const mail = await notifyCmSignoff({ ocId: id, signatures: [{ slot, signed_by: res?.signed_by }], signerName: res?.signed_by });
        if (quiet) toast.success(`${label} signed. The assigned approvers were emailed.`);
        else setSignModal({ ...base, ok: true, from: mail?.from, sent: mail?.sent || [], skipped: mail?.skipped || [] });
      } catch (mailErr) {
        console.error("[Commercial PO At Glance] sign-off email failed", mailErr);
        if (quiet) toast.error(`${label} signed. The notification email could not be sent.`);
        else setSignModal({ ...base, ok: false, error: mailErr?.message || "Could not send the notification email." });
      }
      return true;
    } catch (e) {
      toast.error(friendlyCmError(e, `Could not sign the ${label} stage.`));
      return false;
    } finally {
      setSigningSlot(null);
    }
  };

  const handleSave = async () => {
    const found = validateCmForm(form);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Please fix the highlighted fields.");
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const creating = !form.id;
    const pendingUpload = pendingWoFiles.map((p) => p.file);
    setSaving(true);
    let res;
    try {
      res = await saveCmOc(toCmSavePayload(form));
      if (pendingUpload.length) {
        try {
          await uploadCmWoDocuments(res.id, pendingUpload);
          dropPendingWoFiles();
        } catch (uploadErr) {
          toast.error(friendlyCmError(uploadErr, "PO saved, but work order files could not be uploaded."));
        }
      }
      await reload(res.id);
      toast.success(saved ? "PO At Glance updated." : res.oc_no ? `PO At Glance for OC No. ${res.oc_no} created.` : "PO At Glance created.");
      onSaved?.(res.id);
    } catch (e) {
      toast.error(friendlyCmError(e, "Could not save the PO At Glance."));
      return;
    } finally {
      setSaving(false);
    }
    // Stage 1: the OC creator's own signature is applied automatically when the PO is first saved.
    if (creating && res?.id) await signStage(res.id, "CREATOR", { quiet: true });
  };

  const requestSign = (slot) => {
    if (!mySignatureUrl) {
      toast.error("No digital signature was found for your employee code. Upload your signature in Indus One first.");
      return;
    }
    setSignModal({ mode: "confirm", slot, label: STAGE_LABEL[slot], signatureUrl: mySignatureUrl, ocNo: form.oc_no, client: form.client_name });
  };

  const handleExportWord = async () => {
    setExporting(true);
    try {
      const blob = await DEPT.buildDocx(form);
      saveAs(blob, `${cmExportFileName(form)}.docx`);
    } catch (e) {
      toast.error(friendlyCmError(e, "Could not export the Word file."));
    } finally {
      setExporting(false);
    }
  };

  const handleBack = async () => {
    if ((dirty || pendingWoFiles.length) && canEdit && !(await confirmDialog({
      title: "Discard changes", message: "Discard unsaved changes?", confirmLabel: "Discard", cancelLabel: "Keep editing", tone: "danger",
    }))) return;
    dropPendingWoFiles();
    onBack();
  };

  const stageCaption = (slot) => {
    if (slot === "CREATOR") return "Signed by the person who creates this OC.";
    const a = assignees[slot];
    return a ? `Assigned to ${a.employee_name} (${a.employee_code})` : "No one assigned yet";
  };
  const stageNote = (slot) => {
    if (form.signoff[slot]?.saved_by || progress.next?.slot !== slot) return "";
    if (!saved) {
      if (slot !== "CREATOR") return "";
      return mySignatureUrl ? "Applied automatically when you save." : "No Indus One signature found for your login — upload it to sign.";
    }
    if (dirty) return "Save your changes before signing.";
    if (slot === "CREATOR" && !iAmCreator) return "Waiting for the person who created this OC.";
    if (slot !== "CREATOR" && !assignees[slot]) return "Assign someone in Sign-off Assignment first.";
    return "";
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
          <p className="text-sm font-bold tracking-wide text-slate-900">{DEPT.companyName}</p>
          <p className="text-[11px] text-slate-500">{DEPT.docRef}</p>
        </div>
        <h2 className="border-b border-slate-300 py-2 text-center text-base font-bold tracking-wider text-slate-900">{DEPT.formTitle}</h2>

        <fieldset className={`min-w-0 ${readOnly ? "cm-po-view-only" : ""}`}>
          <div className="grid grid-cols-1 border-l border-slate-300 md:grid-cols-[minmax(9rem,20%)_1fr_minmax(9rem,16%)_1fr]">
            <Label required>PO Category</Label>
            <Value full>
              <select
                className={`${cls("po_category")} max-w-xs`}
                value={form.po_category}
                disabled={approvalsStarted}
                onChange={(e) => set("po_category", e.target.value)}
              >
                <option value="">Select category</option>
                {CM_PO_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <FieldError msg={err("po_category")} />
              {form.po_category && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {approvalsStarted && <Lock className="mr-1 inline h-3 w-3" />}
                  Approval workflow: {cmCategoryStages(form.po_category).map((s) => s.label).join(" → ")}
                  {approvalsStarted ? " (locked — approvals have started)" : ""}
                </p>
              )}
            </Value>

            <Label>Cost Center in Tally</Label>
            <Value full>
              <input className={inputCls} value={form.cost_center_tally} onChange={(e) => set("cost_center_tally", e.target.value)} />
            </Value>

            <Label>OC No.</Label>
            <Value>
              <input
                className={`${cls("oc_no")} font-mono read-only:bg-slate-100 read-only:text-slate-500`}
                maxLength={80}
                value={form.oc_no}
                readOnly={!isFinance}
                placeholder={isFinance ? "" : "Filled by Finance"}
                onChange={(e) => set("oc_no", e.target.value)}
              />
              {!isFinance && canEdit && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  <Lock className="h-3 w-3" /> Only the Finance Department can fill or change the OC No.
                </p>
              )}
              <FieldError msg={err("oc_no")} />
            </Value>
            <Label>Date</Label>
            <Value>
              <input type="date" className={`${inputCls} read-only:bg-slate-100 read-only:text-slate-500`} value={form.oc_date} readOnly={!isFinance} onChange={(e) => set("oc_date", e.target.value)} />
            </Value>

            <Label required>Customer</Label>
            <Value>
              <input className={cls("client_name")} placeholder="Customer name" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} />
              <FieldError msg={err("client_name")} />
              <textarea rows={2} className={`${inputCls} mt-1`} placeholder="Address (optional)" value={form.client_address} onChange={(e) => set("client_address", e.target.value)} />
            </Value>
            <Label>Whether SEZ</Label>
            <Value>
              <YesNo name="Whether SEZ" value={form.is_sez} onChange={(v) => set("is_sez", v)} />
            </Value>

            <Label required>WO No.</Label>
            <Value>
              <input className={cls("po_wo_no")} value={form.po_wo_no} onChange={(e) => set("po_wo_no", e.target.value)} />
              <FieldError msg={err("po_wo_no")} />
            </Value>
            <Label required>Date</Label>
            <Value>
              <input type="date" className={cls("po_date")} value={form.po_date} onChange={(e) => set("po_date", e.target.value)} />
              <FieldError msg={err("po_date")} />
            </Value>

            <div className={headingCls}>
              <span>PO details &amp; work order documents</span>
            </div>

            <Label>PO No.</Label>
            <Value>
              <input
                className={inputCls}
                placeholder="Customer purchase order number"
                value={form.customer_po_no}
                onChange={(e) => set("customer_po_no", e.target.value)}
              />
            </Value>
            <Label>PO Date</Label>
            <Value>
              <input
                type="date"
                className={inputCls}
                value={form.customer_po_date}
                onChange={(e) => set("customer_po_date", e.target.value)}
              />
            </Value>

            <Label>PO notes</Label>
            <Value full>
              <textarea
                rows={2}
                className={inputCls}
                placeholder="Optional notes about the purchase order"
                value={form.customer_po_notes}
                onChange={(e) => set("customer_po_notes", e.target.value)}
              />
            </Value>

            <Label>WO documents</Label>
            <Value full>
              {(() => {
                const savedDocs = form.wo_documents?.length
                  ? form.wo_documents
                  : normalizeWoDocuments(form);
                const hasAny = pendingWoFiles.length > 0 || savedDocs.length > 0;
                return (
                  <div className="space-y-2">
                    {!hasAny && (
                      <span className="text-xs text-slate-500">No work order documents uploaded.</span>
                    )}
                    {pendingWoFiles.map((p, index) => (
                      <div key={`pending-wo-${p.file.name}-${index}`} className="flex flex-wrap items-center gap-2">
                        <button type="button" data-active className={smallBtn} onClick={() => openWoDocument(p)}>
                          View {p.file.name}
                        </button>
                        {canEdit && (
                          <button type="button" className={smallBtn} disabled={uploadingWo} onClick={() => removePendingWoFile(index)}>
                            Remove
                          </button>
                        )}
                        <span className="text-[11px] text-slate-500">Pending save</span>
                      </div>
                    ))}
                    {savedDocs.map((doc) => (
                      <div key={doc.path} className="flex flex-wrap items-center gap-2">
                        <button type="button" data-active className={smallBtn} onClick={() => openWoDocument(doc)}>
                          View {doc.name}
                        </button>
                        {canEdit && (
                          <button type="button" className={smallBtn} disabled={uploadingWo} onClick={() => removeWoFile(doc)}>
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {canEdit && (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className={`${smallBtn} cursor-pointer ${uploadingWo ? "opacity-50" : ""}`}>
                          {uploadingWo ? "Uploading…" : hasAny ? "Add documents" : "Upload work order"}
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                            multiple
                            disabled={uploadingWo}
                            onChange={onWoFile}
                          />
                        </label>
                        {hasAny && (
                          <button type="button" className={smallBtn} disabled={uploadingWo} onClick={clearAllWoFiles}>
                            Remove all
                          </button>
                        )}
                      </div>
                    )}
                    {canEdit && pendingWoFiles.length > 0 && !form.id && (
                      <p className="text-[11px] text-slate-500">These files are kept when you save. Cancel discards them.</p>
                    )}
                  </div>
                );
              })()}
            </Value>

            <Label required>Description of work</Label>
            <Value full>
              <textarea rows={2} className={cls("project_description")} value={form.project_description} onChange={(e) => set("project_description", e.target.value)} />
              <FieldError msg={err("project_description")} />
            </Value>

            <Label>Duration</Label>
            <Value>
              <input className={inputCls} placeholder={suggestedDuration || "e.g. 2 Days"} value={form.duration_text} onChange={(e) => set("duration_text", e.target.value)} />
              {suggestedDuration && form.duration_text !== suggestedDuration && canEdit && (
                <button type="button" className={`${smallBtn} mt-1`} onClick={() => set("duration_text", suggestedDuration)}>
                  Use {suggestedDuration}
                </button>
              )}
            </Value>
            <Label>From / To</Label>
            <Value>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" aria-label="Duration from" className={inputCls} value={form.duration_from} onChange={(e) => set("duration_from", e.target.value)} />
                <input type="date" aria-label="Duration to" className={cls("duration_to")} value={form.duration_to} onChange={(e) => set("duration_to", e.target.value)} />
              </div>
              <FieldError msg={err("duration_to")} />
            </Value>

            <Label>Date of actual mobilization</Label>
            <Value>
              <input type="date" className={inputCls} value={form.mobilization_date} onChange={(e) => set("mobilization_date", e.target.value)} />
            </Value>
            <Label>Payment terms</Label>
            <Value>
              <textarea rows={2} className={inputCls} placeholder="e.g. 100% within 30 Days" value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} />
            </Value>

            <Label>GST (%)</Label>
            <Value>
              <input type="number" min="0" max="100" step="0.01" className={cls("gst_pct")} value={form.gst_pct} onChange={(e) => set("gst_pct", e.target.value)} />
              <FieldError msg={err("gst_pct")} />
            </Value>
            <Label>GST</Label>
            <Value>
              <YesNo name="GST applicable" value={form.gst_applicable} onChange={(v) => set("gst_applicable", v)} yes="Applicable" no="Not applicable" />
            </Value>

            <Label>Contract Value (Excl. Taxes)</Label>
            <Value full>
              <div className="flex flex-wrap items-start gap-2">
                <select className={`${inputCls} w-24`} value={form.currency} onChange={(e) => set("currency", e.target.value)} aria-label="Currency">
                  {CM_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00 (optional, for records)"
                  className={`${cls("contract_value")} max-w-xs`}
                  value={form.contract_value}
                  onChange={(e) => set("contract_value", e.target.value.replace(/[^\d.]/g, ""))}
                />
              </div>
              <FieldError msg={err("contract_value")} />
              {words && <p className="mt-1 text-[11px] italic text-slate-600">{words}</p>}
            </Value>

            <div className={headingCls}>
              <span>Manpower / vehicle deployment</span>
              {canEdit && (
                <button type="button" className={smallBtn} onClick={addDeploymentItem}>
                  <Plus className="h-3 w-3" /> Add field
                </button>
              )}
            </div>
            <div className="md:col-span-4 grid grid-cols-2 border-b border-r border-slate-300 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
              {visibleManpowerFields.map(({ key, label }) => (
                <div key={key} className="relative border-r border-slate-200 px-3 py-2 last:border-r-0">
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[11px] font-semibold text-slate-700">{label}</span>
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`Remove ${label}`}
                        onClick={() => removeBuiltinDeployment(key)}
                        className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="-"
                    aria-label={label}
                    className={`${cls(key)} mt-1 text-center`}
                    value={form[key]}
                    onChange={(e) => set(key, digits(e.target.value))}
                    disabled={!canEdit}
                  />
                  <FieldError msg={err(key)} />
                </div>
              ))}
              {(form.extra_deployment || []).map((row, i) => (
                <div key={row.key} className="relative border-r border-slate-200 px-3 py-2 last:border-r-0">
                  <div className="flex items-start gap-1">
                    <input
                      className={`${cls(`extra_deployment.${i}.label`)} min-w-0 flex-1 border-slate-200 px-1 py-0.5 text-[11px] font-semibold text-slate-700`}
                      placeholder="e.g. Driver"
                      aria-label="Deployment name"
                      value={row.label}
                      onChange={(e) => setDeploymentItem(i, { label: e.target.value })}
                      disabled={!canEdit}
                    />
                    {canEdit && (
                      <button
                        type="button"
                        aria-label="Remove deployment field"
                        onClick={() => removeDeploymentItem(i)}
                        className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="-"
                    aria-label={`${row.label || "Deployment"} quantity`}
                    className={`${cls(`extra_deployment.${i}.count`)} mt-1 text-center`}
                    value={row.count}
                    onChange={(e) => setDeploymentItem(i, { count: digits(e.target.value) })}
                    disabled={!canEdit}
                  />
                  <FieldError msg={err(`extra_deployment.${i}.label`) || err(`extra_deployment.${i}.count`)} />
                </div>
              ))}
            </div>

            <Label>Insurance</Label>
            <Value>
              <input className={inputCls} value={form.insurance} onChange={(e) => set("insurance", e.target.value)} />
            </Value>
            <Label>Minimum wage rate</Label>
            <Value>
              <input className={inputCls} value={form.minimum_wage_rate} onChange={(e) => set("minimum_wage_rate", e.target.value)} />
            </Value>

            <Label>Scope of Relievers</Label>
            <Value full>
              <input className={inputCls} placeholder="e.g. Not Applicable" value={form.relievers_scope} onChange={(e) => set("relievers_scope", e.target.value)} />
            </Value>
            <Label>Duty pattern</Label>
            <Value full>
              <input className={inputCls} value={form.duty_pattern} onChange={(e) => set("duty_pattern", e.target.value)} />
            </Value>
            <Label>Accommodation &amp; Transportation</Label>
            <Value full>
              <input className={inputCls} value={form.accommodation_transport} onChange={(e) => set("accommodation_transport", e.target.value)} />
            </Value>

            <Label>SD Deduction from RA Bill</Label>
            <Value full>
              <div className="flex flex-wrap items-start gap-3">
                <YesNo name="SD Deduction from RA Bill" value={form.sd_ra_applicable} onChange={(v) => set("sd_ra_applicable", v)} yes="Applicable" no="N/A" />
                {form.sd_ra_applicable === true && (
                  <>
                    <label className="text-[11px] text-slate-500">
                      %
                      <input type="number" min="0" max="100" step="0.01" className={`${cls("sd_ra_pct")} w-24`} value={form.sd_ra_pct} onChange={(e) => set("sd_ra_pct", e.target.value)} />
                      <FieldError msg={err("sd_ra_pct")} />
                    </label>
                    <label className="min-w-[12rem] flex-1 text-[11px] text-slate-500">
                      Release Period
                      <input className={inputCls} value={form.sd_release_period} onChange={(e) => set("sd_release_period", e.target.value)} />
                    </label>
                  </>
                )}
              </div>
            </Value>
            <Label>SD - PBG</Label>
            <Value full>
              <input className={inputCls} placeholder="e.g. N/A" value={form.sd_pbg} onChange={(e) => set("sd_pbg", e.target.value)} />
            </Value>
            <Label>Details of EMD paid, if any</Label>
            <Value full>
              <input className={inputCls} placeholder="e.g. N/A" value={form.emd_details} onChange={(e) => set("emd_details", e.target.value)} />
            </Value>

            <div className={headingCls}>
              <span>Customer&apos;s contact details</span>
              {canEdit && (
                <button type="button" className={smallBtn} onClick={addContact}>
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
                    <input className={inputCls} placeholder="Department" value={c.department} onChange={(e) => setContact(i, { department: e.target.value })} />
                    {canEdit && (
                      <button type="button" aria-label="Remove contact" onClick={() => removeContact(i)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className={valueCellCls}>
                  <input className={inputCls} placeholder="Name" value={c.names} onChange={(e) => setContact(i, { names: e.target.value })} />
                </div>
                <div className={valueCellCls}>
                  <textarea rows={1} className={cls(`contacts.${i}.mobiles`)} placeholder="Mobile No. (separate with commas)" value={c.mobiles} onChange={(e) => setContact(i, { mobiles: e.target.value })} />
                  <FieldError msg={err(`contacts.${i}.mobiles`)} />
                </div>
                <div className={valueCellCls}>
                  <textarea rows={1} className={cls(`contacts.${i}.emails`)} placeholder="E-mail (separate with commas)" value={c.emails} onChange={(e) => setContact(i, { emails: e.target.value })} />
                  <FieldError msg={err(`contacts.${i}.emails`)} />
                </div>
              </React.Fragment>
            ))}

            <Label>Remarks</Label>
            <Value full>
              <textarea rows={2} className={inputCls} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
            </Value>

          </div>
        </fieldset>
        {readOnly && (
          <style>{`
            .cm-po-view-only input,
            .cm-po-view-only textarea,
            .cm-po-view-only select,
            .cm-po-view-only button,
            .cm-po-view-only label {
              pointer-events: none;
            }
            .cm-po-view-only input,
            .cm-po-view-only textarea,
            .cm-po-view-only select {
              background-color: rgb(241 245 249);
              color: rgb(100 116 139);
            }
            .cm-po-view-only [data-active] {
              pointer-events: auto;
              opacity: 1;
            }
          `}</style>
        )}

        <div className="border-t border-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-slate-200/70 px-3 py-2 text-xs font-bold text-slate-800">
            <span>
              {CM_OC_APPROVAL_HEADING}
              {liveCategory ? ` — ${cmCategoryLabel(liveCategory)}` : ""}
              {stages.length ? ` · ${progress.signedCount}/${stages.length} signed` : ""}
            </span>
            {codeLoaded && !myCode && (
              <span className="font-normal text-amber-700">
                Your login is not linked to an employee code, so you cannot sign an assigned stage. Ask an administrator to link it in User Management.
              </span>
            )}
          </div>
          {!stages.length ? (
            <p className="px-3 py-3 text-xs text-amber-800">Choose the PO category to see its approval stages.</p>
          ) : (
            <>
              <p className="border-b border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                Each stage opens only after the previous stage is signed. Signatures are taken from each signer&apos;s own Indus One upload.
                {!saved
                  ? " Save the PO At Glance to start approvals — your signature is applied to the OC Creator stage when you save."
                  : categoryChanged
                    ? ` Category changed to ${cmCategoryLabel(liveCategory)} — save to apply this workflow.`
                    : progress.complete ? " All stages are signed." : progress.next ? ` Waiting for: ${progress.next.label}.` : ""}
              </p>
              <div className={`grid grid-cols-1 border-l border-slate-300 sm:grid-cols-2 ${stages.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
                {stages.map(({ slot, label }, i) => {
                  const signed = !isBlank(form.signoff[slot]?.saved_by);
                  return (
                    <StageBox
                      key={slot}
                      index={i + 1}
                      label={label}
                      status={signed ? "Signed" : progress.next?.slot === slot ? "Pending" : "Waiting"}
                      caption={stageCaption(slot)}
                      sign={form.signoff[slot]}
                      signatureUrl={stageSignatureUrls[slot] || ""}
                      canSign={canSignStage(slot)}
                      signing={signingSlot === slot}
                      onSign={() => requestSign(slot)}
                      preview={!saved && slot === "CREATOR" && canEdit ? mySignatureUrl : ""}
                      note={stageNote(slot)}
                    />
                  );
                })}
              </div>
            </>
          )}
          {legacySigned.length > 0 && (
            <div className="border-t border-slate-300 px-3 py-2 text-[11px] text-slate-600">
              <p className="font-semibold text-slate-700">Earlier sign-offs (previous format, kept for reference)</p>
              <ul className="mt-1 space-y-0.5">
                {legacySigned.map(({ slot, label }) => (
                  <li key={slot}>
                    {label}: {form.signoff[slot].saved_by} — {formatSignedAt(form.signoff[slot].signed_at)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
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
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? "Save changes" : "Save PO At Glance"}
          </button>
        </div>
      )}

      <SignModal
        state={signModal}
        onClose={() => setSignModal(null)}
        onConfirm={() => {
          const slot = signModal?.slot;
          setSignModal(null);
          if (slot && form.id) signStage(form.id, slot);
        }}
      />
    </div>
  );
}
