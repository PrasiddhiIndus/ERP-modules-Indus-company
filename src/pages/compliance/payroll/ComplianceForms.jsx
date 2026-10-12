import React, { useState } from "react";
import { PageTaskHeader } from "../../adminOperations/components/AdminUi";
import StatutoryCodePanel from "./StatutoryCodePanel";
import { exportWagePackExcel, exportWagePackPdf } from "./wageFormExport";
import { WAGE_FORM_LIST, createWagePack, deleteWagePack, listWagePacks, saveWagePack } from "./wageFormCatalog";
import { OSH_FORM_LIST, createOshPack, deleteOshPack, listOshPacks, saveOshPack } from "./oshFormCatalog";
import { SS_FORM_LIST, createSsPack, deleteSsPack, listSsPacks, saveSsPack } from "./ssFormCatalog";

const TABS = [
  { id: "wages", label: "Code on Wage" },
  { id: "social", label: "Code on Social security" },
  { id: "osh", label: "Code on OSH-WC" },
];

export default function ComplianceForms() {
  const [tab, setTab] = useState(TABS[0].id);

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Compliance Forms"
        subtitle="Forms under the wage code, social security code, and occupational safety code."
      />

      <div className="flex flex-wrap gap-1 border-b border-divider" role="tablist" aria-label="Compliance codes">
        {TABS.map((item) => (
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
          subtitle="Enter Form 1, Form 2, and Form 3 on one record. Saved records stay in the table below."
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
          subtitle="Form 13 wages register, muster roll, adult workers, identity cards, leave with wages, leave card, and the contract-labour experience certificate."
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
