import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Clock,
  LayoutDashboard,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { PageTaskHeader, SectionCard } from "../adminOperations/components/AdminUi";

const HR_MODULES = [
  {
    to: "/app/hr/employee-master",
    label: "HR Management",
    hint: "Employee master and monthly salary inputs",
    icon: Users,
    accent: "text-red-600 bg-red-50",
  },
  {
    to: "/app/attendance",
    label: "Attendance",
    hint: "Day-wise register, filters, and attendance dashboard",
    icon: Clock,
    accent: "text-amber-700 bg-amber-50",
  },
  {
    to: "/app/hr/payroll/salary/dashboard",
    label: "Salary Management",
    hint: "Payroll sites, packages, compliance, and payslips",
    icon: Wallet,
    accent: "text-emerald-700 bg-emerald-50",
  },
  {
    to: "/app/people-management",
    label: "People Management",
    hint: "People records and organisational assignments",
    icon: UserPlus,
    accent: "text-pink-700 bg-pink-50",
  },
];

export default function HrDashboard() {
  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto w-full flex flex-col gap-4">
      <PageTaskHeader
        title="HR Dashboard"
        subtitle="Overview of the HR module — open attendance, people, or salary from here."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {HR_MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.to}
              to={mod.to}
              className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-[#1F3A8A]/30 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-[#1F3A8A]">
                    {mod.label}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500 leading-snug">{mod.hint}</p>
                </div>
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${mod.accent}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-[#1F3A8A]">
                Open <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>

      <SectionCard title="Quick focus">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-100 bg-slate-50/80 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900">
              <LayoutDashboard className="h-4 w-4 text-[#1F3A8A]" />
              Start of day
            </div>
            <p className="mt-1 text-[11px] text-gray-600">
              Check the attendance dashboard for today&apos;s present, leave, and week-off totals.
            </p>
            <Link
              to="/app/attendance"
              className="mt-2 inline-block text-[11px] font-medium text-[#1F3A8A] hover:underline"
            >
              Go to Attendance →
            </Link>
          </div>
          <div className="rounded-lg border border-gray-100 bg-slate-50/80 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900">
              <UserCheck className="h-4 w-4 text-emerald-700" />
              Payroll cycle
            </div>
            <p className="mt-1 text-[11px] text-gray-600">
              Review salary dashboard after attendance for the cycle is locked.
            </p>
            <Link
              to="/app/hr/payroll/salary/dashboard"
              className="mt-2 inline-block text-[11px] font-medium text-[#1F3A8A] hover:underline"
            >
              Go to Salary →
            </Link>
          </div>
          <div className="rounded-lg border border-gray-100 bg-slate-50/80 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900">
              <Users className="h-4 w-4 text-red-600" />
              Master data
            </div>
            <p className="mt-1 text-[11px] text-gray-600">
              Keep employee master current so attendance and payroll stay aligned.
            </p>
            <Link
              to="/app/hr/employee-master"
              className="mt-2 inline-block text-[11px] font-medium text-[#1F3A8A] hover:underline"
            >
              Go to HR Management →
            </Link>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
