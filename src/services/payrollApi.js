import { supabase } from '../lib/supabase';
import { PAYROLL_TABLES, EMPLOYEE_MASTER_TABLE } from '../modules/payroll/integrations';
import { fetchPresentDaysByEmployeeCode, fetchActiveEmployeesForPayroll } from './attendancePayrollApi';
import { computeEmployeePayroll } from '../modules/payroll/calc/pipeline';
import {
  loadMasterComponentFormulas,
  mergeMasterAndSiteFormulas,
  parseSiteFormulaSet,
  toFormulaArray,
} from '../pages/hr/payroll/salary/formulaMasterBridge';

const T = PAYROLL_TABLES;

function monthStart(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export async function listPayrollSites() {
  const { data, error } = await supabase.from(T.sites).select('*').eq('is_active', true).order('site_name');
  if (error) throw error;
  return data || [];
}

/** Site master list — includes inactive sites for HR configuration screens. */
export async function listAllPayrollSites() {
  const { data, error } = await supabase.from(T.sites).select('*').order('site_name');
  if (error) throw error;
  return data || [];
}

export function payrollSiteRowToForm(row = {}) {
  return {
    id: row.id || '',
    siteCode: row.site_code || '',
    siteName: row.site_name || '',
    industryCategory: row.industry_category || '',
    costCentre: row.cost_centre || '',
    state: row.state || '',
    siteAddress: row.site_address || '',
    primaryClientContact: row.primary_client_contact || '',
    contactPhoneEmail: row.contact_phone_email || '',
    attendanceCycle: row.attendance_cycle || '1st to 31st',
    formulaPackage: row.formula_package || 'Default',
    otRate: row.ot_rate || 'Single Rate',
    status: row.is_active === false ? 'Inactive' : 'Active',
  };
}

export function buildPayrollSitePayload(form) {
  return {
    site_code: String(form.siteCode || '').trim().toUpperCase(),
    site_name: String(form.siteName || '').trim(),
    state: form.state || null,
    industry_category: form.industryCategory || null,
    cost_centre: form.costCentre || null,
    site_address: form.siteAddress || null,
    primary_client_contact: form.primaryClientContact || null,
    contact_phone_email: form.contactPhoneEmail || null,
    attendance_cycle: form.attendanceCycle || null,
    formula_package: form.formulaPackage || 'Default',
    ot_rate: form.otRate || null,
    is_active: form.status !== 'Inactive',
    payroll_applicable: form.status !== 'Inactive',
  };
}

export async function upsertPayrollSite(payload) {
  const { data, error } = await supabase.from(T.sites).upsert(payload, { onConflict: 'site_code' }).select().single();
  if (error) throw error;
  return data;
}

export async function listComponentsMaster() {
  const { data, error } = await supabase.from(T.componentsMaster).select('*').eq('is_active', true).order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function listEmployeePayrollProfiles() {
  const { data, error } = await supabase.from(T.employeeProfile).select('*');
  if (error) throw error;
  return data || [];
}

/** Create payroll profiles + default sites from People Master (location → site code). */
export async function ensurePayrollProfilesForActiveEmployees() {
  const [employees, sites, existing] = await Promise.all([
    fetchActiveEmployeesForPayroll(supabase),
    listPayrollSites(),
    listEmployeePayrollProfiles(),
  ]);
  const siteByCode = new Map(sites.map((s) => [String(s.site_code).toLowerCase(), s]));
  const haveProfile = new Set(existing.map((p) => String(p.employee_master_id)));
  let createdSites = 0;
  let createdProfiles = 0;

  for (const emp of employees) {
    const loc = String(emp.location || 'DEFAULT').trim() || 'DEFAULT';
    const code = loc.replace(/\s+/g, '_').slice(0, 32).toUpperCase();
    let site = siteByCode.get(code.toLowerCase());
    if (!site) {
      site = await upsertPayrollSite({
        site_code: code,
        site_name: loc,
        state: 'MH',
        constants_json: { defaultGrossFactor: 1 },
      });
      siteByCode.set(code.toLowerCase(), site);
      createdSites += 1;
    }
    if (haveProfile.has(String(emp.id))) continue;
    await upsertEmployeePayrollProfile({
      employee_master_id: emp.id,
      payroll_site_id: site.id,
      payroll_state: site.state || 'MH',
      gross_monthly: 0,
      pan: emp.pan_card_no,
      uan: emp.uan_no,
      esic_no: emp.esic_no,
      pf_applicable: true,
      esic_applicable: true,
      pt_applicable: true,
      tds_applicable: true,
    });
    createdProfiles += 1;
  }
  return { createdSites, createdProfiles, total: employees.length };
}

export async function upsertEmployeePayrollProfile(payload) {
  const { data, error } = await supabase.from(T.employeeProfile).upsert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function getActiveFormulaSetForSite(siteId) {
  const { data, error } = await supabase
    .from(T.formulaSets)
    .select('*')
    .eq('payroll_site_id', siteId)
    .eq('status', 'active')
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: comps, error: cErr } = await supabase
    .from(T.formulaComponents)
    .select('*')
    .eq('formula_set_id', data.id)
    .order('display_order');
  if (cErr) throw cErr;
  return { ...data, components: comps || [] };
}

/** Resolve formulas: site-specific overrides first, then master defaults. */
export async function resolveFormulasForSite(siteId, components = []) {
  const master = loadMasterComponentFormulas(components);
  if (!siteId) return toFormulaArray(master);
  const set = await getActiveFormulaSetForSite(siteId);
  const overrides = parseSiteFormulaSet(set);
  return toFormulaArray(mergeMasterAndSiteFormulas(master, overrides));
}

export async function saveFormulaSet(siteId, { notes, components, status = 'active' }) {
  const { data: latest } = await supabase
    .from(T.formulaSets)
    .select('version_no')
    .eq('payroll_site_id', siteId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  const version_no = (latest?.version_no || 0) + 1;
  const { data: set, error } = await supabase
    .from(T.formulaSets)
    .insert({
      payroll_site_id: siteId,
      version_no,
      status,
      notes,
      effective_from: new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();
  if (error) throw error;
  if (components?.length) {
    const rows = components.map((c, i) => ({
      formula_set_id: set.id,
      component_code: c.component_code,
      formula_text: c.formula_text || '',
      display_order: c.display_order ?? i,
      is_enabled: c.is_enabled !== false,
    }));
    const { error: cErr } = await supabase.from(T.formulaComponents).insert(rows);
    if (cErr) throw cErr;
  }
  return set;
}

export async function listPayrollRuns() {
  const { data, error } = await supabase.from(T.runs).select('*').order('payroll_month', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getPayrollRun(runId) {
  const { data, error } = await supabase.from(T.runs).select('*').eq('id', runId).single();
  if (error) throw error;
  return data;
}

export async function listManualInputs(monthValue) {
  const m = monthStart(monthValue);
  const { data, error } = await supabase.from(T.manualInputs).select('*').eq('payroll_month', m);
  if (error) throw error;
  return data || [];
}

export async function upsertManualInput(payload) {
  const row = { ...payload, payroll_month: monthStart(payload.payroll_month) };
  const { data, error } = await supabase.from(T.manualInputs).upsert(row).select().single();
  if (error) throw error;
  return data;
}

export async function listPtRules() {
  const { data, error } = await supabase.from(T.ptStateRules).select('*').eq('is_active', true);
  if (error) throw error;
  return data || [];
}

export async function listTdsRules() {
  const { data, error } = await supabase.from(T.tdsRules).select('*').eq('is_active', true);
  if (error) throw error;
  return data || [];
}

export async function listRegisterForRun(runId) {
  const { data, error } = await supabase.from(T.monthlySummary).select('*').eq('payroll_run_id', runId);
  if (error) throw error;
  return data || [];
}

/** Preview / compute payroll run in-memory + optional persist */
export async function runPayrollPreview(monthValue, { persist = false, runLabel } = {}) {
  const payrollMonth = monthStart(monthValue);
  const [employees, profiles, components, ptRules, tdsRules, attendance] = await Promise.all([
    fetchActiveEmployeesForPayroll(supabase),
    listEmployeePayrollProfiles(),
    listComponentsMaster(),
    listPtRules(),
    listTdsRules(),
    fetchPresentDaysByEmployeeCode(supabase, payrollMonth),
  ]);

  const profileByEmpId = new Map(profiles.map((p) => [String(p.employee_master_id), p]));
  const manualInputs = await listManualInputs(payrollMonth);
  const manualByEmp = new Map();
  manualInputs.forEach((m) => {
    const id = String(m.employee_master_id);
    if (!manualByEmp.has(id)) manualByEmp.set(id, { additions: 0, deductions: 0, loanRecovery: 0 });
    const bucket = manualByEmp.get(id);
    const amt = Number(m.amount) || 0;
    if (m.input_type === 'loan' || m.input_type === 'loan_recovery') bucket.loanRecovery += amt;
    else if (m.input_type === 'deduction' || m.input_type === 'penalty') bucket.deductions += amt;
    else bucket.additions += amt;
  });

  const ptSlabs = (ptRules[0]?.slabs_json) || [];
  const tdsByRegime = new Map();
  tdsRules.forEach((r) => {
    const key = String(r.regime || 'new').toLowerCase();
    if (!tdsByRegime.has(key)) tdsByRegime.set(key, r);
  });
  const defaultTdsRule = tdsByRegime.get('new') || tdsRules[0];

  const siteFormulaCache = new Map();
  const results = [];
  const exceptions = [];

  for (const emp of employees) {
    const prof = profileByEmpId.get(String(emp.id)) || {
      employee_master_id: emp.id,
      gross_monthly: 0,
      pf_applicable: true,
      esic_applicable: true,
      pt_applicable: true,
      tds_applicable: true,
      payroll_state: 'MH',
    };
    const code = String(emp.employee_code || '').trim();
    const att = attendance.byEmpCode.get(code) || { presentDays: 0, monthDays: attendance.daysInMonth, paidDays: 0 };
    const siteId = prof.payroll_site_id;
    let formulas = [];
    if (siteId) {
      if (!siteFormulaCache.has(siteId)) {
        const resolved = await resolveFormulasForSite(siteId, components);
        siteFormulaCache.set(siteId, resolved);
      }
      formulas = siteFormulaCache.get(siteId) || [];
    }
    if (!formulas.length) {
      formulas = toFormulaArray(loadMasterComponentFormulas(components));
    }
    const empRegime = String(prof.tax_regime || 'new').toLowerCase();
    const empTdsRule = tdsByRegime.get(empRegime) || defaultTdsRule;
    const statutoryConfig = {
      ptSlabs,
      tdsSlabs: empTdsRule?.slabs_json || [],
      standardDeduction: empTdsRule?.standard_deduction,
      cessRate: empTdsRule?.cess_rate,
    };
    const computed = computeEmployeePayroll({
      profile: prof,
      attendance: att,
      formulas,
      manualInputs: manualByEmp.get(String(emp.id)) || {},
      statutoryConfig,
      componentMeta: components,
    });
    if (computed.exceptions.length) {
      exceptions.push({ employee: emp, messages: computed.exceptions });
    }
    results.push({ employee: emp, profile: prof, attendance: att, computed });
  }

  let runRecord = null;
  if (persist) {
    const { data: run, error: runErr } = await supabase
      .from(T.runs)
      .insert({
        payroll_month: payrollMonth,
        status: 'preview',
        label: runLabel || `Payroll ${payrollMonth}`,
        summary_json: {
          employeeCount: results.length,
          exceptionCount: exceptions.length,
          netPayTotal: results.reduce((s, r) => s + (r.computed.summary.netPay || 0), 0),
        },
      })
      .select()
      .single();
    if (runErr) throw runErr;
    runRecord = run;
    for (const row of results) {
      const emp = row.employee;
      const c = row.computed;
      await supabase.from(T.runEmployees).upsert({
        payroll_run_id: run.id,
        employee_master_id: emp.id,
        payroll_site_id: row.profile.payroll_site_id,
        employee_code: emp.employee_code,
        present_days: c.summary.presentDays,
        month_days: c.summary.monthDays,
        paid_days: c.summary.paidDays,
        status: c.exceptions.length ? 'exception' : 'computed',
        exceptions_json: c.exceptions,
      });
      await supabase.from(T.monthlySummary).upsert({
        payroll_run_id: run.id,
        employee_master_id: emp.id,
        payroll_month: payrollMonth,
        gross: c.summary.gross,
        total_earnings: c.summary.totalEarnings,
        total_deductions: c.summary.totalDeductions,
        net_pay: c.summary.netPay,
        pf_employee: c.summary.pfEmployee,
        pf_employer: c.summary.pfEmployer,
        esic_employee: c.summary.esicEmployee,
        esic_employer: c.summary.esicEmployer,
        pt_amount: c.summary.pt,
        tds_amount: c.summary.tds,
        loan_recovery: c.summary.loanRecovery,
        manual_additions: c.summary.manualAdditions,
        manual_deductions: c.summary.manualDeductions,
        payload_json: c,
      });
      for (const comp of c.componentRows || []) {
        await supabase.from(T.componentValues).upsert({
          payroll_run_id: run.id,
          employee_master_id: emp.id,
          component_code: comp.component_code,
          monthly_value: comp.monthly_value,
          prorated_value: comp.prorated_value,
          final_value: comp.final_value,
          formula_text: comp.formula_text,
        });
      }
      await supabase.from(T.pfDetails).upsert({
        payroll_run_id: run.id,
        employee_master_id: emp.id,
        uan: row.profile.uan || emp.uan_no,
        pf_wages: c.pf.pfWages,
        employee_contribution: c.pf.employeeContribution,
        employer_contribution: c.pf.employerContribution,
        eps_contribution: c.pf.epsContribution,
        is_capped: c.pf.isCapped,
      });
      await supabase.from(T.esicDetails).upsert({
        payroll_run_id: run.id,
        employee_master_id: emp.id,
        esic_no: row.profile.esic_no || emp.esic_no,
        esic_wages: c.esic.esicWages,
        employee_contribution: c.esic.employeeContribution,
        employer_contribution: c.esic.employerContribution,
        is_eligible: c.esic.isEligible,
        threshold_applied: c.esic.thresholdApplied,
      });
      await supabase.from(T.ptDetails).upsert({
        payroll_run_id: run.id,
        employee_master_id: emp.id,
        state_code: c.pt.stateCode,
        pt_wages: c.pt.ptWages,
        pt_amount: c.pt.ptAmount,
      });
      await supabase.from(T.tdsDetails).upsert({
        payroll_run_id: run.id,
        employee_master_id: emp.id,
        pan: c.tds.pan || emp.pan_card_no,
        taxable_income_annual: c.tds.taxableIncomeAnnual,
        monthly_tds: c.tds.monthlyTds,
        regime: c.tds.regime,
      });
      await supabase.from(T.payslips).upsert({
        payroll_run_id: run.id,
        employee_master_id: emp.id,
        payslip_number: `PS-${payrollMonth}-${emp.employee_code || emp.id}`,
        payload_json: { employee: emp, summary: c.summary, components: c.componentRows },
      });
    }
  }

  return { payrollMonth, results, exceptions, run: runRecord };
}

export async function finalizePayrollRun(runId) {
  const { data, error } = await supabase
    .from(T.runs)
    .update({ status: 'finalized', finalized_at: new Date().toISOString() })
    .eq('id', runId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getDashboardStats(monthValue) {
  const payrollMonth = monthStart(monthValue);
  const [employees, profiles, runs, manualInputs, attendance] = await Promise.all([
    fetchActiveEmployeesForPayroll(supabase),
    listEmployeePayrollProfiles(),
    listPayrollRuns(),
    listManualInputs(payrollMonth),
    fetchPresentDaysByEmployeeCode(supabase, payrollMonth),
  ]);
  const runForMonth = runs.find((r) => r.payroll_month === payrollMonth);
  const pfCount = profiles.filter((p) => p.pf_applicable).length;
  const esicCount = profiles.filter((p) => p.esic_applicable).length;
  const ptCount = profiles.filter((p) => p.pt_applicable).length;
  const withPresent = employees.filter((e) => (attendance.byEmpCode.get(String(e.employee_code || '').trim())?.presentDays || 0) > 0).length;
  return {
    activeEmployees: employees.length,
    payrollProfiles: profiles.length,
    pfCount,
    esicCount,
    ptCount,
    withPresentDays: withPresent,
    pendingManualInputs: manualInputs.filter((m) => m.status === 'draft').length,
    lastRun: runForMonth,
    runs,
  };
}
