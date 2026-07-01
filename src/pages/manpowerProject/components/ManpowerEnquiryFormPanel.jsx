import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import FormDateInput from "../../../components/FormDateInput";
import FormDateTimeInput from "../../../components/FormDateTimeInput";

import {
  VERTICAL_OPTIONS,
  MODE_OF_SUBMISSION_OPTIONS,
  SOURCE_TYPE_OPTIONS,
  INDUSTRY_OPTIONS,
  WORKING_HOURS_OPTIONS,
  ENQUIRY_SUBTYPE_OPTIONS,
  SERVICE_CATEGORY_OPTIONS,
  CONTRACT_DURATION_UNITS,
  INDIA_STATES_UT,
  TENDER_PORTAL_OPTIONS,
  EMD_FEE_STATUS_OPTIONS,
  PAYMENT_MODE_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  parseAuthorizationMeta,
  buildInquiryDbPayload,
  inquiryRowToForm,
  getNextSrNo,
  getNextEnquiryNumber,
} from "../utils/manpowerEnquiryExcelFields";
import {
  fetchCommercialAssigneeOptions,
  mergeAssignedToOptions,
} from "../utils/commercialInquiryAssignees";

const emptyForm = {
  enquiryNumber: "",
  enquiryDate: new Date().toISOString().split("T")[0],
  receivedBy: "",
  sourceType: "Direct Mail",
  clientName: "",
  contactPersonName: "",
  contactPersonDesignation: "",
  contactPersonPhone: "",
  contactPersonEmail: "",
  siteState: "",
  siteCity: "",
  siteName: "",
  industrySector: "",
  serviceCategory: "",
  enquirySubType: "Regular",
  scopeInputType: "Text",
  scopeOfWork: "",
  scopeAttachment: null,
  contractDurationValue: "",
  contractDurationUnit: "Months",
  workingHoursShift: "",
  applicableStateMw: "",
  minWageEffectiveDate: "",
  submissionBidDeadline: "",
  portalNameOption: "",
  portalNameCustom: "",
  tenderNumber: "",
  estimatedValueClient: "",
  ourQuotedRate: "",
  portalSubmissionDate: "",
  portalProofAttachment: null,
  portalProofPath: "",
  tenderFeeApplicable: "Not Applicable",
  tenderFeeAmount: "",
  emdFeeStatus: "Not Applicable",
  emdFeeAmount: "",
  paymentMode: "",
  paymentReferenceNo: "",
  paymentStatus: "",
  paymentDate: "",
  srNo: "",
  receivedDate: new Date().toISOString().split("T")[0],
  vertical: "",
  modeOfSubmission: "",
  totalManpower: "",
  location: "",
  descriptionOfWork: "",
  approxValue: "",
  enquiryAssignedTo: "",
  dueDate: "",
  offerSubmittedOn: "",
  remarks: "",
  furtherAction: "",
};

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
        {number && (
          <span
            className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-xs font-bold ${
              isTender ? "bg-blue-200 text-blue-900" : "bg-purple-100 text-purple-800"
            }`}
          >
            {number}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h4 className={`text-sm font-semibold sm:text-base ${isTender ? "text-blue-900" : "text-slate-900"}`}>
            {title}
          </h4>
          {hint && (
            <p className={`text-xs mt-1 leading-relaxed ${isTender ? "text-blue-700/75" : "text-slate-500"}`}>
              {hint}
            </p>
          )}
        </div>
      </div>
      <div className="px-5 sm:px-6 py-5">{children}</div>
    </div>
  );
}

function Field({ label, required, children, className = "", hint }) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
        {label}
        {required && <span className="text-red-500 normal-case tracking-normal ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{hint}</p>}
    </div>
  );
}

function CurrencyInput({ name, value, onChange, placeholder = "0", disabled = false, inputClass }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">
        ₹
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className={`${inputClass} pl-9`}
      />
    </div>
  );
}

function RadioPills({ name, value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <label
            key={opt.value}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              selected
                ? "border-purple-600 bg-purple-50 text-purple-800 shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={onChange}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

function FeeEntryPanel({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {title && <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">{title}</p>}
      {children}
    </div>
  );
}

const ManpowerEnquiryFormPanel = ({ enquiryId, onSaved, onCancel }) => {
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [assignedToOptions, setAssignedToOptions] = useState([]);
  const [srNoLoading, setSrNoLoading] = useState(false);
  const defaultAssigneeRef = useRef("");
  const existingDocumentsPathRef = useRef("");
  const existingPortalProofPathRef = useRef("");
  const existingEnquiryNumberRef = useRef("");

  const isOnlineTender = formData.sourceType === "Online Tender";
  const isTenderFeeApplicable = formData.tenderFeeApplicable === "Applicable";
  const isEmdFeePayable = formData.emdFeeStatus === "Applicable - Pay";
  const isPaymentRequired = isTenderFeeApplicable || isEmdFeePayable;

  const initNewForm = useCallback(async () => {
    setSrNoLoading(true);
    let nextSrNo = "";
    try {
      nextSrNo = await getNextSrNo(supabase);
    } catch (err) {
      console.error("Failed to load next Sr. No:", err);
    } finally {
      setSrNoLoading(false);
    }
    const today = new Date().toISOString().split("T")[0];
    setFormData({
      ...emptyForm,
      enquiryDate: today,
      receivedDate: today,
      receivedBy: defaultAssigneeRef.current || "",
      enquiryAssignedTo: defaultAssigneeRef.current || "",
      srNo: nextSrNo,
    });
    existingDocumentsPathRef.current = "";
    existingPortalProofPathRef.current = "";
    existingEnquiryNumberRef.current = "";
  }, []);

  useEffect(() => {
    const loadCommercialEmployees = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const options = await fetchCommercialAssigneeOptions(supabase);

        if (user?.email) {
          const self = options.find((opt) => opt.value.toLowerCase() === user.email.toLowerCase());
          if (self) defaultAssigneeRef.current = self.value;
        }

        setAssignedToOptions(options);
        setFormData((prev) => ({
          ...prev,
          receivedBy: prev.receivedBy || defaultAssigneeRef.current || "",
          enquiryAssignedTo: prev.enquiryAssignedTo || defaultAssigneeRef.current || "",
        }));
      } catch (err) {
        console.error("Failed to load Commercial department employees:", err);
      }
    };

    loadCommercialEmployees();
  }, []);

  useEffect(() => {
    if (!enquiryId) {
      initNewForm();
      return;
    }

    const fetchEnquiry = async () => {
      const { data, error } = await supabase.from("manpower_enquiries").select("*").eq("id", enquiryId).single();
      if (error) {
        console.error("Error fetching enquiry:", error);
        return;
      }
      if (!data) return;
      const nextForm = inquiryRowToForm(data);
      existingDocumentsPathRef.current = data.documents || "";
      existingPortalProofPathRef.current = nextForm.portalProofPath || "";
      existingEnquiryNumberRef.current = data.enquiry_number || "";
      setFormData(nextForm);
      setAssignedToOptions((prev) =>
        mergeAssignedToOptions(mergeAssignedToOptions(prev, nextForm.receivedBy), nextForm.enquiryAssignedTo)
      );
    };

    fetchEnquiry();
  }, [enquiryId, initNewForm]);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (files) {
      setFormData((prev) => ({ ...prev, [name]: files[0] || null }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    const required = [
      ["enquiryDate", "Enquiry Date"],
      ["receivedBy", "Received By"],
      ["sourceType", "Source Type"],
      ["clientName", "Client Name"],
      ["contactPersonName", "Client Contact Person (Name)"],
      ["siteName", "Site / Project Location (Site Name)"],
      ["siteState", "Site / Project Location (State)"],
      ["siteCity", "Site / Project Location (City)"],
      ["industrySector", "Industry / Sector"],
      ["serviceCategory", "Service Category"],
      ["enquirySubType", "Enquiry Sub-type"],
      ["contractDurationValue", "Contract Duration"],
      ["workingHoursShift", "Working Hours / Shift"],
      ["applicableStateMw", "Applicable State (for MW)"],
      ["minWageEffectiveDate", "Min Wage Effective Date"],
      ["submissionBidDeadline", "Submission / Bid Deadline"],
    ];

    for (const [field, label] of required) {
      if (!String(formData[field] || "").trim()) {
        alert(`Please enter ${label}.`);
        return false;
      }
    }

    if (
      (formData.scopeInputType === "Text" || formData.scopeInputType === "Both") &&
      !String(formData.scopeOfWork || "").trim()
    ) {
      alert("Please enter Scope of Work.");
      return false;
    }
    if (
      (formData.scopeInputType === "Attachment" || formData.scopeInputType === "Both") &&
      !formData.scopeAttachment &&
      !existingDocumentsPathRef.current
    ) {
      alert("Please upload the SOP document for Scope of Work.");
      return false;
    }

    if (isOnlineTender) {
      const portalName =
        formData.portalNameOption === "Custom"
          ? formData.portalNameCustom
          : formData.portalNameOption;
      if (!String(portalName || "").trim()) {
        alert("Please select or enter Portal Name.");
        return false;
      }
      const tenderRequired = [
        ["tenderNumber", "Tender Number"],
        ["estimatedValueClient", "Estimated Value (Client)"],
        ["ourQuotedRate", "Our Quoted Rate"],
        ["portalSubmissionDate", "Portal Submission Date"],
        ["paymentStatus", "Payment Status"],
      ];
      for (const [field, label] of tenderRequired) {
        if (!String(formData[field] || "").trim()) {
          alert(`Please enter ${label} (Online Tender section).`);
          return false;
        }
      }
      if (!formData.portalProofAttachment && !existingPortalProofPathRef.current) {
        alert("Please upload Portal Screenshot / Proof.");
        return false;
      }
      if (isTenderFeeApplicable && !String(formData.tenderFeeAmount || "").trim()) {
        alert("Please enter Tender Fee Amount.");
        return false;
      }
      if (isEmdFeePayable && !String(formData.emdFeeAmount || "").trim()) {
        alert("Please enter EMD Fee Amount.");
        return false;
      }
      if (isPaymentRequired) {
        if (!formData.paymentMode) {
          alert("Please select Payment Mode.");
          return false;
        }
        if (!String(formData.paymentReferenceNo || "").trim()) {
          alert("Please enter DD / NEFT Reference No.");
          return false;
        }
        if (!formData.paymentDate) {
          alert("Please enter Payment Date.");
          return false;
        }
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;

      let existingMeta = {};
      if (enquiryId) {
        const { data: existing, error: existingError } = await supabase
          .from("manpower_enquiries")
          .select("authorization_to, sr_no, documents")
          .eq("id", enquiryId)
          .single();
        if (existingError) throw existingError;
        existingMeta = parseAuthorizationMeta(existing?.authorization_to).meta;
        if (existing?.sr_no != null) existingMeta.srNo = existing.sr_no;
        existingDocumentsPathRef.current = existing?.documents || existingDocumentsPathRef.current;
      }

      let documentPath = existingDocumentsPathRef.current || null;
      if (formData.scopeAttachment) {
        const { data, error } = await supabase.storage
          .from("manpower-docs")
          .upload(`documents/${Date.now()}_${formData.scopeAttachment.name}`, formData.scopeAttachment);
        if (error) throw error;
        documentPath = data.path;
      }

      let portalProofPath = existingPortalProofPathRef.current || null;
      if (formData.portalProofAttachment) {
        const { data, error } = await supabase.storage
          .from("manpower-docs")
          .upload(`portal-proof/${Date.now()}_${formData.portalProofAttachment.name}`, formData.portalProofAttachment);
        if (error) throw error;
        portalProofPath = data.path;
      }

      const srNo = enquiryId ? existingMeta.srNo ?? formData.srNo : formData.srNo || (await getNextSrNo(supabase));

      const payload = buildInquiryDbPayload(
        { ...formData, srNo, portalProofPath: portalProofPath || "" },
        existingMeta
      );
      if (documentPath) {
        payload.documents = documentPath;
        if (formData.scopeInputType === "Attachment" && !String(formData.scopeOfWork || "").trim()) {
          payload.manpower_required = "Attachment uploaded";
        }
      }

      if (enquiryId) {
        const { error } = await supabase.from("manpower_enquiries").update(payload).eq("id", enquiryId);
        if (error) throw error;
        alert("Inquiry updated successfully.");
      } else {
        const enquiryNumber = await getNextEnquiryNumber(supabase);
        const insertPayload = {
          ...payload,
          enquiry_number: enquiryNumber,
          status: "Pending",
        };
        if (user?.id) insertPayload.user_id = user.id;
        const { error } = await supabase.from("manpower_enquiries").insert([insertPayload]);
        if (error) throw error;
        alert(`Inquiry saved successfully! Enquiry ID: ${enquiryNumber}`);
      }

      onSaved();
    } catch (err) {
      console.error(err);
      const msg = err?.message || err?.error_description || (typeof err === "string" ? err : null);
      alert(msg ? `Failed to save inquiry: ${msg}` : "Failed to save inquiry. Check console for details.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full h-10 px-3 text-sm border border-slate-300 rounded-lg bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 transition-shadow";
  const textareaClass =
    "w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 transition-shadow resize-y min-h-[88px]";
  const selectClass = `${inputClass} appearance-none`;
  const fileClass =
    "w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 px-3 py-2 border border-slate-300 rounded-lg bg-white";
  const gridClass = "grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5";
  const gridThreeClass = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5";
  const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5";
  const req = <span className="text-red-500">*</span>;

  const assigneeOptions = mergeAssignedToOptions(
    mergeAssignedToOptions(assignedToOptions, formData.receivedBy),
    formData.enquiryAssignedTo
  );

  const onlineTenderSection = isOnlineTender ? (
    <FormSection
      number="3.2"
      title="Online Tender Fields"
      hint="Portal details and fee entries — shown when Source Type is Online Tender."
      variant="tender"
    >
      <div className={gridClass}>
        <Field label="Portal Name" required>
          <select name="portalNameOption" value={formData.portalNameOption} onChange={handleChange} className={selectClass}>
            <option value="">Select portal</option>
            {TENDER_PORTAL_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Custom Portal Name" required={formData.portalNameOption === "Custom"}>
          <input
            name="portalNameCustom"
            value={formData.portalNameCustom}
            onChange={handleChange}
            className={inputClass}
            placeholder="Enter portal name"
            disabled={formData.portalNameOption !== "Custom"}
          />
        </Field>
        <Field label="Tender Number" required>
          <input
            name="tenderNumber"
            value={formData.tenderNumber}
            onChange={handleChange}
            className={inputClass}
            placeholder="As per portal"
          />
        </Field>
        <Field label="Portal Submission Date" required>
          <FormDateTimeInput
            name="portalSubmissionDate"
            value={formData.portalSubmissionDate}
            onChange={handleChange}
            className={inputClass}
            aria-label="Portal submission date and time"
          />
        </Field>
        <Field label="Estimated Value (Client)" required>
          <CurrencyInput
            name="estimatedValueClient"
            value={formData.estimatedValueClient}
            onChange={handleChange}
            placeholder="Published on portal"
            inputClass={inputClass}
          />
        </Field>
        <Field label="Our Quoted Rate" required>
          <CurrencyInput
            name="ourQuotedRate"
            value={formData.ourQuotedRate}
            onChange={handleChange}
            placeholder="Rate on portal"
            inputClass={inputClass}
          />
        </Field>
        <Field label="Portal Screenshot / Proof" required className="sm:col-span-2" hint="PNG or PDF of submission confirmation.">
          <input
            type="file"
            name="portalProofAttachment"
            accept=".png,.pdf,image/png,application/pdf"
            onChange={handleChange}
            className={fileClass}
          />
          {existingPortalProofPathRef.current && !formData.portalProofAttachment && (
            <p className="mt-1.5 text-xs font-medium text-emerald-700">Existing proof on file.</p>
          )}
        </Field>
      </div>

      <div className="mt-6 pt-5 border-t border-blue-200/70">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-800 mb-4">Fees &amp; Payment</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <FeeEntryPanel title="Tender Fee">
            <Field label="Tender Fee Applicable?" required>
              <RadioPills
                name="tenderFeeApplicable"
                value={formData.tenderFeeApplicable}
                onChange={handleChange}
                options={[
                  { value: "Applicable", label: "Applicable" },
                  { value: "Not Applicable", label: "Not Applicable" },
                ]}
              />
            </Field>
            {isTenderFeeApplicable && (
              <div className="mt-4 rounded-md border border-blue-100 bg-blue-50/50 p-3.5">
                <Field label="Tender Fee Amount (Manual Entry)" required hint="Enter the tender fee amount as per portal / notification.">
                  <CurrencyInput
                    name="tenderFeeAmount"
                    value={formData.tenderFeeAmount}
                    onChange={handleChange}
                    placeholder="Enter amount"
                    inputClass={inputClass}
                  />
                </Field>
              </div>
            )}
          </FeeEntryPanel>

          <FeeEntryPanel title="EMD Fee">
            <Field label="EMD Fee Status">
              <select name="emdFeeStatus" value={formData.emdFeeStatus} onChange={handleChange} className={selectClass}>
                {EMD_FEE_STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
            {isEmdFeePayable && (
              <div className="mt-4 rounded-md border border-blue-100 bg-blue-50/50 p-3.5">
                <Field label="EMD Fee Amount (Manual Entry)" required hint="Enter EMD amount payable as per tender document.">
                  <CurrencyInput
                    name="emdFeeAmount"
                    value={formData.emdFeeAmount}
                    onChange={handleChange}
                    placeholder="Enter EMD amount"
                    inputClass={inputClass}
                  />
                </Field>
              </div>
            )}
            {formData.emdFeeStatus === "Exempted" && (
              <p className="mt-3 text-xs text-slate-500 leading-relaxed">EMD is exempted — no payment entry required.</p>
            )}
          </FeeEntryPanel>
        </div>

        <div className="mt-5">
          <Field label="Payment Status" required>
            <select name="paymentStatus" value={formData.paymentStatus} onChange={handleChange} className={`${selectClass} sm:max-w-xs`}>
              <option value="">Select status</option>
              {PAYMENT_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {isPaymentRequired && (
          <div className="mt-5 rounded-lg border border-amber-200/80 bg-amber-50/40 p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 mb-4">Payment Details</p>
            <div className={gridClass}>
              <Field label="Payment Mode" required>
                <select name="paymentMode" value={formData.paymentMode} onChange={handleChange} className={selectClass}>
                  <option value="">Select mode</option>
                  {PAYMENT_MODE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="DD / NEFT Reference No." required hint="DD number or UTR number.">
                <input
                  name="paymentReferenceNo"
                  value={formData.paymentReferenceNo}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Reference number"
                />
              </Field>
              <Field label="Payment Date" required>
                <FormDateInput name="paymentDate" value={formData.paymentDate} onChange={handleChange} className={inputClass} />
              </Field>
            </div>
          </div>
        )}
      </div>
    </FormSection>
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 px-4 py-4 sm:px-6 sm:py-5">
      <FormSection
        number="3.1"
        title="Common Header — Enquiry Details"
        hint="Shared fields for all enquiry types."
      >
        <div className={gridClass}>
          <div>
            <label className={labelClass}>Enquiry ID</label>
            <input
              value={
                existingEnquiryNumberRef.current ||
                formData.enquiryNumber ||
                "Will auto-generate as ENQ-YYYY-NNNN"
              }
              readOnly
              className={`${inputClass} bg-gray-50 text-gray-600`}
            />
          </div>
          <div>
            <label className={labelClass}>
              Enquiry Date <span className="text-red-500">*</span>
            </label>
            <FormDateInput name="enquiryDate" value={formData.enquiryDate} onChange={handleChange} className={inputClass}/>
          </div>
          <div>
            <label className={labelClass}>Received By {req}</label>
            <select name="receivedBy" value={formData.receivedBy} onChange={handleChange} className={inputClass}>
              <option value="">Select user</option>
              {assigneeOptions.map((opt) => (
                <option key={`recv-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Source Type {req}</label>
            <select name="sourceType" value={formData.sourceType} onChange={handleChange} className={inputClass}>
              {SOURCE_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </FormSection>

      {onlineTenderSection}

      <FormSection title="Client &amp; Contact Person" hint="Primary client and point of contact details.">
        <div className={gridClass}>
          <div>
            <label className={labelClass}>Client Name {req}</label>
            <input name="clientName" value={formData.clientName} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Contact Person — Name {req}</label>
            <input name="contactPersonName" value={formData.contactPersonName} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Designation</label>
            <input
              name="contactPersonDesignation"
              value={formData.contactPersonDesignation}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input type="tel" name="contactPersonPhone" value={formData.contactPersonPhone} onChange={handleChange} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Email</label>
            <input type="email" name="contactPersonEmail" value={formData.contactPersonEmail} onChange={handleChange} className={inputClass} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Site / Project Location" hint="State, city, and site name.">
        <div className={gridThreeClass}>
          <div>
            <label className={labelClass}>State {req}</label>
            <select name="siteState" value={formData.siteState} onChange={handleChange} className={inputClass}>
              <option value="">Select state</option>
              {INDIA_STATES_UT.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>City {req}</label>
            <input name="siteCity" value={formData.siteCity} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Site Name {req}</label>
            <input name="siteName" value={formData.siteName} onChange={handleChange} className={inputClass} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Service &amp; Category">
        <div className={gridClass}>
          <div>
            <label className={labelClass}>Industry / Sector {req}</label>
            <select name="industrySector" value={formData.industrySector} onChange={handleChange} className={inputClass}>
              <option value="">Select industry</option>
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Service Category {req}</label>
            <select name="serviceCategory" value={formData.serviceCategory} onChange={handleChange} className={inputClass}>
              <option value="">Select category</option>
              {SERVICE_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-5">
          <label className={labelClass}>Enquiry Sub-type {req}</label>
          <RadioPills
            name="enquirySubType"
            value={formData.enquirySubType}
            onChange={handleChange}
            options={ENQUIRY_SUBTYPE_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
          />
        </div>
      </FormSection>

      <FormSection title="Scope of Work" hint="SOP document upload or text entry.">
        <div className="mb-4">
          <label className={labelClass}>Input Type</label>
          <RadioPills
            name="scopeInputType"
            value={formData.scopeInputType}
            onChange={handleChange}
            options={["Text", "Attachment", "Both"].map((mode) => ({ value: mode, label: mode }))}
          />
        </div>
        {(formData.scopeInputType === "Text" || formData.scopeInputType === "Both") && (
          <textarea
            name="scopeOfWork"
            value={formData.scopeOfWork}
            onChange={handleChange}
            rows={4}
            className={textareaClass}
            placeholder="Enter scope details or SOP summary..."
          />
        )}
        {(formData.scopeInputType === "Attachment" || formData.scopeInputType === "Both") && (
          <div className="mt-3">
            <label className={labelClass}>SOP Document Upload {req}</label>
            <input
              type="file"
              name="scopeAttachment"
              onChange={handleChange}
              className={fileClass}
            />
            {existingDocumentsPathRef.current && !formData.scopeAttachment && (
              <p className="mt-1 text-xs text-green-700">Existing document on file.</p>
            )}
          </div>
        )}
      </FormSection>

      <FormSection title="Contract, Wage &amp; Deadline">
        <div className={gridThreeClass}>
          <div>
            <label className={labelClass}>Contract Duration {req}</label>
            <div className="flex gap-2">
              <input
                name="contractDurationValue"
                type="number"
                min="0"
                value={formData.contractDurationValue}
                onChange={handleChange}
                className={inputClass}
                placeholder="Value"
              />
              <select
                name="contractDurationUnit"
                value={formData.contractDurationUnit}
                onChange={handleChange}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {CONTRACT_DURATION_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Working Hours / Shift {req}</label>
            <select name="workingHoursShift" value={formData.workingHoursShift} onChange={handleChange} className={inputClass}>
              <option value="">Select</option>
              {WORKING_HOURS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Applicable State (for MW) {req}</label>
            <select name="applicableStateMw" value={formData.applicableStateMw} onChange={handleChange} className={inputClass}>
              <option value="">Select state</option>
              {INDIA_STATES_UT.map((state) => (
                <option key={`mw-${state}`} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={`${gridClass} mt-5`}>
          <div>
            <label className={labelClass}>
              Min Wage Effective Date (WEF) <span className="text-red-500">*</span>
            </label>
            <FormDateInput name="minWageEffectiveDate" value={formData.minWageEffectiveDate} onChange={handleChange} className={inputClass}/>
          </div>
          <Field
            label="Submission / Bid Deadline"
            required
            hint="Reminder alerts: T-7 and T-1 days."
          >
            <FormDateTimeInput
              name="submissionBidDeadline"
              value={formData.submissionBidDeadline}
              onChange={handleChange}
              className={inputClass}
              aria-label="Submission or bid deadline"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Tracker &amp; Follow-up" hint="Excel tracker columns for internal commercial follow-up.">
        <div className={gridClass}>
          <div>
            <label className={labelClass}>Sr. No</label>
            <input
              value={
                srNoLoading
                  ? "Loading…"
                  : formData.srNo !== "" && formData.srNo != null
                    ? String(formData.srNo)
                    : "—"
              }
              readOnly
              className={`${inputClass} bg-gray-50 text-gray-600`}
            />
          </div>
          <div>
            <label className={labelClass}>Received Date</label>
            <FormDateInput name="receivedDate" value={formData.receivedDate} onChange={handleChange} className={inputClass}/>
          </div>
          <div>
            <label className={labelClass}>Vertical</label>
            <select name="vertical" value={formData.vertical} onChange={handleChange} className={inputClass}>
              <option value="">Select vertical</option>
              {VERTICAL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Mode of Submission</label>
            <select name="modeOfSubmission" value={formData.modeOfSubmission} onChange={handleChange} className={inputClass}>
              <option value="">Select mode</option>
              {MODE_OF_SUBMISSION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Total No. of Manpower</label>
            <input type="number" min="0" name="totalManpower" value={formData.totalManpower} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Location (summary)</label>
            <input
              name="location"
              value={formData.location}
              onChange={handleChange}
              className={inputClass}
              placeholder="Auto-filled from site fields if blank"
            />
          </div>
          <div>
            <label className={labelClass}>Approx Value (WO Taxes)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">Rs.</span>
              <input type="number" min="0" name="approxValue" value={formData.approxValue} onChange={handleChange} className={`${inputClass} pl-12`} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Enquiry Assigned to</label>
            <select name="enquiryAssignedTo" value={formData.enquiryAssignedTo} onChange={handleChange} className={inputClass}>
              <option value="">Select Commercial team member</option>
              {assigneeOptions.map((opt) => (
                <option key={`assign-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Due Date for Submission (if any)</label>
            <FormDateInput name="dueDate" value={formData.dueDate} onChange={handleChange} className={inputClass}/>
          </div>
          <div>
            <label className={labelClass}>Offer Submitted On</label>
            <FormDateInput name="offerSubmittedOn" value={formData.offerSubmittedOn} onChange={handleChange} className={inputClass}/>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Remarks</label>
            <textarea name="remarks" value={formData.remarks} onChange={handleChange} rows={2} className={textareaClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Further action / Follow up</label>
            <textarea name="furtherAction" value={formData.furtherAction} onChange={handleChange} rows={2} className={textareaClass} />
          </div>
        </div>
      </FormSection>
      </div>

      <div className="shrink-0 flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-4 py-3.5 sm:px-6">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-4 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={`h-10 px-5 text-sm font-semibold rounded-lg text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-colors ${
            submitting ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {submitting ? "Saving..." : enquiryId ? "Update Inquiry" : "Add Inquiry"}
        </button>
      </div>
    </div>
  );
};

export default ManpowerEnquiryFormPanel;
