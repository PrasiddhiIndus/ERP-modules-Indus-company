/** Onboarding — new Employee Master joiners; assign Policies & Terms from here. */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ScrollText,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import {
  PageTaskHeader,
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  StatusChip,
  Drawer,
  Modal,
  KpiTile,
  CollapsibleHelp,
} from "../components/AdminUi";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { toast } from "../../../lib/toast";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import {
  assignDocumentsToEmployee,
  fetchAssignmentsForEmployee,
  fetchPolicyAssignmentCountsByEmployee,
  fetchPolicyDocuments,
  friendlyPolicyError,
  isMissingPolicyTableError,
  policyDocTypeLabel,
  removeDocumentAssignment,
} from "../../../lib/adminPolicyDocuments";
import {
  JOINING_DOC_KINDS,
  deleteJoiningDocument,
  fetchJoiningDocumentCountsByEmployee,
  fetchJoiningDocumentsForEmployee,
  friendlyJoiningError,
  insertJoiningDocument,
  isMissingJoiningTableError,
  joiningDocKindLabel,
} from "../../../lib/adminJoiningDocuments";
import {
  deleteJoiningR2Object,
  presignJoiningR2Get,
  uploadJoiningFileToR2,
} from "../../../lib/adminJoiningR2";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const JOINING_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp";

function newDocumentId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;
}
const WINDOW_OPTIONS = [
  { value: "all", label: "All active employees" },
  { value: "90", label: "Joined in last 90 days" },
  { value: "180", label: "Joined in last 180 days" },
  { value: "365", label: "Joined in last 12 months" },
];

const SELECT_FIELDS = [
  "id",
  "employee_code",
  "full_name",
  "department",
  "designation",
  "date_of_joining",
  "status",
  "aadhar_no",
  "pan_card_no",
  "uan_no",
  "esic_no",
  "bank_name",
  "bank_account_no",
  "ifsc_code",
  "email_id",
  "personal_no",
  "l1_manager_code",
  "l1_manager_name",
  "employment_type",
].join(",");

const REQUIRED_CHECKS = [
  { key: "employee_code", label: "Employee code" },
  { key: "date_of_joining", label: "Date of joining" },
  { key: "department", label: "Department" },
  { key: "designation", label: "Designation" },
  { key: "aadhar_no", label: "Aadhaar" },
  { key: "pan_card_no", label: "PAN" },
  { key: "bank_account_no", label: "Bank account" },
  { key: "ifsc_code", label: "IFSC" },
  { key: "personal_no", label: "Mobile" },
  { key: "l1_manager_code", label: "Reporting manager" },
];

const OPTIONAL_CHECKS = [
  { key: "uan_no", label: "UAN" },
  { key: "esic_no", label: "ESIC" },
  { key: "email_id", label: "Work email" },
];

const COL_MIN = "min-w-[120px]";
const COL_NAME = "min-w-[200px]";
const COL_DATE = "min-w-[130px]";

function hasValue(value) {
  return String(value ?? "").trim().length > 0;
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function daysSince(iso) {
  if (!iso) return null;
  const start = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000));
}

function evaluateOnboarding(row, docsAssigned = 0, joiningDocsCount = 0) {
  const missingRequired = REQUIRED_CHECKS.filter((item) => !hasValue(row[item.key]));
  const missingOptional = OPTIONAL_CHECKS.filter((item) => !hasValue(row[item.key]));
  const requiredDone = REQUIRED_CHECKS.length - missingRequired.length;
  const profilePct = Math.round((requiredDone / REQUIRED_CHECKS.length) * 100);
  const policiesOk = docsAssigned > 0;
  const joiningOk = joiningDocsCount > 0;
  // Profile 70% + joining docs 15% + policies 15%
  const pct = Math.min(
    100,
    Math.round(profilePct * 0.7 + (joiningOk ? 15 : 0) + (policiesOk ? 15 : 0))
  );

  let stage = "Ready";
  if (missingRequired.some((item) => ["employee_code", "date_of_joining", "department", "designation"].includes(item.key))) {
    stage = "Profile";
  } else if (missingRequired.some((item) => ["aadhar_no", "pan_card_no"].includes(item.key))) {
    stage = "Identity";
  } else if (missingRequired.some((item) => ["bank_account_no", "ifsc_code"].includes(item.key))) {
    stage = "Bank";
  } else if (missingRequired.some((item) => item.key === "personal_no")) {
    stage = "Contact";
  } else if (missingRequired.some((item) => item.key === "l1_manager_code")) {
    stage = "Reporting";
  } else if (!joiningOk) {
    stage = "Joining docs";
  } else if (!policiesOk) {
    stage = "Policies";
  }

  const profileReady = missingRequired.length === 0;
  const ready = profileReady && joiningOk && policiesOk;

  let pendingLabel = "Complete";
  if (!profileReady) {
    pendingLabel =
      missingRequired
        .slice(0, 2)
        .map((item) => item.label)
        .join(", ") + (missingRequired.length > 2 ? ` +${missingRequired.length - 2}` : "");
  } else if (!joiningOk) {
    pendingLabel = "Upload joining documents";
  } else if (!policiesOk) {
    pendingLabel = "Assign policies / terms";
  }

  return {
    missingRequired,
    missingOptional,
    pct,
    stage,
    ready,
    profileReady,
    docsAssigned,
    joiningDocsCount,
    pendingLabel,
  };
}

function stageSeverity(stage, ready) {
  if (ready) return "info";
  if (stage === "Profile" || stage === "Identity") return "high";
  if (stage === "Joining docs" || stage === "Policies" || stage === "Documents") return "warning";
  return "warning";
}

function employeeMasterPath(id) {
  return `/app/admin/employee/master/${id}`;
}

export function EmployeeOnboardingPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [windowDays, setWindowDays] = useState("all");
  const [progressFilter, setProgressFilter] = useState("incomplete");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const [assignedDocs, setAssignedDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [joiningDocs, setJoiningDocs] = useState([]);
  const [joiningLoading, setJoiningLoading] = useState(false);
  const [joiningUnavailable, setJoiningUnavailable] = useState(false);
  const [joiningUploadOpen, setJoiningUploadOpen] = useState(false);
  const [joiningForm, setJoiningForm] = useState({
    docKind: "aadhaar",
    title: "",
    file: null,
  });
  const [openingJoiningId, setOpeningJoiningId] = useState("");
  const [policyLibrary, setPolicyLibrary] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [pickedDocIds, setPickedDocIds] = useState(() => new Set());
  const [docSearch, setDocSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [policiesUnavailable, setPoliciesUnavailable] = useState(false);

  const loadJoiners = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let query = supabase
        .from("admin_ifsp_employee_master")
        .select(SELECT_FIELDS)
        .eq("status", "Active")
        .order("date_of_joining", { ascending: false, nullsFirst: true })
        .order("full_name", { ascending: true });

      if (windowDays !== "all") {
        const cutoff = isoDaysAgo(windowDays);
        query = query.or(`date_of_joining.gte.${cutoff},date_of_joining.is.null`);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      const list = data || [];
      let counts = new Map();
      let joiningCounts = new Map();
      try {
        counts = await fetchPolicyAssignmentCountsByEmployee(list.map((r) => r.id));
        setPoliciesUnavailable(false);
      } catch (countErr) {
        console.error(countErr);
        if (isMissingPolicyTableError(countErr)) setPoliciesUnavailable(true);
      }
      try {
        joiningCounts = await fetchJoiningDocumentCountsByEmployee(list.map((r) => r.id));
        setJoiningUnavailable(false);
      } catch (joinErr) {
        console.error(joinErr);
        if (isMissingJoiningTableError(joinErr)) setJoiningUnavailable(true);
      }

      const mapped = list.map((row) => {
        const docsAssigned = counts.get(String(row.id)) || 0;
        const joiningDocsCount = joiningCounts.get(String(row.id)) || 0;
        return {
          ...row,
          ...evaluateOnboarding(row, docsAssigned, joiningDocsCount),
          days_since_joining: daysSince(row.date_of_joining),
        };
      });
      setRows(mapped);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not load joiners.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    loadJoiners();
  }, [loadJoiners]);

  const loadEmployeeDocs = useCallback(async (employeeId) => {
    if (!employeeId) {
      setAssignedDocs([]);
      setJoiningDocs([]);
      return;
    }
    setDocsLoading(true);
    setJoiningLoading(true);
    try {
      const list = await fetchAssignmentsForEmployee(employeeId);
      setAssignedDocs(list);
      setPoliciesUnavailable(false);
    } catch (err) {
      console.error(err);
      setAssignedDocs([]);
      if (isMissingPolicyTableError(err)) setPoliciesUnavailable(true);
    } finally {
      setDocsLoading(false);
    }
    try {
      const list = await fetchJoiningDocumentsForEmployee(employeeId);
      setJoiningDocs(list);
      setJoiningUnavailable(false);
    } catch (err) {
      console.error(err);
      setJoiningDocs([]);
      if (isMissingJoiningTableError(err)) setJoiningUnavailable(true);
    } finally {
      setJoiningLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected?.id) loadEmployeeDocs(selected.id);
  }, [selected?.id, loadEmployeeDocs]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (progressFilter === "incomplete" && row.ready) return false;
      if (progressFilter === "ready" && !row.ready) return false;
      if (progressFilter === "needs-docs" && row.docsAssigned > 0 && row.joiningDocsCount > 0) return false;
      if (progressFilter === "needs-joining" && row.joiningDocsCount > 0) return false;
      if (!q) return true;
      const hay = [row.full_name, row.employee_code, row.department, row.designation, row.stage, row.pendingLabel]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [rows, search, progressFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, progressFilter, windowDays]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const incompleteCount = rows.filter((row) => !row.ready).length;
  const readyCount = rows.filter((row) => row.ready).length;
  const needsDocsCount = rows.filter((row) => row.docsAssigned === 0).length;
  const needsJoiningCount = rows.filter((row) => row.joiningDocsCount === 0).length;

  const columns = useMemo(
    () => [
      {
        key: "full_name",
        label: "Joiner",
        headerClassName: COL_NAME,
        cellClassName: COL_NAME,
        render: (row) => <span className="font-medium text-gray-900">{row.full_name || "—"}</span>,
      },
      {
        key: "employee_code",
        label: "Code",
        headerClassName: COL_MIN,
        cellClassName: COL_MIN,
        render: (row) => <span className="font-mono text-[11px] tabular-nums">{row.employee_code || "—"}</span>,
      },
      {
        key: "department",
        label: "Department",
        headerClassName: COL_MIN,
        cellClassName: COL_MIN,
        render: (row) => row.department || "—",
      },
      {
        key: "date_of_joining",
        label: "Joined",
        headerClassName: COL_DATE,
        cellClassName: COL_DATE,
        render: (row) => (
          <span>
            {formatDateDdMmYyyy(row.date_of_joining) || "—"}
            {row.days_since_joining != null ? (
              <span className="block text-[10px] text-gray-500">{row.days_since_joining}d ago</span>
            ) : null}
          </span>
        ),
      },
      {
        key: "stage",
        label: "Stage",
        headerClassName: COL_MIN,
        cellClassName: COL_MIN,
        render: (row) => <StatusChip label={row.stage} severity={stageSeverity(row.stage, row.ready)} />,
      },
      {
        key: "joiningDocsCount",
        label: "Joining docs",
        headerClassName: "min-w-[100px]",
        cellClassName: "min-w-[100px]",
        render: (row) => (
          <span
            className={
              row.joiningDocsCount > 0 ? "text-emerald-700 tabular-nums" : "text-amber-800 font-medium tabular-nums"
            }
          >
            {row.joiningDocsCount > 0 ? `${row.joiningDocsCount} file${row.joiningDocsCount === 1 ? "" : "s"}` : "None"}
          </span>
        ),
      },
      {
        key: "docsAssigned",
        label: "Policies",
        headerClassName: "min-w-[100px]",
        cellClassName: "min-w-[100px]",
        render: (row) => (
          <span className={row.docsAssigned > 0 ? "text-emerald-700 tabular-nums" : "text-amber-800 font-medium tabular-nums"}>
            {row.docsAssigned > 0 ? `${row.docsAssigned} assigned` : "None"}
          </span>
        ),
      },
      {
        key: "pendingLabel",
        label: "Still needed",
        headerClassName: "min-w-[180px]",
        cellClassName: "min-w-[180px]",
        render: (row) => (
          <span className={row.ready ? "text-emerald-700" : "text-amber-800"}>{row.pendingLabel}</span>
        ),
      },
    ],
    []
  );

  const openAssignDocs = async () => {
    if (!selected) return;
    setDocSearch("");
    setPickedDocIds(new Set());
    try {
      const [docs, current] = await Promise.all([
        fetchPolicyDocuments(),
        fetchAssignmentsForEmployee(selected.id),
      ]);
      setPolicyLibrary(docs);
      setAssignedDocs(current);
      setAssignOpen(true);
    } catch (err) {
      console.error(err);
      toast.error(friendlyPolicyError(err, "Could not load documents from Policies & Terms."));
    }
  };

  const availableToPick = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    const alreadyIds = new Set(assignedDocs.map((d) => String(d.id)));
    return policyLibrary.filter((doc) => {
      if (alreadyIds.has(String(doc.id))) return false;
      if (!q) return true;
      const hay = [doc.title, doc.file_name, policyDocTypeLabel(doc.doc_type)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [policyLibrary, assignedDocs, docSearch]);

  const toggleDoc = (id) => {
    setPickedDocIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAssignDocs = async () => {
    if (!selected) return;
    const already = new Set(assignedDocs.map((d) => String(d.id)));
    const toAdd = [...pickedDocIds].filter((id) => !already.has(String(id)));
    if (!toAdd.length) {
      toast.warning("Select at least one new document to assign.");
      return;
    }
    setSaving(true);
    try {
      await assignDocumentsToEmployee({
        employeeMasterId: selected.id,
        documentIds: toAdd,
        assignedBy: user?.id || null,
      });
      toast.success(
        `Assigned ${toAdd.length} document${toAdd.length === 1 ? "" : "s"} to ${selected.full_name || "employee"}.`
      );
      setAssignOpen(false);
      await loadEmployeeDocs(selected.id);
      await loadJoiners();
      setSelected((prev) => {
        if (!prev) return prev;
        const nextCount = (prev.docsAssigned || 0) + toAdd.length;
        return { ...prev, ...evaluateOnboarding(prev, nextCount, prev.joiningDocsCount || 0) };
      });
    } catch (err) {
      console.error(err);
      toast.error(friendlyPolicyError(err, "Could not assign documents."));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId) => {
    if (!assignmentId || !selected) return;
    setSaving(true);
    try {
      await removeDocumentAssignment(assignmentId);
      toast.success("Document removed from this employee.");
      await loadEmployeeDocs(selected.id);
      await loadJoiners();
      setSelected((prev) => {
        if (!prev) return prev;
        const nextCount = Math.max(0, (prev.docsAssigned || 1) - 1);
        return { ...prev, ...evaluateOnboarding(prev, nextCount, prev.joiningDocsCount || 0) };
      });
    } catch (err) {
      console.error(err);
      toast.error(friendlyPolicyError(err, "Could not remove assignment."));
    } finally {
      setSaving(false);
    }
  };

  const openJoiningUpload = () => {
    const kind = JOINING_DOC_KINDS[0];
    setJoiningForm({
      docKind: kind.value,
      title: kind.label,
      file: null,
    });
    setJoiningUploadOpen(true);
  };

  const handleJoiningUpload = async () => {
    if (!selected) return;
    const title = joiningForm.title.trim() || joiningDocKindLabel(joiningForm.docKind);
    if (!joiningForm.file) {
      toast.warning("Choose a file to upload.");
      return;
    }
    setSaving(true);
    const documentId = newDocumentId();
    let objectKey = "";
    try {
      const uploaded = await uploadJoiningFileToR2({
        file: joiningForm.file,
        employeeMasterId: selected.id,
        documentId,
      });
      objectKey = uploaded.objectKey;
      await insertJoiningDocument({
        id: documentId,
        employee_master_id: selected.id,
        doc_kind: joiningForm.docKind,
        title,
        file_name: joiningForm.file.name,
        file_size: joiningForm.file.size,
        content_type: uploaded.contentType || joiningForm.file.type || null,
        object_key: objectKey,
        uploaded_by: user?.id || null,
      });
      toast.success("Joining document uploaded.");
      setJoiningUploadOpen(false);
      await loadEmployeeDocs(selected.id);
      await loadJoiners();
      setSelected((prev) => {
        if (!prev) return prev;
        const nextJoining = (prev.joiningDocsCount || 0) + 1;
        return { ...prev, ...evaluateOnboarding(prev, prev.docsAssigned || 0, nextJoining) };
      });
    } catch (err) {
      console.error(err);
      if (objectKey) {
        try {
          await deleteJoiningR2Object(objectKey);
        } catch {
          /* ignore */
        }
      }
      toast.error(friendlyJoiningError(err, "Could not upload joining document."));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenJoiningFile = async (doc) => {
    if (!doc?.object_key) {
      toast.warning("No file is attached yet.");
      return;
    }
    setOpeningJoiningId(doc.id);
    try {
      const url = await presignJoiningR2Get(doc.object_key, { fileName: doc.file_name });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Could not open the file.");
    } finally {
      setOpeningJoiningId("");
    }
  };

  const handleDeleteJoining = async (doc) => {
    if (!doc || !selected) return;
    const ok = window.confirm(`Remove “${doc.title}”?`);
    if (!ok) return;
    setSaving(true);
    try {
      if (doc.object_key) {
        try {
          await deleteJoiningR2Object(doc.object_key);
        } catch (fileErr) {
          console.error(fileErr);
        }
      }
      await deleteJoiningDocument(doc.id);
      toast.success("Joining document removed.");
      await loadEmployeeDocs(selected.id);
      await loadJoiners();
      setSelected((prev) => {
        if (!prev) return prev;
        const nextJoining = Math.max(0, (prev.joiningDocsCount || 1) - 1);
        return { ...prev, ...evaluateOnboarding(prev, prev.docsAssigned || 0, nextJoining) };
      });
    } catch (err) {
      console.error(err);
      toast.error(friendlyJoiningError(err, "Could not remove joining document."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 max-w-[1680px] mx-auto min-w-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100">
          <UserPlus className="h-5 w-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <PageTaskHeader
            title="Onboarding"
            subtitle="New employees from Employee Master appear here. Open a person to upload joining documents and assign Policies & Terms."
          >
            <Link
              to="/app/admin/employee/master"
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent-deep"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add employee
            </Link>
            <Link
              to="/app/admin/employee/policies"
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Policies &amp; Terms
            </Link>
            <Link
              to="/app/admin/employee/official-letters"
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            >
              <ScrollText className="h-3.5 w-3.5" />
              Official Letters
            </Link>
            <button
              type="button"
              onClick={loadJoiners}
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </PageTaskHeader>
          <CollapsibleHelp label="how this works">
            Add someone in Employee Master (Active) and they show on this list. Click the row to review profile gaps,
            upload their joining documents (Aadhaar, PAN, etc.), and assign company Policies &amp; Terms. Onboarding is
            complete when profile essentials, joining docs, and at least one policy/terms assignment are done. For
            appointment, confirmation, and other HR letters — including probation reviews — use{" "}
            <Link to="/app/admin/employee/official-letters" className="font-medium text-accent hover:underline">
              Official Letters
            </Link>
            .
          </CollapsibleHelp>
        </div>
      </div>

      {policiesUnavailable || joiningUnavailable ? (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Some document features need the latest database update.
          {joiningUnavailable ? " Joining document upload is unavailable until that update is applied." : ""}
          {policiesUnavailable ? " Policy assignment needs the Policies & Terms migration." : ""}
        </p>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiTile label="On list" value={String(rows.length)} tone="border-indigo-100" />
        <KpiTile label="Setup incomplete" value={String(incompleteCount)} tone="border-amber-100" />
        <KpiTile
          label="Need joining docs"
          value={String(needsJoiningCount)}
          tone="border-violet-100"
        />
        <KpiTile
          label="Need policies"
          value={String(needsDocsCount)}
          tone="border-sky-100"
          sub={`${readyCount} ready`}
        />
      </div>

      <SectionCard
        title={`Onboarding register (${filteredRows.length})`}
        right={
          search || progressFilter !== "incomplete" || windowDays !== "all" ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setProgressFilter("incomplete");
                setWindowDays("all");
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
            >
              <X className="h-3 w-3" />
              Reset filters
            </button>
          ) : null
        }
      >
        <FilterBar>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5 flex-1 min-w-[200px]">
            Quick search
            <TinyInput
              placeholder="Name, code, department, stage…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Who appears
            <TinySelect value={windowDays} onChange={(e) => setWindowDays(e.target.value)} className="min-w-[180px]">
              {WINDOW_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Progress
            <TinySelect value={progressFilter} onChange={(e) => setProgressFilter(e.target.value)} className="min-w-[160px]">
              <option value="incomplete">Incomplete</option>
              <option value="needs-joining">Need joining docs</option>
              <option value="needs-docs">Need policies</option>
              <option value="ready">Ready</option>
              <option value="all">All on list</option>
            </TinySelect>
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Rows
            <TinySelect value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </TinySelect>
          </label>
        </FilterBar>

        {error ? (
          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-3">{error}</p>
        ) : null}

        {loading ? (
          <div className="py-12 text-center">
            <RefreshCw className="h-6 w-6 mx-auto text-gray-300 animate-spin mb-2" />
            <p className="text-xs text-gray-500">Loading joiners…</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-12 text-center">
            <UserPlus className="h-10 w-10 mx-auto text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-700">No matching joiners</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              {rows.length === 0
                ? "Add an Active employee in Employee Master and they will appear here for onboarding."
                : "Try adjusting search or progress filters."}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-3 min-w-0">
              <DenseTable
                columns={columns}
                rows={pageRows}
                rowKey="id"
                activeRowId={selected?.id ?? null}
                onRowClick={(row) => setSelected(row)}
                stickyHeader
                scrollMaxHeight="calc(100dvh - 20rem)"
                serialOffset={(page - 1) * pageSize}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
              <span className="tabular-nums">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredRows.length)} of{" "}
                {filteredRows.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-0.5 h-8 px-2.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <span className="px-2 tabular-nums min-w-[88px] text-center">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-0.5 h-8 px-2.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </SectionCard>

      <Drawer
        open={Boolean(selected) && !assignOpen && !joiningUploadOpen}
        onClose={() => setSelected(null)}
        title={selected?.full_name || "Joiner"}
        widthClass="max-w-lg"
      >
        {selected ? (
          <div className="space-y-4 text-xs">
            <p className="text-[11px] text-gray-500 -mt-1 pb-2 border-b border-gray-100">
              {selected.employee_code || "—"} · {selected.department || "—"}
            </p>
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
              <DetailField label="Joined" value={formatDateDdMmYyyy(selected.date_of_joining)} />
              <DetailField
                label="Setup"
                value={<StatusChip label={selected.stage} severity={stageSeverity(selected.stage, selected.ready)} />}
              />
              <DetailField label="Complete" value={`${selected.pct}%`} />
              <DetailField label="Reporting manager" value={selected.l1_manager_name || selected.l1_manager_code} />
            </div>

            <ChecklistBlock title="Required before ready" items={REQUIRED_CHECKS} row={selected} />
            <ChecklistBlock title="Recommended" items={OPTIONAL_CHECKS} row={selected} optional />

            <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-900">Joining documents</p>
              <p className="text-[11px] text-gray-600">
                Upload this employee’s personal joining papers (Aadhaar, PAN, bank proof, etc.).
              </p>
              {joiningLoading ? (
                <p className="text-[11px] text-gray-500">Loading joining documents…</p>
              ) : joiningDocs.length === 0 ? (
                <p className="text-[11px] text-amber-800 font-medium">No joining documents uploaded yet.</p>
              ) : (
                <ul className="rounded-md border border-gray-200 bg-white divide-y divide-gray-100 max-h-44 overflow-y-auto">
                  {joiningDocs.map((doc) => (
                    <li key={doc.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenJoiningFile(doc)}
                        disabled={openingJoiningId === doc.id}
                        className="text-left min-w-0 truncate hover:underline disabled:opacity-50"
                      >
                        <span className="font-medium text-gray-900">{doc.title}</span>
                        <span className="text-gray-500">
                          {" "}
                          · {joiningDocKindLabel(doc.doc_kind)}
                          {openingJoiningId === doc.id ? " · Opening…" : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleDeleteJoining(doc)}
                        className="text-[11px] text-red-600 hover:underline disabled:opacity-50 shrink-0"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={openJoiningUpload}
                disabled={joiningUnavailable}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-deep w-full disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload joining document
              </button>
            </div>

            <div className="rounded-lg border border-sky-100 bg-sky-50/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-900">Policies &amp; Terms</p>
                <Link to="/app/admin/employee/policies" className="text-[11px] font-medium text-accent hover:underline">
                  Manage library
                </Link>
              </div>
              <p className="text-[11px] text-gray-600">
                Assign company documents uploaded on Policies &amp; Terms to this joiner.
              </p>
              {docsLoading ? (
                <p className="text-[11px] text-gray-500">Loading assigned documents…</p>
              ) : assignedDocs.length === 0 ? (
                <p className="text-[11px] text-amber-800 font-medium">No documents assigned yet.</p>
              ) : (
                <ul className="rounded-md border border-gray-200 bg-white divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {assignedDocs.map((doc) => (
                    <li key={doc.assignmentId || doc.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                      <span className="truncate">
                        {doc.title}
                        <span className="text-gray-500"> · {policyDocTypeLabel(doc.doc_type)}</span>
                      </span>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleRemoveAssignment(doc.assignmentId)}
                        className="text-[11px] text-red-600 hover:underline disabled:opacity-50 shrink-0"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={openAssignDocs}
                disabled={policiesUnavailable}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium hover:bg-gray-50 w-full disabled:opacity-50"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Assign policies / terms
              </button>
            </div>

            <Link
              to={employeeMasterPath(selected.id)}
              className="inline-flex items-center justify-center h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium hover:bg-gray-50 w-full"
            >
              Open employee record
            </Link>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={joiningUploadOpen}
        onClose={() => !saving && setJoiningUploadOpen(false)}
        title={selected ? `Upload joining document — ${selected.full_name}` : "Upload joining document"}
        widthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setJoiningUploadOpen(false)}
              className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleJoiningUpload}
              className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-deep disabled:opacity-50"
            >
              {saving ? "Uploading…" : "Upload"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Document type
            <TinySelect
              value={joiningForm.docKind}
              onChange={(e) => {
                const kind = e.target.value;
                const label = joiningDocKindLabel(kind);
                setJoiningForm((f) => ({
                  ...f,
                  docKind: kind,
                  title: f.title.trim() === "" || JOINING_DOC_KINDS.some((k) => k.label === f.title) ? label : f.title,
                }));
              }}
              className="w-full"
            >
              {JOINING_DOC_KINDS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Title
            <TinyInput
              placeholder="e.g. Aadhaar card"
              value={joiningForm.title}
              onChange={(e) => setJoiningForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full"
            />
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            File
            <input
              type="file"
              accept={JOINING_ACCEPT}
              onChange={(e) => setJoiningForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              className="w-full text-xs file:mr-2 file:h-8 file:px-2 file:rounded file:border file:border-gray-300 file:bg-white"
            />
            <span className="text-[10px] text-gray-400">PDF, Word, or image. Max 25 MB.</span>
          </label>
        </div>
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => !saving && setAssignOpen(false)}
        title={selected ? `Assign documents — ${selected.full_name}` : "Assign documents"}
        widthClass="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setAssignOpen(false)}
              className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleAssignDocs}
              className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-deep disabled:opacity-50"
            >
              {saving ? "Saving…" : "Assign selected"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[11px] text-gray-500">
            Choose from documents uploaded on Policies &amp; Terms. Already assigned files are hidden.
          </p>
          <TinyInput
            placeholder="Search document title…"
            value={docSearch}
            onChange={(e) => setDocSearch(e.target.value)}
            className="w-full"
          />
          {policyLibrary.length === 0 ? (
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-3 text-[11px] text-amber-900">
              No documents in the library yet.{" "}
              <Link to="/app/admin/employee/policies" className="font-medium text-accent hover:underline">
                Upload on Policies &amp; Terms
              </Link>{" "}
              first, then return here to assign.
            </div>
          ) : availableToPick.length === 0 ? (
            <p className="text-[11px] text-gray-500">
              {docSearch ? "No matching documents." : "All library documents are already assigned to this employee."}
            </p>
          ) : (
            <ul className="h-56 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
              {availableToPick.map((doc) => {
                const checked = pickedDocIds.has(String(doc.id));
                return (
                  <li key={doc.id}>
                    <label className="flex items-start gap-2 px-2.5 py-2 text-[11px] hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={() => toggleDoc(doc.id)}
                      />
                      <span className="min-w-0">
                        <span className="font-medium text-gray-900 block truncate">{doc.title}</span>
                        <span className="text-gray-500">
                          {policyDocTypeLabel(doc.doc_type)}
                          {doc.file_name ? ` · ${doc.file_name}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-gray-900 mt-0.5">{value || "—"}</dd>
    </div>
  );
}

function ChecklistBlock({ title, items, row, optional = false }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="text-xs font-semibold text-gray-900 mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item) => {
          const done = hasValue(row[item.key]);
          return (
            <li key={item.key} className="flex items-center justify-between gap-2">
              <span className={done ? "text-gray-700" : optional ? "text-gray-500" : "text-amber-800 font-medium"}>
                {item.label}
              </span>
              <span className={`text-[11px] ${done ? "text-emerald-700" : "text-gray-400"}`}>
                {done ? "Done" : "Missing"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
