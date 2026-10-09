import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Modal } from "../../../../adminOperations/components/AdminUi";
import { toast } from "../../../../../lib/toast";
import { salaryAppPath } from "../salaryNav";
import { useSalaryModule } from "./SalaryModuleContext";
import {
  MONTHS,
  PAYSLIP_COMPANY,
  calcEmployee,
  componentFormula,
  formatInr,
  monthLabel,
  siteName,
  siteTotals,
} from "./model";
import {
  AmountBars,
  Card,
  DataTable,
  Field,
  Kpi,
  PageHead,
  Tag,
  Td,
  Th,
  btnGhost,
  btnPrimary,
  btnSmall,
  fieldClass,
  selectClass,
} from "./chrome";

const FLOW = [
  ["1", "Salary Components", "components"],
  ["2", "Site Setup", "sites"],
  ["3", "Employees", "employees"],
  ["4", "Process & Disburse", "process"],
  ["5", "Salary Slip", "slips"],
  ["6", "Report", "reports"],
];

function typeLabel(type) {
  return type === "E" ? "Earning" : "Deduction";
}

function notify(error, success) {
  if (error) toast.warning(error);
  else if (success) toast.success(success);
  return !error;
}

export function DashboardPage() {
  const { state, month } = useSalaryModule();
  const rows = state.sites.map((site) => ({ site, ...siteTotals(state, month, site.id) }));
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const pending = rows.filter((row) => !row.paid).length;
  const warnings = state.emps.filter((employee) => employee.warns.length).length;

  return (
    <div className="space-y-4">
      <PageHead title="Dashboard" subtitle={`Payroll overview for ${monthLabel(month)}`} month />
      <Card title="Salary process flow">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          {FLOW.map(([step, label, to]) => (
            <Link
              key={to}
              to={salaryAppPath(to)}
              className="rounded-control border border-border bg-surface px-3 py-2.5 text-left shadow-card transition-colors hover:border-accent-border hover:bg-accent-soft"
            >
              <span className="text-xs font-bold text-accent">{step}</span>
              <span className="mt-1 block text-xs font-medium text-ink">{label}</span>
            </Link>
          ))}
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Employees" value={state.emps.length} />
        <Kpi label="Gross payable" value={formatInr(sum("gross"))} />
        <Kpi label="Net payable" value={formatInr(sum("net"))} />
        <Kpi label="OT amount" value={formatInr(sum("ot"))} />
        <Kpi label="Deductions" value={formatInr(sum("ded"))} />
        <Kpi label="Sites pending" value={`${pending} of ${rows.length}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Site-wise status">
          <DataTable>
            <thead>
              <tr>
                <Th>Site</Th>
                <Th align="right">Staff</Th>
                <Th align="right">Net</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.site.id}>
                  <Td>{row.site.name}</Td>
                  <Td align="right">{row.n}</Td>
                  <Td align="right">{formatInr(row.net)}</Td>
                  <Td>{row.paid ? <Tag tone="ok">Disbursed</Tag> : <Tag tone="warn">Pending</Tag>}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
        <Card title="Needs attention">
          <div className="space-y-2 text-xs leading-6 text-ink-secondary">
            <p>{pending} site(s) not yet disbursed for {monthLabel(month)}.</p>
            <p>{warnings} employee(s) have warning letters. Fines are deducted where the site uses the Fine component.</p>
            <p>Attendance is read for every active employee before payroll is processed.</p>
            <p>Payroll is locked once a site is disbursed.</p>
          </div>
        </Card>
      </div>
      <Card title={`OT amount by site – ${monthLabel(month)}`}>
        <AmountBars
          rows={rows.map((row) => ({
            label: row.site.name.split(" ")[0],
            value: row.ot,
            display: formatInr(row.ot),
          }))}
        />
      </Card>
    </div>
  );
}

export function ComponentsPage() {
  const module = useSalaryModule();
  const { state, compScope, setCompScope } = module;
  const siteMode = compScope !== "master";
  const config = siteMode ? state.cfg[compScope] : null;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", type: "E", formula: "" });

  const saveComponent = () => {
    const error = module.addComponent(form);
    if (notify(error, "Component saved")) setOpen(false);
  };

  return (
    <div className="space-y-4">
      <PageHead
        title="Salary Components"
        subtitle="Edit component names and formulas for the main list, or for one site only."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-ink">Editing</span>
          <select className={selectClass} value={compScope} onChange={(event) => setCompScope(event.target.value)}>
            <option value="master">Main list – applies to all sites</option>
            {state.sites.map((site) => (
              <option key={site.id} value={site.id}>Only {site.name}</option>
            ))}
          </select>
          <button
            type="button"
            className={`${btnPrimary} ml-auto`}
            onClick={() => {
              setForm({ code: "", name: "", type: "E", formula: "" });
              setOpen(true);
            }}
          >
            + Add component
          </button>
        </div>
      </Card>
      <Card>
        <p className="mb-3 text-xs text-ink-secondary">
          {siteMode
            ? `Changes below apply only to ${siteName(state, compScope)}. The main list and other sites stay unchanged. Enable or disable optional components in Site Setup.`
            : "Changes below update the main list and flow to every site that has no site-specific name or formula. Sites with their own override keep it."}
        </p>
        <DataTable>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>{siteMode ? "Name at this site" : "Main name"}</Th>
              <Th>Type</Th>
              <Th>{siteMode ? "Formula at this site" : "Main formula"}</Th>
              <Th>Applicability</Th>
              <Th>{siteMode ? "" : "Overrides"}</Th>
            </tr>
          </thead>
          <tbody>
            {state.comps.map((component) => {
              const enabled = !siteMode || component.fx || config.inc.includes(component.c);
              const siteNameOverride = siteMode ? config.names[component.c] : "";
              const siteFormula = siteMode ? config.fm[component.c] : "";
              const overrideCount = siteMode
                ? 0
                : state.sites.filter((site) => state.cfg[site.id].names[component.c] || state.cfg[site.id].fm[component.c]).length;
              return (
                <tr key={component.c} className={enabled ? "" : "opacity-50"}>
                  <Td className="font-medium">{component.c}</Td>
                  <Td>
                    <div className="flex min-w-[180px] flex-wrap items-center gap-2">
                      <input
                        className={fieldClass}
                        defaultValue={siteMode ? siteNameOverride || "" : component.n}
                        placeholder={component.n}
                        disabled={!enabled}
                        key={`${compScope}-${component.c}-name-${siteNameOverride || component.n}`}
                        onBlur={(event) => {
                          const next = event.target.value.trim();
                          const previous = siteMode ? siteNameOverride || "" : component.n;
                          if (next === previous) return;
                          if (siteMode) module.setSiteName(compScope, component.c, next);
                          else notify(module.renameMain(component.c, next), "Main name updated");
                        }}
                      />
                      {siteNameOverride ? <Tag tone="warn">site only</Tag> : null}
                    </div>
                  </Td>
                  <Td>{typeLabel(component.t)}</Td>
                  <Td>
                    <div className="flex min-w-[220px] flex-wrap items-center gap-2">
                      <input
                        className={`${fieldClass} font-mono`}
                        defaultValue={siteMode ? siteFormula || component.f : component.f}
                        disabled={!enabled}
                        key={`${compScope}-${component.c}-formula-${siteFormula || component.f}`}
                        onBlur={(event) => {
                          const next = event.target.value.trim();
                          const previous = siteMode ? siteFormula || component.f : component.f;
                          if (next === previous) return;
                          const error = siteMode
                            ? module.setSiteFormula(compScope, component.c, next)
                            : module.setMainFormula(component.c, next);
                          notify(error, siteMode ? "Site formula saved" : "Main formula updated for sites without an override");
                        }}
                      />
                      {siteFormula ? <Tag tone="warn">override</Tag> : null}
                    </div>
                  </Td>
                  <Td>
                    {component.fx ? <Tag tone="accent">Fixed – all sites</Tag> : <Tag>Optional</Tag>}
                    {!enabled ? <span className="ml-2 text-[11px] text-ink-muted">not enabled at this site</span> : null}
                  </Td>
                  <Td>
                    {siteMode ? (
                      siteNameOverride || siteFormula ? (
                        <button type="button" className={`${btnGhost} ${btnSmall}`} onClick={() => module.resetSiteOverride(compScope, component.c)}>
                          Reset to main
                        </button>
                      ) : "—"
                    ) : overrideCount ? (
                      <Tag tone="warn">{overrideCount} site(s) override</Tag>
                    ) : "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        <p className="mt-3 text-[11px] text-ink-secondary">
          Variables: RATE (monthly basic), PAYDAYS (present + paid leave + week-offs), OTHRS, NIGHTS, FINES, GROSS and any earlier component code.
        </p>
      </Card>
      <Modal
        open={open}
        title="New component"
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className={btnPrimary} onClick={saveComponent}>Save</button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Code">
            <input className={fieldClass} value={form.code} placeholder="e.g. TRAIN" onChange={(event) => setForm({ ...form, code: event.target.value })} />
          </Field>
          <Field label="Default name">
            <input className={fieldClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Type">
            <select className={selectClass} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              <option value="E">Earning</option>
              <option value="D">Deduction</option>
            </select>
          </Field>
          <Field label="Master formula">
            <input className={`${fieldClass} font-mono`} value={form.formula} onChange={(event) => setForm({ ...form, formula: event.target.value })} />
          </Field>
          <p className="text-[11px] text-ink-secondary">New components are optional. Enable them per site in Site Setup.</p>
        </div>
      </Modal>
    </div>
  );
}

export function SiteSetupPage() {
  const module = useSalaryModule();
  const { state, siteId, setSiteId } = module;
  const site = state.sites.find((item) => item.id === siteId) || state.sites[0];
  const config = state.cfg[site.id];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", client: "", loc: "" });
  const staff = state.emps.filter((employee) => employee.site === site.id).length;

  return (
    <div className="space-y-4">
      <PageHead
        title="Site Setup"
        subtitle="Choose the site, pick its components, and customise names and formulas for that site only."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-ink">Site</span>
          <select
            className={selectClass}
            value={site.id}
            onChange={(event) => setSiteId(event.target.value)}
          >
            {state.sites.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              setForm({ name: "", client: "", loc: "" });
              setOpen(true);
            }}
          >
            + New site entry
          </button>
        </div>
      </Card>
      <Card title={site.name}>
        <p className="text-xs text-ink-secondary">
          Client: {site.client || "—"} · Location: {site.loc || "—"} · {staff} employees
        </p>
      </Card>
      <Card title="Components for this site">
        <DataTable>
          <thead>
            <tr>
              <Th>Use</Th>
              <Th>Master name</Th>
              <Th>Name at this site</Th>
              <Th>Formula at this site</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {state.comps.map((component) => {
              const enabled = Boolean(component.fx || config.inc.includes(component.c));
              const nameOverride = config.names[component.c];
              const formulaOverride = config.fm[component.c];
              return (
                <tr key={component.c} className={enabled ? "" : "opacity-50"}>
                  <Td>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={Boolean(component.fx)}
                        onChange={(event) => module.setIncluded(site.id, component.c, event.target.checked)}
                      />
                      {component.fx ? <Tag tone="accent">Fixed</Tag> : null}
                    </label>
                  </Td>
                  <Td>
                    <div className="font-medium">{component.n}</div>
                    <div className="text-[11px] text-ink-muted">{component.c} · {typeLabel(component.t)}</div>
                  </Td>
                  <Td>
                    <div className="flex min-w-[160px] items-center gap-2">
                      <input
                        className={fieldClass}
                        defaultValue={nameOverride || ""}
                        placeholder={component.n}
                        disabled={!enabled}
                        key={`${site.id}-${component.c}-n-${nameOverride || ""}`}
                        onBlur={(event) => module.setSiteName(site.id, component.c, event.target.value)}
                      />
                      {nameOverride ? <Tag tone="warn">site only</Tag> : null}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex min-w-[200px] items-center gap-2">
                      <input
                        className={`${fieldClass} font-mono`}
                        defaultValue={formulaOverride || component.f}
                        disabled={!enabled}
                        key={`${site.id}-${component.c}-f-${formulaOverride || component.f}`}
                        onBlur={(event) => {
                          const next = event.target.value.trim();
                          if (next === (formulaOverride || component.f)) return;
                          notify(module.setSiteFormula(site.id, component.c, next), "Site formula saved");
                        }}
                      />
                      {formulaOverride ? <Tag tone="warn">override</Tag> : null}
                    </div>
                  </Td>
                  <Td>
                    {formulaOverride || nameOverride ? (
                      <button type="button" className={`${btnGhost} ${btnSmall}`} onClick={() => module.resetSiteOverride(site.id, component.c)}>
                        Reset to master
                      </button>
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        <p className="mt-3 text-[11px] text-ink-secondary">
          Renames and formula changes here are saved for {site.name} only. The master list and other sites are never touched.
        </p>
      </Card>
      <Modal
        open={open}
        title="New site entry"
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setOpen(false)}>Cancel</button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                const error = module.addSite(form);
                if (notify(error, "Site created")) setOpen(false);
              }}
            >
              Create & select components
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Site name">
            <input className={fieldClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Client">
            <input className={fieldClass} value={form.client} onChange={(event) => setForm({ ...form, client: event.target.value })} />
          </Field>
          <Field label="Location">
            <input className={fieldClass} value={form.loc} onChange={(event) => setForm({ ...form, loc: event.target.value })} />
          </Field>
          <p className="text-[11px] text-ink-secondary">Fixed components are added automatically. You will pick optional components next.</p>
        </div>
      </Modal>
    </div>
  );
}

export function EmployeesPage() {
  const { state, month, siteFilter, setSiteFilter } = useSalaryModule();
  const navigate = useNavigate();
  const list = state.emps.filter((employee) => siteFilter === "all" || employee.site === siteFilter);

  return (
    <div className="space-y-4">
      <PageHead title="Employees" subtitle={`Attendance for ${monthLabel(month)}`} month />
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <FilterChip active={siteFilter === "all"} onClick={() => setSiteFilter("all")}>All sites</FilterChip>
          {state.sites.map((site) => (
            <FilterChip key={site.id} active={siteFilter === site.id} onClick={() => setSiteFilter(site.id)}>
              {site.name}
            </FilterChip>
          ))}
        </div>
        <DataTable>
          <thead>
            <tr>
              <Th>ID</Th>
              <Th>Name</Th>
              <Th>Site</Th>
              <Th>Role</Th>
              <Th align="right">Present</Th>
              <Th align="right">Leave</Th>
              <Th align="right">Absent</Th>
              <Th align="right">OT hrs</Th>
              <Th align="right">Net pay</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((employee) => {
              const pay = calcEmployee(state, employee, month);
              return (
                <tr
                  key={employee.id}
                  className="cursor-pointer hover:bg-surface-sunken"
                  onClick={() => navigate(salaryAppPath("employees", employee.id))}
                >
                  <Td>{employee.id}</Td>
                  <Td>
                    <span className="font-semibold">{employee.name}</span>
                    {employee.warns.length ? <span className="ml-2"><Tag tone="warn">Warning</Tag></span> : null}
                  </Td>
                  <Td>{siteName(state, employee.site)}</Td>
                  <Td>{employee.desig}</Td>
                  <Td align="right">{pay.a.pr}</Td>
                  <Td align="right">{pay.a.lv}</Td>
                  <Td align="right">{pay.a.ab}</Td>
                  <Td align="right">{pay.a.ot}</Td>
                  <Td align="right">{formatInr(pay.net)}</Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </Card>
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-control border px-3 py-1.5 text-xs ${active ? "border-accent bg-accent text-white" : "border-border bg-surface text-ink hover:bg-surface-sunken"}`}
    >
      {children}
    </button>
  );
}

function RevisionTable({ rows, state }) {
  if (!rows.length) return <p className="text-xs text-ink-secondary">No revisions yet</p>;
  return (
    <DataTable>
      <thead>
        <tr>
          <Th>Effective</Th>
          <Th>Employee</Th>
          <Th align="right">Old basic</Th>
          <Th align="right">New basic</Th>
          <Th>Reason</Th>
          <Th>By</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.emp}-${row.date}-${row.nw}`}>
            <Td>{row.date}</Td>
            <Td>{state.emps.find((employee) => employee.id === row.emp)?.name || row.emp}</Td>
            <Td align="right">{formatInr(row.old)}</Td>
            <Td align="right">{formatInr(row.nw)}</Td>
            <Td>{row.reason}</Td>
            <Td>{row.by}</Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export function EmployeeDetailPage() {
  const { id } = useParams();
  const module = useSalaryModule();
  const { state, month } = module;
  const employee = state.emps.find((item) => item.id === id);
  const [otMonths, setOtMonths] = useState([month]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSite, setTransferSite] = useState(employee?.site || "");
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revision, setRevision] = useState({ amount: "", month: "", reason: "" });

  useEffect(() => {
    setOtMonths([month]);
    if (employee?.site) setTransferSite(employee.site);
  }, [id]);

  if (!employee) {
    return (
      <Card>
        <p className="text-sm text-ink-secondary">Employee not found.</p>
        <Link to={salaryAppPath("employees")} className={`${btnGhost} mt-3`}>Back to employees</Link>
      </Card>
    );
  }

  const pay = calcEmployee(state, employee, month);
  const overtimeRows = otMonths.map((item) => ({ month: item, pay: calcEmployee(state, employee, item) }));
  const otHours = overtimeRows.reduce((total, row) => total + row.pay.a.ot, 0);
  const otAmount = overtimeRows.reduce((total, row) => total + row.pay.ot, 0);
  const openMonths = MONTHS.filter((item) => !state.paid[item]?.[employee.site]);
  const profileRows = [
    ["Full name", employee.name],
    ["Site", siteName(state, employee.site)],
    ["Joined", employee.joined],
    ["Shift", employee.shift],
    ["Weekly off", employee.wo],
    ["Duty pattern", employee.pat],
    ["Monthly basic", formatInr(employee.basic)],
  ];
  const attendanceRows = [
    ["Present days", pay.a.pr],
    ["Paid leave", pay.a.lv],
    ["Week offs", pay.a.wo],
    ["Absent (LOP)", pay.a.ab],
    ["Payable days", pay.a.pr + pay.a.lv + pay.a.wo],
    ["Night shifts", pay.a.ng],
  ];

  const toggleMonth = (item) => {
    setOtMonths((current) => {
      if (current.includes(item)) return current.length > 1 ? current.filter((value) => value !== item) : current;
      return [...current, item].sort();
    });
  };

  return (
    <div className="space-y-4">
      <Link to={salaryAppPath("employees")} className={`${btnGhost} ${btnSmall}`}>← Employees</Link>
      <PageHead title={employee.name} subtitle={`${employee.id} · ${employee.desig} · ${siteName(state, employee.site)}`} month />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile & duty">
          <KeyValue rows={profileRows} />
        </Card>
        <Card title={`Attendance – ${monthLabel(month)}`}>
          <KeyValue rows={attendanceRows} />
          <p className="mt-2 text-[11px] text-ink-secondary">
            Leave balance: CL {Math.max(employee.cl - pay.a.lv, 0)} · SL {employee.sl}
          </p>
        </Card>
      </div>
      <Card title="Overtime (auto-calculated)">
        <p className="mb-2 text-xs text-ink-secondary">Select one or more months</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {MONTHS.map((item) => (
            <FilterChip key={item} active={otMonths.includes(item)} onClick={() => toggleMonth(item)}>
              {monthLabel(item)}
            </FilterChip>
          ))}
        </div>
        <DataTable>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th align="right">OT hours</Th>
              <Th align="right">OT amount</Th>
            </tr>
          </thead>
          <tbody>
            {overtimeRows.map((row) => (
              <tr key={row.month}>
                <Td>{monthLabel(row.month)}</Td>
                <Td align="right">{row.pay.a.ot}</Td>
                <Td align="right">{formatInr(row.pay.ot)}</Td>
              </tr>
            ))}
            <tr>
              <Td className="font-semibold">Total</Td>
              <Td align="right" className="font-semibold">{otHours}</Td>
              <Td align="right" className="font-semibold">{formatInr(otAmount)}</Td>
            </tr>
          </tbody>
        </DataTable>
        <p className="mt-2 text-[11px] text-ink-secondary">Rate: {componentFormula(state, employee.site, "OT")}</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Warning letters">
          {employee.warns.length ? (
            <div className="space-y-2 text-xs">
              {employee.warns.map((warning) => (
                <div key={warning.d} className="flex flex-wrap items-center gap-2">
                  <span>{warning.d} – {warning.r}</span>
                  <Tag tone="warn">Fine {formatInr(warning.fine)}</Tag>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-ink-secondary">None on record</p>}
        </Card>
        <Card title="Site transfers">
          {employee.tr.length ? (
            <div className="space-y-1 text-xs">
              {employee.tr.map((transfer) => (
                <p key={`${transfer.d}-${transfer.to}`}>{transfer.d}: {transfer.from} → {transfer.to}</p>
              ))}
            </div>
          ) : <p className="text-xs text-ink-secondary">No transfers</p>}
          <button
            type="button"
            className={`${btnGhost} ${btnSmall} mt-3`}
            onClick={() => {
              setTransferSite(employee.site);
              setTransferOpen(true);
            }}
          >
            Transfer to another site
          </button>
        </Card>
      </div>
      <Card title={`Salary breakup – ${monthLabel(month)}`}>
        <DataTable>
          <thead>
            <tr>
              <Th>Component (as named at this site)</Th>
              <Th>Type</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {pay.lines.map((line) => (
              <tr key={line.c}>
                <Td>{line.n}</Td>
                <Td>{typeLabel(line.t)}</Td>
                <Td align="right">{formatInr(line.v)}</Td>
              </tr>
            ))}
            <tr>
              <Td className="font-semibold">Gross</Td>
              <Td />
              <Td align="right" className="font-semibold">{formatInr(pay.gross)}</Td>
            </tr>
            <tr>
              <Td className="font-semibold">Net pay</Td>
              <Td />
              <Td align="right" className="font-semibold">{formatInr(pay.net)}</Td>
            </tr>
          </tbody>
        </DataTable>
      </Card>
      <Card title="Revision history">
        <RevisionTable rows={state.rev.filter((row) => row.emp === employee.id)} state={state} />
        <button
          type="button"
          className={`${btnPrimary} ${btnSmall} mt-3`}
          onClick={() => {
            setRevision({ amount: "", month: openMonths[0] || month, reason: "" });
            setRevisionOpen(true);
          }}
        >
          Revise salary
        </button>
      </Card>

      <Modal
        open={transferOpen}
        title="Site transfer"
        onClose={() => setTransferOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setTransferOpen(false)}>Cancel</button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                module.transferEmployee(employee.id, transferSite);
                setTransferOpen(false);
                toast.success("Transferred");
              }}
            >
              Transfer
            </button>
          </div>
        }
      >
        <Field label="New site">
          <select className={selectClass} value={transferSite} onChange={(event) => setTransferSite(event.target.value)}>
            {state.sites.map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
        </Field>
        <p className="mt-3 text-[11px] text-ink-secondary">Effective for the next unprocessed payroll. Disbursed months are not changed.</p>
      </Modal>

      <Modal
        open={revisionOpen}
        title={`Revise salary – ${employee.name}`}
        onClose={() => setRevisionOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setRevisionOpen(false)}>Cancel</button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                const error = module.reviseSalary(employee.id, {
                  amount: revision.amount,
                  effectiveMonth: revision.month,
                  reason: revision.reason,
                });
                if (notify(error, "Revision recorded")) setRevisionOpen(false);
              }}
            >
              Save revision
            </button>
          </div>
        }
      >
        <p className="mb-3 text-xs text-ink-secondary">Current basic {formatInr(employee.basic)}</p>
        <div className="space-y-3">
          <Field label="New monthly basic">
            <input className={fieldClass} type="number" value={revision.amount} onChange={(event) => setRevision({ ...revision, amount: event.target.value })} />
          </Field>
          <Field label="Effective from (month)">
            <select className={selectClass} value={revision.month} onChange={(event) => setRevision({ ...revision, month: event.target.value })}>
              {(openMonths.length ? openMonths : [month]).map((item) => (
                <option key={item} value={item}>{monthLabel(item)}</option>
              ))}
            </select>
          </Field>
          <Field label="Reason">
            <input className={fieldClass} placeholder="Increment / promotion / correction" value={revision.reason} onChange={(event) => setRevision({ ...revision, reason: event.target.value })} />
          </Field>
          <p className="text-[11px] text-ink-secondary">Only months not yet disbursed can be revised.</p>
        </div>
      </Modal>
    </div>
  );
}

function KeyValue({ rows }) {
  return (
    <DataTable>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <Td className="text-ink-secondary">{label}</Td>
            <Td>{value}</Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export function ProcessPage() {
  const module = useSalaryModule();
  const { state, month, selectedSites } = module;
  const rows = state.sites.map((site) => ({ site, ...siteTotals(state, month, site.id) }));
  const chosen = rows.filter((row) => !row.paid && selectedSites[row.site.id]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="space-y-4">
      <PageHead title="Process & Disburse" subtitle={`Select the sites to disburse for ${monthLabel(month)}`} month />
      <Card>
        <DataTable>
          <thead>
            <tr>
              <Th />
              <Th>Site</Th>
              <Th align="right">Staff</Th>
              <Th align="right">Gross</Th>
              <Th align="right">OT</Th>
              <Th align="right">Deductions</Th>
              <Th align="right">Net</Th>
              <Th>Checks</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const warnings = state.emps.filter((employee) => employee.site === row.site.id && employee.warns.length).length;
              return (
                <tr key={row.site.id}>
                  <Td>
                    <input
                      type="checkbox"
                      disabled={row.paid}
                      checked={row.paid || Boolean(selectedSites[row.site.id])}
                      onChange={(event) => module.toggleSite(row.site.id, event.target.checked)}
                    />
                  </Td>
                  <Td>{row.site.name}</Td>
                  <Td align="right">{row.n}</Td>
                  <Td align="right">{formatInr(row.gross)}</Td>
                  <Td align="right">{formatInr(row.ot)}</Td>
                  <Td align="right">{formatInr(row.ded)}</Td>
                  <Td align="right" className="font-semibold">{formatInr(row.net)}</Td>
                  <Td>
                    <Tag tone="ok">Attendance ✓</Tag>
                    {warnings ? <span className="ml-1"><Tag tone="warn">{warnings} warning</Tag></span> : null}
                  </Td>
                  <Td>
                    {row.paid ? <Tag tone="ok">Disbursed {row.date}</Tag> : <Tag tone="warn">Pending</Tag>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={btnPrimary} disabled={!chosen.length} onClick={() => setConfirmOpen(true)}>
            Process & disburse {chosen.length} site(s)
          </button>
          <span className="text-[11px] text-ink-secondary">Disbursed sites are locked and their slips become available.</span>
        </div>
      </Card>
      <Modal
        open={confirmOpen}
        title="Confirm disbursement"
        onClose={() => setConfirmOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setConfirmOpen(false)}>Cancel</button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                module.disburse(chosen.map((row) => row.site.id));
                setConfirmOpen(false);
                toast.success("Salary disbursed. Slips ready.");
              }}
            >
              Confirm
            </button>
          </div>
        }
      >
        <p className="text-sm text-ink">
          Process {monthLabel(month)} salary for {chosen.map((row) => row.site.name).join(", ")}?
        </p>
        <p className="mt-2 text-sm text-ink">
          Total net: <b>{formatInr(chosen.reduce((total, row) => total + row.net, 0))}</b>. This locks attendance and rates for these sites.
        </p>
      </Modal>
    </div>
  );
}

function slipMarkup(state, month, siteId, rows) {
  return rows.map((row) => {
    const earnings = row.c.lines.filter((line) => line.t === "E");
    const deductions = row.c.lines.filter((line) => line.t === "D");
    const attendance = row.c.a;
    const line = (items) => items.map((item) => `<tr><td>${item.n}</td><td class="r">${formatInr(item.v)}</td></tr>`).join("");
    return `<div class="slip"><div class="top"><b>${PAYSLIP_COMPANY}</b><span>Payslip – ${monthLabel(month)}</span></div><div class="mut">${row.e.name} (${row.e.id}) · ${row.e.desig} · ${siteName(state, siteId)}<br>Payable days ${attendance.pr + attendance.lv + attendance.wo} · Present ${attendance.pr} · OT ${attendance.ot} hrs</div><div class="two"><table>${line(earnings)}<tr><th>Gross</th><th class="r">${formatInr(row.c.gross)}</th></tr></table><table>${line(deductions)}<tr><th>Deductions</th><th class="r">${formatInr(row.c.ded)}</th></tr></table></div><h2>Net pay: ${formatInr(row.c.net)}</h2></div>`;
  }).join("");
}

function printSlips(html) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) {
    toast.warning("Allow pop-ups to print salary slips");
    return;
  }
  popup.document.write(`<!DOCTYPE html><html><head><title>Salary slips</title><style>
    body{font-family:Inter,Segoe UI,sans-serif;color:#131c24;margin:24px}
    .slip{border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;page-break-inside:avoid}
    .top{display:flex;justify-content:space-between;gap:12px}
    .mut{color:#64748b;font-size:12px;margin-top:6px}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    td,th{padding:4px 0;text-align:left}
    .r{text-align:right}
    h2{font-size:16px;margin:10px 0 0}
  </style></head><body>${html}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

export function SlipsPage() {
  const { state, month } = useSalaryModule();
  const sites = state.sites.filter((site) => state.paid[month]?.[site.id]);
  const [view, setView] = useState(null);
  const rows = useMemo(() => {
    if (!view) return [];
    const paid = state.paid[month]?.[view.siteId];
    if (!paid) return [];
    return paid.rows.filter((row) => !view.employeeId || row.e.id === view.employeeId);
  }, [view, state, month]);

  return (
    <div className="space-y-4">
      <PageHead title="Salary Slip" subtitle={`Available only for sites disbursed in ${monthLabel(month)}`} month />
      {sites.length ? sites.map((site) => (
        <Card
          key={site.id}
          title={site.name}
          action={
            <button type="button" className={`${btnPrimary} ${btnSmall}`} onClick={() => setView({ siteId: site.id })}>
              View / print all slips
            </button>
          }
        >
          <DataTable>
            <tbody>
              {state.paid[month][site.id].rows.map((row) => (
                <tr key={row.e.id}>
                  <Td>{row.e.id}</Td>
                  <Td>{row.e.name}</Td>
                  <Td align="right">{formatInr(row.c.net)}</Td>
                  <Td>
                    <button type="button" className={`${btnGhost} ${btnSmall}`} onClick={() => setView({ siteId: site.id, employeeId: row.e.id })}>
                      View
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      )) : (
        <Card>
          <p className="text-xs text-ink-secondary">No site has been disbursed for this month yet. Go to Process & Disburse.</p>
        </Card>
      )}
      <Modal
        open={Boolean(view)}
        title={view ? `${rows.length} slip(s)` : "Salary slips"}
        onClose={() => setView(null)}
        widthClass="max-w-3xl"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setView(null)}>Close</button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => view && printSlips(slipMarkup(state, month, view.siteId, rows))}
            >
              Print
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {rows.map((row) => {
            const earnings = row.c.lines.filter((line) => line.t === "E");
            const deductions = row.c.lines.filter((line) => line.t === "D");
            return (
              <div key={row.e.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <b className="text-sm">{PAYSLIP_COMPANY}</b>
                  <span className="text-xs text-ink-secondary">Payslip – {monthLabel(month)}</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-secondary">
                  {row.e.name} ({row.e.id}) · {row.e.desig} · {siteName(state, view.siteId)}
                  <br />
                  Payable days {row.c.a.pr + row.c.a.lv + row.c.a.wo} · Present {row.c.a.pr} · OT {row.c.a.ot} hrs
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <MiniLines lines={earnings} totalLabel="Gross" total={row.c.gross} />
                  <MiniLines lines={deductions} totalLabel="Deductions" total={row.c.ded} />
                </div>
                <p className="mt-2 text-sm font-semibold">Net pay: {formatInr(row.c.net)}</p>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

function MiniLines({ lines, totalLabel, total }) {
  return (
    <DataTable>
      <tbody>
        {lines.map((line) => (
          <tr key={line.c}>
            <Td>{line.n}</Td>
            <Td align="right">{formatInr(line.v)}</Td>
          </tr>
        ))}
        <tr>
          <Td className="font-semibold">{totalLabel}</Td>
          <Td align="right" className="font-semibold">{formatInr(total)}</Td>
        </tr>
      </tbody>
    </DataTable>
  );
}

export function RevisionsPage() {
  const { state } = useSalaryModule();
  return (
    <div className="space-y-4">
      <PageHead title="Salary Revision" subtitle="Audit trail of every basic-pay change" />
      <Card>
        <RevisionTable rows={state.rev} state={state} />
      </Card>
    </div>
  );
}

export function ReportsPage() {
  const { state, reportMonth, setReportMonth, reportSite, setReportSite } = useSalaryModule();
  const months = MONTHS.filter((item) => reportMonth === "all" || item === reportMonth);
  const sites = state.sites.filter((site) => reportSite === "all" || site.id === reportSite);
  const records = [];
  months.forEach((item) => {
    sites.forEach((site) => {
      const totals = siteTotals(state, item, site.id);
      if (totals.paid) records.push({ month: item, site, ...totals });
    });
  });
  const sum = (key) => records.reduce((total, row) => total + row[key], 0);
  const headcount = records.reduce((total, row) => total + row.n, 0);
  const gross = sum("gross");
  const otShare = gross ? ((sum("ot") / gross) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-4">
      <PageHead title="Report" subtitle="Disbursed salary and overtime for sites that have already been paid" />
      <Card>
        <div className="flex flex-wrap gap-2">
          <select className={selectClass} defaultValue="2026">
            <option>2026</option>
          </select>
          <select className={selectClass} value={reportMonth} onChange={(event) => setReportMonth(event.target.value)}>
            <option value="all">All months</option>
            {MONTHS.map((item) => (
              <option key={item} value={item}>{monthLabel(item)}</option>
            ))}
          </select>
          <select className={selectClass} value={reportSite} onChange={(event) => setReportSite(event.target.value)}>
            <option value="all">All sites</option>
            {state.sites.map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Net salary disbursed" value={formatInr(sum("net"))} />
        <Kpi label="Gross disbursed" value={formatInr(gross)} />
        <Kpi label="Total OT disbursed" value={formatInr(sum("ot"))} />
        <Kpi label="OT as % of gross" value={`${otShare}%`} />
        <Kpi label="Total deductions" value={formatInr(sum("ded"))} />
        <Kpi label="Avg net / employee" value={formatInr(headcount ? sum("net") / headcount : 0)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Net salary by month">
          <AmountBars
            rows={months.map((item) => {
              const value = records.filter((row) => row.month === item).reduce((total, row) => total + row.net, 0);
              return { label: monthLabel(item), value, display: formatInr(value) };
            })}
          />
        </Card>
        <Card title="OT amount by month">
          <AmountBars
            tone="warning"
            rows={months.map((item) => {
              const value = records.filter((row) => row.month === item).reduce((total, row) => total + row.ot, 0);
              return { label: monthLabel(item), value, display: formatInr(value) };
            })}
          />
        </Card>
      </div>
      <Card title="Site & month detail">
        <DataTable>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th>Site</Th>
              <Th align="right">Staff</Th>
              <Th align="right">Gross</Th>
              <Th align="right">OT</Th>
              <Th align="right">Net</Th>
            </tr>
          </thead>
          <tbody>
            {records.length ? records.map((row) => (
              <tr key={`${row.month}-${row.site.id}`}>
                <Td>{monthLabel(row.month)}</Td>
                <Td>{row.site.name}</Td>
                <Td align="right">{row.n}</Td>
                <Td align="right">{formatInr(row.gross)}</Td>
                <Td align="right">{formatInr(row.ot)}</Td>
                <Td align="right">{formatInr(row.net)}</Td>
              </tr>
            )) : (
              <tr><Td>No disbursed data</Td></tr>
            )}
          </tbody>
        </DataTable>
      </Card>
      <Card title="Total OT per site (selected period)">
        <DataTable>
          <thead>
            <tr>
              <Th>Site</Th>
              <Th align="right">OT hours</Th>
              <Th align="right">OT amount</Th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => {
              const siteRecords = records.filter((row) => row.site.id === site.id);
              const hours = siteRecords.reduce((total, row) => total + row.rows.reduce((sumHours, item) => sumHours + item.c.a.ot, 0), 0);
              const amount = siteRecords.reduce((total, row) => total + row.ot, 0);
              return (
                <tr key={site.id}>
                  <Td>{site.name}</Td>
                  <Td align="right">{hours}</Td>
                  <Td align="right">{formatInr(amount)}</Td>
                </tr>
              );
            })}
            <tr>
              <Td className="font-semibold">Entire organisation</Td>
              <Td align="right" className="font-semibold">
                {records.reduce((total, row) => total + row.rows.reduce((sumHours, item) => sumHours + item.c.a.ot, 0), 0)}
              </Td>
              <Td align="right" className="font-semibold">{formatInr(sum("ot"))}</Td>
            </tr>
          </tbody>
        </DataTable>
      </Card>
    </div>
  );
}
