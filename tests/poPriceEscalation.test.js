import { describe, it, expect } from 'vitest';
import {
  applyEscalationToAmount,
  buildPricingPeriods,
  escalateCategoryRates,
  ESCALATION_TYPE_FIXED,
  ESCALATION_TYPE_PERCENTAGE,
  generateEscalationDates,
  pricingPeriodMonths,
  resolveEffectivePricing,
  resolveCategoryRateForBilling,
  validatePoEffectiveDate,
  validateEscalationSchedule,
  emptyEscalationEvent,
} from '../src/utils/poPriceEscalation.js';

const basePo = {
  startDate: '2026-04-01',
  endDate: '2029-03-31',
  poEffectiveDate: '2026-04-01',
  monthlyValue: 50000,
  totalContractValue: 1800000,
  ratePerCategory: [
    { description: 'Security Guard', qty: 1, rate: 20000 },
    { description: 'Supervisor', qty: 1, rate: 30000 },
  ],
  priceEscalationEnabled: false,
  priceEscalationSchedule: [],
};

describe('poPriceEscalation', () => {
  it('identity path when escalation disabled matches base monthly and rates', () => {
    const resolved = resolveEffectivePricing(basePo, '2027-05-01');
    expect(resolved.enabled).toBe(false);
    expect(resolved.monthlyValue).toBe(50000);
    expect(resolved.categoryRates[0].rate).toBe(20000);
  });

  it('percentage escalation compounds from previous effective rate', () => {
    expect(applyEscalationToAmount(50000, ESCALATION_TYPE_PERCENTAGE, 10)).toBe(55000);
    expect(applyEscalationToAmount(55000, ESCALATION_TYPE_PERCENTAGE, 5)).toBe(57750);
  });

  it('fixed amount escalation', () => {
    expect(applyEscalationToAmount(50000, ESCALATION_TYPE_FIXED, 5000)).toBe(55000);
  });

  it('rejects non-positive results', () => {
    expect(applyEscalationToAmount(100, ESCALATION_TYPE_FIXED, -200)).toBeNull();
    expect(applyEscalationToAmount(100, ESCALATION_TYPE_PERCENTAGE, 0)).toBeNull();
  });

  it('builds pricing periods for two escalations and projects contract value', () => {
    const po = {
      ...basePo,
      priceEscalationEnabled: true,
      priceEscalationSchedule: [
        emptyEscalationEvent({
          id: 'e1',
          effectiveDate: '2027-04-01',
          escalationType: ESCALATION_TYPE_PERCENTAGE,
          escalationValue: 10,
        }),
        emptyEscalationEvent({
          id: 'e2',
          effectiveDate: '2028-10-01',
          escalationType: ESCALATION_TYPE_PERCENTAGE,
          escalationValue: 5,
        }),
      ],
    };
    const built = buildPricingPeriods(po);
    expect(built.periods.length).toBe(3);
    expect(built.periods[0].monthlyValue).toBe(50000);
    expect(built.periods[1].monthlyValue).toBe(55000);
    expect(built.periods[2].monthlyValue).toBe(57750);
    expect(built.periods[0].startDate).toBe('2026-04-01');
    expect(built.periods[0].endDate).toBe('2027-03-31');
    expect(built.periods[1].startDate).toBe('2027-04-01');
    expect(built.periods[1].endDate).toBe('2028-09-30');
    expect(built.periods[2].startDate).toBe('2028-10-01');
    expect(built.periods[2].endDate).toBe('2029-03-31');
    // 12*50000 + 18*55000 + 6*57750 = 600000 + 990000 + 346500 = 1936500
    expect(built.projectedContractValue).toBe(1936500);
  });

  it('resolves billing rate after escalation date', () => {
    const po = {
      ...basePo,
      priceEscalationEnabled: true,
      priceEscalationSchedule: [
        emptyEscalationEvent({
          effectiveDate: '2027-04-01',
          escalationType: ESCALATION_TYPE_PERCENTAGE,
          escalationValue: 10,
        }),
      ],
    };
    expect(resolveEffectivePricing(po, '2026-05-01').monthlyValue).toBe(50000);
    expect(resolveEffectivePricing(po, '2027-05-01').monthlyValue).toBe(55000);
    expect(
      resolveCategoryRateForBilling(po, { description: 'Security Guard', rate: 20000 }, '2027-05-01')
    ).toBe(22000);
    expect(
      resolveCategoryRateForBilling(po, { description: 'Security Guard', rate: 20000 }, '2026-05-01')
    ).toBe(20000);
  });

  it('escalates category rates from previous effective rates', () => {
    const once = escalateCategoryRates(basePo.ratePerCategory, ESCALATION_TYPE_PERCENTAGE, 10);
    expect(once[0].rate).toBe(22000);
    const twice = escalateCategoryRates(once, ESCALATION_TYPE_PERCENTAGE, 5);
    expect(twice[0].rate).toBe(23100);
  });

  it('validates effective date and duplicate escalation dates', () => {
    expect(
      validatePoEffectiveDate({ poEffectiveDate: '2030-01-01', endDate: '2029-03-31' })
    ).toMatch(/cannot be after/i);
    const errs = validateEscalationSchedule({
      ...basePo,
      priceEscalationEnabled: true,
      priceEscalationSchedule: [
        emptyEscalationEvent({ effectiveDate: '2027-04-01', escalationValue: 10 }),
        emptyEscalationEvent({ effectiveDate: '2027-04-01', escalationValue: 5 }),
      ],
    });
    expect(errs.some((e) => /duplicate/i.test(e))).toBe(true);
  });

  it('FY-style month duration matches POEntry anniversary rule', () => {
    expect(pricingPeriodMonths('2026-04-01', '2027-03-31')).toBe(12);
    expect(pricingPeriodMonths('2026-04-01', '2029-03-31')).toBe(36);
  });

  it('generates shortcut dates without persisting interval type', () => {
    const dates = generateEscalationDates({
      fromDate: '2026-04-01',
      untilDate: '2029-03-31',
      everyMonths: 12,
    });
    expect(dates).toEqual(['2027-04-01', '2028-04-01']);
  });

  it('regression: escalation off leaves projected path unused for rates', () => {
    const rate = resolveCategoryRateForBilling(
      basePo,
      { description: 'Security Guard', rate: 20000 },
      '2028-01-01'
    );
    expect(rate).toBe(20000);
  });
});
