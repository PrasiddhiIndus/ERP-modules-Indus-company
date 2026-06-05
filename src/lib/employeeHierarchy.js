/**
 * L1/L2 manager validation for admin_ifsp_employee_master (parity with bulk_upsert_employee_hierarchy).
 */

export function normalizeManagerCode(value) {
  const s = String(value ?? '').trim();
  return s ? s.toLowerCase() : '';
}

export function isActiveEmployeeRow(row) {
  const st = String(row?.status ?? 'Active').trim().toLowerCase();
  return st === 'active' || st === '';
}

/** Match employee_code or employee_id (case-insensitive trim). */
export function findEmployeeByManagerCode(employees, codeInput) {
  const norm = normalizeManagerCode(codeInput);
  if (!norm) return null;
  return (
    (employees || []).find((row) => {
      if (!isActiveEmployeeRow(row)) return false;
      const code = normalizeManagerCode(row.employee_code);
      const sysId = normalizeManagerCode(row.employee_id);
      return code === norm || sysId === norm;
    }) || null
  );
}

export function managerOptionLabel(row) {
  const name = String(row?.full_name || '').trim() || '—';
  const code = String(row?.employee_code || row?.employee_id || '').trim();
  return code ? `${name} (${code})` : name;
}

/**
 * Resolve L1/L2 input to stored code + display name.
 * Prefers employee_code on the matched row when present.
 */
export function resolveManagerReference(employees, codeInput) {
  const raw = String(codeInput ?? '').trim();
  if (!raw) {
    return { code: null, name: null };
  }
  const match = findEmployeeByManagerCode(employees, raw);
  if (!match) {
    return { code: null, name: null, error: `No active employee found for manager code "${raw}".` };
  }
  const code = String(match.employee_code || match.employee_id || '').trim();
  const name = String(match.full_name || '').trim() || null;
  return { code, name, error: null };
}

function subjectKeys(subject) {
  const keys = new Set();
  const code = normalizeManagerCode(subject?.employee_code);
  const sysId = normalizeManagerCode(subject?.employee_id);
  if (code) keys.add(code);
  if (sysId) keys.add(sysId);
  return keys;
}

function managerKeyForRow(row) {
  return normalizeManagerCode(row?.employee_code) || normalizeManagerCode(row?.employee_id);
}

/**
 * Walk L1 chain from startCode; return true if subject would be an ancestor (cycle).
 */
export function wouldCreateReportingCycle(employees, { subject, startManagerCode }) {
  const subjectKeySet = subjectKeys(subject);
  if (!subjectKeySet.size) return false;

  const byManagerKey = new Map();
  for (const row of employees || []) {
    if (!isActiveEmployeeRow(row)) continue;
    const key = managerKeyForRow(row);
    if (key) byManagerKey.set(key, row);
  }

  const visited = new Set();
  let current = normalizeManagerCode(startManagerCode);
  for (let depth = 0; depth < 64 && current; depth += 1) {
    if (subjectKeySet.has(current)) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    const row = byManagerKey.get(current);
    if (!row) break;
    current = normalizeManagerCode(row.l1_manager_code);
  }
  return false;
}

export function parseHierarchySortOrder(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { value: null, error: null };
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    return { value: null, error: 'Hierarchy Sr.No must be a non-negative whole number.' };
  }
  return { value: n, error: null };
}

export function suggestNextHierarchySortOrder(employees) {
  let max = 0;
  for (const row of employees || []) {
    const n = Number(row?.hierarchy_sort_order);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/**
 * Validate hierarchy fields before save.
 * @returns {{ ok: boolean, message?: string, fields?: object }}
 */
export function validateEmployeeHierarchy(employees, input) {
  const {
    employee_code: subjectCode,
    employee_id: subjectId,
    l1_manager_code: l1Raw,
    l2_manager_code: l2Raw,
    hierarchy_sort_order: sortRaw,
  } = input;

  const subject = { employee_code: subjectCode, employee_id: subjectId };
  const subjectNorm = new Set(subjectKeys(subject));

  const l1Trim = String(l1Raw ?? '').trim();
  const l2Trim = String(l2Raw ?? '').trim();

  if (l1Trim && subjectNorm.has(normalizeManagerCode(l1Trim))) {
    return { ok: false, message: 'L1 Manager cannot be the same employee.' };
  }
  if (l2Trim && subjectNorm.has(normalizeManagerCode(l2Trim))) {
    return { ok: false, message: 'L2 Manager cannot be the same employee.' };
  }

  const l1 = resolveManagerReference(employees, l1Trim);
  if (l1Trim && !l1.code) {
    return { ok: false, message: l1.error || 'Invalid L1 Manager.' };
  }

  const l2 = resolveManagerReference(employees, l2Trim);
  if (l2Trim && !l2.code) {
    return { ok: false, message: l2.error || 'Invalid L2 Manager.' };
  }

  if (l1.code && l2.code && normalizeManagerCode(l1.code) === normalizeManagerCode(l2.code)) {
    return { ok: false, message: 'L2 Manager should be different from L1 Manager (skip-level).' };
  }

  if (l1.code && wouldCreateReportingCycle(employees, { subject, startManagerCode: l1.code })) {
    return {
      ok: false,
      message: 'L1 Manager would create a circular reporting line. Choose a different manager.',
    };
  }

  const sort = parseHierarchySortOrder(sortRaw);
  if (sort.error) {
    return { ok: false, message: sort.error };
  }

  return {
    ok: true,
    fields: {
      l1_manager_code: l1.code,
      l1_manager_name: l1.name,
      l2_manager_code: l2.code,
      l2_manager_name: l2.name,
      hierarchy_sort_order: sort.value,
    },
  };
}
