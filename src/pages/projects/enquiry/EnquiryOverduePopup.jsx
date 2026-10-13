import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { getEnquiryFieldValue, PROJECTS_SCHEMA, projectsTable } from '../../../services/projectsApi';
import { formatDisplayDate } from './enquiryConstants';
import { getDaysLeft, isOverdueOpen, startOfToday } from './enquiryDeadlines';
import { isAssignedToAny, isEnquiryApprover, namesForUser } from './enquiryRoles';

const DISMISS_KEY = 'projects-enquiry-overdue-dismissed';
const ENQUIRY_DATABASE_PATH = '/app/projects/enquiry/enquiry-database';
const MAX_LISTED = 5;

function dismissStamp(ids) {
  return `${startOfToday().toDateString()}|${[...ids].sort().join(',')}`;
}

/**
 * Red reminder of overdue open enquiries: the assigned person sees their own;
 * Manager / Admin / Super Admin see every overdue enquiry.
 */
export default function EnquiryOverduePopup() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const seesAll = isEnquiryApprover(userProfile);
  const [rows, setRows] = useState([]);
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await projectsTable('enquiries').select('id, serial_number, data');
        if (error) throw error;
        if (!cancelled) setRows(data || []);
      } catch (err) {
        console.warn('Enquiry overdue reminder could not load enquiries', err);
      }
      if (seesAll) return;
      try {
        const { data, error } = await supabase.schema(PROJECTS_SCHEMA).rpc('enquiry_assignee_names');
        if (error) throw error;
        if (!cancelled) setAssigneeOptions((data || []).map((r) => ({ value: r.full_name, employee_code: r.employee_code })));
      } catch (err) {
        console.warn('Enquiry overdue reminder: Employee Master names unavailable', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seesAll]);

  const myNames = useMemo(() => namesForUser(userProfile, assigneeOptions), [userProfile, assigneeOptions]);

  const overdueRows = useMemo(() => {
    const today = startOfToday();
    return rows
      .filter((row) => isOverdueOpen(row, today))
      .filter((row) => seesAll || isAssignedToAny(getEnquiryFieldValue(row, 'assigned_to_person'), myNames))
      .map((row) => ({ row, days: Math.abs(getDaysLeft(row, today) ?? 0) }))
      .sort((a, b) => b.days - a.days || (a.row.serial_number ?? 0) - (b.row.serial_number ?? 0));
  }, [rows, seesAll, myNames]);

  const ids = useMemo(() => overdueRows.map(({ row }) => row.id), [overdueRows]);

  useEffect(() => {
    if (!ids.length) return;
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === dismissStamp(ids));
    } catch {
      setDismissed(false);
    }
  }, [ids]);

  if (!ids.length || dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, dismissStamp(ids));
    } catch {
      /* storage unavailable — hide for this view only */
    }
    setDismissed(true);
  };

  const openAll = () => {
    navigate(ENQUIRY_DATABASE_PATH, {
      state: { dashboardView: { label: seesAll ? 'Overdue' : 'My overdue enquiries', ids } },
    });
  };

  return (
    <div role="alert" className="w-full rounded-xl border border-red-300 bg-white shadow-xl">
      <div className="flex items-start gap-2 rounded-t-xl bg-red-600 px-4 py-3 text-white">
        <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {ids.length} overdue enquir{ids.length === 1 ? 'y' : 'ies'}
          </p>
          <p className="text-xs text-red-100">
            {seesAll ? 'Open enquiries past their target date' : 'Assigned to you and past the target date'}
          </p>
        </div>
        <button type="button" onClick={dismiss} className="rounded p-1 hover:bg-red-700" aria-label="Dismiss overdue reminder">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-60 divide-y divide-red-50 overflow-y-auto">
        {overdueRows.slice(0, MAX_LISTED).map(({ row, days }) => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-2 text-xs">
            <span className="w-10 shrink-0 font-semibold tabular-nums text-slate-700">#{row.serial_number}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-900">
                {getEnquiryFieldValue(row, 'client_name') || '—'}
              </span>
              <span className="block truncate text-slate-500">
                Target {formatDisplayDate(getEnquiryFieldValue(row, 'target_date'))}
                {seesAll && getEnquiryFieldValue(row, 'assigned_to_person')
                  ? ` · ${getEnquiryFieldValue(row, 'assigned_to_person')}`
                  : ''}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-800">
              {days} day{days === 1 ? '' : 's'} late
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 rounded-b-xl border-t border-red-100 px-4 py-2.5">
        <span className="text-xs text-slate-500">
          {ids.length > MAX_LISTED ? `+${ids.length - MAX_LISTED} more` : ''}
        </span>
        <button
          type="button"
          onClick={openAll}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
        >
          View in Enquiry Database
        </button>
      </div>
    </div>
  );
}
