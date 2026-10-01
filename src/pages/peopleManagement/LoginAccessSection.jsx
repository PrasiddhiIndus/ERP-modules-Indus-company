import React, { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { SectionCard, StatusChip, Timeline } from "../adminOperations/components/AdminUi";
import { supabase } from "../../lib/supabase";
import { toast } from "../../lib/toast";
import {
  fetchCanManageSiteLogins,
  fetchSiteLoginForPerson,
  fetchSiteLoginHistory,
  formatSiteLoginError,
  isGrantableSiteScreen,
  setSiteEmployeeLoginAccess,
} from "../../lib/siteEmployeeLoginsApi";
import CreateSiteLoginModal from "./CreateSiteLoginModal";

function asList(raw) {
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
}

function historyItems(history) {
  return history
    .filter((h) => h.old_is_active !== h.new_is_active)
    .map((h) => ({
      title: h.new_is_active ? "Login enabled" : "Login disabled",
      meta: h.changed_at ? new Date(h.changed_at).toLocaleString("en-IN") : "",
    }));
}

function LeadLine({ label, code, name }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-gray-900">{code ? name || code : <span className="text-amber-700">Not assigned</span>}</p>
    </div>
  );
}

/** Indus One login for a site employee: create it, and turn sign-in on / off. */
export default function LoginAccessSection({ person }) {
  const [login, setLogin] = useState(undefined);
  const [canManage, setCanManage] = useState(false);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [row, manage] = await Promise.all([
        fetchSiteLoginForPerson(supabase, person.id),
        fetchCanManageSiteLogins(supabase).catch(() => false),
      ]);
      setLogin(row);
      setCanManage(manage);
      if (row) {
        setEnabled(row.is_active !== false);
        fetchSiteLoginHistory(supabase, person.id)
          .then(setHistory)
          .catch((err) => {
            console.warn("Login history load failed", err);
            setHistory([]);
          });
      }
    } catch (err) {
      console.error("Site login load failed", err);
      setLogin(null);
      setError(formatSiteLoginError(err));
    }
  }, [person.id]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = Boolean(login) && enabled !== (login.is_active !== false);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await setSiteEmployeeLoginAccess(supabase, {
        personId: person.id,
        isActive: enabled,
        subModules: asList(login.allowed_sub_modules).filter(isGrantableSiteScreen),
      });
      toast.success(enabled ? "Login enabled" : "Login disabled");
      await load();
    } catch (err) {
      console.error("Site login save failed", err);
      setError(formatSiteLoginError(err));
    } finally {
      setSaving(false);
    }
  };

  if (login === undefined) {
    return (
      <SectionCard title="Login">
        <p className="text-xs text-gray-500">Loading…</p>
      </SectionCard>
    );
  }

  if (!login) {
    return (
      <SectionCard title="Login">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              {person.full_name || "This employee"} does not have an Indus One login yet (employee code{" "}
              <span className="font-mono font-medium">{person.unique_code || "—"}</span>).
            </p>
            {canManage ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                disabled={!person.unique_code || person.is_active === false}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-deep disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Create login
              </button>
            ) : (
              <p className="text-[11px] text-gray-500">Only HR staff can create logins.</p>
            )}
            {canManage && person.is_active === false ? (
              <p className="text-[11px] text-gray-500">Inactive employees cannot be given a login.</p>
            ) : null}
          </div>
        )}
        <CreateSiteLoginModal
          open={createOpen}
          person={person}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setLogin(undefined);
            load();
          }}
        />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Login"
        right={
          <StatusChip
            label={login.is_active !== false ? "Login enabled" : "Login disabled"}
            severity={login.is_active !== false ? "info" : "critical"}
          />
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Sign-in email</p>
              <p className="text-gray-900 break-all">{login.email || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Name on login</p>
              <p className="text-gray-900">{login.username || "—"}</p>
            </div>
            <LeadLine label="Approvals go to L1" code={login.l1_employee_code} name={login.l1_employee_name} />
            <LeadLine label="Then L2" code={login.l2_employee_code} name={login.l2_employee_name} />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canManage}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-gray-300"
            />
            Allow this employee to sign in to Indus One
          </label>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
          ) : null}

          {canManage ? (
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="h-8 px-3 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-deep disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          ) : (
            <p className="text-[11px] text-gray-500">Only HR staff can change login access.</p>
          )}
          <p className="text-[11px] text-gray-500">L1 / L2 are changed in the HR leads section.</p>
        </div>
      </SectionCard>

      <SectionCard title="Change history">
        {historyItems(history).length ? (
          <Timeline items={historyItems(history)} />
        ) : (
          <p className="text-xs text-gray-500">No changes recorded yet.</p>
        )}
      </SectionCard>
    </div>
  );
}
