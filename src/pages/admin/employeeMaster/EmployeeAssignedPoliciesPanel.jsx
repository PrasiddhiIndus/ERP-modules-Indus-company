import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SectionCard, StatusChip } from "../../adminOperations/components/AdminUi";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import {
  agreementStatusLabel,
  fetchAssignmentsForEmployee,
  friendlyPolicyError,
  isAgreementAgreed,
  policyDocTypeLabel,
} from "../../../lib/adminPolicyDocuments";
import { presignAdminPolicyR2Get } from "../../../lib/adminPolicyR2";
import { toast } from "../../../lib/toast";

function typeSeverity(docType) {
  return docType === "terms" ? "warning" : "info";
}

export default function EmployeeAssignedPoliciesPanel({ employeeId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState("");

  const load = useCallback(async () => {
    if (!employeeId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const list = await fetchAssignmentsForEmployee(employeeId);
      setRows(list);
    } catch (err) {
      console.error(err);
      setError(friendlyPolicyError(err, "Could not load assigned documents."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const openFile = async (row) => {
    if (!row?.object_key) {
      toast.warning("No file is attached yet.");
      return;
    }
    setOpeningId(row.id);
    try {
      const url = await presignAdminPolicyR2Get(row.object_key, {
        fileName: row.file_name,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Could not open the file.");
    } finally {
      setOpeningId("");
    }
  };

  return (
    <SectionCard
      title="Assigned policies and terms"
      right={
        <Link to="/app/admin/employee/policies" className="text-[11px] font-medium text-accent hover:underline">
          Manage documents
        </Link>
      }
    >
      {error ? (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      ) : null}
      {loading ? (
        <p className="text-sm text-ink-secondary">Loading assigned documents…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-secondary">
          No policies or terms are assigned to this employee yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((row) => (
            <li key={row.assignmentId || row.id} className="py-2.5 first:pt-0 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{row.title}</p>
                <p className="text-[11px] text-gray-500">
                  Assigned {formatDateDdMmYyyy(row.assigned_at) || "—"}
                  {isAgreementAgreed(row.agreement_status) && row.agreed_at
                    ? ` · Agreed ${formatDateDdMmYyyy(row.agreed_at)}`
                    : " · Awaiting agreement"}
                  {isAgreementAgreed(row.agreement_status) && row.acknowledged_name
                    ? ` · Signed ${row.acknowledged_name}`
                    : ""}
                  {row.file_name ? ` · ${row.file_name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusChip
                  label={agreementStatusLabel(row.agreement_status)}
                  severity={isAgreementAgreed(row.agreement_status) ? "info" : "warning"}
                />
                <StatusChip label={policyDocTypeLabel(row.doc_type)} severity={typeSeverity(row.doc_type)} />
                <button
                  type="button"
                  onClick={() => openFile(row)}
                  disabled={openingId === row.id}
                  className="h-7 px-2.5 rounded-lg border border-gray-200 bg-white text-[11px] font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  {openingId === row.id ? "Opening…" : "Open"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
