/**
 * Ports the Indus Payroll prototype UI into the HR module.
 * Source (local, not committed): Indus_Payroll_source / indus-payroll / app.html
 * Does not copy seed.json or work/ (those hold real employee and bank data).
 */
import fs from "fs";
import path from "path";

const proto = process.argv[2] || "C:\\Users\\Admin\\Downloads\\Indus_Payroll_source (1)\\indus-payroll";
const outDir = path.resolve("src/pages/hr/payroll/indus");
const runtimeDir = path.join(outDir, "runtime");
fs.mkdirSync(runtimeDir, { recursive: true });

for (const name of ["engine.js", "structure.js", "sites.js"]) {
  fs.copyFileSync(path.join(proto, name), path.join(runtimeDir, name));
}

const html = fs.readFileSync(path.join(proto, "app.html"), "utf8");
const style = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
const scriptStart = html.indexOf("'use strict';");
const scriptEnd = html.lastIndexOf("</script>");
let js = html.slice(scriptStart, scriptEnd);

function matchBrace(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("Unbalanced CSS");
}

function scopeCss(css, scope) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) {
      out += css[i];
      i++;
    }
    if (i >= css.length) break;
    if (css.startsWith("@keyframes", i) || css.startsWith("@-webkit-keyframes", i)) {
      const brace = css.indexOf("{", i);
      const end = matchBrace(css, brace);
      out += css.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (css.startsWith("@media", i)) {
      const brace = css.indexOf("{", i);
      const end = matchBrace(css, brace);
      const head = css.slice(i, brace);
      const inner = css.slice(brace + 1, end);
      out += head + "{" + scopeCss(inner, scope) + "}";
      i = end + 1;
      continue;
    }
    const brace = css.indexOf("{", i);
    if (brace < 0) {
      out += css.slice(i);
      break;
    }
    const selectors = css.slice(i, brace).trim();
    const end = matchBrace(css, brace);
    const body = css.slice(brace, end + 1);
    if (selectors) {
      const scoped = selectors
        .split(",")
        .map((sel) => {
          const s = sel.trim();
          if (!s) return "";
          if (s === ":root" || s === "html" || s === "body" || s === "html,body") return scope;
          if (s.startsWith(scope)) return s;
          return `${scope} ${s}`;
        })
        .filter(Boolean)
        .join(",");
      out += scoped + body;
    }
    i = end + 1;
  }
  return out;
}

let css = scopeCss(style.replace(/\/\*[\s\S]*?\*\//g, ""), ".indus-payroll");
css = css.replace(
  ".indus-payroll .app{display:grid;grid-template-columns:232px 1fr;height:100vh}",
  ".indus-payroll .app{display:grid;grid-template-columns:232px 1fr;height:100%;min-height:0}"
);
css =
  `.indus-payroll{color-scheme:light;height:100%;min-height:0;overflow:hidden}\n` + css;
fs.writeFileSync(path.join(outDir, "indusPayroll.css"), css);

js = js.replaceAll("document.querySelectorAll(", "(payrollRoot() || document).querySelectorAll(");
js = js.replaceAll("document.querySelector(", "(payrollRoot() || document).querySelector(");
js = js.replaceAll("document.getElementById(", "gid(");
js = js.replace(
  "const $ = s => (payrollRoot() || document).querySelector(s);",
  `const payrollRoot = () => document.getElementById('indus-payroll-root');
const $ = s => { const r = payrollRoot(); return r ? r.querySelector(s) : null; };
function gid(id) { const r = payrollRoot(); if (!r) return null; return r.querySelector('[id="' + String(id).replace(/"/g, '') + '"]'); }
function setDb(cls, text) { const el = gid('dbstate'); if (!el) return; el.className = 'dbs ' + cls; el.innerHTML = '<i></i>' + text; }`
);
js = js.replaceAll("document.body.appendChild(", "(payrollRoot() || document.body).appendChild(");
js = js.replace(
  "$('#dbstate').outerHTML = '<span id=\"dbstate\" class=\"dbs bad\"><i></i>Database not available</span>'",
  "setDb('bad', 'Database not available')"
);
js = js.replace(
  "$('#dbstate').outerHTML = '<span id=\"dbstate\" class=\"dbs warn\"><i></i>Data not reachable yet</span>'",
  "setDb('warn', 'Data not reachable yet')"
);
js = js.replace(
  "$('#dbstate').outerHTML = '<span id=\"dbstate\" class=\"dbs ok\"><i></i>All changes saved</span>'",
  "setDb(S.db && S.db.ephemeral ? 'warn' : 'ok', S.db && S.db.ephemeral ? 'Saved in this session only' : 'All changes saved')"
);
js = js.replace(
  "$('#dbstate').outerHTML = '<span id=\"dbstate\" class=\"dbs bad\"><i></i>No access to payroll data</span>'",
  "setDb('bad', 'No access to payroll data')"
);
js = js.replace(
  "function render() {\n  renderNav();",
  "function render() {\n  if (!$('#nav')) return;\n  renderNav();"
);
js = js.replace(
  "function go(v, extra) { S.view = v; Object.assign(S, extra || {}); try { location.hash = v; } catch (e) { } render(); }",
  "function go(v, extra) { S.view = v; Object.assign(S, extra || {}); try { if (window.__indusPayrollOnView) window.__indusPayrollOnView(v); } catch (e) { } render(); }"
);
js = js.replace(
  "${!hrIn && demoable.length ? '<button class=\"btn sm\" id=\"hr_demo_all\">Prototype: load demo HR attendance</button>' : ''}",
  ""
);
js = js.replace(
  "${sample ? `<div class=\"small muted\" style=\"margin-top:10px\">Prototype: <a href=\"#\" id=\"hr_demo\">fill this site's HR attendance from the September sheet</a>, as the HR module would.</div>` : ''}",
  ""
);
js = js.replace(
  "${sample ? '<button class=\"btn sm\" id=\"usesample\">Use September 2026 attendance from the sheets</button>' : ''}",
  ""
);
js = js.replace(
  "run.status = 'LOCKED'; run.lockedAt = new Date().toISOString();",
  "run.status = 'LOCKED'; run.lockedAt = new Date().toISOString(); run.lockedBy = (S.user && (S.user.name || S.user.email)) || '';"
);
js = js.replace(
  "run.unlockLog = (run.unlockLog || []).concat({ at: new Date().toISOString() })",
  "run.unlockLog = (run.unlockLog || []).concat({ at: new Date().toISOString(), by: (S.user && (S.user.name || S.user.email)) || '' })"
);
js = js.replace(
  "doc.returnedBy = 'Payroll';",
  "doc.returnedBy = (S.user && (S.user.name || S.user.email)) || 'Payroll';"
);

const bootAt = js.indexOf("// ---------------- boot ----------------");
if (bootAt < 0) throw new Error("boot block not found");
js = js.slice(0, bootAt) + `// ---------------- boot ----------------
function __indusPayrollBoot(opts) {
  opts = opts || {};
  if (opts.user) S.user = opts.user;
  if (opts.view && NAV.some(function (n) { return n[0] === opts.view; })) S.view = opts.view;
  if (!S._monthSet) {
    var now = new Date();
    S.month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    S._monthSet = true;
  }
  var monthEl = $('#month');
  if (monthEl) {
    if (monthEl.value !== S.month) monthEl.value = S.month;
    if (!monthEl._bound) {
      monthEl._bound = true;
      monthEl.onchange = function (e) { S.month = e.target.value || S.month; render(); };
    }
  }
  render();
  if (!S._connected) { S._connected = true; connect(); }
}
window.__indusPayrollBoot = __indusPayrollBoot;
window.__indusPayrollSetView = function (v) {
  if (!v || v === S.view || !NAV.some(function (n) { return n[0] === v; })) return;
  S.view = v;
  render();
};
`;

fs.writeFileSync(path.join(runtimeDir, "app.js"), js);
console.log("css", css.length, "js", js.length);
