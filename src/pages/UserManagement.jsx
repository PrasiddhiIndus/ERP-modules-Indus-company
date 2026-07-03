import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase, parseEdgeFunctionError } from "../lib/supabase";
import { createUserAccount } from "../lib/userManagementCreateApi";
import { bulkDeleteUsers } from "../lib/userManagementBulkApi";
import {
  DEFAULT_USER_MGMT_FILTERS,
  fetchUserManagementProfiles,
  hasActiveUserMgmtFilters,
  USER_MGMT_LINK_FILTER_OPTIONS,
  USER_MGMT_PAGE_SIZES,
  USER_MGMT_SORT_OPTIONS,
  userMgmtPageAfterDelete,
  userMgmtTotalPages,
} from "../lib/userManagementListApi";
import {
  EMP_CODE_MIGRATION_HINT,
  getEmpCodeColumnSupported,
  setEmpCodeColumnSupported,
} from "../lib/profileSelect";
import { persistUserProfile } from "../lib/userManagementApi";
import {
  employeeMasterToEditHierarchyFields,
  enrichProfileWithHierarchy,
  fetchEmployeeHierarchyByEmpCode,
  fetchEmployeeHierarchyForProfiles,
  fetchManagerCandidates,
  managerDisplayLabel,
  saveEmployeeHierarchyManagers,
} from "../lib/userManagementHierarchy";
import { ManagerSearchSelect } from "../components/employee/ManagerSearchSelect";
import { ROLES, MODULES, resolveTeamModuleKey } from "../config/roles";
import {
  fetchEmployeeMasterDepartments,
  mergeEmployeeMasterDepartments,
} from "../lib/employeeMasterDepartments";
import {
  Users,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
  Shield,
  Lock,
  Plus,
  Trash2,
  Search,
  RotateCcw,
  FileSpreadsheet,
} from "lucide-react";
import { UserManagementBulkImportModal } from "./userManagement/UserManagementBulkImportModal";
import { canCreateUsers as userCanCreateUsers } from "./userManagement/userManagementLabels";

const SEARCH_DEBOUNCE_MS = 350;

const roleLabel = (role) => {
  if (role === ROLES.SUPER_ADMIN_PRO) return "Super Admin Pro";
  if (role === ROLES.SUPER_ADMIN) return "Super Admin";
  if (role === ROLES.ADMIN) return "Admin";
  if (role === ROLES.MANAGER) return "Manager";
  if (role === ROLES.EXECUTIVE) return "Executive";
  return role || "—";
};

const teamLabel = (value) => value ?? "—";
const moduleLabel = (value) =>
  MODULES.find((m) => m.value === value)?.label ?? teamLabel(value);
const selectableExtraModules = (team) => {
  const teamKey = resolveTeamModuleKey(team);
  return MODULES.filter(
    (m) => m.value !== "userManagement" && m.value !== teamKey
  );
};

const UserManagement = () => {
  const { userProfile } = useAuth();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(USER_MGMT_PAGE_SIZES[0]);
  const [filters, setFilters] = useState(DEFAULT_USER_MGMT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const loadSeqRef = useRef(0);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({
    username: "",
    employee_code: "",
    team: "",
    role: ROLES.EXECUTIVE,
    allowed_modules: [],
    employee_master_id: null,
    employee_master_employee_id: null,
    linked_employee_code: null,
    hierarchy_sort_order: null,
    l1_manager_code: "",
    l1_manager_name: "",
    l2_manager_code: "",
    l2_manager_name: "",
  });
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    username: "",
    employee_code: "",
    team: "",
    role: ROLES.EXECUTIVE,
    allowed_modules: [],
  });
  const [empCodeSupported, setEmpCodeSupported] = useState(getEmpCodeColumnSupported);
  const [hierarchySupported, setHierarchySupported] = useState(true);
  const [managerCandidates, setManagerCandidates] = useState([]);
  const [editMasterLookup, setEditMasterLookup] = useState({ loading: false, name: "" });
  const [saveNotice, setSaveNotice] = useState("");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState(() => new Map());
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [teamDepartments, setTeamDepartments] = useState(() =>
    mergeEmployeeMasterDepartments([])
  );
  const [teamDepartmentsLoading, setTeamDepartmentsLoading] = useState(true);

  const canUseUserManagement =
    userProfile?.role === ROLES.SUPER_ADMIN ||
    userProfile?.role === ROLES.SUPER_ADMIN_PRO;

  const canBulkManageUsers = userCanCreateUsers(userProfile);

  const teamOptionsForSelect = useCallback(
    (currentValue) => {
      const cur = String(currentValue || "").trim();
      if (!cur) return teamDepartments;
      const exists = teamDepartments.some(
        (d) => d.toLowerCase() === cur.toLowerCase()
      );
      return exists ? teamDepartments : [cur, ...teamDepartments];
    },
    [teamDepartments]
  );

  const activeFilters = useMemo(
    () => ({ ...filters, search: searchDebounced }),
    [filters, searchDebounced]
  );

  const filtersActive = hasActiveUserMgmtFilters(activeFilters);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTeamDepartmentsLoading(true);
      try {
        const fromDb = await fetchEmployeeMasterDepartments(supabase);
        if (!cancelled) setTeamDepartments(fromDb);
      } catch {
        if (!cancelled) {
          setTeamDepartments(mergeEmployeeMasterDepartments([]));
        }
      } finally {
        if (!cancelled) setTeamDepartmentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchDebounced(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [searchDebounced]);

  const enrichProfilesWithHierarchy = useCallback(
    async (profiles) => {
      const emptyLookups = { byCode: new Map() };
      if (!profiles?.length || hierarchySupported === false) {
        return (profiles ?? []).map((p) => enrichProfileWithHierarchy(p, emptyLookups));
      }
      try {
        const lookups = await fetchEmployeeHierarchyForProfiles(supabase, profiles);
        setHierarchySupported(true);
        return profiles.map((p) => enrichProfileWithHierarchy(p, lookups));
      } catch (hErr) {
        const msg = String(hErr?.message || hErr || "").toLowerCase();
        if (msg.includes("l1_manager") && msg.includes("does not exist")) {
          setHierarchySupported(false);
        }
        return (profiles ?? []).map((p) => enrichProfileWithHierarchy(p, emptyLookups));
      }
    },
    [hierarchySupported]
  );

  const loadProfiles = useCallback(
    async ({ pageNum = page, silent = false } = {}) => {
      const seq = ++loadSeqRef.current;
      if (!silent) setLoading(true);

      try {
        const result = await fetchUserManagementProfiles(supabase, {
          page: pageNum,
          pageSize,
          filters: activeFilters,
          preferEmpCode: empCodeSupported !== false,
        });

        if (seq !== loadSeqRef.current) return null;

        if (result.empCodeSupported === false) {
          setEmpCodeSupported(false);
          setEmpCodeColumnSupported(false);
        } else if (!result.error) {
          setEmpCodeSupported(true);
          setEmpCodeColumnSupported(true);
        }

        if (result.error) {
          setError(
            `${result.error.message || result.error || "Unable to load users."}\n\n` +
              "This screen reads from the table public.profiles. Ensure the profiles migration is applied and RLS allows Admin/Super Admin to SELECT all profiles."
          );
          setList([]);
          setTotal(0);
          return null;
        }

        const enriched = await enrichProfilesWithHierarchy(result.data ?? []);
        if (seq !== loadSeqRef.current) return null;

        const count = result.count ?? 0;
        const totalPages = userMgmtTotalPages(count, pageSize);
        const resolvedPage = Math.min(Math.max(1, pageNum), totalPages);

        if (resolvedPage !== pageNum) {
          setPage(resolvedPage);
          return loadProfiles({ pageNum: resolvedPage, silent: true });
        }

        setList(enriched);
        setTotal(count);
        setError("");
        return enriched;
      } catch (_) {
        if (seq !== loadSeqRef.current) return null;
        setError("Unable to load users.");
        setList([]);
        setTotal(0);
        return null;
      } finally {
        if (seq === loadSeqRef.current && !silent) setLoading(false);
      }
    },
    [page, pageSize, activeFilters, empCodeSupported, enrichProfilesWithHierarchy]
  );

  const tableColSpan =
    7 +
    (empCodeSupported !== false ? 1 : 0) +
    (hierarchySupported !== false ? 2 : 0) +
    (canBulkManageUsers ? 1 : 0);

  const pageUserIds = useMemo(
    () => list.map((row) => row.id).filter(Boolean),
    [list]
  );

  const allPageUsersSelected =
    pageUserIds.length > 0 && pageUserIds.every((id) => selectedUsers.has(id));

  const toggleSelectUser = (row) => {
    if (!row?.id) return;
    setSelectedUsers((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) {
        next.delete(row.id);
      } else {
        next.set(row.id, {
          email: row.email,
          employee_code: row.employee_code || row.linked_employee_code || null,
        });
      }
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedUsers((prev) => {
      const next = new Map(prev);
      if (allPageUsersSelected) {
        pageUserIds.forEach((id) => next.delete(id));
      } else {
        list.forEach((row) => {
          if (!row?.id) return;
          next.set(row.id, {
            email: row.email,
            employee_code: row.employee_code || row.linked_employee_code || null,
          });
        });
      }
      return next;
    });
  };

  const editManagerCandidates = useMemo(() => {
    const excludeId = editForm.employee_master_id;
    return managerCandidates.filter((row) => !excludeId || row.id !== excludeId);
  }, [managerCandidates, editForm.employee_master_id]);

  useEffect(() => {
    if (!canUseUserManagement) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchManagerCandidates(supabase);
        if (!cancelled) setManagerCandidates(rows);
      } catch {
        if (!cancelled) setManagerCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canUseUserManagement]);

  useEffect(() => {
    if (!canUseUserManagement) return;
    loadProfiles();
  }, [canUseUserManagement, loadProfiles]);

  const resetFilters = () => {
    setSearchInput("");
    setSearchDebounced("");
    setFilters(DEFAULT_USER_MGMT_FILTERS);
    setPage(1);
  };

  const updateFilter = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  useEffect(() => {
    if (!editId || hierarchySupported === false) return undefined;
    const code = String(editForm.employee_code || "").trim();
    if (!code) {
      setEditForm((f) => ({
        ...f,
        ...employeeMasterToEditHierarchyFields(null),
      }));
      setEditMasterLookup({ loading: false, name: "" });
      return undefined;
    }

    let cancelled = false;
    setEditMasterLookup((s) => ({ ...s, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const masterRow = await fetchEmployeeHierarchyByEmpCode(supabase, code);
        if (cancelled) return;
        const hierarchyFields = employeeMasterToEditHierarchyFields(masterRow);
        const fullName = masterRow?.full_name ? String(masterRow.full_name).trim() : "";
        setEditForm((f) => ({
          ...f,
          ...hierarchyFields,
          ...(fullName ? { username: fullName } : {}),
        }));
        setEditMasterLookup({
          loading: false,
          name: masterRow?.full_name ? String(masterRow.full_name).trim() : "",
        });
      } catch {
        if (!cancelled) {
          setEditMasterLookup({ loading: false, name: "" });
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [editId, editForm.employee_code, hierarchySupported]);

  useEffect(() => {
    if (!createOpen) return undefined;
    const code = String(createForm.employee_code || "").trim();
    if (!code) {
      setCreateForm((f) => ({ ...f, username: "" }));
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const masterRow = await fetchEmployeeHierarchyByEmpCode(supabase, code);
        if (cancelled) return;
        const fullName = masterRow?.full_name ? String(masterRow.full_name).trim() : "";
        setCreateForm((f) => ({ ...f, username: fullName }));
      } catch {
        if (!cancelled) setCreateForm((f) => ({ ...f, username: "" }));
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [createOpen, createForm.employee_code]);

  const openEdit = (row) => {
    setEditMasterLookup({
      loading: false,
      name: row.linked_employee_code ? "" : "",
    });
    setEditId(row.id);
    setEditForm({
      username: row.username ?? "",
      employee_code: row.employee_code ?? "",
      team: row.team ?? "",
      role: row.role ?? ROLES.EXECUTIVE,
      allowed_modules: Array.isArray(row.allowed_modules) ? [...row.allowed_modules] : [],
      employee_master_id: row.employee_master_id ?? null,
      employee_master_employee_id: row.employee_master_employee_id ?? null,
      linked_employee_code: row.linked_employee_code ?? null,
      hierarchy_sort_order: row.hierarchy_sort_order ?? null,
      l1_manager_code: row.l1_manager_code ?? "",
      l1_manager_name: row.l1_manager_name ?? "",
      l2_manager_code: row.l2_manager_code ?? "",
      l2_manager_name: row.l2_manager_name ?? "",
    });
  };

  const closeEdit = () => {
    setEditId(null);
    setEditMasterLookup({ loading: false, name: "" });
    setSaving(false);
  };

  const toggleModule = (value) => {
    setEditForm((prev) => ({
      ...prev,
      allowed_modules: prev.allowed_modules.includes(value)
        ? prev.allowed_modules.filter((m) => m !== value)
        : [...prev.allowed_modules, value],
    }));
  };

  const reloadProfilesPage = async (pageNum = page) => {
    const enriched = await loadProfiles({ pageNum, silent: false });
    return enriched ?? [];
  };

  const handleBulkOperationComplete = async (data) => {
    const summary = data?.summary;
    if (summary) {
      const succeeded = summary.created ?? summary.deleted ?? 0;
      const failed = summary.failed ?? 0;
      setSaveNotice(`Bulk operation finished. Succeeded: ${succeeded}, failed: ${failed}.`);
    }
    setPage(1);
    await reloadProfilesPage(1);
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    setError("");
    setSaveNotice("");
    const warnings = [];
    try {
      const newEmpCode = String(editForm.employee_code || "").trim() || null;
      const username = String(editForm.username || "").trim() || null;
      const profilePayload = {
        id: editId,
        username,
        team: editForm.team || null,
        role: editForm.role,
        allowed_modules: editForm.allowed_modules,
        employee_code: newEmpCode,
        includeEmployeeCode: empCodeSupported !== false,
      };

      const profileResult = await persistUserProfile(supabase, profilePayload);
      if (!profileResult.ok) {
        setError(profileResult.message || "Could not save user profile.");
        return;
      }

      if (hierarchySupported !== false) {
        const masterRow = await fetchEmployeeHierarchyByEmpCode(supabase, newEmpCode);
        const masterId = masterRow?.id ?? null;
        const masterEmployeeId = masterRow?.employee_id ?? null;
        const masterEmpCode =
          masterRow?.employee_code ?? (newEmpCode || editForm.linked_employee_code || null);

        const hasManagerEdits =
          String(editForm.l1_manager_code || "").trim() ||
          String(editForm.l2_manager_code || "").trim();

        if (masterId) {
          const hierarchyResult = await saveEmployeeHierarchyManagers(supabase, {
            employeeMasterId: masterId,
            empCode: masterEmpCode,
            employeeId: masterEmployeeId,
            l1Code: editForm.l1_manager_code,
            l2Code: editForm.l2_manager_code,
            hierarchySortOrder: editForm.hierarchy_sort_order,
            employees: managerCandidates,
          });
          if (!hierarchyResult.ok) {
            warnings.push(
              hierarchyResult.message || "Profile saved, but L1/L2 managers could not be updated."
            );
          }
        } else if (hasManagerEdits) {
          warnings.push(
            "Profile saved. L1/L2 managers were not saved — set an employee code that exists on Employee Master first."
          );
        }
      }

      await reloadProfilesPage();
      closeEdit();
      if (warnings.length) {
        setSaveNotice(warnings.join(" "));
      } else {
        setSaveNotice("User saved successfully.");
      }
    } catch (e) {
      setError(e?.message || "Unable to save.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSelectedUsers = async () => {
    if (!selectedUsers.size) return;

    const msg = `Permanently delete ${selectedUsers.size} selected user(s)? This cannot be undone.`;
    if (!window.confirm(msg)) return;

    setBulkDeleteBusy(true);
    setError("");
    try {
      const users = Array.from(selectedUsers.values()).map((row, index) => ({
        row: index + 1,
        email: row.email || undefined,
        employee_code: row.employee_code || undefined,
      }));

      const outcome = await bulkDeleteUsers(supabase, users, { dryRun: false });
      if (!outcome.ok) {
        setError(outcome.message || "Could not delete selected users.");
        return;
      }

      const failed = (outcome.data?.results || []).filter((r) => !r.ok);
      if (failed.length) {
        setError(
          failed
            .map((r) => `${r.email || r.employee_code || `Row ${r.row}`}: ${r.error}`)
            .join("\n")
        );
      }

      setSelectedUsers(new Map());
      await handleBulkOperationComplete(outcome.data);
    } catch (e) {
      setError(e?.message || "Could not delete selected users.");
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  const deleteUser = async (row) => {
    if (!row?.id) return;
    if (!window.confirm(`Delete user ${row.email || row.username || row.id}? This cannot be undone.`)) return;
    setSaving(true);
    setError("");
    try {
      const { data: delData, error: delErr } = await supabase.functions.invoke("admin-delete-user", {
        body: { id: row.id },
      });
      if (delErr) {
        setError(await parseEdgeFunctionError(delErr, delData));
        return;
      }
      const nextTotal = Math.max(0, (Number(total) || 0) - 1);
      const nextPage = userMgmtPageAfterDelete(page, nextTotal, pageSize);
      setPage(nextPage);
      await loadProfiles({ pageNum: nextPage, silent: true });
    } catch (_) {
      setError("Unable to delete user.");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = userMgmtTotalPages(total, pageSize);
  const currentPage = Math.min(page, totalPages);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  const sortOptions = useMemo(
    () =>
      empCodeSupported === false
        ? USER_MGMT_SORT_OPTIONS.filter((o) => o.value !== "employee_code_asc")
        : USER_MGMT_SORT_OPTIONS,
    [empCodeSupported]
  );

  const linkFilterOptions = useMemo(
    () =>
      empCodeSupported === false
        ? USER_MGMT_LINK_FILTER_OPTIONS.filter((o) => o.value === "all")
        : USER_MGMT_LINK_FILTER_OPTIONS,
    [empCodeSupported]
  );

  if (!canUseUserManagement) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-amber-800">
          Only Super Admin can access User Management.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-indigo-100">
          <Users className="w-6 h-6 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500">
            Team and Extra modules are editable for executives and managers. L1/L2 managers are read
            from Employee Master (<span className="font-mono">admin_ifsp_employee_master</span>) by emp code.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            setError("");
            setCreateForm({
              email: "",
              password: "",
              username: "",
              employee_code: "",
              team: "",
              role: ROLES.EXECUTIVE,
              allowed_modules: [],
            });
          }}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          Create user
        </button>
        {canBulkManageUsers ? (
          <button
            type="button"
            onClick={() => {
              setBulkImportOpen(true);
              setError("");
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-sm font-semibold"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Bulk import
          </button>
        ) : null}
      </div>

      {empCodeSupported === false && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900 text-sm">
          <p className="font-semibold">Employee code column not in database yet</p>
          <p className="mt-1">{EMP_CODE_MIGRATION_HINT}</p>
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-amber-800 underline hover:text-amber-950"
            onClick={() => {
              try {
                sessionStorage.removeItem("profiles_employee_code_supported");
              } catch {
                /* ignore */
              }
              setEmpCodeSupported(null);
              window.location.reload();
            }}
          >
            Re-check after running migration
          </button>
        </div>
      )}

      {saveNotice && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm whitespace-pre-wrap ${
            saveNotice.includes("not saved") || saveNotice.includes("could not")
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-emerald-50 border-emerald-200 text-emerald-900"
          }`}
        >
          {saveNotice}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm whitespace-pre-wrap">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50/60">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] max-w-md">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Email, username, or emp code…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="min-w-[140px]">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Role
              </label>
              <select
                value={filters.role}
                onChange={(e) => updateFilter({ role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">All roles</option>
                <option value={ROLES.EXECUTIVE}>Executive</option>
                <option value={ROLES.MANAGER}>Manager</option>
                <option value={ROLES.ADMIN}>Admin</option>
                <option value={ROLES.SUPER_ADMIN}>Super Admin</option>
                <option value={ROLES.SUPER_ADMIN_PRO}>Super Admin Pro</option>
              </select>
            </div>
            <div className="min-w-[160px]">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Team
              </label>
              <select
                value={filters.team}
                onChange={(e) => updateFilter({ team: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">All teams</option>
                {teamDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
            {empCodeSupported !== false ? (
              <div className="min-w-[150px]">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Emp code
                </label>
                <select
                  value={filters.linkStatus}
                  onChange={(e) => updateFilter({ linkStatus: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {linkFilterOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="min-w-[150px]">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Sort
              </label>
              <select
                value={filters.sort}
                onChange={(e) => updateFilter({ sort: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {sortOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <button
                type="button"
                onClick={resetFilters}
                disabled={!filtersActive && !searchInput}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
                Clear
              </button>
              <button
                type="button"
                onClick={() => loadProfiles({ silent: false })}
                disabled={loading}
                className="px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
          </div>
          {filtersActive ? (
            <p className="mt-2 text-xs text-gray-500">
              Filters applied — showing matching users only.
            </p>
          ) : null}
        </div>

        {canBulkManageUsers && selectedUsers.size > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-red-100 bg-red-50/60">
            <p className="text-sm text-gray-700">
              {selectedUsers.size} user{selectedUsers.size === 1 ? "" : "s"} selected
            </p>
            <button
              type="button"
              onClick={deleteSelectedUsers}
              disabled={bulkDeleteBusy || saving}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 text-sm font-semibold"
            >
              <Trash2 className="w-4 h-4" />
              {bulkDeleteBusy ? "Deleting…" : "Delete selected"}
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                {canBulkManageUsers ? (
                  <th className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allPageUsersSelected}
                      onChange={toggleSelectAllOnPage}
                      disabled={loading || list.length === 0}
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                      aria-label="Select all users on this page"
                    />
                  </th>
                ) : null}
                <th className="text-center py-3 px-4 font-semibold text-gray-700">S.No</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Username</th>
                {empCodeSupported !== false && (
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Emp code</th>
                )}
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Team</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Role</th>
                {hierarchySupported !== false && (
                  <>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">L1 Manager</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">L2 Manager</th>
                  </>
                )}
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Extra modules</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={tableColSpan} className="py-8 text-center text-gray-500">
                    Loading users…
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="py-8 text-center text-gray-500">
                    {filtersActive
                      ? "No users match the current filters."
                      : "No users found. Run the profiles migration if needed."}
                  </td>
                </tr>
              ) : (
                list.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {canBulkManageUsers ? (
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(row.id)}
                          onChange={() => toggleSelectUser(row)}
                          className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                          aria-label={`Select ${row.email || row.username || "user"}`}
                        />
                      </td>
                    ) : null}
                    <td className="py-3 px-4 text-center tabular-nums">
                      {rangeStart + idx}
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-900">{row.username || "—"}</td>
                    {empCodeSupported !== false && (
                      <td className="py-3 px-4 font-mono text-gray-700">
                        {row.employee_code || row.linked_employee_code || "—"}
                      </td>
                    )}
                    <td className="py-3 px-4 text-gray-600">{row.email || "—"}</td>
                    <td className="py-3 px-4 text-gray-600">{teamLabel(row.team)}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-gray-700">
                        <Shield className="w-3.5 h-3.5" />
                        {roleLabel(row.role)}
                      </span>
                    </td>
                    {hierarchySupported !== false && (
                      <>
                        <td className="py-3 px-4 text-gray-600 text-xs">
                          {managerDisplayLabel(row.l1_manager_code, row.l1_manager_name)}
                        </td>
                        <td className="py-3 px-4 text-gray-600 text-xs">
                          {managerDisplayLabel(row.l2_manager_code, row.l2_manager_name)}
                        </td>
                      </>
                    )}
                    <td className="py-3 px-4 text-gray-600">
                      {Array.isArray(row.allowed_modules) && row.allowed_modules.length
                        ? row.allowed_modules.map((m) => moduleLabel(m)).join(", ")
                        : "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-xs font-medium"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit access
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteUser(row)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-medium"
                          title="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-600">
            {total === 0
              ? "No users to display"
              : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
            {filtersActive ? " (filtered)" : ""}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <span className="whitespace-nowrap">Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
              >
                {USER_MGMT_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={!canPrev}
                className="px-2 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                First
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!canPrev}
                className="p-2 rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-600 tabular-nums min-w-[7rem] text-center">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={!canNext}
                className="p-2 rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                aria-label="Next page"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={!canNext}
                className="px-2 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Edit user access</h2>
              <button
                type="button"
                onClick={closeEdit}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Passwords cannot be changed here.
              </p>

              {empCodeSupported !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emp code</label>
                  <input
                    value={editForm.employee_code}
                    onChange={(e) => setEditForm((f) => ({ ...f, employee_code: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Unique employee code"
                  />
                  <p className="mt-1 text-xs text-gray-500">Must be unique across all users (case-insensitive).</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  value={editForm.username}
                  onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Display name (Employee Master full name)"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Defaults from Employee Master full name when emp code is set.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Team (Employee Master department)
                </label>
                <select
                  value={editForm.team}
                  onChange={(e) => setEditForm((f) => ({ ...f, team: e.target.value }))}
                  disabled={teamDepartmentsLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Select team</option>
                  {teamOptionsForSelect(editForm.team).map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value={ROLES.EXECUTIVE}>Executive</option>
                  <option value={ROLES.MANAGER}>Manager</option>
                  <option value={ROLES.ADMIN}>Admin (assigned modules)</option>
                  <option value={ROLES.SUPER_ADMIN}>Super Admin</option>
                </select>
              </div>

              {hierarchySupported !== false && empCodeSupported !== false && (
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <p className="text-sm font-medium text-gray-800">Reporting managers</p>
                  <p className="text-xs text-gray-500">
                    Stored on Employee Master (<span className="font-mono">admin_ifsp_employee_master</span>),
                    matched by employee code.
                  </p>
                  {editMasterLookup.loading ? (
                    <p className="text-xs text-gray-500">Looking up Employee Master…</p>
                  ) : null}
                  {editForm.employee_master_id && editMasterLookup.name ? (
                    <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                      Linked to Employee Master: <span className="font-semibold">{editMasterLookup.name}</span>
                      {editForm.linked_employee_code ? (
                        <span className="font-mono"> ({editForm.linked_employee_code})</span>
                      ) : null}
                    </p>
                  ) : null}
                  {!editMasterLookup.loading && !editForm.employee_master_id ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      No Employee Master row matches employee code{" "}
                      <span className="font-mono">{String(editForm.employee_code || "").trim() || "—"}</span>.
                      Add or update the employee on Admin → Employee Master first.
                    </p>
                  ) : null}
                  <ManagerSearchSelect
                    label="L1 Manager (direct)"
                    valueCode={editForm.l1_manager_code}
                    valueName={editForm.l1_manager_name}
                    candidates={editManagerCandidates}
                    disabled={!editForm.employee_master_id}
                    onChange={({ code, name }) =>
                      setEditForm((f) => ({
                        ...f,
                        l1_manager_code: code,
                        l1_manager_name: name,
                      }))
                    }
                  />
                  <ManagerSearchSelect
                    label="L2 Manager (skip-level)"
                    hint="Used for leave approval routing and org chart."
                    valueCode={editForm.l2_manager_code}
                    valueName={editForm.l2_manager_name}
                    candidates={editManagerCandidates}
                    disabled={!editForm.employee_master_id}
                    onChange={({ code, name }) =>
                      setEditForm((f) => ({
                        ...f,
                        l2_manager_code: code,
                        l2_manager_name: name,
                      }))
                    }
                  />
                </div>
              )}

              {editForm.role !== ROLES.SUPER_ADMIN && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Extra editable modules
                  </label>
                  <div className="border border-gray-200 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                    {selectableExtraModules(editForm.team).map((m) => (
                      <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editForm.allowed_modules.includes(m.value)}
                          onChange={() => toggleModule(m.value)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                type="button"
                onClick={closeEdit}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create user modal (Super Admin only) */}
      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Create user</h2>
                <p className="text-xs text-gray-500">Creates an Auth user + profile (Edge Function).</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    value={createForm.email}
                    onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="user@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temporary password</label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Set a temporary password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    value={createForm.username}
                    onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Filled from Employee Master full name"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Auto-filled from Employee Master when emp code is entered.
                  </p>
                </div>
                {empCodeSupported !== false ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Emp code *</label>
                    <input
                      value={createForm.employee_code}
                      onChange={(e) => setCreateForm((p) => ({ ...p, employee_code: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono"
                      placeholder="e.g. EMP001"
                    />
                  </div>
                ) : null}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Team (Employee Master department)
                  </label>
                  <select
                    value={createForm.team}
                    onChange={(e) => setCreateForm((p) => ({ ...p, team: e.target.value }))}
                    disabled={teamDepartmentsLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="">None</option>
                    {teamOptionsForSelect(createForm.team).map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value={ROLES.EXECUTIVE}>Executive</option>
                    <option value={ROLES.MANAGER}>Manager</option>
                    <option value={ROLES.ADMIN}>Admin (assigned modules)</option>
                    <option value={ROLES.SUPER_ADMIN}>Super Admin</option>
                  </select>
                </div>
              </div>

              {createForm.role !== ROLES.SUPER_ADMIN ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Extra editable modules</label>
                  <div className="border border-gray-200 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {selectableExtraModules(createForm.team).map((m) => (
                      <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createForm.allowed_modules.includes(m.value)}
                          onChange={() =>
                            setCreateForm((prev) => ({
                              ...prev,
                              allowed_modules: prev.allowed_modules.includes(m.value)
                                ? prev.allowed_modules.filter((x) => x !== m.value)
                                : [...prev.allowed_modules, m.value],
                            }))
                          }
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-gray-700">{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                disabled={createBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setCreateBusy(true);
                  setError("");
                  try {
                    const email = String(createForm.email || "").trim().toLowerCase();
                    const password = String(createForm.password || "").trim();
                    if (!email) {
                      setError("Email is required.");
                      return;
                    }
                    if (password.length < 6) {
                      setError("Temporary password is required (at least 6 characters).");
                      return;
                    }
                    const empCode = String(createForm.employee_code || "").trim();
                    if (empCodeSupported !== false && !empCode) {
                      setError("Employee code is required.");
                      return;
                    }
                    if (empCodeSupported === false) {
                      setError(EMP_CODE_MIGRATION_HINT);
                      return;
                    }
                    let username = String(createForm.username || "").trim();
                    if (!username && empCode) {
                      const masterRow = await fetchEmployeeHierarchyByEmpCode(supabase, empCode);
                      username = String(masterRow?.full_name || "").trim();
                    }
                    if (!username) {
                      setError(
                        "Username is required. Enter an employee code that exists on Employee Master."
                      );
                      return;
                    }
                    const createResult = await createUserAccount(supabase, {
                      email,
                      password,
                      username,
                      employee_code: empCode || undefined,
                      team: createForm.team || null,
                      role: createForm.role || ROLES.EXECUTIVE,
                      allowed_modules: createForm.allowed_modules || [],
                    });
                    if (!createResult.ok) {
                      setError(createResult.message || "Could not create user.");
                      return;
                    }
                    setCreateOpen(false);
                    setCreateForm({
                      email: "",
                      password: "",
                      username: "",
                      employee_code: "",
                      team: "",
                      role: ROLES.EXECUTIVE,
                      allowed_modules: [],
                    });
                    setPage(1);
                    await reloadProfilesPage(1);
                    setSaveNotice("User created successfully.");
                  } catch (e) {
                    setError(e?.message || "Could not create user.");
                  } finally {
                    setCreateBusy(false);
                  }
                }}
                disabled={createBusy}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {createBusy ? "Creating…" : "Create user"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkImportOpen ? (
        <UserManagementBulkImportModal
          supabase={supabase}
          departments={teamDepartments}
          onClose={() => setBulkImportOpen(false)}
          onComplete={handleBulkOperationComplete}
        />
      ) : null}
    </div>
  );
};

export default UserManagement;
