/**
 * Department-based field-level ACL for Commercial → PO Entry (Manpower/Training).
 * Source of department: userProfile.team (Employee Master department label).
 */

import { ROLES, normalizeAppRole } from '../config/roles';

/** Logical field keys used by UI + save ACL (not DB column names). */
export const PO_ENTRY_FIELD = {
  BILLING_BASIC: 'billingBasic',
  PO_DATE: 'poDate',
  LEGAL_NAME: 'legalName',
  BILLING_ADDRESS: 'billingAddress',
  PINCODE_BILL_TO: 'pincodeBillTo',
  SHIPPING_ADDRESS: 'shippingAddress',
  PINCODE_SHIP_TO: 'pincodeShipTo',
  GSTIN: 'gstin',
  PAN_NUMBER: 'panNumber',
  LOCATION_NAME: 'locationName',
  PLACE_OF_SUPPLY: 'placeOfSupply',
  CONTACT_POC: 'contactPoc',
  OC_NUMBER: 'ocNumber',
  PO_FINANCIALS: 'poFinancials',
  TAX_SERVICE: 'taxService',
  TAX_INVOICE_PRINT: 'taxInvoicePrint',
  START_DATE: 'startDate',
  END_DATE: 'endDate',
  BILLING_TYPE: 'billingType',
  PAYMENT_TERMS: 'paymentTerms',
  REMARKS: 'remarks',
  DUTY_PATTERN: 'dutyPattern',
  RELIEVER_SCOPE: 'relieverScope',
  PO_COPY: 'poCopy',
  SCOPE_OF_WORK: 'scopeOfWork',
  PENALTY_CLAUSE: 'penaltyClause',
  MATERIAL_CODE_REQUIRED: 'materialCodeRequired',
  WITH_FIRE_TENDER: 'withFireTender',
  /** Commercial: entire Timelines & Rules section */
  TIMELINES_RULES: 'timelinesRules',
  /** Commercial: entire Documents section */
  DOCUMENTS: 'documents',
  REVISED_PO_FLAGS: 'revisedPoFlags',
};

const F = PO_ENTRY_FIELD;

const TIMELINES_EXPANDED = [
  F.START_DATE,
  F.END_DATE,
  F.BILLING_TYPE,
  F.DUTY_PATTERN,
  F.RELIEVER_SCOPE,
  F.PAYMENT_TERMS,
  F.REMARKS,
  F.WITH_FIRE_TENDER,
  F.MATERIAL_CODE_REQUIRED,
  F.REVISED_PO_FLAGS,
];

const DOCUMENTS_EXPANDED = [F.PO_COPY, F.SCOPE_OF_WORK, F.PENALTY_CLAUSE];

const HR_FIELDS = [
  F.BILLING_BASIC,
  F.PO_DATE,
  F.LEGAL_NAME,
  F.SHIPPING_ADDRESS,
  F.PINCODE_SHIP_TO,
  F.LOCATION_NAME,
  F.PLACE_OF_SUPPLY,
  F.CONTACT_POC,
  F.OC_NUMBER,
  F.TAX_INVOICE_PRINT,
  F.REMARKS,
  F.PENALTY_CLAUSE,
  F.SCOPE_OF_WORK,
  F.DUTY_PATTERN,
  F.RELIEVER_SCOPE,
];

const BILLING_FIELDS = [
  F.BILLING_BASIC,
  F.PO_DATE,
  F.LEGAL_NAME,
  F.BILLING_ADDRESS,
  F.PINCODE_BILL_TO,
  F.SHIPPING_ADDRESS,
  F.GSTIN,
  F.PAN_NUMBER,
  F.LOCATION_NAME,
  F.PLACE_OF_SUPPLY,
  F.CONTACT_POC,
  F.OC_NUMBER,
  F.PO_FINANCIALS,
  F.TAX_SERVICE,
  F.TAX_INVOICE_PRINT,
  F.START_DATE,
  F.END_DATE,
  F.BILLING_TYPE,
  F.PAYMENT_TERMS,
  F.REMARKS,
  F.PO_COPY,
  F.MATERIAL_CODE_REQUIRED,
  F.WITH_FIRE_TENDER,
];

const COMMERCIAL_FIELDS = [
  F.BILLING_BASIC,
  F.PO_DATE,
  F.LEGAL_NAME,
  F.BILLING_ADDRESS,
  F.PINCODE_BILL_TO,
  F.SHIPPING_ADDRESS,
  F.GSTIN,
  F.PAN_NUMBER,
  F.LOCATION_NAME,
  F.PLACE_OF_SUPPLY,
  F.CONTACT_POC,
  F.OC_NUMBER,
  F.PO_FINANCIALS,
  F.TAX_SERVICE,
  F.TAX_INVOICE_PRINT,
  F.TIMELINES_RULES,
  F.DOCUMENTS,
];

/** Client PO object keys controlled by each logical field. */
const FIELD_TO_CLIENT_KEYS = {
  [F.BILLING_BASIC]: ['poBasis', 'billingWithoutPo'],
  [F.PO_DATE]: ['poDate'],
  [F.LEGAL_NAME]: ['legalName', 'siteId'],
  [F.BILLING_ADDRESS]: ['billingAddress'],
  [F.PINCODE_BILL_TO]: ['pincode'],
  [F.SHIPPING_ADDRESS]: ['shippingAddress'],
  [F.PINCODE_SHIP_TO]: ['shipToPincode', 'billToShipToPinSame'],
  [F.GSTIN]: ['gstin'],
  [F.PAN_NUMBER]: ['panNumber'],
  [F.LOCATION_NAME]: ['locationName'],
  [F.PLACE_OF_SUPPLY]: ['placeOfSupply'],
  [F.CONTACT_POC]: [
    'contactPersons',
    'currentCoordinator',
    'contactDesignation',
    'contactNumber',
    'contactEmail',
    'contactHistoryLog',
  ],
  [F.OC_NUMBER]: ['ocNumber', 'vertical', 'ocSeries', 'vendorCodeDigits', 'vendorCode', 'ocFyEdit'],
  [F.PO_FINANCIALS]: [
    'poWoNumber',
    'newCyclePoWoNumber',
    'totalContractValue',
    'newCycleTotalContractValue',
    'ratePerCategory',
    'renewalCycles',
    'totalContractMonth',
    'monthlyContractValue',
    'monthlyValue',
    'monthlyValueManual',
    'sacCode',
    'hsnCode',
  ],
  [F.TAX_SERVICE]: ['gstSupplyType', 'serviceDescription', 'sacCode', 'hsnCode'],
  [F.TAX_INVOICE_PRINT]: ['invoiceTermsText'],
  [F.START_DATE]: ['startDate'],
  [F.END_DATE]: ['endDate'],
  [F.BILLING_TYPE]: [
    'billingType',
    'monthlyDutyQtyMode',
    'lumpSumBillingMode',
    'lumpSumTruckCumulateFinalInvoiceLines',
  ],
  [F.PAYMENT_TERMS]: ['paymentTerms', 'customPaymentTerms', 'paymentTermMode', 'paymentTermDays'],
  [F.REMARKS]: ['remarks'],
  [F.DUTY_PATTERN]: ['dutyPattern', 'customDutyPattern'],
  [F.RELIEVER_SCOPE]: ['relieverScope'],
  [F.PO_COPY]: ['poCopyFiles'],
  [F.SCOPE_OF_WORK]: ['scopeOfWorkFiles'],
  [F.PENALTY_CLAUSE]: ['penaltyClauseFiles'],
  [F.MATERIAL_CODE_REQUIRED]: ['materialCodeRequired'],
  [F.WITH_FIRE_TENDER]: ['withFireTender'],
  [F.REVISED_PO_FLAGS]: ['revisedPO', 'renewalPending'],
};

/** DB snake_case columns controlled by each logical field (for API merge). */
const FIELD_TO_DB_COLUMNS = {
  [F.BILLING_BASIC]: ['billing_without_po'],
  [F.PO_DATE]: ['po_date'],
  [F.LEGAL_NAME]: ['legal_name', 'site_id'],
  [F.BILLING_ADDRESS]: ['billing_address'],
  [F.PINCODE_BILL_TO]: ['pincode'],
  [F.SHIPPING_ADDRESS]: ['shipping_address'],
  [F.PINCODE_SHIP_TO]: ['ship_to_pincode'],
  [F.GSTIN]: ['gstin'],
  [F.PAN_NUMBER]: ['pan_number'],
  [F.LOCATION_NAME]: ['location_name'],
  [F.PLACE_OF_SUPPLY]: ['place_of_supply'],
  [F.CONTACT_POC]: ['current_coordinator', 'contact_number', 'contact_email'],
  [F.OC_NUMBER]: ['oc_number', 'oc_series', 'vertical', 'vendor_code'],
  [F.PO_FINANCIALS]: [
    'po_wo_number',
    'total_contract_value',
    'total_contract_month',
    'monthly_contract_value',
    'monthly_value',
    'sac_code',
    'hsn_code',
    'renewal_cycles',
    'renewed_po_wo_number',
    'renewed_total_contract_value',
    'renewed_start_date',
    'renewed_end_date',
  ],
  [F.TAX_SERVICE]: ['gst_supply_type', 'service_description', 'sac_code', 'hsn_code'],
  [F.TAX_INVOICE_PRINT]: ['invoice_terms_text'],
  [F.START_DATE]: ['start_date'],
  [F.END_DATE]: ['end_date'],
  [F.BILLING_TYPE]: ['po_type', 'billing_type', 'monthly_duty_qty_mode', 'lump_sum_billing_mode'],
  [F.PAYMENT_TERMS]: ['payment_terms'],
  [F.REMARKS]: ['remarks'],
  [F.DUTY_PATTERN]: ['duty_pattern', 'custom_duty_pattern'],
  [F.RELIEVER_SCOPE]: ['reliever_scope'],
  [F.PO_COPY]: ['po_copy_files'],
  [F.SCOPE_OF_WORK]: ['scope_of_work_files'],
  [F.PENALTY_CLAUSE]: ['penalty_clause_files'],
  [F.MATERIAL_CODE_REQUIRED]: ['material_code_required'],
  [F.WITH_FIRE_TENDER]: ['with_fire_tender'],
  [F.REVISED_PO_FLAGS]: ['revised_po', 'renewal_pending'],
};

/** Keys always taken from the save payload (workflow / identity / audit). */
const SAVE_SYSTEM_CLIENT_KEYS = new Set([
  'id',
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
  'status',
  'approvalStatus',
  'approvalSentAt',
  'approvedByUserId',
  'approvedByName',
  'approvedAt',
  'rejectedByUserId',
  'rejectedByName',
  'rejectedAt',
  'updateHistory',
  'moduleType',
  'isSupplementary',
  'supplementaryParentPoId',
  'supplementarySeq',
  'supplementaryRequestStatus',
  'supplementaryReason',
  'supplementaryRequestedAt',
  'supplementaryApprovedAt',
  'poReceivedDate',
  'billingCycle',
  'advancePercent',
  'sellerCin',
  'sellerPan',
  'msmeRegistrationNo',
  'msmeClause',
]);

/** Safe create defaults when a field is not in the caller's allow-list. */
const CREATE_CLIENT_DEFAULTS = {
  legalName: '',
  siteId: '',
  locationName: '',
  billingAddress: '',
  shippingAddress: '',
  placeOfSupply: '',
  pincode: null,
  shipToPincode: null,
  billToShipToPinSame: true,
  gstin: '',
  panNumber: '',
  currentCoordinator: '',
  contactDesignation: '',
  contactNumber: '',
  contactEmail: '',
  contactPersons: [{ name: '', designation: '', contactNumber: '', email: '' }],
  contactHistoryLog: [],
  ocNumber: '',
  vertical: 'Manpower',
  ocSeries: '1',
  vendorCodeDigits: '',
  vendorCode: '',
  ocFyEdit: null,
  gstSupplyType: 'intra',
  serviceDescription: '',
  sacCode: '',
  hsnCode: '',
  poWoNumber: '',
  newCyclePoWoNumber: '',
  totalContractValue: 0,
  newCycleTotalContractValue: '',
  ratePerCategory: [{ description: 'Other', hsnSac: '', materialCode: '', qty: 0, rate: 0, penalty: 0 }],
  renewalCycles: [],
  totalContractMonth: null,
  monthlyContractValue: null,
  monthlyValue: null,
  monthlyValueManual: false,
  startDate: '',
  endDate: '',
  billingType: 'Per Day',
  monthlyDutyQtyMode: null,
  lumpSumBillingMode: null,
  lumpSumTruckCumulateFinalInvoiceLines: false,
  paymentTerms: null,
  customPaymentTerms: '',
  paymentTermMode: null,
  paymentTermDays: null,
  materialCodeRequired: false,
  withFireTender: false,
  poCopyFiles: [],
  scopeOfWorkFiles: [],
  penaltyClauseFiles: [],
  revisedPO: false,
  renewalPending: false,
  dutyPattern: null,
  customDutyPattern: null,
  relieverScope: null,
  invoiceTermsText: '',
  remarks: '',
  poDate: null,
  poBasis: 'with_po',
  billingWithoutPo: false,
};

export const PO_ENTRY_FIELD_ACL_META = '__poEntryFieldAcl';

function normalizeDeptKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * @returns {'all' | 'hr' | 'billing' | 'commercial'}
 */
export function resolvePoEntryAclDepartment(userProfile) {
  const role = normalizeAppRole(userProfile?.role);
  if (role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO) {
    return 'all';
  }

  const team = normalizeDeptKey(userProfile?.team);
  if (!team) return 'all';

  if (team === 'hr' || team === 'dahej-hr') return 'hr';
  if (team === 'billing') return 'billing';
  if (
    team === 'commercial' ||
    team === 'commercialmt' ||
    team === 'sales' ||
    team === 'commercial mt'
  ) {
    return 'commercial';
  }

  // Finance/Accounts often owns billing fields in practice.
  if (team === 'finance' || team === 'finance/accounts') return 'billing';

  // Other departments with module access: no field-level restriction.
  return 'all';
}

function expandLogicalFields(fields) {
  const out = new Set();
  for (const f of fields || []) {
    if (f === F.TIMELINES_RULES) {
      TIMELINES_EXPANDED.forEach((x) => out.add(x));
      continue;
    }
    if (f === F.DOCUMENTS) {
      DOCUMENTS_EXPANDED.forEach((x) => out.add(x));
      continue;
    }
    out.add(f);
  }
  return out;
}

/**
 * @returns {Set<string>|null} null = unrestricted (all fields)
 */
export function getPoEntryAllowedLogicalFields(userProfile) {
  const dept = resolvePoEntryAclDepartment(userProfile);
  if (dept === 'all') return null;
  if (dept === 'hr') return expandLogicalFields(HR_FIELDS);
  if (dept === 'billing') return expandLogicalFields(BILLING_FIELDS);
  if (dept === 'commercial') return expandLogicalFields(COMMERCIAL_FIELDS);
  return null;
}

export function canEditPoEntryField(userProfile, logicalField) {
  const allowed = getPoEntryAllowedLogicalFields(userProfile);
  if (allowed == null) return true;
  return allowed.has(logicalField);
}

export function getPoEntryAllowedClientKeys(userProfile) {
  const allowed = getPoEntryAllowedLogicalFields(userProfile);
  if (allowed == null) return null;
  const keys = new Set();
  for (const field of allowed) {
    const mapped = FIELD_TO_CLIENT_KEYS[field];
    if (mapped) mapped.forEach((k) => keys.add(k));
  }
  return keys;
}

export function getPoEntryAllowedDbColumns(userProfile) {
  const allowed = getPoEntryAllowedLogicalFields(userProfile);
  if (allowed == null) return null;
  const cols = new Set();
  for (const field of allowed) {
    const mapped = FIELD_TO_DB_COLUMNS[field];
    if (mapped) mapped.forEach((c) => cols.add(c));
  }
  return cols;
}

export function poEntryAclDepartmentLabel(userProfile) {
  const dept = resolvePoEntryAclDepartment(userProfile);
  if (dept === 'hr') return 'HR';
  if (dept === 'billing') return 'Billing';
  if (dept === 'commercial') return 'Commercial';
  if (dept === 'all') return '';
  return '';
}

/**
 * Merge save payload so unauthorized fields keep previous values (edit)
 * or safe create defaults (create). Prevents DevTools / crafted payloads
 * from writing restricted columns.
 */
export function applyPoEntryFieldAclOnSave({ nextPo, prevPo, userProfile }) {
  const allowedKeys = getPoEntryAllowedClientKeys(userProfile);
  if (allowedKeys == null) {
    return nextPo;
  }

  if (!prevPo) {
    const out = { ...nextPo };
    for (const key of Object.keys(out)) {
      if (SAVE_SYSTEM_CLIENT_KEYS.has(key) || allowedKeys.has(key)) continue;
      // Without-PO creates still need generated OC / WOPO identifiers for tracking.
      if (
        out.billingWithoutPo &&
        (key === 'poWoNumber' || key === 'ocNumber' || key === 'ocSeries' || key === 'vertical' || key === 'vendorCode')
      ) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(CREATE_CLIENT_DEFAULTS, key)) {
        out[key] = CREATE_CLIENT_DEFAULTS[key];
      }
    }
    out[PO_ENTRY_FIELD_ACL_META] = {
      allowedClientKeys: [...allowedKeys],
      allowedDbColumns: [...(getPoEntryAllowedDbColumns(userProfile) || [])],
      canReplaceRateCategories: allowedKeys.has('ratePerCategory'),
      canUploadPoCopy: allowedKeys.has('poCopyFiles'),
      canUploadScopeOfWork: allowedKeys.has('scopeOfWorkFiles'),
      canUploadPenaltyClause: allowedKeys.has('penaltyClauseFiles'),
      canUpdateContactLog: allowedKeys.has('contactHistoryLog'),
    };
    return out;
  }

  const out = { ...prevPo };
  for (const key of Object.keys(nextPo)) {
    if (key === PO_ENTRY_FIELD_ACL_META) continue;
    if (SAVE_SYSTEM_CLIENT_KEYS.has(key) || allowedKeys.has(key)) {
      out[key] = nextPo[key];
    }
  }
  out.updated_at = nextPo.updated_at ?? out.updated_at;
  out.updatedAt = nextPo.updatedAt ?? out.updatedAt;
  out.status = nextPo.status ?? out.status;
  out[PO_ENTRY_FIELD_ACL_META] = {
    allowedClientKeys: [...allowedKeys],
    allowedDbColumns: [...(getPoEntryAllowedDbColumns(userProfile) || [])],
    canReplaceRateCategories: allowedKeys.has('ratePerCategory'),
    canUploadPoCopy: allowedKeys.has('poCopyFiles'),
    canUploadScopeOfWork: allowedKeys.has('scopeOfWorkFiles'),
    canUploadPenaltyClause: allowedKeys.has('penaltyClauseFiles'),
    canUpdateContactLog: allowedKeys.has('contactHistoryLog'),
  };
  return out;
}

/**
 * Filter a client-profile snapshot so only permitted identity fields are applied.
 */
export function filterClientSnapshotByPoEntryAcl(snapshot, userProfile) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const allowedKeys = getPoEntryAllowedClientKeys(userProfile);
  if (allowedKeys == null) return snapshot;
  const out = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (allowedKeys.has(key)) out[key] = value;
  }
  return out;
}

/**
 * Restore DB columns the caller is not allowed to change.
 */
export function applyPoEntryFieldAclToDbPayload(payload, existingRow, aclMeta) {
  if (!aclMeta || !existingRow || !payload) return payload;
  const allowed = new Set(aclMeta.allowedDbColumns || []);
  if (!allowed.size && !(aclMeta.allowedClientKeys || []).length) {
    // Empty allow-list: keep identity + workflow only from payload; restore business cols.
  }
  const SYSTEM_DB = new Set([
    'id',
    'created_at',
    'updated_at',
    'status',
    'approval_status',
    'approval_sent_at',
    'update_history',
    'is_supplementary',
    'supplementary_parent_po_id',
    'supplementary_request_status',
    'supplementary_reason',
    'supplementary_requested_at',
    'supplementary_approved_at',
    'seller_cin',
    'seller_pan',
    'msme_registration_no',
    'msme_clause',
    'billing_cycle',
    'po_quantity',
    'po_received_date',
    'payment_term_mode',
    'payment_term_days',
    'advance_percent',
    'custom_advance_percent',
  ]);

  const next = { ...payload };
  for (const key of Object.keys(next)) {
    if (SYSTEM_DB.has(key) || allowed.has(key)) continue;
    if (key in existingRow) next[key] = existingRow[key];
  }
  return next;
}

export function stripPoEntryFieldAclMeta(po) {
  if (!po || typeof po !== 'object') return po;
  if (!(PO_ENTRY_FIELD_ACL_META in po)) return po;
  const { [PO_ENTRY_FIELD_ACL_META]: _acl, ...rest } = po;
  return rest;
}
