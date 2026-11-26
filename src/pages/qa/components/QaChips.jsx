import React from "react";
import {
  COVERAGE_TONES,
  RISK_MAP,
  RESULT_MAP,
  CASE_STATUS_MAP,
  STAGE_MAP,
  stageLabel,
} from "../qaConstants";

export function ToneChip({ children, tone, title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${tone || "bg-surface-sunken text-ink-muted border-border"}`}
    >
      {children}
    </span>
  );
}

export function RiskChip({ risk }) {
  const meta = RISK_MAP[risk];
  return <ToneChip tone={meta?.tone}>{meta?.label || risk || "—"}</ToneChip>;
}

export function StageChip({ stage }) {
  return (
    <ToneChip tone="bg-accent-soft text-accent border-accent-border">{stageLabel(stage)}</ToneChip>
  );
}

export function ClassChip({ changeClass }) {
  return (
    <ToneChip tone="bg-info-soft text-info border-info-border" title="Change class">
      Class {changeClass || "—"}
    </ToneChip>
  );
}

export function ResultChip({ result }) {
  const meta = RESULT_MAP[result] || RESULT_MAP.not_run;
  return <ToneChip tone={meta.tone}>{meta.label}</ToneChip>;
}

export function CaseStatusChip({ status }) {
  const meta = CASE_STATUS_MAP[status];
  return <ToneChip tone={meta?.tone}>{meta?.label || status || "—"}</ToneChip>;
}

export function CoverageChip({ requirement, coverage }) {
  const tone = COVERAGE_TONES[coverage] || COVERAGE_TONES.gap;
  return (
    <ToneChip tone={tone} title={`${requirement}: ${coverage}`}>
      {requirement}
      <span className="opacity-70 ml-1">{coverage}</span>
    </ToneChip>
  );
}

export function SeverityChip({ severity }) {
  const tone =
    severity === "S1" || severity === "S2"
      ? "bg-critical-soft text-critical border-critical-border"
      : severity === "S3"
        ? "bg-warning-soft text-warning border-warning-border"
        : "bg-neutral-state-soft text-neutral-state border-neutral-state-border";
  return <ToneChip tone={tone}>{severity || "—"}</ToneChip>;
}

export function PriorityChip({ priority }) {
  return <ToneChip tone="bg-surface-sunken text-ink-secondary border-border">{priority || "—"}</ToneChip>;
}

export { STAGE_MAP };
