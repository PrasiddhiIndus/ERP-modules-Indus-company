import React, { useEffect, useMemo, useState } from "react";
import { toast } from "../../../../lib/toast";
import { Modal, StatusChip } from "../../../adminOperations/components/AdminUi";
import { formatSalaryRangeLabel } from "../../../../lib/siteAttendance/salaryCycle";
import { listAttendance, userFriendlyError } from "../../../../lib/siteAttendance/siteAttendanceApi";
import { detectFileKind } from "../../../../lib/siteAttendance/import/fileReaders";
import { getProviderForFile, IMPORT_ACCEPT_ATTR } from "../../../../lib/siteAttendance/import/providers";
import { MARK_DICTIONARY_VERSION, describeMarkDictionary } from "../../../../lib/siteAttendance/import/markDictionary";
import { CELL_STATUS, buildImportPreview } from "../../../../lib/siteAttendance/import/buildImportPreview";
import { findCommittedImport, parseCommitErrorDetails, saveImportBatch } from "../../../../lib/siteAttendance/import/importApi";

const STATUS_CLASS = {
  [CELL_STATUS.NEW]: "bg-emerald-50 text-emerald-900",
  [CELL_STATUS.SAME]: "bg-slate-50 text-ink-muted",
  [CELL_STATUS.CONFLICT]: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-400",
  [CELL_STATUS.INVALID]: "bg-red-100 text-red-900 ring-1 ring-inset ring-red-400",
  [CELL_STATUS.UNKNOWN]: "bg-red-100 text-red-900 ring-1 ring-inset ring-red-400",
  [CELL_STATUS.EMPTY]: "",
};

const STATUS_LABEL = {
  [CELL_STATUS.NEW]: "Will be saved",
  [CELL_STATUS.SAME]: "Already recorded",
  [CELL_STATUS.CONFLICT]: "Conflicts with existing — kept existing",
  [CELL_STATUS.INVALID]: "Breaks an attendance rule",
  [CELL_STATUS.UNKNOWN]: "Mark not recognised",
  [CELL_STATUS.EMPTY]: "Nothing in file",
};

function cellTitle(cell) {
  const lines = [STATUS_LABEL[cell.status]];
  if (cell.rawMark || cell.rawOt) lines.push(`File: ${cell.rawMark || "—"}${cell.rawOt ? ` · OT ${cell.rawOt}` : ""}${cell.col ? ` (col ${cell.col})` : ""}`);
  if (cell.existing) lines.push(`Existing: ${cell.existing.code || "—"}${cell.existing.ot ? ` · OT ${cell.existing.ot}` : ""}`);
  cell.messages.forEach((m) => lines.push(m));
  if (cell.edited) lines.push("Edited in preview");
  return lines.join("\n");
}

function Stat({ label, value, tone = "" }) {
  return (
    <div className={`rounded-lg border border-border px-2.5 py-1.5 ${tone}`}>
      <div className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/**
 * Upload → local extraction → editable preview → Save (fill-empty only).
 * Nothing touches attendance until Save; Save is re-validated on the server.
 */
export default function AttendanceImportModal({ open, onClose, onSaved, grid }) {
  const { site, days, range, employees, assignments, placements, multi, locked, codes, siteId, month, year } = grid;
  const [stage, setStage] = useState("pick"); // pick | parsing | preview | saving
  const [file, setFile] = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [mappings, setMappings] = useState({});
  const [edits, setEdits] = useState({});
  const [applySandwich, setApplySandwich] = useState(true);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [showDictionary, setShowDictionary] = useState(false);
  const [saveErrors, setSaveErrors] = useState([]);

  useEffect(() => {
    if (!open) {
      setStage("pick");
      setFile(null);
      setExtracted(null);
      setRecords([]);
      setError("");
      setMappings({});
      setEdits({});
      setApplySandwich(true);
      setOnlyIssues(false);
      setSaveErrors([]);
    }
  }, [open]);

  const ctx = useMemo(
    () => ({ site, days, employees, assignments, placements, records, multi, locked, year: Number(year) }),
    [site, days, employees, assignments, placements, records, multi, locked, year]
  );
  const preview = useMemo(
    () => (extracted ? buildImportPreview(extracted, ctx, { mappings, edits, applySandwich }) : null),
    [extracted, ctx, mappings, edits, applySandwich]
  );
  const peopleById = useMemo(() => new Map(employees.map((p) => [Number(p.id), p])), [employees]);

  const handleFile = async (picked) => {
    if (!picked) return;
    setError("");
    setSaveErrors([]);
    setStage("parsing");
    try {
      const provider = getProviderForFile(picked.name);
      if (!provider) detectFileKind(picked.name, new Uint8Array(8)); // throws a helpful message
      const [result, fresh] = await Promise.all([
        provider.extract(picked, { site, cycleDays: days }),
        listAttendance({ siteId: Number(siteId), month: Number(month), year: Number(year), from: range.startDateString, to: range.endDateString }),
      ]);
      if (fresh.some((r) => r.is_locked)) throw new Error("This month is locked for the site. Import is not allowed.");
      setFile(picked);
      setRecords(fresh);
      setExtracted(result);
      setMappings({});
      setEdits({});
      setStage("preview");
    } catch (err) {
      setError(err?.message || "Could not read the file.");
      setStage("pick");
    }
  };

  const setEdit = (key, patch) => setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const save = async () => {
    if (!preview?.canSave || !extracted) return;
    setStage("saving");
    setSaveErrors([]);
    try {
      const earlier = await findCommittedImport({ siteId: Number(siteId), month: Number(month), year: Number(year), sha256: extracted.file.sha256 });
      if (earlier) {
        throw new Error(`This exact file was already imported for this month on ${new Date(earlier.committed_at).toLocaleString()}.`);
      }
      const result = await saveImportBatch({
        siteId: Number(siteId),
        month: Number(month),
        year: Number(year),
        siteType: site?.site_type,
        file: extracted.file,
        providerId: extracted.providerId,
        providerVersion: extracted.providerVersion,
        dictionaryVersion: MARK_DICTIONARY_VERSION,
        summary: preview.summary,
        warnings: extracted.warnings,
        cells: preview.cellsToSave,
      });
      toast.success("Attendance imported", `${result.applied ?? preview.cellsToSave.length} cell(s) saved.`);
      onSaved?.();
      onClose();
    } catch (err) {
      const details = parseCommitErrorDetails(err?.details);
      setSaveErrors(
        details.map((d) => `${peopleById.get(Number(d.person_id))?.full_name || `Person ${d.person_id}`} ${d.date}${d.designation ? ` (${d.designation})` : ""}: ${d.error}`)
      );
      toast.error("Import not saved", userFriendlyError(err));
      setStage("preview");
    }
  };

  const visibleRows = useMemo(() => {
    if (!preview) return [];
    if (!onlyIssues) return preview.rows;
    return preview.rows.filter(
      (row) =>
        (row.status !== "ok" && row.status !== "merged") ||
        row.notes.length ||
        row.totalIssues?.length ||
        row.cells.some((c) => [CELL_STATUS.CONFLICT, CELL_STATUS.INVALID, CELL_STATUS.UNKNOWN].includes(c.status))
    );
  }, [preview, onlyIssues]);

  const s = preview?.summary;
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="type-meta">
        {stage === "preview" && preview
          ? preview.canSave
            ? `Save writes ${preview.cellsToSave.length} cell(s). Existing values are never overwritten.`
            : preview.cellsToSave.length
              ? "Fix the items in red before saving."
              : "Nothing new to save."
          : "Nothing is saved until you click Save."}
      </p>
      <div className="flex gap-2">
        <button type="button" className="erp-btn-secondary rounded-control px-3.5 py-2 text-xs" onClick={onClose} disabled={stage === "saving"}>
          Cancel
        </button>
        {stage === "preview" || stage === "saving" ? (
          <button
            type="button"
            className="erp-btn-primary rounded-control px-3.5 py-2 text-xs disabled:opacity-50"
            onClick={save}
            disabled={!preview?.canSave || stage === "saving"}
          >
            {stage === "saving" ? "Saving…" : `Save ${preview?.cellsToSave.length || 0} cell(s)`}
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <Modal open={open} title="Import attendance" onClose={stage === "saving" ? () => {} : onClose} widthClass="max-w-[96vw]" footer={footer}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusChip label={site?.site_name || "Site"} severity="neutral" />
          {range ? <StatusChip label={`Cycle ${formatSalaryRangeLabel(range)}`} severity="neutral" /> : null}
          <StatusChip label={site?.shift_type === "ABCG" ? "ABCG shifts" : "General shift"} severity="neutral" />
          {file ? <StatusChip label={`${file.name} · ${extracted?.sheetsUsed?.join(", ") || "—"}`} severity="info" /> : null}
        </div>

        {stage === "pick" || stage === "parsing" ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm mb-1">Upload the site&apos;s attendance sheet (.xlsx or .csv).</p>
            <p className="type-meta mb-4">
              The file is read on this computer. You will see a preview first; attendance is only saved when you click Save.
            </p>
            <label className="erp-btn-primary rounded-control px-3.5 py-2 text-xs cursor-pointer inline-block">
              {stage === "parsing" ? "Reading…" : "Choose file"}
              <input
                type="file"
                accept={IMPORT_ACCEPT_ATTR}
                className="hidden"
                disabled={stage === "parsing"}
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
          </div>
        ) : null}

        {preview && (stage === "preview" || stage === "saving") ? (
          <>
            <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
              <Stat label="Rows matched" value={`${s.matched}/${s.rows - s.ignored}`} />
              <Stat label="Unmatched" value={s.unmatched} tone={s.unmatched ? "bg-red-50" : ""} />
              <Stat label="Will save" value={s.new} tone="bg-emerald-50" />
              <Stat label="Already same" value={s.same} />
              <Stat label="Conflicts kept" value={s.conflict} tone={s.conflict ? "bg-amber-50" : ""} />
              <Stat label="Invalid" value={s.invalid} tone={s.invalid ? "bg-red-50" : ""} />
              <Stat label="Unknown marks" value={s.unknown} tone={s.unknown ? "bg-red-50" : ""} />
              <Stat label="Sandwich → L" value={s.sandwich} />
              <Stat label="Totals mismatch" value={s.totalsMismatch} tone={s.totalsMismatch ? "bg-amber-50" : ""} />
            </div>

            {preview.blocking.length ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                <p className="font-semibold mb-1">Fix before saving ({preview.blocking.length})</p>
                <ul className="list-disc pl-4 space-y-0.5 max-h-28 overflow-auto">
                  {preview.blocking.slice(0, 50).map((b) => <li key={b}>{b}</li>)}
                </ul>
              </div>
            ) : null}
            {saveErrors.length ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                <p className="font-semibold mb-1">Server rejected the import (nothing was saved). Reload the grid and try again.</p>
                <ul className="list-disc pl-4 space-y-0.5 max-h-28 overflow-auto">
                  {saveErrors.slice(0, 50).map((b) => <li key={b}>{b}</li>)}
                </ul>
              </div>
            ) : null}
            {extracted.warnings.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <ul className="list-disc pl-4 space-y-0.5">
                  {extracted.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
                Show only rows that need attention
              </label>
              {site?.sandwich_rule && !multi ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={applySandwich} onChange={(e) => setApplySandwich(e.target.checked)} />
                  Apply sandwich rule ({s.sandwich} existing WO/NH-PH cell(s) become L)
                </label>
              ) : null}
              <button type="button" className="underline text-ink-secondary" onClick={() => setShowDictionary((v) => !v)}>
                {showDictionary ? "Hide" : "Show"} mark dictionary
              </button>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded bg-emerald-100" /> save
                <span className="inline-block w-3 h-3 rounded bg-amber-200 ml-2" /> conflict (kept)
                <span className="inline-block w-3 h-3 rounded bg-red-200 ml-2" /> fix
              </span>
            </div>

            {showDictionary ? (
              <div className="rounded-lg border border-border p-3 text-xs grid grid-cols-2 md:grid-cols-4 gap-2">
                {describeMarkDictionary(site?.shift_type).map(({ code, marks }) => (
                  <div key={code}>
                    <span className="font-semibold">{code}</span> ← {marks.join(", ")}
                  </div>
                ))}
                <div className="col-span-full type-meta">
                  Blank cells stay blank (never treated as absent). OT row: numbers are hours; marks such as OT / P / ✓ mean one OT duty = {site?.duty_hours === 12 ? 12 : 8} h.
                </div>
              </div>
            ) : null}

            <div className="overflow-auto max-h-[55vh] border border-border rounded-lg">
              <table className="text-[11px] border-collapse min-w-max">
                <thead className="sticky top-0 z-20 bg-surface-raised">
                  <tr>
                    <th className="sticky left-0 z-30 bg-surface-raised border border-divider px-2 py-1.5 min-w-[220px] text-left">Person (file → roster)</th>
                    {days.map((d) => (
                      <th key={d.dateString} className="border border-divider px-1 py-1 text-center min-w-[46px]">
                        <div>{d.day}</div>
                        <div className="text-[10px] text-ink-muted">{d.date.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                      </th>
                    ))}
                    <th className="border border-divider px-1" title="Counted from the file's marks / sheet total">P file/sheet</th>
                    <th className="border border-divider px-1">L</th>
                    <th className="border border-divider px-1">WO</th>
                    <th className="border border-divider px-1">OT</th>
                    <th className="border border-divider px-1" title="Grid totals after this import">After: P / L / OT</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const byDate = new Map(row.cells.map((c) => [c.date, c]));
                    const st = row.sheetTotals || {};
                    const ft = row.fileTotals || {};
                    const mismatch = (a, b) => (a != null && b != null && Math.abs(a - b) > 0.01 ? "text-red-700 font-semibold" : "");
                    const rowTone = row.status === "ignored" || row.status === "merged" ? "opacity-50" : row.status === "ok" ? "" : "bg-red-50";
                    const editable = row.status === "ok";
                    return (
                      <React.Fragment key={row.rowKey}>
                        <tr className={rowTone}>
                          <td className="sticky left-0 z-10 bg-white border border-divider px-2 py-1 align-top" rowSpan={2}>
                            <div className="font-medium whitespace-nowrap">
                              {row.rawCode ? `${row.rawCode} · ` : ""}{row.rawName || "—"}
                              {row.rawDesig ? <span className="text-ink-muted"> · {row.rawDesig}</span> : null}
                            </div>
                            <div className="text-[10px] text-ink-muted">{row.sheet} row {row.sourceRow}{row.otRow ? `, OT row ${row.otRow}` : ""}</div>
                            <select
                              className={`mt-1 h-6 w-full text-[11px] border rounded ${row.status === "ok" && row.match.method !== "fuzzy" && !row.manual ? "" : "border-amber-500"}`}
                              value={row.ignored ? "ignore" : row.personId ?? ""}
                              onChange={(e) => setMappings((prev) => ({ ...prev, [row.rowKey]: e.target.value }))}
                            >
                              <option value="">— Choose person —</option>
                              <option value="ignore">Ignore this row</option>
                              {employees.map((p) => (
                                <option key={p.id} value={p.id}>{p.unique_code} · {p.full_name}</option>
                              ))}
                            </select>
                            {row.designation ? <div className="text-[10px] mt-0.5">Designation: {row.designation}</div> : null}
                            {row.notes.concat(row.totalIssues || []).map((n) => (
                              <div key={n} className="text-[10px] text-amber-800 max-w-[260px] whitespace-normal">{n}</div>
                            ))}
                          </td>
                          {days.map((d) => {
                            const cell = byDate.get(d.dateString);
                            if (!cell) return <td key={d.dateString} className="border border-divider" />;
                            const value = edits[cell.key]?.code ?? cell.proposedCode;
                            const showRaw = edits[cell.key]?.code == null && (cell.status === CELL_STATUS.UNKNOWN || !codes.includes(value));
                            return (
                              <td key={d.dateString} className={`border border-divider p-0 ${STATUS_CLASS[cell.status]}`} title={cellTitle(cell)}>
                                {editable ? (
                                  <select
                                    className="w-full h-6 bg-transparent text-[11px] text-center"
                                    value={showRaw ? "__raw" : value}
                                    onChange={(e) => setEdit(cell.key, { code: e.target.value === "__raw" ? undefined : e.target.value })}
                                  >
                                    {showRaw ? <option value="__raw">{`?${cell.rawMark || value}`}</option> : null}
                                    {codes.map((c) => <option key={c || "empty"} value={c}>{c || "—"}</option>)}
                                  </select>
                                ) : (
                                  <div className="h-6 leading-6 text-center">{cell.rawMark}</div>
                                )}
                                {cell.status === CELL_STATUS.CONFLICT && cell.existing ? (
                                  <div className="text-[9px] text-center leading-3 pb-0.5">had {cell.existing.code || "—"}</div>
                                ) : null}
                              </td>
                            );
                          })}
                          <td className={`border border-divider px-1 text-center tabular-nums ${mismatch(ft.present, st.present)}`}>{ft.present ?? "—"}{st.present != null ? ` / ${st.present}` : ""}</td>
                          <td className={`border border-divider px-1 text-center tabular-nums ${mismatch(ft.leave, st.leave)}`}>{ft.leave ?? "—"}{st.leave != null ? ` / ${st.leave}` : ""}</td>
                          <td className={`border border-divider px-1 text-center tabular-nums ${mismatch(ft.weekoff, st.weekoff)}`}>{ft.weekoff ?? "—"}{st.weekoff != null ? ` / ${st.weekoff}` : ""}</td>
                          <td className="border border-divider px-1 text-center tabular-nums">{ft.otDays != null ? `${ft.otDays}d ${ft.otHours}h` : "—"}{st.ot != null ? ` / ${st.ot}` : ""}</td>
                          <td className="border border-divider px-1 text-center tabular-nums whitespace-nowrap">
                            {row.afterTotals ? `${row.afterTotals.totalPresent} / ${row.afterTotals.totalLeave} / ${row.afterTotals.totalOT}` : "—"}
                          </td>
                        </tr>
                        <tr className={rowTone}>
                          {days.map((d) => {
                            const cell = byDate.get(d.dateString);
                            if (!cell) return <td key={`ot-${d.dateString}`} className="border border-divider" />;
                            const otValue = edits[cell.key]?.ot ?? (cell.proposedOt || "");
                            return (
                              <td key={`ot-${d.dateString}`} className="border border-divider p-0" title={cell.rawOt ? `OT in file: ${cell.rawOt}` : "OT"}>
                                {editable ? (
                                  <input
                                    type="number"
                                    min="0"
                                    max="16"
                                    className="w-full h-5 text-center text-[10px] bg-transparent"
                                    value={otValue}
                                    placeholder="OT"
                                    onChange={(e) => setEdit(cell.key, { ot: e.target.value === "" ? 0 : Number(e.target.value) })}
                                  />
                                ) : (
                                  <div className="h-5 text-center text-[10px]">{cell.rawOt}</div>
                                )}
                              </td>
                            );
                          })}
                          <td colSpan={5} className="border border-divider" />
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  {!visibleRows.length ? (
                    <tr>
                      <td colSpan={days.length + 6} className="p-4 text-center type-meta">No rows to show.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {preview.sandwich.length && applySandwich ? (
              <p className="type-meta">
                Sandwich rule: {preview.sandwich.map((x) => `${x.person?.full_name || x.personId} ${x.date} (${x.fromCode} → L)`).join("; ")}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
