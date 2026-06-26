import React, { useMemo, useRef, useState } from 'react';
import { GripVertical, Pencil, Search, Trash2, X } from 'lucide-react';
import { FORMULA_VARIABLES } from '../../../../../modules/payroll/formula/variables';
import { evaluateFormula, validateFormula } from '../../../../../modules/payroll/formula/evaluator';

const PAD = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '(', ')'],
  ['+', ',', '%', 'round('],
  ['prorate(', null, null, null],
];

const TYPE_LABELS = {
  earning: 'Earnings',
  deduction: 'Deductions',
  contribution: 'Contributions',
  employer_contribution: 'Employer',
};

const DEFAULT_PREVIEW_CONTEXT = {
  Gross: 25000,
  CTC: 300000,
  Basic: 10000,
  PresentDays: 26,
  MonthDays: 30,
  PaidDays: 26,
  FixedAmount: 0,
};

function groupComponents(components) {
  const groups = new Map();
  components.forEach((c) => {
    const type = c.component_type || 'earning';
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(c);
  });
  return groups;
}

export default function FormulaBuilder({
  value,
  onChange,
  sampleContext,
  knownComponents = [],
  payrollComponents = [],
  componentFormulas = {},
  onComponentFormulasChange,
  activeComponent,
  onActiveComponentChange,
  masterFormulas = {},
  variableFormulas = {},
  onVariableFormulasChange,
  activeVariable,
  onActiveVariableChange,
}) {
  const textareaRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [componentSearch, setComponentSearch] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const useComponentMode = payrollComponents.length > 0 && onComponentFormulasChange;
  const formulasMap = useComponentMode ? componentFormulas : variableFormulas;
  const activeKey = useComponentMode ? activeComponent : activeVariable;
  const setActiveKey = useComponentMode ? onActiveComponentChange : onActiveVariableChange;
  const onFormulasChange = useComponentMode ? onComponentFormulasChange : onVariableFormulasChange;

  const validation = useMemo(() => validateFormula(value, knownComponents), [value, knownComponents]);

  const filteredPayrollComponents = useMemo(() => {
    const q = componentSearch.trim().toLowerCase();
    if (!q) return payrollComponents;
    return payrollComponents.filter(
      (c) =>
        c.component_code.toLowerCase().includes(q) ||
        String(c.component_name || '').toLowerCase().includes(q)
    );
  }, [componentSearch, payrollComponents]);

  const componentGroups = useMemo(() => groupComponents(filteredPayrollComponents), [filteredPayrollComponents]);

  const insertAtCursor = (token) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(`${value || ''}${token}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertToken = (token) => insertAtCursor(token);

  const runPreview = () => {
    try {
      const result = evaluateFormula(value, sampleContext || DEFAULT_PREVIEW_CONTEXT);
      setPreview(result);
    } catch (e) {
      setPreview(`Error: ${e.message}`);
    }
  };

  const loadFormula = (key) => {
    setActiveKey?.(key);
    onChange(formulasMap[key] || masterFormulas[key] || '');
    setPreview(null);
  };

  const saveToKey = () => {
    if (!activeKey || !onFormulasChange) return;
    onFormulasChange({
      ...formulasMap,
      [activeKey]: value.trim(),
    });
  };

  const deleteFormula = (key, e) => {
    e.stopPropagation();
    if (!onFormulasChange) return;
    const next = { ...formulasMap };
    delete next[key];
    if (useComponentMode && masterFormulas[key]) {
      next[key] = masterFormulas[key];
    }
    onFormulasChange(next);
    if (activeKey === key) {
      onChange(useComponentMode ? masterFormulas[key] || '' : '');
      if (!useComponentMode) setActiveKey?.(null);
      setPreview(null);
    }
  };

  const editFormula = (key, e) => {
    e.stopPropagation();
    loadFormula(key);
  };

  const handleDragStart = (e, code) => {
    e.dataTransfer.setData('text/plain', code);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const code = e.dataTransfer.getData('text/plain');
    if (code) insertAtCursor(code);
  };

  const renderComponentItem = (c) => {
    const code = c.component_code;
    const formula = formulasMap[code]?.trim() || masterFormulas[code]?.trim() || '';
    const isActive = activeKey === code;
    const isOverride =
      useComponentMode &&
      formula &&
      String(masterFormulas[code] || '').trim() &&
      formula !== String(masterFormulas[code] || '').trim();

    return (
      <div
        key={code}
        draggable
        onDragStart={(e) => handleDragStart(e, code)}
        className={`group relative flex items-center gap-0.5 rounded-lg border transition cursor-grab active:cursor-grabbing ${
          isActive ? 'border-[#1F3A8A] bg-blue-50/80' : 'border-gray-200 bg-white hover:border-blue-200'
        }`}
      >
        <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0 ml-1" aria-hidden />
        <button
          type="button"
          onClick={() => loadFormula(code)}
          className={`flex-1 min-w-0 text-left px-1.5 py-2 text-xs truncate ${
            isActive ? 'text-[#1F3A8A] font-semibold' : 'text-gray-800 font-medium'
          }`}
          title={`${c.component_name} — drag to insert, click to edit`}
        >
          <span className="font-mono">{code}</span>
          {isOverride ? (
            <span className="ml-1 text-[9px] uppercase tracking-wide text-amber-700 font-semibold">site</span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={(e) => editFormula(code, e)}
          className="p-1.5 rounded-md text-gray-500 hover:text-[#1F3A8A] hover:bg-blue-50 shrink-0"
          aria-label={`Edit ${code}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => deleteFormula(code, e)}
          disabled={!isOverride}
          className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
          aria-label={`Clear ${code} site override`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <div
          role="tooltip"
          className="pointer-events-none absolute left-0 right-0 top-full mt-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="rounded-lg border border-gray-200 bg-gray-900 text-white text-[10px] px-2.5 py-1.5 shadow-lg font-mono break-all">
            {formula || 'Uses master formula — click to customize for this site'}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[420px] border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="border-b lg:border-b-0 lg:border-r border-gray-200 p-4 overflow-y-auto max-h-[560px]">
        <label className="block text-[11px] font-medium text-gray-700 mb-1">Formula expression</label>
        {activeKey ? (
          <p className="text-[10px] text-[#1F3A8A] font-medium mb-1.5">
            Editing: <span className="font-mono">{activeKey}</span>
            {useComponentMode && masterFormulas[activeKey] ? (
              <span className="text-gray-500 font-normal ml-1">(master: {masterFormulas[activeKey]})</span>
            ) : null}
          </p>
        ) : (
          <p className="text-[10px] text-gray-500 mb-1.5">Select a component or drag one into the editor.</p>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          rows={4}
          placeholder="Build formula — drag components here or use operators below"
          className={`w-full font-mono text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#1F3A8A]/30 ${
            dragOver ? 'border-[#1F3A8A] bg-blue-50/40' : 'border-gray-300'
          }`}
        />
        {!validation.ok ? (
          <p className="text-xs text-red-600 mt-1">{validation.error}</p>
        ) : (
          <p className="text-xs text-emerald-700 mt-1">Valid · deps: {(validation.deps || []).join(', ') || 'none'}</p>
        )}
        <div className="mt-3 grid grid-cols-4 gap-1">
          {PAD.flat()
            .filter((k) => k != null)
            .map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => insertToken(k)}
                className={`h-9 rounded border border-gray-200 bg-gray-50 text-sm font-mono hover:bg-white ${
                  k === '%' ? 'bg-amber-50 border-amber-200 text-amber-900 font-semibold' : ''
                }`}
              >
                {k}
              </button>
            ))}
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5">
          Use <span className="font-mono">%</span> for percentages — e.g. <span className="font-mono">BASIC * 12%</span> or{' '}
          <span className="font-mono">Gross * 40%</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {FORMULA_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => insertToken(v.key)}
              className="h-7 px-2 rounded-md border border-indigo-100 bg-indigo-50/60 text-[10px] font-mono text-indigo-800 hover:bg-indigo-100"
              title={v.label}
            >
              {v.key}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={runPreview} className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium">
            Test formula
          </button>
          {activeKey ? (
            <button
              type="button"
              onClick={saveToKey}
              disabled={!value.trim()}
              className="h-8 px-3 rounded-lg border border-[#1F3A8A] text-[#1F3A8A] text-xs font-medium hover:bg-blue-50 disabled:opacity-50"
            >
              Save to {activeKey}
            </button>
          ) : null}
        </div>
        {preview != null ? (
          <p className="mt-2 text-sm font-semibold text-gray-900 tabular-nums">Preview result: {preview}</p>
        ) : null}
      </div>

      <div className="flex flex-col min-h-[420px] max-h-[560px] bg-gray-50/50">
        {useComponentMode ? (
          <>
            <div className="shrink-0 p-4 pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[11px] font-medium text-gray-700">Payroll components</p>
                {componentSearch.trim() ? (
                  <span className="text-[10px] text-gray-500 tabular-nums">
                    {filteredPayrollComponents.length} of {payrollComponents.length}
                  </span>
                ) : null}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={componentSearch}
                  onChange={(e) => setComponentSearch(e.target.value)}
                  placeholder="Search components…"
                  className="w-full h-8 pl-8 pr-8 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A]"
                />
                {componentSearch ? (
                  <button
                    type="button"
                    onClick={() => setComponentSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <p className="text-[10px] text-gray-500 mt-2">Drag into the editor or click to edit a site formula.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pt-3 space-y-3">
              {filteredPayrollComponents.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No components match your search.</p>
              ) : null}
              {Array.from(componentGroups.entries()).map(([type, items]) => (
                <div key={type}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                    {TYPE_LABELS[type] || type}
                  </p>
                  <div className="space-y-1.5">{items.map(renderComponentItem)}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="shrink-0 p-4 pb-3 border-b border-gray-100">
              <p className="text-[11px] font-medium text-gray-700 mb-2">Variables</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pt-3">
              <div className="space-y-2">
                {FORMULA_VARIABLES.map((v) => {
                  const formula = formulasMap[v.key]?.trim() || '';
                  const isActive = activeKey === v.key;
                  return (
                    <div
                      key={v.key}
                      className={`group relative flex items-center gap-1 rounded-lg border transition ${
                        isActive ? 'border-[#1F3A8A] bg-blue-50/80' : 'border-blue-100 bg-white hover:border-blue-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => loadFormula(v.key)}
                        className={`flex-1 min-w-0 text-left px-2.5 py-2 text-xs font-medium truncate ${
                          isActive ? 'text-[#1F3A8A]' : 'text-blue-800'
                        }`}
                      >
                        {v.key}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => editFormula(v.key, e)}
                        className="p-1.5 rounded-md text-gray-500 hover:text-[#1F3A8A] hover:bg-blue-50 shrink-0"
                        aria-label={`Edit ${v.key}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => deleteFormula(v.key, e)}
                        disabled={!formula}
                        className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
                        aria-label={`Delete ${v.key}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
