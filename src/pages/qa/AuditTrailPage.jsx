import React, { useEffect, useMemo, useState } from "react";
import {
  DenseTable,
  EmptyState,
  FilterBar,
  InlineAlert,
  LoadingBlock,
  PageTaskHeader,
  SecondaryButton,
  SectionCard,
  TinyInput,
  TinySelect,
} from "../../components/erpUi";
import { toast } from "../../lib/toast";
import { listAuditLog, verifyAuditChain } from "./qaApi";

function summarizeDiff(oldRow, newRow) {
  if (!oldRow && newRow) return "Created";
  if (oldRow && !newRow) return "Deleted";
  try {
    const a = oldRow || {};
    const b = newRow || {};
    const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).filter(
      (k) => !["updated_at", "created_at"].includes(k)
    );
    const changes = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (!changes.length) return "No field changes";
    return changes
      .slice(0, 6)
      .map((k) => `${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`)
      .join("; ");
  } catch {
    return "Changed";
  }
}

export default function AuditTrailPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tableName, setTableName] = useState("");
  const [search, setSearch] = useState("");
  const [verifyMsg, setVerifyMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await listAuditLog({ limit: 300, tableName: tableName || null });
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load audit log.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableName]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.record_key || ""} ${r.table_name || ""} ${r.action || ""} ${r.actor_role || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const columns = useMemo(
    () => [
      {
        key: "at",
        label: "When",
        render: (r) => (r.at ? new Date(r.at).toLocaleString() : "—"),
      },
      { key: "actor_role", label: "Role", render: (r) => r.actor_role || "—" },
      { key: "action", label: "Action", render: (r) => r.action },
      { key: "table_name", label: "Table", render: (r) => r.table_name },
      { key: "record_key", label: "Record", render: (r) => r.record_key || "—" },
      {
        key: "diff",
        label: "What changed",
        render: (r) => (
          <span className="text-[11px] text-ink-secondary line-clamp-2" title={summarizeDiff(r.old_row, r.new_row)}>
            {summarizeDiff(r.old_row, r.new_row)}
          </span>
        ),
      },
    ],
    []
  );

  const onVerify = () => {
    const oldestFirst = [...rows].sort((a, b) => a.id - b.id);
    const result = verifyAuditChain(oldestFirst);
    if (result.ok) {
      setVerifyMsg(`Chain OK across ${oldestFirst.length} rows.`);
      toast.success("Audit hash chain is continuous.");
    } else {
      setVerifyMsg(`Breaks at ${result.breaks.map((b) => b.atId).join(", ")}`);
      toast.error("Hash chain break detected.");
    }
  };

  return (
    <>
      <PageTaskHeader
        title="Audit trail"
        subtitle="Read-only. Every QA write is hash-chained."
        actions={
          <SecondaryButton type="button" onClick={onVerify} disabled={!rows.length}>
            Verify chain
          </SecondaryButton>
        }
      />
      <FilterBar>
        <TinyInput placeholder="Search record / table / role" value={search} onChange={(e) => setSearch(e.target.value)} />
        <TinySelect value={tableName} onChange={(e) => setTableName(e.target.value)}>
          <option value="">All tables</option>
          {[
            "requests",
            "test_cases",
            "test_case_versions",
            "executions",
            "defects",
            "waivers",
            "release_signoffs",
            "members",
            "releases",
          ].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </TinySelect>
      </FilterBar>
      {verifyMsg ? <InlineAlert tone="info" className="mt-3">{verifyMsg}</InlineAlert> : null}
      {error ? <InlineAlert tone="error" className="mt-3">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingBlock label="Loading audit log…" className="mt-3" />
      ) : (
        <SectionCard title={`Entries (${filtered.length})`} className="mt-3">
          {filtered.length === 0 ? (
            <EmptyState title="No entries" message="Nothing matches these filters." />
          ) : (
            <DenseTable columns={columns} rows={filtered} rowKey="id" />
          )}
        </SectionCard>
      )}
    </>
  );
}
