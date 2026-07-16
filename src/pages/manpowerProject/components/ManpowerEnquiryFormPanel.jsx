import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Paperclip, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import FormDateInput from "../../../components/FormDateInput";
import FormDateTimeInput from "../../../components/FormDateTimeInput";

import {
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
  VERTICAL_OPTIONS,
  parseAuthorizationMeta,
  buildInquiryDbPayload,
  inquiryRowToForm,
  getNextSrNo,
  getNextEnquiryNumber,
  emptyContactRow,
  formatAssignedToList,
} from "../utils/manpowerEnquiryExcelFields";
const emptyForm = {
  enquiryNumber: "",
  enquiryDate: new Date().toISOString().split("T")[0],
  receivedBy: "",
  assignedToList: [],
  vertical: "",
  submissionRemark: "",
  sourceType: "Direct Mail",
  clientName: "",
  contacts: [emptyContactRow()],
  contactPersonName: "",
  contactPersonDesignation: "",
  contactPersonPhone: "",
  contactPersonEmail: "",
  siteState: "",
  siteCity: "",
  siteName: "",
  industrySector: "",
  serviceCategory: "",
  serviceCategoryCustom: "",
  enquirySubType: "Regular",
  scopeInputType: "Text",
  scopeOfWork: "",
  scopeAttachments: [],
  scopeAttachmentPaths: [],
  enquiryAttachments: [],
  enquiryAttachmentPaths: [],
  contractDurationValue: "",
  contractDurationUnit: "Months",
  contractTimelineStart: "",
  contractTimelineEnd: "",
  workingHoursShift: "",
  customWorkingHours: "",
  applicableStateMw: "",
  minWageEffectiveDate: "",
  submissionBidDeadline: "",
  portalNameOption: "",
  portalNameCustom: "",
  tenderNumber: "",
  estimatedValueClient: "",
  ourQuotedRate: "",
  portalProofAttachment: null,
  portalProofPath: "",
  tenderFeeApplicable: "Not Applicable",
  tenderFeeAmount: "",
  emdFeeStatus: "Not Applicable",
  emdFeeAmount: "",
  paymentMode: "",
  paymentReferenceNo: "",
  paymentDate: "",
  srNo: "",
  receivedDate: new Date().toISOString().split("T")[0],
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

function MultiAssigneeField({ label, required, values, draft, onDraftChange, onAdd, onRemove, inputClass }) {
  const commitDraft = () => {
    const next = String(draft || "").trim();
    if (!next) return;
    onAdd(next);
    onDraftChange("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
      return;
    }
    if (e.key === "Backspace" && !draft && values.length) {
      onRemove(values.length - 1);
    }
  };

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
        {label}
        {required && <span className="text-red-500 normal-case tracking-normal ml-0.5">*</span>}
      </label>
      <div
        className={`flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/30 ${inputClass ? "" : ""}`}
      >
        {values.map((name, index) => (
          <span
            key={`${name}-${index}`}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-purple-100 px-2 py-1 text-sm text-purple-900"
          >
            <span className="truncate">{name}</span>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-purple-700 hover:bg-purple-200 hover:text-purple-900"
              aria-label={`Remove ${name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          className="min-w-[140px] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          placeholder={values.length ? "Add another name…" : "Type name and press Enter"}
        />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">Press Enter or comma to add each person. Click × to remove.</p>
    </div>
  );
}

const ManpowerEnquiryFormPanel = ({ enquiryId, onSaved, onCancel }) => {
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [assignedToDraft, setAssignedToDraft] = useState("");
  const [srNoLoading, setSrNoLoading] = useState(false);
  const defaultAssigneeRef = useRef("");
  const existingScopeAttachmentPathsRef = useRef([]);
  const existingEnquiryAttachmentPathsRef = useRef([]);
  const existingPortalProofPathRef = useRef("");
  const existingEnquiryNumberRef = useRef("");
  const scopeFileInputRef = useRef(null);
  const enquiryFileInputRef = useRef(null);

  const isOnlineTender = formData.sourceType === "Online Tender";
  const isTenderFeeApplicable = formData.tenderFeeApplicable === "Applicable";
  const isEmdFeePayable = formData.emdFeeStatus === "Applicable - Pay";
  const isPaymentRequired = isTenderFeeApplicable || isEmdFeePayable;
  const isIndustryOther = formData.industrySector === "Other";
  const isServiceCategoryManual = formData.serviceCategory === "Other (manual entry)";
  const isAsPerClientHours = formData.workingHoursShift === "As per client";

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
    const defaultAssignee = defaultAssigneeRef.current || "";
    setFormData({
      ...emptyForm,
      enquiryDate: today,
      receivedDate: today,
      assignedToList: defaultAssignee ? [defaultAssignee] : [],
      receivedBy: defaultAssignee,
      enquiryAssignedTo: defaultAssignee,
      srNo: nextSrNo,
    });
    setAssignedToDraft("");
    existingScopeAttachmentPathsRef.current = [];
    existingEnquiryAttachmentPathsRef.current = [];
    existingPortalProofPathRef.current = "";
    existingEnquiryNumberRef.current = "";
  }, []);

  useEffect(() => {
    const loadDefaultAssignee = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) {
          defaultAssigneeRef.current = user.email;
          setFormData((prev) => {
            const hasAssignees = (prev.assignedToList || []).length > 0;
            const assignedToList = hasAssignees ? prev.assignedToList : [user.email];
            const assignedToText = formatAssignedToList(assignedToList);
            return {
              ...prev,
              assignedToList,
              receivedBy: prev.receivedBy || assignedToText,
              enquiryAssignedTo: prev.enquiryAssignedTo || assignedToText,
            };
          });
        }
      } catch (err) {
        console.error("Failed to load default assignee:", err);
      }
    };

    loadDefaultAssignee();
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
      existingScopeAttachmentPathsRef.current = nextForm.scopeAttachmentPaths || [];
      existingEnquiryAttachmentPathsRef.current = nextForm.enquiryAttachmentPaths || [];
      existingPortalProofPathRef.current = nextForm.portalProofPath || "";
      existingEnquiryNumberRef.current = data.enquiry_number || "";
      setFormData(nextForm);
      setAssignedToDraft("");
    };

    fetchEnquiry();
  }, [enquiryId, initNewForm]);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (files) {
      setFormData((prev) => ({ ...prev, [name]: files[0] || null }));
      return;
    }
    if (name === "industrySector" && value !== "Other") {
      setFormData((prev) => ({
        ...prev,
        industrySector: value,
        serviceCategory: prev.serviceCategory === "Other (manual entry)" ? "" : prev.serviceCategory,
        serviceCategoryCustom: "",
      }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const syncAssignedToFields = (assignedToList) => {
    const assignedToText = formatAssignedToList(assignedToList);
    return {
      assignedToList,
      receivedBy: assignedToText,
      enquiryAssignedTo: assignedToText,
    };
  };

  const getResolvedAssignedToList = (draftValue = assignedToDraft) => {
    const pending = String(draftValue || "").trim();
    const list = [...(formData.assignedToList || [])];
    if (pending && !list.some((item) => item.toLowerCase() === pending.toLowerCase())) {
      list.push(pending);
    }
    return list;
  };

  const addAssignedToName = (rawName) => {
    const name = String(rawName || "").trim();
    if (!name) return;
    setFormData((prev) => {
      const current = Array.isArray(prev.assignedToList) ? prev.assignedToList : [];
      if (current.some((item) => item.toLowerCase() === name.toLowerCase())) {
        return prev;
      }
      return { ...prev, ...syncAssignedToFields([...current, name]) };
    });
  };

  const removeAssignedToName = (index) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.assignedToList) ? prev.assignedToList : [];
      const next = current.filter((_, idx) => idx !== index);
      return { ...prev, ...syncAssignedToFields(next) };
    });
  };

  const handleContactChange = (index, field, value) => {
    setFormData((prev) => {
      const nextContacts = [...(prev.contacts || [])];
      nextContacts[index] = { ...(nextContacts[index] || emptyContactRow()), [field]: value };
      return { ...prev, contacts: nextContacts };
    });
  };

  const addContactRow = () => {
    setFormData((prev) => ({
      ...prev,
      contacts: [...(prev.contacts || []), emptyContactRow()],
    }));
  };

  const removeContactRow = (index) => {
    setFormData((prev) => {
      const nextContacts = (prev.contacts || []).filter((_, idx) => idx !== index);
      return { ...prev, contacts: nextContacts.length ? nextContacts : [emptyContactRow()] };
    });
  };

  const handleScopeFilesSelected = (files) => {
    const nextFiles = files ? Array.from(files) : [];
    if (!nextFiles.length) return;
    setFormData((prev) => ({
      ...prev,
      scopeAttachments: [...(prev.scopeAttachments || []), ...nextFiles],
    }));
  };

  const removeNewScopeAttachment = (index) => {
    setFormData((prev) => ({
      ...prev,
      scopeAttachments: (prev.scopeAttachments || []).filter((_, idx) => idx !== index),
    }));
  };

  const removeExistingScopeAttachment = (index) => {
    existingScopeAttachmentPathsRef.current = existingScopeAttachmentPathsRef.current.filter((_, idx) => idx !== index);
    setFormData((prev) => ({
      ...prev,
      scopeAttachmentPaths: existingScopeAttachmentPathsRef.current,
    }));
  };

  const handleEnquiryFilesSelected = (files) => {
    const nextFiles = files ? Array.from(files) : [];
    if (!nextFiles.length) return;
    setFormData((prev) => ({
      ...prev,
      enquiryAttachments: [...(prev.enquiryAttachments || []), ...nextFiles],
    }));
  };

  const removeNewEnquiryAttachment = (index) => {
    setFormData((prev) => ({
      ...prev,
      enquiryAttachments: (prev.enquiryAttachments || []).filter((_, idx) => idx !== index),
    }));
  };

  const removeExistingEnquiryAttachment = (index) => {
    existingEnquiryAttachmentPathsRef.current = existingEnquiryAttachmentPathsRef.current.filter((_, idx) => idx !== index);
    setFormData((prev) => ({
      ...prev,
      enquiryAttachmentPaths: existingEnquiryAttachmentPathsRef.current,
    }));
  };

  const validateForm = () => {
    const required = [
      ["enquiryDate", "Enquiry Date"],
      ["vertical", "Vertical"],
      ["sourceType", "Source Type"],
      ["clientName", "Client Name"],
      ["siteName", "Site / Project Location (Site Name)"],
      ["siteState", "Site / Project Location (State)"],
      ["siteCity", "Site / Project Location (City)"],
      ["industrySector", "Industry / Sector"],
      ["serviceCategory", "Service Category"],
      ["enquirySubType", "Enquiry Sub-type"],
      ["contractDurationValue", "Contract Duration"],
      ["workingHoursShift", "Working Hours / Shift"],
      ["applicableStateMw", "Applicable State (for MW)"],
      ["submissionBidDeadline", "Submission / Bid Deadline"],
    ];

    for (const [field, label] of required) {
      if (!String(formData[field] || "").trim()) {
        alert(`Please enter ${label}.`);
        return false;
      }
    }

    const assignedToList = getResolvedAssignedToList();
    if (!assignedToList.length) {
      alert("Please add at least one person in Assigned To.");
      return false;
    }

    const filledContacts = (formData.contacts || []).filter(
      (c) => String(c?.name || "").trim() || String(c?.email || "").trim() || String(c?.phone || "").trim()
    );
    if (!filledContacts.length) {
      alert("Please add at least one contact person with Name, Email, or Phone.");
      return false;
    }
    const invalidContact = filledContacts.find(
      (c) => !String(c?.name || "").trim() || !String(c?.email || "").trim() || !String(c?.phone || "").trim()
    );
    if (invalidContact) {
      alert("Each contact person must have Name, Email, and Phone Number.");
      return false;
    }

    if (isIndustryOther && isServiceCategoryManual && !String(formData.serviceCategoryCustom || "").trim()) {
      alert("Please enter Service Category (manual entry).");
      return false;
    }

    if (isAsPerClientHours && !String(formData.customWorkingHours || "").trim()) {
      alert("Please enter working hours / shift details for As per client.");
      return false;
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
      !(formData.scopeAttachments || []).length &&
      !existingScopeAttachmentPathsRef.current.length
    ) {
      alert("Please upload at least one SOP document for Scope of Work.");
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
        if (!existingScopeAttachmentPathsRef.current.length && existing?.documents) {
          existingScopeAttachmentPathsRef.current = [existing.documents];
        }
      }

      const uploadedScopePaths = [...existingScopeAttachmentPathsRef.current];
      for (const file of formData.scopeAttachments || []) {
        const { data, error } = await supabase.storage
          .from("manpower-docs")
          .upload(`documents/${Date.now()}_${file.name}`, file);
        if (error) throw error;
        uploadedScopePaths.push(data.path);
      }
      const documentPath = uploadedScopePaths[0] || null;

      let portalProofPath = existingPortalProofPathRef.current || null;
      if (formData.portalProofAttachment) {
        const { data, error } = await supabase.storage
          .from("manpower-docs")
          .upload(`portal-proof/${Date.now()}_${formData.portalProofAttachment.name}`, formData.portalProofAttachment);
        if (error) throw error;
        portalProofPath = data.path;
      }

      const uploadedEnquiryAttachmentPaths = [...existingEnquiryAttachmentPathsRef.current];
      for (const file of formData.enquiryAttachments || []) {
        const { data, error } = await supabase.storage
          .from("manpower-docs")
          .upload(`enquiry-attachments/${Date.now()}_${file.name}`, file);
        if (error) throw error;
        uploadedEnquiryAttachmentPaths.push(data.path);
      }

      const srNo = enquiryId ? existingMeta.srNo ?? formData.srNo : formData.srNo || (await getNextSrNo(supabase));

      const assignedToList = getResolvedAssignedToList();
      const submitForm = { ...formData, ...syncAssignedToFields(assignedToList) };

      const payload = buildInquiryDbPayload(
        {
          ...submitForm,
          srNo,
          portalProofPath: portalProofPath || "",
          scopeAttachmentPaths: uploadedScopePaths,
          enquiryAttachmentPaths: uploadedEnquiryAttachmentPaths,
        },
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

  const filledContactCount = (formData.contacts || []).filter(
    (c) => String(c?.name || "").trim() || String(c?.email || "").trim() || String(c?.phone || "").trim()
  ).length;

  const contactCellInputClass =
    "w-full min-w-0 border-0 bg-transparent px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-purple-400";

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
          <div className="sm:col-span-2">
            <MultiAssigneeField
              label="Assigned To"
              required
              values={formData.assignedToList || []}
              draft={assignedToDraft}
              onDraftChange={setAssignedToDraft}
              onAdd={addAssignedToName}
              onRemove={removeAssignedToName}
            />
          </div>
          <div>
            <label className={labelClass}>Vertical {req}</label>
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
            <label className={labelClass}>Source Type {req}</label>
            <select name="sourceType" value={formData.sourceType} onChange={handleChange} className={inputClass}>
              {SOURCE_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Submission Remark</label>
            <textarea
              name="submissionRemark"
              value={formData.submissionRemark}
              onChange={handleChange}
              rows={2}
              className={textareaClass}
              placeholder="Enter submission notes or remarks..."
            />
          </div>
        </div>
      </FormSection>

      {onlineTenderSection}

      <FormSection
        title="Client &amp; Contact Person"
        hint="Enter client name, then add contact rows like an Excel sheet — one person per line."
      >
        <div className="mb-5 max-w-xl">
          <label className={labelClass}>Client Name {req}</label>
          <input name="clientName" value={formData.clientName} onChange={handleChange} className={inputClass} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Contact persons</p>
          <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-800">
            {filledContactCount} row{filledContactCount === 1 ? "" : "s"} filled
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
                  Name {req}
                </th>
                <th className="min-w-[200px] border-r border-slate-300 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Email {req}
                </th>
                <th className="min-w-[140px] border-r border-slate-300 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Phone {req}
                </th>
                <th className="w-20 px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {(formData.contacts || []).map((contact, index) => (
                <tr key={`contact-row-${index}`} className="border-b border-slate-200 hover:bg-purple-50/25">
                  <td className="border-r border-slate-200 bg-slate-50 px-2 py-0 text-center text-xs font-medium tabular-nums text-slate-500">
                    {index + 1}
                  </td>
                  <td className="border-r border-slate-200 p-0">
                    <input
                      value={contact?.name || ""}
                      onChange={(e) => handleContactChange(index, "name", e.target.value)}
                      className={contactCellInputClass}
                      placeholder="Full name"
                    />
                  </td>
                  <td className="border-r border-slate-200 p-0">
                    <input
                      type="email"
                      value={contact?.email || ""}
                      onChange={(e) => handleContactChange(index, "email", e.target.value)}
                      className={contactCellInputClass}
                      placeholder="email@company.com"
                    />
                  </td>
                  <td className="border-r border-slate-200 p-0">
                    <input
                      type="tel"
                      value={contact?.phone || ""}
                      onChange={(e) => handleContactChange(index, "phone", e.target.value)}
                      className={contactCellInputClass}
                      placeholder="Phone number"
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    {(formData.contacts || []).length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeContactRow(index)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50"
                        title="Remove row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50/80">
                <td colSpan={5} className="px-3 py-2">
                  <button
                    type="button"
                    onClick={addContactRow}
                    className="inline-flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-800"
                  >
                    <Plus className="h-4 w-4" />
                    Add a line
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
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
              {isIndustryOther && (
                <option value="Other (manual entry)">Other (manual entry)</option>
              )}
            </select>
            {isIndustryOther && isServiceCategoryManual && (
              <input
                name="serviceCategoryCustom"
                value={formData.serviceCategoryCustom}
                onChange={handleChange}
                className={`${inputClass} mt-2`}
                placeholder="Enter service category"
              />
            )}
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
          <div className="mt-3 space-y-3">
            <label className={labelClass}>SOP Document Upload {req}</label>

            {(formData.scopeAttachmentPaths || []).length > 0 ? (
              <div className="space-y-2">
                {(formData.scopeAttachmentPaths || []).map((path, index) => (
                  <div
                    key={`existing-scope-${path}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
                  >
                    <div className="min-w-0 flex items-center gap-2 text-sm text-emerald-800">
                      <Paperclip className="h-4 w-4 shrink-0" />
                      <span className="truncate" title={path}>
                        {path.split("/").pop() || path}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExistingScopeAttachment(index)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {(formData.scopeAttachments || []).map((file, index) => (
              <div
                key={`new-scope-${file.name}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <div className="min-w-0 flex items-center gap-2 text-sm text-slate-700">
                  <Paperclip className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="truncate" title={file.name}>
                    {file.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeNewScopeAttachment(index)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>
            ))}

            <input
              ref={scopeFileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                handleScopeFilesSelected(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => scopeFileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100"
            >
              <Plus className="h-4 w-4" />
              Add Attachment
            </button>
          </div>
        )}
      </FormSection>

      <FormSection title="Contract, Wage &amp; Deadline">
        <div className={gridThreeClass}>
          <div>
            <label className={labelClass}>No. of Manpower</label>
            <input
              type="number"
              min="0"
              name="totalManpower"
              value={formData.totalManpower}
              onChange={handleChange}
              className={inputClass}
              placeholder="Enter count"
            />
          </div>
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
            <label className={labelClass}>Timeline</label>
            <div className="flex items-center gap-2">
              <FormDateInput
                name="contractTimelineStart"
                value={formData.contractTimelineStart}
                onChange={handleChange}
                className={inputClass}
                aria-label="Contract timeline start date"
              />
              <span className="shrink-0 text-xs font-medium text-slate-500">to</span>
              <FormDateInput
                name="contractTimelineEnd"
                value={formData.contractTimelineEnd}
                onChange={handleChange}
                className={inputClass}
                aria-label="Contract timeline end date"
              />
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
            {isAsPerClientHours && (
              <input
                name="customWorkingHours"
                value={formData.customWorkingHours}
                onChange={handleChange}
                className={`${inputClass} mt-2`}
                placeholder="Enter working hours / shift as per client"
              />
            )}
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
        <div className="mt-5">
          <Field
            label="Submission / Bid Deadline"
            required
            hint="Reminder alerts use Timeline Settings on the Commercial Dashboard."
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

      <FormSection
        title="Additional Attachments"
        hint="Optional — add any supporting files (images, PDFs, documents, etc.). You can attach multiple files."
      >
        <div className="space-y-3">
          {(formData.enquiryAttachmentPaths || []).length > 0 ? (
            <div className="space-y-2">
              {(formData.enquiryAttachmentPaths || []).map((path, index) => (
                <div
                  key={`existing-enquiry-${path}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
                >
                  <div className="min-w-0 flex items-center gap-2 text-sm text-emerald-800">
                    <Paperclip className="h-4 w-4 shrink-0" />
                    <span className="truncate" title={path}>
                      {path.split("/").pop() || path}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExistingEnquiryAttachment(index)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {(formData.enquiryAttachments || []).map((file, index) => (
            <div
              key={`new-enquiry-${file.name}-${index}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="min-w-0 flex items-center gap-2 text-sm text-slate-700">
                <Paperclip className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="truncate" title={file.name}>
                  {file.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeNewEnquiryAttachment(index)}
                className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          ))}

          <input
            ref={enquiryFileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleEnquiryFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => enquiryFileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100"
          >
            <Plus className="h-4 w-4" />
            Add Attachment
          </button>
          {!((formData.enquiryAttachmentPaths || []).length || (formData.enquiryAttachments || []).length) ? (
            <p className="text-xs text-slate-500">No files attached yet. This section is optional.</p>
          ) : null}
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
