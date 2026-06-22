/** Column definitions matching Dahej Expenses Excel workbook (Jan 26 onwards layout) */

export const DAHEJ_EXPENSE_COLUMNS = [
  { key: "sr_no", label: "Sr. No.", type: "number", width: 64, frozen: true, group: "advance" },
  { key: "advance_amount_paid", label: "Advance Amount Paid", type: "currency", width: 120, group: "advance" },
  { key: "date", label: "Date", type: "date", width: 108, group: "advance" },
  { key: "expense_booked_under", label: "Expense Booked Under", type: "text", width: 160, group: "expense" },
  { key: "vehicle_utilized_for", label: "Vehicle Utilized For", type: "text", width: 140, group: "expense" },
  { key: "expense_type", label: "Expense Type", type: "text", width: 180, group: "expense" },
  { key: "expense_bill_serial_no", label: "Expense Bill Serial No.", type: "text", width: 120, group: "expense" },
  { key: "amount", label: "Amount", type: "currency", width: 96, group: "expense" },
  { key: "inventory_item", label: "Inventory Item", type: "currency", width: 108, group: "observation" },
  { key: "fuel_camper", label: "Fuel for Vehicle (Camper)", type: "currency", width: 130, group: "observation" },
  { key: "service_camper", label: "Service & Repairing of Vehicle (Camper)", type: "currency", width: 180, group: "observation" },
  { key: "fuel_maruti_eco", label: "Fuel For Vehicle (Maruti Eco)", type: "currency", width: 150, group: "observation" },
  { key: "service_maruti_eco", label: "Service & Repairing of Vehicle (Maruti Eco)", type: "currency", width: 200, group: "observation" },
  { key: "fuel_bike", label: "Fuel - Bike", type: "currency", width: 96, group: "observation" },
  { key: "service_bike", label: "Service & Repairing of Bike", type: "currency", width: 140, group: "observation" },
  { key: "fuel_fire_tender", label: "Fuel - Fire Tender", type: "currency", width: 120, group: "observation" },
  { key: "service_fire_tender", label: "Service & Repairing of Vehicle (Fire Tender)", type: "currency", width: 200, group: "observation" },
  { key: "other_service_supplies", label: "Other Service & Supplies", type: "currency", width: 140, group: "observation" },
  { key: "remarks", label: "Remarks", type: "text", width: 160, group: "meta" },
];

export const DAHEJ_CURRENCY_KEYS = DAHEJ_EXPENSE_COLUMNS.filter((c) => c.type === "currency").map((c) => c.key);

export const DAHEJ_GRID_GROUPS = [
  { id: "advance", label: "Advance Payment Details" },
  { id: "expense", label: "Expense Details" },
  { id: "observation", label: "Expense Observation" },
  { id: "meta", label: "" },
];

export const DAHEJ_EXPENSE_CATEGORY_OPTIONS = [
  "Fuel",
  "Vehicle Repair & Maintenance",
  "Inventory Purchase",
  "Other Services & Supplies",
  "Miscellaneous Operational Expenses",
];

export const DAHEJ_BOOKING_LOCATION_TYPES = [
  "Branch Office",
  "Site Office",
  "Client Location",
  "Project Location",
];

export const DAHEJ_WORKFLOW_STATUSES = ["draft", "submitted", "approved", "paid", "closed"];

export const DAHEJ_HUB_TABS = [
  { id: "register", label: "Expense Register", path: "register" },
  { id: "dashboard", label: "Dashboard", path: "dashboard" },
  { id: "monthly-register", label: "Monthly Register", path: "monthly-register" },
  { id: "vehicle-master", label: "Vehicle Master", path: "vehicle-master" },
  { id: "booking-locations", label: "Booking Locations", path: "booking-locations" },
  { id: "reports", label: "Reports", path: "reports" },
];

export function emptyDahejExpenseRow(overrides = {}) {
  const row = { id: `de-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  DAHEJ_EXPENSE_COLUMNS.forEach((c) => {
    if (c.type === "currency" || c.type === "number") row[c.key] = c.key === "sr_no" ? "" : 0;
    else row[c.key] = "";
  });
  return {
    ...row,
    month_key: "",
    status: "draft",
    site_id: "",
    vehicle_id: "",
    employee_id: "",
    created_by: "",
    created_at: "",
    modified_by: "",
    modified_at: "",
    deleted_at: null,
    approval_history: [],
    change_log: [],
    ...overrides,
  };
}
