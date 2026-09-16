/**
 * Candidate requisitions raised by managers in Indus One — Admin / HR intake.
 */
import { supabase } from './supabase';

export const REQUISITIONS_TABLE = 'hr_candidate_requisitions';

export const REQUISITION_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'filled', label: 'Filled' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const REQUISITION_PREFILL_KEY = 'indus_os_requisition_calling_prefill';

export function requisitionStatusLabel(value) {
  return REQUISITION_STATUSES.find((s) => s.value === value)?.label || 'Pending';
}

export function requisitionStatusSeverity(value) {
  switch (String(value || '').toLowerCase()) {
    case 'approved':
      return 'info';
    case 'rejected':
      return 'critical';
    case 'filled':
      return 'info';
    case 'cancelled':
      return 'neutral';
    default:
      return 'warning';
  }
}

export function isMissingRequisitionsTableError(err) {
  const msg = `${err?.message || ''} ${err?.details || ''} ${err?.code || ''}`;
  return /schema cache|does not exist|could not find the table|42p01|pgrst205/i.test(msg);
}

export function friendlyRequisitionError(err, fallback) {
  if (isMissingRequisitionsTableError(err)) {
    return 'Candidate Requisitions is not available yet. Ask IT to apply the latest database update.';
  }
  return err?.message || fallback || 'Something went wrong.';
}

function mapRequisition(row) {
  if (!row) return null;
  const emp = row.admin_ifsp_employee_master || row.raiser || null;
  return {
    id: row.id,
    requisitionNo: row.requisition_no || '',
    raisedByUserId: row.raised_by_user_id,
    employeeMasterId: row.employee_master_id,
    raiserName: emp?.full_name || '',
    raiserCode: emp?.employee_code || '',
    department: row.department || emp?.department || '',
    designationRequested: row.designation_requested || '',
    positionsCount: Number(row.positions_count) || 1,
    employmentType: row.employment_type || 'Permanent',
    location: row.location || '',
    requiredByDate: row.required_by_date || null,
    experienceMinYears:
      row.experience_min_years == null || row.experience_min_years === ''
        ? null
        : Number(row.experience_min_years),
    skillsRequired: row.skills_required || '',
    justification: row.justification || '',
    status: row.status || 'pending',
    hrRemarks: row.hr_remarks || '',
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    callingStartedAt: row.calling_started_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

const SELECT_WITH_RAISER = `
  *,
  admin_ifsp_employee_master!hr_candidate_requisitions_employee_master_id_fkey (
    id,
    full_name,
    employee_code,
    department
  )
`;

export async function fetchCandidateRequisitions({ status } = {}) {
  let query = supabase
    .from(REQUISITIONS_TABLE)
    .select(SELECT_WITH_RAISER)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    // Fallback without FK embed if relation name differs.
    if (/relationship|embed|foreign key/i.test(error.message || '')) {
      let plainQuery = supabase
        .from(REQUISITIONS_TABLE)
        .select('*')
        .order('created_at', { ascending: false });
      if (status && status !== 'all') {
        plainQuery = plainQuery.eq('status', status);
      }
      const plain = await plainQuery;
      if (plain.error) throw plain.error;
      return (plain.data || []).map(mapRequisition);
    }
    throw error;
  }
  return (data || []).map(mapRequisition);
}

export async function fetchPendingRequisitionCount() {
  const { count, error } = await supabase
    .from(REQUISITIONS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) {
    if (isMissingRequisitionsTableError(error)) return 0;
    throw error;
  }
  return count || 0;
}

export async function updateCandidateRequisition(id, patch) {
  const update = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status != null) update.status = patch.status;
  if (patch.hrRemarks != null) update.hr_remarks = patch.hrRemarks;
  if (patch.reviewedBy != null) update.reviewed_by = patch.reviewedBy;
  if (patch.reviewedAt != null) update.reviewed_at = patch.reviewedAt;
  if (patch.callingStartedAt != null) update.calling_started_at = patch.callingStartedAt;

  const { data, error } = await supabase
    .from(REQUISITIONS_TABLE)
    .update(update)
    .eq('id', id)
    .select(SELECT_WITH_RAISER)
    .single();

  if (error) {
    if (/relationship|embed|foreign key/i.test(error.message || '')) {
      const plain = await supabase
        .from(REQUISITIONS_TABLE)
        .update(update)
        .eq('id', id)
        .select('*')
        .single();
      if (plain.error) throw plain.error;
      return mapRequisition(plain.data);
    }
    throw error;
  }
  return mapRequisition(data);
}

/** Build Calling Master form prefill from a requisition (phone/name still filled by recruiter). */
export function buildCallingPrefillFromRequisition(req) {
  if (!req) return null;
  const bits = [
    `Requisition ${req.requisitionNo || ''}`.trim(),
    req.designationRequested ? `Role: ${req.designationRequested}` : '',
    req.positionsCount ? `Positions: ${req.positionsCount}` : '',
    req.employmentType ? `Type: ${req.employmentType}` : '',
    req.experienceMinYears != null ? `Min exp: ${req.experienceMinYears} yrs` : '',
    req.skillsRequired ? `Skills: ${req.skillsRequired}` : '',
    req.justification ? `Justification: ${req.justification}` : '',
    req.raiserName ? `Raised by: ${req.raiserName}${req.raiserCode ? ` (${req.raiserCode})` : ''}` : '',
  ].filter(Boolean);

  return {
    requisitionId: req.id,
    requisitionNo: req.requisitionNo,
    designation: req.designationRequested || '',
    siteSuitable: req.location || '',
    totalExperience: req.experienceMinYears != null ? String(req.experienceMinYears) : '',
    remarks: bits.join('\n'),
  };
}

export function stashCallingPrefill(prefill) {
  try {
    sessionStorage.setItem(REQUISITION_PREFILL_KEY, JSON.stringify(prefill));
  } catch {
    /* ignore */
  }
}

export function consumeCallingPrefill() {
  try {
    const raw = sessionStorage.getItem(REQUISITION_PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(REQUISITION_PREFILL_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
