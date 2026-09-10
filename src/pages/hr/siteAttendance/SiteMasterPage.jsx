import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "../../../lib/toast";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FormDateInput } from "../../../components/FormDateInput";
import {
  DenseTable,
  Drawer,
  FilterBar,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinyInput,
  TinySelect,
} from "../../adminOperations/components/AdminUi";
import { SITE_TYPES, isValidSiteType } from "../../../lib/siteAttendance/siteTypes";
import { formatDateDisplay } from "../../../lib/siteAttendance/dateFormat";
import {
  DEFAULT_SITE_DESIGNATIONS,
  createSite,
  deleteSite,
  listDesignationMaster,
  listHrManagers,
  listSiteDesignations,
  listSiteHrAssignments,
  listSites,
  listSupervisors,
  saveSiteDesignations,
  saveSiteHrAssignments,
  saveSupervisors,
  updateSite,
  userFriendlyError,
} from "../../../lib/siteAttendance/siteAttendanceApi";
import { hrPersonLabel } from "../../../lib/siteAttendance/siteAttendanceAccess";
import { useSiteAttendanceAccess, useSiteAttendanceType } from "./SiteAttendanceLayout";

const emptyDesignationRow = (name = "", selected = false) => ({
  designation: name,
  isSelected: selected,
  shiftType: "",
  totalStrength: "",
  requiredDuty: "",
});

function emptyForm() {
  return {
    site_name: "",
    site_type: "",
    location: "",
    contract_details: "",
    contract_start: "",
    contract_end: "",
    max_workers: 1,
    duty_hours: 8,
    salary_cycle_start_day: 1,
    salary_cycle_end_day: 31,
    sandwich_rule: true,
    weekoff_counts_as_present: false,
    coff_worked_weekoff_eligible: false,
    one_person_multiple_designations: false,
    nh_ph_present: 1,
    nh_ph_leave: 1,
    nh_ph_weekoff: 1,
    regular_ot: false,
    ot_in_hours: true,
    custom_ot: false,
  };
}

function formatCycle(site) {
  const s = site.salary_cycle_start_day || 1;
  const e = site.salary_cycle_end_day || 31;
  if (s === 1 && e >= 28) return "Calendar month";
  return `${s}–${e}`;
}

export default function SiteMasterPage() {
  const { siteType } = useSiteAttendanceType();
  const access = useSiteAttendanceAccess();
  const canAssignHr = Boolean(access.canAssignHr);
  const hrTeam = access.hrTeam || [];
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [designations, setDesignations] = useState(() =>
    DEFAULT_SITE_DESIGNATIONS.map((n) => emptyDesignationRow(n, false))
  );
  const [masterNames, setMasterNames] = useState(DEFAULT_SITE_DESIGNATIONS);
  const [nhPh, setNhPh] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [hrAssignments, setHrAssignments] = useState([]);
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const { rows: list, count } = await listSites({
        search,
        from,
        to: from + pageSize - 1,
        siteIds: access.seesAllSites ? undefined : access.allowedSiteIds,
      });
      setRows(list);
      setTotal(count);
    } catch (err) {
      toast.error(userFriendlyError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, access.seesAllSites, access.allowedSiteIds]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visibleRows = useMemo(() => {
    if (!siteType) return rows;
    return rows.filter((r) => r.site_type === siteType);
  }, [rows, siteType]);

  const openCreate = async () => {
    if (!canAssignHr) return;
    setEditingId(null);
    const next = emptyForm();
    if (siteType) next.site_type = siteType;
    setForm(next);
    const names = await listDesignationMaster().catch(() => DEFAULT_SITE_DESIGNATIONS);
    setMasterNames(names);
    setDesignations(names.map((n) => emptyDesignationRow(n, false)));
    setNhPh([]);
    setSupervisors([]);
    setHrAssignments([]);
    setDrawerOpen(true);
  };

  const openEdit = async (site) => {
    setEditingId(site.id);
    setForm({
      site_name: site.site_name || "",
      site_type: site.site_type || "",
      location: site.location || "",
      contract_details: site.contract_details || "",
      contract_start: site.contract_start || "",
      contract_end: site.contract_end || "",
      max_workers: site.max_workers || 1,
      duty_hours: site.duty_hours === 12 ? 12 : 8,
      salary_cycle_start_day: site.salary_cycle_start_day || 1,
      salary_cycle_end_day: site.salary_cycle_end_day || 31,
      sandwich_rule: site.sandwich_rule !== false,
      weekoff_counts_as_present: site.weekoff_counts_as_present === true,
      coff_worked_weekoff_eligible: site.coff_worked_weekoff_eligible === true,
      one_person_multiple_designations: site.one_person_multiple_designations === true,
      nh_ph_present: site.nh_ph_present ?? 1,
      nh_ph_leave: site.nh_ph_leave ?? 1,
      nh_ph_weekoff: site.nh_ph_weekoff ?? 1,
      regular_ot: site.regular_ot === true,
      ot_in_hours: site.ot_in_hours !== false && site.regular_ot !== true && site.custom_ot !== true,
      custom_ot: site.custom_ot === true,
    });
    const [siteDesigs, names, sups, hrs, managers] = await Promise.all([
      listSiteDesignations(site.id),
      listDesignationMaster(),
      listSupervisors(site.id),
      listSiteHrAssignments(site.id),
      listHrManagers().catch(() => []),
    ]);
    setMasterNames(names);
    const selected = new Set(siteDesigs.map((d) => String(d.designation_name).trim().toLowerCase()));
    const byName = new Map(siteDesigs.map((d) => [String(d.designation_name).trim().toLowerCase(), d]));
    const allNames = [...new Set([...names, ...siteDesigs.map((d) => d.designation_name)])];
    setDesignations(
      allNames.filter(Boolean).map((name) => {
        const row = byName.get(String(name).trim().toLowerCase());
        return {
          designation: name,
          isSelected: selected.has(String(name).trim().toLowerCase()),
          shiftType: row?.shift_type || "",
          totalStrength: row?.total_strength ?? "",
          requiredDuty: row?.required_duty_per_day ?? "",
        };
      })
    );
    const rawNh = Array.isArray(site.nh_ph_dates) ? site.nh_ph_dates : [];
    setNhPh(
      rawNh.map((entry) =>
        typeof entry === "string" ? { date: entry, remarks: "" } : { date: entry.date || "", remarks: entry.remarks || "" }
      )
    );
    setSupervisors(sups.map((s) => ({ id: s.id, username: s.username, password: "" })));
    setHrAssignments(
      (hrs || []).map((row) => {
        if (row.employee_code) return { ...row, employee_code: String(row.employee_code) };
        const mgr = (managers || []).find((m) => String(m.id) === String(row.hr_manager_id));
        const email = String(mgr?.email_id || "").trim().toLowerCase();
        const match = email
          ? hrTeam.find((p) => String(p.email_id || "").trim().toLowerCase() === email)
          : null;
        return { ...row, employee_code: match?.employee_code || "" };
      })
    );
    setDrawerOpen(true);
  };

  const save = async () => {
    if (!editingId && !canAssignHr) {
      toast.error("L1 and L2 managers assign HR people and create sites.");
      return;
    }
    if (!form.site_name.trim()) {
      toast.error("Site name is required.");
      return;
    }
    if (!isValidSiteType(form.site_type)) {
      toast.error("Select a site type.");
      return;
    }
    if (!form.regular_ot && !form.ot_in_hours && !form.custom_ot) {
      toast.error("Select at least one overtime mode.");
      return;
    }
    const selected = designations.filter((d) => d.isSelected && d.designation.trim());
    if (!selected.length) {
      toast.error("Select at least one designation.");
      return;
    }
    const shiftType = selected.find((d) => d.shiftType)?.shiftType || "";
    if (!["GENERAL", "ABCG"].includes(shiftType)) {
      toast.error("Select shift type (P-days or ABCG) on each selected designation.");
      return;
    }
    if (form.contract_start && form.contract_end && form.contract_start > form.contract_end) {
      toast.error("Contract end must be after start.");
      return;
    }
    const firstDuty = selected.find((d) => d.requiredDuty !== "" && d.requiredDuty != null);
    const payload = {
      ...form,
      site_name: form.site_name.trim(),
      location: form.location.trim() || null,
      contract_details: form.contract_details.trim() || null,
      contract_start: form.contract_start || null,
      contract_end: form.contract_end || null,
      max_workers: parseInt(form.max_workers, 10) || 1,
      duty_hours: Number(form.duty_hours) === 12 ? 12 : 8,
      shift_type: shiftType,
      required_duty_per_day: firstDuty ? parseInt(firstDuty.requiredDuty, 10) || null : null,
      nh_ph_present: parseFloat(form.nh_ph_present) || 1,
      nh_ph_leave: parseFloat(form.nh_ph_leave) || 1,
      nh_ph_weekoff: parseFloat(form.nh_ph_weekoff) || 1,
      nh_ph_dates: nhPh.filter((x) => x.date),
      site_designations: selected.map((d) => d.designation),
    };
    setSaving(true);
    try {
      let siteId = editingId;
      if (editingId) await updateSite(editingId, payload);
      else {
        const created = await createSite(payload);
        siteId = created.id;
      }
      await saveSiteDesignations(siteId, designations);
      await saveSupervisors(siteId, supervisors);
      if (canAssignHr) await saveSiteHrAssignments(siteId, hrAssignments, hrTeam);
      toast.success(editingId ? "Site updated." : "Site created.");
      setDrawerOpen(false);
      refresh();
    } catch (err) {
      toast.error(userFriendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (site) => {
    if (!window.confirm(`Delete site “${site.site_name}”? This cannot be undone.`)) return;
    try {
      await deleteSite(site.id);
      toast.success("Site deleted.");
      refresh();
    } catch (err) {
      toast.error(userFriendlyError(err));
    }
  };

  const setOtMode = (mode) => {
    setForm((f) => ({
      ...f,
      regular_ot: mode === "regular",
      ot_in_hours: mode === "hours",
      custom_ot: mode === "custom",
    }));
  };

  const columns = [
    { key: "site_name", header: "Site" },
    { key: "location", header: "Location", render: (row) => row.location || "—" },
    { key: "site_type", header: "Type", render: (row) => row.site_type || "—" },
    { key: "shift", header: "Shift", render: (row) => (row.shift_type === "ABCG" ? "ABCG" : "P-days") },
    { key: "cycle", header: "Salary cycle", render: (row) => formatCycle(row) },
    { key: "max_workers", header: "Max workers", render: (row) => row.max_workers ?? "—" },
    {
      key: "sandwich_rule",
      header: "Sandwich",
      render: (row) => <StatusChip label={row.sandwich_rule ? "On" : "Off"} severity={row.sandwich_rule ? "info" : "neutral"} />,
    },
    { key: "duty_hours", header: "Duty hours", render: (row) => (row.duty_hours === 12 ? "12" : "8") },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="p-1 text-accent" onClick={() => openEdit(row)} aria-label="Edit site">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {canAssignHr ? (
            <button type="button" className="p-1 text-critical" onClick={() => remove(row)} aria-label="Delete site">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageTaskHeader title="Sites" subtitle="Create contract sites and the attendance rules used on the grid.">
        {canAssignHr ? (
          <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs inline-flex items-center gap-1.5" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" /> New site
          </button>
        ) : null}
      </PageTaskHeader>

      <FilterBar>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-secondary">Search</span>
          <TinyInput value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Site name" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-secondary">Page size</span>
          <TinySelect value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </TinySelect>
        </label>
      </FilterBar>

      <SectionCard title={loading ? "Loading…" : `${visibleRows.length} sites`} right={<span className="type-meta">{total} total</span>}>
        <DenseTable columns={columns} rows={visibleRows} rowKey="id" onRowClick={openEdit} />
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </SectionCard>

      <Drawer open={drawerOpen} title={editingId ? "Edit site" : "New site"} onClose={() => setDrawerOpen(false)} widthClass="max-w-3xl">
        <div className="space-y-5 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium">Site name *</span>
              <TinyInput value={form.site_name} onChange={(e) => setField("site_name", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium">Site type *</span>
              <TinySelect value={form.site_type} onChange={(e) => setField("site_type", e.target.value)}>
                <option value="">Select</option>
                {SITE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </TinySelect>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] font-medium">Location</span>
              <TinyInput value={form.location} onChange={(e) => setField("location", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] font-medium">Contract details</span>
              <textarea className="border border-gray-300 rounded px-2 py-1.5 text-xs min-h-[64px]" value={form.contract_details} onChange={(e) => setField("contract_details", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium">Contract start</span>
              <FormDateInput value={form.contract_start} onChange={(e) => setField("contract_start", e.target.value)} compact />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium">Contract end</span>
              <FormDateInput value={form.contract_end} onChange={(e) => setField("contract_end", e.target.value)} compact />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium">Max workers *</span>
              <TinyInput type="number" min="1" value={form.max_workers} onChange={(e) => setField("max_workers", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium">Duty hours</span>
              <TinySelect value={form.duty_hours} onChange={(e) => setField("duty_hours", Number(e.target.value))}>
                <option value={8}>8</option>
                <option value={12}>12</option>
              </TinySelect>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium">Cycle start day</span>
              <TinySelect value={form.salary_cycle_start_day} onChange={(e) => setField("salary_cycle_start_day", Number(e.target.value))}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </TinySelect>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium">Cycle end day</span>
              <TinySelect value={form.salary_cycle_end_day} onChange={(e) => setField("salary_cycle_end_day", Number(e.target.value))}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </TinySelect>
            </label>
          </div>

          <div>
            <p className="text-xs font-semibold mb-2">Designations on this site</p>
            <div className="max-h-56 overflow-auto border border-border rounded-lg">
              <table className="w-full text-[11px]">
                <thead className="bg-surface-sunken">
                  <tr>
                    <th className="p-2 text-left">Use</th>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Shift</th>
                    <th className="p-2 text-left">Strength</th>
                    <th className="p-2 text-left">Required duty</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {designations.map((row, idx) => (
                    <tr key={`${row.designation}-${idx}`} className="border-t border-divider">
                      <td className="p-1.5">
                        <input type="checkbox" checked={row.isSelected} onChange={(e) => {
                          const next = [...designations];
                          next[idx] = { ...row, isSelected: e.target.checked };
                          setDesignations(next);
                        }} />
                      </td>
                      <td className="p-1.5">
                        <TinyInput list="desig-master" value={row.designation} onChange={(e) => {
                          const next = [...designations];
                          next[idx] = { ...row, designation: e.target.value };
                          setDesignations(next);
                        }} />
                      </td>
                      <td className="p-1.5">
                        <TinySelect value={row.shiftType} onChange={(e) => {
                          const next = [...designations];
                          next[idx] = { ...row, shiftType: e.target.value };
                          setDesignations(next);
                        }}>
                          <option value="">Select</option>
                          <option value="GENERAL">P-days</option>
                          <option value="ABCG">ABCG</option>
                        </TinySelect>
                      </td>
                      <td className="p-1.5">
                        <TinyInput type="number" min="0" value={row.totalStrength} onChange={(e) => {
                          const next = [...designations];
                          next[idx] = { ...row, totalStrength: e.target.value };
                          setDesignations(next);
                        }} />
                      </td>
                      <td className="p-1.5">
                        <TinyInput type="number" min="0" value={row.requiredDuty} onChange={(e) => {
                          const next = [...designations];
                          next[idx] = { ...row, requiredDuty: e.target.value };
                          setDesignations(next);
                        }} />
                      </td>
                      <td className="p-1.5">
                        <button type="button" className="text-critical" onClick={() => setDesignations(designations.filter((_, i) => i !== idx))}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <datalist id="desig-master">
              {masterNames.map((n) => <option key={n} value={n} />)}
            </datalist>
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs mt-2" onClick={() => setDesignations([...designations, emptyDesignationRow("", true)])}>
              Add designation
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.sandwich_rule} onChange={(e) => setField("sandwich_rule", e.target.checked)} /> Sandwich rule</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.weekoff_counts_as_present} onChange={(e) => setField("weekoff_counts_as_present", e.target.checked)} /> Week-off counts as present</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.coff_worked_weekoff_eligible} onChange={(e) => setField("coff_worked_weekoff_eligible", e.target.checked)} /> C-off for worked week-off</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.one_person_multiple_designations} onChange={(e) => setField("one_person_multiple_designations", e.target.checked)} /> One person, multiple designations</label>
          </div>

          <div>
            <p className="text-xs font-semibold mb-2">Overtime mode</p>
            <div className="flex flex-wrap gap-3 text-xs">
              <label className="flex items-center gap-1.5"><input type="radio" checked={form.regular_ot} onChange={() => setOtMode("regular")} /> Regular OT</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={form.ot_in_hours} onChange={() => setOtMode("hours")} /> OT in hours</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={form.custom_ot} onChange={() => setOtMode("custom")} /> Custom OT</label>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1"><span className="text-[11px]">NH/PH if present</span><TinyInput type="number" step="0.1" value={form.nh_ph_present} onChange={(e) => setField("nh_ph_present", e.target.value)} /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px]">NH/PH if leave</span><TinyInput type="number" step="0.1" value={form.nh_ph_leave} onChange={(e) => setField("nh_ph_leave", e.target.value)} /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px]">NH/PH if week-off</span><TinyInput type="number" step="0.1" value={form.nh_ph_weekoff} onChange={(e) => setField("nh_ph_weekoff", e.target.value)} /></label>
          </div>

          <div>
            <p className="text-xs font-semibold mb-2">National / public holidays</p>
            {nhPh.map((row, idx) => (
              <div key={idx} className="flex gap-2 mb-1.5 items-center">
                <FormDateInput value={row.date} compact onChange={(e) => {
                  const next = [...nhPh];
                  next[idx] = { ...row, date: e.target.value };
                  setNhPh(next);
                }} />
                <TinyInput placeholder="Remarks" value={row.remarks} onChange={(e) => {
                  const next = [...nhPh];
                  next[idx] = { ...row, remarks: e.target.value };
                  setNhPh(next);
                }} />
                <button type="button" className="text-critical" onClick={() => setNhPh(nhPh.filter((_, i) => i !== idx))}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" onClick={() => setNhPh([...nhPh, { date: "", remarks: "" }])}>Add holiday</button>
          </div>

          <div>
            <p className="text-xs font-semibold mb-2">Site supervisors</p>
            {supervisors.map((row, idx) => (
              <div key={row.id || idx} className="flex gap-2 mb-1.5">
                <TinyInput placeholder="Username" value={row.username} onChange={(e) => {
                  const next = [...supervisors];
                  next[idx] = { ...row, username: e.target.value };
                  setSupervisors(next);
                }} />
                <TinyInput type="password" placeholder={row.id ? "New password (optional)" : "Password"} value={row.password} onChange={(e) => {
                  const next = [...supervisors];
                  next[idx] = { ...row, password: e.target.value };
                  setSupervisors(next);
                }} />
                <button type="button" className="text-critical" onClick={() => setSupervisors(supervisors.filter((_, i) => i !== idx))}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" onClick={() => setSupervisors([...supervisors, { username: "", password: "" }])}>Add supervisor</button>
          </div>

          <div>
            <p className="text-xs font-semibold mb-2">HR executives on this site</p>
            <p className="type-meta mb-2">Choose people from the HR team in Employee Master. Assigned people only see these sites when they sign in.</p>
            {hrAssignments.map((row, idx) => (
              <div key={row.id || idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-1.5 items-center">
                <TinySelect
                  value={row.employee_code || ""}
                  disabled={!canAssignHr}
                  onChange={(e) => {
                    const next = [...hrAssignments];
                    next[idx] = { ...row, employee_code: e.target.value, hr_manager_id: "" };
                    setHrAssignments(next);
                  }}
                >
                  <option value="">Select HR person</option>
                  {hrTeam.map((p) => (
                    <option key={p.employee_code || p.id} value={p.employee_code}>{hrPersonLabel(p)}</option>
                  ))}
                </TinySelect>
                <FormDateInput value={row.from_date || ""} compact disabled={!canAssignHr} onChange={(e) => {
                  const next = [...hrAssignments];
                  next[idx] = { ...row, from_date: e.target.value };
                  setHrAssignments(next);
                }} />
                <FormDateInput value={row.to_date || ""} compact disabled={!canAssignHr} onChange={(e) => {
                  const next = [...hrAssignments];
                  next[idx] = { ...row, to_date: e.target.value };
                  setHrAssignments(next);
                }} />
                {canAssignHr ? (
                  <button type="button" className="text-critical" onClick={() => setHrAssignments(hrAssignments.filter((_, i) => i !== idx))} aria-label="Remove HR assignment">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : <span />}
              </div>
            ))}
            {canAssignHr ? (
              <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" onClick={() => setHrAssignments([...hrAssignments, { employee_code: "", from_date: "", to_date: "" }])}>Add HR assignment</button>
            ) : null}
          </div>

          {editingId ? <p className="text-[11px] text-ink-muted">Created {formatDateDisplay(rows.find((r) => r.id === editingId)?.created_at)}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="erp-btn-secondary rounded-control px-3.5 py-2 text-xs" onClick={() => setDrawerOpen(false)}>Cancel</button>
            <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save site"}</button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
