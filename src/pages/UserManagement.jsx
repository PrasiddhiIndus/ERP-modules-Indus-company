import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { ROLES, TEAMS, MODULES } from "../config/roles";
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
} from "lucide-react";

const PAGE_SIZE = 10;

const roleLabel = (role) => {
  if (role === ROLES.SUPER_ADMIN_PRO) return "Super Admin Pro";
  if (role === ROLES.SUPER_ADMIN) return "Super Admin";
  if (role === ROLES.ADMIN) return "Admin";
  if (role === ROLES.MANAGER) return "Manager";
  if (role === ROLES.EXECUTIVE) return "Executive";
  return role || "—";
};

const teamLabel = (value) => TEAMS.find((t) => t.value === value)?.label ?? value ?? "—";

const UserManagement = () => {
  const { userProfile } = useAuth();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ team: "", role: ROLES.EXECUTIVE, allowed_modules: [] });
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    username: "",
    team: "",
    role: ROLES.EXECUTIVE,
    allowed_modules: [],
  });

  const canUseUserManagement =
    userProfile?.role === ROLES.SUPER_ADMIN ||
    userProfile?.role === ROLES.SUPER_ADMIN_PRO;

  useEffect(() => {
    if (!canUseUserManagement) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data, error: qErr, count } = await supabase
          .from("profiles")
          .select("id, email, username, team, role, allowed_modules, created_at", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(from, to);
        if (cancelled) return;
        if (qErr) {
          setError(
            `${qErr.message || qErr || "Unable to load users."}\n\n` +
              `This screen reads from the table public.profiles. Ensure the profiles migration is applied and RLS allows Admin/Super Admin to SELECT all profiles.`
          );
          setList([]);
          setTotal(0);
        } else {
          setList(data ?? []);
          setTotal(count ?? 0);
        }
      } catch (_) {
        if (!cancelled) {
          setError("Unable to load users.");
          setList([]);
          setTotal(0);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [canUseUserManagement, page]);

  const openEdit = (row) => {
    setEditId(row.id);
    setEditForm({
      team: row.team ?? "",
      role: row.role ?? ROLES.EXECUTIVE,
      allowed_modules: Array.isArray(row.allowed_modules) ? [...row.allowed_modules] : [],
    });
  };

  const closeEdit = () => {
    setEditId(null);
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

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    setError("");
    try {
      const { error: updateError } = await supabase.functions.invoke("admin-update-profile", {
        body: {
          id: editId,
          team: editForm.team || null,
          role: editForm.role,
          allowed_modules: editForm.allowed_modules,
        },
      });
      if (updateError) {
        setError(updateError.message || "Unable to save.");
        return;
      }
      setList((prev) =>
        prev.map((r) =>
          r.id === editId
            ? {
                ...r,
                team: editForm.team,
                role: editForm.role,
                allowed_modules: editForm.allowed_modules,
              }
            : r
        )
      );
      closeEdit();
    } catch (_) {
      setError("Unable to save.");
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (row) => {
    if (!row?.id) return;
    if (!window.confirm(`Delete user ${row.email || row.username || row.id}? This cannot be undone.`)) return;
    setSaving(true);
    setError("");
    try {
      const { error: delErr } = await supabase.functions.invoke("admin-delete-user", {
        body: { id: row.id },
      });
      if (delErr) {
        setError(delErr.message || "Unable to delete user.");
        return;
      }
      setList((prev) => prev.filter((r) => r.id !== row.id));
      setTotal((t) => Math.max(0, (Number(t) || 0) - 1));
    } catch (_) {
      setError("Unable to delete user.");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

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
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-indigo-100">
          <Users className="w-6 h-6 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500">
            View all users and edit role or team access. Passwords cannot be changed here.
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
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Username</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Team</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Role</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Extra modules</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    Loading users…
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No users found. Run the profiles migration if needed.
                  </td>
                </tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-gray-900">{row.username || "—"}</td>
                    <td className="py-3 px-4 text-gray-600">{row.email || "—"}</td>
                    <td className="py-3 px-4 text-gray-600">{teamLabel(row.team)}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-gray-700">
                        <Shield className="w-3.5 h-3.5" />
                        {roleLabel(row.role)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {row.role === ROLES.MANAGER && Array.isArray(row.allowed_modules) && row.allowed_modules.length
                        ? row.allowed_modules.map((m) => teamLabel(m)).join(", ")
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-600">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={!canPrev}
                className="p-2 rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-600">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!canNext}
                className="p-2 rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                <select
                  value={editForm.team}
                  onChange={(e) => setEditForm((f) => ({ ...f, team: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Select team</option>
                  {TEAMS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
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
                  <option value={ROLES.ADMIN}>Admin</option>
                  <option value={ROLES.SUPER_ADMIN}>Super Admin</option>
                </select>
              </div>

              {editForm.role !== ROLES.SUPER_ADMIN && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Allowed modules (extra)
                  </label>
                  <div className="border border-gray-200 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                    {MODULES.filter((m) => m.value !== "userManagement" && m.value !== editForm.team).map((m) => (
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
                    placeholder="Display name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                  <select
                    value={createForm.team}
                    onChange={(e) => setCreateForm((p) => ({ ...p, team: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="">None</option>
                    {TEAMS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
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
                    <option value={ROLES.ADMIN}>Admin</option>
                    <option value={ROLES.SUPER_ADMIN}>Super Admin</option>
                  </select>
                </div>
              </div>

              {createForm.role !== ROLES.SUPER_ADMIN ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Allowed modules (extra)</label>
                  <div className="border border-gray-200 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {MODULES.filter((m) => m.value !== "userManagement" && m.value !== createForm.team).map((m) => (
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
                    const email = String(createForm.email || "").trim();
                    if (!email) {
                      setError("Email is required.");
                      return;
                    }
                    const { data, error: fnErr } = await supabase.functions.invoke("admin-create-user", {
                      body: {
                        email,
                        password: createForm.password || undefined,
                        username: createForm.username || undefined,
                        team: createForm.team || null,
                        role: createForm.role || ROLES.EXECUTIVE,
                        allowed_modules: createForm.allowed_modules || [],
                      },
                    });
                    if (fnErr) {
                      setError(fnErr.message || "Could not create user.");
                      return;
                    }
                    if (!data?.ok) {
                      setError(data?.error || "Could not create user.");
                      return;
                    }
                    setCreateOpen(false);
                    setPage(0);
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
    </div>
  );
};

export default UserManagement;
