import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { fetchRegisterMarksForYear, fetchActiveEmployees } from "../lib/attendanceDaily";
import {
  buildLeaveLimitNotifications,
  readLeaveLimitSeen,
  writeLeaveLimitSeen,
} from "../lib/attendanceLeaveLimits";

const AdminLeaveLimitBell = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [nameByCode, setNameByCode] = useState({});
  const [seen, setSeen] = useState(() => readLeaveLimitSeen(user?.id));
  const year = new Date().getFullYear();

  useEffect(() => {
    setSeen(readLeaveLimitSeen(user?.id));
  }, [user?.id]);

  const refresh = useCallback(async () => {
    try {
      const [registerRows, employees] = await Promise.all([
        fetchRegisterMarksForYear(supabase, year),
        fetchActiveEmployees(supabase),
      ]);
      const names = {};
      for (const e of employees || []) {
        if (e.empCode) names[e.empCode] = e.employeeName || e.empCode;
      }
      setRows(registerRows);
      setNameByCode(names);
    } catch {
      setRows([]);
    }
  }, [year]);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 60000);
    const onChange = () => refresh();
    window.addEventListener("attendance-leave-limit-changed", onChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("attendance-leave-limit-changed", onChange);
    };
  }, [refresh]);

  const notifications = useMemo(
    () => buildLeaveLimitNotifications({ registerRows: rows, employeeNameByCode: nameByCode, year }),
    [rows, nameByCode, year]
  );

  const unread = notifications.filter((n) => !seen.has(n.key));

  const markSeen = (keys) => {
    const next = new Set([...seen, ...keys]);
    setSeen(next);
    writeLeaveLimitSeen(user?.id, next);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
        aria-label="Leave limit alerts"
        title="Annual leave limit alerts"
      >
        <Bell className="h-5 w-5" />
        {unread.length > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close leave alerts"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-bold text-slate-900">Leave limit alerts ({year})</p>
              {unread.length > 0 ? (
                <button
                  type="button"
                  className="text-[11px] font-medium text-blue-700 hover:underline"
                  onClick={() => markSeen(unread.map((n) => n.key))}
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">No leave limits exceeded.</div>
              ) : (
                notifications.slice(0, 25).map((n) => (
                  <button
                    key={n.key}
                    type="button"
                    className={`flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                      seen.has(n.key) ? "opacity-60" : ""
                    }`}
                    onClick={() => {
                      markSeen([n.key]);
                      setOpen(false);
                      navigate(n.route);
                    }}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-900">{n.title}</span>
                      <span className="block text-[11px] text-slate-600 mt-0.5">{n.message}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default AdminLeaveLimitBell;
