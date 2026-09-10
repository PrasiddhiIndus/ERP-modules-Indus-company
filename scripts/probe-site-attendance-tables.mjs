/**
 * Probe INDUS Att.Mod tables on the same Supabase the ERP already uses.
 * Prints table name + ok/error only — no keys, no row payloads.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function normalizeEnvValue(val) {
  let s = String(val ?? "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

for (const filePath of [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(repoRoot, ".env.server"),
]) {
  if (!fs.existsSync(filePath)) continue;
  const parsed = dotenv.parse(fs.readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    const normalized = normalizeEnvValue(value);
    if (normalized) process.env[key] = normalized;
  }
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !(serviceKey || anonKey)) {
  console.error("Missing SUPABASE_URL / key in .env or .env.server");
  process.exit(1);
}

const tables = [
  ["sites", "id,site_name,site_type,shift_type,sandwich_rule,duty_hours,salary_cycle_start_day,salary_cycle_end_day,regular_ot,ot_in_hours,custom_ot,nh_ph_dates,one_person_multiple_designations,required_duty_per_day,max_workers"],
  ["people", "id,unique_code,full_name,designation,joining_date,is_active"],
  ["site_assignments", "id,person_id,site_id,from_date,to_date"],
  ["attendance", "id,person_id,site_id,att_date,att_code,designation,ot_hours,month,year,is_locked"],
  ["designation_master", "id,designation_name"],
  ["site_designations", "id,site_id,designation_name,shift_type,total_strength,required_duty_per_day"],
  ["site_supervisors", "id,site_id,username"],
  ["hr_managers", "id,full_name,username,role,is_active"],
  ["site_hr_managers", "id,site_id,hr_manager_id,from_date,to_date"],
  ["summary_remarks", "id,site_id,designation,month,year,remarks,custom_days"],
  ["site_grid_placements", "id,site_id,person_id,grid_designation,is_primary,cycle_month,cycle_year"],
];

async function probe(label, key) {
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const projectRef = String(url).match(/https?:\/\/([^.]+)\.supabase\.co/i)?.[1] || "(unknown)";
  console.log(`\n${label} · project ${projectRef}`);
  for (const [table, cols] of tables) {
    const { count, error } = await supabase.from(table).select(cols, { count: "exact", head: true });
    if (error) console.log(`${table}: FAIL ${error.code || ""} ${error.message}`);
    else console.log(`${table}: OK count=${count ?? 0}`);
  }
}

if (serviceKey) {
  await probe("service_role", serviceKey);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from("sites").select("id,site_type");
  if (!error) {
    const counts = {};
    for (const row of data || []) {
      const key = row.site_type || "(none)";
      counts[key] = (counts[key] || 0) + 1;
    }
    console.log("\nsite_type breakdown:", counts);
  }
}
if (anonKey) await probe("anon", anonKey);
