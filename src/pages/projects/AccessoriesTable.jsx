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
//     toast.success("✅ Accessories saved successfully!");
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
//       toast.warning("Failed to fetch accessories: " + (err.message || err));
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
//     toast.success("✅ Accessories saved successfully (title + description in DB, qty & price local)!");
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
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { NumericInput, parseNumericInput } from "../../components/NumericInput";
import { ALUMINIUM_EXTENSION_LADDER, parsePercentValue } from "./fireTenderCostingConfig";

import { toast } from "../../lib/toast";

const ACCESSORIES_MARGIN_COMPONENT = "Accessories Margin %";

function formatInr(n) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Grows with content so title/description stay fully visible. */
function AutoGrowTextarea({ value, onChange, placeholder, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(36, el.scrollHeight)}px`;
  }, [value]);

  const text = value ?? "";
  const minCh = Math.min(80, Math.max(16, text.length + 2));

  return (
    <textarea
      ref={ref}
      value={text}
      onChange={onChange}
      rows={1}
      placeholder={placeholder}
      style={{ minWidth: `${minCh}ch`, width: "100%" }}
      className={`min-h-[2.25rem] resize-none overflow-hidden whitespace-pre-wrap break-words p-1 border rounded ${className}`}
    />
  );
}

const AccessoriesTable = ({ tenderId, onTotalChange }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessoriesAutoHint, setAccessoriesAutoHint] = useState("");
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState(null);
  const [marginPct, setMarginPct] = useState(0);
  const skipAccessoriesAutosaveRef = useRef(true);
  const skipMarginAutosaveRef = useRef(true);

  useEffect(() => {
    skipAccessoriesAutosaveRef.current = true;
    skipMarginAutosaveRef.current = true;
  }, [tenderId]);

  useEffect(() => {
    if (!tenderId) return;
    fetchAccessoriesCosting();
  }, [tenderId]);

  // Line total (before margin)
  const totalAccessoriesCost = rows.reduce((sum, row) => {
    const qty = Number(row.qty) || 0;
    const price = Number(row.price) || 0;
    return sum + qty * price;
  }, 0);

  const marginAmount = (totalAccessoriesCost * parsePercentValue(marginPct)) / 100;
  const finalAccessoriesCost = totalAccessoriesCost + marginAmount;

  // Parent costing sheet uses final accessories cost (includes margin)
  useEffect(() => {
    if (onTotalChange) {
      onTotalChange(finalAccessoriesCost);
    }
  }, [finalAccessoriesCost, onTotalChange]);

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
      
      let catalog = [...(accessories || [])];

      const hasLadder = catalog.some((a) => a.name === ALUMINIUM_EXTENSION_LADDER.name);
      if (!hasLadder) {
        const { data: ladderRow, error: ladderErr } = await supabase
          .from("accessories")
          .insert({
            name: ALUMINIUM_EXTENSION_LADDER.name,
            description: ALUMINIUM_EXTENSION_LADDER.description,
            user_id: user.id,
          })
          .select("id, name, description, user_id, created_at, updated_at")
          .single();
        if (!ladderErr && ladderRow) {
          catalog = [ladderRow, ...catalog];
        }
      }

      if (catalog.length === 0) {
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
      const mergedRows = catalog.map((acc, index) => {
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

      // Load Accessories Margin % from costing summary (owned by this sheet)
      skipMarginAutosaveRef.current = true;
      const { data: marginRows } = await supabase
        .from("costing_summary")
        .select("unit_cost")
        .eq("tender_id", Number(tenderId))
        .eq("component", ACCESSORIES_MARGIN_COMPONENT)
        .limit(1);
      setMarginPct(parsePercentValue(marginRows?.[0]?.unit_cost));
      
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
      toast.warning("Failed to fetch accessories: " + errorMessage);
      setRows([]);
    } finally {
      skipAccessoriesAutosaveRef.current = true;
      skipMarginAutosaveRef.current = true;
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
      if (!silent) toast.warning("❌ Tender ID is missing. Cannot save.");
      return;
    }

    if (!rowData || rowData.length === 0) {
      if (!silent) toast.warning("⚠️ No accessories to save. Please add accessories in the configuration page first.");
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

    const uniqueRows = [...byAccessory.values()];

    // Persist title / description back to the accessories catalog (blank title allowed for new lines)
    for (const row of uniqueRows) {
      const { error: catalogError } = await supabase
        .from("accessories")
        .update({
          name: String(row.title || "").trim(),
          description: String(row.description || "").trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", String(row.accessory_id));
      if (catalogError) {
        console.error("Accessory catalog update error:", catalogError);
        throw catalogError;
      }
    }

    const payload = uniqueRows.map((row) => ({
      tender_id: Number(tenderId),
      accessory_id: String(row.accessory_id),
      qty: Number(row.qty) || 0,
      price: Number(row.price) || 0,
      updated_at: new Date().toISOString(),
    }));

    if (payload.length === 0) {
      if (!silent) toast.success("⚠️ No valid accessories to save.");
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
      toast.success(`✅ Accessories costing saved successfully! (${payload.length} items)`);
      await fetchAccessoriesCosting();
    } else {
      const t = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      setAccessoriesAutoHint(`Accessories saved · ${t}`);
      window.setTimeout(() => setAccessoriesAutoHint(""), 5000);
    }
  };

  const persistAccessoriesMargin = async (pctValue, baseTotal, { silent = false } = {}) => {
    if (!tenderId) return;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    const pct = parsePercentValue(pctValue);
    const amount = (Number(baseTotal) || 0) * pct / 100;

    const { error: deleteError } = await supabase
      .from("costing_summary")
      .delete()
      .eq("tender_id", Number(tenderId))
      .eq("component", ACCESSORIES_MARGIN_COMPONENT);
    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase.from("costing_summary").insert({
      tender_id: Number(tenderId),
      component: ACCESSORIES_MARGIN_COMPONENT,
      unit_cost: pct,
      unit_rate: 0,
      qty: 1,
      total: amount,
      include: true,
      user_id: user.id,
    });
    if (insertError) throw insertError;

    if (!silent) {
      toast.success("Accessories margin saved");
    }
  };

  const addAccessoryRow = async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase
        .from("accessories")
        .insert({
          name: "",
          description: "",
          user_id: user.id,
        })
        .select("id, name, description")
        .single();
      if (error) throw error;

      // Append locally — do not reload the whole sheet
      setRows((prev) => [
        ...prev,
        {
          id: null,
          accessory_id: String(data.id),
          title: "",
          description: "",
          qty: 0,
          price: 0,
        },
      ]);
    } catch (err) {
      console.error(err);
      toast.warning("Could not add accessory line: " + (err.message || err));
    }
  };

  const requestDeleteAccessory = (index) => {
    if (!rows[index]) return;
    setDeleteConfirmIndex(index);
  };

  const cancelDeleteAccessory = () => {
    if (saving) return;
    setDeleteConfirmIndex(null);
  };

  const confirmDeleteAccessory = async () => {
    if (deleteConfirmIndex == null) return;
    const index = deleteConfirmIndex;
    const row = rows[index];
    if (!row) {
      setDeleteConfirmIndex(null);
      return;
    }

    // Local-only / unsaved line without catalog id
    if (!row.accessory_id) {
      setRows((prev) => prev.filter((_, i) => i !== index));
      setDeleteConfirmIndex(null);
      return;
    }

    setSaving(true);
    try {
      // Cascade removes costing_accessories rows that reference this accessory
      const { error } = await supabase.from("accessories").delete().eq("id", String(row.accessory_id));
      if (error) throw error;
      skipAccessoriesAutosaveRef.current = true;
      setRows((prev) => prev.filter((_, i) => i !== index));
      setDeleteConfirmIndex(null);
      toast.success("Accessory deleted");
    } catch (err) {
      console.error("Delete error:", err);
      toast.warning("Delete failed: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // silent: avoid full sheet reload after save
      await persistAccessories(rows, { silent: true });
      await persistAccessoriesMargin(marginPct, totalAccessoriesCost, { silent: true });
      toast.success("✅ Accessories costing saved successfully!");
    } catch (err) {
      console.error("Save error:", err);
      const errorMessage = err.message || err.toString() || "Unknown error";
      toast.warning("❌ Failed to save accessories costing: " + errorMessage);
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
          await persistAccessoriesMargin(marginPct, totalAccessoriesCost, { silent: true });
          const t = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
          setAccessoriesAutoHint(`Accessories saved · ${t}`);
          window.setTimeout(() => setAccessoriesAutoHint(""), 5000);
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

  useEffect(() => {
    if (!tenderId || loading) return;
    if (skipMarginAutosaveRef.current) {
      skipMarginAutosaveRef.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          await persistAccessoriesMargin(marginPct, totalAccessoriesCost, { silent: true });
          const t = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
          setAccessoriesAutoHint(`Margin saved · ${t}`);
          window.setTimeout(() => setAccessoriesAutoHint(""), 5000);
        } catch (e) {
          console.error("Accessories margin auto-save:", e);
          setAccessoriesAutoHint("Margin: auto-save failed");
          window.setTimeout(() => setAccessoriesAutoHint(""), 6000);
        }
      })();
    }, 1600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marginPct, tenderId, loading]);

  if (loading) return <p className="p-4">Loading...</p>;

  const marginFormula = `Formula: total accessories cost × Accessories margin % ÷ 100\n₹${formatInr(totalAccessoriesCost)} × ${formatInr(parsePercentValue(marginPct))}% ÷ 100 = ₹${formatInr(marginAmount)}`;
  const finalFormula = `Formula: total accessories cost + Accessories margin\n₹${formatInr(totalAccessoriesCost)} + ₹${formatInr(marginAmount)} = ₹${formatInr(finalAccessoriesCost)}`;

  return (
    <div className="bg-white p-6 shadow rounded-lg overflow-x-auto">
      <h2 className="text-lg font-semibold mb-4">Accessories Costing</h2>

      <table className="border-collapse border text-sm w-full mb-4 table-auto">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1 text-center w-11">S.No</th>
            <th className="border px-2 py-1 min-w-[12rem]">Title</th>
            <th className="border px-2 py-1 min-w-[18rem]">Description</th>
            <th className="border px-2 py-1">Qty</th>
            <th className="border px-2 py-1">Price</th>
            <th className="border px-2 py-1">Total</th>
            <th className="border px-2 py-1 w-24">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="border px-2 py-4 text-center text-gray-500">
                {loading ? (
                  "Loading accessories..."
                ) : (
                  <div>
                    <p className="mb-2 font-semibold">No accessories found.</p>
                    <p className="text-sm">
                      Add a line below, or manage the catalog in{" "}
                      <a 
                        href="/app/fire-tender/configuration/accessories" 
                        className="text-blue-600 hover:underline font-semibold"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Configuration → Accessories
                      </a>
                      .
                    </p>
                  </div>
                )}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.id || row.accessory_id || index} className="hover:bg-gray-50 align-top">
                <td className="border px-2 py-1 text-center tabular-nums text-gray-600">{index + 1}</td>
                <td className="border px-2 py-1">
                  <AutoGrowTextarea
                    value={row.title || ""}
                    onChange={(e) => updateRow(index, "title", e.target.value)}
                    className="font-medium"
                    placeholder="Enter title"
                  />
                </td>
                <td className="border px-2 py-1">
                  <AutoGrowTextarea
                    value={row.description || ""}
                    onChange={(e) => updateRow(index, "description", e.target.value)}
                    placeholder="Enter description"
                  />
                </td>
                <td className="border px-2 py-1">
                  <NumericInput
                    value={row.qty}
                    onChange={(val) => updateRow(index, "qty", parseNumericInput(val, 0))}
                    className="w-full p-1 border rounded"
                  />
                </td>
                <td className="border px-2 py-1">
                  <NumericInput
                    value={row.price}
                    onChange={(val) => updateRow(index, "price", parseNumericInput(val, 0))}
                    className="w-full p-1 border rounded"
                  />
                </td>
                <td className="border px-2 py-1 text-right whitespace-nowrap">
                  ₹ {formatInr(Number(row.qty) * Number(row.price))}
                </td>
                <td className="border px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => requestDeleteAccessory(index)}
                    disabled={saving}
                    title="Delete accessory"
                    aria-label="Delete accessory"
                    className="inline-flex items-center justify-center rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))
          )}
          <tr className="bg-gray-100 font-semibold">
            <td colSpan={5} className="border px-2 py-2 text-right">Total Accessories cost</td>
            <td className="border px-2 py-2 text-right whitespace-nowrap">₹ {formatInr(totalAccessoriesCost)}</td>
            <td className="border px-2 py-2" />
          </tr>
          <tr className="bg-slate-50">
            <td colSpan={5} className="border px-2 py-2 text-right align-top">
              <div className="flex flex-col items-end gap-1">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-800">
                  <span>Accessories Margin %:</span>
                  <NumericInput
                    value={marginPct}
                    onChange={(val) => setMarginPct(val)}
                    className="!w-16 !min-w-0 !max-w-[4rem] shrink-0 p-1 border rounded text-sm text-right font-normal"
                    aria-label="Accessories margin percent"
                  />
                  <span className="text-sm font-medium text-slate-600">%</span>
                </label>
                <span className="max-w-md whitespace-pre-wrap text-left text-[11px] font-normal text-slate-500" title={marginFormula}>
                  {marginFormula}
                </span>
              </div>
            </td>
            <td className="border px-2 py-2 text-right align-top text-sm font-semibold whitespace-nowrap">
              ₹ {formatInr(marginAmount)}
            </td>
            <td className="border px-2 py-2" />
          </tr>
          <tr className="bg-blue-50 font-semibold">
            <td colSpan={5} className="border px-2 py-2 text-right align-top">
              <div className="flex flex-col items-end gap-1">
                <span className="text-blue-900">Final Accessories cost</span>
                <span className="max-w-md whitespace-pre-wrap text-left text-[11px] font-normal text-slate-500" title={finalFormula}>
                  {finalFormula}
                </span>
              </div>
            </td>
            <td className="border px-2 py-2 text-right text-blue-900 whitespace-nowrap align-top">
              ₹ {formatInr(finalAccessoriesCost)}
            </td>
            <td className="border px-2 py-2" />
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addAccessoryRow}
          className="text-blue-600 hover:underline text-sm font-medium"
        >
          + Add accessory line
        </button>
        {accessoriesAutoHint ? (
          <span className="w-full text-xs font-medium text-emerald-700 sm:w-auto" role="status">
            {accessoriesAutoHint}
          </span>
        ) : null}
        <span className="text-xs text-emerald-700">Auto-save on</span>
        <button
          type="button"
          onClick={saveAll}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Accessories Costing"}
        </button>
      </div>

      {deleteConfirmIndex != null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="accessory-delete-title"
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
          >
            <h3 id="accessory-delete-title" className="text-base font-semibold text-slate-900">
              Delete this accessory?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {rows[deleteConfirmIndex]?.title
                ? `"${rows[deleteConfirmIndex].title}" will be removed from the catalog and this sheet.`
                : "It will be removed from the catalog and this sheet."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelDeleteAccessory}
                disabled={saving}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteAccessory}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AccessoriesTable;
