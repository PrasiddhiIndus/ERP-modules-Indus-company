import React, { useState } from "react";
import {
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  Badge,
  Drawer,
  Modal,
  StatusChip,
  LinkedChip,
  Timeline,
} from "../components/AdminUi";
import {
  mockEmployees,
  mockOnboarding,
  mockLeaveRequests,
  mockPermissions,
  mockComplianceRows,
  mockSalaryInputs,
  mockExits,
} from "../data/mockAdminData";

const tabs = ["Personal", "Employment", "Salary", "Compliance", "Documents", "Leave", "Attendance", "Exit status"];

export function EmployeeMasterPage() {
  const [drawer, setDrawer] = useState(null);
  const [tab, setTab] = useState("Personal");
  const [modal, setModal] = useState(false);

  const cols = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "company", label: "Company" },
    { key: "department", label: "Department" },
    { key: "designation", label: "Designation" },
    { key: "manager", label: "Manager" },
    { key: "joiningDate", label: "Joining" },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusChip label={r.status} severity={r.status.includes("Exit") ? "high" : "info"} />,
    },
    { key: "salaryBand", label: "Salary (summary)" },
    {
      key: "compliance",
      label: "Compliance",
      render: (r) => <span className={r.compliance.includes("Gap") ? "text-amber-700 font-medium" : ""}>{r.compliance}</span>,
    },
  ];

  return (
    <>
      <SectionCard
        title="Employee Master — IFSPL / IEVPL in-house"
        right={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setModal(true)} className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium">
              Add employee
            </button>
            <button type="button" className="h-8 px-3 rounded-lg border border-gray-300 text-xs">
              Export
            </button>
          </div>
        }
      >
        <FilterBar>
          <TinyInput placeholder="Search code / name" className="min-w-[180px]" />
          <TinySelect className="min-w-[100px]">
            <option>All companies</option>
            <option>IFSPL</option>
            <option>IEVPL</option>
          </TinySelect>
          <TinySelect className="min-w-[120px]">
            <option>All departments</option>
            <option>Admin</option>
            <option>Fire Ops</option>
          </TinySelect>
          <TinySelect className="min-w-[110px]">
            <option>All status</option>
            <option>Active</option>
            <option>Probation</option>
            <option>Notice</option>
          </TinySelect>
        </FilterBar>
        <div className="mt-3">
          <DenseTable columns={cols} rows={mockEmployees} onRowClick={setDrawer} />
        </div>
      </SectionCard>

      <Drawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title={drawer ? `${drawer.name} · ${drawer.code}` : ""}
        widthClass="max-w-xl"
      >
        {drawer && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1">
              {tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-2 py-1 rounded text-[11px] border ${
                    tab === t ? "bg-blue-50 border-blue-200 text-blue-900" : "border-gray-200 text-gray-600"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="text-xs space-y-2 text-gray-700">
              {tab === "Personal" && (
                <>
                  <p>
                    <span className="text-gray-500">Contact:</span> {drawer.phone} · {drawer.email}
                  </p>
                  <p>
                    <span className="text-gray-500">Address:</span> On file — verify Aadhaar seed address
                  </p>
                </>
              )}
              {tab === "Employment" && (
                <>
                  <p>Company: {drawer.company}</p>
                  <p>Department / designation: {drawer.department} · {drawer.designation}</p>
                  <p>Reporting: {drawer.manager}</p>
                  <LinkedChip label="Onboarding file" toHint="Onboarding" />
                </>
              )}
              {tab === "Salary" && <p>Structure: {drawer.salaryBand} — full breakdown in payroll core (export-ready view in Salary Inputs).</p>}
              {tab === "Compliance" && <p>{drawer.compliance} — open Compliance & Documents for checklist.</p>}
              {tab === "Documents" && (
                <ul className="list-disc pl-4 space-y-1">
                  <li>Offer + appointment</li>
                  <li>ID proofs</li>
                  <li>Bank + statutory</li>
                </ul>
              )}
              {tab === "Leave" && <LinkedChip label="Open leave workflow" toHint="Leaves" />}
              {tab === "Attendance" && <LinkedChip label="Corrections / inputs" toHint="Attendance Inputs" />}
              {tab === "Exit status" && <LinkedChip label="Exit & F&F" toHint="linked clearance" />}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase mb-2">Document checklist</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {["Aadhaar", "PAN", "Bank", "PF", "Medical", "NDA"].map((d) => (
                  <label key={d} className="flex items-center gap-2 border rounded px-2 py-1">
                    <input type="checkbox" defaultChecked={d !== "Medical"} />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <button type="button" className="text-xs text-blue-700 font-medium">
              Status history (audit)
            </button>
          </div>
        )}
      </Drawer>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Add employee (draft)"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="h-8 px-3 rounded border text-xs" onClick={() => setModal(false)}>
              Cancel
            </button>
            <button type="button" className="h-8 px-3 rounded bg-[#1F3A8A] text-white text-xs">
              Save draft
            </button>
          </div>
        }
      >
        <div className="space-y-2 text-xs">
          <TinyInput placeholder="Full name" className="w-full" />
          <TinySelect className="w-full">
            <option>IFSPL</option>
            <option>IEVPL</option>
          </TinySelect>
          <TinyInput placeholder="Department" className="w-full" />
          <p className="text-gray-500">Code generation, appointment, and compliance tasks route to Onboarding after save.</p>
        </div>
      </Modal>
    </>
  );
}

export function EmployeeOnboardingPage() {
  const cols = [
    { key: "name", label: "Joiner" },
    { key: "company", label: "Co." },
    { key: "stage", label: "Stage" },
    { key: "pct", label: "%", render: (r) => `${r.pct}%` },
    { key: "pending", label: "Pending" },
    {
      key: "activation",
      label: "Activation",
      render: (r) => <StatusChip label={r.activation ? "Live" : "Hold"} severity={r.activation ? "info" : "warning"} />,
    },
  ];
  return (
    <SectionCard title="Onboarding workflow" right={<Badge tone="bg-blue-50 text-blue-800">Stage-gated</Badge>}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3 text-xs">
        {["Create", "Documents", "Code & appointment", "Salary & compliance", "Induction", "Activation"].map((s, i) => (
          <div key={s} className={`rounded-lg border px-2 py-2 ${i < 3 ? "bg-emerald-50 border-emerald-100" : "bg-white border-gray-200"}`}>
            <p className="font-semibold text-gray-800">{s}</p>
            <p className="text-[11px] text-gray-500">Checklist + owner</p>
          </div>
        ))}
      </div>
      <DenseTable columns={cols} rows={mockOnboarding} />
      <p className="text-[11px] text-gray-500 mt-2">Ties to Employee Master, Compliance, and Salary Inputs when activation flips on.</p>
    </SectionCard>
  );
}

export function EmployeeAttendanceInputsPage() {
  return (
    <SectionCard title="Attendance inputs & corrections (admin)" right={<StatusChip label="Payroll impact" severity="warning" />}>
      <FilterBar>
        <TinyInput type="date" className="w-[130px]" />
        <TinySelect>
          <option>All sites</option>
        </TinySelect>
        <TinyInput placeholder="Employee search" className="min-w-[160px]" />
        <button type="button" className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs">
          Bulk correction
        </button>
      </FilterBar>
      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <DenseTable
            columns={[
              { key: "emp", label: "Employee" },
              { key: "shift", label: "Shift" },
              { key: "in", label: "In" },
              { key: "out", label: "Out" },
              { key: "status", label: "Status" },
              { key: "flag", label: "Approval" },
            ]}
            rows={[
              { id: "1", emp: "Amit Verma", shift: "General", in: "09:12", out: "18:04", status: "Present", flag: "—" },
              { id: "2", emp: "Ravi Nair", shift: "General", in: "10:40", out: "18:00", status: "Late", flag: "Mgr pending" },
            ]}
          />
        </div>
        <SectionCard title="Timeline (sample)" className="!shadow-none">
          <Timeline
            items={[
              { title: "Correction requested", meta: "Admin · 09:10" },
              { title: "Manager approved", meta: "Pending" },
              { title: "Posted to attendance", meta: "Will reflect in Salary Inputs" },
            ]}
          />
        </SectionCard>
      </div>
    </SectionCard>
  );
}

export function EmployeeLeavesPage() {
  const [approve, setApprove] = useState(null);
  const cols = [
    { key: "emp", label: "Requested by" },
    { key: "type", label: "Type" },
    { key: "from", label: "From" },
    { key: "to", label: "To" },
    { key: "mgr", label: "Manager" },
    { key: "admin", label: "Admin" },
    { key: "attendanceImpact", label: "Attendance" },
    {
      key: "payrollImpact",
      label: "Payroll",
      render: (r) => (r.payrollImpact ? <Badge tone="bg-orange-100 text-orange-900">{r.payrollImpact}</Badge> : "—"),
    },
    {
      key: "id",
      label: "",
      render: (r) => (
        <button type="button" className="text-[11px] text-blue-700 font-medium" onClick={() => setApprove(r)}>
          Validate
        </button>
      ),
    },
  ];
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        <SectionCard title="Leave inbox" className="xl:col-span-3">
          <FilterBar>
            <TinySelect>
              <option>All types</option>
              <option>Casual</option>
              <option>Sick</option>
              <option>Earned</option>
              <option>Unpaid</option>
            </TinySelect>
            <TinySelect>
              <option>Admin queue</option>
              <option>All</option>
            </TinySelect>
          </FilterBar>
          <div className="mt-2">
            <DenseTable columns={cols} rows={mockLeaveRequests} rowKey="id" />
          </div>
        </SectionCard>
        <div className="space-y-3">
          <SectionCard title="Balances (sample)">
            <DenseTable
              columns={[
                { key: "t", label: "Type" },
                { key: "b", label: "Bal" },
              ]}
              rows={[
                { id: "1", t: "Casual", b: "6" },
                { id: "2", t: "Sick", b: "8" },
                { id: "3", t: "Earned", b: "14" },
              ]}
            />
          </SectionCard>
          <SectionCard title="Calendar">
            <p className="text-xs text-gray-600">Month grid hooks to site holidays + blackout days (UI placeholder).</p>
          </SectionCard>
        </div>
      </div>
      <Modal
        open={!!approve}
        onClose={() => setApprove(null)}
        title="Admin validation — leave"
        footer={
          <div className="flex justify-between gap-2 flex-wrap">
            <span className="text-[11px] text-gray-500">Impacts attendance → salary inputs if unpaid/LOP</span>
            <div className="flex gap-2">
              <button type="button" className="h-8 px-3 rounded border text-xs" onClick={() => setApprove(null)}>
                Reject
              </button>
              <button type="button" className="h-8 px-3 rounded bg-[#1F3A8A] text-white text-xs" onClick={() => setApprove(null)}>
                Validate & post
              </button>
            </div>
          </div>
        }
      >
        {approve && (
          <div className="text-xs space-y-2">
            <p>
              <strong>{approve.emp}</strong> · {approve.type} · {approve.from} → {approve.to}
            </p>
            <LinkedChip label="Attendance impact" toHint="marked absent / LOP" />
            <LinkedChip label="Payroll" toHint={approve.payrollImpact || "No LOP"} />
          </div>
        )}
      </Modal>
    </>
  );
}

export function EmployeePermissionsPage() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SectionCard title="Pending today" className="!p-3">
          <p className="text-2xl font-bold">5</p>
        </SectionCard>
        <SectionCard title="Currently out" className="!p-3">
          <p className="text-2xl font-bold">6</p>
        </SectionCard>
        <SectionCard title="Over-duration" className="!p-3">
          <p className="text-2xl font-bold text-amber-700">2</p>
        </SectionCard>
        <SectionCard title="Hours impact (est.)" className="!p-3">
          <p className="text-2xl font-bold">11.5h</p>
        </SectionCard>
      </div>
      <SectionCard title="Permission / short leave" right={<button className="text-xs text-blue-700 font-medium">New request</button>}>
        <DenseTable
          columns={[
            { key: "date", label: "Date" },
            { key: "emp", label: "Employee" },
            { key: "kind", label: "Kind" },
            { key: "hrs", label: "Hours" },
            { key: "mgr", label: "Manager" },
            { key: "admin", label: "Admin" },
          ]}
          rows={mockPermissions}
          rowKey="id"
        />
      </SectionCard>
    </div>
  );
}

export function EmployeeCompliancePage() {
  return (
    <SectionCard title="Compliance & documents" right={<button className="h-8 px-2 rounded border text-xs">Missing docs filter</button>}>
      <FilterBar>
        <TinySelect>
          <option>All completeness</option>
          <option>Missing any</option>
          <option>Expiring soon</option>
        </TinySelect>
        <TinyInput placeholder="Employee" className="min-w-[140px]" />
      </FilterBar>
      <div className="mt-2">
        <DenseTable
          columns={[
            { key: "emp", label: "Employee" },
            ...["aadhaar", "pan", "bank", "pf", "esic", "uan", "nominee"].map((k) => ({
              key: k,
              label: k.toUpperCase(),
              render: (r) => {
                const v = r[k];
                const sev = v === "OK" || v === "NA" ? "info" : "warning";
                return <StatusChip label={v} severity={sev} />;
              },
            })),
          ]}
          rows={mockComplianceRows}
          rowKey="id"
        />
      </div>
      <p className="text-[11px] text-gray-500 mt-2">Expiry / reupload alerts surface in Alerts & Notifications.</p>
    </SectionCard>
  );
}

export function EmployeeSalaryInputsPage() {
  return (
    <SectionCard title="Salary inputs (admin layer)" right={<Badge tone="bg-gray-100 text-gray-700">Export-ready</Badge>}>
      <FilterBar>
        <TinyInput type="month" className="w-[140px]" defaultValue="2025-03" />
        <TinySelect>
          <option>All employees</option>
        </TinySelect>
        <button type="button" className="h-8 px-3 rounded border text-xs">
          Pull from attendance
        </button>
      </FilterBar>
      <div className="mt-2">
        <DenseTable
          columns={[
            { key: "emp", label: "Employee" },
            { key: "month", label: "Month" },
            { key: "unpaidLeave", label: "UL days" },
            { key: "corrections", label: "Corr." },
            { key: "deductions", label: "Deductions" },
            { key: "advanceRec", label: "Adv. rec." },
            { key: "remarks", label: "Remarks" },
          ]}
          rows={mockSalaryInputs}
          rowKey="id"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <LinkedChip label="Attendance corrections" toHint="Attendance Inputs" />
        <LinkedChip label="Leave / LOP" toHint="Leaves" />
      </div>
    </SectionCard>
  );
}

export function EmployeeExitPage() {
  return (
    <SectionCard title="Exit & full & final" right={<StatusChip label="Cross-module" severity="high" />}>
      <div className="flex flex-wrap gap-1 mb-3">
        {["Resignation", "Clearance", "Asset recovery", "Compliance closure", "F&F inputs"].map((t) => (
          <button key={t} type="button" className="px-2 py-1 rounded border border-gray-200 text-[11px] bg-white hover:bg-gray-50">
            {t}
          </button>
        ))}
      </div>
      <DenseTable
        columns={[
          { key: "emp", label: "Employee" },
          { key: "resignDate", label: "Resignation" },
          { key: "notice", label: "Notice" },
          { key: "lwd", label: "LWD" },
          { key: "clearance", label: "Clearance" },
          { key: "gate", label: "Gate / access" },
          { key: "fnf", label: "F&F" },
        ]}
        rows={mockExits}
        rowKey="id"
      />
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-gray-200 p-2 bg-gray-50/80">
          <p className="font-semibold text-gray-800 mb-1">Linked actions</p>
          <ul className="space-y-1 list-disc pl-4 text-gray-700">
            <li>Store recovery — Return Entry / issue reference</li>
            <li>Gate access closure — Employee Movement / Security</li>
            <li>Attendance freeze — Attendance Inputs</li>
            <li>Salary finalization — Salary Inputs</li>
          </ul>
        </div>
        <div className="rounded-lg border border-amber-200 p-2 bg-amber-50/50">
          <p className="font-semibold text-amber-900 mb-1">Blocking reasons (sample)</p>
          <p>PPE set not returned — linked to store issue #IS-8821</p>
        </div>
      </div>
    </SectionCard>
  );
}
