import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageTaskHeader } from "../../../components/erpUi";
import StatutoryCodePanel from "./StatutoryCodePanel";
import ComplianceFormatMaster from "./ComplianceFormatMaster";
import ComplianceSiteConfig from "./ComplianceSiteConfig";
import ComplianceGenerate from "./ComplianceGenerate";
import ComplianceHistory from "./ComplianceHistory";
import { exportWagePackExcel, exportWagePackPdf } from "./wageFormExport";
import { WAGE_FORM_LIST, createWagePack, deleteWagePack, listWagePacks, saveWagePack } from "./wageFormCatalog";
import { OSH_FORM_LIST, createOshPack, deleteOshPack, listOshPacks, saveOshPack } from "./oshFormCatalog";
import { SS_FORM_LIST, createSsPack, deleteSsPack, listSsPacks, saveSsPack } from "./ssFormCatalog";
import { listSites } from "../../../lib/siteAttendance/siteAttendanceApi";
import {
  COMPLIANCE_HR_SUBS,
  COMPLIANCE_HR_SUB_LABELS,
  COMPLIANCE_MODULES,
  COMPLIANCE_MODULE_LABELS,
} from "./complianceModuleContext";

/** IN-House keeps the existing statutory entry tabs. */
export const COMPLIANCE_FORM_TABS = [
  { id: "wages", label: "Code on Wage" },
  { id: "social", label: "Code on Social security" },
  { id: "osh", label: "Code on OSH-WC" },
];

/** HR-Site work area — same order as the Compliance Module prototype sidebar, as top tabs. */
export const HR_SITE_WORK_TABS = [
  { id: "master", label: "Format Master" },
  { id: "config", label: "Site Configuration" },
  { id: "gen", label: "Generate Compliance" },
  { id: "hist", label: "History" },
];

function Segment({ items, value, onChange, ariaLabel }) {
  return (
    <div
      className="inline-flex rounded-lg border border-border bg-surface-sunken p-0.5"
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const on = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(item.id)}
            className={`h-8 rounded-md px-3.5 text-[12px] font-semibold transition-colors ${
              on ? "bg-surface text-accent shadow-sm" : "text-ink-secondary hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ComplianceForms() {
  const [params, setParams] = useSearchParams();
  const [hrSiteIds, setHrSiteIds] = useState([]);

  const module =
    params.get("module") === COMPLIANCE_MODULES.hrSite
      ? COMPLIANCE_MODULES.hrSite
      : COMPLIANCE_MODULES.inHouse;

  const hrSub = useMemo(() => {
    const raw = params.get("siteType");
    if (raw === COMPLIANCE_HR_SUBS.safety) return COMPLIANCE_HR_SUBS.safety;
    return COMPLIANCE_HR_SUBS.fire;
  }, [params]);

  const isHr = module === COMPLIANCE_MODULES.hrSite;
  const workTabs = isHr ? HR_SITE_WORK_TABS : COMPLIANCE_FORM_TABS;

  const requested = params.get("tab");
  const tab = workTabs.some((item) => item.id === requested) ? requested : workTabs[0].id;

  const loadHrSites = useCallback(async () => {
    if (!isHr) {
      setHrSiteIds([]);
      return;
    }
    try {
      const { rows } = await listSites({ siteType: hrSub, from: 0, to: 4999 });
      setHrSiteIds((rows || []).map((s) => String(s.id)));
    } catch {
      setHrSiteIds([]);
    }
  }, [isHr, hrSub]);

  useEffect(() => {
    loadHrSites();
  }, [loadHrSites]);

  const patchParams = (next) => {
    const merged = {
      module,
      ...(isHr ? { siteType: hrSub } : {}),
      tab,
      ...next,
    };
    if (merged.module !== COMPLIANCE_MODULES.hrSite) {
      delete merged.siteType;
    }
    const clean = Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value != null && value !== "")
    );
    setParams(clean, { replace: true });
  };

  const setModule = (id) => {
    if (id === COMPLIANCE_MODULES.hrSite) {
      patchParams({
        module: id,
        siteType: hrSub || COMPLIANCE_HR_SUBS.fire,
        tab: HR_SITE_WORK_TABS[0].id,
      });
      return;
    }
    patchParams({ module: id, tab: COMPLIANCE_FORM_TABS[0].id, siteType: undefined });
  };

  const setHrSub = (id) => patchParams({ siteType: id });
  const setTab = (id) => patchParams({ tab: id });

  const contextLabel = isHr
    ? `${COMPLIANCE_MODULE_LABELS[module]} · ${COMPLIANCE_HR_SUB_LABELS[hrSub]}`
    : COMPLIANCE_MODULE_LABELS[module];

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Compliance Forms"
        subtitle={
          isHr
            ? `Format Master → Site Configuration → Generate → History for ${COMPLIANCE_HR_SUB_LABELS[hrSub]} sites from Site Attendance.`
            : "Forms under the wage code, social security code, and occupational safety code."
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segment
            ariaLabel="Compliance module"
            value={module}
            onChange={setModule}
            items={[
              { id: COMPLIANCE_MODULES.inHouse, label: COMPLIANCE_MODULE_LABELS[COMPLIANCE_MODULES.inHouse] },
              { id: COMPLIANCE_MODULES.hrSite, label: COMPLIANCE_MODULE_LABELS[COMPLIANCE_MODULES.hrSite] },
            ]}
          />
          {isHr ? (
            <Segment
              ariaLabel="HR site type"
              value={hrSub}
              onChange={setHrSub}
              items={[
                { id: COMPLIANCE_HR_SUBS.fire, label: COMPLIANCE_HR_SUB_LABELS[COMPLIANCE_HR_SUBS.fire] },
                { id: COMPLIANCE_HR_SUBS.safety, label: COMPLIANCE_HR_SUB_LABELS[COMPLIANCE_HR_SUBS.safety] },
              ]}
            />
          ) : null}
        </div>
      </PageTaskHeader>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={isHr ? "HR compliance process" : "Compliance codes"}>
          {workTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`-mb-px h-9 border-b-2 px-3 text-[12px] font-medium transition-colors ${
                tab === item.id ? "border-accent text-accent" : "border-transparent text-ink-secondary hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="pb-2 text-[11px] font-medium text-ink-muted">{contextLabel}</p>
      </div>

      {isHr && tab === "master" ? <ComplianceFormatMaster siteType={hrSub} siteIds={hrSiteIds} /> : null}
      {isHr && tab === "config" ? <ComplianceSiteConfig siteType={hrSub} /> : null}
      {isHr && tab === "gen" ? <ComplianceGenerate siteType={hrSub} /> : null}
      {isHr && tab === "hist" ? <ComplianceHistory siteType={hrSub} /> : null}

      {!isHr && tab === "wages" ? (
        <StatutoryCodePanel
          title="Code on Wage"
          subtitle="Enter Form 1, Form IV, and Form V on one record. Saved records stay in the table below."
          searchPlaceholder="Search establishment, employer, LIN…"
          modalTitle="Wage forms"
          forms={WAGE_FORM_LIST}
          listPacks={listWagePacks}
          createPack={createWagePack}
          savePack={saveWagePack}
          deletePack={deleteWagePack}
          exportExcel={exportWagePackExcel}
          exportPdf={exportWagePackPdf}
        />
      ) : null}

      {!isHr && tab === "social" ? (
        <StatutoryCodePanel
          title="Code on Social security"
          subtitle="Nomination, fresh nomination, or modification of nomination."
          searchPlaceholder="Search establishment, employee…"
          modalTitle="Form I"
          forms={SS_FORM_LIST}
          listPacks={listSsPacks}
          createPack={createSsPack}
          savePack={saveSsPack}
          deletePack={deleteSsPack}
          exportExcel={exportWagePackExcel}
          exportPdf={exportWagePackPdf}
        />
      ) : null}

      {!isHr && tab === "osh" ? (
        <StatutoryCodePanel
          title="Code on OSH-WC"
          subtitle="Form 13 wages register, Form 14 muster roll, Form 17 adult workers, Form 18 identity card, Form 19 leave with wages, Form 20 leave card, and Form 27 experience certificate."
          searchPlaceholder="Search establishment, employer, worker, LIN…"
          modalTitle="OSH-WC forms"
          forms={OSH_FORM_LIST}
          listPacks={listOshPacks}
          createPack={createOshPack}
          savePack={saveOshPack}
          deletePack={deleteOshPack}
          exportExcel={exportWagePackExcel}
          exportPdf={exportWagePackPdf}
        />
      ) : null}
    </div>
  );
}
