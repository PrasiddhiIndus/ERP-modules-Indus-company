import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "../adminOperations/components/AdminUi";
import { supabase } from "../../lib/supabase";
import { toast } from "../../lib/toast";
import {
  createSiteEmployeeLogin,
  formatSiteLoginError,
  searchSitePeopleForLogin,
} from "../../lib/siteEmployeeLoginsApi";

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function PersonPicker({ linkedPersonIds, value, onChange }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const trimmed = term.trim();

  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      setHasMore(false);
      setSearching(false);
      setError("");
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      searchSitePeopleForLogin(supabase, trimmed)
        .then(({ rows, hasMore: more }) => {
          if (cancelled) return;
          setResults(rows);
          setHasMore(more);
          setError("");
        })
        .catch((err) => {
          console.error("Site people search failed", err);
          if (!cancelled) setError(formatSiteLoginError(err));
        })
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmed]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-gray-900 truncate">{value.full_name}</p>
          <p className="text-[11px] text-gray-500">
            <span className="font-mono">{value.unique_code}</span>
            {value.current_site_name ? ` · ${value.current_site_name}` : ""}
          </p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="text-xs text-accent hover:underline">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="relative block">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Type employee code or name…"
          autoFocus
          className="w-full h-9 pl-8 pr-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </label>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {!trimmed ? (
        <p className="text-[11px] text-gray-500">Start typing an employee code (or name) to find the site employee.</p>
      ) : searching && !results.length ? (
        <p className="text-[11px] text-gray-500">Searching…</p>
      ) : (
        <>
          <ul className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
            {results.map((p) => {
              const hasLogin = linkedPersonIds?.has(p.id);
              const inactive = p.is_active === false;
              const reason = hasLogin ? "already has a login" : inactive ? "inactive" : !p.unique_code ? "no employee code" : "";
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={Boolean(reason)}
                    onClick={() => onChange(p)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <p className="text-sm text-gray-900">
                      <span className="font-mono font-medium">{p.unique_code || "—"}</span> · {p.full_name}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {[p.designation, p.current_site_name, reason].filter(Boolean).join(" · ") || "\u00a0"}
                    </p>
                  </button>
                </li>
              );
            })}
            {!results.length ? (
              <li className="px-3 py-2 text-xs text-gray-500">No site employee matches “{trimmed}”.</li>
            ) : null}
          </ul>
          {hasMore ? (
            <p className="text-[11px] text-gray-500">Showing the first 50 matches — type more of the code to narrow down.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Create a login (Indus One) for a site employee. Pass `person` to fix the employee
 * (profile page); omit it to pick one (User Management · Site Employees).
 */
export default function CreateSiteLoginModal({ open, person = null, linkedPersonIds, onClose, onCreated }) {
  const [selected, setSelected] = useState(person);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(person);
      setEmail("");
      setPassword(generatePassword());
      setError("");
    }
  }, [open, person]);

  const submit = async () => {
    setError("");
    if (!selected) return setError("Choose the site employee.");
    if (!email.trim() || !email.includes("@")) return setError("Enter a valid email. The employee signs in with it.");
    if (password.trim().length < 6) return setError("Temporary password must be at least 6 characters.");
    setBusy(true);
    try {
      const result = await createSiteEmployeeLogin(supabase, {
        personId: selected.id,
        email,
        password: password.trim(),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.data?.warning) toast.warning("Login created", result.data.warning);
      else toast.success("Login created", `Share the email and temporary password with ${selected.full_name}.`);
      onCreated?.(result.data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
        open={open}
        title="Create login"
        onClose={busy ? () => {} : onClose}
        widthClass="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-8 px-3 rounded-md text-xs font-medium border border-gray-300 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="h-8 px-3 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-deep disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create login"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-700">Site employee</p>
            {person ? (
              <p className="text-sm text-gray-900">
                {person.full_name} <span className="font-mono text-gray-500">· {person.unique_code}</span>
              </p>
            ) : (
              <PersonPicker linkedPersonIds={linkedPersonIds} value={selected} onChange={setSelected} />
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-700">Email (used to sign in)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              className="h-9 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-700">Temporary password</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="flex-1 h-9 px-3 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="h-9 px-3 rounded-lg text-xs font-medium border border-gray-300 bg-white hover:bg-gray-50"
              >
                Generate
              </button>
            </div>
          </label>

          <p className="text-[11px] text-gray-500">
            This login is for Indus One. It is linked by employee code, so leave and tour approvals go to the L1 / L2
            leads set in People Management.
          </p>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
          ) : null}
        </div>
    </Modal>
  );
}
