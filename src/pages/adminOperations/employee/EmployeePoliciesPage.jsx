/** Policies & Terms — upload company documents and assign them to employees. */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Pencil, RefreshCw, Trash2, Upload, X } from "lucide-react";
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
import { useAuth } from "../../../contexts/AuthContext";
import { toast } from "../../../lib/toast";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import {
  POLICY_DOC_TYPES,
  agreementStatusLabel,
  deletePolicyDocument,
  fetchActiveEmployeesForAssign,
  fetchAssignmentsForDocument,
  fetchPolicyAssignmentCounts,
  fetchPolicyDocuments,
  friendlyPolicyError,
  insertPolicyDocument,
  isAgreementAgreed,
  policyDocTypeLabel,
  replaceDocumentAssignments,
  updatePolicyDocument,
} from "../../../lib/adminPolicyDocuments";
import {
  deleteAdminPolicyR2Object,
  presignAdminPolicyR2Get,
  uploadAdminPolicyFileToR2,
} from "../../../lib/adminPolicyR2";

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp";

function newDocumentId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;
}

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function typeSeverity(docType) {
  return docType === "terms" ? "warning" : "info";
}

function emptyUploadForm() {
  return { title: "", docType: "policy", file: null };
}

function emptyEditForm(row) {
  return {
    title: row?.title || "",
    docType: row?.doc_type || "policy",
    file: null,
  };
}

export function EmployeePoliciesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState(emptyUploadForm);
  const [editOpen, setEditOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [saving, setSaving] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [assignScope, setAssignScope] = useState("selected");
  const [assignDept, setAssignDept] = useState("");
  const [assignSearch, setAssignSearch] = useState("");
  const [selectedEmpIds, setSelectedEmpIds] = useState(() => new Set());
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [openingKey, setOpeningKey] = useState("");

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const docs = await fetchPolicyDocuments();
      const nextCounts = await fetchPolicyAssignmentCounts(docs.map((d) => d.id));
      setRows(docs);
      setCounts(nextCounts);
    } catch (err) {
      console.error(err);
      setError(friendlyPolicyError(err, "Could not load documents."));
      setRows([]);
      setCounts(new Map());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const loadAssignees = useCallback(async (documentId) => {
    if (!documentId) {
      setAssignees([]);
      return;
    }
    setAssigneesLoading(true);
    try {
      const list = await fetchAssignmentsForDocument(documentId);
      setAssignees(list);
    } catch (err) {
      console.error(err);
      setAssignees([]);
    } finally {
      setAssigneesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected?.id) loadAssignees(selected.id);
  }, [selected?.id, loadAssignees]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (typeFilter !== "all" && row.doc_type !== typeFilter) return false;
      if (!q) return true;
      const hay = [row.title, row.file_name, policyDocTypeLabel(row.doc_type)]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [rows, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, typeFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const departments = useMemo(() => {
    const set = new Set();
    for (const emp of employees) {
      if (emp.department) set.add(emp.department);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const assignPool = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return employees.filter((emp) => {
      if (assignScope === "department" && assignDept && emp.department !== assignDept) return false;
      if (!q) return true;
      const hay = [emp.full_name, emp.employee_code, emp.department].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [employees, assignSearch, assignScope, assignDept]);

  const policyCount = rows.filter((r) => r.doc_type === "policy").length;
  const termsCount = rows.filter((r) => r.doc_type === "terms").length;
  const assignedDocs = rows.filter((r) => (counts.get(String(r.id))?.total || 0) > 0).length;
  const agreedTotal = rows.reduce((sum, r) => sum + (counts.get(String(r.id))?.agreed || 0), 0);
  const pendingTotal = rows.reduce((sum, r) => sum + (counts.get(String(r.id))?.pending || 0), 0);

  const assigneeSummary = useMemo(() => {
    const agreed = assignees.filter((a) => isAgreementAgreed(a.agreement_status)).length;
    const pending = assignees.length - agreed;
    return { agreed, pending };
  }, [assignees]);

  const openUpload = () => {
    setUploadForm(emptyUploadForm());
    setUploadOpen(true);
  };

  const openEdit = useCallback((row, e) => {
    e?.stopPropagation?.();
    setEditingDoc(row);
    setEditForm(emptyEditForm(row));
    setSelected(null);
    setAssignOpen(false);
    setEditOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (row, e) => {
      e?.stopPropagation?.();
      if (!row) return;
      const ok = window.confirm(`Remove “${row.title}”? This also removes assignments.`);
      if (!ok) return;
      setSaving(true);
      try {
        if (row.object_key) {
          try {
            await deleteAdminPolicyR2Object(row.object_key);
          } catch (fileErr) {
            console.error(fileErr);
          }
        }
        await deletePolicyDocument(row.id);
        toast.success("Document removed.");
        if (selected?.id === row.id) setSelected(null);
        if (editingDoc?.id === row.id) {
          setEditOpen(false);
          setEditingDoc(null);
        }
        setAssignOpen(false);
        await loadDocuments();
      } catch (err) {
        console.error(err);
        toast.error(friendlyPolicyError(err, "Could not remove the document."));
      } finally {
        setSaving(false);
      }
    },
    [selected?.id, editingDoc?.id, loadDocuments]
  );

  const columns = useMemo(
    () => [
      {
        key: "title",
        label: "Document",
        headerClassName: "min-w-[200px]",
        cellClassName: "min-w-[200px]",
        render: (row) => <span className="font-medium text-gray-900">{row.title || "—"}</span>,
      },
      {
        key: "doc_type",
        label: "Type",
        headerClassName: "min-w-[140px]",
        cellClassName: "min-w-[140px]",
        render: (row) => (
          <StatusChip label={policyDocTypeLabel(row.doc_type)} severity={typeSeverity(row.doc_type)} />
        ),
      },
      {
        key: "file_name",
        label: "File",
        headerClassName: "min-w-[160px]",
        cellClassName: "min-w-[160px]",
        render: (row) => (
          <span>
            {row.file_name || "—"}
            {row.file_size ? (
              <span className="block text-[10px] text-gray-500">{formatFileSize(row.file_size)}</span>
            ) : null}
          </span>
        ),
      },
      {
        key: "assigned",
        label: "Agreement",
        headerClassName: "min-w-[130px]",
        cellClassName: "min-w-[130px]",
        render: (row) => {
          const c = counts.get(String(row.id)) || { total: 0, agreed: 0, pending: 0 };
          if (!c.total) return <span className="text-gray-400">—</span>;
          return (
            <span className="text-[11px] tabular-nums">
              <span className="text-emerald-700 font-medium">{c.agreed} agreed</span>
              <span className="text-gray-400"> · </span>
              <span className="text-amber-800">{c.pending} pending</span>
            </span>
          );
        },
      },
      {
        key: "created_at",
        label: "Uploaded",
        headerClassName: "min-w-[110px]",
        cellClassName: "min-w-[110px]",
        render: (row) => formatDateDdMmYyyy(row.created_at) || "—",
      },
      {
        key: "actions",
        label: "Actions",
        headerClassName: "min-w-[120px] text-right",
        cellClassName: "min-w-[120px]",
        render: (row) => (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              title="Edit"
              disabled={saving}
              onClick={(e) => openEdit(row, e)}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-gray-200 bg-white text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            <button
              type="button"
              title="Delete"
              disabled={saving}
              onClick={(e) => handleDelete(row, e)}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-red-200 bg-white text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        ),
      },
    ],
    [counts, saving, openEdit, handleDelete]
  );

  const handleUpload = async () => {
    const title = uploadForm.title.trim();
    if (!title) {
      toast.warning("Enter a document title.");
      return;
    }
    if (!uploadForm.file) {
      toast.warning("Choose a file to upload.");
      return;
    }
    setSaving(true);
    const documentId = newDocumentId();
    let objectKey = "";
    try {
      const uploaded = await uploadAdminPolicyFileToR2({
        file: uploadForm.file,
        documentId,
      });
      objectKey = uploaded.objectKey;
      const saved = await insertPolicyDocument({
        id: documentId,
        title,
        doc_type: uploadForm.docType,
        file_name: uploadForm.file.name,
        file_size: uploadForm.file.size,
        content_type: uploaded.contentType || uploadForm.file.type || null,
        object_key: objectKey,
        uploaded_by: user?.id || null,
      });
      setUploadOpen(false);
      setUploadForm(emptyUploadForm());
      toast.success("Document uploaded.");
      await loadDocuments();
      setSelected(saved);
      await ensureEmployeesLoaded();
      setAssignOpen(true);
    } catch (err) {
      console.error(err);
      if (objectKey) {
        try {
          await deleteAdminPolicyR2Object(objectKey);
        } catch {
          /* ignore cleanup */
        }
      }
      toast.error(friendlyPolicyError(err, "Could not upload the document."));
    } finally {
      setSaving(false);
    }
  };

  const ensureEmployeesLoaded = useCallback(async () => {
    if (employees.length) return employees;
    const list = await fetchActiveEmployeesForAssign();
    setEmployees(list);
    return list;
  }, [employees]);

  const openAssign = async (row) => {
    setSelected(row);
    setAssignScope(row.assignment_scope || "selected");
    setAssignDept(row.assignment_department || "");
    setReplaceExisting(false);
    setAssignSearch("");
    try {
      const [list, current] = await Promise.all([
        ensureEmployeesLoaded(),
        fetchAssignmentsForDocument(row.id),
      ]);
      setAssignees(current);
      setSelectedEmpIds(new Set(current.map((a) => Number(a.employee_master_id))));
      if (!list.length && !employees.length) {
        const loaded = await fetchActiveEmployeesForAssign();
        setEmployees(loaded);
      }
      setAssignOpen(true);
    } catch (err) {
      console.error(err);
      toast.error(friendlyPolicyError(err, "Could not load employees."));
    }
  };

  const resolveAssignIds = () => {
    if (assignScope === "all_active") return employees.map((e) => e.id);
    if (assignScope === "department") {
      return employees.filter((e) => e.department === assignDept).map((e) => e.id);
    }
    return [...selectedEmpIds];
  };

  const handleAssign = async () => {
    if (!selected) return;
    if (assignScope === "department" && !assignDept) {
      toast.warning("Choose a department.");
      return;
    }
    const ids = resolveAssignIds();
    if (!ids.length && !replaceExisting) {
      toast.warning("Select at least one employee.");
      return;
    }
    setSaving(true);
    try {
      await replaceDocumentAssignments({
        documentId: selected.id,
        employeeIds: ids,
        assignedBy: user?.id || null,
        replaceExisting,
      });
      const updated = await updatePolicyDocument(selected.id, {
        assignment_scope: assignScope,
        assignment_department: assignScope === "department" ? assignDept : null,
      });
      setSelected(updated);
      toast.success(
        replaceExisting ? "Assignment updated." : `Assigned to ${ids.length} employee${ids.length === 1 ? "" : "s"}.`
      );
      setAssignOpen(false);
      await loadDocuments();
      await loadAssignees(selected.id);
    } catch (err) {
      console.error(err);
      toast.error(friendlyPolicyError(err, "Could not assign the document."));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFile = async (row, download = false) => {
    if (!row?.object_key) {
      toast.warning("No file is attached yet.");
      return;
    }
    setOpeningKey(row.id);
    try {
      const url = await presignAdminPolicyR2Get(row.object_key, {
        download,
        fileName: row.file_name,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Could not open the file.");
    } finally {
      setOpeningKey("");
    }
  };

  const handleEditSave = async () => {
    if (!editingDoc) return;
    const title = editForm.title.trim();
    if (!title) {
      toast.warning("Enter a document title.");
      return;
    }
    setSaving(true);
    let newObjectKey = "";
    const oldObjectKey = editingDoc.object_key || "";
    try {
      const patch = {
        title,
        doc_type: editForm.docType,
      };
      if (editForm.file) {
        const uploaded = await uploadAdminPolicyFileToR2({
          file: editForm.file,
          documentId: editingDoc.id,
        });
        newObjectKey = uploaded.objectKey;
        patch.file_name = editForm.file.name;
        patch.file_size = editForm.file.size;
        patch.content_type = uploaded.contentType || editForm.file.type || null;
        patch.object_key = newObjectKey;
      }
      const updated = await updatePolicyDocument(editingDoc.id, patch);
      if (editForm.file && oldObjectKey && oldObjectKey !== newObjectKey) {
        try {
          await deleteAdminPolicyR2Object(oldObjectKey);
        } catch (fileErr) {
          console.error(fileErr);
        }
      }
      toast.success("Document updated.");
      setEditOpen(false);
      setEditingDoc(null);
      setEditForm(emptyEditForm());
      await loadDocuments();
      setSelected(updated);
    } catch (err) {
      console.error(err);
      if (newObjectKey) {
        try {
          await deleteAdminPolicyR2Object(newObjectKey);
        } catch {
          /* ignore */
        }
      }
      toast.error(friendlyPolicyError(err, "Could not update the document."));
    } finally {
      setSaving(false);
    }
  };

  const toggleEmp = (id) => {
    setSelectedEmpIds((prev) => {
      const next = new Set(prev);
      const key = Number(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 max-w-[1680px] mx-auto min-w-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 border border-sky-100">
          <BookOpen className="h-5 w-5 text-sky-700" />
        </div>
        <div className="flex-1 min-w-0">
          <PageTaskHeader
            title="Policies, Terms and Conditions"
            subtitle="Upload company policies and terms, then assign each file to the people who must receive it."
          >
            <button
              type="button"
              onClick={openUpload}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent-deep"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload document
            </button>
            <button
              type="button"
              onClick={loadDocuments}
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </PageTaskHeader>
          <CollapsibleHelp label="how this works">
            Upload a policy or terms file, then assign it to all active staff, one department, or selected
            employees. Assigned documents also appear on the employee record under Documents and Forms.
          </CollapsibleHelp>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiTile label="Documents" value={String(rows.length)} tone="border-sky-100" />
        <KpiTile label="Policies" value={String(policyCount)} tone="border-indigo-100" />
        <KpiTile label="Agreed" value={String(agreedTotal)} tone="border-emerald-100" sub={`${assignedDocs} docs assigned`} />
        <KpiTile label="Pending" value={String(pendingTotal)} tone="border-amber-100" sub={`${termsCount} terms docs`} />
      </div>

      <SectionCard
        title={`Document library (${filteredRows.length})`}
        right={
          search || typeFilter !== "all" ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setTypeFilter("all");
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
              placeholder="Title or file name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Type
            <TinySelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="min-w-[180px]">
              <option value="all">All documents</option>
              {POLICY_DOC_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
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
            <p className="text-xs text-gray-500">Loading documents…</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-12 text-center">
            <BookOpen className="h-10 w-10 mx-auto text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-700">No documents yet</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Upload a policy or terms file, then assign it to the employees who should receive it.
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
        open={Boolean(selected) && !assignOpen && !editOpen}
        onClose={() => setSelected(null)}
        title={selected?.title || "Document"}
        widthClass="max-w-lg"
      >
        {selected ? (
          <div className="space-y-4 text-xs">
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-gray-500">Type</dt>
                <dd className="mt-0.5">
                  <StatusChip label={policyDocTypeLabel(selected.doc_type)} severity={typeSeverity(selected.doc_type)} />
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-gray-500">Uploaded</dt>
                <dd className="text-gray-900 mt-0.5">{formatDateDdMmYyyy(selected.created_at) || "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[10px] uppercase tracking-wide text-gray-500">File</dt>
                <dd className="text-gray-900 mt-0.5">{selected.file_name || "—"}</dd>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-xs font-semibold text-gray-900">
                  Assigned employees ({assigneesLoading ? "…" : assignees.length})
                </p>
                {!assigneesLoading && assignees.length > 0 ? (
                  <p className="text-[11px] tabular-nums">
                    <span className="text-emerald-700 font-medium">{assigneeSummary.agreed} agreed</span>
                    <span className="text-gray-400"> · </span>
                    <span className="text-amber-800 font-medium">{assigneeSummary.pending} pending</span>
                  </p>
                ) : null}
              </div>
              {assigneesLoading ? (
                <p className="text-[11px] text-gray-500">Loading…</p>
              ) : assignees.length === 0 ? (
                <p className="text-[11px] text-gray-500">Not assigned yet.</p>
              ) : (
                <ul className="max-h-56 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
                  {assignees.slice(0, 40).map((row) => {
                    const agreed = isAgreementAgreed(row.agreement_status);
                    return (
                      <li key={row.id} className="px-2.5 py-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">
                            {row.full_name || "—"}
                            <span className="font-normal text-gray-500"> · {row.employee_code || "—"}</span>
                          </p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {row.department || "—"}
                            {agreed && row.agreed_at
                              ? ` · Agreed ${formatDateDdMmYyyy(row.agreed_at)}`
                              : " · Awaiting agreement"}
                            {agreed && row.acknowledged_name ? ` · Signed ${row.acknowledged_name}` : ""}
                          </p>
                        </div>
                        <StatusChip
                          label={agreementStatusLabel(row.agreement_status)}
                          severity={agreed ? "info" : "warning"}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
              {assignees.length > 40 ? (
                <p className="text-[10px] text-gray-500 mt-1">Showing first 40 of {assignees.length}.</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleOpenFile(selected)}
                disabled={Boolean(openingKey)}
                className="inline-flex items-center justify-center h-9 px-3 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-deep disabled:opacity-50"
              >
                {openingKey === selected.id ? "Opening…" : "Open file"}
              </button>
              <button
                type="button"
                onClick={() => openEdit(selected)}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium hover:bg-gray-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit document
              </button>
              <button
                type="button"
                onClick={() => openAssign(selected)}
                className="inline-flex items-center justify-center h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium hover:bg-gray-50"
              >
                Assign to employees
              </button>
              <button
                type="button"
                onClick={() => handleDelete(selected)}
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-red-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete document
              </button>
            </div>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={uploadOpen}
        onClose={() => !saving && setUploadOpen(false)}
        title="Upload document"
        widthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setUploadOpen(false)}
              className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleUpload}
              className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-deep disabled:opacity-50"
            >
              {saving ? "Uploading…" : "Upload and assign"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Title
            <TinyInput
              placeholder="e.g. Code of Conduct"
              value={uploadForm.title}
              onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full"
            />
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Type
            <TinySelect
              value={uploadForm.docType}
              onChange={(e) => setUploadForm((f) => ({ ...f, docType: e.target.value }))}
              className="w-full"
            >
              {POLICY_DOC_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            File
            <input
              type="file"
              accept={ACCEPT}
              onChange={(e) => setUploadForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              className="w-full text-xs file:mr-2 file:h-8 file:px-2 file:rounded file:border file:border-gray-300 file:bg-white"
            />
            <span className="text-[10px] text-gray-400">PDF, Word, or image. Max 25 MB.</span>
          </label>
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => !saving && setEditOpen(false)}
        title="Edit document"
        widthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditOpen(false)}
              className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleEditSave}
              className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-deep disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Title
            <TinyInput
              placeholder="e.g. Code of Conduct"
              value={editForm.title}
              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full"
            />
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Type
            <TinySelect
              value={editForm.docType}
              onChange={(e) => setEditForm((f) => ({ ...f, docType: e.target.value }))}
              className="w-full"
            >
              {POLICY_DOC_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 text-[11px] text-gray-600">
            Current file: <span className="font-medium text-gray-900">{editingDoc?.file_name || "—"}</span>
          </div>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Replace file (optional)
            <input
              type="file"
              accept={ACCEPT}
              onChange={(e) => setEditForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              className="w-full text-xs file:mr-2 file:h-8 file:px-2 file:rounded file:border file:border-gray-300 file:bg-white"
            />
            <span className="text-[10px] text-gray-400">Leave empty to keep the current file. PDF, Word, or image. Max 25 MB.</span>
          </label>
        </div>
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => !saving && setAssignOpen(false)}
        title={selected ? `Assign: ${selected.title}` : "Assign document"}
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
              onClick={handleAssign}
              className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-deep disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save assignment"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[11px] text-gray-500">
            New joiners are not added automatically. Assign again when someone new should receive this file.
          </p>
          <div className="flex flex-col gap-1.5 text-xs">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="assign-scope"
                checked={assignScope === "all_active"}
                onChange={() => setAssignScope("all_active")}
              />
              All active employees ({employees.length})
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="assign-scope"
                checked={assignScope === "department"}
                onChange={() => setAssignScope("department")}
              />
              One department
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="assign-scope"
                checked={assignScope === "selected"}
                onChange={() => setAssignScope("selected")}
              />
              Selected employees
            </label>
          </div>

          {assignScope === "department" ? (
            <TinySelect value={assignDept} onChange={(e) => setAssignDept(e.target.value)} className="w-full">
              <option value="">Choose department</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </TinySelect>
          ) : null}

          {assignScope === "selected" ? (
            <div className="space-y-2">
              <TinyInput
                placeholder="Search name or code…"
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                className="w-full"
              />
              <div className="flex justify-between text-[11px] text-gray-500">
                <span>{selectedEmpIds.size} selected</span>
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => setSelectedEmpIds(new Set(assignPool.map((e) => Number(e.id))))}
                >
                  Select visible
                </button>
              </div>
              <ul className="h-48 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
                {assignPool.map((emp) => {
                  const checked = selectedEmpIds.has(Number(emp.id));
                  return (
                    <li key={emp.id}>
                      <label className="flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => toggleEmp(emp.id)} />
                        <span className="truncate">
                          {emp.full_name}
                          <span className="text-gray-500"> · {emp.employee_code}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <label className="inline-flex items-center gap-2 text-[11px] text-gray-600">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
            />
            Replace current assignments
          </label>
        </div>
      </Modal>
    </div>
  );
}
