/**
 * Site Setup page — read-only by default, "Edit structure" unlocks mutations.
 * Extracted from SiteLedgerApp (behaviour unchanged except dependency warnings before removal).
 */
import React, { useState, useEffect, useRef } from "react";
import { Building2, PlusCircle, GripVertical, Check, Pencil, X, Plus, Eye, Trash2 } from "lucide-react";
import {
  REVENUE_ITEMS,
  PARENTS,
  PARENT_PALETTE,
  parentColor,
  parentLabel,
} from "../domain/constants.js";
import {
  displayStructure,
  compactStructure,
  siteChildKeys,
  mergeSiteLibrary,
} from "../domain/siteStructure.js";
import {
  isSiteActive,
  versionLabel,
  sitesInGroup,
  contractBudgetFor,
  remainingMonths,
} from "../domain/siteLifecycle.js";
import { inr, pct, slug } from "../domain/formatMoney.js";
import { FinanceDateInput } from "../../components/FinanceDateInput";
import { formatFinanceDate } from "../../lib/formatters";
import {
  periodAbsoluteIndex as monthIdx,
  currentPeriodKey,
  dateToPeriodKey,
  periodKeyToDateStart,
} from "../../lib/periods";
import { Card, monthLabelOf, contractDateInputValue, estTotals } from "./pageShared.jsx";
import { SetupDependencyPanel } from "../components/SetupDependencyPanel.jsx";
import { SetupConflictPanel } from "../components/ConflictResolutionPanel.jsx";
import { analyzeChildRemoval } from "../validation/setupDependencies.js";

/* ───────────────────────── SITE CONFIG (parent → child builder) ───────────────────────── */
const AVAILABLE_PREVIEW_COUNT = 8;

export function SiteSetupPage({ sites, sitesAll, library, parents, activeSite, setActiveSite, records, month, onPatchSite, onApplySetupChange, onRemoveHead, onRenameHead, onAdd, onRenameParent, onSetParentColor, onSaveSetup, onDiscardSetup, setupDirty, saveState, onViewBudget, onSaveBudget, setupConflict = null, onReloadSetupBaseline, onKeepSetupDraft, getUnsavedFigurePeriods = null }) {
  const [siteId, setSiteId] = useState(activeSite || sites[0]?.id || "");
  useEffect(() => { if (activeSite) setSiteId(activeSite); }, [activeSite]);
  const sitePool = sitesAll || sites;
  const site = sitePool.find((s) => s.id === siteId) || sites.find((s) => s.id === siteId);
  /** Read-only by default; explicit Edit Structure unlocks mutations (Phase 4 Site Setup). */
  const [structureEditMode, setStructureEditMode] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newParent, setNewParent] = useState(PARENTS[0].key);
  const [editing, setEditing] = useState(null); // parent key being renamed
  const [editVal, setEditVal] = useState("");
  const [editingChild, setEditingChild] = useState(null); // child key being renamed
  const [editChildVal, setEditChildVal] = useState("");
  const [colorEdit, setColorEdit] = useState(null); // parent key whose colour swatches are open
  const [newPName, setNewPName] = useState("");
  const [newPColor, setNewPColor] = useState(PARENT_PALETTE[6]);
  const [showAllAvailable, setShowAllAvailable] = useState(false);
  /** Pending removal awaiting the user's decision: { kind: "child"|"exclude", key, analysis } */
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const drag = useRef(null);
  const childSaveTickRef = useRef(false);
  if (!sites.length) return <div className="empty"><Building2 size={30} /><h3>No sites yet</h3><p>Add a site to configure its parent &amp; child cost heads.</p><button className="primary" onClick={onAdd} style={{ marginTop: 12 }}><PlusCircle size={15} /> Add Site</button></div>;
  if (!site) return null;

  const siteLib = mergeSiteLibrary(site, library);
  const structure = displayStructure(site);
  const used = new Set(siteChildKeys(site));
  const available = siteLib.filter((h) => !used.has(h.key));
  const libMap = Object.fromEntries(siteLib.map((h) => [h.key, h]));

  const moveChild = (childKey, fromParent, toParent, beforeKey) => {
    if (!structureEditMode) return;
    onApplySetupChange(({ sites: allSites }) => {
      const target = allSites.find((s) => s.id === siteId);
      if (!target) return {};
      let nextStructure = displayStructure(target).map((g) => ({ parent: g.parent, children: [...g.children] }));
      nextStructure.forEach((g) => { g.children = g.children.filter((k) => k !== childKey); });
      const tg = nextStructure.find((g) => g.parent === toParent);
      if (!tg) return {};
      if (beforeKey) { const i = tg.children.indexOf(beforeKey); tg.children.splice(i < 0 ? tg.children.length : i, 0, childKey); }
      else tg.children.push(childKey);
      return {
        sites: allSites.map((s) => (s.id === siteId ? { ...s, structure: compactStructure(nextStructure) } : s)),
      };
    });
  };

  const performRemoveChild = (childKey) => {
    if (!structureEditMode) return;
    onApplySetupChange(({ sites: allSites }) => {
      const target = allSites.find((s) => s.id === siteId);
      if (!target) return {};
      const s = displayStructure(target).map((g) => ({ parent: g.parent, children: g.children.filter((k) => k !== childKey) }));
      const stripEst = (est) => {
        if (!est.expenses?.[childKey]) return est;
        const { [childKey]: _removed, ...expenses } = est.expenses;
        return { ...est, expenses };
      };
      const nextSite = {
        ...target,
        structure: compactStructure(s),
        spreads: (target.spreads || []).filter((sp) => sp.head !== childKey),
        estimates: (target.estimates || []).map(stripEst),
      };
      return { sites: allSites.map((s) => (s.id === siteId ? nextSite : s)) };
    });
  };

  const performExcludeHead = (key) => {
    if (!structureEditMode) return;
    const isSiteCustom = (site.customHeads || []).some((x) => x.key === key) || key.startsWith(`${siteId}_`);
    onApplySetupChange(({ sites: allSites }) => {
      const target = allSites.find((s) => s.id === siteId);
      if (!target) return {};
      const stripEst = (est) => {
        if (!est.expenses?.[key]) return est;
        const { [key]: _removed, ...expenses } = est.expenses;
        return { ...est, expenses };
      };
      const nextStructure = displayStructure(target).map((g) => ({
        parent: g.parent,
        children: g.children.filter((k) => k !== key),
      }));
      const nextExcluded = [...new Set([...(target.excludedHeadKeys || []), key])];
      const nextSite = {
        ...target,
        excludedHeadKeys: nextExcluded,
        structure: compactStructure(nextStructure),
        spreads: (target.spreads || []).filter((sp) => sp.head !== key),
        estimates: (target.estimates || []).map(stripEst),
        customHeads: isSiteCustom
          ? (target.customHeads || []).filter((x) => x.key !== key)
          : (target.customHeads || []),
      };
      return { sites: allSites.map((s) => (s.id === siteId ? nextSite : s)) };
    });
    setEditingChild(null);
    setEditChildVal("");
  };

  /**
   * Every remove path runs the dependency check first. Lines nothing else uses are removed
   * straight away; otherwise the user sees what is affected and decides (nothing historical is deleted).
   */
  const requestRemoval = (kind, key) => {
    if (!structureEditMode) return;
    const analysis = analyzeChildRemoval({
      site,
      siteId,
      childKey: key,
      records: records || {},
      currentPeriodKey: month || null,
      unsavedFigurePeriods: getUnsavedFigurePeriods ? getUnsavedFigurePeriods(siteId, key) : [],
      periodLabel: monthLabelOf,
    });
    if (analysis.safe) {
      if (kind === "exclude") performExcludeHead(key);
      else performRemoveChild(key);
      return;
    }
    setPendingRemoval({ kind, key, analysis });
  };
  const removeChild = (childKey) => requestRemoval("child", childKey);
  const excludeHeadFromSite = (key) => requestRemoval("exclude", key);
  const confirmPendingRemoval = () => {
    const p = pendingRemoval;
    setPendingRemoval(null);
    if (!p || p.analysis.hardBlock) return;
    if (p.kind === "exclude") performExcludeHead(p.key);
    else performRemoveChild(p.key);
  };

  const onDragStart = (childKey, fromParent) => { drag.current = { childKey, fromParent }; };
  const onDragEnd = () => { drag.current = null; };
  const onDropInParent = (e, toParent, beforeKey = null) => {
    e.preventDefault();
    e.stopPropagation();
    const d = drag.current;
    if (!d) return;
    moveChild(d.childKey, d.fromParent, toParent, beforeKey);
    drag.current = null;
  };

  const commitChildRename = (key, rawLabel) => {
    const newLabel = (rawLabel != null ? String(rawLabel).trim() : (editChildVal || "").trim()) || libMap[key]?.label || key;
    if (!newLabel) return;
    const isSiteCustom = (site.customHeads || []).some((x) => x.key === key) || key.startsWith(`${siteId}_`);
    onApplySetupChange(({ sites: allSites, library: lib }) => {
      const nextLibrary = lib.some((h) => h.key === key)
        ? lib.map((h) => (h.key === key ? { ...h, label: newLabel } : h))
        : [...lib, { key, label: newLabel, parent: libMap[key]?.parent || "adminMisc", custom: isSiteCustom, siteScoped: isSiteCustom }];
      return {
        library: nextLibrary,
        sites: isSiteCustom
          ? allSites.map((s) => (s.id === siteId ? {
            ...s,
            customHeads: (s.customHeads || []).some((x) => x.key === key)
              ? (s.customHeads || []).map((h) => (h.key === key ? { ...h, label: newLabel } : h))
              : [...(s.customHeads || []), { key, label: newLabel, parent: libMap[key]?.parent || "adminMisc", custom: true, siteScoped: true }],
          } : s))
          : allSites,
      };
    });
    setEditingChild(null);
    setEditChildVal("");
  };

  const cancelChildHeadEdit = () => {
    setEditingChild(null);
    setEditChildVal("");
  };

  const saveChildHeadEdit = (key) => {
    childSaveTickRef.current = true;
    commitChildRename(key, editChildVal);
  };

  const renderChildHeadEditor = (key, { cancelRemovesFromSite = false } = {}) => (
    <>
      <input
        className="chip-edit"
        autoFocus
        value={editChildVal}
        onChange={(e) => setEditChildVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") saveChildHeadEdit(key);
          if (e.key === "Escape") {
            if (cancelRemovesFromSite) excludeHeadFromSite(key);
            else cancelChildHeadEdit();
          }
        }}
        onBlur={() => {
          setTimeout(() => {
            if (childSaveTickRef.current) {
              childSaveTickRef.current = false;
              return;
            }
            if (editingChild === key) {
              const trimmed = (editChildVal || "").trim();
              if (trimmed) saveChildHeadEdit(key);
              else if (cancelRemovesFromSite) excludeHeadFromSite(key);
              else cancelChildHeadEdit();
            }
          }, 200);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        className="chip-act save"
        title="Save cost line name"
        aria-label="Save cost line name"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => saveChildHeadEdit(key)}
      >
        <Check size={12} />
      </button>
      {cancelRemovesFromSite ? (
        <button
          type="button"
          className="chip-act danger"
          title="Remove from this site"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => excludeHeadFromSite(key)}
        >
          Cancel
        </button>
      ) : null}
    </>
  );

  const addCustom = () => {
    if (!newLabel.trim()) return;
    let key = `${siteId}_${slug(newLabel)}`;
    let n = 1;
    while (siteLib.some((h) => h.key === key)) key = `${siteId}_${slug(newLabel)}-${++n}`;
    const head = { key, label: newLabel.trim(), parent: newParent, custom: true, siteScoped: true };
    onApplySetupChange(({ sites: allSites, library: lib }) => {
      const target = allSites.find((s) => s.id === siteId);
      if (!target) return {};
      const nextStructure = displayStructure(target).map((g) => (
        g.parent === newParent ? { parent: g.parent, children: [...g.children, key] } : g
      ));
      const nextLibrary = lib.some((h) => h.key === key) ? lib : [...lib, head];
      return {
        library: nextLibrary,
        sites: allSites.map((s) => (s.id === siteId ? {
          ...s,
          customHeads: [...(s.customHeads || []), head],
          structure: compactStructure(nextStructure),
        } : s)),
      };
    });
    setNewLabel("");
  };

  return (
    <>
      <div className="entry-bar">
        <div className="entry-sel entry-sel-config-site">
          <label htmlFor="config-site-select">Select site</label>
          <select
            id="config-site-select"
            value={siteId}
            onChange={(e) => {
              const id = e.target.value;
              setSiteId(id);
              setActiveSite(id);
            }}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.wo ? ` · ${s.wo}` : ""}</option>
            ))}
          </select>
        </div>
        <div className="cfg-hint">
          {structureEditMode ? (
            <>
              <GripVertical size={14} /> Editing <b>{site.name}</b> — drag to reorder, add or remove components, then Save.
            </>
          ) : (
            <>
              Viewing <b>{site.name}</b> (read-only). Click <b>Edit structure</b> to make changes.
            </>
          )}
        </div>
        <div className="cfg-savebar" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {setupDirty && saveState !== "saving" && (
            <span className="save dirty" role="status">Unsaved changes</span>
          )}
          {saveState === "saving" && <span className="save saving">Saving…</span>}
          {!setupDirty && saveState === "saved" && <span className="save saved">✓ Saved</span>}
          {!structureEditMode ? (
            <button
              type="button"
              className="primary sl-btn"
              onClick={() => setStructureEditMode(true)}
            >
              Edit structure
            </button>
          ) : (
            <>
              {!setupDirty && (
                <button
                  type="button"
                  className="ghost sl-btn"
                  disabled={saveState === "saving"}
                  onClick={() => setStructureEditMode(false)}
                >
                  Done
                </button>
              )}
              <button
                type="button"
                className="ghost sl-btn"
                disabled={!setupDirty || saveState === "saving"}
                onClick={() => { void onDiscardSetup?.(); }}
              >
                Discard
              </button>
              <button
                type="button"
                className="primary sl-btn"
                disabled={!setupDirty || saveState === "saving"}
                onClick={() => { void onSaveSetup?.(); }}
              >
                <Check size={14} /> Save changes
              </button>
            </>
          )}
        </div>
      </div>
      {setupConflict && (
        <SetupConflictPanel
          message={setupConflict.message}
          busy={saveState === "saving"}
          onKeepDraft={onKeepSetupDraft}
          onReloadBaseline={onReloadSetupBaseline}
        />
      )}
      {pendingRemoval && (
        <div className="overlay" onClick={() => setPendingRemoval(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()} style={{ padding: 0 }}>
            <SetupDependencyPanel
              analysis={pendingRemoval.analysis}
              headLabel={libMap[pendingRemoval.key]?.label || pendingRemoval.key}
              siteName={site.name}
              periodLabel={monthLabelOf}
              onCancel={() => setPendingRemoval(null)}
              onKeepAssigned={() => setPendingRemoval(null)}
              onRemove={confirmPendingRemoval}
            />
          </div>
        </div>
      )}
      {site.structureMissing && (
        <div className="cfg-hint" role="alert" style={{ color: "var(--warn)", margin: "0 0 12px" }}>
          No components are saved for <b>{site.name}</b> in the database. Add the components this site should have and click Save changes.
        </div>
      )}

      <Card
        title="Available cost lines"
        right={(
          <span className="muted-s">
            {available.length} unused
            {structureEditMode ? " · drag into a parent below" : " · view only"}
          </span>
        )}
      >
        <div className="tray">
          {available.length === 0 && (
            <div className="dnd-empty">
              {structureEditMode
                ? "Every cost line is assigned. Use the × on a line below to remove it from this site."
                : "Every cost line is assigned."}
            </div>
          )}
          {(showAllAvailable ? available : available.slice(0, AVAILABLE_PREVIEW_COUNT)).map((h) => (
            <div
              key={h.key}
              className="dnd-chip"
              draggable={structureEditMode}
              onDragStart={structureEditMode ? () => onDragStart(h.key, "__available__") : undefined}
              onDragEnd={structureEditMode ? onDragEnd : undefined}
            >
              {structureEditMode && <GripVertical size={13} className="grip" />}
              <span className="cat-dot" style={{ background: parentColor(h.parent) }} title={parentLabel(h.parent)} />
              {structureEditMode && editingChild === h.key ? (
                renderChildHeadEditor(h.key, { cancelRemovesFromSite: true })
              ) : (
                <>
                  <span>{h.label}</span>
                  {structureEditMode && (
                    <>
                      <button type="button" className="chip-act" title="Rename cost line" onMouseDown={(e) => e.stopPropagation()} onClick={() => { setEditingChild(h.key); setEditChildVal(h.label); }}><Pencil size={11} /></button>
                      <button type="button" className="chip-act danger" title="Remove from this site" onMouseDown={(e) => e.stopPropagation()} onClick={() => excludeHeadFromSite(h.key)}>Cancel</button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        {available.length > AVAILABLE_PREVIEW_COUNT && (
          <button
            type="button"
            className="link"
            style={{ marginTop: 8, fontSize: 12.5 }}
            onClick={() => setShowAllAvailable((v) => !v)}
          >
            {showAllAvailable
              ? "Show less"
              : `Load more (${available.length - AVAILABLE_PREVIEW_COUNT} more)`}
          </button>
        )}
        {structureEditMode && (
          <div className="add-head">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New custom cost line (e.g. Night Shift Allowance)" onKeyDown={(e) => e.key === "Enter" && addCustom()} />
            <select value={newParent} onChange={(e) => setNewParent(e.target.value)}>{PARENTS.map((p) => <option key={p.key} value={p.key}>{parentLabel(p.key)}</option>)}</select>
            <button className="primary sm" onClick={addCustom}><Plus size={14} /> Add</button>
          </div>
        )}
      </Card>

      <div className="pmanage pmanage-locked">
        <span className="blab">Parent heads</span>
        <span className="muted-s">Standardized across P&amp;L — six reportable groups</span>
      </div>

      <div className="parents-grid">
        {structure.map((g) => (
          <div
            key={g.parent}
            className="pgroup"
            onDragOver={structureEditMode ? (e) => e.preventDefault() : undefined}
            onDrop={structureEditMode ? (e) => onDropInParent(e, g.parent) : undefined}
          >
            <div className="pgroup-h" style={{ borderColor: parentColor(g.parent) }}>
              {structureEditMode ? (
                <button className="pdot-btn" title="Change colour" onClick={() => setColorEdit(colorEdit === g.parent ? null : g.parent)}><span className="pdot" style={{ background: parentColor(g.parent) }} /></button>
              ) : (
                <span className="pdot" style={{ background: parentColor(g.parent) }} />
              )}
              {structureEditMode && editing === g.parent ? (
                <input className="pedit" autoFocus value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={() => { onRenameParent(g.parent, editVal); setEditing(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { onRenameParent(g.parent, editVal); setEditing(null); } if (e.key === "Escape") setEditing(null); }} />
              ) : (
                <>
                  <b className="pname" title="Standard parent head">{parentLabel(g.parent)}</b>
                  {g.children.length === 0 && <span className="muted-s sm">No lines assigned</span>}
                </>
              )}
              <span className="pcount">{g.children.length}</span>
            </div>
            {structureEditMode && colorEdit === g.parent && <div className="swatches inhdr">{PARENT_PALETTE.map((c) => <button key={c} className={"sw" + (parentColor(g.parent) === c ? " on" : "")} style={{ background: c }} onClick={() => { onSetParentColor(g.parent, c); setColorEdit(null); }} />)}</div>}
            <div
              className="pchildren"
              onDragOver={structureEditMode ? (e) => e.preventDefault() : undefined}
              onDrop={structureEditMode ? (e) => onDropInParent(e, g.parent) : undefined}
            >
              {g.children.length === 0 && (
                <div className="dnd-empty sm">
                  {structureEditMode ? "Drag cost lines here" : "No cost lines assigned"}
                </div>
              )}
              {g.children.map((k) => (
                <div
                  key={k}
                  className="dnd-chip on"
                  draggable={structureEditMode}
                  onDragStart={structureEditMode ? () => onDragStart(k, g.parent) : undefined}
                  onDragEnd={structureEditMode ? onDragEnd : undefined}
                  onDragOver={structureEditMode ? (e) => e.preventDefault() : undefined}
                  onDrop={structureEditMode ? (e) => onDropInParent(e, g.parent, k) : undefined}
                >
                  {structureEditMode && <GripVertical size={13} className="grip" />}
                  {structureEditMode && editingChild === k ? (
                    renderChildHeadEditor(k)
                  ) : (
                    <>
                      <span>{libMap[k]?.label || k}</span>
                      {structureEditMode && (
                        <>
                          <button type="button" className="chip-act" title="Rename cost line" onMouseDown={(e) => e.stopPropagation()} onClick={() => { setEditingChild(k); setEditChildVal(libMap[k]?.label || k); }}><Pencil size={11} /></button>
                          <button type="button" className="chip-act danger" title="Remove from site" onMouseDown={(e) => e.stopPropagation()} onClick={() => removeChild(k)}><X size={14} /></button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {(() => {
        const group = site.siteGroup || site.id;
        const versions = sitesInGroup(sitePool, group);
        if (versions.length <= 1) return null;
        return (
          <div className="contract-timeline-row" style={{ marginBottom: 12 }}>
            <label className="sf" style={{ flex: 1, minWidth: 280 }}>
              <span>Contract timeline</span>
              <select
                className="sf-sel"
                value={siteId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSiteId(id);
                  setActiveSite(id);
                }}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {versionLabel(v)}
                    {v.contractStart && v.contractEnd ? ` · ${monthLabelOf(v.contractStart)}–${monthLabelOf(v.contractEnd)}` : ""}
                    {!isSiteActive(v) ? " (Historical)" : " (Active)"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        );
      })()}

      <ContractBudgetEditor site={site} library={library} onPatchSite={onPatchSite} onViewBudget={onViewBudget} onSaveBudget={onSaveBudget} />
    </>
  );
}

export function ContractBudgetEditor({ site, library, onPatchSite, onViewBudget, onSaveBudget }) {
  const libMap = Object.fromEntries(library.map((h) => [h.key, h]));
  const structure = displayStructure(site).filter((g) => g.children.length);
  const budget = contractBudgetFor(site);
  const estimates = budget ? [budget] : [];
  const isHistorical = !isSiteActive(site);
  const canEditBudget = isSiteActive(site);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [note, setNote] = useState("");
  const [rev, setRev] = useState({});
  const [exp, setExp] = useState({});
  const startEdit = (base = budget) => {
    if (!canEditBudget) return;
    setSaveError("");
    setEditing(true);
    setNote(base?.note || `Contract budget · ${versionLabel(site)}`);
    setRev(base?.revenue ? { ...base.revenue } : {});
    setExp(base?.expenses ? { ...base.expenses } : {});
  };
  const saveEst = async () => {
    if (!canEditBudget || saving) return;
    const clean = (o) => {
      const r = {};
      Object.entries(o).forEach(([k, v]) => {
        const n = Number(String(v ?? "").replace(/,/g, "").trim());
        if (Number.isFinite(n) && n !== 0) r[k] = n;
      });
      return r;
    };
    const effectiveFrom = budget?.effectiveFrom || site.contractStart || currentPeriodKey();
    const ver = {
      id: budget?.id || ("est" + Date.now()),
      effectiveFrom,
      note: note.trim() || `Contract budget · ${versionLabel(site)}`,
      revenue: clean(rev),
      expenses: clean(exp),
    };
    setSaving(true);
    setSaveError("");
    try {
      let ok = false;
      if (onSaveBudget) {
        ok = await onSaveBudget(site.id, [ver]);
      } else {
        onPatchSite(site.id, { estimates: [ver] });
        ok = true;
      }
      if (ok) setEditing(false);
      else setSaveError("Could not save estimated budget. Please try again.");
    } catch (e) {
      setSaveError(e?.message || "Could not save estimated budget.");
    } finally {
      setSaving(false);
    }
  };
  const setContract = (patch) => onPatchSite(site.id, patch);

  return (
    <Card title="Contract & Estimate (Budget)" right={<span className="muted-s">one estimate per contract · compared to monthly actuals</span>}>
      <div className="contract-row">
        <label className="sf"><span>Estimated contract start</span><FinanceDateInput className="sf-sel" value={contractDateInputValue(site.estContractStart)} onChange={(v) => setContract({ estContractStart: v || null })} disabled={isHistorical} /></label>
        <label className="sf"><span>Estimated contract end</span><FinanceDateInput className="sf-sel" value={contractDateInputValue(site.estContractEnd)} onChange={(v) => setContract({ estContractEnd: v || null })} disabled={isHistorical} /></label>
        <div className="contract-note">Used for variance comparison and to spread mid-contract costs across remaining months.</div>
      </div>
      {isHistorical && (
        <p className="m-note warn" style={{ marginTop: 8 }}>Historical contract — estimated budget is read-only. Create a new contract version to set a new budget.</p>
      )}
      {budget && (
        <table className="tbl" style={{ margin: "6px 0 14px" }}>
          <thead><tr><th>Contract budget</th><th>Effective from</th><th>Contract period</th><th className="r">Est. Revenue</th><th className="r">Est. Expense</th><th className="r">Est. Profit</th><th className="r">Margin</th></tr></thead>
          <tbody>{estimates.map((e) => { const t = estTotals(e); return (<tr key={e.id}><td className="strong">{e.note || "Estimate"}</td><td className="mono">{monthLabelOf(e.effectiveFrom)}</td><td className="mono muted-s">{site.contractStart && site.contractEnd ? `${monthLabelOf(site.contractStart)}–${monthLabelOf(site.contractEnd)}` : "—"}</td><td className="r mono">{inr(t.revenue)}</td><td className="r mono">{inr(t.expense)}</td><td className="r mono" style={{ color: t.profit >= 0 ? "var(--profit)" : "var(--loss)" }}>{inr(t.profit)}</td><td className="r mono">{pct(t.margin)}</td></tr>); })}</tbody>
        </table>
      )}
      {!editing ? (
        <div className="m-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 8 }}>
          {canEditBudget && !budget ? (
            <button type="button" className="primary sm" onClick={() => startEdit()}><Plus size={14} /> Set estimate / budget</button>
          ) : null}
          {canEditBudget && budget ? (
            <button type="button" className="primary sm" onClick={() => startEdit(budget)}><Pencil size={14} /> Edit estimated budget</button>
          ) : null}
          {budget && onViewBudget ? (
            <button type="button" className="ghost-d sm" onClick={() => onViewBudget(site.id)}><Eye size={14} /> View estimated budget</button>
          ) : null}
        </div>
      ) : (
        <div className="est-editor">
          <div className="est-bar">
            <label className="sf"><span>Effective from</span><input className="sf-sel" value={monthLabelOf(site.contractStart || currentPeriodKey())} readOnly disabled /></label>
            <label className="sf" style={{ flex: 2 }}><span>Note</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contract budget label" /></label>
            <button type="button" className="primary sm" onClick={saveEst} disabled={saving}>{saving ? "Saving…" : (budget ? "Save changes" : "Save estimate")}</button>
            <button type="button" className="ghost-d" onClick={() => { setEditing(false); setSaveError(""); }} disabled={saving}>Cancel</button>
          </div>
          {saveError ? (
            <p className="m-note warn" style={{ marginTop: 8 }}>{saveError}</p>
          ) : null}
          <div className="fgroup-h" style={{ color: "var(--green)" }}>Estimated Revenue</div>
          <div className="fields">{REVENUE_ITEMS.map((it) => (<label className="field" key={it.key}><span>{it.label}</span><div className="field-in"><i>₹</i><input type="number" value={rev[it.key] ?? ""} placeholder="0" onChange={(e) => setRev((s) => ({ ...s, [it.key]: e.target.value }))} /></div></label>))}</div>
          <div className="fgroup-h" style={{ color: "var(--loss)", marginTop: 14 }}>Estimated Expenses (by parent → line)</div>
          {structure.map((g) => (<div key={g.parent} className="fgroup"><div className="pminihead" style={{ color: parentColor(g.parent) }}><span className="pdot" style={{ background: parentColor(g.parent) }} />{parentLabel(g.parent)}</div><div className="fields">{g.children.map((k) => (<label className="field" key={k}><span>{libMap[k]?.label || k}</span><div className="field-in"><i>₹</i><input type="number" value={exp[k] ?? ""} placeholder="0" onChange={(e) => setExp((s) => ({ ...s, [k]: e.target.value }))} /></div></label>))}</div></div>))}
        </div>
      )}
    </Card>
  );
}

export const spreadIsActive = (sp, mk) => {
  const si = monthIdx(sp.start), ci = monthIdx(mk), m = Number(sp.months) || 0;
  return si >= 0 && m > 0 && ci >= si && ci < si + m;
};

export function SpreadEditor({ site, library, onPatchSite, entryMonth }) {
  const childKeys = siteChildKeys(site);
  const libMap = Object.fromEntries(library.map((h) => [h.key, h]));
  const [head, setHead] = useState(childKeys[0] || "");
  const [total, setTotal] = useState("");
  const [start, setStart] = useState(entryMonth || "2025-07");
  const [months, setMonths] = useState("12");
  const [mode, setMode] = useState("remaining");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState(null);
  useEffect(() => { if (!childKeys.includes(head)) setHead(childKeys[0] || ""); }, [site.id]); // eslint-disable-line
  useEffect(() => { if (entryMonth && !editingId) setStart(entryMonth); }, [entryMonth, site.id, editingId]);
  const spreads = site.spreads || [];
  const hasContractEnd = !!site.contractEnd;
  const autoMonths = remainingMonths(site, start);
  const effMonths = mode === "remaining" && hasContractEnd ? autoMonths : Number(months) || 0;
  const grouped = displayStructure(site).filter((g) => g.children.length);
  const resetForm = () => {
    setEditingId(null);
    setTotal("");
    setNote("");
    setMode("remaining");
    setMonths("12");
    if (entryMonth) setStart(entryMonth);
  };
  const save = () => {
    if (!head || !Number(total) || !effMonths) return;
    const sp = { id: editingId || "sp" + Date.now(), head, total: Number(total), start, months: effMonths, mode, note: note.trim() };
    onPatchSite(site.id, { spreads: editingId ? spreads.map((s) => (s.id === editingId ? sp : s)) : [...spreads, sp] });
    resetForm();
  };
  const beginEdit = (sp) => {
    setEditingId(sp.id);
    setHead(sp.head);
    setTotal(String(sp.total));
    setStart(sp.start);
    setMonths(String(sp.months));
    setMode(sp.mode === "fixed" ? "fixed" : "remaining");
    setNote(sp.note || "");
  };
  const del = (id) => { if (editingId === id) resetForm(); onPatchSite(site.id, { spreads: spreads.filter((s) => s.id !== id) }); };
  const perMonth = Number(total) && effMonths ? inr(Number(total) / effMonths) : "₹—";
  return (
    <div>
      {spreads.length > 0 && (
        <table className="tbl" style={{ marginBottom: 14 }}>
          <thead><tr><th>Cost line</th><th>Note</th><th className="r">Total cost</th><th>From</th><th className="r">Months</th><th className="r">Per month</th>{entryMonth && <th>Active now?</th>}<th></th></tr></thead>
          <tbody>{spreads.map((sp) => {
            const active = entryMonth ? spreadIsActive(sp, entryMonth) : false;
            return (
              <tr key={sp.id} className={editingId === sp.id ? "spread-row-editing" : ""}>
                <td className="strong">{libMap[sp.head]?.label || sp.head}</td>
                <td className="muted-s">{sp.note || "—"}</td>
                <td className="r mono">{inr(sp.total)}</td>
                <td className="mono">{formatFinanceDate(periodKeyToDateStart(sp.start)) || monthLabelOf(sp.start)}</td>
                <td className="r mono">{sp.months}</td>
                <td className="r mono" style={{ color: "var(--green)" }}>{inr(sp.total / sp.months)}</td>
                {entryMonth && <td className={active ? "spread-active-yes" : "spread-active-no"}>{active ? "yes" : "no"}</td>}
                <td className="r nowrap"><button type="button" className="icon-btn" title="Edit spread" onClick={() => beginEdit(sp)}><Pencil size={13} /></button><button type="button" className="icon-btn danger" title="Delete spread" onClick={() => del(sp.id)}><Trash2 size={14} /></button></td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      <div className="spread-form">
        <label className="sf"><span>Cost line</span><select value={head} onChange={(e) => setHead(e.target.value)}>{grouped.map((g) => <optgroup key={g.parent} label={parentLabel(g.parent)}>{g.children.map((k) => <option key={k} value={k}>{libMap[k]?.label || k}</option>)}</optgroup>)}</select></label>
        <label className="sf"><span>Total cost (₹)</span><input type="number" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="4000" /></label>
        <label className="sf">
          <span>Arrives / starts</span>
          <FinanceDateInput
            className="sf-sel"
            value={periodKeyToDateStart(start) || ""}
            onChange={(iso) => {
              const pk = dateToPeriodKey(iso);
              if (pk) setStart(pk);
            }}
          />
        </label>
        <label className="sf"><span>Spread over</span><select value={mode} onChange={(e) => setMode(e.target.value)}><option value="remaining" disabled={!hasContractEnd}>Remaining contract{hasContractEnd ? ` (${autoMonths} mo)` : " — set end first"}</option><option value="fixed">Fixed no. of months</option></select></label>
        {mode === "fixed" && <label className="sf sm"><span>Months</span><input type="number" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="12" /></label>}
        <label className="sf"><span>Note</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Extra PPE — new batch" /></label>
        {editingId ? (
          <><button type="button" className="primary sm" onClick={save}>Save changes</button><button type="button" className="ghost-d" onClick={resetForm}>Cancel</button></>
        ) : (
          <button type="button" className="primary sm" onClick={save}><Plus size={14} /> Add spread</button>
        )}
      </div>
      {!hasContractEnd && (
        <p className="m-note warn" style={{ marginTop: 10 }}>Set a <b>contract end date</b> under Site Setup → Contract &amp; Estimate so &ldquo;Remaining contract&rdquo; can calculate months automatically.</p>
      )}
      <p className="m-note" style={{ marginTop: 10 }}>
        The full cost is logged against the month it arrives; <b>{perMonth}/month</b>{" "}
        {mode === "remaining" && hasContractEnd
          ? `is recognised across the remaining ${autoMonths} contract months (through ${monthLabelOf(site.contractEnd)})`
          : `is recognised across ${effMonths || "—"} months`}
        {entryMonth ? " — multiple spreads on the same cost line stack for the monthly total." : " — and reflected in all dashboards, statements and trends."}
      </p>
    </div>
  );
}

export { SiteSetupPage as SiteConfig };
export default SiteSetupPage;
