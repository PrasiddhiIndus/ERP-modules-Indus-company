import { supabase } from "../../../lib/supabase";

function normalizeEmployee(row) {
  if (!row) return null;
  const name =
    row.name ||
    row.full_name ||
    row.employee_name ||
    [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ").trim();
  return {
    id: row.id,
    employeeCode: row.employee_code || row.emp_code || row.code || "—",
    name: name || "—",
    location: row.location || row.state || row.city || "—",
    phone: row.phone || row.mobile || row.contact_no || "—",
    dateOfJoining: row.date_of_joining || row.doj || row.joining_date || "—",
  };
}

function normalizeSite(row) {
  if (!row) return null;
  return {
    id: row.id,
    site_code: row.site_code || row.code || "—",
    site_name: row.site_name || row.name || "—",
    state: row.state || "—",
    cost_centre: row.cost_centre || row.cost_center || row.site_code || row.code || "—",
    status: row.is_active === false || row.status === "inactive" ? "Inactive" : "Active",
  };
}

/** Linked from public.people */
export async function getLinkedEmployees() {
  const { data, error } = await supabase
    .schema("public")
    .from("people")
    .select("*")
    .limit(5000);
  if (error) throw error;
  return (data || []).map(normalizeEmployee).filter(Boolean);
}

/** Linked from public.sites */
export async function getLinkedSites() {
  const { data, error } = await supabase
    .schema("public")
    .from("sites")
    .select("*")
    .limit(5000);
  if (error) throw error;
  return (data || []).map(normalizeSite).filter(Boolean);
}

export function siteLabel(site) {
  if (!site) return "—";
  return `${site.site_code} — ${site.site_name}`;
}

export function employeeLabel(emp) {
  if (!emp) return "—";
  return `${emp.employeeCode} — ${emp.name}`;
}
