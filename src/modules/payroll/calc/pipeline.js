import { evaluateFormula, resolveComponentOrder } from '../formula/evaluator';
import { computePF, computeESIC, computePTFromSlabs, computeTDSMonthly } from './statutory';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Compute one employee payroll for a month.
 * @param {object} input
 * @param {object} input.profile - employee payroll profile
 * @param {object} input.attendance - { presentDays, monthDays, paidDays }
 * @param {Array} input.formulas - [{ component_code, formula_text }]
 * @param {object} input.manualInputs - { additions, deductions, loanRecovery }
 * @param {object} input.statutoryConfig - { ptSlabs, tdsSlabs, pfCap, esicThreshold }
 */
export function computeEmployeePayroll(input) {
  const {
    profile = {},
    attendance = {},
    formulas = [],
    manualInputs = {},
    statutoryConfig = {},
    componentMeta = [],
  } = input;

  const exceptions = [];
  const presentDays = Number(attendance.presentDays ?? 0);
  const monthDays = Number(attendance.monthDays ?? 0) || 30;
  const paidDays = Number(attendance.paidDays ?? presentDays);

  if (presentDays <= 0) exceptions.push('Present days missing or zero');
  if (!profile.payroll_site_id && !profile.payrollSiteId) exceptions.push('Payroll site not assigned');

  const ctx = {
    gross: Number(profile.gross_monthly ?? profile.grossMonthly ?? 0),
    ctc: Number(profile.ctc_annual ?? profile.ctcAnnual ?? 0),
    presentDays,
    monthDays,
    paidDays,
    fixedAmount: 0,
  };

  const formulaMap = {};
  formulas.filter((f) => f.is_enabled !== false).forEach((f) => {
    formulaMap[f.component_code] = f.formula_text || '';
  });

  let order = [];
  try {
    order = resolveComponentOrder(formulaMap);
  } catch (e) {
    exceptions.push(e.message);
    order = Object.keys(formulaMap);
  }

  const componentValues = {};
  const componentRows = [];

  order.forEach((code) => {
    const text = formulaMap[code];
    let monthly = 0;
    let finalVal = 0;
    if (text) {
      monthly = evaluateFormula(text, { ...ctx, fixedAmount: ctx.gross }, componentValues);
      finalVal = monthly;
      if (text.toLowerCase().includes('prorate') || /\/\s*MonthDays\s*\*/i.test(text)) {
        const daysForPay = paidDays > 0 ? paidDays : presentDays;
        finalVal = monthDays > 0 ? round2((monthly / monthDays) * daysForPay) : monthly;
      } else if (/PresentDays|MonthDays/i.test(text)) {
        finalVal = evaluateFormula(text, ctx, componentValues);
      }
    }
    componentValues[code] = finalVal;
    const meta = componentMeta.find((m) => m.component_code === code) || {};
    componentRows.push({
      component_code: code,
      component_name: meta.component_name || code,
      formula_text: text,
      monthly_value: round2(monthly),
      prorated_value: round2(finalVal),
      final_value: round2(finalVal),
      component_type: meta.component_type || 'earning',
    });
  });

  const gross = round2(componentValues.GROSS ?? ctx.gross);
  const basic = round2(componentValues.BASIC ?? componentValues.Basic ?? 0);

  const pfWageBasis = componentRows
    .filter((r) => {
      const m = componentMeta.find((c) => c.component_code === r.component_code);
      return m?.include_in_pf_wages;
    })
    .reduce((s, r) => s + r.final_value, basic);

  const esicWageBasis = componentRows
    .filter((r) => {
      const m = componentMeta.find((c) => c.component_code === r.component_code);
      return m?.include_in_esic_wages;
    })
    .reduce((s, r) => s + r.final_value, gross);

  const pf = computePF({
    pfWages: pfWageBasis,
    applicable: profile.pf_applicable !== false,
    cap: statutoryConfig.pfCap,
    rate: statutoryConfig.pfRate,
  });

  const esic = computeESIC({
    esicWages: esicWageBasis,
    applicable: profile.esic_applicable !== false,
    threshold: statutoryConfig.esicThreshold,
    empRate: statutoryConfig.esicEmpRate,
    erRate: statutoryConfig.esicErRate,
  });

  const pt = computePTFromSlabs(
    gross,
    statutoryConfig.ptSlabs || []
  );

  const taxableMonthly = componentRows
    .filter((r) => {
      const m = componentMeta.find((c) => c.component_code === r.component_code);
      return m?.include_in_taxable_income;
    })
    .reduce((s, r) => s + r.final_value, gross);

  const tds = computeTDSMonthly({
    taxableMonthly,
    regime: profile.tax_regime || 'new',
    slabs: statutoryConfig.tdsSlabs || [],
    standardDeductionAnnual: statutoryConfig.standardDeduction ?? 75000,
    cessRate: statutoryConfig.cessRate ?? 0.04,
  });

  const loanRecovery = round2(manualInputs.loanRecovery ?? 0);
  const manualAdd = round2(manualInputs.additions ?? 0);
  const manualDed = round2(manualInputs.deductions ?? 0);

  const totalEarnings = round2(
    componentRows.filter((r) => r.component_type === 'earning').reduce((s, r) => s + r.final_value, 0) + manualAdd
  );
  const totalDeductions = round2(
    pf.employeeContribution +
      esic.employeeContribution +
      pt +
      tds +
      loanRecovery +
      manualDed +
      componentRows.filter((r) => r.component_type === 'deduction').reduce((s, r) => s + r.final_value, 0)
  );
  const netPay = round2(totalEarnings - totalDeductions);

  if (netPay < 0) exceptions.push('Net pay is negative');

  return {
    exceptions,
    componentRows,
    summary: {
      gross,
      totalEarnings,
      totalDeductions,
      netPay,
      pfEmployee: pf.employeeContribution,
      pfEmployer: pf.employerContribution,
      esicEmployee: esic.employeeContribution,
      esicEmployer: esic.employerContribution,
      pt,
      tds,
      loanRecovery,
      manualAdditions: manualAdd,
      manualDeductions: manualDed,
      presentDays,
      monthDays,
      paidDays,
    },
    pf,
    esic,
    pt: { stateCode: profile.payroll_state, ptWages: gross, ptAmount: pt },
    tds: { pan: profile.pan, taxableIncomeAnnual: taxableMonthly * 12, monthlyTds: tds, regime: profile.tax_regime || 'new' },
  };
}
