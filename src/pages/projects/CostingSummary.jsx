import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

const CostingSummary = ({ grandTotal = 0, chassisTotal = 0, accessoriesTotal = 0, tenderId }) => {
  console.log("CostingSummary component loaded with new checklist items");
  const [rows, setRows] = useState([
    { component: "Inflation Cost %", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Overhead cost %", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Financial cost%", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Cost of negogiation %", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Total Fabrication Cost Without Margin (without chassis)", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Total fabrication cost without IEVPL  margin(without chassis and with considering Overahead and finance cost)", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "IEVPL Margin", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "BD cost ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Total Price of fabrication with overall cost and margin (with out chassis)", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "CHASSIS PRICE", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Imaxx", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Final price of Chassis (basic price) with temparory RTO reg.", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "RTO charges ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Insurance ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "ACCESSORIES", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Total Price without chassis ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Total Price with chassis ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Final Tender Cost (inc. GST)", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Tender Mode", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
    { component: "Total Price with chassis (Gem Cost)", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: true },
  ]);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load existing data when tenderId changes
  useEffect(() => {
    if (!tenderId) return;
    loadSummaryData();
  }, [tenderId]);

  const loadSummaryData = async () => {
    setLoading(true);
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("Auth error:", userError);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("costing_summary")
        .select("*")
        .eq("tender_id", Number(tenderId))
        .eq("user_id", user.id);

      if (error) throw error;

      if (data && data.length > 0) {
        // Load existing data
        const loadedRows = data.map(item => ({
          component: item.component,
          unitCost: Number(item.unit_cost) || 0,
          unitRate: Number(item.unit_rate) || 0,
          qty: Number(item.qty) || 1,
          total: Number(item.total) || 0,
          include: item.include !== false
        }));
        setRows(loadedRows);
      }
    } catch (err) {
      console.error("Error loading summary data:", err);
    } finally {
      setLoading(false);
    }
  };

  const saveSummaryData = async () => {
    if (!tenderId) {
      alert("No tender selected. Please open a tender before saving.");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        console.error("Auth error:", userErr);
        alert("User not authenticated. Please login.");
        return;
      }

      const userId = user.id;

      // Delete existing data for this tender and user
      await supabase
        .from("costing_summary")
        .delete()
        .eq("tender_id", Number(tenderId))
        .eq("user_id", userId);

      // Prepare new data
      const payload = rows.map((row) => ({
        tender_id: Number(tenderId),
        component: row.component,
        unit_cost: Number(row.unitCost) || 0,
        unit_rate: Number(row.unitRate) || 0,
        qty: Number(row.qty) || 1,
        total: Number(row.total) || 0,
        include: row.include !== false,
        user_id: userId,
      }));

      const { error } = await supabase
        .from("costing_summary")
        .insert(payload);

      if (error) throw error;

      alert("✅ Costing summary saved successfully!");
    } catch (err) {
      console.error("Save error:", err);
      alert("❌ Failed to save costing summary: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const approveForQuotation = async () => {
    if (!tenderId) {
      alert("No tender selected. Please open a tender before approving.");
      return;
    }

    // Get only checked items
    const checkedItems = rows.filter((row) => row.include !== false);

    if (checkedItems.length === 0) {
      alert("Please select at least one item to approve for quotation.");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        console.error("Auth error:", userErr);
        alert("User not authenticated. Please login.");
        return;
      }

      const userId = user.id;

      // 🔹 1️⃣ Delete existing approved items for this tender and user
      await supabase
        .from("approved_quotation_items")
        .delete()
        .eq("tender_id", Number(tenderId))
        .eq("user_id", userId);

      // 🔹 2️⃣ Insert approved items
      const payload = checkedItems.map((row) => ({
        tender_id: Number(tenderId),
        component: row.component,
        unit_cost: Number(row.unitCost) || 0,
        unit_rate: Number(row.unitRate) || 0,
        qty: Number(row.qty) || 1,
        total: Number(row.total) || 0,
        include: true,
        user_id: userId,
      }));

      const { error: insertError } = await supabase
        .from("approved_quotation_items")
        .insert(payload);

      if (insertError) throw insertError;

      // 🔹 3️⃣ Check if quotation already exists for this tender and user
      const { data: existingQuotation, error: fetchError } = await supabase
        .from("quotations")
        .select("id, quotation_number")
        .eq("tender_id", Number(tenderId))
        .eq("user_id", userId)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        // PGRST116 = "No rows found" → not an actual error here
        throw fetchError;
      }

      if (!existingQuotation) {
        // 🔹 4️⃣ Generate unique quotation number (count user's quotations)
        const { count, error: countError } = await supabase
          .from("quotations")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId);

        if (countError) throw countError;

        const paddedIndex = String((count || 0) + 1).padStart(4, "0");
        const quotationNumber = `QN/IFSPL/FT/${paddedIndex}`;

        // 🔹 5️⃣ Insert quotation record with user_id
        const { error: quotationInsertError } = await supabase.from("quotations").insert([
          {
            tender_id: Number(tenderId),
            quotation_number: quotationNumber,
            user_id: userId,
          },
        ]);

        if (quotationInsertError) throw quotationInsertError;

        alert(`✅ Quotation created: ${quotationNumber}`);
      } else {
        alert(`✅ Quotation already exists: ${existingQuotation.quotation_number}`);
      }

      alert(`✅ ${checkedItems.length} items approved for quotation successfully!`);
    } catch (err) {
      console.error("Approve error:", err);
      alert("❌ Failed to approve items for quotation: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  // Initialize values when grandTotal changes
  useEffect(() => {
    setRows(prevRows => {
      const updated = [...prevRows];

      // Update Total Fabrication Cost Without Margin
      const totalFabricationWithoutMarginIndex = updated.findIndex(row =>
        row.component === "Total Fabrication Cost Without Margin (without chassis)"
      );

      if (totalFabricationWithoutMarginIndex !== -1) {
        updated[totalFabricationWithoutMarginIndex].total = grandTotal;
      }

      // Update Total fabrication cost without IEVPL margin
      const totalFabricationIndex = updated.findIndex(row =>
        row.component === "Total fabrication cost without IEVPL  margin(without chassis and with considering Overahead and finance cost)"
      );

      if (totalFabricationIndex !== -1) {
        const inflationCost = updated.find(row => row.component === "Inflation Cost %")?.total || 0;
        const financialCost = updated.find(row => row.component === "Financial cost%")?.total || 0;
        const overheadCost = updated.find(row => row.component === "Overhead cost %")?.total || 0;
        const negotiationCost = updated.find(row => row.component === "Cost of negogiation %")?.total || 0;

        updated[totalFabricationIndex].total = inflationCost + financialCost + overheadCost + negotiationCost + grandTotal;
      }

      // Update Total Price of fabrication with overall cost and margin
      const totalPriceFabricationIndex = updated.findIndex(row =>
        row.component === "Total Price of fabrication with overall cost and margin (with out chassis)"
      );

      if (totalPriceFabricationIndex !== -1) {
        const bdCost = updated.find(row => row.component === "BD cost ")?.total || 0;
        const ievplMargin = updated.find(row => row.component === "IEVPL Margin")?.total || 0;
        const totalFabricationCost = updated.find(row => row.component === "Total fabrication cost without IEVPL  margin(without chassis and with considering Overahead and finance cost)")?.total || 0;

        updated[totalPriceFabricationIndex].total = bdCost + ievplMargin + totalFabricationCost;
      }

      // Update CHASSIS PRICE
      const chassisPriceIndex = updated.findIndex(row =>
        row.component === "CHASSIS PRICE"
      );

      if (chassisPriceIndex !== -1) {
        updated[chassisPriceIndex].total = chassisTotal;
      }

      // Update Final price of Chassis (basic price) with temparory RTO reg.
      const finalChassisPriceIndex = updated.findIndex(row =>
        row.component === "Final price of Chassis (basic price) with temparory RTO reg."
      );

      if (finalChassisPriceIndex !== -1) {
        const imaxxCost = updated.find(row => row.component === "Imaxx")?.total || 0;
        const chassisPrice = updated.find(row => row.component === "CHASSIS PRICE")?.total || 0;

        updated[finalChassisPriceIndex].total = imaxxCost + chassisPrice;
      }

      // Update ACCESSORIES
      const accessoriesIndex = updated.findIndex(row =>
        row.component === "ACCESSORIES"
      );

      if (accessoriesIndex !== -1) {
        console.log("CostingSummary: Updating ACCESSORIES total to", accessoriesTotal);
        updated[accessoriesIndex].total = accessoriesTotal;
      } else {
        console.warn("CostingSummary: ACCESSORIES row not found in rows array");
      }

      // Update Total Price without chassis
      const totalPriceWithoutChassisIndex = updated.findIndex(row =>
        row.component === "Total Price without chassis "
      );

      if (totalPriceWithoutChassisIndex !== -1) {
        const totalPriceFabrication = updated.find(row => row.component === "Total Price of fabrication with overall cost and margin (with out chassis)")?.total || 0;

        updated[totalPriceWithoutChassisIndex].total = totalPriceFabrication;
      }

      // Update Total Price with chassis
      const totalPriceWithChassisIndex = updated.findIndex(row =>
        row.component === "Total Price with chassis "
      );

      if (totalPriceWithChassisIndex !== -1) {
        const totalPriceWithoutChassis = updated.find(row => row.component === "Total Price without chassis ")?.total || 0;
        const finalChassisPrice = updated.find(row => row.component === "Final price of Chassis (basic price) with temparory RTO reg.")?.total || 0;
        const rtoCharges = updated.find(row => row.component === "RTO charges ")?.total || 0;
        const insurance = updated.find(row => row.component === "Insurance ")?.total || 0;

        updated[totalPriceWithChassisIndex].total = totalPriceWithoutChassis + finalChassisPrice + rtoCharges + insurance;
      }

      // Update Final Tender Cost (inc. GST)
      const finalTenderCostIndex = updated.findIndex(row =>
        row.component === "Final Tender Cost (inc. GST)"
      );

      if (finalTenderCostIndex !== -1) {
        const totalPriceWithChassis = updated.find(row => row.component === "Total Price with chassis ")?.total || 0;
        const totalPriceWithoutChassis = updated.find(row => row.component === "Total Price without chassis ")?.total || 0;

        // Conditional logic: if Total Price with chassis = 0, use Total Price without chassis * 1.18, otherwise use Total Price with chassis * 1.18
        const baseAmount = totalPriceWithChassis === 0 ? totalPriceWithoutChassis : totalPriceWithChassis;
        updated[finalTenderCostIndex].total = baseAmount * 1.18;
      }

      // Update Total Price with chassis (Gem Cost)
      const totalPriceWithChassisGemCostIndex = updated.findIndex(row =>
        row.component === "Total Price with chassis (Gem Cost)"
      );

      if (totalPriceWithChassisGemCostIndex !== -1) {
        const tenderMode = updated.find(row => row.component === "Tender Mode")?.total || 0;
        const finalTenderCost = updated.find(row => row.component === "Final Tender Cost (inc. GST)")?.total || 0;

        // Conditional logic: if tender mode = GEM (1), then Final Tender Cost + (Final Tender Cost * 0.5), otherwise 0
        if (tenderMode === 1) {
          updated[totalPriceWithChassisGemCostIndex].total = finalTenderCost + (finalTenderCost * 0.05);
        } else {
          updated[totalPriceWithChassisGemCostIndex].total = 0;
        }
      }


      return updated;
    });
  }, [grandTotal, chassisTotal, accessoriesTotal]);

  // Update row values
  const handleRowChange = (index, field, value) => {
    const updated = [...rows];
    const currentRow = updated[index];
    
    // List of read-only items that should not have their totals recalculated
    const readOnlyItems = [
      "Total Fabrication Cost Without Margin (without chassis)",
      "Total fabrication cost without IEVPL  margin(without chassis and with considering Overahead and finance cost)",
      "Total Price of fabrication with overall cost and margin (with out chassis)",
      "CHASSIS PRICE",
      "Final price of Chassis (basic price) with temparory RTO reg.",
      "ACCESSORIES",
      "Total Price without chassis ",
      "Total Price with chassis ",
      "Final Tender Cost (inc. GST)",
      "Total Price with chassis (Gem Cost)"
    ];
    
    // If it's just a checkbox toggle (include field), don't recalculate totals for read-only items
    if (field === 'include' && readOnlyItems.includes(currentRow.component)) {
      updated[index][field] = value;
      setRows(updated);
      return; // Exit early, don't recalculate
    }
    
    updated[index][field] = value;

    // Special calculation for percentage-based items
    const percentageItems = [
      "Inflation Cost %",
      "Overhead cost %",
      "Financial cost%",
      "Cost of negogiation %",
      "IEVPL Margin",
      "BD cost ",
      "Imaxx",
      "RTO charges ",
      "Insurance "
    ];

    // Don't recalculate total for read-only items
    if (readOnlyItems.includes(currentRow.component)) {
      // Skip total recalculation for read-only items
    } else if (percentageItems.includes(updated[index].component)) {
      // For percentage items, unit cost = total
      updated[index].total = Number(updated[index].unitCost) || 0;
    } else if (updated[index].component === "Tender Mode") {
      // For Tender Mode, total = selected value (0 for Non-GEM, 1 for GEM)
      updated[index].total = Number(value) || 0;
    } else {
      // For other items, use normal calculation
      updated[index].total =
        (Number(updated[index].unitRate) * Number(updated[index].qty)) || 0;
    }

    // Auto-calculate total fabrication cost
    const totalFabricationIndex = updated.findIndex(row =>
      row.component === "Total fabrication cost without IEVPL  margin(without chassis and with considering Overahead and finance cost)"
    );

    if (totalFabricationIndex !== -1) {
      const inflationCost = updated.find(row => row.component === "Inflation Cost %")?.total || 0;
      const financialCost = updated.find(row => row.component === "Financial cost%")?.total || 0;
      const overheadCost = updated.find(row => row.component === "Overhead cost %")?.total || 0;
      const negotiationCost = updated.find(row => row.component === "Cost of negogiation %")?.total || 0;

      updated[totalFabricationIndex].total = inflationCost + financialCost + overheadCost + negotiationCost + grandTotal;
    }

    // Auto-calculate Total Price of fabrication with overall cost and margin
    const totalPriceFabricationIndex = updated.findIndex(row =>
      row.component === "Total Price of fabrication with overall cost and margin (with out chassis)"
    );

    if (totalPriceFabricationIndex !== -1) {
      const bdCost = updated.find(row => row.component === "BD cost ")?.total || 0;
      const ievplMargin = updated.find(row => row.component === "IEVPL Margin")?.total || 0;
      const totalFabricationCost = updated.find(row => row.component === "Total fabrication cost without IEVPL  margin(without chassis and with considering Overahead and finance cost)")?.total || 0;

      updated[totalPriceFabricationIndex].total = bdCost + ievplMargin + totalFabricationCost;
    }

    // Update Final price of Chassis (basic price) with temparory RTO reg.
    const finalChassisPriceIndex = updated.findIndex(row =>
      row.component === "Final price of Chassis (basic price) with temparory RTO reg."
    );

    if (finalChassisPriceIndex !== -1) {
      const imaxxCost = updated.find(row => row.component === "Imaxx")?.total || 0;
      const chassisPrice = updated.find(row => row.component === "CHASSIS PRICE")?.total || 0;

      updated[finalChassisPriceIndex].total = imaxxCost + chassisPrice;
    }

    // Update Total Price without chassis
    const totalPriceWithoutChassisIndex = updated.findIndex(row =>
      row.component === "Total Price without chassis "
    );

    if (totalPriceWithoutChassisIndex !== -1) {
      const totalPriceFabrication = updated.find(row => row.component === "Total Price of fabrication with overall cost and margin (with out chassis)")?.total || 0;

      updated[totalPriceWithoutChassisIndex].total = totalPriceFabrication;
    }

    // Update Total Price with chassis
    const totalPriceWithChassisIndex = updated.findIndex(row =>
      row.component === "Total Price with chassis "
    );

    if (totalPriceWithChassisIndex !== -1) {
      const totalPriceWithoutChassis = updated.find(row => row.component === "Total Price without chassis ")?.total || 0;
      const finalChassisPrice = updated.find(row => row.component === "Final price of Chassis (basic price) with temparory RTO reg.")?.total || 0;
      const rtoCharges = updated.find(row => row.component === "RTO charges ")?.total || 0;
      const insurance = updated.find(row => row.component === "Insurance ")?.total || 0;

      updated[totalPriceWithChassisIndex].total = totalPriceWithoutChassis + finalChassisPrice + rtoCharges + insurance;
    }

    // Update Final Tender Cost (inc. GST)
    const finalTenderCostIndex = updated.findIndex(row =>
      row.component === "Final Tender Cost (inc. GST)"
    );

    if (finalTenderCostIndex !== -1) {
      const totalPriceWithChassis = updated.find(row => row.component === "Total Price with chassis ")?.total || 0;
      const totalPriceWithoutChassis = updated.find(row => row.component === "Total Price without chassis ")?.total || 0;

      // Conditional logic: if Total Price with chassis = 0, use Total Price without chassis * 1.18, otherwise use Total Price with chassis * 1.18
      const baseAmount = totalPriceWithChassis === 0 ? totalPriceWithoutChassis : totalPriceWithChassis;
      updated[finalTenderCostIndex].total = baseAmount * 1.18;
    }

    // Update Total Price with chassis (Gem Cost)
    const totalPriceWithChassisGemCostIndex = updated.findIndex(row =>
      row.component === "Total Price with chassis (Gem Cost)"
    );

    if (totalPriceWithChassisGemCostIndex !== -1) {
      const tenderMode = updated.find(row => row.component === "Tender Mode")?.total || 0;
      const finalTenderCost = updated.find(row => row.component === "Final Tender Cost (inc. GST)")?.total || 0;

      // Conditional logic: if tender mode = GEM (1), then Final Tender Cost + (Final Tender Cost * 0.5), otherwise 0
      if (tenderMode === 1) {
        updated[totalPriceWithChassisGemCostIndex].total = finalTenderCost + (finalTenderCost * 0.05);
      } else {
        updated[totalPriceWithChassisGemCostIndex].total = 0;
      }
    }

    // Preserve ACCESSORIES total from prop (don't recalculate it)
    const accessoriesIndex = updated.findIndex(row =>
      row.component === "ACCESSORIES"
    );

    if (accessoriesIndex !== -1) {
      updated[accessoriesIndex].total = accessoriesTotal;
    }

    // Preserve CHASSIS PRICE total from prop
    const chassisPriceIndex = updated.findIndex(row =>
      row.component === "CHASSIS PRICE"
    );

    if (chassisPriceIndex !== -1) {
      updated[chassisPriceIndex].total = chassisTotal;
    }

    // Preserve Total Fabrication Cost Without Margin from grandTotal
    const totalFabricationWithoutMarginIndex = updated.findIndex(row =>
      row.component === "Total Fabrication Cost Without Margin (without chassis)"
    );

    if (totalFabricationWithoutMarginIndex !== -1) {
      updated[totalFabricationWithoutMarginIndex].total = grandTotal;
    }

    setRows(updated);
  };

  // Calculate net totals
  const rowTotal = rows.reduce((sum, row) => {
    return sum + (row.include !== false ? row.total : 0);
  }, 0);
  const subtotal = rowTotal;

  const gstAmount = (subtotal * 18) / 100; // Fixed 18% GST
  const finalTotal = subtotal + gstAmount;

  return (
    <div className="p-6">
      {/* Net Total Section */}
      <div className="bg-white p-6 shadow rounded-lg mt-6">
        <h3 className="text-lg font-bold mb-4">NET TOTAL</h3>
        {/* Updated checklist items */}

        {/* Render the rows array with checkboxes */}
        <div className="mb-6">
          <h4 className="font-semibold mb-3">Cost Components</h4>
          <div className="space-y-2">
            {rows.map((row, index) => {
              const percentageItems = [
                "Inflation Cost %",
                "Overhead cost %",
                "Financial cost%",
                "Cost of negogiation %",
                "IEVPL Margin",
                "BD cost ",
                "Imaxx",
                "RTO charges ",
                "Insurance "
              ];
              const isPercentageItem = percentageItems.includes(row.component);
              const isTotalFabrication = row.component === "Total fabrication cost without IEVPL  margin(without chassis and with considering Overahead and finance cost)";
              const isTotalFabricationWithoutMargin = row.component === "Total Fabrication Cost Without Margin (without chassis)";
              const isTotalPriceFabrication = row.component === "Total Price of fabrication with overall cost and margin (with out chassis)";
              const isChassisPrice = row.component === "CHASSIS PRICE";
              const isFinalChassisPrice = row.component === "Final price of Chassis (basic price) with temparory RTO reg.";
              const isAccessories = row.component === "ACCESSORIES";
              const isTotalPriceWithoutChassis = row.component === "Total Price without chassis ";
              const isTotalPriceWithChassis = row.component === "Total Price with chassis ";
              const isFinalTenderCost = row.component === "Final Tender Cost (inc. GST)";
              const isTenderMode = row.component === "Tender Mode";
              const isTotalPriceWithChassisGemCost = row.component === "Total Price with chassis (Gem Cost)";
              const isReadOnlyItem = isTotalFabricationWithoutMargin || isTotalPriceFabrication || isTotalFabrication || isChassisPrice || isFinalChassisPrice || isAccessories || isTotalPriceWithoutChassis || isTotalPriceWithChassis || isFinalTenderCost || isTotalPriceWithChassisGemCost;
              const isCheckableItem = !isReadOnlyItem;

              return (
                <div key={index} className="flex items-center space-x-4 p-3 border rounded bg-gray-50">
                  <input
                    type="checkbox"
                    checked={row.include !== false}
                    onChange={(e) => handleRowChange(index, 'include', e.target.checked)}
                    className="mr-2 flex-shrink-0"
                  // All checkboxes are enabled - no disabled options
                  />
                  <span className="w-64 font-medium text-sm flex-shrink-0">{row.component}:</span>
                  {isTenderMode ? (
                    <select
                      value={row.total}
                      onChange={(e) => handleRowChange(index, 'total', Number(e.target.value))}
                      className="w-32 p-2 border rounded text-sm"
                    >
                      <option value={0}>Non-GEM</option>
                      <option value={1}>GEM</option>
                    </select>
                  ) : isReadOnlyItem ? (
                    <span className="w-32 p-2 bg-gray-100 border rounded text-right font-medium text-sm">
                      ₹{row.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  ) : !isTotalFabrication && !isTotalPriceFabrication && !isTotalFabricationWithoutMargin && !isChassisPrice && !isFinalChassisPrice && !isAccessories && !isTotalPriceWithoutChassis && !isTotalPriceWithChassis && !isFinalTenderCost && !isTotalPriceWithChassisGemCost && (
                    <input
                      type="number"
                      value={row.unitCost}
                      onChange={(e) => handleRowChange(index, 'unitCost', e.target.value)}
                      className="w-24 p-2 border rounded text-sm"
                      placeholder={isPercentageItem ? "Amount" : "Unit Cost"}
                      disabled={row.include === false}
                    />
                  )}
                  {!isPercentageItem && !isTotalFabrication && !isTotalFabricationWithoutMargin && !isTotalPriceFabrication && !isChassisPrice && !isFinalChassisPrice && !isAccessories && !isTotalPriceWithoutChassis && !isTotalPriceWithChassis && !isFinalTenderCost && !isTenderMode && !isTotalPriceWithChassisGemCost && (
                    <>
                      <input
                        type="number"
                        value={row.unitRate}
                        onChange={(e) => handleRowChange(index, 'unitRate', e.target.value)}
                        className="w-24 p-2 border rounded text-sm"
                        placeholder="Unit Rate"
                        disabled={row.include === false}
                      />
                      <input
                        type="number"
                        value={row.qty}
                        onChange={(e) => handleRowChange(index, 'qty', e.target.value)}
                        className="w-20 p-2 border rounded text-sm"
                        placeholder="Qty"
                        disabled={row.include === false}
                      />
                    </>
                  )}
                  {!isReadOnlyItem && !isTenderMode && (
                    <span className="w-32 text-right font-medium text-sm flex-shrink-0">₹{row.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>


        {/* Buttons */}
        <div className="mt-4 flex space-x-4">
          <button
            onClick={saveSummaryData}
            disabled={saving || loading}
            className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "💾 Save Summary"}
          </button>

          <button className="px-4 py-2 bg-purple-700 text-white rounded hover:bg-purple-800">
            Calculate
          </button>
          <button className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800">
            Export Costing Sheet XLSX Report
          </button>

          <button
            onClick={approveForQuotation}
            className="px-5 py-2.5 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition text-sm sm:text-base"
          >
            ✅ Approve Into Quotation
          </button>

        </div>
      </div>
    </div>
  );
};

export default CostingSummary;
