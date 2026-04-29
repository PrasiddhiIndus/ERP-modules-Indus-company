/**
 * Billing module data store – localStorage (JSON) for flow understanding.
 * Hierarchy: Commercial (PO) → Billing (Invoice) → Tracking (Payment Advice).
 * No backend; all data in browser localStorage.
 */

const STORAGE_KEYS = {
  COMMERCIAL_POS: 'erp_commercial_pos',
  CONTACT_HISTORY: 'erp_contact_history',
  INVOICES: 'erp_invoices',
  CREDIT_DEBIT_NOTES: 'erp_credit_debit_notes',
  PAYMENT_ADVICE: 'erp_payment_advice',
  EINVOICE_CACHE: 'erp_einvoice_cache',
};

// ——— Commercial PO (Master) ———
// Each PO has: id, siteId, locationName, legalName, billingAddress, gstin,
// currentCoordinator, contactNumber, contactHistoryLog (array of { name, number, from, to }),
// ocNumber (IFSPL-Vertical-OC-YY/YY-Series), poWoNumber, poQuantity,
// ratePerCategory (array of { designation, rate }), totalContractValue,
// sacCode, hsnCode, serviceDescription, startDate, endDate,
// billingType (Per Day | Monthly | Lump Sum), billingCycle (30|45|60), paymentTerms,
// revisedPO (boolean), renewalPending (boolean), status (active|expired)
export const getCommercialPOs = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COMMERCIAL_POS);
    return raw ? JSON.parse(raw) : getDefaultCommercialPOs();
  } catch {
    return getDefaultCommercialPOs();
  }
};

export const setCommercialPOs = (list) => {
  localStorage.setItem(STORAGE_KEYS.COMMERCIAL_POS, JSON.stringify(list));
};

function getDefaultCommercialPOs() {
  return [
    {
      id: 1,
      siteId: 'SITE-001',
      locationName: 'ABC Municipal Corp - Main',
      legalName: 'ABC Municipal Corporation',
      billingAddress: '123 Main Rd, City - 400001, Maharashtra',
      gstin: '27AABCU9603R1ZM',
      currentCoordinator: 'Rajesh Kumar',
      contactNumber: '9876543210',
      contactHistoryLog: [
        { name: 'Priya Sharma', number: '9123456789', from: '2024-01-01', to: '2026-06-30' },
        { name: 'Rajesh Kumar', number: '9876543210', from: '2024-07-01', to: null },
      ],
      ocNumber: 'IFSPL-MANP-OC-25/26-00001',
      poWoNumber: 'WO-2025-001',
      poQuantity: 50,
      ratePerCategory: [
        { designation: 'Unskilled', rate: 12000 },
        { designation: 'Semi-skilled', rate: 18000 },
        { designation: 'Skilled', rate: 25000 },
      ],
      totalContractValue: 1500000,
      sacCode: '9985',
      hsnCode: '9983',
      serviceDescription: 'Security and facility management services as per contract.',
      startDate: '2025-01-15',
      endDate: '2026-12-31',
      billingType: 'Monthly',
      billingCycle: 30,
      paymentTerms: 'Net 30 days',
      revisedPO: false,
      renewalPending: false,
      status: 'active',
    },
    {
      id: 2,
      siteId: 'SITE-002',
      locationName: 'XYZ Industries - Plant',
      legalName: 'XYZ Industries Ltd',
      billingAddress: '456 Industrial Area, Mumbai - 400002, Maharashtra',
      gstin: '27BXYZP1234A1Z5',
      currentCoordinator: 'Amit Patel',
      contactNumber: '9988776655',
      contactHistoryLog: [{ name: 'Amit Patel', number: '9988776655', from: '2025-02-01', to: null }],
      ocNumber: 'IFSPL-MANP-OC-25/26-00002',
      poWoNumber: 'PO-2025-002',
      poQuantity: 25,
      ratePerCategory: [
        { designation: 'Unskilled', rate: 10000 },
        { designation: 'Semi-skilled', rate: 15000 },
      ],
      totalContractValue: 800000,
      sacCode: '9985',
      hsnCode: '9983',
      serviceDescription: 'Manpower supply for plant operations.',
      startDate: '2025-02-01',
      endDate: '2026-06-30',
      billingType: 'Per Day',
      billingCycle: 45,
      paymentTerms: 'Net 45 days',
      revisedPO: false,
      renewalPending: true,
      status: 'active',
    },
    {
      id: 3,
      siteId: 'SITE-003',
      locationName: 'PQR Infra - Project Site',
      legalName: 'PQR Infrastructure Pvt Ltd',
      billingAddress: '789 Highway Project, Pune - 411001, Maharashtra',
      gstin: '27APQRM5678B2Z9',
      currentCoordinator: 'Sneha Desai',
      contactNumber: '9765432109',
      contactHistoryLog: [{ name: 'Sneha Desai', number: '9765432109', from: '2025-01-01', to: null }],
      ocNumber: 'IFSPL-MANP-OC-25/26-00003',
      poWoNumber: 'PO-2025-003',
      poQuantity: 1,
      ratePerCategory: [{ designation: 'Project Lump Sum', rate: 2500000 }],
      totalContractValue: 2500000,
      sacCode: '9985',
      hsnCode: '9983',
      serviceDescription: 'One-time project delivery as per contract scope.',
      startDate: '2025-03-01',
      endDate: '2026-08-31',
      billingType: 'Lump Sum',
      billingCycle: 60,
      paymentTerms: 'Net 60 days',
      revisedPO: false,
      renewalPending: false,
      status: 'active',
    },
  ];
}

// ——— Contact History (keyed by PO id) ———
export const getContactHistory = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONTACT_HISTORY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const setContactHistory = (byPoId) => {
  localStorage.setItem(STORAGE_KEYS.CONTACT_HISTORY, JSON.stringify(byPoId));
};

// ——— Invoices ———
// id, poId, siteId, taxInvoiceNumber, client details (from PO), rate details (from PO),
// billingType (from PO – used by Manage Invoices filter: Monthly | Per Day | Lump Sum),
// actualsInput (e.g. { month, year, lines: [{ designation, quantity }] }),
// expectedPOAmount, calculatedInvoiceAmount, lessMoreBilling (+/-),
// attachments: [{ name, type: 'attendance'|'wage_compliance', url }],
// paStatus: 'Pending'|'Received', paymentStatus: true|false,
// pendingAmount, e_invoice_irn, e_invoice_ack_no, e_invoice_ack_dt, e_invoice_signed_qr, created_at
function getDefaultInvoices() {
  const created = new Date().toISOString().slice(0, 10);
  return [
    {
      id: 'inv-1',
      poId: 1,
      siteId: 'SITE-001',
      taxInvoiceNumber: 'INV-M-2025-001',
      ocNumber: 'IFSPL-MANP-OC-25/26-00001',
      clientLegalName: 'ABC Municipal Corporation',
      clientAddress: '123 Main Rd, City - 400001, Maharashtra',
      billingType: 'Monthly',
      calculatedInvoiceAmount: 125000,
      totalAmount: 125000,
      paStatus: 'Pending',
      paymentStatus: false,
      created_at: created,
    },
    {
      id: 'inv-2',
      poId: 2,
      siteId: 'SITE-002',
      taxInvoiceNumber: 'INV-PD-2025-001',
      ocNumber: 'IFSPL-MANP-OC-25/26-00002',
      clientLegalName: 'XYZ Industries Ltd',
      clientAddress: '456 Industrial Area, Mumbai - 400002, Maharashtra',
      billingType: 'Per Day',
      calculatedInvoiceAmount: 375000,
      totalAmount: 375000,
      paStatus: 'Pending',
      paymentStatus: false,
      created_at: created,
    },
    {
      id: 'inv-3',
      poId: 3,
      siteId: 'SITE-003',
      taxInvoiceNumber: 'INV-LS-2025-001',
      ocNumber: 'IFSPL-MANP-OC-25/26-00003',
      clientLegalName: 'PQR Infrastructure Pvt Ltd',
      clientAddress: '789 Highway Project, Pune - 411001, Maharashtra',
      billingType: 'Lump Sum',
      calculatedInvoiceAmount: 2500000,
      totalAmount: 2500000,
      paStatus: 'Pending',
      paymentStatus: false,
      created_at: created,
    },
  ];
}

export const getInvoices = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INVOICES);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const setInvoices = (list) => {
  localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(list));
};

// ——— Credit / Debit Notes ———
// id, parentTaxInvoiceNumber, parentInvoiceId, type: 'credit'|'debit', amount, reason,
// e_invoice_irn, created_at
export const getCreditDebitNotes = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CREDIT_DEBIT_NOTES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const setCreditDebitNotes = (list) => {
  localStorage.setItem(STORAGE_KEYS.CREDIT_DEBIT_NOTES, JSON.stringify(list));
};

// ——— Payment Advice (keyed by invoiceId) ———
// { paReceivedDate, paFileUrl, penaltyDeductionAmount, deductionRemarks }
export const getPaymentAdvice = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PAYMENT_ADVICE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const setPaymentAdvice = (byInvoiceId) => {
  localStorage.setItem(STORAGE_KEYS.PAYMENT_ADVICE, JSON.stringify(byInvoiceId));
};

// ——— E-Invoice cache (IRN/QR by invoice or note id) ———
export const getEInvoiceCache = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EINVOICE_CACHE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const setEInvoiceCache = (cache) => {
  localStorage.setItem(STORAGE_KEYS.EINVOICE_CACHE, JSON.stringify(cache));
};
