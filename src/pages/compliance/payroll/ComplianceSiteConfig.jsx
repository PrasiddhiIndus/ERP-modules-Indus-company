import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SectionCard, StatusChip, TinyInput } from "../../../components/erpUi";
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
  copySiteForms,
  countSiteForms,
  ensureSiteDefaults,
  getSiteFormMap,
  listHrFormats,
  setSiteFormBill,
  setSiteFormEnabled,
} from "./hrSiteComplianceStore";
import { COMPLIANCE_HR_SUB_LABELS } from "./complianceModuleContext";
import ComplianceFormPreview from "./ComplianceFormPreview";

function siteLabel(site) {
  return site?.site_name || `Site ${site?.id || ""}`;
}

export default function ComplianceSiteConfig({ siteType }) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("");
  const [bulk, setBulk] = useState(() => new Set());
  const [mapsTick, setMapsTick] = useState(0);
  const [formats, setFormats] = useState(() => listHrFormats());
  const [preview, setPreview] = useState(null);

  const typeLabel = COMPLIANCE_HR_SUB_LABELS[siteType] || siteType || "HR-Site";
  const appliesCode = appliesCodeForContext("HR", siteType);

  const refreshSites = useCallback(async () => {
    setLoading(true);
    try {
      const { rows } = await listSites({
        siteType: siteType || "",
        from: 0,
        to: 4999,
      });
      const list = Array.isArray(rows) ? rows : [];
      list.forEach((site) => {
        const eligible = eligibleFormsForSite(formats, site, appliesCode);
        ensureSiteDefaults(siteType, site.id, eligible);
      });
      setSites(list);
      setActiveId((prev) => {
        if (prev && list.some((s) => String(s.id) === String(prev))) return prev;
        return list[0] ? String(list[0].id) : "";
      });
      setBulk(new Set());
      setMapsTick((n) => n + 1);
    } catch (error) {
      console.error(error);
      setSites([]);
      setActiveId("");
      toast.warning("Could not load sites from Site Attendance");
    } finally {
      setLoading(false);
    }
  }, [siteType, formats, appliesCode]);

  useEffect(() => {
    refreshSites();
  }, [refreshSites]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sites;
    return sites.filter((site) => {
      const hay = `${site.site_name || ""} ${site.location || ""} ${site.site_type || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [sites, query]);

  const active = useMemo(
    () => sites.find((s) => String(s.id) === String(activeId)) || null,
    [sites, activeId]
  );

  const activeMap = useMemo(() => {
    void mapsTick;
    if (!active || !siteType) return {};
    return getSiteFormMap(siteType, active.id);
  }, [active, siteType, mapsTick]);

  const eligible = useMemo(() => {
    if (!active) return [];
    return eligibleFormsForSite(formats, active, appliesCode);
  }, [active, formats, appliesCode]);

  const siteState = active ? inferSiteState(active) : "";

  const bump = () => setMapsTick((n) => n + 1);

  const toggleBulk = (id) => {
    setBulk((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllBulk = () => {
    if (bulk.size === filtered.length) setBulk(new Set());
    else setBulk(new Set(filtered.map((s) => String(s.id))));
  };

  const onToggleForm = (form, enabled) => {
    if (!active || !siteType) return;
    setSiteFormEnabled(siteType, active.id, form.id, enabled, Boolean(form.withBill));
    bump();
  };

  const onToggleBill = (formId, bill) => {
    if (!active || !siteType) return;
    setSiteFormBill(siteType, active.id, formId, bill);
    bump();
  };

  const onCopy = () => {
    if (!active || !siteType || !bulk.size) return;
    copySiteForms(siteType, active.id, [...bulk]);
    bump();
    toast.success(`Copied to ${bulk.size} site${bulk.size === 1 ? "" : "s"}`);
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Site Configuration</h2>
        <p className="type-meta text-ink-secondary mt-1 max-w-3xl">
          Choose which forms each site needs, and which go with the bill. Saved once and carried forward every month.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(240px,300px)_1fr]">
        <SectionCard
          title="Sites"
          right={
            <button
              type="button"
              className="h-8 rounded-control border border-border bg-surface px-2.5 text-[11px] font-medium text-ink hover:bg-surface-sunken"
              onClick={selectAllBulk}
              disabled={!filtered.length}
            >
              {bulk.size === filtered.length && filtered.length ? "Clear" : "Select all"}
            </button>
          }
        >
          <div className="space-y-2">
            <TinyInput
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${typeLabel} sites…`}
              aria-label="Search sites"
            />
            {loading ? (
              <p className="type-meta text-ink-muted py-6 text-center">Loading sites…</p>
            ) : !filtered.length ? (
              <p className="type-meta text-ink-muted py-6 text-center">
                No {typeLabel} sites found in Site Attendance.
              </p>
            ) : (
              <ul className="max-h-[520px] space-y-1 overflow-y-auto" role="listbox" aria-label="Sites">
                {filtered.map((site) => {
                  const id = String(site.id);
                  const selected = id === String(activeId);
                  const formCount = countSiteForms(siteType, site.id);
                  const state = inferSiteState(site);
                  return (
                    <li key={id}>
                      <div
                        role="option"
                        aria-selected={selected}
                        tabIndex={0}
                        onClick={() => setActiveId(id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setActiveId(id);
                          }
                        }}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                          selected
                            ? "border-accent bg-accent-soft/50"
                            : "border-transparent hover:bg-surface-sunken"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          checked={bulk.has(id)}
                          onChange={() => toggleBulk(id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${siteLabel(site)}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-ink truncate">{siteLabel(site)}</p>
                          <p className="text-[11px] text-ink-muted truncate">
                            {state || site.location || "—"} · {formCount} form{formCount === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title={active ? siteLabel(active) : "Select a site"}
          right={
            <div className="flex flex-wrap items-center gap-2">
              {siteState ? <StatusChip label={siteState} severity="neutral" /> : null}
              <button
                type="button"
                className="h-8 rounded-control border border-accent bg-accent px-2.5 text-[11px] font-semibold text-white disabled:opacity-45"
                disabled={!active || !bulk.size}
                onClick={onCopy}
              >
                Copy to {bulk.size || 0} selected
              </button>
            </div>
          }
        >
          {!active ? (
            <p className="type-meta text-ink-muted py-8 text-center">Pick a site on the left to configure forms.</p>
          ) : (
            <div className="space-y-1">
              <p className="type-meta text-ink-secondary mb-3">
                Central forms{siteState ? ` plus ${siteState} state forms` : " and applicable state formats"}.
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[480px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-divider bg-surface-sunken/60">
                      <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted w-14">Use</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Form</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted w-24">With bill</th>
                    </tr>
                  </thead>
                  <tbody>
                    {HR_FORM_GROUPS.map((group) => {
                      const rows = eligible.filter((f) => f.group === group);
                      if (!rows.length) return null;
                      return (
                        <React.Fragment key={group}>
                          <tr className="bg-surface-sunken/40">
                            <td colSpan={3} className="px-3 py-1.5 text-[11px] font-semibold text-ink">
                              {group}
                            </td>
                          </tr>
                          {rows.map((form) => {
                            const on = Boolean(activeMap[form.id]);
                            const bill = Boolean(activeMap[form.id]?.bill);
                            return (
                              <tr key={form.id} className="border-t border-divider">
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={(e) => onToggleForm(form, e.target.checked)}
                                    aria-label={`Use ${formDisplayName(form)}`}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    className="text-[12px] font-semibold text-accent hover:underline text-left"
                                    onClick={() => setPreview(form)}
                                  >
                                    {formDisplayName(form)}
                                  </button>
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    type="checkbox"
                                    checked={bill}
                                    disabled={!on}
                                    onChange={(e) => onToggleBill(form.id, e.target.checked)}
                                    aria-label={`With bill ${formDisplayName(form)}`}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                    {!eligible.length ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center type-meta text-ink-muted">
                          No eligible forms for this site. Check Format Master.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <ComplianceFormPreview
        open={Boolean(preview)}
        form={preview}
        site={active}
        onClose={() => setPreview(null)}
        onFormatsChanged={(next) => {
          setFormats(next);
          const latest = next.find((f) => f.id === preview?.id);
          if (latest) setPreview(latest);
        }}
      />
    </div>
  );
}
