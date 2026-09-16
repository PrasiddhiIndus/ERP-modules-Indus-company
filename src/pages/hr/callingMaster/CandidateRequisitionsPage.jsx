/** Admin Recruitment — manager candidate requisitions from Indus One. */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, PhoneCall, RefreshCw } from "lucide-react";
import {
  CollapsibleHelp,
  DenseTable,
  Drawer,
  FilterBar,
  KpiTile,
  Modal,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinyInput,
  TinySelect,
} from "../../adminOperations/components/AdminUi";
import { useAuth } from "../../../contexts/AuthContext";
import { toast } from "../../../lib/toast";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import {
  buildCallingPrefillFromRequisition,
  fetchCandidateRequisitions,
  friendlyRequisitionError,
  isMissingRequisitionsTableError,
  requisitionStatusLabel,
  requisitionStatusSeverity,
  REQUISITION_STATUSES,
  stashCallingPrefill,
  updateCandidateRequisition,
} from "../../../lib/candidateRequisitionsApi";
import { useRecruitmentUi } from "./recruitmentUiContext";

const PAGE_SIZE = 25;

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

export default function CandidateRequisitionsPage() {
  const { user } = useAuth();
  const ui = useRecruitmentUi();
  const navigate = useNavigate();
  const candidatesPath =
    ui.scope === "admin" ? "/app/admin/recruitment/candidates" : "/app/hr/calling-master/candidates";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tablesMissing, setTablesMissing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [actionOpen, setActionOpen] = useState(null);
  const [hrRemarks, setHrRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCandidateRequisitions({ status: "all" });
      setRows(data);
      setTablesMissing(false);
    } catch (err) {
      console.error(err);
      setRows([]);
      if (isMissingRequisitionsTableError(err)) {
        setTablesMissing(true);
        toast.warning(friendlyRequisitionError(err));
      } else {
        toast.error(friendlyRequisitionError(err, "Could not load requisitions."));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        row.requisitionNo,
        row.raiserName,
        row.raiserCode,
        row.department,
        row.designationRequested,
        row.location,
        row.justification,
        row.skillsRequired,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const kpiPending = useMemo(() => rows.filter((r) => r.status === "pending").length, [rows]);
  const kpiApproved = useMemo(() => rows.filter((r) => r.status === "approved").length, [rows]);
  const kpiFilled = useMemo(() => rows.filter((r) => r.status === "filled").length, [rows]);

  const openAction = (row, action) => {
    setSelected(row);
    setHrRemarks(row.hrRemarks || "");
    setActionOpen(action);
  };

  const applyStatus = async (status) => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateCandidateRequisition(selected.id, {
        status,
        hrRemarks: hrRemarks.trim() || null,
        reviewedBy: user?.id || null,
        reviewedAt: new Date().toISOString(),
      });
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setSelected(updated);
      setActionOpen(null);
      toast.success(`Requisition ${requisitionStatusLabel(status).toLowerCase()}.`);
    } catch (err) {
      console.error(err);
      toast.error(friendlyRequisitionError(err, "Could not update requisition."));
    } finally {
      setSaving(false);
    }
  };

  const startCalling = async (row) => {
    setSaving(true);
    try {
      let current = row;
      if (row.status === "pending") {
        current = await updateCandidateRequisition(row.id, {
          status: "approved",
          hrRemarks: row.hrRemarks || null,
          reviewedBy: user?.id || null,
          reviewedAt: new Date().toISOString(),
          callingStartedAt: new Date().toISOString(),
        });
        setRows((prev) => prev.map((r) => (r.id === current.id ? current : r)));
      } else if (!row.callingStartedAt) {
        current = await updateCandidateRequisition(row.id, {
          callingStartedAt: new Date().toISOString(),
        });
        setRows((prev) => prev.map((r) => (r.id === current.id ? current : r)));
      }
      const prefill = buildCallingPrefillFromRequisition(current);
      stashCallingPrefill(prefill);
      toast.success("Opening Candidates — add contacts against this requisition.");
      navigate(candidatesPath);
    } catch (err) {
      console.error(err);
      toast.error(friendlyRequisitionError(err, "Could not start calling for this requisition."));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "requisitionNo",
        label: "Req no.",
        headerClassName: "min-w-[120px]",
        cellClassName: "min-w-[120px]",
        render: (row) => (
          <span className="font-mono text-[11px] tabular-nums">{row.requisitionNo || "—"}</span>
        ),
      },
      {
        key: "raised",
        label: "Raised by",
        headerClassName: "min-w-[160px]",
        cellClassName: "min-w-[160px]",
        render: (row) => (
          <div>
            <p className="font-medium text-gray-900">{row.raiserName || "—"}</p>
            <p className="text-[11px] text-gray-500">{row.raiserCode || ""}</p>
          </div>
        ),
      },
      {
        key: "designationRequested",
        label: "Role",
        headerClassName: "min-w-[140px]",
        cellClassName: "min-w-[140px]",
        render: (row) => (
          <div>
            <p className="font-medium text-gray-900">{row.designationRequested || "—"}</p>
            <p className="text-[11px] text-gray-500">
              {row.positionsCount} position{row.positionsCount === 1 ? "" : "s"} · {row.employmentType}
            </p>
          </div>
        ),
      },
      {
        key: "department",
        label: "Dept / location",
        headerClassName: "min-w-[140px]",
        cellClassName: "min-w-[140px]",
        render: (row) => (
          <div>
            <p>{row.department || "—"}</p>
            <p className="text-[11px] text-gray-500">{row.location || ""}</p>
          </div>
        ),
      },
      {
        key: "requiredByDate",
        label: "Needed by",
        headerClassName: "min-w-[110px]",
        cellClassName: "min-w-[110px]",
        render: (row) => formatDateDdMmYyyy(row.requiredByDate) || "—",
      },
      {
        key: "createdAt",
        label: "Raised",
        headerClassName: "min-w-[120px]",
        cellClassName: "min-w-[120px]",
        render: (row) => formatDateTime(row.createdAt),
      },
      {
        key: "status",
        label: "Status",
        headerClassName: "min-w-[120px]",
        cellClassName: "min-w-[120px]",
        render: (row) => (
          <StatusChip
            label={requisitionStatusLabel(row.status)}
            severity={requisitionStatusSeverity(row.status)}
          />
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 border border-amber-100">
          <ClipboardList className="h-5 w-5 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <PageTaskHeader
            title="Candidate requisitions"
            subtitle="Hiring requests raised by managers in Indus One. Approve and start sourcing in the Calling database."
          >
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              to={candidatesPath}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              Candidates
            </Link>
          </PageTaskHeader>
          <CollapsibleHelp label="how this works">
            <ul className="list-disc pl-4 space-y-1">
              <li>Managers raise requests in Indus One (Candidate Requisition).</li>
              <li>Pending requests appear here for Admin / HR recruitment.</li>
              <li>
                Use <strong>Start calling</strong> to approve (if still pending) and open Candidates with role details
                prefilled — add candidate contacts to begin the calling pipeline.
              </li>
            </ul>
          </CollapsibleHelp>
        </div>
      </div>

      {tablesMissing ? (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Requisition intake needs a database update. Apply the Candidate Requisitions migration, then refresh.
        </p>
      ) : null}

      {kpiPending > 0 ? (
        <p className="text-xs text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <strong>{kpiPending}</strong> pending requisition{kpiPending === 1 ? "" : "s"} waiting for recruitment
          action.
        </p>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiTile label="Pending" value={String(kpiPending)} />
        <KpiTile label="Approved" value={String(kpiApproved)} />
        <KpiTile label="Filled" value={String(kpiFilled)} />
      </div>

      <SectionCard title={`Requisitions (${filtered.length})`}>
        <FilterBar>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5 flex-1 min-w-[180px]">
            Search
            <TinyInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Req no., raiser, role, dept…"
              className="w-full"
            />
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Status
            <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {REQUISITION_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </TinySelect>
          </label>
        </FilterBar>

        <div className="mt-3">
          {loading ? (
            <p className="text-xs text-ink-secondary py-6 text-center">Loading…</p>
          ) : pageRows.length === 0 ? (
            <p className="text-xs text-ink-secondary py-6 text-center">
              {statusFilter === "pending"
                ? "No pending requisitions."
                : "No requisitions match the filters."}
            </p>
          ) : (
            <DenseTable columns={columns} rows={pageRows} onRowClick={(row) => setSelected(row)} />
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 px-2 rounded border border-gray-200 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 px-2 rounded border border-gray-200 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </SectionCard>

      <Drawer
        open={Boolean(selected) && !actionOpen}
        onClose={() => setSelected(null)}
        title={selected?.requisitionNo || "Requisition"}
        widthClass="max-w-lg"
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusChip
                label={requisitionStatusLabel(selected.status)}
                severity={requisitionStatusSeverity(selected.status)}
              />
              <StatusChip label={selected.employmentType} severity="neutral" />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-ink-muted">Raised by</p>
                <p className="font-medium">
                  {selected.raiserName || "—"}
                  {selected.raiserCode ? ` (${selected.raiserCode})` : ""}
                </p>
              </div>
              <div>
                <p className="text-ink-muted">Raised on</p>
                <p className="font-medium">{formatDateTime(selected.createdAt)}</p>
              </div>
              <div>
                <p className="text-ink-muted">Role</p>
                <p className="font-medium">{selected.designationRequested || "—"}</p>
              </div>
              <div>
                <p className="text-ink-muted">Positions</p>
                <p className="font-medium">{selected.positionsCount}</p>
              </div>
              <div>
                <p className="text-ink-muted">Department</p>
                <p className="font-medium">{selected.department || "—"}</p>
              </div>
              <div>
                <p className="text-ink-muted">Location</p>
                <p className="font-medium">{selected.location || "—"}</p>
              </div>
              <div>
                <p className="text-ink-muted">Needed by</p>
                <p className="font-medium">{formatDateDdMmYyyy(selected.requiredByDate) || "—"}</p>
              </div>
              <div>
                <p className="text-ink-muted">Min experience</p>
                <p className="font-medium">
                  {selected.experienceMinYears != null ? `${selected.experienceMinYears} yrs` : "—"}
                </p>
              </div>
            </div>

            {selected.skillsRequired ? (
              <div className="text-xs">
                <p className="text-ink-muted">Skills</p>
                <p className="font-medium whitespace-pre-wrap">{selected.skillsRequired}</p>
              </div>
            ) : null}

            <div className="text-xs">
              <p className="text-ink-muted">Justification</p>
              <p className="font-medium whitespace-pre-wrap">{selected.justification || "—"}</p>
            </div>

            {selected.hrRemarks ? (
              <div className="text-xs">
                <p className="text-ink-muted">HR remarks</p>
                <p className="font-medium whitespace-pre-wrap">{selected.hrRemarks}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              {(selected.status === "pending" || selected.status === "approved") && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => startCalling(selected)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  Start calling
                </button>
              )}
              {selected.status === "pending" ? (
                <>
                  <button
                    type="button"
                    onClick={() => openAction(selected, "approved")}
                    className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => openAction(selected, "rejected")}
                    className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50"
                  >
                    Reject
                  </button>
                </>
              ) : null}
              {selected.status === "approved" ? (
                <>
                  <button
                    type="button"
                    onClick={() => openAction(selected, "filled")}
                    className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50"
                  >
                    Mark filled
                  </button>
                  <button
                    type="button"
                    onClick={() => openAction(selected, "cancelled")}
                    className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={Boolean(actionOpen)}
        onClose={() => !saving && setActionOpen(null)}
        title={actionOpen ? `${requisitionStatusLabel(actionOpen)} requisition` : "Update"}
        widthClass="max-w-md"
      >
        <div className="space-y-3">
          <p className="text-[11px] text-ink-secondary">
            {selected?.requisitionNo} · {selected?.designationRequested}
          </p>
          <label className="block text-xs">
            <span className="text-ink-muted">HR remarks (optional)</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm min-h-[72px]"
              value={hrRemarks}
              onChange={(e) => setHrRemarks(e.target.value)}
              placeholder="Notes for the manager / recruiter…"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => setActionOpen(null)}
              className="h-8 px-3 rounded-lg border border-gray-200 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => applyStatus(actionOpen)}
              className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50"
            >
              {saving ? "Saving…" : "Confirm"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
