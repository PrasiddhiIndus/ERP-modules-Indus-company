import React from "react";
import { PrimaryButton, SecondaryButton } from "../../../../components/erpUi";
import { canRemoveFromStructure } from "../validation/setupDependencies.js";

/**
 * Pre-removal warning for Site Setup cost lines.
 *
 * Shows what else uses the line, then offers:
 *   Cancel | Keep assigned | Remove from site structure (hidden when hard-blocked)
 *
 * Removing only changes which lines the site tracks — figures already entered are kept.
 * Pure presentational: all state lives in the caller.
 */
export function SetupDependencyPanel({
  analysis,
  headLabel = "this cost line",
  siteName = "",
  periodLabel = (k) => k,
  onCancel,
  onKeepAssigned,
  onRemove,
  busy = false,
}) {
  if (!analysis) return null;
  const blocked = !canRemoveFromStructure(analysis);
  const hasHistory = analysis.historicalPeriods.length > 0;
  const tone = blocked ? "critical" : analysis.safe ? "ok" : "warn";
  const border = tone === "critical"
    ? "var(--critical-border, #f1b4b4)"
    : tone === "warn"
      ? "var(--warn-border, #e2b93b)"
      : "var(--border, #d6dbe3)";
  const background = tone === "critical"
    ? "var(--critical-soft, #fff1f1)"
    : tone === "warn"
      ? "var(--warn-soft, #fff8e6)"
      : "var(--surface-raised, #fff)";

  return (
    <div
      role="alertdialog"
      aria-label={`Remove ${headLabel} from site`}
      data-testid="setup-dependency-panel"
      data-suggestion={analysis.suggestion}
      style={{
        padding: "14px 16px",
        borderRadius: 8,
        border: `1px solid ${border}`,
        background,
        color: "var(--ink, #1f2937)",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        Remove “{headLabel}”{siteName ? ` from ${siteName}` : ""}?
      </div>

      {analysis.safe ? (
        <p style={{ margin: "0 0 10px" }}>
          Nothing else uses this cost line, so it can be taken off the site safely.
        </p>
      ) : (
        <ul data-testid="setup-dependency-reasons" style={{ margin: "0 0 10px", paddingLeft: 18 }}>
          {analysis.reasons.map((r) => <li key={r} style={{ marginBottom: 4 }}>{r}</li>)}
        </ul>
      )}

      {hasHistory && !blocked && (
        <p data-testid="setup-dependency-history-note" style={{ margin: "0 0 10px", opacity: 0.9 }}>
          Figures already entered{analysis.historicalPeriods.length === 1
            ? ` for ${periodLabel(analysis.historicalPeriods[0])}`
            : ` in ${analysis.historicalPeriods.length} periods`} are kept in the database; only the
          cost line is taken off this site&apos;s structure. If you just want to stop using it, choose
          <b> Keep assigned</b> and leave its figures blank going forward.
        </p>
      )}

      {blocked && (
        <p data-testid="setup-dependency-blocked" style={{ margin: "0 0 10px", fontWeight: 600 }}>
          This cost line cannot be removed right now.
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
        <SecondaryButton data-testid="setup-dependency-cancel" onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
        <SecondaryButton data-testid="setup-dependency-keep" onClick={onKeepAssigned || onCancel} disabled={busy}>
          Keep assigned
        </SecondaryButton>
        {!blocked && (
          <PrimaryButton data-testid="setup-dependency-remove" onClick={onRemove} disabled={busy}>
            Remove from site structure
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}

export default SetupDependencyPanel;
