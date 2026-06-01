/** PO/WO approval status labels and actor names (Commercial PO Entry). */

export const PO_APPROVAL_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent_for_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

function normalizeActorName(value) {
  const name = String(value ?? '').trim();
  if (!name) return '';
  if (name.toLowerCase() === 'commercial manager') return '';
  return name;
}

function actorFromSummary(summary, kind) {
  const s = String(summary || '').trim();
  if (!s) return '';
  const re =
    kind === 'approved'
      ? /\bapproved\s+by\s+(.+?)(?:\s*[—–-]|\s*$)/i
      : /\brejected\s+by\s+(.+?)(?:\s*[—–-]|\s*$)/i;
  const m = s.match(re);
  return normalizeActorName(m?.[1]);
}

/** Display name for the logged-in user when approving / rejecting. */
export function getCommercialPoActorDisplayName(userProfile, user) {
  const fromProfile = normalizeActorName(
    userProfile?.username ||
      userProfile?.full_name ||
      userProfile?.fullName ||
      userProfile?.name
  );
  if (fromProfile) return fromProfile;
  const meta = user?.user_metadata || {};
  const fromMeta = normalizeActorName(meta.full_name || meta.name || meta.display_name);
  if (fromMeta) return fromMeta;
  const email = String(user?.email || '').trim();
  if (email.includes('@')) return email.split('@')[0];
  return 'User';
}

export function deriveApprovalActorsFromHistory(updateHistory) {
  const history = Array.isArray(updateHistory) ? updateHistory : [];
  const approvedRow = [...history].reverse().find((row) => row?.event === 'po_approved');
  const rejectedRow = [...history].reverse().find((row) => row?.event === 'po_rejected');
  return {
    approvedByName:
      normalizeActorName(approvedRow?.actorName || approvedRow?.actor_name) ||
      actorFromSummary(approvedRow?.summary, 'approved'),
    rejectedByName:
      normalizeActorName(rejectedRow?.actorName || rejectedRow?.actor_name) ||
      actorFromSummary(rejectedRow?.summary, 'rejected'),
  };
}

export function getApprovalActorName(po, eventName) {
  const direct =
    eventName === 'po_approved'
      ? po?.approvedByName ||
        po?.approved_by_name ||
        po?.approvedBy ||
        po?.approved_by
      : po?.rejectedByName ||
        po?.rejected_by_name ||
        po?.rejectedBy ||
        po?.rejected_by;
  const directName = normalizeActorName(direct);
  if (directName) return directName;

  const fromHistory = deriveApprovalActorsFromHistory(
    po?.updateHistory || po?.update_history
  );
  if (eventName === 'po_approved') return fromHistory.approvedByName;
  return fromHistory.rejectedByName;
}

export function getApprovalBadge(status, po) {
  if (status === PO_APPROVAL_STATUS.APPROVED) {
    const actor = getApprovalActorName(po, 'po_approved');
    return {
      label: actor ? `Approved by ${actor}` : 'Approved',
      cls: 'bg-emerald-100 text-emerald-800',
    };
  }
  if (status === PO_APPROVAL_STATUS.REJECTED) {
    const actor = getApprovalActorName(po, 'po_rejected');
    return {
      label: actor ? `Rejected by ${actor}` : 'Rejected',
      cls: 'bg-red-100 text-red-700',
    };
  }
  if (status === PO_APPROVAL_STATUS.SENT) {
    return {
      label: 'Pending Commercial Manager approval',
      cls: 'bg-indigo-100 text-indigo-800',
    };
  }
  return { label: 'Draft', cls: 'bg-gray-100 text-gray-700' };
}
