/**
 * Effective-dated price escalation for Commercial Manpower / Training POs.
 *
 * Source of truth when enabled:
 *   PO base pricing (monthlyValue + ratePerCategory)
 *   + poEffectiveDate
 *   + priceEscalationSchedule[]
 *
 * When priceEscalationEnabled is false / missing → identity path (no behavior change).
 */

export const ESCALATION_TYPE_PERCENTAGE = 'percentage';
export const ESCALATION_TYPE_FIXED = 'fixed';

export const ESCALATION_STATUS_UPCOMING = 'upcoming';
export const ESCALATION_STATUS_ACTIVE = 'active';
export const ESCALATION_STATUS_APPLIED = 'applied';
export const ESCALATION_STATUS_CANCELLED = 'cancelled';
export const ESCALATION_STATUS_SUPERSEDED = 'superseded';

export const PRICE_ESCALATION_HISTORY_EVENT = '__price_escalation__';

export function roundMoney2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function parseLocalDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d) return dt;
    return null;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

export function toIsoDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : parseLocalDate(d);
  if (!dt) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function exactCalendarMonths(start, endExclusive) {
  if (start.getDate() !== endExclusive.getDate()) return null;
  const months =
    (endExclusive.getFullYear() - start.getFullYear()) * 12 +
    (endExclusive.getMonth() - start.getMonth());
  return months >= 0 ? months : null;
}

/**
 * Inclusive calendar-month duration matching POEntry.contractDurationMonths.
 * Used for pricing-period contract value when escalation is enabled.
 */
export function pricingPeriodMonths(startDate, endDate) {
  const s = parseLocalDate(startDate);
  const e = parseLocalDate(endDate);
  if (!s || !e || e < s) return null;

  const endExclusive = addDays(e, 1);
  const monthsOnExclusive = exactCalendarMonths(s, endExclusive);
  if (monthsOnExclusive != null && monthsOnExclusive > 0) return monthsOnExclusive;

  const monthsOnEnd = exactCalendarMonths(s, e);
  if (monthsOnEnd != null && monthsOnEnd > 0) return monthsOnEnd;

  if (s.getDate() === 1) {
    const lastDayOfEndMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
    if (e.getDate() === lastDayOfEndMonth && endExclusive.getDate() === 1) {
      const whole =
        (endExclusive.getFullYear() - s.getFullYear()) * 12 +
        (endExclusive.getMonth() - s.getMonth());
      if (whole > 0) return whole;
    }
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.round((e - s) / msPerDay) + 1;
  if (days <= 0) return null;
  const avgMonth = 30.436875;
  const months = days / avgMonth;
  const rounded = Math.round(months);
  if (Math.abs(months - rounded) < 0.02) return rounded;
  return Math.round(months * 10000) / 10000;
}

export function isPriceEscalationEnabled(po) {
  return po?.priceEscalationEnabled === true || po?.price_escalation_enabled === true;
}

export function normalizeEscalationType(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'fixed' || t === 'fixed_amount' || t === 'fixed amount increase') {
    return ESCALATION_TYPE_FIXED;
  }
  return ESCALATION_TYPE_PERCENTAGE;
}

export function emptyEscalationEvent(overrides = {}) {
  return {
    id: overrides.id || `esc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    poId: overrides.poId ?? null,
    effectiveDate: overrides.effectiveDate || '',
    escalationType: normalizeEscalationType(overrides.escalationType),
    escalationValue: overrides.escalationValue ?? '',
    previousMonthlyValue: overrides.previousMonthlyValue ?? null,
    newMonthlyValue: overrides.newMonthlyValue ?? null,
    previousContractValue: overrides.previousContractValue ?? null,
    newContractValue: overrides.newContractValue ?? null,
    previousCategoryRates: Array.isArray(overrides.previousCategoryRates)
      ? overrides.previousCategoryRates
      : [],
    newCategoryRates: Array.isArray(overrides.newCategoryRates) ? overrides.newCategoryRates : [],
    reason: overrides.reason || '',
    status: overrides.status || ESCALATION_STATUS_UPCOMING,
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? null,
    updatedBy: overrides.updatedBy ?? null,
    updatedAt: overrides.updatedAt ?? null,
    calculationBasis: overrides.calculationBasis || 'previous_effective',
  };
}

export function normalizeEscalationSchedule(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => emptyEscalationEvent(row || {}))
    .filter((row) => row.status !== ESCALATION_STATUS_CANCELLED)
    .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
}

export function applyEscalationToAmount(baseAmount, escalationType, escalationValue) {
  const base = Number(baseAmount);
  const value = Number(escalationValue);
  if (!Number.isFinite(base) || base < 0) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  const type = normalizeEscalationType(escalationType);
  let next;
  if (type === ESCALATION_TYPE_FIXED) {
    next = base + value;
  } else {
    next = base * (1 + value / 100);
  }
  if (!Number.isFinite(next) || next <= 0) return null;
  return roundMoney2(next);
}

export function escalateCategoryRates(rates, escalationType, escalationValue) {
  const list = Array.isArray(rates) ? rates : [];
  return list.map((row) => {
    const rate = Number(row?.rate);
    const nextRate = applyEscalationToAmount(rate, escalationType, escalationValue);
    const penalty = Number(row?.penalty);
    const nextPenalty =
      Number.isFinite(penalty) && penalty > 0
        ? applyEscalationToAmount(penalty, escalationType, escalationValue)
        : row?.penalty;
    return {
      ...row,
      rate: nextRate != null ? nextRate : rate,
      ...(nextPenalty != null ? { penalty: nextPenalty } : {}),
    };
  });
}

/**
 * Resolve pricing start date.
 * Business rule: existing monthly/contract duration uses startDate→endDate.
 * Escalation schedule anchors on poEffectiveDate when set; otherwise startDate.
 * Pricing periods for contract value are clipped to [max(effective, start), end].
 */
export function resolvePricingAnchorDate(po) {
  const effective = toIsoDate(po?.poEffectiveDate || po?.po_effective_date || '');
  const start = toIsoDate(po?.startDate || po?.start_date || '');
  if (effective) return effective;
  return start;
}

export function resolvePricingWindow(po) {
  const start = toIsoDate(po?.startDate || po?.start_date || '');
  const end = toIsoDate(po?.endDate || po?.end_date || '');
  const effective = resolvePricingAnchorDate(po);
  // Service engagement still uses startDate; price terms may start at effective date.
  // Period values only accrue where service and pricing overlap.
  const periodStart =
    effective && start ? (effective > start ? effective : start) : effective || start;
  return { effectiveDate: effective, startDate: start, endDate: end, periodStart };
}

export function validatePoEffectiveDate(po) {
  const effective = toIsoDate(po?.poEffectiveDate || po?.po_effective_date || '');
  const end = toIsoDate(po?.endDate || po?.end_date || '');
  if (!effective) return null;
  if (end && effective > end) {
    return 'PO Effective Date cannot be after PO End Date.';
  }
  return null;
}

export function validateEscalationSchedule(po, scheduleInput) {
  const errors = [];
  const window = resolvePricingWindow(po);
  const schedule = normalizeEscalationSchedule(scheduleInput ?? po?.priceEscalationSchedule);
  const seen = new Set();

  for (const esc of schedule) {
    if (!esc.effectiveDate) {
      errors.push('Each escalation needs an effective date.');
      continue;
    }
    if (window.effectiveDate && esc.effectiveDate < window.effectiveDate) {
      errors.push(`Escalation ${esc.effectiveDate} is before PO Effective Date.`);
    }
    if (window.endDate && esc.effectiveDate > window.endDate) {
      errors.push(`Escalation ${esc.effectiveDate} is after PO End Date.`);
    }
    if (seen.has(esc.effectiveDate)) {
      errors.push(`Duplicate escalation date ${esc.effectiveDate}.`);
    }
    seen.add(esc.effectiveDate);
    const value = Number(esc.escalationValue);
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`Escalation on ${esc.effectiveDate} needs a value greater than 0.`);
    }
  }
  return errors;
}

function baseMonthlyFromPo(po) {
  const n = Number(po?.monthlyValue ?? po?.monthly_value);
  return Number.isFinite(n) ? roundMoney2(n) : 0;
}

function baseRatesFromPo(po) {
  return Array.isArray(po?.ratePerCategory) ? po.ratePerCategory.map((r) => ({ ...r })) : [];
}

/**
 * Build chronological pricing periods from base + escalations.
 */
export function buildPricingPeriods(po, asOfDate = null) {
  if (!isPriceEscalationEnabled(po)) {
    const window = resolvePricingWindow(po);
    const monthly = baseMonthlyFromPo(po);
    const rates = baseRatesFromPo(po);
    if (!window.periodStart || !window.endDate) {
      return {
        enabled: false,
        periods: [],
        projectedContractValue: Number(po?.totalContractValue) || 0,
        currentMonthlyValue: monthly,
        currentCategoryRates: rates,
      };
    }
    const months = pricingPeriodMonths(window.periodStart, window.endDate);
    const periodValue =
      months != null && months > 0 ? roundMoney2(monthly * months) : Number(po?.totalContractValue) || 0;
    return {
      enabled: false,
      periods: [
        {
          startDate: window.periodStart,
          endDate: window.endDate,
          monthlyValue: monthly,
          categoryRates: rates,
          months,
          periodValue,
          source: 'base',
        },
      ],
      projectedContractValue: periodValue,
      currentMonthlyValue: monthly,
      currentCategoryRates: rates,
    };
  }

  const window = resolvePricingWindow(po);
  const schedule = normalizeEscalationSchedule(po?.priceEscalationSchedule || po?.price_escalation_schedule);
  let monthly = baseMonthlyFromPo(po);
  let rates = baseRatesFromPo(po);
  let cursor = window.effectiveDate || window.periodStart;
  const end = window.endDate;
  const periods = [];

  if (!cursor || !end) {
    return {
      enabled: true,
      periods: [],
      projectedContractValue: Number(po?.totalContractValue) || 0,
      currentMonthlyValue: monthly,
      currentCategoryRates: rates,
    };
  }

  const events = schedule.filter((e) => e.effectiveDate && e.effectiveDate <= end);

  for (let i = 0; i <= events.length; i += 1) {
    const nextEsc = events[i] || null;
    const periodEnd = nextEsc
      ? toIsoDate(addDays(parseLocalDate(nextEsc.effectiveDate), -1))
      : end;

    if (cursor && periodEnd && cursor <= periodEnd) {
      // Accrue only within service overlap [periodStart, end]
      const accrueStart =
        window.periodStart && cursor < window.periodStart ? window.periodStart : cursor;
      if (accrueStart <= periodEnd && accrueStart <= end) {
        const cappedEnd = periodEnd > end ? end : periodEnd;
        if (accrueStart <= cappedEnd) {
          const months = pricingPeriodMonths(accrueStart, cappedEnd);
          const periodValue =
            months != null && months > 0 ? roundMoney2(monthly * months) : 0;
          periods.push({
            startDate: accrueStart,
            endDate: cappedEnd,
            monthlyValue: monthly,
            categoryRates: rates.map((r) => ({ ...r })),
            months,
            periodValue,
            source: i === 0 ? 'base' : 'escalation',
            escalationId: i === 0 ? null : events[i - 1]?.id,
          });
        }
      }
    }

    if (!nextEsc) break;
    const prevMonthly = monthly;
    const prevRates = rates.map((r) => ({ ...r }));
    const nextMonthly = applyEscalationToAmount(
      monthly,
      nextEsc.escalationType,
      nextEsc.escalationValue
    );
    if (nextMonthly == null) break;
    monthly = nextMonthly;
    rates = escalateCategoryRates(prevRates, nextEsc.escalationType, nextEsc.escalationValue);
    cursor = nextEsc.effectiveDate;
  }

  const projectedContractValue = roundMoney2(
    periods.reduce((sum, p) => sum + (Number(p.periodValue) || 0), 0)
  );

  const asOf = toIsoDate(asOfDate) || toIsoDate(new Date());
  let currentMonthlyValue = baseMonthlyFromPo(po);
  let currentCategoryRates = baseRatesFromPo(po);
  for (const p of periods) {
    if (p.startDate <= asOf && asOf <= p.endDate) {
      currentMonthlyValue = p.monthlyValue;
      currentCategoryRates = p.categoryRates;
      break;
    }
    if (p.startDate > asOf) break;
    currentMonthlyValue = p.monthlyValue;
    currentCategoryRates = p.categoryRates;
  }

  return {
    enabled: true,
    periods,
    projectedContractValue,
    currentMonthlyValue,
    currentCategoryRates,
  };
}

/**
 * Resolve effective pricing for a billing date.
 * Identity path when escalation is disabled.
 */
export function resolveEffectivePricing(po, billingDate) {
  const asOf = toIsoDate(billingDate) || toIsoDate(new Date());
  if (!isPriceEscalationEnabled(po)) {
    return {
      enabled: false,
      asOf,
      monthlyValue: baseMonthlyFromPo(po),
      categoryRates: baseRatesFromPo(po),
      period: null,
      projectedContractValue: Number(po?.totalContractValue) || 0,
    };
  }

  const built = buildPricingPeriods(po, asOf);
  const period =
    built.periods.find((p) => p.startDate <= asOf && asOf <= p.endDate) ||
    built.periods.filter((p) => p.startDate <= asOf).slice(-1)[0] ||
    null;

  return {
    enabled: true,
    asOf,
    monthlyValue: period ? period.monthlyValue : built.currentMonthlyValue,
    categoryRates: period ? period.categoryRates : built.currentCategoryRates,
    period,
    periods: built.periods,
    projectedContractValue: built.projectedContractValue,
  };
}

/** Enrich schedule rows with computed previous/new rates for UI preview. */
export function enrichEscalationScheduleForDisplay(po) {
  const schedule = normalizeEscalationSchedule(po?.priceEscalationSchedule);
  let monthly = baseMonthlyFromPo(po);
  let rates = baseRatesFromPo(po);
  const asOf = toIsoDate(new Date());
  const enriched = [];

  for (const esc of schedule) {
    const previousMonthlyValue = monthly;
    const previousCategoryRates = rates.map((r) => ({ ...r }));
    const newMonthlyValue = applyEscalationToAmount(
      monthly,
      esc.escalationType,
      esc.escalationValue
    );
    const newCategoryRates = escalateCategoryRates(
      previousCategoryRates,
      esc.escalationType,
      esc.escalationValue
    );
    let status = esc.status;
    if (status !== ESCALATION_STATUS_CANCELLED && status !== ESCALATION_STATUS_SUPERSEDED) {
      status =
        esc.effectiveDate && esc.effectiveDate <= asOf
          ? ESCALATION_STATUS_ACTIVE
          : ESCALATION_STATUS_UPCOMING;
    }
    enriched.push({
      ...esc,
      previousMonthlyValue,
      newMonthlyValue,
      previousCategoryRates,
      newCategoryRates,
      status,
    });
    if (newMonthlyValue != null) {
      monthly = newMonthlyValue;
      rates = newCategoryRates;
    }
  }
  return enriched;
}

export function previewEscalation(po, draftEscalation) {
  const enriched = enrichEscalationScheduleForDisplay({
    ...po,
    priceEscalationEnabled: true,
    priceEscalationSchedule: normalizeEscalationSchedule([
      ...(Array.isArray(po?.priceEscalationSchedule) ? po.priceEscalationSchedule : []),
      emptyEscalationEvent(draftEscalation),
    ]),
  });
  const built = buildPricingPeriods({
    ...po,
    priceEscalationEnabled: true,
    priceEscalationSchedule: enriched,
  });
  const draft = enriched.find((e) => e.id === (draftEscalation?.id || enriched[enriched.length - 1]?.id));
  const periodIdx = built.periods.findIndex((p) => p.escalationId === draft?.id);
  const prevPeriod = periodIdx > 0 ? built.periods[periodIdx - 1] : built.periods[0];
  const newPeriod = periodIdx >= 0 ? built.periods[periodIdx] : null;

  return {
    currentEffectiveRate: draft?.previousMonthlyValue ?? baseMonthlyFromPo(po),
    escalationType: draft?.escalationType,
    escalationValue: draft?.escalationValue,
    effectiveFrom: draft?.effectiveDate,
    newEffectiveRate: draft?.newMonthlyValue,
    previousPricingPeriod: prevPeriod
      ? { startDate: prevPeriod.startDate, endDate: prevPeriod.endDate }
      : null,
    newPricingPeriod: newPeriod
      ? { startDate: newPeriod.startDate, endDate: newPeriod.endDate }
      : null,
    projectedContractValue: built.projectedContractValue,
    periods: built.periods,
  };
}

export function generateEscalationDates({ fromDate, untilDate, everyMonths }) {
  const start = parseLocalDate(fromDate);
  const until = parseLocalDate(untilDate);
  const step = Number(everyMonths);
  if (!start || !until || !Number.isFinite(step) || step <= 0) return [];
  const out = [];
  let cursor = new Date(start.getFullYear(), start.getMonth() + step, start.getDate());
  while (cursor <= until) {
    out.push(toIsoDate(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + step, start.getDate());
  }
  return out;
}

export function appendPriceEscalationHistory(updateHistory, payload) {
  const cleaned = Array.isArray(updateHistory) ? [...updateHistory] : [];
  cleaned.push({
    event: PRICE_ESCALATION_HISTORY_EVENT,
    at: new Date().toISOString(),
    ...payload,
  });
  return cleaned;
}

export function readPriceEscalationHistory(updateHistory) {
  return (Array.isArray(updateHistory) ? updateHistory : []).filter(
    (e) => e && typeof e === 'object' && e.event === PRICE_ESCALATION_HISTORY_EVENT
  );
}

/** Resolve category rate for invoice seeding (identity when escalation off). */
export function resolveCategoryRateForBilling(po, categoryRow, billingDate) {
  if (!isPriceEscalationEnabled(po)) {
    const n = Number(categoryRow?.rate);
    return Number.isFinite(n) ? n : 0;
  }
  const resolved = resolveEffectivePricing(po, billingDate);
  const desc = String(categoryRow?.description || '').trim().toLowerCase();
  const match = (resolved.categoryRates || []).find(
    (r) => String(r?.description || '').trim().toLowerCase() === desc
  );
  if (match) {
    const n = Number(match.rate);
    if (Number.isFinite(n)) return n;
  }
  const n = Number(categoryRow?.rate);
  return Number.isFinite(n) ? n : 0;
}
