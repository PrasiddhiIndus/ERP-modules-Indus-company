import { emptyLineItem, emptySectionRow } from '../pricingEngine';

/**
 * Map one Summary item → 0–2 Entry line payloads (supply / installation).
 * Does not assign section_no / sub_letter — caller does that.
 */
export function mapSummaryItemToEntryLines(item, { marginPct = 25.45 } = {}) {
  const supplyRate = Number(item?.supplyRate) || 0;
  const installationRate = Number(item?.installationRate) || 0;
  const qty = Number(item?.qty) || 0;
  const baseDesc = String(item?.description || '').trim();
  const note = String(item?.note || '').trim();
  const hsn = item?.hsnCode || '';
  const unit = item?.unit || 'Nos';
  const remarks = item?.remarks || '';
  const make = item?.make || '';
  const out = [];

  if (supplyRate > 0) {
    const description = note ? `${baseDesc}\n${note}` : baseDesc;
    out.push({
      description,
      hsn_sac: hsn,
      unit,
      qty,
      basic_unit_rate: supplyRate,
      make,
      remarks,
      margin_pct: marginPct,
      accessories_pct: 0,
      transport_pct: 0,
      inflation_pct: 0,
      sourceChildHeadId: item._childHeadId,
      sourceItemId: item.id,
      sourceKind: 'supply',
      fetchedSnapshot: {
        description,
        hsn_sac: hsn,
        unit,
        qty,
        basic_unit_rate: supplyRate,
        make,
        remarks,
      },
    });
  }

  if (installationRate > 0) {
    const description = `${baseDesc} – Installation Charge`;
    out.push({
      description,
      hsn_sac: hsn,
      unit,
      qty,
      basic_unit_rate: installationRate,
      make: '',
      remarks,
      margin_pct: marginPct,
      accessories_pct: 0,
      transport_pct: 0,
      inflation_pct: 0,
      sourceChildHeadId: item._childHeadId,
      sourceItemId: item.id,
      sourceKind: 'installation',
      fetchedSnapshot: {
        description,
        hsn_sac: hsn,
        unit,
        qty,
        basic_unit_rate: installationRate,
        make: '',
        remarks,
      },
    });
  }

  return out;
}

export function collectFetchedItemIds(lines) {
  const ids = new Set();
  for (const l of lines || []) {
    if (l?.sourceItemId) ids.add(l.sourceItemId);
  }
  return ids;
}

export function linesForSourceItem(lines, sourceItemId) {
  return (lines || []).filter((l) => l.sourceItemId === sourceItemId && l.row_type !== 'section');
}

/** True if any tagged line diverged from its fetchedSnapshot. */
export function isSourceItemHandEdited(lines, sourceItemId) {
  const tagged = linesForSourceItem(lines, sourceItemId);
  if (!tagged.length) return false;
  for (const line of tagged) {
    const snap = line.fetchedSnapshot;
    if (!snap) continue;
    const keys = ['description', 'hsn_sac', 'unit', 'qty', 'basic_unit_rate', 'make', 'remarks'];
    for (const k of keys) {
      const a = line[k] ?? '';
      const b = snap[k] ?? '';
      if (String(a) !== String(b)) return true;
    }
  }
  return false;
}

function nextSubLetter(existingLetters) {
  return String.fromCharCode(65 + existingLetters.length);
}

/**
 * Build Entry line rows for newly selected Summary items (skip already-fetched).
 * Groups by Child Head → Section + Supply/Install lines.
 */
export function buildFetchedEntryRows({
  mainHeads,
  selectedItemIds,
  alreadyFetchedIds,
  existingLines,
  marginPct = 25.45,
}) {
  const selected = new Set(selectedItemIds || []);
  const already = alreadyFetchedIds || new Set();
  const maxSec = (existingLines || []).reduce((m, l) => Math.max(m, Number(l.section_no) || 0), 0);
  let sectionNo = maxSec;
  const newRows = [];

  // Index existing sections by sourceChildHeadId for appending
  const sectionByChild = new Map();
  for (const l of existingLines || []) {
    if (l.row_type === 'section' && l.sourceChildHeadId) {
      sectionByChild.set(l.sourceChildHeadId, l.section_no);
    }
  }

  const lettersBySection = new Map();
  for (const l of existingLines || []) {
    if (l.row_type === 'line' && l.section_no != null) {
      const arr = lettersBySection.get(l.section_no) || [];
      if (l.sub_letter) arr.push(l.sub_letter);
      lettersBySection.set(l.section_no, arr);
    }
  }

  for (const main of mainHeads || []) {
    for (const child of main.childHeads || []) {
      const itemsToAdd = (child.items || []).filter(
        (it) => selected.has(it.id) && !already.has(it.id)
      );
      if (!itemsToAdd.length) continue;

      let secNo = sectionByChild.get(child.id);
      if (secNo == null) {
        sectionNo += 1;
        secNo = sectionNo;
        sectionByChild.set(child.id, secNo);
        const label = child.label?.trim()
          ? `${secNo}. ${child.label.trim()}`
          : `${secNo}. New section`;
        newRows.push({
          ...emptySectionRow(secNo, label),
          sourceChildHeadId: child.id,
        });
        lettersBySection.set(secNo, []);
      }

      const letters = lettersBySection.get(secNo) || [];
      for (const item of itemsToAdd) {
        const mapped = mapSummaryItemToEntryLines(
          { ...item, _childHeadId: child.id },
          { marginPct }
        );
        for (const payload of mapped) {
          const sub = nextSubLetter(letters);
          letters.push(sub);
          newRows.push(
            emptyLineItem({
              ...payload,
              section_no: secNo,
              sub_letter: sub,
            })
          );
        }
      }
      lettersBySection.set(secNo, letters);
    }
  }

  return newRows;
}

/**
 * Replace tagged lines for one Summary item with fresh mapping.
 * Returns new lines array.
 */
export function resyncSourceItemLines(lines, item, childHeadId, { marginPct = 25.45 } = {}) {
  const itemId = item?.id;
  if (!itemId) return lines || [];

  const existing = lines || [];
  const tagged = existing.filter((l) => l.sourceItemId === itemId && l.row_type !== 'section');
  if (!tagged.length) return existing;

  // Keep section_no from first tagged line; re-letter within that section after replace
  const sectionNo = tagged[0].section_no;
  const without = existing.filter((l) => !(l.sourceItemId === itemId && l.row_type !== 'section'));

  const mapped = mapSummaryItemToEntryLines(
    { ...item, _childHeadId: childHeadId },
    { marginPct }
  );

  // Find insert position: after last line of this section that appears before we removed, or after section header
  const sectionHeaderIdx = without.findIndex(
    (l) => l.row_type === 'section' && l.section_no === sectionNo
  );
  let insertAt = sectionHeaderIdx >= 0 ? sectionHeaderIdx + 1 : without.length;
  // Prefer inserting where the old lines were (first tagged index in original)
  const firstTaggedIdx = existing.findIndex((l) => l.sourceItemId === itemId && l.row_type !== 'section');
  if (firstTaggedIdx >= 0) {
    // Count how many rows before firstTagged remain in without
    let count = 0;
    for (let i = 0; i < firstTaggedIdx; i++) {
      const row = existing[i];
      if (!(row.sourceItemId === itemId && row.row_type !== 'section')) count++;
    }
    insertAt = count;
  }

  // Rebuild sub_letters for the whole section after splice
  const newLines = [...without];
  const fresh = mapped.map((payload) =>
    emptyLineItem({
      ...payload,
      section_no: sectionNo,
      sub_letter: 'A',
    })
  );
  newLines.splice(insertAt, 0, ...fresh);

  return reletterSection(newLines, sectionNo);
}

function reletterSection(lines, sectionNo) {
  let letterIdx = 0;
  return lines.map((l) => {
    if (l.row_type !== 'line' || l.section_no !== sectionNo) return l;
    const sub = String.fromCharCode(65 + letterIdx);
    letterIdx += 1;
    return { ...l, sub_letter: sub };
  });
}

/** Flatten tree to item lookup by id. */
export function indexSummaryItems(mainHeads) {
  const map = new Map();
  for (const main of mainHeads || []) {
    for (const child of main.childHeads || []) {
      for (const item of child.items || []) {
        map.set(item.id, { item, childHeadId: child.id, childLabel: child.label, mainLabel: main.label });
      }
    }
  }
  return map;
}
