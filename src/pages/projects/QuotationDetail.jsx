
import React, { useState, useEffect, useRef } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  fetchApprovedQuotationItemsByTenderId,
  fetchApprovedQuotationTenderIds,
  fetchQuotationByTenderId,
  generateFireTenderQuotationNumber,
} from "../../lib/fireTenderShared";
import { INDUS_LOGO_SRC } from "../../constants/branding.js";
import FireTenderNavbar from "./FireTenderNavbar";
import { formatTenderAddress } from "./fireTenderRoutes";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import QuotationDocument from "./QuotationDocument";
import { exportNodeToPdfBlob, downloadBlob } from "../../lib/exportNodeToPdf";

const generateQuotationNumber = (index) => {
  const padded = String(index + 1).padStart(4, "0");
  return `QN/IFSPL/FT/${padded}`;
};

// Format quotation number with revision (e.g., QN/IFSPL/FT/0002/R3)
const formatQuotationWithRevision = (baseNumber, revision) => {
  if (!revision || revision <= 0) return baseNumber;
  
  // Remove any existing revision suffix to prevent duplication
  const cleanBase = baseNumber.replace(/\/R\d+$/, '');
  return `${cleanBase}/R${revision}`;
};

// Increment the base quotation number by 1 (last numeric segment)
const incrementBaseQuotationNo = (base) => {
  try {
    const parts = base.split("/");
    const last = parts[parts.length - 1];
    const num = parseInt(last, 10);
    if (isNaN(num)) return base;
    parts[parts.length - 1] = String(num + 1).padStart(4, "0");
    return parts.join("/");
  } catch (_) {
    return base;
  }
};

const getBase64Image = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });

const QuotationDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const quotationFromList = location.state?.quotation;

  const [quotation, setQuotation] = useState(null);
  const [approvedItems, setApprovedItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [termsTemplates, setTermsTemplates] = useState([]);
  const [selectedTermsTemplateId, setSelectedTermsTemplateId] = useState("");
  const [loading, setLoading] = useState(true);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [termsLoading, setTermsLoading] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", type: "Quotation Template", subject: "", content: "" });
  const [error, setError] = useState(null);
  const [signatureSrc, setSignatureSrc] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [clientEmail, setClientEmail] = useState("");
  const [logoBase64, setLogoBase64] = useState(null);
  const [signatureBase64, setSignatureBase64] = useState(null);
  const docRef = useRef(null);

  /* --------------------------------------------------------------
     FETCH QUOTATION + TENDER + APPROVED ITEMS + CLIENT EMAIL
  -------------------------------------------------------------- */
  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error("User not authenticated");
        }

        /* ---- 1. Approved tender IDs (shared team workflow) ---- */
        const approvedTenderIds = (await fetchApprovedQuotationTenderIds(supabase)).sort(
          (a, b) => a - b
        );

        /* ---- 2. Tender (client details + email) ---- */
        const { data: tender, error: tenderErr } = await supabase
          .from("tenders")
          .select(
            "id, tender_number, client, street, street2, city, state, zip, country, created_at, email, costing_template"
          )
          .eq("id", id)
          .single();
        if (tenderErr) throw tenderErr;
        setClientEmail(tender.email || "");

        /* ---- 3. Approved items (shared per tender) ---- */
        const approved = await fetchApprovedQuotationItemsByTenderId(supabase, id);

        const items = approved.map((i) => ({
          description: i.component,
          qty: Number(i.qty) || 1,
          rate: Number(i.unit_cost) || 0,
          total: Number(i.total) || 0,
        }));

        /* ---- 4. Quotation number (new or from list) ---- */
        let quotationNumber = quotationFromList?.quotationNumber;
        if (!quotationNumber) {
          const idx = approvedTenderIds.indexOf(parseInt(id));
          if (idx === -1) throw new Error("Tender not approved");
          quotationNumber = generateFireTenderQuotationNumber(idx);
        }

        /* ---- 5. Existing saved quotation (one row per tender) ---- */
        const savedQuotation = await fetchQuotationByTenderId(supabase, id);

        const baseNo = savedQuotation?.base_quotation_no || quotationNumber;
        const version = savedQuotation?.version || 0;

        let initialQuotation = {
          id: tender.id,
          quotation_number: quotationNumber,
          base_quotation_no: baseNo,
          version,
          client: tender.client || "Unknown",
          template: tender.costing_template || "Fire Tender",
          street: tender.street || "",
          street2: tender.street2 || "",
          city: tender.city || "",
          state: tender.state || "",
          zip: tender.zip || "",
          country: tender.country || "",
          date: formatDateDdMmYyyy(tender.created_at || new Date()),
          subject: "",
          body: "",
          terms: "",
          signedBy: "",
          signature_url: "",
          items,
        };

        // This section was removed to fix duplicate declaration

        if (savedQuotation) {
          // Using let to reassign initialQuotation
          // Fetch ALL fields from quotations table to ensure complete data
          let updatedQuotation = {
            ...initialQuotation,
            quotation_number: savedQuotation.quotation_number || quotationNumber,
            base_quotation_no: savedQuotation.base_quotation_no || baseNo,
            version: savedQuotation.version || version,
            subject: savedQuotation.subject || "",
            body: savedQuotation.body || "",
            terms: savedQuotation.terms || "",
            signedBy: savedQuotation.signed_by || "",
            signature_url: savedQuotation.signature_url || "",
            pdf_url: savedQuotation.pdf_url || "",
            gst_percentage: savedQuotation.gst_percentage || null,
            // Include any other fields from quotations table
            client: savedQuotation.client || tender.client || "Unknown",
            date: savedQuotation.date || formatDateDdMmYyyy(tender.created_at || new Date()),
          };
          initialQuotation = updatedQuotation;
          if (savedQuotation.signature_url) {
            setSignatureSrc(savedQuotation.signature_url);
          }
        }

        setQuotation(initialQuotation);
        setApprovedItems(items);
        if (savedQuotation?.signature_url) setSignatureSrc(savedQuotation.signature_url);
      } catch (e) {
        console.error(e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    const loadTemplates = async () => {
      setTemplateLoading(true);
      // Get current user for filtering
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from("quotation_templates")
          .select("*")
          .eq("type", "Quotation Template")
          .or(`user_id.is.null,user_id.eq.${user.id}`)
          .order("name", { ascending: true });
        if (error) throw error;
        setTemplates(data || []);
      }
      setTemplateLoading(false);
    };

    const loadTermsTemplates = async () => {
      setTermsLoading(true);
      // Get current user for filtering
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from("quotation_templates")
          .select("*")
          .eq("type", "Terms & Condition")
          .or(`user_id.is.null,user_id.eq.${user.id}`)
          .order("name", { ascending: true });
        if (error) throw error;
        setTermsTemplates(data || []);
      }
      setTermsLoading(false);
    };

    fetchAll();
    loadTemplates();
    loadTermsTemplates();
  }, [id, quotationFromList]);

  // Preload the company logo as base64 so the WYSIWYG preview + PDF always show it.
  useEffect(() => {
    let active = true;
    getBase64Image(INDUS_LOGO_SRC)
      .then((b64) => active && setLogoBase64(b64))
      .catch(() => active && setLogoBase64(null));
    return () => {
      active = false;
    };
  }, []);

  // Convert the signature (storage URL or local object URL) to base64 for the preview/PDF.
  useEffect(() => {
    let active = true;
    if (!signatureSrc) {
      setSignatureBase64(null);
      return undefined;
    }
    getBase64Image(signatureSrc)
      .then((b64) => active && setSignatureBase64(b64))
      .catch(() => active && setSignatureBase64(null));
    return () => {
      active = false;
    };
  }, [signatureSrc]);

  // Upload a File/Blob to storage and return public url
  const uploadFile = async (bucket, path, file) => {
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, { cacheControl: "3600", upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    return urlData.publicUrl;
  };

  /* --------------------------------------------------------------
     SAVE - ENHANCED WITH PROPER REVISION HANDLING
  -------------------------------------------------------------- */
  // Persist the quotation. When `revise` is true we bump the revision number
  // (R1, R2, …) so a new version is recorded; otherwise we save in place.
  // Returns the saved snapshot so callers (e.g. e-mail) can use the latest data.
  const persistQuotation = async ({ revise = false } = {}) => {
    let sigUrl = quotation.signature_url;
    let pdfUrl = quotation.pdf_url;

    // ---- signature upload ----
    if (signatureFile) {
      const ext = signatureFile.name.split(".").pop();
      const name = `signatures/${id}-${Date.now()}.${ext}`;
      sigUrl = await uploadFile("signatures", name, signatureFile);
      setSignatureSrc(sigUrl);
      setSignatureFile(null);
    }

    // ---- versioning logic ----
    // Save keeps the current version; Revise increments it by one.
    const newBase = (quotation.base_quotation_no || quotation.quotation_number || "")
      .toString()
      .replace(/\/R\d+$/, "");
    const newVer = revise ? (quotation.version || 0) + 1 : quotation.version || 0;
    const displayQuotationNumber = formatQuotationWithRevision(newBase, newVer);

    // ---- PDF (WYSIWYG) generation & upload ----
    const pdfBlob = await generatePDFBlob();
    const pdfName = `quotations/Quotation_${displayQuotationNumber.replace(/\//g, "_")}.pdf`;
    pdfUrl = await uploadFile("quotations", pdfName, pdfBlob);

    // ---- persist changes (update-first, insert-fallback) ----
    const payload = {
      quotation_number: displayQuotationNumber,
      base_quotation_no: newBase,
      version: newVer,
      subject: quotation.subject,
      body: quotation.body,
      terms: quotation.terms,
      signed_by: quotation.signedBy,
      signature_url: sigUrl,
      pdf_url: pdfUrl,
      client: quotation.client,
      updated_at: new Date().toISOString(),
    };

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated");

    const existing = await fetchQuotationByTenderId(supabase, id);
    if (existing) {
      const { error: updateErr } = await supabase
        .from("quotations")
        .update(payload)
        .eq("tender_id", parseInt(id));
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase.from("quotations").insert([
        { tender_id: parseInt(id), ...payload, user_id: user.id },
      ]);
      if (insertErr) throw insertErr;
    }

    const snapshot = {
      ...quotation,
      quotation_number: displayQuotationNumber,
      base_quotation_no: newBase,
      version: newVer,
      signature_url: sigUrl,
      pdf_url: pdfUrl,
    };
    setQuotation(snapshot);
    return snapshot;
  };

  const handleSave = async () => {
    if (!quotation || saving) return;
    setSaving(true);
    try {
      await persistQuotation({ revise: false });
      alert("Quotation saved successfully!");
    } catch (e) {
      console.error(e);
      alert(`Save error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRevise = async () => {
    if (!quotation || saving) return;
    const nextVer = (quotation.version || 0) + 1;
    if (
      !window.confirm(
        `Create revision R${nextVer} of this quotation? The quotation number will become ` +
          `${formatQuotationWithRevision(
            (quotation.base_quotation_no || quotation.quotation_number || "")
              .toString()
              .replace(/\/R\d+$/, ""),
            nextVer
          )}.`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const snap = await persistQuotation({ revise: true });
      alert(`Revision saved: ${snap.quotation_number}`);
    } catch (e) {
      console.error(e);
      alert(`Revise error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (templateId) => {
    setSelectedTemplateId(templateId);
    if (templateId) {
      const selected = templates.find((t) => t.id === parseInt(templateId));
      if (selected) {
        setQuotation((p) => ({
          ...p,
          subject: selected.subject || "",
          body: selected.content || "",
        }));
      }
    }
  };

  const applyTerms = (templateId) => {
    setSelectedTermsTemplateId(templateId);
    if (templateId) {
      const selected = termsTemplates.find((t) => t.id === parseInt(templateId));
      if (selected) {
        setQuotation((p) => ({ ...p, terms: selected.content || "" }));
      }
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name.trim()) {
      alert("Template name is required");
      return;
    }

    if (newTemplate.type === "Quotation Template" && !newTemplate.subject.trim()) {
      alert("Subject is required for Quotation Template");
      return;
    }

    if (!newTemplate.content.trim()) {
      alert("Content is required");
      return;
    }

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        alert("User not authenticated");
        return;
      }

      const { error } = await supabase
        .from("quotation_templates")
        .insert({
          name: newTemplate.name,
          type: newTemplate.type,
          subject: newTemplate.subject || null,
          content: newTemplate.content,
          user_id: user.id,
        });

      if (error) throw error;

      alert("✅ Template created successfully!");
      setShowCreateTemplate(false);
      const createdType = newTemplate.type;
      setNewTemplate({ name: "", type: "Quotation Template", subject: "", content: "" });
      
      // Reload templates based on created type (user is already declared above)
      if (user) {
        if (createdType === "Quotation Template") {
          const { data } = await supabase
            .from("quotation_templates")
            .select("*")
            .eq("type", "Quotation Template")
            .or(`user_id.is.null,user_id.eq.${user.id}`)
            .order("name", { ascending: true });
          setTemplates(data || []);
        } else if (createdType === "Terms & Condition") {
          const { data } = await supabase
            .from("quotation_templates")
            .select("*")
            .eq("type", "Terms & Condition")
            .or(`user_id.is.null,user_id.eq.${user.id}`)
            .order("name", { ascending: true });
          setTermsTemplates(data || []);
        }
      }
    } catch (err) {
      console.error("Error creating template:", err);
      alert("Failed to create template: " + (err.message || err));
    }
  };

  const changeField = (field, value) => {
    setQuotation((p) => ({ ...p, [field]: value }));
  };

  const handleSignature = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSignatureFile(file);
      const url = URL.createObjectURL(file);
      setSignatureSrc(url);
    }
  };

  /* --------------------------------------------------------------
     SEND EMAIL - ENHANCED WITH AUTO-FILL AND THREAD TRACKING
  -------------------------------------------------------------- */
  const handleSendEmail = async (overrideQuotation) => {
    try {
      // Use the current quotation state (which has the latest form data)
      const q = overrideQuotation || quotation;
      
      // Ensure we have quotation data
      if (!q) {
        throw new Error("Quotation data not available. Please refresh the page.");
      }
      
      // Always fetch latest data from database to ensure we have the most current values
      // This ensures subject, terms, quotation number, etc. are all up-to-date
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      let latestQ = overrideQuotation || quotation;
      
      // Fetch latest quotation from database to get all current values
      const latestQuotation = await fetchQuotationByTenderId(supabase, id);

      if (latestQuotation) {
        // Merge latest database data with current state - ensure all fields from database
        latestQ = {
          ...latestQ,
          quotation_number: latestQuotation.quotation_number || latestQ.quotation_number || "",
          base_quotation_no: latestQuotation.base_quotation_no || latestQ.base_quotation_no || "",
          version: latestQuotation.version !== undefined ? latestQuotation.version : (latestQ.version || 0),
          subject: latestQuotation.subject || latestQ.subject || "",
          body: latestQuotation.body || latestQ.body || "",
          terms: latestQuotation.terms || latestQ.terms || "",
          signedBy: latestQuotation.signed_by || latestQ.signedBy || "",
          signature_url: latestQuotation.signature_url || latestQ.signature_url || "",
          pdf_url: latestQuotation.pdf_url || latestQ.pdf_url || "",
        };
        
        // Debug: Log what was fetched from database
        console.log("✅ Fetched latest quotation from database:", {
          quotation_number: latestQuotation.quotation_number,
          base_quotation_no: latestQuotation.base_quotation_no,
          version: latestQuotation.version,
          subject: latestQuotation.subject ? latestQuotation.subject.substring(0, 50) + "..." : "EMPTY",
          terms: latestQuotation.terms ? latestQuotation.terms.substring(0, 50) + "..." : "EMPTY",
          signed_by: latestQuotation.signed_by || "EMPTY",
          signature_url: latestQuotation.signature_url ? "EXISTS" : "EMPTY",
        });
      }
      
      // Ensure we have a PDF to send - save first to generate PDF if needed
      if (!latestQ.pdf_url && !overrideQuotation) {
        const snap = await persistQuotation({ revise: false }); // generate PDF + save current data
        latestQ = {
          ...latestQ,
          ...snap,
          signedBy: snap.signedBy || latestQ.signedBy || "",
        };
      }
      
      // Debug: Log the quotation object being used (all data from database)
      console.log("Sending email with quotation data from database:", {
        id: latestQ.id,
        quotation_number: latestQ.quotation_number,
        base_quotation_no: latestQ.base_quotation_no,
        version: latestQ.version,
        subject: latestQ.subject || "EMPTY",
        hasSubject: !!latestQ.subject,
        body: latestQ.body ? latestQ.body.substring(0, 50) + "..." : "EMPTY",
        hasBody: !!latestQ.body,
        terms: latestQ.terms ? latestQ.terms.substring(0, 50) + "..." : "EMPTY",
        hasTerms: !!latestQ.terms,
        signedBy: latestQ.signedBy || "EMPTY",
        hasSignedBy: !!latestQ.signedBy,
        signature_url: latestQ.signature_url || "EMPTY",
        hasSignatureUrl: !!latestQ.signature_url,
        pdf_url: latestQ.pdf_url || "EMPTY",
        hasPdfUrl: !!latestQ.pdf_url,
      });
      
      // Fetch tender email if not already available
      if (!clientEmail) {
        const { data: tenderData, error: tenderError } = await supabase
          .from("tenders")
          .select("email")
          .eq("id", id)
          .single();
          
        if (tenderError) {
          throw new Error("Could not fetch client email from tender");
        }
        
        if (tenderData && tenderData.email) {
          setClientEmail(tenderData.email);
        } else {
          throw new Error("No email found for this tender");
        }
      }
      
      // Use the latest quotation data
      const emailQ = latestQ || q;
      
      // Use quotation subject directly from the quotation form (not from email templates)
      // Include quotation number in subject for proper identification
      const currentRevisionNumber = formatQuotationWithRevision(
        (
          emailQ.base_quotation_no || emailQ.quotation_number || ''
        ).toString().replace(/\/R\d+$/, ''),
        emailQ.version || 0
      );
      
      // Email subject with quotation number
      let subject;
      if (emailQ.subject && emailQ.subject.trim()) {
        // Format: "Quotation [QN/IFSPL/FT/0007/R1] - [Subject]"
        subject = `Quotation ${currentRevisionNumber} - ${emailQ.subject.trim()}`;
      } else {
        // Fallback to default subject with quotation number
        subject = `Quotation ${currentRevisionNumber} - ${emailQ.client || ''}`;
      }
      
      // ============================================================
      // EMAIL BODY - ALL DATA FROM SUPABASE DATABASE
      // Professional format matching the example image
      // Format: Dear Sir, -> Body (from quotations.body) -> 
      //         Part-1: Costing Summary (from approved_quotation_items) -> 
      //         Terms & Conditions (from quotations.terms) -> Regards -> Signature
      // ============================================================
      
      let body = `Dear Sir,\n\n`;
      
      // Body Content (from quotations.body in Supabase - can be updated from templates)
      // This includes the opening statement and company introduction
      if (emailQ.body && emailQ.body.trim()) {
        body += `${emailQ.body.trim()}\n\n`;  // From quotations.body
      }
      
      // Part-1: Costing Summary (from approved_quotation_items table in Supabase)
      // Format: Numbered list with "Qty X, Rate INR Y, Total INR Z"
      // All data comes from approved_quotation_items table filtered by user_id
      const itemsForEmail = Array.isArray(approvedItems) && approvedItems.length > 0
        ? approvedItems  // Data from approved_quotation_items table (fetched in useEffect)
        : (emailQ.items || []);
      
      if (itemsForEmail && itemsForEmail.length > 0) {
        body += `Part-1: Costing Summary:\n`;
        
        // Calculate grand total first
        const grandTotal = itemsForEmail.reduce((sum, item) => {
          const qty = Number(item.qty) || Number(item.quantity) || 1;
          const rate = Number(item.rate) || Number(item.unit_cost) || 0;
          const itemTotal = Number(item.total) || (qty * rate);
          return sum + itemTotal;
        }, 0);
        
        // Format items as numbered list (1., 2., 3., etc.)
        itemsForEmail.forEach((item, index) => {
          const description = item.description || item.component || 'N/A';
          const qty = Number(item.qty) || Number(item.quantity) || 1;
          const rate = Number(item.rate) || Number(item.unit_cost) || 0;
          const itemTotal = Number(item.total) || (qty * rate);
          
          // Format: "1. Description: Qty 1, Rate INR 0, Total INR 33,022"
          const rateFormatted = rate.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
          const totalFormatted = itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
          
          body += `${index + 1}. ${description}: Qty ${qty}, Rate INR ${rateFormatted}, Total INR ${totalFormatted}\n`;
        });
        
        // Grand Total
        const grandTotalFormatted = grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        body += `Grand Total: INR ${grandTotalFormatted}\n\n`;
      }
      
      // Terms and Conditions - MUST use dynamic data from database (quotations.terms)
      // Format: Lettered list (a), b), c), d))
      // This appears BEFORE "Regards," section
      if (emailQ.terms && emailQ.terms.trim()) {
        body += `Terms & Conditions:\n`;
        
        // Use terms from quotations.terms in Supabase (can be updated from templates)
        const termsLines = emailQ.terms.trim().split('\n');
        termsLines.forEach((line) => {
          if (line.trim()) {
            // If line doesn't already start with a letter (a), b), etc.), add one
            // Otherwise, use the line as-is
            const trimmedLine = line.trim();
            if (!trimmedLine.match(/^[a-z]\)\s/)) {
              // Auto-number if not already numbered (this is a fallback)
              // But prefer to use the exact format from database
              body += `${trimmedLine}\n`;  // From quotations.terms
            } else {
              body += `${trimmedLine}\n`;  // From quotations.terms (already formatted)
            }
          }
        });
        body += `\n`;
      } else {
        // Log if terms are empty for debugging
        console.warn("Quotation terms are empty in database (quotations.terms) - not showing in email body");
      }

      // Closing Section (as shown in image)
      body += `Regards,\n\n`;
      
      // Signature by name (from quotations.signed_by in Supabase) - MUST be shown
      if (emailQ.signedBy && emailQ.signedBy.trim()) {
        body += `${emailQ.signedBy.trim()}\n`;  // From quotations.signed_by
      } else {
        body += `Authorized Signatory\n`;  // Default if not in database
      }
      
      // Company name
      body += `Indus Fire Safety Pvt. Ltd.\n`;
      
      // Debug: Log what data is being used in email body
      console.log("Final email body data being sent:", {
        subject: emailQ.subject ? emailQ.subject.substring(0, 50) + "..." : "EMPTY",
        terms: emailQ.terms ? emailQ.terms.substring(0, 50) + "..." : "EMPTY",
        signedBy: emailQ.signedBy || "EMPTY (using default)",
        signature_url: emailQ.signature_url ? "EXISTS" : "EMPTY"
      });
      
      // Track email in database for thread management
      try {
        await supabase.from("quotation_emails").insert({
          tender_id: parseInt(id),
          quotation_number: emailQ.quotation_number,
          recipient_email: clientEmail,
          sender_email: "info@indusfiresafety.com", // Default sender email
          subject: subject,
          body: body,
          pdf_url: emailQ.pdf_url,
          sent_at: new Date().toISOString(),
          version: emailQ.version,
          base_quotation_no: emailQ.base_quotation_no
        });
      } catch (err) {
        console.error("Failed to log email:", err);
        // Continue with email sending even if logging fails
      }
      
      // Automatically download PDF for attachment
      // Generate PDF blob and download it automatically
      try {
        const pdfBlob = await generatePDFBlob();
        
        // Get the full quotation number with revision (as displayed in UI)
        const currentRevisionNumber = formatQuotationWithRevision(
          (
            emailQ.base_quotation_no || emailQ.quotation_number || ''
          ).toString().replace(/\/R\d+$/, ''),
          emailQ.version || 0
        );
        
        // Convert quotation number format to filename format
        // QN/IFSPL/FT/0007/R1 -> Quotation_QN_IFSPL_FT_0007_R1.pdf
        const pdfFileName = `Quotation_${currentRevisionNumber.replace(/\//g, '_')}.pdf`;
        
        // Create download link and trigger download
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = pdfFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Small delay to ensure download starts, then open email client
        setTimeout(() => {
          // Open the user's mail client with subject and body
          const mailto = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          window.open(mailto);
          
          // Show helpful message
          alert(`📧 Email client opened!\n\n📎 PDF "${pdfFileName}" has been automatically downloaded.\n\nPlease attach it to your email from your Downloads folder.`);
        }, 500);
      } catch (pdfError) {
        console.error("Error generating/downloading PDF:", pdfError);
        // Fallback: open email client without PDF download
        const mailto = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailto);
        
        if (emailQ.pdf_url) {
          alert(`📧 Email client opened!\n\n📎 Note: PDF download failed. Please manually download and attach the PDF from:\n${emailQ.pdf_url}`);
        } else {
          alert(`📧 Email client opened!\n\n⚠️ Note: Please generate and attach the PDF manually.`);
        }
      }
      
    } catch (e) {
      console.error("Email error:", e);
      alert("Failed to prepare email: " + e.message);
    }
  };

  // Parse terms into bullets a), b), etc.
  const parseTermsBullets = (terms) => {
    if (!terms) return [];
    const lines = terms.split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.map((line, i) => `${String.fromCharCode(97 + i)}) ${line}`);
  };

  // Build the PDF straight from the on-screen A4 document node, so the exported
  // PDF (and the e-mail attachment) look EXACTLY like the live preview.
  const generatePDFBlob = async () => {
    if (!docRef.current) throw new Error("Quotation preview is not ready yet.");
    return exportNodeToPdfBlob(docRef.current, { marginMm: 10 });
  };

  // Full quotation number with revision, e.g. QN/IFSPL/FT/0007/R1
  const currentDisplayNumber = () =>
    formatQuotationWithRevision(
      (quotation.base_quotation_no || quotation.quotation_number || "")
        .toString()
        .replace(/\/R\d+$/, ""),
      quotation.version || 0
    );

  const pdfFileNameFor = (displayNumber) =>
    `Quotation_${(displayNumber || "quotation").replace(/\//g, "_")}.pdf`;

  const handleDownloadPDF = async () => {
    try {
      const blob = await generatePDFBlob();
      downloadBlob(blob, pdfFileNameFor(currentDisplayNumber()));
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert("Failed to generate PDF. Please check console.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-slate-600">
        <p className="text-sm font-medium">Loading quotation...</p>
      </div>
    );
  }
  if (error || !quotation) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50/80 px-6 py-8 text-center shadow-sm">
          <p className="text-base font-semibold text-red-900">{error ? `Error: ${error}` : "Quotation not found!"}</p>
        </div>
      </div>
    );
  }

  const grandTotal = approvedItems.reduce((sum, item) => sum + parseFloat(item.total || 0), 0);
  const fullAddress = formatTenderAddress(quotation);

  return (
    <div className="w-full min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:p-6">
        <FireTenderNavbar />
        <div className="mx-auto max-w-6xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-slate-200 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                Quotation Details
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Quotation: {quotation.quotation_number}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              <Link
                to={`/app/fire-tender/costing/${id}`}
                title="Open the costing sheet to revise the figures behind this quotation"
                className="px-3 py-2 border border-slate-200 bg-white text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-semibold"
              >
                Revise costing sheet
              </Link>
              <button
                onClick={() => handleSave()}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 text-sm font-semibold"
              >
                {saving ? "Working…" : "Save"}
              </button>
              <button
                onClick={handleRevise}
                disabled={saving}
                title="Save as a new revision (R1, R2, …)"
                className="px-4 py-2 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg hover:bg-amber-100 disabled:opacity-50 text-sm font-semibold"
              >
                Revise (R{(quotation.version || 0) + 1})
              </button>
              <button
                onClick={handleDownloadPDF}
                className="px-4 py-2 border border-slate-200 bg-white text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-semibold"
              >
                Download PDF
              </button>
              <button
                onClick={() => handleSendEmail()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm"
                disabled={!clientEmail}
              >
                Send Email
              </button>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-4 sm:p-6">
            {/* Client Details */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Client Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Client Name</p>
                  <p className="text-sm font-medium text-gray-900">{quotation.client || '-'}</p>
                </div>
                {clientEmail && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Email</p>
                    <p className="text-sm font-medium text-gray-900">{clientEmail}</p>
                  </div>
                )}
                <div className="md:col-span-2">
                  <p className="text-xs text-gray-500 mb-1">Address</p>
                  <p className="text-sm font-medium text-gray-900">{fullAddress || "—"}</p>
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Quotation Template */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Quotation Template
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setNewTemplate({ name: "", type: "Quotation Template", subject: "", content: "" });
                        setShowCreateTemplate(true);
                      }}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                    >
                      + New
                    </button>
                  </div>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => applyTemplate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    disabled={templateLoading}
                  >
                    <option value="">Select Quotation Template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {templateLoading && <p className="text-xs text-gray-500 mt-1">Loading...</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={quotation.subject}
                    onChange={(e) => changeField("subject", e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    placeholder="Enter subject"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Body Text
                  </label>
                  <textarea
                    value={quotation.body}
                    onChange={(e) => changeField("body", e.target.value)}
                    rows={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    placeholder="Enter body text"
                  />
                </div>
              </div>

              {/* Costing Summary Table */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-4">Costing Summary</h3>
                <div className="overflow-x-auto mb-4">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Cost Components</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Qty</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Rate</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedItems.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="px-4 py-8 text-center text-gray-500 border-b">
                            No items found.
                          </td>
                        </tr>
                      ) : (
                        approvedItems.map((item, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{item.description}</td>
                            <td className="px-4 py-3 text-sm text-center">{item.qty}</td>
                            <td className="px-4 py-3 text-sm text-center">
                              INR {Math.round(item.rate).toLocaleString('en-IN')}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              INR {Math.round(item.total).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))
                      )}
                      <tr className="bg-gray-100 font-semibold">
                        <td colSpan="3" className="px-4 py-3 text-right">Grand Total:</td>
                        <td className="px-4 py-3 text-right text-red-700">
                          INR {Math.round(grandTotal).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Terms & Conditions */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-700">Terms & Conditions</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setNewTemplate({ name: "", type: "Terms & Condition", subject: "", content: "" });
                      setShowCreateTemplate(true);
                    }}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                  >
                    + New
                  </button>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Template</label>
                  <select
                    value={selectedTermsTemplateId}
                    onChange={(e) => applyTerms(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    disabled={termsLoading}
                  >
                    <option value="">Select Terms Template</option>
                    {termsTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {termsLoading && <p className="text-xs text-gray-500 mt-1">Loading...</p>}
                </div>
                <textarea
                  value={quotation.terms}
                  onChange={(e) => changeField("terms", e.target.value)}
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  placeholder="Enter terms and conditions"
                />
                <div className="mt-2 text-xs text-gray-500">
                  PDF Bullets Preview: {parseTermsBullets(quotation.terms).join(' | ')}
                </div>
              </div>

              {/* Signature */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-4">Signature</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Signed By
                    </label>
                    <input
                      type="text"
                      value={quotation.signedBy}
                      onChange={(e) => changeField("signedBy", e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                      placeholder="Enter name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Signature Image
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSignature}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                    {signatureSrc && (
                      <img src={signatureSrc} alt="Signature" className="mt-2 h-16 w-32 object-contain border rounded" />
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <Link
                  to="/app/fire-tender/costing-hub/quotation"
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 font-semibold"
                >
                  {saving ? "Working…" : "Save"}
                </button>
              </div>
            </form>

            {/* Live A4 preview — this is exactly what gets exported to PDF and attached to e-mail */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">
                  Quotation preview (exact PDF &amp; e-mail layout)
                </h3>
                <span className="text-xs text-slate-500">{currentDisplayNumber()}</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-4">
                <div className="shadow-lg">
                  <QuotationDocument
                    ref={docRef}
                    quotation={quotation}
                    items={approvedItems}
                    logoSrc={logoBase64}
                    signatureSrc={signatureBase64}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Template Modal */}
      {showCreateTemplate && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Create New Template</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
              <input
                type="text"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Enter template name"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Template Type</label>
              <select
                value={newTemplate.type}
                onChange={(e) => setNewTemplate({ ...newTemplate, type: e.target.value, subject: "", content: "" })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="Quotation Template">Quotation Template</option>
                <option value="Terms & Condition">Terms & Condition</option>
              </select>
            </div>

            {newTemplate.type === "Quotation Template" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={newTemplate.subject}
                  onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Enter subject"
                />
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {newTemplate.type === "Quotation Template" ? "Body Content" : 
                 "Terms & Conditions"}
              </label>
              <textarea
                value={newTemplate.content}
                onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                rows={10}
                placeholder="Enter content"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateTemplate(false);
                  setNewTemplate({ name: "", type: "Quotation Template", subject: "", content: "" });
                }}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTemplate}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Create Template
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default QuotationDetail;