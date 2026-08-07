import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Paperclip, RefreshCw, Search, Trash2, UserX } from "lucide-react";
import { FormDateInput } from "../../../components/FormDateInput";
import {
  callingAttachmentStoragePath,
  fileLabelFromCallingAttachment,
  presignCallingMasterR2Get,
  uploadCallingMasterFileToR2,
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
  emptyJoiningChecklistItem,
  isJoiningChecklistComplete,
  JOINING_CHECKLIST_ITEMS,
  journeyStatusSeverity,
  normalizeJoiningChecklist,
} from "./callingMasterConfig";
import {
  closeNoShow,
  flagNoShow,
  loadJoiningCandidates,
  markJoined,
  saveJoiningChecklist,
} from "./callingMasterStorage";

function isOverdueForJoining(row) {
  if (!row?.joiningDate) return false;
  if (row.joiningStatus === "Joined" || row.joiningStatus === "No-show") return false;
  const planned = String(row.joiningDate).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return planned < today;
}

export default function CallingMasterJoiningPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [checklistRow, setChecklistRow] = useState(null);
  const [checklist, setChecklist] = useState(normalizeJoiningChecklist({}));
  const [joinRow, setJoinRow] = useState(null);
  const [actualDate, setActualDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState("");
  const fileInputRefs = useRef({});

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loadJoiningCandidates();
      setRecords(next);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to load joining candidates.");
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
      const status = row.joiningStatus || "Pending";
      if (statusFilter === "Overdue") {
        if (!isOverdueForJoining(row)) return false;
      } else if (statusFilter !== "All" && status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const hay = [row.candidateName, row.designation, row.employeeCode, row.phoneNumber, row.siteFullName]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, search, statusFilter]);

  const openChecklist = (row) => {
    setChecklistRow(row);
    setChecklist(normalizeJoiningChecklist(row.joiningChecklist));
    setError("");
  };

  const setChecklistItem = (key, patch) => {
    setChecklist((current) => {
      const existing = current[key] || emptyJoiningChecklistItem();
      return {
        ...current,
        [key]: { ...existing, ...patch },
      };
    });
  };

  const handleUpload = async (itemKey, file) => {
    if (!checklistRow || !file) return;
    setUploadingKey(itemKey);
    setError("");
    try {
      const candidateKey = `${checklistRow.id || checklistRow.phoneNumber || "draft"}/checklist-${itemKey}`;
      const result = await uploadCallingMasterFileToR2({ file, candidateKey });
      const storagePath = result.filePath || result.objectKey;
      setChecklistItem(itemKey, {
        received: true,
        file: {
          filePath: storagePath,
          objectKey: storagePath,
          bucket: result.bucket || "indus-erp-uploads",
          fileName: result.fileName || file.name,
          contentType: result.contentType || file.type || "",
          uploadedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to upload document.");
    } finally {
      setUploadingKey("");
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

  const handleSaveChecklist = async () => {
    if (!checklistRow) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveJoiningChecklist(checklistRow.id, checklist);
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      setChecklistRow(null);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to save checklist.");
    } finally {
      setSaving(false);
    }
  };

  const openJoinModal = (row) => {
    setJoinRow(row);
    setActualDate(row.actualJoiningDate || row.joiningDate || new Date().toISOString().slice(0, 10));
    setError("");
  };

  const handleMarkJoined = async () => {
    if (!joinRow) return;
    setSaving(true);
    setError("");
    try {
      const saved = await markJoined(joinRow.id, actualDate);
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      setJoinRow(null);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to mark as Joined.");
    } finally {
      setSaving(false);
    }
  };

  const handleNoShow = async (row) => {
    setSaving(true);
    setError("");
    try {
      const saved = await flagNoShow(row.id);
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to flag no-show.");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseNoShow = async (row) => {
    setSaving(true);
    setError("");
    try {
      const saved = await closeNoShow(row.id);
      setRecords((prev) => prev.filter((r) => r.id !== saved.id));
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to close no-show.");
    } finally {
      setSaving(false);
    }
  };

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
      key: "joiningDate",
      label: "Planned joining",
      widthClassName: "min-w-[120px]",
      render: (row) => (
        <span className={isOverdueForJoining(row) ? "text-red-700 font-medium" : ""}>
          {row.joiningDate || "—"}
          {isOverdueForJoining(row) ? " (overdue)" : ""}
        </span>
      ),
    },
    {
      key: "checklist",
      label: "Checklist",
      widthClassName: "min-w-[110px]",
      render: (row) => {
        const done = countJoiningChecklistDone(row.joiningChecklist);
        const total = JOINING_CHECKLIST_ITEMS.length;
        return `${done}/${total}`;
      },
    },
    {
      key: "joiningStatus",
      label: "Joining status",
      widthClassName: "min-w-[120px]",
      render: (row) => {
        const label = row.joiningStatus || "Pending";
        return <StatusChip label={label} severity={journeyStatusSeverity(label)} />;
      },
    },
    {
      key: "actions",
      label: "Actions",
      widthClassName: "min-w-[340px]",
      render: (row) => {
        const complete = isJoiningChecklistComplete(row.joiningChecklist);
        const joined = row.joiningStatus === "Joined";
        const noShow = row.joiningStatus === "No-show";
        return (
          <div className="flex flex-wrap gap-1.5">
            {!joined && !noShow ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700"
                onClick={(e) => {
                  e.stopPropagation();
                  openChecklist(row);
                }}
              >
                Checklist
              </button>
            ) : null}
            {!joined && !noShow ? (
              <button
                type="button"
                disabled={!complete || saving}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-accent text-accent hover:bg-accent/5 disabled:opacity-40"
                onClick={(e) => {
                  e.stopPropagation();
                  openJoinModal(row);
                }}
              >
                <Check className="w-3.5 h-3.5" />
                Mark joined
              </button>
            ) : null}
            {!joined && !noShow && isOverdueForJoining(row) ? (
              <button
                type="button"
                disabled={saving}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-red-300 text-red-800 hover:bg-red-50 disabled:opacity-40"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleNoShow(row);
                }}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                No-show
              </button>
            ) : null}
            {noShow ? (
              <>
                <StatusChip label="No-show" severity="critical" />
                <button
                  type="button"
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700 disabled:opacity-40"
                  title="Close out as Declined. To re-offer, generate a new letter from Offer Generation."
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCloseNoShow(row);
                  }}
                >
                  <UserX className="w-3.5 h-3.5" />
                  Close out
                </button>
                <span className="text-[10px] text-slate-500 self-center">
                  Re-offer via Offer Generation
                </span>
              </>
            ) : null}
            {joined ? (
              <span className="text-[11px] text-slate-600">
                Joined {row.actualJoiningDate || "—"}
              </span>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Joining"
        subtitle="Complete the fixed pre-joining checklist for accepted candidates, then mark Joined. Overdue candidates can be flagged as no-show."
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

      <SectionCard title="Accepted candidates">
        <FilterBar>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Search
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <TinyInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, code…"
                className="pl-7 w-56"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Status
            <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All</option>
              <option value="Pending">Pending</option>
              <option value="Joined">Joined</option>
              <option value="No-show">No-show</option>
              <option value="Overdue">Overdue</option>
            </TinySelect>
          </label>
        </FilterBar>

        {error && !checklistRow && !joinRow ? (
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
        title={checklistRow ? `Pre-joining checklist — ${checklistRow.candidateName}` : "Checklist"}
        widthClass="max-w-lg"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setChecklistRow(null)}
              className="h-8 px-3 text-xs rounded border border-slate-300 bg-white"
              disabled={saving || Boolean(uploadingKey)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveChecklist()}
              className="h-8 px-3 text-xs rounded bg-accent text-white disabled:opacity-50"
              disabled={saving || Boolean(uploadingKey)}
            >
              {saving ? "Saving…" : "Save checklist"}
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-500 mb-3">
          Mark each document as received and upload the file against it. Uploaded files can be opened later
          from Joining and from IOM.
        </p>
        {error && checklistRow ? (
          <p className="mb-3 text-xs text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="space-y-3">
          {JOINING_CHECKLIST_ITEMS.map((item) => {
            const entry = checklist[item.key] || emptyJoiningChecklistItem();
            const file = entry.file;
            const isUploading = uploadingKey === item.key;
            return (
              <li
                key={item.key}
                className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={Boolean(entry.received)}
                      onChange={(e) => setChecklistItem(item.key, { received: e.target.checked })}
                      disabled={Boolean(uploadingKey)}
                    />
                    {item.label}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={(el) => {
                        fileInputRefs.current[item.key] = el;
                      }}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                      className="hidden"
                      onChange={(event) => {
                        const nextFile = event.target.files?.[0];
                        event.target.value = "";
                        if (nextFile) void handleUpload(item.key, nextFile);
                      }}
                    />
                    <button
                      type="button"
                      disabled={Boolean(uploadingKey)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      onClick={() => fileInputRefs.current[item.key]?.click()}
                    >
                      <Paperclip className="w-3 h-3" />
                      {isUploading ? "Uploading…" : file ? "Replace" : "Upload"}
                    </button>
                  </div>
                </div>
                {file ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 pl-6 text-xs text-slate-600">
                    <span className="min-w-0 truncate" title={fileLabelFromCallingAttachment(file)}>
                      {fileLabelFromCallingAttachment(file)}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                        onClick={() => void handleOpenFile(file)}
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-rose-600 hover:underline"
                        disabled={Boolean(uploadingKey)}
                        onClick={() => setChecklistItem(item.key, { file: null })}
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="pl-6 text-[11px] text-slate-400">No document uploaded yet</p>
                )}
              </li>
            );
          })}
        </ul>
      </Modal>

      <Modal
        open={Boolean(joinRow)}
        onClose={() => setJoinRow(null)}
        title={joinRow ? `Mark joined — ${joinRow.candidateName}` : "Mark joined"}
        widthClass="max-w-sm"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setJoinRow(null)}
              className="h-8 px-3 text-xs rounded border border-slate-300 bg-white"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleMarkJoined()}
              className="h-8 px-3 text-xs rounded bg-accent text-white disabled:opacity-50"
              disabled={saving || !actualDate}
            >
              {saving ? "Saving…" : "Confirm joined"}
            </button>
          </div>
        }
      >
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Actual joining date
          <FormDateInput value={actualDate} onChange={(e) => setActualDate(e.target.value)} />
        </label>
      </Modal>
    </div>
  );
}
