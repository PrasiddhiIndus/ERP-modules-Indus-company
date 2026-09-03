import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { defaultExportSelection } from './enquiryDatabaseExport';

export default function EnquiryExportModal({ open, databaseFields, onClose, onExport }) {
  const [selectedKeys, setSelectedKeys] = useState([]);

  useEffect(() => {
    if (open && databaseFields.length) {
      setSelectedKeys(defaultExportSelection(databaseFields));
    }
  }, [open, databaseFields]);

  if (!open) return null;

  const toggleKey = (key) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAll = () => setSelectedKeys(databaseFields.map((f) => f.field_key));
  const clearAll = () => setSelectedKeys([]);
  const resetDefault = () => setSelectedKeys(defaultExportSelection(databaseFields));

  const handleExport = () => {
    if (!selectedKeys.length) return;
    onExport(selectedKeys);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Export CSV</h3>
            <p className="text-xs text-gray-500 mt-0.5">Choose columns for the download. Dates export as dd/mm/yyyy.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-2">
          <button type="button" onClick={selectAll} className="text-xs font-medium text-blue-700 hover:underline">
            Select all
          </button>
          <span className="text-gray-300">|</span>
          <button type="button" onClick={resetDefault} className="text-xs font-medium text-blue-700 hover:underline">
            Default columns
          </button>
          <span className="text-gray-300">|</span>
          <button type="button" onClick={clearAll} className="text-xs font-medium text-gray-600 hover:underline">
            Clear
          </button>
          <span className="ml-auto text-xs text-gray-500">{selectedKeys.length} selected</span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {databaseFields.map((field) => {
              const checked = selectedKeys.includes(field.field_key);
              return (
                <label
                  key={field.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                    checked ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleKey(field.field_key)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-gray-800 truncate">{field.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="border-t border-gray-200 px-5 py-4 flex justify-end gap-2 bg-gray-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!selectedKeys.length}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </button>
        </div>
      </div>
    </div>
  );
}
