// // src/pages/AccessoriesTable.jsx
// import React, { useState } from "react";

// const AccessoriesTable = ({ tenderId }) => {
//   const [rows, setRows] = useState([
//     { item: "Aluminium Extension Ladder", description: "10.5 Meters Length IS:4571 Double Extension Trussed", qty: 1, price: 0 },
//     { item: "Armoured Suction Hose", description: "(Rubber) Complete with Gunmetal Heavy Duty Suction Coupling to Suit the Pump Inlet Min. 2.5 Mtrs. Size", qty: 1, price: 0 },
//   ]);

//   const addRow = () => {
//     setRows([...rows, { item: "", description: "", qty: 1, price: 0 }]);
//   };

//   const updateRow = (index, field, value) => {
//     const updated = [...rows];
//     updated[index][field] = value;
//     setRows(updated);
//   };

//   const deleteRow = (index) => {
//     setRows(rows.filter((_, i) => i !== index));
//   };

//   const saveAll = () => {
//     // Later you can connect this with Supabase or backend API
//     console.log("Saving accessories:", rows);
//     alert("✅ Accessories saved successfully!");
//   };

//   return (
//     <div className="bg-white p-6 shadow rounded-lg overflow-x-auto">
//       <table className="border-collapse border text-sm w-full">
//         <thead className="bg-gray-100">
//           <tr>
//             <th className="border px-2">Item Name</th>
//             <th className="border px-2">Description</th>
//             <th className="border px-2">Quantity</th>
//             <th className="border px-2">Price</th>
//             <th className="border px-2">Total</th>
//             <th className="border px-2">Action</th>
//           </tr>
//         </thead>
//         <tbody>
//           {rows.map((row, index) => (
//             <tr key={index}>
//               <td className="border px-2">
//                 <input
//                   value={row.item}
//                   onChange={(e) => updateRow(index, "item", e.target.value)}
//                   className="w-full p-1 border rounded"
//                 />
//               </td>
//               <td className="border px-2">
//                 <input
//                   value={row.description}
//                   onChange={(e) => updateRow(index, "description", e.target.value)}
//                   className="w-full p-1 border rounded"
//                 />
//               </td>
//               <td className="border px-2">
//                 <input
//                   type="number"
//                   value={row.qty}
//                   onChange={(e) => updateRow(index, "qty", e.target.value)}
//                   className="w-full p-1 border rounded"
//                 />
//               </td>
//               <td className="border px-2">
//                 <input
//                   type="number"
//                   value={row.price}
//                   onChange={(e) => updateRow(index, "price", e.target.value)}
//                   className="w-full p-1 border rounded"
//                 />
//               </td>
//               <td className="border px-2 text-right">
//                 ₹ {(row.qty * row.price).toLocaleString()}
//               </td>
//               <td className="border px-2 text-center">
//                 <button
//                   onClick={() => deleteRow(index)}
//                   className="text-red-500"
//                 >
//                   🗑
//                 </button>
//               </td>
//             </tr>
//           ))}
//         </tbody>
//       </table>

//       {/* Add Row Button */}
//       <button onClick={addRow} className="text-blue-600 mt-3 hover:underline">
//         + Add a line
//       </button>

//       {/* Save Button */}
//       <div className="mt-4">
//         <button
//           onClick={saveAll}
//           className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
//         >
//           💾 Save Accessories
//         </button>
//       </div>
//     </div>
//   );
// };

// export default AccessoriesTable;

// // src/pages/AccessoriesTable.jsx
// import React, { useEffect, useState } from "react";
// import { supabase } from "../../lib/supabase"; // adjust path if needed

// const AccessoriesTable = () => {
//   const [rows, setRows] = useState([]);
//   const [loading, setLoading] = useState(false);

//   // ✅ Fetch only name + description
//   useEffect(() => {
//     fetchAccessories();
//   }, []);

//   const fetchAccessories = async () => {
//     setLoading(true);
//     try {
//       const { data, error } = await supabase
//         .from("accessories")
//         .select("id, name, description")
//         .order("created_at", { ascending: false });

//       if (error) throw error;

//       // Add qty & price defaults only in frontend
//       setRows(
//         (data || []).map((d) => ({
//           id: d.id,
//           item: d.name || "",
//           description: d.description || "",
//           qty: 0,
//           price: "",
//         }))
//       );
//     } catch (err) {
//       console.error("Fetch error:", err);
//       alert("Failed to fetch accessories: " + (err.message || err));
//     } finally {
//       setLoading(false);
//     }
//   };

//   const updateRow = (index, field, value) => {
//     const updated = [...rows];
//     updated[index][field] = value;
//     setRows(updated);
//   };

//   const addRow = () => {
//     setRows([
//       ...rows,
//       { id: null, item: "", description: "", qty: 1, price: 0, isNew: true },
//     ]);
//   };

//   const deleteRow = (index) => {
//     setRows(rows.filter((_, i) => i !== index));
//   };

//   const saveAll = () => {
//     console.log("Saving accessories (local + manual qty/price):", rows);
//     alert("✅ Accessories saved successfully (title + description in DB, qty & price local)!");
//   };

//   return (
//     <div className="bg-white p-6 shadow rounded-lg overflow-x-auto">
//       <h2 className="text-lg font-semibold mb-4">Accessories Table</h2>

//       <table className="border-collapse border text-sm w-full">
//         <thead className="bg-gray-100">
//           <tr>
//             <th className="border px-2">Title</th>
//             <th className="border px-2">Description</th>
//             <th className="border px-2">Quantity</th>
//             <th className="border px-2">Price</th>
//             <th className="border px-2">Total</th>
//             <th className="border px-2">Action</th>
//           </tr>
//         </thead>
//         <tbody>
//           {rows.map((row, index) => (
//             <tr key={row.id || index}>
//               <td className="border px-2">
//                 <input
//                   value={row.item}
//                   onChange={(e) => updateRow(index, "item", e.target.value)}
//                   className="w-full p-1 border rounded"
//                   placeholder="Enter Title"
//                 />
//               </td>
//               <td className="border px-2">
//                 <input
//                   value={row.description}
//                   onChange={(e) => updateRow(index, "description", e.target.value)}
//                   className="w-full p-1 border rounded"
//                   placeholder="Enter Description"
//                 />
//               </td>
//               <td className="border px-2">
//                 <input
//                   type="number"
//                   value={row.qty}
//                   onChange={(e) =>
//                     updateRow(index, "qty", parseInt(e.target.value) || 0)
//                   }
//                   className="w-full p-1 border rounded"
//                 />
//               </td>
//               <td className="border px-2">
//                 <input
//                   type="number"
//                   value={row.price}
//                   onChange={(e) =>
//                     updateRow(index, "price", parseFloat(e.target.value) || 0)
//                   }
//                   className="w-full p-1 border rounded"
//                 />
//               </td>
//               <td className="border px-2 text-right">
//                 ₹ {(row.qty * row.price).toLocaleString()}
//               </td>
//               <td className="border px-2 text-center">
//                 <button
//                   onClick={() => deleteRow(index)}
//                   className="text-red-500"
//                 >
//                   🗑
//                 </button>
//               </td>
//             </tr>
//           ))}
//           {!rows.length && (
//             <tr>
//               <td colSpan={6} className="text-center py-4 text-gray-500">
//                 {loading ? "Loading..." : "No accessories found."}
//               </td>
//             </tr>
//           )}
//         </tbody>
//       </table>

//       {/* Add Row Button */}
//       <button onClick={addRow} className="text-blue-600 mt-3 hover:underline">
//         + Add a line
//       </button>

//       {/* Save Button */}
//       <div className="mt-4">
//         <button
//           onClick={saveAll}
//           className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
//           disabled={loading}
//         >
//           💾 Save Accessories
//         </button>
//       </div>
//     </div>
//   );
// };

// export default AccessoriesTable;

import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";

const AccessoriesTable = ({ tenderId, onTotalChange }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessoriesAutoHint, setAccessoriesAutoHint] = useState("");
  const skipAccessoriesAutosaveRef = useRef(true);

  useEffect(() => {
    skipAccessoriesAutosaveRef.current = true;
  }, [tenderId]);

  useEffect(() => {
    if (!tenderId) return;
    fetchAccessoriesCosting();
  }, [tenderId]);

  // Calculate total and notify parent when it changes
  const total = rows.reduce((sum, row) => {
    const qty = Number(row.qty) || 0;
    const price = Number(row.price) || 0;
    return sum + (qty * price);
  }, 0);

  useEffect(() => {
    if (onTotalChange) {
      console.log("AccessoriesTable: Total changed to", total, "notifying parent");
      onTotalChange(total);
    }
  }, [total, onTotalChange]);

  const fetchAccessoriesCosting = async () => {
    setLoading(true);
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("User authentication error:", userError);
        throw new Error("User not authenticated");
      }

      if (!tenderId) {
        console.error("Tender ID is missing");
        throw new Error("Tender ID is required");
      }

      console.log("Fetching accessories costing for tender:", tenderId, "user:", user.id);

      // Step 1: Fetch all accessories - USE EXACT SAME PATTERN AS AccessoriesPage (which works!)
      console.log("Step 1: Fetching accessories for user:", user.id);

      // EXACT same query as AccessoriesPage - it works there, so it will work here
      // RLS policy will automatically filter to show:
      // - Items where user_id IS NULL (shared)
      // - Items where user_id = current user's id
      const { data: accessories, error: accError } = await supabase
        .from("accessories")
        .select("id, name, description, user_id, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (accError) {
        console.error("Supabase query error:", accError);
        console.error("Error code:", accError.code);
        console.error("Error message:", accError.message);
        console.error("Error details:", JSON.stringify(accError, null, 2));
        throw accError; // Throw to be caught by outer catch
      }
      
      console.log("✅ Successfully fetched accessories:", accessories?.length || 0, "items");
      if (accessories && accessories.length > 0) {
        console.log("Sample data:", accessories.slice(0, 3));
        console.log("User IDs in data:", [...new Set(accessories.map(d => d.user_id))]);
      }
      
      // If no accessories found, show empty state (not an error - user might not have added any yet)
      if (!accessories || accessories.length === 0) {
        console.warn("⚠️ No accessories found in database.");
        console.warn("User should add accessories in the configuration page first.");
        setRows([]);
        return;
      }

      // Step 2: Fetch existing costing data for this tender (if any)
      // This is optional - if it fails, we'll just use default values (0, 0)
      console.log("Step 2: Fetching existing costing data for tender:", tenderId);
      let costingData = [];
      
      // Try to fetch with user_id first, if that fails, try without it
      let costingQuery = supabase
        .from("costing_accessories")
        .select("id, tender_id, accessory_id, qty, price")
        .eq("tender_id", Number(tenderId));
      
      // Try with user_id filter first
      const { data: costing, error: costingError } = await costingQuery.eq("user_id", user.id);

      if (costingError) {
        // If user_id column doesn't exist, try without it
        console.warn("Trying without user_id filter:", costingError.message);
        const { data: costingWithoutUser, error: costingError2 } = await supabase
          .from("costing_accessories")
          .select("id, tender_id, accessory_id, qty, price")
          .eq("tender_id", Number(tenderId));
        
        if (costingError2) {
          console.warn("Note: Could not fetch existing costing data (will use default values):", costingError2.message);
          console.warn("This is normal if no costing data has been saved yet.");
        } else {
          costingData = costingWithoutUser || [];
          console.log("✅ Found costing data (without user filter):", costingData.length, "items");
        }
      } else {
        costingData = costing || [];
        console.log("✅ Found costing data:", costingData.length, "items");
      }

      // Step 3: Merge ALL accessories with existing costing data
      // Create a map of existing costing data by accessory_id for quick lookup
      // Ensure accessory_id is treated as string (uuid) for proper matching
      const costingMap = new Map();
      if (costingData && costingData.length > 0) {
        costingData.forEach((cost) => {
          // Convert accessory_id to string to ensure proper matching
          const accessoryId = String(cost.accessory_id);
          costingMap.set(accessoryId, {
            id: cost.id,
            qty: Number(cost.qty) || 0,
            price: Number(cost.price) || 0,
          });
        });
        console.log("Costing map created with", costingMap.size, "entries");
      }

      // ALWAYS show ALL accessories from configuration page
      // Use saved qty/price if they exist in costing data, otherwise use 0
      const mergedRows = accessories.map((acc, index) => {
        // Ensure accessory_id is a string (uuid) for proper matching
        const accessoryId = String(acc.id);
        const existingCost = costingMap.get(accessoryId);
        
        // Map the data exactly as it comes from accessories table
        const row = {
          id: existingCost?.id || null, // costing_accessories id if exists
          accessory_id: accessoryId, // accessories table id (uuid as string)
          title: acc.name || "", // Title (name) from accessories table
          description: acc.description || "", // Description from accessories table
          qty: existingCost?.qty || 0, // Saved qty or 0
          price: existingCost?.price || 0, // Saved price or 0
        };
        
        // Debug: log first row to verify structure
        if (index === 0) {
          console.log("✅ First row structure:", row);
          console.log("✅ Source data:", { id: acc.id, name: acc.name, description: acc.description });
        }
        
        return row;
      });

      console.log("✅ Merged data: Showing", mergedRows.length, "accessories (all from configuration page)");
      if (mergedRows.length > 0) {
        console.log("Sample merged row:", {
          title: mergedRows[0].title,
          accessory_id: mergedRows[0].accessory_id,
          qty: mergedRows[0].qty,
          price: mergedRows[0].price
        });
        console.log("First 3 rows:", mergedRows.slice(0, 3));
      } else {
        console.warn("⚠️ No merged rows to display!");
      }
      
      // Set rows and verify
      skipAccessoriesAutosaveRef.current = true;
      setRows(mergedRows);
      console.log("✅ Rows state updated. Total rows:", mergedRows.length);
      
      // Verify data structure
      if (mergedRows.length > 0) {
        console.log("✅ Data structure check:");
        console.log("- First row title:", mergedRows[0].title);
        console.log("- First row description:", mergedRows[0].description);
        console.log("- First row accessory_id:", mergedRows[0].accessory_id);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      const errorMessage = err.message || err.toString() || "Unknown error";
      console.error("Full error object:", err);
      console.error("Error stack:", err.stack);
      
      // Show error message similar to AccessoriesPage
      alert("Failed to fetch accessories: " + errorMessage);
      setRows([]);
    } finally {
      skipAccessoriesAutosaveRef.current = true;
      setLoading(false);
    }
  };

  const updateRow = (index, field, value) => {
    const updated = [...rows];
    updated[index][field] = value;
    setRows(updated);
    // Total will automatically update via useEffect
  };

  const persistAccessories = async (rowData, { silent = false } = {}) => {
    if (!tenderId) {
      if (!silent) alert("❌ Tender ID is missing. Cannot save.");
      return;
    }

    if (!rowData || rowData.length === 0) {
      if (!silent) alert("⚠️ No accessories to save. Please add accessories in the configuration page first.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    const byAccessory = new Map();
    for (const row of rowData) {
      if (!row.accessory_id) continue;
      byAccessory.set(String(row.accessory_id), row);
    }

    const payload = [...byAccessory.values()].map((row) => ({
      tender_id: Number(tenderId),
      accessory_id: String(row.accessory_id),
      qty: Number(row.qty) || 0,
      price: Number(row.price) || 0,
      updated_at: new Date().toISOString(),
    }));

    if (payload.length === 0) {
      if (!silent) alert("⚠️ No valid accessories to save.");
      return;
    }

    const payloadWithUser = payload.map((p) => ({ ...p, user_id: user.id }));

    const { error: upsertError } = await supabase
      .from("costing_accessories")
      .upsert(payloadWithUser, { onConflict: "tender_id,accessory_id" });

    if (upsertError) {
      console.warn("Upsert with user_id failed, trying without:", upsertError.message);
      const { error: upsertError2 } = await supabase
        .from("costing_accessories")
        .upsert(payload, { onConflict: "tender_id,accessory_id" });

      if (upsertError2) {
        console.error("Upsert error:", upsertError2);
        throw upsertError2;
      }
    }

    if (!silent) {
      alert(`✅ Accessories costing saved successfully! (${payload.length} items)`);
      await fetchAccessoriesCosting();
    } else {
      const t = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      setAccessoriesAutoHint(`Accessories saved · ${t}`);
      window.setTimeout(() => setAccessoriesAutoHint(""), 5000);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      await persistAccessories(rows, { silent: false });
    } catch (err) {
      console.error("Save error:", err);
      const errorMessage = err.message || err.toString() || "Unknown error";
      alert("❌ Failed to save accessories costing: " + errorMessage);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!tenderId || loading) return;
    if (skipAccessoriesAutosaveRef.current) {
      skipAccessoriesAutosaveRef.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          await persistAccessories(rows, { silent: true });
        } catch (e) {
          console.error("Accessories auto-save:", e);
          setAccessoriesAutoHint("Accessories: auto-save failed");
          window.setTimeout(() => setAccessoriesAutoHint(""), 6000);
        }
      })();
    }, 1600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced upsert uses latest `rows`
  }, [rows, tenderId, loading]);

  if (loading) return <p className="p-4">Loading...</p>;

  return (
    <div className="bg-white p-6 shadow rounded-lg overflow-x-auto">
      <h2 className="text-lg font-semibold mb-4">Accessories Costing</h2>
      
      {/* Total Display at Top */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold text-blue-800">Total Accessories Cost:</span>
          <span className="text-2xl font-bold text-blue-900">₹ {total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
      <table className="border-collapse border text-sm w-full mb-4">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">Title</th>
            <th className="border px-2 py-1">Description</th>
            <th className="border px-2 py-1">Qty</th>
            <th className="border px-2 py-1">Price</th>
            <th className="border px-2 py-1">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="border px-2 py-4 text-center text-gray-500">
                {loading ? (
                  "Loading accessories..."
                ) : (
                  <div>
                    <p className="mb-2 font-semibold">No accessories found.</p>
                    <p className="text-sm">
                      Please add accessories in the{" "}
                      <a 
                        href="/app/fire-tender/configuration/accessories" 
                        className="text-blue-600 hover:underline font-semibold"
                        target="_blank"
                      >
                        Configuration → Accessories
                      </a>{" "}
                      page first.
                    </p>
                  </div>
                )}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.id || row.accessory_id || index} className="hover:bg-gray-50">
                <td className="border px-2 py-1 font-medium">{row.title || "N/A"}</td>
                <td className="border px-2 py-1">{row.description || ""}</td>
                <td className="border px-2 py-1">
                  <input
                    type="number"
                    value={row.qty}
                    onChange={(e) => updateRow(index, "qty", parseFloat(e.target.value) || 0)}
                    className="w-full p-1 border rounded"
                    min="0"
                    step="0.01"
                  />
                </td>
                <td className="border px-2 py-1">
                  <input
                    type="number"
                    value={row.price}
                    onChange={(e) => updateRow(index, "price", parseFloat(e.target.value) || 0)}
                    className="w-full p-1 border rounded"
                    min="0"
                    step="0.01"
                  />
                </td>
                <td className="border px-2 py-1 text-right">
                  ₹ {(Number(row.qty) * Number(row.price)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))
          )}
          {/* Total Row at Bottom */}
          {rows.length > 0 && (
            <tr className="bg-gray-100 font-semibold">
              <td colSpan={4} className="border px-2 py-2 text-right">Total:</td>
              <td className="border px-2 py-2 text-right">
                ₹ {total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {accessoriesAutoHint ? (
          <span className="w-full text-xs font-medium text-emerald-700 sm:w-auto" role="status">
            {accessoriesAutoHint}
          </span>
        ) : null}
        <button
          type="button"
          onClick={saveAll}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "💾 Save Accessories Costing"}
        </button>
      </div>
    </div>
  );
};

export default AccessoriesTable;
