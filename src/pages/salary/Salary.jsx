import React, { useState } from "react";
import { Calculator, FileSpreadsheet, Table2 } from "lucide-react";

const SALARY_TABS = [
  { key: "formula", label: "Salary Formula", icon: Calculator },
  { key: "entry", label: "Salary Entry", icon: FileSpreadsheet },
  { key: "processSheet", label: "Salary Process Sheet", icon: Table2 },
];

function TabPlaceholder({ title, description }) {
  return (
    <div className="text-center py-12">
      <h4 className="text-lg font-semibold text-slate-900 mb-2">{title}</h4>
      <p className="text-sm text-slate-500 max-w-lg mx-auto">{description}</p>
    </div>
  );
}

const Salary = () => {
  const [activeTab, setActiveTab] = useState("formula");

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-4">
        <h2 className="text-2xl font-semibold text-slate-900">Salary</h2>
        <p className="text-sm text-slate-500 mt-1">
          Configure formulas, enter monthly salary data, and generate the process sheet.
        </p>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 flex flex-wrap gap-2">
          {SALARY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-slate-500"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 sm:p-6">
          {activeTab === "formula" && (
            <TabPlaceholder
              title="Salary Formula"
              description="Define salary components, percentages, and calculation rules. This section will be wired to your payroll formula setup."
            />
          )}

          {activeTab === "entry" && (
            <TabPlaceholder
              title="Salary Entry"
              description="Enter or import salary figures per employee or role for the selected period. Attendance and allowance inputs will feed this sheet."
            />
          )}

          {activeTab === "processSheet" && (
            <TabPlaceholder
              title="Salary Process Sheet"
              description="Review the consolidated salary process sheet before payroll approval. Totals and exports will appear here."
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Salary;
