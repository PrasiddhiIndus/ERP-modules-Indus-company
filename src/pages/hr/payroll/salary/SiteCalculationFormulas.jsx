import React, { useEffect, useState } from 'react';
import { SectionCard, Badge, TinySelect } from '../../../adminOperations/components/AdminUi';
import FormulaBuilder from './components/FormulaBuilder';
import { FORMULA_VARIABLES } from '../../../../modules/payroll/formula/variables';
import { listPayrollSites, listComponentsMaster, getActiveFormulaSetForSite, saveFormulaSet } from '../../../../services/payrollApi';

const VARIABLE_KEYS = new Set(FORMULA_VARIABLES.map((v) => v.key));

function parseFormulaSet(set) {
  const variableFormulas = {};
  (set?.components || []).forEach((row) => {
    const code = row.component_code?.trim();
    if (code && VARIABLE_KEYS.has(code)) {
      variableFormulas[code] = row.formula_text?.trim() || '';
    }
  });
  return variableFormulas;
}

function toSaveComponents(variableFormulas) {
  return Object.entries(variableFormulas)
    .filter(([, text]) => text?.trim())
    .map(([component_code, formula_text]) => ({
      component_code,
      formula_text: formula_text.trim(),
      is_enabled: true,
    }));
}

export default function SiteCalculationFormulas() {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [components, setComponents] = useState([]);
  const [variableFormulas, setVariableFormulas] = useState({});
  const [formulaText, setFormulaText] = useState('');
  const [activeVariable, setActiveVariable] = useState(null);
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
      const loaded = parseFormulaSet(set);
      setVariableFormulas(loaded);
      setActiveVariable(null);
      setFormulaText('');
    })();
  }, [siteId]);

  const save = async () => {
    if (!siteId) return;
    const merged = { ...variableFormulas };
    if (activeVariable && formulaText.trim()) {
      merged[activeVariable] = formulaText.trim();
    }
    const rows = toSaveComponents(merged);
    if (!rows.length) {
      setMessage('Add at least one variable formula before saving.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await saveFormulaSet(siteId, {
        notes: 'Saved from UI',
        components: rows,
        status: 'active',
      });
      setVariableFormulas(merged);
      setMessage('Variable formulas saved.');
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
        Build one formula per variable for each payroll site. Click a variable to edit, hover to preview, then save.
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
            {saving ? 'Saving…' : 'Save'}
          </button>
          {message ? <span className="text-xs text-gray-600">{message}</span> : null}
        </div>
        <FormulaBuilder
          value={formulaText}
          onChange={setFormulaText}
          knownComponents={knownCodes}
          variableFormulas={variableFormulas}
          onVariableFormulasChange={setVariableFormulas}
          activeVariable={activeVariable}
          onActiveVariableChange={setActiveVariable}
        />
      </SectionCard>
    </div>
  );
}
