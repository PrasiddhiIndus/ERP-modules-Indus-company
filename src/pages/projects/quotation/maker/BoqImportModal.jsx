import React, { useCallback, useMemo, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { parseBoqWorkbookFile } from './boqImportParse';
import {
  BOQ_FIELD_OPTIONS,
  detectBoqColumns,
  rankBoqSheets,
} from './boqImportDetect';
import { classifyBoqRows, summarize } from './boqImportClassify';
import { makerHasLineItems, reviewRowsToMakerRows } from './boqImportToMakerRows';
import { normalizeType } from './quotationMakerModel';
import './boqImport.css';

const STEPS = ['upload', 'sheet', 'review', 'conflict'];

const AMBIGUOUS_TARGET_BY_TYPE = {
  normal: 'service',
  supply: 'supply',
  installation: 'installation',
  supply_installation: 'supply',
};

const ROW_TYPE_OPTIONS = [
  { value: 'heading', label: 'Heading' },
  { value: 'item', label: 'Item' },
  { value: 'part', label: 'Part' },
  { value: 'note', label: 'Note' },
  { value: 'total', label: 'Total' },
  { value: 'unknown', label: 'Unknown' },
];

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   existingRows: object[],
 *   onImport: (payload: { rows: object[], showMake: boolean, showRemarks: boolean, mode: string }) => void,
 * }} props
 */
export default function BoqImportModal({ open, onClose, existingRows = [], onImport, quotationType }) {
  const [step, setStep] = useState('upload');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(-1);
  const [columnMap, setColumnMap] = useState({});
  const [ambiguousRate, setAmbiguousRate] = useState(false);
  const [ambiguousTarget, setAmbiguousTarget] = useState(null);
  const [reviewRows, setReviewRows] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [pendingApply, setPendingApply] = useState(null);

  const reset = useCallback(() => {
    setStep('upload');
    setBusy(false);
    setError('');
    setFileName('');
    setSheets([]);
    setSheetIndex(0);
    setHeaderRowIndex(-1);
    setColumnMap({});
    setAmbiguousRate(false);
    setAmbiguousTarget(null);
    setReviewRows([]);
    setPendingApply(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const rebuildReview = useCallback(
    (grid, hdrIdx, map, rateTarget) => {
      const { rows } = classifyBoqRows({
        grid,
        headerRowIndex: hdrIdx,
        columnMap: map,
        sheetName: sheets[sheetIndex]?.name || 'Sheet',
        ambiguousRateTarget: rateTarget,
      });
      setReviewRows(rows);
    },
    [sheets, sheetIndex]
  );

  const applySheetDetection = useCallback(
    (sheetIdx, workbookSheets) => {
      const list = workbookSheets || sheets;
      const sheet = list[sheetIdx];
      if (!sheet) return;
      const det = detectBoqColumns(sheet.grid);
      if (det.headerRowIndex < 0) {
        setError(
          'Could not find a BOQ header row on this sheet (need Description / Qty / Rate columns). Try another sheet.'
        );
        setHeaderRowIndex(-1);
        setColumnMap({});
        setReviewRows([]);
        return;
      }
      setError('');
      setHeaderRowIndex(det.headerRowIndex);
      setColumnMap(det.columnMap);
      setAmbiguousRate(det.ambiguousRate);
      // Single "Rate" column → default it to the price column of the current quotation type.
      const defaultTarget = det.ambiguousRate ? AMBIGUOUS_TARGET_BY_TYPE[normalizeType(quotationType)] : null;
      setAmbiguousTarget(defaultTarget);
      const { rows } = classifyBoqRows({
        grid: sheet.grid,
        headerRowIndex: det.headerRowIndex,
        columnMap: det.columnMap,
        sheetName: sheet.name,
        ambiguousRateTarget: defaultTarget,
      });
      setReviewRows(rows);
      setStep('review');
    },
    [sheets, quotationType]
  );

  const onFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const wb = await parseBoqWorkbookFile(file);
      setFileName(wb.fileName);
      setSheets(wb.sheets);
      const ranked = rankBoqSheets(wb.sheets);
      const best = ranked.find((s) => s.recommended) || ranked[0];
      if (!best || best.score < 12) {
        setSheetIndex(0);
        setStep('sheet');
        setError(
          'No strong BOQ table detected. Pick a worksheet that contains item rows with Description and rates.'
        );
        return;
      }
      if (ranked.filter((s) => s.recommended).length > 1) {
        setSheetIndex(best.index);
        setStep('sheet');
        return;
      }
      setSheetIndex(best.index);
      applySheetDetection(best.index, wb.sheets);
    } catch (err) {
      setError(err?.message || 'Could not read file.');
      setStep('upload');
    } finally {
      setBusy(false);
    }
  };

  const summary = useMemo(() => summarize(reviewRows), [reviewRows]);

  const mappingReady = useMemo(() => {
    const fields = Object.values(columnMap);
    const hasDesc = fields.includes('description');
    if (!hasDesc) return false;
    if (ambiguousRate && !ambiguousTarget) return false;
    return true;
  }, [columnMap, ambiguousRate, ambiguousTarget]);

  const updateMapField = (col, field) => {
    const next = { ...columnMap, [col]: field };
    setColumnMap(next);
    const sheet = sheets[sheetIndex];
    if (!sheet) return;
    const nextAmbiguous =
      Object.values(next).includes('rate') &&
      !Object.values(next).includes('supply_rate') &&
      !Object.values(next).includes('install_rate');
    setAmbiguousRate(nextAmbiguous);
    rebuildReview(sheet.grid, headerRowIndex, next, ambiguousTarget);
  };

  const updateReviewRow = (key, patch) => {
    setReviewRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const setAmbiguous = (target) => {
    setAmbiguousTarget(target);
    const sheet = sheets[sheetIndex];
    if (!sheet) return;
    rebuildReview(sheet.grid, headerRowIndex, columnMap, target);
  };

  const requestImport = () => {
    if (!mappingReady) {
      setError(
        ambiguousRate && !ambiguousTarget
          ? 'Choose whether the Rate column is Service, Supply, or Installation.'
          : 'Map at least a Description column before importing.'
      );
      return;
    }
    const payload = reviewRowsToMakerRows(reviewRows, { mode: 'replace', quotationType });
    if (!payload.importedCount) {
      setError('No importable rows. Un-exclude items or fix row types.');
      return;
    }
    if (makerHasLineItems(existingRows)) {
      setPendingApply(payload);
      setStep('conflict');
      return;
    }
    finishImport(payload, 'replace');
  };

  const finishImport = (basePayload, mode) => {
    const result =
      mode === 'append'
        ? reviewRowsToMakerRows(reviewRows, { mode: 'append', existingRows, quotationType })
        : basePayload || reviewRowsToMakerRows(reviewRows, { mode: 'replace', quotationType });
    onImport?.({
      rows: result.rows,
      showMake: result.showMake,
      showRemarks: result.showRemarks,
      mode,
      importedCount: result.importedCount,
    });
    handleClose();
  };

  if (!open) return null;

  const sheet = sheets[sheetIndex];
  const headerLabels = sheet?.grid?.[headerRowIndex] || [];
  const mapCols = Object.keys(columnMap)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="boq-import-backdrop qm-noprint" role="dialog" aria-modal="true">
      <div className="boq-import-modal">
        <div className="boq-import-header">
          <h3>Import Client BOQ</h3>
          <button type="button" className="qm-btn" onClick={handleClose}>
            Close
          </button>
        </div>

        <div className="boq-import-body">
          <div className="boq-import-steps">
            {STEPS.filter((s) => s !== 'conflict' || step === 'conflict').map((s) => (
              <span key={s} className={`boq-import-step-pill${step === s ? ' on' : ''}`}>
                {s === 'upload'
                  ? '1. Upload'
                  : s === 'sheet'
                    ? '2. Worksheet'
                    : s === 'review'
                      ? '3. Review'
                      : '4. Existing items'}
              </span>
            ))}
          </div>

          {error ? <p className="boq-import-error">{error}</p> : null}

          {step === 'upload' ? (
            <div
              className={`boq-import-drop${dragOver ? ' drag' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void onFile(f);
              }}
            >
              {busy ? (
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-400" />
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                  <p className="m-0 font-medium text-slate-800">Drop BOQ Excel or CSV here</p>
                  <p className="qm-hint">.xlsx, .xls, or .csv — max 8 MB</p>
                  <label className="qm-btn main" style={{ display: 'inline-block', marginTop: 12 }}>
                    Choose file
                    <input
                      type="file"
                      accept=".xlsx,.xls,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                      className="sr-only"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onFile(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </>
              )}
            </div>
          ) : null}

          {step === 'sheet' ? (
            <div>
              <p className="qm-hint m-0 mb-2">
                File: <strong>{fileName}</strong> — select the worksheet that holds the BOQ lines.
              </p>
              <ul className="boq-import-sheet-list">
                {rankBoqSheets(sheets).map((s) => (
                  <li
                    key={s.index}
                    className={sheetIndex === s.index ? 'sel' : ''}
                    onClick={() => setSheetIndex(s.index)}
                  >
                    <input
                      type="radio"
                      checked={sheetIndex === s.index}
                      onChange={() => setSheetIndex(s.index)}
                    />
                    <span>
                      {s.name}
                      {s.recommended ? ' · recommended' : ''}
                      <span className="qm-hint"> (score {s.score})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step === 'review' ? (
            <div>
              <div className="boq-import-summary">
                <span>
                  Sheet: <strong>{sheet?.name}</strong>
                </span>
                <span>
                  Extracted: <strong>{summary.extracted}</strong>
                </span>
                <span>
                  Valid: <strong>{summary.valid}</strong>
                </span>
                <span>
                  Warnings: <strong>{summary.warning}</strong>
                </span>
                <span>
                  Excluded: <strong>{summary.excluded}</strong>
                </span>
              </div>

              {ambiguousRate ? (
                <div className="boq-import-rate-pick">
                  <span className="font-medium">Ambiguous Rate column maps to:</span>
                  {['service', 'supply', 'installation'].map((t) => (
                    <label key={t} className="qm-check">
                      <input
                        type="radio"
                        name="boq-rate-target"
                        checked={ambiguousTarget === t}
                        onChange={() => setAmbiguous(t)}
                      />
                      {t === 'service' ? 'Service' : t === 'supply' ? 'Supply' : 'Installation'}
                    </label>
                  ))}
                </div>
              ) : null}

              <div className="boq-import-map">
                {mapCols.map((col) => (
                  <label key={col}>
                    Col {col + 1}
                    {headerLabels[col] ? `: ${String(headerLabels[col]).slice(0, 28)}` : ''}
                    <select
                      value={columnMap[col] || 'ignore'}
                      onChange={(e) => updateMapField(col, e.target.value)}
                    >
                      {BOQ_FIELD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="boq-import-tw">
                <table className="boq-import-table">
                  <thead>
                    <tr>
                      <th>Incl</th>
                      <th>Sr</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Unit</th>
                      <th>Qty</th>
                      <th>Supply</th>
                      <th>Install</th>
                      <th>Service</th>
                      <th>Make</th>
                      <th>Remarks</th>
                      <th>Row</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewRows.map((r) => (
                      <tr
                        key={r.key}
                        className={r.excluded ? 'excluded' : r.status === 'warn' ? 'warn' : ''}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={!r.excluded}
                            onChange={(e) =>
                              updateReviewRow(r.key, {
                                excluded: !e.target.checked,
                                status: !e.target.checked
                                  ? 'excluded'
                                  : r.warnings?.length
                                    ? 'warn'
                                    : 'ok',
                              })
                            }
                          />
                        </td>
                        <td>{r.sourceSr || '—'}</td>
                        <td>
                          <select
                            value={r.rowType}
                            onChange={(e) => updateReviewRow(r.key, { rowType: e.target.value })}
                          >
                            {ROW_TYPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="desc">
                          <input
                            type="text"
                            value={r.description}
                            onChange={(e) => updateReviewRow(r.key, { description: e.target.value })}
                            style={{ width: '100%', minWidth: 180 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={r.unit}
                            onChange={(e) => updateReviewRow(r.key, { unit: e.target.value })}
                            style={{ width: 56 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={r.qty ?? ''}
                            onChange={(e) =>
                              updateReviewRow(r.key, {
                                qty: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            style={{ width: 64 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={r.supply_rate || ''}
                            onChange={(e) =>
                              updateReviewRow(r.key, {
                                supply_rate: Number(e.target.value) || 0,
                              })
                            }
                            style={{ width: 80 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={r.install_rate || ''}
                            onChange={(e) =>
                              updateReviewRow(r.key, {
                                install_rate: Number(e.target.value) || 0,
                              })
                            }
                            style={{ width: 80 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={r.service_rate || ''}
                            onChange={(e) =>
                              updateReviewRow(r.key, {
                                service_rate: Number(e.target.value) || 0,
                              })
                            }
                            style={{ width: 80 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={r.make}
                            onChange={(e) => updateReviewRow(r.key, { make: e.target.value })}
                            style={{ width: 72 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={r.remarks}
                            onChange={(e) => updateReviewRow(r.key, { remarks: e.target.value })}
                            style={{ width: 80 }}
                          />
                        </td>
                        <td>
                          {r.sheetName}:{r.sourceRow}
                        </td>
                        <td>
                          {r.status}
                          {r.warnings?.length ? (
                            <div className="warn-text">{r.warnings.join('; ')}</div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {step === 'conflict' ? (
            <div className="boq-import-conflict">
              <p className="m-0 font-medium">This quotation already has line items.</p>
              <p className="qm-hint m-0 mt-1">
                Append keeps your current rows and adds the BOQ below them. Replace removes current
                line items and uses only the imported BOQ. Client details and terms are never
                overwritten.
              </p>
            </div>
          ) : null}
        </div>

        <div className="boq-import-footer">
          {step === 'sheet' ? (
            <>
              <button type="button" className="qm-btn" onClick={() => setStep('upload')}>
                Back
              </button>
              <button
                type="button"
                className="qm-btn main"
                disabled={busy}
                onClick={() => applySheetDetection(sheetIndex)}
              >
                Continue
              </button>
            </>
          ) : null}
          {step === 'review' ? (
            <>
              <button
                type="button"
                className="qm-btn"
                onClick={() => (sheets.length > 1 ? setStep('sheet') : setStep('upload'))}
              >
                Back
              </button>
              <button
                type="button"
                className="qm-btn main"
                disabled={!mappingReady || busy}
                onClick={requestImport}
              >
                Import to Quotation
              </button>
            </>
          ) : null}
          {step === 'conflict' ? (
            <>
              <button
                type="button"
                className="qm-btn"
                onClick={() => {
                  setPendingApply(null);
                  setStep('review');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="qm-btn"
                onClick={() => finishImport(pendingApply, 'append')}
              >
                Append
              </button>
              <button
                type="button"
                className="qm-btn main"
                onClick={() => finishImport(pendingApply, 'replace')}
              >
                Replace items
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
