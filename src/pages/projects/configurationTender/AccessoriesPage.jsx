// src/pages/projects/configurationTender/AccessoriesPage.jsx
import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../../lib/supabase"; // adjust path

const AccessoriesPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  // ✅ Fetch all accessories (RLS will automatically filter based on policy)
  const fetchItems = async () => {
    setLoading(true);
    try {
      // Get current user for logging
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("User authentication error:", userError);
        throw new Error("User not authenticated");
      }

      console.log("Fetching accessories for user:", user.id);

      // Fetch all accessories - RLS policy will automatically filter to show:
      // - Items where user_id IS NULL (shared)
      // - Items where user_id = current user's id
      const { data, error } = await supabase
        .from("accessories")
        .select("id, name, description, user_id, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase query error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        console.error("Error details:", JSON.stringify(error, null, 2));
        throw error;
      }
      
      console.log("✅ Successfully fetched accessories:", data?.length || 0, "items");
      if (data && data.length > 0) {
        console.log("Sample data:", data.slice(0, 3));
        console.log("User IDs in data:", [...new Set(data.map(d => d.user_id))]);
      }
      
      setItems((data || []).map((d) => ({ ...d, editing: false, isNew: false })));
    } catch (err) {
      console.error("Fetch error:", err);
      const errorMessage = err.message || err.toString() || "Unknown error";
      alert("Failed to fetch accessories: " + errorMessage);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Upload Excel/ODS and insert rows
  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const fileData = new Uint8Array(event.target.result);
        const workbook = XLSX.read(fileData, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const rows = jsonData.slice(1).filter((r) => r && r.length > 0);
        if (!rows.length) {
          alert("No data rows found.");
          return;
        }

        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error("User not authenticated");
        }

        const payload = rows.map((row) => ({
          name: row[0] ? String(row[0]).trim() : "",
          description: row[1] ? String(row[1]).trim() : "",
          user_id: user.id,
        }));

        const { data, error } = await supabase.from("accessories").insert(payload).select();
        if (error) throw error;

        alert(`✅ Inserted ${data.length} rows`);
        
        // Refresh the list to show all items (old + new)
        // fetchItems will handle loading state
        await fetchItems();
      } catch (err) {
        console.error("Upload error:", err);
        alert("Upload error: " + (err.message || err));
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ✅ Add new row locally
  const handleAddNewRow = () => {
    const tempId = `temp-${Date.now()}`;
    setItems((prev) => [
      { id: tempId, name: "", description: "", isNew: true, editing: true },
      ...prev,
    ]);
  };

  // ✅ Handle input changes
  const handleChange = (id, field, value) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  };

  // ✅ Save row (insert or update)
  const handleSave = async (id) => {
    const item = items.find((i) => i.id === id);
    if (!item || !item.name.trim()) {
      alert("Title is required.");
      return;
    }

    setLoading(true);
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("User not authenticated");
      }

      if (String(id).startsWith("temp-") || item.isNew) {
        // Insert new accessory
        const payload = { 
          name: item.name.trim(), 
          description: item.description?.trim() || null,
          user_id: user.id,
        };
        const { data, error } = await supabase
          .from("accessories")
          .insert(payload)
          .select()
          .single();
        if (error) {
          console.error("Insert error:", error);
          throw error;
        }

        setItems((prev) => prev.map((it) => (it.id === id ? { ...data, editing: false, isNew: false } : it)));
        console.log("✅ Accessory created successfully");
      } else {
        // Update existing accessory
        const { data, error } = await supabase
          .from("accessories")
          .update({ 
            name: item.name.trim(), 
            description: item.description?.trim() || null,
            updated_at: new Date().toISOString()
          })
          .eq("id", id)
          .select()
          .single();
        if (error) {
          console.error("Update error:", error);
          throw error;
        }

        setItems((prev) => prev.map((it) => (it.id === id ? { ...data, editing: false, isNew: false } : it)));
        console.log("✅ Accessory updated successfully");
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Save failed: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  // ✅ Cancel edit/new
  const handleCancel = (id) => {
    setItems((prev) =>
      prev.filter((it) => {
        if (it.id === id && (it.isNew || String(id).startsWith("temp-"))) return false;
        return true;
      }).map((it) => (it.id === id ? { ...it, editing: false } : it))
    );
  };

  // ✅ Edit mode
  const handleEdit = (id) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, editing: true } : it)));
  };

  // ✅ Delete
  const handleDelete = async (id) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (!window.confirm("Delete this accessory?")) return;

    if (item.isNew || String(id).startsWith("temp-")) {
      setItems((prev) => prev.filter((it) => it.id !== id));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("accessories").delete().eq("id", id);
      if (error) throw error;
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (err) {
      console.error("Delete error:", err);
      alert("Delete failed: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Accessories</h2>
        <div className="flex gap-3">
          <label className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer">
            Upload Sheet
            <input type="file" accept=".ods,.xlsx,.xls" onChange={handleUpload} className="hidden" />
          </label>
          <button onClick={handleAddNewRow} className="bg-purple-600 text-white px-4 py-2 rounded">
            New
          </button>
          <button onClick={fetchItems} className="bg-gray-200 text-black px-3 py-2 rounded" disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="px-4 py-2 border">Title</th>
              <th className="px-4 py-2 border">Description</th>
              <th className="px-4 py-2 border w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                {/* Title */}
                <td className="px-4 py-2 border">
                  {item.editing ? (
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleChange(item.id, "name", e.target.value)}
                      className="w-full border rounded px-2 py-1"
                      placeholder="Enter Title"
                    />
                  ) : (
                    <span>{item.name}</span>
                  )}
                </td>

                {/* Description */}
                <td className="px-4 py-2 border">
                  {item.editing ? (
                    <input
                      type="text"
                      value={item.description || ""}
                      onChange={(e) => handleChange(item.id, "description", e.target.value)}
                      className="w-full border rounded px-2 py-1"
                      placeholder="Enter Description"
                    />
                  ) : (
                    item.description
                  )}
                </td>

                {/* Actions */}
                <td className="px-4 py-2 border">
                  {item.editing ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(item.id)}
                        className="bg-green-600 text-white px-2 py-1 rounded"
                        disabled={loading}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => handleCancel(item.id)}
                        className="bg-gray-400 text-white px-2 py-1 rounded"
                        disabled={loading}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(item.id)} className="text-blue-600 hover:underline">
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-red-600 hover:underline"
                        disabled={loading}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                  {loading ? "Loading..." : "No accessories yet. Upload or add new."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccessoriesPage;


