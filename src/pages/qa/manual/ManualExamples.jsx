import React from "react";
import { SecondaryButton } from "../../../components/erpUi";
import {
  CASE_STATUSES,
  RESULTS,
  RISK_LEVELS,
  SEVERITIES,
  STAGES,
} from "../qaConstants";
import { riskFromLikelihoodImpact } from "../qaRules";
import {
  CaseStatusChip,
  CoverageChip,
  PriorityChip,
  ResultChip,
  RiskChip,
  SeverityChip,
  StageChip,
} from "../components/QaChips";

function ExampleFrame({ label, children, alt }) {
  return (
    <figure className="my-3 rounded-lg border border-dashed border-border bg-surface-sunken/40 p-3" aria-label={alt || label}>
      <figcaption className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-2">
        Example · {label}
      </figcaption>
      <div aria-hidden="true" className="pointer-events-none select-none opacity-95" tabIndex={-1}>
        {children}
      </div>
      <p className="sr-only">{alt || `Non-interactive example of ${label}`}</p>
    </figure>
  );
}

function StationsStrip() {
  return (
    <div className="flex flex-wrap gap-2">
      {STAGES.map((s, i) => (
        <div
          key={s.value}
          className="px-3 py-2 rounded-md border border-border bg-surface text-left min-w-[6.5rem]"
        >
          <div className="text-[11px] text-ink-muted">
            {i + 1}. {s.label}
          </div>
          <div className="text-sm font-semibold text-ink">
            <StageChip stage={s.value} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RiskMatrixDemo() {
  const levels = [1, 2, 3];
  const cellTone = (l, i) => {
    const band = riskFromLikelihoodImpact(l, i);
    if (band === "high") return "bg-critical-soft border-critical-border";
    if (band === "medium") return "bg-warning-soft border-warning-border";
    return "bg-success-soft border-success-border";
  };
  return (
    <table className="border-collapse text-[10px] max-w-xs">
      <thead>
        <tr>
          <th className="w-8 text-ink-muted font-normal" />
          {levels.map((n) => (
            <th key={n} className="text-ink-muted font-medium pb-1 px-1">
              Impact {n}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {levels.map((l) => (
          <tr key={l}>
            <td className="text-ink-muted font-medium pr-1">Like. {l}</td>
            {levels.map((i) => (
              <td key={i} className="p-0.5">
                <span
                  className={`inline-flex w-full min-h-[2rem] items-center justify-center rounded border text-[10px] font-medium ${cellTone(l, i)}`}
                >
                  {l * i}
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StepRowDemo() {
  return (
    <div className="rounded border border-accent bg-accent-soft/40 p-2.5 text-xs max-w-md">
      <div className="font-medium text-ink">Step 1: Open Payslip for March</div>
      <div className="text-ink-muted mt-0.5">Expected: ESI base shows ₹21,000.00</div>
      <div className="mt-2 flex flex-wrap gap-1.5 items-center">
        <ResultChip result="not_run" />
        {RESULTS.filter((r) => r.value !== "not_run").map((r) => (
          <SecondaryButton key={r.value} type="button" tabIndex={-1}>
            {r.label}
          </SecondaryButton>
        ))}
      </div>
    </div>
  );
}

function ColoursGuide() {
  return (
    <div className="space-y-3 text-xs">
      <div>
        <p className="font-medium text-ink mb-1">Test results</p>
        <ul className="space-y-1">
          {RESULTS.map((r) => (
            <li key={r.value} className="flex flex-wrap items-center gap-2">
              <ResultChip result={r.value} />
              <span className="text-ink-secondary">{r.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-medium text-ink mb-1">Severity</p>
        <ul className="space-y-1">
          {SEVERITIES.map((s) => (
            <li key={s.value} className="flex flex-wrap items-center gap-2">
              <SeverityChip severity={s.value} />
              <span className="text-ink-secondary">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-medium text-ink mb-1">Priority & risk</p>
        <div className="flex flex-wrap gap-2 items-center">
          <PriorityChip priority="P1" />
          <span className="text-ink-muted">fix now</span>
          {RISK_LEVELS.map((r) => (
            <span key={r.value} className="inline-flex items-center gap-1">
              <RiskChip risk={r.value} />
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="font-medium text-ink mb-1">Test case status</p>
        <div className="flex flex-wrap gap-2">
          {CASE_STATUSES.map((s) => (
            <CaseStatusChip key={s.value} status={s.value} />
          ))}
        </div>
      </div>
      <div>
        <p className="font-medium text-ink mb-1">Coverage chips</p>
        <div className="flex flex-wrap gap-2">
          <CoverageChip requirement="system" coverage="pass" />
          <CoverageChip requirement="system" coverage="open" />
          <CoverageChip requirement="system" coverage="draft" />
          <CoverageChip requirement="system" coverage="fail" />
          <CoverageChip requirement="system" coverage="gap" />
        </div>
      </div>
      <div>
        <p className="font-medium text-ink mb-1">Release gate lights</p>
        <ul className="space-y-1">
          <li className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-success" />
            <span>Rule met</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-warning" />
            <span>Waiver written</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-critical" />
            <span>Not met yet</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function ManualExample({ kind }) {
  if (kind === "stations") {
    return (
      <ExampleFrame label="Five stations" alt="Five workflow stations: Intake, Plan, Design, Execute, Close">
        <StationsStrip />
      </ExampleFrame>
    );
  }
  if (kind === "colours") {
    return (
      <ExampleFrame label="Colours and signs" alt="Status badges and chips with their word meanings">
        <ColoursGuide />
      </ExampleFrame>
    );
  }
  if (kind === "risk-matrix") {
    return (
      <ExampleFrame label="Risk matrix" alt="Three by three likelihood times impact risk matrix">
        <RiskMatrixDemo />
      </ExampleFrame>
    );
  }
  if (kind === "steps" || kind === "player") {
    return (
      <ExampleFrame label="Test step with Pass / Fail / Blocked" alt="Sample execution step with Pass Fail Blocked buttons">
        <StepRowDemo />
      </ExampleFrame>
    );
  }
  return null;
}
