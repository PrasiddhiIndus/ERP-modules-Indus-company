import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react"; // icons
import FireTenderNavbar from "../FireTenderNavbar";

export default function ManualSubCategoryPage() {
  const [categories, setCategories] = useState([
    { id: 1, name: "tddd" },
  ]);
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState([]);

  // handle add
  const handleAdd = () => {
    if (!newName.trim()) return;
    const newCat = { id: Date.now(), name: newName };
    setCategories([...categories, newCat]);
    setNewName("");
  };

  // handle delete
  const handleDelete = () => {
    setCategories(categories.filter((cat) => !selected.includes(cat.id)));
    setSelected([]);
  };

  // toggle selection
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // toggle select all
  const toggleSelectAll = () => {
    if (selected.length === categories.length) {
      setSelected([]);
    } else {
      setSelected(categories.map((cat) => cat.id));
    }
  };

  return (
    <div className="p-6">
      <FireTenderNavbar />
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Manual Sub Category</h1>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="New Sub Category"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
          <button
            onClick={handleAdd}
            className="bg-purple-700 text-white px-3 py-1 rounded flex items-center gap-1"
          >
            <Plus size={16} /> New
          </button>
          {selected.length > 0 && (
            <button
              onClick={handleDelete}
              className="bg-red-600 text-white px-3 py-1 rounded flex items-center gap-1"
            >
              <Trash2 size={16} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <table className="min-w-full border border-gray-200 rounded">
        <thead>
          <tr className="bg-gray-100">
            <th className="px-3 py-2 border">
              <input
                type="checkbox"
                checked={selected.length === categories.length && categories.length > 0}
                onChange={toggleSelectAll}
              />
            </th>
            <th className="px-3 py-2 border text-left">Manual Sub Category</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 border">
                <input
                  type="checkbox"
                  checked={selected.includes(cat.id)}
                  onChange={() => toggleSelect(cat.id)}
                />
              </td>
              <td className="px-3 py-2 border">{cat.name}</td>
            </tr>
          ))}
          {categories.length === 0 && (
            <tr>
              <td
                colSpan={2}
                className="text-center text-gray-500 py-4 border"
              >
                No sub categories found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
