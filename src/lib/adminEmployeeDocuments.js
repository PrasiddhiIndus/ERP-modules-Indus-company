import { supabase } from './supabase';
import { apiUrl } from './apiBase';

export const EMPLOYEE_DOCUMENTS_TABLE = 'admin_employee_master_documents';
export const EMPLOYEE_DOCUMENT_TYPES_TABLE = 'admin_recruitment_document_types';

export const EMPLOYEE_DOCUMENT_STATUSES = [
  { key: 'pending', label: 'Pending', tone: 'neutral' },
  { key: 'submitted', label: 'Submitted', tone: 'info' },
  { key: 'under_review', label: 'Under Review', tone: 'warning' },
  { key: 'verified', label: 'Verified', tone: 'success' },
  { key: 'rejected', label: 'Rejected', tone: 'critical' },
];

export function employeeDocumentStatusMeta(key) {
  return EMPLOYEE_DOCUMENT_STATUSES.find((s) => s.key === key) || { key, label: key || '—', tone: 'neutral' };
}

function friendly(error, fallback) {
  const msg = String(error?.message || error?.error || fallback);
  if (/schema cache|does not exist|could not find the table|42p01|pgrst205|PGRST202|42883/i.test(msg)) {
    return 'Employee document collection is not available yet. Ask IT to apply the latest database update.';
  }
  return msg || fallback;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Please sign in again.');
  return { Authorization: `Bearer ${token}` };
}

async function api(path, body, fallback, { form = false } = {}) {
  const headers = await authHeaders();
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: form ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: form ? body : JSON.stringify(body || {}),
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) throw new Error(friendly(payload, fallback));
  return payload;
}

async function apiGet(path, fallback) {
  const headers = await authHeaders();
  const res = await fetch(apiUrl(path), { headers });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) throw new Error(friendly(payload, fallback));
  return payload;
}

export function mapEmployeeDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeMasterId: row.employee_master_id,
    docKey: row.document_key,
    docLabel: row.label,
    required: Boolean(row.required),
    status: row.status,
    file: row.file || null,
    submittedOn: row.submitted_at || null,
    submittedVia: row.submitted_via || null,
    reviewedBy: row.reviewed_by_name || null,
    reviewedAt: row.reviewed_at || null,
    remarks: row.rejection_reason || null,
    version: row.version ?? 1,
  };
}

export async function listEmployeeDocuments(employeeMasterId) {
  const id = Number(employeeMasterId);
  if (!Number.isFinite(id)) return [];
  const { data, error } = await supabase
    .from(EMPLOYEE_DOCUMENTS_TABLE)
    .select('*')
    .eq('employee_master_id', id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(friendly(error, 'Could not load documents.'));
  return (data || []).map(mapEmployeeDocument);
}

export async function seedEmployeeDocuments(employeeMasterId) {
  return api(
    '/api/admin-employee-documents/seed',
    { employeeMasterId: Number(employeeMasterId) },
    'Could not start document collection.'
  );
}

export async function uploadEmployeeDocumentFile(employeeMasterId, file) {
  const form = new FormData();
  form.append('employeeMasterId', String(employeeMasterId));
  form.append('fileName', file.name);
  form.append('file', file);
  const out = await api('/api/admin-employee-documents/files/upload', form, 'Upload failed.', { form: true });
  return out.file;
}

export async function submitEmployeeDocument(employeeMasterId, documentKey, file) {
  const stored = await uploadEmployeeDocumentFile(employeeMasterId, file);
  const { data, error } = await supabase.rpc('admin_employee_document_submit', {
    p_employee_master_id: Number(employeeMasterId),
    p_document_key: documentKey,
    p_file: stored,
  });
  if (error) throw new Error(friendly(error, 'Could not submit the document.'));
  return mapEmployeeDocument(data);
}

export async function reviewEmployeeDocument(documentId, action, reason, version) {
  const { data, error } = await supabase.rpc('admin_employee_document_review', {
    p_document_id: documentId,
    p_action: action,
    p_reason: reason || null,
    p_expected_version: version ?? null,
  });
  if (error) throw new Error(friendly(error, 'Could not update the document.'));
  return mapEmployeeDocument(data);
}

export async function getEmployeeDocumentFileUrl(employeeMasterId, file, { download = false } = {}) {
  if (!file?.objectKey) throw new Error('No file available.');
  const out = await api(
    '/api/admin-employee-documents/files/presign',
    {
      employeeMasterId: Number(employeeMasterId),
      objectKey: file.objectKey,
      fileName: file.fileName,
      download,
    },
    'Could not open the file.'
  );
  return out.url;
}

export async function listEmployeeDocumentSenders() {
  const out = await apiGet('/api/admin-employee-documents/senders', 'Could not load sender mailboxes.');
  return out?.senders || [];
}

export async function sendEmployeeDocumentUploadLink({ employeeMasterId, to, senderMail, validDays }) {
  return api(
    '/api/admin-employee-documents/send-link',
    {
      employeeMasterId: Number(employeeMasterId),
      to,
      senderMail: senderMail || null,
      validDays: validDays || 14,
    },
    'Could not send the document upload link.'
  );
}
