import React, { useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, ExternalLink, FileText, Printer, RefreshCw, Search } from "lucide-react";
import { downloadIomLetter, openIomLetterPrintPreview } from "../../../lib/iomLetterDocuments";
import {
  callingAttachmentStoragePath,
  fileLabelFromCallingAttachment,
  presignCallingMasterR2Get,
} from "../../../lib/callingMasterR2";
import {
  DenseTable,
  FilterBar,
  Modal,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinyInput,
  TinySelect,
} from "../../adminOperations/components/AdminUi";
import {
  CALLING_MASTER_RECORDS_EVENT,
  countJoiningChecklistDone,
  DEFAULT_IOM_DEPARTMENTS,
  emptyJoiningChecklistItem,
  JOINING_CHECKLIST_ITEMS,
  journeyStatusSeverity,
  normalizeIomDepartments,
  normalizeJoiningChecklist,
} from "./callingMasterConfig";
import { issueIomAndAllocate, loadIomCandidates, saveIomDepartments } from "./callingMasterStorage";

function toIomPayload(row) {
  return {
    iomReferenceNo: row.iomReferenceNo,
    iomDate: new Date().toISOString().slice(0, 10),
    departments: row.iomDepartments,
    salutation: row.offerSalutation || "Mr.",
    candidateName: row.candidateName,
    fatherName: row.fatherName,
    employeeCode: row.employeeCode,
    designation: row.designation,
    actualJoiningDate: row.actualJoiningDate,
    joiningDate: row.joiningDate,
    siteFullName: row.siteFullName || row.siteSuitable,
    offerReferenceNo: row.offerReferenceNo,
  };
}

export default function CallingMasterIomPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [deptRow, setDeptRow] = useState(null);
  const [departments, setDepartments] = useState([...DEFAULT_IOM_DEPARTMENTS]);
  const [checklistRow, setChecklistRow] = useState(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loadIomCandidates();
      setRecords(next);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to load IOM candidates.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const onRecords = () => {
      refresh();
    };
    window.addEventListener(CALLING_MASTER_RECORDS_EVENT, onRecords);
    return () => window.removeEventListener(CALLING_MASTER_RECORDS_EVENT, onRecords);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((row) => {
      const issued = row.iomStatus === "Issued";
      if (statusFilter === "Issued" && !issued) return false;
      if (statusFilter === "Pending" && issued) return false;
      if (!q) return true;
      const hay = [
        row.candidateName,
        row.designation,
        row.employeeCode,
        row.iomReferenceNo,
        row.siteFullName,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, search, statusFilter]);

  const openDepartments = (row) => {
    setDeptRow(row);
    setDepartments(normalizeIomDepartments(row.iomDepartments));
  };

  const openChecklist = (row) => {
    setChecklistRow(row);
    setError("");
  };

  const toggleDepartment = (name) => {
    setDepartments((current) => {
      if (current.includes(name)) {
        const next = current.filter((d) => d !== name);
        return next.length ? next : current;
      }
      return [...current, name];
    });
  };

  const handleSaveDepartments = async () => {
    if (!deptRow) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveIomDepartments(deptRow.id, departments);
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      setDeptRow(null);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to save departments.");
    } finally {
      setSaving(false);
    }
  };

  const handleIssue = async (row) => {
    setSaving(true);
    setError("");
    try {
      const saved = await issueIomAndAllocate({
        ...row,
        siteCode: String(row.siteCode || "").trim().toUpperCase(),
        iomDepartments: normalizeIomDepartments(row.iomDepartments),
      });
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      await downloadIomLetter(toIomPayload(saved));
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to issue IOM.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (row) => {
    setError("");
    try {
      if (row.iomStatus !== "Issued") throw new Error("Issue the IOM first.");
      await downloadIomLetter(toIomPayload(row));
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to download IOM.");
    }
  };

  const handlePreview = (row) => {
    setError("");
    try {
      if (row.iomStatus !== "Issued") throw new Error("Issue the IOM first.");
      openIomLetterPrintPreview(toIomPayload(row));
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to preview IOM.");
    }
  };

  const handleOpenFile = async (file) => {
    const path = callingAttachmentStoragePath(file);
    if (!path) return;
    try {
      const url = await presignCallingMasterR2Get(path);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        setError("Allow pop-ups to open the document in a new tab.");
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to open document.");
    }
  };

  const checklistView = useMemo(() => {
    if (!checklistRow) return normalizeJoiningChecklist({});
    return normalizeJoiningChecklist(checklistRow.joiningChecklist);
  }, [checklistRow]);

  const columns = [
    { key: "candidateName", label: "Candidate", widthClassName: "min-w-[160px]" },
    { key: "designation", label: "Designation", widthClassName: "min-w-[130px]" },
    {
      key: "employeeCode",
      label: "Emp Code",
      widthClassName: "min-w-[90px]",
      render: (row) => row.employeeCode || "—",
    },
    {
      key: "actualJoiningDate",
      label: "Joined on",
      widthClassName: "min-w-[110px]",
      render: (row) => row.actualJoiningDate || row.joiningDate || "—",
    },
    {
      key: "checklist",
      label: "Checklist",
      widthClassName: "min-w-[100px]",
      render: (row) => {
        const done = countJoiningChecklistDone(row.joiningChecklist);
        const total = JOINING_CHECKLIST_ITEMS.length;
        return `${done}/${total}`;
      },
    },
    {
      key: "iomReferenceNo",
      label: "IOM Ref",
      widthClassName: "min-w-[180px]",
      render: (row) => row.iomReferenceNo || "—",
    },
    {
      key: "iomDepartments",
      label: "Departments",
      widthClassName: "min-w-[180px]",
      render: (row) => (row.iomDepartments || []).join(", ") || "—",
    },
    {
      key: "iomStatus",
      label: "IOM status",
      widthClassName: "min-w-[100px]",
      render: (row) => {
        const label = row.iomStatus === "Issued" ? "Issued" : "Pending";
        return <StatusChip label={label} severity={journeyStatusSeverity(label === "Issued" ? "Issued" : "Pending")} />;
      },
    },
    {
      key: "actions",
      label: "Actions",
      widthClassName: "min-w-[380px]",
      render: (row) => {
        const issued = row.iomStatus === "Issued";
        return (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700"
              onClick={(e) => {
                e.stopPropagation();
                openChecklist(row);
              }}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Checklist
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700"
              onClick={(e) => {
                e.stopPropagation();
                openDepartments(row);
              }}
            >
              Departments
            </button>
            <button
              type="button"
              disabled={saving}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-accent text-accent hover:bg-accent/5 disabled:opacity-50"
              onClick={(e) => {
                e.stopPropagation();
                void handleIssue(row);
              }}
            >
              <FileText className="w-3.5 h-3.5" />
              {issued ? "Reissue" : "Generate IOM"}
            </button>
            <button
              type="button"
              disabled={!issued}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700 disabled:opacity-40"
              onClick={(e) => {
                e.stopPropagation();
                handlePreview(row);
              }}
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              type="button"
              disabled={!issued}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700 disabled:opacity-40"
              onClick={(e) => {
                e.stopPropagation();
                void handleDownload(row);
              }}
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="IOM"
        subtitle="Generate an Inter-Office Memo for joined candidates. IT, Admin, Payroll, Site, and Accounts are notified by default — edit per candidate before issuing."
      >
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </PageTaskHeader>

      <SectionCard title="Joined candidates">
        <FilterBar>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Search
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <TinyInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, IOM ref…"
                className="pl-7 w-56"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            IOM status
            <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All</option>
              <option value="Pending">Pending</option>
              <option value="Issued">Issued</option>
            </TinySelect>
          </label>
        </FilterBar>

        {error && !checklistRow ? (
          <p className="mt-3 text-xs text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-3">
          {loading ? (
            <p className="text-xs text-slate-500 py-6 text-center">Loading…</p>
          ) : (
            <DenseTable
              columns={columns}
              rows={filtered}
              rowKey="id"
              showSerialNumber
              frozenColumnCount={1}
              frozenColumnWidths={[160]}
            />
          )}
        </div>
      </SectionCard>

      <Modal
        open={Boolean(checklistRow)}
        onClose={() => setChecklistRow(null)}
        title={checklistRow ? `Pre-joining documents — ${checklistRow.candidateName}` : "Checklist"}
        widthClass="max-w-lg"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setChecklistRow(null)}
              className="h-8 px-3 text-xs rounded border border-slate-300 bg-white"
            >
              Close
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-500 mb-3">
          Documents collected at joining. Open any uploaded file without leaving IOM.
        </p>
        {error && checklistRow ? (
          <p className="mb-3 text-xs text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="space-y-2">
          {JOINING_CHECKLIST_ITEMS.map((item) => {
            const entry = checklistView[item.key] || emptyJoiningChecklistItem();
            const file = entry.file;
            return (
              <li
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-800">{item.label}</span>
                    <StatusChip
                      label={entry.received ? "Received" : "Pending"}
                      severity={entry.received ? "info" : "warning"}
                    />
                  </div>
                  {file ? (
                    <p className="mt-1 text-[11px] text-slate-500 truncate" title={fileLabelFromCallingAttachment(file)}>
                      {fileLabelFromCallingAttachment(file)}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">No document on file</p>
                  )}
                </div>
                {file ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-accent hover:bg-slate-50"
                    onClick={() => void handleOpenFile(file)}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Modal>

      <Modal
        open={Boolean(deptRow)}
        onClose={() => setDeptRow(null)}
        title={deptRow ? `IOM departments — ${deptRow.candidateName}` : "Departments"}
        widthClass="max-w-sm"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeptRow(null)}
              className="h-8 px-3 text-xs rounded border border-slate-300 bg-white"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveDepartments()}
              className="h-8 px-3 text-xs rounded bg-accent text-white disabled:opacity-50"
              disabled={saving || !departments.length}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-500 mb-3">At least one department must remain selected.</p>
        <ul className="space-y-2">
          {DEFAULT_IOM_DEPARTMENTS.map((name) => (
            <li key={name}>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={departments.includes(name)}
                  onChange={() => toggleDepartment(name)}
                />
                {name}
              </label>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
