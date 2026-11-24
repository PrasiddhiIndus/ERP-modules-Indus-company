import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SectionCard, StatusChip, TinySelect } from "../../../components/erpUi";
import { toast } from "../../../lib/toast";
import { listSites } from "../../../lib/siteAttendance/siteAttendanceApi";
import { HR_FORM_GROUPS, formDisplayName } from "./hrSiteFormCatalog";
import { listGeneratedDocs, listHrFormats, periodLabel } from "./hrSiteComplianceStore";
import { COMPLIANCE_HR_SUB_LABELS } from "./complianceModuleContext";
import ComplianceFormPreview from "./ComplianceFormPreview";

export default function ComplianceHistory({ siteType }) {
  const [sites, setSites] = useState([]);
  const [period, setPeriod] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [docs, setDocs] = useState(() => listGeneratedDocs());
  const [formats, setFormats] = useState(() => listHrFormats());
  const [preview, setPreview] = useState(null);
  const [openSiteId, setOpenSiteId] = useState("");

  const refreshSites = useCallback(async () => {
    try {
      const { rows } = await listSites({ siteType: siteType || "", from: 0, to: 4999 });
      setSites(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error(error);
      setSites([]);
    }
  }, [siteType]);

  useEffect(() => {
    refreshSites();
    setDocs(listGeneratedDocs());
  }, [refreshSites, siteType]);

  const siteIds = useMemo(() => new Set(sites.map((s) => String(s.id))), [sites]);

  const scopedDocs = useMemo(() => {
    return docs.filter((doc) => {
      if (doc.siteType && doc.siteType !== siteType) return false;
      if (!siteIds.has(String(doc.siteId))) return false;
      return true;
    });
  }, [docs, siteType, siteIds]);

  const periods = useMemo(() => {
    const set = new Set(scopedDocs.map((d) => d.period));
    const cur = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    set.add(cur);
    return [...set].sort().reverse();
  }, [scopedDocs]);

  const selectedPeriod = period && periods.includes(period) ? period : periods[0] || "";

  const periodDocs = useMemo(() => {
    return scopedDocs
      .filter((doc) => doc.period === selectedPeriod)
      .filter((doc) => siteFilter === "all" || String(doc.siteId) === String(siteFilter));
  }, [scopedDocs, selectedPeriod, siteFilter]);

  const siteGroups = useMemo(() => {
    const byId = new Map();
    periodDocs.forEach((doc) => {
      const id = String(doc.siteId);
      if (!byId.has(id)) {
        const site = sites.find((s) => String(s.id) === id) || null;
        byId.set(id, {
          siteId: id,
          siteName: site?.site_name || doc.siteName || id,
          location: site?.location || "",
          site,
          docs: [],
        });
      }
      byId.get(id).docs.push(doc);
    });

    const groups = [...byId.values()].map((group) => {
      const sortedDocs = [...group.docs].sort((a, b) => {
        const fa = formats.find((f) => f.id === a.formId);
        const fb = formats.find((f) => f.id === b.formId);
        const ga = HR_FORM_GROUPS.indexOf(fa?.group || "");
        const gb = HR_FORM_GROUPS.indexOf(fb?.group || "");
        if (ga !== gb) return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb);
        return String(a.formLabel || "").localeCompare(String(b.formLabel || ""));
      });
      const latest = sortedDocs.reduce((max, doc) => {
        if (!max) return doc.generatedAt || "";
        return String(doc.generatedAt || "").localeCompare(String(max)) > 0 ? doc.generatedAt : max;
      }, "");
      return { ...group, docs: sortedDocs, latest };
    });

    return groups.sort((a, b) => a.siteName.localeCompare(b.siteName));
  }, [periodDocs, sites, formats]);

  useEffect(() => {
    if (!siteGroups.length) {
      setOpenSiteId("");
      return;
    }
    if (siteFilter !== "all") {
      setOpenSiteId(String(siteFilter));
      return;
    }
    setOpenSiteId((prev) => {
      if (prev && siteGroups.some((g) => g.siteId === prev)) return prev;
      return siteGroups[0].siteId;
    });
  }, [siteGroups, siteFilter]);

  const formOf = (formId) => formats.find((f) => f.id === formId);

  const openDoc = (doc, group) => {
    const form = formOf(doc.formId);
    if (!form) {
      toast.warning("Format no longer exists in Format Master");
      return;
    }
    const site =
      group.site ||
      sites.find((s) => String(s.id) === String(doc.siteId)) || {
        id: doc.siteId,
        site_name: doc.siteName,
      };
    setPreview({ form, site, doc });
  };

  const activeGroup = siteGroups.find((g) => g.siteId === openSiteId) || null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">History</h2>
        <p className="type-meta text-ink-secondary mt-1 max-w-3xl">
          Generated forms grouped by site for {COMPLIANCE_HR_SUB_LABELS[siteType] || siteType}. Pick a site to see all
          its form details.
        </p>
      </div>

      <SectionCard title="Generated by site">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <TinySelect value={selectedPeriod} onChange={(e) => setPeriod(e.target.value)} aria-label="Month">
            {periods.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </TinySelect>
          <TinySelect value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} aria-label="Site">
            <option value="all">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.site_name}
              </option>
            ))}
          </TinySelect>
          <span className="text-[11px] text-ink-muted">
            {siteGroups.length} site{siteGroups.length === 1 ? "" : "s"} · {periodDocs.length} document
            {periodDocs.length === 1 ? "" : "s"}
          </span>
        </div>

        {!siteGroups.length ? (
          <p className="type-meta text-ink-muted py-10 text-center rounded-lg border border-border">
            Nothing was generated for this selection.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,280px)_1fr]">
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="border-b border-divider bg-surface-sunken/60 px-3 py-2 text-[11px] font-semibold text-ink-muted">
                Sites
              </div>
              <ul className="max-h-[560px] overflow-y-auto" role="listbox" aria-label="Sites with history">
                {siteGroups.map((group) => {
                  const selected = group.siteId === openSiteId;
                  return (
                    <li key={group.siteId}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => setOpenSiteId(group.siteId)}
                        className={`w-full text-left px-3 py-2.5 border-b border-divider transition-colors ${
                          selected ? "bg-accent-soft/50 border-l-2 border-l-accent" : "hover:bg-surface-sunken border-l-2 border-l-transparent"
                        }`}
                      >
                        <p className="text-[12px] font-semibold text-ink truncate">{group.siteName}</p>
                        <p className="text-[11px] text-ink-muted mt-0.5">
                          {group.docs.length} form{group.docs.length === 1 ? "" : "s"}
                          {group.location ? ` · ${group.location}` : ""}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-lg border border-border overflow-hidden min-w-0">
              {!activeGroup ? (
                <p className="type-meta text-ink-muted py-10 text-center">Select a site to see its forms.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-divider bg-surface-sunken/40 px-3 py-3">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-ink truncate">{activeGroup.siteName}</h3>
                      <p className="type-meta text-ink-secondary mt-0.5">
                        {[periodLabel(selectedPeriod), activeGroup.location, `${activeGroup.docs.length} forms`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {activeGroup.latest ? (
                        <StatusChip label={`Last ${activeGroup.latest}`} severity="neutral" />
                      ) : null}
                      <button
                        type="button"
                        className="h-8 rounded-control border border-border bg-surface px-2.5 text-[11px] font-medium hover:bg-surface-sunken"
                        onClick={() =>
                          toast.success(`Export all ${activeGroup.docs.length} forms for ${activeGroup.siteName}`)
                        }
                      >
                        Export all ({activeGroup.docs.length})
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-divider bg-surface-sunken/30">
                          <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Form</th>
                          <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Version</th>
                          <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Generated</th>
                          <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {HR_FORM_GROUPS.map((groupName) => {
                          const inGroup = activeGroup.docs.filter((doc) => formOf(doc.formId)?.group === groupName);
                          if (!inGroup.length) return null;
                          return (
                            <React.Fragment key={groupName}>
                              <tr className="bg-surface-sunken/40">
                                <td colSpan={4} className="px-3 py-1.5 text-[11px] font-semibold text-ink">
                                  {groupName}
                                </td>
                              </tr>
                              {inGroup.map((doc) => {
                                const form = formOf(doc.formId);
                                const label = doc.formLabel || (form ? formDisplayName(form) : doc.formId);
                                return (
                                  <tr key={doc.id} className="border-t border-divider">
                                    <td className="px-3 py-2">
                                      <button
                                        type="button"
                                        className="text-[12px] font-semibold text-accent hover:underline text-left"
                                        onClick={() => openDoc(doc, activeGroup)}
                                      >
                                        {label}
                                      </button>
                                    </td>
                                    <td className="px-3 py-2 text-[12px] text-ink">v{doc.version}</td>
                                    <td className="px-3 py-2 text-[12px] text-ink-secondary">{doc.generatedAt}</td>
                                    <td className="px-3 py-2">
                                      <div className="flex flex-wrap gap-1.5">
                                        <button
                                          type="button"
                                          className="h-7 rounded-control border border-border bg-surface px-2 text-[11px] font-medium hover:bg-surface-sunken"
                                          onClick={() => openDoc(doc, activeGroup)}
                                        >
                                          View
                                        </button>
                                        <button
                                          type="button"
                                          className="h-7 rounded-control border border-border bg-surface px-2 text-[11px] font-medium hover:bg-surface-sunken"
                                          onClick={() => toast.success(`Exported ${label}`)}
                                        >
                                          Export
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                        {activeGroup.docs.some((doc) => !formOf(doc.formId)?.group) ? (
                          <>
                            <tr className="bg-surface-sunken/40">
                              <td colSpan={4} className="px-3 py-1.5 text-[11px] font-semibold text-ink">
                                Other
                              </td>
                            </tr>
                            {activeGroup.docs
                              .filter((doc) => !formOf(doc.formId)?.group)
                              .map((doc) => {
                                const label = doc.formLabel || doc.formId;
                                return (
                                  <tr key={doc.id} className="border-t border-divider">
                                    <td className="px-3 py-2 text-[12px] font-semibold text-accent">{label}</td>
                                    <td className="px-3 py-2 text-[12px] text-ink">v{doc.version}</td>
                                    <td className="px-3 py-2 text-[12px] text-ink-secondary">{doc.generatedAt}</td>
                                    <td className="px-3 py-2">
                                      <button
                                        type="button"
                                        className="h-7 rounded-control border border-border bg-surface px-2 text-[11px] font-medium"
                                        onClick={() => toast.success(`Exported ${label}`)}
                                      >
                                        Export
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                          </>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <ComplianceFormPreview
        open={Boolean(preview?.form)}
        form={preview?.form}
        site={preview?.site}
        period={preview?.doc?.period || ""}
        periodLabelText={preview?.doc ? periodLabel(preview.doc.period) : ""}
        version={preview?.doc?.version}
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
