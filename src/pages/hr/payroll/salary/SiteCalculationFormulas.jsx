import React, { useEffect, useMemo, useState } from 'react';
import { SectionCard, Badge, TinySelect } from '../../../adminOperations/components/AdminUi';
import FormulaBuilder from './components/FormulaBuilder';
import {
  buildMasterComponentFormulas,
  extractSiteOverrides,
  mergeMasterAndSiteFormulas,
  parseSiteFormulaSet,
  toSiteFormulaRows,
} from './formulaMasterBridge';
import { listPayrollSites, listComponentsMaster, getActiveFormulaSetForSite, saveFormulaSet } from '../../../../services/payrollApi';

export default function SiteCalculationFormulas({ formulaGroups }) {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [components, setComponents] = useState([]);
  const [siteOverrides, setSiteOverrides] = useState({});
  const [formulaText, setFormulaText] = useState('');
  const [activeComponent, setActiveComponent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const masterFormulas = useMemo(
    () => buildMasterComponentFormulas(formulaGroups, components),
    [formulaGroups, components]
  );

  const workingFormulas = useMemo(
    () => mergeMasterAndSiteFormulas(masterFormulas, siteOverrides),
    [masterFormulas, siteOverrides]
  );

  const overrideCount = useMemo(
    () => Object.keys(extractSiteOverrides(masterFormulas, workingFormulas)).length,
    [masterFormulas, workingFormulas]
  );

  useEffect(() => {
    (async () => {
      const [s, c] = await Promise.all([listPayrollSites(), listComponentsMaster()]);
      setSites(s);
      setComponents(c);
      if (s[0]?.id) setSiteId(s[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const set = await getActiveFormulaSetForSite(siteId);
      const overrides = parseSiteFormulaSet(set);
      setSiteOverrides(overrides);
      setActiveComponent(null);
      setFormulaText('');
      setMessage('');
    })();
  }, [siteId]);

  const handleComponentFormulasChange = (nextOverrides) => {
    setSiteOverrides(nextOverrides);
  };

  const save = async () => {
    if (!siteId) return;
    const merged = { ...workingFormulas };
    if (activeComponent && formulaText.trim()) {
      merged[activeComponent] = formulaText.trim();
    }
    const overrides = extractSiteOverrides(masterFormulas, merged);
    const rows = toSiteFormulaRows(overrides);

    setSaving(true);
    setMessage('');
    try {
      await saveFormulaSet(siteId, {
        notes: 'Site-specific formula overrides',
        components: rows,
        status: 'active',
      });
      setSiteOverrides(overrides);
      setMessage(
        rows.length
          ? `Saved ${rows.length} site-specific formula${rows.length === 1 ? '' : 's'}. Master formulas unchanged.`
          : 'Site uses master formulas only (no overrides saved).'
      );
    } catch (e) {
      setMessage(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const resetComponentToMaster = () => {
    if (!activeComponent) return;
    const next = { ...siteOverrides };
    delete next[activeComponent];
    setSiteOverrides(next);
    setFormulaText(masterFormulas[activeComponent] || '');
  };

  const addSite = async () => {
    const code = window.prompt('Site code');
    const name = window.prompt('Site name');
    if (!code || !name) return;
    const { upsertPayrollSite } = await import('../../../../services/payrollApi');
    const row = await upsertPayrollSite({ site_code: code, site_name: name, state: 'MH' });
    setSites((s) => [...s, row]);
    setSiteId(row.id);
  };

  const knownCodes = components.map((c) => c.component_code);
  const selectedSite = sites.find((s) => s.id === siteId);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600">
        Configure payroll formulas per site. Master formulas from <strong>All formulas</strong> load automatically as
        defaults. Drag components into the editor, add operators, and save — only this site is updated; the master list
        does not change. Priority: <strong>site-specific</strong> → <strong>master</strong>.
      </p>
      <SectionCard
        title="Payroll site"
        right={
          <div className="flex items-center gap-2">
            {overrideCount > 0 ? (
              <Badge tone="bg-amber-50 text-amber-800">{overrideCount} site override{overrideCount === 1 ? '' : 's'}</Badge>
            ) : (
              <Badge tone="bg-slate-100 text-slate-600">Using master formulas</Badge>
            )}
            <Badge tone="bg-indigo-50 text-indigo-800">Formula engine</Badge>
          </div>
        }
      >
        <div className="flex flex-wrap gap-3 items-end mb-4 pb-4 border-b border-gray-100">
          <label className="text-[11px] text-gray-600 flex flex-col gap-1 min-w-[220px]">
            Site
            <TinySelect value={siteId} onChange={(e) => setSiteId(e.target.value)} className="min-w-[220px]">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.site_name}
                </option>
              ))}
            </TinySelect>
          </label>
          {selectedSite ? (
            <p className="text-[11px] text-gray-500 pb-1">
              Code: <span className="font-mono">{selectedSite.site_code}</span>
            </p>
          ) : null}
          <button type="button" onClick={addSite} className="h-8 px-3 rounded-lg border text-xs">
            Add site
          </button>
          {activeComponent && siteOverrides[activeComponent] ? (
            <button
              type="button"
              onClick={resetComponentToMaster}
              className="h-8 px-3 rounded-lg border border-amber-200 text-amber-800 text-xs hover:bg-amber-50"
            >
              Reset {activeComponent} to master
            </button>
          ) : null}
          <button
            type="button"
            disabled={saving || !siteId}
            onClick={save}
            className="h-8 px-4 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save site formulas'}
          </button>
          {message ? <span className="text-xs text-gray-600">{message}</span> : null}
        </div>
        <FormulaBuilder
          value={formulaText}
          onChange={setFormulaText}
          knownComponents={knownCodes}
          payrollComponents={components}
          componentFormulas={workingFormulas}
          onComponentFormulasChange={(nextWorking) => {
            handleComponentFormulasChange(extractSiteOverrides(masterFormulas, nextWorking));
          }}
          activeComponent={activeComponent}
          onActiveComponentChange={setActiveComponent}
          masterFormulas={masterFormulas}
        />
      </SectionCard>
    </div>
  );
}
