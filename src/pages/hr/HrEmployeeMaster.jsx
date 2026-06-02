import React from "react";
import { DenseTable } from "../adminOperations/components/AdminUi";

const HR_EMPLOYEE_MASTER_COLUMNS = [
  { key: "id", label: "id" },
  { key: "employee_id", label: "employee_id ↑" },
  { key: "employment_type", label: "employment_type" },
  { key: "employee_code", label: "employee_code" },
  { key: "timestamp", label: "timestamp" },
  { key: "full_name", label: "full_name" },
  { key: "gender", label: "gender" },
  { key: "date_of_joining", label: "date_of_joining" },
  { key: "designation", label: "designation" },
  { key: "department", label: "department" },
  { key: "location", label: "location" },
  { key: "date_of_birth", label: "date_of_birth" },
  { key: "date_of_anniversary", label: "date_of_anniversary" },
  { key: "blood_group", label: "blood_group" },
  { key: "aadhar_no", label: "aadhar_no" },
  { key: "pan_card_no", label: "pan_card_no" },
  { key: "religion", label: "religion" },
  { key: "father_name", label: "father_name" },
  { key: "mother_name", label: "mother_name" },
  { key: "spouse_name", label: "spouse_name" },
  { key: "son_details", label: "son_details" },
  { key: "daughter_details", label: "daughter_details" },
  { key: "address", label: "address" },
  { key: "full_address", label: "full_address" },
  { key: "personal_no", label: "personal_no" },
  { key: "emergency_no", label: "emergency_no" },
  { key: "identification_mark", label: "identification_mark" },
  { key: "educational_qualification", label: "educational_qualification" },
  { key: "other_experience", label: "other_experience" },
  { key: "ifspl_experience", label: "ifspl_experience" },
  { key: "years_of_experience", label: "years_of_experience" },
  { key: "date_of_leaving", label: "date_of_leaving" },
  { key: "status", label: "status" },
  {
    key: "actions",
    label: "actions",
    render: () => (
      <span className="inline-flex gap-1 text-[10px] text-gray-400">
        <span className="px-1.5 py-0.5 rounded border border-gray-200">Edit</span>
        <span className="px-1.5 py-0.5 rounded border border-gray-200">View</span>
      </span>
    ),
  },
];

/** HR module employee master — table shell only; no database connection yet. */
export default function HrEmployeeMaster() {
  return (
    <div className="flex flex-col gap-3 min-h-[420px] h-[calc(100vh-14rem)]">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Employee Master</h2>
          <p className="text-xs text-gray-500 mt-0.5">HR employee records — database not connected yet.</p>
        </div>
        <button
          type="button"
          disabled
          className="h-9 px-3 rounded-lg bg-[#1F3A8A]/50 text-white text-xs font-medium cursor-not-allowed"
          title="Available when HR database is connected"
        >
          Add employee
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <DenseTable columns={HR_EMPLOYEE_MASTER_COLUMNS} rows={[]} rowKey="id" />
      </div>
    </div>
  );
}
