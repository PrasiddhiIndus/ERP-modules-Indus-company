import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SectionCard, DenseTable, StatusChip, Badge, FilterBar, TinySelect } from "./components/AdminUi";
import { mockAlerts } from "./data/mockAdminData";
import { supabase } from "../../lib/supabase";
import {
  employeesWithBirthdayToday,
  employeesWithAnniversaryToday,
} from "../../utils/employeeMasterReminders";

const base = "/app/admin";

const tabs = [
  { id: "employee", label: "Employee" },
  { id: "store", label: "Store" },
  { id: "gate", label: "Gate Pass" },
  { id: "misc", label: "Misc" },
  { id: "compliance", label: "Compliance" },
  { id: "overdue", label: "Overdue / Escalation" },
];

export default function AdminOpsAlerts() {
  const [tab, setTab] = useState("employee");
  const navigate = useNavigate();
  const [empMaster, setEmpMaster] = useState([]);
  const [empLoadError, setEmpLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (tab !== "employee") return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) {
          setEmpMaster([]);
          return;
        }
        const { data, error } = await supabase
          .from("admin_ifsp_employee_master")
          .select(
            "id, employee_id, full_name, date_of_birth, date_of_anniversary, status, birthday_reminder, anniversary_reminder"
          )
          .eq("user_id", user.id);
        if (cancelled) return;
        if (error) throw error;
        setEmpMaster(data || []);
        setEmpLoadError(null);
      } catch (e) {
        if (!cancelled) {
          setEmpMaster([]);
          setEmpLoadError(e?.message || "Could not load employee master");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const birthdaysToday = tab === "employee" ? employeesWithBirthdayToday(empMaster) : [];
  const anniversariesToday = tab === "employee" ? employeesWithAnniversaryToday(empMaster) : [];

  const celebrationRows = [];
  if (tab === "employee") {
    birthdaysToday.forEach((e, i) => {
      celebrationRows.push({
        id: `bday-${e.id}-${i}`,
        severity: "warning",
        title: `Birthday: ${e.full_name} (${e.employee_id || "—"})`,
        due: "Today",
        assign: "HR / Admin",
        link: "Employee Master",
      });
    });
    anniversariesToday.forEach((e, i) => {
      celebrationRows.push({
        id: `ann-${e.id}-${i}`,
        severity: "warning",
        title: `Wedding anniversary: ${e.full_name} (${e.employee_id || "—"})`,
        due: "Today",
        assign: "HR / Admin",
        link: "Employee Master",
      });
    });
  }

  const mockRows = mockAlerts.filter((a) => a.tab === tab);
  const rows = tab === "employee" ? [...celebrationRows, ...mockRows] : mockRows;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Alerts & notifications center"
        right={
          <div className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-2 py-1 rounded text-[11px] border ${
                  tab === t.id ? "bg-[#1F3A8A] text-white border-[#1F3A8A]" : "bg-white border-gray-200 text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        <FilterBar>
          <TinySelect className="min-w-[140px]">
            <option>Severity: all</option>
            <option>Critical</option>
            <option>High</option>
            <option>Warning</option>
          </TinySelect>
          <span className="text-[11px] text-gray-500 self-center">
            {tab === "employee"
              ? "Birthdays and wedding anniversaries (today) are loaded from IFSPL Employee Master for all active employees with reminders on."
              : "Examples: leave queue, shortages, visitor checkout, F&F assets, transit SLA"}
          </span>
        </FilterBar>
        {tab === "employee" && empLoadError && (
          <p className="text-[11px] text-amber-700 mt-2">{empLoadError}</p>
        )}
        {tab === "employee" && !empLoadError && celebrationRows.length === 0 && empMaster.length > 0 && (
          <p className="text-[11px] text-gray-500 mt-2">No birthdays or anniversaries today.</p>
        )}
        <div className="mt-3">
          <DenseTable
            columns={[
              {
                key: "severity",
                label: "Severity",
                render: (r) => (
                  <StatusChip
                    label={r.severity}
                    severity={r.severity === "critical" ? "critical" : r.severity === "high" ? "high" : "warning"}
                  />
                ),
              },
              { key: "title", label: "Alert" },
              { key: "due", label: "Due" },
              { key: "assign", label: "Owner" },
              {
                key: "link",
                label: "Linked action",
                render: (r) => (
                  <button
                    type="button"
                    className="text-[11px] text-blue-700 font-medium"
                    onClick={() => {
                      const map = {
                        Leaves: "employee/leaves-permissions",
                        "Site Stock": "store/site-stock",
                        "Employee Movement": "gate/employee-movement",
                        Compliance: "employee/compliance-documents",
                        Events: "misc/events-coordination",
                        Transfer: "store/transfer-transit",
                        "Employee Master": "employee/master",
                      };
                      const p = map[r.link] || "dashboard";
                      navigate(`${base}/${p}`);
                    }}
                  >
                    {r.link} →
                  </button>
                ),
              },
              {
                key: "id",
                label: "Actions",
                render: () => (
                  <div className="flex gap-1">
                    <button type="button" className="text-[10px] text-gray-600 underline">
                      Snooze
                    </button>
                    <button type="button" className="text-[10px] text-gray-600 underline">
                      Done
                    </button>
                  </div>
                ),
              },
            ]}
            rows={
              rows.length
                ? rows
                : [
                    {
                      id: `empty-${tab}`,
                      severity: "info",
                      title: "No items in this tab (sample)",
                      due: "-",
                      assign: "-",
                      link: "Dashboard",
                    },
                  ]
            }
            rowKey="id"
          />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <SectionCard title="SLA snapshot" className="!p-3">
          <p className="text-xs text-gray-600">Critical open: 2 · High: 5 · Breached today: 1</p>
        </SectionCard>
        <SectionCard title="Routing rules" className="!p-3">
          <p className="text-xs text-gray-600">Admin lead, store manager, security — matrix in Settings.</p>
        </SectionCard>
        <SectionCard title="Digest" className="!p-3">
          <Badge tone="bg-gray-100 text-gray-700">Email / Teams hooks</Badge>
        </SectionCard>
      </div>
    </div>
  );
}
