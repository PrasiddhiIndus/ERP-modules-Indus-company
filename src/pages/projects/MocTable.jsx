import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";

const MocTable = ({ tenderId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mocAutoHint, setMocAutoHint] = useState("");
  const skipMocAutosaveRef = useRef(true);

  useEffect(() => {
    skipMocAutosaveRef.current = true;
  }, [tenderId]);

  useEffect(() => {
    if (!tenderId) return;

    const fetchData = async () => {
      const { data, error } = await supabase
        .from("moc_prices")
        .select("*")
        .eq("tender_id", tenderId)
        .order("moc", { ascending: true });

      if (error) {
        console.error("❌ Error fetching:", error.message);
      } else {
        if (data.length > 0) {
          skipMocAutosaveRef.current = true;
          setRows(data);
        } else {
          const defaultRows = [
            { moc: "SS304", unit: "kg", price: null, tender_id: tenderId },
            { moc: "SS202", unit: "kg", price: null, tender_id: tenderId },
            { moc: "SS316", unit: "kg", price: null, tender_id: tenderId },
            { moc: "SS316L", unit: "kg", price: null, tender_id: tenderId },
            { moc: "GI", unit: "kg", price: null, tender_id: tenderId },
            { moc: "Aluminium", unit: "kg", price: null, tender_id: tenderId },
            { moc: "MS", unit: "kg", price: null, tender_id: tenderId },
            { moc: "FRP", unit: "kg", price: null, tender_id: tenderId },
            { moc: "SS304L", unit: "kg", price: null, tender_id: tenderId },
            { moc: "GP", unit: "kg", price: null, tender_id: tenderId },
            { moc: "PVC", unit: "kg", price: null, tender_id: tenderId },
            { moc: "CS", unit: "kg", price: null, tender_id: tenderId },
          ];

          skipMocAutosaveRef.current = true;
          setRows(defaultRows);

          const { error: insertError } = await supabase
            .from("moc_prices")
            .upsert(defaultRows, { onConflict: ["moc", "tender_id"] });

          if (insertError) {
            console.error("❌ Insert error:", insertError.message);
          }
        }
      }
      skipMocAutosaveRef.current = true;
      setLoading(false);
    };

    fetchData();
  }, [tenderId]);

  const updateRow = (index, value) => {
    const updated = [...rows];
    updated[index].price = value;
    setRows(updated);
  };

  const persistMoc = async (rowData, { silent = false } = {}) => {
    if (!tenderId) return;

    const updates = rowData.map((row) => ({
      moc: row.moc,
      unit: row.unit,
      price: row.price === "" ? null : row.price,
      tender_id: tenderId,
      updated_at: new Date(),
    }));

    const { error } = await supabase
      .from("moc_prices")
      .upsert(updates, { onConflict: ["moc", "tender_id"] });

    if (error) throw error;

    if (!silent) {
      alert("✅ MOC Prices saved successfully!");
    } else {
      const t = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      setMocAutoHint(`MOC prices saved · ${t}`);
      window.setTimeout(() => setMocAutoHint(""), 5000);
    }
  };

  const saveAll = async () => {
    if (!tenderId) return;
    setSaving(true);

    try {
      await persistMoc(rows, { silent: false });
    } catch (err) {
      console.error("❌ Save error:", err.message);
      alert("❌ Failed to save. Check console for details.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!tenderId || loading || rows.length === 0) return;
    if (skipMocAutosaveRef.current) {
      skipMocAutosaveRef.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          await persistMoc(rows, { silent: true });
        } catch (e) {
          console.error("MOC auto-save:", e);
          setMocAutoHint("MOC: auto-save failed");
          window.setTimeout(() => setMocAutoHint(""), 6000);
        }
      })();
    }, 1600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced upsert uses latest `rows`
  }, [rows, tenderId, loading]);

  if (loading) return <p className="p-4">Loading...</p>;

  return (
    <div className="bg-white p-6 shadow rounded-lg overflow-x-auto">
      <table className="border-collapse border text-sm w-full mb-4">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">MOC</th>
            <th className="border px-2 py-1">Unit</th>
            <th className="border px-2 py-1">Price of MOC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || row.moc}>
              <td className="border px-2 py-1">{row.moc}</td>
              <td className="border px-2 py-1">{row.unit}</td>
              <td className="border px-2 py-1">
                <input
                  type="number"
                  value={row.price ?? ""}
                  onChange={(e) => updateRow(index, e.target.value)}
                  className="w-full p-1 border rounded"
                  placeholder="Enter price"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-3">
        {mocAutoHint ? (
          <span className="w-full text-xs font-medium text-emerald-700 sm:w-auto" role="status">
            {mocAutoHint}
          </span>
        ) : null}
        <button
          type="button"
          onClick={saveAll}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "💾 Save MOC"}
        </button>
      </div>
    </div>
  );
};

export default MocTable;
