import React, { useMemo } from "react";
import { analyzeConflictMerge } from "../persistence/financeConcurrency.js";

/**
 * Shows original / server / pending for a revision conflict.
 * Never auto-overwrites the server version.
 */
export function ConflictResolutionPanel({
  original = {},
  server = {},
  pending = {},
  message = "",
  onReloadServer,
  onKeepEditing,
  busy = false,
}) {
  const analysis = useMemo(
    () => analyzeConflictMerge({ original, server, pending }),
    [original, server, pending],
  );

  const fmt = (v) => {
    if (v == null || v === "") return "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return (
    <div
      role="alertdialog"
      data-testid="conflict-resolution-panel"
      style={{
        margin: "10px 0 0",
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid var(--critical-border, #f1b4b4)",
        background: "var(--critical-soft, #fff1f1)",
        color: "var(--ink, #1f2937)",
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Revision conflict</div>
      <div style={{ marginBottom: 8 }}>
        {message || "Someone else saved this record first. Your local draft is kept — nothing was overwritten."}
      </div>
      <div style={{ marginBottom: 8, opacity: 0.9 }}>
        Safe to re-apply after reload: <strong>{analysis.safe.length}</strong>
        {" · "}
        Needs manual decision: <strong>{analysis.manual.length}</strong>
      </div>
      {analysis.manual.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Requires manual resolution</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontFamily: "var(--mono, ui-monospace, monospace)", fontSize: 12 }}>
            {analysis.manual.slice(0, 10).map((row) => (
              <li key={row.key} style={{ marginBottom: 4 }}>
                {row.key}: yours {fmt(row.pending)} · database {fmt(row.server)} · opened as {fmt(row.original)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {analysis.safe.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Independent changes (safe to re-apply after reload)</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontFamily: "var(--mono, ui-monospace, monospace)", fontSize: 12 }}>
            {analysis.safe.slice(0, 8).map((row) => (
              <li key={row.key} style={{ marginBottom: 4 }}>
                {row.key}: {fmt(row.pending)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="primary" disabled={busy} onClick={() => onKeepEditing?.()}>
          Keep my draft
        </button>
        <button type="button" className="ghost-d" disabled={busy} onClick={() => onReloadServer?.()}>
          Load latest from database
        </button>
      </div>
    </div>
  );
}

/**
 * Site Setup variant: the setup save was rejected because the database changed.
 * Same pattern as the figure conflict panel — never overwrites silently.
 *   Keep my draft          → close the panel, edits stay on screen, user may Save again.
 *   Load latest from database → discard the on-screen draft and reload the baseline.
 */
export function SetupConflictPanel({
  message = "",
  onReloadBaseline,
  onKeepDraft,
  busy = false,
}) {
  return (
    <div
      role="alertdialog"
      data-testid="setup-conflict-panel"
      style={{
        margin: "10px 0 12px",
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid var(--critical-border, #f1b4b4)",
        background: "var(--critical-soft, #fff1f1)",
        color: "var(--ink, #1f2937)",
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Site Setup changed in the database</div>
      <div style={{ marginBottom: 10 }}>
        {message
          || "Someone else saved Site Setup while you were editing. Your edits are still on screen and nothing was overwritten."}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="primary" disabled={busy} onClick={() => onKeepDraft?.()}>
          Keep my draft
        </button>
        <button type="button" className="ghost-d" disabled={busy} onClick={() => onReloadBaseline?.()}>
          Load latest from database
        </button>
      </div>
    </div>
  );
}
