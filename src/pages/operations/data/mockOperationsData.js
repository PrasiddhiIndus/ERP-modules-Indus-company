/** Mock operations data — UI-only; linked to People Master & Site Master IDs */

export function buildMockOperationsData(sites, employees) {
  const activeSites = sites.filter((s) => s.status === "Active");
  const siteIds = sites.map((s) => s.id);
  const empIds = employees.map((e) => e.id);

  const pickSite = (i) => sites[i % sites.length];
  const pickEmp = (i) => employees[i % Math.max(employees.length, 1)] || { id: "unknown", employeeCode: "—", name: "Unknown" };

  const expenses = [
    { id: "exp-001", expense_no: "EXP-2026-0142", site_id: siteIds[0], category: "Utilities", head: "Electricity", amount: 48500, expense_date: "2026-06-12", status: "approved", payment_mode: "Bank Transfer", submitted_by: empIds[0], remarks: "June electricity bill" },
    { id: "exp-002", expense_no: "EXP-2026-0141", site_id: siteIds[1], category: "Maintenance", head: "Equipment Repair", amount: 12800, expense_date: "2026-06-10", status: "pending", payment_mode: "Cash", submitted_by: empIds[1] || empIds[0], remarks: "Pump motor repair" },
    { id: "exp-003", expense_no: "EXP-2026-0140", site_id: siteIds[0], category: "Consumables", head: "Safety Gear", amount: 7600, expense_date: "2026-06-08", status: "approved", payment_mode: "UPI", submitted_by: empIds[0], remarks: "PPE restock" },
    { id: "exp-004", expense_no: "EXP-2026-0139", site_id: siteIds[2], category: "Transport", head: "Vehicle Fuel", amount: 22400, expense_date: "2026-06-05", status: "rejected", payment_mode: "Fuel Card", submitted_by: empIds[0], remarks: "Fleet diesel — rejected duplicate" },
    { id: "exp-005", expense_no: "EXP-2026-0138", site_id: siteIds[1], category: "Utilities", head: "Water Supply", amount: 9200, expense_date: "2026-06-03", status: "approved", payment_mode: "Cheque", submitted_by: empIds[1] || empIds[0], remarks: "" },
    { id: "exp-006", expense_no: "EXP-2026-0137", site_id: siteIds[0], category: "Administration", head: "Stationery", amount: 3400, expense_date: "2026-05-28", status: "draft", payment_mode: "Cash", submitted_by: empIds[0], remarks: "Office supplies" },
    { id: "exp-007", expense_no: "EXP-2026-0136", site_id: siteIds[2], category: "Maintenance", head: "Civil Work", amount: 35600, expense_date: "2026-05-25", status: "approved", payment_mode: "Bank Transfer", submitted_by: empIds[0], remarks: "Compound wall repair" },
    { id: "exp-008", expense_no: "EXP-2026-0135", site_id: siteIds[1], category: "Hospitality", head: "Client Visit", amount: 15800, expense_date: "2026-05-20", status: "pending", payment_mode: "Credit Card", submitted_by: empIds[1] || empIds[0], remarks: "Audit team visit" },
  ];

  const advances = [
    { id: "adv-001", request_no: "ADV-2026-0088", site_id: siteIds[0], employee_id: empIds[0], purpose: "Site emergency procurement", amount: 50000, requested_date: "2026-06-14", status: "pending_approval", settled_amount: 0, balance: 50000 },
    { id: "adv-002", request_no: "ADV-2026-0087", site_id: siteIds[1], employee_id: empIds[1] || empIds[0], purpose: "Travel advance — client meeting", amount: 15000, requested_date: "2026-06-11", status: "approved", settled_amount: 8200, balance: 6800 },
    { id: "adv-003", request_no: "ADV-2026-0086", site_id: siteIds[2], employee_id: empIds[0], purpose: "Local vendor advance", amount: 25000, requested_date: "2026-06-08", status: "partially_settled", settled_amount: 18000, balance: 7000 },
    { id: "adv-004", request_no: "ADV-2026-0085", site_id: siteIds[0], employee_id: empIds[1] || empIds[0], purpose: "Medical camp logistics", amount: 12000, requested_date: "2026-06-02", status: "settled", settled_amount: 12000, balance: 0 },
    { id: "adv-005", request_no: "ADV-2026-0084", site_id: siteIds[1], employee_id: empIds[0], purpose: "Equipment rental deposit", amount: 35000, requested_date: "2026-05-28", status: "approved", settled_amount: 0, balance: 35000 },
    { id: "adv-006", request_no: "ADV-2026-0083", site_id: siteIds[2], employee_id: empIds[0], purpose: "Site canteen supplies", amount: 8000, requested_date: "2026-05-22", status: "rejected", settled_amount: 0, balance: 0 },
  ];

  const settlements = [
    { id: "set-001", advance_id: "adv-002", settlement_no: "SET-2026-0041", amount: 8200, settlement_date: "2026-06-13", mode: "Expense Voucher", status: "posted", remarks: "Travel bills submitted" },
    { id: "set-002", advance_id: "adv-003", settlement_no: "SET-2026-0040", amount: 18000, settlement_date: "2026-06-10", mode: "Cash Return", status: "posted", remarks: "Vendor invoice matched" },
    { id: "set-003", advance_id: "adv-004", settlement_no: "SET-2026-0039", amount: 12000, settlement_date: "2026-06-05", mode: "Expense Voucher", status: "posted", remarks: "Camp expenses closed" },
    { id: "set-004", advance_id: "adv-002", settlement_no: "SET-2026-0038", amount: 0, settlement_date: "2026-06-15", mode: "Pending", status: "draft", remarks: "Balance settlement pending" },
  ];

  const pmeRecords = employees.slice(0, 8).map((emp, i) => {
    const dueDates = ["2026-06-20", "2026-05-15", "2026-07-10", "2026-04-01", "2026-06-25", "2026-03-12", "2026-08-01", "2026-06-18"];
    const statuses = ["due_soon", "overdue", "scheduled", "overdue", "due_soon", "overdue", "ok", "due_soon"];
    return {
      id: `pme-${emp.id}`,
      employee_id: emp.id,
      last_pme_date: ["2025-06-20", "2024-05-15", "2025-07-10", "2024-04-01", "2025-06-25", "2024-03-12", "2025-08-01", "2025-06-18"][i],
      next_due_date: dueDates[i],
      status: statuses[i],
      medical_center_id: `mc-${(i % 3) + 1}`,
      fitness_status: statuses[i] === "overdue" ? "Pending" : "Fit",
      blood_group: ["B+", "O+", "A+", "AB+", "B-", "O-", "A-", "B+"][i],
    };
  });

  const pmeHistory = [
    { id: "ph-1", employee_id: empIds[0], date: "2025-06-20", center: "Apollo Occupational Health", result: "Fit", validity: "2026-06-20" },
    { id: "ph-2", employee_id: empIds[0], date: "2024-06-18", center: "Apollo Occupational Health", result: "Fit", validity: "2025-06-18" },
    { id: "ph-3", employee_id: empIds[0], date: "2023-06-15", center: "Sterling Medical Centre", result: "Fit with restriction", validity: "2024-06-15" },
  ];

  const medicalCenters = [
    { id: "mc-1", name: "Apollo Occupational Health", city: "Ahmedabad", accreditation: "NABH", contact: "079-66701800", rating: 4.8, distance_km: 12, specialties: ["PME", "Audiometry", "Spirometry"] },
    { id: "mc-2", name: "Sterling Medical Centre", city: "Jamnagar", accreditation: "ISO 9001", contact: "0288-2555100", rating: 4.5, distance_km: 8, specialties: ["PME", "Vision Test", "ECG"] },
    { id: "mc-3", name: "Indus Corporate Health Hub", city: "Mundra", accreditation: "NABH", contact: "02838-225500", rating: 4.6, distance_km: 3, specialties: ["PME", "Drug Test", "Chest X-Ray"] },
    { id: "mc-4", name: "Gujarat Industrial Health", city: "Vadodara", accreditation: "NABH", contact: "0265-2324500", rating: 4.3, distance_km: 45, specialties: ["PME", "Audiometry"] },
  ];

  const properties = [
    { id: "prop-001", property_code: "ACC-S001-A", site_id: siteIds[0], name: "Hazira Staff Quarters Block A", type: "Staff Quarters", address: "Plot 12, Hazira Industrial Area", units: 24, occupied: 22, monthly_rent: 480000, landlord: "Gujarat Housing Board", status: "active" },
    { id: "prop-002", property_code: "ACC-S002-B", site_id: siteIds[1], name: "Jamnagar Supervisor Villa", type: "Supervisor Villa", address: "Sector 7, Reliance Township", units: 8, occupied: 8, monthly_rent: 192000, landlord: "Reliance Industries Ltd", status: "active" },
    { id: "prop-003", property_code: "ACC-S003-C", site_id: siteIds[2], name: "Mundra Port Guest House", type: "Guest House", address: "Near Gate 3, Mundra Port", units: 12, occupied: 9, monthly_rent: 144000, landlord: "Tata Power Mundra", status: "active" },
    { id: "prop-004", property_code: "ACC-S001-D", site_id: siteIds[0], name: "Hazira Transit Camp", type: "Transit Camp", address: "NH-48 Bypass, Hazira", units: 40, occupied: 35, monthly_rent: 320000, landlord: "Private Lease", status: "active" },
  ];

  const rentPayments = [
    { id: "rent-001", property_id: "prop-001", payment_no: "RNT-2026-0062", month: "2026-06", amount: 480000, payment_date: "2026-06-05", mode: "NEFT", status: "paid", reference: "UTR1234567890" },
    { id: "rent-002", property_id: "prop-002", payment_no: "RNT-2026-0061", month: "2026-06", amount: 192000, payment_date: "2026-06-04", mode: "Cheque", status: "paid", reference: "CHQ-884521" },
    { id: "rent-003", property_id: "prop-003", payment_no: "RNT-2026-0060", month: "2026-06", amount: 144000, payment_date: null, mode: "—", status: "due", reference: "" },
    { id: "rent-004", property_id: "prop-004", payment_no: "RNT-2026-0059", month: "2026-06", amount: 320000, payment_date: "2026-06-06", mode: "RTGS", status: "paid", reference: "RTGS9988776655" },
    { id: "rent-005", property_id: "prop-001", payment_no: "RNT-2026-0058", month: "2026-05", amount: 480000, payment_date: "2026-05-05", mode: "NEFT", status: "paid", reference: "UTR0987654321" },
    { id: "rent-006", property_id: "prop-002", payment_no: "RNT-2026-0057", month: "2026-05", amount: 192000, payment_date: "2026-05-04", mode: "Cheque", status: "paid", reference: "CHQ-884520" },
  ];

  const monthlyTrends = {
    expenses: [
      { month: "Jan", amount: 142000 },
      { month: "Feb", amount: 158000 },
      { month: "Mar", amount: 135000 },
      { month: "Apr", amount: 172000 },
      { month: "May", amount: 189000 },
      { month: "Jun", amount: 164300 },
    ],
    advances: [
      { month: "Jan", requested: 85000, settled: 72000 },
      { month: "Feb", requested: 92000, settled: 88000 },
      { month: "Mar", requested: 78000, settled: 65000 },
      { month: "Apr", requested: 110000, settled: 95000 },
      { month: "May", requested: 98000, settled: 82000 },
      { month: "Jun", requested: 145000, settled: 38000 },
    ],
    rent: [
      { month: "Jan", due: 1136000, paid: 1136000 },
      { month: "Feb", due: 1136000, paid: 1136000 },
      { month: "Mar", due: 1136000, paid: 992000 },
      { month: "Apr", due: 1136000, paid: 1136000 },
      { month: "May", due: 1136000, paid: 1136000 },
      { month: "Jun", due: 1136000, paid: 992000 },
    ],
  };

  const activities = [
    { id: "act-1", type: "expense", title: "Expense EXP-2026-0142 approved", meta: "₹48,500 · Hazira · 2h ago", severity: "info" },
    { id: "act-2", type: "advance", title: "Advance ADV-2026-0088 submitted", meta: "₹50,000 · Pending approval · 4h ago", severity: "warning" },
    { id: "act-3", type: "pme", title: "PME overdue alert — 3 employees", meta: "Medical team notified · 6h ago", severity: "critical" },
    { id: "act-4", type: "rent", title: "Rent due for Mundra Guest House", meta: "₹1,44,000 · Due Jun 15 · 8h ago", severity: "high" },
    { id: "act-5", type: "settlement", title: "Settlement SET-2026-0041 posted", meta: "₹8,200 · ADV-2026-0087 · Yesterday", severity: "info" },
    { id: "act-6", type: "expense", title: "Expense EXP-2026-0139 rejected", meta: "Duplicate claim · Yesterday", severity: "high" },
  ];

  const notifications = [
    { id: "n1", title: "3 PME records overdue", body: "Schedule medical appointments for affected employees.", type: "pme", unread: true, time: "10 min ago" },
    { id: "n2", title: "Advance pending your approval", body: "ADV-2026-0088 — ₹50,000 emergency procurement.", type: "advance", unread: true, time: "1h ago" },
    { id: "n3", title: "Rent payment due", body: "Mundra Port Guest House — June rent not yet paid.", type: "rent", unread: true, time: "3h ago" },
    { id: "n4", title: "Expense approval queue", body: "2 expenses awaiting site manager approval.", type: "expense", unread: false, time: "5h ago" },
    { id: "n5", title: "Settlement reminder", body: "ADV-2026-0087 has ₹6,800 outstanding balance.", type: "advance", unread: false, time: "Yesterday" },
  ];

  const dashboard = {
    active_sites: activeSites.length,
    monthly_expenses: expenses.filter((e) => e.expense_date.startsWith("2026-06") && e.status === "approved").reduce((s, e) => s + e.amount, 0),
    pending_advances: advances.filter((a) => a.status === "pending_approval").length,
    open_settlements: settlements.filter((s) => s.status === "draft").length,
    rent_due: rentPayments.filter((r) => r.status === "due").reduce((s, r) => s + r.amount, 0),
    pme_due: pmeRecords.filter((p) => ["due_soon", "overdue"].includes(p.status)).length,
  };

  return {
    sites,
    employees,
    expenses,
    advances,
    settlements,
    pmeRecords,
    pmeHistory,
    medicalCenters,
    properties,
    rentPayments,
    monthlyTrends,
    activities,
    notifications,
    dashboard,
    pickSite,
    pickEmp,
  };
}

export const EXPENSE_CATEGORIES = ["Utilities", "Maintenance", "Consumables", "Transport", "Administration", "Hospitality"];
export const EXPENSE_STATUSES = ["draft", "pending", "approved", "rejected"];
export const ADVANCE_STATUSES = ["pending_approval", "approved", "rejected", "partially_settled", "settled"];
export const PME_STATUSES = ["ok", "due_soon", "overdue", "scheduled"];
export const RENT_STATUSES = ["paid", "due", "overdue", "partial"];

export function formatCurrency(amount) {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export function formatStatus(status) {
  return String(status || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusTone(status) {
  const map = {
    approved: "success",
    paid: "success",
    settled: "success",
    ok: "success",
    posted: "success",
    active: "success",
    pending: "warning",
    pending_approval: "warning",
    due: "warning",
    due_soon: "warning",
    partially_settled: "info",
    scheduled: "info",
    draft: "neutral",
    rejected: "danger",
    overdue: "danger",
    inactive: "neutral",
  };
  return map[status] || "neutral";
}
