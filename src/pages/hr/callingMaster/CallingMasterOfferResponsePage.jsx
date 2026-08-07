import React, { useEffect, useMemo, useState } from "react";
import { Check, Clock, RefreshCw, Search, X } from "lucide-react";
import {
  DenseTable,
  FilterBar,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinyInput,
  TinySelect,
} from "../../adminOperations/components/AdminUi";
import {
  CALLING_MASTER_RECORDS_EVENT,
  DEFAULT_OFFER_EXPIRY_DAYS,
  journeyStatusSeverity,
} from "./callingMasterConfig";
import { offerResponseLabel } from "./callingMasterApi";
import { CallingActionBar, CallingActionBtn } from "./CallingTableActions";
import {
  loadOfferExpiryDays,
  loadOfferResponseCandidates,
  recordOfferResponse,
  saveOfferExpiryDays,
} from "./callingMasterStorage";

export default function CallingMasterOfferResponsePage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [savingId, setSavingId] = useState("");
  const [expiryDays, setExpiryDays] = useState(DEFAULT_OFFER_EXPIRY_DAYS);
  const [expiryInput, setExpiryInput] = useState(String(DEFAULT_OFFER_EXPIRY_DAYS));
  const [expirySaving, setExpirySaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [next, days] = await Promise.all([
        loadOfferResponseCandidates(),
        loadOfferExpiryDays().catch(() => DEFAULT_OFFER_EXPIRY_DAYS),
      ]);
      setRecords(next);
      setExpiryDays(days);
      setExpiryInput(String(days));
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

  const handleResponse = async (row, response) => {
    setSavingId(row.id);
    setError("");
    try {
      const saved = await recordOfferResponse(row.id, response);
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to record offer response.");
    } finally {
      setSavingId("");
    }
  };

  const handleSaveExpiry = async () => {
    setExpirySaving(true);
    setError("");
    try {
      const saved = await saveOfferExpiryDays(expiryInput);
      setExpiryDays(saved);
      setExpiryInput(String(saved));
      await refresh();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to save expiry days.");
    } finally {
      setExpirySaving(false);
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
      key: "offerReferenceNo",
      label: "Reference No",
      widthClassName: "min-w-[180px]",
      render: (row) => row.offerReferenceNo || "—",
    },
    {
      key: "joiningDate",
      label: "Planned joining",
      widthClassName: "min-w-[120px]",
      render: (row) => row.joiningDate || "—",
    },
    {
      key: "offerStatus",
      label: "Offer response",
      widthClassName: "min-w-[140px]",
      render: (row) => {
        const label = offerResponseLabel(row);
        return <StatusChip label={label} severity={journeyStatusSeverity(label)} />;
      },
    },
    {
      key: "actions",
      label: "Actions",
      widthClassName: "min-w-[200px]",
      cellClassName: "align-middle",
      render: (row) => {
        const awaiting = offerResponseLabel(row) === "Awaiting response";
        const busy = savingId === row.id;
        return (
          <CallingActionBar>
            <CallingActionBtn
              icon={Check}
              label="Accept"
              tone="success"
              disabled={!awaiting || busy}
              onClick={() => void handleResponse(row, "Accepted")}
            />
            <CallingActionBtn
              icon={X}
              label="Decline"
              disabled={!awaiting || busy}
              onClick={() => void handleResponse(row, "Declined")}
            />
            <CallingActionBtn
              icon={Clock}
              label="Expired"
              title="Mark expired"
              tone="warning"
              disabled={!awaiting || busy}
              onClick={() => void handleResponse(row, "Expired")}
            />
          </CallingActionBar>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Offer Response"
        subtitle="Record whether the candidate accepted, declined, or the offer expired. Unanswered offers auto-expire after the configured number of days."
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
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="flex flex-col gap-1 text-slate-600">
            Auto-expire after (days)
            <TinyInput
              type="number"
              min={1}
              max={365}
              value={expiryInput}
              onChange={(e) => setExpiryInput(e.target.value)}
              className="w-28"
            />
          </label>
          <button
            type="button"
            disabled={expirySaving}
            onClick={() => void handleSaveExpiry()}
            className="h-8 px-3 rounded bg-accent text-white disabled:opacity-50"
          >
            {expirySaving ? "Saving…" : "Save"}
          </button>
          <p className="text-slate-500 self-center">
            Current: {expiryDays} day{expiryDays === 1 ? "" : "s"}. Declined / Expired frees the employee code and
            offer reference for reuse.
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

        {error ? (
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
    </div>
  );
}
