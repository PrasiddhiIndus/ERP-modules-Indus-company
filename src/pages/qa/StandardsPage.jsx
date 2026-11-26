import React, { useEffect, useState } from "react";
import {
  DenseTable,
  InlineAlert,
  LoadingBlock,
  PageTaskHeader,
  SectionCard,
  CollapsibleHelp,
} from "../../components/erpUi";
import { SEVERITIES, PRIORITIES } from "./qaConstants";
import { listRequiredLevelRules, listSignoffRules } from "./qaApi";

export default function StandardsPage() {
  const [levels, setLevels] = useState([]);
  const [signoffs, setSignoffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [l, s] = await Promise.all([listRequiredLevelRules(), listSignoffRules()]);
        if (!cancelled) {
          setLevels(l);
          setSignoffs(s);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load rules.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageTaskHeader
        title="Standards & rules"
        subtitle="ISO mappings, class/risk rules, and who may do what."
      />
      {error ? <InlineAlert tone="error" className="mb-3">{error}</InlineAlert> : null}

      <div className="space-y-4">
        <SectionCard title="Standards map">
          <CollapsibleHelp label="ISO / IEC references used by this module">
            <ul className="text-xs text-ink-secondary space-y-1 list-disc pl-4">
              <li>
                <strong>29119-1</strong> — terminology.
              </li>
              <li>
                <strong>29119-2</strong> — processes (workflow, stage gates, monitoring, release gate).
              </li>
              <li>
                <strong>29119-3</strong> — documentation (request, case specs, execution log, defects, completion report).
              </li>
              <li>
                <strong>29119-4</strong> — test design techniques on each case.
              </li>
              <li>
                <strong>ISO/IEC 25010:2023</strong> — quality characteristics on each case.
              </li>
              <li>
                <strong>ISO/IEC 20246</strong> — reviews (independent approval of cases).
              </li>
              <li>
                <strong>ISO 9001:2015</strong> — documented information, V&amp;V, release, nonconforming outputs, corrective action.
              </li>
              <li>
                <strong>ISO/IEC 27001:2022</strong> — Annex A 8.29 security testing, 8.32 change management.
              </li>
            </ul>
          </CollapsibleHelp>
        </SectionCard>

        <SectionCard title="Class / risk → required levels">
          {loading ? (
            <LoadingBlock label="Loading rules…" />
          ) : (
            <DenseTable
              columns={[
                { key: "change_class", label: "Class", render: (r) => r.change_class },
                { key: "risk", label: "Risk", render: (r) => r.risk },
                { key: "requirement", label: "Requirement", render: (r) => r.requirement },
              ]}
              rows={levels.map((r) => ({
                ...r,
                id: `${r.change_class}-${r.risk}-${r.requirement}`,
              }))}
              rowKey="id"
            />
          )}
        </SectionCard>

        <SectionCard title="Class → sign-off roles">
          <DenseTable
            columns={[
              { key: "change_class", label: "Class", render: (r) => r.change_class },
              { key: "signer_role", label: "Signer role", render: (r) => r.signer_role },
            ]}
            rows={signoffs.map((r) => ({
              ...r,
              id: `${r.change_class}-${r.signer_role}`,
            }))}
            rowKey="id"
          />
        </SectionCard>

        <SectionCard title="Severity & priority">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <ul className="space-y-2">
              {SEVERITIES.map((s) => (
                <li key={s.value}>
                  <strong>{s.label}</strong> — {s.help}
                </li>
              ))}
            </ul>
            <ul className="space-y-2">
              {PRIORITIES.map((p) => (
                <li key={p.value}>
                  <strong>{p.label}</strong>
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Who may do what">
          <DenseTable
            columns={[
              { key: "action", label: "Action", render: (r) => r.action },
              { key: "who", label: "Who", render: (r) => r.who },
            ]}
            rows={[
              { action: "Create request", who: "Tester, QA Lead, Developer, Product Owner" },
              { action: "Triage request / defects, approve cases, waive, edit rules, members, releases", who: "QA Lead" },
              { action: "Create/edit cases, create runs, record results, close defects", who: "Tester, QA Lead" },
              { action: "Mark fix ready for retest", who: "Developer, QA Lead" },
              { action: "Sign request / release", who: "Each role for itself" },
              { action: "View", who: "All QA members (viewer is read-only)" },
            ]}
            rowKey="action"
          />
        </SectionCard>
      </div>
    </>
  );
}
