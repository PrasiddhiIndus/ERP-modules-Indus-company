import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionCard, FilterBar, TinySelect, DenseTable, Badge } from '../../../adminOperations/components/AdminUi';
import { fetchActiveEmployeesForPayroll } from '../../../../services/attendancePayrollApi';
import { listEmployeePayrollProfiles, listPayrollSites } from '../../../../services/payrollApi';
import { fetchPresentDaysByEmployeeCode } from '../../../../services/attendancePayrollApi';
import { supabase } from '../../../../lib/supabase';

export default function EmployeePayrollList() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('All');
  const [employees, setEmployees] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [sites, setSites] = useState([]);
  const [presentMap, setPresentMap] = useState(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [emps, profs, siteList, att] = await Promise.all([
          fetchActiveEmployeesForPayroll(supabase),
          listEmployeePayrollProfiles(),
          listPayrollSites(),
          fetchPresentDaysByEmployeeCode(supabase, `${month}-01`),
        ]);
        if (!cancelled) {
          setEmployees(emps);
          setProfiles(profs);
          setSites(siteList);
          setPresentMap(att.byEmpCode);
        }
      } catch {
        if (!cancelled) {
          setEmployees([]);
          setProfiles([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month]);

  const profileById = useMemo(() => new Map(profiles.map((p) => [String(p.employee_master_id), p])), [profiles]);
  const siteById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  const rows = useMemo(() => {
    let list = employees.map((e) => {
      const prof = profileById.get(String(e.id)) || {};
      const site = prof.payroll_site_id ? siteById.get(prof.payroll_site_id) : null;
      const code = String(e.employee_code || '').trim();
      const att = presentMap.get(code) || {};
      return {
        id: e.id,
        employee_id: e.employee_id,
        employee_code: code,
        full_name: e.full_name,
        department: e.department,
        site_name: site?.site_name || e.location || '—',
        gross: prof.gross_monthly ?? 0,
        present_days: att.presentDays ?? 0,
        pf: prof.pf_applicable !== false,
        esic: prof.esic_applicable !== false,
        pt_state: prof.payroll_state || site?.state || '—',
        tax: prof.tds_applicable !== false,
      };
    });
    if (siteFilter !== 'All') list = list.filter((r) => r.site_name === siteFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.full_name?.toLowerCase().includes(s) ||
          r.employee_code?.toLowerCase().includes(s) ||
          r.employee_id?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [employees, profileById, siteById, presentMap, siteFilter, search]);

  const siteOptions = useMemo(() => ['All', ...new Set(rows.map((r) => r.site_name).filter((x) => x && x !== '—'))], [rows]);

  const columns = [
    { key: 'employee_code', label: 'Code' },
    { key: 'full_name', label: 'Name' },
    { key: 'department', label: 'Dept' },
    { key: 'site_name', label: 'Site' },
    { key: 'gross', label: 'Gross' },
    { key: 'present_days', label: 'P. Days' },
    { key: 'pf', label: 'PF' },
    { key: 'esic', label: 'ESIC' },
    { key: 'pt_state', label: 'PT State' },
  ];

  const tableRows = rows.map((r) => ({
    ...r,
    gross: `₹${Number(r.gross).toLocaleString('en-IN')}`,
    pf: r.pf ? 'Yes' : 'No',
    esic: r.esic ? 'Yes' : 'No',
  }));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Employee payroll list</h2>
      <FilterBar>
        <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 border rounded px-2 text-xs" />
        </label>
        <label className="text-[11px] text-gray-600 flex flex-col gap-0.5 flex-1 min-w-[140px]">
          Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 border rounded px-2 text-xs" placeholder="Name or code" />
        </label>
        <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
          Site
          <TinySelect value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            {siteOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </TinySelect>
        </label>
      </FilterBar>
      <SectionCard title={`Employees (${rows.length})`} right={<Badge>{loading ? 'Loading' : 'People Master'}</Badge>}>
        <DenseTable
          columns={columns}
          rows={tableRows}
          rowKey="id"
          onRowClick={(row) => navigate(`employees/${row.id}`)}
        />
      </SectionCard>
    </div>
  );
}
