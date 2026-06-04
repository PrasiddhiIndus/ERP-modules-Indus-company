import React, { useEffect, useState } from 'react';
import { SectionCard, Badge, TinySelect } from '../../../adminOperations/components/AdminUi';
import FormulaBuilder from './components/FormulaBuilder';
import { listPayrollSites, listComponentsMaster, getActiveFormulaSetForSite, saveFormulaSet } from '../../../../services/payrollApi';

const DEFAULT_FORMULAS = [
  { component_code: 'GROSS', formula_text: 'Gross', is_enabled: true },
  { component_code: 'BASIC', formula_text: 'Gross * 0.40', is_enabled: true },
  { component_code: 'HRA', formula_text: 'Basic * 0.50', is_enabled: true },
  { component_code: 'SPECIAL_ALLOWANCE', formula_text: 'Gross - Basic - HRA', is_enabled: true },
];

export default function SiteCalculationFormulas() {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [components, setComponents] = useState([]);
  const [formulas, setFormulas] = useState(DEFAULT_FORMULAS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

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
      if (set?.components?.length) {
        setFormulas(
          set.components.map((row) => ({
            component_code: row.component_code,
            formula_text: row.formula_text,
            is_enabled: row.is_enabled,
          }))
        );
      } else {
        setFormulas(DEFAULT_FORMULAS);
      }
    })();
  }, [siteId]);

  const updateFormula = (code, text) => {
    setFormulas((prev) => {
      const idx = prev.findIndex((f) => f.component_code === code);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], formula_text: text };
        return next;
      }
      return [...prev, { component_code: code, formula_text: text, is_enabled: true }];
    });
  };

  const save = async () => {
    if (!siteId) return;
    setSaving(true);
    setMessage('');
    try {
      await saveFormulaSet(siteId, { notes: 'Saved from UI', components: formulas, status: 'active' });
      setMessage('Formula set saved (new version).');
    } catch (e) {
      setMessage(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
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

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600">
        Build and test calculation expressions per payroll site. Save creates a new active formula version.
      </p>
      <SectionCard title="Payroll site" right={<Badge tone="bg-indigo-50 text-indigo-800">Formula engine</Badge>}>
        <div className="flex flex-wrap gap-3 items-end mb-4 pb-4 border-b border-gray-100">
          <label className="text-[11px] text-gray-600 flex flex-col gap-1 min-w-[220px]">
            Site
            <TinySelect value={siteId} onChange={(e) => setSiteId(e.target.value)} className="min-w-[220px]">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.site_name}</option>
              ))}
            </TinySelect>
          </label>
          <button type="button" onClick={addSite} className="h-8 px-3 rounded-lg border text-xs">Add site</button>
          <button type="button" disabled={saving || !siteId} onClick={save} className="h-8 px-4 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save version'}
          </button>
          {message ? <span className="text-xs text-gray-600">{message}</span> : null}
        </div>
        <div className="space-y-5">
          {formulas.map((f) => (
            <div key={f.component_code} className="border border-gray-100 rounded-xl p-4 bg-gray-50/40">
              <p className="text-xs font-bold text-gray-800 mb-3 font-mono">{f.component_code}</p>
              <FormulaBuilder
                value={f.formula_text}
                onChange={(v) => updateFormula(f.component_code, v)}
                knownComponents={knownCodes}
                sampleContext={{ Gross: 25000, PresentDays: 26, MonthDays: 30, Basic: 10000 }}
              />
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
