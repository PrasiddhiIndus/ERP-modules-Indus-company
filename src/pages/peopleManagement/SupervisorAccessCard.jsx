import React, { useState } from "react";
import { SectionCard, StatusChip } from "../../components/erpUi";
import { supabase } from "../../lib/supabase";
import { toast } from "../../lib/toast";
import { confirmDialog } from "../../lib/dialog";
import { assignSiteSupervisor, formatSiteLoginError, removeSiteSupervisor } from "../../lib/siteEmployeeLoginsApi";

/**
 * Site Supervisor role of a site-employee login (People Management · Login tab,
 * opened from User Management → Site Employees). Supervisors are created in
 * HR → Site Master → Edit Site; here HR can follow a site change or remove the role.
 */
export default function SupervisorAccessCard({ login, canManage, onChanged }) {
  const [busy, setBusy] = useState(false);
  const isSupervisor = Boolean(login?.supervisor_site_id);
  const currentSiteId = login?.current_site_id ?? null;
  const siteChanged = isSupervisor && currentSiteId != null && String(currentSiteId) !== String(login.supervisor_site_id);

  const run = async (fn, success) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      onChanged?.();
    } catch (err) {
      toast.error("Could not update supervisor access", formatSiteLoginError(err));
    } finally {
      setBusy(false);
    }
  };

  const assignToCurrent = async () => {
    const ok = await confirmDialog({
      title: isSupervisor ? "Move supervisor access" : "Make site supervisor",
      message: isSupervisor
        ? `Move ${login.full_name || "this employee"}'s supervisor access to ${login.current_site_name}? They will no longer see ${login.supervisor_site_name || "the old site"}.`
        : `Make ${login.full_name || "this employee"} the supervisor of ${login.current_site_name}? Their screens will be replaced with Site Attendance → Attendance for that site only.`,
      confirmLabel: isSupervisor ? "Move" : "Make supervisor",
    });
    if (!ok) return;
    await run(
      () => assignSiteSupervisor(supabase, { personId: login.person_id, siteId: currentSiteId }),
      isSupervisor ? "Supervisor access moved" : "Site supervisor added"
    );
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: "Remove site supervisor",
      message: `Remove ${login.full_name || "this employee"} as supervisor of ${login.supervisor_site_name || "their site"}? The login stays, but loses Site Attendance access.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    await run(() => removeSiteSupervisor(supabase, login.person_id), "Site supervisor removed");
  };

  if (!login) return null;

  return (
    <SectionCard
      title="Site supervisor"
      right={isSupervisor ? <StatusChip label="Site Supervisor" severity="info" /> : null}
    >
      <div className="space-y-3 text-sm">
        {isSupervisor ? (
          <>
            <p className="text-gray-800">
              Marks attendance for <span className="font-medium">{login.supervisor_site_name || `site #${login.supervisor_site_id}`}</span>{" "}
              only (HR → Site Attendance → Attendance). No other HR pages or ERP modules.
            </p>
            {siteChanged ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This employee is now assigned to {login.current_site_name}. Move their supervisor access there, or remove it.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-gray-700">
            Not a site supervisor. Supervisors are added from HR → Site Master → Edit Site
            {currentSiteId != null ? `, or here for the employee's current site (${login.current_site_name}).` : "."}
          </p>
        )}

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {currentSiteId != null && (!isSupervisor || siteChanged) ? (
              <button
                type="button"
                onClick={assignToCurrent}
                disabled={busy || login.person_is_active === false}
                className="h-8 px-3 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-deep disabled:opacity-50"
              >
                {isSupervisor ? `Move to ${login.current_site_name}` : `Make supervisor of ${login.current_site_name}`}
              </button>
            ) : null}
            {isSupervisor ? (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="h-8 px-3 rounded-md text-xs font-medium border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
              >
                Remove supervisor
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-gray-500">Only HR staff can change supervisor access.</p>
        )}
      </div>
    </SectionCard>
  );
}
