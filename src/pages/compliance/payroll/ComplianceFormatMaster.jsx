import React, { useMemo, useState } from "react";
import { PrimaryButton, SectionCard, StatusChip, TinyInput } from "../../../components/erpUi";
import {
  HR_APPLY_LABELS,
  HR_FORM_GROUPS,
  appliesCodeForContext,
  formDisplayName,
} from "./hrSiteFormCatalog";
import { countSitesUsingForm, listHrFormats, setHrFormatActive } from "./hrSiteComplianceStore";
import { COMPLIANCE_HR_SUB_LABELS } from "./complianceModuleContext";
import ComplianceFormPreview, { FormatEditorModal, blankHrFormat } from "./ComplianceFormPreview";

export default function ComplianceFormatMaster({ siteType, siteIds = [] }) {
  const appliesCode = appliesCodeForContext("HR", siteType);
  const [forms, setForms] = useState(() => listHrFormats());
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);

  const refresh = () => setForms(listHrFormats());

  const scoped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return forms.filter((form) => {
      if (!(form.appliesTo || []).includes(appliesCode)) return false;
      if (!needle) return true;
      return formDisplayName(form).toLowerCase().includes(needle);
    });
  }, [forms, appliesCode, query]);

  const typeLabel = COMPLIANCE_HR_SUB_LABELS[siteType] || siteType;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Format Master</h2>
          <p className="type-meta text-ink-secondary mt-1 max-w-3xl">
            Every compliance form in one list. Click a form or Edit to open it and enter data in the table, then Save.
          </p>
        </div>
        <PrimaryButton type="button" onClick={() => setEditing(blankHrFormat(appliesCode))}>
          + New format
        </PrimaryButton>
      </div>

      <SectionCard
        title="Forms"
        right={<span className="text-[11px] text-ink-muted">{scoped.length} forms for {typeLabel}</span>}
      >
        <div className="mb-3">
          <TinyInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search forms"
            aria-label="Search forms"
            className="max-w-sm"
          />
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-divider bg-surface-sunken/60">
                <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Form</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Applies to</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Type</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Sites</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">With bill</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted">Active</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-ink-muted" />
              </tr>
            </thead>
            <tbody>
              {HR_FORM_GROUPS.map((group) => {
                const rows = scoped.filter((f) => f.group === group);
                if (!rows.length) return null;
                return (
                  <React.Fragment key={group}>
                    <tr className="bg-surface-sunken/40">
                      <td colSpan={7} className="px-3 py-1.5 text-[11px] font-semibold text-ink">
                        {group}
                      </td>
                    </tr>
                    {rows.map((form) => {
                      const sites = countSitesUsingForm(siteType, form.id, siteIds);
                      return (
                        <tr key={form.id} className="border-t border-divider">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="text-[12px] font-semibold text-accent hover:underline text-left"
                              onClick={() => setPreview(form)}
                            >
                              {formDisplayName(form)}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {(form.appliesTo || []).map((code) => (
                                <StatusChip key={code} label={HR_APPLY_LABELS[code] || code} severity="info" />
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {form.type === "Central" ? (
                              <StatusChip label="Central" severity="neutral" />
                            ) : (
                              <StatusChip
                                label={form.anyState || !form.state ? "State" : form.state}
                                severity="warning"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-[12px] text-ink-secondary">
                            {sites ? `${sites} site${sites === 1 ? "" : "s"}` : "None"}
                          </td>
                          <td className="px-3 py-2 text-[12px] text-ink">{form.withBill ? "Yes" : "No"}</td>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={Boolean(form.active)}
                              onChange={(e) => {
                                setHrFormatActive(form.id, e.target.checked);
                                refresh();
                              }}
                              aria-label={`Active ${formDisplayName(form)}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="h-7 rounded-control border border-border bg-surface px-2 text-[11px] font-medium text-ink hover:bg-surface-sunken"
                              onClick={() => setPreview(form)}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {!scoped.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center type-meta text-ink-muted">
                    No forms match.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <FormatEditorModal
        open={Boolean(editing)}
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          refresh();
          if (preview?.id === saved.id) setPreview(saved);
        }}
      />

      <ComplianceFormPreview
        open={Boolean(preview)}
        form={preview}
        onClose={() => setPreview(null)}
        onFormatsChanged={(next) => {
          setForms(next);
          const latest = next.find((f) => f.id === preview?.id);
          if (latest) setPreview(latest);
        }}
      />
    </div>
  );
}
