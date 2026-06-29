import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle, Send, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { isStagingSupabaseProject } from '../lib/stagingProject';
import { getCommercialPOs as getCommercialPOsLocal } from '../data/billingStore';
import { fetchCommercialPOs } from '../services/billingApi';
import {
  COMMERCIAL_MODULE_PROJECTS,
  COMMERCIAL_MODULE_RM_MM_AMC_IEV,
  getCommercialPoModuleType,
} from '../constants/commercialModuleType';
import {
  COMMERCIAL_MT_APPROVER_MODULE_KEYS,
  COMMERCIAL_RM_APPROVER_MODULE_KEYS,
  PROJECTS_PO_APPROVER_MODULE_KEYS,
  ROLES,
  userCanApproveInModules,
} from '../config/roles';

const PENDING_STATUSES = new Set(['sent_for_approval', 'pending_approval']);
const DECISION_STATUSES = new Set(['approved', 'rejected']);

function seenStorageKey(userId) {
  return `po_approval_bell_seen:${userId || 'anonymous'}`;
}

function readSeen(userId) {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(seenStorageKey(userId)) || '[]'));
  } catch {
    return new Set();
  }
}

function writeSeen(userId, keys) {
  try {
    window.localStorage.setItem(seenStorageKey(userId), JSON.stringify(Array.from(keys).slice(-300)));
  } catch {
    /* ignore */
  }
}

function approverKeysForPo(po) {
  const moduleType = getCommercialPoModuleType(po);
  if (moduleType === COMMERCIAL_MODULE_RM_MM_AMC_IEV) return COMMERCIAL_RM_APPROVER_MODULE_KEYS;
  if (moduleType === COMMERCIAL_MODULE_PROJECTS) return PROJECTS_PO_APPROVER_MODULE_KEYS;
  return COMMERCIAL_MT_APPROVER_MODULE_KEYS;
}

function routeForPo(po) {
  const query = `highlightPoId=${encodeURIComponent(po?.id || '')}`;
  const moduleType = getCommercialPoModuleType(po);
  if (moduleType === COMMERCIAL_MODULE_RM_MM_AMC_IEV) return `/app/commercial/rm-mm-amc-iev/po-entry?${query}`;
  if (moduleType === COMMERCIAL_MODULE_PROJECTS) return `/app/projects/po/po-entry?${query}`;
  return `/app/commercial/manpower-training/po-entry?${query}`;
}

function latestHistoryEvent(po, eventName) {
  const history = Array.isArray(po?.updateHistory || po?.update_history)
    ? po.updateHistory || po.update_history
    : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item && typeof item === 'object' && item.event === eventName) return item;
  }
  return null;
}

function latestDecisionTime(po, status) {
  const event = latestHistoryEvent(po, status === 'approved' ? 'po_approved' : 'po_rejected');
  return event?.at || po?.updated_at || po?.updatedAt || po?.approvalSentAt || po?.approval_sent_at || '';
}

function wasSentByUser(po, userId) {
  if (!userId) return false;
  const sent = latestHistoryEvent(po, 'po_sent_for_approval');
  return String(sent?.actorUserId || sent?.userId || '') === String(userId);
}

function userCanSeePoModule(accessibleModules, po) {
  const keys = approverKeysForPo(po);
  return Boolean(accessibleModules?.size && keys.some((key) => accessibleModules.has(key)));
}

function labelPo(po) {
  return po?.ocNumber || po?.oc_number || po?.poWoNumber || po?.po_wo_number || 'PO';
}

function buildNotifications(pos, user, userProfile, accessibleModules) {
  const role = userProfile?.role;
  const isExecutive = role === ROLES.EXECUTIVE;
  const isApproverRole =
    role === ROLES.MANAGER ||
    role === ROLES.ADMIN ||
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.SUPER_ADMIN_PRO ||
    !role;

  if (!isExecutive && !isApproverRole) return [];

  const notifications = [];
  (pos || []).forEach((po) => {
    if (!po || po.isSupplementary || po.is_supplementary) return;
    const status = String(po.approvalStatus || po.approval_status || 'draft').toLowerCase();
    const poLabel = labelPo(po);
    const poNo = po.poWoNumber || po.po_wo_number || '';
    const client = po.legalName || po.legal_name || po.clientName || '';

    if (
      isApproverRole &&
      userCanApproveInModules(userProfile, accessibleModules, approverKeysForPo(po))
    ) {
      if (PENDING_STATUSES.has(status)) {
        const at = po.approvalSentAt || po.approval_sent_at || po.updated_at || '';
        notifications.push({
          key: `manager-pending:${po.id}:${at}`,
          at,
          icon: Send,
          iconClass: 'text-indigo-700 bg-indigo-100',
          title: 'PO approval required',
          message: `${poLabel}${poNo ? ` · ${poNo}` : ''}${client ? ` · ${client}` : ''}`,
          route: routeForPo(po),
        });
      } else if (status === 'rejected') {
        const at = latestDecisionTime(po, status);
        notifications.push({
          key: `manager-rejected:${po.id}:${at}`,
          at,
          icon: XCircle,
          iconClass: 'text-red-700 bg-red-100',
          title: 'PO rejected',
          message: `${poLabel}${poNo ? ` · ${poNo}` : ''}${client ? ` · ${client}` : ''}`,
          route: routeForPo(po),
        });
      }
    }

    if (
      isExecutive &&
      DECISION_STATUSES.has(status) &&
      (wasSentByUser(po, user?.id) || userCanSeePoModule(accessibleModules, po))
    ) {
      const accepted = status === 'approved';
      const at = latestDecisionTime(po, status);
      notifications.push({
        key: `executive-${status}:${po.id}:${at}`,
        at,
        icon: accepted ? CheckCircle : XCircle,
        iconClass: accepted ? 'text-emerald-700 bg-emerald-100' : 'text-red-700 bg-red-100',
        title: accepted ? 'PO accepted' : 'PO rejected',
        message: `${poLabel}${poNo ? ` · ${poNo}` : ''}${client ? ` · ${client}` : ''}`,
        route: routeForPo(po),
      });
    }
  });

  return notifications.sort((a, b) => {
    const at = new Date(a.at || 0).getTime() || 0;
    const bt = new Date(b.at || 0).getTime() || 0;
    return bt - at;
  });
}

const PoApprovalBell = () => {
  const navigate = useNavigate();
  const { user, userProfile, accessibleModules } = useAuth();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState([]);
  const [seen, setSeen] = useState(() => readSeen(user?.id));

  const role = userProfile?.role;
  const shouldShow =
    role === ROLES.EXECUTIVE ||
    role === ROLES.MANAGER ||
    role === ROLES.ADMIN ||
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.SUPER_ADMIN_PRO ||
    !role;

  useEffect(() => {
    setSeen(readSeen(user?.id));
  }, [user?.id]);

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchCommercialPOs();
      setPos(rows || []);
    } catch {
      setPos(getCommercialPOsLocal());
    }
  }, []);

  useEffect(() => {
    if (!shouldShow || !user?.id) return undefined;
    refresh();
    const interval = window.setInterval(refresh, 30000);
    if (import.meta.env.MODE === 'staging' || isStagingSupabaseProject()) {
      return () => window.clearInterval(interval);
    }
    const channel = supabase
      .channel(`po-approval-bell-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'billing', table: 'po_wo' }, () => refresh())
      .subscribe();
    return () => {
      window.clearInterval(interval);
      channel.unsubscribe();
    };
  }, [refresh, shouldShow, user?.id]);

  const notifications = useMemo(
    () => buildNotifications(pos, user, userProfile, accessibleModules),
    [accessibleModules, pos, user, userProfile]
  );
  const unread = notifications.filter((n) => !seen.has(n.key));

  const markSeen = (keys) => {
    const next = new Set([...seen, ...keys]);
    setSeen(next);
    writeSeen(user?.id, next);
  };

  if (!shouldShow) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        aria-label="PO notifications"
      >
        <Bell className="h-5 w-5" />
        {unread.length > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-[80] w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-900">PO notifications</p>
              <p className="text-xs text-slate-500">
                {role === ROLES.EXECUTIVE ? 'Accepted and rejected PO updates' : 'Approval and rejection updates'}
              </p>
            </div>
            {unread.length > 0 ? (
              <button
                type="button"
                onClick={() => markSeen(unread.map((n) => n.key))}
                className="text-xs font-semibold text-red-700 hover:text-red-800"
              >
                Mark read
              </button>
            ) : null}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No PO notifications right now.</div>
            ) : (
              notifications.slice(0, 20).map((n) => {
                const Icon = n.icon;
                const isUnread = !seen.has(n.key);
                return (
                  <button
                    key={n.key}
                    type="button"
                    onClick={() => {
                      markSeen([n.key]);
                      setOpen(false);
                      navigate(n.route);
                    }}
                    className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                      isUnread ? 'bg-red-50/50' : 'bg-white'
                    }`}
                  >
                    <span className={`mt-0.5 rounded-full p-2 ${n.iconClass}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{n.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-600" title={n.message}>
                        {n.message}
                      </span>
                      {n.at ? (
                        <span className="mt-1 block text-[11px] text-slate-400">
                          {new Date(n.at).toLocaleString('en-IN')}
                        </span>
                      ) : null}
                    </span>
                    {isUnread ? <span className="mt-2 h-2 w-2 rounded-full bg-red-600" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PoApprovalBell;
