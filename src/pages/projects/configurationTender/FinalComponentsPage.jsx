// src/pages/projects/configurationTender/FinalComponentsPage.jsx
import React, { useState } from "react";
import FireTenderNavbar from "../FireTenderNavbar";
import { NumericInput } from "../../../components/NumericInput";
import {
  FIRE_TENDER_TEMPLATES,
  DEFAULT_FIRE_TENDER_TEMPLATE,
} from "../fireTenderTemplates";

const defaultRows = () => [
  { id: 1, name: "Inflation Cost", unitCost: "7.00", unitRate: "0.00", quantity: "1", isNew: false },
  { id: 2, name: "Financial Cost", unitCost: "7.00", unitRate: "0.00", quantity: "1", isNew: false },
  { id: 3, name: "Overhead Cost", unitCost: "7.00", unitRate: "0.00", quantity: "1", isNew: false },
];

const initialByTemplate = () =>
  FIRE_TENDER_TEMPLATES.reduce((acc, tmpl) => {
    acc[tmpl] = defaultRows();
    return acc;
  }, {});

const FinalComponentsPage = () => {
  const [selectedTemplate, setSelectedTemplate] = useState(DEFAULT_FIRE_TENDER_TEMPLATE);
  const [componentsByTemplate, setComponentsByTemplate] = useState(initialByTemplate);

  const components = componentsByTemplate[selectedTemplate] || [];

  const setComponents = (updater) => {
    setComponentsByTemplate((prev) => {
      const current = prev[selectedTemplate] || [];
      const next = typeof updater === "function" ? updater(current) : updater;
      return { ...prev, [selectedTemplate]: next };
    });
  };

  const handleAddNewRow = () => {
    const newRow = {
      id: Date.now(),
      name: "",
      unitCost: "",
      unitRate: "",
      quantity: "1",
      isNew: true,
    };
    setComponents((prev) => [...prev, newRow]);
  };

  const handleChange = (id, field, value) => {
    setComponents((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleSave = (id) => {
    setComponents((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isNew: false } : item))
    );
  };

  const handleCancel = (id) => {
    setComponents((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDelete = (id) => {
    setComponents((prev) => prev.filter((item) => item.id !== id));
  };

  const calculateTotal = (unitRate, quantity) => {
    const rate = parseFloat(unitRate) || 0;
    const qty = parseFloat(quantity) || 0;
    return (rate * qty).toFixed(2);
  };

  return (
    <div className="p-6">
      <FireTenderNavbar />
      {/* Header */}
      <div className="flex flex-wrap justify-between items-end gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold">Final Components</h2>
          <div className="mt-2 flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Template</label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm"
            >
              {FIRE_TENDER_TEMPLATES.map((tmpl) => (
                <option key={tmpl} value={tmpl}>
                  {tmpl}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={handleAddNewRow}
          className="bg-purple-600 text-white px-4 py-2 rounded"
        >
          New
        </button>
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="px-4 py-2 border text-center w-11">S.No</th>
              <th className="px-4 py-2 border">Component Name</th>
              <th className="px-4 py-2 border">Unit Cost(%)</th>
              <th className="px-4 py-2 border">Unit Rate($)</th>
              <th className="px-4 py-2 border">Quantity</th>
              <th className="px-4 py-2 border">Total</th>
              <th className="px-4 py-2 border w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {components.map((item, idx) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border text-center tabular-nums text-gray-600">{idx + 1}</td>
                <td className="px-4 py-2 border">
                  {item.isNew ? (
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleChange(item.id, "name", e.target.value)}
                      className="w-full border rounded px-2 py-1"
                      placeholder="Enter Component Name"
                    />
                  ) : (
                    item.name
                  )}
                </td>
                <td className="px-4 py-2 border">
                  {item.isNew ? (
                    <NumericInput
                      value={item.unitCost}
                      onChange={(val) => handleChange(item.id, "unitCost", val)}
                      className="w-full border rounded px-2 py-1"
                    />
                  ) : (
                    item.unitCost
                  )}
                </td>
                <td className="px-4 py-2 border">
                  {item.isNew ? (
                    <NumericInput
                      value={item.unitRate}
                      onChange={(val) => handleChange(item.id, "unitRate", val)}
                      className="w-full border rounded px-2 py-1"
                    />
                  ) : (
                    item.unitRate
                  )}
                </td>
                <td className="px-4 py-2 border">
                  {item.isNew ? (
                    <NumericInput
                      value={item.quantity}
                      onChange={(val) => handleChange(item.id, "quantity", val)}
                      className="w-full border rounded px-2 py-1"
                    />
                  ) : (
                    item.quantity
                  )}
                </td>
                <td className="px-4 py-2 border">
                  {calculateTotal(item.unitRate, item.quantity)}
                </td>
                <td className="px-4 py-2 border">
                  {item.isNew ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(item.id)}
                        className="bg-green-600 text-white px-2 py-1 rounded"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => handleCancel(item.id)}
                        className="bg-gray-400 text-white px-2 py-1 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FinalComponentsPage;
