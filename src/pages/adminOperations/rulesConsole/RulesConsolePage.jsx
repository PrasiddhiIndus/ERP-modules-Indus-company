import React, { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { CollapsibleHelp, PageTaskHeader, SectionCard, StatusChip } from "../components/AdminUi";
import { useRulesConsoleData } from "./useRulesConsoleData";
import { RULE_MODULES, departmentListLabel, formatRuleValue, summarizeRule, todayIso } from "./rulesModel";
import RuleDrawer from "./components/RuleDrawer";
import { ListState, focusRingClass, inputClass } from "./components/RulesUi";

/** Admin → Rules Console: the attendance, leave and C/O rules in force, by module. */
export default function RulesConsolePage() {
  const { rules, values, departments, status, error, retry, reload } = useRulesConsoleData();
  const [search, setSearch] = useState("");
  const [onlyEditable, setOnlyEditable] = useState(false);
  const [openKey, setOpenKey] = useState(null);

  const today = todayIso();
  const summaries = useMemo(
    () => new Map(rules.map((r) => [r.rule_key, summarizeRule(r, values, today)])),
    [rules, values, today]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (onlyEditable && !r.editable) return false;
      if (!q) return true;
      const diffs = summaries.get(r.rule_key)?.differences || [];
      return [r.label, r.description, r.applies_note, ...diffs.map((d) => d.department)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rules, summaries, search, onlyEditable]);

  const openRule = rules.find((r) => r.rule_key === openKey) || null;

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Rules Console"
        subtitle="The attendance, leave and C/O rules in force today. Rules marked Changeable can be set per department."
      />
      <CollapsibleHelp label="how changes work">
        Each change needs a start date and a reason, and is kept in the rule’s history. Days before the start date keep
        the old rule. Rules marked Fixed are built into the system and are shown here for reference.
      </CollapsibleHelp>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            className={`${inputClass} pl-8`}
            placeholder="Search rules or departments"
            aria-label="Search rules or departments"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-ink-secondary">
          <input
            type="checkbox"
            className="accent-accent"
            checked={onlyEditable}
            onChange={(e) => setOnlyEditable(e.target.checked)}
          />
          Only changeable rules
        </label>
      </div>

      {status !== "ready" ? (
        <div className="rounded-card border border-border bg-surface shadow-card p-4">
          <ListState status={status} error={error} onRetry={retry} />
        </div>
      ) : (
        <ListState status="ready" isEmpty={!visible.length} emptyText="No rules match your search.">
          {RULE_MODULES.map((mod) => {
            const list = visible.filter((r) => r.module === mod.id);
            if (!list.length) return null;
            return (
              <SectionCard key={mod.id} title={mod.label} className="mb-4">
                <ul className="-my-2 divide-y divide-divider">
                  {list.map((rule) => (
                    <RuleRow
                      key={rule.rule_key}
                      rule={rule}
                      summary={summaries.get(rule.rule_key)}
                      onOpen={() => setOpenKey(rule.rule_key)}
                    />
                  ))}
                </ul>
              </SectionCard>
            );
          })}
        </ListState>
      )}

      {openRule ? (
        <RuleDrawer
          key={openRule.rule_key}
          rule={openRule}
          values={values}
          departments={departments}
          onClose={() => setOpenKey(null)}
          onSaved={reload}
        />
      ) : null}
    </div>
  );
}

function RuleRow({ rule, summary, onOpen }) {
  const diffs = summary?.differences || [];
  const value = formatRuleValue(rule, summary?.companyValue);
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{rule.label}</p>
        <p className="mt-0.5 text-xs text-ink-secondary line-clamp-2">{rule.description}</p>
      </div>
      <div className="w-full sm:w-72 shrink-0 text-left sm:text-right">
        <p className="text-sm font-semibold text-ink">
          {rule.allows_department && diffs.length ? `${value} by default` : value}
        </p>
        {diffs.length ? (
          <p className="mt-0.5 text-xs text-warning" title={diffs.map((d) => d.department).join(", ")}>
            {formatRuleValue(rule, diffs[0].value)} for {departmentListLabel(diffs.map((d) => d.department))}
          </p>
        ) : rule.allows_department ? (
          <p className="mt-0.5 text-xs text-ink-muted">Same for every department</p>
        ) : null}
        {summary?.scheduled?.length ? (
          <p className="mt-0.5 text-xs text-info">Change scheduled</p>
        ) : null}
      </div>
      <div className="w-24 shrink-0 flex items-center justify-end gap-1">
        {rule.editable ? (
          <>
            <StatusChip label="Changeable" severity="info" />
            <ChevronRight className="h-4 w-4 text-ink-muted" aria-hidden />
          </>
        ) : (
          <span title="Built into the system">
            <StatusChip label="Fixed" severity="neutral" />
          </span>
        )}
      </div>
    </>
  );

  if (!rule.editable) {
    return <li className="flex flex-wrap items-center gap-3 px-2 py-3 sm:flex-nowrap">{content}</li>;
  }
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full flex-wrap items-center gap-3 py-3 text-left hover:bg-surface-sunken sm:flex-nowrap rounded-control px-2 ${focusRingClass}`}
        aria-label={`${rule.label}: ${value}. Open to change`}
      >
        {content}
      </button>
    </li>
  );
}
