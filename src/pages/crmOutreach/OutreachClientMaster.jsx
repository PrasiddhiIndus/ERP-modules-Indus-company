import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, FileSpreadsheet, Plus, Search, Send, SlidersHorizontal, X } from 'lucide-react';
import {
  Badge,
  DenseTable,
  InlineAlert,
  KpiTile,
  StatusChip,
  TinyInput,
  TinySelect,
} from '../adminOperations/components/AdminUi';
import { useCrmOutreach } from './contexts/CrmOutreachContext';
import OutreachClientBulkImportModal from './components/OutreachClientBulkImportModal';
import { BUSINESS_MODULES, SITE_STATUSES } from './data/outreachConstants';

function clientStatusSeverity(status) {
  if (status === 'Active') return 'info';
  if (status === 'Lead') return 'warning';
  return 'critical';
}

export default function OutreachClientMaster() {
  const { clients, stats, loading, refreshing, error, reloadClients, refresh, openCompose, openClientEditor } = useCrmOutreach();

  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [siteStatusFilter, setSiteStatusFilter] = useState('all');
  const [manpowerFilter, setManpowerFilter] = useState('all');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const extraFilterCount = [cityFilter, stateFilter, siteStatusFilter, manpowerFilter].filter((v) => v !== 'all').length;
  const anyFilterActive = Boolean(search.trim()) || moduleFilter !== 'all' || statusFilter !== 'all' || extraFilterCount > 0;

  const clearFilters = () => {
    setSearch('');
    setModuleFilter('all');
    setStatusFilter('all');
    setCityFilter('all');
    setStateFilter('all');
    setSiteStatusFilter('all');
    setManpowerFilter('all');
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      reloadClients({
        search,
        module: moduleFilter,
        status: statusFilter,
        city: cityFilter,
        state: stateFilter,
        siteStatus: siteStatusFilter,
        manpowerFilter,
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [search, moduleFilter, statusFilter, cityFilter, stateFilter, siteStatusFilter, manpowerFilter, reloadClients]);

  const cities = useMemo(
    () => [...new Set(clients.map((c) => c.city).filter(Boolean))].sort(),
    [clients]
  );

  const states = useMemo(
    () => [...new Set(clients.map((c) => c.state).filter(Boolean))].sort(),
    [clients]
  );

  const filterOptions = useMemo(
    () => ({
      search,
      module: moduleFilter,
      status: statusFilter,
      city: cityFilter,
      state: stateFilter,
      siteStatus: siteStatusFilter,
      manpowerFilter,
    }),
    [search, moduleFilter, statusFilter, cityFilter, stateFilter, siteStatusFilter, manpowerFilter]
  );

  const statsDisplay = stats || { total: 0, active: 0, modules: 0, mails30d: 0 };

  const handleImportComplete = () => {
    refresh(filterOptions, { silent: true }).catch(() => {});
  };

  const filteredRows = useMemo(() => {
    const rows = [...clients].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === 'module') {
        av = BUSINESS_MODULES[a.module]?.label || '';
        bv = BUSINESS_MODULES[b.module]?.label || '';
      }
      if (av > bv) return sortDir;
      if (av < bv) return -sortDir;
      return 0;
    });
    return rows;
  }, [clients, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => -d);
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const toggleRow = (id, checked) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked) => {
    if (checked) setSelected(new Set(filteredRows.map((r) => r.id)));
    else setSelected(new Set());
  };

  const allChecked = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));

  const sortHeader = (label, key) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className={`text-left font-semibold hover:text-ink ${sortKey === key ? 'text-accent' : ''}`}
    >
      {label}
      {sortKey === key ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}
    </button>
  );

  const columns = useMemo(
    () => [
      {
        key: '__check',
        label: (
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => toggleAll(e.target.checked)}
            aria-label="Select all"
            className="accent-accent"
          />
        ),
        widthClassName: 'w-10',
        headerRender: () => (
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => toggleAll(e.target.checked)}
            aria-label="Select all"
            className="accent-accent"
          />
        ),
        render: (row) => (
          <input
            type="checkbox"
            checked={selected.has(row.id)}
            onChange={(e) => toggleRow(row.id, e.target.checked)}
            aria-label={`Select ${row.name}`}
            className="accent-accent"
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      {
        key: 'name',
        label: 'Client',
        headerRender: () => sortHeader('Client', 'name'),
        render: (row) => (
          <div className="flex items-center gap-2.5 min-w-[220px]">
            <span className="w-8 h-8 shrink-0 rounded-full bg-accent-soft text-accent text-xs font-semibold flex items-center justify-center">
              {String(row.name || '?').trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink text-[13px] truncate">{row.name}</p>
              <p className="text-[11px] text-ink-muted mt-0.5 truncate">
                {row.contact ? `${row.contact} · ` : ''}
                {row.email}
              </p>
            </div>
          </div>
        ),
      },
      {
        key: 'module',
        label: 'Module',
        headerRender: () => sortHeader('Module', 'module'),
        render: (row) => {
          const mod = BUSINESS_MODULES[row.module];
          return mod ? (
            <Badge tone={mod.tone}>{mod.label}</Badge>
          ) : (
            row.module
          );
        },
      },
      {
        key: 'city',
        label: 'City',
        headerRender: () => sortHeader('City', 'city'),
        render: (row) => row.city || '—',
      },
      {
        key: 'state',
        label: 'State',
        headerRender: () => sortHeader('State', 'state'),
        render: (row) => row.state || '—',
      },
      {
        key: 'manpowerRequired',
        label: 'Manpower',
        headerRender: () => sortHeader('Manpower', 'manpowerRequired'),
        render: (row) => (row.manpowerRequired ?? '—'),
      },
      {
        key: 'siteStatus',
        label: 'Site Status',
        headerRender: () => sortHeader('Site Status', 'siteStatus'),
        render: (row) => row.siteStatus || '—',
      },
      {
        key: 'status',
        label: 'Status',
        headerRender: () => sortHeader('Status', 'status'),
        render: (row) => (
          <StatusChip label={row.status} severity={clientStatusSeverity(row.status)} />
        ),
      },
      {
        key: 'lastContact',
        label: 'Last Contacted',
        headerRender: () => sortHeader('Last Contacted', 'lastContact'),
      },
      {
        key: 'actions',
        label: '',
        widthClassName: 'w-20',
        render: (row) => (
          <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              title="Send mail"
              onClick={(e) => {
                e.stopPropagation();
                openCompose([row.id]);
              }}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border bg-white text-ink-muted hover:border-accent hover:text-accent"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Edit client"
              onClick={(e) => {
                e.stopPropagation();
                openClientEditor(row.id);
              }}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border bg-white text-ink-muted hover:border-accent hover:text-accent"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ),
      },
    ],
    [allChecked, selected, sortKey, sortDir, openCompose, openClientEditor]
  );

  return (
    <div className="space-y-4">
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Total Clients" value={loading ? '…' : statsDisplay.total} />
        <KpiTile label="Active" value={loading ? '…' : statsDisplay.active} />
        <KpiTile label="Modules Covered" value={loading ? '…' : statsDisplay.modules} />
        <KpiTile label="Mails Sent (30d)" value={loading ? '…' : statsDisplay.mails30d} />
      </div>

      <div className="rounded-card border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <TinyInput
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client, contact, or email…"
              className="pl-8 w-full"
            />
          </div>
          <TinySelect value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="min-w-[150px]">
            <option value="all">All Modules</option>
            {Object.values(BUSINESS_MODULES).map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </TinySelect>
          <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-[130px]">
            <option value="all">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Lead">Lead</option>
            <option value="Inactive">Inactive</option>
          </TinySelect>
          <button
            type="button"
            onClick={() => setMoreFiltersOpen((v) => !v)}
            aria-expanded={moreFiltersOpen}
            className={`erp-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1.5 ${
              moreFiltersOpen || extraFilterCount ? 'border-accent text-accent' : ''
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            More filters
            {extraFilterCount ? (
              <span className="bg-accent text-white text-[10px] font-mono px-1.5 rounded-full">{extraFilterCount}</span>
            ) : null}
          </button>
          {anyFilterActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="h-8 px-2 text-xs text-ink-muted hover:text-ink inline-flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="erp-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Import
            </button>
            <button
              type="button"
              onClick={() => openClientEditor(null)}
              className="erp-btn-primary h-8 px-3 text-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Client
            </button>
          </div>
        </div>

        {moreFiltersOpen ? (
          <div className="grid gap-2 border-t border-border bg-surface-sunken/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <TinySelect value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="w-full">
              <option value="all">All Cities</option>
              {cities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </TinySelect>
            <TinySelect value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="w-full">
              <option value="all">All States</option>
              {states.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </TinySelect>
            <TinySelect value={siteStatusFilter} onChange={(e) => setSiteStatusFilter(e.target.value)} className="w-full">
              <option value="all">All Site Statuses</option>
              {SITE_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </TinySelect>
            <TinySelect value={manpowerFilter} onChange={(e) => setManpowerFilter(e.target.value)} className="w-full">
              <option value="all">Any Manpower</option>
              <option value="with">With manpower</option>
              <option value="without">Without manpower</option>
            </TinySelect>
          </div>
        ) : null}
      </div>

      {selected.size > 0 ? (
        <div className="flex items-center justify-between rounded-lg border border-accent-border bg-accent-soft px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-ink">
            <span className="bg-accent text-white font-bold font-mono text-xs px-2 py-0.5 rounded-full">
              {selected.size}
            </span>
            <span className="font-medium">{selected.size === 1 ? 'client selected' : 'clients selected'}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="erp-btn-secondary h-8 px-3 text-xs"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => openCompose([...selected])}
              className="erp-btn-primary h-8 px-3 text-xs inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Send Mail
            </button>
          </div>
        </div>
      ) : null}

      <DenseTable
        columns={columns}
        rows={filteredRows}
        rowKey="id"
        showSerialNumber={false}
      />
      {refreshing && !loading ? (
        <p className="text-xs text-ink-muted text-center">Refreshing…</p>
      ) : null}

      <OutreachClientBulkImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={handleImportComplete}
      />
    </div>
  );
}
