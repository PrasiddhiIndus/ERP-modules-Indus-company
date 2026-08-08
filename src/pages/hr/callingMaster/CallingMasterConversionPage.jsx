import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, UserPlus } from "lucide-react";
import {
  DenseTable,
  FilterBar,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinyInput,
  TinySelect,
} from "../../adminOperations/components/AdminUi";
import { CALLING_MASTER_RECORDS_EVENT, journeyStatusSeverity } from "./callingMasterConfig";
import { CallingActionBar, CallingActionBtn, CallingActionHint } from "./CallingTableActions";
import { convertToEmployeeMaster, loadConversionCandidates } from "./callingMasterStorage";

export default function CallingMasterConversionPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [savingId, setSavingId] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loadConversionCandidates();
      setRecords(next);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to load conversion candidates.");
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
      const converted = row.conversionStatus === "Converted";
      if (statusFilter === "Converted" && !converted) return false;
      if (statusFilter === "Pending" && converted) return false;
      if (!q) return true;
      const hay = [
        row.candidateName,
        row.designation,
        row.employeeCode,
        row.iomReferenceNo,
        row.phoneNumber,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, search, statusFilter]);

  const handleConvert = async (row) => {
    setSavingId(row.id);
    setError("");
    setMessage("");
    try {
      const result = await convertToEmployeeMaster(row.id);
      setRecords((prev) => prev.map((r) => (r.id === result.candidate.id ? result.candidate : r)));
      setMessage(
        `${row.candidateName} added to Employee Master (ID ${result.employeeId}, code ${result.employeeCode}). Complete remaining fields in Employee Master.`
      );
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to convert to Employee Master.");
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
      key: "iomReferenceNo",
      label: "IOM Ref",
      widthClassName: "w-[180px] min-w-[180px] max-w-[180px]",
      render: (row) => (
        <span className="block truncate" title={row.iomReferenceNo || undefined}>
          {row.iomReferenceNo || "—"}
        </span>
      ),
    },
    {
      key: "actualJoiningDate",
      label: "Joined on",
      widthClassName: "w-[110px] min-w-[110px] max-w-[110px]",
      render: (row) => row.actualJoiningDate || "—",
    },
    {
      key: "conversionStatus",
      label: "Conversion",
      widthClassName: "w-[110px] min-w-[110px] max-w-[110px]",
      render: (row) => {
        const label = row.conversionStatus === "Converted" ? "Converted" : "Pending";
        return (
          <StatusChip
            label={label}
            severity={journeyStatusSeverity(label === "Converted" ? "Converted" : "Pending")}
          />
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      widthClassName: "w-[168px] min-w-[168px] max-w-[168px]",
      cellClassName: "align-middle",
      render: (row) => {
        const converted = row.conversionStatus === "Converted";
        const busy = savingId === row.id;
        if (converted) {
          return (
            <CallingActionBar>
              <CallingActionHint>Converted</CallingActionHint>
            </CallingActionBar>
          );
        }
        return (
          <CallingActionBar>
            <CallingActionBtn
              icon={UserPlus}
              label={busy ? "Converting…" : "Convert"}
              title="Convert to Employee Master"
              tone="accent"
              disabled={busy}
              onClick={() => void handleConvert(row)}
            />
          </CallingActionBar>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Conversion"
        subtitle="After the IOM is issued, push the candidate into Employee Master using fields already captured. Missing Employee Master fields stay blank for HR to complete later."
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

      <SectionCard title="IOM issued — ready to convert">
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
              <option value="Converted">Converted</option>
            </TinySelect>
          </label>
        </FilterBar>

        {error ? (
          <p className="mt-3 text-xs text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 text-xs text-emerald-700" role="status">
            {message}
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
