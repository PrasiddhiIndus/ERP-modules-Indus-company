/**
 * Checks for the IEV OC Creation migration (in-memory Postgres; never touches a real database):
 *   supabase/migrations/20261012120000_iev_oc_creation.sql (+ rollback)
 *
 *   npm run iev:check:oc
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8").replace(/NOTIFY pgrst[^;]*;/g, "");
const up = read("supabase/migrations/20261012120000_iev_oc_creation.sql");
const upFix = read("supabase/migrations/20261012150000_iev_oc_access_fix.sql");
const down = read("supabase/rollbacks/20261012120000_iev_oc_creation_down.sql");
const downFix = read("supabase/rollbacks/20261012150000_iev_oc_access_fix_down.sql");
const upMatch = read("supabase/migrations/20261012170000_iev_oc_access_match_app.sql");
const downMatch = read("supabase/rollbacks/20261012170000_iev_oc_access_match_app_down.sql");
const upRepair = read("supabase/migrations/20261012180000_iev_oc_schema_repair.sql");
const legacyV1 = read("scripts/ievOc/fixtures/oc_creation_v1_legacy.sql");
const upFinance = read("supabase/migrations/20261012190000_iev_oc_finance_oc_no.sql");
const downFinance = read("supabase/rollbacks/20261012190000_iev_oc_finance_oc_no_down.sql");
const upPageAccess = read("supabase/migrations/20261012200000_iev_po_at_glance_page_access.sql");
const downPageAccess = read("supabase/rollbacks/20261012200000_iev_po_at_glance_page_access_down.sql");

let passed = 0;
let failed = 0;
const check = (label, ok, extra) => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
};
const throws = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.message || String(e);
  }
};

const IEV_USER = "00000000-0000-0000-0000-0000000000a1";
const SALES_USER = "00000000-0000-0000-0000-0000000000b2";

const OTHER_IEV_USER = "00000000-0000-0000-0000-0000000000a2";
const CONFIG_PICKED = "00000000-0000-0000-0000-0000000000a3";
const CONFIG_OTHER = "00000000-0000-0000-0000-0000000000a4";
const COSTING_ONLY = "00000000-0000-0000-0000-0000000000c1";
const MASTER_LINKED = "00000000-0000-0000-0000-0000000000c2";
const FTC_DEPT = "00000000-0000-0000-0000-0000000000c3";
const MODULE_CASE = "00000000-0000-0000-0000-0000000000c4";
const MFG_ONLY = "00000000-0000-0000-0000-0000000000c5";
const FIN_TEAM = "00000000-0000-0000-0000-0000000000c6";
const PAGE_OC = "00000000-0000-0000-0000-0000000000c7";
const PAGE_QUOTE = "00000000-0000-0000-0000-0000000000c8";

const SETUP = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    END IF;
  END $$;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text);
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, team text, role text, allowed_modules jsonb, employee_code text,
    allowed_sub_modules jsonb NOT NULL DEFAULT '[]');
  CREATE TABLE public.admin_ifsp_employee_master (id bigserial PRIMARY KEY, employee_code text, full_name text, department text, status text, user_id uuid);
  ALTER TABLE public.admin_ifsp_employee_master ENABLE ROW LEVEL SECURITY;
  INSERT INTO public.admin_ifsp_employee_master (employee_code, full_name, department, status, user_id) VALUES
    ('8982', 'Asha Mehta', 'Sales', 'Active', NULL), ('7001', 'Ravi Shah', 'Finance', 'Active', NULL),
    ('5000', 'Old Staff', 'Planning', 'Left', NULL), ('6100', 'Priya Nair', 'Planning', 'Active', '${MASTER_LINKED}');
  CREATE OR REPLACE FUNCTION public.current_user_has_fire_tender_shared_catalog_access()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
        AND (p.team = 'fireTender' OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'fireTender'
             OR p.role IN ('super_admin', 'super_admin_pro')));
  $$;
  INSERT INTO auth.users VALUES ('${IEV_USER}'), ('${OTHER_IEV_USER}'), ('${SALES_USER}'), ('${CONFIG_PICKED}'), ('${CONFIG_OTHER}'),
    ('${COSTING_ONLY}'), ('${MASTER_LINKED}'), ('${FTC_DEPT}'), ('${MODULE_CASE}'), ('${MFG_ONLY}'), ('${FIN_TEAM}'),
    ('${PAGE_OC}'), ('${PAGE_QUOTE}');
  INSERT INTO public.profiles VALUES ('${IEV_USER}', 'fireTender', 'executive', '[]', '8982', '[]'),
    ('${OTHER_IEV_USER}', 'fireTender', 'executive', '[]', '7001', '[]'), ('${SALES_USER}', 'sales', 'executive', '[]', NULL, '[]'),
    ('${CONFIG_PICKED}', 'fireTender', 'executive', '[]', '9000', '["iev-config.selected", "iev-config.oc-sign-off"]'),
    ('${CONFIG_OTHER}', 'fireTender', 'manager', '[]', '9001', '["iev-config.selected", "iev-config.price-master"]'),
    ('${COSTING_ONLY}', 'sales', 'executive', '[]', '8100', '["fireTender.costing"]'),
    ('${MASTER_LINKED}', 'fireTender', 'executive', '[]', NULL, '[]'),
    ('${FTC_DEPT}', 'Projects-FTC', 'manager', '[]', '8200', '[]'),
    ('${MODULE_CASE}', 'sales', 'executive', '["FireTender"]', '8300', '[]'),
    ('${MFG_ONLY}', 'sales', 'executive', '[]', '8400', '["fireTender.manufacturing"]'),
    ('${FIN_TEAM}', 'Finance/Accounts', 'executive', '["fireTender"]', '8500', '[]'),
    ('${PAGE_OC}', 'sales', 'executive', '[]', '8600', '["fireTender.costing.po-at-glance"]'),
    ('${PAGE_QUOTE}', 'sales', 'executive', '[]', '8700', '["fireTender.costing.quotation"]');
  GRANT USAGE ON SCHEMA public, auth TO authenticated;
`;
let db = new PGlite();
await db.exec(SETUP);

check("migration applies", (await throws(() => db.exec(up))) === null);
check("migration is re-runnable", (await throws(() => db.exec(up))) === null);
check("access follow-up migration applies", (await throws(() => db.exec(upFix))) === null);
check("access follow-up migration is re-runnable", (await throws(() => db.exec(upFix))) === null);
check("app-matching access migration applies", (await throws(() => db.exec(upMatch))) === null);
check("app-matching access migration is re-runnable", (await throws(() => db.exec(upMatch))) === null);
check("schema repair applies on a fresh database", (await throws(() => db.exec(upRepair))) === null);

async function asUser(uid, fn) {
  await db.exec(`SET test.uid = '${uid}'; SET ROLE authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec(`RESET ROLE; RESET test.uid;`);
  }
}
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

// Sign-off assignment (IEV Configuration → OC Sign-off Assignment).
const assign = "INSERT INTO public.oc_signoff_assignees (slot, employee_code, employee_name) VALUES ($1, $2, $3) ON CONFLICT (slot) DO UPDATE SET employee_code = EXCLUDED.employee_code, employee_name = EXCLUDED.employee_name";
await asUser(IEV_USER, async () => {
  const opts = (await db.query("SELECT * FROM public.oc_employee_options()")).rows;
  check("employee picker lists active Employee Master people only", opts.map((o) => o.employee_code).join() === "8982,6100,7001", opts);
});
await asUser(CONFIG_OTHER, async () => {
  const err = await throws(() => db.query(assign, ["SALES", "8982", "Asha Mehta"]));
  check("users given other configuration pages only cannot change the assignment", /row-level security|policy/i.test(err || ""), err);
});
await asUser(CONFIG_PICKED, async () => {
  await db.query(assign, ["SALES", "8982", "Asha Mehta"]);
  await db.query(assign, ["FINANCE", "7001", "Ravi Shah"]);
  check("users given the OC Sign-off Assignment page can assign people", (await one("SELECT count(*)::int AS n FROM public.oc_signoff_assignees")).n === 2);
});
await asUser(IEV_USER, async () => {
  const err = await throws(() => db.query(assign, ["FINANCE", "7001", "Ravi Shah"]));
  check("users with all IEV configuration pages can change the assignment", err === null, err);
});

const base = {
  cost_center_tally: "IEV / Mock Project",
  client_name: "Mock Client Pvt Ltd",
  client_address: "Plot 1, GIDC\nVadodara",
  is_sez: false,
  po_wo_no: "PO-MOCK-001",
  po_date: "2026-10-01",
  project_description: "Supply of 2 IEVs",
  duration_of_job: "6 months",
  delivery_date: "2027-03-31",
  contract_value: 12345678.5,
  currency: "INR",
  gst_pct: 18,
  payment_terms: "As per milestones",
  rto_insurance: "By client",
  other_information: "None",
  remarks: "OK",
  remarks_date: "2026-10-12",
  penalty: { enabled: true, rate: 0.5, period_unit: "WEEK", cap_percent: 10, applicable_from_text: "After delivery date" },
  security_items: [
    { type: "SD", applicable: true, pct: 5, due_days: 15, validity_text: "Till DLP" },
    { type: "ABG", pct: 10, due_days: 30, validity_text: "Till recovery", applicable: true },
    { type: "PBG", pct: 3, due_days: 30, validity_text: "Warranty + 3 months" },
    { type: "PBG", pct: 2, due_days: 45, validity_text: "Second PBG" },
  ],
  fixed_conditions: [
    { key: "EMD", enabled: true, release_or_adjust: "RELEASE", release_date: "2026-11-30" },
    { key: "DLP", enabled: true, detail_text: "12 months from delivery" },
    { key: "WARRANTY", enabled: false },
  ],
  payment_milestones: [
    { percent: 30, trigger: "Advance", due_days: 0 },
    { percent: 70, trigger: "On delivery", due_days: 30, notes: "Against invoice" },
  ],
  contacts: [{ department: "Purchase", names: "Mock Buyer", mobiles: ["9999900001", "9999900002"], emails: ["buyer@example.test"] }],
  signoff: [
    { slot: "SALES", signed_by: "Mock Sales", signed_at: "2001-01-01T00:00:00Z" },
    { slot: "PLANNING", signed_by: "  " },
  ],
};
const save = (p) => one("SELECT public.oc_save($1::jsonb) AS r", [JSON.stringify(p)]).then((x) => x.r);

let ocSeq = 0;
const nextNo = () => `OC/IEV/MOCK/${++ocSeq}`;

await asUser(IEV_USER, async () => {
  const saved = await save({ ...base, oc_no: "  OC/IEV/26-27/001  " });
  check("a manually entered OC No. is saved (trimmed)", saved.oc_no === "OC/IEV/26-27/001", saved);

  const missing = await throws(() => save({ ...base, oc_no: " " }));
  check("OC No. is required", /OC No\. is required/.test(missing || ""), missing);
  const reused = await throws(() => save({ ...base, oc_no: "oc/iev/26-27/001" }));
  check("an OC No. already used (any case) is rejected", /already used/.test(reused || ""), reused);
  const direct = await throws(() => db.query("INSERT INTO public.oc_master (oc_no, client_name, po_wo_no, po_date, project_description, delivery_date, contract_value) VALUES ('OC/IEV/26-27/001 ', 'x', 'x', '2026-10-01', 'x', '2026-10-02', 1)"));
  check("duplicate OC No. is blocked even outside the form", /duplicate|unique/i.test(direct || ""), direct);

  const other = await save({ ...base, oc_no: nextNo(), signoff: [] });
  const renamed = await save({ ...base, id: other.id, oc_no: "OC/IEV/26-27/002" });
  check("OC No. can be corrected on an existing OC", renamed.oc_no === "OC/IEV/26-27/002" && renamed.id === other.id, renamed);
  const keepSame = await throws(() => save({ ...base, id: saved.id, oc_no: "OC/IEV/26-27/001" }));
  check("re-saving an OC with its own number is allowed", keepSame === null, keepSame);
  const clash = await throws(() => save({ ...base, id: other.id, oc_no: "OC/IEV/26-27/001" }));
  check("changing to another OC's number is rejected", /already used/.test(clash || ""), clash);

  const m = await one("SELECT * FROM public.oc_master WHERE id = $1", [saved.id]);
  check("header reloads exactly", m.client_address === base.client_address && Number(m.contract_value) === base.contract_value
    && m.is_sez === false && Number(m.gst_pct) === 18 && m.remarks === "OK", m);
  check("audit fields are set", m.created_by === IEV_USER && m.updated_by === IEV_USER);
  const sec = (await db.query("SELECT type, applicable, pct::float, due_days, validity_text FROM public.oc_security_items WHERE oc_id = $1 ORDER BY seq", [saved.id])).rows;
  check("security items save one row per item, in order", sec.map((r) => r.type).join() === "SD,ABG,PBG,PBG", sec);
  check("SD applicability kept; dropped for ABG", sec[0].applicable === true && sec[1].applicable === null, sec);
  const cond = (await db.query("SELECT key, enabled, detail_text, release_or_adjust, release_date::text FROM public.oc_fixed_conditions WHERE oc_id = $1 ORDER BY key", [saved.id])).rows;
  check("EMD / DLP / Warranty saved", cond.length === 3 && cond.find((c) => c.key === "EMD").release_date === "2026-11-30", cond);
  const pen = await one("SELECT enabled, rate::float, period_unit, cap_percent::float FROM public.oc_penalty WHERE oc_id = $1", [saved.id]);
  check("LD / penalty saved", pen.enabled && pen.rate === 0.5 && pen.period_unit === "WEEK" && pen.cap_percent === 10, pen);
  const con = await one("SELECT mobiles, emails FROM public.oc_contacts WHERE oc_id = $1", [saved.id]);
  check("multiple mobiles / emails per contact", con.mobiles.length === 2 && con.emails[0] === "buyer@example.test", con);
  const sign = (await db.query("SELECT slot, signed_by, signed_user_id, (now() - signed_at) < interval '1 minute' AS fresh FROM public.oc_signoff WHERE oc_id = $1 ORDER BY slot", [saved.id])).rows;
  check("only boxes with a name are signed", sign.map((s) => s.slot).join() === "SALES", sign);
  check("sign-off date and time come from the server, not the browser", sign.every((s) => s.fresh), sign);
  check("sign-off records the signed-in account", sign.every((s) => s.signed_user_id === IEV_USER), sign);

  await save({ ...base, id: saved.id, oc_no: "OC/IEV/26-27/001", security_items: [{ type: "PBG", pct: 4 }], contacts: [] });
  const after = await one("SELECT (SELECT count(*) FROM public.oc_security_items WHERE oc_id = $1)::int AS s, (SELECT count(*) FROM public.oc_contacts WHERE oc_id = $1)::int AS c", [saved.id]);
  check("re-save replaces child rows (no duplicates)", after.s === 1 && after.c === 0, after);

  const rules = [
    ["missing PO/WO No.", { po_wo_no: " " }, /PO\/WO No/],
    ["missing PO date", { po_date: null }, /PO\/WO date/],
    ["missing client", { client_name: "" }, /Client name/],
    ["missing project description", { project_description: "" }, /Project description/],
    ["missing contract value", { contract_value: null }, /Contract value/],
    ["missing delivery date", { delivery_date: null }, /Delivery date is required/],
    ["delivery not after PO date", { delivery_date: "2026-10-01" }, /after the PO/],
    ["LD Yes without rate", { penalty: { enabled: true, period_unit: "WEEK" } }, /LD \/ Penalty details/],
    ["DLP Yes without details", { fixed_conditions: [{ key: "DLP", enabled: true }] }, /Defect Liability Period details/],
    ["Warranty Yes without details", { fixed_conditions: [{ key: "WARRANTY", enabled: true }] }, /Warranty details/],
    ["EMD Yes without choice", { fixed_conditions: [{ key: "EMD", enabled: true }] }, /EMD: choose/],
    ["EMD release without date", { fixed_conditions: [{ key: "EMD", enabled: true, release_or_adjust: "RELEASE" }] }, /release date is required/],
    ["milestones not 100 %", { payment_milestones: [{ percent: 60 }, { percent: 30 }] }, /total 100%/],
    ["security % above 100", { security_items: [{ type: "ABG", pct: 120 }] }, /check/i],
    ["security type outside SD/ABG/PBG", { security_items: [{ type: "XYZ", pct: 1 }] }, /check/i],
  ];
  for (const [label, patch, re] of rules) {
    const err = await throws(() => save({ ...base, oc_no: nextNo(), ...patch }));
    check(`rejects: ${label}`, re.test(err || ""), err);
  }
  check("detail fields may be blank when their Yes/No is No or blank",
    (await throws(() => save({ ...base, oc_no: nextNo(), po_wo_no: "PO-MOCK-003", penalty: { enabled: false }, fixed_conditions: [{ key: "DLP", enabled: null }], security_items: [], payment_milestones: [] }))) === null);
});

// Sign-off stamping across saves by different users.
const signOc = await asUser(IEV_USER, () => save({ ...base, oc_no: nextNo(), signoff: [{ slot: "SALES", signed_by: "Asha" }] }));
await asUser(OTHER_IEV_USER, () => save({ ...base, id: signOc.id, oc_no: signOc.oc_no, signoff: [{ slot: "SALES", signed_by: "Asha" }, { slot: "FINANCE", signed_by: "Ravi" }] }));
await db.exec("ALTER TABLE public.oc_signoff DISABLE TRIGGER oc_signoff_stamp");
await db.query("UPDATE public.oc_signoff SET signed_at = '2026-01-01T05:00:00Z' WHERE oc_id = $1", [signOc.id]);
await db.exec("ALTER TABLE public.oc_signoff ENABLE TRIGGER oc_signoff_stamp");
await asUser(OTHER_IEV_USER, async () => {
  await save({ ...base, id: signOc.id, oc_no: signOc.oc_no, signoff: [{ slot: "SALES", signed_by: " Asha " }, { slot: "FINANCE", signed_by: "Ravi Kumar" }] });
  const rows = Object.fromEntries((await db.query("SELECT slot, signed_by, signed_at::text AS at, signed_user_id FROM public.oc_signoff WHERE oc_id = $1", [signOc.id])).rows.map((r) => [r.slot, r]));
  check("an unchanged name keeps its original date, time and signer", rows.SALES.at.startsWith("2026-01-01") && rows.SALES.signed_user_id === IEV_USER, rows.SALES);
  check("a changed name is re-signed with the current time and account", !rows.FINANCE.at.startsWith("2026-01-01") && rows.FINANCE.signed_user_id === OTHER_IEV_USER && rows.FINANCE.signed_by === "Ravi Kumar", rows.FINANCE);

  await db.query("UPDATE public.oc_signoff SET signed_at = '2020-01-01', signed_user_id = $2 WHERE oc_id = $1 AND slot = 'SALES'", [signOc.id, OTHER_IEV_USER]);
  const forged = await one("SELECT signed_at::text AS at, signed_user_id FROM public.oc_signoff WHERE oc_id = $1 AND slot = 'SALES'", [signOc.id]);
  check("sign-off date and signer cannot be edited directly", forged.at.startsWith("2026-01-01") && forged.signed_user_id === IEV_USER, forged);

  await save({ ...base, id: signOc.id, oc_no: signOc.oc_no, signoff: [{ slot: "SALES", signed_by: "Asha" }] });
  const left = (await db.query("SELECT slot FROM public.oc_signoff WHERE oc_id = $1", [signOc.id])).rows.map((r) => r.slot).join();
  check("clearing a name removes that signature", left === "SALES", left);
});

// Only the assigned person signs their box.
const asgOc = await asUser(OTHER_IEV_USER, () => save({ ...base, oc_no: nextNo(), signoff: [] }));
await asUser(OTHER_IEV_USER, async () => {
  const err = await throws(() => save({ ...base, id: asgOc.id, oc_no: asgOc.oc_no, signoff: [{ slot: "SALES", signed_by: "Ravi" }] }));
  check("someone else cannot sign a box assigned to 8982", /Only Asha Mehta \(8982\) can sign the Sales & Commercial Department box/.test(err || ""), err);
  const none = await throws(() => save({ ...base, id: asgOc.id, oc_no: asgOc.oc_no, signoff: [{ slot: "PLANNING", signed_by: "Ravi" }] }));
  check("a box with no one assigned cannot be signed", /No one is assigned to sign the Planning Department box/.test(none || ""), none);
});
await asUser(IEV_USER, async () => {
  const ok = await throws(() => save({ ...base, id: asgOc.id, oc_no: asgOc.oc_no, signoff: [{ slot: "SALES", signed_by: "Asha Mehta" }] }));
  check("employee 8982 can sign their assigned box", ok === null, ok);
  const fin = await throws(() => save({ ...base, id: asgOc.id, oc_no: asgOc.oc_no, signoff: [{ slot: "SALES", signed_by: "Asha Mehta" }, { slot: "FINANCE", signed_by: "Asha" }] }));
  check("employee 8982 cannot sign a box assigned to someone else", /Only Ravi Shah \(7001\)/.test(fin || ""), fin);
  const head = await throws(() => save({ ...base, id: asgOc.id, oc_no: asgOc.oc_no, signoff: [{ slot: "SALES", signed_by: "Asha Mehta" }, { slot: "IEV_HEAD", signed_by: "Asha" }] }));
  check("employee 8982 cannot sign an unassigned box", /No one is assigned/.test(head || ""), head);
});
await asUser(OTHER_IEV_USER, async () => {
  const keep = await throws(() => save({ ...base, id: asgOc.id, oc_no: asgOc.oc_no, remarks: "edited", signoff: [{ slot: "SALES", signed_by: "Asha Mehta" }] }));
  check("others can still edit the OC while keeping 8982's signature", keep === null, keep);
  const clear = await throws(() => save({ ...base, id: asgOc.id, oc_no: asgOc.oc_no, signoff: [] }));
  check("others cannot clear 8982's signature", /Only Asha Mehta/.test(clear || ""), clear);
  const del = await throws(() => db.query("DELETE FROM public.oc_master WHERE id = $1", [asgOc.id]));
  check("an OC with assigned signatures can still be deleted", del === null, del);
});

// Users given only the IEV Costing sub-item, and logins linked only through the Employee Master.
await db.query(assign, ["PLANNING", "6100", "Priya Nair"]);
await db.query(assign, ["IEV_HEAD", "8100", "Costing User"]);
await asUser(COSTING_ONLY, async () => {
  const seen = (await one("SELECT count(*)::int AS n FROM public.oc_signoff_assignees")).n;
  check("IEV Costing sub-item users can see the sign-off assignment", seen === 4, seen);
  const r = await throws(() => save({ ...base, oc_no: nextNo(), signoff: [{ slot: "IEV_HEAD", signed_by: "Costing User" }] }));
  check("IEV Costing sub-item users can save an OC and sign their assigned box", r === null, r);
  const listed = (await one("SELECT count(*)::int AS n FROM public.oc_master")).n;
  check("IEV Costing sub-item users can see OCs", listed > 0, listed);
});
await asUser(MASTER_LINKED, async () => {
  const code = (await one("SELECT public.oc_current_employee_code() AS c")).c;
  check("employee code falls back to the Employee Master login link", code === "6100", code);
  const r = await throws(() => save({ ...base, oc_no: nextNo(), signoff: [{ slot: "PLANNING", signed_by: "Priya Nair" }] }));
  check("a login linked through the Employee Master can sign its assigned box", r === null, r);
});

for (const [uid, label] of [[FTC_DEPT, "IEV department team (Projects-FTC)"], [MODULE_CASE, "IEV module in another case (FireTender)"]]) {
  await asUser(uid, async () => {
    const r = await throws(() => save({ ...base, oc_no: nextNo(), signoff: [] }));
    check(`${label} users can save an OC`, r === null, r);
  });
}
await asUser(MFG_ONLY, async () => {
  const r = await throws(() => save({ ...base, oc_no: nextNo(), signoff: [] }));
  check("IEV Manufacturing-only users cannot save an OC", /do not have access/i.test(r || ""), r);
});

await asUser(SALES_USER, async () => {
  const opts = await throws(() => db.query("SELECT * FROM public.oc_employee_options()"));
  check("users without IEV access cannot list employees", /do not have access/.test(opts || ""), opts);
  const err = await throws(() => save({ ...base, oc_no: nextNo(), signoff: [] }));
  check("user without IEV access cannot save OCs", /do not have access/.test(err || ""), err);
  const rows = (await db.query("SELECT count(*)::int AS n FROM public.oc_master")).rows[0].n;
  check("user without IEV access sees no OCs", rows === 0, rows);
});

// Only the Finance Department fills the OC No. IEV_USER is 8982 (Sales); OTHER_IEV_USER is 7001 (Finance).
check("finance OC No. migration applies", (await throws(() => db.exec(upFinance))) === null);
check("finance OC No. migration is re-runnable", (await throws(() => db.exec(upFinance))) === null);
const noSign = { ...base, signoff: [] };
const FIN_RULE = /Only the Finance Department can fill or change the OC No\./;
let pending;
await asUser(IEV_USER, async () => {
  const fin = (await one("SELECT public.oc_current_user_is_finance() AS f")).f;
  check("a Sales Department user is not Finance", fin === false, fin);
  pending = await save({ ...noSign, oc_no: "" });
  check("non-Finance users can save without an OC No.", pending?.id && pending.oc_no === null, pending);
  const typed = await throws(() => save({ ...noSign, oc_no: "OC/FIN/NOPE" }));
  check("non-Finance users cannot fill the OC No. on a new entry", FIN_RULE.test(typed || ""), typed);
  const edit = await throws(() => save({ ...noSign, id: pending.id, oc_no: "", remarks: "edited by sales" }));
  check("non-Finance users can still edit the rest of the entry", edit === null, edit);
  const fill = await throws(() => save({ ...noSign, id: pending.id, oc_no: "OC/FIN/NOPE" }));
  check("non-Finance users cannot fill the OC No. later", FIN_RULE.test(fill || ""), fill);
  const direct = await throws(() => db.query("UPDATE public.oc_master SET oc_no = 'OC/FIN/DIRECT' WHERE id = $1", [pending.id]));
  check("the Finance rule also applies to direct table changes", FIN_RULE.test(direct || ""), direct);
});
await asUser(OTHER_IEV_USER, async () => {
  const fin = (await one("SELECT public.oc_current_user_is_finance() AS f")).f;
  check("an Employee Master Finance Department person is Finance", fin === true, fin);
  const r = await throws(() => save({ ...noSign, id: pending.id, oc_no: " OC/FIN/001 " }));
  check("Finance can fill the OC No.", r === null, r);
  const stored = (await one("SELECT oc_no FROM public.oc_master WHERE id = $1", [pending.id])).oc_no;
  check("the OC No. is stored trimmed", stored === "OC/FIN/001", stored);
  const dup = await throws(() => save({ ...noSign, oc_no: "oc/fin/001" }));
  check("OC numbers stay unique for Finance too", /already used/.test(dup || ""), dup);
});
await asUser(FIN_TEAM, async () => {
  const r = await throws(() => save({ ...noSign, id: pending.id, oc_no: "OC/FIN/002" }));
  check("a user whose team is Finance/Accounts can change the OC No.", r === null, r);
});
await asUser(IEV_USER, async () => {
  const same = await throws(() => save({ ...noSign, id: pending.id, oc_no: "OC/FIN/002", remarks: "sales edit after finance" }));
  check("non-Finance users can save an entry whose OC No. Finance filled", same === null, same);
  const change = await throws(() => save({ ...noSign, id: pending.id, oc_no: "OC/FIN/003" }));
  check("non-Finance users cannot change an OC No. Finance filled", FIN_RULE.test(change || ""), change);
  const clear = await throws(() => save({ ...noSign, id: pending.id, oc_no: "" }));
  check("non-Finance users cannot clear an OC No. Finance filled", FIN_RULE.test(clear || ""), clear);
});
// Page-wise IEV Costing access from User Management.
const hasAccess = async (uid) => asUser(uid, async () => (await one("SELECT public.oc_current_user_has_access() AS a")).a);
check("before the page migration the PO At Glance page alone gives no access", (await hasAccess(PAGE_OC)) === false);
check("page access migration applies", (await throws(() => db.exec(upPageAccess))) === null);
check("page access migration is re-runnable", (await throws(() => db.exec(upPageAccess))) === null);
await asUser(PAGE_OC, async () => {
  const r = await throws(() => save({ ...noSign, oc_no: "" }));
  check("users given only the PO At Glance page can save an entry", r === null, r);
});
await asUser(PAGE_QUOTE, async () => {
  const r = await throws(() => save({ ...noSign, oc_no: "" }));
  check("users given only the Quotation page cannot save PO At Glance", /do not have access/i.test(r || ""), r);
});
check("IEV Costing sub-item users keep access after the page migration", (await hasAccess(COSTING_ONLY)) === true);
check("IEV Manufacturing-only users still have no access", (await hasAccess(MFG_ONLY)) === false);
check("page access rollback applies", (await throws(() => db.exec(downPageAccess))) === null);
check("after the page rollback the PO At Glance page alone gives no access", (await hasAccess(PAGE_OC)) === false);

await db.exec("DELETE FROM public.oc_master WHERE oc_no IS NULL");
check("finance OC No. rollback applies", (await throws(() => db.exec(downFinance))) === null);
await asUser(IEV_USER, async () => {
  const r = await throws(() => save({ ...noSign, oc_no: "" }));
  check("after rollback the OC No. is required again", /OC No\. is required/.test(r || ""), r);
});

check("app-matching access rollback applies", (await throws(() => db.exec(downMatch))) === null);
check("access follow-up rollback applies", (await throws(() => db.exec(downFix))) === null);
check("rollback applies", (await throws(() => db.exec(down))) === null);
const left = (await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'oc\\_%'")).rows[0].n;
check("rollback removes every oc_ table", left === 0, left);

// A database created with the first version (file-upload sign-off, system OC numbers), then upgraded.
db = new PGlite();
await db.exec(SETUP);
await db.exec(legacyV1);
await db.exec("INSERT INTO public.oc_number_series (fy, last_seq) VALUES ('26/27', 1)");
const legacy = (await one(`
  INSERT INTO public.oc_master (oc_no, client_name, po_wo_no, po_date, project_description, delivery_date, contract_value)
  VALUES ('IFSPL-IEV-OCC-26/27-00001', 'Old Client', 'PO-OLD', '2026-10-01', 'Old job', '2026-12-31', 100)
  RETURNING id`)).id;
await db.query(`INSERT INTO public.oc_signoff (oc_id, slot, signed_by, signed_on) VALUES ($1, 'SALES', 'Old Name', '2026-10-05'), ($1, 'PLANNING', NULL, NULL)`, [legacy]);
check("upgrade: current OC migration applies over the first version", (await throws(() => db.exec(up))) === null);
check("upgrade: access migrations apply", (await throws(() => db.exec(upFix + upMatch))) === null);
check("upgrade: schema repair applies", (await throws(() => db.exec(upRepair))) === null);
check("upgrade: schema repair is re-runnable", (await throws(() => db.exec(upRepair))) === null);
const legacyRows = (await db.query("SELECT slot, signed_by, to_char(signed_at, 'YYYY-MM-DD') AS d FROM public.oc_signoff ORDER BY slot")).rows;
check("upgrade: old signatures keep their date; empty old boxes are removed",
  JSON.stringify(legacyRows) === JSON.stringify([{ slot: "SALES", signed_by: "Old Name", d: "2026-10-05" }]), legacyRows);
await db.query(assign, ["FINANCE", "8982", "Asha Mehta"]);
await asUser(IEV_USER, async () => {
  const r = await throws(() => save({ ...base, oc_no: "OC/MANUAL/001", signoff: [{ slot: "FINANCE", signed_by: "Asha Mehta" }] }));
  check("upgrade: a typed-in OC No. saves and the assigned user can sign", r === null, r);
  const stamped = await one("SELECT signed_at IS NOT NULL AS ok, signed_user_id = auth.uid() AS mine FROM public.oc_signoff WHERE slot = 'FINANCE'");
  check("upgrade: the signature is stamped with date/time and signer", stamped?.ok && stamped?.mine, stamped);
  const again = await throws(() => save({ ...base, id: legacy, oc_no: "IFSPL-IEV-OCC-26/27-00001", signoff: [{ slot: "SALES", signed_by: "Old Name" }] }));
  check("upgrade: an old OC re-saves with its existing signature unchanged", again === null, again);
});
check("upgrade: finance OC No. migration applies", (await throws(() => db.exec(upFinance))) === null);
await asUser(IEV_USER, async () => {
  const again = await throws(() => save({ ...base, id: legacy, oc_no: "IFSPL-IEV-OCC-26/27-00001", signoff: [{ slot: "SALES", signed_by: "Old Name" }] }));
  check("upgrade: non-Finance users can re-save an old OC with its existing OC No.", again === null, again);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
