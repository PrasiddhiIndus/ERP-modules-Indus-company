/** PF / ESIC / PT / TDS calculators — configurable rules. */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const DEFAULT_PF_CAP = 15000;
const DEFAULT_PF_RATE = 0.12;
const DEFAULT_ESIC_THRESHOLD = 21000;
const DEFAULT_ESIC_EMP_RATE = 0.0075;
const DEFAULT_ESIC_ER_RATE = 0.0325;

export function computePF({ pfWages, applicable = true, cap = DEFAULT_PF_CAP, rate = DEFAULT_PF_RATE }) {
  if (!applicable) {
    return { pfWages: 0, employeeContribution: 0, employerContribution: 0, epsContribution: 0, isCapped: false };
  }
  const wages = round2(pfWages);
  const cappedWages = Math.min(wages, cap);
  const employeeContribution = round2(cappedWages * rate);
  const employerContribution = round2(cappedWages * rate);
  const epsContribution = round2(cappedWages * 0.0833);
  return {
    pfWages: wages,
    employeeContribution,
    employerContribution,
    epsContribution,
    isCapped: wages > cap,
  };
}

export function computeESIC({
  esicWages,
  applicable = true,
  threshold = DEFAULT_ESIC_THRESHOLD,
  empRate = DEFAULT_ESIC_EMP_RATE,
  erRate = DEFAULT_ESIC_ER_RATE,
}) {
  if (!applicable || esicWages > threshold) {
    return {
      esicWages: round2(esicWages),
      employeeContribution: 0,
      employerContribution: 0,
      isEligible: applicable && esicWages <= threshold,
      thresholdApplied: threshold,
    };
  }
  const wages = round2(esicWages);
  return {
    esicWages: wages,
    employeeContribution: round2(wages * empRate),
    employerContribution: round2(wages * erRate),
    isEligible: true,
    thresholdApplied: threshold,
  };
}

export function computePTFromSlabs(grossMonthly, slabs = []) {
  const g = round2(grossMonthly);
  if (!Array.isArray(slabs) || !slabs.length) return 0;
  for (const slab of slabs) {
    const min = Number(slab.min) || 0;
    const max = slab.max == null ? Infinity : Number(slab.max);
    if (g >= min && g <= max) return round2(slab.amount);
  }
  return 0;
}

export function computeTDSMonthly({
  taxableMonthly,
  regime = 'new',
  slabs = [],
  standardDeductionAnnual = 75000,
  cessRate = 0.04,
}) {
  const annual = round2(taxableMonthly * 12);
  const taxable = Math.max(0, annual - standardDeductionAnnual);
  let tax = 0;
  let prev = 0;
  const sorted = [...slabs].sort((a, b) => (Number(a.min) || 0) - (Number(b.min) || 0));
  for (const slab of sorted) {
    const min = Number(slab.min) || 0;
    const max = slab.max == null ? Infinity : Number(slab.max);
    const rate = Number(slab.rate) || 0;
    if (taxable <= min) break;
    const upper = Math.min(taxable, max);
    const band = Math.max(0, upper - Math.max(prev, min - 1));
    tax += band * rate;
    prev = max;
  }
  tax = round2(tax * (1 + cessRate));
  return round2(tax / 12);
}
