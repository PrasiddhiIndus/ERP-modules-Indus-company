/** Commercial department assignees for Manpower Management inquiry (form + filters). */

export function mapCommercialEmployeeOption(row) {
  const name = String(row.full_name || "").trim();
  const email = String(row.email_id || "").trim();
  const value = email || name;
  if (!value) return null;
  const label = name ? (email ? `${name} (${email})` : name) : email;
  return { value, label, name };
}

export function mergeAssignedToOptions(baseOptions, currentValue) {
  const current = String(currentValue || "").trim();
  if (!current) return baseOptions;
  if (baseOptions.some((opt) => opt.value === current)) return baseOptions;
  return [{ value: current, label: current, name: current }, ...baseOptions];
}

export async function fetchCommercialAssigneeOptions(supabase) {
  const { data, error } = await supabase
    .from("admin_ifsp_employee_master")
    .select("full_name, email_id, department, status")
    .eq("status", "Active")
    .ilike("department", "commercial")
    .order("full_name", { ascending: true });

  if (error) throw error;

  return (data || []).map(mapCommercialEmployeeOption).filter(Boolean);
}
