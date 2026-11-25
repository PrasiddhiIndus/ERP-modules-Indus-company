import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PrimaryButton, SecondaryButton, SectionCard, StatusChip, TinySelect } from "../../../components/erpUi";
import { toast } from "../../../lib/toast";
import { listSites } from "../../../lib/siteAttendance/siteAttendanceApi";
import {
  HR_FORM_GROUPS,
  appliesCodeForContext,
  eligibleFormsForSite,
  formDisplayName,
  inferSiteState,
} from "./hrSiteFormCatalog";
import {
  currentPeriod,
  generateDoc,
  getDoc,
  getSiteFormMap,
  isPayrollProcessed,
  listHrFormats,
  markDocsStale,
  periodLabel,
  setPayrollProcessed,
} from "./hrSiteComplianceStore";
import ComplianceFormPreview from "./ComplianceFormPreview";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function statusOf(siteId, period, formId, payrollOk) {
  if (!payrollOk) return { label: "Pending Payroll", severity: "warning" };
  const doc = getDoc(siteId, period, formId);
  if (!doc) return { label: "Not generated", severity: "neutral" };
  if (doc.stale) return { label: "Payroll revised", severity: "critical" };
  return { label: `Generated v${doc.version}`, severity: "info" };
}

export default function ComplianceGenerate({ siteType }) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [siteId, setSiteId] = useState("");
  const [period, setPeriod] = useState(currentPeriod);
  const [tick, setTick] = useState(0);
  const [formats, setFormats] = useState(() => listHrFormats());
  const [preview, setPreview] = useState(null);
  const appliesCode = appliesCodeForContext("HR", siteType);

  const [yStr, mStr] = period.split("-");
  const year = Number(yStr);
  const month = Number(mStr);

  const refreshSites = useCallback(async () => {
    setLoading(true);
    try {
      const { rows } = await listSites({ siteType: siteType || "", from: 0, to: 4999 });
      const list = Array.isArray(rows) ? rows : [];
      setSites(list);
      setSiteId((prev) => {
        if (prev && list.some((s) => String(s.id) === String(prev))) return prev;
        return "";
      });
    } catch (error) {
      console.error(error);
      setSites([]);
      toast.warning("Could not load sites from Site Attendance");
    } finally {
      setLoading(false);
    }
  }, [siteType]);

  useEffect(() => {
    refreshSites();
  }, [refreshSites]);

  const site = useMemo(() => sites.find((s) => String(s.id) === String(siteId)) || null, [sites, siteId]);

  const mappedForms = useMemo(() => {
    void tick;
    if (!site) return [];
    const eligible = eligibleFormsForSite(formats, site, appliesCode);
    const map = getSiteFormMap(siteType, site.id);
    return eligible.filter((form) => map[form.id]);
  }, [site, formats, appliesCode, siteType, tick]);

  const payrollOk = site ? isPayrollProcessed(site.id, period) : false;

  const pending = mappedForms.filter((form) => {
    const st = statusOf(site.id, period, form.id, payrollOk);
    return st.label === "Not generated" || st.label === "Payroll revised";
  });

  const done = mappedForms.filter((form) => getDoc(site?.id, period, form.id));

  const bump = () => setTick((n) => n + 1);

  const genOne = (form) => {
    if (!site || !payrollOk) return;
    generateDoc({
      siteId: site.id,
      siteName: site.site_name,
      siteType,
      period,
      formId: form.id,
      formLabel: formDisplayName(form),
    });
    bump();
    toast.success(`Generated ${formDisplayName(form)}`);
  };

  const genAll = () => {
    if (!site || !pending.length) return;
    pending.forEach((form) => {
      generateDoc({
        siteId: site.id,
        siteName: site.site_name,
        siteType,
        period,
        formId: form.id,
        formLabel: formDisplayName(form),
      });
    });
    bump();
    toast.success(`Generated ${pending.length} form${pending.length === 1 ? "" : "s"}`);
  };

  if (!siteId) {
    return (
      <div className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Generate Compliance</h2>
          <p className="type-meta text-ink-secondary mt-1 max-w-3xl">
            Pick a site to prepare all of its compliance forms for the month.
          </p>
        </div>
        <SectionCard title="Which site?">
          <p className="type-meta text-ink-muted mb-3">Sites come from Site Attendance ({siteType || "HR"})</p>
          {loading ? (
            <p className="type-meta text-ink-muted">Loading sites…</p>
          ) : (
            <TinySelect
              className="w-full max-w-lg"
              value=""
              onChange={(e) => setSiteId(e.target.value)}
              aria-label="Site"
            >
              <option value="">Select a site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.site_name}
                  {s.location ? ` (${s.location})` : ""}
                </option>
              ))}
            </TinySelect>
          )}
          {!loading && !sites.length ? (
            <p className="type-meta text-ink-muted mt-3">No sites found for this type.</p>
          ) : null}
        </SectionCard>
      </div>
    );
  }

  const state = inferSiteState(site);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SecondaryButton type="button" onClick={() => setSiteId("")}>
          ← All sites
        </SecondaryButton>
      </div>

      <div>
        <h2 className="text-[15px] font-semibold text-ink">{site.site_name}</h2>
        <p className="type-meta text-ink-secondary mt-1">
          {[state || site.location, site.site_type, site.max_workers ? `${site.max_workers} capacity` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <SectionCard title="Period">
        <div className="flex flex-wrap items-center gap-2">
          <TinySelect
            value={month}
            onChange={(e) => setPeriod(`${year}-${String(Number(e.target.value)).padStart(2, "0")}`)}
            aria-label="Month"
          >
            {MONTHS.map((label, idx) => (
              <option key={label} value={idx + 1}>
                {label}
              </option>
            ))}
          </TinySelect>
          <TinySelect
            value={year}
            onChange={(e) => setPeriod(`${e.target.value}-${String(month).padStart(2, "0")}`)}
            aria-label="Year"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </TinySelect>
          {payrollOk ? (
            <StatusChip label="Payroll processed" severity="info" />
          ) : (
            <StatusChip label="Pending Payroll" severity="warning" />
          )}
          {payrollOk ? (
            <SecondaryButton
              type="button"
              onClick={() => {
                markDocsStale(site.id, period);
                bump();
                toast.warning("Payroll revised — regenerate affected forms");
              }}
            >
              Mark payroll revised
            </SecondaryButton>
          ) : (
            <SecondaryButton
              type="button"
              onClick={() => {
                setPayrollProcessed(site.id, period, true);
                bump();
              }}
            >
              Mark payroll processed
            </SecondaryButton>
          )}
          <div className="flex-1" />
          <SecondaryButton type="button" disabled={!done.length} onClick={() => toast.success(`Ready to export ${done.length} forms`)}>
            Export all ({done.length})
          </SecondaryButton>
          <PrimaryButton type="button" disabled={!pending.length} onClick={genAll}>
            Generate {pending.length || "all"} pending
          </PrimaryButton>
        </div>
      </SectionCard>

      <SectionCard title={`Forms · ${periodLabel(period)}`}>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-divider bg-surface-sunken/60">
                <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Form</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Status</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {HR_FORM_GROUPS.map((group) => {
                const rows = mappedForms.filter((f) => f.group === group);
                if (!rows.length) return null;
                return (
                  <React.Fragment key={group}>
                    <tr className="bg-surface-sunken/40">
                      <td colSpan={3} className="px-3 py-1.5 text-[11px] font-semibold text-ink">
                        {group}
                      </td>
                    </tr>
                    {rows.map((form) => {
                      const st = statusOf(site.id, period, form.id, payrollOk);
                      const doc = getDoc(site.id, period, form.id);
                      const openPreview = () =>
                        setPreview({
                          form,
                          generated: Boolean(doc),
                          version: doc?.version || null,
                        });
                      return (
                        <tr key={form.id} className="border-t border-divider">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="text-[12px] font-semibold text-accent hover:underline text-left"
                              onClick={openPreview}
                            >
                              {formDisplayName(form)}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <StatusChip label={st.label} severity={st.severity} />
                          </td>
                          <td className="px-3 py-2">
                            {!payrollOk ? (
                              <span className="text-[12px] text-ink-muted">Waiting for payroll</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  className="h-7 rounded-control border border-border bg-surface px-2 text-[11px] font-medium hover:bg-surface-sunken"
                                  onClick={() => {
                                    genOne(form);
                                    setPreview({
                                      form,
                                      generated: true,
                                      version: (doc?.version || 0) + 1,
                                    });
                                  }}
                                >
                                  {doc ? "Regenerate" : "Generate"}
                                </button>
                                {doc ? (
                                  <button
                                    type="button"
                                    className="h-7 rounded-control border border-border bg-surface px-2 text-[11px] font-medium hover:bg-surface-sunken"
                                    onClick={openPreview}
                                  >
                                    View
                                  </button>
                                ) : null}
                                {doc ? (
                                  <button
                                    type="button"
                                    className="h-7 rounded-control border border-border bg-surface px-2 text-[11px] font-medium hover:bg-surface-sunken"
                                    onClick={() => toast.success(`Exported ${form.formNo}`)}
                                  >
                                    Export
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {!mappedForms.length ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center type-meta text-ink-muted">
                    No forms are set up for this site. Add them in Site Configuration.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <ComplianceFormPreview
        open={Boolean(preview?.form)}
        form={preview?.form}
        site={site}
        period={period}
        periodLabelText={periodLabel(period)}
        version={preview?.version}
        onClose={() => setPreview(null)}
        onFormatsChanged={(next) => {
          setFormats(next);
          const latest = next.find((f) => f.id === preview?.form?.id);
          if (latest) setPreview((prev) => (prev ? { ...prev, form: latest } : prev));
        }}
      />
    </div>
  );
}
