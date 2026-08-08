import React, { useEffect, useMemo, useState } from "react";
import { Check, Clock, Edit3, RefreshCw, Search, X } from "lucide-react";
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
import { CALLING_MASTER_RECORDS_EVENT, journeyStatusSeverity } from "./callingMasterConfig";
import { offerResponseLabel } from "./callingMasterApi";
import { CallingActionBar, CallingActionBtn, CallingActionHint } from "./CallingTableActions";
import { loadOfferResponseCandidates, recordOfferResponse } from "./callingMasterStorage";

function formatDateDisplay(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function canEditOfferResponse(row) {
  const label = offerResponseLabel(row);
  if (label !== "Accepted" && label !== "Declined") return false;
  if (row.joiningStatus === "Joined") return false;
  if (row.iomStatus === "Issued") return false;
  if (row.conversionStatus === "Converted") return false;
  return true;
}

function editLockReason(row) {
  if (row.joiningStatus === "Joined") return "Locked after joining";
  if (row.iomStatus === "Issued") return "Locked after IOM confirmed";
  if (row.conversionStatus === "Converted") return "Locked after conversion";
  return "";
}

export default function CallingMasterOfferResponsePage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [savingId, setSavingId] = useState("");
  const [editRow, setEditRow] = useState(null);
  const [editResponse, setEditResponse] = useState("Accepted");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loadOfferResponseCandidates();
      setRecords(next);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to load offer responses.");
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
      const label = offerResponseLabel(row);
      if (statusFilter !== "All") {
        if (statusFilter === "Awaiting response" && label !== "Awaiting response") return false;
        if (statusFilter !== "Awaiting response" && row.offerStatus !== statusFilter) return false;
      }
      if (!q) return true;
      const hay = [row.candidateName, row.designation, row.employeeCode, row.offerReferenceNo, row.phoneNumber]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, search, statusFilter]);

  const openEdit = (row) => {
    const label = offerResponseLabel(row);
    setEditRow(row);
    setEditResponse(label === "Declined" ? "Declined" : label === "Accepted" ? "Accepted" : "Accepted");
    setError("");
  };

  const closeEdit = () => {
    setEditRow(null);
    setEditResponse("Accepted");
  };

  const handleResponse = async (row, response) => {
    setSavingId(row.id);
    setError("");
    try {
      const saved = await recordOfferResponse(row.id, response);
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      closeEdit();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to record offer response.");
    } finally {
      setSavingId("");
    }
  };

  const columns = [
    {
      key: "candidateName",
      label: "Candidate",
      widthClassName: "w-[168px] min-w-[168px] max-w-[168px]",
      render: (row) => (
        <span className="block truncate font-medium" title={row.candidateName || undefined}>
          {row.candidateName || "—"}
        </span>
      ),
    },
    {
      key: "designation",
      label: "Designation",
      widthClassName: "w-[140px] min-w-[140px] max-w-[140px]",
      render: (row) => (
        <span className="block truncate" title={row.designation || undefined}>
          {row.designation || "—"}
        </span>
      ),
    },
    {
      key: "employeeCode",
      label: "Emp Code",
      widthClassName: "w-[96px] min-w-[96px] max-w-[96px]",
      render: (row) => row.employeeCode || "—",
    },
    {
      key: "offerReferenceNo",
      label: "Reference No",
      widthClassName: "w-[180px] min-w-[180px] max-w-[180px]",
      render: (row) => (
        <span className="block truncate" title={row.offerReferenceNo || undefined}>
          {row.offerReferenceNo || "—"}
        </span>
      ),
    },
    {
      key: "joiningDate",
      label: "Offer expiry",
      headerTitle: "Offer expiry (planned joining date)",
      widthClassName: "w-[130px] min-w-[130px] max-w-[130px]",
      render: (row) => (
        <span title={row.joiningDate ? "Planned joining date — offer expires on this date" : undefined}>
          {formatDateDisplay(row.joiningDate)}
        </span>
      ),
    },
    {
      key: "offerStatus",
      label: "Offer response",
      widthClassName: "w-[140px] min-w-[140px] max-w-[140px]",
      render: (row) => {
        const label = offerResponseLabel(row);
        return <StatusChip label={label} severity={journeyStatusSeverity(label)} />;
      },
    },
    {
      key: "actions",
      label: "Actions",
      widthClassName: "w-[248px] min-w-[248px] max-w-[248px]",
      cellClassName: "align-middle",
      render: (row) => {
        const label = offerResponseLabel(row);
        const awaiting = label === "Awaiting response";
        const busy = savingId === row.id;

        if (awaiting) {
          return (
            <CallingActionBar>
              <CallingActionBtn
                icon={Check}
                label="Accept"
                tone="success"
                disabled={busy}
                onClick={() => void handleResponse(row, "Accepted")}
              />
              <CallingActionBtn
                icon={X}
                label="Decline"
                disabled={busy}
                onClick={() => void handleResponse(row, "Declined")}
              />
              <CallingActionBtn
                icon={Clock}
                label="Expired"
                title="Mark expired"
                tone="warning"
                disabled={busy}
                onClick={() => void handleResponse(row, "Expired")}
              />
            </CallingActionBar>
          );
        }

        if (label === "Accepted" || label === "Declined") {
          const editable = canEditOfferResponse(row);
          const lock = editLockReason(row);
          return (
            <CallingActionBar>
              <CallingActionHint>{label}</CallingActionHint>
              <CallingActionBtn
                icon={Edit3}
                label="Edit"
                title={editable ? "Correct offer response" : lock || "Cannot edit"}
                disabled={!editable || busy}
                onClick={() => openEdit(row)}
              />
            </CallingActionBar>
          );
        }

        return <CallingActionHint>{label}</CallingActionHint>;
      },
    },
  ];

  const editBusy = editRow ? savingId === editRow.id : false;
  const currentEditLabel = editRow ? offerResponseLabel(editRow) : "";

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Offer Response"
        subtitle="Record whether the candidate accepted or declined. Unanswered offers auto-expire on the planned joining date. Use Edit to correct Accepted or Declined by mistake."
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

      <SectionCard title="Expiry setting">
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Offer expiry = planned joining date</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            Each offer remains open until the candidate&apos;s planned joining date (set on Selected / Offer
            Generation). On that date or later, unanswered offers are marked Expired automatically. Declined or
            Expired frees the employee code and offer reference for reuse.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Generated offers">
        <FilterBar>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Search
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <TinyInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, code, reference…"
                className="pl-7 w-56"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Response
            <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All</option>
              <option value="Awaiting response">Awaiting response</option>
              <option value="Accepted">Accepted</option>
              <option value="Declined">Declined</option>
              <option value="Expired">Expired</option>
            </TinySelect>
          </label>
        </FilterBar>

        {error && !editRow ? (
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
              frozenColumnWidths={[168]}
              density="comfortable"
            />
          )}
        </div>
      </SectionCard>

      <Modal
        open={Boolean(editRow)}
        onClose={closeEdit}
        title={editRow ? `Edit response — ${editRow.candidateName || "Candidate"}` : "Edit response"}
        widthClass="max-w-md"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={closeEdit}
              disabled={editBusy}
              className="h-8 px-3 text-xs rounded border border-slate-300 bg-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={editBusy || !editRow || editResponse === currentEditLabel}
              onClick={() => editRow && void handleResponse(editRow, editResponse)}
              className="h-8 px-3 text-xs rounded bg-accent text-white disabled:opacity-50"
            >
              {editBusy ? "Saving…" : "Save correction"}
            </button>
          </div>
        }
      >
        {editRow ? (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-600">
              Current response: <span className="font-medium text-slate-900">{currentEditLabel}</span>
            </p>
            <label className="flex flex-col gap-1 text-slate-700">
              Corrected response
              <TinySelect value={editResponse} onChange={(e) => setEditResponse(e.target.value)}>
                <option value="Accepted">Accepted</option>
                <option value="Declined">Declined</option>
                <option value="Expired">Expired</option>
              </TinySelect>
            </label>
            {editResponse === "Declined" || editResponse === "Expired" ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Declined / Expired frees the employee code and offer reference. Joining checklist progress for this
                offer is cleared.
              </p>
            ) : null}
            {editResponse === "Accepted" && currentEditLabel === "Declined" ? (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Accepting again reclaims this candidate&apos;s freed codes when still available. If reclaim fails,
                regenerate the letter from Offer Generation first.
              </p>
            ) : null}
            {error ? (
              <p className="text-xs text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
