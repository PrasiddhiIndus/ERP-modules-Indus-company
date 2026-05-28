import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionCard, DenseTable } from '../../../adminOperations/components/AdminUi';
import { listPayrollRuns, listRegisterForRun } from '../../../../services/payrollApi';
import { supabase } from '../../../../lib/supabase';
import { EMPLOYEE_MASTER_TABLE } from '../../../../modules/payroll/integrations';

export default function PayrollRegister() {
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState('');
  const [rows, setRows] = useState([]);
  const [empMap, setEmpMap] = useState(new Map());

  useEffect(() => {
    listPayrollRuns().then((r) => {
      setRuns(r);
      if (r[0]?.id) setRunId(r[0].id);
    });
  }, []);

  useEffect(() => {
    if (!runId) return;
    (async () => {
      const [reg, { data: emps }] = await Promise.all([
        listRegisterForRun(runId),
        supabase.from(EMPLOYEE_MASTER_TABLE).select('id, employee_id, full_name'),
      ]);
      setRows(reg);
      setEmpMap(new Map((emps || []).map((e) => [String(e.id), e])));
    })();
  }, [runId]);

  const tableRows = rows.map((r) => {
    const emp = empMap.get(String(r.employee_master_id));
    return {
      id: r.id,
      employee_id: emp?.employee_id || r.employee_master_id,
      name: emp?.full_name || '—',
      present: r.payload_json?.summary?.presentDays ?? '—',
      gross: `₹${Number(r.gross).toLocaleString('en-IN')}`,
      net: `₹${Number(r.net_pay).toLocaleString('en-IN')}`,
      pf: `₹${Number(r.pf_employee).toLocaleString('en-IN')}`,
      esic: `₹${Number(r.esic_employee).toLocaleString('en-IN')}`,
      pt: `₹${Number(r.pt_amount).toLocaleString('en-IN')}`,
      tds: `₹${Number(r.tds_amount).toLocaleString('en-IN')}`,
      loan: `₹${Number(r.loan_recovery).toLocaleString('en-IN')}`,
    };
  });

  const footer = rows.reduce(
    (acc, r) => ({
      net: acc.net + Number(r.net_pay || 0),
      gross: acc.gross + Number(r.gross || 0),
    }),
    { net: 0, gross: 0 }
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Payroll register</h2>
      <label className="text-xs flex items-center gap-2">
        Run
        <select value={runId} onChange={(e) => setRunId(e.target.value)} className="h-8 border rounded px-2 text-xs">
          {runs.map((r) => (
            <option key={r.id} value={r.id}>{r.label || r.payroll_month} ({r.status})</option>
          ))}
        </select>
      </label>
      <SectionCard title={`Register (${rows.length})`}>
        <DenseTable
          columns={[
            { key: 'employee_id', label: 'Code' },
            { key: 'name', label: 'Name' },
            { key: 'present', label: 'P.Days' },
            { key: 'gross', label: 'Gross' },
            { key: 'net', label: 'Net' },
            { key: 'pf', label: 'PF' },
            { key: 'esic', label: 'ESIC' },
            { key: 'pt', label: 'PT' },
            { key: 'tds', label: 'TDS' },
            { key: 'loan', label: 'Loan' },
          ]}
          rows={tableRows}
          rowKey="id"
          onRowClick={(row) => {
            const emp = [...empMap.values()].find((e) => e.employee_id === row.employee_id);
            if (emp) window.location.href = `/app/hr/payroll/salary/employees/${emp.id}`;
          }}
        />
        {rows.length ? (
          <p className="text-xs font-semibold text-gray-800 mt-3 tabular-nums">
            Totals — Gross ₹{footer.gross.toLocaleString('en-IN')} · Net ₹{footer.net.toLocaleString('en-IN')}
          </p>
        ) : (
          <p className="text-xs text-gray-500 mt-2">
            No register data. <Link to="../run" className="text-blue-700 underline">Run payroll</Link> with save.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
