import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "../../../lib/toast";
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, Upload, X } from "lucide-react";
import { FormDateInput } from "../../../components/FormDateInput";
import {
  DenseTable,
  Drawer,
  FilterBar,
  KpiTile,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinyInput,
  TinySelect,
} from "../../adminOperations/components/AdminUi";
import { addDaysIso, formatDateDisplay, parseLooseDateToIso } from "../../../lib/siteAttendance/dateFormat";
import { filterSitesByType } from "../../../lib/siteAttendance/siteTypes";
import {
  countPeopleByStatus,
  createAssignment,
  createPerson,
  deletePerson,
  findPersonByCode,
  generateUniqueCode,
  listAllSites,
  listAssignments,
  listDesignationMaster,
  listPeopleForSites,
  listPeoplePage,
  listSiteDesignations,
  pickCurrentAssignment,
  updateAssignment,
  updatePerson,
  userFriendlyError,
  validateMaxWorkers,
} from "../../../lib/siteAttendance/siteAttendanceApi";
import { useSiteAttendanceAccess, useSiteAttendanceType } from "./SiteAttendanceLayout";
import { siteIdsForQuery } from "../../../lib/siteAttendance/siteAttendanceAccess";

const PAGE_SIZES = [25, 50, 100];

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

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function Field({ label, required, className = "", children }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`.trim()}>
      <span className="text-[11px] text-ink-secondary">
        {label}
        {required ? <span className="text-critical"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function pageWindow(page, pages) {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const end = Math.min(pages, start + 4);
  const list = [];
  for (let n = start; n <= end; n += 1) list.push(n);
  return list;
}

function Pager({ page, pageSize, total, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(total, page * pageSize);
  const btn =
    "h-8 min-w-8 px-2 rounded-control border text-xs inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-divider">
      <div className="flex items-center gap-2 text-xs text-ink-secondary">
        <span>
          Showing <span className="font-medium text-ink">{first}–{last}</span> of{" "}
          <span className="font-medium text-ink">{total}</span>
        </span>
        <span className="text-ink-muted">·</span>
        <span>Rows</span>
        <TinySelect value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Rows per page">
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </TinySelect>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className={`${btn} border-border bg-surface`} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pageWindow(page, pages).map((n) => (
          <button
            key={n}
            type="button"
            className={`${btn} ${n === page ? "border-accent-border bg-accent-soft text-ink font-semibold" : "border-border bg-surface text-ink-secondary"}`}
            onClick={() => onPage(n)}
            aria-current={n === page ? "page" : undefined}
          >
            {n}
          </button>
        ))}
        <button type="button" className={`${btn} border-border bg-surface`} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function PeopleMasterPage() {
  const { siteType } = useSiteAttendanceType();
  const access = useSiteAttendanceAccess();
  const [people, setPeople] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ total: 0, active: 0, inactive: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [designationFilter, setDesignationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [designationOptions, setDesignationOptions] = useState([]);
  const [sites, setSites] = useState([]);
  const [assignmentsByPerson, setAssignmentsByPerson] = useState({});
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [form, setForm] = useState(emptyPerson);
  const [siteDesignations, setSiteDesignations] = useState([]);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importSiteId, setImportSiteId] = useState("");
  const [importing, setImporting] = useState(false);
  const requestRef = useRef(0);

  const debouncedSearch = useDebounced(search);
  const typedSites = useMemo(() => filterSitesByType(sites, siteType), [sites, siteType]);
  const siteName = (id) => sites.find((s) => String(s.id) === String(id))?.site_name || "—";
  const hasFilters = Boolean(search || siteFilter || designationFilter || statusFilter);

  useEffect(() => {
    listDesignationMaster()
      .then((names) => setDesignationOptions((names || []).map((n) => (typeof n === "string" ? n : n?.designation_name)).filter(Boolean)))
      .catch(() => setDesignationOptions([]));
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const allSites = await listAllSites({ siteIds: siteIdsForQuery(access) });
      if (requestId !== requestRef.current) return;
      setSites(allSites);

      let rows;
      let byPerson;
      let nextTotal;
      let nextCounts;
      if (access.seesAllSites && !siteType && !siteFilter) {
        const [result, statusCounts] = await Promise.all([
          listPeoplePage({
            search: debouncedSearch,
            status: statusFilter,
            designation: designationFilter,
            from,
            to: from + pageSize - 1,
          }),
          countPeopleByStatus({ search: debouncedSearch, designation: designationFilter }),
        ]);
        rows = result.rows;
        nextTotal = result.count;
        nextCounts = statusCounts;
        const allAssigns = rows.length ? await listAssignments({ personIds: rows.map((p) => p.id) }) : [];
        byPerson = {};
        for (const p of rows) byPerson[p.id] = [];
        for (const a of allAssigns) (byPerson[a.person_id] ||= []).push(a);
      } else {
        const typedIds = filterSitesByType(allSites, siteType).map((s) => s.id);
        const siteIds = siteFilter ? typedIds.filter((id) => String(id) === String(siteFilter)) : typedIds;
        const result = await listPeopleForSites({ siteIds, search: debouncedSearch });
        let list = result.rows.filter((p) => !designationFilter || p.designation === designationFilter);
        const inactive = list.filter((p) => p.is_active === false).length;
        nextCounts = { total: list.length, active: list.length - inactive, inactive };
        if (statusFilter === "active") list = list.filter((p) => p.is_active !== false);
        if (statusFilter === "inactive") list = list.filter((p) => p.is_active === false);
        nextTotal = list.length;
        rows = list.slice(from, from + pageSize);
        byPerson = result.assignmentsByPerson;
      }
      if (requestId !== requestRef.current) return;

      setPeople(rows);
      setTotal(nextTotal);
      setCounts(nextCounts);
      const map = {};
      for (const p of rows) {
        const assigns = byPerson[p.id] || [];
        map[p.id] = { all: assigns, current: pickCurrentAssignment(assigns) };
      }
      setAssignmentsByPerson(map);
    } catch (err) {
      if (requestId === requestRef.current) toast.error(userFriendlyError(err));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, siteFilter, designationFilter, statusFilter, siteType, access.seesAllSites, access.allowedSiteIds]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setPage(1);
    setSiteFilter("");
  }, [siteType]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, siteFilter, designationFilter, statusFilter, pageSize]);

  useEffect(() => {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (!loading && page > pages) setPage(pages);
  }, [total, pageSize, page, loading]);

  const clearFilters = () => {
    setSearch("");
    setSiteFilter("");
    setDesignationFilter("");
    setStatusFilter("");
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const loadDesigs = async (siteId) => {
    if (!siteId) {
      setSiteDesignations([]);
      return;
    }
    setSiteDesignations(await listSiteDesignations(siteId));
  };

  const formDesignations = useMemo(() => {
    const names = siteDesignations.length
      ? siteDesignations.map((d) => d.designation_name)
      : designationOptions;
    const list = [...new Set(names.filter(Boolean))];
    if (form.designation && !list.includes(form.designation)) list.unshift(form.designation);
    return list;
  }, [siteDesignations, designationOptions, form.designation]);

  const openCreate = () => {
    setEditingId(null);
    setEditingAssignmentId(null);
    setForm(emptyPerson());
    setSiteDesignations([]);
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
    else setSiteDesignations([]);
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
      const sameCode = await findPersonByCode(personPayload.unique_code, editingId);
      if (sameCode) {
        toast.error(`Code ${personPayload.unique_code} is already used by ${sameCode.full_name || "another person"}. Use Generate for a new code.`);
        return;
      }

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
        if (form.to_date && form.to_date < form.from_date) {
          toast.error("Assignment to-date must be after the from-date.");
          return;
        }
        if (!editingAssignmentId) {
          const check = await validateMaxWorkers(Number(form.site_id), form.from_date, form.to_date || null);
          if (!check.allowed) {
            toast.error(check.message);
            return;
          }
        }
        let personId = editingId;
        let createdNow = false;
        if (editingId) await updatePerson(editingId, personPayload);
        else {
          const created = await createPerson(personPayload);
          if (!created?.id) throw new Error("Unable to create person.");
          personId = created.id;
          createdNow = true;
        }
        try {
          if (editingAssignmentId) {
            await updateAssignment(editingAssignmentId, {
              site_id: Number(form.site_id),
              from_date: form.from_date,
              to_date: form.to_date || null,
            });
          } else {
            await createAssignment({
              person_id: personId,
              site_id: Number(form.site_id),
              from_date: form.from_date,
              to_date: form.to_date || null,
            });
          }
        } catch (assignErr) {
          if (createdNow) await deletePerson(personId).catch(() => {});
          throw assignErr;
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
    setImporting(true);
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
      let created = null;
      try {
        created = await createPerson({
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
      } catch (err) {
        if (created?.id) await deletePerson(created.id).catch(() => {});
        console.error("People import row", i + 1, err);
        fail++;
      }
    }
    setImporting(false);
    toast.success(`Imported ${ok} people${fail ? `, ${fail} skipped` : ""}.`);
    setImportFile(null);
    setImportOpen(false);
    refresh();
  };

  const columns = [
    { key: "unique_code", label: "Code", render: (row) => <span className="font-medium tabular-nums">{row.unique_code}</span> },
    {
      key: "full_name",
      label: "Name",
      render: (row) => (
        <div className="min-w-[10rem]">
          <p className="text-ink font-medium">{row.full_name}</p>
          {row.phone_no ? <p className="text-[11px] text-ink-muted">{row.phone_no}</p> : null}
        </div>
      ),
    },
    { key: "designation", label: "Designation", render: (row) => row.designation || "—" },
    {
      key: "site",
      label: "Current site",
      render: (row) => {
        const current = assignmentsByPerson[row.id]?.current;
        if (!current) return <span className="text-ink-muted">Not assigned</span>;
        return (
          <div>
            <p className="text-ink">{siteName(current.site_id)}</p>
            <p className="text-[11px] text-ink-muted">
              {current.to_date ? `Until ${formatDateDisplay(current.to_date)}` : `Since ${formatDateDisplay(current.from_date)}`}
            </p>
          </div>
        );
      },
    },
    { key: "joining_date", label: "Joined", render: (row) => formatDateDisplay(row.joining_date) },
    {
      key: "is_active",
      label: "Status",
      render: (row) => <StatusChip label={row.is_active === false ? "Inactive" : "Active"} severity={row.is_active === false ? "neutral" : "info"} />,
    },
    {
      key: "actions",
      label: "",
      render: (row) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="p-1 rounded hover:bg-accent-soft text-accent" onClick={() => openEdit(row)} aria-label="Edit person">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const statusTile = (key, label, value) => (
    <KpiTile
      label={label}
      value={loading && !counts.total ? "…" : value}
      onClick={() => setStatusFilter(key)}
      tone={statusFilter === key ? "border-accent-border ring-1 ring-accent-border" : "border-border"}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <PageTaskHeader title="People" subtitle="Site workers, their current site and transfers.">
        <button
          type="button"
          className="erp-btn-secondary rounded-control px-3 py-2 text-xs inline-flex items-center gap-1.5"
          onClick={() => setImportOpen(true)}
        >
          <Upload className="w-3.5 h-3.5" /> Import
        </button>
        <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs inline-flex items-center gap-1.5" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" /> New person
        </button>
      </PageTaskHeader>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        {statusTile("", "All people", counts.total)}
        {statusTile("active", "Active", counts.active)}
        {statusTile("inactive", "Inactive", counts.inactive)}
      </div>

      <FilterBar>
        <Field label="Search" className="min-w-[14rem] flex-1 max-w-xs">
          <TinyInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or code" />
        </Field>
        <Field label="Site" className="min-w-[12rem]">
          <TinySelect value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            <option value="">All sites</option>
            {typedSites.map((s) => (
              <option key={s.id} value={s.id}>{s.site_name}</option>
            ))}
          </TinySelect>
        </Field>
        <Field label="Designation" className="min-w-[10rem]">
          <TinySelect value={designationFilter} onChange={(e) => setDesignationFilter(e.target.value)}>
            <option value="">All designations</option>
            {designationOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </TinySelect>
        </Field>
        <Field label="Status" className="min-w-[8rem]">
          <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </TinySelect>
        </Field>
        {hasFilters ? (
          <button type="button" className="h-8 px-2.5 text-xs text-ink-secondary hover:text-ink inline-flex items-center gap-1" onClick={clearFilters}>
            <X className="w-3.5 h-3.5" /> Clear filters
          </button>
        ) : null}
      </FilterBar>

      <SectionCard title={loading ? "Loading…" : `${total} ${total === 1 ? "person" : "people"}`}>
        {!loading && people.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-muted">
            {hasFilters ? "No people match these filters." : "No people yet. Use New person to add one."}
          </div>
        ) : (
          <DenseTable
            columns={columns}
            rows={people}
            rowKey="id"
            onRowClick={openEdit}
            showSerialNumber
            serialOffset={(page - 1) * pageSize}
          />
        )}
        <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
      </SectionCard>

      <Drawer open={importOpen} title="Import people" onClose={() => setImportOpen(false)} widthClass="max-w-md">
        <div className="space-y-4 text-sm">
          <p className="text-xs text-ink-secondary">
            Upload a CSV with Code, Employee Name, Designation, Father Name, Date Of Birth and Date of Joining. Everyone is assigned to the site you pick from their joining date.
          </p>
          <Field label="Site" required>
            <TinySelect value={importSiteId} onChange={(e) => setImportSiteId(e.target.value)}>
              <option value="">Select site</option>
              {typedSites.map((s) => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </TinySelect>
          </Field>
          <Field label="CSV file" required>
            <input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="text-xs" />
          </Field>
          <div className="flex justify-between gap-2 pt-2">
            <button type="button" className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs inline-flex items-center gap-1" onClick={downloadSample}>
              <Download className="w-3.5 h-3.5" /> Sample file
            </button>
            <button type="button" className="erp-btn-primary rounded-control px-3.5 py-2 text-xs" disabled={importing} onClick={importCsv}>
              {importing ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      </Drawer>

      <Drawer open={drawerOpen} title={editingId ? "Edit person" : "New person"} onClose={() => setDrawerOpen(false)} widthClass="max-w-xl">
        <div className="space-y-5 text-sm">
          <section className="space-y-3">
            <p className="text-xs font-semibold text-ink">Personal details</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unique code" required className="col-span-2 sm:col-span-1">
                <div className="flex gap-1">
                  <TinyInput className="flex-1" value={form.unique_code} onChange={(e) => setField("unique_code", e.target.value)} />
                  <button
                    type="button"
                    className="erp-btn-secondary rounded-control px-2 text-xs"
                    onClick={async () => {
                      try {
                        setField("unique_code", await generateUniqueCode());
                      } catch (err) {
                        toast.error(userFriendlyError(err));
                      }
                    }}
                  >
                    Generate
                  </button>
                </div>
              </Field>
              <Field label="Full name" required className="col-span-2 sm:col-span-1">
                <TinyInput value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} />
              </Field>
              <Field label="Father name">
                <TinyInput value={form.father_name} onChange={(e) => setField("father_name", e.target.value)} />
              </Field>
              <Field label="Phone">
                <TinyInput value={form.phone_no} onChange={(e) => setField("phone_no", e.target.value)} />
              </Field>
              <Field label="Date of birth">
                <FormDateInput value={form.date_of_birth} compact onChange={(e) => setField("date_of_birth", e.target.value)} />
              </Field>
              <Field label="Joining date" required>
                <FormDateInput value={form.joining_date} compact onChange={(e) => setField("joining_date", e.target.value)} />
              </Field>
              <Field label="Leaving date">
                <FormDateInput value={form.leaving_date} compact onChange={(e) => setField("leaving_date", e.target.value)} />
              </Field>
              <label className="flex items-center gap-2 text-xs mt-5">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setField("is_active", e.target.checked)} /> Active
              </label>
            </div>
          </section>

          <section className="space-y-3 pt-4 border-t border-divider">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-ink">Site assignment</p>
              {editingId ? (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.transfer} onChange={(e) => setField("transfer", e.target.checked)} /> Transfer to another site
                </label>
              ) : null}
            </div>

            {form.transfer ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="New site" required className="col-span-2">
                  <TinySelect value={form.transfer_site_id} onChange={(e) => setField("transfer_site_id", e.target.value)}>
                    <option value="">Select</option>
                    {typedSites.map((s) => <option key={s.id} value={s.id}>{s.site_name}</option>)}
                  </TinySelect>
                </Field>
                <Field label="Transfer date" required>
                  <FormDateInput value={form.transfer_date} compact onChange={(e) => setField("transfer_date", e.target.value)} />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Site" required className="col-span-2">
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
                </Field>
                <Field label="Designation" className="col-span-2">
                  <TinySelect value={form.designation} onChange={(e) => setField("designation", e.target.value)}>
                    <option value="">Select</option>
                    {formDesignations.map((d) => <option key={d} value={d}>{d}</option>)}
                  </TinySelect>
                </Field>
                <Field label="From date" required>
                  <FormDateInput value={form.from_date} compact onChange={(e) => setField("from_date", e.target.value)} />
                </Field>
                <Field label="To date">
                  <FormDateInput value={form.to_date} compact onChange={(e) => setField("to_date", e.target.value)} />
                </Field>
              </div>
            )}
          </section>

          {history.length > 0 && (
            <section className="pt-4 border-t border-divider">
              <p className="text-xs font-semibold text-ink mb-2">Assignment history</p>
              <ul className="text-[11px] text-ink-secondary space-y-1">
                {history.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span className="text-ink">{siteName(a.site_id)}</span>
                    <span>
                      {formatDateDisplay(a.from_date)} → {a.to_date ? formatDateDisplay(a.to_date) : "current"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
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
