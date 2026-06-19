import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, GripVertical, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  getActiveConfig,
  initDatawizardReport,
  newReportFieldId,
  newReportSettingId,
  saveDatawizardReport,
  syncActiveSettingFields,
  syncSelectedFieldsFromGroups,
  updateActiveSetting,
} from './datawizardReportStorage';

const REPORT_TYPES = [
  { id: 'master', label: 'Master Report' },
  { id: 'monthly', label: 'Monthly Report' },
  { id: 'yearly', label: 'Yearly Report' },
];

const FIELD_ACTIONS = [
  { id: 'customFormula', label: 'Add Custom Formula', className: 'bg-[#4a90c4] hover:bg-[#3d7aab]' },
  { id: 'pivot', label: 'Add Pivot Fields', className: 'bg-[#d976a3] hover:bg-[#c86592]' },
  { id: 'formulaColumn', label: 'Add Formula Column', className: 'bg-[#5cb8a8] hover:bg-[#4aa797]', formulaIcon: true },
];

const CUSTOM_LABELS = {
  customFormula: 'Custom Formula',
  pivot: 'Pivot Field',
  formulaColumn: 'Formula Column',
};

function FormRow({ label, children, className = '' }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-2 sm:gap-4 items-start py-3 ${className}`}>
      <span className="text-[13px] font-medium text-[#55708a] sm:pt-1.5">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ActionButton({ action, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={() => onClick(action.id)}
      disabled={disabled}
      className={`inline-flex items-center gap-2 h-9 px-4 rounded-full text-white text-[12px] font-medium shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${action.className}`}
    >
      {action.formulaIcon ? (
        <span className="text-[13px] font-serif leading-none">x²</span>
      ) : null}
      <span>{action.label}</span>
      {!action.formulaIcon ? <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} /> : null}
    </button>
  );
}

function SettingsDropdown({ settings, selectedId, onSelect, onAdd, addError }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const rootRef = useRef(null);

  const selected = settings.find((s) => s.id === selectedId);

  useEffect(() => {
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        if (!adding) setNewName('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [adding]);

  const commitAdd = () => {
    const name = newName.trim();
    if (!name) return;
    if (onAdd(name)) {
      setAdding(false);
      setNewName('');
      setOpen(false);
    }
  };

  const startAdd = () => {
    setAdding(true);
    setOpen(true);
    setNewName('');
  };

  return (
    <div ref={rootRef} className="flex flex-wrap items-start gap-2">
      <div className="relative w-full max-w-[520px]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center justify-between w-full h-9 rounded border bg-white px-3 text-left text-[13px] focus:outline-none focus:ring-2 focus:ring-[#4a90c4]/25 ${
            open ? 'border-[#4a90c4] ring-2 ring-[#4a90c4]/25' : 'border-gray-300 hover:border-gray-400'
          }`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={`truncate pr-2 ${selected ? 'text-gray-800' : 'text-[#55708a]'}`}>
            {selected?.name || '-- Select --'}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#1e3a5f] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open ? (
          <div
            className="absolute left-0 right-0 top-full z-40 mt-0 border border-gray-200 bg-white shadow-md overflow-hidden"
            role="listbox"
          >
            <ul className="max-h-[280px] overflow-y-auto">
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedId}
                  onClick={() => {
                    onSelect('');
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-[13px] ${
                    !selectedId
                      ? 'bg-[#4a90c4] text-white'
                      : 'text-gray-700 hover:bg-[#4a90c4] hover:text-white'
                  }`}
                >
                  -- Select --
                </button>
              </li>
              {settings.map((setting) => {
                const isSelected = setting.id === selectedId;
                return (
                  <li key={setting.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelect(setting.id);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-[13px] leading-snug ${
                        isSelected
                          ? 'bg-[#4a90c4] text-white'
                          : 'text-gray-700 hover:bg-[#4a90c4] hover:text-white'
                      }`}
                    >
                      {setting.name}
                    </button>
                  </li>
                );
              })}
            </ul>
            {adding ? (
              <div className="border-t border-gray-100 p-2 space-y-1.5 bg-gray-50/90">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitAdd();
                    if (e.key === 'Escape') {
                      setAdding(false);
                      setNewName('');
                    }
                  }}
                  placeholder="New setting name"
                  autoFocus
                  className="w-full h-8 rounded border border-gray-300 px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-[#4a90c4]/30 focus:border-[#4a90c4]"
                />
                {addError ? <p className="text-[11px] text-red-600">{addError}</p> : null}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={commitAdd}
                    disabled={!newName.trim()}
                    className="h-7 px-2.5 rounded bg-[#4a90c4] text-white text-[11px] font-medium disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setNewName('');
                    }}
                    className="h-7 px-2.5 rounded border border-gray-300 text-[11px] text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={startAdd}
        className="inline-flex items-center justify-center h-9 w-9 text-[#1e3a5f] hover:text-[#4a90c4] rounded"
        aria-label="Add setting"
        title="Add setting"
      >
        <Plus className="h-5 w-5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

export default function DatawizardReport({ formulaGroups }) {
  const [report, setReport] = useState(() => initDatawizardReport(formulaGroups));
  const [settingError, setSettingError] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const dragIndexRef = useRef(null);

  const persist = (next) => {
    setReport(next);
    saveDatawizardReport(next);
  };

  const activeConfig = getActiveConfig(report);
  const hasSelectedSetting = Boolean(report.selectedSettingId);

  useEffect(() => {
    if (!report.selectedSettingId) return;
    setReport((prev) => {
      if (!prev.selectedSettingId) return prev;
      const next = syncActiveSettingFields(formulaGroups, prev);
      saveDatawizardReport(next);
      return next;
    });
  }, [formulaGroups, report.selectedSettingId]);

  const updateActiveConfig = (patch) => {
    if (!report.selectedSettingId) return;
    persist(updateActiveSetting(report, patch));
  };

  const selectSetting = (id) => {
    setSettingError('');
    if (!id) {
      persist({ ...report, selectedSettingId: '' });
      return;
    }
    const next = { ...report, selectedSettingId: id };
    persist(syncActiveSettingFields(formulaGroups, next));
  };

  const updateField = (id, patch) => {
    updateActiveConfig({
      selectedFields: activeConfig.selectedFields.map((row) =>
        row.id === id ? { ...row, ...patch } : row
      ),
    });
  };

  const removeField = (row) => {
    const patch = {
      selectedFields: activeConfig.selectedFields.filter((item) => item.id !== row.id),
    };
    if (row.formulaSourceId) {
      patch.excludedFormulaIds = [
        ...new Set([...(activeConfig.excludedFormulaIds || []), row.formulaSourceId]),
      ];
    }
    updateActiveConfig(patch);
  };

  const restoreFormulaFields = () => {
    updateActiveConfig({
      excludedFormulaIds: [],
      selectedFields: syncSelectedFieldsFromGroups(formulaGroups, {
        ...activeConfig,
        excludedFormulaIds: [],
      }),
    });
  };

  const addCustomField = (kind) => {
    if (!hasSelectedSetting) return;
    const label = CUSTOM_LABELS[kind] || 'Custom Field';
    updateActiveConfig({
      selectedFields: [
        ...activeConfig.selectedFields,
        {
          id: newReportFieldId(),
          kind,
          fieldName: label,
          displayName: label,
          totalRequired: false,
          protectColumn: false,
          hideColumn: false,
        },
      ],
    });
  };

  const reorderFields = (fromIndex, toIndex) => {
    if (fromIndex == null || toIndex == null || fromIndex === toIndex) return;
    const next = [...activeConfig.selectedFields];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    updateActiveConfig({ selectedFields: next });
  };

  const onDragStart = (index) => {
    dragIndexRef.current = index;
    setDragIndex(index);
  };

  const onDrop = (dropIndex) => {
    reorderFields(dragIndexRef.current, dropIndex);
    dragIndexRef.current = null;
    setDragIndex(null);
  };

  const handleAddSetting = (name) => {
    if (report.settings.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setSettingError('That setting already exists.');
      return false;
    }
    setSettingError('');
    const setting = {
      id: newReportSettingId(),
      name,
      reportType: 'master',
      filterCondition: '',
      selectedFields: [],
      excludedFormulaIds: [],
    };
    const next = {
      ...report,
      settings: [...report.settings, setting],
      selectedSettingId: setting.id,
    };
    persist(syncActiveSettingFields(formulaGroups, next));
    return true;
  };

  const formulaFieldCount = activeConfig.selectedFields.filter((row) => row.formulaSourceId).length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 sm:px-6 py-4 space-y-1 divide-y divide-gray-100">
        <FormRow label="Select Settings">
          <SettingsDropdown
            settings={report.settings}
            selectedId={report.selectedSettingId}
            onSelect={selectSetting}
            onAdd={handleAddSetting}
            addError={settingError}
          />
        </FormRow>

        <FormRow label="Report Type">
          <div className="flex flex-wrap gap-4 pt-0.5">
            {REPORT_TYPES.map((type) => (
              <label key={type.id} className="inline-flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="report-type"
                  checked={activeConfig.reportType === type.id}
                  onChange={() => updateActiveConfig({ reportType: type.id })}
                  disabled={!hasSelectedSetting}
                  className="h-4 w-4 text-[#4a90c4] border-gray-300 focus:ring-[#4a90c4]"
                />
                {type.label}
              </label>
            ))}
          </div>
        </FormRow>

        <FormRow label="Filter Condition">
          <textarea
            value={activeConfig.filterCondition}
            onChange={(e) => updateActiveConfig({ filterCondition: e.target.value })}
            disabled={!hasSelectedSetting}
            rows={3}
            placeholder="Enter filter conditions…"
            className="w-full max-w-3xl rounded-md border border-gray-200 px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4a90c4]/20 focus:border-[#4a90c4] resize-y min-h-[72px]"
          />
        </FormRow>

        <FormRow label="Selected Fields" className="border-b-0 pb-1">
          <div className="space-y-2">
            <p className="text-[12px] text-gray-500">
              {hasSelectedSetting ? (
                <>
                  Field names come from <strong>All formulas</strong>. Edit labels in <strong>Display Name</strong>. Drag rows to reorder.
                </>
              ) : (
                <>Select a setting above to load the field list.</>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              {FIELD_ACTIONS.map((action) => (
                <ActionButton
                  key={action.id}
                  action={action}
                  onClick={addCustomField}
                  disabled={!hasSelectedSetting}
                />
              ))}
              {hasSelectedSetting && (activeConfig.excludedFormulaIds?.length || 0) > 0 ? (
                <button
                  type="button"
                  onClick={restoreFormulaFields}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-gray-300 text-[12px] text-gray-600 hover:bg-gray-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore all formulas
                </button>
              ) : null}
            </div>
          </div>
        </FormRow>
      </div>

      <div className="overflow-x-auto border-t border-gray-200">
        <table className="min-w-full text-[13px]">
          <thead>
            <tr className="bg-[#dbe4ee] text-[#55708a]">
              <th className="w-10 px-2 py-2.5" aria-label="Reorder" />
              <th className="text-left font-semibold px-4 py-2.5 min-w-[160px]">Field Name</th>
              <th className="text-left font-semibold px-4 py-2.5 min-w-[160px]">Display Name</th>
              <th className="text-center font-semibold px-3 py-2.5 w-[120px]">Total Required</th>
              <th className="text-center font-semibold px-3 py-2.5 w-[120px]">Protect Column</th>
              <th className="text-center font-semibold px-3 py-2.5 w-[110px]">Hide Column</th>
              <th className="text-center font-semibold px-3 py-2.5 w-[80px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {!hasSelectedSetting ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-gray-400">
                  Select a setting to load fields.
                </td>
              </tr>
            ) : activeConfig.selectedFields.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-gray-400">
                  No formula fields yet. Add formulas in the <strong>All formulas</strong> tab.
                </td>
              </tr>
            ) : (
              activeConfig.selectedFields.map((row, index) => {
                const isFormulaField = Boolean(row.formulaSourceId);
                const isDragging = dragIndex === index;
                return (
                  <tr
                    key={row.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(index)}
                    className={`border-t border-gray-100 ${isDragging ? 'opacity-50 bg-blue-50/60' : 'hover:bg-gray-50/60'}`}
                  >
                    <td className="px-2 py-2 text-center">
                      <span
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          onDragStart(index);
                        }}
                        onDragEnd={() => {
                          dragIndexRef.current = null;
                          setDragIndex(null);
                        }}
                        className="inline-flex items-center justify-center p-1 rounded text-gray-400 cursor-grab active:cursor-grabbing"
                        title="Drag to reorder"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {isFormulaField ? (
                        <span className="block min-h-[32px] px-2 py-1.5 text-[13px] text-gray-800 bg-gray-50 rounded border border-gray-100">
                          {row.fieldName}
                        </span>
                      ) : (
                        <input
                          type="text"
                          value={row.fieldName}
                          onChange={(e) => updateField(row.id, { fieldName: e.target.value })}
                          className="w-full h-8 rounded border border-gray-200 px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-[#4a90c4]/30 focus:border-[#4a90c4]"
                        />
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={row.displayName}
                        onChange={(e) => updateField(row.id, { displayName: e.target.value })}
                        placeholder={row.fieldName}
                        className="w-full h-8 rounded border border-gray-200 px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-[#4a90c4]/30 focus:border-[#4a90c4]"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.totalRequired}
                        onChange={(e) => updateField(row.id, { totalRequired: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-[#4a90c4] focus:ring-[#4a90c4]"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.protectColumn}
                        onChange={(e) => updateField(row.id, { protectColumn: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-[#4a90c4] focus:ring-[#4a90c4]"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.hideColumn}
                        onChange={(e) => updateField(row.id, { hideColumn: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-[#4a90c4] focus:ring-[#4a90c4]"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeField(row)}
                        className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-white"
                        aria-label={`Delete ${row.fieldName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {hasSelectedSetting && formulaFieldCount > 0 ? (
        <p className="px-4 sm:px-6 py-2 text-[11px] text-gray-500 border-t border-gray-100">
          {formulaFieldCount} formula field(s) linked from All formulas.
        </p>
      ) : null}
    </div>
  );
}
