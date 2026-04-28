// src/pages/Manpower/InternalQuotationForm.jsx
import React, { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";

import { supabase } from "../../../lib/supabase";

const ROLE_COLUMNS = [
  { key: "sr_fire_supervisor", label: "Sr. Fire Supervisor (Highly skilled)" },
  { key: "fire_supervisor", label: "Fire Supervisor (Highly skilled)" },
  { key: "dcpo", label: "DCPO {Driver Cum Pump Operator} (Highly skilled)" },
  { key: "fireman_l1", label: "Fire Man-Level-1 (Skilled) / Senior Firemen" },
  { key: "fireman_l2", label: "Fire Man/ Trainee Level-2 (Skilled) / Junior Firemen" },
];

const MANPOWER_CATEGORIES = [
  "Admin Supervisor",
  "Assistant Station Officer",
  "Cook",
  "Data Entry Operator",
  "Driver Cum Pump Operator",
  "Electrician",
  "Fire Alarm Service Engineer",
  "Fire Control Room Operator",
  "Fire Officer",
  "Fire Sentries",
  "Fire Service Ambulance Driver",
  "Fire Supervisor",
  "Fire Technician A",
  "Fire Tender Technician",
  "Fireman",
  "Fire Marshal",
  "Fire Operator",
  "Fireman A",
  "Fireman B",
  "FireTechnician B",
  "Helper",
  "Junior Fireman",
  "Leading Fireman",
  "Rescuers",
  "Safety Marshal",
  "Safety Officer",
  "Safety Stewards",
  "Safety Supervisor",
  "Shift Manager",
  "Site Incharge",
  "Store Assistant",
  "Store Incharge",
];

const SKILL_LEVELS = ["Highly Skilled", "Skilled", "Semi Skilled", "Unskilled"];

const DEFAULT_WAGE_ROWS = [
  {
    id: "basic",
    slNo: 1,
    component: "BASIC",
    rateType: "Fixed",
    locked: true,
    values: { sr_fire_supervisor: "", fire_supervisor: "", dcpo: "", fireman_l1: "", fireman_l2: "" },
  },
  {
    id: "hra",
    slNo: 2,
    component: "HRA",
    rateType: "5%",
    locked: false,
    values: { sr_fire_supervisor: "", fire_supervisor: "", dcpo: "", fireman_l1: "", fireman_l2: "" },
  },
  {
    id: "other_allowances",
    slNo: 3,
    component: "Other Allowances (if applicable)",
    rateType: "Fixed",
    locked: false,
    values: { sr_fire_supervisor: "", fire_supervisor: "", dcpo: "", fireman_l1: "", fireman_l2: "" },
  },
  {
    id: "washing_allowance",
    slNo: 8,
    component: "Washing Allowances",
    rateType: "Fixed",
    locked: true,
    values: { sr_fire_supervisor: "", fire_supervisor: "", dcpo: "", fireman_l1: "", fireman_l2: "" },
  },
  {
    id: "uniform_ppe",
    slNo: 9,
    component: "UNIFORM, PPEs & Other Accessories (Detail list shared in SOP)",
    rateType: "Fixed",
    locked: true,
    values: { sr_fire_supervisor: "", fire_supervisor: "", dcpo: "", fireman_l1: "", fireman_l2: "" },
  },
  {
    id: "transportation",
    slNo: 10,
    component: "Transportation (Fuel allowance/Petrol allowance) - if any",
    rateType: "Fixed",
    locked: false,
    values: { sr_fire_supervisor: "", fire_supervisor: "", dcpo: "", fireman_l1: "", fireman_l2: "" },
  },
];

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatINR(n) {
  const v = safeNum(n);
  return v === 0 ? "" : v.toLocaleString("en-IN");
}

function moneyOrBlank(n) {
  const v = safeNum(n);
  return v ? `₹${formatINR(v)}` : "";
}

function isBlank(v) {
  return String(v ?? "").trim() === "";
}

const InternalQuotationForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [enquiry, setEnquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('manpower');
  const [wageRows, setWageRows] = useState(DEFAULT_WAGE_ROWS);
  const [wageSummary, setWageSummary] = useState(() => ({
    qty: {
      sr_fire_supervisor: "",
      fire_supervisor: "",
      dcpo: "",
      fireman_l1: "",
      fireman_l2: "",
    },
    gstPercent: "",
    contractYears: "",
  }));

  const [manpowerRows, setManpowerRows] = useState(() =>
    MANPOWER_CATEGORIES.map((name, idx) => ({
      id: `mp_${idx + 1}`,
      srNo: idx + 1,
      category: name,
      skill: "",
      qty: "",
    }))
  );

  const addManpowerRow = () => {
    setManpowerRows((prev) => {
      const nextSr = (prev?.length || 0) + 1;
      return [
        ...(prev || []),
        {
          id: `mp_custom_${Date.now()}`,
          srNo: nextSr,
          category: "",
          skill: "",
          qty: "",
          isCustom: true,
        },
      ];
    });
  };

  const deleteManpowerRow = (rowId) => {
    setManpowerRows((prev) =>
      (prev || [])
        .filter((r) => r.id !== rowId)
        .map((r, idx) => ({ ...r, srNo: idx + 1 }))
    );
  };

  // ---------------------------
  // Cost Breakup (UI only)
  // ---------------------------
  const [costSheet, setCostSheet] = useState(() => ({
    site: "",
    date: "",
    dutyPattern: "8h", // '8h' | '12h'
    divisor: "", // 26 | 26.5 | 27 | 30 | 31 | manual
    manualDivisor: "",
    pfMethod: "b5a", // 'b5a' | 'b5b' | 'b5c'
    headcountForD8: "",
    monthsForD8: "12",
    // Block A inputs
    a1_minWagePerDay: "",
    a1_wef: "",
    a3_specialAllowance: "",
    a4_medicalAllowance: "",
    a5_washing_mode: "percent", // percent | fixed
    a5_washing_percent: "",
    a5_washing_fixed: "",
    a6_foodAllowance: "",
    a7_travel_mode: "percent",
    a7_travel_percent: "",
    a7_travel_fixed: "",
    a8_hra_percent: "",
    // Block B toggles / bases
    b1_leave_percent: "",
    b2_percent: "",
    b2_base: "basic", // basic | gross
    b3_percent: "",
    b3_base: "basic",
    b4_percent: "",
    b4_base: "basic",
    b5_percent: "13",
    b5_ceiling_basic: "15000",
    b6_nationalHoliday_count: "",
    b6_mode: "minwage", // minwage | gross
    b7_publicHoliday_count: "",
    b8_esic_enabled: false,
    b8_esic_percent: "3.25",
    b9_bonus_percent: "8.33",
    b9_basis: "basic", // basic | reimbursement
    b10_gratuity_percent: "4.81",
    b10_basis: "provision", // provision | reimbursement
    b11_weeklyOff_percent: "16.67",
    // Block C
    c1_wc_rate_per_1000: "72.95",
    c2_cgl: "",
    c3_mediclaim: "",
    c4_gpa: "",
    // Block D
    d1_labourLicense: "",
    d2_migration_enabled: false,
    d2_migration_amount: "",
    d3_uniformPPE: "",
    d4_lwf: "",
    d5_accommodation: "",
    d6_transportation: "",
    d7_training: "",
    d8_otherOperational: "", // computed from sub-sheet; can override if needed
    // Block E
    e2_service_mode: "fixed", // fixed | percent
    e2_service_fixed: "",
    e2_service_percent: "",
    e4_headcount_total: "",
  }));

  const [d8Items, setD8Items] = useState(() => {
    return Array.from({ length: 27 }).map((_, idx) => ({
      id: `d8_${idx + 1}`,
      include: false,
      amount: "",
    }));
  });

  const D8_ITEM_LABELS = useMemo(
    () => [
      "Electricity Charges",
      "Admin Supervisor Salary",
      "Admin Charges",
      "Voucher Payment",
      "Cook Salary",
      "Drinking Water",
      "House Keeping Salary",
      "House Keeping Material",
      "Site Advance",
      "News Paper",
      "TV Recharge",
      "Toilet Cleaning Charges",
      "Birthday Celebration",
      "Vishwa Karma Puja",
      "Pre-Medical Expenses",
      "Best Fire Personnel Award",
      "Bada Khana (Special Meal)",
      "Bank Guarantee Charges",
      "Tools & Tackles",
      "Inventories",
      "Consumables",
      "Penalty Deduction / LD",
      "Site Visit Expenses",
      "Fire Week Gift",
      "Business Promotion",
      "GEM Fees",
      "Overtime Loss",
    ],
    []
  );

  const effectiveDivisor = useMemo(() => {
    if (costSheet.dutyPattern === "12h") return safeNum(costSheet.manualDivisor);
    return safeNum(costSheet.divisor);
  }, [costSheet.divisor, costSheet.manualDivisor, costSheet.dutyPattern]);

  const calcA2_basicMonthly = useMemo(() => {
    if (isBlank(costSheet.a1_minWagePerDay) || !effectiveDivisor) return 0;
    return safeNum(costSheet.a1_minWagePerDay) * effectiveDivisor;
  }, [costSheet.a1_minWagePerDay, effectiveDivisor]);

  const calcA5_washing = useMemo(() => {
    if (costSheet.a5_washing_mode === "fixed") return safeNum(costSheet.a5_washing_fixed);
    const pct = safeNum(costSheet.a5_washing_percent);
    return pct ? (calcA2_basicMonthly * pct) / 100 : 0;
  }, [calcA2_basicMonthly, costSheet.a5_washing_fixed, costSheet.a5_washing_mode, costSheet.a5_washing_percent]);

  const calcA7_travel = useMemo(() => {
    if (costSheet.a7_travel_mode === "fixed") return safeNum(costSheet.a7_travel_fixed);
    const pct = safeNum(costSheet.a7_travel_percent);
    return pct ? (calcA2_basicMonthly * pct) / 100 : 0;
  }, [calcA2_basicMonthly, costSheet.a7_travel_fixed, costSheet.a7_travel_mode, costSheet.a7_travel_percent]);

  const calcA8_hra = useMemo(() => {
    const pct = safeNum(costSheet.a8_hra_percent);
    return pct ? (calcA2_basicMonthly * pct) / 100 : 0;
  }, [calcA2_basicMonthly, costSheet.a8_hra_percent]);

  const grossMonthlySalary = useMemo(() => {
    // A2..A8
    return (
      calcA2_basicMonthly +
      safeNum(costSheet.a3_specialAllowance) +
      safeNum(costSheet.a4_medicalAllowance) +
      calcA5_washing +
      safeNum(costSheet.a6_foodAllowance) +
      calcA7_travel +
      calcA8_hra
    );
  }, [
    calcA2_basicMonthly,
    calcA5_washing,
    calcA7_travel,
    calcA8_hra,
    costSheet.a3_specialAllowance,
    costSheet.a4_medicalAllowance,
    costSheet.a6_foodAllowance,
  ]);

  const baseFor = (which) => {
    if (which === "gross") return grossMonthlySalary;
    return calcA2_basicMonthly;
  };

  const pctOf = (pct, base) => {
    const p = safeNum(pct);
    return p ? (safeNum(base) * p) / 100 : 0;
  };

  const blockB = useMemo(() => {
    const b1 = pctOf(costSheet.b1_leave_percent, grossMonthlySalary);
    const b2 = pctOf(costSheet.b2_percent, baseFor(costSheet.b2_base));
    const b3 = pctOf(costSheet.b3_percent, baseFor(costSheet.b3_base));
    const b4 = pctOf(costSheet.b4_percent, baseFor(costSheet.b4_base));

    let pf = 0;
    const pfPct = safeNum(costSheet.b5_percent);
    if (costSheet.pfMethod === "b5a") {
      pf = pfPct ? (calcA2_basicMonthly * pfPct) / 100 : 0;
    } else if (costSheet.pfMethod === "b5b") {
      pf = pfPct ? ((calcA2_basicMonthly + safeNum(costSheet.a3_specialAllowance)) * pfPct) / 100 : 0;
    } else {
      // ceiling: ceiling_basic × pct
      const ceiling = safeNum(costSheet.b5_ceiling_basic);
      pf = pfPct && ceiling ? (ceiling * pfPct) / 100 : 0;
    }

    const nhCount = safeNum(costSheet.b6_nationalHoliday_count);
    const b6 = nhCount
      ? costSheet.b6_mode === "gross"
        ? (grossMonthlySalary * nhCount * 2) / 12
        : (safeNum(costSheet.a1_minWagePerDay) * nhCount * 2) / 12
      : 0;

    const phCount = safeNum(costSheet.b7_publicHoliday_count);
    const b7 = phCount ? (safeNum(costSheet.a1_minWagePerDay) * phCount * 2) / 12 : 0;

    const b8 = costSheet.b8_esic_enabled ? pctOf(costSheet.b8_esic_percent, grossMonthlySalary) : 0;
    const b9 = pctOf(costSheet.b9_bonus_percent, calcA2_basicMonthly);
    const b10 = pctOf(costSheet.b10_gratuity_percent, calcA2_basicMonthly);
    const baseForWeekly = grossMonthlySalary + b1 + b2 + b3 + b4 + pf + b6 + b7;
    const b11 = pctOf(costSheet.b11_weeklyOff_percent, baseForWeekly);

    return { b1, b2, b3, b4, pf, b6, b7, b8, b9, b10, b11 };
  }, [
    calcA2_basicMonthly,
    costSheet,
    grossMonthlySalary,
    effectiveDivisor,
  ]);

  const blockC = useMemo(() => {
    // C1: A2 × rate/1000
    const c1 = (safeNum(calcA2_basicMonthly) * safeNum(costSheet.c1_wc_rate_per_1000)) / 1000;
    const c2 = safeNum(costSheet.c2_cgl);
    const c3 = safeNum(costSheet.c3_mediclaim);
    const c4 = safeNum(costSheet.c4_gpa);
    return { c1, c2, c3, c4 };
  }, [calcA2_basicMonthly, costSheet.c1_wc_rate_per_1000, costSheet.c2_cgl, costSheet.c3_mediclaim, costSheet.c4_gpa]);

  const d8Computed = useMemo(() => {
    const sum = d8Items.reduce((s, it) => s + (it.include ? safeNum(it.amount) : 0), 0);
    const hc = safeNum(costSheet.headcountForD8);
    const months = Math.max(1, safeNum(costSheet.monthsForD8) || 12);
    if (!sum || !hc) return 0;
    return sum / hc / months;
  }, [d8Items, costSheet.headcountForD8, costSheet.monthsForD8]);

  const blockD = useMemo(() => {
    const d1 = safeNum(costSheet.d1_labourLicense);
    const d2 = costSheet.d2_migration_enabled ? safeNum(costSheet.d2_migration_amount) : 0;
    const d3 = safeNum(costSheet.d3_uniformPPE);
    const d4 = safeNum(costSheet.d4_lwf);
    const d5 = safeNum(costSheet.d5_accommodation);
    const d6 = safeNum(costSheet.d6_transportation);
    const d7 = safeNum(costSheet.d7_training);
    const d8 = !isBlank(costSheet.d8_otherOperational) ? safeNum(costSheet.d8_otherOperational) : d8Computed;
    return { d1, d2, d3, d4, d5, d6, d7, d8 };
  }, [
    costSheet.d1_labourLicense,
    costSheet.d2_migration_amount,
    costSheet.d2_migration_enabled,
    costSheet.d3_uniformPPE,
    costSheet.d4_lwf,
    costSheet.d5_accommodation,
    costSheet.d6_transportation,
    costSheet.d7_training,
    costSheet.d8_otherOperational,
    d8Computed,
  ]);

  const e1_subtotal = useMemo(() => {
    return (
      // A2..A8
      grossMonthlySalary +
      // B
      Object.values(blockB).reduce((s, v) => s + safeNum(v), 0) +
      // C
      Object.values(blockC).reduce((s, v) => s + safeNum(v), 0) +
      // D
      Object.values(blockD).reduce((s, v) => s + safeNum(v), 0)
    );
  }, [grossMonthlySalary, blockB, blockC, blockD]);

  const e2_serviceCharge = useMemo(() => {
    if (costSheet.e2_service_mode === "percent") return pctOf(costSheet.e2_service_percent, e1_subtotal);
    return safeNum(costSheet.e2_service_fixed);
  }, [costSheet.e2_service_fixed, costSheet.e2_service_mode, costSheet.e2_service_percent, e1_subtotal]);

  const e3_billingRate = useMemo(() => e1_subtotal + e2_serviceCharge, [e1_subtotal, e2_serviceCharge]);
  const e4_headcount_total = useMemo(() => safeNum(costSheet.e4_headcount_total), [costSheet.e4_headcount_total]);
  const e5_totalMonthlyBilling = useMemo(() => (e4_headcount_total ? e3_billingRate * e4_headcount_total : 0), [e3_billingRate, e4_headcount_total]);

  const [formData, setFormData] = useState({
    quotation_number: "",
    subject: "",
    remarks: "",
    amount: "",
    validity: "",
  });

  useEffect(() => {
    const fetchEnquiry = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('manpower_enquiries')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        console.error('Error fetching enquiry:', error);
        setEnquiry(null);
      } else {
        setEnquiry(data);
      }
      setLoading(false);
    };

    if (id) {
      fetchEnquiry();
    }
  }, [id]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!enquiry) return;

    const newQuotation = {
      enquiry_id: enquiry.id,
      enquiry_number: enquiry.enquiry_number,
      client: enquiry.client,
      quotation_number: formData.quotation_number,
      subject: formData.subject,
      remarks: formData.remarks,
      amount: formData.amount,
      validity: formData.validity,
      created_at: new Date().toISOString(),
    };

    // Save final quotation in localStorage for now
    const saved = JSON.parse(localStorage.getItem("manpower_quotations")) || [];
    saved.push(newQuotation);
    localStorage.setItem("manpower_quotations", JSON.stringify(saved));

    // Mark enquiry as quoted (non-blocking)
    supabase
      .from("manpower_enquiries")
      .update({ status: "Quoted" })
      .eq("id", enquiry.id)
      .then(() => {});

    alert("Quotation saved successfully!");
    navigate("/app/manpower/quotation"); // go to quotation page
  };

  const wageTotalsPerRole = useMemo(() => {
    const totals = {};
    ROLE_COLUMNS.forEach((r) => {
      totals[r.key] = wageRows.reduce((sum, row) => sum + safeNum(row?.values?.[r.key]), 0);
    });
    return totals;
  }, [wageRows]);

  const hasAnyWageInput = useMemo(() => {
    return (wageRows || []).some((row) =>
      ROLE_COLUMNS.some((c) => String(row?.values?.[c.key] ?? "").trim() !== "")
    );
  }, [wageRows]);

  const summaryRows = useMemo(() => {
    const lines = ROLE_COLUMNS.map((role) => {
      const qty = safeNum(wageSummary.qty?.[role.key]);
      const wagePm = safeNum(wageTotalsPerRole[role.key]) * 30.42; // same convention used in screenshot (approx days/month)
      const amount = qty * wagePm;
      return { role, qty, wagePm, amount };
    });
    const basicAmountPerMonth = lines.reduce((s, l) => s + safeNum(l.amount), 0);
    const gstAmount = (basicAmountPerMonth * safeNum(wageSummary.gstPercent)) / 100;
    const totalPerMonth = basicAmountPerMonth + gstAmount;
    const years = Math.max(0, safeNum(wageSummary.contractYears));
    const basicContract = totalPerMonth * 12 * years;
    return {
      lines,
      basicAmountPerMonth,
      gstAmount,
      totalPerMonth,
      basicContract,
    };
  }, [wageTotalsPerRole, wageSummary]);

  const updateWageValue = (rowId, roleKey, next) => {
    setWageRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return { ...r, values: { ...(r.values || {}), [roleKey]: next } };
      })
    );
  };

  const updateWageComponentName = (rowId, nextName) => {
    setWageRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, component: nextName } : r)));
  };

  const addWageRow = () => {
    const maxSl = Math.max(0, ...(wageRows || []).map((r) => safeNum(r.slNo)));
    const idBase = `custom_${Date.now()}`;
    setWageRows((prev) => [
      ...(prev || []),
      {
        id: idBase,
        slNo: maxSl + 1,
        component: "New Component",
        rateType: "Fixed",
        locked: false,
        isCustom: true,
        values: ROLE_COLUMNS.reduce((acc, r) => ({ ...acc, [r.key]: 0 }), {}),
      },
    ]);
  };

  const deleteWageRow = (rowId) => {
    setWageRows((prev) => (prev || []).filter((r) => r.id !== rowId));
  };

  if (loading) {
    return <p className="text-center text-gray-500">Loading enquiry...</p>;
  }

  if (!enquiry) {
    return (
      <p className="text-center text-red-600">
        Enquiry not found or not approved!
      </p>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">
        Internal Quotation - {enquiry.enquiry_number}
      </h2>

      {/* Client Info */}
      <div className="bg-white p-6 shadow rounded-lg mb-6">
        <h3 className="font-semibold mb-2">Client Details</h3>
        <p><strong>Client:</strong> {enquiry.client}</p>
        <p><strong>Email:</strong> {enquiry.email}</p>
        <p><strong>Phone:</strong> {enquiry.phone}</p>
        <p>
          <strong>Address:</strong> {enquiry.street}, {enquiry.city},{" "}
          {enquiry.state}, {enquiry.country}
        </p>
      </div>
      {/* Bottom Demo Data Tabs */}
      <div className="mt-6 bg-white shadow rounded-lg">
        <div className="border-b px-4 py-3 flex flex-wrap gap-2">
          {[
            { key: 'operational', label: 'Minimum Wage' },
            { key: 'cost', label: 'Cost Breakup' },
            { key: 'manpower', label: 'Manpower' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium border ${activeTab === tab.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-300'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {activeTab === 'manpower' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-lg font-semibold">Manpower</h4>
                  <p className="text-xs text-gray-500 mt-1">UI only: select skill level and enter manpower quantity per category.</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                <table className="w-full table-fixed text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-700 w-[64px]">Sr No.</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Manpower Category</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-700 w-[240px]">Sub Category</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-slate-700 w-[160px]">No. of Manpower</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-700 w-[76px]">Act</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {manpowerRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 text-slate-700">{row.srNo}</td>
                        <td className="px-3 py-2.5">
                          {row.isCustom ? (
                            <input
                              value={row.category}
                              onChange={(e) =>
                                setManpowerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, category: e.target.value } : r)))
                              }
                              placeholder="Enter category"
                              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          ) : (
                            <span className="block truncate" title={row.category}>
                              {row.category}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <select
                            value={row.skill}
                            onChange={(e) =>
                              setManpowerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, skill: e.target.value } : r)))
                            }
                            className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          >
                            <option value="">Select</option>
                            {SKILL_LEVELS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            value={row.qty}
                            onChange={(e) =>
                              setManpowerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, qty: e.target.value } : r)))
                            }
                            className="w-full text-center px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            placeholder=""
                            min="0"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {row.isCustom ? (
                            <button
                              type="button"
                              onClick={() => deleteManpowerRow(row.id)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              aria-label="Delete row"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td
                        colSpan={5}
                        onClick={addManpowerRow}
                        className="px-3 py-3 text-purple-700 cursor-pointer hover:bg-purple-50/50 font-medium"
                      >
                        + Add a line
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'cost' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-lg font-semibold">Cost Breakup</h4>
                  <p className="text-xs text-gray-500 mt-1">UI only: enter values and see the calculated totals. Backend rules can be wired later.</p>
                </div>
              </div>

              {/* Main Cost Breakup Table */}
              <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                <table className="w-full table-fixed text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-700 w-[54px]">Sr</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-700 w-[64px]">Ref</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Component</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-700 w-[240px]">Logic</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-700 w-[210px]">Value / Amount</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-700 w-[160px]">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Block A */}
                    <tr className="bg-white">
                      <td colSpan={6} className="px-3 py-2 text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                        Block A — Salary Components
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">1</td>
                      <td className="px-3 py-2.5">A1</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900 truncate" title="Min Wages Per Day WEF ______">
                          Min Wages Per Day (WEF)
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate" title="Root input — entered manually; linked to state min-wage master + WEF date">
                          Root input (manual)
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 truncate" title="Entered manually; used as base for A2 and holiday calculations">
                        Manual entry
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-2 items-end">
                          <div className="flex gap-2 w-full justify-end">
                            <input
                              value={costSheet.a1_minWagePerDay}
                              onChange={(e) => setCostSheet((p) => ({ ...p, a1_minWagePerDay: e.target.value }))}
                              inputMode="decimal"
                              placeholder="Min wage / day"
                              className="w-[120px] text-right px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                            <input
                              value={costSheet.a1_wef}
                              onChange={(e) => setCostSheet((p) => ({ ...p, a1_wef: e.target.value }))}
                              placeholder="WEF"
                              className="w-[84px] text-right px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              title="WEF date (text)"
                            />
                          </div>
                          <div className="text-[11px] text-slate-500">
                            A2 uses divisor: <span className="font-semibold">{effectiveDivisor ? effectiveDivisor : "—"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">Mandatory</td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">2</td>
                      <td className="px-3 py-2.5">A2</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900 truncate" title="Average Basic Salary (26–27 days)">
                          Average Basic Salary (monthly)
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate" title="Auto-calculated from A1 and divisor">
                          Auto: A1 × divisor
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 truncate" title="A1 × divisor (26 / 26.5 / 27 / 30 / 31)">
                        A1 × {effectiveDivisor || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{moneyOrBlank(calcA2_basicMonthly)}</td>
                      <td className="px-3 py-2.5 text-slate-500">Mandatory</td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">3</td>
                      <td className="px-3 py-2.5">A3</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900 truncate" title="Other / Special Allowances">
                          Other / Special Allowances
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate" title="Fixed amount per person per month">
                          Manual fixed amount
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 truncate" title="Fixed amount per person per month">
                        Fixed (₹/pm)
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          value={costSheet.a3_specialAllowance}
                          onChange={(e) => setCostSheet((p) => ({ ...p, a3_specialAllowance: e.target.value }))}
                          placeholder=""
                          className="w-full text-right px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">Conditional</td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">4</td>
                      <td className="px-3 py-2.5">A4</td>
                      <td className="px-3 py-2.5 truncate" title="Medical Allowances">
                        Medical Allowances
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 truncate">Fixed (₹/pm)</td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          value={costSheet.a4_medicalAllowance}
                          onChange={(e) => setCostSheet((p) => ({ ...p, a4_medicalAllowance: e.target.value }))}
                          className="w-full text-right px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">Conditional</td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">5</td>
                      <td className="px-3 py-2.5">A5</td>
                      <td className="px-3 py-2.5 truncate" title="Washing Allowance">
                        Washing Allowance
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={costSheet.a5_washing_mode}
                            onChange={(e) => setCostSheet((p) => ({ ...p, a5_washing_mode: e.target.value }))}
                            className="px-2 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                          >
                            <option value="percent">% of Basic</option>
                            <option value="fixed">Fixed</option>
                          </select>
                          {costSheet.a5_washing_mode === "percent" ? (
                            <input
                              value={costSheet.a5_washing_percent}
                              onChange={(e) => setCostSheet((p) => ({ ...p, a5_washing_percent: e.target.value }))}
                              placeholder="%"
                              className="w-20 px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                            />
                          ) : (
                            <input
                              value={costSheet.a5_washing_fixed}
                              onChange={(e) => setCostSheet((p) => ({ ...p, a5_washing_fixed: e.target.value }))}
                              placeholder="₹"
                              className="w-24 px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{moneyOrBlank(calcA5_washing)}</td>
                      <td className="px-3 py-2.5 text-slate-500">Usually 20%</td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">6</td>
                      <td className="px-3 py-2.5">A6</td>
                      <td className="px-3 py-2.5 truncate" title="Food Allowances">Food Allowances</td>
                      <td className="px-3 py-2.5 text-slate-600 truncate">Fixed (₹/pm)</td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          value={costSheet.a6_foodAllowance}
                          onChange={(e) => setCostSheet((p) => ({ ...p, a6_foodAllowance: e.target.value }))}
                          className="w-full text-right px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">Conditional</td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">7</td>
                      <td className="px-3 py-2.5">A7</td>
                      <td className="px-3 py-2.5 truncate" title="Travel / Transportation Allowances">Travel / Transportation Allowances</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={costSheet.a7_travel_mode}
                            onChange={(e) => setCostSheet((p) => ({ ...p, a7_travel_mode: e.target.value }))}
                            className="px-2 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                          >
                            <option value="percent">% of Basic</option>
                            <option value="fixed">Fixed</option>
                          </select>
                          {costSheet.a7_travel_mode === "percent" ? (
                            <input
                              value={costSheet.a7_travel_percent}
                              onChange={(e) => setCostSheet((p) => ({ ...p, a7_travel_percent: e.target.value }))}
                              placeholder="%"
                              className="w-20 px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                            />
                          ) : (
                            <input
                              value={costSheet.a7_travel_fixed}
                              onChange={(e) => setCostSheet((p) => ({ ...p, a7_travel_fixed: e.target.value }))}
                              placeholder="₹"
                              className="w-24 px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{moneyOrBlank(calcA7_travel)}</td>
                      <td className="px-3 py-2.5 text-slate-500">Usually 20%</td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">8</td>
                      <td className="px-3 py-2.5">A8</td>
                      <td className="px-3 py-2.5 truncate" title="HRA @ __% of Basic">HRA @ % of Basic</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <input
                            value={costSheet.a8_hra_percent}
                            onChange={(e) => setCostSheet((p) => ({ ...p, a8_hra_percent: e.target.value }))}
                            placeholder="%"
                            className="w-20 px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                          />
                          <span className="text-xs text-slate-500 truncate" title="Typically 60% of Basic">Typically 60%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{moneyOrBlank(calcA8_hra)}</td>
                      <td className="px-3 py-2.5 text-slate-500">Mandatory</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td colSpan={4} className="px-3 py-2.5 text-right font-semibold text-slate-900">
                        GROSS MONTHLY SALARY (A2–A8)
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{moneyOrBlank(grossMonthlySalary)}</td>
                      <td className="px-3 py-2.5" />
                    </tr>

                    {/* Block B */}
                    <tr className="bg-white">
                      <td colSpan={6} className="px-3 py-2 text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                        Block B — Fixed Statutory Compliances
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">9</td>
                      <td className="px-3 py-2.5">B1</td>
                      <td className="px-3 py-2.5 truncate" title="Paid Leave / Leave With Wages">Paid Leave / Leave With Wages</td>
                      <td className="px-3 py-2.5">
                        <input
                          value={costSheet.b1_leave_percent}
                          onChange={(e) => setCostSheet((p) => ({ ...p, b1_leave_percent: e.target.value }))}
                          placeholder="% on Gross"
                          className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{moneyOrBlank(blockB.b1)}</td>
                      <td className="px-3 py-2.5 text-slate-500">Editable %</td>
                    </tr>

                    {/* Block C */}
                    <tr className="bg-white">
                      <td colSpan={6} className="px-3 py-2 text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                        Block C — Insurance Components
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">20</td>
                      <td className="px-3 py-2.5">C1</td>
                      <td className="px-3 py-2.5 truncate" title="WC (Workmen's Compensation) Policy">WC (Workmen's Compensation) Policy</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 truncate" title="A2 × rate/1000">A2 ×</span>
                          <input
                            value={costSheet.c1_wc_rate_per_1000}
                            onChange={(e) => setCostSheet((p) => ({ ...p, c1_wc_rate_per_1000: e.target.value }))}
                            placeholder="rate/1000"
                            className="w-24 px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{moneyOrBlank(blockC.c1)}</td>
                      <td className="px-3 py-2.5 text-slate-500">Admin rate</td>
                    </tr>

                    {/* Block D */}
                    <tr className="bg-white">
                      <td colSpan={6} className="px-3 py-2 text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                        Block D — Operational & Compliance Costs
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">31</td>
                      <td className="px-3 py-2.5">D8</td>
                      <td className="px-3 py-2.5 truncate" title="Other Operational Cost & Staff Welfare">Other Operational Cost & Staff Welfare</td>
                      <td className="px-3 py-2.5 text-slate-600 truncate" title="Sum of sub-sheet items ÷ headcount ÷ months">
                        From sub-sheet
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{moneyOrBlank(blockD.d8)}</td>
                      <td className="px-3 py-2.5 text-slate-500">Auto</td>
                    </tr>

                    {/* Block E */}
                    <tr className="bg-white">
                      <td colSpan={6} className="px-3 py-2 text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                        Block E — Service Charge & Outputs
                      </td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-3 py-2.5">32</td>
                      <td className="px-3 py-2.5">E1</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">Gross Salary + Other Liability (Sub-total)</td>
                      <td className="px-3 py-2.5 text-slate-600 truncate">Sum of A2 to D8</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{moneyOrBlank(e1_subtotal)}</td>
                      <td className="px-3 py-2.5" />
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">33</td>
                      <td className="px-3 py-2.5">E2</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">Service Charge</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={costSheet.e2_service_mode}
                            onChange={(e) => setCostSheet((p) => ({ ...p, e2_service_mode: e.target.value }))}
                            className="px-2 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                          >
                            <option value="fixed">Fixed</option>
                            <option value="percent">% of E1</option>
                          </select>
                          {costSheet.e2_service_mode === "fixed" ? (
                            <input
                              value={costSheet.e2_service_fixed}
                              onChange={(e) => setCostSheet((p) => ({ ...p, e2_service_fixed: e.target.value }))}
                              placeholder="₹"
                              className="w-28 px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                            />
                          ) : (
                            <input
                              value={costSheet.e2_service_percent}
                              onChange={(e) => setCostSheet((p) => ({ ...p, e2_service_percent: e.target.value }))}
                              placeholder="%"
                              className="w-20 px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{moneyOrBlank(e2_serviceCharge)}</td>
                      <td className="px-3 py-2.5 text-slate-500">Configurable</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-3 py-2.5">34</td>
                      <td className="px-3 py-2.5">E3</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">Billing Rate for selected divisor / duty</td>
                      <td className="px-3 py-2.5 text-slate-600 truncate">E1 + E2</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{moneyOrBlank(e3_billingRate)}</td>
                      <td className="px-3 py-2.5" />
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">35</td>
                      <td className="px-3 py-2.5">E5</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">Total Monthly Billing Value</td>
                      <td className="px-3 py-2.5 text-slate-600 truncate">E3 × Headcount</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{moneyOrBlank(e5_totalMonthlyBilling)}</td>
                      <td className="px-3 py-2.5 text-slate-500">Auto</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* D8 Sub-sheet */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="font-semibold text-slate-900">Bifurcation of Operational Cost (D8)</div>
                  <div className="text-xs text-slate-600">Include items, enter monthly amount, auto-feeds D8.</div>
                </div>
                <div className="p-3">
                  <table className="w-full table-fixed text-xs sm:text-sm">
                    <thead className="bg-white border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-700 w-[54px]">#</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Operational Cost Item</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-slate-700 w-[90px]">Include</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-700 w-[160px]">Amount / month</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {d8Items.map((it, idx) => (
                        <tr key={it.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 text-slate-700">{idx + 1}</td>
                          <td className="px-3 py-2.5">
                            <span className="block truncate" title={D8_ITEM_LABELS[idx] || `Item ${idx + 1}`}>
                              {D8_ITEM_LABELS[idx] || `Item ${idx + 1}`}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(it.include)}
                              onChange={(e) =>
                                setD8Items((prev) =>
                                  prev.map((x) => (x.id === it.id ? { ...x, include: e.target.checked } : x))
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              value={it.amount}
                              onChange={(e) =>
                                setD8Items((prev) => prev.map((x) => (x.id === it.id ? { ...x, amount: e.target.value } : x)))
                              }
                              placeholder="₹"
                              className="w-full text-right px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              disabled={!it.include}
                            />
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50">
                        <td colSpan={3} className="px-3 py-2.5 text-right font-semibold text-slate-900">
                          Included Total (₹/month)
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                          {moneyOrBlank(d8Items.reduce((s, it) => s + (it.include ? safeNum(it.amount) : 0), 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'operational' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <div>
                  <h4 className="text-lg font-semibold">Minimum Wage</h4>
                  <p className="text-xs text-gray-500 mt-1">UI only: edit values, add/remove components, and see totals update below.</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl bg-white">
                <table className="w-full table-fixed text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-2 sm:px-3 py-2.5 text-left font-semibold text-slate-700 w-[56px]">Sl</th>
                      <th className="px-2 sm:px-3 py-2.5 text-left font-semibold text-slate-700 w-[240px]">Rate of daily wages</th>
                      {ROLE_COLUMNS.map((c) => (
                        <th
                          key={c.key}
                          className="px-2 sm:px-3 py-2.5 text-left font-semibold text-slate-700 whitespace-normal leading-4"
                          style={{ width: "140px" }}
                        >
                          <span title={c.label} className="block line-clamp-2">
                            {c.label}
                          </span>
                        </th>
                      ))}
                      <th className="px-2 sm:px-3 py-2.5 text-right font-semibold text-slate-700 w-[72px]">Act</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {wageRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/50">
                        <td className="px-2 sm:px-3 py-2 text-slate-700">{row.slNo}</td>
                        <td className="px-2 sm:px-3 py-2">
                          {row.isCustom ? (
                            <input
                              value={row.component}
                              onChange={(e) => updateWageComponentName(row.id, e.target.value)}
                              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          ) : (
                            <div className="min-w-0">
                              <div title={row.component} className="font-medium text-slate-900 truncate">
                                {row.component}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={`Type: ${row.rateType}`}>
                                Type: {row.rateType}
                              </div>
                            </div>
                          )}
                        </td>
                        {ROLE_COLUMNS.map((c) => (
                          <td key={c.key} className="px-2 sm:px-3 py-2">
                            <input
                              type="number"
                              value={row.values?.[c.key] ?? ""}
                              onChange={(e) => updateWageValue(row.id, c.key, e.target.value)}
                              className={`w-full px-2.5 py-2 border rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                                row.locked ? "bg-amber-50 border-amber-200 text-slate-800" : "bg-white border-slate-300"
                              }`}
                            />
                          </td>
                        ))}
                        <td className="px-2 sm:px-3 py-2 text-right">
                          {row.isCustom ? (
                            <button
                              type="button"
                              onClick={() => deleteWageRow(row.id)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              aria-label="Delete row"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td
                        colSpan={ROLE_COLUMNS.length + 3}
                        onClick={addWageRow}
                        className="px-2 sm:px-3 py-3 text-purple-700 cursor-pointer hover:bg-purple-50/50 font-medium"
                      >
                        + Add a line
                      </td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td colSpan={2} className="px-2 sm:px-3 py-3 font-semibold text-slate-900">
                        Net Total (per day)
                      </td>
                      {ROLE_COLUMNS.map((c) => (
                        <td key={c.key} className="px-2 sm:px-3 py-3 font-semibold text-slate-900">
                          {hasAnyWageInput ? formatINR(wageTotalsPerRole[c.key]) : ""}
                        </td>
                      ))}
                      <td className="px-2 sm:px-3 py-3" />
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="font-semibold text-slate-900">Summary (Monthly)</div>
                  <div className="flex items-center gap-3 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <span className="text-slate-600">GST %</span>
                      <input
                        type="number"
                        value={wageSummary.gstPercent}
                        onChange={(e) => setWageSummary((p) => ({ ...p, gstPercent: e.target.value }))}
                        className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <span className="text-slate-600">Contract (Years)</span>
                      <input
                        type="number"
                        value={wageSummary.contractYears}
                        onChange={(e) => setWageSummary((p) => ({ ...p, contractYears: e.target.value }))}
                        className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <table className="w-full table-fixed text-xs sm:text-sm">
                    <thead className="bg-white border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-700 w-[56px]">Sl</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Description</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-slate-700 w-[70px]">UOM</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-slate-700 w-[90px]">Qty</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-700 w-[130px]">Wage/pm</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-700 w-[150px]">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summaryRows.lines.map((l, idx) => (
                        <tr key={l.role.key} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 text-slate-700">{idx + 1}</td>
                          <td className="px-3 py-2.5 text-slate-900 font-medium">
                            <span className="block truncate" title={l.role.label}>
                              {l.role.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-700">no</td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              value={wageSummary.qty?.[l.role.key] ?? ""}
                              onChange={(e) =>
                                setWageSummary((p) => ({
                                  ...p,
                                  qty: { ...(p.qty || {}), [l.role.key]: e.target.value },
                                }))
                              }
                              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent text-center"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-700">{l.wagePm ? `₹${formatINR(l.wagePm)}` : ""}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{l.amount ? `₹${formatINR(l.amount)}` : ""}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-3 py-2.5 text-right font-semibold text-slate-900">
                          Basic Amount per Month (Rs.)
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                          {summaryRows.basicAmountPerMonth ? `₹${formatINR(summaryRows.basicAmountPerMonth)}` : ""}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="px-3 py-2.5 text-right font-semibold text-slate-700">
                          GST @ {safeNum(wageSummary.gstPercent)}%
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{summaryRows.gstAmount ? `₹${formatINR(summaryRows.gstAmount)}` : ""}</td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-3 py-2.5 text-right font-semibold text-slate-900">
                          Total Amount per Month (Rs.)
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{summaryRows.totalPerMonth ? `₹${formatINR(summaryRows.totalPerMonth)}` : ""}</td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="px-3 py-2.5 text-right font-semibold text-slate-700">
                          Basic Amount for the contract period - {safeNum(wageSummary.contractYears)} years (Rs.)
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{summaryRows.basicContract ? `₹${formatINR(summaryRows.basicContract)}` : ""}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InternalQuotationForm;
