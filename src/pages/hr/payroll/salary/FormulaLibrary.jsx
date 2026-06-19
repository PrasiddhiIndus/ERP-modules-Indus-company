import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../../adminOperations/components/AdminUi';
import SiteCalculationFormulas from './SiteCalculationFormulas';
import DatawizardReport from './DatawizardReport';
import { formulaGroupItemCount } from './formulaLibraryData';
import { loadFormulaGroups, saveFormulaGroups, newFormulaItemId } from './formulaLibraryStorage';

const SUB_TABS = [
  { id: 'all', label: 'All formulas' },
  { id: 'datawizard', label: 'Datawizard Report' },
  { id: 'calc', label: 'Calculation formula' },
];

function AllFormulasView({ groups, setGroups }) {
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [addingToGroup, setAddingToGroup] = useState(null);
  const [newItemName, setNewItemName] = useState('');
  const [addError, setAddError] = useState('');

  const persistGroups = (next) => {
    setGroups(next);
    saveFormulaGroups(next);
  };

  const startEdit = (groupKey, item) => {
    cancelAdd();
    setEditingKey(`${groupKey}:${item.id}`);
    setEditValue(item.name);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
  };

  const startAdd = (groupKey) => {
    cancelEdit();
    setAddingToGroup(groupKey);
    setNewItemName('');
    setAddError('');
  };

  const cancelAdd = () => {
    setAddingToGroup(null);
    setNewItemName('');
    setAddError('');
  };

  const commitEdit = (groupKey, itemId) => {
    const name = editValue.trim();
    if (!name) {
      cancelEdit();
      return;
    }
    persistGroups(
      groups.map((g) =>
        g.key !== groupKey
          ? g
          : { ...g, items: g.items.map((i) => (i.id === itemId ? { ...i, name } : i)) }
      )
    );
    cancelEdit();
  };

  const commitAdd = (groupKey) => {
    const name = newItemName.trim();
    if (!name) {
      setAddError('Enter a formula name.');
      return;
    }
    const group = groups.find((g) => g.key === groupKey);
    if (group?.items.some((i) => i.name.toLowerCase() === name.toLowerCase())) {
      setAddError('That formula name already exists in this group.');
      return;
    }
    persistGroups(
      groups.map((g) =>
        g.key !== groupKey
          ? g
          : { ...g, items: [...g.items, { id: newFormulaItemId(), name }] }
      )
    );
    cancelAdd();
  };

  const deleteItem = (groupKey, itemId) => {
    persistGroups(
      groups.map((g) =>
        g.key !== groupKey ? g : { ...g, items: g.items.filter((i) => i.id !== itemId) }
      )
    );
    if (editingKey === `${groupKey}:${itemId}`) cancelEdit();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 items-stretch">
      {groups.map((group) => {
        const isAdding = addingToGroup === group.key;
        return (
          <section
            key={group.key}
            className="flex flex-col h-full rounded-[13px] border border-gray-200 bg-white p-3 min-h-[140px]"
          >
            <div
              className="flex items-center gap-2 pb-2.5 mb-2.5 border-b-2"
              style={{ borderColor: group.accent }}
            >
              <span
                className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                style={{ background: group.dot }}
                aria-hidden
              />
              <h3 className="text-[13px] font-bold text-gray-900 flex-1 min-w-0">{group.title}</h3>
              <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600 tabular-nums shrink-0">
                {group.items.length}
              </span>
              <button
                type="button"
                onClick={() => (isAdding ? cancelAdd() : startAdd(group.key))}
                className={`inline-flex items-center justify-center h-6 w-6 rounded-md border shrink-0 ${
                  isAdding
                    ? 'border-[#1F3A8A] bg-[#1F3A8A] text-white'
                    : 'border-gray-200 text-gray-500 hover:border-[#1F3A8A] hover:text-[#1F3A8A] hover:bg-blue-50'
                }`}
                aria-label={isAdding ? `Cancel add to ${group.title}` : `Add formula to ${group.title}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              {group.items.length === 0 && !isAdding ? (
                <p className="text-[11px] text-gray-400 text-center py-4">No formulas yet. Click + to add.</p>
              ) : (
                group.items.map((item) => {
                  const itemKey = `${group.key}:${item.id}`;
                  const isEditing = editingKey === itemKey;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 rounded-[9px] border border-gray-200 bg-gray-50/80 px-2.5 py-[7px]"
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(group.key, item.id);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          onBlur={() => commitEdit(group.key, item.id)}
                          autoFocus
                          className="flex-1 min-w-0 h-7 rounded-md border border-[#1F3A8A]/30 px-2 text-[12.5px] text-gray-900 focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A] outline-none"
                        />
                      ) : (
                        <span className="flex-1 min-w-0 text-[12.5px] text-gray-900 leading-snug">{item.name}</span>
                      )}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => startEdit(group.key, item)}
                          className="p-1 rounded-md text-gray-400 hover:text-[#1F3A8A] hover:bg-white"
                          aria-label={`Edit ${item.name}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => deleteItem(group.key, item.id)}
                          className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-white"
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              {isAdding ? (
                <div className="rounded-[9px] border border-dashed border-[#1F3A8A]/40 bg-blue-50/40 px-2.5 py-2 space-y-1.5">
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => {
                      setNewItemName(e.target.value);
                      setAddError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitAdd(group.key);
                      if (e.key === 'Escape') cancelAdd();
                    }}
                    placeholder="Formula name"
                    autoFocus
                    className="w-full h-8 rounded-md border border-gray-200 px-2 text-[12.5px] text-gray-900 focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A] outline-none bg-white"
                  />
                  {addError ? <p className="text-[10px] text-red-600">{addError}</p> : null}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => commitAdd(group.key)}
                      disabled={!newItemName.trim()}
                      className="h-7 px-2.5 rounded-md bg-[#1F3A8A] text-white text-[11px] font-medium disabled:opacity-50"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={cancelAdd}
                      className="h-7 px-2.5 rounded-md border border-gray-200 text-[11px] text-gray-600 hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function FormulaLibrary() {
  const [formulaSubTab, setFormulaSubTab] = useState('all');
  const [formulaGroups, setFormulaGroups] = useState(loadFormulaGroups);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Formula Library</h2>
          <p className="text-xs text-gray-500 mt-0.5">Formulas, Datawizard report builder, and per-site calculations.</p>
        </div>
        <Badge tone="bg-slate-100 text-slate-700">{formulaGroupItemCount(formulaGroups)} formulas</Badge>
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

      {formulaSubTab === 'all' ? <AllFormulasView groups={formulaGroups} setGroups={setFormulaGroups} /> : null}
      {formulaSubTab === 'datawizard' ? <DatawizardReport formulaGroups={formulaGroups} /> : null}
      {formulaSubTab === 'calc' ? <SiteCalculationFormulas /> : null}
    </div>
  );
}
