import { describe, it, expect } from 'vitest';
import {
  CYCLE_STATUS,
  deriveCyclePeriodStatus,
  enrichTrackerPeriodsWithInvoices,
  expectedStoredMonthlyPeriod,
  isValidMonthlyCyclePeriod,
  resolvePoTrackerCycleType,
} from '../src/utils/billingCycleTracker.js';

describe('deriveCyclePeriodStatus', () => {
  it('cycle_in_progress before due', () => {
    expect(
      deriveCyclePeriodStatus({
        invoiceId: null,
        dueDate: '2026-08-15',
        todayIso: '2026-08-10',
      })
    ).toBe(CYCLE_STATUS.CYCLE_IN_PROGRESS);
  });

  it('not_raised after due with no invoice', () => {
    expect(
      deriveCyclePeriodStatus({
        invoiceId: null,
        dueDate: '2026-08-01',
        todayIso: '2026-08-10',
      })
    ).toBe(CYCLE_STATUS.NOT_RAISED);
  });

  it('raised_on_time / raised_late from invoice issue date', () => {
    expect(
      deriveCyclePeriodStatus({
        invoiceId: 'inv-1',
        raisedDate: '2026-07-28',
        dueDate: '2026-08-07',
        todayIso: '2026-08-10',
      })
    ).toBe(CYCLE_STATUS.RAISED_ON_TIME);
    expect(
      deriveCyclePeriodStatus({
        invoiceId: 'inv-1',
        raisedDate: '2026-08-10',
        dueDate: '2026-08-07',
        todayIso: '2026-08-10',
      })
    ).toBe(CYCLE_STATUS.RAISED_LATE);
  });

  it('cancel/unlink after due → not_raised (not blank)', () => {
    expect(
      deriveCyclePeriodStatus({
        invoiceId: null,
        raisedDate: null,
        dueDate: '2026-07-31',
        todayIso: '2026-08-10',
        manuallyRaised: false,
      })
    ).toBe(CYCLE_STATUS.NOT_RAISED);
  });

  it('manual mark without invoice; real invoice wins when both present', () => {
    expect(
      deriveCyclePeriodStatus({
        invoiceId: null,
        manuallyRaised: true,
        manualRaisedDate: '2026-08-02',
        dueDate: '2026-08-07',
        todayIso: '2026-08-10',
      })
    ).toBe(CYCLE_STATUS.RAISED_ON_TIME);
    expect(
      deriveCyclePeriodStatus({
        invoiceId: 'inv-2',
        raisedDate: '2026-08-09',
        manuallyRaised: true,
        manualRaisedDate: '2026-08-02',
        dueDate: '2026-08-07',
        todayIso: '2026-08-10',
      })
    ).toBe(CYCLE_STATUS.RAISED_LATE);
  });
});

describe('mid-cycle onboarding period clip (option a)', () => {
  it('onboarded 15 Jul → stores 15 Jul–31 Jul, accepts matching invoice, raised_on_time', () => {
    const onboarded = '2026-07-15';
    const exp = expectedStoredMonthlyPeriod(onboarded, '2026-07-20');
    expect(exp).toEqual({
      periodStart: '2026-07-15',
      periodEnd: '2026-07-31',
      canonicalStart: '2026-07-01',
      canonicalEnd: '2026-07-31',
    });

    expect(isValidMonthlyCyclePeriod(onboarded, '2026-07-15', '2026-07-31')).toBe(true);
    // Full-month invoice must NOT match clipped first period
    expect(isValidMonthlyCyclePeriod(onboarded, '2026-07-01', '2026-07-31')).toBe(false);
    // Later full month after onboard is fine
    expect(isValidMonthlyCyclePeriod(onboarded, '2026-08-01', '2026-08-31')).toBe(true);
    expect(isValidMonthlyCyclePeriod(onboarded, '2026-07-15', '2026-08-31')).toBe(false);

    const dueDate = '2026-08-07'; // 31 Jul + 7 days offset
    expect(
      deriveCyclePeriodStatus({
        invoiceId: 'inv-mid',
        raisedDate: '2026-07-20',
        dueDate,
        todayIso: '2026-08-10',
      })
    ).toBe(CYCLE_STATUS.RAISED_ON_TIME);
  });
});

describe('resolvePoTrackerCycleType (AMC null billing_cycle)', () => {
  it('does not invent monthly from null billing_cycle when billing_frequency=quarterly', () => {
    expect(
      resolvePoTrackerCycleType({
        billing_cycle: null,
        billingFrequency: 'quarterly',
        vertical: 'AMC',
      })
    ).toEqual({ cycleType: 'quarterly', source: 'billing_frequency' });
  });

  it('uses billing_cycle days only when explicitly set', () => {
    expect(resolvePoTrackerCycleType({ billing_cycle: 90 })).toEqual({
      cycleType: 'quarterly',
      source: 'billing_cycle',
    });
    expect(resolvePoTrackerCycleType({ billing_cycle: 30 })).toEqual({
      cycleType: 'monthly',
      source: 'billing_cycle',
    });
  });

  it('null billing_cycle without frequency does not pretend to know via COALESCE 30', () => {
    expect(resolvePoTrackerCycleType({ billing_cycle: null, vertical: 'AMC' })).toEqual({
      cycleType: 'monthly',
      source: 'default_monthly_no_signal',
    });
  });

  it('infers quarterly from remarks when no dedicated field', () => {
    expect(
      resolvePoTrackerCycleType({
        billing_cycle: null,
        remarks: 'Billed quarterly per contract',
      })
    ).toEqual({ cycleType: 'quarterly', source: 'text_infer' });
  });
});

describe('enrichTrackerPeriodsWithInvoices', () => {
  it('marks period raised when a tax invoice exists for that site + month', () => {
    const periods = [
      {
        periodId: 'p1',
        siteId: 'SITE-1',
        poId: 'po-1',
        ocNumber: 'IFSPL-MANP-1',
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        dueDate: '2026-08-07',
        invoiceId: null,
        derivedStatus: CYCLE_STATUS.NOT_RAISED,
      },
    ];
    const invoices = [
      {
        id: 'inv-1',
        siteId: 'SITE-1',
        poId: 'po-1',
        invoiceKind: 'tax',
        totalAmount: 1000,
        billingDurationFrom: '2026-07-01',
        billingDurationTo: '2026-07-31',
        invoiceDate: '2026-07-20',
        taxInvoiceNumber: 'INV-001',
      },
    ];
    const out = enrichTrackerPeriodsWithInvoices(periods, invoices);
    expect(out[0].derivedStatus).toBe(CYCLE_STATUS.RAISED_ON_TIME);
    expect(out[0].invoiceId).toBe('inv-1');
    expect(out[0].taxInvoiceNumber).toBe('INV-001');
    expect(out[0].linkedFromInvoice).toBe(true);
  });
});
