import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle, Send, XCircle, X, AlertTriangle, Clock3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { isStagingSupabaseProject } from '../lib/stagingProject';
import { getCommercialPOs as getCommercialPOsLocal } from '../data/billingStore';
import { fetchCommercialPOs } from '../services/billingApi';
import { formatDateTimeDdMmYyyy } from "../utils/dateDisplay";
import {
  fetchActiveEmployees,
  fetchAttendancePunchesInRange,
  normalizeAttendanceEmpCode,
} from '../lib/attendanceDaily';

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
import {
  buildFleetDueNotifications,
  fetchFleetDocumentsForDueAlerts,
  hasFleetModuleAccess,
  isFleetDuePopupDismissedToday,
  markFleetDuePopupDismissedToday,
  summarizeFleetDueNotifications,
} from '../lib/fleetDueNotifications';
import {
  buildPurplePresentNotifications,
  isAdminModuleUser,
  PURPLE_PRESENT_LOOKBACK_DAYS,
  purplePresentIsoDaysAgo,
  purplePresentTodayIso,
  readPurplePresentDismissedPopups,
  readPurplePresentSeen,
  writePurplePresentDismissedPopup,
  writePurplePresentSeen,
} from './AdminPurplePresentBell';

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
          source: 'po',
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
          source: 'po',
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
        source: 'po',
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
  const [fleetDocs, setFleetDocs] = useState([]);
  const [purpleNotifications, setPurpleNotifications] = useState([]);
  const [seen, setSeen] = useState(() => readSeen(user?.id));
  const [purpleSeen, setPurpleSeen] = useState(() => readPurplePresentSeen(user?.id));
  const [purpleDismissedPopups, setPurpleDismissedPopups] = useState(() =>
    readPurplePresentDismissedPopups(user?.id)
  );
  const [fleetPopupOpen, setFleetPopupOpen] = useState(false);

  const role = userProfile?.role;
  const canShowPoBell =
    role === ROLES.EXECUTIVE ||
    role === ROLES.MANAGER ||
    role === ROLES.ADMIN ||
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.SUPER_ADMIN_PRO ||
    !role;

  const canShowFleet =
    Boolean(user?.id) &&
    hasFleetModuleAccess(accessibleModules, userProfile, {
      email: user?.email,
      allowed_sub_modules: user?.user_metadata?.allowed_sub_modules,
    });

  const canShowPurple = Boolean(user?.id) && isAdminModuleUser(accessibleModules, userProfile);

  useEffect(() => {
    setSeen(readSeen(user?.id));
    setPurpleSeen(readPurplePresentSeen(user?.id));
    setPurpleDismissedPopups(readPurplePresentDismissedPopups(user?.id));
  }, [user?.id]);

  const refreshPos = useCallback(async () => {
    try {
      const rows = await fetchCommercialPOs();
      setPos(rows || []);
    } catch {
      setPos(getCommercialPOsLocal());
    }
  }, []);

  const refreshFleet = useCallback(async () => {
    if (!canShowFleet) {
      setFleetDocs([]);
      return;
    }
    try {
      const rows = await fetchFleetDocumentsForDueAlerts(supabase);
      setFleetDocs(rows);
    } catch (err) {
      console.error('Error loading fleet due alerts:', err);
      setFleetDocs([]);
    }
  }, [canShowFleet]);

  const refreshPurple = useCallback(async () => {
    if (!canShowPurple) {
      setPurpleNotifications([]);
      return;
    }
    try {
      const fromDate = purplePresentIsoDaysAgo(PURPLE_PRESENT_LOOKBACK_DAYS);
      const toDate = purplePresentTodayIso();
      const [punches, employees] = await Promise.all([
        fetchAttendancePunchesInRange(supabase, { fromDate, toDate }),
        fetchActiveEmployees(supabase),
      ]);
      const names = {};
      for (const e of employees || []) {
        const code = normalizeAttendanceEmpCode(e.empCode);
        if (code) names[code] = e.employeeName || e.name || code;
      }
      setPurpleNotifications(
        buildPurplePresentNotifications({
          punches,
          employeeNameByCode: names,
          fromDate,
          toDate,
        }).map((n) => ({
          ...n,
          icon: Clock3,
          iconClass: 'text-purple-800 bg-purple-100',
        }))
      );
    } catch {
      setPurpleNotifications([]);
    }
  }, [canShowPurple]);

  useEffect(() => {
    if (!user?.id) return undefined;
    if (!canShowPoBell && !canShowFleet && !canShowPurple) return undefined;

    if (canShowPoBell) refreshPos();
    if (canShowFleet) refreshFleet();
    if (canShowPurple) refreshPurple();

    const interval = window.setInterval(() => {
      if (canShowPoBell) refreshPos();
      if (canShowFleet) refreshFleet();
      if (canShowPurple) refreshPurple();
    }, 30000);

    if (!canShowPoBell || import.meta.env.MODE === 'staging' || isStagingSupabaseProject()) {
      return () => window.clearInterval(interval);
    }

    const channel = supabase
      .channel(`po-approval-bell-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'billing', table: 'po_wo' }, () => refreshPos())
      .subscribe();
    return () => {
      window.clearInterval(interval);
      channel.unsubscribe();
    };
  }, [refreshPos, refreshFleet, refreshPurple, canShowPoBell, canShowFleet, canShowPurple, user?.id]);

  const poNotifications = useMemo(
    () => (canShowPoBell ? buildNotifications(pos, user, userProfile, accessibleModules) : []),
    [accessibleModules, canShowPoBell, pos, user, userProfile]
  );

  const fleetNotifications = useMemo(
    () => (canShowFleet ? buildFleetDueNotifications(fleetDocs) : []),
    [canShowFleet, fleetDocs]
  );

  const notifications = useMemo(() => {
    return [...fleetNotifications, ...purpleNotifications, ...poNotifications];
  }, [fleetNotifications, purpleNotifications, poNotifications]);

  const fleetSummary = useMemo(
    () => summarizeFleetDueNotifications(fleetNotifications),
    [fleetNotifications]
  );

  const isUnread = (n) => {
    if (n.source === 'purple') return !purpleSeen.has(n.key);
    return !seen.has(n.key);
  };

  const unread = notifications.filter(isUnread);

  const purplePopupItem = useMemo(() => {
    if (!canShowPurple) return null;
    return (
      purpleNotifications.find((n) => !purpleSeen.has(n.key) && !purpleDismissedPopups.has(n.key)) ||
      null
    );
  }, [canShowPurple, purpleDismissedPopups, purpleNotifications, purpleSeen]);

  useEffect(() => {
    if (!canShowFleet || !user?.id) {
      setFleetPopupOpen(false);
      return;
    }
    if (fleetSummary.total === 0) {
      setFleetPopupOpen(false);
      return;
    }
    if (isFleetDuePopupDismissedToday(user.id)) {
      setFleetPopupOpen(false);
      return;
    }
    setFleetPopupOpen(true);
  }, [canShowFleet, fleetSummary.total, user?.id]);

  const markSeen = (keys) => {
    const poKeys = [];
    const purpleKeys = [];
    for (const key of keys) {
      if (String(key).startsWith('purple-p:')) purpleKeys.push(key);
      else poKeys.push(key);
    }
    if (poKeys.length) {
      const next = new Set([...seen, ...poKeys]);
      setSeen(next);
      writeSeen(user?.id, next);
    }
    if (purpleKeys.length) {
      const next = new Set([...purpleSeen, ...purpleKeys]);
      setPurpleSeen(next);
      writePurplePresentSeen(user?.id, next);
    }
  };

  const dismissFleetPopup = () => {
    markFleetDuePopupDismissedToday(user?.id);
    setFleetPopupOpen(false);
  };

  const dismissPurplePopup = (key) => {
    writePurplePresentDismissedPopup(user?.id, key);
    setPurpleDismissedPopups((prev) => new Set([...prev, key]));
    markSeen([key]);
  };

  const shouldRenderBell = canShowPoBell || canShowFleet || canShowPurple;
  if (!shouldRenderBell) return null;

  const showPurplePopup = Boolean(purplePopupItem) && !fleetPopupOpen;
  if (unread.length === 0 && !fleetPopupOpen && !showPurplePopup) return null;

  const sources = new Set(notifications.map((n) => n.source).filter(Boolean));
  const multiSource = sources.size > 1;
  const panelTitle = multiSource
    ? 'Notifications'
    : sources.has('fleet')
      ? 'Fleet due alerts'
      : sources.has('purple')
        ? 'Purple Present alerts'
        : 'PO notifications';
  const panelSubtitle = multiSource
    ? 'Fleet, attendance, and PO updates'
    : sources.has('fleet')
      ? 'Red: within 7 days · Yellow: within 15 days'
      : sources.has('purple')
        ? 'First punch 12:00–15:00 or last punch before 12:00'
        : role === ROLES.EXECUTIVE
          ? 'Accepted and rejected PO updates'
          : 'Approval and rejection updates';

  return (
    <>
      {unread.length > 0 ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          </button>

          {open ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-[70] cursor-default"
                aria-label="Close notifications"
                onClick={() => setOpen(false)}
              />
              <div className="absolute right-0 top-12 z-[80] w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{panelTitle}</p>
                    <p className="text-xs text-slate-500">{panelSubtitle}</p>
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
                    <div className="px-4 py-8 text-center text-sm text-slate-500">No notifications right now.</div>
                  ) : (
                    notifications.slice(0, 40).map((n) => {
                      const Icon = n.icon || Bell;
                      const itemUnread = isUnread(n);
                      const rowTint =
                        n.source === 'fleet'
                          ? n.level === 'red'
                            ? itemUnread
                              ? 'bg-red-50/70'
                              : 'bg-white'
                            : itemUnread
                              ? 'bg-amber-50/70'
                              : 'bg-white'
                          : n.source === 'purple'
                            ? itemUnread
                              ? 'bg-purple-50/40'
                              : 'bg-white'
                            : itemUnread
                              ? 'bg-red-50/50'
                              : 'bg-white';
                      return (
                        <button
                          key={n.key}
                          type="button"
                          onClick={() => {
                            markSeen([n.key]);
                            setOpen(false);
                            navigate(n.route);
                          }}
                          className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${rowTint}`}
                        >
                          <span className={`mt-0.5 rounded-full p-2 ${n.iconClass || 'bg-slate-100 text-slate-700'}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-slate-900">{n.title}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate-600" title={n.message}>
                              {n.message}
                            </span>
                            {n.at && n.source !== 'fleet' ? (
                              <span className="mt-1 block text-[11px] text-slate-400">
                                {formatDateTimeDdMmYyyy(n.at)}
                              </span>
                            ) : null}
                          </span>
                          {itemUnread ? (
                            <span
                              className={`mt-2 h-2 w-2 rounded-full ${
                                n.level === 'yellow'
                                  ? 'bg-amber-500'
                                  : n.source === 'purple'
                                    ? 'bg-purple-600'
                                    : 'bg-red-600'
                              }`}
                            />
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {fleetPopupOpen && fleetSummary.total > 0 && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed bottom-5 right-5 z-[70] w-[min(92vw,400px)] rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-start gap-3 p-4">
                <div
                  className={`mt-0.5 rounded-full p-2 ${
                    fleetSummary.red > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">Fleet document dues</p>
                  <p className="mt-1 text-sm text-gray-700">
                    {fleetSummary.red > 0 ? (
                      <span className="font-semibold text-red-700">
                        {fleetSummary.red} red alert{fleetSummary.red === 1 ? '' : 's'} (≤7 days / overdue)
                      </span>
                    ) : null}
                    {fleetSummary.red > 0 && fleetSummary.yellow > 0 ? <span> · </span> : null}
                    {fleetSummary.yellow > 0 ? (
                      <span className="font-semibold text-amber-700">
                        {fleetSummary.yellow} yellow alert{fleetSummary.yellow === 1 ? '' : 's'} (≤15 days)
                      </span>
                    ) : null}
                  </p>
                  <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-gray-600">
                    {fleetSummary.items.slice(0, 5).map((item) => (
                      <li key={item.key} className="truncate" title={item.message}>
                        <span className={item.level === 'red' ? 'text-red-700' : 'text-amber-700'}>●</span>{' '}
                        {item.message}
                      </li>
                    ))}
                    {fleetSummary.items.length > 5 ? (
                      <li className="text-gray-400">+{fleetSummary.items.length - 5} more</li>
                    ) : null}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        dismissFleetPopup();
                        markSeen(fleetNotifications.map((n) => n.key));
                        navigate('/app/fire-tender-vehicle-management');
                      }}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Open Fleet
                    </button>
                    <button
                      type="button"
                      onClick={dismissFleetPopup}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Dismiss for today
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissFleetPopup}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Dismiss fleet due popup"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {showPurplePopup && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed bottom-5 right-5 z-[70] w-[min(92vw,380px)] rounded-2xl border border-purple-200 bg-white shadow-2xl">
              <div className="flex items-start gap-3 p-4">
                <div className="mt-0.5 rounded-full bg-purple-100 p-2 text-purple-800">
                  <Bell className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">Purple Present (P)</p>
                  <p className="mt-1 text-sm text-gray-700">{purplePopupItem.message}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        dismissPurplePopup(purplePopupItem.key);
                        navigate(purplePopupItem.route);
                      }}
                      className="rounded-lg bg-purple-700 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-800"
                    >
                      Open register
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissPurplePopup(purplePopupItem.key)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dismissPurplePopup(purplePopupItem.key)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
};

export default PoApprovalBell;
