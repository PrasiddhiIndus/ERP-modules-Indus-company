import React, { useEffect, useState } from 'react';
import { SectionCard, Badge, DenseTable } from '../../../adminOperations/components/AdminUi';
import { listManualInputs, upsertManualInput } from '../../../../services/payrollApi';
import { fetchActiveEmployeesForPayroll } from '../../../../services/attendancePayrollApi';
import { supabase } from '../../../../lib/supabase';

const INPUT_TYPES = ['loan', 'loan_recovery', 'arrears', 'incentive', 'deduction', 'penalty', 'reimbursement', 'adjustment'];

export default function ManualInputs() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ employee_master_id: '', input_type: 'loan_recovery', amount: '', remarks: '' });

  const reload = async () => {
    const [inputs, emps] = await Promise.all([
      listManualInputs(`${month}-01`),
      fetchActiveEmployeesForPayroll(supabase),
    ]);
    setRows(inputs);
    setEmployees(emps);
  };

  useEffect(() => {
    reload();
  }, [month]);

  const save = async () => {
    if (!form.employee_master_id || !form.amount) return;
    await upsertManualInput({
      employee_master_id: Number(form.employee_master_id),
      payroll_month: `${month}-01`,
      input_type: form.input_type,
      amount: Number(form.amount),
      remarks: form.remarks,
      status: 'draft',
    });
    setForm({ employee_master_id: '', input_type: 'loan_recovery', amount: '', remarks: '' });
    reload();
  };

  const empName = (id) => employees.find((e) => String(e.id) === String(id))?.full_name || id;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Manual inputs</h2>
      <p className="text-xs text-gray-600">Loans, advances, arrears, incentives — applied during payroll run.</p>
      <label className="text-xs flex items-center gap-2">
        Month <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 border rounded px-2" />
      </label>
      <SectionCard title="New entry" right={<Badge tone="bg-amber-50 text-amber-900">Editable</Badge>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <select value={form.employee_master_id} onChange={(e) => setForm((f) => ({ ...f, employee_master_id: e.target.value }))} className="h-9 border rounded-lg text-xs px-2">
            <option value="">Employee</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
            ))}
          </select>
          <select value={form.input_type} onChange={(e) => setForm((f) => ({ ...f, input_type: e.target.value }))} className="h-9 border rounded-lg text-xs px-2">
            {INPUT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="h-9 border rounded-lg text-xs px-2" />
          <input placeholder="Remarks" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} className="h-9 border rounded-lg text-xs px-2" />
        </div>
        <button type="button" onClick={save} className="mt-3 h-9 px-4 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium">Save</button>
      </SectionCard>
      <SectionCard title={`Entries (${rows.length})`}>
        <DenseTable
          columns={[
            { key: 'employee', label: 'Employee' },
            { key: 'input_type', label: 'Type' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
            { key: 'remarks', label: 'Remarks' },
          ]}
          rows={rows.map((r) => ({
            id: r.id,
            employee: empName(r.employee_master_id),
            input_type: r.input_type,
            amount: `₹${Number(r.amount).toLocaleString('en-IN')}`,
            status: r.status,
            remarks: r.remarks || '—',
          }))}
          rowKey="id"
        />
      </SectionCard>
    </div>
  );
}
