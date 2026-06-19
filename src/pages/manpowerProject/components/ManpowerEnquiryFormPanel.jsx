import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import {
  VERTICAL_OPTIONS,
  MODE_OF_SUBMISSION_OPTIONS,
  parseAuthorizationMeta,
  buildInquiryDbPayload,
  excelFieldsToForm,
  getNextSrNo,
  getNextEnquiryNumber,
} from "../utils/manpowerEnquiryExcelFields";
import {
  fetchCommercialAssigneeOptions,
  mergeAssignedToOptions,
} from "../utils/commercialInquiryAssignees";

const emptyForm = {
  srNo: "",
  receivedDate: new Date().toISOString().split("T")[0],
  vertical: "",
  modeOfSubmission: "",
  totalManpower: "",
  clientName: "",
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
    setFormData({
      ...emptyForm,
      receivedDate: new Date().toISOString().split("T")[0],
      enquiryAssignedTo: defaultAssigneeRef.current || "",
      srNo: nextSrNo,
    });
  }, []);

  useEffect(() => {
    const loadCommercialEmployees = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const options = await fetchCommercialAssigneeOptions(supabase);

        if (user?.email) {
          const self = options.find((opt) => opt.value.toLowerCase() === user.email.toLowerCase());
          if (self) defaultAssigneeRef.current = self.value;
        }

        setAssignedToOptions(options);
        setFormData((prev) => ({
          ...prev,
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
      const nextForm = excelFieldsToForm(data);
      setFormData(nextForm);
      setAssignedToOptions((prev) => mergeAssignedToOptions(prev, nextForm.enquiryAssignedTo));
    };

    fetchEnquiry();
  }, [enquiryId, initNewForm]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!String(formData.clientName || "").trim()) {
      alert("Please enter Client Name.");
      return;
    }
    if (!formData.modeOfSubmission) {
      alert("Please select Mode of Submission.");
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
          .select("authorization_to, sr_no")
          .eq("id", enquiryId)
          .single();
        if (existingError) throw existingError;
        existingMeta = parseAuthorizationMeta(existing?.authorization_to).meta;
        if (existing?.sr_no != null) existingMeta.srNo = existing.sr_no;
      }

      const srNo = enquiryId
        ? existingMeta.srNo ?? formData.srNo
        : formData.srNo || (await getNextSrNo(supabase));

      const payload = buildInquiryDbPayload({ ...formData, srNo }, existingMeta);

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
        alert(`Inquiry saved successfully! Sr. No: ${payload.sr_no ?? srNo}`);
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

  return (
    <div className="max-h-[calc(95vh-140px)] overflow-y-auto overflow-x-hidden space-y-5 pr-1 pb-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <h4 className="text-base font-semibold text-slate-900">Manpower Management Inquiry</h4>
        <p className="text-xs text-slate-500 mt-1">Fields match the Manpower Management Excel tracker.</p>

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
            <label className={labelClass}>
              Mode of Submission <span className="text-red-500">*</span>
            </label>
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
            <label className={labelClass}>
              Client Name <span className="text-red-500">*</span>
            </label>
            <input name="clientName" value={formData.clientName} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Location</label>
            <input name="location" value={formData.location} onChange={handleChange} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Description of Work</label>
            <textarea name="descriptionOfWork" value={formData.descriptionOfWork} onChange={handleChange} rows={3} className={inputClass} />
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
              {mergeAssignedToOptions(assignedToOptions, formData.enquiryAssignedTo).map((opt) => (
                <option key={opt.value} value={opt.value}>
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
