/**
 * One-time repair: copy bank fields from spaced codes (FTC 41) onto hyphen codes (FTC-41).
 * Run: node scripts/merge-ftc-bank-duplicates.mjs
 */
import fs from "fs";

function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
}
loadEnv(".env");
loadEnv(".env.server");

const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

function codeKey(code) {
  const n = String(code || "").trim();
  if (!n) return "";
  if (/^\d+$/.test(n)) return String(Number(n));
  const compact = n.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.replace(/^([A-Z]+)(\d+)$/, "$1-$2");
}

const res = await fetch(
  `${url}/rest/v1/admin_ifsp_employee_master?select=id,employee_code,full_name,bank_account_no,ifsc_code,uan_no,esic_no,status&employee_code=ilike.FTC*`,
  { headers }
);
const rows = await res.json();
if (!Array.isArray(rows)) {
  console.error(rows);
  process.exit(1);
}

const byKey = new Map();
for (const row of rows) {
  const k = codeKey(row.employee_code);
  if (!k) continue;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(row);
}

let patched = 0;
for (const [key, group] of byKey) {
  if (group.length < 2) continue;
  const withBank = group.find(
    (r) => String(r.bank_account_no || "").trim() || String(r.ifsc_code || "").trim()
  );
  if (!withBank) continue;

  for (const target of group) {
    if (String(target.id) === String(withBank.id)) continue;
    const needs =
      !String(target.bank_account_no || "").trim() ||
      !String(target.ifsc_code || "").trim() ||
      !String(target.uan_no || "").trim() ||
      !String(target.esic_no || "").trim();
    if (!needs) continue;

    const patch = {
      bank_account_no: target.bank_account_no || withBank.bank_account_no,
      ifsc_code: target.ifsc_code || withBank.ifsc_code,
      uan_no: target.uan_no || withBank.uan_no,
      esic_no: target.esic_no || withBank.esic_no,
      updated_at: new Date().toISOString(),
    };
    const up = await fetch(
      `${url}/rest/v1/admin_ifsp_employee_master?id=eq.${target.id}`,
      { method: "PATCH", headers, body: JSON.stringify(patch) }
    );
    const body = await up.json();
    if (!up.ok) {
      console.error("fail", key, target.employee_code, body);
      continue;
    }
    patched += 1;
    console.log(
      `patched ${target.employee_code} (id ${target.id}) from ${withBank.employee_code} → ${patch.bank_account_no}`
    );
  }
}

console.log(`Done. Profiles patched: ${patched}`);
