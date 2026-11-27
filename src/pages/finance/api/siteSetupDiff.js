/**
 * Site Setup change set — pure functions, no database access.
 *
 * Why this exists: Site Setup used to write the browser's whole copy of a site
 * (replace_site_structure, "delete spreads/budgets not in my list", upsert every head).
 * A tab opened before another user's edit would then silently delete that user's
 * components. Saves now send only what THIS user changed since the copy was loaded
 * (the "baseline"); anything the user never saw is never touched.
 */

/** Stable JSON (sorted object keys) so equality checks ignore key order. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

/**
 * child key → { parent, sort } for one site. Each child appears once (first wins),
 * matching the DB unique (site_id, child_head_id).
 */
export function flattenStructure(structure, normalizeParent = (k) => k) {
  const out = new Map();
  let sort = 0;
  for (const grp of structure || []) {
    const parent = normalizeParent(grp?.parent);
    for (const child of grp?.children || []) {
      if (!child || out.has(child)) continue;
      out.set(child, { parent, sort: sort++ });
    }
  }
  return out;
}

function amountMap(obj) {
  const out = {};
  for (const [k, raw] of Object.entries(obj || {})) {
    const n = Number(String(raw ?? "").replace(/,/g, ""));
    if (Number.isFinite(n) && n !== 0) out[k] = n;
  }
  return out;
}

export function spreadSignature(sp) {
  return stableStringify({
    head: sp?.head || "",
    total: Number(sp?.total) || 0,
    start: sp?.start || "",
    months: Number(sp?.months) || 0,
    mode: sp?.mode || "fixed",
    note: sp?.note || "",
  });
}

export function estimateSignature(est, site) {
  return stableStringify({
    effectiveFrom: est?.effectiveFrom || site?.contractStart || "",
    note: est?.note || "",
    revenue: amountMap(est?.revenue),
    expenses: amountMap(est?.expenses),
  });
}

function headSignature(h) {
  return stableStringify({
    label: h?.label || "",
    parent: h?.parent || "",
    custom: !!h?.custom,
  });
}

function parentSignature(p) {
  return stableStringify({ label: p?.label || "", color: p?.color || "", custom: !!p?.custom });
}

/**
 * Diff of one site against its baseline copy.
 * @param {object|null} base site as loaded from the database (null = new site)
 * @param {object} cur site as it is now in the browser
 * @param {{ normalizeParent?: Function, metaSignature?: Function }} opts
 */
export function diffSite(base, cur, { normalizeParent = (k) => k, metaSignature = null } = {}) {
  const curStruct = flattenStructure(cur?.structure, normalizeParent);
  const baseStruct = flattenStructure(base?.structure, normalizeParent);

  const added = [];
  const moved = [];
  const sortCandidates = [];
  for (const [child, row] of curStruct) {
    const was = baseStruct.get(child);
    if (!was) added.push({ child, ...row });
    else if (was.parent !== row.parent) moved.push({ child, ...row, fromParent: was.parent });
    else if (was.sort !== row.sort) sortCandidates.push({ child, ...row });
  }
  const removed = [...baseStruct.keys()].filter((child) => !curStruct.has(child));
  // Removing a component shifts later indexes but not the order — only re-number when the
  // user actually reordered, added or moved something.
  const commonNow = [...curStruct.keys()].filter((k) => baseStruct.has(k));
  const commonBefore = [...baseStruct.keys()].filter((k) => curStruct.has(k));
  const orderChanged = commonNow.some((k, i) => k !== commonBefore[i]);
  const reordered = orderChanged || added.length || moved.length ? sortCandidates : [];

  const baseSpreads = new Map((base?.spreads || []).filter((s) => s?.id).map((s) => [s.id, s]));
  const curSpreads = new Map((cur?.spreads || []).filter((s) => s?.id).map((s) => [s.id, s]));
  const spreadUpserts = [...curSpreads.values()].filter((sp) => {
    const was = baseSpreads.get(sp.id);
    return !was || spreadSignature(was) !== spreadSignature(sp);
  });
  const spreadRemovals = [...baseSpreads.keys()].filter((id) => !curSpreads.has(id));

  const baseEst = new Map((base?.estimates || []).filter((e) => e?.id).map((e) => [e.id, e]));
  const curEst = new Map((cur?.estimates || []).filter((e) => e?.id).map((e) => [e.id, e]));
  const budgetUpserts = [...curEst.values()].filter((est) => {
    const was = baseEst.get(est.id);
    return !was || estimateSignature(was, base) !== estimateSignature(est, cur);
  });
  const budgetRemovals = [...baseEst.keys()].filter((id) => !curEst.has(id));

  const metaChanged = !base
    || (metaSignature ? metaSignature(base) !== metaSignature(cur) : false);

  const structureChanged = added.length + moved.length + reordered.length + removed.length > 0;
  const changed = !base
    || metaChanged
    || structureChanged
    || spreadUpserts.length > 0
    || spreadRemovals.length > 0
    || budgetUpserts.length > 0
    || budgetRemovals.length > 0;

  return {
    siteCode: cur?.id || base?.id,
    isNew: !base,
    changed,
    metaChanged,
    structure: { added, moved, reordered, removed, changed: structureChanged },
    spreads: { upserts: spreadUpserts, removed: spreadRemovals },
    budgets: { upserts: budgetUpserts, removed: budgetRemovals },
  };
}

/**
 * Full Site Setup change set: parents, cost-line library and every site that differs.
 * Sites missing from `current` are ignored here (site deletion is its own explicit action).
 */
export function diffSiteSetup(baseline, current, opts = {}) {
  const baseParents = new Map((baseline?.parents || []).map((p) => [p.key, p]));
  const curParents = new Map((current?.parents || []).map((p) => [p.key, p]));
  const parentUpserts = [...curParents.values()].filter((p) => {
    const was = baseParents.get(p.key);
    return !was || parentSignature(was) !== parentSignature(p);
  });
  const parentRemovals = [...baseParents.keys()].filter((k) => !curParents.has(k));

  const baseLib = new Map((baseline?.library || []).map((h) => [h.key, h]));
  const curLib = new Map((current?.library || []).map((h) => [h.key, h]));
  const headUpserts = [...curLib.values()].filter((h) => {
    const was = baseLib.get(h.key);
    return !was || headSignature(was) !== headSignature(h);
  });
  const headRemovals = [...baseLib.keys()].filter((k) => !curLib.has(k));

  const baseSites = new Map((baseline?.sites || []).map((s) => [s.id, s]));
  const sites = [];
  for (const cur of current?.sites || []) {
    const d = diffSite(baseSites.get(cur.id) || null, cur, opts);
    if (d.changed) sites.push(d);
  }

  const mastersChanged = parentUpserts.length + parentRemovals.length + headUpserts.length + headRemovals.length > 0;
  return {
    parents: { upserts: parentUpserts, removed: parentRemovals },
    heads: { upserts: headUpserts, removed: headRemovals },
    sites,
    mastersChanged,
    hasChanges: mastersChanged || sites.length > 0,
  };
}

/** Everything in a change set that deletes something — shown to the user before Save. */
export function describeRemovals(diff, { siteName = (c) => c, headLabel = (k) => k, parentLabel = (k) => k } = {}) {
  const lines = [];
  for (const s of diff?.sites || []) {
    const name = siteName(s.siteCode);
    if (s.structure.removed.length) {
      lines.push(`${name}: remove ${s.structure.removed.length} component(s) — ${s.structure.removed.map(headLabel).join(", ")}`);
    }
    if (s.spreads.removed.length) lines.push(`${name}: delete ${s.spreads.removed.length} cost spread(s)`);
    if (s.budgets.removed.length) lines.push(`${name}: delete ${s.budgets.removed.length} budget version(s)`);
  }
  if (diff?.heads?.removed?.length) {
    lines.push(`Cost-line library: remove ${diff.heads.removed.map(headLabel).join(", ")}`);
  }
  if (diff?.parents?.removed?.length) {
    lines.push(`Parent heads: remove ${diff.parents.removed.map(parentLabel).join(", ")}`);
  }
  return lines;
}

/**
 * Full Site Setup change summary (adds, moves, reorders, meta, budgets, spreads, removals).
 * Used for save confirmation — does not change financial meaning.
 */
export function describeSetupChanges(diff, {
  siteName = (c) => c,
  headLabel = (k) => k,
  parentLabel = (k) => k,
} = {}) {
  const lines = [];

  for (const p of diff?.parents?.upserts || []) {
    lines.push(`Parent head: update ${parentLabel(p.key)}`);
  }
  for (const key of diff?.parents?.removed || []) {
    lines.push(`Parent head: remove ${parentLabel(key)}`);
  }
  for (const h of diff?.heads?.upserts || []) {
    lines.push(`Cost line: update ${headLabel(h.key)}`);
  }
  for (const key of diff?.heads?.removed || []) {
    lines.push(`Cost line: remove ${headLabel(key)}`);
  }

  for (const s of diff?.sites || []) {
    const name = siteName(s.siteCode);
    if (s.isNew) {
      lines.push(`${name}: new site`);
      continue;
    }
    if (s.metaChanged) lines.push(`${name}: site details changed`);
    if (s.structure?.added?.length) {
      lines.push(`${name}: add ${s.structure.added.length} component(s) — ${s.structure.added.map((r) => headLabel(r.child)).join(", ")}`);
    }
    if (s.structure?.moved?.length) {
      lines.push(`${name}: move ${s.structure.moved.length} component(s) — ${s.structure.moved.map((r) => headLabel(r.child)).join(", ")}`);
    }
    if (s.structure?.reordered?.length) {
      lines.push(`${name}: reorder ${s.structure.reordered.length} component(s)`);
    }
    if (s.structure?.removed?.length) {
      lines.push(`${name}: remove ${s.structure.removed.length} component(s) — ${s.structure.removed.map(headLabel).join(", ")}`);
    }
    if (s.spreads?.upserts?.length) lines.push(`${name}: update ${s.spreads.upserts.length} cost spread(s)`);
    if (s.spreads?.removed?.length) lines.push(`${name}: delete ${s.spreads.removed.length} cost spread(s)`);
    if (s.budgets?.upserts?.length) lines.push(`${name}: update ${s.budgets.upserts.length} budget version(s)`);
    if (s.budgets?.removed?.length) lines.push(`${name}: delete ${s.budgets.removed.length} budget version(s)`);
  }

  return lines;
}
