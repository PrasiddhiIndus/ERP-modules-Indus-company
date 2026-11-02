#!/usr/bin/env node
/**
 * One-shot UI atlas route inventory generator.
 * Writes report to stdout and tmp_ui_atlas_inventory.md
 */
import fs from "fs";
import path from "path";

const root = "/Users/rahul.ifspl/Indus/ERP-modules-Indus-company";

function resolveSrc(rel) {
  // ../pages/Foo -> src/pages/Foo
  if (rel.startsWith("../")) return "src/" + rel.slice(3);
  if (rel.startsWith("./")) return "src/routes/" + rel.slice(2);
  return rel;
}

function findPageFile(srcHint) {
  if (!srcHint) return null;
  const base = path.join(root, srcHint);
  for (const ext of [".jsx", ".js", ".tsx", ".ts", ""]) {
    const p = base.endsWith(ext) && ext ? base : base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return path.relative(root, p);
    }
  }
  // try index
  for (const ext of [".jsx", ".js"]) {
    const p = path.join(base, "index" + ext);
    if (fs.existsSync(p)) return path.relative(root, p);
  }
  return srcHint;
}

function lineCount(relFile) {
  if (!relFile) return null;
  const abs = path.join(root, relFile);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  const txt = fs.readFileSync(abs, "utf8");
  return txt.split("\n").length;
}

function usesErpUi(relFile) {
  if (!relFile) return false;
  const abs = path.join(root, relFile);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return false;
  const txt = fs.readFileSync(abs, "utf8");
  return /from\s+['"][^'"]*components\/erpUi/.test(txt) || /from\s+['"]@\/components\/erpUi/.test(txt);
}

// ---- lazyPages map ----
const lazySrc = fs.readFileSync(path.join(root, "src/routes/lazyPages.jsx"), "utf8");
const lazyMap = {};

for (const m of lazySrc.matchAll(
  /export\s+\{\s*default\s+as\s+(\w+)\s*\}\s+from\s+["']([^"']+)["']/g
)) {
  lazyMap[m[1]] = resolveSrc(m[2]);
}

for (const m of lazySrc.matchAll(
  /export\s+const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\(["']([^"']+)["']\)\)/g
)) {
  lazyMap[m[1]] = resolveSrc(m[2]);
}

for (const m of lazySrc.matchAll(
  /export\s+const\s+(\w+)\s*=\s*lazyNamed\(\(\)\s*=>\s*import\(["']([^"']+)["']\)\s*,\s*["'](\w+)["']\)/g
)) {
  lazyMap[m[1]] = resolveSrc(m[2]);
}

// Local redirect helpers in App.jsx
lazyMap.RedirectEmployeeMasterId = "src/App.jsx";
lazyMap.SalaryMasterCtcRedirect = "src/App.jsx";
lazyMap.IevConfigGuard = "src/pages/projects/configurationTender/IevConfigGuard.jsx";
lazyMap.SalaryAdminGuard = "src/pages/adminOperations/salaryAdmin/SalaryAdminGuard.jsx";
lazyMap.RulesConsoleGuard = "src/pages/adminOperations/rulesConsole/RulesConsoleGuard.jsx";
lazyMap.ComplianceGuard = "src/pages/compliance/payroll/ComplianceGuard.jsx";
lazyMap.Layout = "src/contexts/Layout.jsx";
lazyMap.ProtectedRoute = "src/components/ProtectedRoute.jsx";

// ---- Parse App.jsx routes ----
const appSrc = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");

function extractElement(el) {
  if (!el) return { type: "none", name: null };
  if (el.includes("<Navigate")) {
    const toIdx = el.indexOf("to=");
    let to = "?";
    if (toIdx >= 0) {
      const slice = el.slice(toIdx + 3).trim();
      const qStart = slice[0] === "{" ? 1 : 0;
      const quote = slice[qStart];
      if (quote === '"' || quote === "'" || quote === "`") {
        const start = qStart + 1;
        const end = slice.indexOf(quote, start);
        if (end > start) to = slice.slice(start, end);
      }
    }
    return { type: "Navigate", name: "Navigate", to };
  }
  const comps = [...el.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((x) => x[1]);
  const guards = comps.filter((c) => /Guard$/.test(c));
  const pages = comps.filter((c) => !/Guard$/.test(c) && c !== "Navigate");
  const name = pages[pages.length - 1] || comps[0] || null;
  return { type: "component", name, guards };
}


// Flatten Route JSX by normalizing whitespace for multi-line tags
let src = appSrc;
// Extract only the Routes block
const routesBlockM = src.match(/<Routes>([\s\S]*?)<\/Routes>/);
if (!routesBlockM) {
  console.error("No <Routes> found");
  process.exit(1);
}
let block = routesBlockM[1];

// Normalize multi-line Route tags into single lines carefully
// Strategy: replace newlines inside tags with spaces for Route openings
block = block.replace(/<Route\b[\s\S]*?(?:\/>|>)/g, (tag) => tag.replace(/\s+/g, " "));

const routes = [];
const stack = []; // { path }

const tokens = [];
const re = /<\/?Route\b[^>]*\/?>/g;
let tm;
while ((tm = re.exec(block))) {
  tokens.push(tm[0]);
}

for (const tok of tokens) {
  if (tok.startsWith("</Route")) {
    stack.pop();
    continue;
  }
  const selfClosing = /\/>$/.test(tok);
  const isIndex = /\bindex\b/.test(tok);
  const pathM = tok.match(/\bpath=["']([^"']+)["']/);
  const elM = tok.match(/\belement=\{([\s\S]*)\}\s*\/?>$/);
  let elStr = null;
  if (elM) elStr = elM[1].trim();
  else {
    // element={...} may end before />
    const elM2 = tok.match(/\belement=\{(.+)\}\s*(?:\/>|>)$/);
    if (elM2) elStr = elM2[1].trim();
  }

  const parent = stack.length ? stack[stack.length - 1].path : "";
  let fullPath;
  if (isIndex) {
    fullPath = parent || "/";
  } else if (pathM) {
    const seg = pathM[1];
    if (seg.startsWith("/")) fullPath = seg;
    else if (parent) fullPath = `${parent}/${seg}`;
    else fullPath = `/${seg}`;
  } else {
    fullPath = parent || "/";
  }
  fullPath = fullPath.replace(/\/{2,}/g, "/");
  if (fullPath.length > 1 && fullPath.endsWith("/")) fullPath = fullPath.slice(0, -1);

  const info = extractElement(elStr);
  routes.push({
    path: fullPath,
    index: isIndex,
    elementName: info.name,
    elementType: info.type,
    navigateTo: info.to || null,
    guards: info.guards || [],
    parent,
  });

  if (!selfClosing) {
    // nested route: push path for children
    if (isIndex) {
      stack.push({ path: parent });
    } else if (pathM) {
      const seg = pathM[1];
      const next = seg.startsWith("/")
        ? seg
        : parent
          ? `${parent}/${seg}`
          : `/${seg}`;
      stack.push({ path: next.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/" });
    } else {
      stack.push({ path: parent });
    }
  }
}

// Enrich with source / lines / erpUi
const enriched = routes.map((r) => {
  const name = r.elementName;
  let source = name && lazyMap[name] ? findPageFile(lazyMap[name]) : null;
  // Resolve extension
  if (source && !/\.(jsx|js|tsx|ts)$/.test(source)) {
    source = findPageFile(source) || source;
  }
  const lines = source ? lineCount(source) : null;
  const erpUi = source ? usesErpUi(source) : false;
  let notes = [];
  if (r.elementType === "Navigate") notes.push(`redirect → ${r.navigateTo}`);
  if (r.index) notes.push("index");
  if (r.guards?.length) notes.push(`guard: ${r.guards.join(",")}`);
  if (r.path.includes("*")) notes.push("splat");
  return {
    path: r.path,
    component: name || (r.elementType === "Navigate" ? "Navigate" : "?"),
    source: source || "",
    lines: lines ?? "",
    erpUi: erpUi ? "Y" : "N",
    notes: notes.join("; "),
    type: r.elementType,
  };
});

// Deduplicate exact path+component while keeping all distinct paths
const seen = new Set();
const flat = [];
for (const row of enriched) {
  const key = `${row.path}|${row.component}|${row.notes}`;
  if (seen.has(key)) continue;
  seen.add(key);
  flat.push(row);
}

// ---- Sidebar from Layout.jsx (heuristic) + NAV_MODULE_TREE ----
const layoutSrc = fs.readFileSync(path.join(root, "src/contexts/Layout.jsx"), "utf8");
const rolesSrc = fs.readFileSync(path.join(root, "src/config/roles.js"), "utf8");

// Extract NAV_MODULE_TREE entries via regex on pathPrefix / label blocks
const navModules = [];
const treeStart = rolesSrc.indexOf("export const NAV_MODULE_TREE");
const treeEnd = rolesSrc.indexOf("export const MODULES", treeStart);
const treeBlock = rolesSrc.slice(treeStart, treeEnd);
// Split top-level modules by value/label pairs at depth
const modRe =
  /\{\s*value:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"\s*,\s*subModules:\s*\[([\s\S]*?)\]\s*,?\s*\}/g;
let mm;
while ((mm = modRe.exec(treeBlock))) {
  const value = mm[1];
  const label = mm[2];
  const subBlock = mm[3];
  const children = [];
  // simple pathPrefix entries
  for (const sm of subBlock.matchAll(
    /\{\s*value:\s*([^,]+)\s*,\s*label:\s*"([^"]+)"\s*,\s*pathPrefix:\s*([^,}]+)/g
  )) {
    let pathPrefix = sm[3].trim();
    // resolve constants
    if (pathPrefix.startsWith('"') || pathPrefix.startsWith("'")) {
      pathPrefix = pathPrefix.slice(1, -1);
    } else {
      // constant reference — look up
      const constM = rolesSrc.match(
        new RegExp(`(?:export\\s+)?const\\s+${pathPrefix}\\s*=\\s*["']([^"']+)["']`)
      );
      pathPrefix = constM ? constM[1] : pathPrefix;
    }
    let subValue = sm[1].trim();
    if (subValue.startsWith('"')) subValue = subValue.slice(1, -1);
    children.push({ value: subValue, label: sm[2], path: pathPrefix });
  }
  navModules.push({ value, label, children });
}

// Layout sidebar link scan: to: "/app/..." or path: "/app/..." near labels
const layoutLinks = [];
for (const m of layoutSrc.matchAll(
  /(?:to|path|href|pathPrefix)\s*[:=]\s*["'`](\/app\/[^"'`]+)["'`]/g
)) {
  layoutLinks.push(m[1]);
}
const uniqueLayoutLinks = [...new Set(layoutLinks)].sort();

// Also grab label strings near nav items - section headers
const sidebarSections = [];
for (const m of layoutSrc.matchAll(
  /(?:label|title|name|section)\s*[:=]\s*["']([^"']{2,60})["']/g
)) {
  sidebarSections.push(m[1]);
}

// ---- Page files under src/pages ----
function walkJsx(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      walkJsx(p, acc);
    } else if (/\.jsx$/.test(ent.name)) {
      acc.push(p);
    }
  }
  return acc;
}

const pagesRoot = path.join(root, "src/pages");
const pageFiles = walkJsx(pagesRoot);
const byModule = {};
for (const abs of pageFiles) {
  const rel = path.relative(pagesRoot, abs);
  const top = rel.split(path.sep)[0];
  if (!byModule[top]) byModule[top] = [];
  const lines = fs.readFileSync(abs, "utf8").split("\n").length;
  const erp = usesErpUi(path.relative(root, abs));
  byModule[top].push({
    file: path.relative(root, abs),
    lines,
    erpUi: erp ? "Y" : "N",
  });
}
for (const k of Object.keys(byModule)) {
  byModule[k].sort((a, b) => a.file.localeCompare(b.file));
}

// Screen type heuristic from filename / path
function screenType(row) {
  const p = `${row.path} ${row.component} ${row.source}`.toLowerCase();
  if (row.type === "Navigate") return "redirect";
  if (/dashboard/.test(p)) return "dashboard";
  if (/tracker|tracking|worklist/.test(p)) return "tracker";
  if (/master|directory|list|database|candidates|employees|invoices|reports/.test(p))
    return "list";
  if (/form|create|entry|new|edit|detail|profile|calculator|process|compose/.test(p))
    return "form";
  if (/settings|configuration|config|rules|formula/.test(p)) return "settings";
  if (/portal/.test(p)) return "portal";
  return "screen";
}

// ---- Build markdown report ----
const linesOut = [];
const L = (s = "") => linesOut.push(s);

L("# Indus ERP — Complete UI Route Inventory");
L();
L(`_Generated: ${new Date().toISOString()}_`);
L();
L("## 1. System overview");
L();
L("- **Stack:** React (Vite) + React Router v6/v7 flags, Supabase backend, Tailwind-style utility classes.");
L("- **Shell:** `ProtectedRoute` → `Layout` (`src/contexts/Layout.jsx`) under `/app/*`; public auth routes outside.");
L("- **Code-splitting:** Almost all pages via `src/routes/lazyPages.jsx` (`lazyWithRetry`).");
L("- **Design system:** Admin Ops primitives in `src/pages/adminOperations/components/AdminUi.jsx`; shared `src/components/erpUi` (migration in progress). Role/nav source of truth: `NAV_MODULE_TREE` in `src/config/roles.js`.");
L(`- **Route count (App.jsx):** ${flat.length} declared routes (including redirects/index/splats).`);
L(`- **Lazy exports mapped:** ${Object.keys(lazyMap).length}.`);
L(`- **Page .jsx files under src/pages:** ${pageFiles.length}.`);
L();
L("## 2. Sidebar modules (NAV_MODULE_TREE)");
L();
L("Sidebar labels and path prefixes (kept in sync with Layout). Nested tabModules omitted unless they have their own pathPrefix.");
L();
for (const mod of navModules) {
  L(`### ${mod.label} (\`${mod.value}\`)`);
  if (!mod.children.length) {
    L("- _(no subModules)_");
  } else {
    for (const c of mod.children) {
      L(`- **${c.label}** → \`${c.path}\` (\`${c.value}\`)`);
    }
  }
  L();
}
L("### Extra Layout deep-links found (unique `/app/...` string literals)");
L();
for (const link of uniqueLayoutLinks) {
  L(`- \`${link}\``);
}
L();
L("## 3. FULL flat route table");
L();
L("| Path | Page component | Source file | Lines | erpUi | Notes | UI kind |");
L("|---|---|---|---:|:---:|---|---|");
for (const row of flat) {
  const kind = screenType(row);
  L(
    `| \`${row.path}\` | ${row.component} | \`${row.source || "—"}\` | ${row.lines || "—"} | ${row.erpUi} | ${row.notes || ""} | ${kind} |`
  );
}
L();
L("## 4. Module-by-module page files (src/pages)");
L();
for (const top of Object.keys(byModule).sort()) {
  const files = byModule[top];
  const erpY = files.filter((f) => f.erpUi === "Y").length;
  L(`### \`src/pages/${top}/\` — ${files.length} .jsx files (${erpY} with erpUi)`);
  L();
  L("| File | Lines | erpUi |");
  L("|---|---:|:---:|");
  for (const f of files) {
    L(`| \`${f.file}\` | ${f.lines} | ${f.erpUi} |`);
  }
  L();
}

L("## 5. Module screen summaries (routed surfaces)");
L();

function summarizeModule(title, pathPrefix) {
  const rows = flat.filter(
    (r) =>
      r.path === pathPrefix ||
      r.path.startsWith(pathPrefix + "/") ||
      (pathPrefix === "/app" && r.path.startsWith("/app"))
  );
  const real = rows.filter((r) => r.type !== "Navigate");
  L(`### ${title}`);
  L(`- Paths: ${rows.length} (${real.length} screens, ${rows.length - real.length} redirects)`);
  const kinds = {};
  for (const r of real) {
    const k = screenType(r);
    kinds[k] = (kinds[k] || 0) + 1;
  }
  L(`- Mix: ${Object.entries(kinds).map(([k, v]) => `${k}=${v}`).join(", ") || "—"}`);
  const samples = real.slice(0, 12).map((r) => `\`${r.path}\``).join(", ");
  if (samples) L(`- Examples: ${samples}${real.length > 12 ? ", …" : ""}`);
  L();
}

const summaryGroups = [
  ["Public / auth", "/"],
  ["App shell / dashboard", "/app/dashboard"],
  ["IEV / Fire tender", "/app/fire-tender"],
  ["Manpower / Commercial MT", "/app/manpower"],
  ["Commercial MT shell", "/app/commercial/manpower-training"],
  ["Commercial RM/AMC/IEV", "/app/commercial/rm-mm-amc-iev"],
  ["HR", "/app/hr"],
  ["Attendance", "/app/attendance"],
  ["People management", "/app/people-management"],
  ["Compliance", "/app/compliance"],
  ["IFSP employee compliance", "/app/ifsp-employee-compliance"],
  ["Admin ops", "/app/admin"],
  ["Billing", "/app/billing"],
  ["Operations", "/app/operations"],
  ["Projects", "/app/projects"],
  ["Projects management/billing", "/app/projects-"],
  ["Procurement", "/app/procurement"],
  ["AMC", "/app/amc"],
  ["Finance", "/app/accounts-finance"],
  ["Marketing", "/app/marketing"],
  ["Maintenance", "/app/maintenance"],
  ["CRM outreach", "/app/crm-outreach"],
  ["IT/IS", "/app/api-health"],
  ["Software subscriptions", "/app/software-subscriptions-reminders"],
  ["User management", "/app/user-management"],
  ["All employees", "/app/all-employees"],
  ["Settings", "/app/settings"],
  ["Store / Gate legacy", "/app/store-inventory"],
];

for (const [title, prefix] of summaryGroups) {
  if (prefix === "/") {
    const rows = flat.filter((r) => !r.path.startsWith("/app"));
    L(`### ${title}`);
    L(`- Paths: ${rows.length}`);
    for (const r of rows) L(`  - \`${r.path}\` → ${r.component}${r.notes ? ` (${r.notes})` : ""}`);
    L();
    continue;
  }
  if (prefix === "/app/projects-") {
    const rows = flat.filter(
      (r) =>
        r.path.startsWith("/app/projects-management") ||
        r.path.startsWith("/app/projects-billing")
    );
    L(`### ${title}`);
    L(`- Paths: ${rows.length}`);
    for (const r of rows) L(`  - \`${r.path}\` → ${r.component}`);
    L();
    continue;
  }
  summarizeModule(title, prefix);
}

const md = linesOut.join("\n");
const outPath = path.join(root, "tmp_ui_atlas_inventory.md");
fs.writeFileSync(outPath, md);
fs.writeFileSync(
  path.join(root, "tmp_ui_atlas_inventory.json"),
  JSON.stringify(
    { routeCount: flat.length, routes: flat, navModules, byModule, lazyMap },
    null,
    2
  )
);

console.log("ROUTES", flat.length);
console.log("NAV_MODULES", navModules.length);
console.log("PAGE_FILES", pageFiles.length);
console.log("WROTE", outPath);
console.log("MISSING_SOURCE", flat.filter((r) => r.type === "component" && !r.source).map((r) => r.component));
