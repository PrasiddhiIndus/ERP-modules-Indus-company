import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "../../../lib/toast";
import { Download, Pencil, Plus } from "lucide-react";
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
import { addDaysIso, formatDateDisplay, parseLooseDateToIso } from "../../../lib/siteAttendance/dateFormat";
import { filterSitesByType } from "../../../lib/siteAttendance/siteTypes";
import {
  createAssignment,
  createPerson,
  generateUniqueCode,
  listAllSites,
  listAssignments,
  listPeoplePage,
  listSiteDesignations,
  updateAssignment,
  updatePerson,
  userFriendlyError,
  validateMaxWorkers,
} from "../../../lib/siteAttendance/siteAttendanceApi";
import { useSiteAttendanceAccess, useSiteAttendanceType } from "./SiteAttendanceLayout";
import { siteIdsForQuery } from "../../../lib/siteAttendance/siteAttendanceAccess";

function emptyPerson() {
  return {
    unique_code: "",
    full_name: "",
    date_of_birth: "",
    joining_date: "",
    designation: "",
    father_name: "",
    phone_no: "",
    leaving_date: "",
    is_active: true,
    site_id: "",
    from_date: "",
    to_date: "",
    transfer: false,
    transfer_site_id: "",
    transfer_date: "",
  };
}

export default function PeopleMasterPage() {
  const { siteType } = useSiteAttendanceType();
  const access = useSiteAttendanceAccess();
  const [people, setPeople] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [sites, setSites] = useState([]);
  const [assignmentsByPerson, setAssignmentsByPerson] = useState({});
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [form, setForm] = useState(emptyPerson);
  const [siteDesignations, setSiteDesignations] = useState([]);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importSiteId, setImportSiteId] = useState("");

  const typedSites = useMemo(() => filterSitesByType(sites, siteType), [sites, siteType]);
  const siteName = (id) => sites.find((s) => String(s.id) === String(id))?.site_name || "—";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const [{ rows, count }, allSites] = await Promise.all([
        listPeoplePage({ search, from, to: from + pageSize - 1 }),
        listAllSites({ siteIds: siteIdsForQuery(access) }),
      ]);
      setPeople(rows);
      setTotal(count);
      setSites(allSites);
      const allAssigns = rows.length
        ? await listAssignments({ personIds: rows.map((p) => p.id) })
        : [];
      const byPerson = {};
      for (const p of rows) byPerson[p.id] = [];
      for (const a of allAssigns) {
        if (!byPerson[a.person_id]) byPerson[a.person_id] = [];
        byPerson[a.person_id].push(a);
      }
      const map = {};
      for (const p of rows) {
        const assigns = byPerson[p.id] || [];
        const open = assigns.find((a) => !a.to_date) || assigns[assigns.length - 1];
        map[p.id] = { all: assigns, current: open };
      }
      setAssignmentsByPerson(map);
    } catch (err) {
      toast.error(userFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, access.seesAllSites, access.allowedSiteIds]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visiblePeople = useMemo(() => {
    if (access.seesAllSites && !siteType) return people;
    const allowed = new Set(typedSites.map((s) => s.id));
    return people.filter((p) => {
      const cur = assignmentsByPerson[p.id]?.current;
      return cur && allowed.has(cur.site_id);
    });
  }, [people, siteType, typedSites, assignmentsByPerson, access.seesAllSites]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const loadDesigs = async (siteId) => {
    if (!siteId) {
      setSiteDesignations([]);
      return;
    }
    setSiteDesignations(await listSiteDesignations(siteId));
  };

  const openCreate = () => {
    setEditingId(null);
    setEditingAssignmentId(null);
    setForm(emptyPerson());
    setHistory([]);
    setDrawerOpen(true);
  };

  const openEdit = async (person) => {
    const assigns = assignmentsByPerson[person.id]?.all || (await listAssignments({ personId: person.id }));
    const current = assigns.find((a) => !a.to_date) || assigns[assigns.length - 1];
    setEditingId(person.id);
    setEditingAssignmentId(current?.id || null);
    setForm({
      unique_code: person.unique_code || "",
      full_name: person.full_name || "",
      date_of_birth: person.date_of_birth || "",
      joining_date: person.joining_date || "",
      designation: person.designation || "",
      father_name: person.father_name || "",
      phone_no: person.phone_no || "",
      leaving_date: person.leaving_date || "",
      is_active: person.is_active !== false,
      site_id: current?.site_id ? String(current.site_id) : "",
      from_date: current?.from_date || "",
      to_date: current?.to_date || "",
      transfer: false,
      transfer_site_id: "",
      transfer_date: "",
    });
    setHistory(assigns);
    if (current?.site_id) await loadDesigs(current.site_id);
    setDrawerOpen(true);
  };

  const save = async () => {
    if (!form.unique_code.trim() || !form.full_name.trim()) {
      toast.error("Code and name are required.");
      return;
    }
    if (!form.joining_date) {
      toast.error("Joining date is required.");
      return;
    }
    if (form.leaving_date && form.leaving_date < form.joining_date) {
      toast.error("Leaving date must be after joining date.");
      return;
    }
    const personPayload = {
      unique_code: form.unique_code.trim(),
      full_name: form.full_name.trim(),
      date_of_birth: form.date_of_birth || null,
      joining_date: form.joining_date,
      designation: form.designation.trim() || null,
      father_name: form.father_name.trim() || null,
      phone_no: form.phone_no.trim() || null,
      leaving_date: form.leaving_date || null,
      is_active: form.is_active,
    };

    setSaving(true);
    try {
      if (form.transfer) {
        if (!form.transfer_site_id || !form.transfer_date) {
          toast.error("Select the new site and transfer date.");
          return;
        }
        if (!editingId) {
          toast.error("Create the person first, then transfer.");
          return;
        }
        if (form.transfer_date < form.joining_date) {
          toast.error("Transfer date cannot be before joining date.");
          return;
        }
        await updatePerson(editingId, personPayload);
        const assigns = await listAssignments({ personId: editingId });
        const endDate = addDaysIso(form.transfer_date, -1);
        for (const a of assigns.filter((x) => !x.to_date)) {
          await updateAssignment(a.id, { to_date: endDate });
        }
        const check = await validateMaxWorkers(Number(form.transfer_site_id), form.transfer_date, null, editingId);
        if (!check.allowed) {
          toast.error(check.message);
          return;
        }
        await createAssignment({
          person_id: editingId,
          site_id: Number(form.transfer_site_id),
          from_date: form.transfer_date,
          to_date: null,
        });
        toast.success("Person transferred.");
      } else {
        if (!form.site_id || !form.from_date) {
          toast.error("Site and assignment from-date are required.");
          return;
        }
        if (form.from_date < form.joining_date) {
          toast.error("Assignment cannot start before joining date.");
          return;
        }
        let personId = editingId;
        if (editingId) await updatePerson(editingId, personPayload);
        else {
          const created = await createPerson(personPayload);
          personId = created.id;
        }
        if (editingAssignmentId) {
          await updateAssignment(editingAssignmentId, {
            site_id: Number(form.site_id),
            from_date: form.from_date,
            to_date: form.to_date || null,
          });
        } else {
          const check = await validateMaxWorkers(Number(form.site_id), form.from_date, form.to_date || null);
          if (!check.allowed) {
            toast.error(check.message);
            return;
          }
          await createAssignment({
            person_id: personId,
            site_id: Number(form.site_id),
            from_date: form.from_date,
            to_date: form.to_date || null,
          });
        }
        toast.success(editingId ? "Person updated." : "Person created.");
      }
      setDrawerOpen(false);
      refresh();
    } catch (err) {
      toast.error(userFriendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const downloadSample = () => {
    const csv = "Code,Employee Name,Designation,Father Name,Date Of Birth,Date of Joining,Phone No\nEMP001,Example Name,FIREMAN,Father,01/01/1990,01/04/2024,9999999999\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "people-import-sample.csv";
    a.click();
  };

  const importCsv = async () => {
    if (!importSiteId || !importFile) {
      toast.error("Select a site and a CSV file.");
      return;
    }
    const text = await importFile.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      toast.error("CSV needs a header and at least one row.");
      return;
    }
    const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
    const idx = (name) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    const required = ["Code", "Employee Name", "Designation", "Father Name", "Date Of Birth", "Date of Joining"];
    for (const col of required) {
      if (idx(col) === -1) {
        toast.error(`Required column “${col}” is missing.`);
        return;
      }
    }
    let ok = 0;
    let fail = 0;
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.replace(/^"|"$/g, "").trim());
      const code = values[idx("Code")];
      const name = values[idx("Employee Name")];
      const joining = parseLooseDateToIso(values[idx("Date of Joining")]);
      if (!code || !name || !joining) {
        fail++;
        continue;
      }
      try {
        const created = await createPerson({
          unique_code: code,
          full_name: name,
          designation: values[idx("Designation")] || null,
          father_name: values[idx("Father Name")] || null,
          date_of_birth: parseLooseDateToIso(values[idx("Date Of Birth")]),
          joining_date: joining,
          phone_no: idx("Phone No") >= 0 ? values[idx("Phone No")] || null : null,
          is_active: true,
        });
        await createAssignment({
          person_id: created.id,
          site_id: Number(importSiteId),
          from_date: joining,
          to_date: null,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    toast.success(`Imported ${ok} people${fail ? `, ${fail} skipped` : ""}.`);
    setImportFile(null);
    refresh();
  };

  const columns = [
    { key: "unique_code", header: "Code" },
    { key: "full_name", header: "Name" },
    { key: "designation", header: "Designation", render: (row) => row.designation || "—" },
    {
      key: "site",
      header: "Current site",
      render: (row) => siteName(assignmentsByPerson[row.id]?.current?.site_id),
    },
    { key: "joining_date", header: "Joined", render: (row) => formatDateDisplay(row.joining_date) },
    {
      key: "is_active",
      header: "Status",
      render: (row) => <StatusChip label={row.is_active === false ? "Inactive" : "Active"} severity={row.is_active === false ? "neutral" : "info"} />,
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="p-1 text-accent" onClick={() => openEdit(row)} aria-label="Edit person">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageTaskHeader title="People" subtitle="Site workers, assignments, and transfers.">
        <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs inline-flex items-center gap-1.5" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" /> New person
        </button>
      </PageTaskHeader>

      <FilterBar>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-secondary">Search</span>
          <TinyInput value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name or code" />
        </label>
      </FilterBar>

      <SectionCard title={loading ? "Loading…" : `${visiblePeople.length} people`}>
        <DenseTable columns={columns} rows={visiblePeople} rowKey="id" onRowClick={openEdit} />
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </SectionCard>

      <SectionCard title="CSV import">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px]">Site</span>
            <TinySelect value={importSiteId} onChange={(e) => setImportSiteId(e.target.value)}>
              <option value="">Select site</option>
              {typedSites.map((s) => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </TinySelect>
          </label>
          <input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="text-xs" />
          <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs inline-flex items-center gap-1" onClick={downloadSample}>
            <Download className="w-3.5 h-3.5" /> Sample
          </button>
          <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs" onClick={importCsv}>Import</button>
        </div>
      </SectionCard>

      <Drawer open={drawerOpen} title={editingId ? "Edit person" : "New person"} onClose={() => setDrawerOpen(false)} widthClass="max-w-xl">
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <span className="text-[11px]">Unique code *</span>
              <div className="flex gap-1">
                <TinyInput className="flex-1" value={form.unique_code} onChange={(e) => setField("unique_code", e.target.value)} />
                <button type="button" className="erp-btn-secondary rounded-control px-2 text-xs" onClick={async () => setField("unique_code", await generateUniqueCode())}>Generate</button>
              </div>
            </label>
            <label className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <span className="text-[11px]">Full name *</span>
              <TinyInput value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px]">Date of birth</span>
              <FormDateInput value={form.date_of_birth} compact onChange={(e) => setField("date_of_birth", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px]">Joining date *</span>
              <FormDateInput value={form.joining_date} compact onChange={(e) => setField("joining_date", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px]">Father name</span>
              <TinyInput value={form.father_name} onChange={(e) => setField("father_name", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px]">Phone</span>
              <TinyInput value={form.phone_no} onChange={(e) => setField("phone_no", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px]">Leaving date</span>
              <FormDateInput value={form.leaving_date} compact onChange={(e) => setField("leaving_date", e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-xs mt-5">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setField("is_active", e.target.checked)} /> Active
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.transfer} onChange={(e) => setField("transfer", e.target.checked)} /> Site transfer
          </label>

          {form.transfer ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-[11px]">New site</span>
                <TinySelect value={form.transfer_site_id} onChange={(e) => setField("transfer_site_id", e.target.value)}>
                  <option value="">Select</option>
                  {typedSites.map((s) => <option key={s.id} value={s.id}>{s.site_name}</option>)}
                </TinySelect>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px]">Transfer date</span>
                <FormDateInput value={form.transfer_date} compact onChange={(e) => setField("transfer_date", e.target.value)} />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-[11px]">Site *</span>
                <TinySelect
                  value={form.site_id}
                  onChange={async (e) => {
                    setField("site_id", e.target.value);
                    await loadDesigs(e.target.value);
                  }}
                >
                  <option value="">Select</option>
                  {typedSites.map((s) => <option key={s.id} value={s.id}>{s.site_name}</option>)}
                </TinySelect>
              </label>
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-[11px]">Designation</span>
                <TinySelect value={form.designation} onChange={(e) => setField("designation", e.target.value)}>
                  <option value="">Select</option>
                  {siteDesignations.map((d) => <option key={d.id} value={d.designation_name}>{d.designation_name}</option>)}
                </TinySelect>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px]">From date *</span>
                <FormDateInput value={form.from_date} compact onChange={(e) => setField("from_date", e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px]">To date</span>
                <FormDateInput value={form.to_date} compact onChange={(e) => setField("to_date", e.target.value)} />
              </label>
            </div>
          )}

          {history.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1">Assignment history</p>
              <ul className="text-[11px] text-ink-secondary space-y-0.5">
                {history.map((a) => (
                  <li key={a.id}>
                    {siteName(a.site_id)} · {formatDateDisplay(a.from_date)} → {a.to_date ? formatDateDisplay(a.to_date) : "current"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="erp-btn-secondary rounded-control px-3.5 py-2 text-xs" onClick={() => setDrawerOpen(false)}>Cancel</button>
            <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
