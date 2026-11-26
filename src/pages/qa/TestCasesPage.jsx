import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Plus } from "lucide-react";
import {
  DenseTable,
  EmptyState,
  FilterBar,
  FormField,
  InlineAlert,
  LoadingBlock,
  PageTaskHeader,
  PrimaryButton,
  TinyInput,
  TinySelect,
} from "../../components/erpUi";
import { blockedReason } from "./qaAccess";
import { QaBlockedLine } from "./components/QaHelpButton";
import { CASE_STATUSES, QA_BASE } from "./qaConstants";
import { useQaRelease } from "./QaReleaseContext";
import { listRequests, listTestCases } from "./qaApi";
import { CaseStatusChip } from "./components/QaChips";

export default function TestCasesPage() {
  const navigate = useNavigate();
  const { access } = useOutletContext();
  const { releaseId } = useQaRelease();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [requestCodes, setRequestCodes] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listTestCases({ releaseId: releaseId || null, status: status || null, search });
      if (releaseId) {
        const reqs = await listRequests({ releaseId });
        setRequestCodes(Object.fromEntries(reqs.map((r) => [r.id, r.code])));
      }
      setRows(data);
    } catch (err) {
      setError(err.message || "Could not load test cases.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [releaseId, status, search]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = useMemo(
    () => [
      {
        key: "code",
        label: "Case",
        render: (r) => (
          <button
            type="button"
            className="text-accent font-medium hover:underline"
            onClick={() => navigate(`${QA_BASE}/cases/${r.code}`)}
          >
            {r.code}
          </button>
        ),
      },
      {
        key: "request_id",
        label: "Request",
        render: (r) => requestCodes[r.request_id] || `#${r.request_id}`,
      },
      { key: "current_version", label: "Ver." },
      {
        key: "status",
        label: "Status",
        render: (r) => <CaseStatusChip status={r.status} />,
      },
      {
        key: "created_at",
        label: "Created",
        render: (r) =>
          r.created_at
            ? new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })
            : "—",
      },
    ],
    [navigate, requestCodes]
  );

  return (
    <>
      <PageTaskHeader
        title="Test cases"
        subtitle={
          releaseId
            ? `Cases linked to requests in release ${releaseId}.`
            : "Select a release to scope cases."
        }
      >
        {access.canCreateCase ? (
          <PrimaryButton icon={Plus} onClick={() => navigate(`${QA_BASE}/cases/new`)}>
            New case
          </PrimaryButton>
        ) : (
          <QaBlockedLine>Read-only — {blockedReason("canCreateCase", access.role)}</QaBlockedLine>
        )}
      </PageTaskHeader>

      <FilterBar>
        <FormField label="Search">
          <TinyInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Case code…"
            className="min-w-[10rem]"
          />
        </FormField>
        <FormField label="Status">
          <TinySelect value={status} onChange={(e) => setStatus(e.target.value)} className="min-w-[9rem]">
            <option value="">All</option>
            {CASE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </TinySelect>
        </FormField>
      </FilterBar>

      {error ? <InlineAlert tone="error" className="mb-3">{error}</InlineAlert> : null}

      {loading ? (
        <LoadingBlock label="Loading test cases…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No test cases"
          message={releaseId ? "No cases match your filters for this release." : "Pick a release in the header."}
        />
      ) : (
        <DenseTable columns={columns} rows={rows} />
      )}
    </>
  );
}