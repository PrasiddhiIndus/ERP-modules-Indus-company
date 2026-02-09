// src/components/Manpower/ManpowerEnquiry.jsx
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import ManpowerNavbar from "./ManpowerNavbar";
import { useNavigate, useParams } from "react-router-dom";

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

const ManpowerEnquiry = () => {
    const [formData, setFormData] = useState(initialForm);
    const [endDate, setEndDate] = useState("");
    const { id } = useParams(); // get id from URL if editing
    const navigate = useNavigate();

    // Fetch enquiry data if editing
    useEffect(() => {
        if (!id) {
            // Reset form for new enquiry
            setFormData(initialForm);
            setEndDate("");
            return;
        }

        const fetchEnquiry = async () => {
            const { data, error } = await supabase
                .from("manpower_enquiries")
                .select("*")
                .eq("id", id)
                .single();

            if (error) {
                console.error("Error fetching enquiry:", error);
            } else if (data) {
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
                    dueDate: data.due_date,
                    rfqAvailable: data.rfq_available,
                    projectEstimation: data.project_estimation,
                    duration: data.duration,
                    documents: null,
                    manpowerRequired: data.manpower_required,
                    fireTenderRequired: data.fire_tender_required,
                    contacts: data.contacts || [],
                    handledBy: data.handled_by,
                    authorizationTo: data.authorization_to,
                    enquiry_number: data.enquiry_number,
                });

                if (data.due_date) setEndDate(data.due_date);
            }
        };

        fetchEnquiry();
    }, [id]);


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

    // Calculate duration from today to endDate
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
        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError) throw userError;

            let documentUrl = null;

            if (formData.documents) {
                const { data, error } = await supabase.storage
                    .from("manpower-docs")
                    .upload(`documents/${Date.now()}_${formData.documents.name}`, formData.documents);

                if (error) throw error;
                documentUrl = data.path;
            }

            if (id) {
                // ------------------ UPDATE EXISTING ENQUIRY ------------------
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
                    due_date: formData.dueDate,
                    rfq_available: formData.rfqAvailable,
                    project_estimation: formData.projectEstimation,
                    duration: formData.duration,
                    documents: documentUrl || formData.documents, // keep old if not updated
                    manpower_required: formData.manpowerRequired,
                    fire_tender_required: formData.fireTenderRequired,
                    contacts: formData.contacts,
                    handled_by: formData.handledBy,
                    authorization_to: formData.authorizationTo,
                };
                
                // Only add user_id if user is available (optional)
                if (user?.id) {
                    updateData.user_id = user.id;
                }

                const { error } = await supabase
                    .from("manpower_enquiries")
                    .update(updateData)
                    .eq("id", id);

                if (error) throw error;

                alert(`Enquiry updated successfully!`);
            } else {
                // ------------------ INSERT NEW ENQUIRY ------------------
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
                    due_date: formData.dueDate,
                    rfq_available: formData.rfqAvailable,
                    project_estimation: formData.projectEstimation,
                    duration: formData.duration,
                    documents: documentUrl,
                    manpower_required: formData.manpowerRequired,
                    fire_tender_required: formData.fireTenderRequired,
                    contacts: formData.contacts,
                    handled_by: formData.handledBy,
                    authorization_to: formData.authorizationTo,
                    enquiry_number: enquiryNumber,
                    status: "Pending",
                };
                
                // Only add user_id if user is available (optional)
                if (user?.id) {
                    insertData.user_id = user.id;
                }

                const { error } = await supabase.from("manpower_enquiries").insert([insertData]);

                if (error) throw error;

                alert(`Enquiry saved successfully! Your ENQ Number: ${enquiryNumber}`);
                setFormData(initialForm);
                setEndDate("");
            }

            navigate("/manpower/list"); // redirect after save/update
        } catch (err) {
            console.error(err);
            alert("Failed to save enquiry. Check console for details.");
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
            <ManpowerNavbar />

            <div className="bg-white shadow p-6 rounded-lg mb-6">
                <h3 className="text-lg font-semibold mb-4">
                    {id ? "Edit Manpower Enquiry" : "New Manpower Enquiry"}
                </h3>
                {/* ---------------- CLIENT DETAILS ---------------- */}
                <h4 className="font-semibold mb-2">CLIENT DETAILS</h4>
                <div className="grid grid-cols-2 gap-6 mb-6">
                    {/* Left */}
                    <div>
                        <div className="flex items-center mb-4">
                            <label className="w-24 font-medium">
                                Client <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="client"
                                value={formData.client}
                                onChange={handleChange}
                                className="flex-1 border-b focus:outline-none"
                            />
                        </div>
                        <div className="flex items-center mb-4">
                            <label className="w-24 font-medium">Phone</label>
                            <input
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                className="flex-1 border-b focus:outline-none"
                            />
                        </div>
                        <div className="flex items-center mb-4">
                            <label className="w-24 font-medium">Email</label>
                            <input
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className="flex-1 border-b focus:outline-none"
                            />
                        </div>
                    </div>
                    {/* Right (Address) */}
                    <div>
                        <label className="block font-medium mb-2">Address</label>
                        <input
                            name="street"
                            value={formData.street}
                            onChange={handleChange}
                            className="w-full border-b mb-2 focus:outline-none"
                            placeholder="Street..."
                        />
                        <input
                            name="street2"
                            value={formData.street2}
                            onChange={handleChange}
                            className="w-full border-b mb-2 focus:outline-none"
                            placeholder="Street 2..."
                        />
                        <div className="grid grid-cols-3 gap-4 mb-2">
                            <input
                                name="city"
                                value={formData.city}
                                onChange={handleChange}
                                className="border-b focus:outline-none"
                                placeholder="City"
                            />
                            <input
                                name="state"
                                value={formData.state}
                                onChange={handleChange}
                                className="border-b focus:outline-none"
                                placeholder="State"
                            />
                            <input
                                name="zip"
                                value={formData.zip}
                                onChange={handleChange}
                                className="border-b focus:outline-none"
                                placeholder="ZIP"
                            />
                        </div>
                        <input
                            name="country"
                            value={formData.country}
                            onChange={handleChange}
                            className="w-full border-b focus:outline-none"
                            placeholder="Country"
                        />
                    </div>
                </div>

                {/* ENQUIRY DETAILS */}
                <h4 className="font-semibold mb-2">ENQUIRY DETAILS</h4>
                <div className="grid grid-cols-2 gap-6 mb-6">
                    {/* Left */}
                    <div>
                        <div className="flex items-start mb-4">
                            <label className="w-32 font-medium">Source</label>
                            <div className="flex flex-col space-y-2">
                                {["Mail", "E-Procurement", "Gem Portal", "Other"].map((src) => (
                                    <label key={src} className="flex items-center space-x-2">
                                        <input
                                            type="radio"
                                            name="source"
                                            value={src}
                                            checked={formData.source === src}
                                            onChange={handleChange}
                                        />
                                        <span>{src}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center mb-4">
                            <label className="w-40 font-medium">
                                Due Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                name="dueDate"
                                value={formData.dueDate}
                                onChange={handleChange}
                                min={new Date().toISOString().split("T")[0]}
                                className="border-b focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Right */}
                    <div>
                        <div className="flex items-center mb-4">
                            <label className="w-40 font-medium">
                                RFQ/Tender Number Available
                            </label>
                            <input
                                type="checkbox"
                                name="rfqAvailable"
                                checked={formData.rfqAvailable}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="flex items-center mb-4">
                            <label className="w-40 font-medium">Project Estimation</label>
                            <input
                                name="projectEstimation"
                                value={formData.projectEstimation}
                                onChange={handleChange}
                                className="border-b focus:outline-none"
                                placeholder="$0.00"
                            />
                        </div>

                        {/* Duration with Calendar */}
                        <div className="flex flex-col md:flex-row md:items-center mb-4 md:space-x-4 space-y-2 md:space-y-0">
                            <label className="w-40 font-medium">Duration of Contract</label>

                            {/* End Date Picker */}
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                min={new Date().toISOString().split("T")[0]} // cannot select past date
                                className="border-b focus:outline-none md:flex-1"
                            />
                            <br></br>

                            {/* Display duration from today */}
                            {endDate && (
                                <span className="mt-1 md:mt-0">
                                    ({formData.duration.years} yrs, {formData.duration.months} mos, {formData.duration.days} days)
                                </span>
                            )}

                        </div>

                        <div className="flex items-center mb-4">
                            <label className="w-40 font-medium">Technical Documents</label>
                            <input
                                type="file"
                                name="documents"
                                onChange={handleChange}
                                className="flex-1"
                            />
                        </div>
                        <div className="flex items-start mb-4">
                            <label className="w-40 font-medium mt-1">
                                No. of Manpower Required
                            </label>
                            <textarea
                                name="manpowerRequired"
                                value={formData.manpowerRequired}
                                onChange={handleChange}
                                className="flex-1 border-b focus:outline-none"
                                rows={3}
                                placeholder="Enter manpower details..."
                            />
                        </div>
                        <div className="flex items-center mb-4">
                            <label className="w-40 font-medium">Fire Tender Required</label>
                            <input
                                type="checkbox"
                                name="fireTenderRequired"
                                checked={formData.fireTenderRequired}
                                onChange={handleChange}
                            />
                        </div>
                    </div>
                </div>

                {/* ---------------- CONTACTS ---------------- */}
                <h4 className="font-semibold mb-2">POINT OF CONTACT DETAILS</h4>
                <div className="border rounded-md overflow-hidden mb-6">
                    <table className="min-w-full border-collapse">
                        <thead className="bg-gray-100 border-b">
                            <tr>
                                {[
                                    "Name",
                                    "Phone",
                                    "Email",
                                    "Street",
                                    "Street2",
                                    "Zip",
                                    "City",
                                    "State",
                                    "Country",
                                    "Action",
                                ].map((h) => (
                                    <th
                                        key={h}
                                        className="px-3 py-2 text-left text-sm font-medium"
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {formData.contacts.map((c, i) => (
                                <tr key={i} className="border-b">
                                    {[
                                        "name",
                                        "phone",
                                        "email",
                                        "street",
                                        "street2",
                                        "zip",
                                        "city",
                                        "state",
                                        "country",
                                    ].map((f) => (
                                        <td key={f} className="px-3 py-2">
                                            <input
                                                name={f}
                                                value={c[f] || ""}
                                                onChange={(e) => handleContactChange(i, e)}
                                                className="w-full border-b focus:outline-none"
                                            />
                                        </td>
                                    ))}
                                    <td className="px-3 py-2">
                                        <button
                                            onClick={() => removeContact(i)}
                                            className="px-2 py-1 bg-red-500 text-white rounded"
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            <tr>
                                <td
                                    colSpan="10"
                                    onClick={addContactRow}
                                    className="px-3 py-2 text-blue-600 cursor-pointer hover:underline"
                                >
                                    Add a line
                                </td>
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


                {/* ---------------- CLIENT DETAILS ---------------- */}
                {/* ... keep all existing JSX as is ... */}
                {/* ENQUIRY DETAILS, CONTACTS, TEAM, Save Button */}
                <button
                    onClick={handleSubmit}
                    className="px-4 py-2 bg-blue-600 text-white rounded"
                >
                    {id ? "Update Enquiry" : "Save Enquiry"}
                </button>
            </div>
        </div>
    );
};

export default ManpowerEnquiry;
