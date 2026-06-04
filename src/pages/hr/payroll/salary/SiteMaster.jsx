import React, { useEffect, useMemo, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { KpiTile, SectionCard, DenseTable, Badge } from '../../../adminOperations/components/AdminUi';
import { listPayrollSites } from '../../../../services/payrollApi';

const DEMO_SITES = [
  { id: 'd1', site_code: 'S001', site_name: 'Arcelormittal Nippon Steel Hazir', state: 'GJ', cost_centre: 'CC-1001', formula_package: 'North region', status: 'Active' },
  { id: 'd2', site_code: 'S002', site_name: 'Reliance Jamnagar Refinery', state: 'GJ', cost_centre: 'CC-1002', formula_package: 'Manufacturing', status: 'Active' },
  { id: 'd3', site_code: 'S003', site_name: 'Tata Mundra Port', state: 'GJ', cost_centre: 'CC-1003', formula_package: 'North region', status: 'Inactive' },
];

export default function SiteMaster() {
  const [sites, setSites] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await listPayrollSites();
        if (cancelled) return;
        if (data?.length) {
          setSites(data.map((s) => ({
            ...s,
            cost_centre: s.cost_centre || s.site_code,
            formula_package: s.formula_package || 'Default',
            status: s.is_active !== false ? 'Active' : 'Inactive',
          })));
          setUsingDemo(false);
        } else {
          setSites(DEMO_SITES);
          setUsingDemo(true);
        }
      } catch {
        if (!cancelled) {
          setSites(DEMO_SITES);
          setUsingDemo(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return sites;
    const q = search.toLowerCase();
    return sites.filter(
      (s) =>
        s.site_code?.toLowerCase().includes(q) ||
        s.site_name?.toLowerCase().includes(q) ||
        s.state?.toLowerCase().includes(q)
    );
  }, [sites, search]);

  const activeCount = sites.filter((s) => s.status === 'Active' || s.is_active !== false).length;

  const tableRows = filtered.map((s) => ({
    id: s.id,
    site_code: s.site_code,
    site_name: s.site_name,
    state: s.state || '—',
    cost_centre: s.cost_centre || '—',
    formula_package: s.formula_package || 'Default',
    status: s.status || (s.is_active !== false ? 'Active' : 'Inactive'),
  }));

  const columns = [
    { key: 'site_code', label: 'Code' },
    { key: 'site_name', label: 'Site name' },
    { key: 'state', label: 'State' },
    { key: 'cost_centre', label: 'Cost centre' },
    {
      key: 'formula_package',
      label: 'Formula package',
      render: (row) => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
          String(row.formula_package).toLowerCase().includes('manufacturing')
            ? 'bg-amber-100 text-amber-800'
            : 'bg-blue-100 text-blue-800'
        }`}>
          {row.formula_package}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={row.status === 'Active' ? 'text-emerald-600 font-medium' : 'text-gray-500'}>{row.status}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Site master</h2>
          <p className="text-xs text-gray-500 mt-0.5">Locations & cost centres.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium hover:bg-[#1a3278]">
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <KpiTile label="Total sites" value={sites.length} />
        <KpiTile label="Active" value={activeCount} tone="border-emerald-100" />
        <KpiTile label="Formula packages" value={new Set(sites.map((s) => s.formula_package)).size} />
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-56 h-9 rounded-lg border border-gray-200 px-3 text-sm"
        />
        <button type="button" className="h-9 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50">
          Filter
        </button>
      </div>

      {usingDemo ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Showing sample sites — connect payroll sites in database to load live data.
        </p>
      ) : null}

      <SectionCard title={`Sites (${filtered.length})`} right={<Badge>{loading ? 'Loading…' : 'Live'}</Badge>}>
        <DenseTable columns={columns} rows={tableRows} rowKey="id" />
      </SectionCard>
    </div>
  );
}
