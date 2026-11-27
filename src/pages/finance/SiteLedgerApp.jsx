import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { loadLedgerStore, saveSiteSetupChanges, computeSiteSetupDiff, deleteLedgerSites, flushAllPendingPeriodRecords, mergePeriodEntry, formatPeriodFigureSaveError } from "./api/siteLedgerStore";
import { describeRemovals, describeSetupChanges } from "./api/siteSetupDiff";
import { describeRemovalDependencies } from "./site-ledger/validation/setupDependencies.js";
import {
  SaveCoordinator,
  attachLedgerNavigationGuard,
  confirmLeaveIfDirty,
  isExplicitFigureSaveEnabled,
} from "./site-ledger";
import { FinanceConflictError } from "./api/siteLedgerStore";
import {
  REVENUE_ITEMS,
  DEFAULT_PARENTS,
  CHILD_HEADS,
  PARENT_PALETTE,
  syncParents,
  parentColor,
  parentLabel,
  TARGET_MARGIN,
  WARN_MARGIN,
  SL_VALID_VIEWS,
  MONTHS,
} from "./site-ledger/domain/constants.js";
import {
  displayStructure,
  compactStructure,
  siteChildKeys,
  migrateStructureParents,
  mergeSiteLibrary,
  structureFromKeys,
  defaultSiteSetup,
  childLabel,
} from "./site-ledger/domain/siteStructure.js";
import {
  isSiteActive,
  versionLabel,
  sitesInGroup,
  enrichSitesWithVersions,
  prepareNewSiteVersion,
  activeSitesOnly,
  contractBudgetFor,
  estimateFor,
  expectedMonths,
  pendingMonths,
  isPending,
} from "./site-ledger/domain/siteLifecycle.js";
import { inr, pct, slug } from "./site-ledger/domain/formatMoney.js";
import { formatPeriodDateDDMMYYYY } from "./components/PeriodDateSelect";
import { FinanceDateInput } from "./components/FinanceDateInput";
import FinanceTypographyStyles from "./components/FinanceTypographyStyles";
import { useFinance } from "./contexts/FinanceContext";
import { buildPeriodAuditMeta } from "./lib/plAudit";
import {
  periodAbsoluteIndex as monthIdx,
  periodKeysBetween,
  comparePeriodKeys,
  indexToPeriodKey,
  dateToPeriodKey,
  currentPeriodKey,
} from "./lib/periods";
import { isFinanceSchemaError, subscribeFinanceRefresh } from "../../services/financeApi";
import { useAuth } from "../../contexts/AuthContext";
import { filterSitesByFinancePlAccess } from "./constants/financePlSiteAccess";
import { useNavigate, useSearchParams } from "react-router-dom";
import { financePath } from "./navConfig";
import {
  LayoutDashboard,
  Building2,
  X,
  Pencil,
  CircleDot,
  Sliders,
  ChevronRight,
  ChevronDown,
  FileBarChart,
  Settings,
  History,
  CheckCircle,
} from "lucide-react";
import { toast } from "../../lib/toast";
import { PageTaskHeader } from "../../components/erpUi";
import { confirmDialog } from "../../lib/dialog";
import { contractDateInputValue } from "./site-ledger/pages/pageShared.jsx";
import { monthLabelOf, PlMarginContext } from "./site-ledger/components/SiteLedgerShared.jsx";
import {
  calcSite,
  estTotals,
  calcSiteOverPeriodKeys,
  estTotalsForPeriodKeys,
  resolveSitePeriodKeys,
} from "./site-ledger/calculations/siteLedgerCalcs.js";
import PortfolioOverview from "./site-ledger/pages/PortfolioOverview.jsx";
import SitesManagement from "./site-ledger/pages/SitesManagement.jsx";
import SiteWorkspace from "./site-ledger/pages/SiteWorkspace.jsx";
import { SiteSetupPage } from "./site-ledger/pages/SiteSetupPage.jsx";
import { FiguresEntryPage } from "./site-ledger/pages/FiguresEntryPage.jsx";
import ReportsPage from "./site-ledger/pages/ReportsPage.jsx";

function contractPeriodFromDateInput(dateStr) {
  return dateToPeriodKey(dateStr) || null;
}

function readSlStateFromUrl(searchParams) {
  const v = searchParams.get("slView");
  const cur = currentPeriodKey();
  const month = searchParams.get("slMonth") || cur;
  let periodFrom = searchParams.get("slFrom") || month;
  let periodTo = searchParams.get("slTo") || month;
  if (comparePeriodKeys(periodFrom, periodTo) > 0) {
    const swap = periodFrom;
    periodFrom = periodTo;
    periodTo = swap;
  }
  return {
    view: SL_VALID_VIEWS.has(v) ? v : "overview",
    activeSite: searchParams.get("slSite") || null,
    month: periodTo,
    periodFrom,
    periodTo,
    showHistorical: searchParams.get("slHist") === "1",
  };
}

function normalizePeriodRange(from, to) {
  if (!from || !to) return { from: to || from, to: to || from };
  if (comparePeriodKeys(from, to) > 0) return { from: to, to: from };
  return { from, to };
}

function formatPeriodRangeLabel(from, to) {
  if (!from || !to || from === to) return monthLabelOf(from || to);
  return `${formatPeriodDateDDMMYYYY(from)} – ${formatPeriodDateDDMMYYYY(to)}`;
}







function emptyStore() {
  return {
    sites: [],
    records: {},
    library: CHILD_HEADS.map((c) => ({ ...c })),
    parents: DEFAULT_PARENTS.map((p) => ({ ...p })),
  };
}

function normalize(data) {
  const library = (data.library && data.library.length) ? [...data.library] : [...CHILD_HEADS];
  const have = new Set(library.map((h) => h.key));
  const sites = (data.sites || []).map((s) => {
    let structure = s.structure;
    // A site with no component rows in the database shows as empty (flagged), never with
    // invented default components — those used to be written back over the real setup.
    let structureMissing = false;
    if (!structure || !structure.length) {
      if (!s.structureEmpty && Array.isArray(s.headKeys) && s.headKeys.length) {
        structure = structureFromKeys(s.headKeys);
      } else {
        structure = [];
        structureMissing = !s.structureEmpty;
      }
    }
    structure = migrateStructureParents(structure);
    // ensure all referenced child keys exist in library
    structure.forEach((g) => g.children.forEach((k) => { if (!have.has(k)) { library.push({ key: k, label: k, parent: g.parent }); have.add(k); } }));
    const savedCustomHeads = Array.isArray(s.customHeads) ? s.customHeads : [];
    const customHeads = savedCustomHeads.length
      ? savedCustomHeads
      : library
        .filter((h) => h.key.startsWith(`${s.id}_`))
        .map((h) => ({ key: h.key, label: h.label, parent: h.parent, custom: true, siteScoped: true }));
    return {
      ...s,
      structure,
      spreads: s.spreads || [],
      estimates: s.estimates || [],
      contractStart: s.contractStart || null,
      contractEnd: s.contractEnd || null,
      status: s.status || "active",
      siteGroup: s.siteGroup || null,
      version: s.version || 1,
      customHeads,
      excludedHeadKeys: Array.isArray(s.excludedHeadKeys) ? s.excludedHeadKeys : [],
      structureMissing,
    };
  });
  return { sites: enrichSitesWithVersions(sites), records: data.records || {}, library };
}

async function loadStore() {
  const defaults = emptyStore();
  const result = await loadLedgerStore(defaults.parents, defaults.library);
  if (result.data) {
    return {
      data: normalize({
        ...result.data,
        parents: result.data.parents?.length ? result.data.parents : defaults.parents,
      }),
      ok: true,
      error: null,
    };
  }
  return { data: normalize(defaults), ok: false, error: result.error || null };
}
/* ───────────────────────── SMALL UI ───────────────────────── */
/* ───────────────────────── MAIN ───────────────────────── */
export default function SiteLedgerApp({ embedded = true }) {
  const navigate = useNavigate();
  const { targetMargin: ctxTarget, warnMargin: ctxWarn } = useFinance();
  const marginCtx = useMemo(
    () => ({
      targetMargin: Number(ctxTarget) || TARGET_MARGIN,
      warnMargin: Number(ctxWarn) || WARN_MARGIN,
    }),
    [ctxTarget, ctxWarn],
  );
  const { user, userProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlInit = useMemo(() => readSlStateFromUrl(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [sites, setSites] = useState([]);
  const [records, setRecords] = useState({});
  const [library, setLibrary] = useState(CHILD_HEADS);
  const [parents, setParents] = useState(() => DEFAULT_PARENTS.map((p) => ({ ...p })));
  const [view, setView] = useState(urlInit.view);
  const [activeSite, setActiveSite] = useState(urlInit.activeSite);
  const [month, setMonth] = useState(urlInit.month);
  const [periodFrom, setPeriodFrom] = useState(urlInit.periodFrom);
  const [periodTo, setPeriodTo] = useState(urlInit.periodTo);
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editSite, setEditSite] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [periodSaveError, setPeriodSaveError] = useState(null);
  const [actionNotice, setActionNotice] = useState("");
  const [showHistorical, setShowHistorical] = useState(urlInit.showHistorical);
  const [historyGroup, setHistoryGroup] = useState(null);
  const [budgetViewSiteId, setBudgetViewSiteId] = useState(null);
  const [siteBackView, setSiteBackView] = useState("overview");
  const lastSaveAt = useRef(0);
  const viewRef = useRef(view);
  const stateRef = useRef({ sites: [], records: {}, library: [], parents: [] });
  /**
   * Site Setup copy exactly as last loaded from the database. Saves send only the difference
   * between this and the current screen, so edits other users made meanwhile are never undone.
   */
  const baselineRef = useRef(null);
  /** Site Setup edits are kept on screen until the user clicks Save (no autosave). */
  const [setupDirty, setSetupDirty] = useState(false);
  const setupDirtyRef = useRef(false);
  /** Set when a Site Setup save was rejected because the database changed (never auto-overwritten). */
  const [setupConflict, setSetupConflict] = useState(null);
  const figuresDirtyRef = useRef(false);
  const ledgerLoadOkRef = useRef(false);
  /** Phase 1: working-copy + save coordinator (flag-gated for figures). */
  const explicitFigureSaveEnabled = isExplicitFigureSaveEnabled();
  const saveCoordinatorRef = useRef(null);
  if (!saveCoordinatorRef.current) {
    saveCoordinatorRef.current = new SaveCoordinator({ userId: user?.id || "anon" });
  }
  useEffect(() => {
    // Account switch: re-scope coordinator. IndexedDB drafts for the previous user are retained
    // for later recovery; only in-memory working copies are cleared.
    saveCoordinatorRef.current?.setUserId(user?.id || "anon");
  }, [user?.id]);
  const markSetupDirty = useCallback((dirty) => {
    setupDirtyRef.current = dirty;
    setSetupDirty(dirty);
    const coord = saveCoordinatorRef.current;
    if (!coord) return;
    if (dirty) {
      coord.editSetup({
        sites: stateRef.current.sites,
        library: stateRef.current.library,
        parents: stateRef.current.parents,
      }, { persistDraft: true });
    } else if (stateRef.current) {
      coord.loadSetup({
        sites: stateRef.current.sites,
        library: stateRef.current.library,
        parents: stateRef.current.parents,
      }, { forceReset: true });
    }
  }, []);
  const onFiguresDirtyChange = useCallback((dirty) => {
    figuresDirtyRef.current = !!dirty;
  }, []);

  useEffect(() => { viewRef.current = view; }, [view]);

  const libMap = useMemo(() => Object.fromEntries(library.map((h) => [h.key, h])), [library]);
  const sitesScoped = useMemo(
    () => filterSitesByFinancePlAccess(sites, userProfile),
    [sites, userProfile],
  );
  const sitesEnriched = useMemo(() => enrichSitesWithVersions(sitesScoped), [sitesScoped]);
  const operationalSites = useMemo(
    () => (showHistorical ? sitesEnriched : activeSitesOnly(sitesEnriched)),
    [sitesEnriched, showHistorical],
  );
  const activeSiteCount = useMemo(() => activeSitesOnly(sitesEnriched).length, [sitesEnriched]);
  // attach library to sites so childLabel resolves custom labels
  const sitesL = useMemo(
    () => operationalSites.map((s) => ({ ...s, _lib: mergeSiteLibrary(s, library) })),
    [operationalSites, library],
  );
  const sitesAllL = useMemo(
    () => sitesEnriched.map((s) => ({ ...s, _lib: mergeSiteLibrary(s, library) })),
    [sitesEnriched, library],
  );

  const reloadLedger = useCallback(async () => {
    const { data, ok, error } = await loadStore();
    const base = normalize(data || emptyStore());
    setSites(base.sites); setRecords(base.records); setLibrary(base.library);
    let ps = (data?.parents && data.parents.length) ? data.parents : DEFAULT_PARENTS.map((p) => ({ ...p }));
    if (data?.parentLabels) ps = ps.map((p) => data.parentLabels[p.key] ? { ...p, label: data.parentLabels[p.key] } : p);
    syncParents(ps); setParents(ps);
    stateRef.current = { sites: base.sites, records: base.records, library: base.library, parents: ps };
    // Snapshot for diff-based saves. A failed load never becomes a baseline: Save stays blocked.
    ledgerLoadOkRef.current = !!ok;
    baselineRef.current = ok
      ? structuredClone({ sites: base.sites, library: base.library, parents: ps })
      : null;
    if (ok) {
      saveCoordinatorRef.current?.loadSetup(
        { sites: base.sites, library: base.library, parents: ps },
        { forceReset: true },
      );
    }
    markSetupDirty(false);
    setLoadError(ok ? null : (error || "Could not load Site Ledger from the database."));
    setLoaded(true);
    return ok;
  }, [markSetupDirty]);

  useEffect(() => { reloadLedger(); }, [reloadLedger]);

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (view && view !== "overview") next.set("slView", view);
      else next.delete("slView");
      if (activeSite) next.set("slSite", activeSite);
      else next.delete("slSite");
      if (month && month !== currentPeriodKey()) next.set("slMonth", month);
      else next.delete("slMonth");
      const cur = currentPeriodKey();
      if (periodFrom !== cur || periodTo !== cur) {
        next.set("slFrom", periodFrom);
        next.set("slTo", periodTo);
      } else {
        next.delete("slFrom");
        next.delete("slTo");
      }
      if (showHistorical) next.set("slHist", "1");
      else next.delete("slHist");
      if (next.toString() === prev.toString()) return prev;
      return next;
    }, { replace: true });
  }, [view, activeSite, month, periodFrom, periodTo, showHistorical, setSearchParams]);

  const setOverviewPeriodFrom = useCallback((nextFrom) => {
    const { from, to } = normalizePeriodRange(nextFrom, periodTo);
    setPeriodFrom(from);
    setPeriodTo(to);
    setMonth(to);
  }, [periodTo]);

  const setOverviewPeriodTo = useCallback((nextTo) => {
    const { from, to } = normalizePeriodRange(periodFrom, nextTo);
    setPeriodFrom(from);
    setPeriodTo(to);
    setMonth(to);
  }, [periodFrom]);

  useEffect(() => {
    if (!loaded) return undefined;
    const explicit = isExplicitFigureSaveEnabled();

    if (explicit) {
      // Phase 1 explicit-save path: never fire-and-forget production writes on hide/unload.
      // Drafts are already persisted on edit; only warn when leaving with dirty state.
      return attachLedgerNavigationGuard({
        shouldBlock: () => !!(
          setupDirtyRef.current
          || figuresDirtyRef.current
          || saveCoordinatorRef.current?.hasAnyDirty?.()
        ),
        onHidden: () => {
          // Intentionally no flushAllPendingPeriodRecords / savePeriodRecord here.
        },
      });
    }

    // Legacy rollback path (flag OFF): preserve historical autosave leave-flush behaviour.
    const flushToDb = () => {
      void flushAllPendingPeriodRecords({ trigger: "automatic", action: "figure_flush_on_leave" });
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flushToDb();
    };
    const onBeforeUnload = (e) => {
      if (!setupDirtyRef.current) return undefined;
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushToDb);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushToDb);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // Rebind when the explicit-save flag may have changed (storage/env) after load.
  }, [loaded, explicitFigureSaveEnabled]);

  useEffect(() => {
    if (!loaded) return;
    setSites((prev) => {
      const next = enrichSitesWithVersions(prev);
      const changed = next.some((s, i) => s.status !== prev[i]?.status || s.version !== prev[i]?.version || s.siteGroup !== prev[i]?.siteGroup);
      if (!changed) return prev;
      return next;
    });
  }, [loaded]);

  useEffect(() => {
    return subscribeFinanceRefresh(() => {
      if (viewRef.current === "entry") return;
      // Never reload over unsaved Site Setup edits.
      if (setupDirtyRef.current || saveState === "saving") return;
      if (Date.now() - lastSaveAt.current < 8000) return;
      reloadLedger();
    });
  }, [reloadLedger, saveState]);
  useEffect(() => {
    stateRef.current = { sites, records, library, parents };
  }, [sites, records, library, parents]);

  /**
   * Explicit Site Setup save. Shows what will be removed and asks for confirmation, then
   * writes only this user's changes and reloads from the database.
   * @param {{ title?: string }} opts
   * @returns {Promise<boolean>} true when saved (or nothing to save)
   */
  const commitSiteSetup = useCallback(async (opts = {}) => {
    if (!ledgerLoadOkRef.current || !baselineRef.current) {
      const msg = "Site Ledger did not load from the database, so nothing can be saved. Reload the page first.";
      setLoadError(msg);
      toast.error(msg);
      return false;
    }
    const current = stateRef.current;
    const diff = computeSiteSetupDiff(baselineRef.current, current);
    if (!diff.hasChanges) {
      markSetupDirty(false);
      setSaveState("saved");
      return true;
    }
    const siteName = (code) => current.sites.find((x) => x.id === code)?.name || code;
    const headLabel = (key) => current.library.find((h) => h.key === key)?.label
      || baselineRef.current.library.find((h) => h.key === key)?.label
      || key;
    const parentLabel = (key) => current.parents.find((p) => p.key === key)?.label
      || baselineRef.current.parents.find((p) => p.key === key)?.label
      || key;
    const changeLines = describeSetupChanges(diff, { siteName, headLabel, parentLabel });
    const removals = describeRemovals(diff, { siteName, headLabel, parentLabel });
    // Preview what else references each removed cost line (figures are always kept).
    const dependencyLines = describeRemovalDependencies(diff, {
      baselineSites: baselineRef.current.sites,
      records: current.records,
      siteName,
      headLabel,
      periodLabel: monthLabelOf,
    });
    if (changeLines.length) {
      const ok = await confirmDialog({
        title: opts.title || (removals.length ? "Save Site Setup — review removals" : "Save Site Setup — review changes"),
        message: [
          "The following changes will be saved:",
          ...changeLines.map((l) => `• ${l}`),
          ...(dependencyLines.length ? ["", "Still referenced by:", ...dependencyLines.map((l) => `• ${l}`)] : []),
          "",
          removals.length
            ? "Figures already entered for removed components are kept in the database. Continue?"
            : "Continue?",
        ].join("\n"),
        confirmLabel: removals.length ? "Save and remove" : "Save changes",
        ...(removals.length ? { tone: "danger" } : {}),
      });
      if (!ok) return false;
    }
    setSaveState("saving");
    setSetupConflict(null);
    try {
      const coord = saveCoordinatorRef.current;
      // The coordinator flattens errors to text; keep the original so conflicts stay typed.
      let persistError = null;
      const persistSetup = async () => {
        try {
          return await saveSiteSetupChanges({
            baseline: baselineRef.current,
            sites: current.sites,
            library: current.library,
            parents: current.parents,
            audit: { trigger: "user", action: "site_setup_save" },
          });
        } catch (err) {
          persistError = err;
          throw err;
        }
      };

      // Prefer SaveCoordinator so IndexedDB setup drafts clear only after confirmed commit.
      let report;
      if (coord) {
        coord.editSetup({
          sites: current.sites,
          library: current.library,
          parents: current.parents,
        }, { persistDraft: true });
        const result = await coord.saveSetup({
          scope: "ledger",
          persist: persistSetup,
        });
        if (!result.ok) {
          if (persistError instanceof FinanceConflictError) throw persistError;
          throw new Error(result.error || "Site Setup save failed");
        }
        report = result.persistResult;
      } else {
        report = await persistSetup();
      }

      lastSaveAt.current = Date.now();
      // Reload so the screen (and the next baseline) include other users' changes too.
      await reloadLedger();
      setSaveState("saved");
      setLoadError(null);
      const kept = [...(report?.headsKept || []), ...(report?.parentsKept || [])];
      if (kept.length) {
        toast.success(`Saved. Still in use elsewhere, so kept in the library: ${kept.map(headLabel).join(", ")}`);
      } else {
        toast.success("Site Setup saved.");
      }
      return true;
    } catch (e) {
      setSaveState("local");
      setLoadError(e?.message || "Save failed");
      if (e instanceof FinanceConflictError) {
        const conflictMsg = e.message
          || "Site Setup could not be saved because the database changed. Your edits are still on screen — reload or resolve the conflict, then save again.";
        setSetupConflict({ message: conflictMsg });
        toast.error(conflictMsg);
      } else {
        toast.error(e?.message || "Site Setup save failed — your changes are still on screen; try Save again.");
      }
      return false;
    }
  }, [markSetupDirty, reloadLedger]);

  const discardSetupChanges = useCallback(async () => {
    if (!setupDirtyRef.current) return;
    const ok = await confirmDialog({
      title: "Discard Site Setup changes",
      message: "Discard all unsaved Site Setup changes and reload from the database?",
      confirmLabel: "Discard",
      tone: "danger",
    });
    if (!ok) return;
    await reloadLedger();
    setSetupConflict(null);
    setSaveState("idle");
  }, [reloadLedger]);

  /** Conflict: drop the on-screen draft and reload the baseline from the database. */
  const reloadSetupBaseline = useCallback(async () => {
    setSetupConflict(null);
    await reloadLedger();
    markSetupDirty(false);
    setSaveState("idle");
  }, [reloadLedger, markSetupDirty]);
  /** Conflict: keep editing the local draft; the user may Save again. */
  const keepSetupDraft = useCallback(() => {
    setSetupConflict(null);
  }, []);

  /**
   * Site Setup edit: updates the screen only. Nothing is written until Save.
   * opts.commit — the edit itself came from an explicit confirm / save (site modal, activate…).
   */
  const applySiteSetupChange = useCallback((updater, opts = {}) => {
    const current = stateRef.current;
    const patch = updater({
      sites: current.sites,
      library: current.library,
      parents: current.parents,
      records: current.records,
    });
    const next = {
      sites: patch.sites ?? current.sites,
      library: patch.library ?? current.library,
      parents: patch.parents ?? current.parents,
      records: current.records,
    };
    stateRef.current = next;
    if (patch.sites) setSites(next.sites);
    if (patch.library) setLibrary(next.library);
    if (patch.parents) {
      syncParents(next.parents);
      setParents(next.parents);
    }
    markSetupDirty(true);
    setSaveState("dirty");
    if (opts.commit) return commitSiteSetup(opts);
    return Promise.resolve(true);
  }, [markSetupDirty, commitSiteSetup]);

  // parent CRUD — keep the live module registry in sync so helpers (parentLabel/displayStructure…) reflect edits
  const renameParent = useCallback((key, label) => {
    applySiteSetupChange(({ parents: ps }) => ({
      parents: ps.map((p) => (p.key === key ? { ...p, label: (label && label.trim()) || p.label } : p)),
    }));
  }, [applySiteSetupChange]);
  const setParentColor = useCallback((key, color) => {
    applySiteSetupChange(({ parents: ps }) => ({
      parents: ps.map((p) => (p.key === key ? { ...p, color } : p)),
    }));
  }, [applySiteSetupChange]);
  const addParent = useCallback((label, color) => {
    applySiteSetupChange(({ parents: ps }) => {
      const base = slug(label) || "parent"; let key = base, n = 1;
      while (ps.some((p) => p.key === key)) key = base + "-" + (++n);
      return {
        parents: [...ps, {
          key,
          label: label.trim(),
          color: color || PARENT_PALETTE[ps.length % PARENT_PALETTE.length],
          custom: true,
        }],
      };
    });
  }, [applySiteSetupChange]);
  const removeParent = useCallback((key) => {
    const usedInLib = library.some((h) => h.parent === key);
    const usedInSite = sites.some((s) => (s.structure || []).some((g) => g.parent === key && g.children.length));
    if (usedInLib || usedInSite) { toast.success("This parent head still has cost lines (here or on another site). Move or delete them first, then delete the head."); return; }
    const touched = sites
      .filter((s) => (s.structure || []).some((g) => g.parent === key))
      .map((s) => s.id);
    applySiteSetupChange(({ parents: ps, sites: allSites }) => ({
      parents: ps.filter((p) => p.key !== key),
      sites: allSites.map((s) => (touched.includes(s.id)
        ? { ...s, structure: (s.structure || []).filter((g) => g.parent !== key) }
        : s)),
    }));
  }, [library, sites, applySiteSetupChange]);

  const needsPortfolio = view !== "config" && view !== "entry";

  const activeMonths = useMemo(() => {
    const cap = currentPeriodKey();
    const capIdx = monthIdx(cap);
    if (!needsPortfolio) {
      return MONTHS.filter((m) => monthIdx(m.key) <= capIdx).slice(-6);
    }
    const have = new Set();
    Object.keys(records).forEach((k) => {
      const mk = k.split("__")[1];
      if (monthIdx(mk) <= capIdx) have.add(mk);
    });
    sites.forEach((s) =>
      (s.spreads || []).forEach((sp) => {
        const si = monthIdx(sp.start);
        const m = Number(sp.months) || 0;
        for (let i = 0; i < m; i++) {
          const key = indexToPeriodKey(si + i);
          if (key && monthIdx(key) <= capIdx) have.add(key);
        }
      }),
    );
    const list = MONTHS.filter((m) => have.has(m.key) && monthIdx(m.key) <= capIdx);
    return list.length ? list : MONTHS.filter((m) => monthIdx(m.key) <= capIdx).slice(-6);
  }, [records, sites, needsPortfolio]);

  const sitePeriodKeys = useMemo(
    () => resolveSitePeriodKeys(periodFrom, periodTo, month),
    [periodFrom, periodTo, month],
  );

  const rows = useMemo(() => {
    if (!needsPortfolio) return [];
    const keys = sitePeriodKeys.length ? sitePeriodKeys : [month];
    return sitesL.map((s) => {
    const c = keys.length > 1
      ? calcSiteOverPeriodKeys(s, keys, records)
      : calcSite(s, month, records);
    const est = keys.length > 1
      ? estTotalsForPeriodKeys(s, keys)
      : estTotals(estimateFor(s, month));
    const profitVar = est ? c.profit - est.profit : null;
    const pending = isPending(s, records, month);
    const pendingCount = pendingMonths(s, records, month).length;
    const hasData = keys.some((mk) => !!records[`${s.id}__${mk}`]);
    return { ...s, ...c, est, profitVar, pending, pendingCount, hasData };
  });
  }, [sitesL, records, month, sitePeriodKeys, needsPortfolio]);

  /** Sites Master: contract-to-date actuals (same window as Pending Months), not a single empty month. */
  const sitesMasterRows = useMemo(() => {
    if (!needsPortfolio) return [];
    const upto = month || currentPeriodKey();
    return sitesL.map((s) => {
      const keys = expectedMonths(s, upto);
      const periodKeys = keys.length ? keys : [upto];
      const c = calcSiteOverPeriodKeys(s, periodKeys, records);
      const est = estTotalsForPeriodKeys(s, periodKeys);
      const profitVar = est ? c.profit - est.profit : null;
      const pending = isPending(s, records, upto);
      const pendingCount = pendingMonths(s, records, upto).length;
      const hasData = periodKeys.some((mk) => !!records[`${s.id}__${mk}`]);
      return { ...s, ...c, est, profitVar, pending, pendingCount, hasData };
    });
  }, [sitesL, records, month, needsPortfolio]);

  const overviewPeriodKeys = useMemo(
    () => periodKeysBetween(periodFrom, periodTo),
    [periodFrom, periodTo],
  );

  const overviewChartMonths = useMemo(
    () => MONTHS.filter((m) => overviewPeriodKeys.includes(m.key)),
    [overviewPeriodKeys],
  );

  const periodRangeLabel = useMemo(
    () => formatPeriodRangeLabel(periodFrom, periodTo),
    [periodFrom, periodTo],
  );

  const overviewRows = useMemo(() => {
    const keys = overviewPeriodKeys;
    const refMonth = periodTo;
    return sitesL.map((s) => {
      const c = calcSiteOverPeriodKeys(s, keys, records);
      const est = estTotalsForPeriodKeys(s, keys);
      const profitVar = est ? c.profit - est.profit : null;
      const pending = isPending(s, records, refMonth);
      const pendingCount = pendingMonths(s, records, refMonth).length;
      const hasData = keys.some((mk) => !!records[`${s.id}__${mk}`]);
      return { ...s, ...c, est, profitVar, pending, pendingCount, hasData };
    });
  }, [sitesL, records, overviewPeriodKeys, periodTo]);

  /** New site / renewal from the site modal (an explicit Save) — written now, diff-based. */
  const persistSitesImmediate = useCallback(async (nextSites) => {
    stateRef.current = { ...stateRef.current, sites: nextSites };
    markSetupDirty(true);
    setSaveState("dirty");
    const ok = await commitSiteSetup({ title: "Save site — removals" });
    if (!ok) throw new Error("Site was not saved");
    return true;
  }, [markSetupDirty, commitSiteSetup]);

  /** opts.commit — save immediately (used after a confirm dialog). */
  const patchSite = useCallback((id, patch, opts = {}) => (
    applySiteSetupChange(({ sites: allSites }) => ({
      sites: allSites.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }), { commit: !!opts.commit })
  ), [applySiteSetupChange]);

  /** Enter Figures has no Site Setup Save bar: its spread add / delete buttons save at once. */
  const patchSiteAndSave = useCallback(
    (id, patch) => patchSite(id, patch, { commit: true }),
    [patchSite],
  );

  /** Budget modal "Save" — an explicit save of this site's budget (plus any other pending Site Setup edits). */
  const saveSiteBudget = useCallback(async (siteId, estimates) => {
    const ok = await applySiteSetupChange(({ sites: allSites }) => ({
      sites: allSites.map((s) => (s.id === siteId ? { ...s, estimates } : s)),
    }), { commit: true, title: "Save budget — removals" });
    if (!ok) throw new Error("Estimated budget was not saved.");
    return true;
  }, [applySiteSetupChange]);
  const deactivateSite = useCallback(async (id) => {
    const site = stateRef.current.sites.find((s) => s.id === id);
    if (!site || !isSiteActive(site)) return;
    const label = site.name || id;
    if (!(await confirmDialog({ title: "Mark site inactive", message: `Mark "${label}" as inactive? It will be hidden from active lists and data entry.`, confirmLabel: "Mark inactive", tone: "danger" }))) return;
    void patchSite(id, { status: "inactive" }, { commit: true });
    setEditSite(null);
    setShowAdd(false);
    if (activeSite === id) setActiveSite(null);
  }, [patchSite, activeSite]);
  const activateSite = useCallback(async (id) => {
    const site = stateRef.current.sites.find((s) => s.id === id);
    if (!site || isSiteActive(site)) return;
    const label = site.name || id;
    const group = site.siteGroup || site.id;
    const hasActiveSibling = stateRef.current.sites.some(
      (s) => s.id !== id && isSiteActive(s) && (s.siteGroup || s.id) === group
    );
    let msg = `Make "${label}" active?`;
    if (hasActiveSibling) {
      msg += " The current active version in this site group will be marked inactive.";
    }
    if (!(await confirmDialog({ title: "Make site active", message: msg, confirmLabel: "Make active" }))) return;
    void applySiteSetupChange(({ sites: allSites }) => ({
      sites: allSites.map((s) => {
        const inGroup = (s.siteGroup || s.id) === group;
        if (s.id === id) return { ...s, status: "active" };
        if (inGroup && isSiteActive(s)) return { ...s, status: "inactive" };
        return s;
      }),
    }), { commit: true });
    setEditSite(null);
    setShowAdd(false);
    setActiveSite(id);
  }, [applySiteSetupChange]);
  const removeSite = useCallback(async (id) => {
    const site = stateRef.current.sites.find((s) => s.id === id);
    if (!site) return false;
    const label = site.name || id;

    const nextSites = stateRef.current.sites.filter((s) => s.id !== id);
    const nextRecords = { ...stateRef.current.records };
    Object.keys(nextRecords).forEach((k) => {
      if (k.startsWith(`${id}__`)) delete nextRecords[k];
    });

    stateRef.current = {
      ...stateRef.current,
      sites: nextSites,
      records: nextRecords,
    };
    setSites(nextSites);
    setRecords(nextRecords);
    if (baselineRef.current) {
      baselineRef.current = {
        ...baselineRef.current,
        sites: baselineRef.current.sites.filter((s) => s.id !== id),
      };
    }
    if (activeSite === id) setActiveSite(null);
    setEditSite(null);
    setShowAdd(false);

    setSaveState("saving");
    setActionNotice("");
    try {
      await deleteLedgerSites([id], { trigger: "user", action: "site_delete" });
      lastSaveAt.current = Date.now();
      setSaveState(setupDirtyRef.current ? "dirty" : "saved");
      setLoadError(null);
      const successMsg = `"${label}" deleted successfully.`;
      setActionNotice(successMsg);
      window.setTimeout(() => {
        setActionNotice((current) => (current === successMsg ? "" : current));
      }, 5000);
      return true;
    } catch (e) {
      setSaveState("local");
      setLoadError(e?.message || "Could not delete site. Try again.");
      await reloadLedger();
      return false;
    }
  }, [activeSite, reloadLedger]);
  const saveRecord = useCallback((siteId, mk, rec) => {
    lastSaveAt.current = Date.now();
    const site = stateRef.current.sites.find((s) => s.id === siteId);
    const expenseHeadKeys = site ? siteChildKeys(site) : [];
    const withAudit = { ...rec, _audit: buildPeriodAuditMeta(user) };
    setRecords((prev) => {
      const key = `${siteId}__${mk}`;
      const existing = prev[key] || {};
      const merged = mergePeriodEntry(existing, withAudit, expenseHeadKeys);
      const next = { ...prev, [key]: merged };
      stateRef.current = { ...stateRef.current, records: next };
      return next;
    });
  }, [user]);
  const revertRecord = useCallback((siteId, mk, prior) => {
    setRecords((prev) => {
      const key = `${siteId}__${mk}`;
      const next = { ...prev };
      if (prior && Object.keys(prior).length) next[key] = prior;
      else delete next[key];
      stateRef.current = { ...stateRef.current, records: next };
      return next;
    });
  }, []);
  const onRecordPersisted = useCallback(() => {
    lastSaveAt.current = Date.now();
    setSaveState("saved");
    setPeriodSaveError(null);
  }, []);
  const onPeriodSaveError = useCallback((errOrMsg) => {
    setSaveState("local");
    const msg = typeof errOrMsg === "string"
      ? errOrMsg
      : formatPeriodFigureSaveError(errOrMsg, "Figure save");
    setPeriodSaveError(msg || "Figure save failed — values were not written to the database.");
  }, []);
  const renameLibraryHead = useCallback((key, label) => {
    applySiteSetupChange(({ library }) => ({
      library: library.map((h) => (h.key === key ? { ...h, label: (label && label.trim()) || h.label } : h)),
    }));
  }, [applySiteSetupChange]);
  const removeLibraryHead = useCallback((key) => {
    // Pending until Save. Figures already entered for this cost line stay in the database —
    // the old version rewrote every affected month from this tab's (possibly stale) copy.
    applySiteSetupChange(({ sites, library }) => {
      const stripEst = (est) => {
        if (!est.expenses?.[key]) return est;
        const { [key]: _removed, ...expenses } = est.expenses;
        return { ...est, expenses };
      };
      return {
        library: library.filter((h) => h.key !== key),
        sites: sites.map((s) => {
          const uses = (s.structure || []).some((g) => (g.children || []).includes(key))
            || (s.spreads || []).some((sp) => sp.head === key)
            || (s.estimates || []).some((est) => est.expenses?.[key] != null);
          if (!uses) return s;
          return {
            ...s,
            structure: compactStructure((s.structure || []).map((g) => ({
              ...g,
              children: (g.children || []).filter((k) => k !== key),
            }))),
            spreads: (s.spreads || []).filter((sp) => sp.head !== key),
            estimates: (s.estimates || []).map(stripEst),
          };
        }),
      };
    });
  }, [applySiteSetupChange]);

  const mLabel = monthLabelOf(month);
  const siteDetailLabel = useMemo(
    () => formatPeriodRangeLabel(periodFrom, periodTo),
    [periodFrom, periodTo],
  );
  const titles = { overview: "Portfolio Overview", sites: "All Sites", config: "Site Setup", entry: "Enter / Edit Figures", reports: "Reports", site: sitesAllL.find((s) => s.id === activeSite)?.name || "Site" };
  const pageTitle = titles[view] || "Portfolio Overview";
  const ledgerNavItems = useMemo(() => [
    { id: "overview", label: "Overview", icon: LayoutDashboard, section: "portfolio" },
    { id: "sites", label: "All Sites", icon: Building2, section: "portfolio", badge: activeSiteCount || undefined },
    { id: "config", label: "Site Setup", icon: Sliders, section: "setup" },
    { id: "entry", label: "Enter Figures", icon: Pencil, section: "data" },
    { id: "reports", label: "Reports", icon: FileBarChart, section: "reports" },
  ], [activeSiteCount]);

  const requestViewChange = useCallback(async (id, { skipGuard = false } = {}) => {
    if (!skipGuard) {
      const from = viewRef.current;
      const leavingSetup = from === "config" && id !== "config";
      const leavingEntry = from === "entry" && id !== "entry";
      if (leavingSetup && setupDirtyRef.current) {
        const ok = await confirmLeaveIfDirty({
          isDirty: true,
          confirmFn: confirmDialog,
          message: "You have unsaved Site Setup changes. Leave without saving? Changes stay on screen until you Discard or leave the app.",
        });
        if (!ok) return false;
      }
      if (leavingEntry && isExplicitFigureSaveEnabled() && figuresDirtyRef.current) {
        const ok = await confirmLeaveIfDirty({
          isDirty: true,
          confirmFn: confirmDialog,
          message: "You have unsaved figures. Leave without saving to the database? A draft is kept in this browser.",
        });
        if (!ok) return false;
      }
    }
    if (id === "entry") {
      setActiveSite((prev) => {
        if (prev && sitesL.some((s) => s.id === prev)) return prev;
        return sitesL[0]?.id || null;
      });
    }
    setView(id);
    return true;
  }, [sitesL]);

  const handleLedgerNav = useCallback((id) => {
    void requestViewChange(id);
  }, [requestViewChange]);

  if (!loaded) return <div style={{ fontFamily: "var(--body)", padding: 40, color: "var(--muted)" }}><Styles />Loading your sites…</div>;

  return (
    <PlMarginContext.Provider value={marginCtx}>
    <div className={`app finance-module${embedded ? " embedded stacked" : ""}`}>
      <Styles />
      <FinanceTypographyStyles />
      {!embedded && (
        <aside className="side">
          <div className="brand"><div className="brand-mark">P&L</div><div><div className="brand-name">SiteLedger</div><div className="brand-sub">Multi-site P&amp;L</div></div></div>
          <nav>
            <button className={view === "overview" ? "nav on" : "nav"} onClick={() => handleLedgerNav("overview")}><LayoutDashboard size={17} /> Overview</button>
            <button className={view === "sites" ? "nav on" : "nav"} onClick={() => handleLedgerNav("sites")}><Building2 size={17} /> All Sites <span className="count">{activeSiteCount}</span></button>
            <button className={view === "config" ? "nav on" : "nav"} onClick={() => handleLedgerNav("config")}><Sliders size={17} /> Site Setup</button>
            <button className={view === "entry" ? "nav on" : "nav"} onClick={() => handleLedgerNav("entry")}><Pencil size={17} /> Enter / Edit Figures</button>
            <button className={view === "reports" ? "nav on" : "nav"} onClick={() => handleLedgerNav("reports")}><FileBarChart size={17} /> Reports</button>
          </nav>
          <div className="side-foot">
            <div className={"save " + saveState}>{saveState === "saving" && "Saving…"}{saveState === "saved" && "✓ Saved to cloud"}{saveState === "local" && "Save failed — retry"}{saveState === "idle" && "Ready"}{saveState === "dirty" && "Unsaved Site Setup changes"}</div>
          </div>
        </aside>
      )}

      <div className="sl-body">
      <main className="main">
        {loadError && (
          <div style={{ margin: "12px 24px 0", padding: "12px 14px", borderRadius: 8, background: "var(--critical-soft)", border: "1px solid var(--critical-border)", color: "var(--critical)", fontSize: 13, lineHeight: 1.5 }}>
            <strong>{isFinanceSchemaError({ message: loadError }) ? "Database setup required." : "Could not load Site Ledger."}</strong>{" "}
            {loadError}
          </div>
        )}
        {periodSaveError && (
          <div style={{ margin: "12px 24px 0", padding: "12px 14px", borderRadius: 8, background: "var(--critical-soft)", border: "1px solid var(--critical-border)", color: "var(--critical)", fontSize: 13, lineHeight: 1.5 }} role="alert">
            <strong>Figures not saved.</strong> {periodSaveError}
            <button
              type="button"
              className="link"
              style={{ marginLeft: 10 }}
              onClick={() => setPeriodSaveError(null)}
            >
              Dismiss
            </button>
          </div>
        )}
        {actionNotice && (
          <div className="sl-action-notice" role="status">
            <CheckCircle size={16} />
            <span>{actionNotice}</span>
            <button type="button" className="sl-action-notice-close" onClick={() => setActionNotice("")} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}
        <header className="topbar">
          <div className="topbar-left">
            <PageTaskHeader
              title={pageTitle}
              subtitle={embedded ? `Finance · ${activeSiteCount} active site${activeSiteCount === 1 ? "" : "s"}` : `Income–Expenditure monitoring · ${activeSiteCount} active site${activeSiteCount === 1 ? "" : "s"}`}
              className="mb-0"
            />
            {embedded && (
              <div className="sl-view-nav">
                {ledgerNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = view === item.id || (item.id === "sites" && view === "site");
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={"sl-view-btn" + (isActive ? " on" : "")}
                      onClick={() => handleLedgerNav(item.id)}
                    >
                      {Icon && <Icon size={14} />}
                      {item.label}
                      {item.badge != null && item.badge !== "" && <span className="sl-view-badge">{item.badge}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="topbar-right">
            {embedded && (
              <>
                <button type="button" className="ghost sl-btn" onClick={() => navigate(financePath("settings"))}>
                  <Settings size={14} /> Settings
                </button>
                <div className={"save " + saveState}>
                  {saveState === "dirty" && "Unsaved Site Setup changes"}
                  {saveState === "saving" && "Saving…"}
                  {saveState === "saved" && "✓ Saved"}
                  {saveState === "local" && "Save failed"}
                  {saveState === "idle" && "Ready"}
                </div>
              </>
            )}
          </div>
        </header>
        <div className="scroll">
          {view === "overview" && (
            <PortfolioOverview
              rows={overviewRows}
              sitesL={sitesL}
              sitesAll={sitesAllL}
              records={records}
              month={periodTo}
              periodFrom={periodFrom}
              periodTo={periodTo}
              setPeriodFrom={setOverviewPeriodFrom}
              setPeriodTo={setOverviewPeriodTo}
              mLabel={periodRangeLabel}
              chartMonths={overviewChartMonths}
              periodKeys={overviewPeriodKeys}
              activeMonths={activeMonths}
              siteCount={activeSiteCount}
              totalSiteCount={sitesEnriched.length}
              showHistorical={showHistorical}
              setShowHistorical={setShowHistorical}
              openSite={(id) => { setActiveSite(id); setSiteBackView("overview"); setView("site"); }}
              goEntry={(id) => {
                const nextId = id || (activeSite && sitesL.some((s) => s.id === activeSite) ? activeSite : sitesL[0]?.id);
                if (nextId) setActiveSite(nextId);
                setView("entry");
              }}
              onViewHistory={(group) => setHistoryGroup(group)}
              marginCtx={marginCtx}
            />
          )}
          {view === "sites" && (
            <SitesManagement
              rows={sitesMasterRows}
              records={records}
              month={month}
              sitesAll={sitesEnriched}
              activeSiteCount={activeSiteCount}
              query={query}
              setQuery={setQuery}
              showHistorical={showHistorical}
              setShowHistorical={setShowHistorical}
              inactiveCount={sitesEnriched.length - activeSiteCount}
              openSite={(id) => { setActiveSite(id); setSiteBackView("sites"); setView("site"); }}
              onEdit={(id) => { setActiveSite(id); setView("entry"); }}
              onEditSite={(id) => setEditSite(sitesEnriched.find((s) => s.id === id) || null)}
              onDeactivate={deactivateSite}
              onActivate={activateSite}
              onConfig={(id) => { setActiveSite(id); setView("config"); }}
              onDelete={removeSite}
              onViewHistory={(group) => setHistoryGroup(group)}
              onAdd={() => setShowAdd(true)}
              mLabel={siteDetailLabel}
            />
          )}
          {view === "site" && activeSite && (
            <SiteWorkspace
              site={sitesAllL.find((s) => s.id === activeSite)}
              sitesAll={sitesAllL}
              records={records}
              periodKeys={sitePeriodKeys.length ? sitePeriodKeys : [month]}
              periodFrom={periodFrom}
              periodTo={periodTo}
              setPeriodFrom={setOverviewPeriodFrom}
              setPeriodTo={setOverviewPeriodTo}
              mLabel={siteDetailLabel}
              back={() => setView(siteBackView)}
              onEdit={() => setView("entry")}
              onConfig={() => setView("config")}
              onViewHistory={(group) => setHistoryGroup(group)}
              onViewBudget={setBudgetViewSiteId}
              onOpenVersion={(id) => setActiveSite(id)}
              onDeactivate={deactivateSite}
              onActivate={activateSite}
              onDelete={removeSite}
            />
          )}
          {view === "entry" && (
            <FiguresEntryPage
              sites={sitesL}
              sitesAll={sitesAllL}
              library={library}
              parents={parents}
              records={records}
              month={month}
              setMonth={setMonth}
              activeSite={activeSite}
              setActiveSite={setActiveSite}
              libMap={libMap}
              onSave={saveRecord}
              onRecordPersisted={onRecordPersisted}
              onRecordSaveFailed={revertRecord}
              onPeriodSaveError={onPeriodSaveError}
              onPatchSite={patchSiteAndSave}
              onAdd={() => setShowAdd(true)}
              goConfig={(id) => { setActiveSite(id); void requestViewChange("config"); }}
              onViewBudget={setBudgetViewSiteId}
              explicitSaveMode={explicitFigureSaveEnabled}
              saveCoordinator={saveCoordinatorRef.current}
              userId={user?.id || "anon"}
              onFiguresDirtyChange={onFiguresDirtyChange}
            />
          )}
          {view === "config" && <SiteSetupPage sites={sitesL} sitesAll={sitesAllL} library={library} parents={parents} activeSite={activeSite} setActiveSite={setActiveSite} records={records} month={month} onPatchSite={patchSite} onApplySetupChange={applySiteSetupChange} onRemoveHead={removeLibraryHead} onRenameHead={renameLibraryHead} onAdd={() => setShowAdd(true)} onRenameParent={renameParent} onSetParentColor={setParentColor} onSaveSetup={commitSiteSetup} onDiscardSetup={discardSetupChanges} setupDirty={setupDirty} saveState={saveState} onViewBudget={setBudgetViewSiteId} onSaveBudget={saveSiteBudget} setupConflict={setupConflict} onReloadSetupBaseline={reloadSetupBaseline} onKeepSetupDraft={keepSetupDraft} />}
          {view === "reports" && (
            <ReportsPage
              sites={sitesL}
              sitesAll={sitesAllL}
              records={records}
              parents={parents}
              defaultMonth={month}
              showHistorical={showHistorical}
              setShowHistorical={setShowHistorical}
              onViewSite={(id, range) => {
                if (range?.from && range?.to) {
                  const { from, to } = normalizePeriodRange(range.from, range.to);
                  setPeriodFrom(from);
                  setPeriodTo(to);
                  setMonth(to);
                }
                setActiveSite(id);
                setSiteBackView("reports");
                setView("site");
              }}
            />
          )}
        </div>
      </main>
      </div>

      {(showAdd || editSite) && (
        <AddSiteModal
          key={editSite?.id || "add"}
          editSite={editSite}
          existing={sitesEnriched}
          onClose={() => { setShowAdd(false); setEditSite(null); }}
          onDeactivate={deactivateSite}
          onActivate={activateSite}
          onSave={(s) => {
            if (s.isEdit) {
              applySiteSetupChange(({ sites: allSites }) => ({
                sites: allSites.map((site) => (
                  site.id === s.id
                    ? {
                      ...site,
                      name: s.name,
                      service: s.service,
                      wo: s.wo,
                      ocNumber: s.ocNumber,
                      siteType: s.siteType === "shutdown" || s.siteType === "safety" || s.siteType === "fire"
                        ? s.siteType
                        : "fire",
                      contractStart: s.contractStart,
                      contractEnd: s.contractEnd,
                    }
                    : site
                )),
              }), { commit: true });
              setEditSite(null);
              const successMsg = "Site updated successfully.";
              setActionNotice(successMsg);
              window.setTimeout(() => {
                setActionNotice((current) => (current === successMsg ? "" : current));
              }, 5000);
              return;
            }
            if (s.isRenewal) {
              const beforeIds = new Set(sites.map((x) => x.id));
              const prevActiveInGroup = sites
                .filter((x) => isSiteActive(x) && (
                  (x.siteGroup || x.id) === (s.siteGroup || slug(s.name))
                  || x.name.trim().toLowerCase() === s.name.trim().toLowerCase()
                ))
                .map((x) => x.id);
              const next = prepareNewSiteVersion(sites, s);
              const newSite = next.find((x) => !beforeIds.has(x.id)) || next[next.length - 1];
              const touched = [...new Set([...prevActiveInGroup, newSite.id])];
              setSites(next);
              stateRef.current = { ...stateRef.current, sites: next };
              setShowAdd(false);
              setActiveSite(newSite.id);
              setView("config");
              void persistSitesImmediate(next).catch(() => {});
              const successMsg = "Site saved successfully.";
              setActionNotice(successMsg);
              window.setTimeout(() => {
                setActionNotice((current) => (current === successMsg ? "" : current));
              }, 5000);
            } else {
              const seeded = defaultSiteSetup(stateRef.current.library || library);
              const nextSite = {
                ...s,
                structure: seeded.structure,
                structureEmpty: false,
                siteGroup: s.siteGroup || slug(s.name),
                version: s.version || 1,
                status: s.status || "active",
              };
              const nextSites = [...sites, nextSite];
              setSites(nextSites);
              if (seeded.libraryChanged) setLibrary(seeded.library);
              stateRef.current = { ...stateRef.current, sites: nextSites, library: seeded.library };
              setShowAdd(false);
              setActiveSite(nextSite.id);
              setView("config");
              void persistSitesImmediate(nextSites).catch(() => {});
              const successMsg = "Site saved successfully.";
              setActionNotice(successMsg);
              window.setTimeout(() => {
                setActionNotice((current) => (current === successMsg ? "" : current));
              }, 5000);
            }
          }}
        />
      )}
      {budgetViewSiteId && (
        <EstimatedBudgetViewModal
          sites={sitesAllL}
          library={library}
          initialSiteId={budgetViewSiteId}
          onClose={() => setBudgetViewSiteId(null)}
        />
      )}
      {historyGroup && (
        <SiteVersionHistoryModal
          siteGroup={historyGroup}
          sites={sitesAllL}
          records={records}
          month={month}
          onClose={() => setHistoryGroup(null)}
          onOpenSite={(id) => { setActiveSite(id); setView("site"); setHistoryGroup(null); }}
          onViewBudget={(id) => { setBudgetViewSiteId(id); setHistoryGroup(null); }}
        />
      )}
    </div>
    </PlMarginContext.Provider>
  );
}

/* ───────────────────────── ESTIMATED BUDGET VIEW ───────────────────────── */
function EstimatedBudgetViewModal({ sites, library, initialSiteId, onClose }) {
  const [siteId, setSiteId] = useState(initialSiteId || sites[0]?.id || "");
  useEffect(() => {
    if (initialSiteId) setSiteId(initialSiteId);
  }, [initialSiteId]);
  const site = sites.find((s) => s.id === siteId) || null;
  const siteLib = site ? mergeSiteLibrary(site, library) : library;
  const libMap = Object.fromEntries(siteLib.map((h) => [h.key, h]));
  const budget = site ? contractBudgetFor(site) : null;
  const totals = estTotals(budget);
  const structure = site ? displayStructure(site).filter((g) => g.children.length) : [];
  const group = site?.siteGroup || site?.id;
  const versions = group ? sitesInGroup(sites, group) : [];
  const contractLabel = site?.contractStart && site?.contractEnd
    ? `${monthLabelOf(site.contractStart)} – ${monthLabelOf(site.contractEnd)}`
    : "—";

  return (
    <Modal onClose={onClose} title="Estimated Budget" wide>
      {versions.length > 1 && (
        <div className="contract-timeline-row">
          <label className="sf" style={{ flex: 1, minWidth: 280 }}>
            <span>Contract timeline</span>
            <select className="sf-sel" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {versionLabel(v)}
                  {v.wo ? ` · ${v.wo}` : ""}
                  {v.contractStart && v.contractEnd ? ` · ${monthLabelOf(v.contractStart)}–${monthLabelOf(v.contractEnd)}` : ""}
                  {!isSiteActive(v) ? " (Historical)" : " (Active)"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {!site ? (
        <p className="muted-s">Select a site to view its estimated budget.</p>
      ) : !budget ? (
        <p className="muted-s">No estimated budget has been set for {versionLabel(site)} ({contractLabel}). Set one in Site Setup → Contract &amp; Estimate.</p>
      ) : (
        <>
          <div className="budget-view-meta">
            <div><span className="muted-s">Site</span><strong>{site.name}</strong></div>
            <div><span className="muted-s">Contract</span><strong>{versionLabel(site)}</strong> <span className={"pill " + (isSiteActive(site) ? "pill-ok" : "pill-inactive")}>{isSiteActive(site) ? "Active" : "Historical"}</span></div>
            <div><span className="muted-s">Period</span><span className="mono">{contractLabel}</span></div>
            <div><span className="muted-s">Budget label</span><span>{budget.note || "Estimate"}</span></div>
          </div>
          <p className="m-note" style={{ marginTop: 0 }}>Read-only view — estimated values are fixed for this contract&apos;s full duration.</p>

          <div className="fgroup-h" style={{ color: "var(--green)", marginTop: 12 }}>Estimated Revenue</div>
          <table className="tbl budget-view-tbl">
            <thead><tr><th>Revenue line</th><th className="r">Estimated value</th></tr></thead>
            <tbody>
              {REVENUE_ITEMS.map((it) => {
                const val = Number(budget.revenue?.[it.key]) || 0;
                return (
                  <tr key={it.key}>
                    <td>{it.label}</td>
                    <td className="r mono">{inr(it.sign * val)}</td>
                  </tr>
                );
              })}
              <tr className="vtot green">
                <td className="strong">Total Estimated Revenue</td>
                <td className="r mono strong">{inr(totals.revenue)}</td>
              </tr>
            </tbody>
          </table>

          <div className="fgroup-h" style={{ color: "var(--loss)", marginTop: 16 }}>Estimated Expenses</div>
          {structure.length === 0 ? (
            <p className="muted-s">No cost structure configured for this contract.</p>
          ) : (
            <table className="tbl budget-view-tbl">
              <thead><tr><th>Parent head</th><th>Cost component</th><th className="r">Estimated value</th></tr></thead>
              <tbody>
                {structure.map((g) => {
                  const rows = g.children
                    .map((k) => ({ key: k, label: libMap[k]?.label || childLabel(site, k), val: Number(budget.expenses?.[k]) || 0 }));
                  if (!rows.length) return null;
                  const parentSub = rows.reduce((a, r) => a + r.val, 0);
                  return (
                    <React.Fragment key={g.parent}>
                      {rows.map((r, idx) => (
                        <tr key={r.key}>
                          <td className={idx === 0 ? "strong" : ""} style={{ color: idx === 0 ? parentColor(g.parent) : undefined }}>
                            {idx === 0 ? parentLabel(g.parent) : ""}
                          </td>
                          <td>{r.label}</td>
                          <td className="r mono">{inr(r.val)}</td>
                        </tr>
                      ))}
                      <tr className="budget-parent-sub">
                        <td colSpan={2} className="r muted-s">{parentLabel(g.parent)} subtotal</td>
                        <td className="r mono">{inr(parentSub)}</td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                <tr className="vtot">
                  <td colSpan={2} className="strong">Total Estimated Expense</td>
                  <td className="r mono strong">{inr(totals.expense)}</td>
                </tr>
              </tbody>
            </table>
          )}

          <table className="tbl budget-view-tbl" style={{ marginTop: 14 }}>
            <tbody>
              <tr className="vtot green">
                <td className="strong">Total Estimated Cost (Expense)</td>
                <td className="r mono strong">{inr(totals.expense)}</td>
              </tr>
              <tr>
                <td className="strong">Estimated Profit</td>
                <td className="r mono strong" style={{ color: totals.profit >= 0 ? "var(--profit)" : "var(--loss)" }}>{inr(totals.profit)}</td>
              </tr>
              <tr>
                <td className="muted-s">Estimated Margin</td>
                <td className="r mono">{pct(totals.margin)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
      <div className="m-actions" style={{ marginTop: 16 }}>
        <button type="button" className="ghost-d" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

/* ───────────────────────── MODALS ───────────────────────── */
function AddSiteModal({ onClose, onSave, onDeactivate, onActivate, existing, editSite = null }) {
  const isEdit = !!editSite;
  const [name, setName] = useState(editSite?.name || "");
  const [wo, setWo] = useState(editSite?.wo || "");
  const [ocNumber, setOcNumber] = useState(editSite?.ocNumber || "");
  const [siteType, setSiteType] = useState(
    editSite?.siteType === "shutdown" || editSite?.siteType === "safety" || editSite?.siteType === "fire"
      ? editSite.siteType
      : "fire",
  );
  const [cStart, setCStart] = useState(() => contractDateInputValue(editSite?.contractStart) || "2025-04-01");
  const [cEnd, setCEnd] = useState(() => contractDateInputValue(editSite?.contractEnd) || "2026-03-31");
  const [renewalMode, setRenewalMode] = useState(false);
  const nameMatches = useMemo(
    () => (isEdit ? [] : existing.filter((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase())),
    [existing, name, isEdit],
  );
  const priorActive = useMemo(
    () => nameMatches.find(isSiteActive) || nameMatches[0] || null,
    [nameMatches],
  );
  const isRenewal = renewalMode && nameMatches.length > 0;
  const submit = () => {
    if (!name.trim()) return;
    const trimmed = name.trim();
    const normalizedType =
      siteType === "shutdown" || siteType === "safety" || siteType === "fire" ? siteType : "fire";
    if (isEdit) {
      onSave({
        isEdit: true,
        id: editSite.id,
        name: trimmed,
        service: editSite?.service || "",
        wo: wo.trim(),
        ocNumber: ocNumber.trim(),
        siteType: normalizedType,
        contractStart: contractPeriodFromDateInput(cStart),
        contractEnd: contractPeriodFromDateInput(cEnd),
      });
      return;
    }
    let id = slug(trimmed);
    let n = 1;
    while (existing.some((s) => s.id === id)) id = slug(trimmed) + "-" + (++n);
    const base = {
      id,
      name: trimmed,
      service: (priorActive?.service || "").trim(),
      wo: wo.trim(),
      ocNumber: ocNumber.trim() || (priorActive?.ocNumber || "").trim(),
      siteType: normalizedType,
      structure: isRenewal && priorActive?.structure?.length
        ? priorActive.structure.map((g) => ({ parent: g.parent, children: [...g.children] }))
        : [],
      structureEmpty: !(isRenewal && priorActive?.structure?.length),
      spreads: [],
      estimates: [],
      contractStart: contractPeriodFromDateInput(cStart),
      contractEnd: contractPeriodFromDateInput(cEnd),
      siteGroup: priorActive?.siteGroup || slug(trimmed),
      version: 1,
      status: "active",
      isRenewal: !!isRenewal,
    };
    onSave(base);
  };
  return (
    <Modal onClose={onClose} title={isEdit ? "Edit Site" : isRenewal ? "New Contract / PO Version" : "Add Site"}>
      <label className="m-field"><span>Site / client name *</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lalitpur Power Generation" autoFocus /></label>
      {!isEdit && nameMatches.length > 0 && (
        <div className="renewal-banner">
          <History size={15} />
          <div>
            <strong>Existing site found — {nameMatches.length} version{nameMatches.length === 1 ? "" : "s"} on record</strong>
            <p>Create a new contract version with the same site name. Previous version(s) will be marked inactive.</p>
          </div>
          <label className="renewal-check">
            <input type="checkbox" checked={renewalMode} onChange={(e) => setRenewalMode(e.target.checked)} />
            New PO / contract version
          </label>
        </div>
      )}
      <label className="m-field">
        <span>Site type</span>
        <select value={siteType} onChange={(e) => setSiteType(e.target.value)} style={{ width: "100%" }}>
          <option value="fire">Fire</option>
          <option value="safety">Safety</option>
          <option value="shutdown">Shutdown</option>
        </select>
      </label>
      <label className="m-field"><span>OC Number (client ref)</span><input value={ocNumber} onChange={(e) => setOcNumber(e.target.value)} placeholder="e.g. IFSPL-MANP-OC-25/26-00001" /></label>
      <label className="m-field"><span>Work order / PO no.</span><input value={wo} onChange={(e) => setWo(e.target.value)} placeholder="e.g. PO-2026-0142" /></label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="m-field" style={{ flex: 1 }}>
          <span>Contract start</span>
          <FinanceDateInput
            className="rounded-[9px] border border-[var(--line)] bg-[var(--paper)]"
            value={cStart || ""}
            onChange={setCStart}
          />
        </label>
        <label className="m-field" style={{ flex: 1 }}>
          <span>Contract end</span>
          <FinanceDateInput
            className="rounded-[9px] border border-[var(--line)] bg-[var(--paper)]"
            value={cEnd || ""}
            onChange={setCEnd}
          />
        </label>
      </div>
      {!isEdit && isRenewal && priorActive && (
        <p className="m-note">Structure will be copied from {versionLabel(priorActive)}. Adjust rates and heads in Site Setup after creating.</p>
      )}
      <p className="m-note">{isEdit ? "Update site details. Cost structure and estimates are managed in Site Setup." : <>Next, in Site Setup you can arrange parent → child lines (drag &amp; drop) and set the <b>estimate / budget</b>.</>}</p>
      <div className="m-actions">
        {isEdit && isSiteActive(editSite) && onDeactivate ? (
          <button
            type="button"
            className="ghost-d danger-text m-actions-left"
            onClick={() => onDeactivate(editSite.id)}
          >
            Make inactive
          </button>
        ) : isEdit && !isSiteActive(editSite) && onActivate ? (
          <button
            type="button"
            className="ghost-d sm-act-activate-text m-actions-left"
            onClick={() => onActivate(editSite.id)}
          >
            Make active
          </button>
        ) : (
          <span />
        )}
        <div className="m-actions-right">
          <button type="button" className="ghost-d" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={submit}>{isEdit ? "Save changes" : isRenewal ? "Create new version" : "Add & configure"}</button>
        </div>
      </div>
    </Modal>
  );
}

function SiteVersionHistoryModal({ siteGroup, sites, records, month, onClose, onOpenSite, onViewBudget }) {
  const versions = useMemo(() => sitesInGroup(sites, siteGroup), [sites, siteGroup]);
  const siteName = versions[0]?.name || "Site";
  const clientLabel = versions[0]?.ocNumber || versions[0]?.wo || siteName;
  const mLabel = monthLabelOf(month);
  const active = versions.filter(isSiteActive);
  const historical = versions.filter((s) => !isSiteActive(s));
  const [histOpen, setHistOpen] = useState(historical.length > 0);

  const renderRow = (s, readOnly = false) => {
    const c = calcSite(s, month, records);
    const hasData = !!records[`${s.id}__${month}`];
    const estCount = (s.estimates || []).length;
    return (
      <tr key={s.id} className={!isSiteActive(s) ? "row-inactive" : ""}>
        <td className="strong">{versionLabel(s)}</td>
        <td className="mono">{s.wo || "—"}</td>
        <td className="mono muted-s">{s.contractStart ? `${monthLabelOf(s.contractStart)}–${monthLabelOf(s.contractEnd)}` : "—"}</td>
        <td className="muted-s">{s.ocNumber || clientLabel}</td>
        <td>
          <span className={"pill " + (isSiteActive(s) ? "pill-ok" : "pill-inactive")}>
            <CircleDot size={9} /> {isSiteActive(s) ? "Active" : "Historical"}
          </span>
        </td>
        <td className="r mono" style={{ color: hasData ? (c.profit < 0 ? "var(--loss)" : "var(--ink)") : "var(--muted)" }}>
          {hasData ? inr(c.profit) : "—"}
        </td>
        <td className="r mono muted-s">{estCount || "—"}</td>
        <td className="r nowrap">
          {onViewBudget && contractBudgetFor(s) ? (
            <button type="button" className="link" onClick={() => onViewBudget(s.id)}>View budget</button>
          ) : null}
          {readOnly ? (
            <span className="muted-s" style={{ marginLeft: 8 }}>Read-only</span>
          ) : (
            <button type="button" className="link" style={{ marginLeft: 8 }} onClick={() => onOpenSite(s.id)}>View P&L →</button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <Modal onClose={onClose} title={`Contract History · ${siteName}`} wide>
      <p className="m-note">Active contract shown below. Expired or completed contracts are preserved as read-only historical records. You can add a new contract for the same site/client at any time.</p>

      <div className="hist-accordion-group">
        <div className="hist-acc-head open">
          <span className="hist-acc-title">{siteName}</span>
          <span className="hist-acc-sub">Client · {clientLabel}</span>
        </div>
        <div className="hist-acc-body">
          <h4 className="hist-section-label">Active contract</h4>
          {active.length === 0 ? (
            <p className="muted-s">No active contract — create a new version from All Sites.</p>
          ) : (
            <table className="tbl hist-tbl">
              <thead>
                <tr>
                  <th>Version</th><th>PO / W.O.</th><th>Contract</th><th>Client</th><th>Status</th>
                  <th className="r">P&L · {mLabel}</th><th className="r">Estimates</th><th />
                </tr>
              </thead>
              <tbody>{active.map((s) => renderRow(s, false))}</tbody>
            </table>
          )}

          {historical.length > 0 && (
            <>
              <button type="button" className="hist-expand-btn" onClick={() => setHistOpen((v) => !v)}>
                {histOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Historical data ({historical.length} contract{historical.length === 1 ? "" : "s"})
              </button>
              {histOpen && (
                <table className="tbl hist-tbl hist-tbl-arch">
                  <thead>
                    <tr>
                      <th>Version</th><th>PO / W.O.</th><th>Contract</th><th>Client</th><th>Status</th>
                      <th className="r">P&L · {mLabel}</th><th className="r">Estimates</th><th />
                    </tr>
                  </thead>
                  <tbody>{historical.map((s) => renderRow(s, true))}</tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      <div className="m-actions">
        <button className="ghost-d" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, title, wide }) {
  return (<div className="overlay" onClick={onClose}><div className={"modal" + (wide ? " wide" : "")} onClick={(e) => e.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div><div className="modal-body">{children}</div></div></div>);
}

/* ───────────────────────── STYLES ───────────────────────── */
function Styles() {
  return (
    <style>{`
    :root{--paper:var(--surface-raised);--ink:var(--text);--ink-soft:var(--text-secondary);--muted:var(--text-muted);--line:var(--border);--accent-mid:var(--accent-deep-text);--profit:var(--success-text);--loss:var(--critical-text);--warn:var(--warning-text);--gold:var(--chart-3);--green:var(--success-text);--display:var(--font-sans);--body:var(--font-sans);--mono:var(--font-mono);}
    *{box-sizing:border-box}
    .app{display:flex;min-height:640px;background:var(--paper);color:var(--ink);font-family:var(--body);font-size:13px;}
    .app.embedded{min-height:520px;background:var(--paper);width:100%;}
    .app.stacked{flex-direction:column;}
    .sl-body{flex:1;min-width:0;width:100%;display:flex;flex-direction:column;}
    .sl-btn{padding:6px 12px;font-size:12px;}
    .topbar-left{display:flex;flex-direction:column;gap:10px;flex:1;min-width:0;}
    .sl-view-nav{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
    .sl-view-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink-soft);font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;}
    .sl-view-btn:hover{border-color:var(--border-strong);color:var(--ink);background:var(--surface-raised);}
    .sl-view-btn.on{background:var(--accent-soft);border-color:var(--accent-border);color:var(--accent-text);font-weight:600;}
    .sl-view-badge{font-family:var(--mono);font-size:10px;padding:1px 6px;border-radius:10px;background:var(--surface-sunken);border:1px solid var(--line);color:var(--muted);}
    .sl-view-btn.on .sl-view-badge{background:var(--surface);border-color:var(--accent-border);}
    .side{width:220px;flex-shrink:0;background:var(--surface);color:var(--ink-soft);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:16px 12px;position:sticky;top:0;align-self:flex-start;min-height:calc(100vh - 168px);}
    .brand{display:flex;align-items:center;gap:10px;padding:4px 6px 16px;border-bottom:1px solid var(--line);margin-bottom:12px;}
    .brand-mark{width:36px;height:36px;border-radius:8px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:var(--accent-text);}
    .brand-name{font-weight:700;font-size:15px;color:var(--ink);}
    .brand-sub{font-size:11px;color:var(--muted);}
    .side nav{display:flex;flex-direction:column;gap:2px;flex:1;}
    .side .nav{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;background:none;border:none;color:var(--ink-soft);font-size:13px;cursor:pointer;text-align:left;width:100%;transition:.15s;border-left:2px solid transparent;}
    .side .nav:hover{background:var(--surface-sunken);color:var(--ink);}.side .nav.on{background:var(--accent-soft);color:var(--accent-text);font-weight:600;border-left-color:var(--accent-mid);}
    .side .nav .count{margin-left:auto;background:var(--surface-sunken);border:1px solid var(--line);border-radius:20px;padding:1px 8px;font-size:11px;font-family:var(--mono);color:var(--muted);}
    .side-foot{margin-top:auto;display:flex;flex-direction:column;gap:8px;padding-top:12px;border-top:1px solid var(--line);}
    .app .ghost{display:flex;align-items:center;gap:7px;justify-content:center;background:var(--surface);border:1px solid var(--line);color:var(--ink-soft);padding:8px 10px;border-radius:8px;font-size:12.5px;cursor:pointer;}
    .app .ghost:hover{background:var(--surface-raised);border-color:var(--border-strong);color:var(--ink);}
    .ghost-d{display:inline-flex;align-items:center;gap:7px;background:var(--paper);border:1px solid var(--line);color:var(--ink-soft);padding:8px 13px;border-radius:9px;font-size:13px;cursor:pointer;font-family:var(--body);font-weight:500;}
    .ghost-d:hover{border-color:var(--accent-mid);color:var(--accent-text);}
    .save{font-size:11px;text-align:center;padding:6px;border-radius:7px;color:var(--muted);}
    .save.saved{color:var(--profit);}.save.local{color:var(--warn);}.save.saving{color:var(--muted);}
    .main{flex:1;min-width:0;display:flex;flex-direction:column;}
    .app:not(.embedded) .main{min-height:calc(100vh - 168px);overflow:hidden;}
    .app.embedded .main{overflow:visible;}
    .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px;border-bottom:1px solid var(--line);background:var(--surface);flex-wrap:wrap;}
    .topbar-right{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;}
    .topbar h1{font-family:var(--display);font-size:23px;font-weight:700;margin:0;letter-spacing:-.02em;}
    .topbar p{margin:2px 0 0;color:var(--muted);font-size:12.5px;}
    .month-pick{display:flex;flex-direction:column;gap:3px;}
    .month-pick label{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;}
    .month-pick select,.entry-sel select,.sf select,.sf input,.add-head select,.add-head input,.spread-form select,.spread-form input,.m-field select{font-family:var(--body);font-size:14px;padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);font-weight:500;cursor:pointer;}
    .month-pick select,.entry-sel select{font-weight:600;}
    .scroll{padding:20px 24px 40px;flex:1;}
    .app:not(.embedded) .scroll{overflow-y:auto;min-height:0;}
    .app.embedded .scroll{overflow:visible;}
    .ov-filters-modern{background:var(--surface);border-color:var(--border);box-shadow:0 1px 2px rgba(15,23,42,.04);}
    .ov-hero{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;padding:16px 18px;background:var(--surface);border:1px solid var(--line);border-radius:14px;}
    .ov-hero-title{margin:0;font-size:18px;font-weight:700;letter-spacing:-.02em;}
    .ov-hero-sub{margin:4px 0 0;font-size:13px;color:var(--muted);}
    .ov-margin-legend{display:flex;gap:8px;flex-wrap:wrap;}
    .ov-margin-chip{font-size:11px;font-weight:600;padding:5px 10px;border-radius:999px;border:1px solid var(--line);}
    .ov-margin-chip.target{background:var(--success-soft);color:var(--success);border-color:var(--success-border);}
    .ov-margin-chip.warn{background:var(--warning-soft);color:var(--warning);border-color:var(--warning-border);}
    .pl-date-input,.sl-period-sel,.ov-period-sel{font-family:var(--body);font-size:14px;padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);font-weight:500;}
    .period-date-select .period-month-select{display:flex;gap:6px;flex-wrap:wrap;}
    .pl-date-hint{display:block;font-size:11px;color:var(--muted);margin-top:3px;}
    .period-date-select{display:flex;flex-direction:column;gap:2px;}
    .pl-audit-panel{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;margin-bottom:16px;background:var(--surface-raised);border:1px solid var(--border);border-radius:10px;font-size:12.5px;color:var(--ink-soft);}
    .pl-audit-empty{gap:8px;color:var(--muted);}
    .pl-audit-title{font-weight:700;color:var(--ink);font-size:12px;text-transform:uppercase;letter-spacing:.06em;}
    .pl-audit-rows{display:flex;flex-wrap:wrap;gap:14px;}
    .pl-audit-row{display:flex;align-items:center;gap:6px;}
    .entry-audit{margin-top:0;margin-bottom:14px;}
    .pmanage-locked{display:flex;align-items:center;gap:12px;margin:16px 0 10px;flex-wrap:wrap;}
    .tbl-compact td,.tbl-compact th{padding-top:8px;padding-bottom:8px;}
    .hist-accordion-group{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:8px;}
    .hist-acc-head{padding:12px 14px;background:var(--surface-raised);border-bottom:1px solid var(--line);}
    .hist-acc-title{display:block;font-weight:700;font-size:14px;}
    .hist-acc-sub{font-size:12px;color:var(--muted);}
    .hist-acc-body{padding:14px;}
    .hist-section-label{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
    .hist-expand-btn{display:inline-flex;align-items:center;gap:6px;margin:14px 0 8px;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:var(--surface);font-size:12.5px;cursor:pointer;}
    .contract-timeline-row{margin-bottom:12px}
    .budget-view-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px 16px;padding:10px 12px;background:var(--surface-raised);border:1px solid var(--line);border-radius:10px;margin-bottom:8px}
    .budget-view-meta strong{display:block;font-size:13px;margin-top:2px}
    .budget-view-tbl{margin-top:6px}
    .budget-parent-sub td{background:var(--surface-raised);font-size:12px}
    .hist-tbl-arch{opacity:.92;}
    .sm-ac-wrap{min-width:240px;flex:1;}
    .ov-filter-ac{min-width:240px;flex:1;max-width:320px;}
    .ov-filter-ac .entry-sel{margin:0;}
    .ov-filter-ac .site-search{min-width:0;max-width:none;width:100%;}
    .ov-filters{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 14px;padding:14px 16px;margin-bottom:14px;background:var(--paper);border:1px solid var(--line);border-radius:12px;}
    .ov-filter{display:flex;flex-direction:column;gap:4px;min-width:0;}
    .ov-filter>span{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600;}
    .ov-filter select,.ov-filter input{font-family:var(--body);font-size:13px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);}
    .ov-filter.search{flex:1;min-width:160px;max-width:240px;position:relative;}
    .ov-filter.search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none;}
    .ov-filter.search input{width:100%;padding-left:30px;}
    .ov-filter.range .ov-range{display:flex;align-items:center;gap:6px;}
    .ov-filter.range input{width:72px;}
    .ov-filter.range span{color:var(--muted);font-size:12px;}
    .ov-clear{align-self:flex-end;font-size:12px;padding:7px 12px;}
    .ov-meta{margin:-4px 0 14px;font-size:12px;color:var(--muted);}
    .ov-empty-hint{display:flex;align-items:center;gap:10px;padding:12px 14px;margin-bottom:16px;background:rgba(169,132,43,.08);border:1px solid rgba(169,132,43,.2);border-radius:10px;font-size:13px;color:var(--ink-soft);}
    .chart-empty{padding:48px 16px;text-align:center;color:var(--muted);font-size:13px;}
    .kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:18px;}
    .kpi{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:15px 17px;}
    .kpi-top{display:flex;align-items:center;gap:8px;margin-bottom:9px;}
    .kpi-label{font-size:11.5px;color:var(--ink-soft);font-weight:500;}
    .kpi-value{font-family:var(--display);font-size:25px;font-weight:700;letter-spacing:-.02em;line-height:1;}
    .kpi-sub{display:flex;align-items:center;gap:4px;margin-top:7px;font-size:11.5px;color:var(--muted);font-family:var(--mono);}
    .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;margin-bottom:18px;overflow:hidden;}
    .card-head{display:flex;align-items:center;justify-content:space-between;padding:15px 18px 12px;}
    .card-head h3{font-family:var(--display);font-size:15.5px;font-weight:700;margin:0;letter-spacing:-.01em;}
    .muted-s{font-size:11.5px;color:var(--muted);}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px;}@media(max-width:1080px){.grid-2{grid-template-columns:1fr;}}
    .stack{display:flex;flex-direction:column;}
    .donut-wrap{display:flex;align-items:center;gap:14px;}.donut-wrap>div:first-child{flex:0 0 46%;}
    .legend{flex:1;display:flex;flex-direction:column;gap:7px;}
    .legend-row{display:flex;align-items:center;gap:8px;font-size:12.5px;}
    .legend-dot{width:9px;height:9px;border-radius:3px;flex-shrink:0;}
    .legend-name{flex:1;color:var(--ink-soft);}.legend-val{font-family:var(--mono);font-weight:600;font-size:12px;}.legend-pct{font-family:var(--mono);color:var(--muted);width:46px;text-align:right;font-size:11.5px;}
    .trend-legend{display:flex;gap:18px;justify-content:center;padding:4px 0 2px;font-size:12px;color:var(--ink-soft);}
    .trend-legend span{display:flex;align-items:center;gap:6px;}.trend-legend i{width:14px;height:3px;border-radius:2px;display:inline-block;}
    .tip{background:var(--ink);color:var(--surface);padding:9px 11px;border-radius:9px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.2);}
    .tip-title{font-weight:700;margin-bottom:5px;font-family:var(--display);}
    .tip-row{display:flex;align-items:center;gap:7px;padding:1px 0;}.tip-dot{width:8px;height:8px;border-radius:2px;}.tip-row strong{margin-left:auto;font-family:var(--mono);}
    .tbl{width:100%;border-collapse:collapse;font-size:13px;}
    .tbl th{text-align:left;padding:9px 12px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);border-bottom:1px solid var(--line);font-weight:600;white-space:nowrap;}
    .tbl th.r,.tbl td.r{text-align:right;}.tbl th.click{cursor:pointer;user-select:none;}.tbl th.click:hover{color:var(--ink);}
    .tbl td{padding:11px 12px;border-bottom:1px solid var(--line);}.tbl tr:last-child td{border-bottom:none;}
    .tbl tbody tr:hover td{background:var(--surface-raised);}
    .tbl tbody tr.row-inactive td{background:var(--surface-sunken);color:var(--text-disabled);}
    .tbl tbody tr.row-inactive td.strong,.tbl tbody tr.row-inactive .ver-pill{color:var(--text-muted);}
    .tbl tbody tr.row-inactive:hover td{background:var(--surface-sunken);}
    .ver-pill{display:inline-block;margin-left:8px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;background:var(--surface-sunken);border:1px solid var(--line);color:var(--muted);font-family:var(--mono);vertical-align:middle;}
    .ver-pill.inactive,.ver-pill.inactive{background:var(--border);color:var(--text-muted);}
    .ver-pill.inline{margin-left:10px;font-size:11px;}
    .hist-scope-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink-soft);font-size:12px;font-weight:500;cursor:pointer;font-family:var(--body);white-space:nowrap;}
    .hist-scope-btn.sm{padding:6px 10px;font-size:11.5px;}
    .hist-scope-btn.on{background:var(--accent-soft);border-color:var(--critical-border);color:var(--accent-text);font-weight:600;}
    .hist-scope-btn:hover{border-color:var(--border-strong);color:var(--ink);}
    .hist-hint{color:var(--muted);}
    .hist-banner{display:flex;align-items:center;gap:12px;padding:12px 16px;margin-bottom:16px;background:var(--surface-sunken);border:1px solid var(--border);border-radius:12px;color:var(--ink-soft);}
    .hist-banner strong{display:block;color:var(--ink);font-size:13px;margin-bottom:2px;}
    .hist-banner p{margin:0;font-size:12px;color:var(--muted);}
    .hist-banner .ghost-d.sm{padding:6px 12px;font-size:12px;margin-left:auto;flex-shrink:0;}
    .renewal-banner{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;padding:12px 14px;margin-bottom:12px;background:rgba(31,111,78,.08);border:1px solid rgba(31,111,78,.2);border-radius:10px;font-size:12.5px;color:var(--ink-soft);}
    .renewal-banner strong{display:block;color:var(--ink);font-size:13px;}
    .renewal-banner p{margin:4px 0 0;font-size:12px;color:var(--muted);}
    .renewal-check{display:flex;align-items:center;gap:8px;margin-left:auto;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer;white-space:nowrap;}
    .sites-head-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
    .rep-hist-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
    .pill-inactive{background:var(--border);color:var(--text-muted);}
    .hist-tbl{margin-top:8px;}
    .hist-link{margin-right:10px;}
    .strong{font-weight:600;}.click{cursor:pointer;}td.click:hover{color:var(--accent-text);}
    .mono{font-family:var(--mono);font-size:12.5px;font-variant-numeric:tabular-nums;}.nowrap{white-space:nowrap;}
    .link{background:none;border:none;color:var(--accent-text);font-weight:600;cursor:pointer;font-family:var(--body);font-size:inherit;padding:0;}
    .icon-btn{background:none;border:1px solid var(--line);border-radius:7px;padding:5px;cursor:pointer;color:var(--ink-soft);margin-left:4px;}
    .icon-btn:hover{background:var(--paper);color:var(--ink);}.icon-btn.danger:hover{color:var(--loss);border-color:var(--loss);}
    .all-clear{display:flex;align-items:center;gap:9px;color:var(--profit);font-size:13px;padding:6px 0;}
    .pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;}
    .pill-ok{background:rgba(22,119,78,.12);color:var(--profit);}.pill-watch{background:rgba(169,132,43,.14);color:var(--gold);}.pill-warn{background:rgba(194,130,15,.15);color:var(--warn);}.pill-loss{background:rgba(178,63,42,.13);color:var(--loss);}
    .search{display:flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:9px;padding:6px 11px;color:var(--muted);background:var(--paper);}
    .search input{border:none;background:none;outline:none;font-family:var(--body);font-size:13px;width:160px;color:var(--ink);}
    /* variance table (site detail · Income – Expenditure) */
    .site-ie-card .vtbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-top:1px solid var(--line);}
    .site-ie-card .vtbl{table-layout:fixed;width:100%;min-width:640px;border-collapse:separate;border-spacing:0;}
    .site-ie-card .vtbl col.vtbl-col-part{width:36%;}
    .site-ie-card .vtbl col.vtbl-col-num{width:16%;}
    .site-ie-card .vtbl thead th{background:var(--surface-raised);font-size:12px;text-transform:none;letter-spacing:0;color:var(--muted);font-weight:600;padding:10px 12px;border-bottom:2px solid var(--line);white-space:nowrap;}
    .site-ie-card .vtbl thead th:first-child{padding-left:14px;text-align:left;}
    .site-ie-card .vtbl th.r,.site-ie-card .vtbl td.r{text-align:right;}
    .site-ie-card .vtbl tbody td{padding:9px 12px;vertical-align:middle;border-bottom:1px solid var(--divider);}
    .site-ie-card .vtbl .vtbl-part{padding-left:14px;padding-right:12px;color:var(--ink-soft);font-size:13px;line-height:1.45;word-break:normal;overflow-wrap:break-word;}
    .site-ie-card .vtbl-num{white-space:nowrap;font-size:13px;padding-right:14px!important;}
    .site-ie-card .vtbl tr.vsec td{background:var(--surface-sunken);font-size:12px;text-transform:none;letter-spacing:0;color:var(--muted);font-weight:600;padding:8px 14px;border-bottom:1px solid var(--line);}
    .site-ie-card .vhint{text-transform:none;letter-spacing:0;font-weight:400;color:var(--muted);font-size:11px;}
    .site-ie-card .vtbl tr.vparent{cursor:pointer;}
    .site-ie-card .vtbl tr.vparent td.vtbl-part{color:var(--ink);}
    .site-ie-card .vtbl tr.vparent:hover td,.site-ie-card .vtbl tbody tr:not(.vsec):not(.vtot):hover td{background:var(--surface-raised);}
    .site-ie-card .vparent-label{display:grid;grid-template-columns:auto auto 1fr auto;grid-template-rows:auto auto;gap:2px 6px;align-items:start;min-width:0;width:100%;}
    .site-ie-card .vparent-name{grid-column:3;grid-row:1;font-weight:600;line-height:1.4;font-size:13px;min-width:0;word-break:normal;overflow-wrap:break-word;}
    .site-ie-card .pcount{grid-column:4;grid-row:1;justify-self:end;font-family:var(--mono);font-size:9.5px;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:0 5px;line-height:1.5;}
    .site-ie-card .vparent-label .amort-tag{grid-column:3 / -1;grid-row:2;}
    .site-ie-card .pchev{display:inline-flex;flex-shrink:0;color:var(--muted);margin-top:2px;grid-column:1;grid-row:1;}
    .site-ie-card .pdot{width:8px;height:8px;border-radius:3px;display:inline-block;flex-shrink:0;margin-top:5px;grid-column:2;grid-row:1;}
    .site-ie-card .vchild-name{flex:1;min-width:0;line-height:1.45;font-size:13px;color:var(--ink);word-break:normal;overflow-wrap:break-word;}
    .site-ie-card .vtbl tr.vchild td{background:var(--surface-raised);}
    .site-ie-card .vtbl tr.vchild td.vtbl-part{color:var(--ink);}
    .site-ie-card .cbranch{display:inline-block;flex-shrink:0;width:8px;border-left:2px solid var(--line);border-bottom:2px solid var(--line);height:8px;margin-top:4px;}
    .site-ie-card .vtbl tr.vtot td{font-weight:700;border-bottom:1px solid var(--line);}
    .site-ie-card .vtbl tr.vtot td.vtbl-part{color:var(--ink);font-size:12.5px;}
    .site-ie-card .vtbl tr.vtot.green td{background:var(--surface-sunken);}
    .site-ie-card .vtbl tr.vtot.profit td{background:rgba(22,119,78,.1);color:var(--profit);}
    .site-ie-card .vtbl tr.vtot.loss td{background:rgba(178,63,42,.09);color:var(--loss);}
    .site-ie-card .vtbl tr.vmargin td{font-weight:600;border-top:2px solid var(--line);border-bottom:none;background:var(--surface);}
    .site-ie-card .amort-tag{display:inline-flex;align-items:center;flex-shrink:1;max-width:100%;margin-top:2px;font-style:normal;font-size:9.5px;color:var(--gold);background:rgba(169,132,43,.1);padding:1px 5px;border-radius:4px;font-family:var(--mono);white-space:normal;line-height:1.3;word-break:break-word;}
    .site-ie-card .vtbl-part-child{display:flex;align-items:flex-start;gap:8px;padding-left:28px!important;min-width:12rem;}
    /* month-wise IE table */
    .site-ie-card .vtbl-monthly{table-layout:auto;width:max-content;min-width:100%;}
    .site-ie-card .vtbl-monthly th.r,.site-ie-card .vtbl-monthly td.vtbl-num{min-width:92px;}
    .site-ie-card .vtbl-monthly td.vtbl-part,.site-ie-card .vtbl-monthly thead th:first-child{position:sticky;left:0;z-index:2;background:var(--surface);min-width:220px;max-width:300px;box-shadow:1px 0 0 var(--line);}
    .site-ie-card .vtbl-monthly thead th:first-child{background:var(--surface-raised);z-index:3;}
    .site-ie-card .vtbl-monthly tr.vchild td.vtbl-part{background:var(--surface-raised);}
    .site-ie-card .vtbl-monthly tr.vtot td.vtbl-part{background:var(--surface-sunken);}
    .site-ie-card .vtbl-monthly tr.vtot.profit td.vtbl-part{background:var(--success-soft);}
    .site-ie-card .vtbl-monthly tr.vtot.loss td.vtbl-part{background:var(--critical-soft);}
    .site-ie-card .vtbl-monthly tr.vmargin td.vtbl-part{background:var(--surface);}
    .site-ie-card .vtbl-monthly .vsec-label{position:sticky;left:0;display:inline-block;}
    .site-ie-card .vtbl-monthly .dim,.site-ie-card .vtbl-monthly .mie-dim{color:var(--muted);}
    .ie-mode{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface);}
    .ie-mode button{border:none;background:transparent;padding:5px 12px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;font-family:var(--body);}
    .ie-mode button.on{background:var(--accent-mid);color:var(--surface);}
    /* site detail view */
    .site-detail{display:flex;flex-direction:column;gap:0;}
    .site-detail .back{align-self:flex-start;margin-bottom:12px;}
    .site-detail .site-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--line);}
    .site-detail .site-head-info{flex:1;min-width:min(100%,280px);}
    .site-detail .site-head h2{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;font-family:var(--display);font-size:26px;font-weight:700;margin:0;letter-spacing:-.02em;line-height:1.25;}
    .site-detail .site-head-name{word-break:break-word;}
    .site-detail .site-head-meta{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:10px;font-size:13px;color:var(--muted);line-height:1.45;}
    .site-detail .site-head-meta b{color:var(--ink);font-weight:600;}
    .site-detail .site-head-right{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;flex-shrink:0;}
    .site-detail-kpis{margin-bottom:18px;}
    .site-detail .site-ie-card{margin-bottom:18px;}
    .site-detail .site-ie-card .card-head{display:flex;align-items:center;justify-content:space-between;}
    .site-ie-card-tools{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:10px 14px;margin-left:auto;}
    .site-ie-budget{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);white-space:nowrap;}
    .site-detail-charts{align-items:start;}
    .back{background:none;border:none;color:var(--accent-text);display:flex;align-items:center;gap:4px;cursor:pointer;font-family:var(--body);font-size:13px;font-weight:600;margin-bottom:14px;padding:0;}
    .site-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:18px;}
    .site-head h2{font-family:var(--display);font-size:26px;font-weight:700;margin:0;letter-spacing:-.02em;}
    .site-head p{margin:4px 0 0;color:var(--muted);font-size:13px;}
    .site-head-right{display:flex;align-items:center;gap:10px;}
    .primary{display:inline-flex;align-items:center;gap:7px;background:var(--accent-mid);color:var(--surface);border:none;padding:9px 16px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;}
    .primary:hover{background:var(--accent-text);}.primary.sm{padding:8px 13px;}
    .entry{display:flex;flex-direction:column;gap:16px;}
    .entry>.entry-bar,.entry>.pend-strip,.entry>.amort-note,.entry>.card,.entry>.grid-2{margin-bottom:0;}
    .entry .entry-bar{
      display:grid;
      grid-template-columns:minmax(280px,1.4fr) auto minmax(220px,1fr) auto;
      grid-template-areas:"primary tools live save";
      align-items:end;
      gap:12px 16px;
      padding:16px 18px;
      background:var(--surface);
      border:1px solid var(--line);
      border-radius:14px;
      margin-bottom:0;
    }
    .entry .entry-bar-primary{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px 16px;grid-area:primary;min-width:0;}
    .entry .entry-bar-primary .site-search{flex:1 1 240px;max-width:360px;min-width:200px;}
    .entry .entry-bar-primary .entry-sel-period{flex:0 1 200px;min-width:170px;}
    .entry .entry-bar-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;grid-area:tools;}
    .entry .entry-bar-tools .ghost-d{height:38px;white-space:nowrap;}
    .entry .entry-live{
      grid-area:live;
      margin-left:0;
      display:flex;
      align-items:center;
      justify-content:flex-end;
      flex-wrap:wrap;
      gap:8px 18px;
      padding:8px 12px;
      background:var(--paper);
      border:1px solid var(--line);
      border-radius:9px;
      min-height:38px;
      box-sizing:border-box;
    }
    .entry .entry-bar-save{
      grid-area:save;
      display:flex;
      flex-direction:column;
      align-items:flex-end;
      gap:4px;
      justify-self:end;
    }
    .entry .entry-bar-save-row{display:flex;align-items:center;gap:10px;flex-wrap:nowrap;}
    .entry .entry-bar-save .entry-save-btn{height:38px;min-width:132px;flex-shrink:0;}
    .entry .entry-bar-save .entry-period-st{
      font-size:11px;
      font-weight:600;
      white-space:nowrap;
      line-height:1;
      padding:7px 11px;
      border-radius:20px;
      border:1px solid var(--line);
      background:var(--paper);
      color:var(--muted);
    }
    .entry .entry-bar-save .entry-unsaved{align-self:center;}
    @media(max-width:1100px){
      .entry .entry-bar{grid-template-columns:1fr 1fr;grid-template-areas:"primary primary" "tools tools" "live live" "save save";}
      .entry .entry-bar-save{align-items:stretch;}
      .entry .entry-bar-save-row{justify-content:flex-end;}
      .entry .entry-bar-save .entry-save-btn{width:auto;}
      .entry .entry-live{justify-content:flex-start;}
    }
    .entry .entry-cols{align-items:stretch;gap:16px;}
    .entry .entry-col{min-width:0;}
    .entry .entry-col>.card{height:100%;margin-bottom:0;display:flex;flex-direction:column;}
    .entry .entry-col>.card>div:last-child{flex:1;}
    .entry .entry-totals{height:100%;box-sizing:border-box;}
    .entry .entry-totals-tbl td:last-child{text-align:right;white-space:nowrap;}
    .entry .entry-totals-tbl td:first-child{padding-right:12px;}
    .entry .fields{align-items:end;gap:10px 14px;}
    .entry .field{min-height:58px;justify-content:flex-end;}
    .entry .field>span{line-height:1.35;min-height:2.7em;display:flex;align-items:flex-end;}
    .entry .field-in{min-height:38px;box-sizing:border-box;}
    .entry .field-in input{min-height:36px;box-sizing:border-box;}
    .entry .deduction-block{width:100%;gap:10px;}
    .entry .deduction-remark>span{font-size:12px;color:var(--ink-soft);display:block;margin-bottom:4px;line-height:1.35;}
    .entry .rev-entry-simple{gap:14px;padding:2px 0;}
    .entry .rev-reimb-panel{padding:12px 14px;}
    .entry .rev-reimb-top{align-items:flex-start;margin-bottom:10px;}
    .entry .rev-reimb-title{line-height:38px;}
    .entry .rev-reimb-line{
      display:flex;
      align-items:center;
      gap:10px;
      flex-wrap:nowrap;
    }
    .entry .rev-reimb-tag{
      width:132px;
      flex-shrink:0;
      line-height:1.3;
    }
    .entry .rev-reimb-other{
      flex:1;
      min-width:120px;
      box-sizing:border-box;
      height:38px;
    }
    .entry .rev-reimb-amt{
      width:132px;
      flex-shrink:0;
      margin-left:auto;
    }
    .entry .rev-reimb-line:has(.rev-reimb-other) .rev-reimb-amt{margin-left:0;}
    .entry .rev-reimb-del{flex-shrink:0;}
    .entry .rev-reimb-actions{align-items:center;}
    .entry .rev-reimb-pick{min-width:140px;height:34px;}
    .entry .rev-reimb-save,.entry .rev-reimb-cancel{height:34px;display:inline-flex;align-items:center;}
    .entry .fgroup{margin-bottom:16px;}
    .entry .fgroup:last-child{margin-bottom:0;}
    .entry .fgroup-h{align-items:center;min-height:28px;margin-bottom:10px;}
    .entry .pend-strip{margin-bottom:0;}
    .entry .amort-note{margin-bottom:0;}
    .entry-bar{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin-bottom:18px;}
    .entry-sel{display:flex;flex-direction:column;gap:4px;min-width:200px;}
    .entry-sel label{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600;}
    .entry-sel-config-site{flex:0 1 320px;max-width:320px;min-width:200px;}
    .entry-sel-config-site select{width:100%;max-width:100%;}
    .site-search{position:relative;min-width:220px;max-width:320px;}
    .site-search-box{position:relative;}
    .site-search-box input{width:100%;font-family:var(--body);font-size:14px;font-weight:600;padding:8px 12px 8px 32px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);}
    .site-search-ico{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none;}
    .site-search-menu{position:absolute;z-index:40;left:0;right:0;top:calc(100% + 4px);max-height:240px;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.12);}
    .site-search-opt{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;padding:9px 12px;border:none;background:transparent;cursor:pointer;font-family:var(--body);}
    .site-search-opt:hover,.site-search-opt.on{background:var(--accent-soft);}
    .site-search-opt-name{font-size:13px;font-weight:600;color:var(--ink);}
    .site-search-opt-meta{font-size:11px;color:var(--muted);}
    .site-search-empty{padding:12px;font-size:12px;color:var(--muted);}
    .entry-save-btn{min-width:120px;}
    .entry-footer-save{
      display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap;
      margin-top:8px;padding:14px 4px 4px;border-top:1px solid var(--border, var(--border));
    }
    .entry-footer-save .entry-save-btn{height:38px;min-width:132px;}
    .entry-footer-save .entry-unsaved{font-size:12px;color:var(--muted);}
    .entry-unsaved{font-size:11px;color:var(--warn);font-weight:600;align-self:center;}
    .deduction-block{display:flex;flex-direction:column;gap:8px;}
    .deduction-remark input{width:100%;font-family:var(--body);font-size:13px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);}
    .entry-live{margin-left:auto;display:flex;gap:16px;font-size:12.5px;color:var(--ink-soft);font-family:var(--mono);}.entry-live b{font-weight:600;}
    .entry-cols{align-items:start;}
    .entry-col{display:flex;flex-direction:column;gap:12px;}
    .entry-totals{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:12px 14px;}
    .entry-totals-h{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px;}
    .ect-draft{font-size:10px;text-transform:none;letter-spacing:0;color:var(--warn);background:rgba(194,130,15,.12);padding:2px 7px;border-radius:20px;font-weight:600;}
    .entry-totals-tbl{width:100%;border-collapse:collapse;font-size:13px;}
    .entry-totals-tbl td{padding:5px 4px;border-bottom:1px solid var(--line);color:var(--ink-soft);vertical-align:middle;}
    .entry-totals-tbl td.ect-label{display:flex;align-items:center;gap:7px;}
    .entry-totals-tbl tr:last-child td{border-bottom:none;}
    .entry-totals-tbl tr.ect-grand td{font-weight:700;color:var(--ink);border-top:2px solid var(--line);padding-top:8px;}
    .entry-totals-tbl tr.ect-grand td:last-child{color:var(--loss);}
    .rev-totals .entry-totals-tbl tr.ect-grand td:last-child{color:var(--profit);}
    .cfg-hint{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:12.5px;flex:1;}
    .amort-note{display:flex;align-items:center;gap:9px;background:rgba(169,132,43,.1);border:1px solid rgba(169,132,43,.25);color:var(--gold);padding:11px 15px;border-radius:11px;margin-bottom:16px;font-size:13px;}.amort-note b{color:var(--ink);}
    .fgroup{margin-bottom:14px;}.fgroup-h{font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:9px;display:flex;align-items:center;gap:7px;}
    .pminihead{font-size:11.5px;font-weight:700;margin:6px 0 8px;display:flex;align-items:center;gap:7px;}
    .fields{display:grid;grid-template-columns:1fr 1fr;gap:9px 14px;}@media(max-width:560px){.fields{grid-template-columns:1fr;}}
    .field{display:flex;flex-direction:column;gap:4px;}.field>span{font-size:12px;color:var(--ink-soft);}
    .field-spread{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-family:var(--mono);color:var(--gold);font-weight:600;}
    .field-spread svg{flex-shrink:0;}
    .field-in{display:flex;align-items:center;border:1px solid var(--line);border-radius:8px;background:var(--paper);overflow:hidden;}
    .field-in:focus-within{border-color:var(--accent-mid);}.field-in i{padding:0 8px;color:var(--muted);font-style:normal;font-family:var(--mono);font-size:13px;}
    .field-in input{border:none;background:none;outline:none;padding:8px 10px 8px 0;width:100%;font-family:var(--mono);font-size:13px;text-align:right;color:var(--ink);}
    .field-reimb{grid-column:1/-1;}
    .reimb-row{display:flex;align-items:stretch;gap:10px;width:100%;}
    .reimb-sel{flex:1;min-width:0;font-family:var(--body);font-size:13px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);cursor:pointer;}
    .reimb-sel:focus{outline:none;border-color:var(--accent-mid);}
    .reimb-amt{flex:0 0 148px;}
    .rev-entry-simple{display:flex;flex-direction:column;gap:12px;padding:4px 2px 2px;}
    .rev-entry-simple>.field{margin:0;}
    .rev-reimb-panel{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--surface-raised);}
    .rev-reimb-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap;}
    .rev-reimb-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto;}
    .rev-reimb-cancel{font-size:12px;padding:5px 10px;}
    .rev-reimb-save{white-space:nowrap;}
    .rev-reimb-title{font-size:12px;font-weight:600;color:var(--ink-soft);}
    .rev-reimb-pick{font-family:var(--body);font-size:12px;padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);cursor:pointer;max-width:160px;}
    .rev-reimb-hint{margin:0;font-size:12px;color:var(--muted);}
    .rev-reimb-lines{display:flex;flex-direction:column;gap:8px;}
    .rev-reimb-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
    .rev-reimb-tag{font-size:12px;font-weight:600;color:var(--ink);min-width:88px;flex-shrink:0;}
    .rev-reimb-other{flex:1;min-width:120px;font-family:var(--body);font-size:13px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);}
    .rev-reimb-amt{flex:0 0 120px;min-width:100px;}
    .rev-reimb-del{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:7px;background:transparent;color:var(--muted);cursor:pointer;flex-shrink:0;}
    .rev-reimb-del:hover{background:var(--critical-soft);color:var(--loss);}
    .period-month-select{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
    .sl-period-sel,.sf-sel,.ov-period-sel,.m-field-sel{font-family:var(--body);font-size:14px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);font-weight:500;cursor:pointer;}
    .entry-sel-period{display:flex;flex-direction:column;gap:4px;}
    .entry-period-st{font-size:11px;color:var(--muted);font-weight:600;}
    .entry-totals-row{margin-bottom:14px;}
    /* config builder */
    .tray{display:flex;flex-wrap:wrap;gap:7px;min-height:54px;padding:10px;border:1px dashed var(--line);border-radius:11px;background:var(--paper);}
    .parents-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px;}
    @media(max-width:1080px){.parents-grid{grid-template-columns:repeat(2,1fr);}}@media(max-width:680px){.parents-grid{grid-template-columns:1fr;}}
    .pgroup{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:12px;min-height:120px;}
    .pgroup-h{display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 4px 10px;border-bottom:2px solid;margin:-2px -2px 10px;}
    .pgroup-h .pname{cursor:text;}
    .pgroup-h .pname-edit{opacity:0;transition:.12s;}
    .pgroup-h:hover .pname-edit{opacity:1;}
    .pgroup-h .pcount{margin-left:auto;}
    .pdot-btn{background:none;border:none;padding:0;cursor:pointer;display:flex;align-items:center;}
    .pmanage{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:12px 16px;margin:0 0 16px;}
    .pmanage input{flex:1;min-width:200px;font-family:var(--body);font-size:13.5px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);outline:none;}
    .pmanage input:focus{border-color:var(--accent-mid);}
    .swatches{display:flex;gap:5px;flex-wrap:wrap;}
    .swatches.inhdr{padding:0 0 10px;}
    .sw{width:18px;height:18px;border-radius:5px;border:2px solid transparent;cursor:pointer;padding:0;}
    .sw.on{border-color:var(--ink);box-shadow:0 0 0 2px var(--surface) inset;}
    .primary.sm:disabled{opacity:.4;cursor:not-allowed;}
    .pedit{flex:1;min-width:0;font-weight:700;font-size:13px;border:1px solid var(--accent-mid);border-radius:6px;padding:3px 7px;outline:none;background:var(--surface);color:var(--ink);}
    .pgroup-h b{flex:1;}
    .pchildren{display:flex;flex-direction:column;gap:6px;min-height:40px;}
    .dnd-chip{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:7px 9px;font-size:12.5px;cursor:grab;}
    .tray .dnd-chip{background:var(--surface);}
    .dnd-chip:active{cursor:grabbing;}.dnd-chip.on{border-color:rgba(31,111,78,.25);}
    .dnd-chip .grip{color:var(--muted);flex-shrink:0;}
    .dnd-chip span:not(.cat-dot){flex:1;color:var(--ink);}
    .cat-dot{width:9px;height:9px;border-radius:3px;flex-shrink:0;}
    .chip-act{background:none;border:none;cursor:pointer;color:var(--muted);padding:2px;display:flex;border-radius:6px;flex-shrink:0;}
    .chip-act:hover{color:var(--accent-text);background:var(--paper);}.chip-act.danger:hover{color:var(--loss);}
    .chip-act.save{color:var(--profit);}.chip-act.save:hover{color:var(--profit);background:rgba(16,185,129,.12);}
    .chip-edit{flex:1;min-width:60px;font-size:12.5px;border:1px solid var(--accent-mid);border-radius:6px;padding:2px 6px;outline:none;background:var(--surface);color:var(--ink);font-family:var(--body);}
    .dnd-empty{color:var(--muted);font-size:12.5px;text-align:center;padding:14px 10px;}.dnd-empty.sm{padding:8px;font-size:12px;}
    .add-head{display:flex;gap:8px;margin-top:12px;}.add-head input{flex:1;}
    .spread-form{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;}
    .sf{display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px;}.sf.sm{flex:0 0 90px;min-width:90px;}
    .sf span{font-size:11px;color:var(--ink-soft);font-weight:500;}
    .spread-list{display:flex;flex-direction:column;gap:8px;}
    .spread-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--line);border-radius:10px;color:var(--muted);}
    .spread-item.on{border-color:rgba(169,132,43,.4);background:rgba(169,132,43,.07);color:var(--ink);}
    .spread-item svg{color:var(--gold);flex-shrink:0;}
    .spread-name{font-weight:600;font-size:13px;color:var(--ink);}.spread-meta{font-size:11.5px;color:var(--muted);font-family:var(--mono);}
    .spread-item>div{flex:1;}.spread-state{font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:600;}
    .spread-active-yes{font-size:12px;font-weight:600;color:var(--profit);text-transform:lowercase;}
    .spread-active-no{font-size:12px;color:var(--muted);text-transform:lowercase;}
    .spread-row-editing td{background:rgba(31,111,78,.06);}
    .m-note.warn{color:var(--gold);}
    .warn-s{color:var(--gold);}
    .contract-row{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;}
    .contract-note{flex:1;min-width:200px;font-size:12px;color:var(--muted);}
    .est-editor{border-top:1px solid var(--line);padding-top:14px;margin-top:4px;}
    .est-bar{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px;}
    .rep-mode-nav{margin-bottom:16px;}
    /* multi-month filter */
    .ov-filter-full{flex-basis:100%;min-width:0;}
    .mmf{display:flex;flex-direction:column;gap:10px;padding-top:10px;border-top:1px dashed var(--line);}
    .mmf-row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 14px;}
    .mmf-actions{display:flex;flex-wrap:wrap;gap:6px;margin-left:auto;}
    .mmf-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink-soft);font-size:12px;font-weight:500;cursor:pointer;font-family:var(--body);white-space:nowrap;}
    .mmf-btn:hover:not(:disabled){border-color:var(--border-strong);color:var(--ink);}
    .mmf-btn:disabled{opacity:.5;cursor:not-allowed;}
    .mmf-btn.ghost{background:transparent;}
    .mmf-months{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;}
    .mmf-m{position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 2px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink-soft);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--body);}
    .mmf-m small{font-size:9.5px;font-weight:500;color:var(--muted);}
    .mmf-m.has::after{content:"";position:absolute;top:4px;right:5px;width:5px;height:5px;border-radius:50%;background:var(--profit);}
    .mmf-m:hover{border-color:var(--border-strong);color:var(--ink);}
    .mmf-m.on{background:var(--accent-soft);border-color:var(--accent-mid);color:var(--accent-text);}
    .mmf-m.on small{color:var(--accent-text);}
    .mmf-sum{font-size:12px;color:var(--ink-soft);}
    @media (max-width:900px){.mmf-months{grid-template-columns:repeat(6,minmax(0,1fr));}.mmf-actions{margin-left:0;}}
    .seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface);}
    .seg-b{height:32px;padding:0 12px;border:none;background:transparent;color:var(--ink-soft);font-size:12px;font-weight:500;cursor:pointer;font-family:var(--body);}
    .seg-b+.seg-b{border-left:1px solid var(--line);}
    .seg-b.on{background:var(--accent-soft);color:var(--accent-text);font-weight:600;}
    /* report summary + IE table */
    .rs-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px;}
    .rs-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:11px 14px;min-width:0;}
    .rs-card.warn{border-color:var(--warn);box-shadow:inset 3px 0 0 var(--warn);}
    .rs-l{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600;}
    .rs-v{font-family:var(--mono);font-size:18px;font-weight:700;color:var(--ink);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .rs-v small{font-size:12px;color:var(--muted);font-weight:500;}
    .rs-s{font-size:11.5px;color:var(--muted);margin-top:3px;display:flex;flex-wrap:wrap;gap:4px 8px;}
    .rs-var{font-family:var(--mono);font-weight:600;color:var(--ink-soft);}
    .rs-var.pos{color:var(--profit);}.rs-var.neg{color:var(--loss);}
    /* Portfolio P&L unified site × month matrix — sticky Site/Type only; opaque so scroll cols never bleed through */
    .pnl-matrix-wrap{overflow:auto;max-width:100%;max-height:min(70vh,720px);-webkit-overflow-scrolling:touch;position:relative;isolation:isolate;}
    .pnl-matrix{font-size:11.5px;border-collapse:separate !important;border-spacing:0;min-width:max-content;width:max-content;}
    .pnl-matrix th,.pnl-matrix td{padding:6px 8px;white-space:nowrap;background-clip:padding-box;}
    .pnl-matrix thead th:not(.pnl-sticky){position:static;left:auto;z-index:auto;}
    .pnl-matrix th.c{text-align:center;}
    .pnl-matrix tr.pnl-g th{border-bottom:none;padding-bottom:2px;}
    .pnl-matrix th.pnl-gh{color:var(--ink);font-weight:700;border-bottom:2px solid var(--line);background:var(--surface-raised);}
    .pnl-matrix th.pnl-sub{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:600;background:var(--surface-raised);}
    .pnl-matrix .pnl-gs{border-left:1px solid var(--line);}
    .pnl-matrix .pnl-total-h,.pnl-matrix .pnl-total-c{background:color-mix(in srgb, var(--accent-soft) 55%, var(--surface));}
    .pnl-matrix th.pnl-sticky,.pnl-matrix td.pnl-sticky{position:sticky;z-index:3;background-color:var(--surface) !important;box-sizing:border-box;}
    .pnl-matrix .pnl-sticky-site{left:0;width:11rem;min-width:11rem;max-width:11rem;overflow:hidden;text-overflow:ellipsis;}
    .pnl-matrix .pnl-sticky-type{left:11rem;width:4.75rem;min-width:4.75rem;max-width:4.75rem;z-index:3;box-shadow:2px 0 5px -2px rgba(15,23,42,.18);}
    .pnl-matrix thead th.pnl-sticky{z-index:6;background-color:var(--surface-raised) !important;vertical-align:middle;}
    .pnl-matrix thead th.pnl-sticky-type{z-index:6;}
    .pnl-matrix tbody td.pnl-sticky{z-index:3;}
    .pnl-matrix tr.vtot td{background-color:var(--surface-sunken);}
    .pnl-matrix tr.vtot td.pnl-sticky{background-color:var(--surface-sunken) !important;z-index:4;}
    .pnl-matrix tr.vtot td.pnl-total-c{background:color-mix(in srgb, var(--accent-soft) 55%, var(--surface-sunken));}
    .pnl-matrix tbody tr:hover td{background:color-mix(in srgb, var(--accent-soft) 35%, var(--surface));}
    .pnl-matrix tbody tr:hover td.pnl-sticky{background-color:color-mix(in srgb, var(--accent-soft) 35%, var(--surface)) !important;}
    .pnl-matrix tbody tr.vtot:hover td,.pnl-matrix tbody tr.vtot:hover td.pnl-sticky{background-color:var(--surface-sunken) !important;}
    .pnl-matrix tbody tr.vtot:hover td.pnl-total-c{background:color-mix(in srgb, var(--accent-soft) 55%, var(--surface-sunken)) !important;}
    .rep-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;}
    .rep-actions .link:disabled{opacity:.5;cursor:not-allowed;}
    .rep-foot{margin:8px 2px 0;font-size:11px;}
    .ov-filters{gap:12px 16px;padding:12px 14px;}
    .ov-meta{margin:0 0 12px;font-size:12.5px;color:var(--ink-soft);}
    .rep-cards{gap:10px;margin-bottom:14px;}
    .rep-card{padding:13px 14px;border-radius:12px;}
    .rc-name{font-size:14px;margin-bottom:4px;}
    .rc-desc{font-size:11.5px;line-height:1.4;}
    /* Multi-select sites */
    .site-ms{position:relative;min-width:220px;}
    .site-ms-btn{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:220px;max-width:320px;height:32px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font-size:12.5px;font-weight:500;font-family:var(--body);cursor:pointer;}
    .site-ms-btn:hover,.site-ms-btn.open{border-color:var(--border-strong);}
    .site-ms-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;}
    .site-ms-panel{position:absolute;top:calc(100% + 4px);left:0;z-index:40;width:min(360px,92vw);max-height:320px;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 28px rgba(15,23,42,.12);}
    .site-ms-tools{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line);}
    .site-ms-search{flex:1;min-width:0;height:28px;padding:0 8px;border:1px solid var(--line);border-radius:7px;background:var(--paper);font-size:12px;font-family:var(--body);color:var(--ink);}
    .site-ms-link{border:none;background:none;color:var(--accent-text);font-size:11.5px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:var(--body);padding:0;}
    .site-ms-link:hover{text-decoration:underline;}
    .site-ms-list{overflow:auto;padding:4px 0 8px;max-height:240px;}
    .site-ms-row{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;font-size:12.5px;color:var(--ink);margin:0;}
    .site-ms-row:hover{background:var(--paper);}
    .site-ms-row.on{background:color-mix(in srgb, var(--accent-soft) 55%, var(--surface));}
    .site-ms-row input{accent-color:var(--accent-text);flex-shrink:0;}
    .site-ms-all{border-bottom:1px solid var(--line);font-weight:600;}
    .site-ms-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .site-ms-name small{color:var(--muted);font-weight:500;}
    .site-ms-empty{padding:12px;font-size:12px;color:var(--muted);text-align:center;}
    .ie-wrap{overflow-x:auto;max-width:100%;}
    .tbl-ie{font-size:12px;}
    .tbl-ie th,.tbl-ie td{padding:7px 8px;white-space:nowrap;}
    .tbl-ie th.c{text-align:center;}
    .tbl-ie tr.ie-g th{border-bottom:none;padding-bottom:2px;}
    .tbl-ie th.ie-gh{color:var(--ink-soft);border-bottom:2px solid var(--line);}
    .tbl-ie .ie-gs{border-left:1px solid var(--line);}
    .tbl-ie .ie-sticky{position:sticky;left:0;background:var(--surface);z-index:1;max-width:240px;overflow:hidden;text-overflow:ellipsis;}
    .tbl-ie tr.vtot .ie-sticky{background:inherit;}
    .ie-site{background:none;border:none;padding:0;font:inherit;font-weight:600;color:var(--ink);cursor:pointer;text-align:left;}
    .ie-site:hover{color:var(--accent-text);text-decoration:underline;}
    .ie-tag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:10px;font-size:10px;font-weight:600;background:var(--surface-sunken);color:var(--muted);vertical-align:1px;}
    .ie-tag.warn{background:rgba(194,130,15,.12);color:var(--warn);}
    .tbl tbody tr.row-below td{background:rgba(220,38,38,.04);}
    .tbl tbody tr.row-below td:first-child{box-shadow:inset 3px 0 0 var(--loss);}
    .tbl tbody tr.row-empty td{color:var(--muted);}
    .rep-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-bottom:16px;}
    .rep-card{text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:15px 16px;cursor:pointer;transition:.14s;font-family:var(--body);}
    .rep-card:hover{border-color:var(--accent-mid);transform:translateY(-1px);}
    .rep-card.on{border-color:var(--accent-mid);box-shadow:0 0 0 2px rgba(220,38,38,.12);background:var(--accent-soft);}
    .rc-name{font-family:var(--display);font-weight:700;font-size:14.5px;margin-bottom:5px;color:var(--ink);}
    .rc-desc{font-size:12px;color:var(--muted);line-height:1.45;}
    .builder{display:flex;flex-direction:column;gap:14px;}
    .brow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
    .blab{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;}
    .builder select{font-family:var(--body);font-size:13px;padding:7px 11px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font-weight:500;}
    .chips{display:flex;flex-wrap:wrap;gap:6px;}
    .mch{background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:5px 12px;font-size:12px;cursor:pointer;color:var(--ink-soft);font-family:var(--body);}
    .mch:hover{border-color:var(--border-strong);color:var(--ink);}
    .mch.on{background:var(--accent-soft);border-color:var(--accent-mid);color:var(--accent-text);font-weight:600;}
    .rep-builder-filters{margin-bottom:0;background:transparent;border:none;padding:0;}
    .ov-filter.range select{min-width:100px;}
    .row-pending td{background:rgba(194,130,15,.06)!important;box-shadow:inset 3px 0 0 var(--warn);}
    .pill-pending{background:rgba(194,130,15,.16);color:var(--warn);}
    .pend-inline{display:inline-flex;align-items:center;gap:5px;color:var(--warn);font-weight:500;}
    .icon-btn.accent{border-color:var(--warn);color:var(--warn);}
    .pend-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;}
    .pend-item{display:flex;align-items:center;gap:9px;text-align:left;background:rgba(194,130,15,.07);border:1px solid rgba(194,130,15,.25);border-radius:10px;padding:9px 12px;cursor:pointer;font-family:var(--body);transition:.12s;}
    .pend-item:hover{background:rgba(194,130,15,.13);}
    .pend-dot{width:8px;height:8px;border-radius:50%;background:var(--warn);flex-shrink:0;}
    .pend-name{flex:1;font-size:13px;font-weight:600;color:var(--ink);}
    .pend-badge{font-size:10.5px;font-family:var(--mono);color:var(--warn);background:rgba(194,130,15,.15);padding:1px 7px;border-radius:20px;}
    .pend-cta{font-size:12px;color:var(--accent-text);font-weight:600;}
    .pend-strip{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:rgba(194,130,15,.08);border:1px solid rgba(194,130,15,.25);border-radius:11px;padding:10px 14px;margin-bottom:16px;}
    .pend-strip-lbl{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--warn);}
    .pend-chip{background:var(--surface);border:1px solid rgba(194,130,15,.4);color:var(--warn);border-radius:7px;padding:4px 11px;font-size:12px;font-family:var(--mono);cursor:pointer;}
    .pend-chip:hover,.pend-chip.on{background:var(--warn);color:var(--surface);}
    .empty{text-align:center;padding:60px 20px;color:var(--muted);}
    .empty svg{color:var(--line);margin-bottom:14px;}.empty h3{font-family:var(--display);color:var(--ink);margin:0 0 6px;font-size:18px;}.empty p{margin:0;font-size:13.5px;}
    .overlay{position:fixed;inset:0;background:rgba(20,30,25,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px;}
    .modal{background:var(--surface);border-radius:16px;width:440px;max-width:100%;max-height:88vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.3);}.modal.wide{width:560px;}
    .modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 12px;border-bottom:1px solid var(--line);}
    .modal-head h3{font-family:var(--display);font-size:18px;margin:0;font-weight:700;}
    .modal-body{padding:18px 20px 20px;}
    .m-field{display:flex;flex-direction:column;gap:5px;margin-bottom:13px;}.m-field span{font-size:12px;color:var(--ink-soft);font-weight:500;}
    .m-field input{border:1px solid var(--line);border-radius:9px;padding:10px 12px;font-family:var(--body);font-size:14px;outline:none;background:var(--paper);color:var(--ink);}.m-field input:focus{border-color:var(--green);}
    .m-actions{display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:8px;flex-wrap:wrap;}
    .m-actions-right{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-left:auto;}
    .m-actions-left{margin-right:auto;}
    .danger-text{color:var(--loss) !important;border-color:var(--critical-border) !important;}
    .danger-text:hover{background:var(--critical-soft) !important;}
    .sf .erp-date-input,.m-field .erp-date-input{width:100%;}
    .sf .erp-date-input.sf-sel,.m-field .erp-date-input{border:1px solid var(--line);border-radius:9px;background:var(--paper);color:var(--ink);}
    .m-note{font-size:12.5px;color:var(--muted);margin:0 0 12px;line-height:1.5;}
    .m-divider{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;margin:18px 0 10px;border-top:1px solid var(--line);padding-top:14px;}
    .m-text{width:100%;height:120px;border:1px solid var(--line);border-radius:9px;padding:10px 12px;font-family:var(--mono);font-size:12px;resize:vertical;outline:none;background:var(--paper);color:var(--ink);}.m-text:focus{border-color:var(--green);}
    /* Sites Master (All Sites) */
    .sm-page{display:flex;flex-direction:column;gap:16px;}
    .sm-crumb{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);}
    .sm-crumb-on{color:var(--ink);font-weight:600;}
    .sm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;}
    .sm-title{font-family:var(--display);font-size:24px;font-weight:700;margin:0;letter-spacing:-.02em;color:var(--ink);}
    .sm-sub{margin:4px 0 0;font-size:13px;color:var(--muted);}
    .sm-head-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
    .sm-btn-outline{padding:8px 14px;font-size:13px;}
    .sm-btn-add{padding:8px 16px;font-size:13px;background:var(--info);border-radius:8px;}
    .sm-btn-add:hover{background:var(--info);}
    .sm-kpi-row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;}
    @media(max-width:1200px){.sm-kpi-row{grid-template-columns:repeat(3,minmax(0,1fr));}}
    @media(max-width:640px){.sm-kpi-row{grid-template-columns:repeat(2,minmax(0,1fr));}}
    .sm-kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;}
    .sm-kpi-alert{border-color:var(--critical-border);background:var(--critical-soft);}
    .sm-kpi-top{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-soft);font-weight:500;margin-bottom:8px;}
    .sm-kpi-val{font-family:var(--display);font-size:28px;font-weight:700;line-height:1;color:var(--ink);}
    .sm-kpi-loss{color:var(--loss);}
    .sm-kpi-sub{margin-top:6px;font-size:11.5px;color:var(--muted);}
    .sm-ico-profit{color:var(--profit);}.sm-ico-loss{color:var(--loss);}.sm-ico-warn{color:var(--warn);}.sm-ico-muted{color:var(--muted);}
    .sm-filters{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 14px;padding:14px 16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;}
    .sm-filter{display:flex;flex-direction:column;gap:4px;min-width:0;}
    .sm-filter>span{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600;}
    .sm-filter select{font-family:var(--body);font-size:13px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);min-width:130px;}
    .sm-filter-search{flex:1;min-width:180px;max-width:260px;}
    .sm-search{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:8px;padding:7px 10px;background:var(--paper);color:var(--muted);}
    .sm-search input{border:none;background:none;outline:none;font-size:13px;width:100%;color:var(--ink);}
    .sm-clear{align-self:flex-end;font-size:12px;padding:8px 12px;}
    .sm-hist{align-self:flex-end;margin-left:auto;}
    .sl-action-notice{display:flex;align-items:center;gap:8px;margin:12px 24px 0;padding:12px 14px;border-radius:8px;background:var(--success-soft);border:1px solid var(--success-border);color:var(--success);font-size:13px;line-height:1.5;}
    .sl-action-notice-close{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--success);cursor:pointer;padding:2px;border-radius:4px;}
    .sl-action-notice-close:hover{background:var(--success-soft);}
    .sm-tbl thead th{background:var(--surface-raised);}
    .sm-site-link{background:none;border:none;padding:0;font:inherit;font-weight:600;color:var(--ink);cursor:pointer;text-align:left;display:block;}
    .sm-site-link:hover{color:var(--info-text);}
    .sm-ver{display:inline-block;margin-top:4px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px;background:var(--info-soft);border:1px solid var(--info-border);color:var(--info);font-family:var(--mono);}
    .sm-pend{display:inline-block;font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;line-height:1.35;max-width:220px;}
    .sm-pend-ok{background:rgba(22,119,78,.12);color:var(--profit);}
    .sm-pend-low{background:rgba(160,128,70,.15);color:var(--gold);}
    .sm-pend-med{background:var(--warning-soft);color:var(--warning);}
    .sm-pend-high{background:rgba(178,63,42,.13);color:var(--loss);}
    .sm-actions{display:flex;align-items:center;justify-content:flex-end;gap:2px;}
    .sm-act{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;border-radius:8px;background:transparent;color:var(--ink-soft);cursor:pointer;}
    .sm-act:hover{background:var(--surface-sunken);color:var(--ink);}
    .sm-act-activate{color:var(--green);}
    .sm-act-activate:hover{background:var(--success-soft);color:var(--green);}
    .sm-act-activate-text{color:var(--green) !important;border-color:var(--success-border) !important;}
    .sm-act-activate-text:hover{background:var(--success-soft) !important;}
    .sm-act-danger{color:var(--loss);}
    .sm-act-danger:hover{background:var(--critical-soft);color:var(--loss);}
    .sm-more-wrap{position:relative;display:inline-flex;}
    .sm-more-menu{position:absolute;right:0;top:100%;z-index:20;min-width:160px;margin-top:4px;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.1);padding:4px;}
    .sm-more-menu button{display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;font-size:13px;color:var(--ink);cursor:pointer;border-radius:6px;}
    .sm-more-menu button:hover{background:var(--surface-sunken);}
    .sm-more-menu button.danger{color:var(--loss);}
    .sm-empty{text-align:center;padding:32px;color:var(--muted);}
    .sm-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--line);background:var(--surface-raised);font-size:12.5px;color:var(--muted);}
    .sm-foot-right{display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
    .sm-rpp{display:flex;align-items:center;gap:8px;font-size:12px;}
    .sm-rpp select{padding:4px 8px;border:1px solid var(--line);border-radius:6px;font-size:12px;background:var(--surface);}
    .sm-pager{display:flex;align-items:center;gap:8px;}
    .sm-pager button{padding:5px 10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);font-size:12px;cursor:pointer;color:var(--ink-soft);}
    .sm-pager button:disabled{opacity:.45;cursor:not-allowed;}
    .sm-pager button:not(:disabled):hover{border-color:var(--border-strong);color:var(--ink);}
    .sm-legend-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:14px;}
    @media(max-width:900px){.sm-legend-grid{grid-template-columns:1fr;}}
    .sm-legend-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;}
    .sm-legend-card h4{margin:0 0 10px;font-size:13px;font-weight:700;color:var(--ink);}
    .sm-legend-card ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--ink-soft);}
    .sm-legend-card li{display:flex;align-items:center;gap:10px;}
    .sm-about p{margin:0;font-size:12.5px;line-height:1.55;color:var(--ink-soft);}
    `}</style>
  );
}
