import { supabase } from './supabase';

export const POLICY_DOCUMENTS_TABLE = 'admin_employee_policy_documents';
export const POLICY_ASSIGNMENTS_TABLE = 'admin_employee_policy_assignments';

export const POLICY_DOC_TYPES = [
  { value: 'policy', label: 'Policy' },
  { value: 'terms', label: 'Terms and Conditions' },
];

export function policyDocTypeLabel(value) {
  return POLICY_DOC_TYPES.find((item) => item.value === value)?.label || 'Document';
}

export function agreementStatusLabel(value) {
  return isAgreementAgreed(value) ? 'Agreed' : 'Pending';
}

/** True when Indus One acknowledgment is complete (`agreed` + timestamp), or legacy `agreement_status`. */
export function isAgreementAgreed(value) {
  if (value && typeof value === 'object') {
    if (value.agreed === true && (value.acknowledged_at || value.agreed_at)) return true;
    if (String(value.agreement_status || '').toLowerCase() === 'agreed') return true;
    return false;
  }
  if (typeof value === 'boolean') return value;
  return String(value || '').toLowerCase() === 'agreed';
}

function normalizeAssignmentAck(row = {}) {
  const agreed =
    (row.agreed === true && Boolean(row.acknowledged_at || row.agreed_at)) ||
    String(row.agreement_status || '').toLowerCase() === 'agreed';
  return {
    agreement_status: agreed ? 'agreed' : 'pending',
    agreed_at: row.acknowledged_at || row.agreed_at || null,
    acknowledged_name: row.acknowledged_name ? String(row.acknowledged_name).trim() : null,
  };
}

export function isMissingPolicyTableError(err) {
  const msg = `${err?.message || ''} ${err?.details || ''} ${err?.code || ''}`;
  return /schema cache|does not exist|could not find the table|42p01|pgrst205/i.test(msg);
}

export function friendlyPolicyError(err, fallback) {
  if (isMissingPolicyTableError(err)) {
    return 'This section is not available yet. Ask IT to apply the latest database update.';
  }
  return err?.message || fallback;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function fetchPolicyDocuments() {
  const { data, error } = await supabase
    .from(POLICY_DOCUMENTS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Map document_id → { total, agreed, pending } — uses Indus One `agreed` / `acknowledged_at`. */
export async function fetchPolicyAssignmentCounts(documentIds = []) {
  const ids = [...new Set((documentIds || []).filter(Boolean))];
  const counts = new Map(ids.map((id) => [String(id), { total: 0, agreed: 0, pending: 0 }]));
  if (!ids.length) return counts;

  const applyRows = (rows) => {
    for (const row of rows || []) {
      const key = String(row.document_id);
      const entry = counts.get(key) || { total: 0, agreed: 0, pending: 0 };
      entry.total += 1;
      if (isAgreementAgreed(row)) entry.agreed += 1;
      else entry.pending += 1;
      counts.set(key, entry);
    }
    return counts;
  };

  // Indus One columns (source of truth when employees acknowledge).
  {
    const { data, error } = await supabase
      .from(POLICY_ASSIGNMENTS_TABLE)
      .select('document_id, agreed, acknowledged_at')
      .in('document_id', ids);
    if (!error) return applyRows(data);
    if (!/agreed|acknowledged_at|42703|does not exist/i.test(`${error.message || ''} ${error.code || ''}`)) {
      throw error;
    }
  }

  // Legacy ERP columns.
  {
    const { data, error } = await supabase
      .from(POLICY_ASSIGNMENTS_TABLE)
      .select('document_id, agreement_status, agreed_at')
      .in('document_id', ids);
    if (!error) return applyRows(data);
    if (!/agreement_status|agreed_at|42703|does not exist/i.test(`${error.message || ''} ${error.code || ''}`)) {
      throw error;
    }
  }

  const { data: legacy, error: legacyErr } = await supabase
    .from(POLICY_ASSIGNMENTS_TABLE)
    .select('document_id')
    .in('document_id', ids);
  if (legacyErr) throw legacyErr;
  for (const row of legacy || []) {
    const key = String(row.document_id);
    const entry = counts.get(key) || { total: 0, agreed: 0, pending: 0 };
    entry.total += 1;
    entry.pending += 1;
    counts.set(key, entry);
  }
  return counts;
}

export async function fetchAssignmentsForDocument(documentId) {
  const mapRows = (rows) =>
    (rows || []).map((row) => {
      const emp = row.admin_ifsp_employee_master || {};
      const ack = normalizeAssignmentAck(row);
      return {
        id: row.id,
        assigned_at: row.assigned_at,
        ...ack,
        employee_master_id: row.employee_master_id,
        employee_code: emp.employee_code || '',
        full_name: emp.full_name || '',
        department: emp.department || '',
        employment_status: emp.status || '',
      };
    });

  const empEmbed = `
      employee_master_id,
      admin_ifsp_employee_master (
        id,
        employee_code,
        full_name,
        department,
        status
      )`;

  // Indus One acknowledgment columns (source of truth).
  {
    const { data, error } = await supabase
      .from(POLICY_ASSIGNMENTS_TABLE)
      .select(
        `
      id,
      assigned_at,
      agreed,
      acknowledged_at,
      acknowledged_name,
      ${empEmbed}
    `
      )
      .eq('document_id', documentId)
      .order('assigned_at', { ascending: false });
    if (!error) return mapRows(data);
    if (!/agreed|acknowledged_at|acknowledged_name|42703|does not exist/i.test(`${error.message || ''} ${error.code || ''}`)) {
      throw error;
    }
  }

  // Legacy ERP columns.
  {
    const { data, error } = await supabase
      .from(POLICY_ASSIGNMENTS_TABLE)
      .select(
        `
      id,
      assigned_at,
      agreement_status,
      agreed_at,
      ${empEmbed}
    `
      )
      .eq('document_id', documentId)
      .order('assigned_at', { ascending: false });
    if (!error) return mapRows(data);
    if (!/agreement_status|agreed_at|42703|does not exist/i.test(`${error.message || ''} ${error.code || ''}`)) {
      throw error;
    }
  }

  const { data: legacy, error: legacyErr } = await supabase
    .from(POLICY_ASSIGNMENTS_TABLE)
    .select(
      `
      id,
      assigned_at,
      ${empEmbed}
    `
    )
    .eq('document_id', documentId)
    .order('assigned_at', { ascending: false });
  if (legacyErr) throw legacyErr;
  return mapRows(legacy || []);
}

export async function fetchAssignmentsForEmployee(employeeMasterId) {
  const mapRows = (rows) =>
    (rows || [])
      .map((row) => {
        const doc = row.admin_employee_policy_documents;
        if (!doc) return null;
        const ack = normalizeAssignmentAck(row);
        return {
          assignmentId: row.id,
          assigned_at: row.assigned_at,
          ...ack,
          ...doc,
        };
      })
      .filter(Boolean);

  const docEmbed = `
      document_id,
      admin_employee_policy_documents (
        id,
        title,
        doc_type,
        file_name,
        object_key,
        created_at
      )`;

  {
    const { data, error } = await supabase
      .from(POLICY_ASSIGNMENTS_TABLE)
      .select(
        `
      id,
      assigned_at,
      agreed,
      acknowledged_at,
      acknowledged_name,
      ${docEmbed}
    `
      )
      .eq('employee_master_id', employeeMasterId)
      .order('assigned_at', { ascending: false });
    if (!error) return mapRows(data);
    if (!/agreed|acknowledged_at|acknowledged_name|42703|does not exist/i.test(`${error.message || ''} ${error.code || ''}`)) {
      throw error;
    }
  }

  {
    const { data, error } = await supabase
      .from(POLICY_ASSIGNMENTS_TABLE)
      .select(
        `
      id,
      assigned_at,
      agreement_status,
      agreed_at,
      ${docEmbed}
    `
      )
      .eq('employee_master_id', employeeMasterId)
      .order('assigned_at', { ascending: false });
    if (!error) return mapRows(data);
    if (!/agreement_status|agreed_at|42703|does not exist/i.test(`${error.message || ''} ${error.code || ''}`)) {
      throw error;
    }
  }

  const { data: legacy, error: legacyErr } = await supabase
    .from(POLICY_ASSIGNMENTS_TABLE)
    .select(
      `
      id,
      assigned_at,
      ${docEmbed}
    `
    )
    .eq('employee_master_id', employeeMasterId)
    .order('assigned_at', { ascending: false });
  if (legacyErr) throw legacyErr;
  return mapRows(legacy || []);
}

export async function insertPolicyDocument(payload) {
  const { data, error } = await supabase
    .from(POLICY_DOCUMENTS_TABLE)
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updatePolicyDocument(id, patch) {
  const { data, error } = await supabase
    .from(POLICY_DOCUMENTS_TABLE)
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deletePolicyDocument(id) {
  const { error } = await supabase.from(POLICY_DOCUMENTS_TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function replaceDocumentAssignments({
  documentId,
  employeeIds,
  assignedBy,
  replaceExisting,
}) {
  const ids = [...new Set((employeeIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
  if (replaceExisting) {
    const { error: delError } = await supabase
      .from(POLICY_ASSIGNMENTS_TABLE)
      .delete()
      .eq('document_id', documentId);
    if (delError) throw delError;
  }
  if (!ids.length) return 0;

  const rows = ids.map((employee_master_id) => ({
    document_id: documentId,
    employee_master_id,
    assigned_by: assignedBy || null,
  }));

  for (const batch of chunk(rows, 200)) {
    const { error } = await supabase.from(POLICY_ASSIGNMENTS_TABLE).upsert(batch, {
      onConflict: 'document_id,employee_master_id',
    });
    if (error) throw error;
  }
  return ids.length;
}

/** Assign one or more policy/terms documents to a single employee (onboarding flow). */
export async function assignDocumentsToEmployee({
  employeeMasterId,
  documentIds,
  assignedBy,
}) {
  const empId = Number(employeeMasterId);
  if (!Number.isFinite(empId)) throw new Error('Employee is required.');
  const docs = [...new Set((documentIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!docs.length) return 0;

  const rows = docs.map((document_id) => ({
    document_id,
    employee_master_id: empId,
    assigned_by: assignedBy || null,
  }));

  for (const batch of chunk(rows, 200)) {
    const { error } = await supabase.from(POLICY_ASSIGNMENTS_TABLE).upsert(batch, {
      onConflict: 'document_id,employee_master_id',
    });
    if (error) throw error;
  }
  return docs.length;
}

export async function removeDocumentAssignment(assignmentId) {
  const { error } = await supabase.from(POLICY_ASSIGNMENTS_TABLE).delete().eq('id', assignmentId);
  if (error) throw error;
}

/** Map employee_master_id → assigned document count (for onboarding register). */
export async function fetchPolicyAssignmentCountsByEmployee(employeeMasterIds = []) {
  const ids = [...new Set((employeeMasterIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
  const counts = new Map(ids.map((id) => [String(id), 0]));
  if (!ids.length) return counts;

  for (const batch of chunk(ids, 200)) {
    const { data, error } = await supabase
      .from(POLICY_ASSIGNMENTS_TABLE)
      .select('employee_master_id')
      .in('employee_master_id', batch);
    if (error) throw error;
    for (const row of data || []) {
      const key = String(row.employee_master_id);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

export async function fetchActiveEmployeesForAssign() {
  const { data, error } = await supabase
    .from('admin_ifsp_employee_master')
    .select('id, employee_code, full_name, department, status')
    .eq('status', 'Active')
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data || [];
}
