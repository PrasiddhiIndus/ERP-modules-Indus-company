import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabase";

const initialForm = {
  client: "",
  phone: "",
  email: "",
  street: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  country: "",
  priority: 1,
  source: "Mail",
  dueDate: "",
  rfqAvailable: false,
  projectEstimation: "",
  duration: { days: 0, months: 0, years: 0 },
  documents: null,
  manpowerRequired: "",
  fireTenderRequired: false,
  contacts: [],
  handledBy: "",
  authorizationTo: "",
};

const ManpowerEnquiryFormPanel = ({ enquiryId, onSaved, onCancel }) => {
  const [formData, setFormData] = useState(initialForm);
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const handledByEmailRef = useRef("");
  const existingDocumentsPathRef = useRef("");

  const resetForm = useCallback(() => {
    existingDocumentsPathRef.current = "";
    setFormData({
      ...initialForm,
      handledBy: handledByEmailRef.current || "",
    });
    setEndDate("");
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        handledByEmailRef.current = user.email;
        setFormData((p) => ({ ...p, handledBy: user.email }));
      }
    });
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
      setFormData({
        client: data.client,
        phone: data.phone,
        email: data.email,
        street: data.street,
        street2: data.street2,
        city: data.city,
        state: data.state,
        zip: data.zip,
        country: data.country,
        priority: data.priority,
        source: data.source,
        dueDate: data.due_date || "",
        rfqAvailable: data.rfq_available,
        projectEstimation: data.project_estimation,
        duration: data.duration,
        documents: null,
        manpowerRequired: data.manpower_required,
        fireTenderRequired: data.fire_tender_required,
        contacts: data.contacts || [],
        handledBy: data.handled_by || handledByEmailRef.current,
        authorizationTo: data.authorization_to,
        enquiry_number: data.enquiry_number,
      });
      if (data.due_date) setEndDate(data.due_date);
    };

    fetchEnquiry();
  }, [enquiryId, resetForm]);

  const handleChange = (e) => {
    const { name, type, value, checked, files } = e.target;
    if (type === "checkbox") {
      setFormData((p) => ({ ...p, [name]: checked }));
    } else if (type === "file") {
      setFormData((p) => ({ ...p, [name]: files[0] }));
    } else {
      setFormData((p) => ({ ...p, [name]: value }));
    }
  };

  useEffect(() => {
    if (endDate) {
      const start = new Date();
      const end = new Date(endDate);
      let years = end.getFullYear() - start.getFullYear();
      let months = end.getMonth() - start.getMonth();
      let days = end.getDate() - start.getDate();
      if (days < 0) {
        months -= 1;
        days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
      }
      if (months < 0) {
        years -= 1;
        months += 12;
      }
      setFormData((prev) => ({ ...prev, duration: { years, months, days } }));
    } else {
      setFormData((prev) => ({ ...prev, duration: { days: 0, months: 0, years: 0 } }));
    }
  }, [endDate]);

  const handleContactChange = (i, e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const contacts = [...prev.contacts];
      contacts[i] = { ...(contacts[i] || {}), [name]: value };
      return { ...prev, contacts };
    });
  };

  const addContactRow = () => {
    setFormData((prev) => ({
      ...prev,
      contacts: [
        ...prev.contacts,
        { name: "", phone: "", email: "", street: "", street2: "", zip: "", city: "", state: "", country: "" },
      ],
    }));
  };

  const removeContact = (i) => {
    setFormData((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((_, idx) => idx !== i),
    }));
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

      let documentUrl = null;
      if (formData.documents) {
        const { data, error } = await supabase.storage
          .from("manpower-docs")
          .upload(`documents/${Date.now()}_${formData.documents.name}`, formData.documents);
        if (error) throw error;
        documentUrl = data.path;
      }

      if (enquiryId) {
        const updateData = {
          client: formData.client,
          phone: formData.phone,
          email: formData.email,
          street: formData.street,
          street2: formData.street2,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          country: formData.country,
          priority: formData.priority,
          source: formData.source,
          due_date: formData.dueDate || null,
          rfq_available: formData.rfqAvailable,
          project_estimation: formData.projectEstimation,
          duration: formData.duration || { days: 0, months: 0, years: 0 },
          documents: documentUrl ?? (existingDocumentsPathRef.current || null),
          manpower_required: formData.manpowerRequired,
          fire_tender_required: formData.fireTenderRequired,
          contacts: formData.contacts,
          handled_by: formData.handledBy,
          authorization_to: formData.authorizationTo,
        };
        if (user?.id) updateData.user_id = user.id;
        const { error } = await supabase.from("manpower_enquiries").update(updateData).eq("id", enquiryId);
        if (error) throw error;
        if (documentUrl) existingDocumentsPathRef.current = documentUrl;
        alert("Enquiry updated successfully!");
      } else {
        const currentYear = new Date().getFullYear();
        const { data: latest, error: latestError } = await supabase
          .from("manpower_enquiries")
          .select("enquiry_number")
          .like("enquiry_number", `ENQ/${currentYear}/%`)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (latestError && latestError.code !== "PGRST116") throw latestError;
        let newNumber = 1;
        if (latest?.enquiry_number) {
          const parts = latest.enquiry_number.split("/");
          newNumber = parseInt(parts[2], 10) + 1;
        }
        const enquiryNumber = `ENQ/${currentYear}/${String(newNumber).padStart(4, "0")}`;
        const insertData = {
          client: formData.client,
          phone: formData.phone,
          email: formData.email,
          street: formData.street,
          street2: formData.street2,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          country: formData.country,
          priority: formData.priority,
          source: formData.source,
          due_date: formData.dueDate || null,
          rfq_available: formData.rfqAvailable,
          project_estimation: formData.projectEstimation,
          duration: formData.duration || { days: 0, months: 0, years: 0 },
          documents: documentUrl,
          manpower_required: formData.manpowerRequired,
          fire_tender_required: formData.fireTenderRequired,
          contacts: formData.contacts,
          handled_by: formData.handledBy,
          authorization_to: formData.authorizationTo,
          enquiry_number: enquiryNumber,
          status: "Pending",
        };
        if (user?.id) insertData.user_id = user.id;
        const { error } = await supabase.from("manpower_enquiries").insert([insertData]);
        if (error) throw error;
        alert(`Enquiry saved successfully! Your ENQ Number: ${enquiryNumber}`);
        resetForm();
      }
      onSaved();
    } catch (err) {
      console.error(err);
      const msg =
        err?.message || err?.error_description || (typeof err === "string" ? err : null);
      alert(msg ? `Failed to save enquiry: ${msg}` : "Failed to save enquiry. Check console for details.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-h-[calc(95vh-140px)] overflow-y-auto pr-1 space-y-5">
      <div>
        <h4 className="font-semibold mb-2 text-gray-800">CLIENT DETAILS</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center mb-3">
              <label className="w-24 font-medium shrink-0 text-sm">
                Client <span className="text-red-500">*</span>
              </label>
              <input name="client" value={formData.client} onChange={handleChange} className="flex-1 border-b border-gray-300 focus:outline-none focus:border-purple-600 py-1 text-sm" />
            </div>
            <div className="flex items-center mb-3">
              <label className="w-24 font-medium shrink-0 text-sm">Phone</label>
              <input name="phone" value={formData.phone} onChange={handleChange} className="flex-1 border-b border-gray-300 focus:outline-none focus:border-purple-600 py-1 text-sm" />
            </div>
            <div className="flex items-center mb-3">
              <label className="w-24 font-medium shrink-0 text-sm">Email</label>
              <input name="email" value={formData.email} onChange={handleChange} className="flex-1 border-b border-gray-300 focus:outline-none focus:border-purple-600 py-1 text-sm" />
            </div>
          </div>
          <div>
            <label className="block font-medium mb-2 text-sm">Address</label>
            <input name="street" value={formData.street} onChange={handleChange} className="w-full border-b border-gray-300 mb-2 focus:outline-none focus:border-purple-600 py-1 text-sm" placeholder="Street..." />
            <input name="street2" value={formData.street2} onChange={handleChange} className="w-full border-b border-gray-300 mb-2 focus:outline-none focus:border-purple-600 py-1 text-sm" placeholder="Street 2..." />
            <div className="grid grid-cols-3 gap-2 mb-2">
              <input name="city" value={formData.city} onChange={handleChange} className="border-b border-gray-300 focus:outline-none focus:border-purple-600 py-1 text-sm" placeholder="City" />
              <input name="state" value={formData.state} onChange={handleChange} className="border-b border-gray-300 focus:outline-none focus:border-purple-600 py-1 text-sm" placeholder="State" />
              <input name="zip" value={formData.zip} onChange={handleChange} className="border-b border-gray-300 focus:outline-none focus:border-purple-600 py-1 text-sm" placeholder="ZIP" />
            </div>
            <input name="country" value={formData.country} onChange={handleChange} className="w-full border-b border-gray-300 focus:outline-none focus:border-purple-600 py-1 text-sm" placeholder="Country" />
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2 text-gray-800">ENQUIRY DETAILS</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-start mb-3">
              <label className="w-28 font-medium shrink-0 text-sm pt-0.5">Source</label>
              <div className="flex flex-col space-y-1.5">
                {["Mail", "E-Procurement", "Gem Portal", "Other"].map((src) => (
                  <label key={src} className="flex items-center space-x-2 text-sm">
                    <input type="radio" name="source" value={src} checked={formData.source === src} onChange={handleChange} />
                    <span>{src}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center mb-3">
              <label className="w-28 font-medium shrink-0 text-sm">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="dueDate"
                value={formData.dueDate}
                onChange={handleChange}
                min={enquiryId ? undefined : new Date().toISOString().split("T")[0]}
                className="border-b border-gray-300 focus:outline-none focus:border-purple-600 py-1 text-sm"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center mb-3">
              <label className="w-44 font-medium shrink-0 text-xs sm:text-sm">RFQ/Tender Available</label>
              <input type="checkbox" name="rfqAvailable" checked={formData.rfqAvailable} onChange={handleChange} className="ml-2" />
            </div>
            <div className="flex items-center mb-3">
              <label className="w-44 font-medium shrink-0 text-xs sm:text-sm">Project Estimation</label>
              <input name="projectEstimation" value={formData.projectEstimation} onChange={handleChange} className="flex-1 border-b border-gray-300 focus:outline-none focus:border-purple-600 py-1 text-sm ml-2" placeholder="$0.00" />
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <label className="w-44 font-medium shrink-0 text-xs sm:text-sm">Contract end</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={enquiryId ? undefined : new Date().toISOString().split("T")[0]}
                className="border-b border-gray-300 focus:outline-none focus:border-purple-600 py-1 text-sm flex-1 min-w-[140px]"
              />
              {endDate ? (
                <span className="text-xs text-gray-600">
                  ({formData.duration.years}y {formData.duration.months}m {formData.duration.days}d)
                </span>
              ) : null}
            </div>
            <div className="flex items-center mb-3">
              <label className="w-44 font-medium shrink-0 text-xs sm:text-sm">Documents</label>
              <input type="file" name="documents" onChange={handleChange} className="flex-1 text-xs ml-2" />
            </div>
            <div className="flex items-start mb-3">
              <label className="w-44 font-medium shrink-0 text-xs sm:text-sm mt-1">Manpower req.</label>
              <textarea
                name="manpowerRequired"
                value={formData.manpowerRequired}
                onChange={handleChange}
                className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-sm ml-2 min-h-[72px]"
                rows={3}
              />
            </div>
            <div className="flex items-center mb-3">
              <label className="w-44 font-medium shrink-0 text-xs sm:text-sm">Fire Tender</label>
              <input type="checkbox" name="fireTenderRequired" checked={formData.fireTenderRequired} onChange={handleChange} className="ml-2" />
            </div>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2 text-gray-800">POINT OF CONTACT</h4>
        <div className="border rounded-md overflow-x-auto">
          <table className="min-w-[720px] w-full text-xs">
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
              {formData.contacts.map((c, i) => (
                <tr key={i} className="border-b">
                  {["name", "phone", "email", "street", "street2", "zip", "city", "state", "country"].map((f) => (
                    <td key={f} className="px-2 py-1">
                      <input name={f} value={c[f] || ""} onChange={(e) => handleContactChange(i, e)} className="w-full border-b border-gray-200 focus:border-purple-500 focus:outline-none" />
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    <button type="button" onClick={() => removeContact(i)} className="text-red-600 text-xs hover:underline">
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

      <div>
        <h4 className="font-semibold mb-2 text-gray-800">TEAM</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={formData.handledBy} readOnly className="border border-gray-200 p-2 rounded-md bg-gray-50 text-sm" />
          <input name="authorizationTo" value={formData.authorizationTo} onChange={handleChange} placeholder="Authorization To" className="border border-gray-200 p-2 rounded-md text-sm" />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
        <button type="button" onClick={onCancel} className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={`px-5 py-2 rounded-lg text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {submitting ? "Saving…" : enquiryId ? "Update" : "Save"}
        </button>
      </div>
    </div>
  );
};

export default ManpowerEnquiryFormPanel;
