import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../../lib/supabase";

const META_PREFIX = "__META__:";
const INDUSTRY_OPTIONS = ["Oil & Gas", "Refinery", "Chemical", "Power", "Construction", "Port", "Other"];
const WORKING_HOURS_OPTIONS = ["8 hrs", "12 hrs", "As per client"];
const ENQUIRY_SUBTYPE_OPTIONS = ["Regular", "Shutdown"];
const TENDER_PORTAL_OPTIONS = ["Ariba", "GeM", "eProcurement", "Custom"];
const APPLICABLE_MW_OPTIONS = ["State", "Central Zone"];

const initialForm = {
  enquiryDate: new Date().toISOString().split("T")[0],
  source: "Direct Mail",
  client: "",
  phone: "",
  clientDesignation: "",
  email: "",
  street: "",
  street2: "",
  state: "",
  city: "",
  zip: "",
  country: "",
  priority: 1,
  rfqAvailable: false,
  projectEstimation: "",
  durationYears: "",
  durationMonths: "",
  durationDays: "",
  fireTenderRequired: false,
  contacts: [],
  authorizationTo: "",
  siteName: "",
  siteStreet1: "",
  siteStreet2: "",
  siteState: "",
  siteCity: "",
  siteCountry: "",
  siteZip: "",
  industrySector: "",
  serviceCategory: "",
  enquirySubType: "Regular",
  scopeInputType: "Text",
  scopeOfWork: "",
  scopeAttachment: null,
  contractDurationValue: "",
  contractDurationUnit: "Days",
  workingHoursShift: "",
  customWorkingHours: "",
  applicableStateMw: "",
  minWageEffectiveDate: "",
  submissionBidDeadline: "",
  receivedBy: "",
  portalNameOption: "",
  portalNameCustom: "",
  tenderNumber: "",
  estimatedValueClient: "",
  ourQuotedRate: "",
  portalSubmissionDate: "",
  tenderFeeApplicable: "Not Applicable",
  tenderFeeAmount: "",
  emdFeeStatus: "Not Applicable",
  paymentMode: "",
  paymentReferenceNo: "",
  paymentStatus: "",
  paymentDate: "",
  portalProofAttachment: null,
};

function parseMeta(raw) {
  if (!raw || typeof raw !== "string" || !raw.startsWith(META_PREFIX)) return {};
  try {
    return JSON.parse(raw.slice(META_PREFIX.length)) || {};
  } catch {
    return {};
  }
}

function toIsoDateTimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const tzOffset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tzOffset);
  return local.toISOString().slice(0, 16);
}

function toIsoFromDateTimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

const ManpowerEnquiryFormPanelRm = ({ enquiryId, onSaved, onCancel }) => {
  const [formData, setFormData] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [receivedByOptions, setReceivedByOptions] = useState([]);
  const handledByEmailRef = useRef("");
  const existingDocumentsPathRef = useRef("");
  const existingEnquiryNumberRef = useRef("");

  const resetForm = useCallback(() => {
    existingDocumentsPathRef.current = "";
    existingEnquiryNumberRef.current = "";
    setFormData({
      ...initialForm,
      receivedBy: handledByEmailRef.current || "",
    });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        handledByEmailRef.current = user.email;
        setFormData((prev) => ({
          ...prev,
          receivedBy: prev.receivedBy || user.email,
        }));
        setReceivedByOptions((prev) => (prev.includes(user.email) ? prev : [user.email, ...prev]));
      }
    });
  }, []);

  useEffect(() => {
    const loadReceivedByOptions = async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("email").not("email", "is", null);
        if (error) throw error;
        const emails = Array.from(new Set((data || []).map((row) => String(row.email || "").trim()).filter(Boolean)));
        setReceivedByOptions((prev) => Array.from(new Set([...prev, ...emails])));
      } catch (_) {
        // keep fallback logged-in email option
      }
    };
    loadReceivedByOptions();
  }, []);

  useEffect(() => {
    if (!enquiryId) {
      resetForm();
      return;
    }

    const fetchEnquiry = async () => {
      const { data, error } = await supabase.from("manpower_enquiries").select("*").eq("id", enquiryId).single();
      if (error) {
        console.error("Error fetching enquiry:", error);
        return;
      }
      if (!data) return;
      const meta = parseMeta(data.authorization_to);
      existingDocumentsPathRef.current = data.documents || "";
      existingEnquiryNumberRef.current = data.enquiry_number || "";
      setFormData({
        enquiryDate: meta.enquiryDate || (data.created_at ? new Date(data.created_at).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]),
        source: data.source || "Direct Mail",
        client: data.client || "",
        phone: data.phone || "",
        clientDesignation: meta.clientDesignation || "",
        email: data.email || "",
        street: data.street || "",
        street2: data.street2 || "",
        state: data.state || "",
        city: data.city || "",
        zip: data.zip || "",
        country: data.country || "",
        priority: Number.isFinite(Number(data.priority)) ? Number(data.priority) : 1,
        rfqAvailable: Boolean(data.rfq_available),
        projectEstimation: data.project_estimation || "",
        durationYears: data.duration?.years ?? "",
        durationMonths: data.duration?.months ?? "",
        durationDays: data.duration?.days ?? "",
        fireTenderRequired: Boolean(data.fire_tender_required),
        contacts: Array.isArray(data.contacts) ? data.contacts : [],
        authorizationTo: meta.authorizationTo || "",
        siteName: meta.siteName || data.street || "",
        siteStreet1: meta.siteStreet1 || "",
        siteStreet2: meta.siteStreet2 || "",
        siteState: meta.siteState || "",
        siteCity: meta.siteCity || "",
        siteCountry: meta.siteCountry || "",
        siteZip: meta.siteZip || "",
        industrySector: meta.industrySector || "",
        serviceCategory: meta.serviceCategory || "",
        enquirySubType: meta.enquirySubType || "Regular",
        scopeInputType: meta.scopeInputType || "Text",
        scopeOfWork: data.manpower_required || "",
        scopeAttachment: null,
        contractDurationValue: meta.contractDurationValue || "",
        contractDurationUnit: meta.contractDurationUnit || "Days",
        workingHoursShift: meta.workingHoursShift || "",
        customWorkingHours: meta.customWorkingHours || "",
        applicableStateMw: meta.applicableStateMw || "",
        minWageEffectiveDate: meta.minWageEffectiveDate || "",
        submissionBidDeadline: toIsoDateTimeLocal(meta.submissionBidDeadline),
        receivedBy: data.handled_by || handledByEmailRef.current || "",
        portalNameOption: meta.portalNameOption || "",
        portalNameCustom: meta.portalNameCustom || "",
        tenderNumber: meta.tenderNumber || "",
        estimatedValueClient: meta.estimatedValueClient || data.project_estimation || "",
        ourQuotedRate: meta.ourQuotedRate || "",
        portalSubmissionDate: toIsoDateTimeLocal(meta.portalSubmissionDate),
        tenderFeeApplicable: meta.tenderFeeApplicable || "Not Applicable",
        tenderFeeAmount: meta.tenderFeeAmount || "",
        emdFeeStatus: meta.emdFeeStatus || "Not Applicable",
        paymentMode: meta.paymentMode || "",
        paymentReferenceNo: meta.paymentReferenceNo || "",
        paymentStatus: meta.paymentStatus || "",
        paymentDate: meta.paymentDate || "",
        portalProofAttachment: null,
      });
    };

    fetchEnquiry();
  }, [enquiryId, resetForm]);

  const handleChange = (e) => {
    const { name, value, files, type, checked } = e.target;
    if (files) {
      setFormData((prev) => ({ ...prev, [name]: files[0] || null }));
      return;
    }
    if (type === "checkbox") {
      setFormData((prev) => ({ ...prev, [name]: checked }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleContactChange = (index, e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = [...(prev.contacts || [])];
      next[index] = { ...(next[index] || {}), [name]: value };
      return { ...prev, contacts: next };
    });
  };

  const addContactRow = () => {
    setFormData((prev) => ({
      ...prev,
      contacts: [...(prev.contacts || []), { name: "", phone: "", email: "", street: "", street2: "", zip: "", city: "", state: "", country: "" }],
    }));
  };

  const removeContact = (index) => {
    setFormData((prev) => ({
      ...prev,
      contacts: (prev.contacts || []).filter((_, idx) => idx !== index),
    }));
  };

  const isOnlineTender = formData.source === "Online Tender";
  const isTenderFeeApplicable = formData.tenderFeeApplicable === "Applicable";
  const isPaymentRequired = isTenderFeeApplicable || formData.emdFeeStatus === "Applicable - Pay";

  const getNextEnquiryNumber = async () => {
    const year = new Date().getFullYear();
    const { data, error } = await supabase.from("manpower_enquiries").select("enquiry_number").not("enquiry_number", "is", null);
    if (error) throw error;
    let maxSequence = 0;
    (data || []).forEach((row) => {
      const val = String(row.enquiry_number || "");
      const dashMatch = val.match(/^ENQ-(\d{4})-(\d{4})$/);
      if (dashMatch && Number(dashMatch[1]) === year) {
        maxSequence = Math.max(maxSequence, Number(dashMatch[2]));
        return;
      }
      const slashMatch = val.match(/^ENQ\/(\d{4})\/(\d{4})$/);
      if (slashMatch && Number(slashMatch[1]) === year) {
        maxSequence = Math.max(maxSequence, Number(slashMatch[2]));
      }
    });
    return `ENQ-${year}-${String(maxSequence + 1).padStart(4, "0")}`;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    try {
      setSubmitting(true);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;

      let documentUrl = existingDocumentsPathRef.current || null;
      if (formData.scopeAttachment) {
        const { data, error } = await supabase.storage
          .from("manpower-docs")
          .upload(`documents/${Date.now()}_${formData.scopeAttachment.name}`, formData.scopeAttachment);
        if (error) throw error;
        documentUrl = data.path;
      }

      let portalProofPath = null;
      if (formData.portalProofAttachment) {
        const { data, error } = await supabase.storage
          .from("manpower-docs")
          .upload(`portal-proof/${Date.now()}_${formData.portalProofAttachment.name}`, formData.portalProofAttachment);
        if (error) throw error;
        portalProofPath = data.path;
      }

      const metaPayload = {
        enquiryDate: formData.enquiryDate || null,
        authorizationTo: formData.authorizationTo || "",
        clientDesignation: formData.clientDesignation || "",
        siteName: formData.siteName,
        siteStreet1: formData.siteStreet1 || "",
        siteStreet2: formData.siteStreet2 || "",
        siteState: formData.siteState || "",
        siteCity: formData.siteCity || "",
        siteCountry: formData.siteCountry || "",
        siteZip: formData.siteZip || "",
        industrySector: formData.industrySector,
        serviceCategory: formData.serviceCategory,
        enquirySubType: formData.enquirySubType,
        scopeInputType: formData.scopeInputType,
        contractDurationValue: formData.contractDurationValue,
        contractDurationUnit: formData.contractDurationUnit,
        workingHoursShift: formData.workingHoursShift,
        customWorkingHours: formData.customWorkingHours,
        applicableStateMw: formData.applicableStateMw,
        minWageEffectiveDate: formData.minWageEffectiveDate || null,
        submissionBidDeadline: toIsoFromDateTimeLocal(formData.submissionBidDeadline) || null,
        portalNameOption: formData.portalNameOption,
        portalNameCustom: formData.portalNameCustom,
        tenderNumber: formData.tenderNumber,
        estimatedValueClient: formData.estimatedValueClient,
        ourQuotedRate: formData.ourQuotedRate,
        portalSubmissionDate: toIsoFromDateTimeLocal(formData.portalSubmissionDate) || null,
        tenderFeeApplicable: formData.tenderFeeApplicable,
        tenderFeeAmount: formData.tenderFeeAmount,
        emdFeeStatus: formData.emdFeeStatus,
        paymentMode: formData.paymentMode,
        paymentReferenceNo: formData.paymentReferenceNo,
        paymentStatus: formData.paymentStatus,
        paymentDate: formData.paymentDate || null,
        portalProofPath: portalProofPath || null,
      };

      const payload = {
        client: formData.client,
        phone: formData.phone || null,
        email: formData.email || null,
        street: formData.street || formData.siteName || null,
        street2: formData.street2 || null,
        city: formData.city || null,
        state: formData.state || null,
        zip: formData.zip || null,
        country: formData.country || null,
        priority: Number(formData.priority || 1),
        source: formData.source,
        due_date: formData.submissionBidDeadline ? formData.submissionBidDeadline.split("T")[0] : null,
        project_estimation: formData.projectEstimation || formData.estimatedValueClient || null,
        documents: documentUrl,
        manpower_required: formData.scopeInputType === "Attachment" ? "Attachment uploaded" : formData.scopeOfWork || null,
        handled_by: formData.receivedBy || null,
        authorization_to: `${META_PREFIX}${JSON.stringify(metaPayload)}`,
        duration: {
          years: Number(formData.durationYears || 0),
          months: Number(formData.durationMonths || 0),
          days: Number(formData.durationDays || 0),
        },
        contacts: Array.isArray(formData.contacts) ? formData.contacts : [],
        rfq_available: isOnlineTender || Boolean(formData.rfqAvailable),
        fire_tender_required: Boolean(formData.fireTenderRequired),
      };

      if (enquiryId) {
        const { error } = await supabase.from("manpower_enquiries").update(payload).eq("id", enquiryId);
        if (error) throw error;
        alert("Enquiry updated successfully.");
      } else {
        const enquiryNumber = await getNextEnquiryNumber();
        const insertPayload = {
          ...payload,
          enquiry_number: enquiryNumber,
          status: "Pending",
        };
        if (user?.id) insertPayload.user_id = user.id;
        const { error } = await supabase.from("manpower_enquiries").insert([insertPayload]);
        if (error) throw error;
        alert(`Enquiry saved successfully! Enquiry ID: ${enquiryNumber}`);
        resetForm();
      }

      onSaved();
    } catch (err) {
      console.error(err);
      const msg = err?.message || err?.error_description || (typeof err === "string" ? err : null);
      alert(msg ? `Failed to save enquiry: ${msg}` : "Failed to save enquiry. Check console for details.");
    } finally {
      setSubmitting(false);
    }
  };

  const sectionClass = "rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm";
  const sectionTitleClass = "text-base font-semibold text-gray-800";
  const sectionHintClass = "text-xs text-gray-500 mt-1";
  const inputClass = "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent";
  const inlineInputClass = "w-full border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm focus:border-purple-500 focus:outline-none";

  const clientSectionFilled = [
    formData.client,
    formData.phone,
    formData.clientDesignation,
    formData.email,
    formData.street,
    formData.street2,
    formData.state,
    formData.city,
    formData.zip,
    formData.country,
    formData.siteName,
    formData.siteStreet1,
    formData.siteStreet2,
    formData.siteState,
    formData.siteCity,
    formData.siteCountry,
    formData.siteZip,
  ].filter((v) => String(v || "").trim()).length;
  const contactSectionFilled = (formData.contacts || []).filter((c) => Object.values(c || {}).some((v) => String(v || "").trim())).length;

  return (
    <div className="max-h-[calc(95vh-140px)] overflow-y-auto space-y-6 pr-1 pb-2">
      <div className={`${sectionClass} grid grid-cols-1 md:grid-cols-2 gap-4`}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Enquiry ID</label>
          <input
            value={existingEnquiryNumberRef.current || "Will auto-generate as ENQ-YYYY-NNNN"}
            readOnly
            className={`${inputClass} bg-gray-50 text-gray-600`}
          />
        </div>
      </div>

      <div className={sectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 className={sectionTitleClass}>Client Details</h4>
          <span className="text-xs font-medium text-purple-700 bg-purple-100 rounded-full px-2.5 py-1">{clientSectionFilled} fields filled</span>
        </div>
        <p className={sectionHintClass}>Primary client information and project location.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client Name <span className="text-red-500">*</span>
            </label>
            <input name="client" value={formData.client} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Client Phone No.</label>
            <input type="number" name="phone" value={formData.phone} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Client Designation</label>
            <input name="clientDesignation" value={formData.clientDesignation} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input name="email" value={formData.email} onChange={handleChange} className={inputClass} />
          </div>
        </div>
        <div className="mt-4">
          <h5 className="text-sm font-semibold text-gray-700 mb-2">Client Address</h5>
          <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Street 1</label>
              <input name="street" value={formData.street} onChange={handleChange} className={inlineInputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Street 2</label>
              <input name="street2" value={formData.street2} onChange={handleChange} className={inlineInputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
              <input name="state" value={formData.state} onChange={handleChange} className={inlineInputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
              <input name="city" value={formData.city} onChange={handleChange} className={inlineInputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ZIP</label>
              <input type="number" name="zip" value={formData.zip} onChange={handleChange} className={inlineInputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
              <input name="country" value={formData.country} onChange={handleChange} className={inlineInputClass} />
            </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <h5 className="text-sm font-semibold text-gray-700 mb-2">Client Sites / Project Location</h5>
          <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Site Name</label>
              <input name="siteName" value={formData.siteName} onChange={handleChange} className={inlineInputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Street 1</label>
              <input name="siteStreet1" value={formData.siteStreet1} onChange={handleChange} className={inlineInputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Street 2</label>
              <input name="siteStreet2" value={formData.siteStreet2} onChange={handleChange} className={inlineInputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
              <input name="siteState" value={formData.siteState} onChange={handleChange} className={inlineInputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
              <input name="siteCity" value={formData.siteCity} onChange={handleChange} className={inlineInputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
              <input name="siteCountry" value={formData.siteCountry} onChange={handleChange} className={inlineInputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ZIP</label>
              <input type="number" name="siteZip" value={formData.siteZip} onChange={handleChange} className={inlineInputClass} />
            </div>
            </div>
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <h4 className={sectionTitleClass}>Source Type</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Source Type <span className="text-red-500">*</span>
            </label>
            <select name="source" value={formData.source} onChange={handleChange} className={inputClass}>
              <option>Direct Mail</option>
              <option>Online Tender</option>
              <option>Verbal</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Enquiry Date</label>
            <input type="date" name="enquiryDate" value={formData.enquiryDate} onChange={handleChange} className={inputClass} />
          </div>
        </div>
      </div>

      <div className={`${sectionClass} grid grid-cols-1 md:grid-cols-2 gap-4`}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Industry / Sector</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-2">Service Category</label>
          <input name="serviceCategory" value={formData.serviceCategory} onChange={handleChange} placeholder="Enter category for this enquiry" className={inputClass} />
        </div>
      </div>

      <div className={sectionClass}>
        <label className="block text-sm font-medium text-gray-700 mb-2">Enquiry Sub-type</label>
        <div className="flex flex-wrap gap-4">
          {ENQUIRY_SUBTYPE_OPTIONS.map((opt) => (
            <label key={opt} className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" name="enquirySubType" value={opt} checked={formData.enquirySubType === opt} onChange={handleChange} />
              {opt}
            </label>
          ))}
        </div>
      </div>

      <div className={sectionClass}>
        <label className="block text-sm font-medium text-gray-700 mb-2">Scope of Work</label>
        <div className="flex flex-wrap gap-4 mb-3 text-sm">
          {["Text", "Attachment", "Both"].map((mode) => (
            <label key={mode} className="inline-flex items-center gap-2">
              <input type="radio" name="scopeInputType" value={mode} checked={formData.scopeInputType === mode} onChange={handleChange} />
              {mode}
            </label>
          ))}
        </div>
        {(formData.scopeInputType === "Text" || formData.scopeInputType === "Both") && (
          <textarea name="scopeOfWork" value={formData.scopeOfWork} onChange={handleChange} rows={4} className={inputClass} placeholder="Enter scope details..." />
        )}
        {(formData.scopeInputType === "Attachment" || formData.scopeInputType === "Both") && (
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">SOP Document Upload</label>
            <input type="file" name="scopeAttachment" onChange={handleChange} className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white" />
          </div>
        )}
      </div>

      <div className={`${sectionClass} grid grid-cols-1 md:grid-cols-3 gap-4`}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Contract Duration</label>
          <div className="flex gap-2">
            <input name="contractDurationValue" type="number" min="0" value={formData.contractDurationValue} onChange={handleChange} className={inputClass} placeholder="Value" />
            <select name="contractDurationUnit" value={formData.contractDurationUnit} onChange={handleChange} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent">
              <option>Days</option>
              <option>Months</option>
              <option>Years</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Working Hours / Shift</label>
          <div className="flex gap-2">
            <select name="workingHoursShift" value={formData.workingHoursShift} onChange={handleChange} className={inputClass}>
              <option value="">Select</option>
              {WORKING_HOURS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              <option value="Custom">Custom</option>
            </select>
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, workingHoursShift: "Custom" }))}
              className="h-10 w-10 rounded-lg border border-gray-300 text-lg text-gray-700 hover:bg-gray-50"
              title="Add custom shift"
            >
              +
            </button>
          </div>
          {formData.workingHoursShift === "Custom" && (
            <input name="customWorkingHours" value={formData.customWorkingHours} onChange={handleChange} placeholder="Enter custom working hours" className={`${inputClass} mt-2`} />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Applicable State (MW)</label>
          <select name="applicableStateMw" value={formData.applicableStateMw} onChange={handleChange} className={inputClass}>
            <option value="">Select</option>
            {APPLICABLE_MW_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`${sectionClass} grid grid-cols-1 md:grid-cols-3 gap-4`}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Min Wage Effective Date</label>
          <input type="date" name="minWageEffectiveDate" value={formData.minWageEffectiveDate} onChange={handleChange} className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Submission / Bid Deadline</label>
          <input type="datetime-local" name="submissionBidDeadline" value={formData.submissionBidDeadline} onChange={handleChange} className={inputClass} />
          <p className="mt-1 text-xs text-gray-500">Reminder alerts: T-7 and T-1 days.</p>
        </div>
      </div>

      {isOnlineTender && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 sm:p-5 space-y-4 shadow-sm">
          <h4 className="text-base font-semibold text-blue-900">Online Tender Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Portal Name</label>
              <select name="portalNameOption" value={formData.portalNameOption} onChange={handleChange} className={inputClass}>
                <option value="">Select portal</option>
                {TENDER_PORTAL_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Custom Portal Name</label>
              <input name="portalNameCustom" value={formData.portalNameCustom} onChange={handleChange} className={inputClass} placeholder="If custom, enter portal name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tender Number</label>
              <input name="tenderNumber" value={formData.tenderNumber} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Value (Client)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">Rs.</span>
                <input type="number" name="estimatedValueClient" value={formData.estimatedValueClient} onChange={handleChange} placeholder="0" className={`${inputClass} pl-12`} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Our Quoted Rate</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">Rs.</span>
                <input type="number" name="ourQuotedRate" value={formData.ourQuotedRate} onChange={handleChange} placeholder="0" className={`${inputClass} pl-12`} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Portal Submission Date</label>
              <input type="datetime-local" name="portalSubmissionDate" value={formData.portalSubmissionDate} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Portal Screenshot / Proof</label>
              <input type="file" name="portalProofAttachment" accept=".png,.pdf,image/png,application/pdf" onChange={handleChange} className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tender Fee Applicable?</label>
              <div className="flex items-center gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="tenderFeeApplicable" value="Applicable" checked={formData.tenderFeeApplicable === "Applicable"} onChange={handleChange} />
                  Applicable
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="tenderFeeApplicable" value="Not Applicable" checked={formData.tenderFeeApplicable === "Not Applicable"} onChange={handleChange} />
                  Not Applicable
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">EMD Fee</label>
              <select name="emdFeeStatus" value={formData.emdFeeStatus} onChange={handleChange} className={inputClass}>
                <option>Not Applicable</option>
                <option>Applicable - Pay</option>
                <option>Exempted</option>
              </select>
            </div>
          </div>

          {isTenderFeeApplicable && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tender Fee Amount</label>
              <div className="relative md:w-1/2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">Rs.</span>
                <input type="number" name="tenderFeeAmount" value={formData.tenderFeeAmount} onChange={handleChange} className={`${inputClass} pl-12`} placeholder="0" />
              </div>
            </div>
          )}

          {isPaymentRequired && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Mode</label>
                <select name="paymentMode" value={formData.paymentMode} onChange={handleChange} className={inputClass}>
                  <option value="">Select</option>
                  <option>Demand Draft</option>
                  <option>NEFT</option>
                  <option>Online</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">DD / NEFT Reference No.</label>
                <input name="paymentReferenceNo" value={formData.paymentReferenceNo} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Status</label>
                <select name="paymentStatus" value={formData.paymentStatus} onChange={handleChange} className={inputClass}>
                  <option value="">Select</option>
                  <option>Pending</option>
                  <option>Paid</option>
                  <option>Refunded</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Date</label>
                <input type="date" name="paymentDate" value={formData.paymentDate} onChange={handleChange} className={inputClass} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className={sectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 className={sectionTitleClass}>Points of Contact</h4>
          <span className="text-xs font-medium text-blue-700 bg-blue-100 rounded-full px-2.5 py-1">{contactSectionFilled} rows filled</span>
        </div>
        <div className="border rounded-md overflow-x-auto bg-white">
          <table className="min-w-[820px] w-full text-xs">
            <thead className="bg-gray-100 border-b">
              <tr>
                {["Name", "Phone", "Email", "Street", "Street2", "Zip", "City", "State", "Country", ""].map((h) => (
                  <th key={h || "x"} className="px-2 py-2 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(formData.contacts || []).map((row, i) => (
                <tr key={`${i}-${row?.email || "contact"}`} className="border-b">
                  {["name", "phone", "email", "street", "street2", "zip", "city", "state", "country"].map((field) => (
                    <td key={field} className="px-2 py-1">
                      <input name={field} value={row?.[field] || ""} onChange={(e) => handleContactChange(i, e)} className="w-full border-b border-gray-200 focus:border-purple-500 focus:outline-none" />
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    <button type="button" onClick={() => removeContact(i)} className="text-red-600 hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={10} onClick={addContactRow} className="px-2 py-2 text-purple-600 cursor-pointer hover:underline text-sm">
                  Add a line
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className={sectionClass}>
        <label className="block text-sm font-medium text-gray-700 mb-2">Authorization To</label>
        <input name="authorizationTo" value={formData.authorizationTo} onChange={handleChange} className={inputClass} />
      </div>

      <div className={`${sectionClass} grid grid-cols-1 md:grid-cols-2 gap-4`}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Received By</label>
          <select name="receivedBy" value={formData.receivedBy} onChange={handleChange} className={inputClass}>
            <option value="">Select user</option>
            {receivedByOptions.map((email) => (
              <option key={email} value={email}>
                {email}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 bg-white/90 backdrop-blur-sm flex justify-end gap-3 pt-3 border-t border-gray-200">
        <button type="button" onClick={onCancel} className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={`px-5 py-2 rounded-lg text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {submitting ? "Saving..." : enquiryId ? "Update Enquiry" : "Create Enquiry"}
        </button>
      </div>
    </div>
  );
};

export default ManpowerEnquiryFormPanelRm;
