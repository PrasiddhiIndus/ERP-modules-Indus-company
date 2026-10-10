import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { Plus, Upload, Download } from 'lucide-react';
import {
  DenseTable,
  InlineAlert,
  Modal,
  SectionCard,
  StatusChip,
  TinyInput,
  TinySelect,
} from '../../components/AdminUi';
import toast from '../../../../lib/toast';
import { MIS_VERTICALS, monthLabel, verticalLabel } from './misMetrics';
import TagFields from './TagFields';
import {
  deleteRow,
  fetchAccessList,
  fetchBudget,
  fetchCalendar,
  fetchDepartments,
  fetchEmployeesForTags,
  fetchJobLog,
  fetchLoginUsers,
  fetchPremiums,
  fetchRates,
  fetchRecipients,
  fetchSettings,
  fetchTags,
  fetchAllocations,
  saveEmployeeTags,
  saveSetting,
  upsertRows,
} from './misDb';

const TABS = [
  { id: 'tags', label: 'Employee tags' },
  { id: 'departments', label: 'Departments' },
  { id: 'allocations', label: 'Shared staff' },
  { id: 'insurance', label: 'Group insurance' },
  { id: 'rates', label: 'Statutory rates' },
  { id: 'calendar', label: 'Due-date calendar' },
  { id: 'budget', label: 'Budget' },
  { id: 'recipients', label: 'Alert emails' },
  { id: 'access', label: 'Report access' },
  { id: 'general', label: 'General' },
];

const VERTICAL_OPTIONS = MIS_VERTICALS.map((v) => ({ value: v.code, label: v.label }));
const STATUTES = ['PF', 'ESI', 'PT', 'LWF', 'TDS'].map((s) => ({ value: s, label: s }));

// ---------------------------------------------------------------------------
// Generic master editor (list + modal form)
// ---------------------------------------------------------------------------
function FieldInput({ field, value, onChange, options }) {
  if (field.type === 'select') {
    return (
      <TinySelect value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className="w-full mt-1">
        {field.required ? null : <option value="">—</option>}
        {(options || field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </TinySelect>
    );
  }
  if (field.type === 'checkbox') {
    return <input type="checkbox" className="mt-1 block" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  }
  return (
    <TinyInput type={field.type || 'text'} value={value ?? ''} className="w-full mt-1"
      onChange={(e) => onChange(e?.target ? e.target.value : e)} placeholder={field.placeholder} />
  );
}

function MasterEditor({ title, table, load, fields, columns, defaults = {}, toRow = (r) => r, help, idKey = 'id', onConflict, optionsFor = {} }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setRows(await load());
    } catch (e) {
      setError(e.message);
    }
  }, [load]);
  useEffect(() => { reload(); }, [reload]);

  const save = async () => {
    const missing = fields.filter((f) => f.required && (editing[f.key] === null || editing[f.key] === undefined || editing[f.key] === ''));
    if (missing.length) {
      setError(`Fill in: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = toRow(Object.fromEntries(Object.entries(editing).filter(([k]) => k === idKey ? !!editing[idKey] : fields.some((f) => f.key === k))));
      await upsertRows(table, payload, onConflict);
      toast.success('Saved');
      setEditing(null);
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing?.[idKey] || !window.confirm('Delete this entry?')) return;
    setBusy(true);
    try {
      await deleteRow(table, idKey, editing[idKey]);
      toast.success('Deleted');
      setEditing(null);
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title={title}
      right={(
        <button type="button" onClick={() => { setError(''); setEditing({ ...defaults }); }}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded bg-accent text-white text-[11px] font-semibold">
          <Plus className="h-3.5 w-3.5" />Add
        </button>
      )}
    >
      {help ? <p className="type-meta text-ink-muted mb-2">{help}</p> : null}
      {error && !editing ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      <DenseTable columns={columns} rows={rows} rowKey={idKey} onRowClick={(r) => { setError(''); setEditing({ ...r }); }} />
      <Modal open={!!editing} title={editing?.[idKey] ? `Edit · ${title}` : `Add · ${title}`} onClose={() => setEditing(null)}
        footer={(
          <div className="flex justify-between gap-2 w-full">
            <div>{editing?.[idKey] ? <button type="button" className="h-8 px-3 rounded border border-red-200 text-red-700 text-xs" onClick={remove} disabled={busy}>Delete</button> : null}</div>
            <div className="flex gap-2">
              <button type="button" className="h-8 px-3 rounded border border-border text-xs" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="h-8 px-3 rounded bg-accent text-white text-xs font-semibold disabled:opacity-50" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}>
        {editing ? (
          <div className="space-y-2.5">
            {fields.map((f) => (
              <label key={f.key} className="block text-xs text-ink-secondary">
                {f.label}{f.required ? ' *' : ''}
                <FieldInput field={f} value={editing[f.key]} options={optionsFor[f.key]} onChange={(v) => setEditing((s) => ({ ...s, [f.key]: v }))} />
                {f.hint ? <span className="block type-meta text-ink-muted mt-0.5">{f.hint}</span> : null}
              </label>
            ))}
            {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
          </div>
        ) : null}
      </Modal>
    </SectionCard>
  );
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const intList = (v) => {
  if (Array.isArray(v)) return v;
  const list = String(v || '').split(/[\s,]+/).map(Number).filter((n) => n >= 1 && n <= 12);
  return list.length ? list : null;
};

// ---------------------------------------------------------------------------
// Employee tags (grid + Excel import)
// ---------------------------------------------------------------------------
const TAG_HEADERS = ['Emp code', 'Name', 'Department', 'Vertical', 'Grade', 'Cost centre', 'Position type', 'Work state', 'Exit reason'];

function EmployeeTags() {
  const [employees, setEmployees] = useState([]);
  const [tags, setTags] = useState({});
  const [deptVertical, setDeptVertical] = useState({});
  const [search, setSearch] = useState('');
  const [onlyUntagged, setOnlyUntagged] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [e, t, d] = await Promise.all([fetchEmployeesForTags(), fetchTags(), fetchDepartments()]);
      setEmployees(e);
      setTags(Object.fromEntries(t.map((x) => [String(x.employee_master_id), x])));
      setDeptVertical(Object.fromEntries(d.map((x) => [String(x.department).toLowerCase(), x.vertical_code])));
    } catch (err) {
      setMsg({ tone: 'error', text: err.message });
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const rows = useMemo(() => employees.map((e) => {
    const t = tags[String(e.id)] || {};
    const fromDept = deptVertical[String(e.department || '').toLowerCase()] || null;
    return { ...e, ...t, id: e.id, effective_vertical: t.vertical_code || fromDept, from_dept: !t.vertical_code && !!fromDept };
  }).filter((r) => {
    if (!showInactive && String(r.status || '').toLowerCase() === 'inactive') return false;
    if (onlyUntagged && r.effective_vertical) return false;
    const q = search.trim().toLowerCase();
    return !q || `${r.employee_id} ${r.full_name} ${r.department}`.toLowerCase().includes(q);
  }), [employees, tags, deptVertical, search, onlyUntagged, showInactive]);

  const untaggedCount = useMemo(() => employees.filter((e) => String(e.status || '').toLowerCase() !== 'inactive'
    && !(tags[String(e.id)]?.vertical_code || deptVertical[String(e.department || '').toLowerCase()])).length, [employees, tags, deptVertical]);

  const save = async () => {
    setBusy(true);
    try {
      await saveEmployeeTags(editing.id, editing);
      toast.success('Payroll tags saved');
      setEditing(null);
      reload();
    } catch (e) {
      toast.error('Could not save', e.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Payroll tags');
    ws.addRow(TAG_HEADERS).font = { bold: true };
    for (const r of rows) {
      ws.addRow([r.employee_id, r.full_name, r.department || '', r.vertical_code || '', r.grade || '', r.cost_centre || '', r.position_type || '', r.work_state || '', r.exit_reason || '']);
    }
    ws.columns.forEach((c) => { c.width = 18; });
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Payroll_employee_tags.xlsx';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const importFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      const head = ws.getRow(1).values.map((v) => String(v ?? '').trim().toLowerCase());
      const col = (name) => head.indexOf(name.toLowerCase());
      const byCode = new Map(employees.map((e) => [String(e.employee_id).trim().toUpperCase(), e]));
      const verticalCodes = new Set(MIS_VERTICALS.map((v) => v.code));
      const labelToCode = new Map(MIS_VERTICALS.map((v) => [v.label.toLowerCase(), v.code]));
      let saved = 0;
      const problems = [];
      const cell = (row, name) => {
        const i = col(name);
        if (i < 0) return undefined;
        const v = row.getCell(i).value;
        const s = v && typeof v === 'object' && 'text' in v ? v.text : v;
        return s === null || s === undefined ? '' : String(s).trim();
      };
      for (let n = 2; n <= ws.rowCount; n += 1) {
        const row = ws.getRow(n);
        const code = cell(row, 'Emp code');
        if (!code) continue;
        const emp = byCode.get(code.toUpperCase());
        if (!emp) { problems.push(`Row ${n}: employee ${code} not found`); continue; }
        let vertical = cell(row, 'Vertical');
        if (vertical) {
          const v = vertical.toLowerCase();
          vertical = verticalCodes.has(v) ? v : labelToCode.get(v);
          if (!vertical) { problems.push(`Row ${n}: unknown vertical "${cell(row, 'Vertical')}"`); continue; }
        }
        const position = (cell(row, 'Position type') || '').toLowerCase();
        if (position && position !== 'new' && position !== 'replacement') { problems.push(`Row ${n}: position type must be New or Replacement`); continue; }
        const current = tags[String(emp.id)] || {};
        const pick = (name, key) => {
          const v = cell(row, name);
          return v === undefined ? current[key] : v;
        };
        await saveEmployeeTags(emp.id, {
          vertical_code: vertical === undefined ? current.vertical_code : vertical,
          grade: pick('Grade', 'grade'),
          cost_centre: pick('Cost centre', 'cost_centre'),
          position_type: position || (cell(row, 'Position type') === undefined ? current.position_type : null),
          work_state: pick('Work state', 'work_state'),
          exit_reason: pick('Exit reason', 'exit_reason'),
        });
        saved += 1;
      }
      setMsg({ tone: problems.length ? 'warning' : 'success', text: `${saved} employees updated.${problems.length ? `\n${problems.slice(0, 15).join('\n')}${problems.length > 15 ? `\n…and ${problems.length - 15} more` : ''}` : ''}` });
      reload();
    } catch (e) {
      console.error('[payroll-mis] import', e);
      setMsg({ tone: 'error', text: 'Could not read that file. Use the downloaded template.' });
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'employee_id', label: 'Emp code' },
    { key: 'full_name', label: 'Name' },
    { key: 'department', label: 'Department' },
    {
      key: 'vertical', label: 'Vertical', render: (r) => (r.effective_vertical
        ? <span>{verticalLabel(r.effective_vertical)}{r.from_dept ? <span className="text-ink-muted"> (from department)</span> : null}</span>
        : <span className="text-red-700 font-semibold">Unassigned</span>),
    },
    { key: 'grade', label: 'Grade', render: (r) => r.grade || '—' },
    { key: 'cost_centre', label: 'Cost centre', render: (r) => r.cost_centre || '—' },
    { key: 'position_type', label: 'Position', render: (r) => (r.position_type === 'new' ? 'New' : r.position_type === 'replacement' ? 'Replacement' : '—') },
    { key: 'work_state', label: 'State', render: (r) => r.work_state || '—' },
  ];

  return (
    <SectionCard
      title="Employee payroll tags"
      right={(
        <div className="flex items-center gap-2">
          <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1 h-8 px-2.5 rounded border border-border bg-white text-[11px]"><Download className="h-3.5 w-3.5" />Excel</button>
          <label className={`inline-flex items-center gap-1 h-8 px-2.5 rounded bg-accent text-white text-[11px] font-semibold cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="h-3.5 w-3.5" />Import
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
      )}
    >
      <p className="type-meta text-ink-muted mb-2">
        Vertical, grade, cost centre, position type and work state used by the MIS reports. An employee without a vertical tag uses the vertical of their department. Changes apply to months locked after the change.
      </p>
      {msg ? <InlineAlert tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</InlineAlert> : null}
      <div className="flex flex-wrap items-center gap-3 my-2">
        <TinyInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, name, department" className="w-64" />
        <label className="text-[11px] inline-flex items-center gap-1.5"><input type="checkbox" checked={onlyUntagged} onChange={(e) => setOnlyUntagged(e.target.checked)} />Only unassigned</label>
        <label className="text-[11px] inline-flex items-center gap-1.5"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />Include inactive</label>
        {untaggedCount ? <StatusChip label={`${untaggedCount} active employees without a vertical`} severity="critical" /> : <StatusChip label="Every active employee has a vertical" severity="info" />}
      </div>
      <DenseTable columns={columns} rows={rows} rowKey="id" stickyHeader onRowClick={(r) => setEditing({ ...r })} />
      <Modal open={!!editing} title={editing ? `${editing.employee_id} · ${editing.full_name}` : ''} onClose={() => setEditing(null)}
        footer={(
          <div className="flex justify-end gap-2">
            <button type="button" className="h-8 px-3 rounded border border-border text-xs" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="h-8 px-3 rounded bg-accent text-white text-xs font-semibold disabled:opacity-50" disabled={busy} onClick={save}>Save</button>
          </div>
        )}>
        {editing ? <TagFields value={editing} onChange={setEditing} /> : null}
      </Modal>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// General settings + snapshot log
// ---------------------------------------------------------------------------
function General() {
  const [company, setCompany] = useState('');
  const [state, setState] = useState('');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const s = await fetchSettings();
        setCompany(typeof s.company_name === 'string' ? s.company_name : '');
        setState(typeof s.default_state === 'string' ? s.default_state : '');
        setLog(await fetchJobLog());
      } catch (e) {
        toast.error('Could not load settings', e.message);
      }
    })();
  }, []);
  const save = async () => {
    setBusy(true);
    try {
      await saveSetting('company_name', company.trim() || null);
      await saveSetting('default_state', state.trim().toUpperCase() || null);
      toast.success('Settings saved');
    } catch (e) {
      toast.error('Could not save', e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <SectionCard title="General">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <label className="block text-xs text-ink-secondary">Company name on reports<TinyInput value={company} onChange={(e) => setCompany(e.target.value)} className="w-full mt-1" /></label>
          <label className="block text-xs text-ink-secondary">Default work state
            <TinyInput value={state} onChange={(e) => setState(e.target.value)} className="w-full mt-1" placeholder="e.g. GJ" />
            <span className="block type-meta text-ink-muted mt-0.5">Used for statutory payments when an employee has no work state tag.</span>
          </label>
        </div>
        <button type="button" disabled={busy} onClick={save} className="mt-3 h-8 px-3 rounded bg-accent text-white text-xs font-semibold disabled:opacity-50">Save</button>
      </SectionCard>
      <SectionCard title="Report figure builds">
        <DenseTable
          rowKey="id"
          rows={log}
          columns={[
            { key: 'created_at', label: 'When', render: (r) => new Date(r.created_at).toLocaleString('en-IN') },
            { key: 'month_key', label: 'Month', render: (r) => (r.month_key ? monthLabel(r.month_key) : '—') },
            { key: 'ok', label: 'Result', render: (r) => <StatusChip label={r.ok ? 'Built' : 'Failed'} severity={r.ok ? 'info' : 'critical'} /> },
            { key: 'message', label: 'Details', render: (r) => (r.ok ? r.message : 'The lock went through; use Rebuild on the report screen.') },
          ]}
        />
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup shell
// ---------------------------------------------------------------------------
export default function MisSetup() {
  const [tab, setTab] = useState('tags');
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    if (tab === 'access' && !users.length) fetchLoginUsers().then(setUsers).catch((e) => toast.error('Could not load users', e.message));
    if (tab === 'allocations' && !employees.length) fetchEmployeesForTags().then(setEmployees).catch((e) => toast.error('Could not load employees', e.message));
  }, [tab, users.length, employees.length]);

  const userOptions = useMemo(() => users.map((u) => ({ value: u.id, label: `${u.email}${u.username ? ` · ${u.username}` : ''}` })), [users]);
  const userLabel = (id) => userOptions.find((o) => o.value === id)?.label || id;
  const empOptions = useMemo(() => employees.map((e) => ({ value: String(e.id), label: `${e.employee_id} · ${e.full_name}` })), [employees]);
  const empLabel = (id) => empOptions.find((o) => o.value === String(id))?.label || id;

  return (
    <div className="space-y-3">
      <nav className="flex flex-wrap gap-1" aria-label="Setup">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`h-8 px-3 rounded text-[11px] font-medium border ${tab === t.id ? 'bg-accent text-white border-accent' : 'bg-white text-ink-secondary border-border'}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'tags' ? <EmployeeTags /> : null}

      {tab === 'departments' ? (
        <MasterEditor
          title="Departments and verticals" table="admin_payroll_departments" load={fetchDepartments} idKey="department" onConflict="department"
          help="Each department belongs to one vertical. Employees without their own vertical tag take their department's vertical."
          fields={[
            { key: 'department', label: 'Department', required: true },
            { key: 'vertical_code', label: 'Vertical', type: 'select', options: VERTICAL_OPTIONS },
          ]}
          columns={[
            { key: 'department', label: 'Department' },
            { key: 'vertical_code', label: 'Vertical', render: (r) => (r.vertical_code ? verticalLabel(r.vertical_code) : <span className="text-red-700">Not set</span>) },
          ]}
        />
      ) : null}

      {tab === 'allocations' ? (
        <MasterEditor
          title="Shared staff allocation" table="admin_payroll_cost_allocations" load={fetchAllocations} onConflict="employee_master_id,vertical_code"
          help="Split one employee's cost across verticals, e.g. 50% R&M and 50% AMC. Used when “Split shared staff” is ticked on the vertical and department reports."
          fields={[
            { key: 'employee_master_id', label: 'Employee', type: 'select', required: true },
            { key: 'vertical_code', label: 'Vertical', type: 'select', options: VERTICAL_OPTIONS, required: true },
            { key: 'pct', label: 'Share %', type: 'number', required: true },
          ]}
          optionsFor={{ employee_master_id: empOptions }}
          toRow={(r) => ({ ...r, employee_master_id: Number(r.employee_master_id), pct: num(r.pct) })}
          columns={[
            { key: 'employee_master_id', label: 'Employee', render: (r) => empLabel(r.employee_master_id) },
            { key: 'vertical_code', label: 'Vertical', render: (r) => verticalLabel(r.vertical_code) },
            { key: 'pct', label: 'Share %', render: (r) => `${Number(r.pct)}%` },
          ]}
        />
      ) : null}

      {tab === 'insurance' ? (
        <MasterEditor
          title="Group medical and accident insurance" table="admin_payroll_insurance_premiums" load={fetchPremiums}
          help="Enter the annual premium once. Each covered month carries annual ÷ 12 (or ÷ the months left in the policy year), shared equally by employees whose CTC includes mediclaim. Applies to months locked after it is saved."
          defaults={{ spread: 'twelve' }}
          fields={[
            { key: 'policy_name', label: 'Policy', required: true },
            { key: 'policy_start', label: 'Policy start', type: 'date', required: true },
            { key: 'policy_end', label: 'Policy end', type: 'date', required: true },
            { key: 'annual_premium', label: 'Annual premium (₹)', type: 'number', required: true },
            { key: 'spread', label: 'Spread', type: 'select', required: true, options: [{ value: 'twelve', label: 'Divide by 12' }, { value: 'remaining', label: 'Divide by months remaining' }] },
            { key: 'first_charge_month', label: 'First month to charge', type: 'date', hint: 'Only for “months remaining”; leave blank to start at the policy start.' },
          ]}
          toRow={(r) => ({ ...r, annual_premium: num(r.annual_premium), first_charge_month: r.first_charge_month || null })}
          columns={[
            { key: 'policy_name', label: 'Policy' },
            { key: 'policy_start', label: 'From' },
            { key: 'policy_end', label: 'To' },
            { key: 'annual_premium', label: 'Annual premium', render: (r) => `₹${Number(r.annual_premium).toLocaleString('en-IN')}` },
            { key: 'spread', label: 'Spread', render: (r) => (r.spread === 'twelve' ? '÷ 12' : '÷ months remaining') },
          ]}
        />
      ) : null}

      {tab === 'rates' ? (
        <MasterEditor
          title="Statutory rates" table="admin_payroll_statutory_rates" load={fetchRates} onConflict="statute,component,state,effective_from"
          help="Rates by state and effective date. The PF breakup on the statutory report uses these (EPS, EPF, EDLI, admin charges). Salary processing is not affected."
          defaults={{ state: 'ALL', statute: 'PF' }}
          fields={[
            { key: 'statute', label: 'Statute', type: 'select', options: STATUTES, required: true },
            { key: 'component', label: 'Component', required: true, placeholder: 'eps, epf_total, edli, admin, slab…' },
            { key: 'state', label: 'State', required: true, placeholder: 'ALL or state code' },
            { key: 'rate_pct', label: 'Rate %', type: 'number' },
            { key: 'fixed_amount', label: 'Fixed amount (₹)', type: 'number' },
            { key: 'wage_ceiling', label: 'Wage ceiling (₹)', type: 'number' },
            { key: 'effective_from', label: 'Effective from', type: 'date', required: true },
            { key: 'note', label: 'Note' },
          ]}
          toRow={(r) => ({ ...r, state: String(r.state || 'ALL').toUpperCase(), rate_pct: num(r.rate_pct), fixed_amount: num(r.fixed_amount), wage_ceiling: num(r.wage_ceiling) })}
          columns={[
            { key: 'statute', label: 'Statute' },
            { key: 'component', label: 'Component' },
            { key: 'state', label: 'State' },
            { key: 'rate_pct', label: 'Rate %', render: (r) => (r.rate_pct === null ? '—' : Number(r.rate_pct)) },
            { key: 'wage_ceiling', label: 'Ceiling', render: (r) => (r.wage_ceiling === null ? '—' : Number(r.wage_ceiling).toLocaleString('en-IN')) },
            { key: 'effective_from', label: 'From' },
          ]}
        />
      ) : null}

      {tab === 'calendar' ? (
        <MasterEditor
          title="Due-date calendar" table="admin_payroll_compliance_calendar" load={fetchCalendar} onConflict="statute,state"
          help="Due day for each statute, in the month after the wage month (month offset 1). A state row overrides the ALL row. Leave months blank when the statute applies every month."
          defaults={{ state: 'ALL', month_offset: 1 }}
          fields={[
            { key: 'statute', label: 'Statute', type: 'select', options: STATUTES, required: true },
            { key: 'state', label: 'State', required: true, placeholder: 'ALL or state code' },
            { key: 'day_of_month', label: 'Due day', type: 'number', required: true },
            { key: 'month_offset', label: 'Months after the wage month', type: 'number', required: true },
            { key: 'months_applicable', label: 'Wage months that apply', placeholder: 'e.g. 6, 12 (blank = every month)' },
            { key: 'note', label: 'Note' },
          ]}
          toRow={(r) => ({ ...r, state: String(r.state || 'ALL').toUpperCase(), day_of_month: num(r.day_of_month), month_offset: num(r.month_offset), months_applicable: intList(r.months_applicable) })}
          columns={[
            { key: 'statute', label: 'Statute' },
            { key: 'state', label: 'State' },
            { key: 'day_of_month', label: 'Due day' },
            { key: 'month_offset', label: 'Offset', render: (r) => `+${r.month_offset} month` },
            { key: 'months_applicable', label: 'Months', render: (r) => (r.months_applicable?.length ? r.months_applicable.join(', ') : 'Every month') },
          ]}
        />
      ) : null}

      {tab === 'budget' ? (
        <MasterEditor
          title="Budget" table="admin_payroll_budget" load={fetchBudget} onConflict="vertical_code,month_key"
          help="Budget headcount and CTC by vertical and month."
          fields={[
            { key: 'vertical_code', label: 'Vertical', type: 'select', options: VERTICAL_OPTIONS, required: true },
            { key: 'month_key', label: 'Month (YYYY-MM)', required: true, placeholder: '2026-10' },
            { key: 'budget_headcount', label: 'Budget headcount', type: 'number' },
            { key: 'budget_ctc', label: 'Budget CTC (₹)', type: 'number' },
          ]}
          toRow={(r) => ({ ...r, budget_headcount: num(r.budget_headcount), budget_ctc: num(r.budget_ctc) })}
          columns={[
            { key: 'month_key', label: 'Month', render: (r) => monthLabel(r.month_key) },
            { key: 'vertical_code', label: 'Vertical', render: (r) => verticalLabel(r.vertical_code) },
            { key: 'budget_headcount', label: 'Headcount', render: (r) => (r.budget_headcount === null ? '—' : Number(r.budget_headcount)) },
            { key: 'budget_ctc', label: 'CTC', render: (r) => (r.budget_ctc === null ? '—' : `₹${Number(r.budget_ctc).toLocaleString('en-IN')}`) },
          ]}
        />
      ) : null}

      {tab === 'recipients' ? (
        <MasterEditor
          title="Due-date alert emails" table="admin_payroll_mis_alert_recipients" load={fetchRecipients} onConflict="email"
          help="A daily email lists statutory payments that are due within 3 days or overdue."
          defaults={{ active: true }}
          fields={[
            { key: 'email', label: 'Email', type: 'email', required: true },
            { key: 'label', label: 'Name / role', placeholder: 'CFO, Compliance' },
            { key: 'active', label: 'Active', type: 'checkbox' },
          ]}
          toRow={(r) => ({ ...r, email: String(r.email).trim().toLowerCase() })}
          columns={[
            { key: 'email', label: 'Email' },
            { key: 'label', label: 'Name / role', render: (r) => r.label || '—' },
            { key: 'active', label: 'Status', render: (r) => <StatusChip label={r.active ? 'Active' : 'Paused'} severity={r.active ? 'info' : 'neutral'} /> },
          ]}
        />
      ) : null}

      {tab === 'access' ? (
        <MasterEditor
          title="Report access" table="admin_payroll_mis_access" load={fetchAccessList}
          help="Salary Admin users see every report. Add vertical heads here to let them see reports 1–6 for their own vertical (optionally one department)."
          fields={[
            { key: 'user_id', label: 'User', type: 'select', required: true },
            { key: 'vertical_code', label: 'Vertical', type: 'select', options: VERTICAL_OPTIONS, required: true },
            { key: 'department', label: 'Department (optional)', placeholder: 'Blank = whole vertical' },
            { key: 'note', label: 'Note' },
          ]}
          optionsFor={{ user_id: userOptions }}
          toRow={(r) => ({ ...r, department: r.department ? String(r.department).trim() : null })}
          columns={[
            { key: 'user_id', label: 'User', render: (r) => userLabel(r.user_id) },
            { key: 'vertical_code', label: 'Vertical', render: (r) => verticalLabel(r.vertical_code) },
            { key: 'department', label: 'Department', render: (r) => r.department || 'Whole vertical' },
          ]}
        />
      ) : null}

      {tab === 'general' ? <General /> : null}
    </div>
  );
}
