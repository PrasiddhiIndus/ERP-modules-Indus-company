// src/pages/projects/FireTender.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Truck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import FireTenderNavbar from "./FireTenderNavbar";

/** Form controls — slate borders, red focus ring (Fire Tender) */
const ftInput =
  "w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white shadow-sm focus:ring-2 focus:ring-red-500/30 focus:border-red-400 transition-all";
const ftLabel = "block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5";
const ftHint = "text-[11px] text-slate-400 mt-1";
const ftRadioWrap =
  "flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50 transition-colors";
const TENDERS_PER_PAGE = 10;

function FormSection({ icon: Icon, title, description, children }) {
  return (
    <section className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden ring-1 ring-slate-900/5">
      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5 sm:py-4 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
        {Icon && (
          <div className="mt-0.5 shrink-0 rounded-xl bg-red-50 p-2.5 ring-1 ring-red-100/80">
            <Icon className="h-5 w-5 text-red-600" strokeWidth={2} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 leading-snug">{title}</h3>
          {description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>}
        </div>
      </div>
      <div className="p-4 sm:p-5 md:p-6">{children}</div>
    </section>
  );
}

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

function mapTenderRecordToForm(data) {
  const toDateInput = (val) => (val ? val.split("T")[0] : "");
  const cleanContact = (c) => ({
    name: c.name ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    street: c.street ?? "",
    street2: c.street2 ?? "",
    zip: c.zip ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    country: c.country ?? "",
  });
  return {
    ...initialFormData,
    enquiryNumber: data.enquiry_number ?? "",
    client: data.client ?? "",
    phone: data.phone ?? "",
    email: data.email ?? "",
    street: data.street ?? "",
    street2: data.street2 ?? "",
    zip: data.zip ?? "",
    city: data.city ?? "",
    state: data.state ?? "",
    country: data.country ?? "",
    source: data.source ?? "",
    typeOfTender: data.type_of_tender ?? "",
    modeOfTender: data.mode_of_tender ?? "",
    vehicleType: data.vehicle_type ?? "",
    tenderIdAvailable: !!data.tender_id_available,
    publishDate: toDateInput(data.publish_date),
    dueDate: toDateInput(data.due_date),
    estimation: data.estimation ?? "",
    description: data.description ?? "",
    handledBy: data.handled_by ?? "Current User",
    authorizationTo: data.authorization_to ?? "",
    documents: null,
    contacts: Array.isArray(data.tender_contacts) ? data.tender_contacts.map(cleanContact) : [],
  };
}

function TenderFormFields({
  formData,
  handleChange,
  handleContactChange,
  addContactRow,
  removeContact,
}) {
  return (
    <div className="space-y-5">
      <FormSection
        icon={Building2}
        title="Client & address"
        description="Registered client name, communication details, and site or billing address."
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-8">
          <div className="space-y-4">
            <div>
              <label className={ftLabel}>
                Client name <span className="text-red-600">*</span>
              </label>
              <input name="client" value={formData.client} onChange={handleChange} className={ftInput} placeholder="Organization or client name" autoComplete="organization" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={ftLabel}>Phone</label>
                <input name="phone" value={formData.phone} onChange={handleChange} className={ftInput} placeholder="+91 …" inputMode="tel" />
              </div>
              <div>
                <label className={ftLabel}>Email</label>
                <input name="email" type="email" value={formData.email} onChange={handleChange} className={ftInput} placeholder="name@company.com" autoComplete="email" />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <label className={ftLabel}>Address</label>
            <input name="street" value={formData.street} onChange={handleChange} className={ftInput} placeholder="Address line 1" />
            <input name="street2" value={formData.street2} onChange={handleChange} className={ftInput} placeholder="Address line 2 (optional)" />
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <input name="city" value={formData.city} onChange={handleChange} className={ftInput} placeholder="City" />
              <input name="state" value={formData.state} onChange={handleChange} className={ftInput} placeholder="State" />
              <input name="zip" value={formData.zip} onChange={handleChange} className={ftInput} placeholder="PIN / ZIP" />
            </div>
            <input name="country" value={formData.country} onChange={handleChange} className={ftInput} placeholder="Country" />
          </div>
        </div>
      </FormSection>

      <FormSection
        icon={Briefcase}
        title="Tender scope & timeline"
        description="Source, classification, key dates, estimate, supporting files, and scope description."
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-3">Source</p>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-x-2 sm:gap-y-1">
                {["Mail", "E-Procurement", "Gem Portal", "Consultant", "Individual", "Other"].map((src) => (
                  <label key={src} className={ftRadioWrap}>
                    <input type="radio" name="source" value={src} checked={formData.source === src} onChange={handleChange} className="h-4 w-4 border-slate-300 text-red-600 focus:ring-red-500" />
                    <span className="text-sm">{src}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Type</p>
                <div className="flex flex-col gap-1">
                  {["Government", "Non-Government"].map((type) => (
                    <label key={type} className={ftRadioWrap}>
                      <input
                        type="radio"
                        name="typeOfTender"
                        value={type}
                        checked={formData.typeOfTender === type}
                        onChange={handleChange}
                        className="h-4 w-4 border-slate-300 text-red-600 focus:ring-red-500"
                      />
                      <span>{type}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Mode</p>
                <div className="flex flex-col gap-1">
                  {["Online", "Offline"].map((mode) => (
                    <label key={mode} className={ftRadioWrap}>
                      <input
                        type="radio"
                        name="modeOfTender"
                        value={mode}
                        checked={formData.modeOfTender === mode}
                        onChange={handleChange}
                        className="h-4 w-4 border-slate-300 text-red-600 focus:ring-red-500"
                      />
                      <span>{mode}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className={ftLabel}>Vehicle type</label>
              <input name="vehicleType" value={formData.vehicleType} onChange={handleChange} className={ftInput} placeholder="e.g. Water tender, foam" />
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm hover:border-slate-300 transition-colors">
              <input
                type="checkbox"
                name="tenderIdAvailable"
                checked={formData.tenderIdAvailable}
                onChange={handleChange}
                className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm font-medium text-slate-800">Tender ID is available / issued</span>
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={ftLabel}>Publish date</label>
                <input type="date" name="publishDate" value={formData.publishDate} onChange={handleChange} className={ftInput} />
              </div>
              <div>
                <label className={ftLabel}>
                  Due date <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={handleChange}
                  min={new Date().toISOString().split("T")[0]}
                  className={ftInput}
                />
              </div>
            </div>
            <div>
              <label className={ftLabel}>Estimation</label>
              <input name="estimation" value={formData.estimation} onChange={handleChange} className={ftInput} placeholder="e.g. ₹12,50,000" />
            </div>
            <div>
              <label className={ftLabel}>Documents</label>
              <input
                type="file"
                name="documents"
                onChange={handleChange}
                className={`${ftInput} py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-red-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-red-800 hover:file:bg-red-100`}
              />
              <p className={ftHint}>Attach tender PDF, BOQ, or drawings if applicable.</p>
            </div>
            <div>
              <label className={ftLabel}>Description & scope</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                className={`${ftInput} min-h-[100px] resize-y leading-relaxed`}
                rows={4}
                placeholder="Summarize scope, exclusions, and any critical compliance notes."
              />
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection
        icon={Users}
        title="Points of contact"
        description="Add one row per site or liaison contact. Use “Add a line” for more rows."
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-red-100 bg-gradient-to-r from-red-50 via-orange-50/80 to-amber-50">
                  {["Name", "Phone", "Email", "Street", "Street2", "Zip", "City", "State", "Country", "Action"].map((h, hi) => (
                    <th key={hi} className="whitespace-nowrap px-2.5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-700">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {formData.contacts.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50/80">
                    {["name", "phone", "email", "street", "street2", "zip", "city", "state", "country"].map((f) => (
                      <td key={f} className="px-2 py-2 align-middle">
                        <input
                          name={f}
                          value={c[f] || ""}
                          onChange={(e) => handleContactChange(i, e)}
                          className="w-full min-w-[68px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-red-400 focus:ring-2 focus:ring-red-500/25"
                        />
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-2 py-2">
                      <button
                        type="button"
                        onClick={() => removeContact(i)}
                        className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-red-600 hover:text-white transition-colors"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50/50">
                  <td colSpan={10} className="px-3 py-3">
                    <button type="button" onClick={addContactRow} className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:text-red-900">
                      <Plus className="h-4 w-4" />
                      Add a line
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </FormSection>

      <FormSection
        icon={Shield}
        title="Team & authorization"
        description="Shows who is handling the file and who must authorize submission."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <div>
            <label className={ftLabel}>Handled by</label>
            <input value={formData.handledBy} readOnly className={`${ftInput} cursor-not-allowed border-slate-100 bg-slate-50 text-slate-600`} />
            <p className={ftHint}>Synced from your login profile where applicable.</p>
          </div>
          <div>
            <label className={ftLabel}>
              Authorization to <span className="text-red-600">*</span>
            </label>
            <input name="authorizationTo" value={formData.authorizationTo} onChange={handleChange} placeholder="Name or designation" className={ftInput} />
            <p className={ftHint}>Person authorizing this tender entry.</p>
          </div>
        </div>
      </FormSection>
    </div>
  );
}

const FireTender = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditMode = Boolean(id && id !== "new");
  const isNewTenderPage = location.pathname.replace(/\/$/, "").endsWith("/fire-tender/new");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [tenders, setTenders] = useState([]);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  /** When set, modal is editing this tender id (from list); null = new entry */
  const [modalEditId, setModalEditId] = useState(null);
  const [modalPrefillLoading, setModalPrefillLoading] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredTenders = useMemo(() => {
    if (!searchQuery.trim()) return tenders;
    const q = searchQuery.toLowerCase();
    return tenders.filter(
      (t) =>
        (t.client || "").toLowerCase().includes(q) ||
        (t.enquiry_number || "").toLowerCase().includes(q) ||
        (t.email || "").toLowerCase().includes(q) ||
        String(t.phone || "").toLowerCase().includes(q)
    );
  }, [tenders, searchQuery]);
  const totalPages = Math.max(1, Math.ceil(filteredTenders.length / TENDERS_PER_PAGE));
  const startIndex = (currentPage - 1) * TENDERS_PER_PAGE;
  const paginatedTenders = filteredTenders.slice(startIndex, startIndex + TENDERS_PER_PAGE);

  const generateTenderNumber = (running, numberRunning) => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = String(now.getFullYear()).slice(-2);
    return `IFSPL/Ad-X/${running}/${month}-${year}-${numberRunning}`;
  };

  const fetchTenders = useCallback(async () => {
    setListLoading(true);
    try {
      const { data, error } = await supabase.from("tenders").select("*, tender_contacts(*)").order("created_at", { ascending: false });
      if (error) throw error;
      setTenders(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isNewTenderPage) return;
    fetchTenders();
  }, [isNewTenderPage, location.pathname, fetchTenders]);

  useEffect(() => {
    if (!isEditMode) return;

    const fetchTender = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from("tenders").select("*, tender_contacts(*)").eq("id", id).single();

        if (error) throw error;

        setFormData(mapTenderRecordToForm(data));
      } catch (err) {
        console.error("Error loading tender:", err.message);
        alert("Failed to load tender.");
      } finally {
        setLoading(false);
      }
    };

    fetchTender();
  }, [id, isEditMode]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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

  const handleSaveTender = async () => {
    if (!formData.client || !formData.dueDate || !formData.authorizationTo) {
      alert("Client, Due Date, and Authorization To are required!");
      return;
    }

    setSaving(true);
    const effectiveEditId = isEditMode ? id : modalEditId;

    try {
      let tenderRecord;
      if (effectiveEditId) {
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
          .eq("id", effectiveEditId)
          .select()
          .single();
        if (error) throw error;
        tenderRecord = data;

        const {
          data: { user },
        } = await supabase.auth.getUser();
        const userId = user?.id || null;

        await supabase.from("tender_contacts").delete().eq("tender_id", effectiveEditId);
        if (formData.contacts.length > 0) {
          await supabase
            .from("tender_contacts")
            .insert(formData.contacts.map((c) => ({ tender_id: effectiveEditId, user_id: userId, ...c })));
        }
      } else {
        const enquiryNum = await generateEnquiryNumber();
        const {
          data: { user },
        } = await supabase.auth.getUser();
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
              user_id: userId,
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

      alert(effectiveEditId ? "Tender updated successfully!" : "Tender saved successfully!");
      setFormData(initialFormData);
      setModalEditId(null);
      if (isNewTenderPage && !isEditMode) {
        setEntryModalOpen(false);
        fetchTenders();
      } else if (isEditMode) {
        navigate("/app/fire-tender/new");
      }
    } catch (err) {
      console.error("Error saving tender:", err.message);
      alert("Failed to save tender!");
    } finally {
      setSaving(false);
    }
  };

  const openNewEntry = () => {
    setModalEditId(null);
    setFormData(initialFormData);
    setEntryModalOpen(true);
  };

  const closeNewEntry = () => {
    setEntryModalOpen(false);
    setModalEditId(null);
    setModalPrefillLoading(false);
    setFormData(initialFormData);
  };

  const openEditEntry = async (tender) => {
    setModalEditId(tender.id);
    setFormData(initialFormData);
    setEntryModalOpen(true);
    setModalPrefillLoading(true);
    try {
      const { data, error } = await supabase.from("tenders").select("*, tender_contacts(*)").eq("id", tender.id).single();
      if (error) throw error;
      setFormData(mapTenderRecordToForm(data));
    } catch (err) {
      console.error(err);
      alert("Failed to load tender for editing.");
      setEntryModalOpen(false);
      setModalEditId(null);
      setFormData(initialFormData);
    } finally {
      setModalPrefillLoading(false);
    }
  };

  const handleApprove = async (tid) => {
    const tender = tenders.find((t) => t.id === tid);
    let tenderNumber = tender.tender_number;

    if (!tenderNumber) {
      const approvedCount = tenders.filter((t) => t.tender_number).length;
      const running = String(approvedCount + 1).padStart(5, "0");
      const numberRunning = approvedCount + 1;
      tenderNumber = generateTenderNumber(running, numberRunning);
    }

    const { error } = await supabase.from("tenders").update({ status: "Approved", tender_number: tenderNumber }).eq("id", tid);

    if (!error) {
      setTenders((prev) => prev.map((t) => (t.id === tid ? { ...t, status: "Approved", tender_number: tenderNumber } : t)));
    } else {
      console.error(error);
      alert("Error approving tender!");
    }
  };

  const handleReject = async (tid) => {
    const tender = tenders.find((t) => t.id === tid);
    let tenderNumber = tender.tender_number;

    if (!tenderNumber) {
      const approvedCount = tenders.filter((t) => t.tender_number).length;
      const running = String(approvedCount + 1).padStart(5, "0");
      const numberRunning = approvedCount + 1;
      tenderNumber = generateTenderNumber(running, numberRunning);
    }

    const { error } = await supabase.from("tenders").update({ status: "Rejected", tender_number: tenderNumber }).eq("id", tid);

    if (!error) {
      setTenders((prev) => prev.map((t) => (t.id === tid ? { ...t, status: "Rejected", tender_number: tenderNumber } : t)));
    } else {
      console.error(error);
      alert("Error rejecting tender!");
    }
  };

  const handleDelete = async (tid) => {
    if (!window.confirm("Delete this tender? This cannot be undone.")) return;
    await supabase.from("tenders").delete().eq("id", tid);
    setTenders((prev) => prev.filter((t) => t.id !== tid));
  };

  if (isNewTenderPage && !isEditMode) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 space-y-6">
          <FireTenderNavbar />

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-2">
              <div className="flex items-start gap-3">
                <div className="bg-red-100 p-3 rounded-xl shrink-0">
                  <Truck className="w-7 h-7 text-red-600" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">New Tender</h1>
                  <p className="text-sm text-gray-600 mt-1">Add entries and manage all fire tender records in one place</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full xl:w-auto">
                <div className="relative flex-1 sm:min-w-[260px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search by client, enquiry no., email…"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <button
                  type="button"
                  onClick={openNewEntry}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  New Entry
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {listLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin text-red-600 mb-3" />
                <p className="text-sm font-medium">Loading tenders…</p>
              </div>
            ) : tenders.length === 0 ? (
              <div className="py-14 px-6 text-center text-gray-500">
                <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p className="text-base font-semibold text-gray-700">No tenders yet</p>
                <p className="text-sm mt-1">Use <span className="font-medium text-red-600">New Entry</span> to create your first tender</p>
              </div>
            ) : filteredTenders.length === 0 ? (
              <div className="py-12 px-6 text-center text-gray-500">
                <p className="text-sm font-medium text-gray-700">No matches for your search</p>
                <button type="button" onClick={() => setSearchQuery("")} className="mt-2 text-sm text-red-600 font-medium hover:underline">
                  Clear search
                </button>
              </div>
            ) : (
              <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-gradient-to-r from-red-50 to-amber-50 border-b border-red-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Client</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Enquiry No</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Due date</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Tender No</th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {paginatedTenders.map((tender) => {
                      const status = tender.status || "Pending";
                      const statusBadge =
                        status === "Approved"
                          ? "bg-green-100 text-green-800 border-green-200"
                          : status === "Rejected"
                            ? "bg-red-100 text-red-800 border-red-200"
                            : "bg-amber-100 text-amber-800 border-amber-200";
                      const enquiryNoStyle =
                        status === "Approved"
                          ? "text-green-800 bg-green-50 border-green-200"
                          : status === "Rejected"
                            ? "text-red-800 bg-red-50 border-red-200"
                            : "text-amber-900 bg-amber-50/80 border-amber-200";
                      return (
                        <tr key={tender.id} className="hover:bg-red-50/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate" title={tender.client}>
                            {tender.client}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span
                              className={`inline-flex items-center max-w-[220px] truncate font-semibold px-2.5 py-1 rounded-md border ${enquiryNoStyle}`}
                              title={`${tender.enquiry_number || "—"} (${status})`}
                            >
                              {tender.enquiry_number || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {tender.due_date ? new Date(tender.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex px-2.5 py-0.5 text-[10px] font-semibold rounded-full border ${statusBadge}`}>{status}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-800 text-xs">{tender.tender_number || "Not assigned"}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5" role="group" aria-label="Tender actions">
                              <button
                                type="button"
                                title="Edit tender"
                                aria-label="Edit tender"
                                onClick={() => openEditEntry(tender)}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
                              >
                                <Pencil className="w-4 h-4" strokeWidth={2} />
                              </button>
                              <button
                                type="button"
                                title="Approve tender"
                                aria-label="Approve tender"
                                onClick={() => handleApprove(tender.id)}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 transition-colors focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-1"
                              >
                                <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
                              </button>
                              <button
                                type="button"
                                title="Reject tender"
                                aria-label="Reject tender"
                                onClick={() => handleReject(tender.id)}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
                              >
                                <XCircle className="w-4 h-4" strokeWidth={2} />
                              </button>
                              <button
                                type="button"
                                title="Delete tender"
                                aria-label="Delete tender"
                                onClick={() => handleDelete(tender.id)}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-red-700 hover:border-red-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={2} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-100 bg-white">
                <p className="text-xs text-gray-600">
                  Showing {startIndex + 1}-{Math.min(startIndex + TENDERS_PER_PAGE, filteredTenders.length)} of {filteredTenders.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      currentPage === 1
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <span className="text-sm font-medium text-gray-700 px-2">
                    Page {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      currentPage === totalPages
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-red-600 text-white hover:bg-red-700"
                    }`}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              </>
            )}
          </div>
        </div>

        {entryModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/45 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-tender-modal-title"
          >
            <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] ring-1 ring-slate-900/10">
              <div className="h-1.5 shrink-0 bg-gradient-to-r from-red-600 via-red-500 to-amber-400" aria-hidden />
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-8 sm:py-5">
                <div className="flex min-w-0 gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 ring-1 ring-red-100">
                    <Truck className="h-6 w-6 text-red-600" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-600/90">Fire tender</p>
                    <h2 id="new-tender-modal-title" className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                      {modalEditId ? "Update tender entry" : "New tender entry"}
                    </h2>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-500">
                      {modalEditId
                        ? "Review and update the details below. Changes apply immediately after you save."
                        : "Complete all sections to register a tender. Required fields are marked with."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeNewEntry}
                  disabled={saving}
                  className="shrink-0 rounded-xl p-2.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                  aria-label="Close"
                  title={modalPrefillLoading ? "Cancel loading" : "Close"}
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
              <div className="relative flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/90 to-white px-5 py-6 sm:px-8 sm:py-8">
                {modalPrefillLoading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/85 backdrop-blur-[1px]">
                    <Loader2 className="mb-3 h-10 w-10 animate-spin text-red-600" />
                    <p className="text-sm font-medium text-slate-600">Loading tender…</p>
                  </div>
                )}
                {saving && (
                  <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50/80 px-3 py-2 text-sm font-medium text-red-900">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-red-600" />
                    Saving your changes…
                  </div>
                )}
                <TenderFormFields
                  formData={formData}
                  handleChange={handleChange}
                  handleContactChange={handleContactChange}
                  addContactRow={addContactRow}
                  removeContact={removeContact}
                />
              </div>
              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8 sm:py-4">
                <button
                  type="button"
                  onClick={closeNewEntry}
                  disabled={saving}
                  className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTender}
                  disabled={saving || modalPrefillLoading}
                  className={`min-h-[44px] min-w-[140px] rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all ${
                    saving || modalPrefillLoading
                      ? "cursor-not-allowed bg-red-400 shadow-none"
                      : "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:shadow-lg"
                  }`}
                >
                  {saving ? "Saving…" : modalEditId ? "Update entry" : "Save tender"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        <FireTenderNavbar />

        <div className="flex items-start gap-3">
          <div className="bg-red-100 p-3 rounded-xl shrink-0">
            <FileText className="w-7 h-7 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{isEditMode ? "Edit tender" : "New tender"}</h1>
            <p className="text-sm text-gray-600 mt-1">
              {isEditMode ? "Update client, tender, contacts, and team details" : "Create a fire tender record"}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin text-red-600 mb-3" />
              <p className="text-sm font-medium">Loading tender…</p>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white px-4 py-4 sm:px-6 sm:py-5">
                <h2 className="text-base font-bold text-slate-900">Tender form</h2>
                <p className="mt-1 text-sm text-slate-500">Fields marked with <span className="text-red-600">*</span> are required.</p>
              </div>
              <div className="bg-slate-50/40 p-4 sm:p-6 md:p-8">
                <TenderFormFields
                  formData={formData}
                  handleChange={handleChange}
                  handleContactChange={handleContactChange}
                  addContactRow={addContactRow}
                  removeContact={removeContact}
                />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
                <button
                  type="button"
                  onClick={() => navigate("/app/fire-tender/new")}
                  disabled={saving}
                  className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTender}
                  disabled={saving || loading}
                  className={`min-h-[44px] min-w-[140px] rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all ${
                    saving || loading ? "cursor-not-allowed bg-red-400 shadow-none" : "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:shadow-lg"
                  }`}
                >
                  {saving ? "Saving…" : isEditMode ? "Update tender" : "Save tender"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FireTender;
