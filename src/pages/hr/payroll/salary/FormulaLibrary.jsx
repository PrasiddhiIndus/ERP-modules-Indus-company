import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Badge } from '../../../adminOperations/components/AdminUi';
import SiteCalculationFormulas from './SiteCalculationFormulas';
import {
  FORMULAS,
  TYPE_META,
  TYPE_GROUP_ORDER,
  buildDefaultAliases,
  packageFormulaCount,
  packageSiteCount,
  packagesUsingFormula,
} from './formulaLibraryData';
import { loadFormulaPackages, saveFormulaPackages, newPackageId } from './formulaLibraryStorage';

const SUB_TABS = [
  { id: 'pkg', label: 'Site packages' },
  { id: 'all', label: 'All formulas' },
  { id: 'comp', label: 'Component names' },
  { id: 'calc', label: 'Calculation formula' },
];

const PKG_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'e', label: 'Earnings' },
  { id: 'd', label: 'Deductions' },
  { id: 's', label: 'Statutory' },
];

function TypeBadge({ type }) {
  const meta = TYPE_META[type];
  if (!meta) return null;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium shrink-0 ${meta.badge}`}>
      {meta.label}
    </span>
  );
}

function SitePackagesView({ packages, setPackages, activePkgId, setActivePkgId }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [addingPackage, setAddingPackage] = useState(false);
  const [newPackageName, setNewPackageName] = useState('');
  const [addingSite, setAddingSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const activePkg = packages.find((p) => p.id === activePkgId) || packages[0];

  const toggleFormula = (formulaId) => {
    if (!activePkg) return;
    setSaveMessage('');
    setPackages((prev) =>
      prev.map((p) => {
        if (p.id !== activePkg.id) return p;
        const has = p.formulaIds.includes(formulaId);
        return {
          ...p,
          formulaIds: has ? p.formulaIds.filter((id) => id !== formulaId) : [...p.formulaIds, formulaId],
        };
      })
    );
  };

  const handleAddPackage = () => {
    const name = newPackageName.trim();
    if (!name) return;
    const id = newPackageId();
    const pkg = { id, name, sites: [], formulaIds: [] };
    setPackages((prev) => [...prev, pkg]);
    setActivePkgId(id);
    setNewPackageName('');
    setAddingPackage(false);
    setSaveMessage('Package added — click Save to keep changes.');
  };

  const handleAddSite = () => {
    const site = newSiteName.trim();
    if (!site || !activePkg) return;
    if (activePkg.sites.some((s) => s.toLowerCase() === site.toLowerCase())) {
      setSaveMessage('That site is already in this package.');
      return;
    }
    setSaveMessage('');
    setPackages((prev) =>
      prev.map((p) => (p.id === activePkg.id ? { ...p, sites: [...p.sites, site] } : p))
    );
    setNewSiteName('');
    setAddingSite(false);
  };

  const removeSite = (site) => {
    if (!activePkg) return;
    setSaveMessage('');
    setPackages((prev) =>
      prev.map((p) => (p.id === activePkg.id ? { ...p, sites: p.sites.filter((s) => s !== site) } : p))
    );
  };

  const handleSave = () => {
    saveFormulaPackages(packages);
    setSaveMessage('Package saved.');
  };

  const handleDelete = () => {
    if (!activePkg || packages.length <= 1) return;
    if (!window.confirm(`Delete package "${activePkg.name}"?`)) return;
    const next = packages.filter((p) => p.id !== activePkg.id);
    setPackages(next);
    setActivePkgId(next[0]?.id);
    saveFormulaPackages(next);
    setSaveMessage('Package deleted.');
  };

  const filteredFormulas = useMemo(() => {
    if (typeFilter === 'all') return FORMULAS;
    return FORMULAS.filter((f) => f.type === typeFilter);
  }, [typeFilter]);

  if (!activePkg) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        No packages yet. Click <strong>+ New package</strong> to create one.
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-0 min-h-[480px] border border-gray-200 rounded-xl overflow-hidden bg-white">
      <aside className="w-full lg:w-[240px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-gray-50/60">
        <div className="p-2 space-y-1">
          {packages.map((pkg) => {
            const active = pkg.id === activePkg.id;
            return (
              <button
                key={pkg.id}
                type="button"
                onClick={() => {
                  setActivePkgId(pkg.id);
                  setAddingSite(false);
                  setNewSiteName('');
                  setSaveMessage('');
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition ${
                  active ? 'bg-[#1F3A8A] text-white' : 'text-gray-800 hover:bg-white'
                }`}
              >
                <span className="font-semibold block">{pkg.name}</span>
                <span className={active ? 'text-blue-100' : 'text-gray-500'}>
                  {packageFormulaCount(pkg)} formulas · {packageSiteCount(pkg)} sites
                </span>
              </button>
            );
          })}
          {addingPackage ? (
            <div className="mt-2 space-y-1.5">
              <input
                type="text"
                value={newPackageName}
                onChange={(e) => setNewPackageName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPackage();
                  if (e.key === 'Escape') {
                    setAddingPackage(false);
                    setNewPackageName('');
                  }
                }}
                placeholder="Package name"
                autoFocus
                className="w-full h-8 rounded-lg border border-gray-200 px-2 text-xs focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A]"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handleAddPackage}
                  disabled={!newPackageName.trim()}
                  className="flex-1 h-7 rounded-lg bg-[#1F3A8A] text-white text-[11px] font-medium disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingPackage(false);
                    setNewPackageName('');
                  }}
                  className="h-7 px-2 rounded-lg border text-[11px] text-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingPackage(true)}
              className="w-full mt-2 py-2.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-[#1F3A8A] hover:text-[#1F3A8A]"
            >
              + New package
            </button>
          )}
        </div>
      </aside>
      <div className="flex-1 min-w-0 p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{activePkg.name}</h3>
          <div className="flex flex-wrap items-center gap-2">
            {saveMessage ? <span className="text-[11px] text-gray-600">{saveMessage}</span> : null}
            <button type="button" onClick={handleSave} className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium hover:bg-[#1a3278]">
              Save
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={packages.length <= 1}
              className="h-8 px-3 rounded-lg border text-xs text-red-600 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-medium text-gray-500 mb-2">Sites using this package</p>
          <div className="flex flex-wrap gap-1.5 items-center">
            {activePkg.sites.map((site) => (
              <span
                key={site}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 text-[11px] border border-blue-100"
              >
                {site}
                <button
                  type="button"
                  onClick={() => removeSite(site)}
                  className="p-0.5 rounded hover:bg-blue-100 text-blue-700"
                  aria-label={`Remove ${site}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {addingSite ? (
              <span className="inline-flex items-center gap-1">
                <input
                  type="text"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSite();
                    if (e.key === 'Escape') {
                      setAddingSite(false);
                      setNewSiteName('');
                    }
                  }}
                  placeholder="Site name"
                  autoFocus
                  className="h-7 w-36 rounded-full border border-gray-200 px-2.5 text-[11px] focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A]"
                />
                <button
                  type="button"
                  onClick={handleAddSite}
                  disabled={!newSiteName.trim()}
                  className="h-7 px-2 rounded-full bg-[#1F3A8A] text-white text-[10px] font-medium disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingSite(false);
                    setNewSiteName('');
                  }}
                  className="h-7 px-2 rounded-full border text-[10px] text-gray-600"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAddingSite(true)}
                className="px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-[11px] text-gray-500 hover:border-[#1F3A8A] hover:text-[#1F3A8A]"
              >
                + Add site
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {PKG_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTypeFilter(f.id)}
              className={`h-7 px-3 rounded-lg text-[11px] font-medium ${
                typeFilter === f.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="space-y-1 max-h-[360px] overflow-y-auto">
          {filteredFormulas.map((formula) => {
            const checked = activePkg.formulaIds.includes(formula.id);
            return (
              <label
                key={formula.id}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer ${
                  checked ? 'bg-blue-50 border-blue-200' : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleFormula(formula.id)} className="mt-1 h-4 w-4" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-gray-900">{formula.name}</span>
                    <TypeBadge type={formula.type} />
                  </div>
                  <code className="block text-[11px] font-mono text-gray-600 mt-0.5">{formula.expression}</code>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AllFormulasView({ packages }) {
  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="flex-1 space-y-6">
        {TYPE_GROUP_ORDER.map((group) => (
          <section key={group.key}>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{group.title}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {FORMULAS.filter((f) => f.type === group.key).map((formula) => (
                <div key={formula.id} className="rounded-xl border border-gray-200 p-3 bg-white">
                  <div className="flex justify-between gap-2">
                    <span className="text-xs font-semibold">{formula.name}</span>
                    <TypeBadge type={formula.type} />
                  </div>
                  <code className="block text-[11px] font-mono text-gray-600 mt-1">{formula.expression}</code>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <aside className="w-full lg:w-[190px] shrink-0">
        <div className="sticky top-2 rounded-xl border bg-gray-50/80 p-3">
          <p className="text-[11px] font-semibold text-gray-700 mb-3">Package coverage</p>
          <div className="space-y-3 max-h-[520px] overflow-y-auto">
            {FORMULAS.map((formula) => {
              const usedBy = packagesUsingFormula(packages, formula.id);
              return (
                <div key={formula.id} className="border-b border-gray-200/80 pb-2 last:border-0">
                  <p className="text-[10px] font-semibold text-gray-800">{formula.name}</p>
                  {usedBy.length === 0 ? (
                    <p className="text-[10px] text-gray-400 italic mt-1">Not assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {usedBy.map((name) => (
                        <span key={name} className="px-1.5 py-0.5 rounded bg-white border text-[9px]">{name}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

function draftFromSaved(savedRows) {
  if (!savedRows.length) return buildDefaultAliases();
  const bySystem = Object.fromEntries(savedRows.map((r) => [r.systemName, r.alias]));
  return buildDefaultAliases().map((r) => ({
    systemName: r.systemName,
    alias: bySystem[r.systemName] ?? r.alias,
  }));
}

function ComponentNamesModal({ open, draftRows, modalError, onClose, onUpdateAlias, onReset, onSave }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div
        className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="component-names-modal-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div>
            <h3 id="component-names-modal-title" className="text-sm font-semibold text-gray-900">
              Component display names
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Map system names to client labels on payslips.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Close dialog">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-2 gap-px bg-gray-200 text-[11px] font-semibold text-gray-600">
              <div className="bg-gray-50 px-3 py-2">System name</div>
              <div className="bg-gray-50 px-3 py-2">Client display name</div>
            </div>
            {draftRows.map((row) => {
              const renamed = row.alias.trim() !== '' && row.alias.trim() !== row.systemName;
              return (
                <div key={row.systemName} className="grid grid-cols-2 gap-px bg-gray-200">
                  <div className="bg-white px-3 py-2 flex items-center gap-1.5 min-h-[40px]">
                    <span className="text-xs text-gray-800">{row.systemName}</span>
                    {renamed ? (
                      <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 text-[9px] font-medium shrink-0">
                        renamed
                      </span>
                    ) : null}
                  </div>
                  <div className="bg-white px-3 py-2">
                    <input
                      type="text"
                      value={row.alias}
                      onChange={(e) => onUpdateAlias(row.systemName, e.target.value)}
                      placeholder={row.systemName}
                      className="w-full h-8 rounded-lg border border-gray-200 px-2 text-xs focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A]"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {modalError ? <p className="text-xs text-red-600 mt-2">{modalError}</p> : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onReset} className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 mr-auto">
            Reset form
          </button>
          <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={onSave} className="h-8 px-4 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium hover:bg-[#1a3278]">
            Save names
          </button>
        </div>
      </div>
    </div>
  );
}

function ComponentNamesView() {
  const [savedRows, setSavedRows] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDraft, setModalDraft] = useState(buildDefaultAliases);
  const [modalError, setModalError] = useState('');

  const openModal = () => {
    setModalDraft(draftFromSaved(savedRows));
    setModalError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalError('');
  };

  const updateModalAlias = (systemName, alias) => {
    setModalDraft((prev) => prev.map((r) => (r.systemName === systemName ? { ...r, alias } : r)));
  };

  const resetModalForm = () => {
    setModalDraft(buildDefaultAliases());
    setModalError('');
  };

  const handleModalSave = () => {
    const rows = modalDraft
      .map((r) => {
        const alias = r.alias.trim() || r.systemName;
        return {
          id: r.systemName,
          systemName: r.systemName,
          alias,
          renamed: alias !== r.systemName,
        };
      })
      .filter((r) => r.alias.trim());
    if (!rows.length) {
      setModalError('Enter at least one client display name.');
      return;
    }
    setSavedRows(rows);
    closeModal();
  };

  const removeSavedRow = (id) => {
    setSavedRows((prev) => prev.filter((r) => r.id !== id));
  };

  const clearAllSaved = () => {
    setSavedRows([]);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-600">
          Start empty. Click <strong>Add component names</strong> to open the form, then save to fill the table below.
        </p>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium hover:bg-[#1a3278] shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Add component names
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
        <div className="px-4 py-2.5 border-b bg-gray-50/80 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Saved display names</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {savedRows.length === 0 ? 'No data yet.' : `${savedRows.length} component(s) saved.`}
            </p>
          </div>
          {savedRows.length > 0 ? (
            <div className="flex gap-2">
              <button type="button" onClick={openModal} className="h-8 px-3 rounded-lg border text-xs font-medium text-[#1F3A8A] border-[#1F3A8A]/30 hover:bg-blue-50">
                Edit all
              </button>
              <button type="button" onClick={clearAllSaved} className="h-8 px-3 rounded-lg border text-xs font-medium text-red-600 hover:bg-red-50">
                Clear all
              </button>
            </div>
          ) : null}
        </div>
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase">
              <th className="text-left px-4 py-2.5 w-12">#</th>
              <th className="text-left px-4 py-2.5">System name</th>
              <th className="text-left px-4 py-2.5">Client display name</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-right px-4 py-2.5 w-20">Action</th>
            </tr>
          </thead>
          <tbody>
            {savedRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  No saved names yet. Click <strong>Add component names</strong> to add mappings.
                </td>
              </tr>
            ) : (
              savedRows.map((row, idx) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-500 tabular-nums">{idx + 1}</td>
                  <td className="px-4 py-3 text-gray-800">{row.systemName}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.alias}</td>
                  <td className="px-4 py-3">
                    {row.renamed ? (
                      <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 text-[10px] font-medium">renamed</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => removeSavedRow(row.id)} className="text-[11px] text-red-600 hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ComponentNamesModal
        open={modalOpen}
        draftRows={modalDraft}
        modalError={modalError}
        onClose={closeModal}
        onUpdateAlias={updateModalAlias}
        onReset={resetModalForm}
        onSave={handleModalSave}
      />
    </div>
  );
}

export default function FormulaLibrary() {
  const [formulaSubTab, setFormulaSubTab] = useState('pkg');
  const [packages, setPackages] = useState(loadFormulaPackages);
  const [activePkgId, setActivePkgId] = useState(() => loadFormulaPackages()[0]?.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Formula library</h2>
          <p className="text-xs text-gray-500 mt-0.5">Packages, formulas, component labels, and per-site calculations.</p>
        </div>
        <div className="flex gap-2">
          <Badge tone="bg-slate-100 text-slate-700">{FORMULAS.length} formulas</Badge>
          <Badge tone="bg-blue-50 text-blue-800">{packages.length} packages</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-px">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFormulaSubTab(tab.id)}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 -mb-px ${
              formulaSubTab === tab.id ? 'border-[#1F3A8A] text-[#1F3A8A]' : 'border-transparent text-gray-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {formulaSubTab === 'pkg' ? (
        <SitePackagesView packages={packages} setPackages={setPackages} activePkgId={activePkgId} setActivePkgId={setActivePkgId} />
      ) : null}
      {formulaSubTab === 'all' ? <AllFormulasView packages={packages} /> : null}
      {formulaSubTab === 'comp' ? <ComponentNamesView /> : null}
      {formulaSubTab === 'calc' ? <SiteCalculationFormulas /> : null}
    </div>
  );
}
