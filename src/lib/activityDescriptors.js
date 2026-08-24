/**
 * Activity log descriptors — human-readable, page/action-specific summaries.
 *
 * Add a new entity: append one key under ACTIVITY_DESCRIPTORS.
 * Add a new screen module: append one prefix under ROUTE_MODULE_MAP (longest match wins).
 */

/** Route prefix → module label. Longer / more specific prefixes should be listed first. */
export const ROUTE_MODULE_MAP = [
  ['/app/billing/create-invoice', 'Billing · Create invoice'],
  ['/app/billing/manage-invoices', 'Billing · Manage invoices'],
  ['/app/billing/add-on-invoices', 'Billing · Add-on invoices'],
  ['/app/billing/generated-e-invoice', 'Billing · E-invoice'],
  ['/app/billing/credit-notes', 'Billing · Credit / debit notes'],
  ['/app/billing/reports', 'Billing · Reports'],
  ['/app/billing/tracking', 'Billing · Money tracking'],
  ['/app/billing/notifications', 'Billing · Reminders'],
  ['/app/billing/tracker', 'Billing · Cycle tracker'],
  ['/app/billing', 'Billing'],
  ['/app/commercial/manpower-training/po-entry', 'Commercial MT · PO entry'],
  ['/app/commercial/manpower-training/contact-log', 'Commercial MT · Contact log'],
  ['/app/commercial/manpower-training', 'Commercial MT'],
  ['/app/commercial/rm-mm-amc-iev/po-entry', 'Commercial RM · PO entry'],
  ['/app/commercial/rm-mm-amc-iev', 'Commercial RM · R&M / AMC / IEV'],
  ['/app/commercial', 'Commercial'],
  ['/app/manpower', 'Manpower (Commercial MT)'],
  ['/app/marketing/enquiry-master', 'Marketing · Enquiry master'],
  ['/app/marketing/quotation-tracker', 'Marketing · Quotation tracker'],
  ['/app/marketing', 'Marketing'],
  ['/app/crm-outreach', 'Client Master & Mail Outreach'],
  ['/app/maintenance', 'Maintenance'],
  ['/app/hr/calling-master', 'HR · Recruitment / Calling master'],
  ['/app/hr/site-iom', 'HR · Site Employee IOM'],
  ['/app/hr/payroll/salary', 'HR · Salary management'],
  ['/app/hr/employee-master', 'HR · Employee master'],
  ['/app/hr', 'HR'],
  ['/app/attendance', 'HR · Attendance'],
  ['/app/people-management', 'HR · People management'],
  ['/app/admin/employee/attendance-inputs', 'Admin · Raw attendance'],
  ['/app/admin/employee/attendance-daily', 'Admin · Daily attendance register'],
  ['/app/admin/employee/leaves-permissions', 'Admin · Leave approvals'],
  ['/app/admin/employee/tour-approvals', 'Admin · Tour approvals'],
  ['/app/admin/employee/leave-management', 'Admin · Leave management'],
  ['/app/admin/employee/master', 'Admin · Employee master'],
  ['/app/compliance/payroll-process', 'Compliance · Payroll'],
  ['/app/compliance', 'Compliance · Dashboard'],
  ['/app/admin/salary-admin', 'Admin · Salary admin'],
  ['/app/admin/store', 'Admin · Store'],
  ['/app/admin/gate', 'Admin · Gate pass'],
  ['/app/admin', 'Admin ops'],
  ['/app/accounts-finance', 'Finance / P&L'],
  ['/app/fire-tender-vehicle-management', 'Operations · Fire tender vehicle'],
  ['/app/fire-tender', 'Fire tender'],
  ['/app/operations', 'Operations'],
  ['/app/projects', 'Projects'],
  ['/app/amc', 'AMC management'],
  ['/app/procurement', 'Procurement'],
  ['/app/indus-lms-trainings', 'Indus LMS / trainings'],
  ['/app/all-employees', 'All employees'],
  ['/app/user-management', 'User management'],
  ['/app/software-subscriptions-reminders', 'Software subscriptions/reminders'],
  ['/app/api-health', 'API health'],
  ['/app/settings', 'Settings'],
  ['/app/ifsp-employee-compliance', 'Compliance'],
  ['/app/general-compliance', 'Compliance'],
  ['/app/dashboard', 'Dashboard'],
]

/** Long text / credential-like keys — values never passed into formatters or change lines. */
export const ACTIVITY_SENSITIVE_KEYS = new Set([
  'remarks',
  'billing_address',
  'shipping_address',
  'gstin',
  'password',
  'token',
  'authorization_to',
  'service_description',
  'invoice_terms_text',
  'payload',
  'access_token',
  'refresh_token',
  'secret',
  'api_key',
  'apikey',
])

const ENTITY_LABELS = {
  po_wo: 'PO/WO',
  invoice: 'tax invoice',
  add_on_invoice: 'add-on invoice',
  manpower_enquiries: 'manpower enquiry',
  profiles: 'user profile',
  marketing_enquiries: 'marketing enquiry',
  marketing_quotations: 'marketing quotation',
  marketing_clients: 'marketing client',
  crm_outreach_clients: 'CRM outreach client',
  marketing_products: 'product catalog',
  maintenance_enquiries: 'maintenance enquiry',
  maintenance_quotations: 'maintenance quotation',
  maintenance_clients: 'maintenance client',
  maintenance_products: 'maintenance product',
  credit_debit_note: 'credit/debit note',
  payment_advice: 'payment advice',
  tenders: 'fire tender',
  costing_rows: 'costing sheet row',
  software_subscriptions: 'software subscription',
  sites: 'site',
  revenue_heads: 'revenue head',
  expense_parent_heads: 'expense parent head',
  expense_child_heads: 'expense child head',
  budget_versions: 'budget version',
  revenue_entries: 'revenue entry',
  expense_entries: 'expense entry',
  budget_lines: 'budget line',
  cost_allocations: 'cost allocation',
  contract_periods: 'contract period',
  import_export_logs: 'finance import/export',
  data_backups: 'finance backup',
  period_entries: 'period entry',
  admin_ifsp_employee_master: 'employee master record',
  admin_attendance_register: 'attendance register mark',
  admin_leave_requests: 'leave request',
  leave_requests: 'leave request',
  erp_attendance_punches: 'attendance punch',
  erp_attendance_sync_state: 'attendance sync state',
  hr_calling_candidates: 'calling-master candidate',
  hr_site_iom_entries: 'site IOM entry',
  admin_leave_attendance_marks: 'leave attendance mark',
  admin_leave_balance_ledger: 'leave balance ledger entry',
}

function pick(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return null
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k]
  }
  return null
}

function str(v, max = 80) {
  if (v == null || v === '') return ''
  const s = String(v).trim().replace(/\s+/g, ' ')
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function money(v) {
  if (v == null || v === '') return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return str(v, 24)
  try {
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  } catch {
    return `₹${n}`
  }
}

function dateShort(v) {
  const s = str(v, 32)
  if (!s) return ''
  // Keep ISO date portion if present
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return m ? m[1] : s
}

/** Deep-ish clone that redacts sensitive keys (values → undefined removed / key kept without value). */
export function stripSensitiveForActivity(input) {
  if (input == null) return null
  if (Array.isArray(input)) {
    return input.slice(0, 50).map((item) => stripSensitiveForActivity(item))
  }
  if (typeof input !== 'object') return input
  const out = {}
  for (const [k, v] of Object.entries(input)) {
    if (ACTIVITY_SENSITIVE_KEYS.has(k)) continue
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = stripSensitiveForActivity(v)
    } else if (Array.isArray(v)) {
      out[k] = stripSensitiveForActivity(v)
    } else {
      out[k] = v
    }
  }
  return out
}

/** Prefer response fields (generated IDs/numbers), fall back to request. */
export function mergeActivityRows(requestPayload, responseRow) {
  const req = requestPayload && typeof requestPayload === 'object' && !Array.isArray(requestPayload) ? requestPayload : null
  const res = responseRow && typeof responseRow === 'object' && !Array.isArray(responseRow) ? responseRow : null
  if (!req && !res) return {}
  if (!req) return { ...res }
  if (!res) return { ...req }
  return { ...req, ...res }
}

export function humanEntityName(entity) {
  const raw = String(entity || '').trim()
  if (!raw) return 'record'
  if (raw.startsWith('rpc:')) {
    const fn = raw.slice(4).replace(/_/g, ' ')
    return fn ? `server function “${fn}”` : 'RPC'
  }
  const key = raw.toLowerCase()
  return ENTITY_LABELS[key] || raw.replace(/_/g, ' ')
}

/**
 * Longest-prefix match against ROUTE_MODULE_MAP.
 * Falls back to a coarse App · path label.
 */
export function resolveModule(route) {
  const r = String(route || '')
  if (!r) return null
  // ROUTE_MODULE_MAP is ordered longest/most-specific first.
  for (const [prefix, label] of ROUTE_MODULE_MAP) {
    if (r === prefix || r.startsWith(`${prefix}/`) || r.startsWith(`${prefix}?`)) return label
  }
  if (r.startsWith('/app')) {
    const suffix = r.replace(/^\/app\/?/, '').slice(0, 52)
    return suffix ? `App · ${suffix}` : 'App'
  }
  return r.slice(0, 72) || null
}

function result(summary, badge, record_ref = null) {
  return {
    summary: str(summary, 240) || null,
    badge: badge || 'CHANGED',
    record_ref: record_ref ? str(record_ref, 80) : null,
  }
}

function invoiceRef(row) {
  const num = pick(row, 'tax_invoice_number', 'bill_number')
  return num ? `Invoice #${str(num, 40)}` : null
}

function poRef(row) {
  const num = pick(row, 'po_wo_number')
  return num ? `PO/WO #${str(num, 40)}` : null
}

function leaveRef(row) {
  const code = pick(row, 'employee_code')
  const from = dateShort(pick(row, 'from_date'))
  const to = dateShort(pick(row, 'to_date'))
  if (code && from && to) return `${str(code, 24)} ${from}→${to}`
  if (code) return str(code, 24)
  return null
}

function describeApprovalStatus(raw) {
  const apr = String(raw || '').trim().toLowerCase()
  if (!apr) return null
  if (apr === 'approved' || apr === 'approve') return { verb: 'approved', badge: 'APPROVED' }
  if (apr === 'sent_for_approval' || apr === 'sent') return { verb: 'submitted for approval', badge: 'SUBMITTED' }
  if (apr === 'rejected' || apr === 'reject') return { verb: 'rejected', badge: 'REJECTED' }
  if (apr === 'draft') return { verb: 'saved as draft', badge: 'DRAFT' }
  return { verb: `set approval to “${apr}”`, badge: 'CHANGED' }
}

function describeCnDnStatus(raw) {
  const cn = String(raw || '').trim().toLowerCase()
  if (!cn) return null
  if (cn === 'pending') return { verb: 'requested CN/DN approval for', badge: 'SUBMITTED' }
  if (cn === 'approved') return { verb: 'approved CN/DN request for', badge: 'APPROVED' }
  if (cn === 'rejected') return { verb: 'rejected CN/DN request for', badge: 'REJECTED' }
  return { verb: `set CN/DN status to “${cn}” on`, badge: 'CHANGED' }
}

function describeLeaveStatus(raw) {
  const st = String(raw || '').trim().toLowerCase()
  if (!st) return null
  if (st === 'approved') return { verb: 'approved leave for', badge: 'APPROVED' }
  if (st === 'rejected') return { verb: 'rejected leave for', badge: 'REJECTED' }
  if (st === 'cancelled' || st === 'canceled') return { verb: 'cancelled leave for', badge: 'CHANGED' }
  if (st === 'pending' || st === 'submitted') return { verb: 'submitted leave for', badge: 'SUBMITTED' }
  return { verb: `set leave status to “${st}” for`, badge: 'UPDATED' }
}

/** @type {Record<string, Partial<Record<'INSERT'|'UPDATE'|'DELETE'|'RPC', Function>>>} */
export const ACTIVITY_DESCRIPTORS = {
  invoice: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const ref = invoiceRef(row)
      const client = str(pick(row, 'client_legal_name'), 48)
      const amt = money(pick(row, 'total_amount', 'calculated_invoice_amount', 'taxable_value'))
      const parts = ['created']
      parts.push(ref || 'tax invoice')
      if (client) parts.push(`for ${client}`)
      if (amt) parts.push(`(${amt})`)
      return result(parts.join(' '), 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const ref = invoiceRef(row)
      const cn = describeCnDnStatus(pick(req || {}, 'cn_dn_request_status', 'cnDnRequestStatus'))
      if (cn) {
        return result(`${cn.verb} ${ref || 'tax invoice'}`, cn.badge, ref)
      }
      if (pick(req || {}, 'is_cancelled') === true || pick(req || {}, 'is_cancelled') === 'true') {
        return result(`cancelled ${ref || 'tax invoice'}`, 'DELETED', ref)
      }
      const pay = pick(req || {}, 'payment_status', 'pa_status')
      if (pay != null && pay !== '') {
        return result(`updated payment status on ${ref || 'tax invoice'} → ${str(pay, 24)}`, 'UPDATED', ref)
      }
      const client = str(pick(row, 'client_legal_name'), 40)
      const amt = money(pick(row, 'total_amount', 'calculated_invoice_amount'))
      let summary = `updated ${ref || 'tax invoice'}`
      if (client) summary += ` for ${client}`
      if (amt) summary += ` (${amt})`
      return result(summary, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const ref = invoiceRef(row)
      return result(`deleted ${ref || 'tax invoice'}`, 'DELETED', ref)
    },
  },

  add_on_invoice: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const client = str(pick(row, 'client_name'), 48)
      const type = str(pick(row, 'add_on_type'), 32)
      const invId = pick(row, 'invoice_id')
      const ref = invId ? `add-on · ${str(invId, 8)}…` : type || null
      let summary = 'created add-on invoice'
      if (type) summary += ` (${type})`
      if (client) summary += ` for ${client}`
      return result(summary, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const client = str(pick(row, 'client_name'), 40)
      return result(`updated add-on invoice${client ? ` for ${client}` : ''}`, 'UPDATED', null)
    },
    DELETE: () => result('deleted add-on invoice', 'DELETED', null),
  },

  credit_debit_note: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const noteType = str(pick(row, 'note_type'), 12) || 'note'
      const parent = pick(row, 'parent_tax_invoice_number')
      const noteNo = pick(row, 'note_tax_invoice_number')
      const amt = money(pick(row, 'amount'))
      const ref = noteNo ? `#${str(noteNo, 40)}` : parent ? `vs ${str(parent, 40)}` : null
      let summary = `created ${noteType} note`
      if (noteNo) summary += ` #${str(noteNo, 40)}`
      if (parent) summary += ` for invoice #${str(parent, 40)}`
      if (amt) summary += ` (${amt})`
      return result(summary, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const noteNo = pick(row, 'note_tax_invoice_number', 'parent_tax_invoice_number')
      const ref = noteNo ? `#${str(noteNo, 40)}` : null
      return result(`updated credit/debit note${ref ? ` ${ref}` : ''}`, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const noteNo = pick(row, 'note_tax_invoice_number')
      return result(`deleted credit/debit note${noteNo ? ` #${str(noteNo, 40)}` : ''}`, 'DELETED', noteNo ? `#${str(noteNo, 40)}` : null)
    },
  },

  payment_advice: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const inv = pick(row, 'invoice_id')
      const date = dateShort(pick(row, 'pa_received_date'))
      const ref = inv ? `PA · ${str(inv, 8)}…` : null
      let summary = 'recorded payment advice'
      if (date) summary += ` on ${date}`
      return result(summary, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const inv = pick(row, 'invoice_id')
      const ref = inv ? `PA · ${str(inv, 8)}…` : null
      const date = dateShort(pick(row, 'pa_received_date'))
      return result(`updated payment advice${date ? ` (${date})` : ''}`, 'UPDATED', ref)
    },
    DELETE: () => result('deleted payment advice', 'DELETED', null),
  },

  po_wo: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const ref = poRef(row)
      const client = str(pick(row, 'legal_name'), 48)
      const site = str(pick(row, 'location_name', 'site_id'), 40)
      const amt = money(pick(row, 'total_contract_value'))
      let summary = `created ${ref || 'PO/WO'}`
      if (client) summary += ` for ${client}`
      else if (site) summary += ` · ${site}`
      if (amt) summary += ` (${amt})`
      return result(summary, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const ref = poRef(row)
      const apr = describeApprovalStatus(pick(req || {}, 'approval_status', 'approvalStatus'))
      if (apr) {
        return result(`${apr.verb} ${ref || 'PO/WO'}`, apr.badge, ref)
      }
      const sup = pick(req || {}, 'supplementary_request_status')
      if (sup != null && sup !== '') {
        const s = String(sup).toLowerCase()
        if (s === 'pending') return result(`requested post-contract billing on ${ref || 'PO/WO'}`, 'SUBMITTED', ref)
        if (s === 'approved') return result(`approved post-contract billing on ${ref || 'PO/WO'}`, 'APPROVED', ref)
        if (s === 'rejected') return result(`rejected post-contract billing on ${ref || 'PO/WO'}`, 'REJECTED', ref)
      }
      const client = str(pick(row, 'legal_name'), 40)
      let summary = `updated ${ref || 'PO/WO'}`
      if (client) summary += ` for ${client}`
      return result(summary, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const ref = poRef(row)
      return result(`deleted ${ref || 'PO/WO'}`, 'DELETED', ref)
    },
  },

  profiles: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const email = str(pick(row, 'email'), 48)
      const code = str(pick(row, 'employee_code'), 24)
      const name = str(pick(row, 'username'), 32)
      const ref = code || email || name || null
      let summary = 'created user profile'
      if (name) summary += ` for ${name}`
      else if (email) summary += ` for ${email}`
      if (code) summary += ` (${code})`
      return result(summary, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const email = str(pick(row, 'email', ...(req ? ['email'] : [])), 48)
      const code = str(pick(row, 'employee_code'), 24)
      const name = str(pick(row, 'username'), 32)
      const who = name || email || code || 'user profile'
      const ref = code || email || null
      if (pick(req || {}, 'is_active') === false) {
        return result(`deactivated profile for ${who}`, 'CHANGED', ref)
      }
      if (pick(req || {}, 'is_active') === true) {
        return result(`activated profile for ${who}`, 'CHANGED', ref)
      }
      if (pick(req || {}, 'role') != null) {
        return result(`updated role for ${who} → ${str(pick(req, 'role'), 32)}`, 'UPDATED', ref)
      }
      if (pick(req || {}, 'allowed_modules') != null || pick(req || {}, 'module_access_pending') != null) {
        return result(`updated module access for ${who}`, 'UPDATED', ref)
      }
      return result(`updated profile for ${who}`, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const who = str(pick(row, 'email', 'username', 'employee_code'), 48) || 'user profile'
      return result(`deleted profile for ${who}`, 'DELETED', str(pick(row, 'employee_code', 'email'), 40) || null)
    },
  },

  admin_ifsp_employee_master: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'full_name'), 48)
      const code = str(pick(row, 'employee_code'), 24)
      const ref = code || name || null
      let summary = 'created employee'
      if (name) summary += ` ${name}`
      if (code) summary += ` (${code})`
      return result(summary, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'full_name'), 40)
      const code = str(pick(row, 'employee_code'), 24)
      const who = name ? (code ? `${name} (${code})` : name) : code || 'employee'
      const ref = code || name || null
      const status = pick(req || {}, 'status')
      if (status != null && status !== '') {
        return result(`set ${who} status → ${str(status, 24)}`, 'UPDATED', ref)
      }
      return result(`updated employee ${who}`, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const who = str(pick(row, 'full_name', 'employee_code'), 48) || 'employee'
      return result(`deleted employee ${who}`, 'DELETED', str(pick(row, 'employee_code'), 24) || null)
    },
  },

  admin_leave_requests: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const code = str(pick(row, 'employee_code'), 24)
      const type = str(pick(row, 'leave_type_code'), 16)
      const from = dateShort(pick(row, 'from_date'))
      const to = dateShort(pick(row, 'to_date'))
      const days = pick(row, 'days')
      const ref = leaveRef(row)
      let summary = 'submitted leave request'
      if (code) summary += ` for ${code}`
      if (type) summary += ` (${type})`
      if (from && to) summary += ` ${from}→${to}`
      if (days != null && days !== '') summary += `, ${days} day(s)`
      return result(summary, 'SUBMITTED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const code = str(pick(row, 'employee_code'), 24) || 'employee'
      const ref = leaveRef(row)
      const st = describeLeaveStatus(pick(req || {}, 'status', 'overall_status'))
      if (st) {
        const from = dateShort(pick(row, 'from_date'))
        const to = dateShort(pick(row, 'to_date'))
        let summary = `${st.verb} ${code}`
        if (from && to) summary += ` (${from}→${to})`
        return result(summary, st.badge, ref)
      }
      return result(`updated leave for ${code}`, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const ref = leaveRef(row)
      return result(`deleted leave request${ref ? ` (${ref})` : ''}`, 'DELETED', ref)
    },
  },

  leave_requests: {
    INSERT: (req, res) => ACTIVITY_DESCRIPTORS.admin_leave_requests.INSERT(req, res),
    UPDATE: (req, res) => ACTIVITY_DESCRIPTORS.admin_leave_requests.UPDATE(req, res),
    DELETE: (req, res) => ACTIVITY_DESCRIPTORS.admin_leave_requests.DELETE(req, res),
  },

  admin_attendance_register: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const code = str(pick(row, 'employee_code'), 24)
      const date = dateShort(pick(row, 'register_date'))
      const mark = str(pick(row, 'mark'), 12)
      const ref = code && date ? `${code} · ${date}` : code || date || null
      let summary = 'marked attendance'
      if (code) summary += ` for ${code}`
      if (date) summary += ` on ${date}`
      if (mark) summary += ` → ${mark}`
      return result(summary, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const code = str(pick(row, 'employee_code'), 24)
      const date = dateShort(pick(row, 'register_date'))
      const mark = str(pick(row, 'mark'), 12)
      const ref = code && date ? `${code} · ${date}` : code || date || null
      let summary = 'updated attendance mark'
      if (code) summary += ` for ${code}`
      if (date) summary += ` on ${date}`
      if (mark) summary += ` → ${mark}`
      return result(summary, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const ref = leaveRef({ employee_code: pick(row, 'employee_code'), from_date: pick(row, 'register_date'), to_date: pick(row, 'register_date') })
      return result(`cleared attendance mark${ref ? ` (${ref})` : ''}`, 'DELETED', ref)
    },
  },

  erp_attendance_punches: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const code = str(pick(row, 'employee_code'), 24)
      const name = str(pick(row, 'employee_name'), 32)
      const date = dateShort(pick(row, 'punch_date'))
      const who = name || code || 'employee'
      const ref = code && date ? `${code} · ${date}` : code || null
      return result(`recorded punch for ${who}${date ? ` on ${date}` : ''}`, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const code = str(pick(row, 'employee_code'), 24) || 'employee'
      const date = dateShort(pick(row, 'punch_date'))
      return result(`updated punch for ${code}${date ? ` on ${date}` : ''}`, 'UPDATED', code || null)
    },
    DELETE: () => result('deleted attendance punch', 'DELETED', null),
  },

  erp_attendance_sync_state: {
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const from = dateShort(pick(row, 'last_sync_from_date'))
      const to = dateShort(pick(row, 'last_sync_to_date'))
      const count = pick(row, 'last_sync_record_count')
      let summary = 'updated attendance sync state'
      if (from && to) summary = `synced attendance ${from}→${to}`
      if (count != null && count !== '') summary += ` (${count} punches)`
      return result(summary, 'UPDATED', from && to ? `${from}→${to}` : null)
    },
    INSERT: (req, res) => ACTIVITY_DESCRIPTORS.erp_attendance_sync_state.UPDATE(req, res),
  },

  manpower_enquiries: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'enquiry_number', 'sr_no')
      const client = str(pick(row, 'client'), 48)
      const ref = num != null && num !== '' ? `Enquiry #${str(num, 32)}` : null
      let summary = `created manpower enquiry${ref ? ` ${ref}` : ''}`
      if (client) summary += ` for ${client}`
      return result(summary, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'enquiry_number', 'sr_no')
      const client = str(pick(row, 'client'), 40)
      const ref = num != null && num !== '' ? `Enquiry #${str(num, 32)}` : null
      const st = String(pick(req || {}, 'status') || '').trim().toLowerCase()
      if (st === 'approved') return result(`approved manpower enquiry${ref ? ` ${ref}` : ''}${client ? ` for ${client}` : ''}`, 'APPROVED', ref)
      if (st === 'rejected') return result(`rejected manpower enquiry${ref ? ` ${ref}` : ''}${client ? ` for ${client}` : ''}`, 'REJECTED', ref)
      return result(`updated manpower enquiry${ref ? ` ${ref}` : ''}${client ? ` for ${client}` : ''}`, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'enquiry_number', 'sr_no')
      const ref = num != null ? `Enquiry #${str(num, 32)}` : null
      return result(`deleted manpower enquiry${ref ? ` ${ref}` : ''}`, 'DELETED', ref)
    },
  },

  marketing_enquiries: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'enquiry_number')
      const ref = num ? `Enquiry #${str(num, 32)}` : null
      const contact = str(pick(row, 'contact_person', 'site_location'), 40)
      return result(`created marketing enquiry${ref ? ` ${ref}` : ''}${contact ? ` · ${contact}` : ''}`, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'enquiry_number')
      const ref = num ? `Enquiry #${str(num, 32)}` : null
      const status = pick(req || {}, 'status')
      if (status) return result(`updated marketing enquiry${ref ? ` ${ref}` : ''} → ${str(status, 24)}`, 'UPDATED', ref)
      return result(`updated marketing enquiry${ref ? ` ${ref}` : ''}`, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'enquiry_number')
      const ref = num ? `Enquiry #${str(num, 32)}` : null
      return result(`deleted marketing enquiry${ref ? ` ${ref}` : ''}`, 'DELETED', ref)
    },
  },

  marketing_quotations: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'quotation_number')
      const amt = money(pick(row, 'final_amount', 'total_amount'))
      const ref = num ? `Quotation #${str(num, 32)}` : null
      let summary = `created marketing quotation${ref ? ` ${ref}` : ''}`
      if (amt) summary += ` (${amt})`
      return result(summary, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'quotation_number')
      const ref = num ? `Quotation #${str(num, 32)}` : null
      return result(`updated marketing quotation${ref ? ` ${ref}` : ''}`, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'quotation_number')
      const ref = num ? `Quotation #${str(num, 32)}` : null
      return result(`deleted marketing quotation${ref ? ` ${ref}` : ''}`, 'DELETED', ref)
    },
  },

  marketing_clients: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'client_name'), 48)
      return result(`created marketing client${name ? ` ${name}` : ''}`, 'CREATED', name || null)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'client_name'), 48)
      return result(`updated marketing client${name ? ` ${name}` : ''}`, 'UPDATED', name || null)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'client_name'), 48)
      return result(`deleted marketing client${name ? ` ${name}` : ''}`, 'DELETED', name || null)
    },
  },

  crm_outreach_clients: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'client_name'), 48)
      return result(`created CRM outreach client${name ? ` ${name}` : ''}`, 'CREATED', name || null)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'client_name'), 48)
      return result(`updated CRM outreach client${name ? ` ${name}` : ''}`, 'UPDATED', name || null)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'client_name'), 48)
      return result(`deleted CRM outreach client${name ? ` ${name}` : ''}`, 'DELETED', name || null)
    },
  },

  maintenance_enquiries: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'enquiry_number')
      const ref = num ? `Enquiry #${str(num, 32)}` : null
      const contact = str(pick(row, 'contact_person', 'site_location'), 40)
      return result(`created maintenance enquiry${ref ? ` ${ref}` : ''}${contact ? ` · ${contact}` : ''}`, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'enquiry_number')
      const ref = num ? `Enquiry #${str(num, 32)}` : null
      const status = pick(req || {}, 'status')
      if (status) return result(`updated maintenance enquiry${ref ? ` ${ref}` : ''} → ${str(status, 24)}`, 'UPDATED', ref)
      return result(`updated maintenance enquiry${ref ? ` ${ref}` : ''}`, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'enquiry_number')
      const ref = num ? `Enquiry #${str(num, 32)}` : null
      return result(`deleted maintenance enquiry${ref ? ` ${ref}` : ''}`, 'DELETED', ref)
    },
  },
  maintenance_quotations: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'quotation_number')
      const amt = money(pick(row, 'final_amount', 'total_amount'))
      const ref = num ? `Quotation #${str(num, 32)}` : null
      let summary = `created maintenance quotation${ref ? ` ${ref}` : ''}`
      if (amt) summary += ` (${amt})`
      return result(summary, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'quotation_number')
      const ref = num ? `Quotation #${str(num, 32)}` : null
      return result(`updated maintenance quotation${ref ? ` ${ref}` : ''}`, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'quotation_number')
      const ref = num ? `Quotation #${str(num, 32)}` : null
      return result(`deleted maintenance quotation${ref ? ` ${ref}` : ''}`, 'DELETED', ref)
    },
  },
  maintenance_clients: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'client_name'), 48)
      return result(`created maintenance client${name ? ` ${name}` : ''}`, 'CREATED', name || null)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'client_name'), 48)
      return result(`updated maintenance client${name ? ` ${name}` : ''}`, 'UPDATED', name || null)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'client_name'), 48)
      return result(`deleted maintenance client${name ? ` ${name}` : ''}`, 'DELETED', name || null)
    },
  },

  hr_calling_candidates: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'candidate_name'), 48)
      const phone = str(pick(row, 'phone_number'), 20)
      const ref = name || phone || null
      return result(`added calling-master candidate${name ? ` ${name}` : ''}`, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'candidate_name'), 40) || 'candidate'
      const ref = name
      const offer = pick(req || {}, 'offer_status', 'joining_status', 'iom_status', 'conversion_status', 'hiring_status')
      if (offer != null && offer !== '') {
        return result(`updated ${name} → ${str(offer, 32)}`, 'UPDATED', ref)
      }
      const code = pick(req || {}, 'employee_code')
      if (code) return result(`assigned employee code ${str(code, 24)} to ${name}`, 'UPDATED', str(code, 24))
      return result(`updated calling-master candidate ${name}`, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'candidate_name'), 48)
      return result(`deleted calling-master candidate${name ? ` ${name}` : ''}`, 'DELETED', name || null)
    },
  },

  software_subscriptions: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const tool = str(pick(row, 'tool_service'), 48)
      return result(`added software subscription${tool ? ` ${tool}` : ''}`, 'CREATED', tool || null)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const tool = str(pick(row, 'tool_service'), 48)
      const pay = pick(req || {}, 'payment_status')
      if (pay) return result(`updated ${tool || 'subscription'} payment → ${str(pay, 24)}`, 'UPDATED', tool || null)
      return result(`updated software subscription${tool ? ` ${tool}` : ''}`, 'UPDATED', tool || null)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const tool = str(pick(row, 'tool_service'), 48)
      return result(`deleted software subscription${tool ? ` ${tool}` : ''}`, 'DELETED', tool || null)
    },
  },

  tenders: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'tender_number')
      const ref = num ? `Tender #${str(num, 32)}` : null
      return result(`created fire tender${ref ? ` ${ref}` : ''}`, 'CREATED', ref)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'tender_number')
      const ref = num ? `Tender #${str(num, 32)}` : null
      const st = String(pick(req || {}, 'status') || '').toLowerCase()
      if (st === 'approved') return result(`approved fire tender${ref ? ` ${ref}` : ''}`, 'APPROVED', ref)
      if (st === 'rejected') return result(`rejected fire tender${ref ? ` ${ref}` : ''}`, 'REJECTED', ref)
      return result(`updated fire tender${ref ? ` ${ref}` : ''}`, 'UPDATED', ref)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const num = pick(row, 'tender_number')
      const ref = num ? `Tender #${str(num, 32)}` : null
      return result(`deleted fire tender${ref ? ` ${ref}` : ''}`, 'DELETED', ref)
    },
  },

  costing_rows: {
    INSERT: () => result('added costing sheet row', 'CREATED', null),
    UPDATE: () => result('updated costing sheet row', 'UPDATED', null),
    DELETE: () => result('deleted costing sheet row', 'DELETED', null),
  },

  sites: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'name', 'code'), 48)
      return result(`created site${name ? ` ${name}` : ''}`, 'CREATED', name || null)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'name', 'code'), 48)
      return result(`updated site${name ? ` ${name}` : ''}`, 'UPDATED', name || null)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const name = str(pick(row, 'name', 'code'), 48)
      return result(`deleted site${name ? ` ${name}` : ''}`, 'DELETED', name || null)
    },
  },

  revenue_heads: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const label = str(pick(row, 'label', 'code'), 48)
      return result(`created revenue head${label ? ` ${label}` : ''}`, 'CREATED', label || null)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const label = str(pick(row, 'label', 'code'), 48)
      return result(`updated revenue head${label ? ` ${label}` : ''}`, 'UPDATED', label || null)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const label = str(pick(row, 'label', 'code'), 48)
      return result(`deleted revenue head${label ? ` ${label}` : ''}`, 'DELETED', label || null)
    },
  },

  expense_parent_heads: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const label = str(pick(row, 'label', 'code'), 48)
      return result(`created expense parent head${label ? ` ${label}` : ''}`, 'CREATED', label || null)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const label = str(pick(row, 'label', 'code'), 48)
      return result(`updated expense parent head${label ? ` ${label}` : ''}`, 'UPDATED', label || null)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const label = str(pick(row, 'label', 'code'), 48)
      return result(`deleted expense parent head${label ? ` ${label}` : ''}`, 'DELETED', label || null)
    },
  },

  expense_child_heads: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const label = str(pick(row, 'label', 'code'), 48)
      return result(`created expense child head${label ? ` ${label}` : ''}`, 'CREATED', label || null)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const label = str(pick(row, 'label', 'code'), 48)
      return result(`updated expense child head${label ? ` ${label}` : ''}`, 'UPDATED', label || null)
    },
    DELETE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const label = str(pick(row, 'label', 'code'), 48)
      return result(`deleted expense child head${label ? ` ${label}` : ''}`, 'DELETED', label || null)
    },
  },

  budget_versions: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const id = str(pick(row, 'external_id'), 40)
      return result(`created budget version${id ? ` ${id}` : ''}`, 'CREATED', id || null)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const id = str(pick(row, 'external_id'), 40)
      return result(`updated budget version${id ? ` ${id}` : ''}`, 'UPDATED', id || null)
    },
    DELETE: () => result('deleted budget version', 'DELETED', null),
  },

  revenue_entries: {
    INSERT: () => result('created revenue entry', 'CREATED', null),
    UPDATE: () => result('updated revenue entry', 'UPDATED', null),
    DELETE: () => result('deleted revenue entry', 'DELETED', null),
  },
  expense_entries: {
    INSERT: () => result('created expense entry', 'CREATED', null),
    UPDATE: () => result('updated expense entry', 'UPDATED', null),
    DELETE: () => result('deleted expense entry', 'DELETED', null),
  },
  budget_lines: {
    INSERT: () => result('created budget line', 'CREATED', null),
    UPDATE: () => result('updated budget line', 'UPDATED', null),
    DELETE: () => result('deleted budget line', 'DELETED', null),
  },
  cost_allocations: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const id = str(pick(row, 'external_id'), 40)
      return result(`created cost allocation${id ? ` ${id}` : ''}`, 'CREATED', id || null)
    },
    UPDATE: () => result('updated cost allocation', 'UPDATED', null),
    DELETE: () => result('deleted cost allocation', 'DELETED', null),
  },
  contract_periods: {
    INSERT: () => result('created contract period', 'CREATED', null),
    UPDATE: () => result('updated contract period', 'UPDATED', null),
    DELETE: () => result('deleted contract period', 'DELETED', null),
  },
  period_entries: {
    INSERT: (req, res) => {
      const row = mergeActivityRows(req, res)
      const key = str(pick(row, 'period_key'), 24)
      return result(`created period entry${key ? ` ${key}` : ''}`, 'CREATED', key || null)
    },
    UPDATE: (req, res) => {
      const row = mergeActivityRows(req, res)
      const key = str(pick(row, 'period_key'), 24)
      return result(`updated period entry${key ? ` ${key}` : ''}`, 'UPDATED', key || null)
    },
    DELETE: () => result('deleted period entry', 'DELETED', null),
  },
  import_export_logs: {
    INSERT: () => result('recorded finance import/export', 'CREATED', null),
  },
  data_backups: {
    INSERT: () => result('created finance backup', 'CREATED', null),
  },

  // —— RPCs ——
  'rpc:list_billing_cycle_tracker': {
    RPC: () => result('loaded billing cycle tracker', 'RPC', null),
  },
  'rpc:mark_billing_cycle_period_manual': {
    RPC: (req) => {
      const row = req && typeof req === 'object' ? req : {}
      const period = str(pick(row, 'p_period_key', 'period_key'), 24)
      return result(`manually marked billing cycle period${period ? ` ${period}` : ''}`, 'RPC', period || null)
    },
  },
  'rpc:sync_billing_cycle_configs_from_pos': {
    RPC: () => result('synced billing cycle configs from POs', 'RPC', null),
  },
  'rpc:allocate_manpower_enquiry_sr_no': {
    RPC: () => result('allocated manpower enquiry serial number', 'RPC', null),
  },
  'rpc:fetch_approved_tour_marks_for_register': {
    RPC: (req) => {
      const row = req && typeof req === 'object' ? req : {}
      const from = dateShort(pick(row, 'p_from', 'from_date', 'p_month_key'))
      return result(`fetched approved tour marks${from ? ` (${from})` : ''}`, 'RPC', from || null)
    },
  },
  'rpc:recalculate_employee_leave_entitlements': {
    RPC: (req) => {
      const row = req && typeof req === 'object' ? req : {}
      const code = str(pick(row, 'p_employee_code', 'employee_code'), 24)
      return result(`recalculated leave entitlements${code ? ` for ${code}` : ''}`, 'RPC', code || null)
    },
  },
  'rpc:recalculate_all_leave_entitlements_for_year': {
    RPC: (req) => {
      const row = req && typeof req === 'object' ? req : {}
      const year = pick(row, 'p_year', 'year')
      return result(`recalculated all leave entitlements${year != null ? ` for ${year}` : ''}`, 'RPC', year != null ? String(year) : null)
    },
  },
  'rpc:hr_calling_allocate_offer_codes': {
    RPC: () => result('allocated calling-master offer codes', 'RPC', null),
  },
  'rpc:hr_calling_set_offer_response': {
    RPC: (req) => {
      const row = req && typeof req === 'object' ? req : {}
      const resp = str(pick(row, 'p_response', 'response'), 24)
      return result(`set calling-master offer response${resp ? ` → ${resp}` : ''}`, 'RPC', resp || null)
    },
  },
  'rpc:hr_calling_confirm_iom_entry': {
    RPC: () => result('confirmed calling-master IOM entry', 'RPC', null),
  },
  'rpc:hr_calling_convert_to_employee_master': {
    RPC: () => result('converted candidate to employee master', 'RPC', null),
  },
  'rpc:hr_calling_auto_expire_offers': {
    RPC: () => result('auto-expired calling-master offers', 'RPC', null),
  },
  'rpc:hr_calling_release_offer_codes': {
    RPC: () => result('released calling-master offer codes', 'RPC', null),
  },
  'rpc:hr_calling_peek_next_employee_code': {
    RPC: () => result('peeked next employee code', 'RPC', null),
  },
  'rpc:hr_site_iom_confirm_entry': {
    RPC: () => result('confirmed site IOM entry', 'RPC', null),
  },
  'rpc:hr_peek_shared_employee_code': {
    RPC: () => result('peeked shared employee code', 'RPC', null),
  },
  'rpc:admin_grant_user_vertical': {
    RPC: (req) => {
      const row = req && typeof req === 'object' ? req : {}
      const v = str(pick(row, 'p_vertical', 'vertical'), 32)
      return result(`granted billing vertical${v ? ` ${v}` : ''}`, 'RPC', v || null)
    },
  },
  'rpc:admin_revoke_user_vertical': {
    RPC: (req) => {
      const row = req && typeof req === 'object' ? req : {}
      const v = str(pick(row, 'p_vertical', 'vertical'), 32)
      return result(`revoked billing vertical${v ? ` ${v}` : ''}`, 'RPC', v || null)
    },
  },
  'rpc:replace_site_structure': {
    RPC: () => result('replaced finance site structure', 'RPC', null),
  },
  'rpc:replace_budget_lines': {
    RPC: () => result('replaced finance budget lines', 'RPC', null),
  },
  'rpc:replace_period_entry_lines': {
    RPC: () => result('replaced finance period entry lines', 'RPC', null),
  },
  'rpc:snapshot_db_usage': {
    RPC: () => result('snapshotted database usage', 'RPC', null),
  },
  'rpc:list_verticals': {
    RPC: () => result('listed billing verticals', 'RPC', null),
  },
  'rpc:list_my_vertical_grants': {
    RPC: () => result('listed own billing vertical grants', 'RPC', null),
  },
  'rpc:admin_list_user_vertical_grants': {
    RPC: () => result('listed user billing vertical grants', 'RPC', null),
  },
  'rpc:admin_seed_default_vertical_grants': {
    RPC: () => result('seeded default billing vertical grants', 'RPC', null),
  },
}

/**
 * @param {string} entity
 * @param {'INSERT'|'UPDATE'|'DELETE'|'RPC'} actionKey
 * @returns {Function|null}
 */
export function getActivityFormatter(entity, actionKey) {
  const key = String(entity || '').toLowerCase()
  const desk = ACTIVITY_DESCRIPTORS[key]
  if (!desk) return null
  const fn = desk[actionKey]
  return typeof fn === 'function' ? fn : null
}

export function methodToActionKey(method, entity) {
  const m = String(method || '').toUpperCase()
  const e = String(entity || '').toLowerCase()
  if (e.startsWith('rpc:')) return 'RPC'
  if (m === 'POST') return 'INSERT'
  if (m === 'PATCH' || m === 'PUT') return 'UPDATE'
  if (m === 'DELETE') return 'DELETE'
  return 'UPDATE'
}
