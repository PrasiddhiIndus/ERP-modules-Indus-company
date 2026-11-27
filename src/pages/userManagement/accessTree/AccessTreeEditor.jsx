import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Search, RotateCcw, ShieldCheck, Eye, Pencil, CheckCheck } from "lucide-react";
import { ROLES } from "../../../config/roles";
import { EMPLOYEE_MASTER_SUBMODULE_KEY } from "../../adminOperations/salaryAdmin/salaryAccess";
import {
  buildAccessTree,
  moduleState,
  pageHasAnyGrant,
  applyModuleToggle,
  applySubToggle,
  applyEnquiryLevelToggle,
  applyPlainKeyToggle,
  applyIevCostingNetTotalToggle,
  selectAllPagesInModule,
  clearModule,
  selectAllTabs,
  clearTabs,
  selectGroupKeys,
  clearGroupKeys,
  hasCallingDatabaseAccess,
  hasSiteAttendanceAccess,
  hasIevAccess,
  ievConfigMode,
  setIevConfigMode,
  toggleIevConfigPage,
  diffAccess,
  accessKeyLabel,
} from "./accessModel";

/** What the role adds on top of page access (enforced by the role helpers, not by these ticks). */
const ROLE_CAPABILITIES = {
  [ROLES.EXECUTIVE]: { caps: ["View", "Edit"], note: "Executives submit for approval; they do not approve." },
  [ROLES.MANAGER]: { caps: ["View", "Edit", "Approve"], note: "Managers approve inside the modules they can open." },
  [ROLES.ADMIN]: { caps: ["View", "Edit", "Approve"], note: "Admins approve inside the modules they can open." },
};

function TriCheckbox({ checked, indeterminate = false, disabled = false, onChange, id, title, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate && !checked);
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      checked={Boolean(checked)}
      disabled={disabled}
      onChange={onChange}
      title={title}
      className={`h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0 disabled:opacity-60 ${className}`}
    />
  );
}

function Badge({ tone = "slate", children, title }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    indigo: "bg-indigo-50 text-indigo-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
    sky: "bg-sky-50 text-sky-700",
  };
  return (
    <span title={title} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function LinkButton({ onClick, children, title, tone = "indigo" }) {
  const color = tone === "red" ? "text-red-600 hover:text-red-700" : "text-indigo-600 hover:text-indigo-800";
  return (
    <button type="button" onClick={onClick} title={title} className={`text-[11px] font-medium ${color} hover:underline`}>
      {children}
    </button>
  );
}

/** Open pages that hold grants (incl. Site Attendance / IEV Configuration keys) so existing access is visible. */
const pageOpensByDefault = (page, subs) =>
  pageHasAnyGrant(page, subs) ||
  Boolean(page.pageGroup?.items.some((i) => subs.includes(i.key))) ||
  (page.pageGroup?.kind === "mode" && ievConfigMode(subs) === "selected");

const matches = (label, q) => !q || String(label || "").toLowerCase().includes(q);

/**
 * Module → Page → Tab access editor.
 *
 * Props
 *   form      — { team, role, allowed_modules, allowed_sub_modules }
 *   original  — the same shape as loaded from the database (edit mode) for the change summary
 *   onChange  — (next: { allowed_modules, allowed_sub_modules }) => void
 */
export default function AccessTreeEditor({ form, original = null, onChange }) {
  const tree = useMemo(() => buildAccessTree(form?.team), [form?.team]);
  const subs = Array.isArray(form?.allowed_sub_modules) ? form.allowed_sub_modules : [];
  const mods = Array.isArray(form?.allowed_modules) ? form.allowed_modules : [];
  const [query, setQuery] = useState("");
  const [grantedOnly, setGrantedOnly] = useState(false);
  const [expanded, setExpanded] = useState({});
  const q = query.trim().toLowerCase();

  // Open modules that already hold grants, so an admin sees existing access without hunting.
  const grantSignature = `${mods.join("|")}#${subs.length}`;
  useEffect(() => {
    const auto = {};
    tree.forEach((mod) => {
      const st = moduleState(mod, form);
      if (st.status === "team" || st.status === "partial") auto[mod.key] = true;
    });
    setExpanded((prev) => ({ ...auto, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, grantSignature]);

  const emit = (next) => onChange?.({ allowed_modules: next.allowed_modules, allowed_sub_modules: next.allowed_sub_modules });
  const toggleExpand = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const visibleTree = useMemo(() => {
    return tree
      .map((mod) => {
        const st = moduleState(mod, form);
        if (grantedOnly && st.status === "none") return null;
        if (!q) return { mod, st, pages: mod.pages };
        if (matches(mod.label, q)) return { mod, st, pages: mod.pages };
        const pages = mod.pages.filter(
          (p) =>
            matches(p.label, q) ||
            p.tabs?.some((t) => matches(t.label, q)) ||
            p.pageGroup?.items.some((i) => matches(i.label, q)) ||
            p.infoTabs?.some((t) => matches(t, q))
        );
        return pages.length ? { mod, st, pages } : null;
      })
      .filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, q, grantedOnly, mods.join("|"), subs.join("|"), form?.team]);

  const roleInfo = ROLE_CAPABILITIES[form?.role] || null;
  const changes = original ? diffAccess(original, form) : null;
  const changeCount = changes
    ? changes.modulesAdded.length + changes.modulesRemoved.length + changes.subsAdded.length + changes.subsRemoved.length
    : 0;

  const totals = useMemo(() => {
    let full = 0;
    let partial = 0;
    tree.forEach((mod) => {
      const st = moduleState(mod, form);
      if (st.status === "full" || st.status === "team") full += 1;
      else if (st.status === "partial") partial += 1;
    });
    return { full, partial };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, mods.join("|"), subs.join("|"), form?.team]);

  const setAllExpanded = (open) => {
    const next = {};
    tree.forEach((mod) => {
      next[mod.key] = open;
      mod.pages.forEach((p) => {
        next[p.key] = open;
      });
    });
    setExpanded(next);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules, pages or tabs…"
            className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 select-none">
          <input
            type="checkbox"
            checked={grantedOnly}
            onChange={() => setGrantedOnly((v) => !v)}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          Granted only
        </label>
        <LinkButton onClick={() => setAllExpanded(true)}>Expand all</LinkButton>
        <span className="text-gray-300">|</span>
        <LinkButton onClick={() => setAllExpanded(false)}>Collapse all</LinkButton>
      </div>

      {/* Summary + role capabilities */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
        <ShieldCheck className="w-4 h-4 text-indigo-500" />
        <span>
          <strong className="text-gray-800">{totals.full}</strong> full module{totals.full === 1 ? "" : "s"},{" "}
          <strong className="text-gray-800">{totals.partial}</strong> partial
        </span>
        {roleInfo ? (
          <span className="ml-auto inline-flex flex-wrap items-center gap-1" title={roleInfo.note}>
            <span className="text-gray-500">Role grants on every open page:</span>
            {roleInfo.caps.map((c) => (
              <Badge key={c} tone={c === "Approve" ? "violet" : c === "Edit" ? "amber" : "sky"}>
                {c}
              </Badge>
            ))}
          </span>
        ) : null}
      </div>

      {/* Module list */}
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
        {visibleTree.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-500">No module, page or tab matches.</p>
        ) : null}
        {visibleTree.map(({ mod, st, pages }) => (
          <ModuleRow
            key={mod.key}
            mod={mod}
            st={st}
            pages={pages}
            form={form}
            subs={subs}
            q={q}
            isOpen={Boolean(q) || expanded[mod.key] === true}
            expanded={expanded}
            onToggleExpand={toggleExpand}
            emit={emit}
          />
        ))}
      </div>

      {/* Pending changes (edit mode) */}
      {changes ? (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            changeCount ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {changeCount === 0 ? (
            "No access changes — saving keeps this user's current access exactly as it is."
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <strong>
                  {changeCount} access change{changeCount === 1 ? "" : "s"} will be saved
                </strong>
                <button
                  type="button"
                  onClick={() =>
                    emit({
                      allowed_modules: [...(original.allowed_modules || [])],
                      allowed_sub_modules: [...(original.allowed_sub_modules || [])],
                    })
                  }
                  className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 hover:underline"
                >
                  <RotateCcw className="w-3 h-3" /> Undo all
                </button>
              </div>
              <ChangeList sign="+" tone="text-emerald-700" items={[
                ...changes.modulesAdded.map((k) => `${accessKeyLabel(k)} (full module)`),
                ...changes.subsAdded.map(accessKeyLabel),
              ]} />
              <ChangeList sign="−" tone="text-red-700" items={[
                ...changes.modulesRemoved.map((k) => `${accessKeyLabel(k)} (full module)`),
                ...changes.subsRemoved.map(accessKeyLabel),
              ]} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ChangeList({ sign, tone, items }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-0.5">
      {items.map((label) => (
        <li key={`${sign}${label}`} className={tone}>
          <span className="inline-block w-3 font-bold">{sign}</span>
          {label}
        </li>
      ))}
    </ul>
  );
}

function ModuleRow({ mod, st, pages, form, subs, q, isOpen, expanded, onToggleExpand, emit }) {
  const full = st.status === "full";
  const team = st.status === "team";
  const realPages = mod.pages.filter((p) => !p.virtual);
  const hasPages = mod.pages.length > 0;

  let statusBadge;
  if (full) statusBadge = <Badge tone="green">Full access</Badge>;
  else if (team) {
    statusBadge = (
      <>
        <Badge tone="slate">Primary team</Badge>
        {(mod.key === "hr" || mod.key === "admin") && st.grantedPages > 0 ? (
          <Badge tone="indigo">Restricted to {st.grantedPages} page{st.grantedPages === 1 ? "" : "s"}</Badge>
        ) : (
          <Badge tone="green">Full access</Badge>
        )}
      </>
    );
  } else if (st.status === "partial") {
    statusBadge = (
      <Badge tone="indigo">
        {st.grantedPages} of {realPages.length} page{realPages.length === 1 ? "" : "s"}
      </Badge>
    );
  } else statusBadge = <Badge tone="slate">No access</Badge>;

  const teamNote =
    team && (mod.key === "hr" || mod.key === "admin")
      ? st.grantedPages > 0
        ? "Only the ticked pages are shown to this user."
        : `Nothing ticked: this user sees all of ${mod.label}. Tick pages to show only those.`
      : team
        ? "Primary team module: the user opens every page. Page ticks only add opt-in items."
        : null;

  return (
    <div>
      <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${full ? "bg-emerald-50/40" : ""} hover:bg-gray-50`}>
        <button
          type="button"
          onClick={() => onToggleExpand(mod.key)}
          className="p-0.5 rounded hover:bg-gray-200 text-gray-500"
          title={isOpen ? "Collapse" : "Expand"}
          disabled={!hasPages}
        >
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {team ? (
          <span className="w-4 shrink-0" aria-hidden />
        ) : (
          <TriCheckbox
            id={`acc-mod-${mod.key}`}
            checked={full}
            indeterminate={st.status === "partial"}
            onChange={() => emit(applyModuleToggle(form, mod.key))}
            title={full ? `Remove full ${mod.label} access` : `Grant full ${mod.label} access (every page, incl. future pages)`}
          />
        )}
        <label htmlFor={team ? undefined : `acc-mod-${mod.key}`} className="text-sm font-semibold text-gray-800 cursor-pointer select-none">
          {mod.label}
        </label>
        <span className="inline-flex flex-wrap items-center gap-1">{statusBadge}</span>
        <span className="flex-1" />
        {!full && hasPages && realPages.length > 0 ? (
          <LinkButton
            onClick={() => emit(selectAllPagesInModule(form, mod))}
            title="Tick every standard page of this module individually (opt-in pages are not included)"
          >
            Select all pages
          </LinkButton>
        ) : null}
        {st.status !== "none" && !(team && st.ownedKeys === 0) ? (
          <LinkButton tone="red" onClick={() => emit(clearModule(form, mod))} title={`Remove every ${mod.label} grant`}>
            {team ? "Clear ticks" : "Deselect all"}
          </LinkButton>
        ) : null}
      </div>

      {isOpen && (teamNote || full) ? (
        <p className="ml-14 mr-3 -mt-1 pb-1.5 text-[11px] text-gray-500">
          {full
            ? `Full access: includes every page${mod.key === "admin" ? " except opt-in items (Recruitment, Rules Console)" : " except opt-in items"}. Untick ${mod.label} to choose pages one by one.`
            : teamNote}
        </p>
      ) : null}

      {isOpen && hasPages ? (
        <div className="ml-6 border-t border-gray-100 bg-slate-50/60 divide-y divide-gray-100">
          {mod.key === "hr" && mod.scope && hasCallingDatabaseAccess(form) ? (
            <ScopeRow scope={mod.scope} subs={subs} form={form} emit={emit} />
          ) : null}
          {pages.map((page) => (
            <PageRow
              key={page.key}
              mod={mod}
              page={page}
              moduleFull={full}
              form={form}
              subs={subs}
              q={q}
              isOpen={Boolean(q) || (expanded[page.key] ?? pageOpensByDefault(page, subs))}
              onToggleExpand={onToggleExpand}
              emit={emit}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ScopeRow({ scope, subs, form, emit }) {
  const picked = scope.items.filter((i) => subs.includes(i.key));
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 bg-orange-50/50">
      <span className="text-xs font-medium text-gray-700">{scope.label}</span>
      {scope.items.map((item) => (
        <label key={item.key} className="inline-flex items-center gap-1.5 text-xs text-gray-700 select-none">
          <input
            type="checkbox"
            checked={subs.includes(item.key)}
            onChange={() => emit(applyPlainKeyToggle(form, item.key))}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          {item.label}
        </label>
      ))}
      <span className="text-[11px] text-orange-800">
        {picked.length === 0 || picked.length === scope.items.length ? "Sees Fire and Safety" : `Sees ${picked[0].label} only`}
      </span>
      <span className="text-[10px] text-gray-400 w-full sm:w-auto sm:ml-auto">{scope.hint}</span>
    </div>
  );
}

function PermissionCell({ page, subs, form, emit, accessible }) {
  if (page.accessLevels) {
    return (
      <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {page.accessLevels.map((level) => (
          <label
            key={level.value}
            title={level.hint}
            className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-700 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={subs.includes(level.value)}
              onChange={() => emit(applyEnquiryLevelToggle(form, level.value))}
              className="h-3 w-3 rounded border-gray-300 text-sky-600"
            />
            {level.label === "View" ? <Eye className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
            {level.label}
          </label>
        ))}
        {accessible && !subs.some((k) => page.accessLevels.some((l) => l.value === k)) ? (
          <span className="text-[10px] text-gray-400">none ticked = Edit</span>
        ) : null}
      </span>
    );
  }
  if (page.fixedLevels) {
    return (
      <span className="inline-flex items-center gap-1" title="Granted together — no separate toggles">
        {page.fixedLevels.map((c) => (
          <Badge key={c} tone="sky">
            {c}
          </Badge>
        ))}
      </span>
    );
  }
  return null;
}

function PageRow({ mod, page, moduleFull, form, subs, q, isOpen, onToggleExpand, emit }) {
  const isEmployeeMasterOnlySwitch = moduleFull && page.key === EMPLOYEE_MASTER_SUBMODULE_KEY;
  const pageChecked = subs.includes(page.key);
  const tabs = page.tabs || [];
  const hasChildren = tabs.length > 0 || Boolean(page.pageGroup) || Boolean(page.infoTabs);
  const anyTab = tabs.some((t) => subs.includes(t.key)) || (page.recruitment && pageHasAnyGrant(page, subs) && !pageChecked);
  const includedByModule = moduleFull && !page.optIn && !page.virtual && !isEmployeeMasterOnlySwitch;
  const accessible = includedByModule || pageChecked || anyTab;

  // Extra groups render only when the user can reach that area (same rule as the old side editors).
  const groupVisible =
    !page.pageGroup ||
    (page.pageGroup.id === "site-attendance-pages" && hasSiteAttendanceAccess(form)) ||
    (page.pageGroup.id === "iev-config" && hasIevAccess(form));
  if (page.virtual && !groupVisible) return null;

  const visibleTabs = q && !matches(page.label, q) && !matches(mod.label, q) ? tabs.filter((t) => matches(t.label, q)) : tabs;

  let checkbox;
  if (page.virtual) checkbox = <span className="w-4 shrink-0" aria-hidden />;
  else if (includedByModule) checkbox = <TriCheckbox checked disabled title={`Included with full ${mod.label}`} />;
  else if (isEmployeeMasterOnlySwitch)
    checkbox = (
      <TriCheckbox
        id={`acc-page-${page.key}`}
        checked={false}
        onChange={() => emit(applySubToggle(form, page.key))}
        title="Replace full Admin with Employee Master only"
      />
    );
  else
    checkbox = (
      <TriCheckbox
        id={`acc-page-${page.key}`}
        checked={pageChecked}
        indeterminate={anyTab}
        onChange={() => emit(applySubToggle(form, page.key))}
        title={pageChecked ? `Revoke ${page.label}` : `Grant ${page.label}`}
      />
    );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 hover:bg-slate-100">
        {hasChildren ? (
          <button type="button" onClick={() => onToggleExpand(page.key)} className="p-0.5 rounded hover:bg-slate-200 text-gray-400">
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-[18px] shrink-0" aria-hidden />
        )}
        {checkbox}
        <label htmlFor={`acc-page-${page.key}`} className="text-sm text-gray-700 cursor-pointer select-none">
          {isEmployeeMasterOnlySwitch ? "Employee Master only" : page.label}
        </label>
        {page.optIn ? <Badge tone="violet" title="Never included by full module access — grant explicitly">opt-in</Badge> : null}
        {includedByModule ? <span className="text-[10px] text-gray-400">included</span> : null}
        {isEmployeeMasterOnlySwitch ? <span className="text-[10px] text-indigo-500">replaces full Admin</span> : null}
        {!pageChecked && !includedByModule && anyTab ? (
          <Badge tone="indigo">
            {tabs.filter((t) => subs.includes(t.key)).length || "some"} tab{tabs.filter((t) => subs.includes(t.key)).length === 1 ? "" : "s"}
          </Badge>
        ) : null}
        <span className="flex-1" />
        <PermissionCell page={page} subs={subs} form={form} emit={emit} accessible={accessible} />
        {tabs.length > 0 && !includedByModule ? (
          <span className="inline-flex items-center gap-2 ml-2">
            {!pageChecked ? (
              <LinkButton onClick={() => emit(selectAllTabs(form, page))} title="Grant every standard tab of this page">
                <CheckCheck className="inline w-3 h-3 mr-0.5" />All tabs
              </LinkButton>
            ) : null}
            {pageChecked || anyTab ? (
              <LinkButton tone="red" onClick={() => emit(clearTabs(form, page))} title="Revoke this page and its tabs">
                None
              </LinkButton>
            ) : null}
          </span>
        ) : null}
      </div>

      {isOpen && tabs.length > 0 ? (
        <div className="ml-12 border-l border-gray-200 bg-white divide-y divide-gray-50">
          {visibleTabs.map((tab) => {
            const tabIncluded = !tab.optIn && (pageChecked || includedByModule);
            const tabGranted = tabIncluded || subs.includes(tab.key);
            const extras = tab.extras || [];
            return (
              <div
                key={tab.key}
                className={`flex flex-wrap items-center gap-2 px-3 py-1 ${tabIncluded ? "text-gray-400" : "text-gray-700"}`}
              >
                <label
                  className={`inline-flex items-center gap-2 select-none ${tabIncluded ? "" : "cursor-pointer hover:bg-slate-50 rounded"}`}
                  title={tabIncluded ? `Included with ${page.label}. Untick ${page.label} to choose tabs one by one.` : undefined}
                >
                  {tabIncluded ? (
                    <TriCheckbox checked disabled />
                  ) : (
                    <TriCheckbox checked={subs.includes(tab.key)} onChange={() => emit(applySubToggle(form, tab.key))} />
                  )}
                  <span className="text-xs">{tab.label}</span>
                  {tab.optIn ? <Badge tone="violet">{tab.badge || "opt-in"}</Badge> : null}
                  {tabIncluded ? <span className="text-[10px]">included</span> : null}
                </label>
                {extras.map((extra) => {
                  // Net Total Access is always an explicit tick (never "included"), so revoke works
                  // even when Costing Sheet / full IEV is granted.
                  const extraStored = subs.includes(extra.key);
                  const canToggle = tabGranted || extraStored || includedByModule || pageChecked;
                  return (
                    <label
                      key={extra.key}
                      title={extra.hint || extra.label}
                      className={`ml-1 inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] select-none ${
                        canToggle
                          ? "border-gray-200 bg-white text-gray-700 cursor-pointer"
                          : "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3 rounded border-gray-300 text-sky-600"
                        checked={extraStored}
                        disabled={!canToggle}
                        onChange={() => {
                          if (!canToggle) return;
                          emit(applyIevCostingNetTotalToggle(form));
                        }}
                      />
                      {extra.label}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}

      {isOpen && page.pageGroup && groupVisible ? <PageGroup group={page.pageGroup} subs={subs} form={form} emit={emit} /> : null}

      {isOpen && page.infoTabs ? (
        <div className="ml-12 border-l border-gray-200 bg-white px-3 py-1.5">
          <div className="flex flex-wrap gap-1">
            {page.infoTabs.map((t) => (
              <Badge key={t} tone="slate">
                {t}
              </Badge>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-gray-400">{page.infoNote}</p>
        </div>
      ) : null}
    </div>
  );
}

function PageGroup({ group, subs, form, emit }) {
  const keys = group.items.map((i) => i.key);
  const picked = group.items.filter((i) => subs.includes(i.key));

  if (group.kind === "mode") {
    const mode = ievConfigMode(subs);
    const setSubs = (next) => emit({ allowed_modules: form.allowed_modules || [], allowed_sub_modules: next });
    return (
      <div className="ml-12 border-l border-gray-200 bg-white px-3 py-2 space-y-1.5">
        <div className="flex flex-wrap items-center gap-4">
          {[
            ["all", "All items"],
            ["selected", "Selected items"],
          ].map(([value, label]) => (
            <label key={value} className="inline-flex items-center gap-1.5 text-xs text-gray-700 select-none">
              <input type="radio" checked={mode === value} onChange={() => setSubs(setIevConfigMode(subs, value))} className="h-3.5 w-3.5" />
              {label}
            </label>
          ))}
          {mode === "selected" ? (
            <span className="ml-auto inline-flex gap-2">
              <LinkButton onClick={() => setSubs([...new Set([...subs, ...keys])])}>Select all</LinkButton>
              <LinkButton tone="red" onClick={() => setSubs(subs.filter((k) => !keys.includes(k)))}>
                Deselect all
              </LinkButton>
            </span>
          ) : null}
        </div>
        {mode === "selected" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {group.items.map((item) => (
              <label key={item.key} className="inline-flex items-center gap-2 text-xs text-gray-700 select-none">
                <TriCheckbox checked={subs.includes(item.key)} onChange={() => setSubs(toggleIevConfigPage(subs, item.key))} />
                {item.label}
              </label>
            ))}
          </div>
        ) : null}
        <p className="text-[10px] text-red-800">
          {mode === "all"
            ? "Can open every Configuration page"
            : picked.length
              ? `Can open ${picked.map((p) => p.label).join(", ")}`
              : "Cannot open any Configuration page"}
        </p>
      </div>
    );
  }

  // default-all: no key = every page
  return (
    <div className="ml-12 border-l border-gray-200 bg-white px-3 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-gray-500">{group.hint}</span>
        <span className="ml-auto inline-flex gap-2">
          <LinkButton onClick={() => emit(selectGroupKeys(form, keys))}>Select all</LinkButton>
          {picked.length ? (
            <LinkButton tone="red" onClick={() => emit(clearGroupKeys(form, keys))} title="Untick all — the user opens every page">
              Reset to all pages
            </LinkButton>
          ) : null}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        {group.items.map((item) => (
          <label key={item.key} className="inline-flex items-center gap-2 text-xs text-gray-700 select-none">
            <TriCheckbox checked={subs.includes(item.key)} onChange={() => emit(applyPlainKeyToggle(form, item.key))} />
            {item.label}
          </label>
        ))}
      </div>
      <p className="text-[10px] text-sky-800">
        {picked.length === 0 || picked.length === group.items.length
          ? "Can open every page"
          : `Can open ${picked.map((p) => p.label).join(", ")}`}
      </p>
    </div>
  );
}
