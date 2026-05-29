import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useBilling } from '../../../contexts/BillingContext';
import { ROLES } from '../../../config/roles';
import {
  COMMERCIAL_MODULE_PROJECTS,
  COMMERCIAL_MODULE_RM_MM_AMC_IEV,
  getCommercialPoModuleType,
} from '../../../constants/commercialModuleType';

const PENDING = new Set(['sent_for_approval', 'pending_approval']);

function routeForPo(po) {
  const q = `highlightPoId=${encodeURIComponent(po?.id || '')}`;
  const moduleType = getCommercialPoModuleType(po);
  if (moduleType === COMMERCIAL_MODULE_RM_MM_AMC_IEV) {
    return `/app/commercial/rm-mm-amc-iev/po-entry?${q}`;
  }
  if (moduleType === COMMERCIAL_MODULE_PROJECTS) {
    return `/app/projects/po/po-entry?${q}`;
  }
  return `/app/commercial/manpower-training/po-entry?${q}`;
}

function poSortTs(po) {
  return new Date(
    po?.approvalSentAt ||
      po?.approval_sent_at ||
      po?.updated_at ||
      po?.updatedAt ||
      po?.created_at ||
      0
  ).getTime();
}

export default function BillingPoNotificationBar() {
  const { userProfile } = useAuth();
  const { commercialPOsAllModules, commercialPOs } = useBilling();
  const role = userProfile?.role;
  const isManager =
    role === ROLES.MANAGER ||
    role === ROLES.ADMIN ||
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.SUPER_ADMIN_PRO;
  const isExecutive = role === ROLES.EXECUTIVE;

  const rows = commercialPOsAllModules?.length ? commercialPOsAllModules : commercialPOs;

  const pendingForManager = useMemo(() => {
    if (!isManager) return [];
    return (rows || [])
      .filter((po) => !po?.isSupplementary)
      .filter((po) => PENDING.has(String(po.approvalStatus || po.approval_status || '').toLowerCase()))
      .sort((a, b) => poSortTs(b) - poSortTs(a))
      .slice(0, 8);
  }, [isManager, rows]);

  const approvedForExecutive = useMemo(() => {
    if (!isExecutive) return [];
    return (rows || [])
      .filter((po) => !po?.isSupplementary)
      .filter((po) => String(po.approvalStatus || po.approval_status || '').toLowerCase() === 'approved')
      .sort((a, b) => poSortTs(b) - poSortTs(a))
      .slice(0, 8);
  }, [isExecutive, rows]);

  const list = isManager ? pendingForManager : isExecutive ? approvedForExecutive : [];
  if (!list.length) return null;

  const title = isManager ? 'PO pending approval' : 'Recently approved POs';
  const Icon = isManager ? Bell : CheckCircle;
  const tone = isManager ? 'amber' : 'emerald';

  return (
    <div
      className={`mx-4 sm:mx-6 mt-3 rounded-xl border shadow-sm ${
        tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
      }`}
    >
      <div className="px-4 py-3 flex items-center gap-2 border-b border-black/5">
        <Icon className={`h-4 w-4 ${tone === 'amber' ? 'text-amber-700' : 'text-emerald-700'}`} />
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <span className="text-xs text-gray-600">(latest first)</span>
      </div>
      <ul className="divide-y divide-black/5 max-h-48 overflow-y-auto">
        {list.map((po) => (
          <li key={po.id} className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-gray-800">
              <span className="font-mono font-semibold">{po.ocNumber || po.oc_number}</span>
              {po.poWoNumber || po.po_wo_number ? ` · ${po.poWoNumber || po.po_wo_number}` : ''}
              {po.legalName || po.legal_name ? ` · ${po.legalName || po.legal_name}` : ''}
            </span>
            <Link
              to={routeForPo(po)}
              className={`text-xs font-semibold underline ${
                tone === 'amber' ? 'text-amber-800' : 'text-emerald-800'
              }`}
            >
              Open PO
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
