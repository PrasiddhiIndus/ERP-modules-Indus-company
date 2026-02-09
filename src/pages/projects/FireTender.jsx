// src/components/FireTender/FireTender.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import FireTenderNavbar from "./FireTenderNavbar";

const initialFormData = {
  enquiryNumber: "",
  client: "",
  phone: "",
  email: "",
  street: "",
  street2: "",
  zip: "",
  city: "",
  state: "",
  country: "",
  source: "",
  typeOfTender: "",
  modeOfTender: "",
  vehicleType: "",
  tenderIdAvailable: false,
  publishDate: "",
  dueDate: "",
  estimation: "",
  description: "",
  handledBy: "Current User",
  authorizationTo: "",
  documents: null,
  contacts: [],
};

const FireTender = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(initialFormData);

  // ---------- Fetch Tender if editing ----------
  useEffect(() => {
    if (!id) return;

    const fetchTender = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("tenders")
          .select("*, tender_contacts(*)")
          .eq("id", id)
          .single();

        if (error) throw error;

        const toDateInput = (val) => (val ? val.split("T")[0] : "");
        setFormData((prev) => ({
          ...prev,
          ...data,
          typeOfTender: data.type_of_tender ?? "",
          modeOfTender: data.mode_of_tender ?? "",
          vehicleType: data.vehicle_type ?? "",
          tenderIdAvailable: !!data.tender_id_available,
          publishDate: toDateInput(data.publish_date),
          dueDate: toDateInput(data.due_date),
          estimation: data.estimation ?? "",
          description: data.description ?? "",
          handledBy: data.handled_by ?? prev.handledBy,
          authorizationTo: data.authorization_to ?? "",
          contacts: data.tender_contacts ?? [],
        }));
      } catch (err) {
        console.error("Error loading tender:", err.message);
        alert("Failed to load tender.");
      } finally {
        setLoading(false);
      }
    };

    fetchTender();
  }, [id]);

  // ---------- Handlers ----------
  const handleChange = (e) => {
    const { name, type, value, checked, files } = e.target;
    if (type === "checkbox") {
      setFormData((p) => ({ ...p, [name]: checked }));
    } else if (type === "file") {
      setFormData((p) => ({ ...p, [name]: files }));
    } else {
      setFormData((p) => ({ ...p, [name]: value }));
    }
  };

  const handleContactChange = (index, e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const contacts = [...(prev.contacts || [])];
      contacts[index] = { ...(contacts[index] || {}), [name]: value };
      return { ...prev, contacts };
    });
  };

  const addContactRow = () => {
    setFormData((prev) => ({
      ...prev,
      contacts: [
        ...(prev.contacts || []),
        { name: "", phone: "", email: "", street: "", street2: "", zip: "", city: "", state: "", country: "" },
      ],
    }));
  };

  const removeContact = (index) => {
    setFormData((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((_, i) => i !== index),
    }));
  };

  // ---------- Enquiry Number ----------
  const generateEnquiryNumber = async () => {
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `ENQ/IFSPL/FT/${year}-${month}`;

    try {
      const { data, error } = await supabase
        .from("tenders")
        .select("enquiry_number")
        .ilike("enquiry_number", `${prefix}/%`)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      if (data?.length > 0) {
        const lastNum = parseInt(data[0].enquiry_number.split("/").pop(), 10) || 0;
        return `${prefix}/${String(lastNum + 1).padStart(4, "0")}`;
      }
      return `${prefix}/0001`;
    } catch {
      return `${prefix}/0001`;
    }
  };

  // ---------- Save / Update ----------
  const handleSaveTender = async () => {
    if (!formData.client || !formData.dueDate || !formData.authorizationTo) {
      alert("Client, Due Date, and Authorization To are required!");
      return;
    }

    setLoading(true);
    try {
      let tenderRecord;
      if (id) {
        const { data, error } = await supabase
          .from("tenders")
          .update({
            client: formData.client,
            phone: formData.phone,
            email: formData.email,
            street: formData.street,
            street2: formData.street2,
            zip: formData.zip,
            city: formData.city,
            state: formData.state,
            country: formData.country,
            source: formData.source,
            type_of_tender: formData.typeOfTender,
            mode_of_tender: formData.modeOfTender,
            vehicle_type: formData.vehicleType,
            tender_id_available: formData.tenderIdAvailable,
            publish_date: formData.publishDate || null,
            due_date: formData.dueDate || null,
            estimation: formData.estimation,
            description: formData.description,
            handled_by: formData.handledBy,
            authorization_to: formData.authorizationTo,
            updated_at: new Date(),
          })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        tenderRecord = data;

        // Get current user ID for RLS
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || null;
        
        await supabase.from("tender_contacts").delete().eq("tender_id", id);
        if (formData.contacts.length > 0) {
          await supabase.from("tender_contacts").insert(
            formData.contacts.map((c) => ({ tender_id: id, user_id: userId, ...c }))
          );
        }
      } else {
        const enquiryNum = await generateEnquiryNumber();
        // Get current user ID for RLS
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || null;
        
        const { data, error } = await supabase
          .from("tenders")
          .insert([
            {
              enquiry_number: enquiryNum,
              client: formData.client,
              phone: formData.phone,
              email: formData.email,
              street: formData.street,
              street2: formData.street2,
              zip: formData.zip,
              city: formData.city,
              state: formData.state,
              country: formData.country,
              source: formData.source,
              type_of_tender: formData.typeOfTender,
              mode_of_tender: formData.modeOfTender,
              vehicle_type: formData.vehicleType,
              tender_id_available: formData.tenderIdAvailable,
              publish_date: formData.publishDate || null,
              due_date: formData.dueDate || null,
              estimation: formData.estimation,
              description: formData.description,
              handled_by: formData.handledBy,
              authorization_to: formData.authorizationTo,
              user_id: userId, // Add user_id for RLS
            },
          ])
          .select()
          .single();
        if (error) throw error;
        tenderRecord = data;

        if (formData.contacts.length > 0) {
          await supabase.from("tender_contacts").insert(
            formData.contacts.map((c) => ({ tender_id: tenderRecord.id, user_id: userId, ...c }))
          );
        }
      }

      alert(id ? "Tender updated successfully!" : "Tender saved successfully!");
      setFormData(initialFormData);
      navigate("/fire-tender");
    } catch (err) {
      console.error("Error saving tender:", err.message);
      alert("Failed to save tender!");
    } finally {
      setLoading(false);
    }
  };

  // ---------- UI ----------
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <FireTenderNavbar />
      <div className="bg-white shadow p-6 rounded-lg mb-6">
        <h3 className="text-lg font-semibold mb-4">{id ? "Edit Tender" : "New Tender"}</h3>
        {loading && <div className="mb-4">Loading...</div>}

        {/* ---------------- CLIENT DETAILS ---------------- */}
        <h4 className="font-semibold mb-2">CLIENT DETAILS</h4>
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Left */}
          <div>
            <div className="flex items-center mb-4">
              <label className="w-24 font-medium">Client <span className="text-red-500">*</span></label>
              <input name="client" value={formData.client} onChange={handleChange} className="flex-1 border-b focus:outline-none" />
            </div>
            <div className="flex items-center mb-4">
              <label className="w-24 font-medium">Phone</label>
              <input name="phone" value={formData.phone} onChange={handleChange} className="flex-1 border-b focus:outline-none" />
            </div>
            <div className="flex items-center mb-4">
              <label className="w-24 font-medium">Email</label>
              <input name="email" value={formData.email} onChange={handleChange} className="flex-1 border-b focus:outline-none" />
            </div>
          </div>
          {/* Right (Address) */}
          <div>
            <label className="block font-medium mb-2">Address</label>
            <input name="street" value={formData.street} onChange={handleChange} className="w-full border-b mb-2 focus:outline-none" placeholder="Street..." />
            <input name="street2" value={formData.street2} onChange={handleChange} className="w-full border-b mb-2 focus:outline-none" placeholder="Street 2..." />
            <div className="grid grid-cols-3 gap-4 mb-2">
              <input name="city" value={formData.city} onChange={handleChange} className="border-b focus:outline-none" placeholder="City" />
              <input name="state" value={formData.state} onChange={handleChange} className="border-b focus:outline-none" placeholder="State" />
              <input name="zip" value={formData.zip} onChange={handleChange} className="border-b focus:outline-none" placeholder="ZIP" />
            </div>
            <input name="country" value={formData.country} onChange={handleChange} className="w-full border-b focus:outline-none" placeholder="Country" />
          </div>
        </div>

        {/* ---------------- TENDER DETAILS ---------------- */}
        <h4 className="font-semibold mb-2">TENDER DETAILS</h4>
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Left */}
          <div>
            <div className="flex items-start mb-4">
              <label className="w-32 font-medium">Source</label>
              <div className="flex flex-col space-y-2">
                {["Mail", "E-Procurement", "Gem Portal", "Consultant", "Individual", "Other"].map((src) => (
                  <label key={src} className="flex items-center space-x-2">
                    <input type="radio" name="source" value={src} checked={formData.source === src} onChange={handleChange} />
                    <span>{src}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center mb-4">
              <label className="w-32 font-medium">Type of Tender</label>
              {["Government", "Non-Government"].map((type) => (
                <label key={type} className="flex items-center space-x-2">
                  <input type="radio" name="typeOfTender" value={type} checked={formData.typeOfTender === type} onChange={handleChange} />
                  <span>{type}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center mb-4">
              <label className="w-32 font-medium">Mode of Tender</label>
              {["Online", "Offline"].map((mode) => (
                <label key={mode} className="flex items-center space-x-2">
                  <input type="radio" name="modeOfTender" value={mode} checked={formData.modeOfTender === mode} onChange={handleChange} />
                  <span>{mode}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center mb-4">
              <label className="w-32 font-medium">Vehicle Type</label>
              <input name="vehicleType" value={formData.vehicleType} onChange={handleChange} className="flex-1 border-b focus:outline-none" />
            </div>
          </div>
          {/* Right */}
          <div>
            <div className="flex items-center mb-4">
              <label className="w-40 font-medium">Tender ID Available</label>
              <input type="checkbox" name="tenderIdAvailable" checked={formData.tenderIdAvailable} onChange={handleChange} />
            </div>
            <div className="flex items-center mb-4">
              <label className="w-40 font-medium">Publish Date</label>
              <input type="date" name="publishDate" value={formData.publishDate} onChange={handleChange} className="border-b focus:outline-none" />
            </div>
            <div className="flex items-center mb-4">
              <label className="w-40 font-medium">Due Date <span className="text-red-500">*</span></label>
              <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} min={new Date().toISOString().split("T")[0]} className="border-b focus:outline-none" />
            </div>
            <div className="flex items-center mb-4">
              <label className="w-40 font-medium">Estimation</label>
              <input name="estimation" value={formData.estimation} onChange={handleChange} className="border-b focus:outline-none" placeholder="$0.00" />
            </div>
            <div className="flex items-center mb-4">
              <label className="w-40 font-medium">Documents</label>
              <input type="file" name="documents" onChange={handleChange} className="flex-1" />
            </div>
            <div className="flex items-start mb-4">
              <label className="w-40 font-medium mt-1">Description</label>
              <textarea name="description" value={formData.description} onChange={handleChange} className="flex-1 border-b focus:outline-none" rows={3} placeholder="Enter at least 100 words..." />
            </div>
          </div>
        </div>

        {/* ---------------- CONTACTS ---------------- */}
        <h4 className="font-semibold mb-2">POINT OF CONTACT DETAILS</h4>
        <div className="border rounded-md overflow-hidden mb-6">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-100 border-b">
              <tr>
                {["Name", "Phone", "Email", "Street", "Street2", "Zip", "City", "State", "Country", "Action"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-sm font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {formData.contacts.map((c, i) => (
                <tr key={i} className="border-b">
                  {["name", "phone", "email", "street", "street2", "zip", "city", "state", "country"].map((f) => (
                    <td key={f} className="px-3 py-2">
                      <input name={f} value={c[f] || ""} onChange={(e) => handleContactChange(i, e)} className="w-full border-b focus:outline-none" />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <button onClick={() => removeContact(i)} className="px-2 py-1 bg-red-500 text-white rounded">Remove</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan="10" onClick={addContactRow} className="px-3 py-2 text-blue-600 cursor-pointer hover:underline">Add a line</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ---------------- TEAM ---------------- */}
        <h4 className="font-semibold mb-2">TEAM DETAILS</h4>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <input value={formData.handledBy} readOnly className="border p-2 rounded bg-gray-100" />
          <input name="authorizationTo" value={formData.authorizationTo} onChange={handleChange} placeholder="Authorization To *" className="border p-2 rounded" />
        </div>

        {/* Save */}
        <button onClick={handleSaveTender} className="px-4 py-2 bg-blue-600 text-white rounded">
          {id ? "Update Tender" : "Save Tender"}
        </button>
      </div>
    </div>
  );
};

export default FireTender;
