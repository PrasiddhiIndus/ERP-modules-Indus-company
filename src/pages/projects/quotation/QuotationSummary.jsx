import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calculator,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  List,
  Plus,
} from 'lucide-react';
import { formatCurrency, QUOTATION_BASE } from './quotationConstants';
import { useQuotationDraft } from './QuotationDraftContext';
import MainHeadSection from './summary/MainHeadSection';
import {
  addChildHead,
  addItem,
  addMainHead,
  computeNumbering,
  grandTotal,
  mainHeadTotal,
  moveChildHead,
  moveItem,
  moveMainHead,
  removeNode,
  updateChildHead,
  updateItem,
  updateMainHead,
} from './summary/summaryHelpers';
import { nowHhMm, resolveOfferToken } from './summary/export/exportShared.js';
import {
  exportOverallSummaryExcel,
  exportOverallSummaryPdf,
} from './summary/export/overallSummaryExport.jsx';
import { exportMainHeadExcel, exportMainHeadPdf } from './summary/export/mainHeadExport.jsx';

export default function QuotationSummary() {
  const navigate = useNavigate();
  const {
    activeQuotationId,
    getActiveTree,
    setActiveTree,
    getLabel,
    getActiveFetchedItemIds,
  } = useQuotationDraft();

  const boqTree = getActiveTree();
  const numbered = useMemo(() => computeNumbering(boqTree), [boqTree]);
  const totals = useMemo(() => grandTotal(boqTree), [boqTree]);
  const activeLabel = getLabel(activeQuotationId);
  const offerToken = resolveOfferToken({ activeQuotationId, label: activeLabel });
  const fetchedItemIds = getActiveFetchedItemIds();

  const [calcStamps, setCalcStamps] = useState({});
  const [flashIds, setFlashIds] = useState({});
  const [grandFlash, setGrandFlash] = useState(false);
  const [grandStamp, setGrandStamp] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const flashTimers = useRef({});

  const flashMain = useCallback((mainId) => {
    setFlashIds((prev) => ({ ...prev, [mainId]: true }));
    if (flashTimers.current[mainId]) clearTimeout(flashTimers.current[mainId]);
    flashTimers.current[mainId] = setTimeout(() => {
      setFlashIds((prev) => {
        const next = { ...prev };
        delete next[mainId];
        return next;
      });
    }, 900);
  }, []);

  const calculateMain = useCallback(
    (mainId) => {
      const main = numbered.find((m) => m.id === mainId);
      if (main) mainHeadTotal(main); // explicit recompute (live values already correct)
      const stamp = nowHhMm();
      setCalcStamps((prev) => ({ ...prev, [mainId]: stamp }));
      flashMain(mainId);
      return stamp;
    },
    [numbered, flashMain]
  );

  const calculateAll = useCallback(() => {
    const stamp = nowHhMm();
    const nextStamps = {};
    for (const main of numbered) {
      mainHeadTotal(main);
      nextStamps[main.id] = stamp;
      flashMain(main.id);
    }
    grandTotal(numbered);
    setCalcStamps((prev) => ({ ...prev, ...nextStamps }));
    setGrandStamp(stamp);
    setGrandFlash(true);
    setTimeout(() => setGrandFlash(false), 900);
    return stamp;
  }, [numbered, flashMain]);

  const runCalculateBeforeExport = useCallback(() => {
    calculateAll();
  }, [calculateAll]);

  const handleAddMainHead = () => setActiveTree((prev) => addMainHead(prev));

  const confirmDeleteMain = (mainId) => {
    const main = boqTree.find((m) => m.id === mainId);
    const hasChildren = (main?.childHeads || []).length > 0;
    if (hasChildren && !window.confirm('Delete this main head and all its child heads and items?')) {
      return;
    }
    setActiveTree((prev) => removeNode(prev, { mainId }));
  };

  const confirmDeleteChild = (mainId, childId) => {
    const main = boqTree.find((m) => m.id === mainId);
    const child = (main?.childHeads || []).find((c) => c.id === childId);
    const hasItems = (child?.items || []).length > 0;
    if (hasItems && !window.confirm('Delete this child head and all its items?')) {
      return;
    }
    setActiveTree((prev) => removeNode(prev, { mainId, childId }));
  };

  const subtitle = `Editing systems for: ${activeLabel || 'Draft'}`;

  const handleOverallPdf = async () => {
    setExportMenuOpen(false);
    setExportError('');
    setExportBusy(true);
    try {
      runCalculateBeforeExport();
      await exportOverallSummaryPdf(boqTree, { offerToken, subtitle });
    } catch (err) {
      setExportError(err?.message || 'PDF export failed.');
    } finally {
      setExportBusy(false);
    }
  };

  const handleOverallExcel = () => {
    setExportMenuOpen(false);
    setExportError('');
    setExportBusy(true);
    try {
      runCalculateBeforeExport();
      exportOverallSummaryExcel(boqTree, { offerToken });
    } catch (err) {
      setExportError(err?.message || 'Excel export failed.');
    } finally {
      setExportBusy(false);
    }
  };

  const handleMainPdf = async (main) => {
    setExportError('');
    setExportBusy(true);
    try {
      calculateMain(main.id);
      await exportMainHeadPdf(main, { offerToken, subtitle });
    } catch (err) {
      setExportError(err?.message || 'PDF export failed.');
    } finally {
      setExportBusy(false);
    }
  };

  const handleMainExcel = (main) => {
    setExportError('');
    setExportBusy(true);
    try {
      calculateMain(main.id);
      exportMainHeadExcel(main, { offerToken });
    } catch (err) {
      setExportError(err?.message || 'Excel export failed.');
    } finally {
      setExportBusy(false);
    }
  };

  if (!activeQuotationId) {
    return (
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white">
            <h2 className="text-lg font-semibold text-slate-900">BOQ Summary</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Systems are scoped per quotation — open or start one first
            </p>
          </div>
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <p className="text-sm text-slate-500 mb-4 max-w-md">
              No quotation is active. Start a new quotation or open one from the list, then return
              here to build its Main Head → Child Head → Items tree.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => navigate(`${QUOTATION_BASE}/quotation-entry`)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"
              >
                <ArrowLeft className="h-4 w-4" /> New Quotation
              </button>
              <button
                type="button"
                onClick={() => navigate(`${QUOTATION_BASE}/quotation-list`)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <List className="h-4 w-4" /> Quotation List
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">BOQ Summary</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Editing systems for:{' '}
              <span className="font-semibold text-slate-700">{activeLabel}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`${QUOTATION_BASE}/quotation-entry`)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back to New Quotation
            </button>
            {numbered.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={calculateAll}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Calculator className="h-4 w-4" /> Calculate All
                </button>
                <div className="relative">
                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={() => setExportMenuOpen((o) => !o)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <FileText className="h-4 w-4" /> Export Overall Summary
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {exportMenuOpen && (
                    <div className="absolute right-0 mt-1 z-20 w-44 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={handleOverallPdf}
                      >
                        <FileText className="h-3.5 w-3.5 text-slate-500" /> as PDF
                      </button>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={handleOverallExcel}
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" /> as Excel
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAddMainHead}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"
                >
                  <Plus className="h-4 w-4" /> Add Main Head
                </button>
              </>
            )}
          </div>
        </div>

        {exportError && (
          <div className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {exportError}
          </div>
        )}

        <div className="p-5 space-y-4">
          {numbered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <p className="text-sm text-slate-500 mb-4 max-w-md">
                Build a three-level BOQ summary: Main Heads (e.g. Mechanical Part), Child Heads
                (e.g. Pump House Equipment), then line items with supply and installation rates.
              </p>
              <button
                type="button"
                onClick={handleAddMainHead}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold shadow-sm"
              >
                <Plus className="h-4 w-4" /> Add Main Head
              </button>
            </div>
          ) : (
            numbered.map((main, index) => (
              <MainHeadSection
                key={main.id}
                mainHead={main}
                canMoveUp={index > 0}
                canMoveDown={index < numbered.length - 1}
                onChange={(patch) => setActiveTree((prev) => updateMainHead(prev, main.id, patch))}
                onMoveUp={() => setActiveTree((prev) => moveMainHead(prev, main.id, 'up'))}
                onMoveDown={() => setActiveTree((prev) => moveMainHead(prev, main.id, 'down'))}
                onDelete={() => confirmDeleteMain(main.id)}
                onAddChildHead={() => setActiveTree((prev) => addChildHead(prev, main.id))}
                onUpdateChildHead={(childId, patch) =>
                  setActiveTree((prev) => updateChildHead(prev, main.id, childId, patch))
                }
                onMoveChildHead={(childId, direction) =>
                  setActiveTree((prev) => moveChildHead(prev, main.id, childId, direction))
                }
                onDeleteChildHead={(childId) => confirmDeleteChild(main.id, childId)}
                onAddItem={(childId) => setActiveTree((prev) => addItem(prev, main.id, childId))}
                onUpdateItem={(childId, itemId, patch) =>
                  setActiveTree((prev) => updateItem(prev, main.id, childId, itemId, patch))
                }
                onMoveItem={(childId, itemId, direction) =>
                  setActiveTree((prev) => moveItem(prev, main.id, childId, itemId, direction))
                }
                onDeleteItem={(childId, itemId) =>
                  setActiveTree((prev) => removeNode(prev, { mainId: main.id, childId, itemId }))
                }
                onCalculate={() => calculateMain(main.id)}
                onExportPdf={() => handleMainPdf(main)}
                onExportExcel={() => handleMainExcel(main)}
                lastCalculated={calcStamps[main.id] || ''}
                flashTotals={Boolean(flashIds[main.id])}
                exportBusy={exportBusy}
                fetchedItemIds={fetchedItemIds}
              />
            ))
          )}

          {numbered.length > 0 && (
            <div
              className={`rounded-xl border-2 px-5 py-4 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                grandFlash
                  ? 'border-amber-400 bg-amber-50 text-amber-950'
                  : 'border-slate-800 bg-slate-900 text-white'
              }`}
            >
              <div>
                <span className="text-sm font-bold uppercase tracking-wide">Grand Total</span>
                {grandStamp ? (
                  <span
                    className={`ml-2 text-[10px] font-medium ${
                      grandFlash ? 'text-amber-800' : 'text-slate-400'
                    }`}
                  >
                    Last calculated {grandStamp}
                  </span>
                ) : null}
              </div>
              <div className="text-base sm:text-lg font-bold text-right">
                Supply {formatCurrency(totals.supplyTotal)}
                <span className={`mx-2 font-normal ${grandFlash ? 'text-amber-700' : 'text-slate-400'}`}>
                  ·
                </span>
                Installation {formatCurrency(totals.installationTotal)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
