import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ClipboardList, FileSpreadsheet, ShieldCheck } from "lucide-react";
import {
  CollapsibleHelp,
  KpiTile,
  PageTaskHeader,
  SectionCard,
} from "../../adminOperations/components/AdminUi";
import { listMonthRuns, monthLabel } from "../../adminOperations/salaryAdmin/salaryMonthProcessing";
import {
  USE_MOCK_SALARY_PROCESSING,
  mockListRunsWithLines,
} from "../../adminOperations/salaryAdmin/salaryProcessingMock";
import { WAGE_FORM_LIST, listWagePacks } from "./wageFormCatalog";
import { SS_FORM_LIST, listSsPacks } from "./ssFormCatalog";
import { OSH_FORM_LIST, listOshPacks } from "./oshFormCatalog";

const FORM_GROUPS = [
  {
    id: "wages",
    label: "Code on Wage",
    forms: WAGE_FORM_LIST,
    listPacks: listWagePacks,
  },
  {
    id: "social",
    label: "Code on Social security",
    forms: SS_FORM_LIST,
    listPacks: listSsPacks,
  },
  {
    id: "osh",
    label: "Code on OSH-WC",
    forms: OSH_FORM_LIST,
    listPacks: listOshPacks,
  },
];

function packTitle(pack, forms) {
  const header = pack?.forms?.[forms[0]?.id]?.header || {};
  return (
    header.establishment ||
    header.contractor ||
    header.employeeName ||
    header.establishmentTo ||
    "Untitled record"
  );
}

function formSummary(group) {
  const labels = (group.forms || []).map((form) => String(form.button || "").replace(/^Form\s+/i, ""));
  if (!labels.length) return "No forms";
  if (labels.length === 1) return `Form ${labels[0]}`;
  return `Form ${labels.join(", ")}`;
}

function savedLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

async function loadFormOverview() {
  return Promise.all(
    FORM_GROUPS.map(async (group) => {
      const packs = (await group.listPacks()) || [];
      return {
        ...group,
        count: packs.length,
        records: packs.map((pack) => ({
          id: pack.id,
          title: packTitle(pack, group.forms),
          savedAt: pack.savedAt || "",
          tab: group.id,
          code: group.label,
        })),
      };
    })
  );
}

function currentYm() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * Compliance dashboard — overview of processed salary months ready for PF / ESIC filing.
 */
export default function ComplianceDashboard() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState([]);
  const [formGroups, setFormGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      try {
        setFormGroups(await loadFormOverview());
      } catch (formErr) {
        console.warn("Compliance forms overview skipped", formErr);
      }
      if (USE_MOCK_SALARY_PROCESSING) {
        setRuns((mockListRunsWithLines() || []).map(({ run }) => run));
      } else {
        try {
          setRuns(await listMonthRuns());
        } catch (liveErr) {
          console.warn("Compliance dashboard load failed", liveErr);
          setRuns((mockListRunsWithLines() || []).map(({ run }) => run));
          setError("Live salary months unavailable — showing sample overview.");
        }
      }
    } catch (err) {
      console.error(err);
      setError("Could not load compliance overview.");
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refreshForms = () => {
      loadFormOverview()
        .then((groups) => setFormGroups(groups))
        .catch((formErr) => console.warn("Compliance forms overview skipped", formErr));
    };
    window.addEventListener("focus", refreshForms);
    document.addEventListener("visibilitychange", refreshForms);
    return () => {
      window.removeEventListener("focus", refreshForms);
      document.removeEventListener("visibilitychange", refreshForms);
    };
  }, []);

  const processed = useMemo(
    () => (runs || []).filter((r) => String(r.status || "").toLowerCase() === "processed"),
    [runs]
  );

  const latest = processed[0] || null;
  const ym = currentYm();
  const savedFormTotal = formGroups.reduce((sum, group) => sum + group.count, 0);
  const recentForms = useMemo(
    () =>
      formGroups
        .flatMap((group) => group.records)
        .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
        .slice(0, 8),
    [formGroups]
  );

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Dashboard"
        subtitle="Track processed salary months for PF / EPF and ESIC, and open statutory compliance forms."
      >
        <Link
          to="/app/compliance/forms"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface text-xs font-medium text-ink hover:border-accent-border"
        >
          <ClipboardList className="h-3.5 w-3.5 text-accent" />
          Compliance forms
        </Link>
        <Link
          to="/app/compliance/payroll-process"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90"
        >
          Open payroll compliance
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </PageTaskHeader>

      <CollapsibleHelp label="how this module works">
        Select a processed salary month, review employee rows for PF / EPF or ESIC, check for
        format and duplicate errors, fix any issues, then download the filing file in the
        portal challan format.
      </CollapsibleHelp>

      {error ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiTile
          label="Processed months"
          value={loading ? "…" : String(processed.length)}
          sub="Available for compliance export"
        />
        <KpiTile
          label="Latest month"
          value={
            loading
              ? "…"
              : latest
                ? monthLabel(latest.pay_year, latest.pay_month)
                : "—"
          }
          sub={latest ? `${latest.employee_count || 0} employees on sheet` : "Process salary first"}
        />
        <KpiTile
          label="Saved form records"
          value={String(savedFormTotal)}
          sub="Wage · social security · safety"
          onClick={() => navigate("/app/compliance/forms")}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {formGroups.map((group) => (
          <KpiTile
            key={group.id}
            label={group.label}
            value={String(group.count)}
            sub={formSummary(group)}
            onClick={() => navigate(`/app/compliance/forms?tab=${group.id}`)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiTile
          label="PF / EPF"
          value="Challan"
          sub="UAN · wages · contributions"
          onClick={() => navigate("/app/compliance/payroll-process?tab=epf")}
        />
        <KpiTile
          label="ESIC"
          value="Return"
          sub="IP number · days · wages"
          onClick={() => navigate("/app/compliance/payroll-process?tab=esic")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard
          title="PF / EPF filing"
          right={
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
          }
        >
          <p className="text-xs text-ink-secondary mb-3">
            Build the EPF challan from the processed month — review UAN and wages, validate
            duplicates and age-58 EPS rules, then download with live contribution formulas.
          </p>
          <Link
            to={`/app/compliance/payroll-process?tab=epf&year=${ym.year}&month=${ym.month}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            Start PF / EPF process
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </SectionCard>

        <SectionCard
          title="ESIC filing"
          right={<FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden />}
        >
          <p className="text-xs text-ink-secondary mb-3">
            Prepare the ESIC contribution return — 10-digit IP numbers, alphabetic names, days
            paid and monthly wages — then validate and download the portal sheet.
          </p>
          <Link
            to={`/app/compliance/payroll-process?tab=esic&year=${ym.year}&month=${ym.month}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            Start ESIC process
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </SectionCard>
      </div>

      <SectionCard title="Saved compliance forms">
        {recentForms.length === 0 ? (
          <p className="text-xs text-ink-muted py-4">
            No saved compliance forms yet. Open a code above and save a record.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-surface-raised text-ink-secondary">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Code</th>
                  <th className="text-left font-semibold px-3 py-2">Record</th>
                  <th className="text-left font-semibold px-3 py-2">Saved</th>
                  <th className="text-right font-semibold px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider bg-surface">
                {recentForms.map((record) => (
                  <tr key={`${record.tab}-${record.id}`}>
                    <td className="px-3 py-2 text-ink">{record.code}</td>
                    <td className="px-3 py-2 text-ink">{record.title}</td>
                    <td className="px-3 py-2 text-ink-secondary">{savedLabel(record.savedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/app/compliance/forms?tab=${record.tab}`}
                        className="text-accent font-medium hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent processed months">
        {loading ? (
          <p className="text-xs text-ink-muted py-4">Loading…</p>
        ) : processed.length === 0 ? (
          <p className="text-xs text-ink-muted py-4">
            No processed salary months yet. Complete salary processing first, then return here.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-surface-raised text-ink-secondary">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Month</th>
                  <th className="text-left font-semibold px-3 py-2">Employees</th>
                  <th className="text-left font-semibold px-3 py-2">Status</th>
                  <th className="text-right font-semibold px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider bg-surface">
                {processed.slice(0, 8).map((r) => (
                  <tr key={r.id || r.month_key}>
                    <td className="px-3 py-2 text-ink">
                      {monthLabel(r.pay_year, r.pay_month)}
                    </td>
                    <td className="px-3 py-2 text-ink">{r.employee_count ?? "—"}</td>
                    <td className="px-3 py-2 capitalize text-ink-secondary">{r.status || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/app/compliance/payroll-process?year=${r.pay_year}&month=${r.pay_month}`}
                        className="text-accent font-medium hover:underline"
                      >
                        Open filings
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
