import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../../contexts/AuthContext';
import { normalizeAppRole, ROLES } from '../../../../config/roles';
import { downloadBlob, exportNodeToPdfBlob } from '../../../../lib/exportNodeToPdf';
import { QUOTATION_BASE } from '../quotationConstants';
import {
  QUOTATION_TYPES,
  STANDARD_TERMS,
  addTopLevelRow,
  applyRowAction,
  buildColumnKeys,
  buildPumpHouseExample,
  columnLabel,
  columnTotal,
  computeTotals,
  dropRow,
  emptyMakerForm,
  expandDisplayRows,
  formatMoneyIn,
  headingColumnTotal,
  isGroup,
  lineAmount,
  moveRowKeyboard,
  normalizeType,
  numberOf,
  rowTotal,
  validateForSent,
} from './quotationMakerModel';
import {
  fetchMakerQuotation,
  logMakerAudit,
  reserveQuotationNo,
  saveMakerQuotation,
} from './quotationMakerApi';
import QuotationMakerPreview from './QuotationMakerPreview';
import './quotationMaker.css';

function canEditQuotation(user, userProfile, form) {
  const role = normalizeAppRole(userProfile?.role);
  if ([ROLES.MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN_PRO].includes(role)) {
    return true;
  }
  if (!form?.id) return true;
  if (!form.created_by) return true;
  return form.created_by === user?.id;
}

export default function QuotationMaker() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const { user, userProfile } = useAuth();
  const ownerDefault = userProfile?.username || user?.email?.split('@')[0] || '';

  const [form, setForm] = useState(() =>
    emptyMakerForm({
      signatory_name: ownerDefault,
      signatory_designation: 'Asst. Manager - Projects',
    })
  );
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState({ kind: '', text: '' });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dropInfo, setDropInfo] = useState(null);
  const [colDropKey, setColDropKey] = useState(null);
  const [draggingMakeCol, setDraggingMakeCol] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const autosaveTimer = useRef(null);
  const skipAutosave = useRef(true);

  const readOnly = !canEditQuotation(user, userProfile, form);
  const type = normalizeType(form.quotation_type);
  const typeMeta = QUOTATION_TYPES[type];
  const totals = useMemo(() => computeTotals(rows, type), [rows, type]);
  const colKeys = useMemo(
    () =>
      buildColumnKeys(type, {
        showMake: form.show_make,
        showRemarks: form.show_remarks,
        makeBefore: form.make_column_before || 'unit',
      }),
    [type, form.show_make, form.show_remarks, form.make_column_before]
  );
  const colCount = colKeys.length;
  const displayRows = useMemo(() => expandDisplayRows(rows), [rows]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const loadId = useCallback(async (id) => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const data = await fetchMakerQuotation(id);
      setForm(data.form);
      setRows(data.rows);
      setSubjectTouched(Boolean(data.form.subject));
      setDirty(false);
      skipAutosave.current = true;
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not load quotation.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (editId) void loadId(editId);
  }, [editId, loadId]);

  useEffect(() => {
    if (!form.signatory_name && ownerDefault) {
      setForm((prev) => ({ ...prev, signatory_name: prev.signatory_name || ownerDefault }));
    }
  }, [ownerDefault, form.signatory_name]);

  // Reserve number once client company is filled (first time)
  useEffect(() => {
    if (readOnly || form.id || form.quotation_no || !form.client_company?.trim()) return;
    let cancelled = false;
    (async () => {
      try {
        const reserved = await reserveQuotationNo({
          branchCode: form.branch_code,
          clientCompany: form.client_company,
          offerDateIso: form.quote_date,
        });
        if (!cancelled) {
          setForm((prev) =>
            prev.quotation_no ? prev : { ...prev, quotation_no: reserved.offerNo }
          );
        }
      } catch {
        /* user can type number manually */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.client_company, form.id, form.quotation_no, form.branch_code, form.quote_date, readOnly]);

  const persist = useCallback(
    async ({ status, silent } = {}) => {
      if (readOnly) return null;
      const nextForm = {
        ...form,
        maker_status: status || form.maker_status || 'draft',
      };
      if (nextForm.maker_status === 'sent') {
        const err = validateForSent(rows);
        if (err) {
          setMessage({ type: 'error', text: err });
          return null;
        }
      }
      setSaving(true);
      if (!silent) setSaveState({ kind: '', text: 'Saving…' });
      try {
        const result = await saveMakerQuotation(nextForm, rows, {
          userId: user?.id,
          actorName: ownerDefault,
          action: status === 'sent' ? 'send' : form.id ? 'edit' : 'create',
        });
        setForm(result.form);
        setRows(result.rows);
        setDirty(false);
        setSaveState({ kind: 'ok', text: 'Saved' });
        if (!editId && result.form.id) {
          navigate(`${QUOTATION_BASE}/quotation-entry?id=${result.form.id}`, { replace: true });
        }
        if (!silent) {
          setMessage({
            type: 'success',
            text:
              nextForm.maker_status === 'sent'
                ? `Quotation ${result.form.quotation_no} marked as Sent.`
                : `Quotation ${result.form.quotation_no} saved.`,
          });
        }
        return result;
      } catch (err) {
        setSaveState({ kind: 'err', text: 'Save failed' });
        setMessage({ type: 'error', text: err?.message || 'Could not save quotation.' });
        return null;
      } finally {
        setSaving(false);
      }
    },
    [editId, form, navigate, ownerDefault, readOnly, rows, user?.id]
  );

  // Autosave drafts every 4s when dirty
  useEffect(() => {
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return undefined;
    }
    if (readOnly || !dirty) return undefined;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void persist({ silent: true, status: 'draft' });
    }, 4000);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [dirty, persist, readOnly, form, rows]);

  const handleTypeChange = (nextType) => {
    const t = normalizeType(nextType);
    setForm((prev) => ({
      ...prev,
      quotation_type: t,
      subject: subjectTouched ? prev.subject : QUOTATION_TYPES[t].subject,
      terms:
        JSON.stringify(prev.terms) === JSON.stringify(STANDARD_TERMS[prev.quotation_type])
          ? [...STANDARD_TERMS[t]]
          : prev.terms,
    }));
    setDirty(true);
  };

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const runAction = (id, act) => {
    if (readOnly || !act) return;
    if (act === 'del') {
      setConfirmDeleteId(id);
      return;
    }
    setRows((prev) => applyRowAction(prev, id, act));
    setDirty(true);
  };

  const confirmDelete = () => {
    if (!confirmDeleteId) return;
    setRows((prev) => applyRowAction(prev, confirmDeleteId, 'del'));
    setConfirmDeleteId(null);
    setDirty(true);
  };

  const onDrop = (fromId, targetId, after) => {
    setRows((prev) => dropRow(prev, fromId, targetId, after));
    setDirty(true);
  };

  const handleKeyReorder = (id, e) => {
    if (!(e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) return;
    e.preventDefault();
    setRows((prev) => moveRowKeyboard(prev, id, e.key === 'ArrowUp' ? 'up' : 'down'));
    setDirty(true);
  };

  const handlePrint = async () => {
    try {
      await logMakerAudit({
        quotationId: form.id,
        action: 'print',
        detail: { quotation_no: form.quotation_no },
        actorId: user?.id,
        actorName: ownerDefault,
      });
    } catch {
      /* ignore */
    }
    window.print();
  };

  const handlePdf = async () => {
    const el = document.getElementById('qm-preview');
    if (!el) return;
    // Ensure scroll parents don't clip the capture (wide SI tables).
    const shell = el.closest('.qm-preview-shell');
    const prevShell = shell
      ? { overflow: shell.style.overflow, height: shell.style.height }
      : null;
    const prevEl = { overflow: el.style.overflow, maxHeight: el.style.maxHeight };
    try {
      if (shell) {
        shell.style.overflow = 'visible';
        shell.style.height = 'auto';
      }
      el.style.overflow = 'visible';
      el.style.maxHeight = 'none';
      el.scrollIntoView({ block: 'nearest' });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const blob = await exportNodeToPdfBlob(el, { marginMm: 8 });
      const safe = String(form.quotation_no || 'quotation').replace(/[^\w.-]+/g, '_').slice(0, 80);
      downloadBlob(blob, `Quotation_${safe}.pdf`);
      await logMakerAudit({
        quotationId: form.id,
        action: 'print',
        detail: { quotation_no: form.quotation_no, format: 'pdf' },
        actorId: user?.id,
        actorName: ownerDefault,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not generate PDF.' });
    } finally {
      if (shell && prevShell) {
        shell.style.overflow = prevShell.overflow;
        shell.style.height = prevShell.height;
      }
      el.style.overflow = prevEl.overflow;
      el.style.maxHeight = prevEl.maxHeight;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="qm-page">
      <div className="qm-toolbar qm-noprint">
        <div>
          <h2 className="text-xl font-bold text-slate-900 m-0">Make a Quotation</h2>
          <p className="qm-hint m-0">
            Guided offer for fire-safety projects. Totals exclude GST (stated in terms).
          </p>
        </div>
        <div className="qm-btns">
          <button type="button" className="qm-btn" onClick={() => navigate(`${QUOTATION_BASE}/quotation-list`)}>
            Quotation list
          </button>
          <button
            type="button"
            className="qm-btn"
            disabled={readOnly}
            onClick={() => {
              setRows(buildPumpHouseExample());
              handleTypeChange('supply_installation');
              setDirty(true);
            }}
          >
            Show me an example
          </button>
          <button
            type="button"
            className="qm-btn"
            disabled={readOnly}
            onClick={() => {
              setForm(
                emptyMakerForm({
                  signatory_name: ownerDefault,
                  signatory_designation: 'Asst. Manager - Projects',
                })
              );
              setRows([]);
              setSubjectTouched(false);
              setDirty(false);
              navigate(`${QUOTATION_BASE}/quotation-entry`, { replace: true });
            }}
          >
            Start blank
          </button>
          <span className={`qm-save ${saveState.kind === 'ok' ? 'ok' : saveState.kind === 'err' ? 'err' : ''}`}>
            {saving ? 'Saving…' : saveState.text || (dirty ? 'Unsaved changes' : form.id ? 'Saved' : '')}
          </span>
        </div>
      </div>

      {readOnly ? (
        <div className="qm-card qm-noprint border-amber-200 bg-amber-50 text-amber-900 text-sm">
          You can view this quotation. Only the creator or a Projects manager can edit it.
        </div>
      ) : null}

      {message.text ? (
        <div
          className={`qm-card qm-noprint text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="qm-card qm-noprint">
        <div className="qm-step">
          <span className="qm-num">1</span> What kind of quotation is this?
        </div>
        <select
          className="qm-type-select"
          value={type}
          disabled={readOnly}
          onChange={(e) => handleTypeChange(e.target.value)}
        >
          {Object.values(QUOTATION_TYPES).map((t) => (
            <option key={t.key} value={t.key}>
              {t.name} — {t.desc}
            </option>
          ))}
        </select>
      </div>

      <div className="qm-card qm-noprint">
        <div className="qm-step">
          <span className="qm-num">2</span> Client and reference
        </div>
        <div className="qm-fields">
          <div>
            <label>Quotation number</label>
            <input
              value={form.quotation_no}
              disabled={readOnly}
              onChange={(e) => setField('quotation_no', e.target.value)}
              placeholder="Auto-generated when you enter the company"
            />
          </div>
          <div>
            <label>Date</label>
            <input
              type="date"
              value={form.quote_date || ''}
              disabled={readOnly}
              onChange={(e) => setField('quote_date', e.target.value)}
            />
          </div>
          <div>
            <label>Contact person</label>
            <input
              value={form.client_contact}
              disabled={readOnly}
              onChange={(e) => setField('client_contact', e.target.value)}
            />
          </div>
          <div>
            <label>Company</label>
            <input
              value={form.client_company}
              disabled={readOnly}
              onChange={(e) => setField('client_company', e.target.value)}
            />
          </div>
          <div className="qm-span-full">
            <label>Address</label>
            <input
              value={form.client_address}
              disabled={readOnly}
              onChange={(e) => setField('client_address', e.target.value)}
            />
          </div>
          <div className="qm-span-full">
            <label>Subject</label>
            <input
              value={form.subject}
              disabled={readOnly}
              onChange={(e) => {
                setSubjectTouched(true);
                setField('subject', e.target.value);
              }}
            />
          </div>
          <div className="qm-span-2">
            <label>Signatory</label>
            <input
              value={form.signatory_name}
              disabled={readOnly}
              onChange={(e) => setField('signatory_name', e.target.value)}
            />
          </div>
          <div className="qm-span-2">
            <label>Designation</label>
            <input
              value={form.signatory_designation}
              disabled={readOnly}
              onChange={(e) => setField('signatory_designation', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="qm-card qm-noprint">
        <div className="qm-step">
          <span className="qm-num">3</span> Add the work you are quoting
        </div>
        <p className="qm-hint">
          Drag ⠿ to reorder rows (Alt+↑ / Alt+↓ also works). Press + to add a sub-row. When Make is
          shown, drag the Make header onto another column header to move it.
        </p>
        <div className="qm-col-toggles qm-noprint">
          <label className="qm-check">
            <input
              type="checkbox"
              checked={Boolean(form.show_make)}
              disabled={readOnly}
              onChange={(e) => setField('show_make', e.target.checked)}
            />
            Show Make column
          </label>
          <label className="qm-check">
            <input
              type="checkbox"
              checked={Boolean(form.show_remarks)}
              disabled={readOnly}
              onChange={(e) => setField('show_remarks', e.target.checked)}
            />
            Show Remarks column
          </label>
        </div>
        <div className="qm-btns" style={{ margin: '14px 0' }}>
          <button
            type="button"
            className="qm-btn"
            disabled={readOnly}
            onClick={() => {
              setRows((prev) => addTopLevelRow(prev, 'heading'));
              setDirty(true);
            }}
          >
            + Add a heading
          </button>
          <button
            type="button"
            className="qm-btn main"
            disabled={readOnly}
            onClick={() => {
              setRows((prev) => addTopLevelRow(prev, 'item'));
              setDirty(true);
            }}
          >
            + Add an item
          </button>
        </div>

        <div className="qm-tw">
          <table className={`qm-table${typeMeta.pricing === 2 ? ' qm-si' : ''}${form.show_make || form.show_remarks ? ' qm-extra' : ''}`}>
            <thead>
              <EditorHead
                type={type}
                colKeys={colKeys}
                readOnly={readOnly}
                colDropKey={colDropKey}
                draggingMakeCol={draggingMakeCol}
                onMakeColDragStart={() => setDraggingMakeCol(true)}
                onMakeColDragOver={(key) => setColDropKey(key)}
                onMakeColDrop={(beforeKey) => {
                  if (!beforeKey || beforeKey === 'make' || beforeKey === 'sr') return;
                  setField('make_column_before', beforeKey);
                  setColDropKey(null);
                  setDraggingMakeCol(false);
                }}
                onMakeColDragEnd={() => {
                  setColDropKey(null);
                  setDraggingMakeCol(false);
                }}
              />
            </thead>
            <tbody
              onDragOver={(e) => {
                if (!dragId || readOnly) return;
                const tr = e.target.closest('tr[data-rid]');
                if (!tr) return;
                e.preventDefault();
                const rect = tr.getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                setDropInfo({ id: tr.dataset.rid, after });
              }}
              onDrop={(e) => {
                if (!dragId || !dropInfo || readOnly) return;
                e.preventDefault();
                onDrop(dragId, dropInfo.id, dropInfo.after);
                setDragId(null);
                setDropInfo(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropInfo(null);
              }}
            >
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="qm-empty">
                    Nothing added yet. Press <b>+ Add a heading</b> or <b>+ Add an item</b> above.
                  </td>
                </tr>
              ) : (
                displayRows.map((r) => (
                  <EditorRow
                    key={r.id}
                    r={r}
                    rows={rows}
                    type={type}
                    colKeys={colKeys}
                    readOnly={readOnly}
                    dragId={dragId}
                    dropInfo={dropInfo}
                    onDragStart={(id) => setDragId(id)}
                    onUpdate={updateRow}
                    onAction={runAction}
                    onKeyReorder={handleKeyReorder}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="qm-totals">
          <div className="qm-tbox">
            {typeMeta.pricing === 2 ? (
              <>
                <div>
                  <span>Supply total</span>
                  <span>₹ {formatMoneyIn(columnTotal(rows, 'supply'))}</span>
                </div>
                <div>
                  <span>Installation total</span>
                  <span>₹ {formatMoneyIn(columnTotal(rows, 'inst'))}</span>
                </div>
              </>
            ) : null}
            <div className="qm-grand">
              <span>Grand total</span>
              <span>₹ {formatMoneyIn(totals.grand_total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="qm-card qm-noprint">
        <div className="qm-step">
          <span className="qm-num">4</span> Terms
        </div>
        <div className="qm-btns mb-2">
          <button
            type="button"
            className="qm-btn"
            disabled={readOnly}
            onClick={() => {
              setField('terms', [...STANDARD_TERMS[type]]);
            }}
          >
            Reset to standard
          </button>
        </div>
        <textarea
          className="qm-terms-edit"
          rows={8}
          disabled={readOnly}
          value={(form.terms || []).join('\n')}
          onChange={(e) => setField('terms', e.target.value.split('\n'))}
          placeholder="One term per line…"
        />
      </div>

      <div className="qm-card qm-noprint">
        <div className="qm-step">
          <span className="qm-num">5</span> Check and print
        </div>
        <div className="qm-btns" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="qm-btn main"
            disabled={readOnly || saving}
            onClick={() => void persist({ status: 'draft' })}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : null} Save draft
          </button>
          <button
            type="button"
            className="qm-btn good"
            disabled={readOnly || saving}
            onClick={() => void persist({ status: 'sent' })}
          >
            Save &amp; mark Sent
          </button>
          <button type="button" className="qm-btn good" onClick={() => void handlePrint()}>
            Print / Save as PDF
          </button>
          <button type="button" className="qm-btn" onClick={() => void handlePdf()}>
            Download PDF
          </button>
        </div>
      </div>

      <div className="qm-noprint" style={{ marginBottom: 8 }}>
        <div className="qm-step" style={{ marginBottom: 8 }}>
          <span className="qm-num">6</span> Preview (what will print)
        </div>
      </div>
      <QuotationMakerPreview form={form} rows={rows} />

      {confirmDeleteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 qm-noprint">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
            <h3 className="font-semibold text-slate-900">Delete this row?</h3>
            <p className="text-sm text-slate-600">
              If it is a heading or an item with parts, those parts are removed too.
            </p>
            <div className="qm-btns justify-end">
              <button type="button" className="qm-btn" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </button>
              <button type="button" className="qm-btn good" style={{ background: '#b3261e', borderColor: '#b3261e' }} onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EditorHead({
  type,
  colKeys,
  readOnly,
  colDropKey,
  draggingMakeCol,
  onMakeColDragStart,
  onMakeColDragOver,
  onMakeColDrop,
  onMakeColDragEnd,
}) {
  return (
    <tr>
      {colKeys.map((key) => {
        if (key === 'actions') {
          return <th key={key} aria-label="Row tools" />;
        }
        const label = columnLabel(key, type);
        const isMake = key === 'make';
        const dropTarget = draggingMakeCol && colDropKey === key;
        return (
          <th
            key={key}
            data-col-key={key}
            className={`${isMake ? 'qm-th-make' : ''} ${dropTarget ? 'qm-col-drop' : ''}`.trim()}
            draggable={isMake && !readOnly}
            title={isMake ? 'Drag Make onto another column header to reposition' : undefined}
            onDragStart={
              isMake
                ? (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', 'make-col');
                    onMakeColDragStart?.();
                  }
                : undefined
            }
            onDragOver={(e) => {
              if (!draggingMakeCol || readOnly || key === 'make' || key === 'sr') return;
              e.preventDefault();
              onMakeColDragOver?.(key);
            }}
            onDrop={(e) => {
              if (!draggingMakeCol || readOnly || key === 'make' || key === 'sr') return;
              e.preventDefault();
              onMakeColDrop?.(key);
            }}
            onDragEnd={() => onMakeColDragEnd?.()}
          >
            {isMake ? <span className="qm-th-make-label">⠿ {label}</span> : label}
          </th>
        );
      })}
    </tr>
  );
}

function EditorRow({
  r,
  rows,
  type,
  colKeys,
  readOnly,
  dragId,
  dropInfo,
  onDragStart,
  onUpdate,
  onAction,
  onKeyReorder,
}) {
  const mode = normalizeType(type);
  const dropClass =
    dropInfo?.id === r.id ? (dropInfo.after ? 'drop-after' : 'drop-before') : '';
  const dragClass = dragId === r.id ? 'dragging' : '';

  const parentRow = r.parent_row_id ? rows.find((x) => x.id === r.parent_row_id) : null;
  const grandItem =
    parentRow?.row_type === 'item' && parentRow.parent_row_id
      ? rows.find((x) => x.id === parentRow.parent_row_id)
      : null;
  const atMaxNest = parentRow?.row_type === 'item' && grandItem?.row_type === 'item';
  const addTitle =
    r.row_type === 'heading'
      ? 'Add item under this heading'
      : atMaxNest
        ? 'Add another sub-part below'
        : parentRow?.row_type === 'item'
          ? 'Add a sub-part under this part'
          : 'Add a part under this item';

  const actionMenu = (
    <div className="qm-icon-actions">
      <button
        type="button"
        className="qm-icon-btn qm-plus"
        disabled={readOnly}
        title={addTitle}
        aria-label={addTitle}
        onClick={() => onAction(r.id, 'addsub')}
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className="qm-icon-btn qm-trash"
        disabled={readOnly}
        title="Delete row"
        aria-label="Delete row"
        onClick={() => onAction(r.id, 'del')}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );

  const grip = (
    <span
      className="qm-grip"
      draggable={!readOnly}
      title="Drag to move"
      tabIndex={0}
      onKeyDown={(e) => onKeyReorder(r.id, e)}
      onDragStart={(e) => {
        if (readOnly) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', r.id);
        onDragStart(r.id);
      }}
    >
      ⠿
    </span>
  );

  if (r.row_type === 'heading_total') {
    const hid = r.heading_id;
    return (
      <tr className="heading-total" data-heading-total={hid}>
        {colKeys.map((key) => {
          if (key === 'sr') return <td key={key} className="qm-no" />;
          if (key === 'description') {
            return (
              <td key={key} className="qm-heading-total-label">
                <b>Total — {r.description || 'Section'}</b>
              </td>
            );
          }
          if (key === 'supply_total') {
            return (
              <td key={key} className="qm-money">
                <b>{formatMoneyIn(headingColumnTotal(rows, hid, 'supply'))}</b>
              </td>
            );
          }
          if (key === 'install_total') {
            return (
              <td key={key} className="qm-money">
                <b>{formatMoneyIn(headingColumnTotal(rows, hid, 'inst'))}</b>
              </td>
            );
          }
          if (key === 'total') {
            return (
              <td key={key} className="qm-money">
                <b>{formatMoneyIn(rowTotal(rows, byIdSafe(rows, hid), mode))}</b>
              </td>
            );
          }
          if (key === 'actions') return <td key={key} className="qm-opt" />;
          return <td key={key} />;
        })}
      </tr>
    );
  }

  if (r.row_type === 'heading') {
    return (
      <tr data-rid={r.id} className={`heading ${dropClass} ${dragClass}`.trim()}>
        <td className="qm-no">{grip}</td>
        <td colSpan={Math.max(1, colKeys.length - 2)}>
          <input
            className="qm-cell"
            style={{ fontWeight: 700 }}
            value={r.description}
            disabled={readOnly}
            placeholder="Heading name"
            onChange={(e) => onUpdate(r.id, { description: e.target.value })}
          />
        </td>
        <td className="qm-opt">{actionMenu}</td>
      </tr>
    );
  }

  const no = numberOf(rows, r);
  const midSpan = Math.max(1, colKeys.filter((k) => !['sr', 'description', 'actions'].includes(k)).length);

  if (isGroup(rows, r)) {
    return (
      <tr data-rid={r.id} className={`${dropClass} ${dragClass}`.trim()}>
        <td className="qm-no">
          {grip}
          {no}
        </td>
        <td>
          <input
            className="qm-cell"
            value={r.description}
            disabled={readOnly}
            placeholder="Item description"
            onChange={(e) => onUpdate(r.id, { description: e.target.value })}
          />
        </td>
        <td colSpan={midSpan} className="qm-note">
          Priced through its parts below
        </td>
        <td className="qm-opt">{actionMenu}</td>
      </tr>
    );
  }

  const renderCell = (key) => {
    switch (key) {
      case 'sr':
        return (
          <td key={key} className="qm-no">
            {grip}
            {no}
          </td>
        );
      case 'description':
        return (
          <td key={key}>
            <input
              className={`qm-cell ${r.parent_row_id ? 'ind' : ''}`}
              value={r.description}
              disabled={readOnly}
              placeholder={r.parent_row_id ? 'Part description' : 'Item description'}
              onChange={(e) => onUpdate(r.id, { description: e.target.value })}
            />
          </td>
        );
      case 'unit':
        return (
          <td key={key} className="qm-num2">
            <input
              className="qm-cell c"
              value={r.unit}
              disabled={readOnly}
              onChange={(e) => onUpdate(r.id, { unit: e.target.value })}
            />
          </td>
        );
      case 'qty':
        return (
          <td key={key} className="qm-num2">
            <input
              className="qm-cell c"
              type="number"
              min="0"
              step="0.001"
              value={r.qty}
              disabled={readOnly}
              onChange={(e) => onUpdate(r.id, { qty: Number(e.target.value) || 0 })}
            />
          </td>
        );
      case 'make':
        return (
          <td key={key}>
            <input
              className="qm-cell"
              value={r.make || ''}
              disabled={readOnly}
              placeholder="Make"
              onChange={(e) => onUpdate(r.id, { make: e.target.value })}
            />
          </td>
        );
      case 'remarks':
        return (
          <td key={key}>
            <input
              className="qm-cell"
              value={r.remarks || ''}
              disabled={readOnly}
              placeholder="Remarks"
              onChange={(e) => onUpdate(r.id, { remarks: e.target.value })}
            />
          </td>
        );
      case 'price_unit': {
        const field = QUOTATION_TYPES[mode].rateField;
        return (
          <td key={key} className="qm-num2">
            <input
              className="qm-cell r"
              type="number"
              min="0"
              step="0.01"
              value={r[field]}
              disabled={readOnly}
              onChange={(e) => onUpdate(r.id, { [field]: Number(e.target.value) || 0 })}
            />
          </td>
        );
      }
      case 'supply_unit':
        return (
          <td key={key} className="qm-num2">
            <input
              className="qm-cell r"
              type="number"
              min="0"
              step="0.01"
              value={r.supply_rate}
              disabled={readOnly}
              onChange={(e) => onUpdate(r.id, { supply_rate: Number(e.target.value) || 0 })}
            />
          </td>
        );
      case 'install_unit':
        return (
          <td key={key} className="qm-num2">
            <input
              className="qm-cell r"
              type="number"
              min="0"
              step="0.01"
              value={r.install_rate}
              disabled={readOnly}
              onChange={(e) => onUpdate(r.id, { install_rate: Number(e.target.value) || 0 })}
            />
          </td>
        );
      case 'supply_total':
        return (
          <td key={key} className="qm-money">
            {formatMoneyIn(lineAmount(r, 'supply'))}
          </td>
        );
      case 'install_total':
        return (
          <td key={key} className="qm-money">
            {formatMoneyIn(lineAmount(r, 'inst'))}
          </td>
        );
      case 'total':
        return (
          <td key={key} className="qm-money">
            {formatMoneyIn(rowTotal(rows, r, mode))}
          </td>
        );
      case 'actions':
        return (
          <td key={key} className="qm-opt">
            {actionMenu}
          </td>
        );
      default:
        return <td key={key} />;
    }
  };

  return (
    <tr data-rid={r.id} className={`${dropClass} ${dragClass}`.trim()}>
      {colKeys.map(renderCell)}
    </tr>
  );
}

function byIdSafe(rows, id) {
  return (rows || []).find((x) => x.id === id) || null;
}

