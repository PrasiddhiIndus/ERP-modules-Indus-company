import React, { useMemo } from "react";
import { Eye, Paperclip, Pencil, X } from "lucide-react";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import { inquiryRowToForm, formatInquiryCellValue } from "../utils/manpowerEnquiryExcelFields";

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => String(item || "").trim()).filter(Boolean);
    return cleaned.length ? cleaned.join(", ") : "—";
  }
  return String(value);
}

function formatDateValue(value) {
  if (!value) return "—";
  // datetime-local ISO may include T — show date + time when present
  const raw = String(value);
  if (raw.includes("T")) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      const date = formatDateDdMmYyyy(d) || "";
      const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      return `${date} ${time}`.trim();
    }
  }
  return formatDateDdMmYyyy(value) || "—";
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "—";
  const formatted = formatInquiryCellValue(value, "currency", formatDateDdMmYyyy);
  return formatted === "—" ? "—" : `₹ ${formatted}`;
}

function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("approv") || s === "new") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s.includes("progress") || s.includes("in progress")) return "bg-sky-50 text-sky-700 border-sky-200";
  if (s.includes("reject") || s.includes("regret")) return "bg-rose-50 text-rose-700 border-rose-200";
  if (s.includes("pending")) return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function verticalTone(vertical) {
  const v = String(vertical || "").toLowerCase();
  if (v.includes("fire")) return "bg-rose-50 text-rose-700 border-rose-200";
  if (v.includes("train")) return "bg-teal-50 text-teal-700 border-teal-200";
  if (v.includes("manpower")) return "bg-purple-50 text-purple-700 border-purple-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5";
const valueBoxClass =
  "w-full min-h-10 px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-800 whitespace-pre-wrap break-words";
const valueBoxTallClass = `${valueBoxClass} min-h-[88px]`;
const gridClass = "grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5";
const gridThreeClass = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5";

function FormSection({ number, title, hint, children, variant = "default" }) {
  const isTender = variant === "tender";
  return (
    <div
      className={`rounded-xl border shadow-sm ${
        isTender ? "border-blue-200/80 bg-gradient-to-b from-blue-50/60 to-white" : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`flex flex-wrap items-start gap-2 px-5 sm:px-6 pt-5 pb-4 border-b ${
          isTender ? "border-blue-100" : "border-slate-100"
        }`}
      >
        {number ? (
          <span
            className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-xs font-bold ${
              isTender ? "bg-blue-200 text-blue-900" : "bg-purple-100 text-purple-800"
            }`}
          >
            {number}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h4 className={`text-sm font-semibold sm:text-base ${isTender ? "text-blue-900" : "text-slate-900"}`}>
            {title}
          </h4>
          {hint ? (
            <p className={`text-xs mt-1 leading-relaxed ${isTender ? "text-blue-700/75" : "text-slate-500"}`}>
              {hint}
            </p>
          ) : null}
        </div>
      </div>
      <div className="px-5 sm:px-6 py-5">{children}</div>
    </div>
  );
}

function Field({ label, children, className = "", hint }) {
  return (
    <div className={className}>
      <label className={labelClass}>{label}</label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{hint}</p> : null}
    </div>
  );
}

function ValueBox({ value, tall = false, className = "" }) {
  return <div className={`${tall ? valueBoxTallClass : valueBoxClass} ${className}`.trim()}>{value}</div>;
}

function SelectedPill({ label }) {
  if (!label || label === "—") {
    return <span className="text-sm text-slate-400">—</span>;
  }
  return (
    <span className="inline-flex items-center rounded-lg border border-purple-600 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-800 shadow-sm">
      {label}
    </span>
  );
}

function FeeEntryPanel({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {title ? <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">{title}</p> : null}
      {children}
    </div>
  );
}

export default function ManpowerEnquiryPreviewModal({ row, onClose, onEdit }) {
  const form = useMemo(() => (row ? inquiryRowToForm(row) : null), [row]);
  if (!row || !form) return null;

  const contacts = (form.contacts || []).filter((c) => c?.name || c?.email || c?.phone);
  const isOnlineTender = String(form.sourceType || "") === "Online Tender";
  const isTenderFeeApplicable = form.tenderFeeApplicable === "Applicable";
  const isEmdFeePayable = form.emdFeeStatus === "Applicable - Pay";
  const isPaymentRequired = isTenderFeeApplicable || isEmdFeePayable;
  const isAsPerClientHours = form.workingHoursShift === "As per client";
  const showScopeText = form.scopeInputType === "Text" || form.scopeInputType === "Both" || !form.scopeInputType;
  const showScopeAttach =
    form.scopeInputType === "Attachment" ||
    form.scopeInputType === "Both" ||
    (form.scopeAttachmentPaths || []).length > 0;
  const serviceCategoryDisplay =
    form.serviceCategory === "Other (manual entry)"
      ? form.serviceCategoryCustom || "Other (manual entry)"
      : form.serviceCategory;
  const assignedTo = form.assignedToList?.length
    ? form.assignedToList
    : String(form.enquiryAssignedTo || "")
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="h-1.5 bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 shrink-0" />
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Eye className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">Enquiry Preview</h2>
            </div>
            <p className="mt-1 truncate text-sm text-slate-600">
              Same field pattern as entry — values as entered
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {form.vertical ? (
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${verticalTone(form.vertical)}`}>
                  {form.vertical}
                </span>
              ) : null}
              {row.status ? (
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusTone(row.status)}`}>
                  {row.status}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 bg-slate-50 px-4 py-4 sm:px-6 sm:py-5">
          <FormSection
            number="3.1"
            title="Common Header — Enquiry Details"
            hint="Shared fields for all enquiry types."
          >
            <div className={gridClass}>
              <Field label="Enquiry ID">
                <ValueBox value={displayValue(form.enquiryNumber)} />
              </Field>
              <Field label="Enquiry Date">
                <ValueBox value={formatDateValue(form.enquiryDate || form.receivedDate)} />
              </Field>
              <Field label="Assigned To" className="sm:col-span-2">
                {assignedTo.length ? (
                  <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    {assignedTo.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center rounded-md bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-800"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <ValueBox value="—" />
                )}
              </Field>
              <Field label="Vertical">
                <ValueBox value={displayValue(form.vertical)} />
              </Field>
              <Field label="Source Type">
                <ValueBox value={displayValue(form.sourceType)} />
              </Field>
              <Field label="Submission Remark" className="sm:col-span-2">
                <ValueBox value={displayValue(form.submissionRemark)} tall />
              </Field>
            </div>
          </FormSection>

          {isOnlineTender ? (
            <FormSection
              number="3.2"
              title="Online Tender Fields"
              hint="Portal details and fee entries — shown when Source Type is Online Tender."
              variant="tender"
            >
              <div className={gridClass}>
                <Field label="Portal Name">
                  <ValueBox value={displayValue(form.portalNameOption)} />
                </Field>
                <Field label="Custom Portal Name">
                  <ValueBox value={displayValue(form.portalNameCustom)} />
                </Field>
                <Field label="Tender Number">
                  <ValueBox value={displayValue(form.tenderNumber)} />
                </Field>
                <Field label="Estimated Value (Client)">
                  <ValueBox value={formatCurrency(form.estimatedValueClient)} />
                </Field>
                <Field label="Our Quoted Rate">
                  <ValueBox value={formatCurrency(form.ourQuotedRate)} />
                </Field>
                <Field label="Portal Screenshot / Proof" className="sm:col-span-2" hint="PNG or PDF of submission confirmation.">
                  <ValueBox
                    value={
                      form.portalProofPath
                        ? String(form.portalProofPath).split("/").pop() || form.portalProofPath
                        : "—"
                    }
                  />
                </Field>
              </div>

              <div className="mt-6 pt-5 border-t border-blue-200/70">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-800 mb-4">Fees &amp; Payment</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <FeeEntryPanel title="Tender Fee">
                    <Field label="Tender Fee Applicable?">
                      <SelectedPill label={displayValue(form.tenderFeeApplicable)} />
                    </Field>
                    {isTenderFeeApplicable ? (
                      <div className="mt-4 rounded-md border border-blue-100 bg-blue-50/50 p-3.5">
                        <Field label="Tender Fee Amount (Manual Entry)">
                          <ValueBox value={formatCurrency(form.tenderFeeAmount)} />
                        </Field>
                      </div>
                    ) : null}
                  </FeeEntryPanel>

                  <FeeEntryPanel title="EMD Fee">
                    <Field label="EMD Fee Status">
                      <ValueBox value={displayValue(form.emdFeeStatus)} />
                    </Field>
                    {isEmdFeePayable ? (
                      <div className="mt-4 rounded-md border border-blue-100 bg-blue-50/50 p-3.5">
                        <Field label="EMD Fee Amount (Manual Entry)">
                          <ValueBox value={formatCurrency(form.emdFeeAmount)} />
                        </Field>
                      </div>
                    ) : null}
                    {form.emdFeeStatus === "Exempted" ? (
                      <p className="mt-3 text-xs text-slate-500 leading-relaxed">EMD is exempted — no payment entry required.</p>
                    ) : null}
                  </FeeEntryPanel>
                </div>

                {isPaymentRequired ? (
                  <div className="mt-5 rounded-lg border border-amber-200/80 bg-amber-50/40 p-4 sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 mb-4">Payment Details</p>
                    <div className={gridClass}>
                      <Field label="Payment Mode">
                        <ValueBox value={displayValue(form.paymentMode)} />
                      </Field>
                      <Field label="DD / NEFT Reference No.">
                        <ValueBox value={displayValue(form.paymentReferenceNo)} />
                      </Field>
                      <Field label="Payment Date">
                        <ValueBox value={formatDateValue(form.paymentDate)} />
                      </Field>
                    </div>
                  </div>
                ) : null}
              </div>
            </FormSection>
          ) : null}

          <FormSection
            title="Client & Contact Person"
            hint="Enter client name, then add contact rows like an Excel sheet — one person per line."
          >
            <div className="mb-5 max-w-xl">
              <Field label="Client Name">
                <ValueBox value={displayValue(form.clientName)} />
              </Field>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Contact persons</p>
              <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-800">
                {contacts.length} row{contacts.length === 1 ? "" : "s"} filled
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-100">
                    <th className="w-12 border-r border-slate-300 px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      #
                    </th>
                    <th className="min-w-[180px] border-r border-slate-300 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      Name
                    </th>
                    <th className="min-w-[200px] border-r border-slate-300 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      Email
                    </th>
                    <th className="min-w-[140px] px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      Phone
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(contacts.length ? contacts : [{ name: "", email: "", phone: "" }]).map((contact, index) => (
                    <tr key={`preview-contact-${index}`} className="border-b border-slate-200">
                      <td className="border-r border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-xs font-medium tabular-nums text-slate-500">
                        {index + 1}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-2.5 text-slate-800">{displayValue(contact?.name)}</td>
                      <td className="border-r border-slate-200 px-3 py-2.5 text-slate-800">{displayValue(contact?.email)}</td>
                      <td className="px-3 py-2.5 text-slate-800">{displayValue(contact?.phone)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FormSection>

          <FormSection title="Site / Project Location" hint="State, city, and site name.">
            <div className={gridThreeClass}>
              <Field label="State">
                <ValueBox value={displayValue(form.siteState)} />
              </Field>
              <Field label="City">
                <ValueBox value={displayValue(form.siteCity)} />
              </Field>
              <Field label="Site Name">
                <ValueBox value={displayValue(form.siteName)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Service & Category">
            <div className={gridClass}>
              <Field label="Industry / Sector">
                <ValueBox value={displayValue(form.industrySector)} />
              </Field>
              <Field label="Service Category">
                <ValueBox value={displayValue(serviceCategoryDisplay)} />
              </Field>
            </div>
            <div className="mt-5">
              <Field label="Enquiry Sub-type">
                <SelectedPill label={displayValue(form.enquirySubType)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Scope of Work" hint="SOP document upload or text entry.">
            <div className="mb-4">
              <Field label="Input Type">
                <SelectedPill label={displayValue(form.scopeInputType || "Text")} />
              </Field>
            </div>
            {showScopeText ? (
              <ValueBox value={displayValue(form.scopeOfWork || form.descriptionOfWork)} tall />
            ) : null}
            {showScopeAttach ? (
              <div className="mt-3 space-y-3">
                <label className={labelClass}>SOP Document Upload</label>
                {(form.scopeAttachmentPaths || []).length > 0 ? (
                  <div className="space-y-2">
                    {(form.scopeAttachmentPaths || []).map((path, index) => (
                      <div
                        key={`scope-path-${path}-${index}`}
                        className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                      >
                        <Paperclip className="h-4 w-4 shrink-0" />
                        <span className="truncate" title={path}>
                          {String(path).split("/").pop() || path}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ValueBox value="—" />
                )}
              </div>
            ) : null}
          </FormSection>

          <FormSection title="Contract, Wage & Deadline">
            <div className={gridThreeClass}>
              <Field label="No. of Manpower">
                <ValueBox value={displayValue(form.totalManpower)} />
              </Field>
              <Field label="Contract Duration">
                <div className="flex gap-2">
                  <ValueBox value={displayValue(form.contractDurationValue)} className="flex-1" />
                  <ValueBox value={displayValue(form.contractDurationUnit)} className="w-28 shrink-0" />
                </div>
              </Field>
              <Field label="Timeline">
                <div className="flex items-center gap-2">
                  <ValueBox value={formatDateValue(form.contractTimelineStart)} className="flex-1" />
                  <span className="shrink-0 text-xs font-medium text-slate-500">to</span>
                  <ValueBox value={formatDateValue(form.contractTimelineEnd)} className="flex-1" />
                </div>
              </Field>
              <Field label="Working Hours / Shift">
                <ValueBox value={displayValue(form.workingHoursShift)} />
                {isAsPerClientHours || form.customWorkingHours ? (
                  <div className="mt-2">
                    <ValueBox value={displayValue(form.customWorkingHours)} />
                  </div>
                ) : null}
              </Field>
              <Field label="Applicable State (for MW)">
                <ValueBox value={displayValue(form.applicableStateMw)} />
              </Field>
            </div>
            <div className="mt-5">
              <Field
                label="Submission / Bid Deadline"
                hint="Reminder alerts use Timeline Settings on the Commercial Dashboard."
              >
                <ValueBox value={formatDateValue(form.submissionBidDeadline || form.dueDate)} />
              </Field>
            </div>
          </FormSection>

          {(form.enquiryAttachmentPaths || []).length > 0 ? (
            <FormSection
              title="Additional Attachments"
              hint="Supporting files attached with this enquiry."
            >
              <div className="space-y-2">
                {(form.enquiryAttachmentPaths || []).map((path, index) => (
                  <div
                    key={`enquiry-attach-${path}-${index}`}
                    className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                  >
                    <Paperclip className="h-4 w-4 shrink-0" />
                    <span className="truncate" title={path}>
                      {String(path).split("/").pop() || path}
                    </span>
                  </div>
                ))}
              </div>
            </FormSection>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            Close
          </button>
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(row.id)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-purple-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700"
            >
              <Pencil className="h-4 w-4" />
              Edit Enquiry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { statusTone, verticalTone };
