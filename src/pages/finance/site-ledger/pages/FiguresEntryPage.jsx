/**
 * Figures entry page — dense, spreadsheet-style period entry.
 * Extracted from SiteLedgerApp (EntryForm). Save paths (explicit-save coordinator and legacy
 * autosave) are unchanged.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Building2, PlusCircle, Search, Eye, Sliders, CalendarClock, X } from "lucide-react";
import {
  savePeriodRecord,
  flushPeriodRecordNow,
  mergePeriodEntry,
  formatPeriodFigureSaveError,
  REIMBURSEMENT_TYPES,
  REIMBURSEMENT_OTHER_KEY,
  newReimbursementId,
  normalizeReimbursementsFromRecord,
  reimbursementDisplayLines,
  FinanceConflictError,
} from "../../api/siteLedgerStore";
import { isAtomicConcurrencyEnabled, periodRecordKey } from "../index.js";
import { newFinanceRequestId } from "../persistence/financeConcurrency.js";
import { DraftRecoveryPanel, DraftStatusChip } from "../components/DraftRecoveryPanel.jsx";
import { ConflictResolutionPanel } from "../components/ConflictResolutionPanel.jsx";
import { REVENUE_ITEMS, parentColor, parentLabel } from "../domain/constants.js";
import { displayStructure, siteChildKeys } from "../domain/siteStructure.js";
import { inContract } from "../domain/siteLifecycle.js";
import { inr, pct } from "../domain/formatMoney.js";
import { PeriodDateSelect } from "../../components/PeriodDateSelect";
import { SiteClientAutocomplete } from "../../components/SiteClientAutocomplete";
import { PlAuditPanel } from "../../components/PlAuditPanel";
import { periodAbsoluteIndex as monthIdx, currentPeriodKey } from "../../lib/periods";
import { PrimaryButton, SectionCard, StatusChip } from "../../../../components/erpUi";
import { calcSite, parseEntryAmount, monthLabelOf } from "./pageShared.jsx";
import { handleAmountEnterNavigation } from "./entryGridNav.js";
import { SpreadEditor } from "./SiteSetupPage.jsx";

/* ───────────────────────── ENTRY FORM ───────────────────────── */
export function recordToFormFields(raw) {
  if (!raw || typeof raw !== "object") return {};
  const form = {};
  Object.entries(raw).forEach(([k, v]) => {
    if (k === "reimbursements" || k === "reimbursementType" || k === "reimbursementOtherLabel" || k === "esicBill") {
      return;
    }
    if (k === "creditNoteRemark") {
      form.creditNoteRemark = v != null ? String(v) : "";
      return;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      form[k] = String(v);
    } else if (v != null && v !== "") {
      form[k] = v;
    }
  });
  form.reimbursements = normalizeReimbursementsFromRecord(raw).map((it) => ({
    ...it,
    amount: it.amount != null && it.amount !== 0 ? String(it.amount) : "",
  }));
  return form;
}

export function entryRecordClean(form, expenseHeadKeys = []) {
  const clean = {};
  const expenseSet = new Set(expenseHeadKeys);
  const reimbursements = (form.reimbursements || [])
    .filter((it) => it.type)
    .map((it) => ({
      id: it.id || newReimbursementId(),
      type: it.type,
      amount: parseEntryAmount(it.amount),
      ...(it.type === REIMBURSEMENT_OTHER_KEY ? { label: String(it.label ?? "").trim() } : {}),
    }));
  if (Array.isArray(form.reimbursements)) {
    clean.reimbursements = reimbursements;
    const total = reimbursements.reduce((s, it) => s + parseEntryAmount(it.amount), 0);
    if (total) clean.esicBill = total;
  }
  Object.entries(form).forEach(([k, v]) => {
    if (
      k === "reimbursements" ||
      k === "reimbursementType" ||
      k === "reimbursementOtherLabel" ||
      k === "esicBill" ||
      k === "creditNoteRemark"
    ) {
      return;
    }
    if (expenseSet.has(k)) {
      if (v === undefined || v === null || String(v).trim() === "") {
        clean[k] = 0;
        return;
      }
      const n = parseEntryAmount(v);
      if (!Number.isNaN(n)) clean[k] = n;
      return;
    }
    if (v === undefined || v === null || String(v).trim() === "") return;
    const n = parseEntryAmount(v);
    if (!Number.isNaN(n)) clean[k] = n;
  });
  for (const key of expenseHeadKeys) {
    if (!(key in clean)) clean[key] = 0;
  }
  const remark = form.creditNoteRemark != null ? String(form.creditNoteRemark).trim() : "";
  if (remark) clean.creditNoteRemark = remark;
  return clean;
}

export function buildReimbursementSavePayload(existing, reimbursementItems) {
  const reimbClean = entryRecordClean({ reimbursements: reimbursementItems });
  return mergePeriodEntry(existing, reimbClean);
}

/** Figures-only clean: omit reimbursements so figure autosave stays independent. */
export function entryFiguresClean(form, expenseHeadKeys = []) {
  const {
    reimbursements: _r,
    reimbursementType: _t,
    reimbursementOtherLabel: _l,
    esicBill: _e,
    ...figureFields
  } = form || {};
  return entryRecordClean(figureFields, expenseHeadKeys);
}

export function revenueTotalRows(rec) {
  const rows = [];
  REVENUE_ITEMS.forEach((it) => {
    if (it.key === "esicBill") {
      const lines = reimbursementDisplayLines(rec);
      if (lines.length) {
        lines.forEach((ln) => rows.push({ label: `Reimbursement · ${ln.label}`, amount: ln.amount, sign: it.sign }));
      } else {
        rows.push({ label: it.label, amount: 0, sign: it.sign });
      }
    } else {
      rows.push({ label: it.label, amount: parseEntryAmount(rec[it.key]), sign: it.sign });
    }
  });
  return rows;
}

export function SiteSearchSelect({ sites, value, onChange, label = "Site", id = "site-search" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const selected = sites.find((s) => s.id === value) || null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((s) => {
      const hay = [s.name, s.service, s.wo, s.ocNumber, s.id].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [sites, query]);
  useEffect(() => {
    if (!open) setQuery(selected?.name || "");
  }, [open, selected?.name, selected?.id]);
  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const pick = (siteId) => {
    onChange(siteId);
    setOpen(false);
    const site = sites.find((s) => s.id === siteId);
    setQuery(site?.name || "");
  };
  return (
    <div className="entry-sel site-search" ref={wrapRef}>
      <label htmlFor={id}>{label}</label>
      <div className="site-search-box">
        <Search className="site-search-ico" size={14} />
        <input
          id={id}
          type="text"
          value={open ? query : (selected?.name || "")}
          placeholder="Search site name, OC, PO…"
          onFocus={() => {
            setOpen(true);
            setQuery(selected?.name || "");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery(selected?.name || "");
            }
            if (e.key === "Enter" && filtered[0]) {
              e.preventDefault();
              pick(filtered[0].id);
            }
          }}
          autoComplete="off"
        />
        {open && (
          <div className="site-search-menu" role="listbox">
            {filtered.length === 0 ? (
              <div className="site-search-empty">No sites match your search</div>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={s.id === value}
                  className={"site-search-opt" + (s.id === value ? " on" : "")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s.id)}
                >
                  <span className="site-search-opt-name">{s.name}</span>
                  {(s.ocNumber || s.wo) && (
                    <span className="site-search-opt-meta">
                      {[s.ocNumber, s.wo].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const ENTRY_AUTOSAVE_MS = 450;

export function FiguresEntryPage({
  sites,
  sitesAll,
  library,
  parents,
  records,
  month,
  setMonth,
  activeSite,
  setActiveSite,
  libMap,
  onSave,
  onRecordPersisted,
  onRecordSaveFailed,
  onPeriodSaveError,
  onPatchSite,
  onAdd,
  goConfig,
  onViewBudget,
  explicitSaveMode = false,
  saveCoordinator = null,
  userId = "anon",
  onFiguresDirtyChange = null,
}) {
  const [siteId, setSiteId] = useState(activeSite || sites[0]?.id || "");
  const [mk, setMk] = useState(month || currentPeriodKey());
  const [form, setForm] = useState({});
  const [saveUi, setSaveUi] = useState("idle");
  const [reimbSaveUi, setReimbSaveUi] = useState("idle");
  const [formDirty, setFormDirty] = useState(false);
  const [reimbDirty, setReimbDirty] = useState(false);
  const [draftOffer, setDraftOffer] = useState(null);
  const [draftComparison, setDraftComparison] = useState(null);
  const [draftStorageWarning, setDraftStorageWarning] = useState(null);
  const [draftLifecycle, setDraftLifecycle] = useState("idle");
  const [draftStatusChip, setDraftStatusChip] = useState(null);
  const [conflictInfo, setConflictInfo] = useState(null);
  const formRef = useRef(form);
  const gridRef = useRef(null);
  formRef.current = form;
  const suppressRecordReload = useRef(false);
  const formLoadKey = useRef("");
  const figurePersistGen = useRef(0);
  const reimbPersistGen = useRef(0);
  const autosaveTimer = useRef(null);
  const formDirtyRef = useRef(false);
  const reimbDirtyRef = useRef(false);
  formDirtyRef.current = formDirty;
  reimbDirtyRef.current = reimbDirty;
  const reimbSaveUiTimer = useRef(null);

  useEffect(() => {
    onFiguresDirtyChange?.(!!(formDirty || reimbDirty || saveUi === "saving" || saveUi === "error"));
  }, [formDirty, reimbDirty, saveUi, onFiguresDirtyChange]);

  useEffect(() => {
    if (activeSite && sites.some((s) => s.id === activeSite)) {
      setSiteId(activeSite);
      return;
    }
    if (siteId && sites.some((s) => s.id === siteId)) return;
    const fallback = sites[0]?.id || "";
    if (fallback) setSiteId(fallback);
  }, [activeSite, sites, siteId]);
  useEffect(() => { setMk(month); }, [month]);
  useEffect(() => {
    const loadKey = `${siteId}__${mk}`;
    if (suppressRecordReload.current) {
      suppressRecordReload.current = false;
      return;
    }
    const navigated = formLoadKey.current !== loadKey;
    formLoadKey.current = loadKey;
    const raw = records[loadKey];
    setForm((prev) => {
      const loaded = recordToFormFields(raw);
      if (!navigated) {
        return { ...loaded, ...prev, reimbursements: prev.reimbursements ?? loaded.reimbursements };
      }
      return loaded;
    });
    if (navigated) {
      setFormDirty(false);
      setReimbDirty(false);
      setSaveUi("idle");
      setReimbSaveUi("idle");
      setDraftOffer(null);
      setDraftComparison(null);
      setDraftLifecycle("idle");
      setDraftStatusChip(null);
    }
    if (explicitSaveMode && saveCoordinator && siteId && mk) {
      saveCoordinator.setUserId?.(userId);
      saveCoordinator.loadPeriod(siteId, mk, raw || {}, { forceReset: navigated });
    }
  }, [siteId, mk, records, explicitSaveMode, saveCoordinator, userId]);

  // Draft recovery evaluation (explicit mode only) — never auto-apply over server data.
  useEffect(() => {
    if (!explicitSaveMode || !saveCoordinator || !siteId || !mk) return undefined;
    let cancelled = false;
    (async () => {
      const server = records[`${siteId}__${mk}`] || {};
      const evaluated = await saveCoordinator.evaluatePeriodDraft(siteId, mk, server, null);
      if (cancelled) return;
      setDraftStorageWarning(evaluated.storageWarning?.message || null);
      if (!evaluated.draft || !evaluated.comparison.differsFromServer) {
        setDraftOffer(null);
        setDraftComparison(null);
        if (draftLifecycle !== "recovered" && draftLifecycle !== "committed") {
          setDraftStatusChip(formDirty || reimbDirty ? "draft_modified" : null);
        }
        return;
      }
      setDraftOffer(evaluated.draft);
      setDraftComparison(evaluated.comparison);
      setDraftLifecycle(evaluated.comparison.isConflict ? "conflict" : "available");
      setDraftStatusChip(evaluated.comparison.isConflict ? "draft_conflict" : "draft_available");
    })();
    return () => { cancelled = true; };
  }, [explicitSaveMode, saveCoordinator, siteId, mk, records]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveUiTimer = useRef(null);
  const periodSaveContext = useMemo(
    () => ({ sites, library, parents }),
    [sites, library, parents],
  );

  const syncWorkingCopyFromForm = useCallback((nextForm) => {
    if (!explicitSaveMode || !saveCoordinator || !siteId || !mk) return;
    const site = sites.find((s) => s.id === siteId);
    const expenseHeadKeys = site ? siteChildKeys(site) : [];
    const clean = entryFiguresClean(nextForm, expenseHeadKeys);
    const existing = records[`${siteId}__${mk}`] || {};
    const withReimb = {
      ...mergePeriodEntry(existing, clean, expenseHeadKeys),
      reimbursements: nextForm.reimbursements || [],
    };
    saveCoordinator.editPeriod(siteId, mk, withReimb, {
      persistDraft: true,
      siteCode: siteId,
      periodKey: mk,
    });
    setDraftLifecycle("pending");
    setDraftStatusChip("draft_modified");
    if (saveCoordinator.lastStorageWarning?.message) {
      setDraftStorageWarning(saveCoordinator.lastStorageWarning.message);
    }
  }, [explicitSaveMode, saveCoordinator, siteId, mk, sites, records]);

  const persistForm = useCallback((data, { manual = false, immediate = false } = {}) => {
    const payload = data ?? formRef.current;
    const site = sites.find((s) => s.id === siteId);
    const expenseHeadKeys = site ? siteChildKeys(site) : [];
    // Figures only — reimbursements have their own save path/status (legacy).
    const clean = entryFiguresClean(payload, expenseHeadKeys);
    const existing = records[`${siteId}__${mk}`] || {};
    const prior = { ...existing };
    const toPersist = mergePeriodEntry(existing, clean, expenseHeadKeys);

    // Explicit-save path: working copy + coordinator; no optimistic commit; no autosave.
    if (explicitSaveMode && saveCoordinator) {
      const withReimb = {
        ...toPersist,
        reimbursements: payload.reimbursements || formRef.current.reimbursements || [],
        _revision: existing._revision ?? 0,
      };
      const requestId = newFinanceRequestId();
      const useAtomic = isAtomicConcurrencyEnabled();
      saveCoordinator.editPeriod(siteId, mk, withReimb, {
        persistDraft: true,
        siteCode: siteId,
        periodKey: mk,
      });
      setMonth(mk);
      setActiveSite(siteId);
      setSaveUi("saving");
      setDraftStatusChip("draft_pending_save");
      setConflictInfo(null);
      if (saveUiTimer.current) clearTimeout(saveUiTimer.current);
      const gen = ++figurePersistGen.current;
      const originalSnap = { ...(saveCoordinator.getRecord?.(periodRecordKey(siteId, mk))?.original || existing) };
      return saveCoordinator
        .savePeriod(siteId, mk, {
          persist: async (working) => {
            try {
              const syncResult = await savePeriodRecord(
                siteId,
                mk,
                { ...working, _revision: working._revision ?? existing._revision ?? 0, _requestId: requestId },
                periodSaveContext,
                {
                  immediate: true,
                  expectedRevision: working._revision ?? existing._revision ?? 0,
                  requestId,
                  useAtomic,
                  audit: { trigger: "user", action: "figure_explicit_save" },
                },
              );
              return syncResult && typeof syncResult === "object"
                ? syncResult
                : { peId: syncResult, revision: null };
            } catch (e) {
              if (e instanceof FinanceConflictError) {
                e.conflictOriginal = originalSnap;
                e.conflictPending = working;
              }
              throw e;
            }
          },
        })
        .then((result) => {
          if (gen !== figurePersistGen.current) return result;
          if (!result.ok) {
            setFormDirty(true);
            setSaveUi("error");
            if (result.conflict) {
              setDraftLifecycle("conflict");
              setDraftStatusChip("draft_conflict");
              setConflictInfo({
                message: result.error,
                original: originalSnap,
                server: result.conflict.server || {},
                pending: withReimb,
              });
            } else {
              setDraftLifecycle("save_failed");
              setDraftStatusChip("save_failed");
            }
            onPeriodSaveError?.(result.error || "Figure save failed");
            return result;
          }
          if (result.staleIgnored) {
            setDraftStatusChip("draft_modified");
            return result;
          }
          // Prefer server revision from coordinator / RPC; never guess +1 locally.
          const committed = result.record?.working || result.record?.committed || withReimb;
          const nextRev = committed?._revision != null
            ? Number(committed._revision)
            : withReimb._revision;
          suppressRecordReload.current = true;
          onSave(siteId, mk, { ...withReimb, ...committed, _revision: nextRev });
          setFormDirty(false);
          setReimbDirty(false);
          onRecordPersisted?.();
          setSaveUi("saved");
          setDraftOffer(null);
          setDraftComparison(null);
          setConflictInfo(null);
          setDraftLifecycle("committed");
          setDraftStatusChip("committed");
          saveUiTimer.current = setTimeout(() => {
            setSaveUi("idle");
            setDraftStatusChip(null);
            setDraftLifecycle("idle");
          }, 2000);
          return result;
        })
        .catch((e) => {
          if (gen !== figurePersistGen.current) return;
          console.error("Figure save failed:", e);
          setFormDirty(true);
          setSaveUi("error");
          if (e instanceof FinanceConflictError) {
            setDraftLifecycle("conflict");
            setDraftStatusChip("draft_conflict");
            setConflictInfo({
              message: e.message,
              original: e.conflictOriginal || originalSnap,
              server: e.server || {},
              pending: e.conflictPending || withReimb,
            });
          } else {
            setDraftLifecycle("save_failed");
            setDraftStatusChip("save_failed");
          }
          onPeriodSaveError?.(e);
        });
    }

    // Legacy autosave path (feature flag OFF).
    const gen = ++figurePersistGen.current;
    suppressRecordReload.current = true;
    onSave(siteId, mk, toPersist);
    setMonth(mk);
    setActiveSite(siteId);
    setFormDirty(false);
    setSaveUi("saving");
    if (saveUiTimer.current) clearTimeout(saveUiTimer.current);
    return savePeriodRecord(siteId, mk, toPersist, periodSaveContext, { immediate })
      .then(() => {
        if (gen !== figurePersistGen.current) return;
        onRecordPersisted?.();
        setSaveUi(manual ? "saved" : "autosaved");
        saveUiTimer.current = setTimeout(() => setSaveUi("idle"), manual ? 2000 : 1200);
      })
      .catch((e) => {
        if (gen !== figurePersistGen.current) return;
        console.error("Figure save failed:", e);
        suppressRecordReload.current = true;
        onRecordSaveFailed?.(siteId, mk, prior);
        onPeriodSaveError?.(e);
        setFormDirty(true);
        setSaveUi("error");
      });
  }, [siteId, mk, records, sites, onSave, onRecordPersisted, onRecordSaveFailed, onPeriodSaveError, setMonth, setActiveSite, periodSaveContext, explicitSaveMode, saveCoordinator]);

  const saveReimbursements = useCallback(() => {
    const existing = records[`${siteId}__${mk}`] || {};
    const prior = { ...existing };
    const merged = buildReimbursementSavePayload(existing, formRef.current.reimbursements || []);
    const gen = ++reimbPersistGen.current;

    if (explicitSaveMode && saveCoordinator) {
      // Include reimbursements in the working copy, then commit via the same explicit Save path.
      setForm((f) => ({ ...f, reimbursements: formRef.current.reimbursements || [] }));
      setReimbDirty(true);
      setFormDirty(true);
      return persistForm(
        {
          ...formRef.current,
          reimbursements: formRef.current.reimbursements || [],
        },
        { manual: true, immediate: true },
      );
    }

    suppressRecordReload.current = true;
    onSave(siteId, mk, merged);
    setReimbDirty(false);
    setReimbSaveUi("saving");
    if (reimbSaveUiTimer.current) clearTimeout(reimbSaveUiTimer.current);
    return savePeriodRecord(siteId, mk, merged, periodSaveContext, { immediate: true })
      .then(() => {
        if (gen !== reimbPersistGen.current) return;
        onRecordPersisted?.();
        setForm((f) => ({
          ...f,
          reimbursements: recordToFormFields(merged).reimbursements,
        }));
        setReimbSaveUi("saved");
        reimbSaveUiTimer.current = setTimeout(() => setReimbSaveUi("idle"), 2000);
      })
      .catch((e) => {
        if (gen !== reimbPersistGen.current) return;
        console.error("Reimbursement save failed:", e);
        suppressRecordReload.current = true;
        onRecordSaveFailed?.(siteId, mk, prior);
        onPeriodSaveError?.(formatPeriodFigureSaveError(e, "Reimbursement save"));
        setReimbDirty(true);
        setReimbSaveUi("error");
      });
  }, [siteId, mk, records, onSave, onRecordPersisted, onRecordSaveFailed, onPeriodSaveError, periodSaveContext, explicitSaveMode, saveCoordinator, persistForm]);

  const flushAutosaveNow = useCallback(() => {
    if (explicitSaveMode) {
      // Persist draft only — never auto-commit to production on site/period switch.
      syncWorkingCopyFromForm(formRef.current);
      return;
    }
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    const tasks = [];
    if (formDirtyRef.current) {
      tasks.push(persistForm(undefined, { manual: false, immediate: true }));
    }
    if (reimbDirtyRef.current) {
      tasks.push(saveReimbursements());
    }
    if (!tasks.length) {
      void flushPeriodRecordNow(siteId, mk);
    }
  }, [persistForm, saveReimbursements, siteId, mk, explicitSaveMode, syncWorkingCopyFromForm]);

  useEffect(() => {
    // Legacy figure autosave only — reimbursements require explicit Save reimbursement.
    if (explicitSaveMode) return undefined;
    if (!formDirty) return undefined;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      persistForm(undefined, { manual: false });
    }, ENTRY_AUTOSAVE_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [form, formDirty, persistForm, explicitSaveMode]);

  useEffect(() => {
    if (explicitSaveMode) return undefined;
    const flushAll = () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      if (formDirtyRef.current) {
        void persistForm(undefined, { manual: false, immediate: true });
      }
      if (reimbDirtyRef.current) {
        void saveReimbursements();
      }
      if (!formDirtyRef.current && !reimbDirtyRef.current) {
        void flushPeriodRecordNow(siteId, mk);
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    window.addEventListener("pagehide", flushAll);
    window.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      window.removeEventListener("visibilitychange", onHide);
    };
  }, [persistForm, saveReimbursements, siteId, mk, explicitSaveMode]);

  const resumeDraft = useCallback(async () => {
    if (!saveCoordinator || !siteId || !mk) return;
    const next = await saveCoordinator.resumePeriodDraft(siteId, mk);
    if (!next?.working) return;
    suppressRecordReload.current = true;
    setForm(recordToFormFields(next.working));
    setFormDirty(true);
    setReimbDirty(true);
    setSaveUi("idle");
    setDraftLifecycle("recovered");
    setDraftStatusChip("draft_recovered");
    // Keep comparison visible briefly so the user knows this is not a DB commit.
  }, [saveCoordinator, siteId, mk]);

  const discardDraftOffer = useCallback(async () => {
    if (!saveCoordinator || !siteId || !mk) return;
    await saveCoordinator.discardPeriodDraft(siteId, mk);
    setDraftOffer(null);
    setDraftComparison(null);
    setDraftLifecycle("idle");
    setDraftStatusChip(null);
    const raw = records[`${siteId}__${mk}`];
    suppressRecordReload.current = true;
    setForm(recordToFormFields(raw));
    setFormDirty(false);
    setReimbDirty(false);
  }, [saveCoordinator, siteId, mk, records]);
  // Hooks (including the spread effect below) must stay above the early returns (Rules of Hooks).
  const site = sites.find((s) => s.id === siteId);
  // If a user adds a spread and had typed the full total into the start month,
  // clear the direct amount so the input shows the per-month recognised amount.
  useEffect(() => {
    const spreads = site?.spreads || [];
    if (!spreads.length) return;
    const startSpreads = spreads.filter((sp) => sp?.start === mk && sp?.head);
    if (startSpreads.length === 0) return;
    setForm((prev) => {
      let changed = false;
      const next = { ...prev };
      startSpreads.forEach((sp) => {
        const key = sp.head;
        const direct = parseEntryAmount(prev?.[key]);
        const total = Number(sp.total) || 0;
        if (total > 0 && direct === total) {
          next[key] = "0";
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [site?.id, site?.spreads, mk]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sites.length) return <div className="empty"><Building2 size={30} /><h3>No sites yet</h3><p>Add your first site to start recording figures.</p><button className="primary" onClick={onAdd} style={{ marginTop: 12 }}><PlusCircle size={15} /> Add Site</button></div>;
  if (!site) return <div className="empty"><Building2 size={30} /><h3>Site not found</h3><p>Pick another site from the list.</p></div>;
  const structure = displayStructure(site).filter((g) => g.children.length);
  const patchForm = (patch) => {
    setFormDirty(true);
    setForm((f) => {
      const next = { ...f, ...patch };
      if (explicitSaveMode) syncWorkingCopyFromForm(next);
      return next;
    });
  };
  const set = (k, v) => patchForm({ [k]: v });
  const c = calcSite(site, mk, records, form);
  const parentSub = (g) => g.children.reduce((a, k) => a + (c.ex.total[k] || 0), 0);
  const save = () => {
    persistForm(undefined, { manual: true, immediate: true });
  };
  // When a spread is active on a head, users expect to see / edit the *recognised* monthly
  // amount (direct + spread). We store "direct" internally, and compute the display value.
  const setRecognised = (key, rawValue, spreadPerMonth) => {
    if (!(spreadPerMonth > 0)) {
      set(key, rawValue);
      return;
    }
    const typed = parseEntryAmount(rawValue);
    const nextDirect = typed - (Number(spreadPerMonth) || 0);
    set(key, String(nextDirect));
  };
  const fieldDisplayValue = (key, spreadPerMonth) => {
    if (!(spreadPerMonth > 0)) return form[key] ?? "";
    const direct = parseEntryAmount(form[key]);
    const disp = direct + (Number(spreadPerMonth) || 0);
    // Show the spread-per-month amount even if direct is blank/0, so the month auto-fills.
    return String(disp || 0);
  };
  /** Dense amount input; `data-amount-field` powers Enter-to-next-field navigation. */
  const renderAmountInput = (key, label, { spreadPerMonth = 0, testId = key } = {}) => (
    <input
      className="fe-amt"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      data-amount-field="1"
      data-testid={`entry-amount-${testId}`}
      aria-label={label}
      value={fieldDisplayValue(key, spreadPerMonth)}
      placeholder="0"
      onChange={(e) => setRecognised(key, e.target.value, spreadPerMonth)}
    />
  );
  const renderReimbursementSection = () => {
    const items = form.reimbursements || [];
    const selectedFixedTypes = new Set(
      items.filter((it) => it.type && it.type !== REIMBURSEMENT_OTHER_KEY).map((it) => it.type),
    );
    const available = REIMBURSEMENT_TYPES.filter(
      (t) => t.key === REIMBURSEMENT_OTHER_KEY || !selectedFixedTypes.has(t.key),
    );
    const addType = (typeKey) => {
      if (!typeKey) return;
      if (typeKey !== REIMBURSEMENT_OTHER_KEY && selectedFixedTypes.has(typeKey)) return;
      setReimbDirty(true);
      setFormDirty(true);
      setForm((f) => {
        const next = {
          ...f,
          reimbursements: [
            ...(f.reimbursements || []),
            {
              id: newReimbursementId(),
              type: typeKey,
              amount: "",
              ...(typeKey === REIMBURSEMENT_OTHER_KEY ? { label: "" } : {}),
            },
          ],
        };
        if (explicitSaveMode) syncWorkingCopyFromForm(next);
        return next;
      });
    };
    const updateItem = (idx, patch) => {
      setReimbDirty(true);
      setFormDirty(true);
      setForm((f) => {
        const arr = [...(f.reimbursements || [])];
        arr[idx] = { ...arr[idx], ...patch };
        const next = { ...f, reimbursements: arr };
        if (explicitSaveMode) syncWorkingCopyFromForm(next);
        return next;
      });
    };
    const removeItem = (idx) => {
      setReimbDirty(true);
      setFormDirty(true);
      setForm((f) => {
        const next = { ...f, reimbursements: (f.reimbursements || []).filter((_, i) => i !== idx) };
        if (explicitSaveMode) syncWorkingCopyFromForm(next);
        return next;
      });
    };
    const cancelReimbursements = () => {
      const raw = records[`${siteId}__${mk}`];
      setForm((f) => ({ ...f, reimbursements: recordToFormFields(raw).reimbursements }));
      setReimbDirty(false);
      setReimbSaveUi("idle");
    };
    const reimbSaveLabel = reimbSaveUi === "saved"
      ? "✓ Saved"
      : reimbSaveUi === "saving"
        ? "Saving…"
        : reimbSaveUi === "error"
          ? "Save failed — retry"
          : explicitSaveMode
            ? "Save changes"
            : "Save reimbursement";
    return (
      <>
        <tr className="fe-subhead">
          <td>Reimbursement</td>
          <td colSpan={2} className="fe-r">
            <div className="fe-reimb-actions">
              {available.length > 0 && (
                <select
                  className="fe-mini-sel"
                  aria-label="Add reimbursement type"
                  data-testid="entry-reimb-add"
                  value=""
                  onChange={(e) => addType(e.target.value)}
                >
                  <option value="">+ Add type</option>
                  {available.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              )}
              {reimbDirty && (
                <button type="button" className="ghost-d fe-mini-btn" onClick={cancelReimbursements}>
                  Cancel
                </button>
              )}
              {!explicitSaveMode && (
                <button
                  type="button"
                  className="primary sm fe-mini-btn"
                  data-testid="entry-reimb-save"
                  onClick={saveReimbursements}
                  disabled={reimbSaveUi === "saving"}
                >
                  {reimbSaveLabel}
                </button>
              )}
            </div>
          </td>
        </tr>
        {items.length === 0 ? (
          <tr className="fe-hint-row">
            <td colSpan={3}>Optional — add PF, ESIC, bonus, or other items as needed.</td>
          </tr>
        ) : items.map((it, idx) => (
          <tr key={it.id || `${it.type}-${idx}`} className="fe-indent">
            <td>
              <span className="fe-tag">
                {it.type === REIMBURSEMENT_OTHER_KEY
                  ? "Other"
                  : REIMBURSEMENT_TYPES.find((t) => t.key === it.type)?.label || it.type}
              </span>
              {it.type === REIMBURSEMENT_OTHER_KEY && (
                <input
                  className="fe-text"
                  placeholder="Description"
                  aria-label="Reimbursement description"
                  value={it.label ?? ""}
                  onChange={(e) => updateItem(idx, { label: e.target.value })}
                />
              )}
            </td>
            <td className="fe-r">
              <input
                className="fe-amt"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                data-amount-field="1"
                data-testid={`entry-amount-reimb-${idx}`}
                aria-label="Reimbursement amount"
                value={it.amount ?? ""}
                onChange={(e) => updateItem(idx, { amount: e.target.value })}
              />
            </td>
            <td className="fe-r">
              <button type="button" className="fe-del" title="Remove" aria-label="Remove reimbursement line" onClick={() => removeItem(idx)}>
                <X size={13} />
              </button>
            </td>
          </tr>
        ))}
      </>
    );
  };
  const periodStatus = saveUi === "saved" || saveUi === "autosaved"
    ? "✓ saved"
    : saveUi === "saving"
      ? "Saving…"
      : saveUi === "error"
        ? "Not saved"
        : records[`${siteId}__${mk}`]
          ? ""
          : inContract(site, mk) && monthIdx(mk) <= monthIdx(month) ? "• pending" : "";
  const saveLabel = saveUi === "saving"
    ? "Saving…"
    : saveUi === "saved" || saveUi === "autosaved"
      ? "✓ Saved"
      : saveUi === "error"
        ? "Save failed — retry"
        : explicitSaveMode
          ? "Save changes"
          : "Save figures";
  const autosaveHint = saveUi === "error"
    ? (explicitSaveMode
      ? "Save failed — your changes are still on screen; click Save changes to retry"
      : "Save failed — click Save figures to retry")
    : saveUi === "saving"
      ? "Saving to database…"
      : saveUi === "autosaved" || saveUi === "saved"
        ? "✓ Saved to database"
        : formDirty && saveUi === "idle"
          ? (explicitSaveMode ? "Unsaved draft — click Save changes to commit" : "Unsaved changes…")
          : reimbDirty
            ? (explicitSaveMode
              ? "Unsaved reimbursements — included when you Save changes"
              : "Reimbursement not saved — use Save reimbursement")
            : "";
  const periodAudit = records[`${siteId}__${mk}`]?._audit;

  const periodRecord = records[`${siteId}__${mk}`];
  const revision = periodRecord?._revision;
  const unsaved = formDirty || reimbDirty;
  const spreadCount = (site.spreads || []).length;
  const spreadTotal = c.ex ? Object.values(c.ex.amort).reduce((a, b) => a + b, 0) : 0;
  const saleAmt = parseEntryAmount(form.saleRevenue);
  const creditAmt = parseEntryAmount(form.creditNote);
  const marginTone = c.profit >= 0 ? "var(--profit)" : "var(--loss)";

  return (
    <div
      className="entry fe-page"
      data-testid="figures-entry-page"
      ref={gridRef}
      onKeyDown={(e) => handleAmountEnterNavigation(e, gridRef.current)}
    >
      <style>{FIGURES_ENTRY_STYLES}</style>

      {/* Sticky header: site / period / save state / always-visible totals */}
      <div className="fe-sticky" data-testid="entry-sticky-header">
        <div className="fe-head-row">
          <div className="fe-pick">
            <SiteClientAutocomplete sites={sites} value={siteId} onChange={(id) => { flushAutosaveNow(); setSiteId(id); setActiveSite(id); }} label="Site / Client" id="entry-site-search" />
            <div className="entry-sel entry-sel-period">
              <label>Period</label>
              <PeriodDateSelect className="sl-period-pick" inputClassName="sl-period-sel" value={mk} onChange={(v) => { flushAutosaveNow(); setMk(v); }} />
            </div>
          </div>
          <div className="fe-tools">
            <button type="button" className="ghost-d" onClick={() => onViewBudget?.(siteId)}><Eye size={14} /> Budget</button>
            <button type="button" className="ghost-d" onClick={() => goConfig(siteId)}><Sliders size={14} /> Structure</button>
          </div>
          <div className="fe-save">
            <div className="fe-save-row">
              {explicitSaveMode && <DraftStatusChip state={draftStatusChip} />}
              {unsaved && !draftStatusChip && <StatusChip label="Unsaved changes" severity="warning" />}
              {revision != null && <span data-testid="entry-revision"><StatusChip label={`Revision ${revision}`} severity="neutral" /></span>}
              {periodStatus && <span className="entry-period-st">{periodStatus}</span>}
              <PrimaryButton
                className="entry-save-btn"
                data-testid="entry-save"
                onClick={save}
                disabled={saveUi === "saving" || (explicitSaveMode && !formDirty && !reimbDirty && saveUi !== "error")}
                title={explicitSaveMode
                  ? "Save all figures for this site and period to the database"
                  : "Save all figures for this site and period (also auto-saves as you type)"}
              >
                {saveLabel}
              </PrimaryButton>
            </div>
            {autosaveHint && <span className="entry-unsaved" data-testid="entry-save-hint">{autosaveHint}</span>}
          </div>
        </div>
        <div className="fe-totals" data-testid="entry-totals-bar" role="status" aria-label="Period totals">
          <div className="fe-total"><span>Revenue</span><b data-testid="entry-total-revenue">{inr(c.revenue)}</b></div>
          <div className="fe-total"><span>Expense</span><b data-testid="entry-total-expense">{inr(c.expense)}</b></div>
          <div className="fe-total"><span>Profit</span><b data-testid="entry-total-profit" style={{ color: marginTone }}>{inr(c.profit)}</b></div>
          <div className="fe-total"><span>Margin</span><b data-testid="entry-total-margin" style={{ color: marginTone }}>{pct(c.margin)}</b></div>
        </div>
      </div>

      {explicitSaveMode && conflictInfo && (
        <ConflictResolutionPanel
          original={conflictInfo.original}
          server={conflictInfo.server}
          pending={conflictInfo.pending}
          message={conflictInfo.message}
          busy={saveUi === "saving"}
          onKeepEditing={() => {
            setConflictInfo(null);
            setDraftStatusChip("draft_modified");
            setFormDirty(true);
          }}
          onReloadServer={() => {
            const raw = records[`${siteId}__${mk}`];
            suppressRecordReload.current = true;
            setForm(recordToFormFields(raw));
            setFormDirty(false);
            setReimbDirty(false);
            setConflictInfo(null);
            setDraftLifecycle("idle");
            setDraftStatusChip(null);
            void saveCoordinator?.discardPeriodDraft?.(siteId, mk);
          }}
        />
      )}
      {explicitSaveMode && !conflictInfo && (draftOffer || draftStorageWarning || draftLifecycle === "recovered" || draftLifecycle === "save_failed") && (
        <DraftRecoveryPanel
          comparison={draftComparison || (draftOffer ? {
            hasDraft: true,
            differsFromServer: true,
            isConflict: draftLifecycle === "conflict",
            summary: draftLifecycle === "recovered"
              ? "Draft restored into the form. It is not saved to the database until you Save changes."
              : "A local draft is available.",
            draftUpdatedAt: draftOffer?.updatedAt ?? null,
            draftCreatedAt: draftOffer?.createdAt ?? null,
            fieldDiffs: [],
          } : null)}
          storageWarning={draftStorageWarning}
          lifecycle={draftLifecycle === "conflict" ? "conflict" : draftLifecycle}
          onResume={() => void resumeDraft()}
          onDiscard={() => void discardDraftOffer()}
          busy={saveUi === "saving"}
        />
      )}
      <PlAuditPanel audit={periodAudit} className="entry-audit" />
      {spreadTotal > 0 && (
        <div className="amort-note"><CalendarClock size={15} /> This period includes <b>{inr(spreadTotal)}</b> of spread costs (recognised automatically below).</div>
      )}

      <div className="fe-cols">
        <SectionCard title="Revenue" right={<span className="fe-card-meta">Amounts in ₹ · Enter moves to the next field</span>}>
          <table className="fe-grid" data-testid="entry-revenue-grid">
            <thead>
              <tr><th>Item</th><th className="fe-r">Amount (₹)</th><th className="fe-r fe-narrow">Effect</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Sale Revenue</td>
                <td className="fe-r">{renderAmountInput("saleRevenue", "Sale revenue")}</td>
                <td className="fe-r mono">{inr(saleAmt)}</td>
              </tr>
              {renderReimbursementSection()}
              <tr>
                <td>
                  <div>Less: credit note / deductions</div>
                  <input
                    className="fe-text"
                    type="text"
                    data-testid="entry-credit-remark"
                    aria-label="Deduction remark"
                    value={form.creditNoteRemark ?? ""}
                    placeholder="Reason or reference"
                    onChange={(e) => set("creditNoteRemark", e.target.value)}
                  />
                </td>
                <td className="fe-r">{renderAmountInput("creditNote", "Credit note / deductions")}</td>
                <td className="fe-r mono">{creditAmt ? `−${inr(creditAmt)}` : inr(0)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="fe-grand">
                <td>Total revenue</td>
                <td />
                <td className="fe-r mono">{inr(c.revenue)}</td>
              </tr>
            </tfoot>
          </table>
        </SectionCard>

        <SectionCard title="Expenses" right={<span className="fe-card-meta">{siteChildKeys(site).length} lines · {structure.length} groups</span>}>
          {structure.length === 0 ? (
            <div className="dnd-empty" style={{ margin: 12 }}>No cost lines configured. <button type="button" className="link" onClick={() => goConfig(siteId)}>Set up the structure →</button></div>
          ) : (
            <table className="fe-grid" data-testid="entry-expense-grid">
              <thead>
                <tr><th>Cost line</th><th className="fe-r fe-narrow">Spread / mo</th><th className="fe-r fe-narrow">Line total</th><th className="fe-r">Amount (₹)</th></tr>
              </thead>
              {structure.map((g) => (
                <tbody key={g.parent} data-testid={`entry-parent-${g.parent}`}>
                  <tr className="fe-parent">
                    <td colSpan={3}>
                      <span className="pdot" style={{ background: parentColor(g.parent) }} />
                      <span style={{ color: parentColor(g.parent) }}>{parentLabel(g.parent)}</span>
                      <span className="fe-count">{g.children.length}</span>
                    </td>
                    <td className="fe-r mono" data-testid={`entry-subtotal-${g.parent}`}>{inr(parentSub(g))}</td>
                  </tr>
                  {g.children.map((k) => {
                    const spm = c.ex.amort[k] || 0;
                    return (
                      <tr key={k}>
                        <td className="fe-indent-cell">{libMap[k]?.label || k}</td>
                        <td className="fe-r mono fe-muted" title={spm > 0 ? "Recognised automatically from a spread cost" : undefined}>
                          {spm > 0 ? <><CalendarClock size={11} /> {inr(spm)}</> : ""}
                        </td>
                        <td className="fe-r mono fe-muted">{inr(c.ex.total[k] || 0)}</td>
                        <td className="fe-r">{renderAmountInput(k, libMap[k]?.label || k, { spreadPerMonth: spm })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
              <tfoot>
                <tr className="fe-grand">
                  <td colSpan={3}>Total expenses</td>
                  <td className="fe-r mono">{inr(c.expense)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </SectionCard>
      </div>

      <details className="fe-spread" data-testid="entry-spread-section">
        <summary>
          Deferred / spread costs · {monthLabelOf(mk)}
          <span className="fe-card-meta">
            {spreadCount ? ` · ${spreadCount} on this site` : " · none yet"}
            {site.contractEnd ? ` · contract through ${monthLabelOf(site.contractEnd)}` : " · no contract end set"}
          </span>
        </summary>
        <div className="fe-spread-body">
          <SpreadEditor site={site} library={library} onPatchSite={onPatchSite} entryMonth={mk} />
        </div>
      </details>
    </div>
  );
}

const FIGURES_ENTRY_STYLES = `
.fe-page{display:flex;flex-direction:column;gap:12px;}
.fe-sticky{position:sticky;top:0;z-index:20;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 14px;box-shadow:0 2px 8px rgba(0,0,0,.06);}
.fe-head-row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 16px;}
.fe-pick{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 14px;flex:1 1 420px;min-width:0;}
.fe-pick .site-search{flex:1 1 240px;max-width:360px;min-width:200px;}
.fe-pick .entry-sel-period{flex:0 1 200px;min-width:170px;}
.fe-tools{display:flex;gap:8px;align-items:center;}
.fe-tools .ghost-d{height:36px;white-space:nowrap;}
.fe-save{display:flex;flex-direction:column;align-items:flex-end;gap:2px;margin-left:auto;}
.fe-save-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;}
.fe-save .entry-save-btn{height:36px;min-width:130px;}
.fe-totals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid var(--line);}
.fe-total{display:flex;flex-direction:column;gap:1px;min-width:0;}
.fe-total span{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.fe-total b{font-size:16px;font-variant-numeric:tabular-nums;white-space:nowrap;}
.fe-cols{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:12px;align-items:start;}
@media (max-width:1100px){.fe-cols{grid-template-columns:1fr;}.fe-totals{grid-template-columns:repeat(2,minmax(0,1fr));}}
.fe-card-meta{font-size:12px;color:var(--muted);font-weight:400;}
.fe-grid{width:100%;border-collapse:collapse;font-size:13px;}
.fe-grid th{position:sticky;top:0;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);padding:6px 10px;border-bottom:1px solid var(--line);background:var(--surface);}
.fe-grid td{padding:3px 10px;border-bottom:1px solid var(--line);vertical-align:middle;}
.fe-grid tbody tr:hover td{background:rgba(0,0,0,.025);}
.fe-r{text-align:right;}
.fe-narrow{width:110px;}
.fe-muted{color:var(--muted);font-size:12px;}
.fe-parent td{background:rgba(0,0,0,.035);font-weight:600;padding:5px 10px;}
.fe-count{margin-left:8px;font-weight:400;font-size:11px;color:var(--muted);}
.fe-indent-cell{padding-left:26px !important;}
.fe-indent td:first-child{padding-left:26px;}
.fe-subhead td{font-weight:600;background:rgba(0,0,0,.025);}
.fe-hint-row td{color:var(--muted);font-size:12px;padding-left:26px;}
.fe-grand td{font-weight:700;border-top:2px solid var(--line);background:rgba(0,0,0,.035);}
.fe-amt{width:100%;max-width:150px;box-sizing:border-box;text-align:right;font-variant-numeric:tabular-nums;font-family:var(--mono);height:28px;padding:2px 8px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);}
.fe-amt:focus,.fe-text:focus{outline:2px solid var(--accent-border,#9ec5fe);outline-offset:0;border-color:transparent;}
.fe-text{width:100%;box-sizing:border-box;height:26px;padding:2px 8px;margin-top:3px;border:1px solid var(--line);border-radius:6px;font-size:12px;background:var(--surface);color:var(--ink);}
.fe-tag{display:inline-block;font-size:12px;padding:1px 8px;border-radius:999px;background:rgba(0,0,0,.05);margin-right:6px;}
.fe-del{background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;border-radius:4px;}
.fe-del:hover{color:var(--loss);background:rgba(0,0,0,.05);}
.fe-reimb-actions{display:flex;gap:6px;justify-content:flex-end;align-items:center;}
.fe-mini-sel{height:26px;font-size:12px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);}
.fe-mini-btn{height:26px;padding:0 10px;font-size:12px;}
.fe-spread{border:1px solid var(--line);border-radius:10px;background:var(--surface);}
.fe-spread>summary{cursor:pointer;padding:10px 14px;font-weight:600;font-size:13px;}
.fe-spread-body{padding:4px 14px 14px;}
`;

export { FiguresEntryPage as EntryForm };
export default FiguresEntryPage;
