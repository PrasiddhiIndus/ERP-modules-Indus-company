import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, RotateCcw, Send, Upload, X } from "lucide-react";
import FormDateInput from "../../../components/FormDateInput";
import { EmptyState, FormField, InlineAlert, LoadingBlock, PrimaryButton, SecondaryButton } from "../../../components/erpUi";
import toast from "../../../lib/toast";
import { PETTY_CASH_APP_PATH } from "../../../config/roles";
import {
  PETTY_CASH_ATTACHMENT_ACCEPT,
  PETTY_CASH_ATTACHMENT_MAX_BYTES,
  PETTY_CASH_ATTACHMENT_MAX_FILES,
} from "../../../lib/pettyCashR2";
import { usePettyCashAccess } from "./pettyCashAccess";
import {
  createVoucher,
  formatDate,
  formatInr,
  listRecentVouchers,
  PAYMENT_MODES,
  todayIst,
  usePettyCashMasters,
} from "./pettyCashApi";
import { PC_BTN, PC_INPUT, PC_INPUT_ERROR, Panel } from "./pettyCashUi";

const blankForm = () => ({
  expenseDate: todayIst(),
  paymentMode: "",
  overheadCategoryId: "",
  expenseCategoryName: "",
  description: "",
  amount: "",
  paidTo: "",
  remarks: "",
});

function validate(f) {
  const e = {};
  if (!f.expenseDate) e.expenseDate = "Expense date is required";
  else if (f.expenseDate > todayIst()) e.expenseDate = "Expense date cannot be in the future";
  if (!f.paymentMode) e.paymentMode = "Select a payment mode";
  if (!f.overheadCategoryId) e.overheadCategoryId = "Select an overhead category";
  if (!String(f.expenseCategoryName || "").trim()) e.expenseCategoryName = "Expense category is required";
  if (String(f.description).trim().length < 5) e.description = "Description must be at least 5 characters";
  const amt = Number(f.amount);
  if (!f.amount || !Number.isFinite(amt) || amt <= 0) e.amount = "Enter a valid amount greater than 0";
  else if (!/^\d+(\.\d{1,2})?$/.test(String(f.amount).trim())) e.amount = "Use at most 2 decimal places";
  if (!String(f.paidTo).trim()) e.paidTo = "Vendor name is required";
  return e;
}

/** created_at (timestamptz) → IST calendar date. */
const istDate = (ts) =>
  ts ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ts)) : "";

function StepLabel({ n, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
        {n}
      </span>
      {children}
    </span>
  );
}

function AttachmentPicker({ files, onChange, disabled }) {
  const inputRef = useRef(null);
  const total = files.length;

  const addFiles = (list) => {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const next = [...files];
    for (const file of incoming) {
      if (next.length >= PETTY_CASH_ATTACHMENT_MAX_FILES) break;
      if (file.size > PETTY_CASH_ATTACHMENT_MAX_BYTES) {
        toast.warning(`“${file.name}” is too large (max 25 MB).`);
        continue;
      }
      const dup = next.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified);
      if (!dup) next.push(file);
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={PETTY_CASH_ATTACHMENT_ACCEPT}
          className="hidden"
          disabled={disabled || total >= PETTY_CASH_ATTACHMENT_MAX_FILES}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={disabled || total >= PETTY_CASH_ATTACHMENT_MAX_FILES}
          onClick={() => inputRef.current?.click()}
          className="erp-btn-secondary inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-[13px] font-medium disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          Add files
        </button>
        <span className="text-[12px] text-ink-muted">
          {total} / {PETTY_CASH_ATTACHMENT_MAX_FILES} · PDF, JPG, PNG, DOC (max 25 MB each) · Cloudflare R2
        </span>
      </div>
      {files.length ? (
        <ul className="divide-y divide-divider rounded-card border border-border bg-surface-sunken/40">
          {files.map((file, idx) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink">
                <FileText className="h-4 w-4 shrink-0 text-ink-muted" />
                <span className="truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-[11px] text-ink-muted">
                  {(file.size / 1024).toFixed(file.size > 1024 * 100 ? 0 : 1)} KB
                </span>
              </span>
              <button
                type="button"
                title={`Remove ${file.name}`}
                disabled={disabled}
                onClick={() => onChange(files.filter((_, i) => i !== idx))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-control text-ink-muted hover:bg-critical-soft hover:text-critical disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function DailyExpenseEntryPage() {
  const { canManageMasters } = usePettyCashAccess();
  const { overheads, loaded, error: mastersError } = usePettyCashMasters();

  const [form, setForm] = useState(blankForm);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState(null);
  const [recentError, setRecentError] = useState("");

  const loadRecent = useCallback(() => {
    listRecentVouchers(50)
      .then((rows) => {
        setRecent(rows);
        setRecentError("");
      })
      .catch((e) => setRecentError(e.message));
  }, []);
  useEffect(loadRecent, [loadRecent]);

  useEffect(() => {
    if (!loaded) return;
    setForm((f) => {
      if (f.overheadCategoryId && !overheads.some((o) => String(o.id) === f.overheadCategoryId)) {
        return { ...f, overheadCategoryId: "" };
      }
      return f;
    });
  }, [loaded, overheads]);

  const set = (key) => (e) => {
    const value = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((p) => ({ ...p, [key]: "" }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = validate(form);
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const row = await createVoucher({
        ...form,
        overheadCategoryId: Number(form.overheadCategoryId),
        expenseCategoryName: form.expenseCategoryName,
        amount: Number(form.amount),
        files,
      });
      toast.success("Expense submitted", `${row?.voucher_no || "Voucher"} · ${formatInr(form.amount)}`);
      if (row?.attachmentWarning) toast.warning(row.attachmentWarning);
      setForm((f) => ({ ...blankForm(), expenseDate: f.expenseDate, paymentMode: f.paymentMode }));
      setFiles([]);
      setErrors({});
      loadRecent();
    } catch (ex) {
      toast.error("Could not submit expense", ex.message);
    } finally {
      setSaving(false);
    }
  };

  const ohName = (id) => overheads.find((o) => o.id === id)?.name || "—";
  const input = (key) => `${PC_INPUT} ${errors[key] ? PC_INPUT_ERROR : ""}`;

  const today = todayIst();
  const enteredToday = useMemo(() => (recent || []).filter((v) => istDate(v.created_at) === today), [recent, today]);
  const enteredTodayTotal = enteredToday.reduce((a, v) => a + (Number(v.amount) || 0), 0);

  const noMasters = loaded && !overheads.length;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
      <Panel title="New petty cash expense" subtitle={<>Fields marked <span className="text-critical">*</span> are required</>}>
        {mastersError ? <InlineAlert tone="error" className="mb-4">{mastersError}</InlineAlert> : null}
        {noMasters ? (
          <EmptyState
            title="No overhead categories yet"
            message="Expenses are recorded against an overhead category. Set them up in the Overhead Master first."
            action={
              canManageMasters ? (
                <Link
                  to={`${PETTY_CASH_APP_PATH}/masters`}
                  className="erp-btn-primary inline-flex h-9 items-center rounded-control px-4 text-[13px] font-medium"
                >
                  Open Overhead Master
                </Link>
              ) : (
                <p className="text-[13px] text-ink-muted">Ask a Petty Cash master manager to add them.</p>
              )
            }
          />
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4 text-[13px]">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={<StepLabel n={1}>Expense Date</StepLabel>} required error={errors.expenseDate} htmlFor="pc-date">
                <FormDateInput
                  id="pc-date"
                  value={form.expenseDate}
                  max={today}
                  onChange={set("expenseDate")}
                  className={`h-10 w-full ${errors.expenseDate ? PC_INPUT_ERROR : ""}`}
                />
              </FormField>
              <FormField label="Payment Mode" required error={errors.paymentMode} htmlFor="pc-mode">
                <select id="pc-mode" value={form.paymentMode} onChange={set("paymentMode")} className={input("paymentMode")}>
                  <option value="">Select mode</option>
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label={<StepLabel n={2}>Overhead Category</StepLabel>}
                required
                error={errors.overheadCategoryId}
                htmlFor="pc-oh"
              >
                <select id="pc-oh" value={form.overheadCategoryId} onChange={set("overheadCategoryId")} className={input("overheadCategoryId")}>
                  <option value="">Select overhead category</option>
                  {overheads.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label={<StepLabel n={3}>Expense Category</StepLabel>}
                required
                error={errors.expenseCategoryName}
                hint="Type the expense category for this voucher"
                htmlFor="pc-ec"
              >
                <input
                  id="pc-ec"
                  value={form.expenseCategoryName}
                  maxLength={80}
                  onChange={set("expenseCategoryName")}
                  placeholder="e.g. Tea & Refreshments"
                  className={input("expenseCategoryName")}
                />
              </FormField>
            </div>
            <FormField label="Expense Description / Purpose" required error={errors.description} htmlFor="pc-desc">
              <input
                id="pc-desc"
                value={form.description}
                maxLength={140}
                onChange={set("description")}
                placeholder="e.g. Tea and snacks for client visit"
                className={input("description")}
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Amount (₹)" required error={errors.amount} htmlFor="pc-amt">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-ink-muted">₹</span>
                  <input
                    id="pc-amt"
                    inputMode="decimal"
                    value={form.amount}
                    onChange={set("amount")}
                    placeholder="0.00"
                    className={`${input("amount")} !pl-7 tabular-nums`}
                  />
                </div>
              </FormField>
              <FormField label="Paid To / Vendor Name" required error={errors.paidTo} htmlFor="pc-vendor">
                <input
                  id="pc-vendor"
                  value={form.paidTo}
                  maxLength={120}
                  onChange={set("paidTo")}
                  placeholder="Vendor or person"
                  className={input("paidTo")}
                />
              </FormField>
            </div>
            <FormField label="Remarks" htmlFor="pc-remarks">
              <textarea
                id="pc-remarks"
                value={form.remarks}
                maxLength={500}
                onChange={set("remarks")}
                rows={3}
                placeholder="Optional internal note"
                className="erp-input w-full px-3 py-2 text-[13px]"
              />
            </FormField>
            <FormField label="Attachments" hint="Optional receipts or bills" htmlFor="pc-files">
              <AttachmentPicker files={files} onChange={setFiles} disabled={saving} />
            </FormField>
            <div className="flex flex-col-reverse gap-2 border-t border-divider pt-4 sm:flex-row sm:justify-end">
              <SecondaryButton
                className={PC_BTN}
                onClick={() => {
                  setForm(blankForm());
                  setFiles([]);
                  setErrors({});
                }}
              >
                <RotateCcw className="h-4 w-4" /> Reset Form
              </SecondaryButton>
              <PrimaryButton type="submit" icon={Send} disabled={saving || !loaded} className={PC_BTN}>
                {saving ? "Submitting…" : "Submit Expense"}
              </PrimaryButton>
            </div>
          </form>
        )}
      </Panel>

      <div className="space-y-5">
        <Panel
          title="Entered today"
          subtitle={recent ? `${enteredToday.length} voucher${enteredToday.length === 1 ? "" : "s"} · ${formatInr(enteredTodayTotal)}` : null}
          right={
            <Link to={`${PETTY_CASH_APP_PATH}/dashboard`} className="text-[13px] font-medium text-accent hover:underline">
              All transactions →
            </Link>
          }
        >
          {recentError ? (
            <InlineAlert tone="error">{recentError}</InlineAlert>
          ) : recent === null ? (
            <LoadingBlock rows={3} />
          ) : !enteredToday.length ? (
            <p className="rounded-card border border-dashed border-border px-3 py-6 text-center text-[13px] text-ink-muted">
              No vouchers entered today yet.
            </p>
          ) : (
            <ul className="divide-y divide-divider rounded-card border border-border text-[13px]">
              {enteredToday.map((v) => (
                <li key={v.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5" title={v.description}>
                  <div className="min-w-0">
                    <p className="font-mono text-[12.5px] font-semibold text-accent">{v.voucher_no}</p>
                    <p className="mt-0.5 truncate text-ink-strong">{v.expense_category_name || "—"}</p>
                    <p className="truncate text-[12px] text-ink-muted">
                      {ohName(v.overhead_category_id)} · {v.paid_to} · {formatDate(v.expense_date)}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-ink-strong">{formatInr(v.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Entry guidelines">
          <ul className="list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-ink-secondary">
            <li>Choose the overhead category, then type the expense category for this voucher.</li>
            <li>Attach receipts or bills when available — files are stored in Cloudflare.</li>
            <li>Submitted vouchers are locked and can only be changed by a Petty Cash master manager.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
