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
  const [editName, setEditName] = useState('');
  const [editExpression, setEditExpression] = useState('');
  const [addingToGroup, setAddingToGroup] = useState(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemExpression, setNewItemExpression] = useState('');
  const [addError, setAddError] = useState('');

  const persistGroups = (next) => {
    setGroups(next);
    saveFormulaGroups(next);
  };

  const startEdit = (groupKey, item) => {
    cancelAdd();
    setEditingKey(`${groupKey}:${item.id}`);
    setEditName(item.name);
    setEditExpression(item.expression || '');
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditName('');
    setEditExpression('');
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
    setNewItemExpression('');
    setAddError('');
  };

  const commitEdit = (groupKey, itemId) => {
    const name = editName.trim();
    if (!name) {
      cancelEdit();
      return;
    }
    const expression = editExpression.trim();
    persistGroups(
      groups.map((g) =>
        g.key !== groupKey
          ? g
          : {
              ...g,
              items: g.items.map((i) =>
                i.id === itemId ? { ...i, name, expression: expression || i.expression || '' } : i
              ),
            }
      )
    );
    cancelEdit();
  };

  const commitAdd = (groupKey) => {
    const name = newItemName.trim();
    const expression = newItemExpression.trim();
    if (!name) {
      setAddError('Enter a component name.');
      return;
    }
    if (!expression) {
      setAddError('Enter a formula expression.');
      return;
    }
    persistGroups(
      groups.map((g) =>
        g.key !== groupKey
          ? g
          : { ...g, items: [...g.items, { id: newFormulaItemId(), name, expression }] }
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
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      {groups.map((group) => {
        const isAdding = addingToGroup === group.key;
        return (
          <section
            key={group.key}
            className="flex flex-col rounded-[13px] border border-gray-200 bg-white p-3.5 min-h-[140px]"
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
            <div className="flex flex-col gap-1.5 flex-1 max-h-[min(70vh,720px)] overflow-y-auto pr-0.5">
              {group.items.length === 0 && !isAdding ? (
                <p className="text-[11px] text-gray-400 text-center py-4">No formulas yet. Click + to add.</p>
              ) : (
                group.items.map((item, index) => {
                  const itemKey = `${group.key}:${item.id}`;
                  const isEditing = editingKey === itemKey;
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-2 rounded-[9px] border border-gray-200 bg-gray-50/80 px-2.5 py-2"
                    >
                      <span className="w-5 shrink-0 pt-0.5 text-[10px] font-semibold text-gray-400 tabular-nums text-right">
                        {index + 1}
                      </span>
                      {isEditing ? (
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(group.key, item.id);
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            placeholder="Component name"
                            autoFocus
                            className="w-full h-7 rounded-md border border-[#1F3A8A]/30 px-2 text-[12.5px] text-gray-900 focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A] outline-none bg-white"
                          />
                          <input
                            type="text"
                            value={editExpression}
                            onChange={(e) => setEditExpression(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(group.key, item.id);
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            placeholder="Formula expression"
                            className="w-full h-7 rounded-md border border-[#1F3A8A]/30 px-2 text-[11.5px] text-gray-700 focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A] outline-none bg-white font-mono"
                          />
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-semibold text-gray-900 leading-snug">{item.name}</p>
                          {item.expression ? (
                            <p className="mt-0.5 text-[11px] text-gray-600 leading-snug font-mono">{item.expression}</p>
                          ) : null}
                        </div>
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
                    placeholder="Component name"
                    autoFocus
                    className="w-full h-8 rounded-md border border-gray-200 px-2 text-[12.5px] text-gray-900 focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A] outline-none bg-white"
                  />
                  <input
                    type="text"
                    value={newItemExpression}
                    onChange={(e) => {
                      setNewItemExpression(e.target.value);
                      setAddError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitAdd(group.key);
                      if (e.key === 'Escape') cancelAdd();
                    }}
                    placeholder="Formula expression"
                    className="w-full h-8 rounded-md border border-gray-200 px-2 text-[11.5px] text-gray-700 focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A] outline-none bg-white font-mono"
                  />
                  {addError ? <p className="text-[10px] text-red-600">{addError}</p> : null}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => commitAdd(group.key)}
                      disabled={!newItemName.trim() || !newItemExpression.trim()}
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
      {formulaSubTab === 'calc' ? <SiteCalculationFormulas formulaGroups={formulaGroups} /> : null}
    </div>
  );
}
