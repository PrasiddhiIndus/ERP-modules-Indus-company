import React, { useMemo, useState } from 'react';
import { FORMULA_VARIABLES, FORMULA_FUNCTIONS } from '../../../../../modules/payroll/formula/variables';
import { evaluateFormula, validateFormula } from '../../../../../modules/payroll/formula/evaluator';

const PAD = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '(', ')'],
  ['+', ',', 'round(', 'prorate('],
];

export default function FormulaBuilder({ value, onChange, sampleContext, knownComponents = [] }) {
  const [preview, setPreview] = useState(null);
  const validation = useMemo(() => validateFormula(value, knownComponents), [value, knownComponents]);

  const insertToken = (token) => {
    onChange(`${value || ''}${token}`);
  };

  const runPreview = () => {
    try {
      const result = evaluateFormula(value, sampleContext || { gross: 25000, presentDays: 26, monthDays: 30 });
      setPreview(result);
    } catch (e) {
      setPreview(`Error: ${e.message}`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <label className="block text-[11px] font-medium text-gray-700 mb-1">Formula expression</label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="w-full font-mono text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#1F3A8A]/30"
          placeholder="e.g. Gross * 0.40"
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
        <div className="mt-2 flex flex-wrap gap-1">
          {FORMULA_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => insertToken(v.key)}
              className="px-2 py-1 text-[10px] rounded bg-blue-50 text-blue-800 border border-blue-100"
            >
              {v.key}
            </button>
          ))}
        </div>
        <button type="button" onClick={runPreview} className="mt-3 h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium">
          Test formula
        </button>
        {preview != null ? (
          <p className="mt-2 text-sm font-semibold text-gray-900 tabular-nums">Preview result: {preview}</p>
        ) : null}
      </div>
      <div className="text-xs text-gray-600 space-y-2">
        <p className="font-semibold text-gray-800">Functions</p>
        <ul className="list-disc pl-4 space-y-1">
          {FORMULA_FUNCTIONS.map((f) => (
            <li key={f.name}>
              <code className="text-[11px]">{f.description}</code>
            </li>
          ))}
        </ul>
        <p className="font-semibold text-gray-800 mt-3">Sample context</p>
        <pre className="bg-gray-50 p-2 rounded border text-[10px] overflow-auto">
          {JSON.stringify(sampleContext || { Gross: 25000, PresentDays: 26, MonthDays: 30 }, null, 2)}
        </pre>
      </div>
    </div>
  );
}
