import React from "react";
import { useSearchParams } from "react-router-dom";
import UserManagement from "../UserManagement";
import SiteEmployeeLoginsPanel from "./SiteEmployeeLoginsPanel";

const VIEWS = [
  { value: "ifspl", label: "IFSPL Employees" },
  { value: "site", label: "Site Employees" },
];

export default function UserManagementHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") === "site" ? "site" : "ifspl";

  const setView = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === "ifspl") params.delete("view");
    else params.set("view", next);
    setSearchParams(params, { replace: true });
  };

  return (
    <>
      <div className="px-4 sm:px-6 pt-4 sm:pt-5">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <span className="font-medium shrink-0">Users</span>
          <select
            value={view}
            onChange={(e) => setView(e.target.value)}
            className="h-10 border border-gray-300 rounded-lg px-3 text-sm bg-white font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {VIEWS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {view === "site" ? <SiteEmployeeLoginsPanel /> : <UserManagement />}
    </>
  );
}
