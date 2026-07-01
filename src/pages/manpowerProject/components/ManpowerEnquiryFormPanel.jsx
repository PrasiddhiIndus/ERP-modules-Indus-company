import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabase";
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

const ManpowerEnquiryFormPanel = ({ enquiryId, onSaved, onCancel }) => {
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [assignedToOptions, setAssignedToOptions] = useState([]);
  const [srNoLoading, setSrNoLoading] = useState(false);
  const defaultAssigneeRef = useRef("");
  const existingDocumentsPathRef = useRef("");
  const existingEnquiryNumberRef = useRef("");

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
      existingEnquiryNumberRef.current = data.enquiry_number || "";
      setFormData(nextForm);
      setAssignedToOptions((prev) =>
        mergeAssignedToOptions(mergeAssignedToOptions(prev, nextForm.receivedBy), nextForm.enquiryAssignedTo)
      );
    };

    fetchEnquiry();
  }, [enquiryId, initNewForm]);

  const handleChange = (e) => {
    const { name, value, files, type } = e.target;
    if (files) {
      setFormData((prev) => ({ ...prev, [name]: files[0] || null }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (submitting) return;

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
        return;
      }
    }

    if (
      (formData.scopeInputType === "Text" || formData.scopeInputType === "Both") &&
      !String(formData.scopeOfWork || "").trim()
    ) {
      alert("Please enter Scope of Work.");
      return;
    }
    if (
      (formData.scopeInputType === "Attachment" || formData.scopeInputType === "Both") &&
      !formData.scopeAttachment &&
      !existingDocumentsPathRef.current
    ) {
      alert("Please upload the SOP document for Scope of Work.");
      return;
    }

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

      const srNo = enquiryId ? existingMeta.srNo ?? formData.srNo : formData.srNo || (await getNextSrNo(supabase));

      const payload = buildInquiryDbPayload({ ...formData, srNo }, existingMeta);
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
    "w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent";
  const labelClass = "block text-sm font-medium text-gray-700 mb-2";
  const sectionClass = "rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm";
  const sectionTitleClass = "text-base font-semibold text-slate-900";
  const sectionHintClass = "text-xs text-slate-500 mt-1";

  const assigneeOptions = mergeAssignedToOptions(
    mergeAssignedToOptions(assignedToOptions, formData.receivedBy),
    formData.enquiryAssignedTo
  );

  return (
    <div className="max-h-[calc(95vh-140px)] overflow-y-auto overflow-x-hidden space-y-5 pr-1 pb-4">
      <div className={sectionClass}>
        <h4 className={sectionTitleClass}>Manpower Management Inquiry</h4>
        <p className={sectionHintClass}>Common header fields for all enquiry types (Commercial — Manpower).</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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
            <input type="date" name="enquiryDate" value={formData.enquiryDate} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>
              Received By <span className="text-red-500">*</span>
            </label>
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
            <label className={labelClass}>
              Source Type <span className="text-red-500">*</span>
            </label>
            <select name="sourceType" value={formData.sourceType} onChange={handleChange} className={inputClass}>
              {SOURCE_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              Client Name <span className="text-red-500">*</span>
            </label>
            <input name="clientName" value={formData.clientName} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>
              Client Contact Person — Name <span className="text-red-500">*</span>
            </label>
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
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" name="contactPersonEmail" value={formData.contactPersonEmail} onChange={handleChange} className={inputClass} />
          </div>
        </div>

        <div className="mt-4">
          <h5 className="text-sm font-semibold text-gray-700 mb-2">
            Site / Project Location <span className="text-red-500">*</span>
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
              <input name="siteCity" value={formData.siteCity} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Site Name</label>
              <input name="siteName" value={formData.siteName} onChange={handleChange} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className={labelClass}>
              Industry / Sector <span className="text-red-500">*</span>
            </label>
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
            <label className={labelClass}>
              Service Category <span className="text-red-500">*</span>
            </label>
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

        <div className="mt-4">
          <label className={labelClass}>
            Enquiry Sub-type <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-4">
            {ENQUIRY_SUBTYPE_OPTIONS.map((opt) => (
              <label key={opt} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="enquirySubType"
                  value={opt}
                  checked={formData.enquirySubType === opt}
                  onChange={handleChange}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>
            Scope of Work <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-4 mb-3 text-sm">
            {["Text", "Attachment", "Both"].map((mode) => (
              <label key={mode} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="scopeInputType"
                  value={mode}
                  checked={formData.scopeInputType === mode}
                  onChange={handleChange}
                />
                {mode}
              </label>
            ))}
          </div>
          {(formData.scopeInputType === "Text" || formData.scopeInputType === "Both") && (
            <textarea
              name="scopeOfWork"
              value={formData.scopeOfWork}
              onChange={handleChange}
              rows={4}
              className={inputClass}
              placeholder="Enter scope details or SOP summary..."
            />
          )}
          {(formData.scopeInputType === "Attachment" || formData.scopeInputType === "Both") && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">SOP Document Upload</label>
              <input
                type="file"
                name="scopeAttachment"
                onChange={handleChange}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white"
              />
              {existingDocumentsPathRef.current && !formData.scopeAttachment && (
                <p className="mt-1 text-xs text-green-700">Existing document on file.</p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <label className={labelClass}>
              Contract Duration <span className="text-red-500">*</span>
            </label>
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
            <label className={labelClass}>
              Working Hours / Shift <span className="text-red-500">*</span>
            </label>
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
            <label className={labelClass}>
              Applicable State (for MW) <span className="text-red-500">*</span>
            </label>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className={labelClass}>
              Min Wage Effective Date (WEF) <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="minWageEffectiveDate"
              value={formData.minWageEffectiveDate}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Submission / Bid Deadline <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              name="submissionBidDeadline"
              value={formData.submissionBidDeadline}
              onChange={handleChange}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">Reminder alerts: T-7 and T-1 days.</p>
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <h4 className={sectionTitleClass}>Tracker &amp; Follow-up</h4>
        <p className={sectionHintClass}>Excel tracker columns for internal commercial follow-up.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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
            <input type="date" name="receivedDate" value={formData.receivedDate} onChange={handleChange} className={inputClass} />
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
            <input name="location" value={formData.location} onChange={handleChange} className={inputClass} placeholder="Auto-filled from site fields if blank" />
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
            <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Offer Submitted On</label>
            <input type="date" name="offerSubmittedOn" value={formData.offerSubmittedOn} onChange={handleChange} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Remarks</label>
            <textarea name="remarks" value={formData.remarks} onChange={handleChange} rows={2} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Further action / Follow up</label>
            <textarea name="furtherAction" value={formData.furtherAction} onChange={handleChange} rows={2} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={`px-6 py-2.5 rounded-lg font-medium text-white bg-purple-600 hover:bg-purple-700 transition-colors ${
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
