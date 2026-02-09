import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

const MocTable = ({ tenderId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
          setRows(data);
        } else {
          // Default MOC rows for new tender
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

          setRows(defaultRows);

          const { error: insertError } = await supabase
            .from("moc_prices")
            .upsert(defaultRows, { onConflict: ["moc", "tender_id"] });

          if (insertError) {
            console.error("❌ Insert error:", insertError.message);
          }
        }
      }
      setLoading(false);
    };

    fetchData();
  }, [tenderId]);

  const updateRow = (index, value) => {
    const updated = [...rows];
    updated[index].price = value;
    setRows(updated);
  };

  const saveAll = async () => {
    if (!tenderId) return;
    setSaving(true);

    try {
      const updates = rows.map((row) => ({
        moc: row.moc,
        unit: row.unit,
        price: row.price === "" ? null : row.price, // convert "" to null
        tender_id: tenderId,
        updated_at: new Date(),
      }));

      const { error } = await supabase
        .from("moc_prices")
        .upsert(updates, { onConflict: ["moc", "tender_id"] });

      if (error) throw error;

      alert("✅ MOC Prices saved successfully!");
    } catch (err) {
      console.error("❌ Save error:", err.message);
      alert("❌ Failed to save. Check console for details.");
    } finally {
      setSaving(false);
    }
  };

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

      <button
        onClick={saveAll}
        disabled={saving}
        className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "💾 Save MOC"}
      </button>
    </div>
  );
};

export default MocTable;
