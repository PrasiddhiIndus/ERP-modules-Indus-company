import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Plus, Trash2, UserCheck } from "lucide-react";
import { StatusChip, TinyInput, TinySelect } from "../../../components/erpUi";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../lib/toast";
import { confirmDialog } from "../../../lib/dialog";
import {
  assignSiteSupervisor,
  createSiteSupervisorLogin,
  fetchCanManageSiteLogins,
  formatSiteLoginError,
  isValidEmployeeEmail,
  listSiteSupervisorCandidates,
  listSiteSupervisors,
  normalizeEmployeeEmail,
  removeSiteSupervisor,
  supervisorPasswordProblem,
} from "../../../lib/siteEmployeeLoginsApi";

function candidateLabel(c) {
  return [c.full_name || "—", c.employee_code || "no code", c.email || c.login_email || "no email"].join(" · ");
}

function rpcMessage(err) {
  return formatSiteLoginError(err);
}

/**
 * HR → Site Master → Edit Site: Site Supervisors.
 * A supervisor is a site employee assigned to this site, linked by employee code,
 * whose login gets HR · Site Attendance · Attendance for this site only.
 * Changes here apply immediately (they are not part of the site's Save).
 */
export default function SiteSupervisorsSection({ siteId, siteName }) {
  const [canManage, setCanManage] = useState(null);
  const [supervisors, setSupervisors] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [personId, setPersonId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchCanManageSiteLogins(supabase)
      .then(setCanManage)
      .catch(() => setCanManage(false));
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const [sups, cands] = await Promise.all([
        listSiteSupervisors(supabase, siteId),
        listSiteSupervisorCandidates(supabase, siteId),
      ]);
      setSupervisors(sups);
      setCandidates(cands);
    } catch (err) {
      console.error("Site supervisors load failed", err);
      setSupervisors([]);
      setCandidates([]);
      setError(rpcMessage(err));
    }
  }, [siteId]);

  useEffect(() => {
    if (canManage && siteId) load();
  }, [canManage, siteId, load]);

  const selected = useMemo(
    () => candidates.find((c) => String(c.person_id) === String(personId)) || null,
    [candidates, personId]
  );

  const resetForm = () => {
    setPersonId("");
    setEmail("");
    setPassword("");
    setConfirm("");
    setShowPassword(false);
    setFormError("");
  };

  const pick = (value) => {
    setPersonId(value);
    setFormError("");
    setPassword("");
    setConfirm("");
    const c = candidates.find((x) => String(x.person_id) === String(value));
    setEmail(c?.login_email || c?.email || "");
  };

  const submit = async () => {
    setFormError("");
    if (!selected) return setFormError("Choose an employee assigned to this site.");
    if (!selected.employee_code) return setFormError("This employee has no employee code yet.");
    if (String(selected.supervisor_site_id || "") === String(siteId)) {
      return setFormError("This employee is already a supervisor of this site.");
    }

    setBusy(true);
    try {
      if (selected.has_login) {
        await assignSiteSupervisor(supabase, { personId: selected.person_id, siteId });
        toast.success("Site supervisor added", `${selected.full_name} can now mark attendance for ${siteName || "this site"}.`);
      } else {
        const nextEmail = normalizeEmployeeEmail(email);
        if (!nextEmail || !isValidEmployeeEmail(nextEmail)) {
          setFormError("Enter a valid email. The supervisor signs in with it.");
          return;
        }
        const problem = supervisorPasswordProblem(password, confirm);
        if (problem) {
          setFormError(problem);
          return;
        }
        const result = await createSiteSupervisorLogin(supabase, {
          personId: selected.person_id,
          email: nextEmail,
          password,
          siteId,
        });
        if (!result.ok) {
          setFormError(result.message);
          return;
        }
        if (result.data?.warning) toast.warning("Login created", result.data.warning);
        else {
          toast.success(
            "Site supervisor created",
            `${selected.full_name} can sign in with ${nextEmail}. Share the password with them directly.`
          );
        }
      }
      setPassword("");
      setConfirm("");
      resetForm();
      setAdding(false);
      await load();
    } catch (err) {
      console.error("Add site supervisor failed", err);
      setFormError(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    const ok = await confirmDialog({
      title: "Remove site supervisor",
      message: `Remove ${row.full_name || "this employee"} as supervisor of ${siteName || "this site"}? Their login stays, but they lose Site Attendance access.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await removeSiteSupervisor(supabase, row.person_id);
      toast.success("Site supervisor removed");
      await load();
    } catch (err) {
      toast.error("Could not remove", rpcMessage(err));
    }
  };

  if (!siteId || canManage === null) return null;
  if (!canManage) {
    return (
      <div className="pt-4 border-t border-divider">
        <p className="text-xs font-semibold mb-1">Site supervisors</p>
        <p className="text-[11px] text-ink-muted">Only HR staff can add site supervisors.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-4 border-t border-divider">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold">Site supervisors</p>
          <p className="text-[11px] text-ink-muted">
            Supervisors sign in to the ERP and see only Site Attendance → Attendance for this site. Changes here apply
            immediately.
          </p>
        </div>
        {!adding ? (
          <button
            type="button"
            className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs inline-flex items-center gap-1.5 shrink-0"
            onClick={() => {
              resetForm();
              setAdding(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Site Supervisor
          </button>
        ) : null}
      </div>

      {error ? <p className="text-xs text-critical">{error}</p> : null}

      {supervisors == null ? (
        <p className="text-[11px] text-ink-muted">Loading…</p>
      ) : supervisors.length ? (
        <ul className="divide-y divide-divider rounded-md border border-divider">
          {supervisors.map((row) => {
            const moved = row.current_site_id != null && String(row.current_site_id) !== String(siteId);
            return (
              <li key={row.profile_id} className="flex items-start justify-between gap-2 px-3 py-2">
                <div className="min-w-0 text-xs">
                  <p className="font-medium text-ink truncate">
                    {row.full_name || "—"} <span className="font-mono text-ink-muted">· {row.employee_code}</span>
                  </p>
                  <p className="text-[11px] text-ink-muted break-all">{row.login_email || "—"}</p>
                  {moved ? (
                    <p className="text-[11px] text-amber-700">
                      Now assigned to {row.current_site_name || "another site"}. Move or remove this supervisor in User
                      Management → Site Employees.
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusChip
                    label={row.is_active !== false ? "Login enabled" : "Login disabled"}
                    severity={row.is_active !== false ? "info" : "critical"}
                  />
                  <button
                    type="button"
                    className="text-critical"
                    onClick={() => remove(row)}
                    aria-label={`Remove ${row.full_name || "supervisor"}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[11px] text-ink-muted">No supervisors for this site yet.</p>
      )}

      {adding ? (
        <div className="space-y-3 rounded-md border border-divider bg-slate-50 p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-ink-secondary">Employee assigned to this site</span>
            <TinySelect value={personId} onChange={(e) => pick(e.target.value)} disabled={busy}>
              <option value="">{candidates.length ? "Select employee" : "No active employees assigned to this site"}</option>
              {candidates.map((c) => (
                <option
                  key={c.person_id}
                  value={c.person_id}
                  disabled={!c.employee_code || String(c.supervisor_site_id || "") === String(siteId)}
                >
                  {candidateLabel(c)}
                  {String(c.supervisor_site_id || "") === String(siteId) ? " (already supervisor)" : ""}
                </option>
              ))}
            </TinySelect>
          </label>

          {selected ? (
            <div className="space-y-3">
              {selected.supervisor_site_id && String(selected.supervisor_site_id) !== String(siteId) ? (
                <p className="text-[11px] text-amber-700">
                  This employee supervises another site. Adding them here moves their supervisor access to this site.
                </p>
              ) : null}

              {selected.has_login ? (
                <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] text-ink-secondary">
                  <UserCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" />
                  <p>
                    {selected.full_name} already has a login ({selected.login_email || "no email"}). Their password is
                    not changed. Their screens will be replaced with Site Attendance → Attendance for this site only.
                  </p>
                </div>
              ) : (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-ink-secondary">Email (used to sign in)</span>
                    <TinyInput
                      type="email"
                      autoComplete="off"
                      value={email}
                      disabled={busy || Boolean(selected.email)}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                    />
                    <span className="text-[10px] text-ink-muted">
                      {selected.email
                        ? `Linked to employee code ${selected.employee_code}. Change it in People Master.`
                        : `No email is linked yet. It will be saved on the employee record (code ${selected.employee_code}).`}
                    </span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-ink-secondary">Create Password</span>
                      <TinyInput
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={password}
                        disabled={busy}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-ink-secondary">Confirm Password</span>
                      <TinyInput
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={confirm}
                        disabled={busy}
                        onChange={(e) => setConfirm(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-ink-muted">At least 8 characters, with a letter and a number.</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] text-accent"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {formError ? <p className="text-xs text-critical">{formError}</p> : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs"
              disabled={busy}
              onClick={() => {
                resetForm();
                setAdding(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="erp-btn-primary rounded-control px-3 py-1.5 text-xs disabled:opacity-50"
              disabled={busy || !selected}
              onClick={submit}
            >
              {busy ? "Saving…" : selected?.has_login ? "Make supervisor" : "Create supervisor login"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
