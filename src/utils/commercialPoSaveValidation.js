/** Site + OC keyed PO save rules for Commercial Manpower / Training PO Entry. */

export const COMMERCIAL_PO_STATUS_SUPERSEDED = 'superseded';

function normText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function ymd(value) {
  return value && String(value).trim() ? String(value).trim() : '';
}

export function commercialPoModifiedTime(po) {
  const rows = Array.isArray(po?.updateHistory) ? po.updateHistory : [];
  const latestHistory = rows.reduce((max, row) => {
    const t = new Date(row?.at || 0).getTime();
    return Number.isFinite(t) ? Math.max(max, t) : max;
  }, 0);
  return Math.max(
    new Date(po?.updated_at || po?.updatedAt || 0).getTime() || 0,
    new Date(po?.created_at || po?.createdAt || po?.startDate || 0).getTime() || 0,
    latestHistory
  );
}

export function commercialPoSiteOcKey(siteId, ocNumber) {
  const site = normText(siteId);
  const oc = normText(ocNumber);
  if (!site || !oc) return '';
  return `${site}::${oc}`;
}

export function commercialPoServicePeriodBounds(po) {
  const start = String(po?.startDate ?? po?.start_date ?? '').trim();
  const end = String(po?.endDate ?? po?.end_date ?? '').trim();
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { startMs, endMs };
}

export function commercialPoServicePeriodsOverlap(a, b) {
  if (!a || !b) return false;
  return a.startMs <= b.endMs && b.startMs <= a.endMs;
}

function isSupplementaryPoRow(po) {
  return !!(po?.isSupplementary || po?.is_supplementary);
}

function isSupersededPoRow(po) {
  return normText(po?.status) === COMMERCIAL_PO_STATUS_SUPERSEDED;
}

/** All PO rows for a Site + OC (newest first). */
export function getPosForSiteOc(existingPos, siteId, ocNumber, { excludePoId } = {}) {
  const key = commercialPoSiteOcKey(siteId, ocNumber);
  if (!key) return [];
  return (existingPos || [])
    .filter((po) => {
      if (excludePoId != null && String(po?.id) === String(excludePoId)) return false;
      if (isSupplementaryPoRow(po)) return false;
      return commercialPoSiteOcKey(po?.siteId ?? po?.site_id, po?.ocNumber ?? po?.oc_number) === key;
    })
    .sort((a, b) => commercialPoModifiedTime(b) - commercialPoModifiedTime(a));
}

/** Latest non-superseded PO for Site + OC (active reference). */
export function getLatestPoForSiteOc(existingPos, siteId, ocNumber, { excludePoId } = {}) {
  const matches = getPosForSiteOc(existingPos, siteId, ocNumber, { excludePoId });
  return matches.find((po) => !isSupersededPoRow(po)) || null;
}

export function makePoHistoryCycle({ poWoNumber, totalContractValue, startDate, endDate, approvedAt } = {}) {
  return {
    po_wo_number: String(poWoNumber || '').trim(),
    total_contract_value:
      totalContractValue === '' || totalContractValue == null ? null : Number(totalContractValue) || 0,
    start_date: ymd(startDate),
    end_date: ymd(endDate),
    approved_at: approvedAt || null,
  };
}

function pushHistoryEntry(entries, seen, entry) {
  const num = String(entry.poWoNumber || '').trim();
  if (!num) return;
  const key = num.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  entries.push(entry);
}

/** Chronological PO number history for a Site + OC (oldest → newest). */
export function collectSiteOcPoNumberHistory(existingPos, siteId, ocNumber, { excludePoId } = {}) {
  const matches = getPosForSiteOc(existingPos, siteId, ocNumber, { excludePoId }).slice().reverse();
  const seen = new Set();
  const entries = [];

  for (const po of matches) {
    for (const c of po.renewalCycles || po.renewal_cycles || []) {
      pushHistoryEntry(entries, seen, {
        poWoNumber: c.po_wo_number,
        totalContractValue: c.total_contract_value,
        startDate: c.start_date,
        endDate: c.end_date,
        approvedAt: c.approved_at,
      });
    }
    pushHistoryEntry(entries, seen, {
      poWoNumber: po.poWoNumber ?? po.po_wo_number,
      totalContractValue: po.totalContractValue ?? po.total_contract_value,
      startDate: po.startDate ?? po.start_date,
      endDate: po.endDate ?? po.end_date,
      approvedAt: po.approvedAt ?? po.approved_at,
      isCurrentOnRow: !isSupersededPoRow(po),
    });
  }

  return entries;
}

/** Seed renewal_cycles on a new PO from the prior active Site + OC row. */
export function buildRenewalCyclesForNewSiteOcPo(priorPo) {
  if (!priorPo) return [];
  const cycles = [...(Array.isArray(priorPo.renewalCycles) ? priorPo.renewalCycles : [])];
  const priorNum = String(priorPo.poWoNumber ?? priorPo.po_wo_number ?? '').trim();
  if (!priorNum) return cycles;
  const exists = cycles.some(
    (c) => String(c.po_wo_number || '').trim().toLowerCase() === priorNum.toLowerCase()
  );
  if (exists) return cycles;
  return [
    ...cycles,
    makePoHistoryCycle({
      poWoNumber: priorNum,
      totalContractValue: priorPo.totalContractValue ?? priorPo.total_contract_value,
      startDate: priorPo.startDate ?? priorPo.start_date,
      endDate: priorPo.endDate ?? priorPo.end_date,
      approvedAt: priorPo.approvedAt ?? priorPo.approved_at,
    }),
  ];
}

/**
 * @returns {{ type: string, message: string } | null}
 */
export function findCommercialPoSaveConflict(existingPos, draft, { excludePoId } = {}) {
  const key = commercialPoSiteOcKey(draft?.siteId, draft?.ocNumber);
  if (!key) return null;

  const draftPoWo = normText(draft?.poWoNumber);
  const draftBounds = commercialPoServicePeriodBounds(draft);

  for (const po of existingPos || []) {
    if (excludePoId != null && String(po?.id) === String(excludePoId)) continue;
    if (isSupplementaryPoRow(po)) continue;
    if (commercialPoSiteOcKey(po?.siteId ?? po?.site_id, po?.ocNumber ?? po?.oc_number) !== key) {
      continue;
    }

    const existingPoWo = normText(po?.poWoNumber ?? po?.po_wo_number);
    if (draftPoWo && existingPoWo && existingPoWo === draftPoWo) {
      return {
        type: 'duplicate_po_number',
        message: 'Duplicate PO/WO Number for this Site and OC is not allowed.',
      };
    }

    if (isSupersededPoRow(po)) continue;

    const existingBounds = commercialPoServicePeriodBounds(po);
    if (draftBounds && existingBounds && commercialPoServicePeriodsOverlap(draftBounds, existingBounds)) {
      return {
        type: 'overlapping_period',
        message:
          'Service period overlaps another PO/WO for the same Site and OC. Use non-overlapping dates.',
      };
    }
  }

  return null;
}
