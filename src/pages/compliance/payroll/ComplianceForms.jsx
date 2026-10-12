import React from "react";
import { useSearchParams } from "react-router-dom";
import { PageTaskHeader } from "../../adminOperations/components/AdminUi";
import StatutoryCodePanel from "./StatutoryCodePanel";
import { exportWagePackExcel, exportWagePackPdf } from "./wageFormExport";
import { WAGE_FORM_LIST, createWagePack, deleteWagePack, listWagePacks, saveWagePack } from "./wageFormCatalog";
import { OSH_FORM_LIST, createOshPack, deleteOshPack, listOshPacks, saveOshPack } from "./oshFormCatalog";
import { SS_FORM_LIST, createSsPack, deleteSsPack, listSsPacks, saveSsPack } from "./ssFormCatalog";

export const COMPLIANCE_FORM_TABS = [
  { id: "wages", label: "Code on Wage" },
  { id: "social", label: "Code on Social security" },
  { id: "osh", label: "Code on OSH-WC" },
];

export default function ComplianceForms() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = COMPLIANCE_FORM_TABS.some((item) => item.id === requested) ? requested : COMPLIANCE_FORM_TABS[0].id;
  const setTab = (id) => setParams({ tab: id }, { replace: true });

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Compliance Forms"
        subtitle="Forms under the wage code, social security code, and occupational safety code."
      />

      <div className="flex flex-wrap gap-1 border-b border-divider" role="tablist" aria-label="Compliance codes">
        {COMPLIANCE_FORM_TABS.map((item) => (
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

      {tab === "wages" ? (
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

      {tab === "social" ? (
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

      {tab === "osh" ? (
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
