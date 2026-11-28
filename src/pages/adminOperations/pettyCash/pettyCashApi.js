/**
 * Petty Cash data layer: overhead categories, vouchers, and R2 attachment metadata.
 *
 * One in-memory store is shared by every Petty Cash screen, so a change made in the
 * Overhead Master shows up straight away in Daily Expense Entry (same tab), and each
 * screen also reloads when it mounts or the window regains focus.
 */
import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "../../../lib/supabase";
import { uploadPettyCashFileToR2 } from "../../../lib/pettyCashR2";

const EMPTY = Object.freeze({
  overheads: [],
  usage: {},
  loading: true,
  loaded: false,
  error: null,
});

let state = EMPTY;
const listeners = new Set();
let inflight = null;

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

/** Turn a Postgres / PostgREST error into a sentence for the user. */
export function pettyCashErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  const code = error.code || "";
  const msg = String(error.message || "");
  if (code === "P0001" && msg) return msg;
  if (code === "23505") {
    if (msg.includes("uq_overhead_category_name")) return "An overhead category with this name already exists.";
    return "This record already exists.";
  }
  if (code === "23503") return "This record is still in use and cannot be removed.";
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return "You do not have permission to make this change.";
  }
  return msg || fallback;
}

async function fetchAll() {
  const [oh, us] = await Promise.all([
    supabase.from("overhead_category").select("id, name, code, created_at").order("name"),
    supabase.from("overhead_category_usage").select("overhead_category_id, voucher_count, spent_this_month"),
  ]);
  const err = oh.error || us.error;
  if (err) throw err;
  const usage = {};
  for (const row of us.data || []) {
    usage[row.overhead_category_id] = {
      vouchers: Number(row.voucher_count) || 0,
      spentThisMonth: Number(row.spent_this_month) || 0,
    };
  }
  return { overheads: oh.data || [], usage };
}

/** Reload masters + usage. Concurrent callers share one request. */
export function refreshPettyCashMasters() {
  if (inflight) return inflight;
  if (!state.loaded) setState({ loading: true });
  inflight = fetchAll()
    .then((data) => setState({ ...data, loading: false, loaded: true, error: null }))
    .catch((error) => {
      setState({ loading: false, error: pettyCashErrorMessage(error, "Could not load petty cash masters.") });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Subscribe a component to the shared masters; loads on mount and when the window regains focus. */
export function usePettyCashMasters() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    refreshPettyCashMasters();
    const onFocus = () => refreshPettyCashMasters();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  return snap;
}

async function run(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(pettyCashErrorMessage(error));
  await refreshPettyCashMasters();
  return data;
}

const cleanName = (name) => String(name || "").replace(/\s+/g, " ").trim();

export function createOverheadCategory(name) {
  return run(supabase.from("overhead_category").insert({ name: cleanName(name) }).select().single());
}

export function updateOverheadCategory(id, name) {
  return run(supabase.from("overhead_category").update({ name: cleanName(name) }).eq("id", id).select().single());
}

export function deleteOverheadCategory(id) {
  return run(supabase.from("overhead_category").delete().eq("id", id));
}

/** Next overhead code shown read-only in the Add modal; the database assigns the real one. */
export function previewNextOverheadCode(overheads) {
  const max = (overheads || []).reduce((m, o) => {
    const n = /^OH-(\d+)$/.exec(String(o.code || ""));
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `OH-${String(max + 1).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Vouchers (Daily Expense Entry)
// ---------------------------------------------------------------------------

export const PAYMENT_MODES = ["Cash", "UPI", "Bank", "Other"];

const VOUCHER_SELECT =
  "id, voucher_no, expense_date, payment_mode, overhead_category_id, expense_category_name, description, amount, paid_to, remarks, attachments, created_at";

export async function listRecentVouchers(limit = 25) {
  const { data, error } = await supabase
    .from("petty_cash_voucher")
    .select(VOUCHER_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(pettyCashErrorMessage(error, "Could not load vouchers."));
  return data || [];
}

/** Vouchers whose expense date falls in [fromIso, toIso] (inclusive), read in pages of 1000. */
export async function listVouchersBetween(fromIso, toIso, maxRows = 20000) {
  const PAGE = 1000;
  const out = [];
  for (let start = 0; start < maxRows; start += PAGE) {
    const { data, error } = await supabase
      .from("petty_cash_voucher")
      .select("id, expense_date, payment_mode, overhead_category_id, expense_category_name, amount")
      .gte("expense_date", fromIso)
      .lte("expense_date", toIso)
      .order("expense_date", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw new Error(pettyCashErrorMessage(error, "Could not load expenses."));
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * Create a voucher, then upload optional files to Cloudflare R2 and persist attachment metadata.
 * @param {{ expenseDate, paymentMode, overheadCategoryId, expenseCategoryName, description, amount, paidTo, remarks, files?: File[] }} input
 */
export async function createVoucher(input) {
  const { data, error } = await supabase
    .from("petty_cash_voucher")
    .insert({
      expense_date: input.expenseDate,
      payment_mode: input.paymentMode,
      overhead_category_id: input.overheadCategoryId,
      expense_category_name: cleanName(input.expenseCategoryName),
      description: String(input.description || "").trim(),
      amount: Number(input.amount),
      paid_to: String(input.paidTo || "").trim(),
      remarks: String(input.remarks || "").trim() || null,
      attachments: [],
    })
    .select("id, voucher_no")
    .single();
  if (error) throw new Error(pettyCashErrorMessage(error, "Could not save the expense."));

  const files = Array.isArray(input.files) ? input.files.filter(Boolean) : [];
  if (files.length && data?.id) {
    const attachments = [];
    const failures = [];
    for (const file of files) {
      try {
        const uploaded = await uploadPettyCashFileToR2({ file, voucherId: data.id });
        attachments.push({
          objectKey: uploaded.objectKey,
          fileName: uploaded.fileName || file.name,
          contentType: uploaded.contentType || file.type || null,
        });
      } catch (uploadErr) {
        failures.push(file.name || "file");
        console.warn("Petty cash attachment upload failed:", uploadErr?.message || uploadErr);
      }
    }
    if (attachments.length) {
      const { error: attErr } = await supabase
        .from("petty_cash_voucher")
        .update({ attachments })
        .eq("id", data.id);
      if (attErr) {
        throw new Error(
          pettyCashErrorMessage(attErr, "Expense saved, but attachment details could not be stored.")
        );
      }
    }
    if (failures.length) {
      data.attachmentWarning = `Expense saved, but ${failures.length} file${failures.length === 1 ? "" : "s"} could not be uploaded (${failures.join(", ")}).`;
    }
  }

  await refreshPettyCashMasters();
  return data;
}

export const formatInr = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/** Today's date in India (YYYY-MM-DD). */
export function todayIst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
