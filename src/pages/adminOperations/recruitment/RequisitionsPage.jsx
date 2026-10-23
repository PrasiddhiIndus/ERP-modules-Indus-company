import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Pencil, Plus, Send, Users, X } from "lucide-react";
import { Drawer } from "../components/AdminUi";
import { toast } from "../../../lib/toast";
import { ACTIVITY_TYPES, REQUISITION_STATUSES, requisitionStatusMeta } from "./recruitmentConfig";
import { decideRequisition, getRequisitionHistory, listRequisitions, saveRequisition, submitRequisition, transitionRequisition } from "./recruitmentService";
import {
  ActionModal,
  AsyncBoundary,
  DataTable,
  DetailGrid,
  Field,
  ProgressBar,
  ReasonModal,
  SearchBox,
  SelectField,
  StatusPill,
  Tabs,
  btn,
  fmtDate,
  fmtDateTime,
  inputClass,
  runAction,
  textareaClass,
  useCapabilities,
  useRecruitmentData,
} from "./RecruitmentUi";

const ACTIVE = ["submitted", "pending_approval", "approved", "open"];

/** Position detail ticks from Candidate Requisition Form (IFSPL/Admin/Form02/R4). */
const POSITION_DETAIL_TYPES = ["Full Time", "Part Time", "Contract", "Intern"];
const CANDIDATE_GENDERS = ["Male", "Female", "Any"];
const HIRING_TYPE_LABEL = { new_recruitment: "New Recruitment", replacement: "Replacement" };

const EMPTY_FORM = {
  designation: "",
  hiringType: "new_recruitment",
  replacementOf: "",
  candidateGender: "",
  department: "",
  ageLimit: "",
  qualification: "",
  workExperience: "",
  skills: "",
  employmentType: "Full Time",
  location: "",
  openings: 1,
  priority: "normal",
};

function RequisitionForm({ open, requisition, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  useEffect(() => {
    if (!open) return;
    setForm(
      requisition
        ? {
            designation: requisition.designation || "",
            hiringType: requisition.hiringType || "new_recruitment",
            replacementOf: requisition.replacementOf || "",
            candidateGender: requisition.candidateGender || "",
            department: requisition.department || "",
            ageLimit: requisition.ageLimit || "",
            qualification: requisition.qualification || "",
            workExperience: requisition.workExperience || "",
            skills: requisition.skills || "",
            employmentType: requisition.employmentType || "Full Time",
            location: requisition.location || "",
            openings: requisition.positions || 1,
            priority: requisition.priority || "normal",
          }
        : EMPTY_FORM
    );
  }, [open, requisition]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <ActionModal
      open={open}
      title={requisition ? `Edit ${requisition.requisitionNo}` : "New requisition"}
      onClose={onClose}
      widthClass="max-w-2xl"
      submitLabel="Save draft"
      canSubmit={form.designation.trim() && Number(form.openings) > 0}
      onSubmit={async () => {
        const saved = await saveRequisition(
          requisition?.id,
          {
            ...form,
            openings: Number(form.openings) || 1,
            replacementOf: form.hiringType === "replacement" ? form.replacementOf : "",
          },
          requisition?.version
        );
        toast.success("Requisition saved", "Submit it for approval when ready.");
        onSaved(saved);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Job title *" className="sm:col-span-2">
          <input className={inputClass} value={form.designation} onChange={set("designation")} autoFocus />
        </Field>

        <Field label="Please tick" className="sm:col-span-2">
          <div className="flex flex-wrap gap-4 pt-1 text-sm text-ink">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="hiringType"
                checked={form.hiringType === "new_recruitment"}
                onChange={() => setForm((f) => ({ ...f, hiringType: "new_recruitment", replacementOf: "" }))}
              />
              New Recruitment
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="hiringType"
                checked={form.hiringType === "replacement"}
                onChange={() => setForm((f) => ({ ...f, hiringType: "replacement" }))}
              />
              Replacement
            </label>
          </div>
        </Field>

        {form.hiringType === "replacement" ? (
          <Field label="Replacement of person" className="sm:col-span-2">
            <input className={inputClass} value={form.replacementOf} onChange={set("replacementOf")} />
          </Field>
        ) : null}

        <Field label="Candidate gender">
          <select className={inputClass} value={form.candidateGender} onChange={set("candidateGender")}>
            <option value="">Select</option>
            {CANDIDATE_GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Position department">
          <input className={inputClass} value={form.department} onChange={set("department")} />
        </Field>
        <Field label="Age limit">
          <input className={inputClass} value={form.ageLimit} onChange={set("ageLimit")} placeholder="e.g. 25–35" />
        </Field>
        <Field label="Required education qualification">
          <input className={inputClass} value={form.qualification} onChange={set("qualification")} />
        </Field>
        <Field label="Work experience required" className="sm:col-span-2">
          <input className={inputClass} value={form.workExperience} onChange={set("workExperience")} />
        </Field>
        <Field label="Job description" className="sm:col-span-2">
          <textarea className={textareaClass} value={form.skills} onChange={set("skills")} rows={3} />
        </Field>

        <Field label="Position detail" className="sm:col-span-2">
          <div className="grid grid-cols-2 gap-2 pt-1 text-sm text-ink sm:grid-cols-4">
            {(POSITION_DETAIL_TYPES.includes(form.employmentType) || !form.employmentType
              ? POSITION_DETAIL_TYPES
              : [...POSITION_DETAIL_TYPES, form.employmentType]
            ).map((t) => (
              <label key={t} className="inline-flex items-center gap-2 rounded-md border border-divider px-2 py-1.5">
                <input
                  type="radio"
                  name="employmentType"
                  checked={form.employmentType === t}
                  onChange={() => setForm((f) => ({ ...f, employmentType: t }))}
                />
                {t}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Required locality" className="sm:col-span-2">
          <input className={inputClass} value={form.location} onChange={set("location")} />
        </Field>
      </div>
    </ActionModal>
  );
}

function ApprovalHistory({ requisitionId, version }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getRequisitionHistory(requisitionId)
      .then((rows) => !cancelled && setItems(rows))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [requisitionId, version]);
  if (!items) return <p className="text-[11px] text-ink-muted">Loading history…</p>;
  if (!items.length) return <p className="text-[11px] text-ink-muted">No history yet.</p>;
  return (
    <ul className="space-y-2">
      {items.map((e) => (
        <li key={e.id} className="rounded-md border border-divider px-3 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-ink">{ACTIVITY_TYPES[e.type]?.label || e.type.replace(/_/g, " ")}</span>
            <span className="text-[11px] tabular-nums text-ink-muted">{fmtDateTime(e.at)}</span>
          </div>
          <p className="text-[11px] text-ink-secondary">by {e.by}</p>
          {e.note ? <p className="mt-1 whitespace-pre-wrap text-[11px] text-ink">{e.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export default function RequisitionsPage() {
  const navigate = useNavigate();
  const caps = useCapabilities();
  const { data, loading, error, reload } = useRecruitmentData(listRequisitions);
  const [status, setStatus] = useState("active");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [reasonAction, setReasonAction] = useState(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveRemarks, setApproveRemarks] = useState("");

  const rows = data || [];
  const selected = rows.find((r) => r.id === selectedId) || null;
  const departments = useMemo(() => [...new Set(rows.map((r) => r.department).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "active" && !ACTIVE.includes(r.status)) return false;
      if (status !== "active" && status !== "all" && r.status !== status) return false;
      if (department && r.department !== department) return false;
      if (!q) return true;
      return [r.requisitionNo, r.designation, r.department, r.raisedBy, r.location].join(" ").toLowerCase().includes(q);
    });
  }, [rows, status, search, department]);

  const tabCounts = useMemo(() => {
    const c = { active: 0, all: rows.length };
    rows.forEach((r) => {
      c[r.status] = (c[r.status] || 0) + 1;
      if (ACTIVE.includes(r.status)) c.active += 1;
    });
    return c;
  }, [rows]);

  const columns = [
    { key: "requisitionNo", label: "Req no.", render: (r) => <span className="font-mono text-[11px]">{r.requisitionNo}</span> },
    {
      key: "designation",
      label: "Position",
      render: (r) => (
        <span>
          <span className="block font-medium">{r.designation}</span>
          <span className="block text-[11px] text-ink-muted">{[r.department, r.location].filter(Boolean).join(" · ") || "—"}</span>
        </span>
      ),
    },
    { key: "filled", label: "Filled", sortValue: (r) => r.filled / r.positions, render: (r) => <div className="w-28"><ProgressBar value={r.filled} total={r.positions} tone={r.filled >= r.positions ? "success" : "accent"} /></div> },
    { key: "candidateCount", label: "Candidates", align: "right" },
    { key: "raisedBy", label: "Raised by", render: (r) => <span><span className="block">{r.raisedBy || "—"}</span><span className="block text-[11px] text-ink-muted">{fmtDate(r.raisedOn)}</span></span> },
    { key: "requiredBy", label: "Required by", render: (r) => fmtDate(r.requiredBy) },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <span className="inline-flex flex-col gap-0.5">
          <StatusPill meta={requisitionStatusMeta(r.status)} />
          {r.status === "pending_approval" && r.approvalLevelsRequired > 1 ? (
            <span className="text-[10px] text-ink-muted">Level {r.approvalLevelDone + 1} of {r.approvalLevelsRequired}</span>
          ) : null}
        </span>
      ),
    },
  ];

  const tabs = [
    { key: "active", label: "Active", count: tabCounts.active },
    ...REQUISITION_STATUSES.map((s) => ({ key: s.key, label: s.label, count: tabCounts[s.key] || 0 })),
    { key: "all", label: "All", count: tabCounts.all },
  ];

  const canManage = caps.requisitions;
  const s = selected?.status;
  const isErpRecord = selected?.source !== "indus_one";

  const REASON_ACTIONS = {
    reject: { title: "Reject requisition", label: "Reason for rejection", submitLabel: "Reject", run: (r, reason) => decideRequisition(r.id, "reject", reason, r.version), done: "Requisition rejected" },
    cancel: { title: "Cancel requisition", label: "Reason", submitLabel: "Cancel requisition", run: (r, reason) => transitionRequisition(r.id, "cancel", reason, r.version), done: "Requisition cancelled" },
    reopen: { title: "Reopen requisition", label: "Reason", submitLabel: "Reopen", tone: "primary", run: (r, reason) => transitionRequisition(r.id, "reopen", reason, r.version), done: "Requisition reopened" },
  };
  const ra = reasonAction ? REASON_ACTIONS[reasonAction] : null;

  return (
    <div className="space-y-3">
      <div className="rounded-card border border-border bg-surface shadow-card">
        <div className="px-4 pt-2">
          <Tabs tabs={tabs} value={status} onChange={setStatus} ariaLabel="Requisition status" />
        </div>
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Search req no., position, manager…" className="w-full sm:w-72" />
          <SelectField label="Department" value={department} onChange={setDepartment} options={departments} className="w-44" />
          {canManage ? (
            <button type="button" className={`${btn.primary} ml-auto`} onClick={() => setForm({ requisition: null })}>
              <Plus className="h-3.5 w-3.5" /> New requisition
            </button>
          ) : null}
        </div>
        <div className="px-4 pb-4">
          <AsyncBoundary loading={loading} error={error} onRetry={reload}>
            <DataTable
              columns={columns}
              rows={filtered}
              onRowClick={(r) => setSelectedId(r.id)}
              initialSort={{ key: "requiredBy", dir: "asc" }}
              emptyTitle="No requisitions"
              emptyMessage="Requisitions raised here or by managers in Indus One appear in this list."
            />
          </AsyncBoundary>
        </div>
      </div>

      <Drawer open={Boolean(selected)} title={selected ? `${selected.requisitionNo} · ${selected.designation}` : ""} onClose={() => setSelectedId(null)} widthClass="max-w-xl">
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill meta={requisitionStatusMeta(selected.status)} />
              <span className="text-[11px] text-ink-muted">
                Raised {fmtDate(selected.raisedOn)}
                {selected.raisedBy ? ` by ${selected.raisedBy}` : ""}
                {selected.source === "indus_one" ? " · from Indus One" : ""}
              </span>
            </div>
            {selected.statusReason && ["rejected", "cancelled"].includes(selected.status) ? (
              <p className="rounded-md border border-critical-border bg-critical-soft px-3 py-2 text-[11px] text-critical">{selected.statusReason}</p>
            ) : null}
            <DetailGrid
              items={[
                ["Hiring", HIRING_TYPE_LABEL[selected.hiringType] || selected.hiringType || "—"],
                selected.hiringType === "replacement" ? ["Replacement of", selected.replacementOf] : null,
                ["Candidate gender", selected.candidateGender],
                ["Position department", selected.department],
                ["Age limit", selected.ageLimit],
                ["Education qualification", selected.qualification],
                ["Work experience", selected.workExperience],
                ["Position detail", selected.employmentType],
                ["Required locality", selected.location],
                ["Positions", `${selected.filled} of ${selected.positions} filled`],
                ["Approvals", `${selected.approvalLevelDone} of ${selected.approvalLevelsRequired}`],
              ].filter(Boolean)}
            />
            {selected.skills ? (
              <div>
                <p className="text-[11px] text-ink-muted">Job description</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-ink">{selected.skills}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-divider pt-4">
              <button type="button" className={btn.secondary} onClick={() => navigate(`../candidates?requisition=${selected.id}`)}>
                <Users className="h-3.5 w-3.5" /> Candidates ({selected.candidateCount})
              </button>
              {canManage && isErpRecord && ["draft", "rejected"].includes(s) ? (
                <>
                  <button type="button" className={btn.secondary} onClick={() => setForm({ requisition: selected })}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    className={btn.primary}
                    onClick={() => runAction(() => submitRequisition(selected.id, selected.version), "Sent for approval")}
                  >
                    <Send className="h-3.5 w-3.5" /> Submit for approval
                  </button>
                </>
              ) : null}
              {caps.approve && s === "pending_approval" ? (
                <>
                  <button
                    type="button"
                    className={btn.primary}
                    onClick={() => {
                      setApproveRemarks("");
                      setApproveOpen(true);
                    }}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button type="button" className={btn.secondary} onClick={() => setReasonAction("reject")}>
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </>
              ) : null}
              {canManage && s === "approved" ? (
                <button type="button" className={btn.primary} onClick={() => runAction(() => transitionRequisition(selected.id, "open", null, selected.version), "Opened for recruitment")}>
                  Start recruiting
                </button>
              ) : null}
              {canManage && s === "open" ? (
                <button type="button" className={btn.secondary} onClick={() => runAction(() => transitionRequisition(selected.id, "fill", null, selected.version), "Requisition marked filled")}>
                  <Check className="h-3.5 w-3.5" /> Mark filled
                </button>
              ) : null}
              {canManage && isErpRecord && ["draft", "submitted", "pending_approval", "approved", "open"].includes(s) ? (
                <button type="button" className={btn.ghost} onClick={() => setReasonAction("cancel")}>
                  Cancel requisition
                </button>
              ) : null}
              {canManage && ["filled", "cancelled"].includes(s) ? (
                <button type="button" className={btn.ghost} onClick={() => setReasonAction("reopen")}>
                  Reopen
                </button>
              ) : null}
            </div>
            {selected.source === "indus_one" && ["submitted", "pending_approval"].includes(s) ? (
              <p className="text-[11px] text-ink-muted">This request was raised in Indus One; changes to its details are made there.</p>
            ) : null}

            <div className="border-t border-divider pt-4">
              <p className="mb-2 text-xs font-semibold text-ink">Approval history</p>
              <ApprovalHistory requisitionId={selected.id} version={selected.version} />
            </div>
          </div>
        ) : null}
      </Drawer>

      <RequisitionForm
        open={Boolean(form)}
        requisition={form?.requisition}
        onClose={() => setForm(null)}
        onSaved={(saved) => {
          setForm(null);
          if (saved?.id) setSelectedId(saved.id);
        }}
      />

      <ActionModal
        open={approveOpen && Boolean(selected)}
        title={`Approve ${selected?.requisitionNo || ""}`}
        description={
          selected && selected.approvalLevelsRequired > 1
            ? `This records approval level ${selected.approvalLevelDone + 1} of ${selected.approvalLevelsRequired}.`
            : "Recruiting can start once the requisition is approved."
        }
        submitLabel="Approve"
        onClose={() => setApproveOpen(false)}
        onSubmit={async () => {
          await decideRequisition(selected.id, "approve", approveRemarks.trim(), selected.version);
          toast.success("Approval recorded");
          setApproveOpen(false);
        }}
      >
        <Field label="Remarks">
          <textarea className={textareaClass} value={approveRemarks} onChange={(e) => setApproveRemarks(e.target.value)} />
        </Field>
      </ActionModal>

      <ReasonModal
        open={Boolean(ra) && Boolean(selected)}
        title={ra?.title}
        label={ra?.label}
        submitLabel={ra?.submitLabel}
        tone={ra?.tone || "danger"}
        onClose={() => setReasonAction(null)}
        onSubmit={async (reason) => {
          await ra.run(selected, reason);
          toast.success(ra.done);
          setReasonAction(null);
        }}
      />
    </div>
  );
}
