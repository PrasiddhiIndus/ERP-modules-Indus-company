import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Edit2,
  Paperclip,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { ROLES } from "../config/roles";
import { supabase } from "../lib/supabase";

const TABLE_NAME = "software_subscriptions";
const INVOICE_BUCKET = "software-subscription-invoices";
const FALLBACK_USD_INR_RATE = 94.62;
const FX_RATE_API_URL = "https://open.er-api.com/v6/latest/USD";
const FALLBACK_USD_RATES = { USD: 1, INR: FALLBACK_USD_INR_RATE };

const emptyForm = {
  tool_service: "",
  description: "",
  purchase_price_first_year: "",
  monthly_cost_ongoing: "",
  yearly_cost_ongoing: "",
  currency: "INR",
  monthly_cost_inr: "",
  yearly_cost_inr: "",
  credit_card: "",
  invoices: "",
  invoice_attachments: [],
  billing_type: "prepaid",
  payment_type: "Recurring",
  next_payment_date: "",
  payment_status: "pending",
  reminder_days_before: "7",
  notes: "",
};

const currencyOptions = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY", "CHF"];
const billingTypeOptions = ["prepaid", "postpaid"];
const paymentTypeOptions = ["Recurring", "Monthly", "Yearly", "Quarterly", "One-time", "Trial"];
const paymentStatusOptions = ["pending", "paid", "overdue", "cancelled"];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatRate(value) {
  return toNumber(value).toFixed(2);
}

function formatFxTimestamp(value) {
  if (!value) return "latest available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "latest available";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInrRateForCurrency(currency, usdRates) {
  const code = String(currency || "INR").toUpperCase();
  if (code === "INR") return 1;

  const rates = usdRates || FALLBACK_USD_RATES;
  const inrPerUsd = Number(rates.INR);
  if (code === "USD") return Number.isFinite(inrPerUsd) && inrPerUsd > 0 ? inrPerUsd : FALLBACK_USD_INR_RATE;

  const currencyPerUsd = Number(rates[code]);
  if (
    Number.isFinite(inrPerUsd) &&
    inrPerUsd > 0 &&
    Number.isFinite(currencyPerUsd) &&
    currencyPerUsd > 0
  ) {
    return inrPerUsd / currencyPerUsd;
  }

  return null;
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const today = new Date(`${isoToday()}T00:00:00`);
  const due = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function reminderState(row) {
  const remainingDays = daysUntil(row.next_payment_date);
  const reminderWindow = Number(row.reminder_days_before ?? 7);
  const status = String(row.payment_status || "").toLowerCase();
  const paymentPending = status !== "paid" && status !== "cancelled";

  if (!paymentPending || remainingDays === null) {
    return { active: false, label: "No reminder", tone: "slate", remainingDays };
  }
  if (remainingDays < 0) {
    return { active: true, label: `${Math.abs(remainingDays)} day(s) overdue`, tone: "red", remainingDays };
  }
  if (remainingDays === 0) {
    return { active: true, label: "Due today", tone: "red", remainingDays };
  }
  if (remainingDays <= reminderWindow) {
    return { active: true, label: `Due in ${remainingDays} day(s)`, tone: "amber", remainingDays };
  }
  return { active: false, label: `Due in ${remainingDays} day(s)`, tone: "green", remainingDays };
}

function statusBadgeClasses(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (normalized === "overdue") return "bg-red-50 text-red-700 border-red-200";
  if (normalized === "cancelled") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function reminderBadgeClasses(tone) {
  if (tone === "red") return "bg-red-50 text-red-700 border-red-200";
  if (tone === "amber") return "bg-amber-50 text-amber-700 border-amber-200";
  if (tone === "green") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function parseAttachments(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function sanitizeFileName(name) {
  return String(name || "invoice")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

const SoftwareSubscriptions = () => {
  const { user, userProfile } = useAuth();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [invoiceFiles, setInvoiceFiles] = useState([]);
  const [usdInrRate, setUsdInrRate] = useState(FALLBACK_USD_INR_RATE);
  const [fxRates, setFxRates] = useState(FALLBACK_USD_RATES);
  const [fxUpdatedAt, setFxUpdatedAt] = useState("");
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState("");

  const canUseModule =
    userProfile?.role === ROLES.SUPER_ADMIN ||
    userProfile?.role === ROLES.SUPER_ADMIN_PRO;

  const fetchUsdInrRate = async () => {
    if (!canUseModule) return;
    setFxLoading(true);
    setFxError("");
    try {
      const response = await fetch(FX_RATE_API_URL);
      if (!response.ok) throw new Error(`FX API returned ${response.status}`);
      const data = await response.json();
      const nextRate = Number(data?.rates?.INR);
      if (!Number.isFinite(nextRate) || nextRate <= 0) throw new Error("FX API did not return INR rate.");
      setFxRates({ ...FALLBACK_USD_RATES, ...(data?.rates || {}) });
      setUsdInrRate(nextRate);
      setFxUpdatedAt(data?.time_last_update_utc || new Date().toISOString());
    } catch (err) {
      setFxRates((current) => (current?.INR ? current : FALLBACK_USD_RATES));
      setUsdInrRate((current) => (Number.isFinite(Number(current)) && Number(current) > 0 ? current : FALLBACK_USD_INR_RATE));
      setFxError("Live FX unavailable. Using the last available or fallback currency rates.");
    } finally {
      setFxLoading(false);
    }
  };

  const fetchSubscriptions = async () => {
    if (!canUseModule) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await supabase
        .from(TABLE_NAME)
        .select("*")
        .order("next_payment_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;
      setSubscriptions(data || []);
    } catch (err) {
      setError(
        `${err?.message || "Unable to load software subscriptions."} ` +
          `Run the software subscriptions Supabase migration if this table is not available yet.`
      );
      setSubscriptions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
    fetchUsdInrRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseModule]);

  useEffect(() => {
    setForm((prev) => {
      const multiplier = getInrRateForCurrency(prev.currency, fxRates);
      if (!multiplier) return prev;
      return {
        ...prev,
        monthly_cost_inr: String(Math.round(toNumber(prev.monthly_cost_ongoing) * multiplier)),
        yearly_cost_inr: String(Math.round(toNumber(prev.yearly_cost_ongoing) * multiplier)),
      };
    });
  }, [fxRates]);

  const totals = useMemo(() => {
    return subscriptions.reduce(
      (acc, row) => {
        const status = String(row.payment_status || "").toLowerCase();
        if (status !== "cancelled") {
          acc.monthly += toNumber(row.monthly_cost_inr);
          acc.yearly += toNumber(row.yearly_cost_inr);
          acc.active += 1;
        }
        if (reminderState(row).active) acc.reminders += 1;
        return acc;
      },
      { monthly: 0, yearly: 0, active: 0, reminders: 0 }
    );
  }, [subscriptions]);

  const reminders = useMemo(
    () =>
      subscriptions
        .map((row) => ({ ...row, reminder: reminderState(row) }))
        .filter((row) => row.reminder.active)
        .sort((a, b) => (a.reminder.remainingDays ?? 9999) - (b.reminder.remainingDays ?? 9999)),
    [subscriptions]
  );

  const handleChange = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "currency" || field === "monthly_cost_ongoing" || field === "yearly_cost_ongoing") {
        const multiplier = getInrRateForCurrency(next.currency, fxRates);
        if (multiplier) {
          next.monthly_cost_inr = String(Math.round(toNumber(next.monthly_cost_ongoing) * multiplier));
          next.yearly_cost_inr = String(Math.round(toNumber(next.yearly_cost_ongoing) * multiplier));
        }
      }
      return next;
    });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setInvoiceFiles([]);
    setEditingId(null);
    setError("");
  };

  const uploadInvoiceFiles = async (recordId) => {
    if (!invoiceFiles.length) return [];

    const uploaded = [];
    for (const file of invoiceFiles) {
      const filePath = `${recordId}/${Date.now()}-${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(INVOICE_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });
      if (uploadError) throw uploadError;
      uploaded.push({
        name: file.name,
        path: filePath,
        size: file.size,
        type: file.type || "application/octet-stream",
        uploaded_at: new Date().toISOString(),
      });
    }
    return uploaded;
  };

  const removeFormAttachment = (path) => {
    setForm((prev) => ({
      ...prev,
      invoice_attachments: parseAttachments(prev.invoice_attachments).filter((item) => item.path !== path),
    }));
  };

  const openInvoiceAttachment = async (attachment) => {
    const path = attachment?.path;
    if (!path) return;
    try {
      const { data, error: signedUrlError } = await supabase.storage
        .from(INVOICE_BUCKET)
        .createSignedUrl(path, 60 * 10);
      if (signedUrlError) throw signedUrlError;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err?.message || "Unable to open invoice attachment.");
    }
  };

  const saveSubscription = async (event) => {
    event.preventDefault();
    if (!form.tool_service.trim()) {
      setError("Tool / Service is required.");
      return;
    }

    setSaving(true);
    setError("");
    const recordId = editingId || crypto.randomUUID();
    let uploadedAttachments = [];
    try {
      uploadedAttachments = await uploadInvoiceFiles(recordId);
    } catch (err) {
      setSaving(false);
      setError(err?.message || "Unable to upload invoice attachment.");
      return;
    }

    const invoiceAttachments = [
      ...parseAttachments(form.invoice_attachments),
      ...uploadedAttachments,
    ];

    const payload = {
      tool_service: form.tool_service.trim(),
      description: form.description.trim() || null,
      purchase_price_first_year: toNumber(form.purchase_price_first_year),
      monthly_cost_ongoing: toNumber(form.monthly_cost_ongoing),
      yearly_cost_ongoing: toNumber(form.yearly_cost_ongoing),
      currency: form.currency || "INR",
      monthly_cost_inr: toNumber(form.monthly_cost_inr),
      yearly_cost_inr: toNumber(form.yearly_cost_inr),
      credit_card: form.credit_card.trim() || null,
      invoices: form.invoices.trim() || null,
      invoice_attachments: invoiceAttachments,
      billing_type: form.billing_type || "prepaid",
      payment_type: form.payment_type || "Recurring",
      next_payment_date: form.next_payment_date || null,
      payment_status: form.payment_status || "pending",
      reminder_days_before: Math.max(0, Math.trunc(toNumber(form.reminder_days_before || 7))),
      notes: form.notes.trim() || null,
      updated_by: user?.id || null,
    };

    try {
      if (editingId) {
        const { error: updateError } = await supabase
          .from(TABLE_NAME)
          .update(payload)
          .eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from(TABLE_NAME).insert([
          {
            id: recordId,
            ...payload,
            created_by: user?.id || null,
          },
        ]);
        if (insertError) throw insertError;
      }
      resetForm();
      await fetchSubscriptions();
    } catch (err) {
      setError(err?.message || "Unable to save subscription.");
    } finally {
      setSaving(false);
    }
  };

  const editSubscription = (row) => {
    setEditingId(row.id);
    setForm({
      tool_service: row.tool_service || "",
      description: row.description || "",
      purchase_price_first_year: row.purchase_price_first_year ?? "",
      monthly_cost_ongoing: row.monthly_cost_ongoing ?? "",
      yearly_cost_ongoing: row.yearly_cost_ongoing ?? "",
      currency: row.currency || "INR",
      monthly_cost_inr: row.monthly_cost_inr ?? "",
      yearly_cost_inr: row.yearly_cost_inr ?? "",
      credit_card: row.credit_card || "",
      invoices: row.invoices || "",
      invoice_attachments: parseAttachments(row.invoice_attachments),
      billing_type: row.billing_type || "prepaid",
      payment_type: row.payment_type || "Recurring",
      next_payment_date: row.next_payment_date || "",
      payment_status: row.payment_status || "pending",
      reminder_days_before: row.reminder_days_before ?? "7",
      notes: row.notes || "",
    });
    setInvoiceFiles([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const markPaid = async (row) => {
    setSaving(true);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from(TABLE_NAME)
        .update({ payment_status: "paid", updated_by: user?.id || null })
        .eq("id", row.id);
      if (updateError) throw updateError;
      await fetchSubscriptions();
    } catch (err) {
      setError(err?.message || "Unable to mark payment as paid.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSubscription = async (row) => {
    if (!window.confirm(`Delete subscription for ${row.tool_service}?`)) return;
    setSaving(true);
    setError("");
    try {
      const { error: deleteError } = await supabase.from(TABLE_NAME).delete().eq("id", row.id);
      if (deleteError) throw deleteError;
      await fetchSubscriptions();
    } catch (err) {
      setError(err?.message || "Unable to delete subscription.");
    } finally {
      setSaving(false);
    }
  };

  if (!canUseModule) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-amber-800">
          Only Super Admin can access Software subscriptions/reminders.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-100">
            <Bell className="w-6 h-6 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Software subscriptions/reminders</h1>
            <p className="text-sm text-slate-500">
              Entry, tracking, and payment reminders for all company software subscriptions.
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              FX Reference: live currency conversion to INR. 1 USD = Rs. {formatRate(usdInrRate)}{" "}
              <span className={fxError ? "text-amber-600" : "text-emerald-600"}>
                {fxLoading ? "(updating...)" : fxError ? "(fallback/last available)" : "(live)"}
              </span>
              <span className="ml-2 text-slate-400">Updated: {formatFxTimestamp(fxUpdatedAt)}</span>
            </p>
            {fxError ? <p className="mt-1 text-xs text-amber-600">{fxError}</p> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            fetchSubscriptions();
            fetchUsdInrRate();
          }}
          disabled={loading || fxLoading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading || fxLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Active subscriptions" value={totals.active} icon={<ReceiptText className="w-5 h-5" />} />
        <StatCard label="Monthly cost" value={money(totals.monthly)} icon={<CreditCard className="w-5 h-5" />} />
        <StatCard label="Yearly cost" value={money(totals.yearly)} icon={<CalendarDays className="w-5 h-5" />} />
        <StatCard label="Payment reminders" value={totals.reminders} icon={<AlertTriangle className="w-5 h-5" />} />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">1. Entry of all subscriptions taken</h2>
          <p className="text-sm text-slate-500">Fields follow the subscription sheet format from the shared image.</p>
        </div>
        <form onSubmit={saveSubscription} className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Field label="Tool / Service" required>
              <input
                value={form.tool_service}
                onChange={(e) => handleChange("tool_service", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="Adobe, Zoho, Microsoft 365"
              />
            </Field>
            <Field label="Description">
              <input
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="Annual license, payroll tool, storage"
              />
            </Field>
            <Field label="Purchase Price (First Year)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.purchase_price_first_year}
                onChange={(e) => handleChange("purchase_price_first_year", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </Field>
            <Field label="Currency">
              <select
                value={form.currency}
                onChange={(e) => handleChange("currency", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                {currencyOptions.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                {form.currency === "INR"
                  ? "Base currency: 1 INR = Rs. 1.00"
                  : getInrRateForCurrency(form.currency, fxRates)
                    ? `Live conversion: 1 ${form.currency} = Rs. ${formatRate(getInrRateForCurrency(form.currency, fxRates))}`
                    : `Live conversion for ${form.currency} is unavailable right now.`}
              </span>
            </Field>
            <Field label="Monthly Cost (Ongoing)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthly_cost_ongoing}
                onChange={(e) => handleChange("monthly_cost_ongoing", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </Field>
            <Field label="Yearly Cost (Ongoing)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.yearly_cost_ongoing}
                onChange={(e) => handleChange("yearly_cost_ongoing", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </Field>
            <Field label="Monthly Cost (in Rs.)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthly_cost_inr}
                onChange={(e) => handleChange("monthly_cost_inr", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </Field>
            <Field label="Yearly Cost (in Rs.)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.yearly_cost_inr}
                onChange={(e) => handleChange("yearly_cost_inr", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </Field>
            <Field label="Credit Card">
              <input
                value={form.credit_card}
                onChange={(e) => handleChange("credit_card", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="Bank / last 4 digits"
              />
            </Field>
            <Field label="Invoices">
              <input
                value={form.invoices}
                onChange={(e) => handleChange("invoices", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="Invoice no. or URL"
              />
            </Field>
            <Field label="Attach invoices">
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.doc,.docx"
                onChange={(e) => setInvoiceFiles(Array.from(e.target.files || []))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Upload PDF/image/Excel/Word invoice copies against this subscription.
              </span>
              {invoiceFiles.length ? (
                <div className="mt-2 space-y-1">
                  {invoiceFiles.map((file) => (
                    <p key={`${file.name}-${file.size}`} className="truncate text-xs text-slate-600">
                      New: {file.name}
                    </p>
                  ))}
                </div>
              ) : null}
              {parseAttachments(form.invoice_attachments).length ? (
                <div className="mt-2 space-y-1">
                  {parseAttachments(form.invoice_attachments).map((attachment) => (
                    <div key={attachment.path || attachment.name} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 text-xs">
                      <button
                        type="button"
                        onClick={() => openInvoiceAttachment(attachment)}
                        className="min-w-0 truncate font-medium text-indigo-700 hover:underline"
                      >
                        {attachment.name || "Invoice attachment"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFormAttachment(attachment.path)}
                        className="shrink-0 text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </Field>
            <Field label="Payment Type">
              <select
                value={form.payment_type}
                onChange={(e) => handleChange("payment_type", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                {paymentTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Billing Type">
              <select
                value={form.billing_type}
                onChange={(e) => handleChange("billing_type", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                {billingTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Next Payment Due">
              <input
                type="date"
                value={form.next_payment_date}
                onChange={(e) => handleChange("next_payment_date", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </Field>
            <Field label="Payment Status">
              <select
                value={form.payment_status}
                onChange={(e) => handleChange("payment_status", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                {paymentStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reminder Before (days)">
              <input
                type="number"
                min="0"
                step="1"
                value={form.reminder_days_before}
                onChange={(e) => handleChange("reminder_days_before", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </Field>
            <Field label="Notes">
              <input
                value={form.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="Owner, renewal note, login owner"
              />
            </Field>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel edit
              </button>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {saving ? "Saving..." : editingId ? "Save changes" : "Add subscription"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">2. Tracking of all subscriptions</h2>
            <p className="text-sm text-slate-500">Track cost, payment method, invoice reference, and current payment status.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1400px] w-full text-sm">
            <thead className="bg-blue-700 text-white">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">Tool / Service</th>
                <th className="px-3 py-3 text-left font-semibold">Description</th>
                <th className="px-3 py-3 text-right font-semibold">Purchase Price (First Year)</th>
                <th className="px-3 py-3 text-right font-semibold">Monthly Cost (Ongoing)</th>
                <th className="px-3 py-3 text-right font-semibold">Yearly Cost (Ongoing)</th>
                <th className="px-3 py-3 text-left font-semibold">Currency</th>
                <th className="px-3 py-3 text-right font-semibold">Monthly Cost (in Rs.)</th>
                <th className="px-3 py-3 text-right font-semibold">Yearly Cost (in Rs.)</th>
                <th className="px-3 py-3 text-left font-semibold">Credit Card</th>
                <th className="px-3 py-3 text-left font-semibold">Invoices</th>
                <th className="px-3 py-3 text-left font-semibold">Payment Type</th>
                <th className="px-3 py-3 text-left font-semibold">Billing Type</th>
                <th className="px-3 py-3 text-left font-semibold">Next Payment</th>
                <th className="px-3 py-3 text-left font-semibold">Status</th>
                <th className="px-3 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={15} className="px-4 py-8 text-center text-slate-500">
                    Loading subscriptions...
                  </td>
                </tr>
              ) : subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-8 text-center text-slate-500">
                    No software subscriptions entered yet.
                  </td>
                </tr>
              ) : (
                subscriptions.map((row) => {
                  const reminder = reminderState(row);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-semibold text-slate-900">{row.tool_service}</td>
                      <td className="px-3 py-3 text-slate-600">{row.description || "-"}</td>
                      <td className="px-3 py-3 text-right text-slate-700">{toNumber(row.purchase_price_first_year).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3 text-right text-slate-700">{toNumber(row.monthly_cost_ongoing).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3 text-right text-slate-700">{toNumber(row.yearly_cost_ongoing).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3 text-slate-700">{row.currency || "INR"}</td>
                      <td className="px-3 py-3 text-right font-medium text-slate-900">{money(row.monthly_cost_inr)}</td>
                      <td className="px-3 py-3 text-right font-medium text-slate-900">{money(row.yearly_cost_inr)}</td>
                      <td className="px-3 py-3 text-slate-600">{row.credit_card || "-"}</td>
                      <td className="px-3 py-3 text-slate-600">
                        <div className="space-y-1">
                          {isUrl(row.invoices) ? (
                            <a href={row.invoices} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">
                              Open invoice link
                            </a>
                          ) : (
                            <span>{row.invoices || "-"}</span>
                          )}
                          {parseAttachments(row.invoice_attachments).map((attachment) => (
                            <button
                              key={attachment.path || attachment.name}
                              type="button"
                              onClick={() => openInvoiceAttachment(attachment)}
                              className="flex max-w-[14rem] items-center gap-1 truncate text-xs font-medium text-indigo-700 hover:underline"
                              title={attachment.name || "Invoice attachment"}
                            >
                              <Paperclip className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{attachment.name || "Invoice attachment"}</span>
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{row.payment_type || "-"}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                          {(row.billing_type || "prepaid").toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${reminderBadgeClasses(reminder.tone)}`}>
                          {row.next_payment_date ? `${row.next_payment_date} (${reminder.label})` : "Not set"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClasses(row.payment_status)}`}>
                          {(row.payment_status || "pending").toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => editSubscription(row)}
                            className="rounded-md bg-indigo-50 p-2 text-indigo-700 hover:bg-indigo-100"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => markPaid(row)}
                            disabled={saving || row.payment_status === "paid"}
                            className="rounded-md bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                            title="Mark paid"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSubscription(row)}
                            className="rounded-md bg-red-50 p-2 text-red-700 hover:bg-red-100"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">3. Reminders for pending payments</h2>
          <p className="text-sm text-slate-500">Payments appear here when they are overdue, due today, or inside their reminder window.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {reminders.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No pending payment reminders at the moment.
            </div>
          ) : (
            reminders.map((row) => (
              <div key={row.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{row.tool_service}</h3>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${reminderBadgeClasses(row.reminder.tone)}`}>
                      {row.reminder.label}
                    </span>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClasses(row.payment_status)}`}>
                      {(row.payment_status || "pending").toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Next payment: {row.next_payment_date || "Not set"} | Payment type: {row.payment_type || "-"} | Billing type: {row.billing_type || "prepaid"} | Card: {row.credit_card || "-"}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm font-semibold text-slate-900">{money(row.yearly_cost_inr)} yearly</p>
                  <p className="text-xs text-slate-500">{money(row.monthly_cost_inr)} monthly</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

const Field = ({ label, required = false, children }) => (
  <label className="block">
    <span className="mb-1 block text-sm font-medium text-slate-700">
      {label}
      {required ? <span className="text-red-600"> *</span> : null}
    </span>
    {children}
  </label>
);

const StatCard = ({ label, value, icon }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      </div>
      <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700">{icon}</div>
    </div>
  </div>
);

export default SoftwareSubscriptions;
