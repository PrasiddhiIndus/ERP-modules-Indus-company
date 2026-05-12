// src/pages/Manpower/InternalQuotationForm.jsx
import React, { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";

import { supabase } from "../../../lib/supabase";
import minWageFlowConfig from "../../../config/manpowerMinWageFlow.json";

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
const PRICE_MASTER_STORAGE_KEY = "manpower_min_wage_price_master_v1";
const META_PREFIX = "__META__:";
const SERVICE_CATEGORY_LABEL_TO_ID = {
  "Firefighting Manpower Only": 1,
  "Safety Manpower Only": 2,
  "Manpower + Fire Tender": 3,
  "Firefighting Manpower + Safety Manpower": 4,
  "Fire Tender (without Crew)": 5,
};
const SERVICE_CATEGORY_ID_TO_LABEL = {
  1: "Firefighting Manpower Only",
  2: "Safety Manpower Only",
  3: "Manpower + Fire Tender",
  4: "Firefighting Manpower + Safety Manpower",
  5: "Fire Tender (without Crew)",
};
const BCS_COMPONENTS = [
  { block: "A", ref: "A1", name: "Min Wages Per Day (WEF)", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "A", ref: "A2", name: "Average Basic Salary (monthly)", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "A", ref: "A3", name: "Special / Retention Allowance", cats: ["conditional", "conditional", "conditional", "conditional", "hidden"] },
  { block: "A", ref: "A4", name: "Food Allowance", cats: ["conditional", "conditional", "conditional", "conditional", "hidden"] },
  { block: "A", ref: "A5", name: "Washing Allowance", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "A", ref: "A6", name: "Medical Allowance", cats: ["conditional", "conditional", "conditional", "conditional", "hidden"] },
  { block: "A", ref: "A7", name: "Travel / Transportation Allowance", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "A", ref: "A8", name: "HRA (House Rent Allowance)", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "A", ref: "GMS", name: "Gross Monthly Salary", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "B", ref: "B1", name: "Paid Leave / Leave Wages", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "B", ref: "B2", name: "Weekly Off Relievers", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "B", ref: "B3", name: "Retention Allowance for Extra 4 Hours", cats: ["conditional", "conditional", "conditional", "conditional", "hidden"] },
  { block: "B", ref: "B4", name: "PF Employer Contribution", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "B", ref: "B5", name: "ESIC / WC Policy", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "B", ref: "B6", name: "National Holidays", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "B", ref: "B7", name: "Public / Festival Holidays", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "B", ref: "B8", name: "Bonus (Statutory)", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "B", ref: "B9", name: "Gratuity", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "B", ref: "B10", name: "OT Expenses / Penalty / Bonus Interest", cats: ["conditional", "conditional", "conditional", "conditional", "hidden"] },
  { block: "C", ref: "C1", name: "Labour License & Compliance Expense", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "C", ref: "C2", name: "Labour Welfare Fund", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "C", ref: "C3", name: "Inter-State Migration License", cats: ["conditional", "conditional", "conditional", "conditional", "hidden"] },
  { block: "D", ref: "D1", name: "Uniform (Khaki + IFR Suits) / Liveries", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "D", ref: "D2", name: "PPEs (Fire Suits, Safety Shoes, Helmets, Gum Boots)", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "D", ref: "D3", name: "Group Mediclaim / Health Insurance", cats: ["conditional", "conditional", "conditional", "conditional", "hidden"] },
  { block: "D", ref: "D4", name: "Refresher Training", cats: ["conditional", "hidden", "conditional", "conditional", "hidden"] },
  { block: "D", ref: "D5", name: "Accommodation", cats: ["conditional", "conditional", "conditional", "conditional", "hidden"] },
  { block: "D", ref: "D6", name: "Transportation / Logistics", cats: ["conditional", "conditional", "conditional", "conditional", "hidden"] },
  { block: "D", ref: "D7", name: "Fire Tender Rental (with Crew)", cats: ["hidden", "hidden", "always", "hidden", "hidden"] },
  { block: "D", ref: "D8", name: "Fire Tender / Fire Jeep Rental (without Crew)", cats: ["hidden", "hidden", "hidden", "hidden", "always"] },
  { block: "D", ref: "D9", name: "Fuel for Fire Tender", cats: ["hidden", "hidden", "conditional", "hidden", "conditional"] },
  { block: "D", ref: "D10", name: "Administration & Operations Cost (sub-sheet)", cats: ["always", "always", "always", "always", "conditional"] },
  { block: "E", ref: "E1", name: "Sub-Total (Gross Salary + Other Liability)", cats: ["always", "always", "always", "always", "always"] },
  { block: "E", ref: "E2", name: "Service Charge of Agency", cats: ["always", "always", "always", "always", "always"] },
  { block: "E", ref: "E3", name: "Billing Rate (per person / per day based on divisor)", cats: ["always", "always", "always", "always", "always"] },
  { block: "E", ref: "E4", name: "Deployment of Manpower (headcount)", cats: ["always", "always", "always", "always", "hidden"] },
  { block: "E", ref: "E5", name: "Total Billing for selected days (E3 × headcount × days)", cats: ["always", "always", "always", "always", "conditional"] },
  { block: "E", ref: "E6", name: "Total Service Charge", cats: ["always", "always", "always", "always", "always"] },
];
const BLOCK_TITLES = {
  A: "Block A - Salary components",
  B: "Block B - Statutory compliances",
  C: "Block C - Compliance costs",
  D: "Block D - Operational & equipment costs",
  E: "Block E - Service charge & outputs",
};

function parseMetaAuthorization(raw) {
  if (!raw || typeof raw !== "string") return {};
  if (raw.startsWith(META_PREFIX)) {
    try {
      return JSON.parse(raw.slice(META_PREFIX.length)) || {};
    } catch {
      return {};
    }
  }
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function joinAddressParts(parts) {
  const text = (parts || []).map((part) => String(part || "").trim()).filter(Boolean);
  return text.length ? text.join(", ") : "—";
}

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

const InternalQuotationForm = ({
  quotationStorageKey = "manpower_quotations",
  listPath = "/app/manpower/quotation",
  NavbarComponent = null,
} = {}) => {
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
  const [particularRateMatrix, setParticularRateMatrix] = useState({});
  const [serviceCategoryId, setServiceCategoryId] = useState(1);
  const [manualParticularRefs, setManualParticularRefs] = useState([]);
  const [deletedParticularRefs, setDeletedParticularRefs] = useState([]);
  const [blockPickerValue, setBlockPickerValue] = useState({ A: "", B: "", C: "", D: "", E: "" });

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

  const selectedManpowerColumns = useMemo(() => {
    return (manpowerRows || []).filter(
      (row) => String(row.category || "").trim() !== "" && String(row.skill || "").trim() !== ""
    );
  }, [manpowerRows]);
  const visibleBcsRows = useMemo(() => {
    const idx = Math.max(0, Math.min(4, Number(serviceCategoryId || 1) - 1));
    return BCS_COMPONENTS.filter((item) => {
      const flag = item.cats?.[idx] || "hidden";
      return flag !== "hidden";
    });
  }, [serviceCategoryId]);
  const bcsByBlock = useMemo(() => {
    const idx = Math.max(0, Math.min(4, Number(serviceCategoryId || 1) - 1));
    return ["A", "B", "C", "D", "E"].map((block) => {
      const allRows = BCS_COMPONENTS.filter((row) => row.block === block);
      const autoRows = allRows.filter((row) => {
        const flag = row.cats?.[idx] || "hidden";
        return flag !== "hidden";
      });
      const hiddenRows = allRows.filter((row) => {
        const flag = row.cats?.[idx] || "hidden";
        return flag === "hidden";
      });
      const manuallyAddedRows = allRows.filter((row) => manualParticularRefs.includes(row.ref));
      const currentRefs = new Set([...autoRows.map((r) => r.ref), ...manuallyAddedRows.map((r) => r.ref)]);
      const pickerRows = allRows.filter((row) => !currentRefs.has(row.ref) || deletedParticularRefs.includes(row.ref));
      const manualRows = manuallyAddedRows.filter((row) => !deletedParticularRefs.includes(row.ref));
      const autoRefs = new Set(autoRows.map((r) => r.ref));
      const rows = [
        ...autoRows.filter((row) => !deletedParticularRefs.includes(row.ref)),
        ...manualRows.filter((r) => !autoRefs.has(r.ref)),
      ];
      return {
        block,
        title: BLOCK_TITLES[block],
        rows,
        hiddenRows: pickerRows,
      };
    });
  }, [serviceCategoryId, manualParticularRefs, deletedParticularRefs]);

  const visibleBreakupRows = useMemo(
    () => bcsByBlock.flatMap((blockGroup) => blockGroup.rows),
    [bcsByBlock]
  );

  const breakupColumnTotals = useMemo(() => {
    const totals = selectedManpowerColumns.reduce((acc, col) => ({ ...acc, [col.id]: 0 }), {});
    let overall = 0;

    visibleBreakupRows.forEach((row) => {
      selectedManpowerColumns.forEach((col) => {
        const amount = safeNum(particularRateMatrix[`${row.ref}__${col.id}`]);
        totals[col.id] = safeNum(totals[col.id]) + amount;
        overall += amount;
      });
    });

    return { columns: totals, overall };
  }, [particularRateMatrix, selectedManpowerColumns, visibleBreakupRows]);

  const addParticularRow = (block, selectedRef) => {
    if (!selectedRef) return;
    setDeletedParticularRefs((prev) => (prev || []).filter((ref) => ref !== selectedRef));
    setManualParticularRefs((prev) => (prev.includes(selectedRef) ? prev : [...prev, selectedRef]));
    setBlockPickerValue((prev) => ({ ...prev, [block]: "" }));
  };

  const deleteParticularRow = (ref) => {
    setDeletedParticularRefs((prev) => (prev.includes(ref) ? prev : [...prev, ref]));
    setManualParticularRefs((prev) => (prev || []).filter((item) => item !== ref));
    setParticularRateMatrix((prev) => {
      const next = { ...(prev || {}) };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${ref}__`)) {
          delete next[key];
        }
      });
      return next;
    });
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
        const meta = parseMetaAuthorization(data?.authorization_to);
        const selectedLabels = Array.isArray(meta?.serviceCategory)
          ? meta.serviceCategory
          : meta?.serviceCategory
            ? [meta.serviceCategory]
            : [];
        const mappedIds = selectedLabels
          .map((label) => SERVICE_CATEGORY_LABEL_TO_ID[label])
          .filter((v) => Number.isFinite(v));
        setServiceCategoryId(mappedIds.length ? mappedIds[0] : 1);
        setManualParticularRefs([]);
        setDeletedParticularRefs([]);
        setBlockPickerValue({ A: "", B: "", C: "", D: "", E: "" });
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
    const saved = JSON.parse(localStorage.getItem(quotationStorageKey)) || [];
    saved.push(newQuotation);
    localStorage.setItem(quotationStorageKey, JSON.stringify(saved));

    // Mark enquiry as quoted (non-blocking)
    supabase
      .from("manpower_enquiries")
      .update({ status: "Quoted" })
      .eq("id", enquiry.id)
      .then(() => {});

    alert("Quotation saved successfully!");
    navigate(listPath); // go to quotation page
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

  const [wageSelection, setWageSelection] = useState({
    jurisdictionId: "state_government",
    stateCode: "MH",
    zoneCode: "ZONE_1",
  });

  const minWageEntryEnabled = true;

  const jurisdictionOptions = minWageFlowConfig?.jurisdictions || [];
  const selectedJurisdiction = useMemo(
    () => jurisdictionOptions.find((item) => item.id === wageSelection.jurisdictionId) || jurisdictionOptions[0],
    [jurisdictionOptions, wageSelection.jurisdictionId]
  );
  const stateOptions = selectedJurisdiction?.states || [];
  const selectedState = useMemo(
    () => stateOptions.find((item) => item.code === wageSelection.stateCode) || stateOptions[0],
    [stateOptions, wageSelection.stateCode]
  );
  const zoneOptions = selectedState?.zones || [];

  const flowPreviewPayload = useMemo(
    () => ({
      module: "manpower-price-master",
      tab: "minimum-wage",
      flow: "jurisdiction-state-zone",
      selection: {
        jurisdictionId: selectedJurisdiction?.id || "",
        jurisdictionLabel: selectedJurisdiction?.label || "",
        stateCode: selectedState?.code || "",
        stateName: selectedState?.name || "",
        zoneCode: wageSelection.zoneCode,
        zoneName: zoneOptions.find((z) => z.code === wageSelection.zoneCode)?.name || "",
      },
      minWageWindow: {
        activeMonths: [],
        currentMonth: null,
        entryEnabled: minWageEntryEnabled,
      },
      note: "Frontend JSON mapped in internal quotation. No backend API hit in this step."
    }),
    [selectedJurisdiction, selectedState, wageSelection.zoneCode, zoneOptions, minWageEntryEnabled]
  );

  useEffect(() => {
    if (!selectedJurisdiction?.id) return;
    setWageSelection((prev) => {
      const nextStateCode = (selectedJurisdiction.states || [])[0]?.code || "";
      const nextZoneCode = (selectedJurisdiction.states || [])[0]?.zones?.[0]?.code || "";
      return { ...prev, stateCode: nextStateCode, zoneCode: nextZoneCode };
    });
  }, [selectedJurisdiction?.id]);

  useEffect(() => {
    if (!selectedState?.code) return;
    setWageSelection((prev) => {
      const hasSelectedZone = (selectedState.zones || []).some((z) => z.code === prev.zoneCode);
      if (hasSelectedZone) return prev;
      const nextZoneCode = (selectedState.zones || [])[0]?.code || "";
      return { ...prev, zoneCode: nextZoneCode };
    });
  }, [selectedState?.code]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(PRICE_MASTER_STORAGE_KEY) || "[]");
      const found = (stored || []).find(
        (entry) =>
          entry?.jurisdictionId === wageSelection.jurisdictionId &&
          entry?.stateCode === wageSelection.stateCode &&
          entry?.zoneCode === wageSelection.zoneCode
      );
      if (!found?.minWages) {
        return;
      }

      setWageRows((prev) =>
        (prev || []).map((row) => {
          if (row.id !== "basic") return row;
          return {
            ...row,
            values: {
              ...(row.values || {}),
              sr_fire_supervisor: found.minWages.sr_fire_supervisor ?? "",
              fire_supervisor: found.minWages.fire_supervisor ?? "",
              dcpo: found.minWages.dcpo ?? "",
              fireman_l1: found.minWages.fireman_l1 ?? "",
              fireman_l2: found.minWages.fireman_l2 ?? "",
            },
          };
        })
      );
    } catch {}
  }, [wageSelection.jurisdictionId, wageSelection.stateCode, wageSelection.zoneCode]);

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

  const enquiryMeta = parseMetaAuthorization(enquiry.authorization_to);
  const plantName = enquiryMeta.siteName || enquiry.client || "—";
  const plantAddress = joinAddressParts([
    enquiryMeta.siteStreet1 || enquiry.street,
    enquiryMeta.siteStreet2 || enquiry.street2,
    enquiryMeta.siteCity || enquiry.city,
    enquiryMeta.siteState || enquiry.state,
    enquiryMeta.siteCountry || enquiry.country,
    enquiryMeta.siteZip || enquiry.zip,
  ]);
  const convertDate = formatDate(enquiryMeta.convertedAt || enquiryMeta.approvedAt || enquiry.updated_at || enquiry.created_at);

  return (
    <div className="p-6">
      {NavbarComponent ? <NavbarComponent /> : null}

      <h2 className="text-2xl font-bold mb-4">
        Internal Quotation - {enquiry.enquiry_number}
      </h2>

      {/* Client Info */}
      <div className="bg-white p-6 shadow rounded-lg mb-6">
        <h3 className="font-semibold mb-4">Client Details</h3>
        <div className="space-y-2 text-sm text-left">
          <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-1.5">
            <span className="min-w-[105px] font-semibold text-slate-950">Client Name -</span>
            <span className="font-normal text-slate-900">{enquiry.client || "—"}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-1.5">
            <span className="min-w-[105px] font-semibold text-slate-950">Plant Details -</span>
            <span className="text-slate-900">
              <span className="font-normal">{plantName}</span>
              {plantAddress !== "—" ? <span className="block text-slate-700">{plantAddress}</span> : null}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-1.5">
            <span className="min-w-[105px] font-semibold text-slate-950">Convert Date -</span>
            <span className="font-normal text-slate-900">{convertDate}</span>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 sm:p-5 shadow-sm">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3">Minimum Wage Selection</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <div className="text-slate-600 mb-1">Government Type</div>
            <select
              value={wageSelection.jurisdictionId}
              onChange={(e) =>
                setWageSelection((prev) => ({ ...prev, jurisdictionId: e.target.value }))
              }
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {jurisdictionOptions.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="text-slate-600 mb-1">State</div>
            <select
              value={wageSelection.stateCode}
              onChange={(e) =>
                setWageSelection((prev) => ({ ...prev, stateCode: e.target.value }))
              }
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {stateOptions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="text-slate-600 mb-1">Zone</div>
            <select
              value={wageSelection.zoneCode}
              onChange={(e) =>
                setWageSelection((prev) => ({ ...prev, zoneCode: e.target.value }))
              }
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {zoneOptions.map((z) => (
                <option key={z.code} value={z.code}>
                  {String(z.name || "").split(" - ")[0] || z.code}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {/* Bottom Demo Data Tabs */}
      <div className="mt-6 bg-white shadow rounded-lg">
        <div className="border-b px-4 py-3 flex flex-wrap gap-2">
          {[
            { key: 'manpower', label: 'Manpower' },
            { key: 'cost', label: 'Breakup Cost' },
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {manpowerRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 text-slate-700">{row.srNo}</td>
                        <td className="px-3 py-2.5">
                          {row.isCustom ? (
                            <div className="flex items-center gap-2">
                              <input
                                value={row.category}
                                onChange={(e) =>
                                  setManpowerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, category: e.target.value } : r)))
                                }
                                placeholder="Enter category"
                                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              />
                              <button
                                type="button"
                                onClick={() => deleteManpowerRow(row.id)}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                aria-label="Delete row"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
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
                      </tr>
                    ))}
                    <tr>
                      <td
                        colSpan={4}
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
                  <h4 className="text-lg font-semibold">Breakup Cost</h4>
                  <p className="text-xs text-gray-500 mt-1">UI only: enter values and see the calculated totals. Backend rules can be wired later.</p>
                </div>
              </div>

              <div className="mb-4 border border-slate-200 rounded-xl bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <div className="text-sm font-semibold text-slate-900">Particulars (from selected Service Category)</div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    {`Selected: ${SERVICE_CATEGORY_ID_TO_LABEL[serviceCategoryId] || SERVICE_CATEGORY_ID_TO_LABEL[1]}`}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs sm:text-sm">
                    <thead className="bg-white border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-700 w-[70px]">Sr No.</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-700 w-[90px]">Ref</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-700">Particulars</th>
                        {selectedManpowerColumns.map((col) => (
                          <th key={col.id} className="px-3 py-2.5 text-left font-semibold text-slate-700 min-w-[170px]">
                            <span className="block leading-4" title={`${col.category} (${col.skill})`}>
                              <span className="block">{col.category}</span>
                              <span className="block text-[11px] font-medium text-slate-500">({col.skill})</span>
                            </span>
                          </th>
                        ))}
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-700 w-[80px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bcsByBlock.map((blockGroup) => (
                        <React.Fragment key={blockGroup.block}>
                          <tr className="bg-slate-100">
                            <td colSpan={4 + selectedManpowerColumns.length} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <span>{blockGroup.title}</span>
                                {blockGroup.hiddenRows.length > 0 && (
                                  <div className="flex items-center gap-2 normal-case">
                                    <select
                                      value={blockPickerValue[blockGroup.block] || ""}
                                      onChange={(e) =>
                                        setBlockPickerValue((prev) => ({ ...prev, [blockGroup.block]: e.target.value }))
                                      }
                                      className="px-2 py-1 border border-slate-300 rounded bg-white text-[11px] text-slate-700"
                                    >
                                      <option value="">Add particular...</option>
                                      {blockGroup.hiddenRows.map((row) => (
                                        <option key={row.ref} value={row.ref}>
                                          {row.ref} - {row.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const selectedRef = blockPickerValue[blockGroup.block];
                                        addParticularRow(blockGroup.block, selectedRef);
                                      }}
                                      className="px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px]"
                                    >
                                      Add
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                          {blockGroup.rows.map((row, idx) => (
                            <tr key={row.ref} className="hover:bg-slate-50">
                              <td className="px-3 py-2.5 text-slate-700">{idx + 1}</td>
                              <td className="px-3 py-2.5 text-slate-700 font-medium">{row.ref}</td>
                              <td className="px-3 py-2.5 text-slate-900">{row.name}</td>
                              {selectedManpowerColumns.map((col) => {
                                const key = `${row.ref}__${col.id}`;
                                return (
                                  <td key={key} className="px-3 py-2.5">
                                    <input
                                      type="number"
                                      value={particularRateMatrix[key] ?? ""}
                                      onChange={(e) =>
                                        setParticularRateMatrix((prev) => ({ ...prev, [key]: e.target.value }))
                                      }
                                      className="w-full px-2 py-1.5 border border-slate-300 rounded-lg"
                                      placeholder="Rate"
                                      min="0"
                                    />
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => deleteParticularRow(row.ref)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                  aria-label={`Delete ${row.name}`}
                                  title="Delete row"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                      {selectedManpowerColumns.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-3 text-slate-500">
                            Select manpower category and sub category in Manpower tab to show columns here.
                          </td>
                        </tr>
                      )}
                      {selectedManpowerColumns.length > 0 && (
                        <tr className="bg-blue-50/80">
                          <td colSpan={3} className="px-3 py-3 text-right font-bold text-slate-900">
                            Total
                          </td>
                          {selectedManpowerColumns.map((col) => (
                            <td key={col.id} className="px-3 py-3 font-bold text-slate-900">
                              {breakupColumnTotals.columns[col.id] ? `₹${formatINR(breakupColumnTotals.columns[col.id])}` : ""}
                            </td>
                          ))}
                          <td className="px-3 py-3 text-right">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Overall</div>
                            <div className="font-bold text-blue-900">
                              {breakupColumnTotals.overall ? `₹${formatINR(breakupColumnTotals.overall)}` : ""}
                            </div>
                          </td>
                        </tr>
                      )}
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

              <input type="hidden" value={JSON.stringify(flowPreviewPayload)} readOnly />

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
                              disabled={!minWageEntryEnabled}
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
                              disabled={!minWageEntryEnabled}
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
                        onClick={() => {
                          if (minWageEntryEnabled) addWageRow();
                        }}
                        className={`px-2 sm:px-3 py-3 font-medium ${minWageEntryEnabled ? "text-purple-700 cursor-pointer hover:bg-purple-50/50" : "text-slate-400 cursor-not-allowed bg-slate-50"}`}
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
