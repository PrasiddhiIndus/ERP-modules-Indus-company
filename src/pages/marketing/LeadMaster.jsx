import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Edit2, Plus, Search, Trash2, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { formatDateDdMmYyyy } from '../../utils/dateDisplay';
import FormDateInput from '../../components/FormDateInput';
import { DenseTable } from '../adminOperations/components/AdminUi';
import ColumnFilterMenu, {
  BLANK_FILTER_VALUE,
  BLANK_FILTER_LABEL,
} from './components/ColumnFilterMenu';
import {
  OWNERSHIP_OPTIONS,
  PROJECT_STAGE_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  downloadLeadTemplate,
  emptyLeadForm,
  formToPayload,
  formatLeadCost,
  leadToForm,
  parseLeadWorkbook,
  persistLeadRecords,
} from './lib/leadMaster';

const ITEMS_PER_PAGE = 20;

function dash(value) {
  if (value == null || String(value).trim() === '') return '-';
  return String(value);
}

function sanitizeSearch(value) {
  return String(value || '')
    .replace(/[%_,()]/g, ' ')
    .trim();
}

/** PostgREST `in.(...)` list — quote each value so spaces and dots stay intact. */
function quoteInList(values) {
  return values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
}

function Field({ label, required, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm';

export default function LeadMaster() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [formData, setFormData] = useState(emptyLeadForm());
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [stageOptions, setStageOptions] = useState([]);
  const [stageFilter, setStageFilter] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    loadStageOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLeads(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, stageFilter]);

  /** Every stage present in the saved leads — new stages appear here automatically. */
  const loadStageOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_leads')
        .select('project_stage')
        .not('project_stage', 'is', null)
        .limit(5000);
      if (error) throw error;
      const found = new Set(
        (data || []).map((r) => String(r.project_stage || '').trim()).filter(Boolean)
      );
      PROJECT_STAGE_OPTIONS.forEach((s) => found.add(s));
      setStageOptions([...found].sort((a, b) => a.localeCompare(b)));
    } catch (error) {
      console.error('Error loading stages:', error);
      setStageOptions([...PROJECT_STAGE_OPTIONS]);
    }
  };

  const fetchLeads = async (page = currentPage) => {
    try {
      setLoading(true);
      setLoadError('');
      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      let query = supabase
        .from('marketing_leads')
        .select('*', { count: 'exact' })
        .order('sheet_updated_on', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      const q = sanitizeSearch(debouncedSearch);
      if (q) {
        query = query.or(
          [
            `company.ilike.%${q}%`,
            `project.ilike.%${q}%`,
            `industry.ilike.%${q}%`,
            `project_stage.ilike.%${q}%`,
            `location.ilike.%${q}%`,
            `district.ilike.%${q}%`,
            `project_state.ilike.%${q}%`,
            `contact_person.ilike.%${q}%`,
            `email.ilike.%${q}%`,
            `remarks.ilike.%${q}%`,
          ].join(',')
        );
      }

      if (Array.isArray(stageFilter) && stageFilter.length) {
        const named = stageFilter.filter((v) => v !== BLANK_FILTER_VALUE);
        const wantsBlank = stageFilter.includes(BLANK_FILTER_VALUE);
        const parts = [];
        if (named.length) parts.push(`project_stage.in.(${quoteInList(named)})`);
        if (wantsBlank) parts.push('project_stage.is.null');
        if (parts.length) query = query.or(parts.join(','));
      }

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      setLeads(data || []);
      setTotalCount(count || 0);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error fetching leads:', error);
      const msg = String(error?.message || '');
      setLoadError(
        /relation|does not exist|schema cache/i.test(msg)
          ? 'Lead records could not be loaded yet. Ask support to apply the latest update, then refresh.'
          : 'Could not load leads. Try again.'
      );
      setLeads([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const openNewLead = () => {
    setEditingLead(null);
    setFormData(emptyLeadForm());
    setShowForm(true);
  };

  const openEditLead = (lead) => {
    setEditingLead(lead);
    setFormData(leadToForm(lead));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingLead(null);
    setFormData(emptyLeadForm());
  };

  const cancelForm = () => {
    if (saving) return;
    closeForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { error: validationError, payload } = formToPayload(formData);
    if (validationError) {
      toast.warning(validationError);
      return;
    }
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (editingLead) {
        const { error } = await supabase
          .from('marketing_leads')
          .update({
            ...payload,
            updated_by: user?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingLead.id);
        if (error) throw error;
        toast.success('Lead updated');
      } else {
        const { error } = await supabase.from('marketing_leads').insert([
          {
            ...payload,
            created_by: user?.id || null,
            updated_by: user?.id || null,
          },
        ]);
        if (error) throw error;
        toast.success('Lead added');
      }
      closeForm();
      loadStageOptions();
      fetchLeads(editingLead ? currentPage : 1);
    } catch (error) {
      console.error('Error saving lead:', error);
      toast.warning('Could not save this lead. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (lead) => {
    if (!lead?.id) return;
    if (!confirm(`Remove the lead for ${lead.company || 'this company'}?`)) return;
    try {
      const { error } = await supabase.from('marketing_leads').delete().eq('id', lead.id);
      if (error) throw error;
      toast.success('Lead removed');
      fetchLeads(currentPage);
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast.warning('Could not remove this lead. Try again.');
    }
  };

  const handleUpload = async (file) => {
    if (!file || importing) return;
    setImporting(true);
    try {
      const parsed = await parseLeadWorkbook(file);
      if (!parsed.ok) {
        toast.warning(parsed.error || 'Could not read that sheet.');
        return;
      }
      if (!parsed.records.length) {
        toast.warning(
          parsed.skipped
            ? 'No usable rows found. Each row needs a company name.'
            : 'The sheet has no lead rows to import.'
        );
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const result = await persistLeadRecords(supabase, parsed.records, user?.id);
      const extra = parsed.skipped ? ` ${parsed.skipped} row(s) skipped (no company).` : '';
      toast.success(
        `Imported ${result.inserted} new lead${result.inserted === 1 ? '' : 's'}, updated ${result.updated}.${extra}`
      );
      loadStageOptions();
      fetchLeads(1);
    } catch (error) {
      console.error('Error importing leads:', error);
      toast.warning('Could not import that Excel file. Check the columns and try again.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const columns = [
      {
        key: 'company',
        label: 'Company',
        widthClassName: 'w-[200px] min-w-[200px] max-w-[200px]',
        render: (row) => (
          <span className="font-medium text-gray-900 whitespace-normal">{dash(row.company)}</span>
        ),
      },
      {
        key: 'project',
        label: 'Project',
        widthClassName: 'w-[220px] min-w-[220px] max-w-[220px]',
        render: (row) => (
          <span className="whitespace-normal text-gray-700" title={row.project || ''}>
            {dash(row.project)}
          </span>
        ),
      },
      {
        key: 'project_type',
        label: 'Project type',
        widthClassName: 'w-[110px] min-w-[110px]',
        render: (row) => dash(row.project_type),
      },
      {
        key: 'ownership',
        label: 'Ownership',
        widthClassName: 'w-[140px] min-w-[140px]',
        render: (row) => dash(row.ownership),
      },
      {
        key: 'industry',
        label: 'Industry',
        widthClassName: 'w-[160px] min-w-[160px]',
        render: (row) => dash(row.industry),
      },
      {
        key: 'project_cost',
        label: 'Project cost',
        widthClassName: 'w-[110px] min-w-[110px]',
        cellClassName: 'tabular-nums text-right',
        render: (row) => formatLeadCost(row.project_cost) || '-',
      },
      {
        key: 'project_stage',
        label: 'Project stage',
        widthClassName: 'w-[196px] min-w-[196px]',
        headerRender: () => (
          <ColumnFilterMenu
            label="Project stage"
            options={stageOptions}
            value={stageFilter}
            onApply={(next) => {
              setStageFilter(next);
              setCurrentPage(1);
            }}
          />
        ),
        render: (row) => dash(row.project_stage),
      },
      {
        key: 'location',
        label: 'Location',
        widthClassName: 'w-[140px] min-w-[140px]',
        render: (row) => dash(row.location),
      },
      {
        key: 'district',
        label: 'District',
        widthClassName: 'w-[120px] min-w-[120px]',
        render: (row) => dash(row.district),
      },
      {
        key: 'project_state',
        label: 'Project state',
        widthClassName: 'w-[130px] min-w-[130px]',
        render: (row) => dash(row.project_state),
      },
      {
        key: 'address_state',
        label: 'Addr. state',
        widthClassName: 'w-[120px] min-w-[120px]',
        render: (row) => dash(row.address_state),
      },
      {
        key: 'telephone',
        label: 'Telephone',
        widthClassName: 'w-[130px] min-w-[130px]',
        render: (row) => dash(row.telephone),
      },
      {
        key: 'email',
        label: 'Email',
        widthClassName: 'w-[180px] min-w-[180px]',
        render: (row) => (
          <span className="text-purple-700" title={row.email || ''}>
            {dash(row.email)}
          </span>
        ),
      },
      {
        key: 'contact_person',
        label: 'Person',
        widthClassName: 'w-[130px] min-w-[130px]',
        render: (row) => dash(row.contact_person),
      },
      {
        key: 'contact_person_2',
        label: 'Person 2',
        widthClassName: 'w-[120px] min-w-[120px]',
        render: (row) => dash(row.contact_person_2),
      },
      {
        key: 'sheet_updated_on',
        label: 'Updated on',
        widthClassName: 'w-[110px] min-w-[110px]',
        render: (row) => formatDateDdMmYyyy(row.sheet_updated_on) || '-',
      },
      {
        key: 'remarks',
        label: 'Remarks',
        widthClassName: 'w-[180px] min-w-[180px] max-w-[180px]',
        render: (row) => (
          <span className="block truncate" title={row.remarks || ''}>
            {dash(row.remarks)}
          </span>
        ),
      },
      {
        key: 'actions',
        label: '',
        widthClassName: 'w-[72px] min-w-[72px]',
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              title="Edit lead"
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600"
              onClick={(e) => {
                e.stopPropagation();
                openEditLead(row);
              }}
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Remove lead"
              className="p-1.5 rounded-md hover:bg-red-50 text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(row);
              }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ),
      },
    ];

  const setField = (key) => (e) => {
    setFormData((prev) => ({ ...prev, [key]: e.target.value }));
  };

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Lead Master</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              {loading ? 'Loading project leads…' : `${totalCount} project lead${totalCount === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-[260px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search leads…"
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm sm:text-base disabled:opacity-60"
            >
              <Upload className="w-4 h-4" />
              <span>{importing ? 'Uploading…' : 'Upload Excel'}</span>
            </button>
            <button
              type="button"
              onClick={downloadLeadTemplate}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Template</span>
              <span className="sm:hidden">Template</span>
            </button>
            <button
              type="button"
              onClick={openNewLead}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base"
            >
              <Plus className="w-4 h-4" />
              <span>Add lead</span>
            </button>
          </div>
        </div>

        {loadError ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {loadError}
          </div>
        ) : null}

        {stageFilter?.length ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-500">Stage filter:</span>
            {stageFilter.map((v) => (
              <span
                key={v}
                className="inline-flex items-center px-2 py-1 rounded-full border border-purple-200 bg-purple-50 text-purple-800"
              >
                {v === BLANK_FILTER_VALUE ? BLANK_FILTER_LABEL : v}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setStageFilter(null)}
              className="text-purple-700 hover:underline"
            >
              Clear
            </button>
          </div>
        ) : null}

        <div className="bg-white rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-4 sm:p-8 text-center text-gray-500">Loading...</div>
          ) : leads.length === 0 ? (
            <div className="p-4 sm:p-8 text-center text-gray-500">
              {stageFilter?.length
                ? 'No leads in the selected stage(s).'
                : debouncedSearch
                  ? 'No leads match that search.'
                  : 'No leads yet. Upload the Excel sheet or add a lead.'}
            </div>
          ) : (
            <DenseTable
              columns={columns}
              rows={leads}
              rowKey="id"
              frozenColumnCount={2}
              frozenColumnWidths={[200, 220]}
              serialOffset={(currentPage - 1) * ITEMS_PER_PAGE}
              serialLabel="S.No"
              stickyHeader
              scrollMaxHeight="calc(100dvh - 16rem)"
              density="compact"
              onRowClick={openEditLead}
            />
          )}

          {!loading && totalCount > ITEMS_PER_PAGE ? (
            <div className="flex items-center justify-between gap-3 px-3 sm:px-6 py-3 border-t bg-white">
              <p className="text-xs text-gray-600">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
                {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchLeads(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button
                  type="button"
                  onClick={() => fetchLeads(currentPage + 1)}
                  disabled={currentPage * ITEMS_PER_PAGE >= totalCount}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm disabled:opacity-40"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {showForm ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  {editingLead ? 'Edit lead' : 'Add lead'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  Company and project first, then location and who to contact.
                </p>
              </div>
              <button type="button" onClick={cancelForm} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 text-lg leading-none">
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <Field label="Company" required>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={setField('company')}
                    className={inputClass}
                    placeholder="e.g., ITC Hotels Ltd"
                    required
                  />
                </Field>
                <Field label="Project">
                  <input
                    type="text"
                    value={formData.project}
                    onChange={setField('project')}
                    className={inputClass}
                    placeholder="Project name or description"
                  />
                </Field>
                <Field label="Project type">
                  <input
                    type="text"
                    list="lead-project-types"
                    value={formData.project_type}
                    onChange={setField('project_type')}
                    className={inputClass}
                    placeholder="New or Expansion"
                  />
                  <datalist id="lead-project-types">
                    {PROJECT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Ownership">
                  <input
                    type="text"
                    list="lead-ownership"
                    value={formData.ownership}
                    onChange={setField('ownership')}
                    className={inputClass}
                    placeholder="e.g., Private Sector"
                  />
                  <datalist id="lead-ownership">
                    {OWNERSHIP_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Industry">
                  <input
                    type="text"
                    value={formData.industry}
                    onChange={setField('industry')}
                    className={inputClass}
                    placeholder="e.g., Hospitality and Healthcare"
                  />
                </Field>
                <Field label="Project cost">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData.project_cost}
                    onChange={setField('project_cost')}
                    className={inputClass}
                    placeholder="e.g., 180.428"
                  />
                </Field>
                <Field label="Project stage" className="md:col-span-2">
                  <input
                    type="text"
                    list="lead-stages"
                    value={formData.project_stage}
                    onChange={setField('project_stage')}
                    className={inputClass}
                    placeholder="e.g., Announcement Stage"
                  />
                  <datalist id="lead-stages">
                    {PROJECT_STAGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </Field>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Location</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  <Field label="Location">
                    <input type="text" value={formData.location} onChange={setField('location')} className={inputClass} />
                  </Field>
                  <Field label="District">
                    <input type="text" value={formData.district} onChange={setField('district')} className={inputClass} />
                  </Field>
                  <Field label="Project state">
                    <input
                      type="text"
                      value={formData.project_state}
                      onChange={setField('project_state')}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Address state">
                    <input
                      type="text"
                      value={formData.address_state}
                      onChange={setField('address_state')}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  <Field label="Telephone">
                    <input type="text" value={formData.telephone} onChange={setField('telephone')} className={inputClass} />
                  </Field>
                  <Field label="Email">
                    <input type="text" value={formData.email} onChange={setField('email')} className={inputClass} />
                  </Field>
                  <Field label="Person">
                    <input
                      type="text"
                      value={formData.contact_person}
                      onChange={setField('contact_person')}
                      className={inputClass}
                      placeholder="Primary contact"
                    />
                  </Field>
                  <Field label="Person 2">
                    <input
                      type="text"
                      value={formData.contact_person_2}
                      onChange={setField('contact_person_2')}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Updated on">
                    <FormDateInput
                      value={formData.sheet_updated_on}
                      onChange={setField('sheet_updated_on')}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Remarks">
                    <input type="text" value={formData.remarks} onChange={setField('remarks')} className={inputClass} />
                  </Field>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <button
                  type="button"
                  onClick={cancelForm}
                  className="px-4 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : editingLead ? 'Save changes' : 'Save lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
