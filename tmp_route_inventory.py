#!/usr/bin/env python3
"""Complete UI atlas route inventory — brace-aware App.jsx Route parser."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/Users/rahul.ifspl/Indus/ERP-modules-Indus-company")


def resolve_src(rel: str) -> str:
    if rel.startswith("../"):
        return "src/" + rel[3:]
    if rel.startswith("./"):
        return "src/routes/" + rel[2:]
    return rel


def find_page_file(src_hint: str | None) -> str | None:
    if not src_hint:
        return None
    base = ROOT / src_hint
    for ext in (".jsx", ".js", ".tsx", ".ts", ""):
        p = base if (ext == "" or str(base).endswith(ext)) else Path(str(base) + ext)
        if p.is_file():
            return str(p.relative_to(ROOT))
    for ext in (".jsx", ".js"):
        p = base / f"index{ext}"
        if p.is_file():
            return str(p.relative_to(ROOT))
    return src_hint


def line_count(rel: str | None) -> int | None:
    if not rel:
        return None
    p = ROOT / rel
    if not p.is_file():
        return None
    return len(p.read_text(encoding="utf-8", errors="replace").splitlines())


def uses_erp_ui(rel: str | None) -> bool:
    if not rel:
        return False
    p = ROOT / rel
    if not p.is_file():
        return False
    txt = p.read_text(encoding="utf-8", errors="replace")
    return bool(
        re.search(r"""from\s+['"][^'"]*components/erpUi""", txt)
        or re.search(r"""from\s+['"]@/components/erpUi""", txt)
    )


# ---------- lazyPages ----------
lazy_src = (ROOT / "src/routes/lazyPages.jsx").read_text(encoding="utf-8")
lazy_map: dict[str, str] = {}

for m in re.finditer(
    r"""export\s+\{\s*default\s+as\s+(\w+)\s*\}\s+from\s+['"]([^'"]+)['"]""",
    lazy_src,
):
    lazy_map[m.group(1)] = resolve_src(m.group(2))

# multiline-friendly lazy(() => import("..."))
for m in re.finditer(
    r"""export\s+const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)\s*\)""",
    lazy_src,
    flags=re.DOTALL,
):
    lazy_map[m.group(1)] = resolve_src(m.group(2))

# multiline lazyNamed(() => import("..."), "Export")
for m in re.finditer(
    r"""export\s+const\s+(\w+)\s*=\s*lazyNamed\(\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)\s*,\s*['"](\w+)['"]\s*\)""",
    lazy_src,
    flags=re.DOTALL,
):
    lazy_map[m.group(1)] = resolve_src(m.group(2))

lazy_map.update(
    {
        "RedirectEmployeeMasterId": "src/App.jsx",
        "SalaryMasterCtcRedirect": "src/App.jsx",
        "IevConfigGuard": "src/pages/projects/configurationTender/IevConfigGuard.jsx",
        "SalaryAdminGuard": "src/pages/adminOperations/salaryAdmin/SalaryAdminGuard.jsx",
        "RulesConsoleGuard": "src/pages/adminOperations/rulesConsole/RulesConsoleGuard.jsx",
        "ComplianceGuard": "src/pages/compliance/payroll/ComplianceGuard.jsx",
        "Layout": "src/contexts/Layout.jsx",
        "ProtectedRoute": "src/components/ProtectedRoute.jsx",
        "Login": "src/pages/Login.jsx",
    }
)


# ---------- App.jsx brace-aware Route scan ----------
app_src = (ROOT / "src/App.jsx").read_text(encoding="utf-8")
m_routes = re.search(r"<Routes>([\s\S]*?)</Routes>", app_src)
if not m_routes:
    raise SystemExit("No <Routes> block")
block = m_routes.group(1)


def extract_element_info(el: str | None) -> dict:
    if not el:
        return {"type": "none", "name": None, "guards": [], "to": None}
    if "<Navigate" in el:
        to = "?"
        idx = el.find("to=")
        if idx >= 0:
            slice_ = el[idx + 3 :].lstrip()
            qstart = 1 if slice_[:1] == "{" else 0
            if len(slice_) > qstart and slice_[qstart] in "\"'`":
                quote = slice_[qstart]
                start = qstart + 1
                end = slice_.find(quote, start)
                if end > start:
                    to = slice_[start:end]
        return {"type": "Navigate", "name": "Navigate", "guards": [], "to": to}
    comps = re.findall(r"<([A-Z][A-Za-z0-9]*)\b", el)
    guards = [c for c in comps if c.endswith("Guard")]
    pages = [c for c in comps if not c.endswith("Guard") and c != "Navigate"]
    name = pages[-1] if pages else (comps[0] if comps else None)
    return {"type": "component", "name": name, "guards": guards, "to": None}


def parse_route_tags(src: str) -> list[dict]:
    """Return list of route dicts with correct nested absolute paths."""
    routes: list[dict] = []
    stack: list[str] = []  # parent absolute paths
    i = 0
    n = len(src)
    while i < n:
        # closing tag
        if src.startswith("</Route>", i):
            if stack:
                stack.pop()
            i += len("</Route>")
            continue

        if not src.startswith("<Route", i):
            i += 1
            continue

        # Must be <Route ...> or <Route .../> — char after "Route"
        after = i + len("<Route")
        if after < n and src[after] not in " \n\t/>":
            i += 1
            continue

        start = i
        i = after
        # Parse attributes until the Route tag's own closing > or />,
        # balancing {}, (), [], and quotes; ignore > inside those.
        brace = paren = bracket = 0
        in_s = in_d = in_bt = False
        escape = False
        tag_end = None
        self_closing = False
        while i < n:
            ch = src[i]
            if escape:
                escape = False
                i += 1
                continue
            if in_s or in_d or in_bt:
                if ch == "\\" and (in_s or in_d):
                    escape = True
                elif in_s and ch == "'":
                    in_s = False
                elif in_d and ch == '"':
                    in_d = False
                elif in_bt and ch == "`":
                    in_bt = False
                i += 1
                continue
            if ch == "'":
                in_s = True
                i += 1
                continue
            if ch == '"':
                in_d = True
                i += 1
                continue
            if ch == "`":
                in_bt = True
                i += 1
                continue
            if ch == "{":
                brace += 1
            elif ch == "}":
                brace -= 1
            elif ch == "(":
                paren += 1
            elif ch == ")":
                paren -= 1
            elif ch == "[":
                bracket += 1
            elif ch == "]":
                bracket -= 1
            elif ch == "/" and i + 1 < n and src[i + 1] == ">" and brace == 0 and paren == 0 and bracket == 0:
                self_closing = True
                tag_end = i + 2
                break
            elif ch == ">" and brace == 0 and paren == 0 and bracket == 0:
                tag_end = i + 1
                break
            i += 1

        if tag_end is None:
            break
        tag = src[start:tag_end]
        i = tag_end

        is_index = bool(re.search(r"\bindex\b", tag))
        path_m = re.search(r"""\bpath=["']([^"']+)["']""", tag)
        el_m = re.search(r"\belement=\{([\s\S]*)\}\s*(?:/>|>)\s*$", tag)
        el_str = el_m.group(1).strip() if el_m else None

        parent = stack[-1] if stack else ""
        if is_index:
            full = parent or "/"
        elif path_m:
            seg = path_m.group(1)
            if seg.startswith("/"):
                full = seg
            elif parent:
                full = f"{parent}/{seg}"
            else:
                full = f"/{seg}"
        else:
            full = parent or "/"
        full = re.sub(r"/{2,}", "/", full)
        if len(full) > 1 and full.endswith("/"):
            full = full[:-1]

        info = extract_element_info(el_str)
        routes.append(
            {
                "path": full,
                "index": is_index,
                "elementName": info["name"],
                "elementType": info["type"],
                "navigateTo": info["to"],
                "guards": info["guards"],
                "parent": parent,
                "selfClosing": self_closing,
            }
        )

        if not self_closing:
            if is_index:
                stack.append(parent)
            elif path_m:
                seg = path_m.group(1)
                if seg.startswith("/"):
                    nxt = seg
                elif parent:
                    nxt = f"{parent}/{seg}"
                else:
                    nxt = f"/{seg}"
                nxt = re.sub(r"/{2,}", "/", nxt).rstrip("/") or "/"
                stack.append(nxt)
            else:
                stack.append(parent)

    return routes


raw_routes = parse_route_tags(block)
print(f"Parsed {len(raw_routes)} routes")

# Enrich
flat = []
for r in raw_routes:
    name = r["elementName"]
    source = None
    if name and name in lazy_map:
        source = find_page_file(lazy_map[name])
    elif name == "Navigate":
        source = ""
    # Login etc may be default export from lazy
    if name and not source and name in lazy_map:
        source = lazy_map[name]

    # Fix Login which is eager
    if name == "Login":
        source = "src/pages/Login.jsx"

    lines = line_count(source) if source else None
    erp = uses_erp_ui(source) if source else False
    notes = []
    if r["elementType"] == "Navigate":
        notes.append(f"redirect → {r['navigateTo']}")
    if r["index"]:
        notes.append("index")
    if r["guards"]:
        notes.append("guard: " + ",".join(r["guards"]))
    if "*" in r["path"]:
        notes.append("splat")
    flat.append(
        {
            "path": r["path"],
            "component": name or ("Navigate" if r["elementType"] == "Navigate" else "?"),
            "source": source or "",
            "lines": lines if lines is not None else "",
            "erpUi": "Y" if erp else "N",
            "notes": "; ".join(notes),
            "type": r["elementType"],
        }
    )

missing = [r["component"] for r in flat if r["type"] == "component" and not r["source"]]
print("Missing source:", sorted(set(missing)))


def screen_type(row: dict) -> str:
    p = f"{row['path']} {row['component']} {row['source']}".lower()
    if row["type"] == "Navigate":
        return "redirect"
    if "dashboard" in p:
        return "dashboard"
    if any(x in p for x in ("tracker", "tracking", "worklist")):
        return "tracker"
    if any(
        x in p
        for x in (
            "master",
            "directory",
            "list",
            "database",
            "candidates",
            "employees",
            "invoices",
            "reports",
        )
    ):
        return "list"
    if any(
        x in p
        for x in (
            "form",
            "create",
            "entry",
            "new",
            "edit",
            "detail",
            "profile",
            "calculator",
            "process",
            "compose",
        )
    ):
        return "form"
    if any(x in p for x in ("settings", "configuration", "config", "rules", "formula")):
        return "settings"
    if "portal" in p:
        return "portal"
    if "login" in p or "register" in p or "password" in p:
        return "auth"
    return "screen"


# ---------- NAV_MODULE_TREE ----------
roles_src = (ROOT / "src/config/roles.js").read_text(encoding="utf-8")
# resolve known path constants
const_paths = {}
for m in re.finditer(
    r"""(?:export\s+)?const\s+(\w+)\s*=\s*["'](/app/[^"']+)["']""", roles_src
):
    const_paths[m.group(1)] = m.group(2)
# also from salaryAccess
sa = (ROOT / "src/pages/adminOperations/salaryAdmin/salaryAccess.js").read_text(
    encoding="utf-8"
)
for m in re.finditer(
    r"""(?:export\s+)?const\s+(\w+)\s*=\s*["'](/app/[^"']+)["']""", sa
):
    const_paths[m.group(1)] = m.group(2)
for src_txt in (roles_src, sa):
    for m in re.finditer(
        r"""(?:export\s+)?const\s+(\w*(?:KEY|PATH_PREFIX|SUBMODULE)\w*)\s*=\s*["']([^"']+)["']""",
        src_txt,
    ):
        const_paths[m.group(1)] = m.group(2)

tree_start = roles_src.index("export const NAV_MODULE_TREE")
tree_end = roles_src.index("export const MODULES", tree_start)
tree_block = roles_src[tree_start:tree_end]

nav_modules = []
# Match top-level module objects (non-greedy subModules array)
for mm in re.finditer(
    r"""\{\s*value:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"\s*,\s*subModules:\s*\[([\s\S]*?)\]\s*,?\s*\}""",
    tree_block,
):
    value, label, sub_block = mm.group(1), mm.group(2), mm.group(3)
    children = []
    for sm in re.finditer(
        r"""\{\s*value:\s*([^,]+)\s*,\s*label:\s*"([^"]+)"\s*,\s*pathPrefix:\s*([^,}\n]+)""",
        sub_block,
    ):
        raw_val = sm.group(1).strip()
        lab = sm.group(2)
        raw_path = sm.group(3).strip().rstrip()
        if raw_val.startswith('"'):
            sub_val = raw_val.strip('"')
        else:
            sub_val = const_paths.get(raw_val, raw_val)
        if raw_path.startswith('"') or raw_path.startswith("'"):
            path_prefix = raw_path.strip("\"'")
        else:
            path_prefix = const_paths.get(raw_path, raw_path)
        children.append({"value": sub_val, "label": lab, "path": path_prefix})
    nav_modules.append({"value": value, "label": label, "children": children})

# ---------- Layout NavLinks ----------
layout_src = (ROOT / "src/contexts/Layout.jsx").read_text(encoding="utf-8")
# Extract visible NavLink to= values and nearby text labels (children text)
sidebar_links = []
# Simple: NavLink to="relative-or-abs"
for m in re.finditer(
    r"""<NavLink\b([^>]*(?:/>|>))""",
    layout_src,
    flags=re.DOTALL,
):
    attrs = m.group(1)
    if "{/*" in attrs:  # skip commented rough
        continue
    to_m = re.search(r"""\bto=\{?["']([^"']+)["']\}?""", attrs)
    if not to_m:
        # to={expr}
        to_m2 = re.search(r"""\bto=\{([^}]+)\}""", attrs)
        to_val = f"{{expr: {to_m2.group(1).strip()[:80]}}}" if to_m2 else None
    else:
        to_val = to_m.group(1)
    if not to_val:
        continue
    # resolve relative to /app/
    if to_val.startswith("/app"):
        abs_path = to_val
    elif to_val.startswith("{expr"):
        abs_path = to_val
    else:
        abs_path = "/app/" + to_val.lstrip("/")
    sidebar_links.append(abs_path)

# Section headers from button labels in Layout (HR, Admin, etc.)
section_labels = []
for m in re.finditer(
    r""">\s*([A-Z][^<{]{1,40}?)\s*<""",
    layout_src,
):
    t = m.group(1).strip()
    if t and len(t) < 40 and not t.startswith("http"):
        section_labels.append(t)

# Better: known section button text near setXxxOpen
section_blocks = []
for m in re.finditer(
    r"""set(\w+Open)\(!?\1\)[\s\S]{0,200}?>([^<]{2,50})</""",
    layout_src,
):
    section_blocks.append(m.group(2).strip())

# Manual extraction of sidebar structure from Layout by scanning labeled NavLink children
# Pattern: <NavLink ...> LABEL </NavLink> possibly with icons
navlink_labeled = []
for m in re.finditer(
    r"""<NavLink\b([\s\S]*?)>([\s\S]*?)</NavLink>""",
    layout_src,
):
    attrs, body = m.group(1), m.group(2)
    # skip if this NavLink is inside a comment block that started before — hard; check body
    # Prefer plain text after last JSX expression close
    parts = re.split(r"\{[^}]*\}", body)
    candidates = []
    for part in parts:
        plain = re.sub(r"<[^>]+>", " ", part)
        plain = re.sub(r"&amp;", "&", plain)
        plain = re.sub(r"\s+", " ", plain).strip()
        if plain and not plain.startswith("`") and len(plain) < 60:
            candidates.append(plain)
    label_txt = candidates[-1] if candidates else ""
    to_m = re.search(r"""\bto=["']([^"']+)["']""", attrs)
    if to_m:
        to_val = to_m.group(1)
        abs_path = to_val if to_val.startswith("/") else "/app/" + to_val.lstrip("/")
        navlink_labeled.append({"label": label_txt[:80], "path": abs_path})

# Dedup layout links
unique_sidebar = []
seen_sb = set()
for item in navlink_labeled:
    key = (item["label"], item["path"])
    if key in seen_sb:
        continue
    seen_sb.add(key)
    unique_sidebar.append(item)


# ---------- page files ----------
pages_root = ROOT / "src/pages"
page_files = sorted(pages_root.rglob("*.jsx"))
by_module: dict[str, list] = defaultdict(list)
for abs_p in page_files:
    rel = abs_p.relative_to(pages_root)
    top = rel.parts[0]
    rel_repo = str(abs_p.relative_to(ROOT))
    by_module[top].append(
        {
            "file": rel_repo,
            "lines": line_count(rel_repo),
            "erpUi": "Y" if uses_erp_ui(rel_repo) else "N",
        }
    )


# ---------- Billing sub-tabs (client-side, billing/*) ----------
billing_notes = []
billing_file = find_page_file(lazy_map.get("Billing", "src/pages/billing/Billing"))
if billing_file:
    btxt = (ROOT / billing_file).read_text(encoding="utf-8", errors="replace")
    for m in re.finditer(r"""['"]/(?:app/)?billing/([^'"]+)['"]""", btxt):
        billing_notes.append("/app/billing/" + m.group(1))
    for m in re.finditer(r"""path:\s*['"]([^'"]+)['"]""", btxt):
        billing_notes.append(m.group(1))


# ---------- Markdown ----------
out: list[str] = []
L = out.append

L("# Indus ERP — Complete UI Route Inventory")
L("")
L(f"_Generated: {datetime.now(timezone.utc).isoformat()}_")
L("")
L("## 1. System overview")
L("")
L("- **Stack:** React (Vite) + React Router v6 (v7 future flags), Supabase, Tailwind-like utility tokens.")
L("- **Shell:** Public auth routes → `ProtectedRoute` + `Layout` (`src/contexts/Layout.jsx`) for all `/app/*`.")
L("- **Code-splitting:** `src/routes/lazyPages.jsx` via `lazyWithRetry`.")
L("- **Design system:** Admin Ops `AdminUi.jsx` primitives; shared `src/components/erpUi` (partial adoption). Nav/ACL: `NAV_MODULE_TREE` in `src/config/roles.js`.")
L(f"- **Declared routes in App.jsx:** {len(flat)}")
L(f"- **Lazy export mappings:** {len(lazy_map)}")
L(f"- **Page .jsx under src/pages:** {len(page_files)}")
L(f"- **Routes with erpUi import:** {sum(1 for r in flat if r['erpUi']=='Y')}")
L("")
L("## 2. Sidebar modules")
L("")
L("### 2a. NAV_MODULE_TREE (roles.js — ACL + intended nav)")
L("")
for mod in nav_modules:
    L(f"#### {mod['label']} (`{mod['value']}`)")
    if not mod["children"]:
        L("- _(no subModules)_")
    else:
        for c in mod["children"]:
            L(f"- **{c['label']}** → `{c['path']}` (`{c['value']}`)")
    L("")

L("### 2b. Layout.jsx NavLink inventory (visible labels → paths)")
L("")
L("| Sidebar label | Path |")
L("|---|---|")
for item in unique_sidebar:
    lab = item["label"].replace("|", "/") or "(icon/empty)"
    L(f"| {lab} | `{item['path']}` |")
L("")
L(f"_Total labeled NavLinks extracted: {len(unique_sidebar)}_")
L("")

L("## 3. FULL flat route table")
L("")
L("| Path | Page component | Source file | Lines | erpUi | Notes | UI kind |")
L("|---|---|---|---:|:---:|---|---|")
for row in flat:
    kind = screen_type(row)
    src = row["source"] or "—"
    lines = row["lines"] if row["lines"] != "" else "—"
    notes = row["notes"] or ""
    L(
        f"| `{row['path']}` | {row['component']} | `{src}` | {lines} | {row['erpUi']} | {notes} | {kind} |"
    )
L("")

L("## 4. Module-by-module page files (`src/pages`)")
L("")
for top in sorted(by_module.keys(), key=lambda x: x.lower()):
    files = by_module[top]
    erp_y = sum(1 for f in files if f["erpUi"] == "Y")
    # Group root-level single files under _root
    label = top
    L(f"### `{label}` — {len(files)} .jsx ({erp_y} erpUi)")
    L("")
    L("| File | Lines | erpUi |")
    L("|---|---:|:---:|")
    for f in sorted(files, key=lambda x: x["file"]):
        L(f"| `{f['file']}` | {f['lines']} | {f['erpUi']} |")
    L("")

L("## 5. Module-by-module screen summaries (routed)")
L("")


def summarize(title: str, pred):
    rows = [r for r in flat if pred(r["path"])]
    real = [r for r in rows if r["type"] != "Navigate"]
    redirs = [r for r in rows if r["type"] == "Navigate"]
    L(f"### {title}")
    L(f"- **Routes:** {len(rows)} ({len(real)} screens / layouts, {len(redirs)} redirects)")
    kinds: dict[str, int] = defaultdict(int)
    for r in real:
        kinds[screen_type(r)] += 1
    if kinds:
        L("- **UI mix:** " + ", ".join(f"{k}={v}" for k, v in sorted(kinds.items())))
    # list every real path briefly
    for r in real:
        L(
            f"  - `{r['path']}` → **{r['component']}** ({screen_type(r)}"
            + (f"; {r['notes']}" if r["notes"] else "")
            + ")"
        )
    if redirs:
        L(f"- **Redirects ({len(redirs)}):**")
        for r in redirs:
            L(f"  - `{r['path']}` {r['notes']}")
    L("")


summarize("Public / auth", lambda p: not p.startswith("/app"))
summarize("App shell", lambda p: p in ("/app", "/app/dashboard"))
summarize("IEV / Fire tender", lambda p: p.startswith("/app/fire-tender") and not p.startswith("/app/fire-tender-"))
summarize("Fire tender manufacturing", lambda p: p.startswith("/app/fire-tender-manufacturing"))
summarize("Fleet / vehicle mgmt", lambda p: p.startswith("/app/fire-tender-vehicle"))
summarize("Manpower enquiry", lambda p: p.startswith("/app/manpower"))
summarize(
    "Commercial MT",
    lambda p: p.startswith("/app/commercial/manpower-training")
    or p in ("/app/commercial", "/app/commercial/dashboard", "/app/commercial/po-entry", "/app/commercial/contact-log"),
)
summarize("Commercial RM/AMC/IEV", lambda p: p.startswith("/app/commercial/rm-mm-amc-iev"))
summarize("HR (+ nested calling-master, payroll, site-attendance)", lambda p: p.startswith("/app/hr"))
summarize("Attendance", lambda p: p.startswith("/app/attendance") or p in ("/app/salary", "/app/payroll"))
summarize("People management", lambda p: p.startswith("/app/people-management"))
summarize("Compliance", lambda p: p.startswith("/app/compliance") or p.startswith("/app/ifsp-employee-compliance") or p.startswith("/app/general-compliance"))
summarize("Admin ops", lambda p: p.startswith("/app/admin") or p.startswith("/app/admin-operations") or p.startswith("/app/ifsp-employee") or p in ("/app/store-inventory", "/app/gate-pass"))
summarize("Billing (+ legacy tracking/reports redirects)", lambda p: p.startswith("/app/billing") or p.startswith("/app/tracking") or p == "/app/reports" or p.startswith("/app/reports/"))
summarize("Operations", lambda p: p.startswith("/app/operations"))
summarize("Projects hubs", lambda p: p.startswith("/app/projects/") or p.startswith("/app/projects-"))
summarize("Procurement", lambda p: p.startswith("/app/procurement"))
summarize("AMC", lambda p: p.startswith("/app/amc"))
summarize("Finance", lambda p: p.startswith("/app/accounts-finance"))
summarize("Marketing", lambda p: p.startswith("/app/marketing"))
summarize("Maintenance", lambda p: p.startswith("/app/maintenance"))
summarize("CRM outreach", lambda p: p.startswith("/app/crm-outreach"))
summarize("IT/IS + LMS + admin tools", lambda p: p in ("/app/software-subscriptions-reminders", "/app/api-health", "/app/indus-lms-trainings", "/app/user-management", "/app/all-employees", "/app/settings"))

if billing_notes:
    L("### Billing client-side tab paths (from Billing.jsx string literals)")
    for p in sorted(set(billing_notes)):
        L(f"- `{p}`")
    L("")

md_path = ROOT / "tmp_ui_atlas_inventory.md"
json_path = ROOT / "tmp_ui_atlas_inventory.json"
md_path.write_text("\n".join(out), encoding="utf-8")
json_path.write_text(
    json.dumps(
        {
            "generated": datetime.now(timezone.utc).isoformat(),
            "routeCount": len(flat),
            "routes": flat,
            "navModules": nav_modules,
            "sidebarNavLinks": unique_sidebar,
            "pageFileCount": len(page_files),
            "byModule": {k: by_module[k] for k in sorted(by_module)},
            "lazyMap": lazy_map,
        },
        indent=2,
    ),
    encoding="utf-8",
)
print("WROTE", md_path)
print("Sample paths:", [r["path"] for r in flat[:12]])
print("Sample comps:", [r["component"] for r in flat[:12]])
print("Longest path len:", max((len(r["path"]) for r in flat), default=0))
print("erpUi routes:", sum(1 for r in flat if r["erpUi"] == "Y"))
