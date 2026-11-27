import React, { useMemo, useState } from "react";
import { formatDraftReviewLines } from "../persistence/draftCompare.js";

const STATUS_STYLES = {
  available: {
    border: "1px solid var(--warn-border, #e2b93b)",
    background: "var(--warn-soft, #fff8e6)",
  },
  conflict: {
    border: "1px solid var(--critical-border, #f1b4b4)",
    background: "var(--critical-soft, #fff1f1)",
  },
  recovered: {
    border: "1px solid var(--accent-border, #9ec5fe)",
    background: "var(--accent-soft, #eef5ff)",
  },
  pending: {
    border: "1px solid var(--warn-border, #e2b93b)",
    background: "var(--warn-soft, #fff8e6)",
  },
  save_failed: {
    border: "1px solid var(--critical-border, #f1b4b4)",
    background: "var(--critical-soft, #fff1f1)",
  },
  committed: {
    border: "1px solid var(--profit-border, #a7d7b5)",
    background: "var(--profit-soft, #eefbf2)",
  },
};

/**
 * Explicit Resume / Discard / Review for Site Ledger figure drafts.
 * Never auto-applies drafts.
 */
export function DraftRecoveryPanel({
  comparison = null,
  storageWarning = null,
  lifecycle = "available",
  onResume,
  onDiscard,
  busy = false,
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const lines = useMemo(
    () => (comparison ? formatDraftReviewLines(comparison, 16) : []),
    [comparison],
  );

  if (!comparison?.hasDraft || !comparison.differsFromServer) {
    if (!storageWarning && lifecycle !== "recovered" && lifecycle !== "committed") return null;
  }

  const tone = comparison?.isConflict ? "conflict" : lifecycle;
  const style = STATUS_STYLES[tone] || STATUS_STYLES.available;

  const title = comparison?.isConflict
    ? "Draft conflict — review before resuming"
    : lifecycle === "recovered"
      ? "Draft recovered (not saved to database)"
      : lifecycle === "save_failed"
        ? "Save failed — local draft kept"
        : lifecycle === "committed"
          ? "Saved to database"
          : "Local draft available";

  const when = comparison?.draftUpdatedAt
    ? new Date(comparison.draftUpdatedAt).toLocaleString()
    : null;

  return (
    <div
      role="status"
      data-testid="draft-recovery-panel"
      style={{
        margin: "10px 0 0",
        padding: "10px 12px",
        borderRadius: 8,
        ...style,
        color: "var(--ink, #1f2937)",
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {comparison?.summary && <div style={{ marginBottom: 6 }}>{comparison.summary}</div>}
      {when && (
        <div style={{ opacity: 0.85, marginBottom: 6 }}>
          Draft last modified {when}
          {comparison?.draftCreatedAt
            ? ` · created ${new Date(comparison.draftCreatedAt).toLocaleString()}`
            : ""}
        </div>
      )}
      <div style={{ opacity: 0.9, marginBottom: 8 }}>
        This data exists only as a local draft until you click <strong>Save changes</strong>.
      </div>
      {storageWarning && (
        <div style={{ marginBottom: 8, color: "var(--critical, #b42318)" }}>
          {storageWarning}
        </div>
      )}
      {comparison?.differsFromServer && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="primary" disabled={busy} onClick={() => onResume?.()}>
            Resume draft
          </button>
          <button type="button" className="ghost-d" disabled={busy} onClick={() => onDiscard?.()}>
            Discard draft
          </button>
          <button
            type="button"
            className="ghost-d"
            disabled={busy}
            onClick={() => setReviewOpen((v) => !v)}
          >
            {reviewOpen ? "Hide review" : "Review differences"}
          </button>
        </div>
      )}
      {reviewOpen && lines.length > 0 && (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          {lines.map((line) => (
            <li key={line} style={{ marginBottom: 4, fontFamily: "var(--mono, ui-monospace, monospace)", fontSize: 12 }}>
              {line}
            </li>
          ))}
        </ul>
      )}
      {reviewOpen && !lines.length && (
        <div style={{ marginTop: 8, opacity: 0.8 }}>No field-level differences listed.</div>
      )}
    </div>
  );
}

/**
 * Compact save/draft status chip for the figures toolbar.
 */
export function DraftStatusChip({ state }) {
  if (!state || state === "idle") return null;
  const labels = {
    draft_available: "Draft available",
    draft_recovered: "Draft recovered",
    draft_modified: "Draft modified",
    draft_pending_save: "Draft pending save",
    save_failed: "Save failed — draft kept",
    draft_conflict: "Draft conflict",
    committed: "Saved to database",
  };
  const colors = {
    draft_available: "var(--warn, #a16207)",
    draft_recovered: "var(--accent, #1d4ed8)",
    draft_modified: "var(--warn, #a16207)",
    draft_pending_save: "var(--warn, #a16207)",
    save_failed: "var(--critical, #b42318)",
    draft_conflict: "var(--critical, #b42318)",
    committed: "var(--profit, #15803d)",
  };
  return (
    <span
      data-testid="draft-status-chip"
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: colors[state] || "var(--muted)",
        whiteSpace: "nowrap",
      }}
    >
      {labels[state] || state}
    </span>
  );
}
