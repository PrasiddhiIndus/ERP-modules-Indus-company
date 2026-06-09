import React, { useState } from "react";
import { Download, Upload, Copy } from "lucide-react";
import { useFinance } from "./contexts/FinanceContext";
import { PageHeader, SectionCard, LoadingState, ErrorState } from "./components/FinanceUi";
import { exportFinanceBackup, logImportExport } from "../../services/financeApi";

export default function ImportExport() {
  const { data, loading, error, refresh, permissions } = useFinance();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const backup = await exportFinanceBackup();
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finance-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await logImportExport({
        operation: "export",
        file_name: a.download,
        record_count: backup.sites?.length || 0,
        status: "completed",
      });
      await refresh();
    } catch (e) {
      alert(e?.message || "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const backup = await exportFinanceBackup();
    await navigator.clipboard?.writeText(JSON.stringify(backup, null, 2));
  };

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  if (!permissions.canImportExport) {
    return (
      <p className="text-sm text-gray-500 py-8 text-center">
        Import/export is restricted to Finance Admin users.
      </p>
    );
  }

  return (
    <div>
      <PageHeader title="Import / Export" subtitle="Backup and restore finance master data and entries" onRefresh={refresh} />
      <SectionCard title="Export / Backup">
        <p className="text-sm text-gray-600 mb-4">
          Download a JSON backup of sites, heads, budgets, entries, and cost allocations.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={download}
            className="inline-flex items-center gap-2 h-9 px-4 text-sm bg-[#1F6F4E] text-white rounded-lg"
          >
            <Download size={16} />
            Download backup
          </button>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-2 h-9 px-4 text-sm border border-gray-300 rounded-lg bg-white"
          >
            <Copy size={16} />
            Copy to clipboard
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Import / Restore">
        <p className="text-sm text-gray-600 mb-3">
          Paste a valid finance backup JSON. Import restores data via the API (use with caution in production).
        </p>
        <textarea
          className="w-full h-40 border border-gray-300 rounded-lg p-3 text-xs font-mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste backup JSON here…"
        />
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-2 h-9 px-4 text-sm border border-amber-400 text-amber-900 bg-amber-50 rounded-lg"
          onClick={() => {
            try {
              JSON.parse(text);
              alert("Import via UI is prepared — validate JSON structure. Use Supabase migration or admin scripts for bulk restore in production.");
              logImportExport({ operation: "import", status: "partial", metadata: { note: "validated only" } });
            } catch {
              alert("Invalid JSON. Paste a valid finance backup file.");
            }
          }}
        >
          <Upload size={16} />
          Validate &amp; prepare import
        </button>
      </SectionCard>

      <SectionCard title="Recent Activity">
        <ul className="text-sm space-y-2">
          {(data?.importExportLogs || []).length === 0 ? (
            <li className="text-gray-500">No import/export activity yet.</li>
          ) : (
            data.importExportLogs.map((log) => (
              <li key={log.id} className="flex justify-between border-b border-gray-100 py-2">
                <span>{log.operation} · {log.file_name || "—"}</span>
                <span className="text-gray-500 text-xs">{new Date(log.created_at).toLocaleString()}</span>
              </li>
            ))
          )}
        </ul>
      </SectionCard>
    </div>
  );
}
