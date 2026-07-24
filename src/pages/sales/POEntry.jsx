import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileCheck, Plus, Search, Pencil, Trash2, History, Send, CheckCircle, XCircle, ChevronLeft, ChevronRight, Paperclip, Eye, Share2, Link2, ExternalLink } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { useAuth } from '../../contexts/AuthContext';
import { COMMERCIAL_MT_APPROVER_MODULE_KEYS, userCanApproveInModules } from '../../config/roles';
import { formatDateDdMmYyyy, formatDateTimeDdMmYyyy } from "../../utils/dateDisplay";
import { isValidDateInputValue, normalizeDateInputValue } from '../../utils/dateInput';
import {
  COMMERCIAL_MODULE_MANPOWER_TRAINING,
  isCommercialModuleMarker,
} from '../../constants/commercialModuleType';
import {
  PO_BASIS_WITH_PO,
  PO_BASIS_WITHOUT_PO,
  buildWithoutPoDummyIds,
  resolveBillingPoBasis,
  isPoWithoutPoBilling,
} from '../../constants/poBasis';
import { buildCommercialClientProfiles } from '../../utils/commercialClientProfiles';
import {
  buildRenewalCyclesForNewSiteOcPo,
  collectSiteOcPoNumberHistory,
  COMMERCIAL_PO_STATUS_SUPERSEDED,
  findCommercialPoSaveConflict,
  getLatestPoForSiteOc,
} from '../../utils/commercialPoSaveValidation';
import {
  buildContactHistoryLogForSave,
  contactHistoryRowsForDisplay,
} from '../../utils/commercialContactHistory';
import ClientLegalNameAutocomplete from '../../components/commercial/ClientLegalNameAutocomplete';
import PoClientPincodeFields from '../../components/PoClientPincodeFields';
import FormDateInput from "../../components/FormDateInput";

import {
  deriveBillToShipToPinSameFromPo,
  normalizePoPincode,
  shipToPincodeForPoSave,
} from '../../utils/poPincodeFields';
import {
  getApprovalBadge,
  getCommercialPoActorDisplayName,
  PO_APPROVAL_STATUS as APPROVAL_STATUS,
} from '../../utils/commercialPoApproval';
import { presignCommercialPoR2Get, createCommercialPoShareLink } from '../../lib/commercialPoR2';
import {
  PO_ENTRY_FIELD,
  canEditPoEntryField,
  applyPoEntryFieldAclOnSave,
  filterClientSnapshotByPoEntryAcl,
  poEntryAclDepartmentLabel,
} from '../../utils/poEntryFieldPermissions';

function formatPoCurrency(value) {
  if (value === '' || value == null || Number.isNaN(Number(value))) return '–';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function resolvePoDutyPatternLabel(po) {
  const custom = String(po?.customDutyPattern || po?.custom_duty_pattern || '').trim();
  const pattern = String(po?.dutyPattern || po?.duty_pattern || '').trim();
  if (custom) return custom;
  return pattern || '–';
}

function PoViewField({ label, value, className = 'text-sm text-gray-900' }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={className}>{value != null && String(value).trim() !== '' ? value : '–'}</dd>
    </div>
  );
}

function PoViewDocumentList({ title, files }) {
  const list = Array.isArray(files) ? files.filter((f) => f?.name || f?.path) : [];
  const [busyKey, setBusyKey] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  const resolveShareUrl = async (file) => {
    if (!file?.path) throw new Error('File path missing.');
    return createCommercialPoShareLink(file.path);
  };

  const openFile = async (file, key) => {
    if (!file?.path) return;
    setBusyKey(key);
    try {
      const url = await presignCommercialPoR2Get(file.path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      window.alert(err?.message || 'Could not open file.');
    } finally {
      setBusyKey('');
    }
  };

  const copyLink = async (file, key) => {
    if (!file?.path) return;
    setBusyKey(key);
    try {
      const url = await resolveShareUrl(file);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? '' : prev)), 2000);
    } catch (err) {
      window.alert(err?.message || 'Could not copy link.');
    } finally {
      setBusyKey('');
    }
  };

  const shareLink = async (file, key) => {
    if (!file?.path) return;
    setBusyKey(key);
    try {
      const url = await resolveShareUrl(file);
      const name = file.name || 'PO document';
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: name, text: name, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopiedKey(key);
        window.setTimeout(() => setCopiedKey((prev) => (prev === key ? '' : prev)), 2000);
      } else {
        window.prompt('Copy this link:', url);
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      window.alert(err?.message || 'Could not share link.');
    } finally {
      setBusyKey('');
    }
  };

  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{title}</p>
      {list.length === 0 ? (
        <p className="text-sm text-gray-400">No files attached.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((file, i) => {
            const key = file.key || file.path || `${title}-${i}`;
            const busy = busyKey === key;
            const copied = copiedKey === key;
            return (
              <li
                key={key}
                className="min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 py-2"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-500 mt-0.5" />
                  <p className="min-w-0 flex-1 text-sm text-gray-800 break-all leading-snug" title={file.name}>
                    {file.name || 'Attachment'}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openFile(file, key)}
                    disabled={!file.path || busy}
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    title="Open file"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => copyLink(file, key)}
                    disabled={!file.path || busy}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    title="Copy short link (valid 24 hours)"
                  >
                    <Link2 className="h-3 w-3" />
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => shareLink(file, key)}
                    disabled={!file.path || busy}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    title="Share short link (valid 24 hours)"
                  >
                    <Share2 className="h-3 w-3" />
                    Share
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const VERTICALS = ['Manpower', 'Training', 'Fire Tender'];
const DUTY_PATTERN_CUSTOM = 'Custom';
const DUTY_PATTERN_OPTIONS = [
  '8 hr -30/31',
  '8 hr-26/27',
  '12 hr -30/31',
  '12 hr 26/27',
  DUTY_PATTERN_CUSTOM,
];
const RELIEVER_SCOPE_OPTIONS = [
  'In IFSPL scope',
  'In inclusive instrength',
];
const BILLING_TYPES = ['Per Day', 'Monthly', 'Lump Sum', 'Custom Calculator'];
const MANPOWER_BILLING_TYPE_FILTERS = [
  { value: 'Per Day', label: 'Daily' },
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Lump Sum', label: 'Lump Sum' },
  { value: 'Custom Calculator', label: 'Custom Calculator' },
];
const ALLOWED_MANPOWER_PO_TYPES = new Set(BILLING_TYPES);
const MT_PAYMENT_TERMS_OPTIONS = ['Immediate', '15 Days', '30 Days', '45 Days', '60 Days'];
const CUSTOM_MT_PAYMENT_TERM = 'Other (manual)';
const PAGE_SIZE = 10;

/**
 * Contract duration in years from Start Date to End Date (anniversary-based).
 * Example: 24/07/2026 → 24/07/2027 = 1 year. Partial spans are fractional.
 */
function contractDurationYears(startDate, endDate) {
  const sRaw = String(startDate || '').trim();
  const eRaw = String(endDate || '').trim();
  if (!sRaw || !eRaw) return null;
  const s = new Date(`${sRaw}T00:00:00`);
  const e = new Date(`${eRaw}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return null;

  let wholeYears = e.getFullYear() - s.getFullYear();
  const anniversary = new Date(s.getFullYear() + wholeYears, s.getMonth(), s.getDate());
  if (anniversary > e) {
    wholeYears -= 1;
  }
  const lastAnniversary = new Date(s.getFullYear() + wholeYears, s.getMonth(), s.getDate());
  const nextAnniversary = new Date(s.getFullYear() + wholeYears + 1, s.getMonth(), s.getDate());
  const yearMs = nextAnniversary.getTime() - lastAnniversary.getTime();
  if (yearMs <= 0) return null;
  const frac = (e.getTime() - lastAnniversary.getTime()) / yearMs;
  const years = wholeYears + frac;
  return years > 0 ? years : null;
}

/** Monthly Value = Total Contract Value ÷ (Contract Duration in Years × 12). */
function computeMonthlyValueFromContract(totalContractValue, startDate, endDate) {
  const years = contractDurationYears(startDate, endDate);
  if (!years || years <= 0) return '';
  const total = Number(totalContractValue);
  if (!Number.isFinite(total)) return '';
  return Math.round((total / (years * 12)) * 100) / 100;
}

function resolveDutyPatternForForm(saved, customSaved = '') {
  const custom = String(customSaved || '').trim();
  const s = String(saved || '').trim();
  if (custom) return { dutyPattern: DUTY_PATTERN_CUSTOM, customDutyPattern: custom };
  if (!s) return { dutyPattern: '', customDutyPattern: '' };
  if (s === DUTY_PATTERN_CUSTOM) return { dutyPattern: DUTY_PATTERN_CUSTOM, customDutyPattern: '' };
  if (DUTY_PATTERN_OPTIONS.includes(s)) return { dutyPattern: s, customDutyPattern: '' };
  return { dutyPattern: DUTY_PATTERN_CUSTOM, customDutyPattern: s };
}

function fileMetaFromFileList(fileList) {
  return Array.from(fileList || []).map((file) => ({
    key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    size: file.size,
    type: file.type || '',
    file,
  }));
}

function fileMetaForPersist(files) {
  return (Array.isArray(files) ? files : []).map(({ name, size, type, path, file, storage }) => ({
    name: String(name || ''),
    size: Number(size) || 0,
    type: String(type || ''),
    path: path || null,
    storage: storage || null,
    ...(file instanceof File ? { file } : {}),
  }));
}

function PoDocumentUploadField({ id, label, files, onChange }) {
  const inputRef = useRef(null);
  const list = Array.isArray(files) ? files : [];
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={id}>
        {label}
      </label>
      <div className="space-y-2">
        {list.map((file, index) => (
          <div
            key={file.key || `${file.name}-${index}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
          >
            <div className="min-w-0 flex items-center gap-2 text-sm text-gray-700">
              <Paperclip className="h-4 w-4 shrink-0 text-gray-500" />
              <span className="truncate" title={file.name}>
                {file.name}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onChange(list.filter((_, i) => i !== index))}
              className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const added = fileMetaFromFileList(e.target.files);
            if (added.length) onChange([...list, ...added]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
        >
          <Plus className="h-4 w-4" />
          Add files
        </button>
      </div>
    </div>
  );
}

function resolveMtPaymentTermsForForm(savedTerms) {
  const saved = String(savedTerms || '').trim();
  if (!saved) return { paymentTerms: '30 Days', customPaymentTerms: '' };
  if (MT_PAYMENT_TERMS_OPTIONS.includes(saved)) return { paymentTerms: saved, customPaymentTerms: '' };
  return { paymentTerms: CUSTOM_MT_PAYMENT_TERM, customPaymentTerms: saved };
}

function deriveMtPaymentTermPayload(paymentTerms, customPaymentTerms) {
  const selected = String(paymentTerms || '').trim();
  const term =
    selected === CUSTOM_MT_PAYMENT_TERM
      ? String(customPaymentTerms || '').trim()
      : selected;
  if (!term) return { paymentTerms: '', paymentTermMode: null, paymentTermDays: null };
  if (term.toLowerCase() === 'immediate') {
    return { paymentTerms: 'Immediate', paymentTermMode: 'immediate', paymentTermDays: null };
  }
  const daysMatch = /^(\d+)\s*days?$/i.exec(term);
  if (daysMatch) {
    const days = Number(daysMatch[1]);
    return {
      paymentTerms: `${days} Days`,
      paymentTermMode: 'days',
      paymentTermDays: Number.isFinite(days) ? days : null,
    };
  }
  return { paymentTerms: term, paymentTermMode: null, paymentTermDays: null };
}
const DEFAULT_SAC = '';
function poRowDomId(id) {
  return `po-row-${String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

const SUPPLEMENTARY_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

function getFinancialYear() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  return m >= 3 ? `${y.toString().slice(2)}/${(y + 1).toString().slice(2)}` : `${(y - 1).toString().slice(2)}/${y.toString().slice(2)}`;
}

function generateOCNumber(vertical, series) {
  const fy = getFinancialYear();
  const seq = String(series).padStart(5, '0');
  return `IFSPL-${vertical}-OC-${fy}-${seq}`;
}

function buildOcBase(verticalLabel, fy) {
  return `IFSPL-${verticalLabel}-OC-${fy}`;
}

function parseStructuredOcMt(ocNumber) {
  const s = String(ocNumber || '').trim();
  const m = s.match(/^IFSPL-(.+)-OC-(\d{2}\/\d{2})-(\d{5})$/i);
  if (!m) return null;
  return { segment: m[1], fy: m[2], vendorPadded: m[3] };
}

function mtVerticalFromOcSegment(seg) {
  const x = String(seg || '').trim();
  if (x === 'MANP' || x === 'BILL' || x === 'Manpower') return 'Manpower';
  if (x === 'TRNG' || x === 'Training') return 'Training';
  if (x === 'FT' || x === 'Fire Tender' || x === 'FireTender') return 'Fire Tender';
  return 'Manpower';
}

/** Department filter label — matches VERTICALS; OC may use Manpower/Training/Fire Tender or legacy MANP/BILL */
function poDepartmentLabel(p) {
  const vRaw = String(p?.vertical || '').trim();
  if (vRaw === 'MANP' || vRaw === 'BILL') return 'Manpower';
  if (vRaw === 'Manpower' || vRaw === 'Training' || vRaw === 'Fire Tender') return vRaw;
  const oc = String(p?.ocNumber || '').trim();
  if (oc.startsWith('IFSPL-')) {
    const seg = oc.split('-')[1];
    if (seg) {
      if (seg === 'MANP' || seg === 'BILL') return 'Manpower';
      if (seg === 'Manpower' || seg === 'Training' || seg === 'Fire Tender' || seg === 'FT') {
        return mtVerticalFromOcSegment(seg);
      }
    }
  }
  return vRaw;
}

function dateTimeValue(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function latestHistoryTime(po) {
  const rows = Array.isArray(po?.updateHistory) ? po.updateHistory : [];
  return rows.reduce((max, row) => Math.max(max, dateTimeValue(row?.at)), 0);
}

function poCreatedTime(po) {
  return dateTimeValue(po?.created_at || po?.createdAt || po?.created || po?.startDate);
}

function poModifiedTime(po) {
  return Math.max(
    dateTimeValue(po?.updated_at || po?.updatedAt || po?.modified_at || po?.modifiedAt),
    dateTimeValue(po?.approvalSentAt || po?.approval_sent_at),
    dateTimeValue(po?.supplementaryRequestedAt || po?.supplementary_requested_at),
    dateTimeValue(po?.supplementaryApprovedAt || po?.supplementary_approved_at),
    latestHistoryTime(po),
    poCreatedTime(po)
  );
}

function isAfterContractEnd(endDate) {
  if (!endDate) return false;
  const end = new Date(String(endDate));
  if (Number.isNaN(end.getTime())) return false;
  // consider contract ended only after end date (not on same day)
  const today = new Date();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return todayDay.getTime() > endDay.getTime();
}

function isTrainingVertical(value) {
  return String(value || '').trim().toLowerCase() === 'training';
}

function ymd(d) {
  return d && String(d).trim() ? String(d).trim() : '';
}

function normalizeContactNumber(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

const CONTACT_PERSONS_HISTORY_EVENT = '__contact_persons__';

function emptyContactPerson() {
  return { name: '', designation: '', contactNumber: '', email: '' };
}

function normalizeContactPersonRow(row = {}) {
  return {
    name: String(row.name ?? row.currentCoordinator ?? '').trim(),
    designation: String(row.designation ?? row.contactDesignation ?? '').trim(),
    contactNumber: normalizeContactNumber(row.contactNumber ?? row.number ?? ''),
    email: String(row.email ?? row.contactEmail ?? '').trim(),
  };
}

function normalizeContactPersonsList(list, fallback = {}) {
  if (Array.isArray(list) && list.length > 0) {
    const rows = list.map(normalizeContactPersonRow);
    return rows.length ? rows : [emptyContactPerson()];
  }
  const primary = normalizeContactPersonRow({
    name: fallback.currentCoordinator,
    designation: fallback.contactDesignation ?? fallback.designation,
    contactNumber: fallback.contactNumber,
    email: fallback.contactEmail ?? fallback.email,
  });
  if (primary.name || primary.designation || primary.contactNumber || primary.email) {
    return [primary];
  }
  return [emptyContactPerson()];
}

function readContactPersonsFromHistory(updateHistory) {
  const rows = Array.isArray(updateHistory) ? updateHistory : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const entry = rows[i];
    if (entry && typeof entry === 'object' && entry.event === CONTACT_PERSONS_HISTORY_EVENT) {
      if (Array.isArray(entry.contactPersons)) return entry.contactPersons;
    }
  }
  return null;
}

function withContactPersonsHistorySnapshot(updateHistory, contactPersons) {
  const cleaned = (Array.isArray(updateHistory) ? updateHistory : []).filter(
    (entry) => !(entry && typeof entry === 'object' && entry.event === CONTACT_PERSONS_HISTORY_EVENT)
  );
  cleaned.push({
    event: CONTACT_PERSONS_HISTORY_EVENT,
    at: new Date().toISOString(),
    contactPersons: normalizeContactPersonsList(contactPersons),
  });
  return cleaned;
}

function isHiddenPoHistoryEntry(entry) {
  return (
    isCommercialModuleMarker(entry) ||
    (entry && typeof entry === 'object' && entry.event === CONTACT_PERSONS_HISTORY_EVENT)
  );
}

function syncPrimaryContactFields(contactPersons) {
  const primary = normalizeContactPersonRow((contactPersons || [])[0] || emptyContactPerson());
  return {
    currentCoordinator: primary.name,
    contactDesignation: primary.designation,
    contactNumber: primary.contactNumber,
    contactEmail: primary.email,
  };
}

function makeCycle({ poWoNumber, totalContractValue, startDate, endDate, approvedAt } = {}) {
  return {
    po_wo_number: String(poWoNumber || '').trim(),
    total_contract_value: totalContractValue === '' || totalContractValue == null ? null : Number(totalContractValue) || 0,
    start_date: ymd(startDate),
    end_date: ymd(endDate),
    approved_at: approvedAt || null,
  };
}

function normalizePoApprovalStatus(po) {
  return String(po?.approvalStatus ?? po?.approval_status ?? APPROVAL_STATUS.DRAFT).toLowerCase();
}

function preservePoApprovalFieldsFromPrevious(prevPo) {
  return {
    approvalStatus: normalizePoApprovalStatus(prevPo),
    approvalSentAt: prevPo?.approvalSentAt ?? prevPo?.approval_sent_at ?? null,
    approvedByUserId: prevPo?.approvedByUserId ?? prevPo?.approved_by_user_id ?? null,
    approvedByName: prevPo?.approvedByName ?? prevPo?.approved_by_name ?? null,
    approvedAt: prevPo?.approvedAt ?? prevPo?.approved_at ?? null,
    rejectedByUserId: prevPo?.rejectedByUserId ?? prevPo?.rejected_by_user_id ?? null,
    rejectedByName: prevPo?.rejectedByName ?? prevPo?.rejected_by_name ?? null,
    rejectedAt: prevPo?.rejectedAt ?? prevPo?.rejected_at ?? null,
  };
}

function clearedPoApprovalFields() {
  return {
    approvalStatus: APPROVAL_STATUS.DRAFT,
    approvalSentAt: null,
    approvedByUserId: null,
    approvedByName: null,
    approvedAt: null,
    rejectedByUserId: null,
    rejectedByName: null,
    rejectedAt: null,
  };
}

function normalizeRatesForMaterialCompare(rates) {
  return (rates || []).map((r) => ({
    description: String(r.description || '').trim().toLowerCase(),
    hsnSac: String(r.hsnSac ?? r.hsn_sac ?? '').trim(),
    materialCode: String(r.materialCode ?? r.material_code ?? '').trim(),
    qty: Number(r.qty) || 0,
    rate: Number(r.rate) || 0,
    penalty: Number(r.penalty) || 0,
  }));
}

function readPoField(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function hasMaterialManpowerPoChanges(prevPo, nextSnapshot, { addingRenewalCycle = false } = {}) {
  if (!prevPo || !nextSnapshot) return true;
  if (addingRenewalCycle) return true;
  const comparableFields = [
    ['poWoNumber', 'po_wo_number'],
    ['totalContractValue', 'total_contract_value'],
    ['startDate', 'start_date'],
    ['endDate', 'end_date'],
    ['billingType', 'billing_type', 'poType', 'po_type'],
    ['legalName', 'legal_name'],
    ['gstin'],
    ['ocNumber', 'oc_number'],
    ['serviceDescription', 'service_description'],
    ['paymentTerms', 'payment_terms'],
    ['vertical'],
    ['sacCode', 'sac_code'],
    ['hsnCode', 'hsn_code'],
    ['poDate', 'po_date'],
    ['billingWithoutPo', 'billing_without_po'],
  ];
  for (const keys of comparableFields) {
    if (readPoField(prevPo, keys) !== readPoField(nextSnapshot, keys)) return true;
  }
  const prevRates = JSON.stringify(normalizeRatesForMaterialCompare(prevPo.ratePerCategory));
  const nextRates = JSON.stringify(normalizeRatesForMaterialCompare(nextSnapshot.ratePerCategory));
  return prevRates !== nextRates;
}

function resolvePoApprovalFieldsForSave({ editId, prevPo, nextSnapshot, addingRenewalCycle = false }) {
  if (!editId || !prevPo) {
    return {
      approvalStatus: prevPo?.approvalStatus ?? prevPo?.approval_status ?? APPROVAL_STATUS.DRAFT,
      approvalSentAt: prevPo?.approvalSentAt ?? prevPo?.approval_sent_at ?? null,
    };
  }
  const priorStatus = normalizePoApprovalStatus(prevPo);
  const inWorkflow = [
    APPROVAL_STATUS.SENT,
    APPROVAL_STATUS.APPROVED,
    APPROVAL_STATUS.REJECTED,
  ].includes(priorStatus);
  if (!inWorkflow) return clearedPoApprovalFields();
  if (hasMaterialManpowerPoChanges(prevPo, nextSnapshot, { addingRenewalCycle })) {
    return clearedPoApprovalFields();
  }
  return preservePoApprovalFieldsFromPrevious(prevPo);
}

function getLatestCycle(cycles, fallback) {
  const arr = Array.isArray(cycles) ? cycles.filter(Boolean) : [];
  if (arr.length) return arr[arr.length - 1];
  return fallback;
}

function validateGSTIN(value) {
  if (!value || value.length !== 15) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(value.toUpperCase());
}

/** GSTIN chars 3–12 (1-based) embed the 10-character PAN, e.g. 27ABCDE1234F2Z5 → ABCDE1234F */
function extractPanFromGstin(gstin) {
  const g = String(gstin || '').trim().toUpperCase();
  if (g.length < 12) return '';
  return g.slice(2, 12);
}

function extractStateGuess(placeOfSupply, billingAddress) {
  const raw = String(placeOfSupply || '').trim() || String(billingAddress || '').trim();
  if (!raw) return '';
  // naive: take last comma-separated token as state-ish
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
}

function isGujaratSupply(placeOfSupply, billingAddress) {
  const s = extractStateGuess(placeOfSupply, billingAddress);
  if (!s) return true; // don't block when state is unknown
  return s.includes('gujarat') || s === 'gj';
}

function validateGstSupplyTypeForState(placeOfSupply, billingAddress, gstSupplyType) {
  const st = String(gstSupplyType || 'intra').trim().toLowerCase();
  const stateGuess = extractStateGuess(placeOfSupply, billingAddress);
  if (!stateGuess) return 'Select Place of supply before choosing GST type.';
  const isGuj = stateGuess.includes('gujarat') || stateGuess === 'gj';

  // SEZ 0% is allowed regardless of state.
  if (st === 'sez_zero') return '';

  // Gujarat => intra only. Outside Gujarat => inter only.
  if (isGuj && st === 'inter') {
    return 'Place of supply is Gujarat. Select CGST+SGST (same state) instead of IGST.';
  }
  if (!isGuj && st === 'intra') {
    return 'Client supply state is outside Gujarat. Select IGST (other state) or 0% GST (SEZ) instead of CGST+SGST.';
  }
  return '';
}

const INDIA_STATES_UT = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

const GST_SUPPLY_TYPES = [
  { value: 'intra', label: 'CGST + SGST (same state)' },
  { value: 'inter', label: 'IGST (other state)' },
  { value: 'sez_zero', label: '0% GST (SEZ / nil rated)' },
];

function PlaceOfSupplySearchSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const filteredOptions = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return options;
    return options.filter((option) => option.toLowerCase().includes(clean));
  }, [options, query]);

  useEffect(() => {
    const onMouseDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const selectedLabel = value || '';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left"
      >
        <span className={selectedLabel ? 'text-gray-900' : 'text-gray-400'}>
          {selectedLabel || 'Select state/UT…'}
        </span>
        <span className="text-xs text-gray-400">v</span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="relative border-b border-gray-100">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              placeholder="Search state/UT..."
              className="w-full px-9 py-2 text-sm outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                    option === value ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700'
                  }`}
                >
                  {option}
                </button>
              ))
            ) : (
              <p className="px-3 py-3 text-sm text-gray-500">No state/UT found.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeLumpSumBillingModeForForm(raw) {
  const m = String(raw || 'normal').trim().toLowerCase();
  if (m === 'fire_tender' || m === 'truck_cumulated') return 'truck';
  if (m === 'penalty' || m === 'truck' || m === 'months_geometry' || m === 'normal') return m;
  return 'normal';
}

function isTruckCumulateMode(raw) {
  return String(raw || '').trim().toLowerCase() === 'truck_cumulated';
}

const initialForm = {
  siteId: '', locationName: '', legalName: '', billingAddress: '', shippingAddress: '', placeOfSupply: '', gstin: '', panNumber: '',
  currentCoordinator: '', contactDesignation: '', contactNumber: '', contactEmail: '',
  contactPersons: [emptyContactPerson()],
  ocNumber: '', vertical: 'Manpower', ocSeries: '1',
  vendorCodeDigits: '',
  ocFyEdit: null,
  vendorCode: '',
  poWoNumber: '', poDate: '', pincode: '', shipToPincode: '', billToShipToPinSame: true,
  materialCodeRequired: false, paymentTerms: '30 Days', customPaymentTerms: '',
  ratePerCategory: [{ description: '', hsnSac: '', materialCode: '', qty: '', rate: '', penalty: '' }],
  totalContractValue: '', sacCode: DEFAULT_SAC, hsnCode: '', serviceDescription: '',
  renewalCycles: [],
  newCyclePoWoNumber: '', newCycleTotalContractValue: '',
  totalContractMonth: '',
  startDate: '', endDate: '', billingType: 'Per Day', remarks: '',
  dutyPattern: '',
  customDutyPattern: '',
  relieverScope: '',
  monthlyValue: '',
  monthlyValueManual: false,
  withFireTender: false,
  poCopyFiles: [],
  scopeOfWorkFiles: [],
  penaltyClauseFiles: [],
  monthlyDutyQtyMode: '',
  lumpSumBillingMode: '',
  lumpSumTruckCumulateFinalInvoiceLines: false,
  invoiceTermsText: '',
  sellerCin: '', sellerPan: '', msmeRegistrationNo: '', msmeClause: '',
  gstSupplyType: 'intra',
  revisedPO: false, renewalPending: false,
  poBasis: PO_BASIS_WITH_PO,
};

const POEntry = () => {
  const location = useLocation();
  const { commercialPOs, setCommercialPOs, setInvoices } = useBilling();
  const { user, userProfile, accessibleModules } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [listPoBasisFilter, setListPoBasisFilter] = useState('');
  const [manpowerBillingTypeFilter, setManpowerBillingTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [viewHistoryPoId, setViewHistoryPoId] = useState(null);
  const [viewPoId, setViewPoId] = useState(null);
  const [gstinError, setGstinError] = useState('');
  const [contactError, setContactError] = useState('');
  const [gstTypeError, setGstTypeError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'modified', direction: 'desc' });

  const fyForOc = formData.ocFyEdit || getFinancialYear();

  const canApproveCommercialPOs = userCanApproveInModules(
    userProfile,
    accessibleModules,
    COMMERCIAL_MT_APPROVER_MODULE_KEYS
  );
  const currentActorName = getCommercialPoActorDisplayName(userProfile, user);
  const poFieldAclLabel = poEntryAclDepartmentLabel(userProfile);
  const canPoField = (field) => canEditPoEntryField(userProfile, field);
  const canBillingBasic = canPoField(PO_ENTRY_FIELD.BILLING_BASIC);
  const canPoDate = canPoField(PO_ENTRY_FIELD.PO_DATE);
  const canLegalName = canPoField(PO_ENTRY_FIELD.LEGAL_NAME);
  const canBillingAddress = canPoField(PO_ENTRY_FIELD.BILLING_ADDRESS);
  const canPincodeBillTo = canPoField(PO_ENTRY_FIELD.PINCODE_BILL_TO);
  const canShippingAddress = canPoField(PO_ENTRY_FIELD.SHIPPING_ADDRESS);
  const canPincodeShipTo = canPoField(PO_ENTRY_FIELD.PINCODE_SHIP_TO);
  const canGstin = canPoField(PO_ENTRY_FIELD.GSTIN);
  const canPanNumber = canPoField(PO_ENTRY_FIELD.PAN_NUMBER);
  const canLocationName = canPoField(PO_ENTRY_FIELD.LOCATION_NAME);
  const canPlaceOfSupply = canPoField(PO_ENTRY_FIELD.PLACE_OF_SUPPLY);
  const canContactPoc = canPoField(PO_ENTRY_FIELD.CONTACT_POC);
  const canOcNumber = canPoField(PO_ENTRY_FIELD.OC_NUMBER);
  const canPoFinancials = canPoField(PO_ENTRY_FIELD.PO_FINANCIALS);
  const canTaxService = canPoField(PO_ENTRY_FIELD.TAX_SERVICE);
  const canTaxInvoicePrint = canPoField(PO_ENTRY_FIELD.TAX_INVOICE_PRINT);
  const canStartDate = canPoField(PO_ENTRY_FIELD.START_DATE);
  const canEndDate = canPoField(PO_ENTRY_FIELD.END_DATE);
  const canBillingType = canPoField(PO_ENTRY_FIELD.BILLING_TYPE);
  const canPaymentTerms = canPoField(PO_ENTRY_FIELD.PAYMENT_TERMS);
  const canRemarks = canPoField(PO_ENTRY_FIELD.REMARKS);
  const canDutyPattern = canPoField(PO_ENTRY_FIELD.DUTY_PATTERN);
  const canRelieverScope = canPoField(PO_ENTRY_FIELD.RELIEVER_SCOPE);
  const canPoCopy = canPoField(PO_ENTRY_FIELD.PO_COPY);
  const canScopeOfWork = canPoField(PO_ENTRY_FIELD.SCOPE_OF_WORK);
  const canPenaltyClause = canPoField(PO_ENTRY_FIELD.PENALTY_CLAUSE);
  const canMaterialCodeRequired = canPoField(PO_ENTRY_FIELD.MATERIAL_CODE_REQUIRED);
  const canWithFireTender = canPoField(PO_ENTRY_FIELD.WITH_FIRE_TENDER);
  const canRevisedPoFlags = canPoField(PO_ENTRY_FIELD.REVISED_PO_FLAGS);
  const showClientIdentitySection =
    canLegalName ||
    canBillingAddress ||
    canPincodeBillTo ||
    canShippingAddress ||
    canPincodeShipTo ||
    canGstin ||
    canPanNumber ||
    canLocationName ||
    canPlaceOfSupply;
  const showPoFinancialsSection = canOcNumber || canPoFinancials;
  const showTimelinesSection =
    canStartDate ||
    canEndDate ||
    canBillingType ||
    canDutyPattern ||
    canRelieverScope ||
    canPaymentTerms ||
    canRemarks ||
    canWithFireTender ||
    canMaterialCodeRequired ||
    canRevisedPoFlags;
  const showDocumentsSection = canPoCopy || canScopeOfWork || canPenaltyClause;
  const showBillingBasisStrip = canBillingBasic || canPoDate;
  const highlightedPoId = useMemo(
    () => new URLSearchParams(location.search).get('highlightPoId') || '',
    [location.search]
  );

  const clientProfilesFromPOs = useMemo(
    () =>
      buildCommercialClientProfiles(commercialPOs, COMMERCIAL_MODULE_MANPOWER_TRAINING, 'manpower', {
        excludePoId: editId,
      }),
    [commercialPOs, editId]
  );

  const latestPriorPoForForm = useMemo(() => {
    if (editId) return null;
    return getLatestPoForSiteOc(commercialPOs, formData.siteId, formData.ocNumber);
  }, [commercialPOs, editId, formData.siteId, formData.ocNumber]);

  const siteOcPoNumberHistory = useMemo(
    () =>
      collectSiteOcPoNumberHistory(commercialPOs, formData.siteId, formData.ocNumber, {
        excludePoId: editId,
      }),
    [commercialPOs, editId, formData.siteId, formData.ocNumber]
  );

  const showSiteOcPoHistory = !editId && siteOcPoNumberHistory.length > 0;
  const showPriorPoNumberField = Boolean(editId || latestPriorPoForForm);

  useEffect(() => {
    if (!showForm || editId || !latestPriorPoForForm || !canPoFinancials) return;
    const oldNum = String(latestPriorPoForForm.poWoNumber || latestPriorPoForForm.po_wo_number || '').trim();
    if (!oldNum) return;
    setFormData((prev) => (prev.poWoNumber === oldNum ? prev : { ...prev, poWoNumber: oldNum }));
  }, [showForm, editId, latestPriorPoForForm, canPoFinancials]);

  const handleApplyClientSnapshot = (snapshot) => {
    const allowedSnapshot = filterClientSnapshotByPoEntryAcl(snapshot, userProfile);
    setFormData((prev) => {
      const next = { ...prev, ...allowedSnapshot };
      const contactPersons = canEditPoEntryField(userProfile, PO_ENTRY_FIELD.CONTACT_POC)
        ? normalizeContactPersonsList(allowedSnapshot.contactPersons, {
            currentCoordinator: allowedSnapshot.currentCoordinator ?? next.currentCoordinator,
            contactNumber: allowedSnapshot.contactNumber ?? next.contactNumber,
            contactEmail: allowedSnapshot.contactEmail ?? next.contactEmail,
            contactDesignation: allowedSnapshot.contactDesignation ?? next.contactDesignation,
          })
        : normalizeContactPersonsList(prev.contactPersons, prev);
      return {
        ...next,
        contactPersons,
        ...syncPrimaryContactFields(contactPersons),
      };
    });
    setGstinError('');
    setContactError('');
    if (allowedSnapshot.gstin && !validateGSTIN(allowedSnapshot.gstin)) {
      setGstinError('GSTIN must be 15-digit alphanumeric (e.g. 27AABCU9603R1ZM)');
    }
    if (allowedSnapshot.contactNumber && normalizeContactNumber(allowedSnapshot.contactNumber).length !== 10) {
      setContactError('Contact Number must be exactly 10 digits.');
    }
    if (
      canEditPoEntryField(userProfile, PO_ENTRY_FIELD.TAX_SERVICE) ||
      canEditPoEntryField(userProfile, PO_ENTRY_FIELD.PLACE_OF_SUPPLY) ||
      canEditPoEntryField(userProfile, PO_ENTRY_FIELD.BILLING_ADDRESS)
    ) {
      const msg = validateGstSupplyTypeForState(
        allowedSnapshot.placeOfSupply ?? formData.placeOfSupply,
        allowedSnapshot.billingAddress ?? formData.billingAddress,
        allowedSnapshot.gstSupplyType ?? formData.gstSupplyType
      );
      setGstTypeError(msg);
    }
  };

  const requestSupplementaryBill = (po) => {
    if (!po) return;
    if (!isAfterContractEnd(po.endDate || po.end_date)) {
      window.alert('Post-contract billing can be requested only after the contract end date.');
      return;
    }
    const reason = window.prompt('Reason for post-contract billing (optional):', po.supplementaryReason || '') ?? '';
    const nowIso = new Date().toISOString();
    setCommercialPOs((prev) =>
      prev.map((p) =>
        p.id === po.id
          ? {
              ...p,
              supplementaryRequestStatus: SUPPLEMENTARY_STATUS.PENDING,
              supplementaryReason: String(reason || '').trim() || null,
              supplementaryRequestedAt: nowIso,
              updateHistory: Array.isArray(p.updateHistory)
                ? [...p.updateHistory, { at: nowIso, summary: 'Post-contract billing requested' }]
                : [{ at: nowIso, summary: 'Post-contract billing requested' }],
            }
          : p
      )
    );
  };

  const approveSupplementaryBill = (po) => {
    if (!canApproveCommercialPOs || !po) return;
    const nowIso = new Date().toISOString();
    setCommercialPOs((prev) =>
      prev.map((p) =>
        p.id === po.id
          ? {
              ...p,
              supplementaryRequestStatus: SUPPLEMENTARY_STATUS.APPROVED,
              supplementaryApprovedAt: nowIso,
              updateHistory: Array.isArray(p.updateHistory)
                ? [...p.updateHistory, { at: nowIso, summary: 'Post-contract billing approved — bill on this OC using Create Invoice' }]
                : [{ at: nowIso, summary: 'Post-contract billing approved — bill on this OC using Create Invoice' }],
            }
          : p
      )
    );
  };

  const rejectSupplementaryBill = (po) => {
    if (!canApproveCommercialPOs || !po) return;
    const nowIso = new Date().toISOString();
    setCommercialPOs((prev) =>
      prev.map((p) =>
        p.id === po.id
          ? {
              ...p,
              supplementaryRequestStatus: SUPPLEMENTARY_STATUS.REJECTED,
              supplementaryApprovedAt: null,
              updateHistory: Array.isArray(p.updateHistory)
                ? [...p.updateHistory, { at: nowIso, summary: 'Post-contract billing request rejected' }]
                : [{ at: nowIso, summary: 'Post-contract billing request rejected' }],
            }
          : p
      )
    );
  };

  const TextCell = ({ value, className = '' }) => {
    const display = value ?? '';
    return (
      <span className={`block min-w-0 truncate ${className}`} title={typeof display === 'string' ? display : String(display)}>
        {display || '–'}
      </span>
    );
  };

  const MultilineBadgeText = ({ text }) => {
    const t = String(text || '');
    const parts =
      t.includes('Approved by ') ? ['Approved by', t.replace('Approved by ', '')]
      : t.includes('Rejected by ') ? ['Rejected by', t.replace('Rejected by ', '')]
      : t.includes('Pending Commercial Manager approval') ? ['Pending', 'Commercial Manager approval']
      : [t];

    return (
      <span className="block text-center leading-tight whitespace-normal">
        {parts.map((p, i) => (
          <span key={`${p}-${i}`} className="block">
            {p}
          </span>
        ))}
      </span>
    );
  };

  const cleanCellText = (value) => String(value ?? '').replaceAll('|', '').trim();
  const renderSortIndicator = (key) => {
    const active = sortConfig.key === key;
    const ascActive = active && sortConfig.direction === 'asc';
    const descActive = active && sortConfig.direction === 'desc';
    return (
      <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] align-middle">
        <span className={ascActive ? 'text-emerald-400' : 'text-slate-300'}>▲</span>
        <span className={descActive ? 'text-rose-400' : 'text-slate-300'}>▼</span>
      </span>
    );
  };
  const toggleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  const filteredList = useMemo(() => {
    // Hide supplementary/mock POs from PO Entry UI — only manage the parent PO here.
    const base = commercialPOs.filter((p) => !p.isSupplementary);
    let list = base;
    if (departmentFilter) {
      list = list.filter((p) => poDepartmentLabel(p) === departmentFilter);
    }
    if (departmentFilter === 'Manpower' && manpowerBillingTypeFilter) {
      list = list.filter((p) => String(p.billingType || p.poType || '').trim() === manpowerBillingTypeFilter);
    }
    if (listPoBasisFilter === 'with_po') {
      list = list.filter((p) => resolveBillingPoBasis(p) === PO_BASIS_WITH_PO);
    } else if (listPoBasisFilter === 'without_po') {
      list = list.filter((p) => resolveBillingPoBasis(p) === PO_BASIS_WITHOUT_PO);
    }
    if (!searchTerm.trim()) return list;
    const s = searchTerm.toLowerCase();
    return list.filter(
      (p) =>
        p.ocNumber?.toLowerCase().includes(s) ||
        p.poWoNumber?.toLowerCase().includes(s) ||
        p.legalName?.toLowerCase().includes(s) ||
        p.siteId?.toLowerCase().includes(s)
    );
  }, [commercialPOs, searchTerm, departmentFilter, manpowerBillingTypeFilter, listPoBasisFilter]);

  const sortedFilteredList = useMemo(() => {
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    return [...filteredList].sort((a, b) => {
      const getValue = (po) => {
        switch (sortConfig.key) {
          case 'ocNumber': return String(po.ocNumber || '').toLowerCase();
          case 'siteLocation': return String([po.siteId, po.locationName].filter(Boolean).join(' ') || '').toLowerCase();
          case 'client': return String(po.legalName || '').toLowerCase();
          case 'poWo': return String(po.poWoNumber || '').toLowerCase();
          case 'startEnd': return new Date(po.startDate || po.endDate || 0).getTime() || 0;
          case 'status': return String(po.approvalStatus || '').toLowerCase();
          case 'created': return poCreatedTime(po);
          case 'modified':
          default: return poModifiedTime(po);
        }
      };
      const av = getValue(a);
      const bv = getValue(b);
      let result = 0;
      if (typeof av === 'number' && typeof bv === 'number') result = av - bv;
      else result = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      if (result === 0) result = String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true });
      return result * dir;
    });
  }, [filteredList, sortConfig]);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [searchTerm, departmentFilter, manpowerBillingTypeFilter, listPoBasisFilter, sortConfig]);
  useEffect(() => {
    if (departmentFilter !== 'Manpower') setManpowerBillingTypeFilter('');
  }, [departmentFilter]);
  const totalPages = Math.max(1, Math.ceil(sortedFilteredList.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginatedList = sortedFilteredList.slice(start, start + PAGE_SIZE);
  const goToPage = (p) => setPage(Math.min(Math.max(1, p), totalPages));

  useEffect(() => {
    if (!highlightedPoId) return;
    if (!commercialPOs.some((po) => String(po.id) === String(highlightedPoId))) return;
    setSearchTerm('');
    setDepartmentFilter('');
    setManpowerBillingTypeFilter('');
    setListPoBasisFilter('');
    setSortConfig({ key: 'modified', direction: 'desc' });
  }, [commercialPOs, highlightedPoId]);

  useEffect(() => {
    if (!highlightedPoId || !sortedFilteredList.length) return;
    const idx = sortedFilteredList.findIndex((po) => String(po.id) === String(highlightedPoId));
    if (idx < 0) return;
    setPage(Math.floor(idx / PAGE_SIZE) + 1);
    window.setTimeout(() => {
      document.getElementById(poRowDomId(highlightedPoId))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
  }, [highlightedPoId, sortedFilteredList]);

  const nextId = useMemo(() => Math.max(0, ...commercialPOs.map((p) => p.id), 0) + 1, [commercialPOs]);
  const nextSeries = useMemo(() => {
    const fy = getFinancialYear();
    const sameFy = commercialPOs.filter((p) => p.ocNumber && p.ocNumber.includes(fy));
    const nums = sameFy.map((p) => parseInt(p.ocNumber?.split('-').pop() || '0', 10));
    return (Math.max(0, ...nums) + 1).toString().padStart(5, '0');
  }, [commercialPOs]);

  const handleOpenAdd = () => {
    const nextVertical = departmentFilter || 'Manpower';
    const useWithout = listPoBasisFilter === 'without_po';
    const dummies = useWithout
      ? buildWithoutPoDummyIds({ verticalLabel: nextVertical, ocSeries: nextSeries })
      : { ocNumber: '', poWoNumber: '' };
    setEditId(null);
    setFormData({
      ...initialForm,
      vertical: nextVertical,
      ocSeries: nextSeries,
      ocFyEdit: null,
      vendorCodeDigits: '',
      ocNumber: useWithout ? dummies.ocNumber : '',
      poWoNumber: dummies.poWoNumber,
      poBasis: useWithout ? PO_BASIS_WITHOUT_PO : PO_BASIS_WITH_PO,
    });
    setGstinError('');
    setContactError('');
    setGstTypeError('');
    setSaveError('');
    setShowForm(true);
  };

  const handleOpenEdit = (po) => {
    setEditId(po.id);
    const cycles = Array.isArray(po.renewalCycles) ? po.renewalCycles : [];
    const rawLumpSumBillingMode = po.lumpSumBillingMode || po.lump_sum_billing_mode || 'normal';
    const parsed = parseStructuredOcMt(po.ocNumber);
    const fyLive = getFinancialYear();
    let vendorDigits = '';
    let ocFyEdit = fyLive;
    let verticalResolved =
      po.vertical === 'MANP' || po.vertical === 'BILL'
        ? 'Manpower'
        : po.vertical || (po.ocNumber && po.ocNumber.split('-')[1]) || 'Manpower';
    if (parsed) {
      vendorDigits = parsed.vendorPadded;
      ocFyEdit = parsed.fy;
      verticalResolved = mtVerticalFromOcSegment(parsed.segment);
    } else {
      vendorDigits =
        String(po.vendorCode ?? po.vendor_code ?? po.ocSeries ?? '').trim() ||
        String((po.ocNumber || '').split('-').pop() || '').trim() ||
        '';
    }
    setFormData({
      siteId: po.siteId || '', locationName: po.locationName || '', legalName: po.legalName || '',
      billingAddress: po.billingAddress || '', shippingAddress: po.shippingAddress || '', placeOfSupply: po.placeOfSupply || '',
      gstin: po.gstin || '', panNumber: po.panNumber || '',
      ...(() => {
        const contactPersons = normalizeContactPersonsList(
          po.contactPersons || readContactPersonsFromHistory(po.updateHistory),
          {
            currentCoordinator: po.currentCoordinator || '',
            contactNumber: po.contactNumber || '',
            contactEmail: po.contactEmail || '',
            contactDesignation: po.contactDesignation || '',
          }
        );
        return {
          contactPersons,
          ...syncPrimaryContactFields(contactPersons),
        };
      })(),
      ocNumber: po.ocNumber || '',
      vertical: verticalResolved,
      ocSeries: vendorDigits || (po.ocNumber && po.ocNumber.split('-').pop()) || '1',
      vendorCodeDigits: vendorDigits,
      ocFyEdit,
      poWoNumber: po.poWoNumber || '',
      renewalCycles: cycles,
      newCyclePoWoNumber: '',
      newCycleTotalContractValue: '',
      totalContractMonth: po.totalContractMonth ?? po.total_contract_month ?? '',
      vendorCode: po.vendorCode || po.vendor_code || '',
      ratePerCategory: Array.isArray(po.ratePerCategory) && po.ratePerCategory.length
        ? po.ratePerCategory.map((r) => ({
            description: r.description || r.designation || '',
            hsnSac: r.hsnSac ?? r.hsn_sac ?? r.sacHsn ?? r.sac_hsn ?? '',
            materialCode: r.materialCode ?? r.material_code ?? '',
            qty: r.qty ?? r.quantity ?? r.poQty ?? r.po_qty ?? '',
            rate: r.rate ?? '',
            penalty: r.penalty ?? r.category_penalty ?? '',
          }))
        : [{ description: '', hsnSac: '', materialCode: '', qty: '', rate: '', penalty: '' }],
      totalContractValue: po.totalContractValue ?? '', sacCode: po.sacCode || DEFAULT_SAC, hsnCode: po.hsnCode || '',
      serviceDescription: po.serviceDescription || '', startDate: po.startDate || '', endDate: po.endDate || '',
      billingType: po.billingType || po.poType || 'Monthly',
      remarks: po.remarks || '',
      ...resolveMtPaymentTermsForForm(po.paymentTerms || ''),
      poDate: po.poDate || '',
      pincode: normalizePoPincode(po.pincode),
      shipToPincode: normalizePoPincode(po.shipToPincode ?? po.ship_to_pincode),
      billToShipToPinSame: deriveBillToShipToPinSameFromPo(po),
      materialCodeRequired: !!po.materialCodeRequired,
      ...(() => {
        const duty = resolveDutyPatternForForm(
          po.dutyPattern || po.duty_pattern || '',
          po.customDutyPattern || po.custom_duty_pattern || ''
        );
        const startDate = po.startDate || '';
        const endDate = po.endDate || '';
        const totalContractValue = po.totalContractValue ?? '';
        const savedMonthly =
          po.monthlyValue ?? po.monthly_value ?? null;
        const calc = computeMonthlyValueFromContract(totalContractValue, startDate, endDate);
        const hasSavedMonthly = savedMonthly !== '' && savedMonthly != null;
        return {
          ...duty,
          relieverScope: po.relieverScope || po.reliever_scope || '',
          monthlyValue: hasSavedMonthly ? String(savedMonthly) : (calc === '' ? '' : String(calc)),
          monthlyValueManual: hasSavedMonthly,
        };
      })(),
      withFireTender: !!(po.withFireTender ?? po.with_fire_tender),
      poCopyFiles: Array.isArray(po.poCopyFiles || po.po_copy_files)
        ? (po.poCopyFiles || po.po_copy_files).map((f, i) => ({
            key: f.key || f.path || `po-copy-${i}-${f.name || ''}`,
            name: f.name || '',
            size: f.size || 0,
            type: f.type || '',
            path: f.path || null,
            storage: f.storage || null,
          }))
        : [],
      scopeOfWorkFiles: Array.isArray(po.scopeOfWorkFiles || po.scope_of_work_files)
        ? (po.scopeOfWorkFiles || po.scope_of_work_files).map((f, i) => ({
            key: f.key || f.path || `sow-${i}-${f.name || ''}`,
            name: f.name || '',
            size: f.size || 0,
            type: f.type || '',
            path: f.path || null,
            storage: f.storage || null,
          }))
        : [],
      penaltyClauseFiles: Array.isArray(po.penaltyClauseFiles || po.penalty_clause_files)
        ? (po.penaltyClauseFiles || po.penalty_clause_files).map((f, i) => ({
            key: f.key || f.path || `penalty-${i}-${f.name || ''}`,
            name: f.name || '',
            size: f.size || 0,
            type: f.type || '',
            path: f.path || null,
            storage: f.storage || null,
          }))
        : [],
      monthlyDutyQtyMode:
        (po.billingType || po.poType) === 'Monthly'
          ? (po.monthlyDutyQtyMode || po.monthly_duty_qty_mode || 'po_geometry')
          : '',
      lumpSumBillingMode:
        (po.billingType || po.poType) === 'Lump Sum'
          ? normalizeLumpSumBillingModeForForm(rawLumpSumBillingMode)
          : '',
      lumpSumTruckCumulateFinalInvoiceLines:
        (po.billingType || po.poType) === 'Lump Sum' && isTruckCumulateMode(rawLumpSumBillingMode),
      invoiceTermsText: po.invoiceTermsText || '',
      sellerCin: po.sellerCin || '',
      sellerPan: po.sellerPan || '',
      msmeRegistrationNo: po.msmeRegistrationNo || '',
      msmeClause: po.msmeClause || '',
      gstSupplyType: po.gstSupplyType || 'intra',
      revisedPO: !!po.revisedPO, renewalPending: !!po.renewalPending,
      approvalStatus: po.approvalStatus || APPROVAL_STATUS.DRAFT,
      poBasis: resolveBillingPoBasis(po) === PO_BASIS_WITHOUT_PO ? PO_BASIS_WITHOUT_PO : PO_BASIS_WITH_PO,
    });
    setGstinError('');
    setContactError('');
    setGstTypeError('');
    setSaveError('');
    setShowForm(true);
  };

  const handleGstinBlur = () => {
    if (formData.gstin && !validateGSTIN(formData.gstin)) setGstinError('GSTIN must be 15-digit alphanumeric (e.g. 27AABCU9603R1ZM)');
    else setGstinError('');
  };

  const addRateRow = () =>
    setFormData((prev) => ({
      ...prev,
      ratePerCategory: [...prev.ratePerCategory, { description: '', hsnSac: '', materialCode: '', qty: '', rate: '', penalty: '' }],
    }));
  const updateRateRow = (idx, field, value) =>
    setFormData((prev) => ({ ...prev, ratePerCategory: prev.ratePerCategory.map((r, i) => (i === idx ? { ...r, [field]: value } : r)) }));
  const removeRateRow = (idx) => {
    if (formData.ratePerCategory.length <= 1) return;
    setFormData((prev) => ({ ...prev, ratePerCategory: prev.ratePerCategory.filter((_, i) => i !== idx) }));
  };
  const handleDateInputChange = (field, value) => {
    if (!isValidDateInputValue(value)) return;
    setFormData((prev) => {
      const next = {
        ...prev,
        [field]: normalizeDateInputValue(value),
        monthlyValueManual: false,
      };
      const total = editId ? next.newCycleTotalContractValue : next.totalContractValue;
      const calc = computeMonthlyValueFromContract(total, next.startDate, next.endDate);
      return { ...next, monthlyValue: calc === '' ? '' : String(calc) };
    });
  };

  const handleContractValueChange = (value) => {
    setFormData((prev) => {
      const next = editId
        ? { ...prev, newCycleTotalContractValue: value, monthlyValueManual: false }
        : { ...prev, totalContractValue: value, monthlyValueManual: false };
      const total = editId ? next.newCycleTotalContractValue : next.totalContractValue;
      const calc = computeMonthlyValueFromContract(total, next.startDate, next.endDate);
      return { ...next, monthlyValue: calc === '' ? '' : String(calc) };
    });
  };

  const sendToApproval = (id) => {
    const nowIso = new Date().toISOString();
    setCommercialPOs((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              approvalStatus: APPROVAL_STATUS.SENT,
              approvalSentAt: nowIso,
              updateHistory: [
                ...(Array.isArray(p.updateHistory) ? p.updateHistory : []),
                {
                  at: nowIso,
                  event: 'po_sent_for_approval',
                  summary: 'PO sent for approval',
                  actorUserId: user?.id || null,
                  actorName: currentActorName,
                },
              ],
            }
          : p
      )
    );
  };

  const approvePO = (id) => {
    if (!canApproveCommercialPOs) return;
    const nowIso = new Date().toISOString();
    const prev = commercialPOs;
    const target = prev.find((p) => p.id === id);
    if (!target) return;

    const next = prev.map((p) => {
      if (p.id !== id) return p;
      const cycles = Array.isArray(p.renewalCycles) ? [...p.renewalCycles] : [];
      const latestIdx = cycles.length ? cycles.length - 1 : -1;
      const latest = latestIdx >= 0 ? { ...cycles[latestIdx] } : null;
      if (latest && !latest.approved_at) {
        latest.approved_at = nowIso;
        cycles[latestIdx] = latest;
      }
      const hasActiveRenewal = latest && latest.po_wo_number && latest.total_contract_value != null;
      return {
        ...p,
        approvalStatus: APPROVAL_STATUS.APPROVED,
        approvedByUserId: user?.id || null,
        approvedByName: currentActorName,
        approvedAt: nowIso,
        ...(cycles.length ? { renewalCycles: cycles } : {}),
        ...(hasActiveRenewal
          ? {
              poWoNumber: latest.po_wo_number,
              totalContractValue: Number(latest.total_contract_value) || 0,
              startDate: latest.start_date || p.startDate,
              endDate: latest.end_date || p.endDate,
              supplementaryRequestStatus: null,
              supplementaryReason: null,
              supplementaryRequestedAt: null,
              supplementaryApprovedAt: null,
            }
          : {}),
        updateHistory: Array.isArray(p.updateHistory)
          ? [
              ...p.updateHistory,
              {
                at: nowIso,
                event: 'po_approved',
                summary: hasActiveRenewal ? `PO renewed and approved (${latest.po_wo_number})` : `PO approved by ${currentActorName}`,
                actorUserId: user?.id || null,
                actorName: currentActorName,
              },
            ]
          : [
              {
                at: nowIso,
                event: 'po_approved',
                summary: hasActiveRenewal ? `PO renewed and approved (${latest?.po_wo_number || ''})` : `PO approved by ${currentActorName}`,
                actorUserId: user?.id || null,
                actorName: currentActorName,
              },
            ],
      };
    });

    const latest = getLatestCycle(target?.renewalCycles, null);
    let nextWithSupp = next;
    if (latest?.po_wo_number && latest?.total_contract_value != null) {
      nextWithSupp = next.map((p) => {
        if (!p.isSupplementary) return p;
        if (String(p.supplementaryParentPoId || '') !== String(id)) return p;
        return {
          ...p,
          poWoNumber: latest.po_wo_number,
          totalContractValue: Number(latest.total_contract_value) || 0,
          startDate: latest.start_date || p.startDate,
          endDate: latest.end_date || p.endDate,
          updateHistory: Array.isArray(p.updateHistory)
            ? [...p.updateHistory, { at: nowIso, summary: `Legacy supplementary row aligned to renewed PO/WO ${latest.po_wo_number}` }]
            : [{ at: nowIso, summary: `Legacy supplementary row aligned to renewed PO/WO ${latest.po_wo_number}` }],
        };
      });

      const legacySupp = prev.find(
        (p) => p.isSupplementary && String(p.supplementaryParentPoId || '') === String(id)
      );
      setInvoices((invs) =>
        invs.map((inv) => {
          const parentMatch = String(inv.poId) === String(id);
          const legacySuppMatch = legacySupp && String(inv.poId) === String(legacySupp.id);
          if (!parentMatch && !legacySuppMatch) return inv;
          const mockPoHit = typeof inv.poWoNumber === 'string' && inv.poWoNumber.includes('-SUPP-');
          const shouldRoll = legacySuppMatch || inv.isPostContractBuffer || (parentMatch && mockPoHit);
          if (!shouldRoll) return inv;
          return {
            ...inv,
            poId: id,
            poWoNumber: latest.po_wo_number,
            billingDurationFrom: latest.start_date || inv.billingDurationFrom,
            billingDurationTo: latest.end_date || inv.billingDurationTo,
            isPostContractBuffer: false,
            updated_at: nowIso,
          };
        })
      );
    }

    setCommercialPOs(nextWithSupp);
  };

  const rejectPO = (id) => {
    if (!canApproveCommercialPOs) return;
    const nowIso = new Date().toISOString();
    setCommercialPOs((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              approvalStatus: APPROVAL_STATUS.REJECTED,
              rejectedByUserId: user?.id || null,
              rejectedByName: currentActorName,
              rejectedAt: nowIso,
              updateHistory: [
                ...(Array.isArray(p.updateHistory) ? p.updateHistory : []),
                {
                  at: nowIso,
                  event: 'po_rejected',
                  summary: `PO rejected by ${currentActorName}`,
                  actorUserId: user?.id || null,
                  actorName: currentActorName,
                },
              ],
            }
          : p
      )
    );
  };

  const savePO = () => {
    if (canGstin && formData.gstin && !validateGSTIN(formData.gstin)) { setGstinError('Fix GSTIN before saving'); return; }
    const contactPersons = normalizeContactPersonsList(formData.contactPersons, formData);
    const primaryContact = syncPrimaryContactFields(contactPersons);
    if (canContactPoc) {
      const invalidContactNumber = contactPersons.find(
        (row) => row.contactNumber && normalizeContactNumber(row.contactNumber).length !== 10
      );
      if (invalidContactNumber) {
        setContactError('Contact Number must be exactly 10 digits.');
        return;
      }
    }
    // Validate GST type selection against state (only when tax / related fields are editable)
    if (canTaxService || canPlaceOfSupply || canBillingAddress) {
      const gstErr = validateGstSupplyTypeForState(formData.placeOfSupply, formData.billingAddress, formData.gstSupplyType);
      if (gstErr) {
        setGstTypeError(gstErr);
        return;
      }
    }
    setGstTypeError('');
    const isWithoutPo = formData.poBasis === PO_BASIS_WITHOUT_PO;
    const dummies = buildWithoutPoDummyIds({
      verticalLabel: formData.vertical || 'Manpower',
      ocSeries: formData.ocSeries || nextSeries,
    });
    let ocNum = '';
    let paddedVendorForSave = '';
    if (!isWithoutPo) {
      const trimmedManualOc = (formData.ocNumber || '').trim();
      if (canOcNumber && !trimmedManualOc) {
        setSaveError('Enter OC number.');
        return;
      }
      ocNum = trimmedManualOc;
      paddedVendorForSave = String(formData.vendorCodeDigits ?? '').trim();
    } else {
      const effectiveOc = (formData.ocNumber || '').trim() || dummies.ocNumber;
      ocNum = effectiveOc || generateOCNumber(formData.vertical || 'Manpower', formData.ocSeries || nextSeries);
    }
    const priorActivePo =
      !editId ? getLatestPoForSiteOc(commercialPOs, formData.siteId.trim(), ocNum) : null;
    const newPoWo = String(formData.newCyclePoWoNumber || '').trim();
    const legacyPoWo = String(formData.poWoNumber || '').trim();
    const trimmedPoWoNumber =
      newPoWo ||
      (editId ? legacyPoWo : priorActivePo ? '' : legacyPoWo) ||
      (isWithoutPo ? dummies.poWoNumber : '');
    const prevPo = editId ? commercialPOs.find((p) => p.id === editId) : null;
    const siteIdForSave = formData.siteId.trim() || prevPo?.siteId || prevPo?.site_id || '';
    const conflictStart = canStartDate ? (formData.startDate || '') : (prevPo?.startDate || prevPo?.start_date || formData.startDate || '');
    const conflictEnd = canEndDate ? (formData.endDate || '') : (prevPo?.endDate || prevPo?.end_date || formData.endDate || '');
    const conflictPoWo = canPoFinancials
      ? trimmedPoWoNumber
      : (prevPo?.poWoNumber || prevPo?.po_wo_number || trimmedPoWoNumber);
    const conflictOc = canOcNumber ? ocNum : (prevPo?.ocNumber || prevPo?.oc_number || ocNum);
    if (canPoFinancials || canOcNumber || canStartDate || canEndDate || !editId) {
      const poSaveConflict = findCommercialPoSaveConflict(
        commercialPOs,
        {
          siteId: siteIdForSave,
          ocNumber: conflictOc,
          poWoNumber: conflictPoWo,
          startDate: conflictStart,
          endDate: conflictEnd,
        },
        { excludePoId: editId }
      );
      if (poSaveConflict) {
        setSaveError(poSaveConflict.message);
        return;
      }
    }
    const primaryTotalEmpty =
      formData.totalContractValue === '' || formData.totalContractValue == null;
    if (canPaymentTerms && formData.paymentTerms === CUSTOM_MT_PAYMENT_TERM && !String(formData.customPaymentTerms || '').trim()) {
      setSaveError('Enter payment terms or choose a preset.');
      return;
    }
    if (canPoFinancials && !isWithoutPo && !trimmedPoWoNumber) {
      setSaveError(
        editId
          ? 'Enter PO/WO number in New PO Number (renewal).'
          : priorActivePo
            ? 'Enter the new active PO/WO number.'
            : 'Enter PO/WO number.'
      );
      return;
    }
    if (canPoFinancials && isWithoutPo && !trimmedPoWoNumber) {
      setSaveError('Could not assign dummy PO/WO identifier.');
      return;
    }
    const trainingSelected = isTrainingVertical(formData.vertical);
    // Training invoices use straight Quantity × Rate math; avoid monthly duty-geometry modes.
    const poType = trainingSelected
      ? 'Per Day'
      : (ALLOWED_MANPOWER_PO_TYPES.has(formData.billingType) ? formData.billingType : 'Monthly');
    const rates = formData.ratePerCategory.map((r) => ({
      description: (r.description || '').trim() || 'Other',
      hsnSac: String(r.hsnSac ?? r.hsn_sac ?? r.sacHsn ?? r.sac_hsn ?? '').trim(),
      materialCode: String(r.materialCode ?? r.material_code ?? '').trim(),
      qty: Number(r.qty) || 0,
      rate: Number(r.rate) || 0,
      penalty:
      formData.billingType === 'Lump Sum'
          ? Math.max(0, Number(r.penalty) || 0)
          : 0,
    }));
    const totalVal = primaryTotalEmpty
      ? (formData.newCycleTotalContractValue !== '' && formData.newCycleTotalContractValue != null
          ? Number(formData.newCycleTotalContractValue) || 0
          : 0)
      : Number(formData.totalContractValue) || 0;
    const totalContractMonthVal =
      poType === 'Lump Sum'
        ? Number(formData.totalContractMonth) || null
        : null;
    const monthlyContractValueVal =
      totalContractMonthVal && totalContractMonthVal > 0
        ? Math.round((totalVal / totalContractMonthVal) * 100) / 100
        : null;
    const mtPayment = deriveMtPaymentTermPayload(formData.paymentTerms, formData.customPaymentTerms);
    const canAddNewCycle = isAfterContractEnd(formData.endDate);
    const hasNewCycle =
      String(formData.newCyclePoWoNumber || '').trim() &&
      formData.newCycleTotalContractValue !== '' &&
      formData.newCycleTotalContractValue != null;
    // Renewal cycle is optional until contract end; ignore new-cycle fields until then.
    const addingRenewalCycle = Boolean(canPoFinancials && editId && canAddNewCycle && hasNewCycle);
    const newId = editId ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `temp-${Date.now()}`);
    const nowIso = new Date().toISOString();
    const historyPrev = Array.isArray(prevPo?.updateHistory) ? [...prevPo.updateHistory] : [];
    const nextSnapshot = {
      poWoNumber: trimmedPoWoNumber,
      totalContractValue: totalVal,
      startDate: formData.startDate || '',
      endDate: formData.endDate || '',
      billingType: poType,
      legalName: formData.legalName.trim(),
      gstin: formData.gstin.trim().toUpperCase(),
      ocNumber: ocNum,
      serviceDescription: formData.serviceDescription.trim(),
      paymentTerms: mtPayment.paymentTerms || formData.paymentTerms.trim() || null,
      vertical:
        formData.vertical ||
        (formData.ocNumber && formData.ocNumber.split('-')[1]) ||
        'Manpower',
      sacCode: String(formData.sacCode || formData.hsnCode || '').trim(),
      hsnCode: String(formData.hsnCode || formData.sacCode || '').trim(),
      poDate: formData.poDate || null,
      billingWithoutPo: isWithoutPo,
      ratePerCategory: rates.length ? rates : [{ description: 'Other', hsnSac: '', materialCode: '', qty: 0, rate: 0, penalty: 0 }],
    };
    const approvalFields = resolvePoApprovalFieldsForSave({
      editId,
      prevPo,
      nextSnapshot,
      addingRenewalCycle,
    });
    if (editId && prevPo) {
      const materialChanged = hasMaterialManpowerPoChanges(prevPo, nextSnapshot, { addingRenewalCycle });
      const inWorkflow = [
        APPROVAL_STATUS.SENT,
        APPROVAL_STATUS.APPROVED,
        APPROVAL_STATUS.REJECTED,
      ].includes(normalizePoApprovalStatus(prevPo));
      historyPrev.push({
        at: nowIso,
        summary:
          inWorkflow && materialChanged
            ? 'PO/WO updated — requires Commercial approval again'
            : 'PO/WO updated',
      });
    }
    const contactHistorySourcePo = editId ? prevPo : priorActivePo;
    const contactHistoryLog = buildContactHistoryLogForSave({
      prevLog: contactHistorySourcePo?.contactHistoryLog || [],
      prevCoordinator: contactHistorySourcePo?.currentCoordinator || '',
      prevContactNumber: contactHistorySourcePo?.contactNumber || '',
      currentCoordinator: primaryContact.currentCoordinator,
      contactNumber: primaryContact.contactNumber,
      startDate: formData.startDate || nowIso.slice(0, 10),
      asOfDate: nowIso.slice(0, 10),
    }).map((row, idx, arr) =>
      idx === arr.length - 1 && !row.to
        ? {
            ...row,
            email: primaryContact.contactEmail || row.email || '',
            designation: primaryContact.contactDesignation || row.designation || '',
          }
        : row
    );
    const historyWithContacts = withContactPersonsHistorySnapshot(historyPrev, contactPersons);
    const po = {
      id: newId, siteId: formData.siteId.trim() || `SITE-${String(newId).slice(0, 8)}`,
      locationName: formData.locationName.trim() || formData.legalName, legalName: formData.legalName.trim(),
      billingAddress: formData.billingAddress.trim(),
      shippingAddress: formData.shippingAddress.trim(),
      placeOfSupply: formData.placeOfSupply.trim(),
      gstin: formData.gstin.trim().toUpperCase(),
      panNumber: (formData.panNumber || '').trim().toUpperCase(),
      currentCoordinator: primaryContact.currentCoordinator,
      contactDesignation: primaryContact.contactDesignation,
      contactNumber: primaryContact.contactNumber,
      contactEmail: primaryContact.contactEmail,
      contactPersons,
      vendorCode: isWithoutPo
        ? (formData.vendorCode || '').trim()
        : paddedVendorForSave || parseStructuredOcMt(ocNum)?.vendorPadded || '',
      gstSupplyType: formData.gstSupplyType || 'intra',
      contactHistoryLog,
      ocNumber: ocNum,
      ocSeries: isWithoutPo
        ? formData.ocSeries || nextSeries
        : parseStructuredOcMt(ocNum)?.vendorPadded || paddedVendorForSave || '',
      // Prefer explicitly selected vertical; OC segment can be stale if user edits OC manually.
      vertical:
        formData.vertical ||
        (formData.ocNumber && formData.ocNumber.split('-')[1]) ||
        'Manpower',
      poWoNumber: trimmedPoWoNumber,
      renewalCycles:
        priorActivePo && !editId
          ? buildRenewalCyclesForNewSiteOcPo(priorActivePo)
          : Array.isArray(formData.renewalCycles)
            ? formData.renewalCycles
            : [],
      ratePerCategory: rates.length ? rates : [{ description: 'Other', hsnSac: '', materialCode: '', qty: 0, rate: 0, penalty: 0 }], totalContractValue: totalVal,
      totalContractMonth: totalContractMonthVal,
      monthlyContractValue: monthlyContractValueVal,
      sacCode: String(formData.sacCode || formData.hsnCode || '').trim(),
      hsnCode: String(formData.hsnCode || formData.sacCode || '').trim(),
      serviceDescription: formData.serviceDescription.trim(),
      startDate: formData.startDate || '', endDate: formData.endDate || '', billingType: poType,
      billingCycle: null,
      remarks: formData.remarks.trim(),
      paymentTerms: mtPayment.paymentTerms || formData.paymentTerms.trim() || null,
      poDate: formData.poDate || null,
      pincode: String(formData.pincode || '').trim() || null,
      shipToPincode:
        canPincodeShipTo && !canPincodeBillTo
          ? (String(formData.shipToPincode || '').trim() || null)
          : shipToPincodeForPoSave(formData),
      materialCodeRequired: !!formData.materialCodeRequired,
      poReceivedDate: null,
      paymentTermMode: mtPayment.paymentTermMode,
      paymentTermDays: mtPayment.paymentTermDays,
      advancePercent: null,
      dutyPattern: String(formData.dutyPattern || '').trim() || null,
      customDutyPattern:
        formData.dutyPattern === DUTY_PATTERN_CUSTOM
          ? String(formData.customDutyPattern || '').trim() || null
          : null,
      relieverScope: String(formData.relieverScope || '').trim() || null,
      monthlyValue:
        formData.monthlyValue === '' || formData.monthlyValue == null
          ? null
          : Number(formData.monthlyValue),
      withFireTender: !!formData.withFireTender,
      poCopyFiles: fileMetaForPersist(formData.poCopyFiles),
      scopeOfWorkFiles: fileMetaForPersist(formData.scopeOfWorkFiles),
      penaltyClauseFiles: fileMetaForPersist(formData.penaltyClauseFiles),
      monthlyDutyQtyMode: null,
      lumpSumBillingMode: null,
      invoiceTermsText: formData.invoiceTermsText.trim(),
      sellerCin: (formData.sellerCin || '').trim(),
      sellerPan: (formData.sellerPan || '').trim(),
      msmeRegistrationNo: (formData.msmeRegistrationNo || '').trim(),
      msmeClause: (formData.msmeClause || '').trim(),
      revisedPO: formData.revisedPO, renewalPending: formData.renewalPending,
      status: formData.endDate && new Date(formData.endDate) < new Date() ? 'expired' : 'active',
      ...approvalFields,
      updateHistory: editId ? historyWithContacts : withContactPersonsHistorySnapshot([], contactPersons),
      created_at: prevPo?.created_at || prevPo?.createdAt || nowIso,
      createdAt: prevPo?.createdAt || prevPo?.created_at || nowIso,
      updated_at: nowIso,
      updatedAt: nowIso,
      // Preserve supplementary workflow fields on edit
      isSupplementary: !!prevPo?.isSupplementary,
      supplementaryParentPoId: prevPo?.supplementaryParentPoId || null,
      supplementarySeq: prevPo?.supplementarySeq || null,
      supplementaryRequestStatus: prevPo?.supplementaryRequestStatus || null,
      supplementaryReason: prevPo?.supplementaryReason || null,
      supplementaryRequestedAt: prevPo?.supplementaryRequestedAt || null,
      supplementaryApprovedAt: prevPo?.supplementaryApprovedAt || null,
      billingWithoutPo: isWithoutPo,
      moduleType: COMMERCIAL_MODULE_MANPOWER_TRAINING,
    };

    if (addingRenewalCycle) {
      po.renewalCycles = [
        ...(po.renewalCycles || []),
        makeCycle({
          poWoNumber: formData.newCyclePoWoNumber,
          totalContractValue: formData.newCycleTotalContractValue,
          startDate: formData.startDate,
          endDate: formData.endDate,
          approvedAt: null,
        }),
      ];
    }
    const poToSave = applyPoEntryFieldAclOnSave({
      nextPo: po,
      prevPo,
      userProfile,
    });
    if (editId) {
      setCommercialPOs((prev) => prev.map((p) => (p.id === editId ? poToSave : p)));
    } else {
      const supersedeId = priorActivePo?.id;
      setCommercialPOs((prev) => {
        const next = supersedeId
          ? prev.map((p) =>
              p.id === supersedeId
                ? {
                    ...p,
                    status: COMMERCIAL_PO_STATUS_SUPERSEDED,
                    updated_at: nowIso,
                    updatedAt: nowIso,
                  }
                : p
            )
          : prev;
        return [...next, poToSave];
      });
    }
    setSaveError('');
    setShowForm(false);
    setFormData(initialForm);
  };

  const deletePO = (id) => { if (window.confirm('Delete this PO? Billing may be affected.')) setCommercialPOs((prev) => prev.filter((p) => p.id !== id)); };
  const poForHistory = viewHistoryPoId ? commercialPOs.find((p) => p.id === viewHistoryPoId) : null;
  const poForView = viewPoId ? commercialPOs.find((p) => p.id === viewPoId) : null;
  const poContactHistoryRows = useMemo(
    () => (poForHistory ? contactHistoryRowsForDisplay(poForHistory) : []),
    [poForHistory]
  );
  const poNumberHistoryRows = useMemo(() => {
    if (!poForHistory) return [];
    const siteId = poForHistory.siteId || poForHistory.site_id || '';
    const ocNumber = poForHistory.ocNumber || poForHistory.oc_number || '';
    if (siteId && ocNumber) {
      return collectSiteOcPoNumberHistory(commercialPOs, siteId, ocNumber);
    }
    const rows = (poForHistory.renewalCycles || poForHistory.renewal_cycles || []).map((c) => ({
      poWoNumber: c.po_wo_number,
      startDate: c.start_date,
      endDate: c.end_date,
      isCurrentOnRow: false,
    }));
    rows.push({
      poWoNumber: poForHistory.poWoNumber || poForHistory.po_wo_number,
      startDate: poForHistory.startDate || poForHistory.start_date,
      endDate: poForHistory.endDate || poForHistory.end_date,
      isCurrentOnRow: true,
    });
    return rows.filter((r) => String(r.poWoNumber || '').trim());
  }, [poForHistory, commercialPOs]);
  const isLumpSumMode = formData.billingType === 'Lump Sum';
  const isLumpSumPenaltyMode = formData.billingType === 'Lump Sum';
  const monthlyContractValue =
    isLumpSumMode && Number(formData.totalContractMonth) > 0
      ? Math.round(
          ((editId
            ? Number(formData.newCycleTotalContractValue) || 0
            : Number(formData.totalContractValue) || 0) /
            Number(formData.totalContractMonth)) *
            100
        ) / 100
      : '';

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-3 rounded-lg shrink-0"><FileCheck className="w-6 h-6 text-blue-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">PO / WO Management</h2>
          </div>
        </div>
        <button type="button" onClick={handleOpenAdd} className="bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2">
          <Plus className="h-5 w-5" /> Add PO/WO
        </button>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-emerald-950">
        <p className="min-w-0 leading-snug">
          <span className="font-semibold">Next — Billing:</span> After you <strong>send for approval</strong> and the PO is{' '}
          <strong>approved</strong>, open <strong>Billing</strong>, choose the <strong>same vertical</strong> (team-wise dropdown), then{' '}
          <strong>Create Invoice</strong>.
        </p>
        <Link
          to="/app/billing/create-invoice"
          className="shrink-0 inline-flex items-center justify-center rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 shadow-sm"
        >
          Go to Billing → Create Invoice
        </Link>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by OC, PO number, client, site..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            aria-label="Search POs"
          />
        </div>
        <div className="shrink-0 w-full sm:w-52">
          <label htmlFor="sales-po-entry-department-filter" className="sr-only">
            Department
          </label>
          <select
            id="sales-po-entry-department-filter"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full h-full min-h-[42px] py-2.5 px-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All departments</option>
            {VERTICALS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        {departmentFilter === 'Manpower' ? (
          <div className="shrink-0 w-full sm:w-52">
            <label htmlFor="sales-po-entry-billing-type-filter" className="sr-only">
              Billing type
            </label>
            <select
              id="sales-po-entry-billing-type-filter"
              value={manpowerBillingTypeFilter}
              onChange={(e) => setManpowerBillingTypeFilter(e.target.value)}
              className="w-full h-full min-h-[42px] py-2.5 px-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All billing types</option>
              {MANPOWER_BILLING_TYPE_FILTERS.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="shrink-0 w-full sm:w-48">
          <label htmlFor="sales-po-list-po-basis-filter" className="sr-only">
            PO basis
          </label>
          <select
            id="sales-po-list-po-basis-filter"
            value={listPoBasisFilter}
            onChange={(e) => setListPoBasisFilter(e.target.value)}
            className="w-full h-full min-h-[42px] py-2.5 px-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All — With / Without PO</option>
            <option value="with_po">With PO only</option>
            <option value="without_po">Without PO only</option>
          </select>
        </div>
        <div className="shrink-0 w-full sm:w-44">
          <label htmlFor="sales-po-list-sort-key" className="sr-only">
            Sort by
          </label>
          <select
            id="sales-po-list-sort-key"
            value={sortConfig.key}
            onChange={(e) => setSortConfig((prev) => ({ ...prev, key: e.target.value }))}
            className="w-full h-full min-h-[42px] py-2.5 px-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="modified">Last modified</option>
            <option value="created">Last created</option>
            <option value="ocNumber">OC number</option>
            <option value="client">Client</option>
            <option value="siteLocation">Site / Location</option>
            <option value="poWo">PO/WO</option>
            <option value="startEnd">Start-End</option>
            <option value="status">Status</option>
          </select>
        </div>
        <div className="shrink-0 w-full sm:w-36">
          <label htmlFor="sales-po-list-sort-direction" className="sr-only">
            Sort direction
          </label>
          <select
            id="sales-po-list-sort-direction"
            value={sortConfig.direction}
            onChange={(e) => setSortConfig((prev) => ({ ...prev, direction: e.target.value }))}
            className="w-full h-full min-h-[42px] py-2.5 px-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>
      <div className="rounded-xl border border-gray-300 overflow-hidden bg-[#f2f6ff]">
        <div className="p-2">
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="w-full max-w-full min-w-0 overflow-x-hidden">
              <table className="w-full min-w-0 max-w-full table-fixed border-collapse">
                <thead>
                  <tr>
                    <th className="px-1 py-2 text-center text-[9px] sm:text-[10px] font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[5%] md:w-[4%]">
                      Sr.
                    </th>
                    <th className="px-1 sm:px-1 py-2 text-center text-[9px] sm:text-[10px] font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[8%] md:w-[7%]">
                      PO?
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[20%] md:w-[13%] lg:w-[12%]">
                      <button type="button" onClick={() => toggleSort('ocNumber')} className="inline-flex items-center text-[10px] sm:text-xs font-bold text-black">
                        OC Number {renderSortIndicator('ocNumber')}
                      </button>
                    </th>
                    <th className="hidden lg:table-cell px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[17%]">
                      <button type="button" onClick={() => toggleSort('client')} className="inline-flex items-center text-[10px] sm:text-xs font-bold text-black">
                        Client (Legal Name) {renderSortIndicator('client')}
                      </button>
                    </th>
                    <th className="hidden md:table-cell px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[14%] lg:w-[13%]">
                      <button type="button" onClick={() => toggleSort('siteLocation')} className="inline-flex items-center text-[10px] sm:text-xs font-bold text-black">
                        Site / Location {renderSortIndicator('siteLocation')}
                      </button>
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[14%] md:w-[12%] lg:w-[10%]">
                      <button type="button" onClick={() => toggleSort('poWo')} className="inline-flex items-center text-[10px] sm:text-xs font-bold text-black">
                        PO/WO {renderSortIndicator('poWo')}
                      </button>
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[13%] md:w-[11%] lg:w-[11%]">
                      <button type="button" onClick={() => toggleSort('startEnd')} className="inline-flex items-center text-[10px] sm:text-xs font-bold text-black">
                        Start-End {renderSortIndicator('startEnd')}
                      </button>
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[28%] md:w-[24%] lg:w-[15%]">
                      <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center text-[10px] sm:text-xs font-bold text-black">
                        Status {renderSortIndicator('status')}
                      </button>
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[19%] md:w-[19%] lg:w-[13%]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {paginatedList.map((po, rowIdx) => {
                    const siteLocation = [po.siteId, po.locationName].filter(Boolean).join(' – ');
                    const approval = getApprovalBadge(po.approvalStatus, po);
                    const isHighlighted = highlightedPoId && String(po.id) === String(highlightedPoId);
                    const startDateFmt =
                      formatDateDdMmYyyy(cleanCellText(po.startDate)) || '–';
                    const endDateFmt = formatDateDdMmYyyy(cleanCellText(po.endDate)) || '–';
                    return (
                      <tr
                        id={poRowDomId(po.id)}
                        key={po.id}
                        className={[
                          'hover:bg-gray-50 align-top transition-colors',
                          isHighlighted ? 'bg-amber-50 ring-2 ring-inset ring-amber-400' : '',
                        ].join(' ')}
                      >
                        <td className="px-1 py-2 text-[9px] sm:text-[10px] text-center align-middle font-semibold text-gray-700">
                          {start + rowIdx + 1}
                        </td>
                        <td className="px-1 py-2 text-[9px] sm:text-[10px] text-center align-middle">
                          <span
                            className={`inline-flex px-1 py-0.5 rounded font-semibold ${
                              isPoWithoutPoBilling(po) ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'
                            }`}
                            title={isPoWithoutPoBilling(po) ? 'Billed without customer PO' : 'With PO'}
                          >
                            {isPoWithoutPoBilling(po) ? 'No' : 'Yes'}
                          </span>
                        </td>
                        <td className="px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-900 min-w-0 text-center">
                          <TextCell
                            value={po.ocNumber}
                            className="text-center font-semibold font-mono"
                          />
                        </td>
                        <td className="hidden lg:table-cell px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 min-w-0 text-center">
                          <TextCell value={po.legalName} className="text-center" />
                        </td>
                        <td className="hidden md:table-cell px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 min-w-0 text-center">
                          <TextCell value={siteLocation} className="text-center" />
                        </td>
                        <td className="px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 text-center">
                          <TextCell value={po.poWoNumber} className="text-center" />
                        </td>
                        <td className="px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 text-center">
                          <div className="flex flex-col items-center justify-center gap-0.5 leading-none text-center min-w-0">
                            <span
                              className="font-mono tabular-nums tracking-tight truncate max-w-full"
                              title={po.startDate ? formatDateDdMmYyyy(cleanCellText(po.startDate)) || String(po.startDate) : ''}
                            >
                              {startDateFmt}
                            </span>
                            <span className="text-gray-400 select-none font-mono text-[9px] leading-none">
                              -
                            </span>
                            <span
                              className="font-mono tabular-nums tracking-tight truncate max-w-full"
                              title={po.endDate ? formatDateDdMmYyyy(cleanCellText(po.endDate)) || String(po.endDate) : ''}
                            >
                              {endDateFmt}
                            </span>
                          </div>
                        </td>
                        <td className="px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 text-center">
                          <div className="flex flex-col items-center justify-center gap-1 min-w-0">
                            <span
                              className={`inline-flex items-center justify-center px-1.5 py-1 text-[9px] sm:text-[10.5px] font-semibold rounded-full ${approval.cls} whitespace-normal text-center leading-tight max-w-full`}
                              title={approval.label}
                            >
                              <MultilineBadgeText text={approval.label} />
                            </span>
                            {(po.revisedPO || po.renewalPending) && (
                              <span
                                className="text-[11px] sm:text-xs leading-tight text-center"
                                title={`${po.revisedPO ? 'PO Updated' : ''}${po.revisedPO && po.renewalPending ? ' · ' : ''}${po.renewalPending ? 'Renewal Due' : ''}`}
                              >
                                {po.revisedPO && <span className="block text-amber-700 font-semibold">PO Updated</span>}
                                {po.renewalPending && <span className="block text-orange-700 font-semibold">Renewal Due</span>}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-1 sm:px-2 py-1.5 text-center min-w-0">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {!po.isSupplementary && (
                              <>
                                {po.supplementaryRequestStatus === SUPPLEMENTARY_STATUS.PENDING ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled
                                      className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 opacity-80 cursor-not-allowed"
                                      title="Post-contract billing request pending"
                                    >
                                      S
                                    </button>
                                    {canApproveCommercialPOs ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => approveSupplementaryBill(po)}
                                          className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                          title="Approve post-contract billing"
                                        >
                                          <CheckCircle className="w-4 h-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => rejectSupplementaryBill(po)}
                                          className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                          title="Reject post-contract billing request"
                                        >
                                          <XCircle className="w-4 h-4" />
                                        </button>
                                      </>
                                    ) : null}
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => requestSupplementaryBill(po)}
                                    disabled={!isAfterContractEnd(po.endDate || po.end_date)}
                                    className={[
                                      'inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border',
                                      isAfterContractEnd(po.endDate || po.end_date)
                                        ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                        : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed',
                                    ].join(' ')}
                                    title={
                                      isAfterContractEnd(po.endDate || po.end_date)
                                        ? 'Request post-contract billing (after contract end)'
                                        : 'Available only after contract end date'
                                    }
                                  >
                                    S
                                  </button>
                                )}
                              </>
                            )}
                            {po.approvalStatus === APPROVAL_STATUS.DRAFT && (
                              <button
                                type="button"
                                onClick={() => sendToApproval(po.id)}
                                className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                title="Send to approval"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                            {canApproveCommercialPOs && po.approvalStatus === APPROVAL_STATUS.SENT && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => approvePO(po.id)}
                                  className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  title="Commercial Manager Approve"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rejectPO(po.id)}
                                  className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                  title="Commercial Manager Reject"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => setViewPoId(po.id)}
                              className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                              title="View PO/WO"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => setViewHistoryPoId(po.id)} className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100" title="View History"><History className="w-4 h-4" /></button>
                            <button type="button" onClick={() => handleOpenEdit(po)} className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100" title="Edit"><Pencil className="w-4 h-4" /></button>
                            <button type="button" onClick={() => deletePO(po.id)} className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100" title="Delete"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredList.length === 0 && <div className="p-8 text-center text-gray-500">No PO/WO found. Add one to start.</div>}
          </div>
        </div>
      </div>

      {filteredList.length > 0 && (
        <div className="px-4 py-3 border border-gray-300 border-t-0 rounded-b-xl bg-gray-50 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">
            Showing <span className="font-medium">{start + 1}</span>–
            <span className="font-medium">{Math.min(start + PAGE_SIZE, filteredList.length)}</span> of{' '}
            <span className="font-medium">{filteredList.length}</span> PO{filteredList.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goToPage(safePage - 1)}
              disabled={safePage <= 1}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-700">
              Page <span className="font-medium">{safePage}</span> of <span className="font-medium">{totalPages}</span>
            </span>
            <button
              type="button"
              onClick={() => goToPage(safePage + 1)}
              disabled={safePage >= totalPages}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-start justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full my-8 max-h-[90vh] overflow-y-auto border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white/95 backdrop-blur flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 leading-tight">{editId ? 'Edit PO/WO' : 'Add PO/WO'}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {poFieldAclLabel
                    ? `Fields available for ${poFieldAclLabel} department.`
                    : 'Fill in the client, PO details, and billing rules.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-5 bg-gray-50">
              {showBillingBasisStrip ? (
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  {canBillingBasic ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="sales-po-billing-basis">
                      Billing basis
                    </label>
                    <select
                      id="sales-po-billing-basis"
                      value={formData.poBasis}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === PO_BASIS_WITHOUT_PO) {
                          const d = buildWithoutPoDummyIds({
                            verticalLabel: formData.vertical || 'Manpower',
                            ocSeries: formData.ocSeries || nextSeries,
                          });
                          setFormData((p) => ({
                            ...p,
                            poBasis: v,
                            ocNumber: canOcNumber ? (p.ocNumber?.trim() || d.ocNumber) : p.ocNumber,
                            poWoNumber: canPoFinancials ? (p.poWoNumber?.trim() || d.poWoNumber) : p.poWoNumber,
                          }));
                        } else {
                          setFormData((p) => ({ ...p, poBasis: v }));
                        }
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value={PO_BASIS_WITH_PO}>With PO</option>
                      <option value={PO_BASIS_WITHOUT_PO}>Without PO</option>
                    </select>
                  </div>
                  ) : null}
                  {canPoDate ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="sales-po-date">
                      PO Date
                    </label>
                    <FormDateInput id="sales-po-date" value={formData.poDate} onChange={(e) => setFormData((p) => ({ ...p, poDate: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  ) : null}
                </div>
                {canBillingBasic ? (
                <p className="text-xs text-gray-500 mt-2">
                  Without PO: OC and WOPO identifiers are prefilled for tracking (editable). Customer PO/WO can stay blank until you add one.
                </p>
                ) : null}
              </section>
              ) : null}
              {showClientIdentitySection ? (
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h4 className="text-sm font-semibold text-gray-900">1. Client Identity</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {canLegalName ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="sales-po-legal-name">
                      Legal Name (for GST)
                    </label>
                    <ClientLegalNameAutocomplete
                      id="sales-po-legal-name"
                      value={formData.legalName}
                      onChange={(v) => setFormData((p) => ({ ...p, legalName: v }))}
                      profiles={clientProfilesFromPOs}
                      onApplySnapshot={handleApplyClientSnapshot}
                      placeholder="Type name or pick a saved client"
                    />
                  </div>
                  ) : null}
                  {canBillingAddress ? (
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Billing Address (with State)</label><input type="text" value={formData.billingAddress} onChange={(e) => { const v = e.target.value; setFormData((p) => ({ ...p, billingAddress: v })); if (canTaxService) { const msg = validateGstSupplyTypeForState(formData.placeOfSupply, v, formData.gstSupplyType); setGstTypeError(msg); } }} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Full address including State" /></div>
                  ) : null}
                  {(canPincodeBillTo || canPincodeShipTo) ? (
                  <PoClientPincodeFields
                    formData={formData}
                    setFormData={setFormData}
                    billToInputId="sales-po-pincode-bill"
                    shipToInputId="sales-po-pincode-ship"
                    sameCheckboxId="sales-po-pincode-same"
                    showBillTo={canPincodeBillTo}
                    showShipTo={canPincodeShipTo}
                  />
                  ) : null}
                  {canShippingAddress ? (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Consignee / Ship-to address</label>
                    <textarea value={formData.shippingAddress} onChange={(e) => setFormData((p) => ({ ...p, shippingAddress: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Leave blank if same as billing address" />
                    <p className="text-[11px] text-gray-500 mt-1">
                      If different from billing, invoice will show separate BILL TO and SHIP TO blocks.
                    </p>
                  </div>
                  ) : null}
                  {canGstin ? (
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">GSTIN (15-digit)</label><input type="text" value={formData.gstin} onChange={(e) => { const gstin = e.target.value.toUpperCase(); const panFromGstin = extractPanFromGstin(gstin); setFormData((p) => ({ ...p, gstin, ...(panFromGstin && canPanNumber ? { panNumber: panFromGstin } : {}) })); setGstinError(''); }} onBlur={handleGstinBlur} maxLength={15} className={`w-full border rounded-lg px-3 py-2 ${gstinError ? 'border-red-500' : 'border-gray-300'}`} placeholder="e.g. 27AABCU9603R1ZM" />{gstinError && <p className="text-red-600 text-xs mt-1">{gstinError}</p>}</div>
                  ) : null}
                  {canPanNumber ? (
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">PAN Number</label><input type="text" value={formData.panNumber} onChange={(e) => setFormData((p) => ({ ...p, panNumber: e.target.value.toUpperCase() }))} maxLength={10} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. AABCU9603R" /></div>
                  ) : null}
                  {canLocationName ? (
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Location Name</label><input type="text" value={formData.locationName} onChange={(e) => setFormData((p) => ({ ...p, locationName: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" /></div>
                  ) : null}
                  {canPlaceOfSupply ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Place of supply (invoice)</label>
                    <PlaceOfSupplySearchSelect
                      value={formData.placeOfSupply}
                      options={INDIA_STATES_UT}
                      onChange={(nextState) => {
                        setFormData((p) => {
                          const next = { ...p, placeOfSupply: nextState };
                          // Auto-define tax slab based on state selection — only when tax fields are editable
                          if (canTaxService && next.gstSupplyType !== 'sez_zero') {
                            next.gstSupplyType = nextState === 'Gujarat' ? 'intra' : 'inter';
                          }
                          return next;
                        });
                        if (canTaxService) {
                          const msg = validateGstSupplyTypeForState(nextState, formData.billingAddress, formData.gstSupplyType);
                          setGstTypeError(msg);
                          if (msg) window.alert(msg);
                        }
                      }}
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Tax type auto-sets to CGST+SGST for Gujarat; IGST for other states (SEZ 0% remains as selected).
                    </p>
                  </div>
                  ) : null}
                </div>
              </section>
              ) : null}
              {canContactPoc ? (
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">2. Contact (POC)</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Add one or more contact persons. When you pick a saved client under <strong>Legal Name</strong>,
                      the first contact is filled from that PO (edit if needed).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        contactPersons: [...(prev.contactPersons || []), emptyContactPerson()],
                      }))
                    }
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-xs font-medium hover:bg-blue-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add contact person
                  </button>
                </div>
                <div className="space-y-4">
                  {(formData.contactPersons?.length ? formData.contactPersons : [emptyContactPerson()]).map((row, index) => (
                    <div
                      key={`contact-person-${index}`}
                      className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 sm:p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-gray-700">
                          Contact person {index + 1}
                          {index === 0 ? <span className="ml-1 font-normal text-gray-500">(primary)</span> : null}
                        </p>
                        {(formData.contactPersons || []).length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((prev) => {
                                const nextPersons = (prev.contactPersons || []).filter((_, i) => i !== index);
                                const normalized = normalizeContactPersonsList(nextPersons);
                                return {
                                  ...prev,
                                  contactPersons: normalized,
                                  ...syncPrimaryContactFields(normalized),
                                };
                              })
                            }
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {index === 0 ? 'Current Coordinator' : 'Contact Name'}
                          </label>
                          <input
                            type="text"
                            value={row.name || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setFormData((prev) => {
                                const nextPersons = [...(prev.contactPersons || [emptyContactPerson()])];
                                nextPersons[index] = { ...nextPersons[index], name: value };
                                return {
                                  ...prev,
                                  contactPersons: nextPersons,
                                  ...syncPrimaryContactFields(nextPersons),
                                };
                              });
                            }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                            placeholder="Name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                          <input
                            type="text"
                            value={row.designation || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setFormData((prev) => {
                                const nextPersons = [...(prev.contactPersons || [emptyContactPerson()])];
                                nextPersons[index] = { ...nextPersons[index], designation: value };
                                return {
                                  ...prev,
                                  contactPersons: nextPersons,
                                  ...syncPrimaryContactFields(nextPersons),
                                };
                              });
                            }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                            placeholder="e.g. Site In-charge"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                          <input
                            type="text"
                            value={row.contactNumber || ''}
                            onChange={(e) => {
                              const next = normalizeContactNumber(e.target.value);
                              setContactError('');
                              setFormData((prev) => {
                                const nextPersons = [...(prev.contactPersons || [emptyContactPerson()])];
                                nextPersons[index] = { ...nextPersons[index], contactNumber: next };
                                return {
                                  ...prev,
                                  contactPersons: nextPersons,
                                  ...syncPrimaryContactFields(nextPersons),
                                };
                              });
                            }}
                            maxLength={10}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                            placeholder="10-digit mobile"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email ID</label>
                          <input
                            type="email"
                            value={row.email || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setFormData((prev) => {
                                const nextPersons = [...(prev.contactPersons || [emptyContactPerson()])];
                                nextPersons[index] = { ...nextPersons[index], email: value };
                                return {
                                  ...prev,
                                  contactPersons: nextPersons,
                                  ...syncPrimaryContactFields(nextPersons),
                                };
                              });
                            }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                            placeholder="e.g. poc@company.com"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {contactError ? <p className="text-red-600 text-xs">{contactError}</p> : null}
                </div>
              </section>
              ) : null}
              {showPoFinancialsSection ? (
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">
                  {canPoFinancials ? '3. PO / Financials' : '3. OC Number'}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {canOcNumber && formData.poBasis === PO_BASIS_WITHOUT_PO ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">OC Number</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={formData.ocNumber}
                            onChange={(e) => setFormData((p) => ({ ...p, ocNumber: e.target.value }))}
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm"
                            placeholder={`IFSPL-Manpower-OC-${getFinancialYear()}-00001`}
                          />
                          <select
                            value={formData.vertical}
                            onChange={(e) => {
                              const nv = e.target.value;
                              setFormData((p) => {
                                const d = buildWithoutPoDummyIds({
                                  verticalLabel: nv,
                                  ocSeries: p.ocSeries || nextSeries,
                                });
                                return {
                                  ...p,
                                  vertical: nv,
                                  ocNumber: d.ocNumber,
                                  ...(canPoFinancials ? { poWoNumber: d.poWoNumber } : {}),
                                };
                              });
                            }}
                            className="border border-gray-300 rounded-lg px-3 py-2 shrink-0"
                            aria-label="OC line (Manpower, Training, or Fire Tender)"
                          >
                            {VERTICALS.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Code</label>
                        <input
                          type="text"
                          value={formData.vendorCode}
                          onChange={(e) => setFormData((p) => ({ ...p, vendorCode: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                          placeholder="Optional"
                        />
                      </div>
                    </>
                  ) : null}
                  {canOcNumber && formData.poBasis !== PO_BASIS_WITHOUT_PO ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="sales-po-oc-line">
                          OC Number
                        </label>
                        <div className="flex gap-2 items-stretch">
                          <input
                            id="sales-po-oc-full"
                            type="text"
                            value={formData.ocNumber}
                            onChange={(e) => setFormData((p) => ({ ...p, ocNumber: e.target.value }))}
                            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 font-mono text-sm"
                            placeholder={buildOcBase(formData.vertical || 'Manpower', fyForOc)}
                            aria-label="Full OC number"
                          />
                          <select
                            id="sales-po-oc-line"
                            value={formData.vertical}
                            onChange={(e) => {
                              const line = e.target.value;
                              setFormData((p) => ({
                                ...p,
                                vertical: line,
                                vendorCodeDigits: p.vendorCodeDigits,
                                ocNumber: p.ocNumber,
                              }));
                            }}
                            className="border border-gray-300 rounded-lg px-3 py-2 shrink-0 bg-white text-sm min-w-[9rem]"
                            aria-label="Manpower, Training, or Fire Tender"
                          >
                            {VERTICALS.map((line) => (
                              <option key={line} value={line}>
                                {line}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="sales-po-vendor-serial">
                          Vendor Code
                        </label>
                        <input
                          id="sales-po-vendor-serial"
                          type="text"
                          autoComplete="off"
                          value={formData.vendorCodeDigits}
                          onChange={(e) =>
                            setFormData((p) => ({
                              ...p,
                              vendorCodeDigits: e.target.value,
                            }))
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white font-mono text-sm"
                          placeholder="Optional reference"
                          aria-label="Vendor serial for OC line"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {editId
                            ? `FY segment stays as saved (${fyForOc}). Vendor digits are optional.`
                            : 'Enter the full OC above. Multiple POs may share the same Site and OC when PO/WO numbers differ and service periods do not overlap.'}
                        </p>
                      </div>
                    </>
                  ) : null}
                  {canPoFinancials && showPriorPoNumberField ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        PO Number (OLD){' '}
                        <span className="text-gray-400 font-normal">({formatDateDdMmYyyy(formData.startDate) || '—'} to {formatDateDdMmYyyy(formData.endDate) || '—'})</span>
                      </label>
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={formData.poWoNumber}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-gray-100 text-gray-600 cursor-not-allowed"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        {editId
                          ? 'Read-only snapshot of the current PO on file.'
                          : 'Previous active PO number for this Site and OC — moved to history when you save the new PO.'}
                      </p>
                    </div>
                  ) : null}
                  {canPoFinancials && editId ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Total contract value (OLD) (₹){' '}
                        <span className="text-gray-400 font-normal">({formatDateDdMmYyyy(formData.startDate) || '—'} to {formatDateDdMmYyyy(formData.endDate) || '—'})</span>
                      </label>
                      <input
                        type="number"
                        readOnly
                        tabIndex={-1}
                        value={formData.totalContractValue}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-gray-100 text-gray-600 cursor-not-allowed"
                        min="0"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">Read-only snapshot of the current value on file.</p>
                    </div>
                  ) : null}
                </div>

                {canPoFinancials ? (
                <>
                {showSiteOcPoHistory ? (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                    <p className="text-xs font-semibold text-gray-800 mb-2">PO Number History</p>
                    <div className="space-y-1.5 text-xs text-gray-700">
                      {siteOcPoNumberHistory.map((entry, i) => (
                        <div key={`${entry.poWoNumber}-${i}`} className="flex flex-wrap gap-x-3 gap-y-1">
                          <span className="font-mono font-medium">{entry.poWoNumber}</span>
                          {entry.totalContractValue != null && entry.totalContractValue !== '' ? (
                            <span>₹{Number(entry.totalContractValue || 0).toLocaleString('en-IN')}</span>
                          ) : null}
                          <span className="text-gray-500">
                            ({formatDateDdMmYyyy(entry.startDate) || '—'} to {formatDateDdMmYyyy(entry.endDate) || '—'})
                          </span>
                          {entry.isCurrentOnRow ? (
                            <span className="text-amber-700 font-medium">current on file</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {showPriorPoNumberField ? 'New PO Number' : 'PO / WO Number'}{' '}
                      <span className="text-gray-500 font-normal">({formatDateDdMmYyyy(formData.startDate) || '—'} to {formatDateDdMmYyyy(formData.endDate) || '—'})</span>
                    </label>
                    {showPriorPoNumberField ? (
                      <p className="text-xs text-gray-500 mb-1.5">
                        {editId ? 'New PO/WO number (renewal)' : 'Enter the new active PO/WO number for this period'}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-1 gap-2">
                      <input
                        type="text"
                        value={showPriorPoNumberField ? formData.newCyclePoWoNumber : formData.newCyclePoWoNumber || formData.poWoNumber}
                        onChange={(e) =>
                          setFormData((p) =>
                            showPriorPoNumberField
                              ? { ...p, newCyclePoWoNumber: e.target.value }
                              : { ...p, newCyclePoWoNumber: e.target.value, poWoNumber: e.target.value }
                          )
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                        placeholder="Enter PO/WO number"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {editId ? 'New Total contract value (₹)' : 'Total contract value (₹)'}{' '}
                      <span className="text-gray-500 font-normal">({formatDateDdMmYyyy(formData.startDate) || '—'} to {formatDateDdMmYyyy(formData.endDate) || '—'})</span>
                    </label>
                    <input
                      type="number"
                      value={editId ? formData.newCycleTotalContractValue : formData.totalContractValue}
                      onChange={(e) => handleContractValueChange(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                      min="0"
                      placeholder="Enter total contract value"
                    />
                    {editId ? (
                      <p className="text-[11px] text-gray-500 mt-1">
                        After Commercial approves renewal, buffer-period tax invoices (and any legacy supplementary PO rows) are aligned to this new PO/WO number and contract dates.
                      </p>
                    ) : null}
                    {editId && !isAfterContractEnd(formData.endDate) ? (
                      <p className="text-[11px] text-amber-700 mt-1">
                        Adding a renewal cycle is allowed only after the contract end date; use these fields for the initial PO when creating a new record.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="sales-po-monthly-value">
                      Monthly value (₹)
                    </label>
                    <input
                      id="sales-po-monthly-value"
                      type="number"
                      value={formData.monthlyValue}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          monthlyValue: e.target.value,
                          monthlyValueManual: true,
                        }))
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                      min="0"
                      step="0.01"
                      placeholder="Total ÷ (years × 12)"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Auto-calculated as total contract value ÷ (contract duration in years × 12). Editable if needed.
                    </p>
                  </div>
                  {isLumpSumMode ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Total contract month</label>
                        <input
                          type="number"
                          value={formData.totalContractMonth}
                          onChange={(e) => setFormData((p) => ({ ...p, totalContractMonth: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                          min="0"
                          step="1"
                          placeholder="Enter total months"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Monthly contract value (₹)
                        </label>
                        <input
                          type="number"
                          readOnly
                          tabIndex={-1}
                          value={monthlyContractValue}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-gray-100 text-gray-700 cursor-not-allowed"
                          placeholder="New Total contract value ÷ total contract month"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                          Calculated as New Total contract value ÷ total contract month.
                        </p>
                      </div>
                    </>
                  ) : null}
                </div>

                {Array.isArray(formData.renewalCycles) && formData.renewalCycles.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Previous renewal cycles</p>
                    <div className="space-y-1 text-xs text-gray-600">
                      {formData.renewalCycles.map((c, i) => (
                        <div key={i} className="flex flex-wrap gap-x-3 gap-y-1">
                          <span className="font-mono">{c.po_wo_number || '—'}</span>
                          <span>₹{Number(c.total_contract_value || 0).toLocaleString('en-IN')}</span>
                          <span>({c.start_date || '—'} to {c.end_date || '—'})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-3">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-gray-700">Rate per Category</label>
                    <button type="button" onClick={addRateRow} className="text-sm text-blue-600 hover:underline">+ Add row</button>
                  </div>
                  <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                          {formData.materialCodeRequired ? 'Material code' : 'SAC/HSN'}
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Qty</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Rate (₹)</th>
                        {isLumpSumPenaltyMode ? (
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Penalty rate (₹)</th>
                        ) : null}
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {formData.ratePerCategory.map((r, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.description}
                              onChange={(e) => updateRateRow(idx, 'description', e.target.value)}
                              className="border border-gray-300 rounded px-2 py-1 w-full"
                              placeholder=""
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={formData.materialCodeRequired ? (r.materialCode || '') : (r.hsnSac || '')}
                              onChange={(e) =>
                                updateRateRow(
                                  idx,
                                  formData.materialCodeRequired ? 'materialCode' : 'hsnSac',
                                  e.target.value
                                )
                              }
                              className="border border-gray-300 rounded px-2 py-1 w-full"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={r.qty}
                              onChange={(e) => updateRateRow(idx, 'qty', e.target.value)}
                              className="border border-gray-300 rounded px-2 py-1 w-full"
                              min="0"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={r.rate}
                              onChange={(e) => updateRateRow(idx, 'rate', e.target.value)}
                              className="border border-gray-300 rounded px-2 py-1 w-full"
                              min="0"
                            />
                          </td>
                          {isLumpSumPenaltyMode ? (
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                value={r.penalty ?? ''}
                                onChange={(e) => updateRateRow(idx, 'penalty', e.target.value)}
                                className="border border-gray-300 rounded px-2 py-1 w-full"
                                min="0"
                                step="0.01"
                              />
                            </td>
                          ) : null}
                          <td className="px-2 py-1">
                            <button type="button" onClick={() => removeRateRow(idx)} className="text-red-600 hover:bg-red-50 rounded p-1">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {formData.materialCodeRequired ? (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">SAC/HSN code (combined)</label>
                      <input
                        type="text"
                        value={formData.hsnCode || formData.sacCode || ''}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            // Keep both keys in sync for old/new readers.
                            hsnCode: e.target.value,
                            sacCode: e.target.value,
                          }))
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        placeholder="Enter SAC/HSN code"
                      />
                    </div>
                  ) : null}
                </div>
                </>
                ) : null}
              </section>
              ) : null}
              {canTaxService ? (
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">4. Tax & Service</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">GST on supply</label>
                    <select
                      value={formData.gstSupplyType}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        setFormData((p) => ({ ...p, gstSupplyType: nextType }));
                        const msg = validateGstSupplyTypeForState(formData.placeOfSupply, formData.billingAddress, nextType);
                        setGstTypeError(msg);
                        if (msg) window.alert(msg);
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      {GST_SUPPLY_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {gstTypeError && <p className="text-red-600 text-xs mt-1">{gstTypeError}</p>}
                  </div>
                  <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Service Description</label><textarea value={formData.serviceDescription} onChange={(e) => setFormData((p) => ({ ...p, serviceDescription: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" rows={2} /></div>
                </div>
              </section>
              ) : null}
              {canTaxInvoicePrint ? (
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">4b. Tax invoice print (from this PO only)</h4>
                <p className="text-xs text-gray-500 mb-3">Terms and ship-to are edited here. Seller CIN, PAN, and MSME details are taken from the standard invoice template (not per PO).</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Terms &amp; conditions (printed on invoice)</label><textarea value={formData.invoiceTermsText} onChange={(e) => setFormData((p) => ({ ...p, invoiceTermsText: e.target.value }))} rows={5} className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm" placeholder="One line per numbered point, or leave blank to use the default template for the PO vertical (MANP / Manpower / …)." /></div>
                </div>
              </section>
              ) : null}
              {showTimelinesSection ? (
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">5. Timelines & Rules</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {canStartDate ? (
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label><FormDateInput value={formData.startDate} onChange={(e) => handleDateInputChange('startDate', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" /></div>
                  ) : null}
                  {canEndDate ? (
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">End Date</label><FormDateInput value={formData.endDate} onChange={(e) => handleDateInputChange('endDate', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" /></div>
                  ) : null}
                  {canBillingType && String(formData.vertical || '').trim().toLowerCase() !== 'training' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Billing Type</label>
                      <select
                        value={formData.billingType}
                        onChange={(e) => {
                          const bt = e.target.value;
                          setFormData((p) => ({
                            ...p,
                            billingType: bt,
                            monthlyDutyQtyMode:
                              bt === 'Monthly' ? (p.monthlyDutyQtyMode || 'po_geometry') : '',
                            lumpSumBillingMode:
                              bt === 'Lump Sum' ? (p.lumpSumBillingMode || 'normal') : '',
                            lumpSumTruckCumulateFinalInvoiceLines:
                              bt === 'Lump Sum' ? !!p.lumpSumTruckCumulateFinalInvoiceLines : false,
                            totalContractMonth: bt === 'Lump Sum' ? p.totalContractMonth : '',
                          }));
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      >
                        {BILLING_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {canDutyPattern ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="sales-po-duty-pattern">
                      Duty pattern
                    </label>
                    <select
                      id="sales-po-duty-pattern"
                      value={formData.dutyPattern}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          dutyPattern: e.target.value,
                          customDutyPattern:
                            e.target.value === DUTY_PATTERN_CUSTOM ? p.customDutyPattern : '',
                        }))
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      <option value="">Select duty pattern</option>
                      {DUTY_PATTERN_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  ) : null}
                  {canDutyPattern && formData.dutyPattern === DUTY_PATTERN_CUSTOM ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="sales-po-duty-pattern-custom">
                        Custom duty pattern
                      </label>
                      <input
                        id="sales-po-duty-pattern-custom"
                        type="text"
                        value={formData.customDutyPattern}
                        onChange={(e) => setFormData((p) => ({ ...p, customDutyPattern: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        placeholder="Enter custom duty pattern"
                      />
                    </div>
                  ) : null}
                  {canRelieverScope ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="sales-po-reliever-scope">
                      Reliever scope
                    </label>
                    <select
                      id="sales-po-reliever-scope"
                      value={formData.relieverScope}
                      onChange={(e) => setFormData((p) => ({ ...p, relieverScope: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      <option value="">Select reliever scope</option>
                      {RELIEVER_SCOPE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  ) : null}
                  {canPaymentTerms ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment terms</label>
                    <select
                      value={formData.paymentTerms}
                      onChange={(e) => {
                        const selectedTerm = e.target.value;
                        setFormData((p) => ({
                          ...p,
                          paymentTerms: selectedTerm,
                          customPaymentTerms:
                            selectedTerm === CUSTOM_MT_PAYMENT_TERM ? p.customPaymentTerms : '',
                        }));
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      {MT_PAYMENT_TERMS_OPTIONS.map((term) => (
                        <option key={term} value={term}>{term}</option>
                      ))}
                      <option value={CUSTOM_MT_PAYMENT_TERM}>{CUSTOM_MT_PAYMENT_TERM}</option>
                    </select>
                  </div>
                  ) : null}
                  {canPaymentTerms && formData.paymentTerms === CUSTOM_MT_PAYMENT_TERM ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Manual payment terms</label>
                      <input
                        type="text"
                        value={formData.customPaymentTerms}
                        onChange={(e) => setFormData((p) => ({ ...p, customPaymentTerms: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        placeholder="e.g. Net 7, 50% advance"
                      />
                    </div>
                  ) : null}
                  {canRemarks ? (
                  <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Remarks (internal)</label><input type="text" value={formData.remarks} onChange={(e) => setFormData((p) => ({ ...p, remarks: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Internal only — not printed on tax invoice" /></div>
                  ) : null}
                  {(canWithFireTender || canMaterialCodeRequired) ? (
                  <div className="md:col-span-2 flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
                    {canWithFireTender ? (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="withFireTender"
                        checked={!!formData.withFireTender}
                        onChange={(e) => setFormData((p) => ({ ...p, withFireTender: e.target.checked }))}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">With fire tender</span>
                    </label>
                    ) : null}
                    {canMaterialCodeRequired ? (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="materialCodeRequired"
                        checked={!!formData.materialCodeRequired}
                        onChange={(e) => setFormData((p) => ({ ...p, materialCodeRequired: e.target.checked }))}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">Material code required on invoice line items</span>
                    </label>
                    ) : null}
                  </div>
                  ) : null}
                  {canRevisedPoFlags ? (
                  <>
                  <p className="md:col-span-2 text-xs font-semibold text-gray-700">
                    Select to enable PO updates and Renewal reminders
                  </p>
                  <div className="flex flex-wrap gap-6"><label className="flex items-center gap-2"><input type="checkbox" checked={formData.revisedPO} onChange={(e) => setFormData((p) => ({ ...p, revisedPO: e.target.checked }))} className="rounded border-gray-300" /><span className="text-sm text-gray-700">PO Updated</span></label><label className="flex items-center gap-2"><input type="checkbox" checked={formData.renewalPending} onChange={(e) => setFormData((p) => ({ ...p, renewalPending: e.target.checked }))} className="rounded border-gray-300" /><span className="text-sm text-gray-700">Renewal Due</span></label></div>
                  </>
                  ) : null}
                </div>
              </section>
              ) : null}
              {showDocumentsSection ? (
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-1">6. Documents</h4>
                <p className="text-xs text-gray-500 mb-4">
                  Attach PO copy, scope of work, and penalty clause (multiple files allowed; max 100 MB each).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {canPoCopy ? (
                  <PoDocumentUploadField
                    id="sales-po-copy-files"
                    label="PO copy"
                    files={formData.poCopyFiles}
                    onChange={(next) => setFormData((p) => ({ ...p, poCopyFiles: next }))}
                  />
                  ) : null}
                  {canScopeOfWork ? (
                  <PoDocumentUploadField
                    id="sales-po-sow-files"
                    label="Scope of work"
                    files={formData.scopeOfWorkFiles}
                    onChange={(next) => setFormData((p) => ({ ...p, scopeOfWorkFiles: next }))}
                  />
                  ) : null}
                  {canPenaltyClause ? (
                  <PoDocumentUploadField
                    id="sales-po-penalty-files"
                    label="Penalty clause"
                    files={formData.penaltyClauseFiles}
                    onChange={(next) => setFormData((p) => ({ ...p, penaltyClauseFiles: next }))}
                  />
                  ) : null}
                </div>
              </section>
              ) : null}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2 bg-white sticky bottom-0">
              {saveError && <p className="text-sm text-red-600 mr-auto self-center">{saveError}</p>}
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                onClick={savePO}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editId ? 'Update' : 'Save'} PO/WO
              </button>
            </div>
          </div>
        </div>
      )}
      {viewPoId && poForView && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">View PO/WO</h3>
                <p className="text-sm text-gray-500 font-mono mt-0.5">{poForView.ocNumber || '–'}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewPoId(null)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 shrink-0"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {(canLegalName || canLocationName || canGstin || canPlaceOfSupply || canBillingAddress || canShippingAddress) ? (
              <section className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Client & site</p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  {canLegalName ? <PoViewField label="Legal name" value={poForView.legalName} /> : null}
                  {canLegalName ? <PoViewField label="Site ID" value={poForView.siteId} /> : null}
                  {canLocationName ? <PoViewField label="Location" value={poForView.locationName} /> : null}
                  {canGstin ? <PoViewField label="GSTIN" value={poForView.gstin} className="text-sm font-mono text-gray-900" /> : null}
                  {canPlaceOfSupply ? <PoViewField label="Place of supply" value={poForView.placeOfSupply} /> : null}
                  {canBillingAddress ? <PoViewField label="Billing address" value={poForView.billingAddress} className="text-sm text-gray-900 sm:col-span-2" /> : null}
                  {canShippingAddress ? <PoViewField label="Ship-to address" value={poForView.shippingAddress} className="text-sm text-gray-900 sm:col-span-2" /> : null}
                </dl>
              </section>
              ) : null}

              {(canOcNumber || canPoFinancials || canPoDate || canDutyPattern || canRelieverScope || canWithFireTender || canBillingType || canPaymentTerms) ? (
              <section className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">PO / financials</p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  {canOcNumber ? <PoViewField label="Line" value={poDepartmentLabel(poForView)} /> : null}
                  {canPoFinancials ? <PoViewField label="PO / WO number" value={poForView.poWoNumber || poForView.po_wo_number} className="text-sm font-mono text-gray-900" /> : null}
                  {canOcNumber ? <PoViewField label="Vendor code" value={poForView.vendorCode || poForView.vendor_code} /> : null}
                  {canPoDate ? <PoViewField label="PO date" value={formatDateDdMmYyyy(poForView.poDate || poForView.po_date)} /> : null}
                  {canPoFinancials ? <PoViewField label="Total contract value" value={formatPoCurrency(poForView.totalContractValue ?? poForView.total_contract_value)} /> : null}
                  {canPoFinancials ? <PoViewField label="Monthly value" value={formatPoCurrency(poForView.monthlyValue ?? poForView.monthly_value)} /> : null}
                  {canBillingType ? <PoViewField label="Billing type" value={poForView.billingType || poForView.poType || poForView.po_type} /> : null}
                  {canPaymentTerms ? <PoViewField label="Payment terms" value={poForView.paymentTerms || poForView.payment_terms} /> : null}
                  {canDutyPattern ? <PoViewField label="Duty pattern" value={resolvePoDutyPatternLabel(poForView)} /> : null}
                  {canRelieverScope ? <PoViewField label="Reliever scope" value={poForView.relieverScope || poForView.reliever_scope} /> : null}
                  {canWithFireTender ? (
                  <PoViewField
                    label="With fire tender"
                    value={(poForView.withFireTender ?? poForView.with_fire_tender) ? 'Yes' : 'No'}
                  />
                  ) : null}
                </dl>
              </section>
              ) : null}

              {(canStartDate || canEndDate || canBillingBasic || canRemarks) ? (
              <section className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Contract period & status</p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  {(canStartDate || canEndDate) ? (
                  <PoViewField
                    label="Service period"
                    value={`${formatDateDdMmYyyy(poForView.startDate || poForView.start_date) || '—'} to ${formatDateDdMmYyyy(poForView.endDate || poForView.end_date) || '—'}`}
                  />
                  ) : null}
                  <PoViewField label="Contract status" value={poForView.status || '–'} />
                  <PoViewField label="Approval" value={getApprovalBadge(poForView.approvalStatus, poForView)?.label || poForView.approvalStatus || '–'} />
                  {canBillingBasic ? (
                  <PoViewField
                    label="Billing basis"
                    value={isPoWithoutPoBilling(poForView) ? 'Without PO' : 'With PO'}
                  />
                  ) : null}
                  {canRemarks ? <PoViewField label="Remarks" value={poForView.remarks} className="text-sm text-gray-900 sm:col-span-2" /> : null}
                </dl>
              </section>
              ) : null}

              {canPoFinancials && Array.isArray(poForView.ratePerCategory) && poForView.ratePerCategory.length > 0 ? (
                <section className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Rates</p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-200 bg-white text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Qty</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Rate (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {poForView.ratePerCategory.map((row, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2">{row.description || row.designation || '–'}</td>
                            <td className="px-3 py-2 tabular-nums">{row.qty ?? row.quantity ?? '–'}</td>
                            <td className="px-3 py-2 tabular-nums">{row.rate != null ? Number(row.rate).toLocaleString('en-IN') : '–'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {showDocumentsSection ? (
              <section className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Documents</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 min-w-0">
                  {canPoCopy ? <PoViewDocumentList title="PO copy" files={poForView.poCopyFiles || poForView.po_copy_files} /> : null}
                  {canScopeOfWork ? <PoViewDocumentList title="Scope of work" files={poForView.scopeOfWorkFiles || poForView.scope_of_work_files} /> : null}
                  {canPenaltyClause ? <PoViewDocumentList title="Penalty clause" files={poForView.penaltyClauseFiles || poForView.penalty_clause_files} /> : null}
                </div>
              </section>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setViewPoId(null);
                  handleOpenEdit(poForView);
                }}
                className="px-4 py-2 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
              >
                Edit PO/WO
              </button>
              <button type="button" onClick={() => setViewPoId(null)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {viewHistoryPoId && poForHistory && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">History – {poForHistory.ocNumber}</h3>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 mb-4 text-sm text-gray-800">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Current PO on file</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <dt className="text-xs text-gray-500">PO / WO Number</dt>
                  <dd className="font-mono font-medium">{poForHistory.poWoNumber || poForHistory.po_wo_number || '–'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Service period</dt>
                  <dd>
                    {formatDateDdMmYyyy(poForHistory.startDate || poForHistory.start_date) || '—'}{' '}
                    to {formatDateDdMmYyyy(poForHistory.endDate || poForHistory.end_date) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Name</dt>
                  <dd>{poForHistory.currentCoordinator || '–'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Designation</dt>
                  <dd>
                    {poForHistory.contactDesignation ||
                      normalizeContactPersonsList(
                        poForHistory.contactPersons || readContactPersonsFromHistory(poForHistory.updateHistory),
                        poForHistory
                      )[0]?.designation ||
                      '–'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Contact Number</dt>
                  <dd className="font-mono tabular-nums">{poForHistory.contactNumber || '–'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Email ID</dt>
                  <dd>{poForHistory.contactEmail || '–'}</dd>
                </div>
              </dl>
            </div>

            {poNumberHistoryRows.length > 0 ? (
              <>
                <p className="text-sm font-medium text-gray-700 mb-2">PO number history</p>
                <div className="overflow-x-auto mb-4">
                  <table className="min-w-full border border-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">PO / WO Number</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Start date</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">End date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {poNumberHistoryRows.map((entry, i) => (
                        <tr key={`${entry.poWoNumber}-${i}`}>
                          <td className="px-3 py-2 text-sm font-mono">
                            {entry.poWoNumber || '–'}
                            {entry.isCurrentOnRow ? (
                              <span className="ml-2 text-[10px] font-sans font-medium text-amber-700">current</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-sm">{formatDateDdMmYyyy(entry.startDate) || '–'}</td>
                          <td className="px-3 py-2 text-sm">{formatDateDdMmYyyy(entry.endDate) || '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            <p className="text-sm font-medium text-gray-700 mb-2">PO update log</p>
            <ul className="text-sm text-gray-600 list-disc pl-5 mb-4 space-y-1">
              {(poForHistory.updateHistory || []).filter((h) => !isHiddenPoHistoryEntry(h)).length === 0 && (
                <li className="list-none text-gray-400">No PO updates recorded yet.</li>
              )}
              {(poForHistory.updateHistory || []).filter((h) => !isHiddenPoHistoryEntry(h)).map((h, i) => (
                <li key={i}><span className="font-mono text-xs">{h.at ? formatDateTimeDdMmYyyy(h.at) : '–'}</span> — {h.summary || '—'}</li>
              ))}
            </ul>
            <p className="text-sm font-medium text-gray-700 mb-2">Contact persons</p>
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Designation</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Contact Number</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Email ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {normalizeContactPersonsList(
                    poForHistory.contactPersons || readContactPersonsFromHistory(poForHistory.updateHistory),
                    poForHistory
                  ).map((row, i) => (
                    <tr key={`poc-${i}`}>
                      <td className="px-3 py-2 text-sm">{row.name || '–'}</td>
                      <td className="px-3 py-2 text-sm">{row.designation || '–'}</td>
                      <td className="px-3 py-2 text-sm font-mono tabular-nums">{row.contactNumber || '–'}</td>
                      <td className="px-3 py-2 text-sm">{row.email || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-2">Contact history</p>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Designation</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Contact Number</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Email ID</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">From</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {poContactHistoryRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-3 text-sm text-gray-400 text-center">
                        No contact history recorded yet.
                      </td>
                    </tr>
                  ) : (
                    poContactHistoryRows.map((h, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-sm">{h.name || '–'}</td>
                        <td className="px-3 py-2 text-sm">{h.designation || '–'}</td>
                        <td className="px-3 py-2 text-sm">{h.number || '–'}</td>
                        <td className="px-3 py-2 text-sm">{h.email || '–'}</td>
                        <td className="px-3 py-2 text-sm">{formatDateDdMmYyyy(h.from) || '–'}</td>
                        <td className="px-3 py-2 text-sm">{h.to ? formatDateDdMmYyyy(h.to) : 'Current'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {poContactHistoryRows.some((h) => h.isCurrentFallback) ? (
              <p className="text-xs text-amber-700 mt-2">
                Showing current coordinator from the PO record. Save the PO once to persist contact history in the database.
              </p>
            ) : null}
            <div className="mt-4 flex justify-end"><button type="button" onClick={() => setViewHistoryPoId(null)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POEntry;
