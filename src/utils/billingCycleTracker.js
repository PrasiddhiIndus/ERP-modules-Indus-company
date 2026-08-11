/**
 * Client-side mirror of billing.derive_cycle_period_status (IST comparisons).
 * Server is source of truth; this is for unit tests and optimistic UI.
 */

export const CYCLE_STATUS = {
  CYCLE_IN_PROGRESS: 'cycle_in_progress',
  NOT_RAISED: 'not_raised',
  RAISED_ON_TIME: 'raised_on_time',
  RAISED_LATE: 'raised_late',
};

/** @param {string|Date} value @returns {string} YYYY-MM-DD */
export function toIsoDateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Derive period status. Pass `todayIso` (YYYY-MM-DD in Asia/Kolkata) for deterministic tests.
 * Policy after cancel/unlink: invoiceId null → compare dueDate vs today → not_raised if past due.
 */
export function deriveCyclePeriodStatus({
  invoiceId = null,
  raisedDate = null,
  dueDate,
  manuallyRaised = false,
  manualRaisedDate = null,
  todayIso,
}) {
  const today = toIsoDateOnly(todayIso) || toIsoDateOnly(new Date());
  const due = toIsoDateOnly(dueDate);

  if (invoiceId) {
    const raised = toIsoDateOnly(raisedDate);
    if (!raised) return CYCLE_STATUS.RAISED_ON_TIME;
    return raised <= due ? CYCLE_STATUS.RAISED_ON_TIME : CYCLE_STATUS.RAISED_LATE;
  }

  if (manuallyRaised && manualRaisedDate) {
    const raised = toIsoDateOnly(manualRaisedDate);
    return raised <= due ? CYCLE_STATUS.RAISED_ON_TIME : CYCLE_STATUS.RAISED_LATE;
  }

  return today <= due ? CYCLE_STATUS.CYCLE_IN_PROGRESS : CYCLE_STATUS.NOT_RAISED;
}

export const TRACKER_VERTICAL_CHIPS = [
  { code: 'all', label: 'All' },
  { code: 'manpower', label: 'Manpower' },
  { code: 'mm', label: 'Maintenance' },
  { code: 'fire_tender', label: 'Fire Tender' },
  { code: 'training', label: 'Training' },
  { code: 'others', label: 'Others' },
];

export function verticalLabel(code) {
  const hit = TRACKER_VERTICAL_CHIPS.find((c) => c.code === code);
  if (hit) return hit.label;
  const map = {
    rm: 'R&M',
    amc: 'AMC',
    iev: 'IEV',
    projects: 'Projects',
  };
  return map[code] || code || '—';
}

/** Month keys YYYY-MM between from/to inclusive. */
export function monthKeysBetween(fromIso, toIso) {
  const from = toIsoDateOnly(fromIso);
  const to = toIsoDateOnly(toIso);
  if (!from || !to) return [];
  const keys = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

export function periodMonthKey(periodStart) {
  const s = toIsoDateOnly(periodStart);
  return s ? s.slice(0, 7) : '';
}

/** Mirror of billing.cycle_period_bounds for monthly (tests). */
export function monthlyCanonicalBounds(anchorIso) {
  const s = toIsoDateOnly(anchorIso);
  if (!s) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const endDate = new Date(y, m, 0); // last day of month
  return { periodStart: start, periodEnd: toIsoDateOnly(endDate) };
}

/**
 * Mirror of billing.expected_stored_cycle_period for monthly mid-cycle clip.
 * First period stores onboarded_on → canonical_end (not full 01–31).
 */
export function expectedStoredMonthlyPeriod(onboardedOnIso, anchorIso) {
  const bounds = monthlyCanonicalBounds(anchorIso);
  if (!bounds) return null;
  const onboarded = toIsoDateOnly(onboardedOnIso);
  if (bounds.periodEnd < onboarded) return null;
  const periodStart =
    onboarded > bounds.periodStart && onboarded <= bounds.periodEnd
      ? onboarded
      : bounds.periodStart;
  return {
    periodStart,
    periodEnd: bounds.periodEnd,
    canonicalStart: bounds.periodStart,
    canonicalEnd: bounds.periodEnd,
  };
}

export function isValidMonthlyCyclePeriod(onboardedOnIso, fromIso, toIso) {
  const exp = expectedStoredMonthlyPeriod(onboardedOnIso, fromIso);
  if (!exp) return false;
  return (
    toIsoDateOnly(fromIso) === exp.periodStart && toIsoDateOnly(toIso) === exp.periodEnd
  );
}

/**
 * Mirror of billing.resolve_po_tracker_cycle_type — never invents billing_cycle=30.
 * @returns {{ cycleType: 'monthly'|'quarterly', source: string }}
 */
export function resolvePoTrackerCycleType(po = {}) {
  const freq = String(po.billingFrequency ?? po.billing_frequency ?? '')
    .trim()
    .toLowerCase();
  if (freq === 'monthly' || freq === 'quarterly') {
    return { cycleType: freq, source: 'billing_frequency' };
  }

  const daysRaw = po.billingCycle ?? po.billing_cycle;
  if (daysRaw != null && daysRaw !== '') {
    const days = Number(daysRaw);
    if (Number.isFinite(days) && days > 0) {
      return {
        cycleType: days >= 75 ? 'quarterly' : 'monthly',
        source: 'billing_cycle',
      };
    }
  }

  const blob = [
    po.paymentTerms ?? po.payment_terms,
    po.remarks,
    po.serviceDescription ?? po.service_description,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  if (/(quarterly|quarter\b|qtr\b|every\s*3\s*month|3\s*months)/.test(blob)) {
    return { cycleType: 'quarterly', source: 'text_infer' };
  }
  if (/(monthly|every\s*month|per\s*month)/.test(blob)) {
    return { cycleType: 'monthly', source: 'text_infer' };
  }

  return { cycleType: 'monthly', source: 'default_monthly_no_signal' };
}

/** Qualifying tax invoice for tracker raised status (mirrors DB policy). */
export function invoiceQualifiesForTracker(inv) {
  if (!inv) return false;
  if (inv.isCancelled || inv.is_cancelled) return false;
  if (inv.isAddOn || inv.is_add_on) return false;
  const kind = String(inv.invoiceKind || inv.invoice_kind || 'tax')
    .trim()
    .toLowerCase();
  if (kind && kind !== 'tax') return false;
  if (Number(inv.totalAmount ?? inv.total_amount ?? 0) <= 0) return false;
  return true;
}

/**
 * Match invoice → period by site/PO/OC and service month (or exact/overlapping dates).
 * Month match covers historical invoices that never hit the DB link trigger.
 */
export function invoiceMatchesPeriod(inv, period) {
  if (!inv || !period) return false;

  const invSite = String(inv.siteId || inv.site_id || '').trim();
  const periodSite = String(period.siteId || '').trim();
  const invPo = String(inv.poId || inv.po_id || '').trim();
  const periodPo = String(period.poId || '').trim();
  const invOc = String(inv.ocNumber || inv.oc_number || '').trim();
  const periodOc = String(period.ocNumber || '').trim();

  const siteOk = invSite && periodSite && invSite === periodSite;
  const poOk = invPo && periodPo && invPo === periodPo;
  const ocOk = invOc && periodOc && invOc === periodOc;
  if (!siteOk && !poOk && !ocOk) return false;

  const from = toIsoDateOnly(inv.billingDurationFrom || inv.billing_duration_from);
  const to = toIsoDateOnly(inv.billingDurationTo || inv.billing_duration_to);
  const pFrom = toIsoDateOnly(period.periodStart);
  const pTo = toIsoDateOnly(period.periodEnd);

  if (from && to && pFrom && pTo && from === pFrom && to === pTo) return true;
  if (from && pFrom && periodMonthKey(from) === periodMonthKey(pFrom)) return true;
  if (from && to && pFrom && pTo && from <= pTo && to >= pFrom) return true;
  return false;
}

/**
 * Overlay created invoices onto tracker periods so months with a tax invoice show as raised
 * even when billing_cycle_period.invoice_id was never linked by the trigger.
 */
export function enrichTrackerPeriodsWithInvoices(periods, invoices) {
  const qualifying = (invoices || [])
    .filter(invoiceQualifiesForTracker)
    .slice()
    .sort((a, b) => {
      const da = toIsoDateOnly(a.invoiceDate || a.invoice_date) || '';
      const db = toIsoDateOnly(b.invoiceDate || b.invoice_date) || '';
      if (da !== db) return da.localeCompare(db);
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

  const usedInvoiceIds = new Set();

  return (periods || []).map((period) => {
    if (period.invoiceId) {
      usedInvoiceIds.add(String(period.invoiceId));
      return {
        ...period,
        derivedStatus: deriveCyclePeriodStatus({
          invoiceId: period.invoiceId,
          raisedDate: period.raisedDate || period.invoiceIssueDate,
          dueDate: period.dueDate,
          manuallyRaised: period.manuallyRaised,
          manualRaisedDate: period.manualRaisedDate,
        }),
      };
    }

    const match = qualifying.find((inv) => {
      const id = String(inv.id || '');
      if (id && usedInvoiceIds.has(id)) return false;
      return invoiceMatchesPeriod(inv, period);
    });

    if (!match) {
      return {
        ...period,
        derivedStatus: deriveCyclePeriodStatus({
          invoiceId: null,
          raisedDate: null,
          dueDate: period.dueDate,
          manuallyRaised: period.manuallyRaised,
          manualRaisedDate: period.manualRaisedDate,
        }),
      };
    }

    const invoiceId = match.id;
    if (invoiceId) usedInvoiceIds.add(String(invoiceId));
    const raisedDate = toIsoDateOnly(match.invoiceDate || match.invoice_date);
    return {
      ...period,
      invoiceId,
      raisedDate,
      taxInvoiceNumber: match.taxInvoiceNumber || match.tax_invoice_number || null,
      invoiceIssueDate: raisedDate,
      linkedFromInvoice: true,
      derivedStatus: deriveCyclePeriodStatus({
        invoiceId,
        raisedDate,
        dueDate: period.dueDate,
        manuallyRaised: period.manuallyRaised,
        manualRaisedDate: period.manualRaisedDate,
      }),
    };
  });
}

