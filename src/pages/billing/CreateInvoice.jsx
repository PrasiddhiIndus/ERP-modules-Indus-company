import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { FileText, Upload, PlusCircle, X, Eye, Pencil, ChevronLeft, ChevronRight, Ruler, Calculator, Search } from 'lucide-react';
import CalculatorModal from '../../components/CalculatorModal';
import * as XLSX from 'xlsx';
import { useBilling } from '../../contexts/BillingContext';
import { roundInvoiceAmount, normalizeGstSupplyType } from '../../utils/invoiceRound';
import {
  formatInvoiceAmountInWords,
  resolveTermsLines,
  INVOICE_BANK_DETAILS,
  INVOICE_JURISDICTION,
  INVOICE_LETTERHEAD_FOOTER,
  INVOICE_LETTERHEAD_STRIP_COLOR,
  INVOICE_SELLER_TEMPLATE,
} from '../../utils/taxInvoicePdf';
import { INDUS_LOGO_SRC } from '../../constants/branding.js';
import { formatDateDdMmYyyy } from '../../utils/dateDisplay';
import InvoiceHtmlPreview from './components/InvoiceHtmlPreview';
import RequestCnDnApprovalSection from './components/RequestCnDnApprovalSection';
import { resolveBuyerStateAndPin } from '../../utils/gstStatePin';
import { resolveInvoicePartyAddresses } from '../../utils/invoicePartyAddresses';
import {
  deriveBillToShipToPinSameFromPo,
  normalizePoPincode,
  resolveInvoicePartyPincodes,
} from '../../utils/poPincodeFields';
import { rollupMainPoBilling, pickInvoiceForEdit } from '../../utils/billingInvoiceRollup';
import { poMatchesBillingTab } from '../../utils/billingPoListFilters';
import {
  applyPreGstSupplementaryRows,
  createPreGstSupplementaryRow,
  parsePreGstSupplementaryRows,
  poRequiresMaterialCode,
  resolveInvoiceLineHsnSac,
  resolveInvoiceLineMaterialCode,
  resolveInvoiceDescriptionFromPo,
  resolvePoPaymentTerms,
  resolvePoDateRaw,
  resolvePoHsnSac,
  serializePreGstSupplementaryRows,
  summarizePreGstLegacyTotals,
} from '../../utils/billingPoInvoiceFields';
import {
  BILLING_AUTOSAVE_KEYS,
  BILLING_DRAFT_KEYS,
  loadBillingFormDraftPayloadWithLegacy,
} from '../../utils/billingFormAutosave';
import { useBillingFormAutosave } from '../../hooks/useBillingFormAutosave';
import FormDateInput from "../../components/FormDateInput";
import {
  TAX_INVOICE_PREFIX,
  formatTaxInvoiceNumberPrefix,
  generateTaxInvoiceNumber,
  getNextTaxInvoiceSequence,
  getLastTaxInvoiceNumberInFy,
  buildFullTaxInvoiceNumberFromSerial,
  classifyNewTaxInvoice,
} from '../../utils/taxInvoiceNumber';

/** Proforma series FY start year (calendar year April–March), separate from IFSPL tax format. */
function getProformaFinancialYearStart(invoiceDate) {
  const d = invoiceDate ? new Date(invoiceDate) : new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  return m >= 3 ? `${y}` : `${y - 1}`;
}

const generateDraftInvoiceNumber = (invoices) => {
  const y = new Date().getFullYear();
  const seq =
    (Array.isArray(invoices) ? invoices : []).filter(
      (inv) => String(inv?.invoiceKind || inv?.invoice_kind || '').toLowerCase() === 'draft'
    ).length + 1;
  return `DFT-${y}-${String(seq).padStart(4, '0')}`;
};

/** Proforma series — separate from IFSPL tax invoice numbers (same financial year index). */
function generateProformaInvoiceNumber(sequence, invoiceDate) {
  const y = getProformaFinancialYearStart(invoiceDate);
  const seq = String(sequence).padStart(4, '0');
  return `PFI-${y}-${seq}`;
}

function getNextProformaSequence(invoices, invoiceDate) {
  const fy = String(getProformaFinancialYearStart(invoiceDate));
  let maxSeq = 0;
  (Array.isArray(invoices) ? invoices : []).forEach((inv) => {
    const raw = String(inv?.taxInvoiceNumber || inv?.billNumber || inv?.bill_number || '').trim();
    const m = raw.match(/^PFI-(\d{4})-(\d{4,})$/i);
    if (!m) return;
    const [, year, seqText] = m;
    if (year !== fy) return;
    const seq = Number(seqText);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  });
  return maxSeq + 1;
}

const APPROVAL_STATUS_SENT = 'sent_for_approval';
const APPROVAL_STATUS_APPROVED = 'approved';

const PO_TABLE_PAGE_SIZE = 8;
const BILLING_TABS_MANPOWER = [
  { id: 'Per Day', label: 'Daily' },
  { id: 'Monthly', label: 'Monthly' },
  { id: 'Lump Sum', label: 'Lump Sum' },
  { id: 'Custom Calculator', label: 'Custom Calculator' },
];

const BILLING_TABS_RM = [
  { id: 'Service', label: 'Service' },
  { id: 'Supply', label: 'Supply' },
];

const CREATE_PAGE_TABS = [
  { id: 'select-po', label: '1 · Pick the job and make the bill' },
  { id: 'cndn', label: '2 · Ask to fix a wrong bill (credit / debit)' },
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const CUSTOM_LINE_BILLING_TYPES = ['Per Day', 'Monthly', 'Lump Sum'];

function normalizeCustomLineBillingType(raw) {
  const v = String(raw || '').trim();
  return CUSTOM_LINE_BILLING_TYPES.includes(v) ? v : 'Per Day';
}

// "Custom Calculator" PO: each line may behave like the three standard billing
// types (with the same duty-geometry logic) or as a free calculator line.
const CUSTOM_CALC_LINE_BILLING_TYPES = ['Per Day', 'Monthly', 'Lump Sum', 'Custom Calculator'];

function normalizeCustomCalcLineBillingType(raw) {
  const v = String(raw || '').trim();
  return CUSTOM_CALC_LINE_BILLING_TYPES.includes(v) ? v : 'Custom Calculator';
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function buildSignaturePatternDataUrl(dataUrl) {
  const img = await loadImageDataUrl(dataUrl);
  const maxW = 640;
  const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth || img.width));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const px = imageData.data;
  const lum = new Float32Array(w * h);
  const integral = new Float32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < w; x += 1) {
      const pixelIndex = y * w + x;
      const i = pixelIndex * 4;
      const value = (px[i] * 0.299) + (px[i + 1] * 0.587) + (px[i + 2] * 0.114);
      lum[pixelIndex] = value;
      rowSum += value;
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const localRadius = Math.max(8, Math.min(28, Math.round(Math.min(w, h) / 10)));
  const localAverage = (x, y) => {
    const x1 = Math.max(0, x - localRadius);
    const y1 = Math.max(0, y - localRadius);
    const x2 = Math.min(w - 1, x + localRadius);
    const y2 = Math.min(h - 1, y + localRadius);
    const stride = w + 1;
    const sum =
      integral[(y2 + 1) * stride + (x2 + 1)] -
      integral[y1 * stride + (x2 + 1)] -
      integral[(y2 + 1) * stride + x1] +
      integral[y1 * stride + x1];
    return sum / ((x2 - x1 + 1) * (y2 - y1 + 1));
  };

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let kept = 0;
  const alphaMask = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const pixelIndex = y * w + x;
      const i = (y * w + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const localDarkness = localAverage(x, y) - lum[pixelIndex];
      const colorSpread = Math.max(r, g, b) - Math.min(r, g, b);
      const penStroke =
        localDarkness > 16 ||
        (localDarkness > 10 && lum[pixelIndex] < 120) ||
        (localDarkness > 8 && colorSpread > 20 && lum[pixelIndex] < 155);
      if (!penStroke) {
        px[i + 3] = 0;
        continue;
      }
      const alpha = Math.min(255, Math.max(150, Math.round((localDarkness - 5) * 12)));
      px[i] = Math.max(0, Math.round(r * 0.25));
      px[i + 1] = Math.max(0, Math.round(g * 0.25));
      px[i + 2] = Math.max(0, Math.round(b * 0.25));
      px[i + 3] = alpha;
      alphaMask[pixelIndex] = alpha;
    }
  }

  // Remove any dark border or paper edge connected to the image boundary.
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = y * w + x;
    if (!alphaMask[idx]) return;
    alphaMask[idx] = 0;
    px[idx * 4 + 3] = 0;
    queue.push(idx);
  };
  for (let x = 0; x < w; x += 1) {
    enqueue(x, 0);
    enqueue(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    enqueue(0, y);
    enqueue(w - 1, y);
  }
  while (queue.length) {
    const idx = queue.pop();
    const x = idx % w;
    const y = Math.floor(idx / w);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  // Drop isolated speckles from paper texture/shadows without thinning real strokes.
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const maskIndex = y * w + x;
      if (!alphaMask[maskIndex]) continue;
      let neighbors = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy += 1) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx += 1) {
          if (xx === x && yy === y) continue;
          if (alphaMask[yy * w + xx]) neighbors += 1;
        }
      }
      const i = maskIndex * 4;
      if (neighbors < 1) {
        px[i + 3] = 0;
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      kept += 1;
    }
  }
  if (kept < 20 || maxX < minX || maxY < minY) {
    ctx.clearRect(0, 0, w, h);
    return canvas.toDataURL('image/png');
  }
  ctx.putImageData(imageData, 0, 0);

  const pad = 10;
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(w - cropX, maxX - minX + 1 + pad * 2);
  const cropH = Math.min(h - cropY, maxY - minY + 1 + pad * 2);
  const out = document.createElement('canvas');
  out.width = Math.max(1, cropW);
  out.height = Math.max(1, cropH);
  const outCtx = out.getContext('2d');
  if (!outCtx) return canvas.toDataURL('image/png');
  outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return out.toDataURL('image/png');
}

/** Authorised duty inputs: no days-in-month default — show blank until the user enters a value. */
function authorisedDutyFieldValue(v) {
  if (v === undefined || v === null || v === '') return '';
  return v;
}

function computeArrivedQty(poQty, actualDuty, authorizedDuty) {
  const po = safeNumber(poQty);
  const act = safeNumber(actualDuty);
  const auth = safeNumber(authorizedDuty);
  if (po <= 0 || act <= 0 || auth <= 0) return 0;
  return round3((po * act) / auth);
}

function computeArrivedQtyByMonths(poQty, actualDuty, authorizedDuty, numberOfMonths) {
  const po = safeNumber(poQty);
  const act = safeNumber(actualDuty);
  const auth = safeNumber(authorizedDuty);
  const months = safeNumber(numberOfMonths);
  if (po <= 0 || act <= 0 || auth <= 0 || months <= 0) return 0;
  return round3(((act / auth) * (po / months)));
}

function computeDutyRatioQty(actualDuty, authorizedDuty) {
  const act = safeNumber(actualDuty);
  const auth = safeNumber(authorizedDuty);
  if (act <= 0 || auth <= 0) return 0;
  return round3(act / auth);
}

/** Lump sum consolidated / cumulated invoice qty: Σ actual ÷ Σ authorised across geometry rows. */
function computeCumulativeGeometryQty(geometryRows) {
  if (!geometryRows?.length) return 0;
  const totalActual = round3(geometryRows.reduce((sum, row) => sum + safeNumber(row.actualDuty), 0));
  const totalAuthorized = round3(geometryRows.reduce((sum, row) => sum + safeNumber(row.authorizedDuty), 0));
  return computeDutyRatioQty(totalActual, totalAuthorized);
}

function computeShortDeployment(actualDuty, authorizedDuty) {
  return round3(Math.max(0, safeNumber(authorizedDuty) - safeNumber(actualDuty)));
}

function computePenaltyAmount(actualDuty, authorizedDuty, penaltyRate) {
  return round2(computeShortDeployment(actualDuty, authorizedDuty) * safeNumber(penaltyRate));
}

/** Lump sum PO lines: Qty carries duty ratio; Rate stays PO rate [− category penalty if enabled]. */
function computeLumpSumEffectiveRate(poRate, actualDuty, authorizedDuty, categoryPenalty, subtractPenalty) {
  const pr = safeNumber(poRate);
  if (pr <= 0) return 0;
  let r = round2(pr);
  if (subtractPenalty) {
    r = round2(Math.max(0, r - safeNumber(categoryPenalty)));
  }
  return r;
}

function firstPositiveNumber(source, keys) {
  if (!source) return 0;
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function getPoHeaderQty(po) {
  return firstPositiveNumber(po, ['poQuantity', 'po_quantity', 'poQty', 'po_qty', 'quantity', 'qty']);
}

function getRateCategoryQty(row, po) {
  return firstPositiveNumber(row, ['qty', 'quantity', 'poQty', 'po_qty', 'poQuantity', 'po_quantity']) || getPoHeaderQty(po);
}

function getPoTotalQtyForRollup(po) {
  const headerQty = getPoHeaderQty(po);
  if (headerQty > 0) return headerQty;
  const rows = Array.isArray(po?.ratePerCategory) ? po.ratePerCategory : [];
  return round3(rows.reduce((sum, row) => {
    return sum + firstPositiveNumber(row, ['qty', 'quantity', 'poQty', 'po_qty', 'poQuantity', 'po_quantity']);
  }, 0));
}

function getRateCategoryRate(row) {
  return firstPositiveNumber(row, ['rate', 'poRate', 'po_rate', 'poReferenceRate', 'po_reference_rate']);
}

function getRateCategoryPenalty(row) {
  if (!row) return 0;
  for (const key of ['penalty', 'category_penalty', 'poLinePenalty', 'po_line_penalty']) {
    const value = row[key];
    if (value === undefined || value === null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return 0;
}

function getRateCategoryHsnSac(row, fallback = '') {
  if (!row) return fallback;
  const value = row.hsnSac ?? row.hsn_sac ?? row.sacHsn ?? row.sac_hsn ?? row.hsnCode ?? row.hsn_code ?? row.sacCode ?? row.sac_code;
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function getRateCategoryMaterialCode(row) {
  if (!row) return '';
  return String(row.materialCode ?? row.material_code ?? '').trim();
}

function normalizeMonthlyDutyQtyMode(raw) {
  const m = String(raw || '').trim();
  if (m === 'po_geometry_by_months') return 'po_geometry_by_months';
  if (m === 'duty_ratio') return 'duty_ratio';
  return 'po_geometry';
}

function normalizeLumpSumBillingMode(raw) {
  const m = String(raw || '').trim().toLowerCase();
  if (m === 'penalty') return 'penalty';
  if (m === 'truck' || m === 'fire_tender' || m === 'truck_cumulated') return 'truck';
  if (m === 'months_geometry') return 'months_geometry';
  return 'normal';
}

function resolvePoLumpSumInvoicePreviewMode(po) {
  const explicit = String(po?.lumpSumInvoicePreviewMode || po?.lump_sum_invoice_preview_mode || '').trim().toLowerCase();
  if (explicit === 'consolidated' || explicit === 'detailed') return explicit;
  const m = String(po?.lumpSumBillingMode || po?.lump_sum_billing_mode || '').trim().toLowerCase();
  if (m === 'truck_cumulated') return 'consolidated';
  if (m === 'truck' || m === 'fire_tender') return 'detailed';
  return 'consolidated';
}

function getUniqueRateRows(po) {
  const rows = Array.isArray(po?.ratePerCategory) ? po.ratePerCategory : [];
  const seen = new Set();
  const unique = [];
  rows.forEach((r) => {
    const description = (r?.description || r?.designation || '').trim();
    const rate = getRateCategoryRate(r);
    const qty = getRateCategoryQty(r, po);
    const penalty = getRateCategoryPenalty(r);
    const hsnSac = getRateCategoryHsnSac(r);
    const materialCode = getRateCategoryMaterialCode(r);
    const key = `${description.toLowerCase()}|${hsnSac.toLowerCase()}|${materialCode.toLowerCase()}|${rate}|${qty}|${penalty}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push({ description, hsnSac, materialCode, rate, qty, penalty });
  });
  return unique;
}

/** Alphabetically sorted unique descriptions from PO rate categories (R&M invoice picker). */
function sortedRmDescriptionOptions(po) {
  const rows = Array.isArray(po?.ratePerCategory) ? po.ratePerCategory : [];
  const set = new Set();
  rows.forEach((r) => {
    const d = (r?.description || r?.designation || '').trim();
    if (d) set.add(d);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function findRateCategoryRow(po, description) {
  const d = String(description || '').trim().toLowerCase();
  if (!d || !po) return null;
  const rows = Array.isArray(po.ratePerCategory) ? po.ratePerCategory : [];
  return rows.find((r) => (r.description || r.designation || '').trim().toLowerCase() === d) || null;
}

function formatINRWithSign(n) {
  const v = round2(n);
  const abs = Math.abs(v).toLocaleString('en-IN');
  return v < 0 ? `-₹${abs}` : `₹${abs}`;
}

/** Next billing date is today or earlier — cycle due. */
function isBillingCycleDue(nextYmd) {
  if (!nextYmd) return false;
  const today = new Date();
  const y = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return String(nextYmd).slice(0, 10) <= y;
}

function formatBillingMonth(ymd) {
  if (!ymd) return null;
  const d = new Date(ymd);
  if (Number.isNaN(d.getTime())) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]}-${d.getFullYear()}`;
}

/** YYYY-MM-DD in local timezone for `<FormDateInput >` (avoids UTC off-by-one). */
function formatLocalDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** New invoice default: today → today (local); user can adjust either date. */
function getDefaultServicePeriodRange() {
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ymd = formatLocalDateInput(todayLocal);
  return { from: ymd, to: ymd };
}

/** Normalize stored/API dates to `YYYY-MM-DD` for `<FormDateInput >`. */
function toDateInputValue(v) {
  if (!v) return '';
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function latestRenewalCycle(po) {
  const cycles = Array.isArray(po?.renewalCycles) ? po.renewalCycles : (Array.isArray(po?.renewal_cycles) ? po.renewal_cycles : []);
  if (!cycles.length) return null;
  return cycles[cycles.length - 1] || null;
}

function isAfterContractEndForInvoice(endDate) {
  if (!endDate) return false;
  const end = new Date(String(endDate));
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return todayDay.getTime() > endDay.getTime();
}

function normalizeVerticalValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  const aliases = {
    manp: 'manpower',
    manpower: 'manpower',
    mp: 'manpower',
    train: 'training',
    trng: 'training',
    training: 'training',
    rm: 'rm',
    mm: 'mm',
    amc: 'amc',
    iev: 'iev',
    projects: 'projects',
    project: 'projects',
  };
  return aliases[raw] || raw;
}

function resolveSupplementaryOverrides(po, allPOs) {
  // Apply latest renewal cycle (if any) for parent PO display as well.
  const latestSelf = latestRenewalCycle(po);
  if (!po?.isSupplementary) {
    if (latestSelf?.po_wo_number) {
      return {
        poWoNumber: latestSelf.po_wo_number,
        totalContractValue: latestSelf.total_contract_value != null ? Number(latestSelf.total_contract_value) : (po.totalContractValue ?? 0),
        startDate: latestSelf.start_date || po.startDate,
        endDate: latestSelf.end_date || po.endDate,
      };
    }
    return { poWoNumber: po?.poWoNumber, totalContractValue: po?.totalContractValue, startDate: po?.startDate, endDate: po?.endDate };
  }
  const parentId = po.supplementaryParentPoId || po.supplementary_parent_po_id;
  const parent = (allPOs || []).find((p) => String(p.id) === String(parentId));
  const latest = latestRenewalCycle(parent);
  if (latest?.po_wo_number) {
    return {
      poWoNumber: latest.po_wo_number,
      totalContractValue: latest.total_contract_value != null ? Number(latest.total_contract_value) : (po.totalContractValue ?? 0),
      startDate: latest.start_date || po.startDate,
      endDate: latest.end_date || po.endDate,
    };
  }
  return { poWoNumber: po?.poWoNumber, totalContractValue: po?.totalContractValue, startDate: po?.startDate, endDate: po?.endDate };
}

function sortNewestPoFirst(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const aTs = new Date(a?.updated_at || a?.updatedAt || a?.created_at || a?.createdAt || a?.startDate || 0).getTime() || 0;
    const bTs = new Date(b?.updated_at || b?.updatedAt || b?.created_at || b?.createdAt || b?.startDate || 0).getTime() || 0;
    if (bTs !== aTs) return bTs - aTs;
    return String(b?.id || '').localeCompare(String(a?.id || ''));
  });
}

const CreateInvoice = ({ onNavigateTab }) => {
  const {
    commercialPOs,
    invoices,
    setInvoices,
    upsertInvoice,
    invoiceDraft,
    setInvoiceDraft,
    refreshBilling,
    billingVerticalFilter,
    billingPoBasisFilter,
    getCreateInvoiceFormDraft,
    setCreateInvoiceFormDraft,
    clearCreateInvoiceFormDraft,
  } = useBilling();

  const initDraftRef = useRef(null);
  if (initDraftRef.current === null) {
    const fromMemory = getCreateInvoiceFormDraft();
    const fromStorage =
      fromMemory ||
      loadBillingFormDraftPayloadWithLegacy(
        BILLING_DRAFT_KEYS.createInvoice,
        'billing:form:create-invoice:'
      );
    initDraftRef.current = fromStorage || false;
  }
  const initDraft = initDraftRef.current === false ? null : initDraftRef.current;

  const billingDraftRestoreGuardRef = useRef(!!initDraft);
  const seededPoIdRef = useRef(initDraft?.selectedPoId ? String(initDraft.selectedPoId) : '');
  const poConfigInitializedForRef = useRef(initDraft?.selectedPoId ? String(initDraft.selectedPoId) : '');
  const invoiceHsnInitializedForRef = useRef(initDraft?.selectedPoId ? String(initDraft.selectedPoId) : '');
  const servicePeriodScopeRef = useRef(
    initDraft?.selectedPoId ? `create:${String(initDraft.selectedPoId)}` : ''
  );
  const releaseDraftRestoreGuard = () => {
    billingDraftRestoreGuardRef.current = false;
    skipPoAutoSeedRef.current = false;
    seededPoIdRef.current = '';
    poConfigInitializedForRef.current = '';
    invoiceHsnInitializedForRef.current = '';
    servicePeriodScopeRef.current = '';
  };

  const [selectedPoId, setSelectedPoId] = useState(() =>
    initDraft?.selectedPoId ? String(initDraft.selectedPoId) : ''
  );
  const [invoiceDate, setInvoiceDate] = useState(() => initDraft?.invoiceDate ?? '');
  const [invoiceDateError, setInvoiceDateError] = useState('');
  const [items, setItems] = useState(() =>
    Array.isArray(initDraft?.items) ? initDraft.items : []
  );
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  /** Skip PO template re-seed after restoring an autosaved create-invoice draft. */
  const skipPoAutoSeedRef = useRef(!!initDraft);
  const [attendanceFiles, setAttendanceFiles] = useState(() =>
    Array.isArray(initDraft?.attendanceFiles) ? initDraft.attendanceFiles : []
  );
  const [document2Files, setDocument2Files] = useState(() =>
    Array.isArray(initDraft?.document2Files) ? initDraft.document2Files : []
  );
  const [digitalSignatureDataUrl, setDigitalSignatureDataUrl] = useState(
    () => initDraft?.digitalSignatureDataUrl ?? ''
  );
  const [digitalSignatureError, setDigitalSignatureError] = useState('');
  const signatureInputRef = useRef(null);
  const [viewInvoiceId, setViewInvoiceId] = useState(null);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [poPage, setPoPage] = useState(1);
  const [servicePeriodFrom, setServicePeriodFrom] = useState(
    () => initDraft?.servicePeriodFrom ?? getDefaultServicePeriodRange().from
  );
  const [servicePeriodTo, setServicePeriodTo] = useState(
    () => initDraft?.servicePeriodTo ?? getDefaultServicePeriodRange().to
  );
  const [poSortConfig, setPoSortConfig] = useState({ key: 'created', direction: 'desc' });
  const [poMasterSearch, setPoMasterSearch] = useState('');
  const [activeGeometryRowIdx, setActiveGeometryRowIdx] = useState(null);
  const [invoiceMonthlyDutyQtyMode, setInvoiceMonthlyDutyQtyMode] = useState(
    () => initDraft?.invoiceMonthlyDutyQtyMode ?? 'po_geometry'
  );
  const [invoiceLumpSumBillingMode, setInvoiceLumpSumBillingMode] = useState(
    () => initDraft?.invoiceLumpSumBillingMode ?? 'normal'
  );
  /** Lump sum: opt-in on this invoice to show PO Penalty column and use Rate = PO rate − Penalty (PO-level penalty mode forces this on). */
  const [lumpSumInvoicePenaltyGeometry, setLumpSumInvoicePenaltyGeometry] = useState(
    () => !!initDraft?.lumpSumInvoicePenaltyGeometry
  );
  /** consolidated = final invoice shows one cumulative geometry line; detailed = final invoice shows every geometry line item. */
  const [lumpSumInvoicePreviewMode, setLumpSumInvoicePreviewMode] = useState(
    () => initDraft?.lumpSumInvoicePreviewMode ?? 'consolidated'
  );
  const [lumpSumConsolidatedLineDraft, setLumpSumConsolidatedLineDraft] = useState(() =>
    initDraft?.lumpSumConsolidatedLineDraft
      ? initDraft.lumpSumConsolidatedLineDraft
      : { description: null, hsnSac: null, materialCode: null, uom: null, quantity: '', rate: '' }
  );
  const [poBillingTab, setPoBillingTab] = useState(() => initDraft?.poBillingTab ?? 'Monthly');
  const [createMainTab, setCreateMainTab] = useState(() => initDraft?.createMainTab ?? 'select-po');
  /** tax | proforma — stored as billing.invoice.invoice_kind; all verticals (Manpower, Training, R&M, M&M, AMC, IEV, trucks / lump-sum, etc.) */
  const [invoiceDocumentKind, setInvoiceDocumentKind] = useState(() => initDraft?.invoiceDocumentKind ?? 'tax');
  /** Digits after IFSPL/YY-YY/ for new tax invoices (full number built on preview/save). */
  const [manualTaxInvoiceSerial, setManualTaxInvoiceSerial] = useState(
    () => initDraft?.manualTaxInvoiceSerial ?? ''
  );
  const [invoiceLevelHsn, setInvoiceLevelHsn] = useState(() => initDraft?.invoiceLevelHsn ?? '');
  const [invoiceQuantityFooterNote, setInvoiceQuantityFooterNote] = useState(
    () => initDraft?.invoiceQuantityFooterNote ?? ''
  );
  const [preGstSupplementaryRows, setPreGstSupplementaryRows] = useState(() =>
    Array.isArray(initDraft?.preGstSupplementaryRows) ? initDraft.preGstSupplementaryRows : []
  );

  const verticalNotSelected = !billingVerticalFilter;
  const billingPoBasisLabel =
    billingPoBasisFilter === 'with_po'
      ? 'With PO only'
      : billingPoBasisFilter === 'without_po'
        ? 'Without PO only'
        : 'All — With PO & Without PO';
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const createInvoiceAutosaveKey = BILLING_AUTOSAVE_KEYS.createInvoice();

  const createInvoiceAutosaveSnapshot = useMemo(
    () => ({
      selectedPoId,
      invoiceDate,
      items,
      attendanceFiles,
      document2Files,
      digitalSignatureDataUrl,
      servicePeriodFrom,
      servicePeriodTo,
      invoiceMonthlyDutyQtyMode,
      invoiceLumpSumBillingMode,
      lumpSumInvoicePenaltyGeometry,
      lumpSumInvoicePreviewMode,
      lumpSumConsolidatedLineDraft,
      createMainTab,
      invoiceDocumentKind,
      manualTaxInvoiceSerial,
      invoiceLevelHsn,
      invoiceQuantityFooterNote,
      preGstSupplementaryRows,
      poBillingTab,
    }),
    [
      selectedPoId,
      invoiceDate,
      items,
      attendanceFiles,
      document2Files,
      digitalSignatureDataUrl,
      servicePeriodFrom,
      servicePeriodTo,
      invoiceMonthlyDutyQtyMode,
      invoiceLumpSumBillingMode,
      lumpSumInvoicePenaltyGeometry,
      lumpSumInvoicePreviewMode,
      lumpSumConsolidatedLineDraft,
      createMainTab,
      invoiceDocumentKind,
      manualTaxInvoiceSerial,
      invoiceLevelHsn,
      invoiceQuantityFooterNote,
      preGstSupplementaryRows,
      poBillingTab,
    ]
  );

  const restoreCreateInvoiceDraft = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') return;
    billingDraftRestoreGuardRef.current = true;
    skipPoAutoSeedRef.current = true;
    if (payload.selectedPoId) {
      const poId = String(payload.selectedPoId);
      setSelectedPoId(poId);
      seededPoIdRef.current = poId;
      poConfigInitializedForRef.current = poId;
      invoiceHsnInitializedForRef.current = poId;
      servicePeriodScopeRef.current = `create:${poId}`;
    }
    if (payload.invoiceDate != null) setInvoiceDate(payload.invoiceDate);
    if (Array.isArray(payload.items)) setItems(payload.items);
    if (Array.isArray(payload.attendanceFiles)) setAttendanceFiles(payload.attendanceFiles);
    if (Array.isArray(payload.document2Files)) setDocument2Files(payload.document2Files);
    if (payload.digitalSignatureDataUrl != null) setDigitalSignatureDataUrl(payload.digitalSignatureDataUrl);
    if (payload.servicePeriodFrom != null) setServicePeriodFrom(payload.servicePeriodFrom);
    if (payload.servicePeriodTo != null) setServicePeriodTo(payload.servicePeriodTo);
    if (payload.invoiceMonthlyDutyQtyMode) setInvoiceMonthlyDutyQtyMode(payload.invoiceMonthlyDutyQtyMode);
    if (payload.invoiceLumpSumBillingMode) setInvoiceLumpSumBillingMode(payload.invoiceLumpSumBillingMode);
    if (typeof payload.lumpSumInvoicePenaltyGeometry === 'boolean') {
      setLumpSumInvoicePenaltyGeometry(payload.lumpSumInvoicePenaltyGeometry);
    }
    if (payload.lumpSumInvoicePreviewMode) setLumpSumInvoicePreviewMode(payload.lumpSumInvoicePreviewMode);
    if (payload.lumpSumConsolidatedLineDraft) setLumpSumConsolidatedLineDraft(payload.lumpSumConsolidatedLineDraft);
    if (payload.createMainTab) setCreateMainTab(payload.createMainTab);
    if (payload.invoiceDocumentKind) setInvoiceDocumentKind(payload.invoiceDocumentKind);
    if (payload.manualTaxInvoiceSerial != null) setManualTaxInvoiceSerial(payload.manualTaxInvoiceSerial);
    if (payload.invoiceLevelHsn != null) setInvoiceLevelHsn(payload.invoiceLevelHsn);
    if (payload.invoiceQuantityFooterNote != null) setInvoiceQuantityFooterNote(payload.invoiceQuantityFooterNote);
    if (Array.isArray(payload.preGstSupplementaryRows)) setPreGstSupplementaryRows(payload.preGstSupplementaryRows);
    if (payload.poBillingTab) setPoBillingTab(payload.poBillingTab);
  }, []);

  const skipCreateInvoiceRestore = invoiceDraft?.mode === 'edit' && !!invoiceDraft?.invoiceId;

  const { hint: createInvoiceAutoHint, clearDraft: clearCreateInvoiceDraft } = useBillingFormAutosave({
    key: createInvoiceAutosaveKey,
    snapshot: createInvoiceAutosaveSnapshot,
    saveEnabled:
      !skipCreateInvoiceRestore &&
      (!!selectedPoId || (invoiceDraft?.mode === 'edit' && !!invoiceDraft?.invoiceId) || items.length > 0),
    skipRestore: skipCreateInvoiceRestore,
    onRestore: restoreCreateInvoiceDraft,
  });

  useEffect(() => {
    if (skipCreateInvoiceRestore) return;
    if (!selectedPoId && items.length === 0 && !invoiceDate) return;
    setCreateInvoiceFormDraft(createInvoiceAutosaveSnapshot);
  }, [createInvoiceAutosaveSnapshot, skipCreateInvoiceRestore, setCreateInvoiceFormDraft, selectedPoId, items.length, invoiceDate]);

  const isRmVertical = useMemo(() => {
    const v = String(billingVerticalFilter || '').trim().toLowerCase();
    return v === 'rm' || v === 'mm' || v === 'amc' || v === 'iev' || v === 'projects';
  }, [billingVerticalFilter]);
  const isTrainingVertical = useMemo(() => {
    const v = String(billingVerticalFilter || '').trim().toLowerCase();
    return v === 'training';
  }, [billingVerticalFilter]);

  /** M&M vertical only — description dropdown on invoice lines. */
  const isMmOnlyVertical = useMemo(() => {
    const v = String(billingVerticalFilter || '').trim().toLowerCase();
    return v === 'mm';
  }, [billingVerticalFilter]);

  const billingTabs = useMemo(() => (isRmVertical ? BILLING_TABS_RM : BILLING_TABS_MANPOWER), [isRmVertical]);

  useEffect(() => {
    const allowed = new Set(billingTabs.map((t) => t.id));
    if (!allowed.has(poBillingTab)) {
      if (isRmVertical) setPoBillingTab('Service');
      else if (isTrainingVertical) setPoBillingTab('Per Day');
      else setPoBillingTab('Monthly');
    }
  }, [billingTabs, poBillingTab, isRmVertical, isTrainingVertical]);

  useEffect(() => {
    if (billingDraftRestoreGuardRef.current) return;
    // Keep tab defaults sensible per vertical.
    if (isRmVertical) {
      setPoBillingTab('Service');
      return;
    }
    if (isTrainingVertical) {
      setPoBillingTab('Per Day');
      return;
    }
    setPoBillingTab('Monthly');
  }, [isRmVertical, isTrainingVertical]);

  const billablePOs = useMemo(() => {
    // Show all vertical-matched parent POs so Team-wise dropdown always displays
    // the full table for selected Manpower / Training.
    return sortNewestPoFirst(commercialPOs.filter((p) => !p.isSupplementary));
  }, [commercialPOs]);

  const billablePOsByTab = useMemo(() => {
    if (isTrainingVertical) {
      return billablePOs;
    }
    const tab = String(poBillingTab || '').trim();
    return billablePOs.filter((p) => poMatchesBillingTab(p, tab));
  }, [billablePOs, poBillingTab, isTrainingVertical]);

  const poTableRows = useMemo(() => {
    return billablePOsByTab.map((po) => {
      const over = resolveSupplementaryOverrides(po, billablePOs);
      const contract = Number(over.totalContractValue) || 0;
      const poQtyTotal = getPoTotalQtyForRollup(po);
      const roll = rollupMainPoBilling(po, commercialPOs, invoices, contract, poQtyTotal);
      const supSt = po.supplementaryRequestStatus || po.supplementary_request_status;
      const postContractBufferOpen =
        !po.isSupplementary && supSt === 'approved' && isAfterContractEndForInvoice(po.endDate || po.end_date);
      const st = String(po.approvalStatus || 'draft').toLowerCase();
      const n = roll.taxInvoiceCount;
      const hasInvoice = n > 0;
      const statusLabel = hasInvoice
        ? `${n} tax invoice${n !== 1 ? 's' : ''}`
        : st === APPROVAL_STATUS_APPROVED
          ? 'Approved'
          : st === APPROVAL_STATUS_SENT
            ? 'Sent to approval'
            : st === 'rejected'
              ? 'Rejected'
              : 'Draft';

      const existingInvoice = roll.latestInvoice || null;
      const invoiceForEdit = pickInvoiceForEdit(roll.relatedInvoices);

      return {
        ...po,
        poWoNumber: over.poWoNumber ?? po.poWoNumber,
        totalContractValue: over.totalContractValue ?? po.totalContractValue,
        startDate: over.startDate ?? po.startDate,
        endDate: over.endDate ?? po.endDate,
        postContractBufferOpen,
        statusLabel,
        hasInvoice,
        existingInvoiceId: existingInvoice?.id || null,
        invoiceForEditId: invoiceForEdit?.id || null,
        roll,
        _calc: {
          contract,
          remainingContract: roll.remainingContract,
          invoicedAmount: roll.invoicedAmount,
          remainingQty: roll.remainingQty,
          invoicedQty: roll.invoicedQty,
          poQtyTotal: roll.poQtyTotal,
          lastInvoiceDate: roll.lastInvoiceDate,
          nextBillingDate: roll.nextBillingDate,
        },
      };
    });
  }, [billablePOsByTab, billablePOs, commercialPOs, invoices]);

  const filteredPoTableRows = useMemo(() => {
    const q = poMasterSearch.trim().toLowerCase();
    if (!q) return poTableRows;
    return poTableRows.filter((row) => {
      const hay = [
        row.ocNumber,
        row.poWoNumber,
        row.legalName,
        row.clientLegalName,
        row.client_name,
        row.siteId,
        row.locationName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [poMasterSearch, poTableRows]);

  const sortedPoTableRows = useMemo(() => {
    const dir = poSortConfig.direction === 'asc' ? 1 : -1;
    return [...filteredPoTableRows].sort((a, b) => {
      const valueFor = (row) => {
        switch (poSortConfig.key) {
          case 'modified': return new Date(row.updated_at || row.updatedAt || row.created_at || row.createdAt || row.startDate || 0).getTime() || 0;
          case 'created': return new Date(row.created_at || row.createdAt || row.startDate || row.updated_at || row.updatedAt || 0).getTime() || 0;
          case 'ocNumber': return String(row.ocNumber || '').toLowerCase();
          case 'client': return String(row.legalName || row.clientLegalName || row.client_name || '').toLowerCase();
          case 'siteLocation': return String([row.siteId, row.locationName].filter(Boolean).join(' ') || '').toLowerCase();
          case 'poWo': return String(row.poWoNumber || '').toLowerCase();
          case 'invoiceDate':
            return row?._calc?.lastInvoiceDate
              ? new Date(row._calc.lastInvoiceDate).getTime() || 0
              : 0;
          case 'remaining': return Number(row?._calc?.remainingContract ?? 0);
          case 'qtyRemaining':
            return row?._calc?.remainingQty != null ? Number(row._calc.remainingQty) : -1;
          case 'nextBilling':
            return row?._calc?.nextBillingDate
              ? new Date(row._calc.nextBillingDate).getTime() || 0
              : 0;
          case 'status': return String(row.statusLabel || '').toLowerCase();
          default: return new Date(row.updated_at || row.updatedAt || row.created_at || row.createdAt || row.startDate || 0).getTime() || 0;
        }
      };
      const av = valueFor(a);
      const bv = valueFor(b);
      let result = 0;
      if (typeof av === 'number' && typeof bv === 'number') result = av - bv;
      else result = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      if (result === 0) result = String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true });
      return result * dir;
    });
  }, [filteredPoTableRows, poSortConfig]);

  const renderSortIndicator = (key) => {
    const active = poSortConfig.key === key;
    const ascActive = active && poSortConfig.direction === 'asc';
    const descActive = active && poSortConfig.direction === 'desc';
    return (
      <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] align-middle">
        <span className={ascActive ? 'text-emerald-400' : 'text-slate-300'}>▲</span>
        <span className={descActive ? 'text-rose-400' : 'text-slate-300'}>▼</span>
      </span>
    );
  };
  const togglePoSort = (key) => {
    setPoSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  useEffect(() => {
    setPoPage(1);
  }, [sortedPoTableRows.length, poSortConfig]);

  const poTotalPages = Math.max(1, Math.ceil(sortedPoTableRows.length / PO_TABLE_PAGE_SIZE));
  const poSafePage = Math.min(Math.max(1, poPage), poTotalPages);
  const poStart = (poSafePage - 1) * PO_TABLE_PAGE_SIZE;
  const poPaginatedRows = sortedPoTableRows.slice(poStart, poStart + PO_TABLE_PAGE_SIZE);

  const goToPoPage = (p) => setPoPage(Math.min(Math.max(1, p), poTotalPages));

  const selectedPO = useMemo(
    () => billablePOs.find((p) => String(p.id) === String(selectedPoId) || p.siteId === selectedPoId),
    [billablePOs, selectedPoId]
  );

  const editingInvoice = useMemo(() => {
    if (!invoiceDraft?.invoiceId) return null;
    return invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) || null;
  }, [invoiceDraft, invoices]);

  const displayPO = useMemo(() => {
    if (selectedPO) {
      const over = resolveSupplementaryOverrides(selectedPO, billablePOs);
      return {
        ...selectedPO,
        poWoNumber: over.poWoNumber ?? selectedPO.poWoNumber,
        totalContractValue: over.totalContractValue ?? selectedPO.totalContractValue,
        startDate: over.startDate ?? selectedPO.startDate,
        endDate: over.endDate ?? selectedPO.endDate,
      };
    }
    if (invoiceDraft?.mode === 'edit' && editingInvoice) {
      const linkedPo =
        editingInvoice.poId != null
          ? commercialPOs.find((p) => String(p.id) === String(editingInvoice.poId))
          : null;
      const gstRaw =
        editingInvoice.gstSupplyType ||
        editingInvoice.gst_supply_type ||
        linkedPo?.gstSupplyType ||
        linkedPo?.gst_supply_type;
      return {
        id: editingInvoice.poId,
        siteId: editingInvoice.siteId,
        locationName: linkedPo?.locationName || editingInvoice.clientLegalName || '',
        ocNumber: editingInvoice.ocNumber,
        poWoNumber: editingInvoice.poWoNumber,
        legalName: linkedPo?.legalName || editingInvoice.clientLegalName,
        billingAddress: linkedPo?.billingAddress || editingInvoice.clientAddress,
        pincode:
          normalizePoPincode(
            linkedPo?.pincode || editingInvoice.clientPincode || editingInvoice.client_pincode
          ) || '',
        shipToPincode: linkedPo ? normalizePoPincode(linkedPo.shipToPincode ?? linkedPo.ship_to_pincode) : '',
        billToShipToPinSame: linkedPo ? deriveBillToShipToPinSameFromPo(linkedPo) : true,
        shippingAddress:
          linkedPo?.shippingAddress ||
          linkedPo?.shipping_address ||
          editingInvoice.clientShippingAddress ||
          editingInvoice.client_shipping_address ||
          '',
        placeOfSupply:
          linkedPo?.placeOfSupply ||
          linkedPo?.place_of_supply ||
          editingInvoice.placeOfSupply ||
          editingInvoice.place_of_supply ||
          '',
        gstin: linkedPo?.gstin || editingInvoice.gstin,
        hsnCode: editingInvoice.hsnSac,
        sacCode: editingInvoice.hsnSac,
        billingType: editingInvoice.billingType || 'Monthly',
        paymentTerms: editingInvoice.paymentTerms,
        invoiceTermsText: editingInvoice.termsCustomText || editingInvoice.terms_custom_text || '',
        sellerCin: editingInvoice.sellerCin || editingInvoice.seller_cin || '',
        sellerPan: editingInvoice.sellerPan || editingInvoice.seller_pan || '',
        msmeRegistrationNo: editingInvoice.msmeRegistrationNo || editingInvoice.msme_registration_no || '',
        msmeClause: editingInvoice.msmeClause || editingInvoice.msme_clause || '',
        billingCycle: 30,
        gstSupplyType: gstRaw,
        ratePerCategory: linkedPo?.ratePerCategory || [],
        renewalCycles: linkedPo?.renewalCycles || [],
      };
    }
    return null;
  }, [selectedPO, invoiceDraft, editingInvoice, commercialPOs]);

  useEffect(() => {
    if (!displayPO) return;
    const isEdit = invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId;
    if (isEdit) return;
    if (billingDraftRestoreGuardRef.current) return;
    const next = getNextTaxInvoiceSequence(invoices, invoiceDate);
    setManualTaxInvoiceSerial(String(next).padStart(4, '0'));
    // Seed when opening the create modal for a PO; avoid listing `invoices` so typing isn't reset on every list refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayPO?.id, invoiceDraft?.mode, invoiceDraft?.invoiceId, invoiceDate]);

  /** M&M + Service only — enable description dropdown rows. */
  const isMmServiceDescriptionMode = useMemo(() => {
    if (!isMmOnlyVertical) return false;
    const bt = String(displayPO?.billingType || '').trim().toLowerCase();
    return bt === 'service';
  }, [isMmOnlyVertical, displayPO]);

  const mmDescriptionOptions = useMemo(
    () => (isMmServiceDescriptionMode && displayPO ? sortedRmDescriptionOptions(displayPO) : []),
    [isMmServiceDescriptionMode, displayPO]
  );

  const isManpowerMonthly = useMemo(() => {
    if (!displayPO) return false;
    const ocVerticalPart = displayPO.ocNumber ? String(displayPO.ocNumber).split('-')[1] : '';
    const vertical = normalizeVerticalValue(displayPO.vertical || displayPO.poVertical || ocVerticalPart);
    const isManpower = vertical === 'manpower';
    const isMonthly = String(displayPO.billingType || '').toLowerCase() === 'monthly';
    return isManpower && isMonthly;
  }, [displayPO]);

  const isMonthlyBilling = useMemo(() => {
    if (!displayPO) return false;
    return String(displayPO.billingType || '').toLowerCase() === 'monthly';
  }, [displayPO]);

  const isLumpSumBilling = useMemo(() => {
    if (!displayPO) return false;
    return String(displayPO.billingType || '').toLowerCase() === 'lump sum';
  }, [displayPO]);

  const isCustomBilling = useMemo(() => {
    if (!displayPO) return false;
    return String(displayPO.billingType || '').toLowerCase() === 'custom';
  }, [displayPO]);

  // "Custom Calculator" billing: each line can use the three standard billing types
  // (with duty geometry) or a free calculator line (Qty × Unit Price via calculator).
  const isCustomCalculatorBilling = useMemo(() => {
    if (!displayPO) return false;
    return String(displayPO.billingType || '').toLowerCase() === 'custom calculator';
  }, [displayPO]);

  // Both Custom and Custom Calculator drive the same per-line geometry machinery.
  const isCustomLike = isCustomBilling || isCustomCalculatorBilling;

  // Which line/field currently has the calculator popup open: { idx, field, initial }.
  const [calcTarget, setCalcTarget] = useState(null);
  const openFieldCalculator = (idx, field, current) => {
    setCalcTarget({ idx, field, initial: current === 0 || current ? String(current) : '' });
  };
  const closeFieldCalculator = () => setCalcTarget(null);
  const applyFieldCalculator = (value) => {
    if (!calcTarget) return;
    const { idx, field } = calcTarget;
    if (field === 'quantity') {
      updateItem(idx, { quantity: value });
    } else if (field === 'rate') {
      updateItem(idx, { rate: value });
    }
    setCalcTarget(null);
  };

  const resolveInvoiceLineBillingType = useCallback(
    (line) => {
      if (isCustomCalculatorBilling) return normalizeCustomCalcLineBillingType(line?.customBillingType);
      if (isCustomBilling) return normalizeCustomLineBillingType(line?.customBillingType);
      if (isLumpSumBilling) return 'Lump Sum';
      if (isMonthlyBilling) return 'Monthly';
      return 'Per Day';
    },
    [isCustomBilling, isCustomCalculatorBilling, isLumpSumBilling, isMonthlyBilling]
  );

  const monthlyDutyQtyMode = useMemo(() => {
    if (!isMonthlyBilling && !isCustomLike) return 'po_geometry';
    return normalizeMonthlyDutyQtyMode(invoiceMonthlyDutyQtyMode);
  }, [isMonthlyBilling, isCustomLike, invoiceMonthlyDutyQtyMode]);

  const lumpSumBillingMode = useMemo(() => {
    if (!isLumpSumBilling && !isCustomLike) return 'normal';
    return normalizeLumpSumBillingMode(invoiceLumpSumBillingMode);
  }, [isLumpSumBilling, isCustomLike, invoiceLumpSumBillingMode]);

  const lumpSumPenaltyActive = lumpSumBillingMode === 'penalty';
  const lumpSumTruckActive = lumpSumBillingMode === 'truck';
  const lumpSumSubtractPenaltyInRate = lumpSumPenaltyActive || lumpSumInvoicePenaltyGeometry;
  /**
   * Lump sum entry-table behavior:
   * Geometry rows stay as calculation source and are already represented as one
   * entry line, with supplementary/truck rows below it. The separate main
   * preview toggle only controls whether these entry lines are cumulated in the
   * live invoice preview/save.
   */
  const lumpSumSingleInvoiceTableMode =
    isLumpSumBilling && (!lumpSumTruckActive || lumpSumSubtractPenaltyInRate);
  /** Truck lump sum: keep penalty-in-rate math when enabled, but hide Short deployment / penalty columns in duty-geometry UI. */
  const lumpSumShowPenaltyGeometryUi = lumpSumSubtractPenaltyInRate && !lumpSumTruckActive;
  /** Tighter line-item table when Lump Sum + Penalty column (duty geometry) is on — avoids squashed inputs. */
  const lumpSumDutyGeometryLineTable = isLumpSumBilling && lumpSumShowPenaltyGeometryUi;
  const lumpSumGeometryRowsForExport = useMemo(
    () => (isLumpSumBilling ? items.filter((row) => !row.isTruckLine && row.geometryEnabled) : []),
    [isLumpSumBilling, items]
  );

  useEffect(() => {
    if (invoiceDraft?.mode === 'edit') return;
    if (billingDraftRestoreGuardRef.current) return;
    if (skipPoAutoSeedRef.current) return;
    if (!selectedPO) {
      poConfigInitializedForRef.current = '';
      return;
    }
    const poId = String(selectedPO.id);
    if (poConfigInitializedForRef.current === poId) return;
    poConfigInitializedForRef.current = poId;
    setLumpSumInvoicePenaltyGeometry(false);
    setLumpSumConsolidatedLineDraft({ description: null, hsnSac: null, materialCode: null, uom: null, quantity: '', rate: '' });
    setInvoiceMonthlyDutyQtyMode(
      normalizeMonthlyDutyQtyMode(selectedPO?.monthlyDutyQtyMode || selectedPO?.monthly_duty_qty_mode)
    );
    setInvoiceLumpSumBillingMode(
      normalizeLumpSumBillingMode(selectedPO?.lumpSumBillingMode || selectedPO?.lump_sum_billing_mode)
    );
    setLumpSumInvoicePreviewMode(resolvePoLumpSumInvoicePreviewMode(selectedPO));
  }, [
    selectedPO?.id,
    selectedPO?.billingType,
    selectedPO?.monthlyDutyQtyMode,
    selectedPO?.monthly_duty_qty_mode,
    selectedPO?.lumpSumBillingMode,
    selectedPO?.lump_sum_billing_mode,
    invoiceDraft?.mode,
  ]);

  useEffect(() => {
    if (!invoiceDraft) return;
    if (invoiceDraft.mode === 'edit' && editingInvoice) {
      releaseDraftRestoreGuard();
      clearCreateInvoiceDraft();
      clearCreateInvoiceFormDraft();
      const ik = String(editingInvoice.invoiceKind || editingInvoice.invoice_kind || 'tax').toLowerCase();
      setInvoiceDocumentKind(ik === 'proforma' ? 'proforma' : 'tax');
      setSelectedPoId(String(editingInvoice.poId || ''));
      setInvoiceDate(
        toDateInputValue(editingInvoice.invoiceDate || editingInvoice.invoice_date || '')
      );
      setInvoiceDateError('');
      setDigitalSignatureDataUrl(editingInvoice.digitalSignatureDataUrl || editingInvoice.digital_signature_data_url || '');
      setDigitalSignatureError('');
      const atts = Array.isArray(editingInvoice.attachments) ? editingInvoice.attachments : [];
      setAttendanceFiles(atts.filter((a) => a.type === 'attendance').map((a) => ({ name: a.name, url: a.url })));
      setDocument2Files(atts.filter((a) => a.type === 'document_2').map((a) => ({ name: a.name, url: a.url })));
      const editIsLump = String(editingInvoice.billingType || '').toLowerCase() === 'lump sum';
      const editPo = commercialPOs.find((p) => String(p.id) === String(editingInvoice.poId));
      const editAnyPenaltySaved = (editingInvoice.items || []).some((it) => safeNumber(it.penalty) > 0);
      const editLumpMode = editIsLump
        ? normalizeLumpSumBillingMode(
            editingInvoice.lumpSumBillingMode ||
              editingInvoice.lump_sum_billing_mode ||
              editPo?.lumpSumBillingMode ||
              editPo?.lump_sum_billing_mode ||
              (editAnyPenaltySaved ? 'penalty' : 'normal')
          )
        : 'normal';
      const editPenaltyMode = editIsLump && editLumpMode === 'penalty';
      const editMonthsGeometryMode = editIsLump && editLumpMode === 'months_geometry';
      const editHasConsolidatedLump = (editingInvoice.items || []).some((it) =>
        /^lump sum billing \((geometry|invoice) consolidated\)$/i.test((it.description || it.designation || '').trim())
      );
      setInvoiceMonthlyDutyQtyMode(
        normalizeMonthlyDutyQtyMode(
          editingInvoice.monthlyDutyQtyMode ||
            editingInvoice.monthly_duty_qty_mode ||
            editPo?.monthlyDutyQtyMode ||
            editPo?.monthly_duty_qty_mode
        )
      );
      setInvoiceLumpSumBillingMode(
        editLumpMode
      );
      setLumpSumInvoicePenaltyGeometry(editIsLump && !editPenaltyMode && editAnyPenaltySaved);
      setLumpSumInvoicePreviewMode(
        editIsLump && (editingInvoice.lumpSumInvoicePreviewMode || editingInvoice.lump_sum_invoice_preview_mode)
          ? editingInvoice.lumpSumInvoicePreviewMode || editingInvoice.lump_sum_invoice_preview_mode
          : editIsLump && !editHasConsolidatedLump
            ? 'detailed'
            : editIsLump
              ? resolvePoLumpSumInvoicePreviewMode(editPo)
              : 'consolidated'
      );
      setItems(
        (editingInvoice.items || []).map((i) => {
          const isTruck = !!i.isTruckLine;
          const qty = Number(i.quantity) || 0;
          const rate = Number(i.rate) || 0;
          const poPenSnap = i.penalty != null ? Number(i.penalty) : 0;
          const desc = (i.description || i.designation || '').trim();
          const matchCat = (editPo?.ratePerCategory || []).find(
            (r) => (r.description || r.designation || '').trim() === desc
          );
          const isSavedSupplementary = !!(
            i.isLumpSumSupplementaryLine ??
            i.is_lump_sum_supplementary_line ??
            i.is_lump_sum_supplementary
          );
          const looksConsolidatedLump =
            editIsLump &&
            /^lump sum billing \(geometry consolidated\)$/i.test(desc) &&
            i.actualDuty == null &&
            i.actual_duty == null;
          const savedCustomBillingType = i.customBillingType ?? i.custom_billing_type ?? null;
          const geometryEnabled = isTruck
            ? false
            : isSavedSupplementary
              ? false
              : looksConsolidatedLump
                ? false
                : editIsLump
                  ? true
                  : savedCustomBillingType === 'Monthly' || savedCustomBillingType === 'Lump Sum'
                    ? true
                    : !!(i.actualDuty != null || i.authorizedDuty != null || i.poQty != null);
          const poRef =
            i.poReferenceRate != null
              ? Number(i.poReferenceRate)
              : i.po_reference_rate != null
                ? Number(i.po_reference_rate)
                : matchCat
                  ? Number(matchCat.rate) || 0
                  : undefined;
          const poLinePen =
            !isTruck && editIsLump ? Math.max(0, poPenSnap || Number(matchCat?.penalty) || 0) : 0;
          const editSubtractPenalty =
            editIsLump && !isTruck && (editPenaltyMode || editAnyPenaltySaved);
          const actD = i.actualDuty != null ? Number(i.actualDuty) : undefined;
          const authD = i.authorizedDuty != null ? Number(i.authorizedDuty) : undefined;
          const numberOfMonths =
            i.numberOfMonths != null
              ? Number(i.numberOfMonths)
              : i.number_of_months != null
                ? Number(i.number_of_months)
                : 1;
          let quantity = qty;
          let lineRate = rate;
          let amount = isTruck ? round2(qty * rate) : round2(Number(i.amount) || 0);
          const poQ = safeNumber(i.poQty) || getRateCategoryQty(matchCat, editPo);
          if (editIsLump && !isTruck && geometryEnabled) {
            const act = actD ?? 0;
            const auth = authD ?? 0;
            const eff = computeLumpSumEffectiveRate(poRef || 0, act, auth, poLinePen, editSubtractPenalty);
            quantity = editMonthsGeometryMode
              ? computeArrivedQtyByMonths(poQ, act, auth, numberOfMonths)
              : computeArrivedQty(poQ, act, auth);
            lineRate = eff;
            amount = round2(quantity * eff);
          }
          if (editIsLump && !isTruck && isSavedSupplementary) {
            amount = round2(qty * rate);
          }
          return {
            description: i.description || i.designation || '',
            hsnSac: i.hsnSac || editingInvoice.hsnSac || '',
            materialCode: i.materialCode || i.material_code || '',
            uom: i.uom ?? '',
            isTruckLine: isTruck,
            isLumpSumSupplementaryLine: isSavedSupplementary || false,
            customBillingType: savedCustomBillingType,
            geometryEnabled,
            poQty: poQ,
            poReferenceRate: poRef,
            poLinePenalty: poLinePen,
            actualDuty: actD,
            authorizedDuty: i.authorizedDuty != null ? Number(i.authorizedDuty) : undefined,
            numberOfMonths,
            quantity,
            rate: lineRate,
            amount,
          };
        })
      );
      return;
    }
    if (invoiceDraft.mode === 'create' && invoiceDraft.poId) {
      setSelectedPoId(String(invoiceDraft.poId));
      setInvoiceDate('');
      setInvoiceDateError('');
      setDigitalSignatureDataUrl('');
      setDigitalSignatureError('');
    }
  }, [invoiceDraft, editingInvoice, today, commercialPOs]);

  useEffect(() => {
    if (!selectedPO) {
      invoiceHsnInitializedForRef.current = '';
      return;
    }
    if (billingDraftRestoreGuardRef.current) return;
    const poId = String(selectedPO.id);
    if (invoiceHsnInitializedForRef.current === poId) return;
    invoiceHsnInitializedForRef.current = poId;
    setInvoiceLevelHsn(resolvePoHsnSac(selectedPO));
    // Re-run only when the selected PO identity changes — not when billing refresh replaces the PO object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPO?.id]);

  useEffect(() => {
    if (!editingInvoice) return;
    setInvoiceLevelHsn(editingInvoice.hsnSac || '');
    setInvoiceQuantityFooterNote(
      editingInvoice.invoiceQuantityFooterNote || editingInvoice.invoice_quantity_footer_note || ''
    );
    setPreGstSupplementaryRows(parsePreGstSupplementaryRows(editingInvoice));
  }, [editingInvoice?.id]);

  useEffect(() => {
    if (!selectedPO) {
      seededPoIdRef.current = '';
      return;
    }
    // Only seed items when creating (not when editing with existing items)
    if (invoiceDraft?.mode === 'edit') return;
    if (skipPoAutoSeedRef.current) return;
    const poId = String(selectedPO.id);
    if (seededPoIdRef.current === poId) return;
    seededPoIdRef.current = poId;
    const hsnSac = resolvePoHsnSac(selectedPO);
    const isLump = String(selectedPO.billingType || '').toLowerCase() === 'lump sum';
    const isCustomPo = String(selectedPO.billingType || '').toLowerCase() === 'custom';
    const isCustomCalcPo = String(selectedPO.billingType || '').toLowerCase() === 'custom calculator';
    const defaultLineBillingType = isCustomCalcPo ? 'Custom Calculator' : isCustomPo ? 'Per Day' : null;

    if (isLump) {
      const rows = Array.isArray(selectedPO.ratePerCategory) ? selectedPO.ratePerCategory : [];
      const nextRows = rows.map((x) => {
        const desc = ((x.description || x.designation || '').trim()) || 'Other';
        const poRate = getRateCategoryRate(x);
        const qty = getRateCategoryQty(x, selectedPO);
        const pen = getRateCategoryPenalty(x);
        const rowHsnSac = getRateCategoryHsnSac(x, hsnSac);
        const rowMaterialCode = getRateCategoryMaterialCode(x);
        return {
          description: desc,
          hsnSac: selectedPO.materialCodeRequired ? (selectedPO.hsnCode || selectedPO.sacCode || '') : rowHsnSac,
          materialCode: rowMaterialCode,
          uom: '',
          customBillingType: defaultLineBillingType,
          isTruckLine: false,
          geometryEnabled: true,
          poQty: qty,
          poReferenceRate: poRate,
          poLinePenalty: pen,
          actualDuty: 0,
          authorizedDuty: undefined,
          numberOfMonths: 1,
          quantity: computeArrivedQtyByMonths(qty, 0, 0, 1),
          rate: computeLumpSumEffectiveRate(poRate, 0, 0, pen, lumpSumSubtractPenaltyInRate),
          amount: 0,
        };
      });
      setItems(
        nextRows.length
          ? nextRows
          : [
              {
                description: 'Other',
                hsnSac: selectedPO.materialCodeRequired ? (selectedPO.hsnCode || selectedPO.sacCode || '') : hsnSac,
                materialCode: '',
                uom: '',
                customBillingType: defaultLineBillingType,
                isTruckLine: false,
                geometryEnabled: true,
                poQty: getPoHeaderQty(selectedPO),
                poReferenceRate: 0,
                poLinePenalty: 0,
                actualDuty: 0,
                authorizedDuty: undefined,
                numberOfMonths: 1,
                quantity: 0,
                rate: 0,
                amount: 0,
              },
            ]
      );
      return;
    }

    const uniqueRates = getUniqueRateRows(selectedPO);
    if (isMmServiceDescriptionMode) {
      setItems([
        {
          description: '',
          hsnSac,
          customBillingType: defaultLineBillingType,
          isTruckLine: false,
          geometryEnabled: false,
          poQty: 0,
          actualDuty: 0,
          authorizedDuty: undefined,
          numberOfMonths: 1,
          quantity: 0,
          rate: 0,
          amount: 0,
          poReferenceRate: 0,
          poLinePenalty: 0,
        },
      ]);
      return;
    }
    setItems(
      uniqueRates.map((r) => ({
        description: r.description,
        hsnSac: selectedPO.materialCodeRequired ? (selectedPO.hsnCode || selectedPO.sacCode || '') : (r.hsnSac || hsnSac),
        materialCode: selectedPO.materialCodeRequired ? getRateCategoryMaterialCode(r) : '',
        customBillingType: defaultLineBillingType,
        isTruckLine: false,
        geometryEnabled: false,
        poQty: safeNumber(r.qty),
        actualDuty: 0,
        authorizedDuty: undefined,
        numberOfMonths: 1,
        quantity: 0,
        rate: r.rate,
        amount: 0,
        poReferenceRate: r.rate,
        poLinePenalty: r.penalty || 0,
      }))
    );
  }, [selectedPO?.id, invoiceDraft?.mode, isMmServiceDescriptionMode]);

  // Single sync on mount only — avoid repeat refresh (focus / delayed) wiping in-memory fields
  // such as CN/DN request status before async invoice saves finish or if DB columns lag migrations.
  useEffect(() => {
    void (async () => {
      try {
        await refreshBilling?.();
      } catch {
        /* ignore */
      }
    })();
  }, [refreshBilling]);

  const updateItem = (idx, patch) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        let poQty = next.poQty != null ? safeNumber(next.poQty) : 0;
        if (poQty <= 0 && patch.poQty === undefined && next.geometryEnabled && !next.isTruckLine) {
          const fallbackQty = getRateCategoryQty(findRateCategoryRow(displayPO, next.description), displayPO);
          if (fallbackQty > 0) {
            next.poQty = fallbackQty;
            poQty = fallbackQty;
          }
        }
        const actualDuty = next.actualDuty != null ? safeNumber(next.actualDuty) : 0;
        const authorizedDuty =
          next.authorizedDuty === undefined || next.authorizedDuty === null || next.authorizedDuty === ''
            ? 0
            : safeNumber(next.authorizedDuty);
        const numberOfMonths = next.numberOfMonths != null ? safeNumber(next.numberOfMonths) : 1;
        const qtyRaw = safeNumber(next.quantity);
        const lineBillingType = resolveInvoiceLineBillingType(next);
        const lineIsMonthly = lineBillingType === 'Monthly';
        const lineIsLumpSum = lineBillingType === 'Lump Sum';

        if (next.isTruckLine) {
          const qty = isManpowerMonthly ? round3(qtyRaw) : qtyRaw;
          const rate = Number(next.rate) || 0;
          next.quantity = qty;
          next.amount = round2(qty * rate);
          return next;
        }

        if (lineIsMonthly && next.geometryEnabled) {
          const qty =
            monthlyDutyQtyMode === 'duty_ratio'
              ? computeDutyRatioQty(actualDuty, authorizedDuty)
              : monthlyDutyQtyMode === 'po_geometry_by_months'
                ? computeArrivedQtyByMonths(poQty, actualDuty, authorizedDuty, numberOfMonths)
                : computeArrivedQty(poQty, actualDuty, authorizedDuty);
          const rate = Number(next.rate) || 0;
          next.quantity = qty;
          next.amount = round2(qty * rate);
          return next;
        }

        if (lineIsLumpSum && next.geometryEnabled) {
          const poRef = safeNumber(next.poReferenceRate);
          const pen = safeNumber(next.poLinePenalty);
          const effRate = computeLumpSumEffectiveRate(poRef, actualDuty, authorizedDuty, pen, lumpSumSubtractPenaltyInRate);
          const qty =
            lumpSumBillingMode === 'months_geometry'
              ? computeArrivedQtyByMonths(poQty, actualDuty, authorizedDuty, numberOfMonths)
              : computeArrivedQty(poQty, actualDuty, authorizedDuty);
          next.rate = effRate;
          next.quantity = qty;
          next.amount = round2(qty * effRate);
          return next;
        }

        if (lineIsLumpSum && !next.geometryEnabled) {
          const qty = isManpowerMonthly ? round3(qtyRaw) : qtyRaw;
          const rate = Number(next.rate) || 0;
          next.quantity = qty;
          next.amount = round2(qty * rate);
          return next;
        }

        const qty = isManpowerMonthly ? round3(qtyRaw) : qtyRaw;
        const rate = Number(next.rate) || 0;
        next.quantity = qty;
        next.amount = round2(qty * rate);
        return next;
      })
    );
  };

  useEffect(() => {
    if (!isMonthlyBilling && !isCustomLike) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.isTruckLine || !it.geometryEnabled) return it;
        if (resolveInvoiceLineBillingType(it) !== 'Monthly') return it;
        const poQty =
          safeNumber(it.poQty) ||
          getRateCategoryQty(findRateCategoryRow(displayPO, it.description), displayPO);
        const actualDuty = safeNumber(it.actualDuty);
        const authorizedDuty = safeNumber(it.authorizedDuty);
        const numberOfMonths = safeNumber(it.numberOfMonths) || 1;
        const qty =
          monthlyDutyQtyMode === 'duty_ratio'
            ? computeDutyRatioQty(actualDuty, authorizedDuty)
            : monthlyDutyQtyMode === 'po_geometry_by_months'
              ? computeArrivedQtyByMonths(poQty, actualDuty, authorizedDuty, numberOfMonths)
              : computeArrivedQty(poQty, actualDuty, authorizedDuty);
        const rate = Number(it.rate) || 0;
        return { ...it, poQty, quantity: qty, amount: round2(qty * rate) };
      })
    );
  }, [isMonthlyBilling, isCustomLike, monthlyDutyQtyMode, displayPO, resolveInvoiceLineBillingType]);

  useEffect(() => {
    if (!isLumpSumBilling && !isCustomLike) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.isTruckLine || !it.geometryEnabled) return it;
        if (resolveInvoiceLineBillingType(it) !== 'Lump Sum') return it;
        const poRef = safeNumber(it.poReferenceRate);
        const pen = safeNumber(it.poLinePenalty);
        const actualDuty = safeNumber(it.actualDuty);
        const authorizedDuty = safeNumber(it.authorizedDuty);
        const numberOfMonths = safeNumber(it.numberOfMonths) || 1;
        const effRate = computeLumpSumEffectiveRate(poRef, actualDuty, authorizedDuty, pen, lumpSumSubtractPenaltyInRate);
        const poQty =
          safeNumber(it.poQty) ||
          getRateCategoryQty(findRateCategoryRow(displayPO, it.description), displayPO);
        const qty =
          lumpSumBillingMode === 'months_geometry'
            ? computeArrivedQtyByMonths(poQty, actualDuty, authorizedDuty, numberOfMonths)
            : computeArrivedQty(poQty, actualDuty, authorizedDuty);
        return { ...it, poQty, rate: effRate, quantity: qty, amount: round2(qty * effRate) };
      })
    );
  }, [lumpSumSubtractPenaltyInRate, isLumpSumBilling, isCustomLike, lumpSumBillingMode, displayPO, resolveInvoiceLineBillingType]);

  const createMmEmptyLine = (hsnSac = '') => ({
    description: '',
    hsnSac,
    materialCode: '',
    uom: '',
    isTruckLine: false,
    geometryEnabled: false,
    poQty: 0,
    actualDuty: 0,
    authorizedDuty: undefined,
    numberOfMonths: 1,
    quantity: 0,
    rate: 0,
    amount: 0,
    poReferenceRate: 0,
    poLinePenalty: 0,
  });

  /** M&M only: pick PO category → fill description row + rate/qty from PO; focus next line's dropdown. */
  const handleMmDescriptionSelect = (idx, rawValue) => {
    const value = String(rawValue || '').trim();
    const po = displayPO;
    if (!po || !isMmServiceDescriptionMode) return;
    const cat = value ? findRateCategoryRow(po, value) : null;
    const hsn = getRateCategoryHsnSac(cat, po.hsnCode || '');
    const patch = { description: value, hsnSac: hsn };
    if (cat) {
      const poQty = getRateCategoryQty(cat, po);
      const poRate = getRateCategoryRate(cat);
      const pen = getRateCategoryPenalty(cat);
      patch.poQty = poQty;
      patch.poReferenceRate = poRate;
      patch.poLinePenalty = pen;
      if (poRequiresMaterialCode(po)) {
        patch.materialCode = getRateCategoryMaterialCode(cat);
      }
      if (!isLumpSumBilling) {
        patch.rate = poRate;
      }
    } else if (!value) {
      patch.poQty = 0;
      patch.poReferenceRate = 0;
      patch.poLinePenalty = 0;
      patch.rate = 0;
      patch.quantity = 0;
      patch.amount = 0;
    }
    updateItem(idx, patch);
    if (value) {
      setItems((prev) => {
        const hasBlankAfter = prev.some(
          (row, rowIdx) => rowIdx > idx && !row.isTruckLine && !String(row.description || '').trim()
        );
        if (hasBlankAfter) return prev;
        const next = [...prev];
        next.splice(idx + 1, 0, createMmEmptyLine(hsn));
        return next;
      });
    }
    setTimeout(() => {
      const list = itemsRef.current || [];
      for (let j = idx + 1; j < list.length; j += 1) {
        if (!list[j]?.isTruckLine) {
          document.getElementById(`mm-invoice-desc-select-${j}`)?.focus();
          break;
        }
      }
    }, 0);
  };

  /** M&M only: remove selected description row; rows below shift up. */
  const clearMmDescriptionRow = (idx) => {
    if (!isMmServiceDescriptionMode) return;
    const hsn = resolvePoHsnSac(displayPO) || '';
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      const hasBlankSelectableRow = next.some(
        (row) => !row.isTruckLine && !String(row.description || '').trim()
      );
      if (!hasBlankSelectableRow) next.push(createMmEmptyLine(hsn));
      return next;
    });
  };

  const addTruckLine = () => {
    if (!displayPO) return;
    const hsn = resolvePoHsnSac(displayPO) || '';
    setItems((prev) => [
      ...prev,
      {
        description: '',
        hsnSac: hsn,
        materialCode: '',
        uom: '',
        isTruckLine: true,
        geometryEnabled: false,
        quantity: 0,
        rate: 0,
        amount: 0,
        poReferenceRate: undefined,
        poLinePenalty: 0,
        poQty: undefined,
        actualDuty: undefined,
        authorizedDuty: undefined,
        numberOfMonths: undefined,
      },
    ]);
  };

  const removeTruckLine = (idx) => {
    setItems((prev) => {
      if (!prev[idx]?.isTruckLine) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  /** User-added lump sum rows: editable Qty × Rate; excluded from duty-geometry totals. */
  const addLumpSumSupplementaryLine = () => {
    if (!displayPO || !isLumpSumBilling) return;
    const hsn = resolvePoHsnSac(displayPO) || '';
    setItems((prev) => [
      ...prev,
      {
        description: '',
        hsnSac: hsn,
        materialCode: '',
        uom: '',
        isTruckLine: false,
        isLumpSumSupplementaryLine: true,
        geometryEnabled: false,
        poQty: 0,
        actualDuty: 0,
        authorizedDuty: undefined,
        numberOfMonths: 1,
        quantity: 0,
        rate: 0,
        amount: 0,
        poReferenceRate: undefined,
        poLinePenalty: 0,
      },
    ]);
  };

  const removeLumpSumSupplementaryLine = (itemIndex) => {
    setItems((prev) => {
      if (!prev[itemIndex]?.isLumpSumSupplementaryLine) return prev;
      return prev.filter((_, i) => i !== itemIndex);
    });
  };

  const updateLumpSumConsolidatedLine = (patch) => {
    setLumpSumConsolidatedLineDraft((prev) => ({ ...prev, ...patch }));
  };

  const cumulateLumpSumInvoiceLines = isLumpSumBilling && lumpSumInvoicePreviewMode === 'consolidated';
  const lumpSumPenaltyBillingSummary = useMemo(() => {
    if (!isLumpSumBilling || !lumpSumSubtractPenaltyInRate) return null;
    const geometryRows = items.filter((it) => !it.isTruckLine && it.geometryEnabled);
    if (!geometryRows.length) return null;
    const totalActual = round3(geometryRows.reduce((sum, row) => sum + safeNumber(row.actualDuty), 0));
    const totalAuthorized = round3(geometryRows.reduce((sum, row) => sum + safeNumber(row.authorizedDuty), 0));
    const totalShortDeployment = round3(
      geometryRows.reduce((sum, row) => sum + computeShortDeployment(row.actualDuty, row.authorizedDuty), 0)
    );
    const totalPenaltyAmount = round2(
      geometryRows.reduce((sum, row) => sum + computePenaltyAmount(row.actualDuty, row.authorizedDuty, row.poLinePenalty), 0)
    );
    const unit = totalAuthorized > 0 ? round3(totalActual / totalAuthorized) : 0;
    const billingRatePerMonth = safeNumber(displayPO?.monthlyContractValue || displayPO?.monthly_contract_value);
    const billingAmount = round2(billingRatePerMonth * unit);
    const finalBillingValue = round2(Math.max(0, billingAmount - totalPenaltyAmount));
    return {
      totalActual,
      totalAuthorized,
      totalShortDeployment,
      totalPenaltyAmount,
      unit,
      billingRatePerMonth,
      billingAmount,
      finalBillingValue,
    };
  }, [isLumpSumBilling, lumpSumSubtractPenaltyInRate, items, displayPO]);
  const showLumpSumPenaltyBillingSummary =
    isLumpSumBilling &&
    lumpSumSubtractPenaltyInRate &&
    lumpSumSingleInvoiceTableMode &&
    !!lumpSumPenaltyBillingSummary &&
    !lumpSumTruckActive;
  const consolidatedLumpSumLine = useMemo(() => {
    if (!lumpSumSingleInvoiceTableMode) return null;
    const geometryRows = items.filter((it) => !it.isTruckLine && it.geometryEnabled);
    if (!geometryRows.length) return null;
    const geometryAmount = round2(geometryRows.reduce((sum, row) => sum + safeNumber(row.amount), 0));
    const penalty = round2(geometryRows.reduce((sum, row) => sum + safeNumber(row.poLinePenalty), 0));
    const qty = computeCumulativeGeometryQty(geometryRows);
    const billAmount =
      showLumpSumPenaltyBillingSummary && lumpSumPenaltyBillingSummary
        ? lumpSumPenaltyBillingSummary.finalBillingValue
        : geometryAmount;
    const rate = qty > 0 ? round2(billAmount / qty) : round2(billAmount);
    const amount = round2(billAmount);
    return {
      description:
        lumpSumConsolidatedLineDraft.description == null
          ? 'Lump Sum Billing (Geometry Consolidated)'
          : lumpSumConsolidatedLineDraft.description,
      hsnSac:
        lumpSumConsolidatedLineDraft.hsnSac == null
          ? geometryRows[0]?.hsnSac || resolvePoHsnSac(displayPO) || ''
          : lumpSumConsolidatedLineDraft.hsnSac,
      materialCode:
        lumpSumConsolidatedLineDraft.materialCode == null
          ? geometryRows[0]?.materialCode || ''
          : lumpSumConsolidatedLineDraft.materialCode,
      uom:
        lumpSumConsolidatedLineDraft.uom == null
          ? geometryRows[0]?.uom ?? ''
          : lumpSumConsolidatedLineDraft.uom,
      quantity: qty,
      rate,
      amount,
      isTruckLine: false,
      geometryEnabled: false,
      poReferenceRate: 0,
      poLinePenalty: penalty,
      poQty: null,
      actualDuty: null,
      authorizedDuty: null,
      numberOfMonths: null,
    };
  }, [lumpSumSingleInvoiceTableMode, items, displayPO, lumpSumConsolidatedLineDraft, lumpSumPenaltyBillingSummary, showLumpSumPenaltyBillingSummary]);
  /** Invoice table rows: non-truck lump sum shows aggregated geometry line + supplementary Qty×Rate lines only. */
  const invoiceTableRows = useMemo(() => {
    if (!lumpSumSingleInvoiceTableMode) {
      return items.map((_, itemIndex) => ({ kind: 'item', itemIndex }));
    }
    const rows = [];
    if (consolidatedLumpSumLine && !showLumpSumPenaltyBillingSummary) {
      rows.push({ kind: 'lumpConsolidated' });
    }
    items.forEach((it, itemIndex) => {
      if (it.isTruckLine || (!it.isTruckLine && !it.geometryEnabled)) {
        rows.push({ kind: 'item', itemIndex });
      }
    });
    if (!rows.length && items.length) {
      if (showLumpSumPenaltyBillingSummary) return [];
      return items.map((_, itemIndex) => ({ kind: 'item', itemIndex }));
    }
    return rows;
  }, [lumpSumSingleInvoiceTableMode, consolidatedLumpSumLine, showLumpSumPenaltyBillingSummary, items]);

  const lumpSumInvoiceEntryLines = useMemo(() => {
    if (!isLumpSumBilling) return items;
    if (lumpSumSingleInvoiceTableMode && consolidatedLumpSumLine) {
      return [
        consolidatedLumpSumLine,
        ...items.filter((row) => row.isTruckLine || (!row.isTruckLine && !row.geometryEnabled)),
      ];
    }
    return items;
  }, [isLumpSumBilling, lumpSumSingleInvoiceTableMode, consolidatedLumpSumLine, items]);

  const finalInvoiceSourceLines = useMemo(() => {
    if (!cumulateLumpSumInvoiceLines) return lumpSumInvoiceEntryLines;
    const sourceRows = lumpSumInvoiceEntryLines.filter((row) => row);
    if (!sourceRows.length) return sourceRows;
    const geometryRows = items.filter((it) => !it.isTruckLine && it.geometryEnabled);
    const amount = round2(sourceRows.reduce((sum, row) => sum + safeNumber(row.amount), 0));
    const qty = geometryRows.length
      ? computeCumulativeGeometryQty(geometryRows)
      : round3(consolidatedLumpSumLine ? safeNumber(consolidatedLumpSumLine.quantity) : 1);
    const rate = qty > 0 ? round2(amount / qty) : round2(amount);
    const penalty = round2(sourceRows.reduce((sum, row) => sum + safeNumber(row.poLinePenalty), 0));
    return [
      {
        description: sourceRows[0]?.description ?? 'Lump Sum Billing (Invoice Consolidated)',
        hsnSac: sourceRows[0]?.hsnSac || resolvePoHsnSac(displayPO) || '',
        materialCode: sourceRows[0]?.materialCode || '',
        uom: sourceRows[0]?.uom ?? '',
        quantity: qty,
        rate,
        amount,
        isTruckLine: false,
        isLumpSumSupplementaryLine: false,
        geometryEnabled: false,
        poReferenceRate: null,
        poLinePenalty: penalty,
        poQty: null,
        actualDuty: null,
        authorizedDuty: null,
        numberOfMonths: null,
      },
    ];
  }, [cumulateLumpSumInvoiceLines, lumpSumInvoiceEntryLines, consolidatedLumpSumLine, displayPO, items]);

  const lineSubtotal = useMemo(() => {
    const sourceRows = isLumpSumBilling ? lumpSumInvoiceEntryLines : items;
    return round2(sourceRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
  }, [isLumpSumBilling, lumpSumInvoiceEntryLines, items]);

  const preGstLegacyTotals = useMemo(
    () => summarizePreGstLegacyTotals(preGstSupplementaryRows),
    [preGstSupplementaryRows]
  );

  const taxableValue = useMemo(
    () => applyPreGstSupplementaryRows(lineSubtotal, preGstSupplementaryRows),
    [lineSubtotal, preGstSupplementaryRows]
  );

  const addPreGstSupplementaryRow = () => {
    setPreGstSupplementaryRows((prev) => [...prev, createPreGstSupplementaryRow()]);
  };

  const removePreGstSupplementaryRow = (idx) => {
    setPreGstSupplementaryRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updatePreGstSupplementaryRow = (idx, patch) => {
    setPreGstSupplementaryRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  };

  const materialCodeRequired = useMemo(
    () => poRequiresMaterialCode(displayPO),
    [displayPO]
  );
  const lineTableColSpan =
    6 + 1 + (lumpSumShowPenaltyGeometryUi ? 1 : 0);

  const gstSupplyType = useMemo(
    () => normalizeGstSupplyType(displayPO?.gstSupplyType || displayPO?.gst_supply_type),
    [displayPO]
  );

  const cgstRate = 9;
  const sgstRate = 9;
  const igstRate = 18;

  const cgstAmt = useMemo(() => {
    if (gstSupplyType !== 'intra') return 0;
    return round2((taxableValue * cgstRate) / 100);
  }, [taxableValue, cgstRate, gstSupplyType]);

  const sgstAmt = useMemo(() => {
    if (gstSupplyType !== 'intra') return 0;
    return round2((taxableValue * sgstRate) / 100);
  }, [taxableValue, sgstRate, gstSupplyType]);

  const igstAmt = useMemo(() => {
    if (gstSupplyType !== 'inter') return 0;
    return round2((taxableValue * igstRate) / 100);
  }, [taxableValue, igstRate, gstSupplyType]);

  const totalValueRaw = useMemo(() => {
    if (gstSupplyType === 'sez_zero') return round2(taxableValue);
    return round2(taxableValue + cgstAmt + sgstAmt + igstAmt);
  }, [taxableValue, cgstAmt, sgstAmt, igstAmt, gstSupplyType]);
  const totalValue = useMemo(() => roundInvoiceAmount(totalValueRaw), [totalValueRaw]);

  const previewBillMeta = useMemo(() => {
    if (!displayPO) return null;
    const isEdit = invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId;
    const existing = isEdit ? invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) : null;
    const docNo =
      existing?.taxInvoiceNumber ||
      (invoiceDocumentKind === 'proforma'
        ? generateProformaInvoiceNumber(getNextProformaSequence(invoices, invoiceDate), invoiceDate)
        : buildFullTaxInvoiceNumberFromSerial(manualTaxInvoiceSerial, invoiceDate) ||
          generateTaxInvoiceNumber(getNextTaxInvoiceSequence(invoices, invoiceDate), invoiceDate));
    const lastInvSeries = getLastTaxInvoiceNumberInFy(invoices, invoiceDate);
    const billingDurationStr =
      displayPO.startDate || displayPO.start_date
        ? `${formatDateDdMmYyyy(displayPO.startDate || displayPO.start_date)} – ${formatDateDdMmYyyy(displayPO.endDate || displayPO.end_date)}`
        : '–';
    const remarksLine = resolveInvoiceDescriptionFromPo(displayPO);
    return {
      taxInvoiceNumber: docNo,
      lastInvoiceSeries: lastInvSeries,
      billingDurationStr,
      remarksLine,
    };
  }, [displayPO, invoiceDraft, invoices, invoiceDate, invoiceDocumentKind, manualTaxInvoiceSerial]);

  const taxInvoiceSerialIssue = useMemo(() => {
    if (invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId) return '';
    if (!displayPO || invoiceDocumentKind !== 'tax') return '';
    const full = buildFullTaxInvoiceNumberFromSerial(manualTaxInvoiceSerial, invoiceDate);
    if (!full) return 'Enter the invoice serial after the financial year prefix.';
    const c = classifyNewTaxInvoice(full, invoices, invoiceDate);
    if (c.kind !== 'ok') return c.message;
    return '';
  }, [displayPO, invoiceDraft?.mode, invoiceDraft?.invoiceId, invoiceDocumentKind, manualTaxInvoiceSerial, invoices, invoiceDate]);

  /** New tax invoices: Save stays disabled only for blank/invalid/duplicate serials. */
  const taxInvoiceBlocksSave = useMemo(() => {
    if (invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId) return false;
    if (!displayPO || invoiceDocumentKind !== 'tax') return false;
    if (invoiceDocumentKind === 'draft' || invoiceDocumentKind === 'proforma') return false;
    return !!taxInvoiceSerialIssue;
  }, [invoiceDraft?.mode, invoiceDraft?.invoiceId, displayPO, invoiceDocumentKind, taxInvoiceSerialIssue]);

  const invoiceTermsLinesPreview = useMemo(() => {
    if (!displayPO) return [];
    return resolveTermsLines({
      termsCustomText: displayPO.invoiceTermsText,
      termsText: displayPO.invoiceTermsText,
      terms_custom_text: displayPO.invoiceTermsText,
      poVertical: displayPO.vertical || displayPO.poVertical,
      termsTemplateKey: displayPO.vertical || displayPO.poVertical,
    });
  }, [displayPO]);

  const totalInWords = useMemo(() => formatInvoiceAmountInWords(totalValue), [totalValue]);

  const invoicePartyAddresses = useMemo(() => {
    if (!displayPO) {
      return {
        billToAddress: '',
        shipToAddress: '',
        shipToDiffers: false,
        clientShippingAddress: null,
      };
    }
    return resolveInvoicePartyAddresses(
      displayPO.billingAddress || displayPO.billing_address,
      displayPO.shippingAddress || displayPO.shipping_address
    );
  }, [displayPO]);

  const buyerPinMeta = useMemo(() => {
    if (!displayPO) return { pin: null, stateCode: '', stateName: '' };
    const existingPin =
      displayPO.pincode ||
      editingInvoice?.buyerPin ||
      editingInvoice?.buyer_pin ||
      editingInvoice?.buyerPincode ||
      editingInvoice?.buyer_pincode ||
      editingInvoice?.clientPincode ||
      editingInvoice?.client_pincode;
    return resolveBuyerStateAndPin({
      gstin: displayPO.gstin,
      placeOfSupply: displayPO.placeOfSupply || displayPO.place_of_supply,
      billingAddress: displayPO.billingAddress || displayPO.billing_address,
      existingPin,
    });
  }, [displayPO, editingInvoice]);

  const partyPinMeta = useMemo(() => {
    if (!displayPO) return { billToPin: '', shipToPin: '', billToShipToPinSame: true };
    return resolveInvoicePartyPincodes({
      po: displayPO,
      billPinResolved: buyerPinMeta.pin,
      invoice: editingInvoice,
    });
  }, [displayPO, buyerPinMeta.pin, editingInvoice]);

  const canSave = !!displayPO && items.length > 0;
  const documentKindLockedByIrn = useMemo(() => {
    if (invoiceDraft?.mode !== 'edit' || !editingInvoice) return false;
    const irn = editingInvoice.e_invoice_irn || editingInvoice.eInvoiceIrn;
    return !!irn && !String(irn).toUpperCase().startsWith('MOCK-IRN-');
  }, [invoiceDraft?.mode, editingInvoice]);

  const selectedViewInvoice = useMemo(
    () => invoices.find((i) => String(i.id) === String(viewInvoiceId)) || null,
    [invoices, viewInvoiceId]
  );

  const handleDigitalSignatureUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setDigitalSignatureError('Please upload a signature image file.');
      return;
    }
    try {
      const dataUrl = String(await readImageAsDataUrl(file) || '');
      const signaturePattern = dataUrl ? await buildSignaturePatternDataUrl(dataUrl) : '';
      setDigitalSignatureDataUrl(String(signaturePattern || dataUrl || ''));
      setDigitalSignatureError('');
    } catch {
      setDigitalSignatureError('Signature upload failed. Please try another image.');
    } finally {
      if (signatureInputRef.current) signatureInputRef.current.value = '';
    }
  };

  const clearDigitalSignature = () => {
    setDigitalSignatureDataUrl('');
    setDigitalSignatureError('');
    if (signatureInputRef.current) signatureInputRef.current.value = '';
  };

  // Service period is manually editable in Create/Edit. New invoices default both dates to today (local).
  useEffect(() => {
    if (!selectedPO) {
      servicePeriodScopeRef.current = '';
      return;
    }
    const poId = String(selectedPO.id);
    const isEdit = invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId;
    if (isEdit) {
      if (!editingInvoice) return;
      const scope = `edit:${editingInvoice.id}`;
      if (servicePeriodScopeRef.current === scope) return;
      servicePeriodScopeRef.current = scope;
      const from =
        editingInvoice.billingDurationFrom ||
        editingInvoice.billing_duration_from ||
        selectedPO.startDate ||
        selectedPO.start_date ||
        '';
      const to =
        editingInvoice.billingDurationTo ||
        editingInvoice.billing_duration_to ||
        selectedPO.endDate ||
        selectedPO.end_date ||
        '';
      setServicePeriodFrom(toDateInputValue(from));
      setServicePeriodTo(toDateInputValue(to));
      return;
    }
    if (billingDraftRestoreGuardRef.current) {
      servicePeriodScopeRef.current = `create:${poId}`;
      return;
    }
    const scope = `create:${poId}`;
    if (servicePeriodScopeRef.current === scope) return;
    servicePeriodScopeRef.current = scope;
    const { from, to } = getDefaultServicePeriodRange();
    setServicePeriodFrom(from);
    setServicePeriodTo(to);
    // Re-run only when the selected PO identity changes — not when billing refresh replaces the PO object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPO?.id, invoiceDraft?.mode, invoiceDraft?.invoiceId, editingInvoice?.id]);

  const buildInvoiceForPreview = () => {
    if (!displayPO || !canSave) return null;
    const isEdit = invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId;
    const existing = isEdit ? invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) : null;
    const rawIrn = existing?.e_invoice_irn || existing?.eInvoiceIrn;
    const hasRealIrn = !!rawIrn && !String(rawIrn).toUpperCase().startsWith('MOCK-IRN-');
    const effectiveKind = hasRealIrn
      ? 'tax'
      : invoiceDocumentKind === 'proforma'
        ? 'proforma'
        : invoiceDocumentKind === 'draft'
          ? 'draft'
          : 'tax';
    const id = existing ? existing.id : crypto.randomUUID();
    const taxInvoiceNumber = existing
      ? existing.taxInvoiceNumber
      : effectiveKind === 'proforma'
        ? generateProformaInvoiceNumber(getNextProformaSequence(invoices, invoiceDate), invoiceDate)
        : buildFullTaxInvoiceNumberFromSerial(manualTaxInvoiceSerial, invoiceDate) ||
          generateTaxInvoiceNumber(getNextTaxInvoiceSequence(invoices, invoiceDate), invoiceDate);

    const poRow = commercialPOs.find((p) => String(p.id) === String(displayPO.id));
    let canonicalPoId = displayPO.id;
    let billingParent = poRow;
    if (poRow?.isSupplementary) {
      const pid = poRow.supplementaryParentPoId || poRow.supplementary_parent_po_id;
      billingParent = commercialPOs.find((p) => String(p.id) === String(pid));
      canonicalPoId = pid || displayPO.id;
    }
    const supSt = billingParent?.supplementaryRequestStatus || billingParent?.supplementary_request_status;
    const postContractBillingMoment =
      billingParent &&
      !billingParent.isSupplementary &&
      supSt === 'approved' &&
      isAfterContractEndForInvoice(billingParent.endDate || billingParent.end_date);

    return {
      ...(existing || {}),
      id,
      poId: canonicalPoId,
      siteId: displayPO.siteId,
      billingType: displayPO.billingType || 'Monthly',
      monthlyDutyQtyMode: isMonthlyBilling || isCustomLike ? monthlyDutyQtyMode : null,
      monthly_duty_qty_mode: isMonthlyBilling || isCustomLike ? monthlyDutyQtyMode : null,
      lumpSumBillingMode: isLumpSumBilling || isCustomLike ? lumpSumBillingMode : null,
      lump_sum_billing_mode: isLumpSumBilling || isCustomLike ? lumpSumBillingMode : null,
      taxInvoiceNumber,
      invoiceDate,
      billNumber: existing?.billNumber || existing?.bill_number || taxInvoiceNumber,
      billingMonth: existing?.billingMonth || existing?.billing_month || formatBillingMonth(invoiceDate),
      billingDurationFrom:
        servicePeriodFrom || null,
      billingDurationTo: servicePeriodTo || null,
      invoiceHeaderRemarks:
        existing?.invoiceHeaderRemarks ||
        existing?.invoice_header_remarks ||
        resolveInvoiceDescriptionFromPo(displayPO),
      invoiceQuantityFooterNote:
        invoiceQuantityFooterNote.trim() ||
        existing?.invoiceQuantityFooterNote ||
        existing?.invoice_quantity_footer_note ||
        null,
      clientLegalName: displayPO.legalName,
      clientAddress: invoicePartyAddresses.billToAddress || displayPO.billingAddress,
      clientPincode: String(partyPinMeta.billToPin || buyerPinMeta.pin || ''),
      client_pincode: String(partyPinMeta.billToPin || buyerPinMeta.pin || ''),
      clientShipToPincode: partyPinMeta.shipToPin || null,
      client_ship_to_pincode: partyPinMeta.billToShipToPinSame
        ? null
        : partyPinMeta.shipToPin || null,
      gstin: displayPO.gstin,
      buyerPin: buyerPinMeta.pin || null,
      buyer_pin: buyerPinMeta.pin || null,
      buyerPincode: buyerPinMeta.pin || null,
      buyer_pincode: buyerPinMeta.pin || null,
      buyerStateCode: buyerPinMeta.stateCode || null,
      ocNumber: displayPO.ocNumber,
      poWoNumber: displayPO.poWoNumber,
      hsnSac: invoiceLevelHsn || resolvePoHsnSac(displayPO) || '',
      paymentTerms: resolvePoPaymentTerms(displayPO),
      poDate: resolvePoDateRaw(displayPO),
      materialCodeRequired,
      preGstDeduction: preGstLegacyTotals.deduction,
      preGstAddition: preGstLegacyTotals.addition,
      preGstSupplementaryRows: serializePreGstSupplementaryRows(preGstSupplementaryRows),
      pre_gst_supplementary_rows: serializePreGstSupplementaryRows(preGstSupplementaryRows),
      items: (() => {
        let lines = isLumpSumBilling ? finalInvoiceSourceLines : items;
        lines = lines.map((i) => ({
          description: i.description,
          hsnSac: i.hsnSac,
          materialCode: i.materialCode || '',
          uom: i.uom ?? '',
          quantity: isManpowerMonthly ? round3(i.quantity) : Number(i.quantity) || 0,
          rate: Number(i.rate) || 0,
          amount: round2(i.amount),
          customBillingType: isCustomCalculatorBilling
            ? normalizeCustomCalcLineBillingType(i.customBillingType)
            : isCustomBilling
              ? normalizeCustomLineBillingType(i.customBillingType)
              : null,
          isTruckLine: !!i.isTruckLine,
          isLumpSumSupplementaryLine: !!i.isLumpSumSupplementaryLine,
          poReferenceRate:
            isLumpSumBilling && !i.isTruckLine && i.poReferenceRate != null ? safeNumber(i.poReferenceRate) : null,
          penalty:
            isLumpSumBilling && !i.isTruckLine && lumpSumSubtractPenaltyInRate ? Math.max(0, safeNumber(i.poLinePenalty)) : 0,
          poQty:
            (isMonthlyBilling || isLumpSumBilling) && i.geometryEnabled && !i.isTruckLine
              ? safeNumber(i.poQty) || getRateCategoryQty(findRateCategoryRow(displayPO, i.description), displayPO)
              : null,
          actualDuty:
            i.geometryEnabled && !i.isTruckLine && (isMonthlyBilling || isLumpSumBilling) && i.actualDuty != null
              ? safeNumber(i.actualDuty)
              : null,
          authorizedDuty:
            i.geometryEnabled && !i.isTruckLine && (isMonthlyBilling || isLumpSumBilling) && i.authorizedDuty != null
              ? safeNumber(i.authorizedDuty)
              : null,
          numberOfMonths:
            i.geometryEnabled && !i.isTruckLine && (isMonthlyBilling || isLumpSumBilling) && i.numberOfMonths != null
              ? safeNumber(i.numberOfMonths)
              : null,
        }));
        return lines;
      })(),
      clientShippingAddress: invoicePartyAddresses.clientShippingAddress,
      shipToDiffers: invoicePartyAddresses.shipToDiffers,
      placeOfSupply: displayPO.placeOfSupply || displayPO.place_of_supply || null,
      termsCustomText: displayPO.invoiceTermsText || null,
      sellerCin: displayPO.sellerCin || null,
      sellerPan: displayPO.sellerPan || null,
      msmeRegistrationNo: displayPO.msmeRegistrationNo || null,
      msmeClause: displayPO.msmeClause || null,
      digitalSignatureDataUrl: digitalSignatureDataUrl || null,
      digital_signature_data_url: digitalSignatureDataUrl || null,
      attachments: [
        ...attendanceFiles.map((f) => ({ name: f.name || 'attendance', type: 'attendance', url: f.url || '#' })),
        ...document2Files.map((f) => ({ name: f.name || 'document_2', type: 'document_2', url: f.url || '#' })),
      ],
      taxableValue,
      cgstRate,
      sgstRate,
      cgstAmt,
      sgstAmt,
      gstSupplyType,
      igstRate: gstSupplyType === 'inter' ? igstRate : 0,
      igstAmt: gstSupplyType === 'inter' ? igstAmt : 0,
      calculatedInvoiceAmount: totalValue,
      totalAmount: totalValue,
      paStatus: existing?.paStatus || 'Pending',
      paymentStatus: existing?.paymentStatus || false,
      pendingAmount: existing?.pendingAmount ?? totalValue,
      created_at: existing?.created_at || today,
      createdAt: existing?.createdAt || today,
      updated_at: today,
      isPostContractBuffer: existing ? !!existing.isPostContractBuffer : !!postContractBillingMoment,
      invoiceKind: effectiveKind,
      invoice_kind: effectiveKind,
      lumpSumInvoicePreviewMode,
    };
  };

  const livePreviewInv = useMemo(() => buildInvoiceForPreview(), [
    // recompute when edit inputs change
    displayPO?.id,
    displayPO?.materialCodeRequired,
    displayPO?.material_code_required,
    displayPO?.pincode,
    invoiceLevelHsn,
    materialCodeRequired,
    invoiceQuantityFooterNote,
    displayPO?.shipToPincode,
    displayPO?.ship_to_pincode,
    buyerPinMeta.pin,
    invoiceDraft?.mode,
    invoiceDraft?.invoiceId,
    invoiceDate,
    servicePeriodFrom,
    servicePeriodTo,
    invoiceDocumentKind,
    manualTaxInvoiceSerial,
    digitalSignatureDataUrl,
    items,
    attendanceFiles,
    document2Files,
    taxableValue,
    preGstSupplementaryRows,
    cgstAmt,
    sgstAmt,
    igstAmt,
    totalValue,
    lumpSumInvoicePenaltyGeometry,
    lumpSumInvoicePreviewMode,
    lumpSumSingleInvoiceTableMode,
    consolidatedLumpSumLine,
    finalInvoiceSourceLines,
  ]);

  const handleSaveInvoice = async () => {
    if (!displayPO || !canSave || savingInvoice) return;
    const trimmedInvoiceDate = String(invoiceDate || '').trim();
    if (!trimmedInvoiceDate) {
      setInvoiceDateError('Invoice date is required. Please select a date.');
      return;
    }
    setInvoiceDateError('');
    const isEdit = invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId;
    const existing = isEdit ? invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) : null;
    const rawIrn = existing?.e_invoice_irn || existing?.eInvoiceIrn;
    const hasRealIrn = !!rawIrn && !String(rawIrn).toUpperCase().startsWith('MOCK-IRN-');
    const effectiveKind = hasRealIrn
      ? 'tax'
      : invoiceDocumentKind === 'proforma'
        ? 'proforma'
        : invoiceDocumentKind === 'draft'
          ? 'draft'
          : 'tax';
    // DB + saveInvoice expect a UUID primary key; numeric local-only ids caused duplicate inserts (same tax_invoice_number).
    const id = existing ? existing.id : crypto.randomUUID();
    let taxInvoiceNumber = existing
      ? existing.taxInvoiceNumber
      : effectiveKind === 'proforma'
        ? generateProformaInvoiceNumber(getNextProformaSequence(invoices, invoiceDate), invoiceDate)
        : effectiveKind === 'draft'
          ? generateDraftInvoiceNumber(invoices)
          : buildFullTaxInvoiceNumberFromSerial(manualTaxInvoiceSerial, invoiceDate) ||
            generateTaxInvoiceNumber(getNextTaxInvoiceSequence(invoices, invoiceDate), invoiceDate);

    if (!existing && effectiveKind === 'tax') {
      const c = classifyNewTaxInvoice(taxInvoiceNumber, invoices, invoiceDate);
      if (c.kind !== 'ok') {
        window.alert(c.message);
        return;
      }
    }

    const poRow = commercialPOs.find((p) => String(p.id) === String(displayPO.id));
    let canonicalPoId = displayPO.id;
    let billingParent = poRow;
    if (poRow?.isSupplementary) {
      const pid = poRow.supplementaryParentPoId || poRow.supplementary_parent_po_id;
      billingParent = commercialPOs.find((p) => String(p.id) === String(pid));
      canonicalPoId = pid || displayPO.id;
    }
    const supSt = billingParent?.supplementaryRequestStatus || billingParent?.supplementary_request_status;
    const postContractBillingMoment =
      billingParent &&
      !billingParent.isSupplementary &&
      supSt === 'approved' &&
      isAfterContractEndForInvoice(billingParent.endDate || billingParent.end_date);

    const inv = {
      ...(existing || {}),
      id,
      poId: canonicalPoId,
      siteId: displayPO.siteId,
      billingType: displayPO.billingType || 'Monthly',
      taxInvoiceNumber,
      invoiceDate: trimmedInvoiceDate,
      billNumber: existing?.billNumber || existing?.bill_number || taxInvoiceNumber,
      billingMonth: existing?.billingMonth || existing?.billing_month || formatBillingMonth(trimmedInvoiceDate),
      billingDurationFrom: servicePeriodFrom || null,
      billingDurationTo: servicePeriodTo || null,
      invoiceHeaderRemarks:
        existing?.invoiceHeaderRemarks ||
        existing?.invoice_header_remarks ||
        resolveInvoiceDescriptionFromPo(displayPO),
      invoiceQuantityFooterNote:
        invoiceQuantityFooterNote.trim() ||
        existing?.invoiceQuantityFooterNote ||
        existing?.invoice_quantity_footer_note ||
        null,
      clientLegalName: displayPO.legalName,
      clientAddress: invoicePartyAddresses.billToAddress || displayPO.billingAddress,
      clientPincode: String(partyPinMeta.billToPin || buyerPinMeta.pin || ''),
      client_pincode: String(partyPinMeta.billToPin || buyerPinMeta.pin || ''),
      clientShipToPincode: partyPinMeta.shipToPin || null,
      client_ship_to_pincode: partyPinMeta.billToShipToPinSame
        ? null
        : partyPinMeta.shipToPin || null,
      gstin: displayPO.gstin,
      buyerPin: buyerPinMeta.pin || null,
      buyer_pin: buyerPinMeta.pin || null,
      buyerPincode: buyerPinMeta.pin || null,
      buyer_pincode: buyerPinMeta.pin || null,
      buyerStateCode: buyerPinMeta.stateCode || null,
      ocNumber: displayPO.ocNumber,
      poWoNumber: displayPO.poWoNumber,
      hsnSac: invoiceLevelHsn || resolvePoHsnSac(displayPO) || '',
      paymentTerms: resolvePoPaymentTerms(displayPO),
      poDate: resolvePoDateRaw(displayPO),
      materialCodeRequired,
      preGstDeduction: preGstLegacyTotals.deduction,
      preGstAddition: preGstLegacyTotals.addition,
      preGstSupplementaryRows: serializePreGstSupplementaryRows(preGstSupplementaryRows),
      pre_gst_supplementary_rows: serializePreGstSupplementaryRows(preGstSupplementaryRows),
      items: (() => {
        let lines = isLumpSumBilling ? finalInvoiceSourceLines : items;
        lines = lines.map((i) => ({
          description: i.description,
          hsnSac: invoiceLevelHsn || i.hsnSac,
          materialCode: i.materialCode || '',
          uom: i.uom ?? '',
          quantity: isManpowerMonthly ? round3(i.quantity) : (Number(i.quantity) || 0),
          rate: Number(i.rate) || 0,
          amount: round2(i.amount),
          isTruckLine: !!i.isTruckLine,
          isLumpSumSupplementaryLine: !!i.isLumpSumSupplementaryLine,
          poReferenceRate:
            isLumpSumBilling && !i.isTruckLine && i.poReferenceRate != null ? safeNumber(i.poReferenceRate) : null,
          penalty:
            isLumpSumBilling && !i.isTruckLine && lumpSumSubtractPenaltyInRate ? Math.max(0, safeNumber(i.poLinePenalty)) : 0,
          poQty:
            (isMonthlyBilling || isLumpSumBilling) && i.geometryEnabled && !i.isTruckLine
              ? safeNumber(i.poQty) || getRateCategoryQty(findRateCategoryRow(displayPO, i.description), displayPO)
              : null,
          actualDuty:
            i.geometryEnabled &&
            !i.isTruckLine &&
            (isMonthlyBilling || isLumpSumBilling) &&
            i.actualDuty != null
              ? safeNumber(i.actualDuty)
              : null,
          authorizedDuty:
            i.geometryEnabled &&
            !i.isTruckLine &&
            (isMonthlyBilling || isLumpSumBilling) &&
            i.authorizedDuty != null
              ? safeNumber(i.authorizedDuty)
              : null,
          numberOfMonths:
            i.geometryEnabled &&
            !i.isTruckLine &&
            (isMonthlyBilling || isLumpSumBilling) &&
            i.numberOfMonths != null
              ? safeNumber(i.numberOfMonths)
              : null,
        }));
        return lines;
      })(),
      // Snapshots from PO (or existing invoice) — used by PDF + shared HTML preview
      clientShippingAddress: invoicePartyAddresses.clientShippingAddress,
      shipToDiffers: invoicePartyAddresses.shipToDiffers,
      placeOfSupply: displayPO.placeOfSupply || displayPO.place_of_supply || null,
      termsCustomText: displayPO.invoiceTermsText || null,
      sellerCin: displayPO.sellerCin || null,
      sellerPan: displayPO.sellerPan || null,
      msmeRegistrationNo: displayPO.msmeRegistrationNo || null,
      msmeClause: displayPO.msmeClause || null,
      digitalSignatureDataUrl: digitalSignatureDataUrl || null,
      digital_signature_data_url: digitalSignatureDataUrl || null,
      attachments: [
        ...attendanceFiles.map((f) => ({ name: f.name || 'attendance', type: 'attendance', url: f.url || '#' })),
        ...document2Files.map((f) => ({ name: f.name || 'document_2', type: 'document_2', url: f.url || '#' })),
      ],
      taxableValue,
      cgstRate,
      sgstRate,
      cgstAmt,
      sgstAmt,
      gstSupplyType,
      igstRate: gstSupplyType === 'inter' ? igstRate : 0,
      igstAmt: gstSupplyType === 'inter' ? igstAmt : 0,
      calculatedInvoiceAmount: totalValue,
      totalAmount: totalValue,
      paStatus: existing?.paStatus || 'Pending',
      paymentStatus: existing?.paymentStatus || false,
      pendingAmount: existing?.pendingAmount ?? totalValue,
      created_at: existing?.created_at || today,
      createdAt: existing?.createdAt || today,
      updated_at: today,
      isPostContractBuffer: existing ? !!existing.isPostContractBuffer : !!postContractBillingMoment,
      invoiceKind: effectiveKind,
      invoice_kind: effectiveKind,
      lumpSumInvoicePreviewMode,
    };

    setSavingInvoice(true);
    try {
      await upsertInvoice(inv);
      releaseDraftRestoreGuard();
      clearCreateInvoiceDraft();
      clearCreateInvoiceFormDraft();
      setInvoiceDraft(null);
      onNavigateTab && onNavigateTab('manage-invoices');
    } catch (e) {
      console.error('Save invoice failed:', e);
      const msg =
        e?.code === 'DUPLICATE_TAX_INVOICE_NUMBER'
          ? e.message
          : e?.message || 'Could not save invoice. Check your connection and try again.';
      window.alert(msg);
    } finally {
      setSavingInvoice(false);
    }
  };

  const handleExportGeometrySectionToExcel = () => {
    if (!isLumpSumBilling) return;
    const sourceRows = items.filter((row) => !row.isTruckLine && row.geometryEnabled);
    if (!sourceRows.length) return;
    const includePenaltyCols = lumpSumShowPenaltyGeometryUi;
    const exportRows = sourceRows.map((row, idx) => {
      const actual = safeNumber(row.actualDuty);
      const auth = safeNumber(row.authorizedDuty);
      const ratio = auth > 0 ? round3(actual / auth) : 0;
      const shortDeployment = computeShortDeployment(actual, auth);
      const penaltyRate = round2(safeNumber(row.poLinePenalty));
      const penaltyAmount = computePenaltyAmount(actual, auth, penaltyRate);
      const common = {
        'S.No': idx + 1,
        Description: row.description || `Line ${idx + 1}`,
        'PO Qty': safeNumber(row.poQty),
        'PO Rate': round2(safeNumber(row.poReferenceRate)),
        'Actual Duty': actual,
        'Authorised Duty': auth,
      };
      const tail = {
        'Duty Ratio': ratio,
        Qty: round3(safeNumber(row.quantity)),
        Rate: round2(safeNumber(row.rate)),
        Amount: round2(safeNumber(row.amount)),
      };
      if (includePenaltyCols) {
        return {
          ...common,
          'Short Deployment': shortDeployment,
          'Penalty Rate': penaltyRate,
          'Penalty Amount': penaltyAmount,
          ...tail,
        };
      }
      return { ...common, ...tail };
    });
    const totalQty = computeCumulativeGeometryQty(sourceRows);
    const totalAmount = round2(sourceRows.reduce((sum, row) => sum + safeNumber(row.amount), 0));
    const totalCommon = {
      'S.No': '',
      Description: 'TOTAL',
      'PO Qty': '',
      'PO Rate': '',
      'Actual Duty': '',
      'Authorised Duty': '',
    };
    const totalTail = {
      'Duty Ratio': '',
      Qty: totalQty,
      Rate: totalQty > 0 ? round2(totalAmount / totalQty) : 0,
      Amount: totalAmount,
    };
    exportRows.push(
      includePenaltyCols
        ? {
            ...totalCommon,
            'Short Deployment': round3(
              sourceRows.reduce((sum, row) => sum + computeShortDeployment(row.actualDuty, row.authorizedDuty), 0)
            ),
            'Penalty Rate': '',
            'Penalty Amount': round2(
              sourceRows.reduce(
                (sum, row) => sum + computePenaltyAmount(row.actualDuty, row.authorizedDuty, row.poLinePenalty),
                0
              )
            ),
            ...totalTail,
          }
        : { ...totalCommon, ...totalTail }
    );
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Geometry');
    const oc = String(displayPO?.ocNumber || 'OC').replace(/[\\/:*?"<>|]/g, '-');
    const dt = String(invoiceDate || '').trim() || 'undated';
    XLSX.writeFile(wb, `Geometry-${oc}-${dt}.xlsx`);
  };

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      {verticalNotSelected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-600">
          <p className="text-lg font-semibold text-gray-900">Select a vertical to start</p>
          <p className="text-sm mt-1 max-w-lg mx-auto">
            Choose the same vertical as your OC line above. No PO rows yet? Start in Commercial → PO Entry, then return here.
          </p>
        </div>
      ) : null}
      <div className="flex items-center space-x-3">
        <div className="bg-emerald-100 p-3 rounded-lg shrink-0">
          <FileText className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Make a bill</h2>
          {!verticalNotSelected ? (
            <p className="text-xs text-slate-600 mt-1">
              Job-type filter (top): <strong>{billingPoBasisLabel}</strong>
            </p>
          ) : null}
        </div>
      </div>

      {!verticalNotSelected ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/95 px-4 py-3 text-sm text-slate-700 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <p className="min-w-0 leading-snug">
            <span className="font-semibold text-slate-800">Easy path:</span>{' '}
            <strong>Commercial → PO Entry → Create Bill → Download PDF, Generate IRN &amp; Upload Payment Proof.</strong>
          </p>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('manage-invoices')}
              className="inline-flex items-center rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
            >
              Open all bills
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('dashboard')}
              className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
            >
              Billing home
            </button>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {verticalNotSelected ? (
          <div className="p-6 text-sm text-gray-600">
            Select a vertical above to load billable PO/WOs.
          </div>
        ) : (
        <div className="flex gap-1 px-3 sm:px-4 border-b border-gray-100 overflow-x-auto">
          {CREATE_PAGE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={createMainTab === t.id}
              onClick={() => setCreateMainTab(t.id)}
              className={[
                'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors shrink-0',
                createMainTab === t.id
                  ? 'border-red-600 text-red-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
        )}
      </div>

      {createMainTab === 'select-po' && (
      <div className="space-y-4">
      <div>
        <button
          type="button"
          onClick={() => onNavigateTab && onNavigateTab('add-on-invoices')}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100"
        >
          Open Add-On Invoices
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <h3 className="font-semibold text-gray-900 p-4 pb-2">1. Select PO/WO (sent or approved)</h3>
        <p className="text-xs text-gray-500 px-4 pb-2 -mt-1">
          After contract end, Commercial enables post-contract billing on the same OC — you still pick this row; buffer invoices are moved to the renewed PO/WO when renewal is approved.
        </p>
        {!billingVerticalFilter ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg mx-4 mb-4 px-3 py-2">
            Choose <strong>Business line (team)</strong> at the top of Billing (Manpower or Training) — the same line you used in Commercial → PO Entry.
          </p>
        ) : billablePOs.length === 0 ? (
          <p className="text-sm text-gray-500 px-4 pb-4">
            No PO/WO for this team in Billing. Add one in Commercial → Manpower / Training → PO Entry, save it, then use{' '}
            <span className="font-medium">Reload</span> on Billing or open this tab again. If you use a PO/without-PO filter above, try{' '}
            <span className="font-medium">All jobs</span>.
          </p>
        ) : billablePOsByTab.length === 0 ? (
          <div className="px-3 pb-3">
            {!isRmVertical && !isTrainingVertical ? (
              <div className="px-1 pb-2 flex flex-wrap items-center gap-2">
                {billingTabs.map((t) => {
                  const count = billablePOs.filter((p) => poMatchesBillingTab(p, t.id)).length;
                  const active = poBillingTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setPoBillingTab(t.id)}
                      className={[
                        'px-3 py-1.5 rounded-lg text-sm border',
                        active ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
                      ].join(' ')}
                    >
                      {t.label} <span className={active ? 'text-white/90' : 'text-gray-500'}>({count})</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <p className="text-sm text-gray-500 px-1 pb-2">
              {billablePOs.length} PO(s) exist for this team, but none are tagged <strong>{poBillingTab}</strong>. Pick another tab above, or create a PO with this billing type in Commercial → PO Entry.
            </p>
          </div>
        ) : (
          <div className="px-3 pb-3">
            {!isRmVertical && !isTrainingVertical ? (
              <div className="px-1 pb-2 flex flex-wrap items-center gap-2">
                {billingTabs.map((t) => {
                  const count = billablePOs.filter((p) => poMatchesBillingTab(p, t.id)).length;
                  const bufferOpen = billablePOs.filter(
                    (p) =>
                      poMatchesBillingTab(p, t.id) &&
                      (p.supplementaryRequestStatus || p.supplementary_request_status) === 'approved' &&
                      isAfterContractEndForInvoice(p.endDate || p.end_date)
                  ).length;
                  const active = poBillingTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setPoBillingTab(t.id)}
                      className={[
                        'px-3 py-1.5 rounded-lg text-sm border',
                        active ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
                      ].join(' ')}
                      title={bufferOpen ? `${bufferOpen} OC(s) with post-contract billing open in ${t.label}` : undefined}
                    >
                      {t.label} <span className={active ? 'text-white/90' : 'text-gray-500'}>({count})</span>
                      {bufferOpen ? <span className={active ? 'ml-2 text-amber-100' : 'ml-2 text-amber-700'}>buffer {bufferOpen}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="px-1 pb-2 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={poMasterSearch}
                  onChange={(e) => {
                    setPoMasterSearch(e.target.value);
                    setPoPage(1);
                  }}
                  placeholder="Search master: OC, PO/WO, client, site..."
                  className="w-full min-h-[36px] rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  aria-label="Search PO master"
                />
              </div>
              <select
                value={poSortConfig.key}
                onChange={(e) => setPoSortConfig((prev) => ({ ...prev, key: e.target.value }))}
                className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-red-300 focus:ring-2 focus:ring-red-100"
                aria-label="Sort PO list by"
              >
                <option value="modified">Last modified</option>
                <option value="created">Last created</option>
                <option value="invoiceDate">Invoice date</option>
                <option value="ocNumber">OC number</option>
                <option value="client">Client name</option>
                <option value="siteLocation">Site / Location</option>
                <option value="poWo">PO/WO</option>
                <option value="remaining">Contract left</option>
                <option value="qtyRemaining">Quantity</option>
                <option value="nextBilling">Next billing</option>
                <option value="status">Status</option>
              </select>
              <select
                value={poSortConfig.direction}
                onChange={(e) => setPoSortConfig((prev) => ({ ...prev, direction: e.target.value }))}
                className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-red-300 focus:ring-2 focus:ring-red-100"
                aria-label="Sort PO list direction"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
            <div className="rounded-xl border border-slate-200/90 overflow-hidden bg-gradient-to-br from-red-50/40 via-white to-amber-50/30 ring-1 ring-slate-900/5">
              <div className="p-2">
                <div className="bg-white rounded-lg overflow-hidden">
                  <div className="w-full max-w-full min-w-0 overflow-hidden">
                    <table className="erp-table-exempt w-full table-fixed border-collapse">
                      <colgroup>
                        <col className="w-[4%]" />
                        <col className="w-[9%]" />
                        <col className="w-[12%]" />
                        <col className="w-[12%]" />
                        <col className="w-[8%]" />
                        <col className="w-[8%]" />
                        <col className="w-[8%]" />
                        <col className="w-[8%]" />
                        <col className="w-[10%]" />
                        <col className="w-[7%]" />
                        <col className="w-[14%]" />
                      </colgroup>
                      <thead>
                <tr>
                  <th className="px-1 py-2 text-center text-[11px] font-bold text-black border-b border-red-100/60">S.No</th>
                  <th className="px-1 py-2 text-center text-[11px] font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => togglePoSort('ocNumber')} className="inline-flex w-full items-center justify-center leading-tight">OC Number {renderSortIndicator('ocNumber')}</button></th>
                  <th className="px-1 py-2 text-center text-[11px] font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => togglePoSort('client')} className="inline-flex w-full items-center justify-center leading-tight">Client Name {renderSortIndicator('client')}</button></th>
                  <th className="px-1 py-2 text-center text-[11px] font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => togglePoSort('siteLocation')} className="inline-flex w-full items-center justify-center leading-tight">Site / Location {renderSortIndicator('siteLocation')}</button></th>
                  <th className="px-1 py-2 text-center text-[11px] font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => togglePoSort('poWo')} className="inline-flex w-full items-center justify-center leading-tight">PO/WO {renderSortIndicator('poWo')}</button></th>
                  <th className="px-1 py-2 text-center text-[11px] font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => togglePoSort('invoiceDate')} className="inline-flex w-full items-center justify-center leading-tight">Invoice Date {renderSortIndicator('invoiceDate')}</button></th>
                  <th className="px-1 py-2 text-center text-[11px] font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => togglePoSort('remaining')} className="inline-flex w-full items-center justify-center leading-tight">Contract left (₹) {renderSortIndicator('remaining')}</button></th>
                  <th className="px-1 py-2 text-center text-[11px] font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => togglePoSort('qtyRemaining')} className="inline-flex w-full items-center justify-center leading-tight">Qty {renderSortIndicator('qtyRemaining')}</button></th>
                  <th className="px-1 py-2 text-center text-[11px] font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => togglePoSort('nextBilling')} className="inline-flex w-full items-center justify-center leading-tight">Billing schedule {renderSortIndicator('nextBilling')}</button></th>
                  <th className="px-1 py-2 text-center text-[11px] font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => togglePoSort('status')} className="inline-flex w-full items-center justify-center leading-tight">Status {renderSortIndicator('status')}</button></th>
                  <th className="px-1 py-2 text-center text-[11px] font-bold text-black border-b border-red-100/60">Action</th>
                </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {poPaginatedRows.map((row, idx) => {
                          const editLockedByIrn = !row.invoiceForEditId;
                          return (
                          <tr
                            key={row.id}
                            className={[
                              'align-top',
                              row.postContractBufferOpen ? 'bg-amber-50 hover:bg-amber-100/60' : 'hover:bg-gray-50',
                            ].join(' ')}
                          >
                            <td className="px-1 py-2 text-[11px] text-gray-700 text-center font-medium tabular-nums whitespace-nowrap">{poStart + idx + 1}</td>
                            <td className="px-1 py-2 text-[11px] text-gray-900 text-center font-semibold font-mono truncate" title={row.ocNumber || ''}>{row.ocNumber || '–'}</td>
                            <td className="px-1 py-2 text-[11px] text-gray-700 text-center truncate" title={row.legalName || row.clientLegalName || row.client_name || ''}>
                              {row.legalName || row.clientLegalName || row.client_name || '–'}
                            </td>
                            <td className="px-1 py-2 text-[11px] text-gray-700 text-center truncate" title={row.siteId && row.locationName ? `${row.siteId} – ${row.locationName}` : row.siteId || row.locationName || ''}>
                              {row.siteId && row.locationName ? `${row.siteId} – ${row.locationName}` : row.siteId || row.locationName || '–'}
                            </td>
                            <td className="px-1 py-2 text-[11px] text-gray-700 text-center truncate" title={row.poWoNumber || ''}>{row.poWoNumber || '–'}</td>
                            <td className="px-1 py-2 text-[11px] text-center align-top text-gray-700 whitespace-nowrap">
                              {formatDateDdMmYyyy(row._calc.lastInvoiceDate) || '–'}
                            </td>
                            <td className="px-1 py-2 text-[11px] text-center align-top">
                      {Number(row._calc?.contract) > 0 || Number(row._calc?.invoicedAmount) > 0 ? (
                        <span
                          className={`font-medium ${row._calc.remainingContract < 0 ? 'text-red-700' : 'text-gray-700'}`}
                          title={`Contract ₹${(row._calc.contract || 0).toLocaleString('en-IN')} − invoiced ₹${(row._calc.invoicedAmount || 0).toLocaleString('en-IN')} (tax invoices only)`}
                        >
                          {formatINRWithSign(row._calc.remainingContract)}
                        </span>
                      ) : (
                        <span className="text-gray-400">–</span>
                      )}
                    </td>
                            <td className="px-1 py-2 text-[10px] text-center align-top text-gray-800">
                      {row._calc.poQtyTotal > 0 ? (
                        <span
                          title={`Provided (invoiced sum of line qty): ${row._calc.invoicedQty}; pending from PO qty ${row._calc.poQtyTotal}`}
                        >
                          <span className="block font-medium">{round3(row._calc.invoicedQty)} provided</span>
                          <span className="block text-gray-600">{row._calc.remainingQty} pending</span>
                          <span className="text-[10px] text-gray-500">of {row._calc.poQtyTotal} total</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">–</span>
                      )}
                    </td>
                            <td className="px-1 py-2 text-[10px] text-center align-top leading-tight">
                      <div className="text-gray-700">Last: {formatDateDdMmYyyy(row._calc.lastInvoiceDate) || '–'}</div>
                      <div
                        className={
                          row._calc.nextBillingDate && isBillingCycleDue(row._calc.nextBillingDate)
                            ? 'text-amber-700 font-semibold'
                            : 'text-gray-700'
                        }
                      >
                        Next:{' '}
                        {row._calc.nextBillingDate ? formatDateDdMmYyyy(row._calc.nextBillingDate) : '–'}
                      </div>
                    </td>
                            <td className="px-1 py-2 text-center">
                      <span className={`inline-flex px-1.5 py-1 text-[10px] font-medium rounded-full ${row.hasInvoice ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'}`}>
                        {row.statusLabel}
                      </span>
                      {row.postContractBufferOpen ? (
                        <span className="block text-[10px] text-amber-800 font-medium mt-1">Post-contract window</span>
                      ) : null}
                    </td>
                            <td className="px-1 py-2 text-center">
                              <div className="inline-flex items-center justify-center gap-1">
                        {row.hasInvoice && row.existingInvoiceId && (
                          <>
                            <button
                              type="button"
                              onClick={() => setViewInvoiceId(row.existingInvoiceId)}
                              title="View Tax Invoice"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (editLockedByIrn || !row.invoiceForEditId) return;
                                setInvoiceDraft({ mode: 'edit', invoiceId: row.invoiceForEditId, poId: row.id });
                              }}
                              title={
                                editLockedByIrn
                                  ? row.hasInvoice
                                    ? 'No editable invoice (IRN locked on all)'
                                    : 'Edit Tax Invoice'
                                  : 'Edit Tax Invoice'
                              }
                              disabled={editLockedByIrn}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            releaseDraftRestoreGuard();
                            setInvoiceDocumentKind('tax');
                            setInvoiceDate('');
                            setInvoiceDateError('');
                            setSelectedPoId(String(row.id));
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                        >
                          <PlusCircle className="w-4 h-4" />
                          Create Invoice
                        </button>
                      </div>
                    </td>
                  </tr>
                          );
                        })}
              </tbody>
            </table>
                  </div>
                </div>
                </div>

                {sortedPoTableRows.length === 0 ? null : (
                  <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-gray-600">
                      Showing <span className="font-medium">{poStart + 1}</span>–
                      <span className="font-medium">{Math.min(poStart + PO_TABLE_PAGE_SIZE, sortedPoTableRows.length)}</span> of{' '}
                      <span className="font-medium">{sortedPoTableRows.length}</span> PO{sortedPoTableRows.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => goToPoPage(poSafePage - 1)}
                        disabled={poSafePage <= 1}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <span className="px-3 py-1.5 text-sm text-gray-700">
                        Page <span className="font-medium">{poSafePage}</span> of <span className="font-medium">{poTotalPages}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => goToPoPage(poSafePage + 1)}
                        disabled={poSafePage >= poTotalPages}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
        )}
        <p className="text-xs text-gray-500 px-4 pt-2 pb-4">
          Use <strong>Create Invoice</strong> for a new bill, or <strong>View</strong> / <strong>Edit</strong> when a tax invoice already exists for that PO (edit is disabled after e-invoice IRN is generated).
        </p>
      </div>
      </div>
      )}

      {createMainTab === 'cndn' && (
        <div className="space-y-4">
          <RequestCnDnApprovalSection invoices={invoices} setInvoices={setInvoices} onNavigateTab={onNavigateTab} />
        </div>
      )}

      {displayPO && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 rounded-t-xl z-10">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                  {invoiceDraft?.mode === 'edit' ? 'Edit' : 'Create'} invoice — {displayPO.siteId || '–'}
                </h3>
                <p className="text-xs text-gray-500 truncate">{displayPO.locationName || displayPO.legalName || '–'}</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Auto-save on{createInvoiceAutoHint ? ` · ${createInvoiceAutoHint}` : ''}
                </p>
                {invoiceDraft?.mode !== 'edit' && previewBillMeta?.lastInvoiceSeries ? (
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Last tax invoice in this FY: <span className="font-mono font-semibold text-gray-700">{previewBillMeta.lastInvoiceSeries}</span>
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-end gap-3 shrink-0">
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-gray-500 whitespace-nowrap">
                    Invoice date <span className="text-red-600">*</span>
                  </label>
                  <FormDateInput value={invoiceDate} onChange={(e) => {
                      setInvoiceDate(e.target.value);
                      if (invoiceDateError) setInvoiceDateError('');
                    }}
                    disabled={documentKindLockedByIrn}
                    title={
                      documentKindLockedByIrn
                        ? 'Invoice date is fixed after e-invoice (IRN) is generated'
                        : undefined
                    }
                    className={`px-2 py-1.5 border rounded-md bg-white text-gray-800 text-xs disabled:bg-gray-100 disabled:text-gray-500 ${
                      invoiceDateError ? 'border-red-400 bg-red-50/50' : 'border-gray-200'
                    }`}
                  />
                  {invoiceDateError ? (
                    <p className="text-[10px] text-red-600 font-medium leading-snug max-w-[11rem]">
                      {invoiceDateError}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Service period (from)</label>
                  <FormDateInput value={servicePeriodFrom} onChange={(e) => setServicePeriodFrom(e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-md bg-white text-gray-800 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Service period (to)</label>
                  <FormDateInput value={servicePeriodTo} onChange={(e) => setServicePeriodTo(e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-md bg-white text-gray-800 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-0.5 min-w-[160px]">
                  <label className="text-xs text-gray-500">Document type</label>
                  <select
                    value={invoiceDocumentKind}
                    onChange={(e) => setInvoiceDocumentKind(e.target.value)}
                    disabled={documentKindLockedByIrn}
                    title={
                      documentKindLockedByIrn
                        ? 'Document type is fixed after e-invoice (IRN) is generated'
                        : `Tax invoice uses ${TAX_INVOICE_PREFIX}/YY-YY/… numbers; proforma uses PFI-… numbers`
                    }
                    className="px-2 py-1.5 border border-gray-200 rounded-md bg-white text-gray-800 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="tax">Tax invoice</option>
                    <option value="proforma">Proforma invoice</option>
                    <option value="draft">Draft invoice</option>
                  </select>
                </div>
                {invoiceDraft?.mode !== 'edit' && invoiceDocumentKind === 'tax' && !documentKindLockedByIrn ? (
                  <div className="flex flex-col gap-1 min-w-[220px] max-w-full">
                    <label className="text-xs font-medium text-gray-700" htmlFor="create-inv-manual-tax-serial">
                      Tax invoice number <span className="text-red-600">*</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center px-2 py-1.5 rounded-md border border-gray-200 bg-gray-50 text-gray-800 text-xs font-mono shrink-0">
                        {formatTaxInvoiceNumberPrefix(invoiceDate)}
                      </span>
                      <input
                        id="create-inv-manual-tax-serial"
                        type="text"
                        inputMode="numeric"
                        value={manualTaxInvoiceSerial}
                        onChange={(e) => setManualTaxInvoiceSerial(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className={`min-w-[4.5rem] max-w-[8rem] px-2 py-1.5 border rounded-md bg-white text-gray-800 text-xs font-mono ${taxInvoiceSerialIssue ? 'border-red-400 bg-red-50/50' : 'border-gray-200'}`}
                        autoComplete="off"
                        placeholder={String(getNextTaxInvoiceSequence(invoices, invoiceDate)).padStart(4, '0')}
                        aria-label="Tax invoice serial"
                        aria-invalid={taxInvoiceSerialIssue ? 'true' : 'false'}
                      />
                    </div>
                    {taxInvoiceSerialIssue ? (
                      <p className="text-[10px] text-red-600 font-medium leading-snug">{taxInvoiceSerialIssue}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
              onClick={() => {
                releaseDraftRestoreGuard();
                setSelectedPoId('');
                setItems([]);
                setAttendanceFiles([]);
                setDocument2Files([]);
                setInvoiceDate('');
                setInvoiceDateError('');
                setInvoiceDocumentKind('tax');
                setManualTaxInvoiceSerial('');
                setInvoiceMonthlyDutyQtyMode('po_geometry');
                setInvoiceLumpSumBillingMode('normal');
                setLumpSumInvoicePenaltyGeometry(false);
                setLumpSumConsolidatedLineDraft({ description: null, hsnSac: null, materialCode: null, uom: null, quantity: '', rate: '' });
                const { from, to } = getDefaultServicePeriodRange();
                setServicePeriodFrom(from);
                setServicePeriodTo(to);
                clearCreateInvoiceDraft();
                clearCreateInvoiceFormDraft();
                setInvoiceDraft(null);
              }}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 bg-slate-100/90 space-y-5">
              {/* EXACT same invoice UI as Manage Invoices preview (live while editing) */}
              <div className="mx-auto max-w-5xl">
                <InvoiceHtmlPreview
                  inv={livePreviewInv}
                  po={displayPO}
                  showEInvoiceMeta={false}
                  hideQtyRateColumns={isLumpSumBilling && lumpSumShowPenaltyGeometryUi}
                />
              </div>

              {/* Editing controls (kept as form UI below the preview) */}
              <div className="mx-auto max-w-[920px] border-2 border-neutral-800 bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <div className="border-x-0 border-b border-neutral-800 overflow-hidden bg-[#eef2f7]">
            <div className="p-2">
              <div className="bg-white rounded-lg overflow-hidden">
                {isLumpSumBilling ? (
                  <div className="px-3 py-2.5 border-b border-amber-200/90 bg-amber-50/60">
                    <div className="flex flex-wrap items-start gap-3 text-sm text-neutral-800">
                      <label className="flex flex-col gap-1 min-w-[230px]">
                        <span className="text-xs font-semibold text-amber-950">Geometry logic</span>
                        <select
                          value={lumpSumBillingMode}
                          onChange={(e) => {
                            const nextMode = normalizeLumpSumBillingMode(e.target.value);
                            setInvoiceLumpSumBillingMode(nextMode);
                            if (nextMode !== 'truck') {
                              setLumpSumInvoicePenaltyGeometry(false);
                              setLumpSumInvoicePreviewMode('consolidated');
                            }
                          }}
                          className="rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900"
                        >
                          <option value="normal">Normal duty geometry</option>
                          <option value="penalty">Penalty duty geometry</option>
                          <option value="truck">Truck/manual lines</option>
                          <option value="months_geometry">Months-based duty geometry</option>
                        </select>
                      </label>
                      <div className="flex-1 min-w-[260px]">
                        {lumpSumTruckActive ? (
                          <p>
                            <span className="font-semibold">Duty geometry — truck lump sum</span>
                            <span className="text-neutral-600">
                              {' '}
                              Qty = (Actual ÷ Authorised) × PO Qty. Add truck / supplementary rows as Qty × Rate only.
                            </span>
                          </p>
                        ) : lumpSumBillingMode === 'months_geometry' ? (
                          <p>
                            <span className="font-semibold">Duty geometry — months based</span>
                            <span className="text-neutral-600">
                              {' '}
                              Qty = (Actual ÷ Authorised) × (PO Qty ÷ Number of months).
                            </span>
                          </p>
                        ) : lumpSumPenaltyActive ? (
                          <p>
                            <span className="font-semibold">Duty geometry — PO penalty rate</span>
                            <span className="text-neutral-600">
                              {' '}
                              Uses Short deployment = Authorised − Actual and Penalty amount = Short deployment × Penalty rate.
                            </span>
                          </p>
                        ) : (
                          <p>
                            <span className="font-semibold">Duty geometry — normal</span>
                            <span className="text-neutral-600">
                              {' '}
                              Qty = (Actual ÷ Authorised) × PO Qty; Rate = PO rate; Amount = Qty × Rate.
                            </span>
                          </p>
                        )}
                        {lumpSumTruckActive ? (
                          <label className="mt-2 inline-flex items-center gap-2 text-xs text-amber-950 cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-amber-700 focus:ring-amber-500"
                              checked={lumpSumInvoicePenaltyGeometry}
                              onChange={(e) => setLumpSumInvoicePenaltyGeometry(!!e.target.checked)}
                            />
                            Apply category penalty to PO duty lines (Rate = PO rate − category penalty)
                          </label>
                        ) : null}
                      </div>
                    </div>
                    {lumpSumSubtractPenaltyInRate ? (
                      <div className="mt-2 ml-7 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleExportGeometrySectionToExcel}
                          disabled={!lumpSumGeometryRowsForExport.length}
                          className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-emerald-50"
                        >
                          Export Geometry to Excel
                        </button>
                        <span className="text-[11px] text-amber-900/80 max-w-xl">
                          {lumpSumTruckActive
                            ? 'Truck lump sum: exports every duty-geometry category row (PO duty lines only; no short deployment or penalty columns in the file).'
                            : 'Works for all lump sum layouts (including truck): exports every duty-geometry category row.'}
                        </span>
                      </div>
                    ) : null}
                    {lumpSumSingleInvoiceTableMode ? (
                      <div className="mt-3 ml-7 mr-1 rounded-md border border-amber-200 bg-white/80 p-2.5">
                        <p className="text-xs font-semibold text-amber-900">Geometry inputs (calculation source)</p>
                        <p className="text-[11px] text-amber-900/85 mt-1">
                          Edit each geometry category below; the invoice table shows cumulative qty as (total actual / total authorised) on the first line. Add supplementary rows (Qty × Rate) under the table for extras.
                        </p>
                        <div className="mt-2 space-y-2">
                          {items.map((row, rowIdx) => (
                            row.isTruckLine || !row.geometryEnabled ? null : (
                            <div
                              key={`geo-row-${rowIdx}`}
                              className={[
                                'grid grid-cols-1 gap-2 rounded border border-amber-100 bg-amber-50/30 p-2',
                                lumpSumShowPenaltyGeometryUi
                                  ? 'md:grid-cols-[minmax(140px,1.6fr)_repeat(5,minmax(95px,1fr))] md:items-end'
                                  : 'md:grid-cols-[minmax(140px,2fr)_repeat(4,minmax(95px,1fr))] md:items-end',
                              ].join(' ')}
                            >
                              <div
                                className={[
                                  'text-xs text-gray-700',
                                  lumpSumShowPenaltyGeometryUi ? '' : 'md:col-span-2',
                                ].join(' ')}
                              >
                                <div className="font-medium text-gray-900 truncate" title={row.description || ''}>{row.description || `Line ${rowIdx + 1}`}</div>
                                <div className="text-[11px] text-gray-500">PO rate: ₹{safeNumber(row.poReferenceRate).toLocaleString('en-IN')}</div>
                              </div>
                              <label className="text-[11px] text-gray-700">
                                Actual
                                <input
                                  type="number"
                                  min={0}
                                  value={row.actualDuty ?? 0}
                                  onChange={(e) => updateItem(rowIdx, { actualDuty: e.target.value, geometryEnabled: true })}
                                  className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-center"
                                />
                              </label>
                              <label className="text-[11px] text-gray-700">
                                Authorised
                                <input
                                  type="number"
                                  min={0}
                                  value={authorisedDutyFieldValue(row.authorizedDuty)}
                                  onChange={(e) => updateItem(rowIdx, { authorizedDuty: e.target.value, geometryEnabled: true })}
                                  className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-center"
                                />
                              </label>
                              {lumpSumBillingMode === 'months_geometry' ? (
                                <label className="text-[11px] text-gray-700">
                                  Number of months
                                  <input
                                    type="number"
                                    min={1}
                                    value={row.numberOfMonths ?? 1}
                                    onChange={(e) => updateItem(rowIdx, { numberOfMonths: e.target.value, geometryEnabled: true })}
                                    className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-center"
                                    step="1"
                                  />
                                </label>
                              ) : null}
                              {lumpSumShowPenaltyGeometryUi ? (
                                <>
                                  <div className="text-[11px] text-gray-700">
                                    Short deployment
                                    <div className="mt-1 h-[30px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-center text-gray-800">
                                      {computeShortDeployment(row.actualDuty, row.authorizedDuty).toLocaleString('en-IN')}
                                    </div>
                                  </div>
                                  <div className="text-[11px] text-gray-700">
                                    Penalty rate
                                    <div className="mt-1 h-[30px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-center text-gray-800">
                                      ₹{safeNumber(row.poLinePenalty).toLocaleString('en-IN')}
                                    </div>
                                  </div>
                                  <div className="text-[11px] text-gray-700">
                                    Penalty amount
                                    <div className="mt-1 h-[30px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-center text-gray-800">
                                      ₹{computePenaltyAmount(row.actualDuty, row.authorizedDuty, row.poLinePenalty).toLocaleString('en-IN')}
                                    </div>
                                  </div>
                                </>
                              ) : null}
                              {!lumpSumSubtractPenaltyInRate || lumpSumTruckActive ? (
                                <>
                                  <div className="text-[11px] text-gray-700">
                                    Qty
                                    <div className="mt-1 h-[30px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-center text-gray-800">
                                      {round3(row.quantity).toLocaleString('en-IN')}
                                    </div>
                                  </div>
                                  <div className="text-[11px] text-gray-700">
                                    Amount
                                    <div className="mt-1 h-[30px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-center text-gray-800">
                                      ₹{round2(row.amount).toLocaleString('en-IN')}
                                    </div>
                                  </div>
                                </>
                              ) : null}
                            </div>
                            )
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {showLumpSumPenaltyBillingSummary ? (
                  <div className="border-b border-amber-200 bg-amber-50/40 px-3 py-3">
                    <p className="text-xs font-semibold text-amber-900">Lump sum penalty billing summary</p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="min-w-[760px] w-full border border-amber-200 bg-white text-xs">
                        <thead className="bg-amber-100/60 text-amber-950">
                          <tr>
                            <th className="border border-amber-200 px-2 py-2 text-center">Actual total</th>
                            <th className="border border-amber-200 px-2 py-2 text-center">Authorised total</th>
                            <th className="border border-amber-200 px-2 py-2 text-center">Short deployment total</th>
                            <th className="border border-amber-200 px-2 py-2 text-center">Total Penalty amount</th>
                            <th className="border border-amber-200 px-2 py-2 text-center">Billing rate per month</th>
                            <th className="border border-amber-200 px-2 py-2 text-center">Unit</th>
                            <th className="border border-amber-200 px-2 py-2 text-center">Billing amount</th>
                            <th className="border border-amber-200 px-2 py-2 text-center">Final billing value</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="border border-amber-200 px-2 py-2 text-center tabular-nums">
                              {lumpSumPenaltyBillingSummary.totalActual.toLocaleString('en-IN')}
                            </td>
                            <td className="border border-amber-200 px-2 py-2 text-center tabular-nums">
                              {lumpSumPenaltyBillingSummary.totalAuthorized.toLocaleString('en-IN')}
                            </td>
                            <td className="border border-amber-200 px-2 py-2 text-center tabular-nums">
                              {lumpSumPenaltyBillingSummary.totalShortDeployment.toLocaleString('en-IN')}
                            </td>
                            <td className="border border-amber-200 px-2 py-2 text-center tabular-nums">
                              ₹{lumpSumPenaltyBillingSummary.totalPenaltyAmount.toLocaleString('en-IN')}
                            </td>
                            <td className="border border-amber-200 px-2 py-2 text-center tabular-nums">
                              ₹{lumpSumPenaltyBillingSummary.billingRatePerMonth.toLocaleString('en-IN')}
                            </td>
                            <td className="border border-amber-200 px-2 py-2">
                              <input
                                type="number"
                                value={lumpSumPenaltyBillingSummary.unit}
                                readOnly
                                className="w-full rounded border border-gray-300 bg-gray-50 px-2 py-1 text-center tabular-nums"
                                aria-label="Unit"
                              />
                            </td>
                            <td className="border border-amber-200 px-2 py-2">
                              <input
                                type="number"
                                value={lumpSumPenaltyBillingSummary.billingAmount}
                                readOnly
                                className="w-full rounded border border-gray-300 bg-gray-50 px-2 py-1 text-center tabular-nums"
                                aria-label="Billing amount"
                              />
                            </td>
                            <td className="border border-amber-200 px-2 py-2">
                              <input
                                type="number"
                                value={lumpSumPenaltyBillingSummary.finalBillingValue}
                                readOnly
                                className="w-full rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-center font-semibold text-emerald-800 tabular-nums"
                                aria-label="Final billing value"
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-1.5 text-[11px] text-amber-900/80">
                      Final billing value = (Billing rate per month × Unit) − Total Penalty amount. This value is used in the tax invoice.
                    </p>
                    {consolidatedLumpSumLine ? (
                      <div className="mt-3 overflow-x-auto">
                        <table className="min-w-[880px] w-full border border-neutral-300 bg-white text-xs">
                          <thead className="bg-neutral-100 text-neutral-900">
                            <tr>
                              <th className="w-12 border border-neutral-300 px-2 py-2 text-center">#</th>
                              <th className="border border-neutral-300 px-2 py-2 text-left">Description</th>
                              {materialCodeRequired ? (
                                <th className="w-32 border border-neutral-300 px-2 py-2 text-center">Material code</th>
                              ) : (
                                <th className="w-28 border border-neutral-300 px-2 py-2 text-center">HSN / SAC</th>
                              )}
                              <th className="w-24 border border-neutral-300 px-2 py-2 text-center">UOM</th>
                              <th className="w-28 border border-neutral-300 px-2 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="border border-neutral-300 px-2 py-2 text-center">1</td>
                              <td className="border border-neutral-300 px-2 py-2">
                                <input
                                  type="text"
                                  value={consolidatedLumpSumLine.description || ''}
                                  onChange={(e) => updateLumpSumConsolidatedLine({ description: e.target.value })}
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  placeholder="Final invoice line description"
                                />
                              </td>
                              {materialCodeRequired ? (
                                <td className="border border-neutral-300 px-2 py-2">
                                  <input
                                    type="text"
                                    value={consolidatedLumpSumLine.materialCode || ''}
                                    onChange={(e) => updateLumpSumConsolidatedLine({ materialCode: e.target.value })}
                                    className="w-full rounded border border-gray-300 px-2 py-1 text-center font-mono text-sm"
                                    placeholder="Material code"
                                  />
                                </td>
                              ) : (
                                <td className="border border-neutral-300 px-2 py-2">
                                  <input
                                    type="text"
                                    value={consolidatedLumpSumLine.hsnSac || ''}
                                    onChange={(e) => updateLumpSumConsolidatedLine({ hsnSac: e.target.value })}
                                    className="w-full rounded border border-gray-300 px-2 py-1 text-center font-mono text-sm"
                                    placeholder={resolvePoHsnSac(displayPO) || 'HSN/SAC'}
                                  />
                                </td>
                              )}
                              <td className="border border-neutral-300 px-2 py-2">
                                <input
                                  type="text"
                                  value={consolidatedLumpSumLine.uom ?? ''}
                                  onChange={(e) => updateLumpSumConsolidatedLine({ uom: e.target.value })}
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-center text-sm"
                                  placeholder="UOM"
                                />
                              </td>
                              <td className="border border-neutral-300 px-2 py-2 text-right font-semibold tabular-nums">
                                ₹{round2(consolidatedLumpSumLine.amount).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p className="mt-1 text-[11px] text-neutral-500">
                          Description, {materialCodeRequired ? 'material code' : 'HSN / SAC'}, and UOM are editable here; calculated amount is locked and feeds the tax invoice.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {materialCodeRequired && (invoiceTableRows.length > 0 || !showLumpSumPenaltyBillingSummary) ? (
                <div className="px-3 py-2 border-b border-neutral-200 bg-white">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    HSN / SAC (invoice level)
                  </label>
                  <input
                    type="text"
                    value={invoiceLevelHsn}
                    onChange={(e) => setInvoiceLevelHsn(e.target.value)}
                    className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono"
                    placeholder="e.g. 998314"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    Shown on the tax invoice above the line items table (not in each line) when the PO requires material code.
                  </p>
                </div>
                ) : null}
                {invoiceTableRows.length > 0 || !showLumpSumPenaltyBillingSummary ? (
                <div className="w-full max-w-full min-w-0 overflow-x-auto">
                  <table
                    className={[
                      'erp-table-exempt w-full min-w-0 max-w-full border-collapse border border-neutral-400 text-sm table-fixed',
                      lumpSumDutyGeometryLineTable ? 'min-w-[820px]' : isCustomCalculatorBilling ? 'min-w-[760px]' : 'min-w-[640px]',
                    ].join(' ')}
                  >
                    <thead>
                <tr>
                  <th
                    className={[
                      'border border-neutral-400 bg-[#e8edf5] text-center text-[11px] font-bold text-neutral-900',
                      lumpSumDutyGeometryLineTable ? 'w-[3rem] min-w-[2.5rem] px-1 py-1.5' : 'w-[6%] px-2 py-2',
                    ].join(' ')}
                  >
                    #
                  </th>
                  <th
                    className={[
                      'border border-neutral-400 bg-[#e8edf5] text-left text-[11px] font-bold text-neutral-900',
                      lumpSumDutyGeometryLineTable ? 'w-[30%] min-w-[8rem] px-1.5 py-1.5' : 'w-[40%] px-2 py-2',
                    ].join(' ')}
                  >
                    Description
                  </th>
                  {materialCodeRequired ? (
                    <th
                      className={[
                        'border border-neutral-400 bg-[#e8edf5] text-center text-[11px] font-bold text-neutral-900',
                        lumpSumDutyGeometryLineTable ? 'w-[11%] min-w-[4.25rem] px-1 py-1.5' : 'w-[12%] px-2 py-2',
                      ].join(' ')}
                    >
                      Material code
                    </th>
                  ) : (
                    <th
                      className={[
                        'border border-neutral-400 bg-[#e8edf5] text-center text-[11px] font-bold text-neutral-900',
                        lumpSumDutyGeometryLineTable ? 'w-[11%] min-w-[4.25rem] px-1 py-1.5' : 'w-[12%] px-2 py-2',
                      ].join(' ')}
                    >
                      HSN / SAC
                    </th>
                  )}
                  {null ? (
                    <>
                      <th className="w-[10%] border border-neutral-400 bg-[#e8edf5] px-2 py-2 text-center text-[11px] font-bold text-neutral-900">PO Qty</th>
                      <th className="w-[10%] border border-neutral-400 bg-[#e8edf5] px-2 py-2 text-center text-[11px] font-bold text-neutral-900">Actual</th>
                      <th className="w-[10%] border border-neutral-400 bg-[#e8edf5] px-2 py-2 text-center text-[11px] font-bold text-neutral-900">Auth</th>
                    </>
                  ) : null}
                  <th
                    className={[
                      'border border-neutral-400 bg-[#e8edf5] text-center text-[11px] font-bold text-neutral-900',
                      lumpSumDutyGeometryLineTable ? 'w-[10%] min-w-[4rem] px-1 py-1.5' : 'w-[12%] px-2 py-2',
                    ].join(' ')}
                  >
                    Qty
                  </th>
                  <th
                    className={[
                      'border border-neutral-400 bg-[#e8edf5] text-center text-[11px] font-bold text-neutral-900',
                      lumpSumDutyGeometryLineTable ? 'w-[11%] min-w-[4.25rem] px-1 py-1.5' : 'w-[14%] px-2 py-2',
                    ].join(' ')}
                  >
                    Rate
                  </th>
                  {lumpSumShowPenaltyGeometryUi ? (
                    <th
                      className={[
                        'border border-neutral-400 bg-[#e8edf5] text-center text-[11px] font-bold text-neutral-900',
                        lumpSumDutyGeometryLineTable ? 'w-[10%] min-w-[3.75rem] px-1 py-1.5 leading-tight' : 'w-[12%] px-2 py-2',
                      ].join(' ')}
                    >
                      Penalty rate (₹)
                    </th>
                  ) : null}
                  <th
                    className={[
                      'border border-neutral-400 bg-[#e8edf5] text-center text-[11px] font-bold text-neutral-900',
                      lumpSumDutyGeometryLineTable ? 'w-[9%] min-w-[3.25rem] px-1 py-1.5' : 'w-[10%] px-2 py-2',
                    ].join(' ')}
                  >
                    UOM
                  </th>
                  <th
                    className={[
                      'border border-neutral-400 bg-[#e8edf5] text-right text-[11px] font-bold text-neutral-900',
                      lumpSumDutyGeometryLineTable ? 'w-[13%] min-w-[4.5rem] px-1 py-1.5' : 'w-[14%] px-2 py-2',
                    ].join(' ')}
                  >
                    Amount
                  </th>
                </tr>
                    </thead>
                    <tbody className="bg-white">
                {invoiceTableRows.map((tableRow, tableIdx) => {
                  const lineTableInputFocus =
                    'focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-400';
                  const lineTableCellInputClass = lumpSumDutyGeometryLineTable
                    ? `w-full min-w-0 max-w-full box-border h-7 text-[11px] px-1 py-0.5 border border-gray-300 rounded text-center ${lineTableInputFocus}`
                    : `w-full min-w-0 max-w-full box-border px-2 py-1 border border-gray-300 rounded-lg text-center text-sm ${lineTableInputFocus}`;
                  const lineTableDescInputClass = `w-full min-w-0 max-w-full box-border border border-gray-300 rounded px-2 py-1 text-sm font-normal ${lineTableInputFocus}`;
                  const isLumpConsolidatedRow = tableRow.kind === 'lumpConsolidated';
                  const ii = tableRow.kind === 'item' ? tableRow.itemIndex : null;
                  const it = isLumpConsolidatedRow ? consolidatedLumpSumLine : items[ii];
                  if (!it && !isLumpConsolidatedRow) return null;
                  const rowKey =
                    tableRow.kind === 'lumpConsolidated'
                      ? 'lump-sum-consolidated'
                      : `item-${ii}`;
                  const isLumpSumSupplementaryRow =
                    ii != null && !!it && !it.isTruckLine && isLumpSumBilling && !it.geometryEnabled;
                  const rowBillingType = resolveInvoiceLineBillingType(it);
                  const rowIsMonthly = rowBillingType === 'Monthly';
                  const rowIsLumpSum = rowBillingType === 'Lump Sum';
                  // Custom Calculator PO + this line set to the free calculator option.
                  const lineUsesCustomCalc =
                    isCustomCalculatorBilling && rowBillingType === 'Custom Calculator';
                  const canDutyRuler =
                    ii != null &&
                    !isLumpConsolidatedRow &&
                    !lumpSumSingleInvoiceTableMode &&
                    !it.isTruckLine &&
                    (isCustomBilling || rowIsMonthly || rowIsLumpSum);
                  const rateDerived =
                    (rowIsMonthly && it.geometryEnabled) ||
                    (rowIsLumpSum && !it.isTruckLine && it.geometryEnabled);
                  const mergedMmDescOpts =
                    isMmOnlyVertical && !it.isTruckLine && ii != null
                      ? (() => {
                          const m = [...mmDescriptionOptions];
                          if (it.description && !m.includes(it.description)) m.push(it.description);
                          m.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
                          return m;
                        })()
                      : [];
                  return (
                  <React.Fragment key={rowKey}>
                  <tr className={activeGeometryRowIdx === tableIdx ? 'bg-indigo-50/60' : undefined}>
                    <td
                      className={[
                        'border border-neutral-400 text-center align-middle text-xs text-neutral-800',
                        lumpSumDutyGeometryLineTable ? 'min-w-0 px-1 py-1' : 'px-2 py-2',
                      ].join(' ')}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>{tableIdx + 1}</span>
                        {it?.isTruckLine && ii != null ? (
                          <button
                            type="button"
                            onClick={() => removeTruckLine(ii)}
                            className="text-[10px] text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        ) : null}
                        {it?.isLumpSumSupplementaryLine && ii != null ? (
                          <button
                            type="button"
                            onClick={() => removeLumpSumSupplementaryLine(ii)}
                            className="text-[10px] text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={[
                        'border border-neutral-400 align-middle text-xs font-medium text-neutral-900 min-w-0 overflow-hidden',
                        lumpSumDutyGeometryLineTable ? 'px-1.5 py-1' : 'px-2 py-2',
                      ].join(' ')}
                      title={it.description || ''}
                    >
                      <div className="flex flex-col gap-1.5 min-w-0 w-full overflow-hidden">
                        <div className="min-w-0 w-full">
                        {isLumpConsolidatedRow ? (
                          <input
                            type="text"
                            value={it.description}
                            onChange={(e) => updateLumpSumConsolidatedLine({ description: e.target.value })}
                            className={lineTableDescInputClass}
                            placeholder="Consolidated line description"
                          />
                        ) : it.isTruckLine && ii != null ? (
                          <input
                            type="text"
                            value={it.description}
                            onChange={(e) => updateItem(ii, { description: e.target.value })}
                            className={lineTableDescInputClass}
                            placeholder="Truck / transport line"
                          />
                        ) : isLumpSumSupplementaryRow && ii != null ? (
                          <input
                            type="text"
                            value={it.description}
                            onChange={(e) => updateItem(ii, { description: e.target.value })}
                            className={lineTableDescInputClass}
                            placeholder="Supplementary line description"
                          />
                        ) : isCustomCalculatorBilling && ii != null && !it.isTruckLine ? (
                          <input
                            type="text"
                            value={it.description}
                            onChange={(e) => updateItem(ii, { description: e.target.value })}
                            className={lineTableDescInputClass}
                            placeholder="Line description"
                          />
                        ) : isMmServiceDescriptionMode && ii != null ? (
                          it.description ? (
                            <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                              <span className="truncate min-w-0">{it.description}</span>
                              <button
                                type="button"
                                onClick={() => clearMmDescriptionRow(ii)}
                                className="shrink-0 text-[11px] text-red-600 hover:underline"
                                title="Clear selected description"
                              >
                                Clear
                              </button>
                            </div>
                          ) : (
                            <select
                              id={`mm-invoice-desc-select-${ii}`}
                              className={`${lineTableDescInputClass} bg-white`}
                              aria-label={`Line ${ii + 1} description`}
                              value=""
                              onChange={(e) => handleMmDescriptionSelect(ii, e.target.value)}
                            >
                              <option value="">Select description…</option>
                              {mergedMmDescOpts.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          )
                        ) : (
                          <span
                            className={
                              lumpSumDutyGeometryLineTable
                                ? 'block min-w-0 text-[11px] leading-snug break-words'
                                : 'block min-w-0 truncate'
                            }
                          >
                            {it.description}
                          </span>
                        )}
                        </div>
                        {canDutyRuler && ii != null ? (
                          <div className="flex justify-end shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveGeometryRowIdx(tableIdx);
                              updateItem(ii, { geometryEnabled: !it.geometryEnabled });
                            }}
                            className={[
                              'inline-flex items-center justify-center w-7 h-7 rounded-md border',
                              it.geometryEnabled
                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                            ].join(' ')}
                            title={
                              isCustomBilling
                                ? 'Select line billing type + logic'
                                : rowIsLumpSum
                                ? 'Duty-based rate (Lump sum)'
                                : 'Geometry calculator (Monthly)'
                            }
                            aria-label="Duty geometry calculator"
                          >
                            <Ruler className="w-4 h-4" />
                          </button>
                          </div>
                        ) : null}
                      </div>
                      {it.isTruckLine ? (
                        <span className="mt-1 inline-block text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Truck line</span>
                      ) : null}
                      {isLumpSumSupplementaryRow ? (
                        <span className="mt-1 inline-block text-[10px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5">Qty × Rate</span>
                      ) : null}
                    </td>
                    {materialCodeRequired ? (
                      <td
                        className={[
                          'border border-neutral-400 text-center align-middle font-mono text-neutral-800 min-w-0 overflow-hidden',
                          lumpSumDutyGeometryLineTable ? 'px-1 py-1 text-[11px]' : 'px-2 py-2 text-xs',
                        ].join(' ')}
                      >
                        {ii != null || isLumpConsolidatedRow ? (
                          <input
                            type="text"
                            value={it.materialCode || ''}
                            onChange={(e) => {
                              if (isLumpConsolidatedRow) {
                                updateLumpSumConsolidatedLine({ materialCode: e.target.value });
                                return;
                              }
                              if (ii != null) updateItem(ii, { materialCode: e.target.value });
                            }}
                            className={lineTableCellInputClass}
                            placeholder="Material code"
                          />
                        ) : (
                          <span className="block break-all font-mono">
                            {resolveInvoiceLineMaterialCode(it)}
                          </span>
                        )}
                      </td>
                    ) : (
                      <td
                        className={[
                          'border border-neutral-400 text-center align-middle font-mono text-neutral-800 min-w-0 overflow-hidden',
                          lumpSumDutyGeometryLineTable ? 'px-1 py-1 text-[11px]' : 'px-2 py-2 text-xs',
                        ].join(' ')}
                      >
                        {ii != null || isLumpConsolidatedRow ? (
                          <input
                            type="text"
                            value={it.hsnSac || ''}
                            onChange={(e) => {
                              if (isLumpConsolidatedRow) {
                                updateLumpSumConsolidatedLine({ hsnSac: e.target.value });
                                return;
                              }
                              if (ii != null) updateItem(ii, { hsnSac: e.target.value });
                            }}
                            className={lineTableCellInputClass}
                            placeholder={
                              it.hsnSac
                                ? 'HSN/SAC'
                                : resolveInvoiceLineHsnSac(
                                    it,
                                    { hsnSac: invoiceLevelHsn, materialCodeRequired },
                                    displayPO
                                  )
                            }
                          />
                        ) : (
                          <span className="block break-all font-mono">
                            {resolveInvoiceLineHsnSac(
                              it,
                              { hsnSac: invoiceLevelHsn, materialCodeRequired },
                              displayPO
                            )}
                          </span>
                        )}
                      </td>
                    )}
                    {null ? (
                      <>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            value={it.poQty ?? 0}
                            onChange={(e) => updateItem(ii, { poQty: e.target.value })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-center"
                            step="1"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            value={it.actualDuty ?? 0}
                            onChange={(e) => updateItem(ii, { actualDuty: e.target.value })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-center"
                            step="1"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            value={authorisedDutyFieldValue(it.authorizedDuty)}
                            onChange={(e) => updateItem(ii, { authorizedDuty: e.target.value })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-center"
                            step="1"
                          />
                        </td>
                      </>
                    ) : null}
                    <td
                      className={[
                        'border border-neutral-400 text-center align-middle min-w-0 overflow-hidden',
                        lumpSumDutyGeometryLineTable ? 'px-1 py-1' : 'px-2 py-2',
                      ].join(' ')}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 min-w-0 w-full">
                        <input
                          type="number"
                          min={0}
                          step={
                            (rowIsMonthly || (rowIsLumpSum && it.geometryEnabled)) && !it.isTruckLine
                              ? '0.001'
                              : undefined
                          }
                          value={it.quantity}
                          onChange={(e) => {
                            if (isLumpConsolidatedRow) {
                              updateLumpSumConsolidatedLine({ quantity: e.target.value });
                              return;
                            }
                            if (ii == null) return;
                            updateItem(ii, { quantity: e.target.value });
                          }}
                          className={lineTableCellInputClass}
                          readOnly={
                            (rowIsMonthly && it.geometryEnabled) ||
                            (rowIsLumpSum && it.geometryEnabled && !it.isTruckLine)
                          }
                        />
                        {lineUsesCustomCalc && ii != null ? (
                          <button
                            type="button"
                            title="Open calculator for Qty"
                            onClick={() => openFieldCalculator(ii, 'quantity', it.quantity)}
                            className="shrink-0 rounded-md border border-indigo-200 bg-indigo-50 p-1.5 text-indigo-600 hover:bg-indigo-100"
                          >
                            <Calculator className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={[
                        'border border-neutral-400 text-center align-middle min-w-0 overflow-hidden',
                        lumpSumDutyGeometryLineTable ? 'px-1 py-1' : 'px-2 py-2',
                      ].join(' ')}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 min-w-0 w-full">
                        <input
                          type="number"
                          min={0}
                          value={it.rate}
                          onChange={(e) => {
                            if (isLumpConsolidatedRow) {
                              updateLumpSumConsolidatedLine({ rate: e.target.value });
                              return;
                            }
                            if (ii == null) return;
                            updateItem(ii, { rate: e.target.value });
                          }}
                          className={lineTableCellInputClass}
                          readOnly={isLumpConsolidatedRow || rateDerived}
                        />
                        {lineUsesCustomCalc && ii != null ? (
                          <button
                            type="button"
                            title="Open calculator for Unit Price"
                            onClick={() => openFieldCalculator(ii, 'rate', it.rate)}
                            className="shrink-0 rounded-md border border-indigo-200 bg-indigo-50 p-1.5 text-indigo-600 hover:bg-indigo-100"
                          >
                            <Calculator className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    {lumpSumShowPenaltyGeometryUi ? (
                      <td
                        className={[
                          'border border-neutral-400 text-center align-middle text-neutral-800 min-w-0',
                          lumpSumDutyGeometryLineTable ? 'px-1 py-1 text-[11px] tabular-nums leading-tight' : 'px-2 py-2 text-xs',
                        ].join(' ')}
                      >
                        {it.isTruckLine || isLumpSumSupplementaryRow ? (
                          '–'
                        ) : (
                          <span title="From PO Rate per Category">₹{safeNumber(it.poLinePenalty).toLocaleString('en-IN')}</span>
                        )}
                      </td>
                    ) : null}
                    <td
                      className={[
                        'border border-neutral-400 text-center align-middle min-w-0 overflow-hidden',
                        lumpSumDutyGeometryLineTable ? 'px-1 py-1' : 'px-2 py-2',
                      ].join(' ')}
                    >
                      {ii != null || isLumpConsolidatedRow ? (
                        <input
                          type="text"
                          value={it.uom ?? ''}
                          onChange={(e) => {
                            const nextUom = e.target.value;
                            if (isLumpConsolidatedRow) {
                              updateLumpSumConsolidatedLine({ uom: nextUom });
                              return;
                            }
                            if (ii != null) updateItem(ii, { uom: nextUom });
                          }}
                          className={lineTableCellInputClass}
                          placeholder=""
                        />
                      ) : (
                        <span className="text-xs">{it.uom ? it.uom : '–'}</span>
                      )}
                    </td>
                    <td
                      className={[
                        'border border-neutral-400 text-right align-middle font-semibold text-neutral-900 min-w-0 tabular-nums',
                        lumpSumDutyGeometryLineTable ? 'px-1 py-1 text-[11px]' : 'px-2 py-2 text-xs',
                      ].join(' ')}
                    >
                      <>₹{round2(it.amount).toLocaleString('en-IN')}</>
                    </td>
                  </tr>
                  {((isCustomBilling && it.geometryEnabled) ||
                    (isCustomCalculatorBilling && !it.isTruckLine)) &&
                  ii != null ? (
                    <tr className="bg-slate-50">
                      <td colSpan={lineTableColSpan} className="border border-neutral-400 px-3 py-3">
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="font-semibold text-gray-700">
                            {isCustomCalculatorBilling ? 'Line billing type' : 'Geometry (Custom line)'}
                          </span>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">Billing type</span>
                            <select
                              id={`line-billing-type-${ii}`}
                              value={rowBillingType}
                              onChange={(e) => {
                                const nextType = isCustomCalculatorBilling
                                  ? normalizeCustomCalcLineBillingType(e.target.value)
                                  : normalizeCustomLineBillingType(e.target.value);
                                const patch = { customBillingType: nextType };
                                // Monthly / Lump Sum need the duty-geometry sub-row turned on.
                                if (nextType === 'Monthly' || nextType === 'Lump Sum') {
                                  patch.geometryEnabled = true;
                                }
                                updateItem(ii, patch);
                              }}
                              className="min-w-[10rem] px-2 py-1 border border-gray-300 rounded-md bg-white text-gray-800"
                            >
                              <option value="Per Day">Daily</option>
                              <option value="Monthly">Monthly</option>
                              <option value="Lump Sum">Lump Sum</option>
                              {isCustomCalculatorBilling ? (
                                <option value="Custom Calculator">Custom Calculator</option>
                              ) : null}
                            </select>
                          </label>
                          {rowBillingType === 'Per Day' ? (
                            <span className="text-gray-500">
                              Daily mode selected. Continue with Qty x Rate directly (no duty-geometry logic).
                            </span>
                          ) : null}
                          {rowBillingType === 'Custom Calculator' ? (
                            <span className="text-gray-500">
                              Calculator mode: use the calculator on Qty and Unit Price. Total = Qty × Unit Price.
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {rowIsMonthly &&
                  !lumpSumSingleInvoiceTableMode &&
                  it.geometryEnabled &&
                  ii != null ? (
                    <tr className="bg-gray-50">
                      <td colSpan={lineTableColSpan} className="border border-neutral-400 px-3 py-3">
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="font-semibold text-gray-700">Geometry (Monthly) calculator</span>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">Logic</span>
                            <select
                              value={monthlyDutyQtyMode}
                              onChange={(e) => setInvoiceMonthlyDutyQtyMode(normalizeMonthlyDutyQtyMode(e.target.value))}
                              className="min-w-[14rem] px-2 py-1 border border-gray-300 rounded-md bg-white text-gray-800"
                            >
                              <option value="po_geometry">(Actual duty ÷ Authorised duty) × PO quantity</option>
                              <option value="duty_ratio">(Actual duty ÷ Authorised duty)</option>
                              <option value="po_geometry_by_months">(Actual duty ÷ Authorised duty) × (PO quantity ÷ months)</option>
                            </select>
                          </label>
                          {monthlyDutyQtyMode === 'po_geometry' || monthlyDutyQtyMode === 'po_geometry_by_months' ? (
                            <label className="inline-flex items-center gap-2">
                              <span className="text-gray-600">PO Qty</span>
                              <input
                                type="number"
                                min={0}
                                value={it.poQty ?? 0}
                                readOnly
                                className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-gray-100 text-gray-700"
                                step="1"
                              />
                            </label>
                          ) : null}
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">Actual duty</span>
                            <input
                              type="number"
                              min={0}
                              value={it.actualDuty ?? 0}
                              onChange={(e) => updateItem(ii, { actualDuty: e.target.value })}
                              className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                              step="1"
                            />
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">Authorised duty</span>
                            <input
                              type="number"
                              min={0}
                              value={authorisedDutyFieldValue(it.authorizedDuty)}
                              onChange={(e) => updateItem(ii, { authorizedDuty: e.target.value })}
                              className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                              step="1"
                            />
                          </label>
                          {monthlyDutyQtyMode === 'po_geometry_by_months' ? (
                            <label className="inline-flex items-center gap-2">
                              <span className="text-gray-600">Number of months</span>
                              <input
                                type="number"
                                min={1}
                                value={it.numberOfMonths ?? 1}
                                onChange={(e) => updateItem(ii, { numberOfMonths: e.target.value })}
                                className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                                step="1"
                              />
                            </label>
                          ) : null}
                          <span className="text-gray-500">
                            {monthlyDutyQtyMode === 'duty_ratio'
                              ? 'Qty = (Actual ÷ Authorised) (3 decimals)'
                              : monthlyDutyQtyMode === 'po_geometry_by_months'
                                ? 'Qty = (Actual ÷ Authorised) × (PO Qty ÷ Number of months) (3 decimals)'
                                : 'Qty = (Actual ÷ Authorised) × PO Qty (3 decimals)'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {rowIsLumpSum &&
                  !lumpSumSingleInvoiceTableMode &&
                  !it.isTruckLine &&
                  it.geometryEnabled &&
                  ii != null ? (
                    <tr className="bg-amber-50/40">
                      <td colSpan={lineTableColSpan} className="border border-neutral-400 px-3 py-3">
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="font-semibold text-gray-800">Lump sum — duty geometry</span>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">Logic</span>
                            <select
                              value={lumpSumBillingMode}
                              onChange={(e) => {
                                const nextMode = normalizeLumpSumBillingMode(e.target.value);
                                setInvoiceLumpSumBillingMode(nextMode);
                                if (nextMode !== 'truck') {
                                  setLumpSumInvoicePreviewMode('consolidated');
                                } else if (lumpSumInvoicePreviewMode !== 'consolidated' && lumpSumInvoicePreviewMode !== 'detailed') {
                                  setLumpSumInvoicePreviewMode('detailed');
                                }
                                if (nextMode === 'penalty') setLumpSumInvoicePenaltyGeometry(false);
                              }}
                              className="min-w-[13rem] px-2 py-1 border border-gray-300 rounded-md bg-white text-gray-800"
                            >
                              <option value="normal">Normal duty geometry</option>
                              <option value="penalty">Penalty duty geometry</option>
                              <option value="truck">Truck/manual lines</option>
                              <option value="months_geometry">Months-based duty geometry</option>
                            </select>
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">PO Qty</span>
                            <input
                              type="number"
                              min={0}
                              value={it.poQty ?? 0}
                              onChange={(e) => updateItem(ii, { poQty: e.target.value })}
                              className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                              step="1"
                            />
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">PO rate (₹)</span>
                            <input
                              type="number"
                              min={0}
                              value={it.poReferenceRate ?? 0}
                              readOnly
                              className="w-28 px-2 py-1 border border-gray-300 rounded-md text-center bg-gray-100 text-gray-700"
                              step="0.01"
                            />
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">Actual duty</span>
                            <input
                              type="number"
                              min={0}
                              value={it.actualDuty ?? 0}
                              onChange={(e) => updateItem(ii, { actualDuty: e.target.value })}
                              className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                              step="1"
                            />
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">Authorised duty</span>
                            <input
                              type="number"
                              min={0}
                              value={authorisedDutyFieldValue(it.authorizedDuty)}
                              onChange={(e) => updateItem(ii, { authorizedDuty: e.target.value })}
                              className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                              step="1"
                            />
                          </label>
                          {lumpSumShowPenaltyGeometryUi ? (
                            <>
                              <label className="inline-flex items-center gap-2">
                                <span className="text-gray-600">Short deployment</span>
                                <input
                                  type="number"
                                  value={computeShortDeployment(it.actualDuty, it.authorizedDuty)}
                                  readOnly
                                  className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-gray-100 text-gray-700"
                                  step="0.001"
                                />
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <span className="text-gray-600">Penalty rate (₹)</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={it.poLinePenalty ?? 0}
                                  readOnly
                                  className="w-28 px-2 py-1 border border-gray-300 rounded-md text-center bg-gray-100 text-gray-700"
                                  step="0.01"
                                />
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <span className="text-gray-600">Penalty amount (₹)</span>
                                <input
                                  type="number"
                                  value={computePenaltyAmount(it.actualDuty, it.authorizedDuty, it.poLinePenalty)}
                                  readOnly
                                  className="w-32 px-2 py-1 border border-gray-300 rounded-md text-center bg-gray-100 text-gray-700"
                                  step="0.01"
                                />
                              </label>
                            </>
                          ) : null}
                          {lumpSumBillingMode === 'months_geometry' ? (
                            <label className="inline-flex items-center gap-2">
                              <span className="text-gray-600">Number of months</span>
                              <input
                                type="number"
                                min={1}
                                value={it.numberOfMonths ?? 1}
                                onChange={(e) => updateItem(ii, { numberOfMonths: e.target.value })}
                                className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                                step="1"
                              />
                            </label>
                          ) : null}
                          <span className="text-gray-600 max-w-md">
                            {lumpSumBillingMode === 'months_geometry'
                              ? 'Qty = (Actual ÷ Authorised) × (PO Qty ÷ Number of months) (3 decimals). '
                              : 'Qty = (Actual ÷ Authorised) × PO Qty (3 decimals). '}
                            {lumpSumSubtractPenaltyInRate && !lumpSumTruckActive
                              ? 'Short deployment = Authorised − Actual. Penalty amount = Short deployment × Penalty rate (from PO).'
                              : lumpSumSubtractPenaltyInRate
                                ? 'Rate = PO rate − category penalty (when enabled). Amount = Qty × Rate.'
                                : 'Rate = PO rate. Amount = Qty × Rate.'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
                </div>
                ) : null}
                {isLumpSumBilling ? (
                  <div className="px-2 pt-2 pb-1 border-t border-gray-100 bg-white space-y-1.5">
                    <div>
                      <button
                        type="button"
                        onClick={addLumpSumSupplementaryLine}
                        className="text-sm font-medium text-sky-700 hover:text-sky-800 hover:underline"
                      >
                        + Add supplementary line (Qty × Rate)
                      </button>
                      <p className="text-[11px] text-gray-500 mt-0.5 max-w-2xl">
                        Use for ad-hoc extras: amount = Qty × Rate. Supplements are added to the taxable total along with the lump sum geometry cumulative line.
                      </p>
                    </div>
                    {lumpSumTruckActive ? (
                      <div>
                        <button
                          type="button"
                          onClick={addTruckLine}
                          className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline"
                        >
                          + Add truck line (Qty × Rate only)
                        </button>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          PO-based lines keep the duty-based lump sum formula where applicable; truck lines are separate.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

                <div className="border-b border-neutral-800 bg-white px-3 sm:px-4 py-3">
                  <label className="block text-[11px] font-bold uppercase text-neutral-600 mb-1.5">
                    Footer note
                  </label>
                  <input
                    type="text"
                    value={invoiceQuantityFooterNote}
                    onChange={(e) => setInvoiceQuantityFooterNote(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="Shown below line items on invoice"
                  />
                </div>

                <div className="grid grid-cols-1 border-b border-neutral-800 md:grid-cols-2 md:divide-x md:divide-neutral-800 bg-neutral-50/50">
                  <div className="p-3 sm:p-4 text-xs text-neutral-700 space-y-1.5">
                    <p className="text-[11px] font-bold uppercase text-neutral-600">Tax summary</p>
                    <p>
                      <span className="font-semibold text-neutral-600">GST on supply (from PO):</span>{' '}
                      {gstSupplyType === 'inter'
                        ? `IGST (${igstRate}%)`
                        : gstSupplyType === 'sez_zero'
                          ? '0% (SEZ / nil rated)'
                          : `CGST + SGST (${cgstRate}% + ${sgstRate}%)`}
                    </p>
                    <p>
                      <span className="font-semibold text-neutral-600">Payment terms:</span>{' '}
                      {resolvePoPaymentTerms(displayPO)}
                    </p>
                  </div>
                  <div className="p-3 sm:p-4 text-xs">
                    <div className="space-y-1.5 border border-neutral-400 bg-white p-3">
                      <div className="flex justify-between gap-4 text-neutral-600">
                        <span>Line items subtotal</span>
                        <span className="tabular-nums">₹{lineSubtotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="pt-2 space-y-2 border-t border-neutral-300">
                        <p className="text-[11px] font-semibold text-neutral-700">
                          Supplementary amounts (before GST)
                        </p>
                        {preGstSupplementaryRows.length === 0 ? (
                          <p className="text-[11px] text-neutral-500">
                            Add rows for extra charges or deductions applied before GST.
                          </p>
                        ) : null}
                        {preGstSupplementaryRows.map((row, rowIdx) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-1 gap-2 rounded border border-neutral-300 bg-white p-2 sm:grid-cols-[1fr_auto_auto_auto]"
                          >
                            <label className="text-[11px] text-neutral-600">
                              Description
                              <input
                                type="text"
                                value={row.description}
                                onChange={(e) =>
                                  updatePreGstSupplementaryRow(rowIdx, { description: e.target.value })
                                }
                                placeholder="e.g. Freight, penalty adjustment"
                                className="mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-xs"
                              />
                            </label>
                            <label className="text-[11px] text-neutral-600">
                              Type
                              <select
                                value={row.type}
                                onChange={(e) =>
                                  updatePreGstSupplementaryRow(rowIdx, { type: e.target.value })
                                }
                                className="mt-0.5 w-full min-w-[5.5rem] border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                              >
                                <option value="add">Add</option>
                                <option value="deduct">Less</option>
                              </select>
                            </label>
                            <label className="text-[11px] text-neutral-600">
                              Amount (₹)
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.amount}
                                onChange={(e) =>
                                  updatePreGstSupplementaryRow(rowIdx, { amount: e.target.value })
                                }
                                className="mt-0.5 w-full min-w-[6rem] border border-gray-300 rounded px-2 py-1 text-xs tabular-nums"
                              />
                            </label>
                            <div className="flex items-end justify-end sm:pb-0.5">
                              <button
                                type="button"
                                onClick={() => removePreGstSupplementaryRow(rowIdx)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-700"
                                title="Remove supplementary row"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden />
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addPreGstSupplementaryRow}
                          className="text-[11px] font-medium text-blue-700 hover:text-blue-800 hover:underline"
                        >
                          + Add supplementary row
                        </button>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-neutral-600">Taxable value</span>
                        <span className="font-semibold tabular-nums">₹{taxableValue.toLocaleString('en-IN')}</span>
                      </div>
                      {gstSupplyType === 'intra' ? (
                        <>
                          <div className="flex justify-between gap-4">
                            <span className="text-neutral-600">CGST ({cgstRate}%)</span>
                            <span className="font-semibold tabular-nums">₹{cgstAmt.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-neutral-600">SGST ({sgstRate}%)</span>
                            <span className="font-semibold tabular-nums">₹{sgstAmt.toLocaleString('en-IN')}</span>
                          </div>
                        </>
                      ) : null}
                      {gstSupplyType === 'inter' ? (
                        <div className="flex justify-between gap-4">
                          <span className="text-neutral-600">IGST ({igstRate}%)</span>
                          <span className="font-semibold tabular-nums">₹{igstAmt.toLocaleString('en-IN')}</span>
                        </div>
                      ) : null}
                      {gstSupplyType === 'sez_zero' ? (
                        <div className="flex justify-between gap-4">
                          <span className="text-neutral-600">GST</span>
                          <span className="font-semibold tabular-nums">₹0 (nil rated)</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-4 border-t border-neutral-400 pt-2 font-bold text-neutral-900">
                        <span>Total</span>
                        <span className="tabular-nums">₹{totalValue.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-b border-neutral-800 px-3 sm:px-4 py-3">
                  <p className="text-[11px] font-bold text-neutral-900">Attachments (optional)</p>
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-dashed border-neutral-400 bg-neutral-50/80 p-3">
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1.5">
                        Attendance sheet (Word / Doc / PDF)
                      </label>
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 shrink-0 text-neutral-400" />
                        <input
                          type="file"
                          accept=".doc,.docx,.pdf,.xlsx,.xls"
                          multiple
                          onChange={(e) =>
                            setAttendanceFiles(
                              Array.from(e.target.files || []).map((f) => ({
                                name: f.name,
                                url: URL.createObjectURL(f),
                              }))
                            )
                          }
                          className="w-full min-w-0 text-xs"
                        />
                      </div>
                      {attendanceFiles.length > 0 ? (
                        <p className="mt-1.5 text-[11px] font-medium text-emerald-700">
                          {attendanceFiles.length} file(s) selected
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-md border border-dashed border-neutral-400 bg-neutral-50/80 p-3">
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1.5">Document 2 (Doc / PDF)</label>
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 shrink-0 text-neutral-400" />
                        <input
                          type="file"
                          accept=".doc,.docx,.pdf"
                          multiple
                          onChange={(e) =>
                            setDocument2Files(
                              Array.from(e.target.files || []).map((f) => ({
                                name: f.name,
                                url: URL.createObjectURL(f),
                              }))
                            )
                          }
                          className="w-full min-w-0 text-xs"
                        />
                      </div>
                      {document2Files.length > 0 ? (
                        <p className="mt-1.5 text-[11px] font-medium text-emerald-700">
                          {document2Files.length} file(s) selected
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="border-b border-neutral-800 px-3 sm:px-4 py-3">
                  <p className="text-[11px] font-bold text-neutral-900">Amount chargeable (in words)</p>
                  <p className="mt-1.5 text-xs font-medium leading-relaxed text-neutral-800">{totalInWords}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-neutral-800 border-b border-neutral-800">
                  <div className="p-3 sm:p-4 text-xs leading-relaxed text-neutral-800">
                    <p className="text-[11px] font-bold text-neutral-900">Bank details</p>
                    <p className="mt-2">A/c Holder&apos;s Name: {INVOICE_BANK_DETAILS.accountHolder}</p>
                    <p>Bank name: {INVOICE_BANK_DETAILS.bankName}</p>
                    <p>A/c No.: {INVOICE_BANK_DETAILS.accountNo}</p>
                    <p>Branch &amp; IFSC Code: {INVOICE_BANK_DETAILS.ifsc}</p>
                    <p className="mt-1.5 leading-relaxed">Bank branch: {INVOICE_BANK_DETAILS.branchAddress}</p>
                    <div className="mt-6 pt-2">
                      <p className="text-sm font-bold text-[#1a3a6c] leading-snug">
                        For {INVOICE_SELLER_TEMPLATE.name}
                      </p>
                      <div className="mt-2">
                        <input
                          ref={signatureInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleDigitalSignatureUpload}
                          className="hidden"
                        />
                        {digitalSignatureDataUrl ? (
                          <div className="inline-flex flex-col items-center gap-2">
                            <div className="flex h-16 w-44 items-center justify-center rounded-md border border-dashed border-neutral-300 bg-white p-2">
                              <img
                                src={digitalSignatureDataUrl}
                                alt="Authorised signature"
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => signatureInputRef.current?.click()}
                                className="text-[11px] font-semibold text-sky-700 hover:text-sky-800 hover:underline"
                              >
                                Change signature
                              </button>
                              <button
                                type="button"
                                onClick={clearDigitalSignature}
                                className="text-[11px] font-semibold text-red-600 hover:text-red-700 hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => signatureInputRef.current?.click()}
                            className="inline-flex items-center gap-2 rounded-md border border-dashed border-neutral-400 bg-white px-3 py-2 text-[11px] font-semibold text-neutral-700 hover:border-sky-400 hover:text-sky-700"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            Upload signature
                          </button>
                        )}
                        {digitalSignatureError ? (
                          <p className="mt-1 text-[11px] font-medium text-red-600">{digitalSignatureError}</p>
                        ) : null}
                      </div>
                      <p className="mt-4 font-bold text-neutral-900">Authorised Signatory</p>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4 text-[11px] leading-relaxed text-neutral-800">
                    <p className="font-bold text-neutral-900">Terms &amp; conditions</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-4">
                      {(invoiceTermsLinesPreview.length ? invoiceTermsLinesPreview : ['—']).map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="border-b border-neutral-800 px-3 py-2 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-900">{INVOICE_JURISDICTION}</p>
                </div>

                {/* Letterhead footer: details on white, then empty solid maroon strip */}
                <div className="w-full border-t border-neutral-300 bg-white">
                  <div className="grid grid-cols-1 gap-4 px-4 py-3 text-[10px] leading-relaxed text-neutral-800 sm:grid-cols-2 sm:items-start sm:gap-10 sm:px-6 sm:py-4 sm:text-[11px]">
                    <div className="space-y-2.5 text-left">
                      <p>
                        <span className="font-semibold text-neutral-900">Phone:</span>{' '}
                        <span className="tabular-nums text-neutral-800">{INVOICE_LETTERHEAD_FOOTER.phone}</span>
                      </p>
                      <p className="break-words">
                        <span className="font-semibold text-neutral-900">Email:</span>{' '}
                        <span className="text-neutral-800">{INVOICE_LETTERHEAD_FOOTER.email}</span>
                      </p>
                    </div>
                    <div className="space-y-2.5 border-t border-neutral-200 pt-4 text-left sm:border-t-0 sm:border-l sm:border-neutral-200 sm:pt-0 sm:pl-8">
                      <p>
                        <span className="font-semibold text-neutral-900">Address:</span>{' '}
                        <span className="text-neutral-800">{INVOICE_LETTERHEAD_FOOTER.address}</span>
                      </p>
                      <p className="break-all sm:break-words">
                        <span className="font-semibold text-neutral-900">Website:</span>{' '}
                        <span className="text-neutral-800">{INVOICE_LETTERHEAD_FOOTER.website}</span>
                      </p>
                    </div>
                  </div>
                  <div
                    className="h-[18px] w-full shrink-0 sm:h-5"
                    style={{ backgroundColor: INVOICE_LETTERHEAD_STRIP_COLOR }}
                    aria-hidden
                  />
                </div>
              </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                releaseDraftRestoreGuard();
                setSelectedPoId('');
                setItems([]);
                setAttendanceFiles([]);
                setDocument2Files([]);
                setInvoiceDate('');
                setInvoiceDateError('');
                setInvoiceDocumentKind('tax');
                setManualTaxInvoiceSerial(String(getNextTaxInvoiceSequence(invoices, invoiceDate)).padStart(4, '0'));
                const { from, to } = getDefaultServicePeriodRange();
                setServicePeriodFrom(from);
                setServicePeriodTo(to);
                clearCreateInvoiceDraft();
                clearCreateInvoiceFormDraft();
                setInvoiceDraft(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSaveInvoice}
              disabled={!canSave || taxInvoiceBlocksSave || savingInvoice}
              title={
                taxInvoiceBlocksSave && taxInvoiceSerialIssue
                  ? taxInvoiceSerialIssue
                  : undefined
              }
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingInvoice
                ? 'Saving…'
                : invoiceDraft?.mode === 'edit'
                  ? 'Update Invoice'
                  : 'Save Invoice'}
            </button>
          </div>
            </div>
          </div>
        </div>
      )}
      {selectedViewInvoice ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col">
            <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <h3 className="text-lg font-semibold text-gray-900">
                Tax Invoice Preview – {selectedViewInvoice.taxInvoiceNumber || '–'}
              </h3>
              <button type="button" onClick={() => setViewInvoiceId(null)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-gray-100">
              <InvoiceHtmlPreview inv={selectedViewInvoice} po={displayPO} showEInvoiceMeta={false} />
            </div>
          </div>
        </div>
      ) : null}

      <CalculatorModal
        open={!!calcTarget}
        title={calcTarget?.field === 'rate' ? 'Calculator — Unit Price' : 'Calculator — Qty'}
        initialValue={calcTarget?.initial ?? ''}
        onApply={applyFieldCalculator}
        onClose={closeFieldCalculator}
      />
    </div>
  );
};

export default CreateInvoice;
