// src/pages/projects/configurationTender/PriceMasterPage.jsx
import React, { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import auditLogger from "../../../lib/auditLogger";
import { isRetiredFireTenderMainComponentLabel } from "../../../lib/retiredFireTenderMainComponents";
import FireTenderNavbar from "../FireTenderNavbar";

const PriceMasterPage = () => {
  const [priceList, setPriceList] = useState([]);
  const [mainComponents, setMainComponents] = useState([]);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  // Removed auto-save functionality for better performance

  // Get unique values for dropdowns
  const getUniqueValues = (field) => {
    const values = mainComponents
      .map(comp => comp[field])
      .filter(value => value && value.trim() !== '')
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();
    return values;
  };

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        setLoading(false);
        return;
      }
      setUserId(auth.user.id);
      const uid = auth.user.id;

      const { data, error } = await supabase
        .from("main_components")
        .select("*")
        .order("id", { ascending: true });

      if (error) {
        console.error("Fetch main components error:", error.message);
        setError("Failed to load main components: " + error.message);
        setLoading(false);
        return;
      }

      const mainFiltered = (data || []).filter(
        (r) => !isRetiredFireTenderMainComponentLabel(r.main_component)
      );
      setMainComponents(mainFiltered);

      const { data: priceData, error: priceError } = await supabase
        .from("price_master")
        .select("*")
        .order("id", { ascending: true });

      if (priceError) {
        console.error("Fetch price list error:", priceError.message);
        setError("Failed to load price master data: " + priceError.message);
        setLoading(false);
        return;
      }

      const pricesFiltered = (priceData || []).filter(
        (row) => !isRetiredFireTenderMainComponentLabel(row.main_component)
      );

      if (priceData.length === 0 && mainFiltered.length > 0) {
        const priceEntries = mainFiltered.map((comp) => ({
          main_component: comp.main_component,
          sub_category1: comp.sub_category1,
          sub_category2: comp.sub_category2,
          sub_category3: comp.sub_category3,
          sub_category4: comp.sub_category4,
          sub_category5: comp.sub_category5,
          manual_sub_category: "",
          weight: 0,
          unit_cost: 0,
          is_new: false,
          user_id: uid,
        }));

        const { error: insertError } = await supabase.from("price_master").insert(priceEntries);

        if (insertError) {
          console.error("Insert price master error:", insertError.message);
          setError("Failed to create price master entries: " + insertError.message);
        } else {
          const { data: newPriceData } = await supabase
            .from("price_master")
            .select("*")
            .order("id", { ascending: true });
          const newFiltered = (newPriceData || []).filter(
            (row) => !isRetiredFireTenderMainComponentLabel(row.main_component)
          );
          setPriceList(newFiltered);
          setSuccess(`Successfully created ${mainFiltered.length} price master entries from main components`);
        }
      } else {
        setPriceList(pricesFiltered);
        if (mainFiltered.length > 0) {
          setSuccess(`Loaded ${pricesFiltered.length} price master entries`);
        }
      }

      setLoading(false);
    };

    load();
  }, []);

  // Removed timeout cleanup - no auto-save functionality

  const handleAddNewRow = async () => {
    const newRow = {
      main_component: "",
      sub_category1: "",
      sub_category2: "",
      sub_category3: "",
      sub_category4: "",
      sub_category5: "",
      manual_sub_category: "",
      weight: "",
      unit_cost: "",
      user_id: userId,
      is_new: true,
    };

    const { data, error } = await supabase
      .from("price_master")
      .insert([newRow])
      .select();

    if (error) {
      console.error("Insert error:", error.message);
    } else {
      setPriceList([...priceList, ...data]);
    }
  };

  // Helper function to format number with commas
  const formatNumberWithCommas = (num) => {
    if (!num || num === '') return '';
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  // Helper function to remove commas for calculations
  const removeCommas = (str) => {
    return str.replace(/,/g, '');
  };

  // Removed debounced auto-save function for better performance

  const handleChange = (id, field, value) => {
    // Format weight and unit cost values
    let formattedValue = value;
    if (field === 'weight') {
      // Ensure weight is a positive number
      formattedValue = value.replace(/[^0-9.]/g, '');
    } else if (field === 'unit_cost') {
      // Remove commas first, then validate
      const cleanValue = removeCommas(value);
      // Ensure unit cost is a positive number with up to 2 decimal places
      formattedValue = cleanValue.replace(/[^0-9.]/g, '');
      const parts = formattedValue.split('.');
      if (parts.length > 2) {
        formattedValue = parts[0] + '.' + parts.slice(1).join('');
      }
      if (parts[1] && parts[1].length > 2) {
        formattedValue = parts[0] + '.' + parts[1].substring(0, 2);
      }
    }
    
    // Update local state only - no auto-save
    setPriceList(
      priceList.map((item) =>
        item.id === id ? { ...item, [field]: formattedValue } : item
      )
    );
  };

  const handleSave = async (id) => {
    const item = priceList.find(item => item.id === id);
    if (!item) return;

    // Save all current field values to database
    const { error } = await supabase
      .from("price_master")
      .update({ 
        weight: parseFloat(item.weight) || 0,
        unit_cost: parseFloat(item.unit_cost) || 0,
        is_new: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      console.error("Save error:", error.message);
      setError("Failed to save: " + error.message);
    } else {
      setPriceList(
        priceList.map((item) =>
          item.id === id ? { ...item, is_new: false } : item
        )
      );
      setSuccess("Successfully saved changes");
      setTimeout(() => setSuccess(null), 3000);

      // Log price changes and trigger drift detection
      if (item.unit_cost) {
        const component = item.main_component || 'Unknown';
        await auditLogger.logPriceMasterChange(id, 0, item.unit_cost, component);
      }
    }
  };

  const handleCancel = async (id) => {
    const itemToDelete = priceList.find(item => item.id === id);
    
    const { error } = await supabase
      .from("price_master")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Cancel error:", error.message);
      setError("Failed to cancel: " + error.message);
    } else {
      setPriceList(priceList.filter((item) => item.id !== id));
      setSuccess("Row cancelled and removed");
      setTimeout(() => setSuccess(null), 3000);

      // No logging needed for cancel action - not unit cost related
    }
  };

  const handleDelete = async (id) => {
    const itemToDelete = priceList.find(item => item.id === id);
    
    const { error } = await supabase
      .from("price_master")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete error:", error.message);
      setError("Failed to delete: " + error.message);
    } else {
      setPriceList(priceList.filter((item) => item.id !== id));
      setSuccess("Row deleted successfully");
      setTimeout(() => setSuccess(null), 3000);

      // No logging needed for delete action - not unit cost related
    }
  };

  // Bulk save all changes
  const handleSaveAll = async () => {
    try {
      setLoading(true);
      const updates = priceList.map(item => ({
        id: item.id,
        main_component: item.main_component,
        sub_category1: item.sub_category1,
        sub_category2: item.sub_category2,
        sub_category3: item.sub_category3,
        sub_category4: item.sub_category4,
        sub_category5: item.sub_category5,
        manual_sub_category: item.manual_sub_category,
        weight: parseFloat(item.weight) || 0,
        unit_cost: parseFloat(item.unit_cost) || 0,
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from("price_master")
        .upsert(updates, { onConflict: 'id' });

      if (error) {
        console.error("Bulk save error:", error.message);
        setError("Failed to save all changes: " + error.message);
      } else {
        setSuccess(`Successfully saved all ${updates.length} changes`);
        setTimeout(() => setSuccess(null), 5000);

        // No logging needed for bulk save - not unit cost specific
      }
    } catch (err) {
      console.error("Bulk save error:", err);
      setError("Failed to save all changes: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <FireTenderNavbar />
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-semibold">Price Master</h2>
          <p className="text-gray-600 text-sm mt-1">
            Add weight and unit cost for each component from Main Components page
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-500">
            {priceList.length} components loaded
          </div>
          <button
            onClick={handleSaveAll}
            disabled={loading}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save all changes to database"
          >
            {loading ? "Saving..." : "💾 Save All"}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
            title="Refresh to sync with Main Components"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-800">{success}</p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setSuccess(null)}
                className="text-green-400 hover:text-green-600"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="px-4 py-2 border">Main Cost Component Name</th>
              <th className="px-4 py-2 border">Sub Category 1</th>
              <th className="px-4 py-2 border">Sub Category 2</th>
              <th className="px-4 py-2 border">Sub Category 3</th>
              <th className="px-4 py-2 border">Sub Category 4</th>
              <th className="px-4 py-2 border">Sub Category 5</th>
              <th className="px-4 py-2 border">Manual Sub Category</th>
              <th className="px-4 py-2 border">Weight (kg)</th>
              <th className="px-4 py-2 border">Unit Cost (₹)</th>
              <th className="px-4 py-2 border">Last Updated</th>
              <th className="px-4 py-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {priceList.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                {/* Main Component - Read Only */}
                <td className="px-4 py-2 border bg-gray-50">
                  <span className="font-medium">{item.main_component}</span>
                </td>
                
                {/* Sub Category 1 - Read Only */}
                <td className="px-4 py-2 border bg-gray-50">
                  <span>{item.sub_category1 || "-"}</span>
                </td>
                
                {/* Sub Category 2 - Read Only */}
                <td className="px-4 py-2 border bg-gray-50">
                  <span>{item.sub_category2 || "-"}</span>
                </td>
                
                {/* Sub Category 3 - Read Only */}
                <td className="px-4 py-2 border bg-gray-50">
                  <span>{item.sub_category3 || "-"}</span>
                </td>
                
                {/* Sub Category 4 - Read Only */}
                <td className="px-4 py-2 border bg-gray-50">
                  <span>{item.sub_category4 || "-"}</span>
                </td>
                
                {/* Sub Category 5 - Read Only */}
                <td className="px-4 py-2 border bg-gray-50">
                  <span>{item.sub_category5 || "-"}</span>
                </td>
                
                {/* Manual Sub Category - Editable */}
                <td className="px-4 py-2 border">
                  <input
                    type="text"
                    value={item.manual_sub_category || ""}
                    onChange={(e) =>
                      handleChange(item.id, "manual_sub_category", e.target.value)
                    }
                    className="w-full border rounded px-2 py-1"
                    placeholder="Enter manual sub category"
                  />
                </td>
                {/* Weight Column - Always Editable */}
                <td className="px-4 py-2 border">
                  <div className="flex items-center">
                    <input
                      type="number"
                      value={item.weight || ""}
                      onChange={(e) =>
                        handleChange(item.id, "weight", e.target.value)
                      }
                      className="w-full border rounded px-2 py-1"
                      placeholder="Enter weight"
                      min="0"
                      step="0.01"
                    />
                    <span className="ml-2 text-gray-500 text-sm">kg</span>
                  </div>
                </td>
                {/* Unit Cost Column - Always Editable */}
                <td className="px-4 py-2 border">
                  <div className="flex items-center">
                    <span className="text-gray-500 mr-1">₹</span>
                    <input
                      type="text"
                      value={formatNumberWithCommas(item.unit_cost)}
                      onChange={(e) =>
                        handleChange(item.id, "unit_cost", e.target.value)
                      }
                      className="w-full border rounded px-2 py-1"
                      placeholder="0.00"
                    />
                  </div>
                </td>
                {/* Last Updated Column */}
                <td className="px-4 py-2 border text-sm text-gray-600">
                  {item.updated_at ? (
                    <div>
                      <div>{new Date(item.updated_at).toLocaleDateString()}</div>
                      <div className="text-xs text-gray-400">
                        {new Date(item.updated_at).toLocaleTimeString()}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400">Never</span>
                  )}
                </td>
                <td className="px-4 py-2 border">
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-red-600 hover:underline px-2 py-1 rounded hover:bg-red-50"
                    title="Delete this price entry"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {priceList.length === 0 && !loading && (
              <tr>
                <td colSpan="10" className="px-4 py-8 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-lg font-medium text-gray-900 mb-2">No Components Found</p>
                    <p className="text-gray-500 mb-4">
                      Add components in the Main Components page first, then they will appear here.
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                    >
                      Refresh Page
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PriceMasterPage;
