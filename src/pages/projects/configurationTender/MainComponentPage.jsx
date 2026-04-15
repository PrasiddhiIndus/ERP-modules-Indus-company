
import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../../lib/supabase";
import FireTenderNavbar from "../FireTenderNavbar";

const chunkArray = (arr, size) => {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
};

const MainComponentPage = ({ onDataLoaded }) => {
  const [components, setComponents] = useState([]);
  const [fileName, setFileName] = useState("");
  const [uploadDisabled, setUploadDisabled] = useState(false);

  const [userId, setUserId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) setUserId(data.user.id);
    };
    getUser();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!userId) return;
      const { data, error } = await supabase
        .from("main_components")
        .select("*")
        .eq("user_id", userId)
        .order("id", { ascending: true });

      if (error) {
        console.error("Fetch error:", error.message);
      } else {
        setComponents(data || []);
      }
    };
    fetchData();
  }, [userId]);

  // retry helper
  const tryInsertWithRetry = async (chunk, maxAttempts = 3) => {
    let attempt = 0;
    let lastError = null;
    while (attempt < maxAttempts) {
      attempt++;
      const { data: inserted, error } = await supabase
        .from("main_components")
        .insert(chunk)
        .select(); // select to get inserted rows
      if (!error) return { success: true, inserted };
      lastError = error;
      console.warn(`Insert attempt ${attempt} failed:`, error.message);
      // exponential backoff
      await new Promise((res) => setTimeout(res, 300 * attempt));
    }
    return { success: false, error: lastError };
  };

  // 🔹 Upload Excel File (works for 1000+ rows)
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!userId) {
      alert("Please login first.");
      return;
    }

    setFileName(file.name);
    setUploadDisabled(true);
    setUploading(true);
    setErrors([]);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        if (!rows || rows.length === 0) {
          alert("No rows found in sheet.");
          setUploading(false);
          setUploadDisabled(false);
          return;
        }

        // map columns -> DB column names
        const parsedRows = rows.map((row) => ({
          main_component: row["Main Component"] || "",
          sub_category1: row["Sub Category 1"] || "",
          sub_category2: row["Sub Category 2"] || "",
          sub_category3: row["Sub Category 3"] || "",
          sub_category4: row["Sub Category 4"] || "",
          sub_category5: row["Sub Category 5"] || "",
          user_id: userId, // important for RLS
        }));

        // IMPORTANT: chunk size MUST be 100 (Supabase API limit)
        const chunks = chunkArray(parsedRows, 100);
        setTotalBatches(chunks.length);
        let allInserted = [];
        let batchErrors = [];

        for (let i = 0; i < chunks.length; i++) {
          setCurrentBatch(i + 1);
          setProgressPercent(Math.round(((i + 1) / chunks.length) * 100));

          // insert with retry
          const { success, inserted, error } = await tryInsertWithRetry(
            chunks[i],
            3
          );

          if (success) {
            allInserted = [...allInserted, ...inserted];
          } else {
            // record error for UI/help
            batchErrors.push({
              batch: i + 1,
              rows: chunks[i].length,
              message: error?.message || "Unknown error",
            });
            console.error(
              `Batch ${i + 1} failed after retries:`,
              error?.message
            );
          }

          // small delay to avoid any rate-limit flares
          await new Promise((res) => setTimeout(res, 150));
        }

        // update UI/state
        setComponents((prev) => [...prev, ...allInserted]);
        if (onDataLoaded) onDataLoaded(allInserted);
        setErrors(batchErrors);
        if (batchErrors.length > 0) {
          alert(
            `Upload finished with ${batchErrors.length} failed batch(es). Check console or the errors array.`
          );
        } else {
          alert(`Upload finished. ${allInserted.length} rows saved.`);
        }
      } catch (err) {
        console.error("Upload error:", err);
        alert("Upload failed: " + (err.message || err));
      } finally {
        setUploading(false);
        setUploadDisabled(false);
        setCurrentBatch(0);
        setTotalBatches(0);
        setProgressPercent(0);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // rest of your functions (add/delete/edit)
  const handleAdd = async () => {
    const newRow = {
      main_component: "",
      sub_category1: "",
      sub_category2: "",
      sub_category3: "",
      sub_category4: "",
      sub_category5: "",
      user_id: userId,
    };

    const { data, error } = await supabase
      .from("main_components")
      .insert([newRow])
      .select();

    if (error) {
      console.error("Insert error:", error.message);
    } else {
      setComponents([...components, ...data]);
    }
  };

  const handleDelete = async (index) => {
    const row = components[index];
    if (!row?.id) return;
    const { error } = await supabase
      .from("main_components")
      .delete()
      .eq("id", row.id);
    if (error) {
      console.error("Delete error:", error.message);
    } else {
      const updated = [...components];
      updated.splice(index, 1);
      setComponents(updated);
    }
  };

  const handleEdit = async (index, field, value) => {
    const updated = [...components];
    updated[index][field] = value;
    setComponents(updated);

    const row = updated[index];
    if (!row?.id) return;

    const { error } = await supabase
      .from("main_components")
      .update({ [field]: value })
      .eq("id", row.id);

    if (error) {
      console.error("Update error:", error.message);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <FireTenderNavbar />
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Main Components & Sub Categories</h2>
        <div className="flex gap-3">
          {!uploadDisabled && (
            <label className="px-4 py-2 bg-blue-600 text-white rounded cursor-pointer hover:bg-blue-700">
              Upload
              <input
                type="file"
                accept=".xlsx,.xls,.ods"
                onChange={handleFileUpload}
                hidden
              />
            </label>
          )}
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            New
          </button>
        </div>
      </div>

      {fileName && <p className="mb-4 text-green-600">Uploaded: {fileName}</p>}

      {/* progress UI */}
      {uploading && (
        <div className="mb-4">
          <div className="text-sm mb-1">
            Uploading batch {currentBatch} of {totalBatches} — {progressPercent}%
          </div>
          <div className="w-full bg-gray-200 h-2 rounded">
            <div
              style={{ width: `${progressPercent}%` }}
              className="h-2 rounded bg-blue-600"
            />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-4 text-red-600">
          <strong>Batch errors:</strong>
          <ul>
            {errors.map((er) => (
              <li key={er.batch}>
                Batch {er.batch}: {er.rows} rows — {er.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Table (unchanged) */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2">Main Component</th>
              <th className="px-4 py-2">Sub Category 1</th>
              <th className="px-4 py-2">Sub Category 2</th>
              <th className="px-4 py-2">Sub Category 3</th>
              <th className="px-4 py-2">Sub Category 4</th>
              <th className="px-4 py-2">Sub Category 5</th>
              <th className="px-4 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {components.map((comp, index) => (
              <tr key={comp.id || index} className="border-b">
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={comp.main_component || ""}
                    onChange={(e) =>
                      handleEdit(index, "main_component", e.target.value)
                    }
                    className="w-full border rounded px-2 py-1"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={comp.sub_category1 || ""}
                    onChange={(e) =>
                      handleEdit(index, "sub_category1", e.target.value)
                    }
                    className="w-full border rounded px-2 py-1"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={comp.sub_category2 || ""}
                    onChange={(e) =>
                      handleEdit(index, "sub_category2", e.target.value)
                    }
                    className="w-full border rounded px-2 py-1"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={comp.sub_category3 || ""}
                    onChange={(e) =>
                      handleEdit(index, "sub_category3", e.target.value)
                    }
                    className="w-full border rounded px-2 py-1"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={comp.sub_category4 || ""}
                    onChange={(e) =>
                      handleEdit(index, "sub_category4", e.target.value)
                    }
                    className="w-full border rounded px-2 py-1"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={comp.sub_category5 || ""}
                    onChange={(e) =>
                      handleEdit(index, "sub_category5", e.target.value)
                    }
                    className="w-full border rounded px-2 py-1"
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => handleDelete(index)}
                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {components.length === 0 && (
              <tr>
                <td colSpan="7" className="px-4 py-6 text-center text-gray-500">
                  No sub categories added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MainComponentPage;
