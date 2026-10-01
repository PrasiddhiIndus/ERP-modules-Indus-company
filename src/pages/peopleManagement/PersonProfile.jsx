import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Pencil, User } from "lucide-react";
import {
  DenseTable,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  Timeline,
} from "../adminOperations/components/AdminUi";
import { ManagerSearchSelect } from "../../components/employee/ManagerSearchSelect";
import { supabase } from "../../lib/supabase";
import {
  PERSON_EDITABLE_FIELDS,
  fetchPersonAssignments,
  fetchPersonAttendanceSummary,
  fetchPersonLeadHistory,
  fetchPersonProfile,
  fetchPersonSensitiveDetails,
  formatPeopleDirectoryError,
  setPeopleHrLeads,
  updatePersonBasics,
} from "../../lib/peopleDirectoryApi";
import { isActiveAssignment } from "../../lib/peopleManagementApi";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import { toast } from "../../lib/toast";
import { useAuth } from "../../contexts/AuthContext";
import SalaryEmployeeCtc from "../adminOperations/salaryAdmin/SalaryEmployeeCtc";
import { canAccessSalaryAdmin } from "../adminOperations/salaryAdmin/salaryAccess";
import { formatINR } from "../adminOperations/salaryAdmin/salaryData";
import { useHrTeamLeads } from "./useHrTeamLeads";
import LoginAccessSection from "./LoginAccessSection";

const LIST_PATH = "/app/people-management";

const SECTIONS = [
  { id: "personal", label: "Personal details" },
  { id: "hr-leads", label: "HR leads (L1 / L2)" },
  { id: "login", label: "Login" },
  { id: "ctc", label: "CTC details", salaryOnly: true },
  { id: "sites", label: "Site assignments" },
  { id: "attendance", label: "Attendance" },
  { id: "id-bank", label: "ID & bank" },
];

const FIELD_LABELS = {
  full_name: "Full name",
  father_name: "Father name",
  phone_no: "Phone",
  category_name: "Category",
};

function maskTail(value, visible = 4) {
  const s = String(value || "").trim();
  if (!s) return "—";
  if (s.length <= visible) return s;
  return `${"•".repeat(Math.min(8, s.length - visible))}${s.slice(-visible)}`;
}

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm text-gray-900 break-words">{children || "—"}</p>
    </div>
  );
}

function PersonalSection({ person, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startEdit = () => {
    setDraft(Object.fromEntries(PERSON_EDITABLE_FIELDS.map((f) => [f, person[f] ?? ""])));
    setError("");
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await updatePersonBasics(supabase, person.id, person, draft);
      toast.success("Saved", "Personal details updated.");
      setEditing(false);
      onSaved(saved);
    } catch (err) {
      console.error("Person update failed", err);
      setError(err?.message === "Name is required." ? err.message : formatPeopleDirectoryError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Personal details"
      right={
        !editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs font-medium border border-gray-300 bg-white hover:bg-gray-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        ) : null
      }
    >
      {editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PERSON_EDITABLE_FIELDS.map((field) => (
              <label key={field} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-700">{FIELD_LABELS[field]}</span>
                <input
                  type={field === "phone_no" ? "tel" : "text"}
                  value={draft[field] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                  className="h-9 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </label>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">
            Employee code, designation, joining and leaving dates are managed in Site Attendance so attendance stays
            consistent.
          </p>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="h-8 px-3 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-deep disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="h-8 px-3 rounded-md text-xs font-medium border border-gray-300 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Employee code">
            <span className="font-mono">{person.unique_code}</span>
          </Field>
          <Field label="Full name">{person.full_name}</Field>
          <Field label="Father name">{person.father_name}</Field>
          <Field label="Designation">{person.designation}</Field>
          <Field label="Category">{person.category_name}</Field>
          <Field label="Phone">{person.phone_no}</Field>
          <Field label="Date of birth">{formatDateDdMmYyyy(person.date_of_birth)}</Field>
          <Field label="Joining date">{formatDateDdMmYyyy(person.joining_date)}</Field>
          <Field label="Leaving date">{formatDateDdMmYyyy(person.leaving_date)}</Field>
          <Field label="PF no">{person.pf_no}</Field>
          <Field label="ESIC no">{person.esic_no}</Field>
          <Field label="Current site">
            {person.current_site_name
              ? [person.current_site_name, person.current_site_location].filter(Boolean).join(" · ")
              : "No active site"}
          </Field>
        </div>
      )}
    </SectionCard>
  );
}

function historyItems(history) {
  const describe = (level, oldCode, oldName, newCode, newName) => {
    if (oldCode === newCode) return null;
    const from = oldCode ? `${oldName || oldCode}` : "none";
    const to = newCode ? `${newName || newCode}` : "none";
    return `${level}: ${from} → ${to}`;
  };
  return history.map((h) => {
    const parts = [
      describe("L1", h.old_l1_employee_code, h.old_l1_employee_name, h.new_l1_employee_code, h.new_l1_employee_name),
      describe("L2", h.old_l2_employee_code, h.old_l2_employee_name, h.new_l2_employee_code, h.new_l2_employee_name),
    ].filter(Boolean);
    const when = h.changed_at ? new Date(h.changed_at).toLocaleString("en-IN") : "";
    return { title: parts.join(" · ") || "Leads updated", meta: when };
  });
}

function HrLeadsSection({ person, hrTeam, hrTeamError, isActiveLead, onSaved }) {
  const [l1, setL1] = useState({ code: person.l1_employee_code || "", name: person.l1_employee_name || "" });
  const [l2, setL2] = useState({ code: person.l2_employee_code || "", name: person.l2_employee_name || "" });
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchPersonLeadHistory(supabase, person.id));
    } catch (err) {
      console.warn("Lead history load failed", err);
      setHistory([]);
    }
  }, [person.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const dirty = l1.code !== (person.l1_employee_code || "") || l2.code !== (person.l2_employee_code || "");

  const save = async () => {
    setError("");
    if (l1.code && l1.code === l2.code) {
      setError("L1 and L2 must be different people.");
      return;
    }
    setSaving(true);
    try {
      await setPeopleHrLeads(supabase, {
        personIds: [person.id],
        setL1: true,
        l1Code: l1.code,
        setL2: true,
        l2Code: l2.code,
      });
      toast.success("HR leads saved");
      onSaved();
    } catch (err) {
      console.error("HR lead save failed", err);
      setError(formatPeopleDirectoryError(err));
    } finally {
      setSaving(false);
    }
  };

  const staleWarning = [
    person.l1_employee_code && !isActiveLead(person.l1_employee_code) ? "L1" : null,
    person.l2_employee_code && !isActiveLead(person.l2_employee_code) ? "L2" : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <SectionCard title="HR leads">
        <div className="space-y-4">
          <p className="text-xs text-gray-600">
            L1 is the direct HR lead for this employee and L2 is the skip-level lead. Both are chosen from the active HR
            team in Employee Master.
          </p>
          {hrTeamError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{hrTeamError}</div>
          ) : null}
          {staleWarning.length ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                The current {staleWarning.join(" and ")} lead is no longer in the active HR team. Please pick a
                replacement.
              </span>
            </div>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ManagerSearchSelect
              label="L1 lead (direct)"
              hint="Leave empty if not assigned."
              valueCode={l1.code}
              valueName={l1.name}
              candidates={hrTeam}
              onChange={setL1}
              placeholder="Search HR team by name or code…"
            />
            <ManagerSearchSelect
              label="L2 lead (skip-level)"
              hint="Must be different from L1."
              valueCode={l2.code}
              valueName={l2.name}
              candidates={hrTeam}
              onChange={setL2}
              placeholder="Search HR team by name or code…"
            />
          </div>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
          ) : null}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="h-8 px-3 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-deep disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save leads"}
            </button>
            {person.leads_updated_at ? (
              <span className="text-[11px] text-gray-500">
                Last changed {new Date(person.leads_updated_at).toLocaleString("en-IN")}
              </span>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Change history">
        {history.length ? (
          <Timeline items={historyItems(history)} />
        ) : (
          <p className="text-xs text-gray-500">No changes recorded yet.</p>
        )}
      </SectionCard>
    </div>
  );
}

function SitesSection({ personId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPersonAssignments(supabase, personId)
      .then((data) => !cancelled && setRows(data))
      .catch((err) => {
        console.error("Assignments load failed", err);
        if (!cancelled) {
          setRows([]);
          setError("Could not load site assignments.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const columns = useMemo(
    () => [
      { key: "site", label: "Site", render: (r) => r.sites?.site_name || `Site ${r.site_id}` },
      { key: "location", label: "Location", render: (r) => r.sites?.location || "—" },
      { key: "from_date", label: "From", render: (r) => formatDateDdMmYyyy(r.from_date) || "—" },
      { key: "to_date", label: "To", render: (r) => (r.to_date ? formatDateDdMmYyyy(r.to_date) : "Open") },
      {
        key: "status",
        label: "Status",
        render: (r) => (
          <StatusChip
            label={isActiveAssignment(r) ? "Active" : "Ended"}
            severity={isActiveAssignment(r) ? "info" : "warning"}
          />
        ),
      },
    ],
    []
  );

  return (
    <SectionCard title="Site assignments">
      {error ? <p className="mb-2 text-xs text-red-700">{error}</p> : null}
      {rows == null ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : (
        <DenseTable
          columns={columns}
          rows={rows.map((r) => ({ ...r, __key: `${r.site_id}-${r.from_date}-${r.to_date || "open"}` }))}
          rowKey="__key"
        />
      )}
    </SectionCard>
  );
}

function AttendanceSection({ personId }) {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPersonAttendanceSummary(supabase, personId, { months: 3 })
      .then((data) => !cancelled && setGroups(data))
      .catch((err) => {
        console.error("Attendance summary failed", err);
        if (!cancelled) {
          setGroups([]);
          setError("Could not load attendance.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const columns = useMemo(
    () => [
      {
        key: "month",
        label: "Month",
        render: (g) => {
          const [y, m] = g.month.split("-");
          return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
        },
      },
      { key: "site", label: "Site" },
      { key: "days", label: "Days marked", cellClassName: "tabular-nums" },
      {
        key: "codes",
        label: "Breakdown",
        render: (g) =>
          Object.entries(g.codes)
            .sort((a, b) => b[1] - a[1])
            .map(([code, n]) => `${code} ${n}`)
            .join(" · "),
      },
      { key: "otHours", label: "OT hours", render: (g) => (g.otHours ? g.otHours.toFixed(1) : "—") },
    ],
    []
  );

  return (
    <SectionCard title="Attendance · last 3 months">
      {error ? <p className="mb-2 text-xs text-red-700">{error}</p> : null}
      {groups == null ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : (
        <DenseTable columns={columns} rows={groups} rowKey="key" />
      )}
      <p className="mt-2 text-[11px] text-gray-500">
        Daily marking and corrections are done in{" "}
        <Link to="/app/hr/site-attendance" className="text-accent hover:underline">
          Site Attendance
        </Link>
        .
      </p>
    </SectionCard>
  );
}

function IdBankSection({ personId }) {
  const [details, setDetails] = useState(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPersonSensitiveDetails(supabase, personId)
      .then((data) => !cancelled && setDetails(data))
      .catch((err) => {
        console.error("Sensitive details load failed", err);
        if (!cancelled) {
          setDetails(null);
          setError("You may not have access to ID and bank details.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  return (
    <SectionCard title="ID & bank">
      {error ? <p className="mb-2 text-xs text-amber-800">{error}</p> : null}
      {details === undefined ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : !details ? (
        <p className="text-xs text-gray-500">No ID or bank details on file.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Date of birth">{formatDateDdMmYyyy(details.date_of_birth)}</Field>
          <Field label="Aadhaar">{maskTail(details.aadhaar_no)}</Field>
          <Field label="PAN">{details.pan_no}</Field>
          <Field label="UAN">{details.uan_no}</Field>
          <Field label="Bank">{details.bank_name}</Field>
          <Field label="Account no">{maskTail(details.bank_account_no)}</Field>
          <Field label="IFSC">{details.ifsc_code}</Field>
        </div>
      )}
      <p className="mt-3 text-[11px] text-gray-500">
        Updated through{" "}
        <Link to="/app/hr/site-iom" className="text-accent hover:underline">
          Site Employee IOM
        </Link>
        .
      </p>
    </SectionCard>
  );
}

export default function PersonProfile() {
  const { personId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hrTeam, error: hrTeamError, isActiveLead } = useHrTeamLeads();
  const { user, userProfile } = useAuth();
  const salaryAdmin = canAccessSalaryAdmin(userProfile, user);
  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => !s.salaryOnly || salaryAdmin),
    [salaryAdmin]
  );

  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const tabParam = searchParams.get("tab") || "personal";
  const activeTab = visibleSections.some((s) => s.id === tabParam) ? tabParam : "personal";

  const load = useCallback(
    async ({ soft = false } = {}) => {
      if (!soft) setLoading(true);
      setError("");
      try {
        const row = await fetchPersonProfile(supabase, personId);
        setPerson(row);
        if (!row) setError("Employee not found.");
      } catch (err) {
        console.error("Person profile load failed", err);
        if (!soft) {
          setPerson(null);
          setError("Could not load employee. Please try again.");
        }
      } finally {
        if (!soft) setLoading(false);
      }
    },
    [personId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const setTab = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id === "personal") next.delete("tab");
    else next.set("tab", id);
    next.delete("mode");
    setSearchParams(next, { replace: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="p-6 space-y-3 max-w-3xl">
        <Link to={LIST_PATH} className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to People Management
        </Link>
        <p className="text-sm text-red-600">{error || "Employee not found."}</p>
      </div>
    );
  }

  const active = person.is_active !== false;

  return (
    <div className="h-[calc(100vh-7rem)] min-h-[28rem] bg-gray-50 flex flex-col overflow-hidden">
      <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 pt-4 md:pt-6 flex flex-col flex-1 min-h-0 gap-4">
        <div className="shrink-0 space-y-3">
          <button
            type="button"
            onClick={() => navigate(LIST_PATH)}
            className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900"
          >
            <ArrowLeft className="h-4 w-4" />
            People Management
          </button>

          <PageTaskHeader
            title={person.full_name || "Employee"}
            subtitle={[person.unique_code, person.designation, person.current_site_name].filter(Boolean).join(" · ")}
          >
            <StatusChip label={active ? "Active" : "Inactive"} severity={active ? "info" : "critical"} />
          </PageTaskHeader>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                <User className="h-7 w-7 text-gray-400" aria-hidden />
              </div>
              <div className="text-sm text-gray-700 space-y-0.5">
                <p>
                  <span className="text-gray-500">Employee code:</span>{" "}
                  <span className="font-mono font-medium text-gray-900">{person.unique_code || "—"}</span>
                </p>
                <p>
                  <span className="text-gray-500">Joined:</span> {formatDateDdMmYyyy(person.joining_date) || "—"}
                </p>
              </div>
            </div>
            <div className="text-sm text-gray-700 space-y-0.5">
              <p>
                <span className="text-gray-500">L1 lead:</span>{" "}
                {person.l1_employee_code ? (
                  person.l1_employee_name || person.l1_employee_code
                ) : (
                  <button type="button" className="text-amber-700 hover:underline" onClick={() => setTab("hr-leads")}>
                    Not assigned
                  </button>
                )}
              </p>
              <p>
                <span className="text-gray-500">L2 lead:</span>{" "}
                {person.l2_employee_code ? (
                  person.l2_employee_name || person.l2_employee_code
                ) : (
                  <button type="button" className="text-amber-700 hover:underline" onClick={() => setTab("hr-leads")}>
                    Not assigned
                  </button>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 lg:gap-6 pb-4 md:pb-6">
          <aside className="w-full lg:w-52 shrink-0 flex flex-col min-h-0 max-h-48 lg:max-h-none">
            <nav
              className="rounded-lg border border-gray-200 bg-white flex flex-col flex-1 min-h-0 overflow-hidden"
              aria-label="Employee profile sections"
            >
              <p className="shrink-0 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
                Sections
              </p>
              <ul className="flex-1 min-h-0 overflow-y-auto py-1 overscroll-contain">
                {visibleSections.map((section) => {
                  const isActive = activeTab === section.id;
                  const needsLead = section.id === "hr-leads" && (!person.l1_employee_code || !person.l2_employee_code);
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        onClick={() => setTab(section.id)}
                        className={[
                          "w-full text-left px-3 py-2 text-sm border-l-2 transition-colors",
                          isActive
                            ? "border-blue-600 bg-blue-50 text-blue-800 font-semibold"
                            : "border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                        ].join(" ")}
                      >
                        <span className="inline-flex items-center gap-2">
                          {section.label}
                          {needsLead ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Missing lead" /> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <div className="min-w-0 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-0.5">
            {activeTab === "personal" ? (
              <PersonalSection person={person} onSaved={(saved) => setPerson((prev) => ({ ...prev, ...saved }))} />
            ) : null}
            {activeTab === "hr-leads" ? (
              <HrLeadsSection
                key={`${person.l1_employee_code}-${person.l2_employee_code}`}
                person={person}
                hrTeam={hrTeam}
                hrTeamError={hrTeamError}
                isActiveLead={isActiveLead}
                onSaved={() => load({ soft: true })}
              />
            ) : null}
            {activeTab === "login" ? <LoginAccessSection person={person} /> : null}
            {activeTab === "ctc" ? (
              <div className="space-y-3">
                {Number(person.salary_basic) > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-700">
                    Salary on the latest Site Employee IOM:{" "}
                    <span className="font-semibold tabular-nums">{formatINR(person.salary_basic)}</span> per month.
                    Use it as a reference when entering Gross — the CTC below is saved separately.
                  </div>
                ) : null}
                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <SalaryEmployeeCtc employeeId={String(person.id)} subject="person" embedded persist />
                </div>
              </div>
            ) : null}
            {activeTab === "sites" ? <SitesSection personId={person.id} /> : null}
            {activeTab === "attendance" ? <AttendanceSection personId={person.id} /> : null}
            {activeTab === "id-bank" ? <IdBankSection personId={person.id} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
