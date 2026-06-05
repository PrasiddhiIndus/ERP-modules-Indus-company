import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

// Only allow basic arithmetic characters so we can safely evaluate the expression.
const SAFE_EXPR = /^[0-9+\-*/().\s]*$/;

export function evaluateExpression(expr) {
  const raw = String(expr ?? '').trim();
  if (!raw) return { value: null, error: null };
  if (!SAFE_EXPR.test(raw)) return { value: null, error: 'Only numbers and + - * / ( ) are allowed' };
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${raw})`)();
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return { value: null, error: 'Invalid expression' };
    }
    // Trim floating-point noise to 4 decimals.
    return { value: Math.round(result * 10000) / 10000, error: null };
  } catch {
    return { value: null, error: 'Invalid expression' };
  }
}

const KEYS = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '(', ')'],
];

/**
 * Generic calculator popup. The user types/builds an arithmetic expression and
 * the evaluated result is sent back through onApply.
 */
export default function CalculatorModal({ open, title = 'Calculator', initialValue = '', onApply, onClose }) {
  const [expr, setExpr] = useState('');

  useEffect(() => {
    if (open) {
      const init = initialValue == null ? '' : String(initialValue);
      setExpr(init === '0' ? '' : init);
    }
  }, [open, initialValue]);

  const { value, error } = useMemo(() => evaluateExpression(expr), [expr]);

  if (!open) return null;

  const append = (token) => setExpr((prev) => prev + token);
  const clearAll = () => setExpr('');
  const backspace = () => setExpr((prev) => prev.slice(0, -1));

  const apply = () => {
    if (value == null) return;
    onApply?.(value);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-full max-w-xs rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 pt-4">
          <input
            type="text"
            value={expr}
            onChange={(e) => {
              const v = e.target.value;
              if (SAFE_EXPR.test(v)) setExpr(v);
            }}
            placeholder="e.g. 120*3 + 50"
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right font-mono text-base text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
          />
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-gray-500">Result</span>
            {error ? (
              <span className="font-medium text-red-600">{error}</span>
            ) : (
              <span className="font-semibold tabular-nums text-gray-900">
                {value == null ? '—' : value.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 px-4 pt-3">
          <button type="button" onClick={clearAll} className="col-span-2 rounded-lg bg-red-50 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
            Clear
          </button>
          <button type="button" onClick={backspace} className="rounded-lg bg-gray-100 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200">
            ⌫
          </button>
          <button type="button" onClick={() => append('+')} className="rounded-lg bg-gray-100 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200">
            +
          </button>
          {KEYS.map((row) =>
            row.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => append(k)}
                className={`rounded-lg py-2 text-sm font-semibold hover:bg-gray-200 ${
                  ['/', '*', '-'].includes(k) ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-900'
                }`}
              >
                {k}
              </button>
            ))
          )}
        </div>

        <div className="flex gap-2 px-4 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={value == null}
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Use value
          </button>
        </div>
      </div>
    </div>
  );
}
