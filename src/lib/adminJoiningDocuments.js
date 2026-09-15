import { supabase } from './supabase';

export const JOINING_DOCUMENTS_TABLE = 'admin_employee_joining_documents';

export const JOINING_DOC_KINDS = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN' },
  { value: 'photo', label: 'Photograph' },
  { value: 'bank_proof', label: 'Bank proof' },
  { value: 'education', label: 'Education certificate' },
  { value: 'experience', label: 'Experience letter' },
  { value: 'appointment', label: 'Appointment / offer' },
  { value: 'other', label: 'Other' },
];

export function joiningDocKindLabel(value) {
  return JOINING_DOC_KINDS.find((item) => item.value === value)?.label || 'Document';
}

export function isMissingJoiningTableError(err) {
  const msg = `${err?.message || ''} ${err?.details || ''} ${err?.code || ''}`;
  return /schema cache|does not exist|could not find the table|42p01|pgrst205/i.test(msg);
}

export function friendlyJoiningError(err, fallback) {
  if (isMissingJoiningTableError(err)) {
    return 'Joining documents are not available yet. Ask IT to apply the latest database update.';
  }
  return err?.message || fallback;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function fetchJoiningDocumentsForEmployee(employeeMasterId) {
  const { data, error } = await supabase
    .from(JOINING_DOCUMENTS_TABLE)
    .select('*')
    .eq('employee_master_id', employeeMasterId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Map employee_master_id → joining document count. */
export async function fetchJoiningDocumentCountsByEmployee(employeeMasterIds = []) {
  const ids = [...new Set((employeeMasterIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
  const counts = new Map(ids.map((id) => [String(id), 0]));
  if (!ids.length) return counts;

  for (const batch of chunk(ids, 200)) {
    const { data, error } = await supabase
      .from(JOINING_DOCUMENTS_TABLE)
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

export async function insertJoiningDocument(payload) {
  const { data, error } = await supabase
    .from(JOINING_DOCUMENTS_TABLE)
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteJoiningDocument(id) {
  const { error } = await supabase.from(JOINING_DOCUMENTS_TABLE).delete().eq('id', id);
  if (error) throw error;
}
