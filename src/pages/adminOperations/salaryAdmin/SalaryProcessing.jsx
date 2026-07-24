import React from "react";
import { PageTaskHeader, SectionCard, CollapsibleHelp } from "../components/AdminUi";

/**
 * Salary Processing — run and review payroll salary cycles.
 * Admin module only (`admin` access).
 */
export default function SalaryProcessing() {
  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Salary Processing"
        subtitle="Run salary cycles, review calculations, and finalize payroll for the period."
      />

      <CollapsibleHelp>
        Select a pay period and process salaries after masters and inputs are ready on Salary Master.
      </CollapsibleHelp>

      <SectionCard title="Processing runs">
        <p className="text-sm text-gray-600">
          Salary processing runs will appear here. Start a new cycle when attendance and salary inputs are complete.
        </p>
      </SectionCard>
    </div>
  );
}
