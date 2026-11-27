/**
 * Site Setup dependency analysis — pure functions, no database / React access.
 *
 * Answers: "If this cost line is taken off the site's structure, what else
 * references it?" so the UI can warn before the user removes it.
 *
 * Important invariant: removing a cost line only changes the site's STRUCTURE
 * assignment (plus its budget line / spreads, which are structure-level data).
 * Figures already entered for past periods are never deleted — the setup save
 * keeps them. Nothing in this module recommends deleting financial amounts.
 */

/** @typedef {"remove"|"deactivate"|"blocked"} DependencySuggestion */

/**
 * @typedef {Object} DependencyAnalysis
 * @property {boolean} safe                 true only when nothing references the cost line
 * @property {string[]} reasons             business-language warnings (no table/schema names)
 * @property {string[]} historicalPeriods   period keys (sorted ascending) holding a non-zero figure
 * @property {boolean} hasBudget            a budget estimate has a non-zero amount for the line
 * @property {boolean} hasSpread            one or more spreads reference the line
 * @property {DependencySuggestion} suggestion
 * @property {boolean} hardBlock            true when suggestion === "blocked"
 * @property {string[]} currentPeriods      subset of historicalPeriods equal to `currentPeriodKey`
 * @property {number} spreadCount
 * @property {number} budgetAmount          sum of non-zero budget estimate amounts for the line
 * @property {string[]} blockers            hard-block reasons (subset of `reasons`)
 */

function toAmount(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Period keys (sorted ascending) for which `records["<siteId>__<periodKey>"][childKey]` is non-zero.
 * @param {Record<string, any>} records
 * @param {string} siteId
 * @param {string} childKey
 * @returns {string[]}
 */
export function periodsWithFigures(records, siteId, childKey) {
  if (!records || !siteId || !childKey) return [];
  const prefix = `${siteId}__`;
  const out = [];
  for (const [key, rec] of Object.entries(records)) {
    if (!key.startsWith(prefix) || !rec || typeof rec !== "object") continue;
    if (toAmount(rec[childKey]) !== 0) out.push(key.slice(prefix.length));
  }
  return out.sort();
}

/**
 * Sum of budget estimate amounts for a cost line on a site.
 * @param {{ estimates?: Array<{ expenses?: Record<string, any> }> }} site
 * @param {string} childKey
 */
export function budgetAmountForChild(site, childKey) {
  let total = 0;
  for (const est of site?.estimates || []) {
    const n = toAmount(est?.expenses?.[childKey]);
    if (n !== 0) total += n;
  }
  return total;
}

/** Spreads on the site that reference this cost line. */
export function spreadsForChild(site, childKey) {
  return (site?.spreads || []).filter((sp) => sp?.head === childKey);
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Analyze whether removing a cost line from a site's structure is safe.
 *
 * @param {Object} params
 * @param {Object} params.site                       site object (spreads, estimates, structure…)
 * @param {string} [params.siteId]                   defaults to `site.id`
 * @param {string} params.childKey                   cost line key
 * @param {Record<string, any>} [params.records]     period records keyed `siteId__periodKey`
 * @param {string} [params.currentPeriodKey]         period currently being worked on (for wording)
 * @param {string[]} [params.unsavedFigurePeriods]   periods whose unsaved figure edits include this line
 * @param {(periodKey: string) => string} [params.periodLabel] formats a period key for messages
 * @param {number} [params.maxPeriodsInMessage=6]
 * @returns {DependencyAnalysis}
 */
export function analyzeChildRemoval({
  site,
  siteId,
  childKey,
  records = {},
  currentPeriodKey = null,
  unsavedFigurePeriods = [],
  periodLabel = (k) => k,
  maxPeriodsInMessage = 6,
} = {}) {
  const sid = siteId || site?.id || "";
  const reasons = [];
  const blockers = [];

  const historicalPeriods = periodsWithFigures(records, sid, childKey);
  const currentPeriods = currentPeriodKey
    ? historicalPeriods.filter((p) => p === currentPeriodKey)
    : [];
  const pastPeriods = historicalPeriods.filter((p) => !currentPeriods.includes(p));

  const budgetAmount = budgetAmountForChild(site, childKey);
  const hasBudget = budgetAmount !== 0;

  const spreads = spreadsForChild(site, childKey);
  const spreadCount = spreads.length;
  const hasSpread = spreadCount > 0;

  const unsaved = [...new Set((unsavedFigurePeriods || []).filter(Boolean))].sort();

  if (unsaved.length) {
    const msg = `Unsaved figures are still being entered for this cost line (${unsaved
      .slice(0, maxPeriodsInMessage)
      .map(periodLabel)
      .join(", ")}). Save or discard them before removing the line.`;
    blockers.push(msg);
    reasons.push(msg);
  }

  if (currentPeriods.length) {
    reasons.push(
      `It has a figure for the period you are working on (${periodLabel(currentPeriods[0])}).`,
    );
  }
  if (pastPeriods.length) {
    const shown = pastPeriods.slice(0, maxPeriodsInMessage).map(periodLabel).join(", ");
    const more = pastPeriods.length > maxPeriodsInMessage
      ? ` and ${pastPeriods.length - maxPeriodsInMessage} more`
      : "";
    reasons.push(
      `Figures were already entered in ${plural(pastPeriods.length, "earlier period", "earlier periods")} (${shown}${more}). Those figures stay in the records.`,
    );
  }
  if (hasBudget) {
    reasons.push("The estimated budget includes an amount for this cost line; that budget line will be removed.");
  }
  if (hasSpread) {
    reasons.push(
      `${plural(spreadCount, "spread cost uses", "spread costs use")} this cost line; ${spreadCount === 1 ? "it" : "they"} will be removed from the site.`,
    );
  }

  /** @type {DependencySuggestion} */
  let suggestion = "remove";
  if (blockers.length) suggestion = "blocked";
  else if (historicalPeriods.length) suggestion = "deactivate";

  return {
    safe: reasons.length === 0,
    reasons,
    historicalPeriods,
    hasBudget,
    hasSpread,
    suggestion,
    hardBlock: suggestion === "blocked",
    currentPeriods,
    spreadCount,
    budgetAmount,
    blockers,
  };
}

/**
 * Analyze several cost lines at once (e.g. bulk remove). Keyed by child key.
 * @param {Omit<Parameters<typeof analyzeChildRemoval>[0], "childKey"> & { childKeys: string[] }} params
 * @returns {Record<string, DependencyAnalysis>}
 */
export function analyzeChildRemovals({ childKeys = [], ...rest } = {}) {
  const out = {};
  for (const childKey of childKeys) out[childKey] = analyzeChildRemoval({ ...rest, childKey });
  return out;
}

/**
 * Whether the UI may offer "Remove from site structure" for this analysis.
 * Historical figures never block structure removal — they are preserved.
 */
export function canRemoveFromStructure(analysis) {
  return !!analysis && !analysis.hardBlock;
}

/**
 * Save-time preview lines for every cost line a Site Setup change set removes from a site.
 * Uses the BASELINE site (before the user's edits) because removal strips budget lines and
 * spreads from the working copy. Only lines with real dependencies are returned.
 *
 * @param {{ sites?: Array<{ siteCode: string, structure?: { removed?: string[] } }> }} diff
 * @param {Object} params
 * @param {Array<{ id: string }>} params.baselineSites
 * @param {Record<string, any>} params.records
 * @param {(siteCode: string) => string} [params.siteName]
 * @param {(key: string) => string} [params.headLabel]
 * @param {(periodKey: string) => string} [params.periodLabel]
 * @returns {string[]}
 */
export function describeRemovalDependencies(diff, {
  baselineSites = [],
  records = {},
  siteName = (c) => c,
  headLabel = (k) => k,
  periodLabel = (k) => k,
} = {}) {
  const lines = [];
  const byId = new Map((baselineSites || []).map((s) => [s.id, s]));
  for (const s of diff?.sites || []) {
    const removed = s?.structure?.removed || [];
    if (!removed.length) continue;
    const site = byId.get(s.siteCode);
    if (!site) continue;
    for (const childKey of removed) {
      const a = analyzeChildRemoval({ site, siteId: s.siteCode, childKey, records, periodLabel });
      if (a.safe) continue;
      const bits = [];
      if (a.historicalPeriods.length) {
        bits.push(`figures in ${plural(a.historicalPeriods.length, "period", "periods")} are kept`);
      }
      if (a.hasBudget) bits.push("its budget line is removed");
      if (a.hasSpread) bits.push(`${plural(a.spreadCount, "spread cost", "spread costs")} removed`);
      lines.push(`${siteName(s.siteCode)} · ${headLabel(childKey)}: ${bits.join("; ")}`);
    }
  }
  return lines;
}
