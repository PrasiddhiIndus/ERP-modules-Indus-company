/**
 * Quotation Maker — pure model (types, terms, pricing, numbering, tree ops).
 * Mirrors the guided HTML prototype; totals round per line then sum.
 */

export const QUOTATION_TYPES = {
  normal: {
    key: 'normal',
    name: 'Service',
    desc: 'One service price for each item.',
    subject: 'Fire Safety Service Works',
    pricing: 1,
    rateField: 'rate',
    colLabel: 'Service price per unit (₹)',
  },
  supply: {
    key: 'supply',
    name: 'Supply only',
    desc: 'We supply the material. One price per item.',
    subject: 'Supply of Materials and Equipment',
    pricing: 1,
    rateField: 'supply_rate',
    colLabel: 'Supply price per unit (₹)',
  },
  installation: {
    key: 'installation',
    name: 'Installation only',
    desc: 'We install. One price per item.',
    subject: 'Installation, Testing and Commissioning',
    pricing: 1,
    rateField: 'install_rate',
    colLabel: 'Installation price per unit (₹)',
  },
  supply_installation: {
    key: 'supply_installation',
    name: 'Supply + Installation',
    desc: 'Two prices per item: material and fitting.',
    subject: 'Supply, Installation, Testing and Commissioning',
    pricing: 2,
    rateField: null,
    colLabel: null,
  },
};

/** Aliases → canonical keys (DB stores `normal` for Service) */
export const TYPE_ALIASES = {
  si: 'supply_installation',
  service: 'normal',
  simple: 'normal',
  'simple price': 'normal',
};

export function normalizeType(type) {
  const raw = String(type || 'normal').trim().toLowerCase();
  const t = TYPE_ALIASES[raw] || TYPE_ALIASES[type] || type || 'normal';
  return QUOTATION_TYPES[t] ? t : 'normal';
}

/** Column keys used by the item table (optional make/remarks inserted dynamically). */
export const COLUMN_LABELS = {
  sr: 'Sr',
  description: 'Item Description',
  unit: 'Unit',
  qty: 'Qty',
  make: 'Make',
  remarks: 'Remarks',
  price_unit: 'Service / unit',
  total: 'Total',
  supply_unit: 'Supply / unit',
  supply_total: 'Supply total',
  install_unit: 'Install / unit',
  install_total: 'Install total',
  actions: '',
};

function insertBefore(list, beforeKey, item) {
  const next = list.filter((k) => k !== item);
  const idx = next.indexOf(beforeKey);
  if (idx < 0) {
    const actionsIdx = next.indexOf('actions');
    if (actionsIdx >= 0) next.splice(actionsIdx, 0, item);
    else next.push(item);
    return next;
  }
  next.splice(idx, 0, item);
  return next;
}

/**
 * Visible column keys for the editor/preview table.
 * `makeBefore` = column key that Make should sit immediately before (drag target).
 */
export function buildColumnKeys(type, { showMake = false, showRemarks = false, makeBefore = 'unit' } = {}) {
  const t = QUOTATION_TYPES[normalizeType(type)];
  const priceCols =
    t.pricing === 2
      ? ['supply_unit', 'supply_total', 'install_unit', 'install_total']
      : ['price_unit', 'total'];
  let cols = ['sr', 'description', 'unit', 'qty', ...priceCols, 'actions'];
  if (showRemarks) cols = insertBefore(cols, 'actions', 'remarks');
  if (showMake) {
    const allowed = new Set(cols.filter((c) => c !== 'sr' && c !== 'make'));
    // Legacy make_before "row_total" → place before actions
    let before = makeBefore === 'row_total' ? 'actions' : makeBefore;
    if (!allowed.has(before)) before = 'unit';
    cols = insertBefore(cols, before, 'make');
  }
  return cols;
}

/**
 * Keys Make may sit immediately before (left → right), for the placement control.
 * Excludes Sr No. (Make always stays after it).
 */
export function makePlacementSlots(type, { showRemarks = false } = {}) {
  return buildColumnKeys(type, { showMake: false, showRemarks, makeBefore: 'unit' }).filter(
    (k) => k !== 'sr'
  );
}

/** Resolve a stored make_column_before to a valid slot key. */
export function resolveMakeBefore(type, makeBefore, { showRemarks = false } = {}) {
  const slots = makePlacementSlots(type, { showRemarks });
  let before = makeBefore === 'row_total' ? 'actions' : makeBefore;
  if (!slots.includes(before)) before = slots.includes('unit') ? 'unit' : slots[0];
  return before || 'unit';
}

/** Move Make one slot left (−1) or right (+1). Returns the new makeBefore key. */
export function nudgeMakeBefore(type, makeBefore, dir, { showRemarks = false } = {}) {
  const slots = makePlacementSlots(type, { showRemarks });
  if (!slots.length) return makeBefore || 'unit';
  const current = resolveMakeBefore(type, makeBefore, { showRemarks });
  const i = slots.indexOf(current);
  const next = i + (dir < 0 ? -1 : 1);
  if (next < 0 || next >= slots.length) return current;
  return slots[next];
}

export function columnLabel(key, type) {
  if (key === 'price_unit') {
    const t = QUOTATION_TYPES[normalizeType(type)];
    return (t.colLabel || 'Price / unit').replace(' (₹)', '');
  }
  return COLUMN_LABELS[key] ?? key;
}

export const STANDARD_TERMS = {
  normal: [
    'GST extra as applicable.',
    '50% advance with work order, remaining 50% after completion of work.',
    'Work order cancellation is not acceptable.',
    'Offer valid for 10 days.',
    'All work done by qualified and experienced personnel.',
  ],
  supply: [
    'GST extra as applicable.',
    '30% advance with work order, 60% against material supply at site within 7 days, remaining 10% after completion.',
    'Work order cancellation is not acceptable.',
    'Offer valid for 10 days.',
    'Electricity and water supply in client\'s scope.',
  ],
  installation: [
    'GST extra as applicable.',
    '30% against manpower mobilization, 60% as per RA bill within 7 days, remaining 10% after completion.',
    'Work order cancellation is not acceptable.',
    'Offer valid for 10 days.',
    'Civil work (excavation, breaking, foundations, scaffolding) is in client\'s scope.',
    'Electricity and water supply in client\'s scope.',
  ],
  supply_installation: [
    'GST extra as applicable.',
    'Supply: 30% advance with work order, 60% against material at site within 7 days, remaining 10% after completion.',
    'Installation: 30% against manpower mobilization, 60% as per RA bill within 7 days, remaining 10% after completion.',
    'Work order cancellation is not acceptable.',
    'Offer valid for 10 days.',
    'Civil work (excavation, breaking, foundations, scaffolding) is in client\'s scope.',
    'Electricity and water supply in client\'s scope.',
  ],
};

export const MAKER_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
];

/** Map maker status → legacy offer_status for older list/board views */
export function makerStatusToOfferStatus(makerStatus) {
  switch (makerStatus) {
    case 'sent':
      return 'Awaiting Client Response';
    case 'accepted':
      return 'Order Converted';
    case 'rejected':
      return 'Order Lost';
    case 'expired':
      return 'Client Has Hold Enquiry';
    default:
      return 'Draft';
  }
}

export function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export function formatMoneyIn(n) {
  return round2(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

let _tmp = 0;
export function newTempId() {
  _tmp += 1;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tmp-${crypto.randomUUID()}`;
  }
  return `tmp-${Date.now().toString(36)}-${_tmp}`;
}

export function createEmptyRow(rowType = 'item', parentId = null) {
  return {
    id: newTempId(),
    parent_row_id: parentId,
    row_type: rowType === 'heading' ? 'heading' : 'item',
    description: '',
    unit: rowType === 'heading' ? '' : 'Nos',
    qty: rowType === 'heading' ? 0 : 1,
    rate: 0,
    supply_rate: 0,
    install_rate: 0,
    make: '',
    remarks: '',
  };
}

export function emptyMakerForm(defaults = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const type = normalizeType(defaults.quotation_type || 'normal');
  return {
    id: null,
    quotation_no: defaults.quotation_no || '',
    quotation_type: type,
    client_id: null,
    client_contact: '',
    client_company: '',
    client_address: '',
    subject: QUOTATION_TYPES[type].subject,
    quote_date: today,
    signatory_name: defaults.signatory_name || '',
    signatory_designation: defaults.signatory_designation || 'Asst. Manager - Projects',
    terms: [...STANDARD_TERMS[type]],
    maker_status: 'draft',
    version: 1,
    branch_code: defaults.branch_code || 'SRE',
    show_make: Boolean(defaults.show_make),
    // Remarks is on by default so the table header always has that column for new quotes.
    show_remarks: defaults.show_remarks != null ? Boolean(defaults.show_remarks) : true,
    make_column_before: defaults.make_column_before || 'unit',
  };
}

export function partsOf(rows, id) {
  return (rows || []).filter((r) => r.parent_row_id === id);
}

export function isGroup(rows, r) {
  return r && r.row_type === 'item' && partsOf(rows, r.id).length > 0;
}

export function byId(rows, id) {
  return (rows || []).find((r) => r.id === id);
}

/** Leaf priced amount for one pricing column (already round2). */
export function lineAmount(r, which) {
  const q = Number(r.qty) || 0;
  if (which === 'supply') return round2(q * (Number(r.supply_rate) || 0));
  if (which === 'inst' || which === 'install') return round2(q * (Number(r.install_rate) || 0));
  if (which === 'price' || which === 'rate') return round2(q * (Number(r.rate) || 0));
  return round2(lineAmount(r, 'supply') + lineAmount(r, 'inst'));
}

export function rowTotal(rows, r, type) {
  const mode = normalizeType(type);
  if (!r) return 0;
  if (r.row_type === 'heading') {
    return partsOf(rows, r.id).reduce((s, c) => s + rowTotal(rows, c, mode), 0);
  }
  if (isGroup(rows, r)) {
    return partsOf(rows, r.id).reduce((s, c) => s + rowTotal(rows, c, mode), 0);
  }
  const t = QUOTATION_TYPES[mode];
  if (t.pricing === 2) return lineAmount(r, 'both');
  return lineAmount(r, t.rateField === 'rate' ? 'rate' : t.rateField === 'supply_rate' ? 'supply' : 'inst');
}

export function columnTotal(rows, which) {
  return (rows || [])
    .filter((r) => r.row_type === 'item' && !isGroup(rows, r))
    .reduce((s, r) => s + lineAmount(r, which), 0);
}

export function computeTotals(rows, type) {
  const mode = normalizeType(type);
  const supply_total = columnTotal(rows, 'supply');
  const install_total = columnTotal(rows, 'inst');
  const grand_total = (rows || [])
    .filter((r) => !r.parent_row_id)
    .reduce((s, r) => s + rowTotal(rows, r, mode), 0);
  return {
    supply_total: round2(supply_total),
    install_total: round2(install_total),
    grand_total: round2(grand_total),
  };
}

/** True if `rowId` is under `ancestorId` (item under heading, or part under item under heading). */
export function isDescendantOf(rows, rowId, ancestorId) {
  let cur = byId(rows, rowId);
  let guard = 0;
  while (cur?.parent_row_id && guard < 8) {
    if (cur.parent_row_id === ancestorId) return true;
    cur = byId(rows, cur.parent_row_id);
    guard += 1;
  }
  return false;
}

/** Leaf totals for one pricing column under a heading. */
export function headingColumnTotal(rows, headingId, which) {
  return round2(
    (rows || [])
      .filter(
        (r) =>
          r.row_type === 'item' &&
          !isGroup(rows, r) &&
          isDescendantOf(rows, r.id, headingId)
      )
      .reduce((s, r) => s + lineAmount(r, which), 0)
  );
}

/**
 * Flat list for rendering: inserts a synthetic `heading_total` row after each
 * heading's last sub-row (or immediately after an empty heading).
 */
export function expandDisplayRows(rows) {
  const list = rows || [];
  const lastDesc = new Map(); // headingId -> last index of any descendant
  for (let i = 0; i < list.length; i += 1) {
    const r = list[i];
    if (!r.parent_row_id) continue;
    let cur = r;
    for (let g = 0; g < 6 && cur?.parent_row_id; g += 1) {
      const p = byId(list, cur.parent_row_id);
      if (!p) break;
      if (p.row_type === 'heading') {
        lastDesc.set(p.id, i);
        break;
      }
      cur = p;
    }
  }

  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const r = list[i];
    out.push(r);
    if (r.row_type === 'heading' && !lastDesc.has(r.id)) {
      out.push({
        id: `__ht_${r.id}`,
        row_type: 'heading_total',
        heading_id: r.id,
        description: r.description || '',
      });
    }
    for (const [hid, last] of lastDesc) {
      if (last === i) {
        const h = byId(list, hid);
        out.push({
          id: `__ht_${hid}`,
          row_type: 'heading_total',
          heading_id: hid,
          description: h?.description || '',
        });
      }
    }
  }
  return out;
}

/** Item siblings sharing the same parent_row_id (null = top level), in rows order. */
export function itemSiblings(rows, parentRowId) {
  const pid = parentRowId ?? null;
  return (rows || []).filter(
    (x) => x.row_type === 'item' && (x.parent_row_id ?? null) === pid
  );
}

/**
 * Sr No. — pure, recalculated from rows order after any reorder.
 *
 * - Heading / heading total → ''
 * - Item under a heading, or top-level item → 1, 2, 3… (restarts per parent;
 *   top-level items are separate from each heading’s children)
 * - Part under an item → parentLabel + '.' + letter (1.a, 1.b…; letters restart per item)
 * - Part under a part → parentLabel + '.' + n (1.a.1, 1.a.2…; numbers restart per part)
 */
export function numberOf(rows, r) {
  if (!r || r.row_type === 'heading' || r.row_type === 'heading_total') return '';
  if (r.row_type !== 'item') return '';

  const parent = r.parent_row_id ? byId(rows, r.parent_row_id) : null;
  const siblings = itemSiblings(rows, r.parent_row_id ?? null);
  const idx = siblings.indexOf(r);
  if (idx < 0) return '';

  // Top-level item, or item directly under a heading → 1, 2, 3…
  if (!parent || parent.row_type === 'heading') {
    return String(idx + 1);
  }

  if (parent.row_type === 'item') {
    const parentLabel = numberOf(rows, parent);
    if (!parentLabel) return '';
    const grand = parent.parent_row_id ? byId(rows, parent.parent_row_id) : null;
    // Part under an item (item’s parent is heading or null) → 1.a, 1.b…
    if (!grand || grand.row_type === 'heading') {
      return `${parentLabel}.${String.fromCharCode(97 + idx)}`;
    }
    // Part under a part → 1.a.1, 1.a.2…
    if (grand.row_type === 'item') {
      return `${parentLabel}.${idx + 1}`;
    }
  }

  return '';
}

export function validateForSent(rows) {
  const priced = (rows || []).filter(
    (r) => r.row_type === 'item' && !isGroup(rows, r) && (Number(r.qty) > 0 || Number(r.rate) > 0 || Number(r.supply_rate) > 0 || Number(r.install_rate) > 0)
  );
  if (!priced.length) return 'Add at least one priced item before marking as Sent.';
  for (const r of priced) {
    if (!String(r.description || '').trim()) return 'Every priced item needs a description.';
    if (Number(r.qty) < 0 || Number(r.rate) < 0 || Number(r.supply_rate) < 0 || Number(r.install_rate) < 0) {
      return 'Quantity and rates must be zero or greater.';
    }
  }
  return null;
}

/** Dragged row plus all descendants, preserving current rows order. */
function collectBlock(rows, fromId) {
  const dragged = byId(rows, fromId);
  if (!dragged) return [];
  const ids = new Set([fromId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows || []) {
      if (r.parent_row_id && ids.has(r.parent_row_id) && !ids.has(r.id)) {
        ids.add(r.id);
        grew = true;
      }
    }
  }
  return (rows || []).filter((r) => ids.has(r.id));
}

/** 0 = under heading/top, 1 = part under item, 2 = part under part. */
function itemNestDepth(rows, r) {
  let depth = 0;
  let cur = r;
  for (let g = 0; g < 6 && cur?.parent_row_id; g += 1) {
    const p = byId(rows, cur.parent_row_id);
    if (!p || p.row_type === 'heading') break;
    if (p.row_type === 'item') depth += 1;
    cur = p;
  }
  return depth;
}

/**
 * Drop dragged row (with its subtree) relative to target.
 * after=true: place after target; just below a heading → inside heading;
 * beside a part → same parent (siblings). Nesting under an item uses addsub.
 */
export function dropRow(rows, fromId, targetId, after) {
  if (!fromId || fromId === targetId) return rows;
  const dragged = byId(rows, fromId);
  const target = byId(rows, targetId);
  if (!dragged || !target) return rows;
  const block = collectBlock(rows, fromId);
  if (block.some((b) => b.id === targetId)) return rows;

  let next = rows.filter((r) => !block.includes(r));
  let ti = next.findIndex((r) => r.id === targetId);
  if (ti < 0) return rows;

  let parent = target.parent_row_id ?? null;
  if (target.row_type === 'heading' && after) parent = target.id;
  if (target.row_type === 'heading' && !after) parent = null;

  if (after) {
    ti += 1;
    // Skip past target's full descendant block when not becoming its child
    if (parent !== target.id) {
      while (ti < next.length && isDescendantOf(next, next[ti].id, target.id)) ti += 1;
      while (ti < next.length && next[ti].parent_row_id === target.id) ti += 1;
    }
  }

  if (dragged.row_type === 'heading') parent = null;

  // Cap nest depth at 2 (item → part → sub-part). Deeper drops become siblings.
  if (parent && dragged.row_type === 'item') {
    const parentRow = byId(next, parent) || byId(rows, parent);
    if (parentRow?.row_type === 'item' && itemNestDepth(rows, parentRow) >= 2) {
      parent = parentRow.parent_row_id ?? null;
    }
  }

  const moved = block.map((b, i) => (i === 0 ? { ...b, parent_row_id: parent } : b));
  next.splice(ti, 0, ...moved);
  return next;
}

export function moveRowKeyboard(rows, id, dir) {
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return rows;
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  const block = collectBlock(next, id);
  const blockIds = new Set(block.map((b) => b.id));
  // Swap only the lead row with neighbor lead (keep parts glued)
  if (blockIds.has(next[j].id)) return rows;
  const without = next.filter((r) => !blockIds.has(r.id));
  let insertAt = without.findIndex((r) => r.id === next[j].id);
  if (insertAt < 0) return rows;
  if (dir === 'down') {
    const neighBlock = collectBlock(next, next[j].id);
    insertAt = without.findIndex((r) => r.id === next[j].id) + 1;
    // place after neighbor's full block in `without` — neighbor block still in without
    let k = insertAt;
    while (k < without.length && without[k].parent_row_id === next[j].id) k += 1;
    insertAt = k;
  }
  without.splice(insertAt, 0, ...block);
  return without;
}

function insertAfterGroup(rows, afterIdx, groupId, row) {
  let pos = afterIdx;
  for (let k = afterIdx + 1; k < rows.length; k += 1) {
    const x = rows[k];
    if (x.parent_row_id === groupId || isDescendantOf(rows, x.id, groupId)) {
      pos = k;
      continue;
    }
    break;
  }
  const next = [...rows];
  next.splice(pos + 1, 0, row);
  return next;
}

export function applyRowAction(rows, id, act) {
  if (!act) return rows;
  const i = rows.findIndex((x) => x.id === id);
  if (i < 0) return rows;
  const r = rows[i];
  let next = [...rows];

  if (act === 'inside' && i > 0) {
    const above = next[i - 1];
    const groupId = above.row_type === 'heading' ? above.id : above.parent_row_id || above.id;
    if (groupId === r.id) return rows;
    if (r.row_type === 'heading') return rows;
    next.splice(i, 1);
    const moved = { ...r, parent_row_id: groupId };
    const gi = next.findIndex((x) => x.id === groupId);
    return insertAfterGroup(next, gi, groupId, moved);
  }

  if (act === 'out') {
    next[i] = { ...r, parent_row_id: null };
    return next;
  }

  if (act === 'addpart' || act === 'addsub') {
    // + : heading → item; item → part; part → sub-part (a.1); at max depth → sibling
    if (r.row_type === 'heading') {
      const child = createEmptyRow('item', id);
      return insertAfterGroup(next, i, id, child);
    }
    if (r.row_type === 'item') {
      if (itemNestDepth(next, r) >= 2) {
        const sibling = createEmptyRow('item', r.parent_row_id);
        return insertAfterGroup(next, i, r.parent_row_id, sibling);
      }
      const child = createEmptyRow('item', id);
      return insertAfterGroup(next, i, id, child);
    }
  }

  if (act === 'del') {
    const blockIds = new Set(collectBlock(next, id).map((b) => b.id));
    return next.filter((x) => !blockIds.has(x.id));
  }

  return next;
}

export function addTopLevelRow(rows, rowType) {
  return [...rows, createEmptyRow(rowType, null)];
}

export function rewriteSortOrders(rows) {
  return (rows || []).map((r, i) => ({ ...r, sort_order: i }));
}

/** Bajaj-style acceptance fixture (subset) — totals for full PDF are tested separately. */
export function buildPumpHouseExample() {
  const h = createEmptyRow('heading');
  h.description = 'FIRE WATER PUMP HOUSE';
  const a = createEmptyRow('item', h.id);
  Object.assign(a, {
    description: 'Main fire pump, 273 m³/hr, 80 m head',
    unit: 'set',
    qty: 1,
    supply_rate: 492195,
    install_rate: 33750,
  });
  const b = createEmptyRow('item', h.id);
  Object.assign(b, {
    description: 'Jockey fire pump, 10.8 m³/hr, 70 m head',
    unit: 'set',
    qty: 1,
    supply_rate: 145836,
    install_rate: 20250,
  });
  const c = createEmptyRow('item', h.id);
  Object.assign(c, {
    description: 'ERW GI pipes, 5 mm thick, with fittings and fixing',
    unit: '',
    qty: 0,
  });
  const p1 = createEmptyRow('item', c.id);
  Object.assign(p1, {
    description: '300 mm nominal dia',
    unit: 'Mtr',
    qty: 12,
    supply_rate: 8477,
    install_rate: 2214,
  });
  const p2 = createEmptyRow('item', c.id);
  Object.assign(p2, {
    description: '250 mm nominal dia',
    unit: 'Mtr',
    qty: 12,
    supply_rate: 6553,
    install_rate: 1890,
  });
  const p3 = createEmptyRow('item', c.id);
  Object.assign(p3, {
    description: '150 mm nominal dia',
    unit: 'Mtr',
    qty: 12,
    supply_rate: 3356,
    install_rate: 1134,
  });
  const d = createEmptyRow('item', h.id);
  Object.assign(d, {
    description: 'Air vessel 450 mm x 1500 mm',
    unit: 'Nu',
    qty: 1,
    supply_rate: 82033,
    install_rate: 3375,
  });
  return [h, a, b, c, p1, p2, p3, d];
}
