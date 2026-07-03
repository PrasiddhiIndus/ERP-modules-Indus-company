import React, { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus } from 'lucide-react';
import { KpiTile, SectionCard, DenseTable, Badge, Modal } from '../../../adminOperations/components/AdminUi';
import { listPayrollSites, payrollSiteRowToForm } from '../../../../services/payrollApi';
import SiteMasterSetupForm from './components/SiteMasterSetupForm';
import { createEmptySiteForm, SITE_FORM_REQUIRED } from './siteMasterOptions';

const DEMO_SITES = [
  {
    id: 'd1',
    site_code: 'S001',
    site_name: 'Arcelormittal Nippon Steel Hazir',
    state: 'Gujarat',
    industry_category: 'Manufacturing',
    cost_centre: 'CC-1001 — Corporate Ops',
    formula_package: 'Default',
    attendance_cycle: '1st to 31st',
    ot_rate: 'Single Rate',
    status: 'Active',
    is_active: true,
  },
  {
    id: 'd2',
    site_code: 'S002',
    site_name: 'Reliance Jamnagar Refinery',
    state: 'Gujarat',
    industry_category: 'Oil & Gas',
    cost_centre: 'CC-1002 — Manufacturing',
    formula_package: 'Security',
    attendance_cycle: '21st to 20th',
    ot_rate: 'Double Rate',
    status: 'Active',
    is_active: true,
  },
  {
    id: 'd3',
    site_code: 'S003',
    site_name: 'Tata Mundra Port',
    state: 'Gujarat',
    industry_category: 'Port',
    cost_centre: 'CC-1003 — Logistics',
    formula_package: 'Housekeeping Pack',
    attendance_cycle: '1st to 31st',
    ot_rate: 'No OT',
    status: 'Inactive',
    is_active: false,
  },
];

function normalizeSiteRow(row) {
  return {
    ...row,
    cost_centre: row.cost_centre || row.site_code,
    formula_package: row.formula_package || 'Default',
    industry_category: row.industry_category || '—',
    status: row.status || (row.is_active !== false ? 'Active' : 'Inactive'),
  };
}

function formToSiteRow(form) {
  const id = form.id || `local-${Date.now()}`;
  return normalizeSiteRow({
    id,
    site_code: String(form.siteCode || '').trim().toUpperCase(),
    site_name: String(form.siteName || '').trim(),
    state: form.state || '',
    industry_category: form.industryCategory || '',
    cost_centre: form.costCentre || '',
    site_address: form.siteAddress || '',
    primary_client_contact: form.primaryClientContact || '',
    contact_phone_email: form.contactPhoneEmail || '',
    attendance_cycle: form.attendanceCycle || '1st to 31st',
    formula_package: form.formulaPackage || 'Default',
    ot_rate: form.otRate || 'Single Rate',
    status: form.status || 'Active',
    is_active: form.status !== 'Inactive',
  });
}

function siteRowToSetupForm(row) {
  if (!row) return createEmptySiteForm();
  return payrollSiteRowToForm(row);
}

function validateSiteForm(form) {
  for (const [field, label] of SITE_FORM_REQUIRED) {
    if (!String(form[field] || '').trim()) {
      return `Please enter ${label}.`;
    }
  }
  return '';
}

export default function SiteMaster() {
  const [sites, setSites] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(createEmptySiteForm);
  const [formError, setFormError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await listPayrollSites();
        if (cancelled) return;
        if (data?.length) {
          setSites(data.map(normalizeSiteRow));
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
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return sites;
    const q = search.toLowerCase();
    return sites.filter(
      (s) =>
        s.site_code?.toLowerCase().includes(q) ||
        s.site_name?.toLowerCase().includes(q) ||
        s.state?.toLowerCase().includes(q) ||
        s.industry_category?.toLowerCase().includes(q)
    );
  }, [sites, search]);

  const activeCount = sites.filter((s) => s.status === 'Active' || s.is_active !== false).length;

  const tableRows = filtered.map((s) => ({
    id: s.id,
    site_code: s.site_code,
    site_name: s.site_name,
    state: s.state || '—',
    industry_category: s.industry_category || '—',
    cost_centre: s.cost_centre || '—',
    formula_package: s.formula_package || 'Default',
    status: s.status || (s.is_active !== false ? 'Active' : 'Inactive'),
    _raw: s,
  }));

  const openAddForm = () => {
    setFormError('');
    setForm(createEmptySiteForm());
    setFormOpen(true);
  };

  const openEditForm = (row) => {
    setFormError('');
    setForm(siteRowToSetupForm(row._raw || row));
    setFormOpen(true);
  };

  const onFormChange = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (formError) setFormError('');
  };

  const onSaveForm = () => {
    const validationError = validateSiteForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const duplicate = sites.find(
      (s) =>
        String(s.site_code).toUpperCase() === String(form.siteCode).trim().toUpperCase() &&
        String(s.id) !== String(form.id)
    );
    if (duplicate) {
      setFormError('Site Code must be unique.');
      return;
    }

    const nextRow = formToSiteRow(form);
    setSites((prev) => {
      const idx = prev.findIndex((s) => String(s.id) === String(form.id));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...prev[idx], ...nextRow, id: prev[idx].id };
        return copy;
      }
      return [...prev, nextRow];
    });
    setFormOpen(false);
    setSaveNotice(
      form.id
        ? 'Site updated in this session. Database sync will be enabled once schema is deployed.'
        : 'Site added in this session. Database sync will be enabled once schema is deployed.'
    );
  };

  const columns = [
    { key: 'site_code', label: 'Code' },
    { key: 'site_name', label: 'Site name' },
    { key: 'state', label: 'State' },
    { key: 'industry_category', label: 'Industry' },
    { key: 'cost_centre', label: 'Cost centre' },
    {
      key: 'formula_package',
      label: 'Formula package',
      render: (row) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
            String(row.formula_package).toLowerCase().includes('security')
              ? 'bg-amber-100 text-amber-800'
              : 'bg-blue-100 text-blue-800'
          }`}
        >
          {row.formula_package}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={row.status === 'Active' ? 'font-medium text-emerald-600' : 'text-gray-500'}>
          {row.status}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <button
          type="button"
          onClick={() => openEditForm(row)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1F3A8A] hover:underline"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Site master</h2>
          <p className="mt-0.5 text-xs text-gray-500">Locations, cost centres &amp; payroll control switches.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1F3A8A] px-3 text-xs font-medium text-white hover:bg-[#1a3278]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add site
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
          className="h-9 w-56 rounded-lg border border-gray-200 px-3 text-sm"
        />
      </div>

      {usingDemo ? (
        <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Showing sample sites — connect payroll sites in database to load live data.
        </p>
      ) : null}

      {saveNotice ? (
        <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {saveNotice}
        </p>
      ) : null}

      <SectionCard title={`Sites (${filtered.length})`} right={<Badge>{loading ? 'Loading…' : 'Live'}</Badge>}>
        <DenseTable columns={columns} rows={tableRows} rowKey="id" />
      </SectionCard>

      <Modal
        open={formOpen}
        title={form.id ? 'Edit site — Master setup' : 'Add site — Master setup'}
        onClose={() => setFormOpen(false)}
        widthClass="max-w-3xl"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">Form preview only — database save not enabled yet.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="h-9 rounded-lg border border-gray-200 px-4 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSaveForm}
                className="h-9 rounded-lg bg-[#1F3A8A] px-4 text-xs font-semibold text-white hover:bg-[#1a3278]"
              >
                {form.id ? 'Update site' : 'Save site'}
              </button>
            </div>
          </div>
        }
      >
        {formError ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</p>
        ) : null}
        <SiteMasterSetupForm form={form} onChange={onFormChange} />
      </Modal>
    </div>
  );
}
