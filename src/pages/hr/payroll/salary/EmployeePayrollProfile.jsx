import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SectionCard, Badge, DenseTable } from '../../../adminOperations/components/AdminUi';
import { supabase } from '../../../../lib/supabase';
import { EMPLOYEE_MASTER_TABLE } from '../../../../modules/payroll/integrations';
import { listEmployeePayrollProfiles, listComponentsMaster, getActiveFormulaSetForSite } from '../../../../services/payrollApi';
import { fetchPresentDaysByEmployeeCode } from '../../../../services/attendancePayrollApi';
import { computeEmployeePayroll } from '../../../../modules/payroll/calc/pipeline';
import { listPtRules, listTdsRules } from '../../../../services/payrollApi';
import { salaryAppPath } from './salaryNav';

const TABS = ['Profile', 'Components', 'Summary', 'PF', 'ESIC', 'TDS', 'Attendance', 'Manual', 'Audit'];

export default function EmployeePayrollProfile() {
  const { id: employeeId } = useParams();
  const [tab, setTab] = useState('Profile');
  const [employee, setEmployee] = useState(null);
  const [profile, setProfile] = useState(null);
  const [computed, setComputed] = useState(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: emp } = await supabase.from(EMPLOYEE_MASTER_TABLE).select('*').eq('id', employeeId).maybeSingle();
      const profiles = await listEmployeePayrollProfiles();
      const prof = profiles.find((p) => String(p.employee_master_id) === String(employeeId)) || null;
      if (cancelled) return;
      setEmployee(emp);
      setProfile(prof);
      if (!emp) return;
      const [components, ptRules, tdsRules, att] = await Promise.all([
        listComponentsMaster(),
        listPtRules(),
        listTdsRules(),
        fetchPresentDaysByEmployeeCode(supabase, `${month}-01`),
      ]);
      const code = String(emp.employee_code || '').trim();
      const attendance = att.byEmpCode.get(code) || { presentDays: 0, monthDays: att.daysInMonth };
      let formulas = [];
      if (prof?.payroll_site_id) {
        const set = await getActiveFormulaSetForSite(prof.payroll_site_id);
        formulas = set?.components || [];
      }
      if (!formulas.length) {
        formulas = [
          { component_code: 'GROSS', formula_text: String(prof?.gross_monthly || 0) },
          { component_code: 'BASIC', formula_text: 'Gross * 0.40' },
          { component_code: 'HRA', formula_text: 'Basic * 0.50' },
        ];
      }
      const result = computeEmployeePayroll({
        profile: prof || { gross_monthly: 0 },
        attendance,
        formulas,
        manualInputs: {},
        statutoryConfig: {
          ptSlabs: ptRules[0]?.slabs_json,
          tdsSlabs: (tdsRules.find((r) => r.regime === 'new') || tdsRules[0])?.slabs_json,
        },
        componentMeta: components,
      });
      if (!cancelled) setComputed(result);
    })();
    return () => { cancelled = true; };
  }, [employeeId, month]);

  if (!employee) {
    return (
      <p className="text-sm text-gray-500">
        <Link to={salaryAppPath('employees')} className="text-blue-700 underline">Back to list</Link> — employee not found.
      </p>
    );
  }

  const s = computed?.summary || {};

  return (
    <div className="space-y-4">
      <Link to={salaryAppPath('employees')} className="text-xs text-blue-700 underline">← Employee list</Link>
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4 items-start">
        <div className="w-12 h-12 rounded-full bg-[#1F3A8A]/10 flex items-center justify-center text-lg font-bold text-[#1F3A8A]">
          {(employee.full_name || '?')[0]}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">{employee.full_name}</h2>
          <p className="text-xs text-gray-600 font-mono">{employee.employee_id} · {employee.employee_code}</p>
          <p className="text-xs text-gray-500">{employee.designation} · {employee.department}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {profile?.pf_applicable !== false ? <Badge tone="bg-blue-50 text-blue-800">PF</Badge> : null}
            {profile?.esic_applicable !== false ? <Badge tone="bg-emerald-50 text-emerald-800">ESIC</Badge> : null}
            {profile?.pt_applicable !== false ? <Badge tone="bg-amber-50 text-amber-800">PT</Badge> : null}
            {profile?.tds_applicable !== false ? <Badge tone="bg-violet-50 text-violet-800">TDS</Badge> : null}
          </div>
        </div>
        <div className="text-right text-sm tabular-nums">
          <p className="text-gray-500 text-xs">Gross preview</p>
          <p className="font-bold">₹{Number(s.gross || profile?.gross_monthly || 0).toLocaleString('en-IN')}</p>
          <p className="text-gray-500 text-xs mt-1">Net preview</p>
          <p className="font-bold text-emerald-700">₹{Number(s.netPay || 0).toLocaleString('en-IN')}</p>
        </div>
        <label className="text-xs flex flex-col gap-1">
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 border rounded px-2" />
        </label>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs rounded-lg ${tab === t ? 'bg-[#1F3A8A] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Profile' && (
        <SectionCard title="Payroll profile">
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <dt className="text-gray-500">Gross monthly</dt><dd>₹{profile?.gross_monthly ?? '—'}</dd>
            <dt className="text-gray-500">Payroll state</dt><dd>{profile?.payroll_state ?? '—'}</dd>
            <dt className="text-gray-500">UAN</dt><dd>{profile?.uan || employee.uan_no || '—'}</dd>
            <dt className="text-gray-500">PAN</dt><dd>{profile?.pan || employee.pan_card_no || '—'}</dd>
            <dt className="text-gray-500">ESIC</dt><dd>{profile?.esic_no || employee.esic_no || '—'}</dd>
          </dl>
        </SectionCard>
      )}
      {tab === 'Attendance' && (
        <SectionCard title="Attendance input (payroll consumes Present Days only)">
          <p className="text-xs text-gray-600 mb-2">Imported from attendance register — not edited here.</p>
          <p className="text-sm font-semibold tabular-nums">Present days: {s.presentDays ?? 0} / {s.monthDays ?? 30}</p>
        </SectionCard>
      )}
      {tab === 'Components' && computed && (
        <SectionCard title="Salary components">
          <DenseTable
            columns={[
              { key: 'component_code', label: 'Code' },
              { key: 'formula_text', label: 'Formula' },
              { key: 'monthly_value', label: 'Monthly' },
              { key: 'final_value', label: 'Final' },
            ]}
            rows={computed.componentRows.map((r) => ({
              ...r,
              monthly_value: r.monthly_value?.toLocaleString('en-IN'),
              final_value: r.final_value?.toLocaleString('en-IN'),
            }))}
            rowKey="component_code"
          />
        </SectionCard>
      )}
      {tab === 'Summary' && computed && (
        <SectionCard title="Payroll summary">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs tabular-nums">
            <dt>Earnings</dt><dd>₹{s.totalEarnings?.toLocaleString('en-IN')}</dd>
            <dt>Deductions</dt><dd>₹{s.totalDeductions?.toLocaleString('en-IN')}</dd>
            <dt>Net pay</dt><dd className="font-bold">₹{s.netPay?.toLocaleString('en-IN')}</dd>
          </dl>
        </SectionCard>
      )}
      {tab === 'PF' && computed && (
        <SectionCard title="PF">
          <p className="text-xs tabular-nums">Wages: ₹{computed.pf.pfWages?.toLocaleString('en-IN')} · EE: ₹{computed.pf.employeeContribution?.toLocaleString('en-IN')} · ER: ₹{computed.pf.employerContribution?.toLocaleString('en-IN')}</p>
        </SectionCard>
      )}
      {tab === 'ESIC' && computed && (
        <SectionCard title="ESIC">
          <p className="text-xs tabular-nums">Eligible: {computed.esic.isEligible ? 'Yes' : 'No'} · EE: ₹{computed.esic.employeeContribution?.toLocaleString('en-IN')}</p>
        </SectionCard>
      )}
      {tab === 'TDS' && computed && (
        <SectionCard title="TDS">
          <p className="text-xs tabular-nums">Monthly TDS: ₹{computed.tds.monthlyTds?.toLocaleString('en-IN')} · Regime: {computed.tds.regime}</p>
        </SectionCard>
      )}
      {tab === 'Manual' && (
        <SectionCard title="Manual inputs">
          <p className="text-xs text-gray-500">Use Manual inputs screen for loans, arrears, incentives.</p>
          <Link to={salaryAppPath('manual-inputs')} className="text-blue-700 text-xs underline">Open manual inputs</Link>
        </SectionCard>
      )}
      {tab === 'Audit' && (
        <SectionCard title="Audit trail">
          <p className="text-xs text-gray-500">Payroll audit logs stored per run and configuration change.</p>
        </SectionCard>
      )}
    </div>
  );
}
