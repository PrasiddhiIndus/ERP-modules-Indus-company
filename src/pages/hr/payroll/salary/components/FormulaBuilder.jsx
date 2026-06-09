import React, { useMemo, useState } from 'react';
import { Pencil, Search, Trash2, X } from 'lucide-react';
import { FORMULA_VARIABLES } from '../../../../../modules/payroll/formula/variables';
import { evaluateFormula, validateFormula } from '../../../../../modules/payroll/formula/evaluator';

const PAD = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '(', ')'],
  ['+', ',', 'round(', 'prorate('],
];

const DEFAULT_PREVIEW_CONTEXT = {
  Gross: 25000,
  CTC: 300000,
  Basic: 10000,
  PresentDays: 26,
  MonthDays: 30,
  PaidDays: 26,
  FixedAmount: 0,
};

export default function FormulaBuilder({
  value,
  onChange,
  sampleContext,
  knownComponents = [],
  variableFormulas = {},
  onVariableFormulasChange,
  activeVariable,
  onActiveVariableChange,
}) {
  const [preview, setPreview] = useState(null);
  const [variableSearch, setVariableSearch] = useState('');
  const validation = useMemo(() => validateFormula(value, knownComponents), [value, knownComponents]);

  const filteredVariables = useMemo(() => {
    const q = variableSearch.trim().toLowerCase();
    if (!q) return FORMULA_VARIABLES;
    return FORMULA_VARIABLES.filter((v) => {
      const formula = variableFormulas[v.key]?.trim().toLowerCase() || '';
      return (
        v.key.toLowerCase().includes(q) ||
        v.label.toLowerCase().includes(q) ||
        formula.includes(q)
      );
    });
  }, [variableSearch, variableFormulas]);

  const insertToken = (token) => {
    onChange(`${value || ''}${token}`);
  };

  const runPreview = () => {
    try {
      const result = evaluateFormula(value, sampleContext || DEFAULT_PREVIEW_CONTEXT);
      setPreview(result);
    } catch (e) {
      setPreview(`Error: ${e.message}`);
    }
  };

  const loadVariable = (key) => {
    onActiveVariableChange?.(key);
    onChange(variableFormulas[key] || '');
    setPreview(null);
  };

  const saveToVariable = () => {
    if (!activeVariable || !onVariableFormulasChange) return;
    onVariableFormulasChange({
      ...variableFormulas,
      [activeVariable]: value.trim(),
    });
  };

  const deleteVariable = (key, e) => {
    e.stopPropagation();
    if (!onVariableFormulasChange) return;
    const next = { ...variableFormulas };
    delete next[key];
    onVariableFormulasChange(next);
    if (activeVariable === key) {
      onActiveVariableChange?.(null);
      onChange('');
      setPreview(null);
    }
  };

  const editVariable = (key, e) => {
    e.stopPropagation();
    loadVariable(key);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[420px] border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="border-b lg:border-b-0 lg:border-r border-gray-200 p-4 overflow-y-auto max-h-[520px]">
        <label className="block text-[11px] font-medium text-gray-700 mb-1">Formula expression</label>
        {activeVariable ? (
          <p className="text-[10px] text-[#1F3A8A] font-medium mb-1.5">
            Editing: <span className="font-mono">{activeVariable}</span>
          </p>
        ) : null}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="w-full font-mono text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#1F3A8A]/30"
        />
        {!validation.ok ? (
          <p className="text-xs text-red-600 mt-1">{validation.error}</p>
        ) : (
          <p className="text-xs text-emerald-700 mt-1">Valid · deps: {(validation.deps || []).join(', ') || 'none'}</p>
        )}
        <div className="mt-3 grid grid-cols-4 gap-1">
          {PAD.flat().map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => insertToken(k)}
              className="h-9 rounded border border-gray-200 bg-gray-50 text-sm font-mono hover:bg-white"
            >
              {k}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={runPreview} className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium">
            Test formula
          </button>
          {activeVariable ? (
            <button
              type="button"
              onClick={saveToVariable}
              disabled={!value.trim()}
              className="h-8 px-3 rounded-lg border border-[#1F3A8A] text-[#1F3A8A] text-xs font-medium hover:bg-blue-50 disabled:opacity-50"
            >
              Save to {activeVariable}
            </button>
          ) : null}
        </div>
        {preview != null ? (
          <p className="mt-2 text-sm font-semibold text-gray-900 tabular-nums">Preview result: {preview}</p>
        ) : null}
      </div>

      <div className="flex flex-col min-h-[420px] max-h-[520px] bg-gray-50/50">
        <div className="shrink-0 p-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[11px] font-medium text-gray-700">Variables</p>
            {variableSearch.trim() ? (
              <span className="text-[10px] text-gray-500 tabular-nums">
                {filteredVariables.length} of {FORMULA_VARIABLES.length}
              </span>
            ) : null}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={variableSearch}
              onChange={(e) => setVariableSearch(e.target.value)}
              placeholder="Search variables…"
              className="w-full h-8 pl-8 pr-8 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A]"
            />
            {variableSearch ? (
              <button
                type="button"
                onClick={() => setVariableSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pt-3">
        <div className="space-y-2">
          {filteredVariables.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No variables match your search.</p>
          ) : null}
          {filteredVariables.map((v) => {
            const formula = variableFormulas[v.key]?.trim() || '';
            const isActive = activeVariable === v.key;
            return (
              <div
                key={v.key}
                className={`group relative flex items-center gap-1 rounded-lg border transition ${
                  isActive ? 'border-[#1F3A8A] bg-blue-50/80' : 'border-blue-100 bg-white hover:border-blue-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => loadVariable(v.key)}
                  className={`flex-1 min-w-0 text-left px-2.5 py-2 text-xs font-medium truncate ${
                    isActive ? 'text-[#1F3A8A]' : 'text-blue-800'
                  }`}
                >
                  {v.key}
                </button>
                <button
                  type="button"
                  onClick={(e) => editVariable(v.key, e)}
                  className="p-1.5 rounded-md text-gray-500 hover:text-[#1F3A8A] hover:bg-blue-50 shrink-0"
                  aria-label={`Edit ${v.key}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => deleteVariable(v.key, e)}
                  disabled={!formula}
                  className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
                  aria-label={`Delete ${v.key}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute left-0 right-0 top-full mt-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <div className="rounded-lg border border-gray-200 bg-gray-900 text-white text-[10px] px-2.5 py-1.5 shadow-lg font-mono break-all">
                    {formula || 'No formula set — click to add'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-500 mt-3">
          Click a variable to load its formula in the editor. Hover to preview. Use Save to store changes.
        </p>
        </div>
      </div>
    </div>
  );
}
