
import React, { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import { INDUS_LOGO_SRC } from "../../constants/branding.js";

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

        /* ---- 1. Approved tender IDs (to generate quotation number) for current user ---- */
        const { data: approvedIds, error: idsErr } = await supabase
          .from("approved_quotation_items")
          .select("tender_id")
          .eq("include", true)
          .eq("user_id", user.id);
        if (idsErr) throw idsErr;
        const approvedTenderIds = [...new Set(approvedIds.map((i) => i.tender_id))].sort(
          (a, b) => a - b
        );

        /* ---- 2. Tender (client details + email) ---- */
        const { data: tender, error: tenderErr } = await supabase
          .from("tenders")
          .select(
            "id, tender_number, client, street, street2, city, state, zip, country, created_at, email"
          )
          .eq("id", id)
          .single();
        if (tenderErr) throw tenderErr;
        setClientEmail(tender.email || "");

        /* ---- 3. Approved items for current user ---- */
        const { data: approved, error: approvedErr } = await supabase
          .from("approved_quotation_items")
          .select("*")
          .eq("tender_id", id)
          .eq("include", true)
          .eq("user_id", user.id)
          .order("component", { ascending: true });
        if (approvedErr) throw approvedErr;

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
          quotationNumber = generateQuotationNumber(idx);
        }

        /* ---- 5. Existing saved quotation (if any) for current user ---- */
        const { data: savedQuotation, error: savedErr } = await supabase
          .from("quotations")
          .select("*")
          .eq("tender_id", id)
          .eq("user_id", user.id)
          .single();

        if (savedErr && savedErr.code !== "PGRST116") console.error(savedErr);

        const baseNo = savedQuotation?.base_quotation_no || quotationNumber;
        const version = savedQuotation?.version || 0;

        let initialQuotation = {
          id: tender.id,
          quotation_number: quotationNumber,
          base_quotation_no: baseNo,
          version,
          client: tender.client || "Unknown",
          street: tender.street || "",
          street2: tender.street2 || "",
          city: tender.city || "",
          zip: tender.zip || "",
          country: tender.country || "",
          date: new Date(tender.created_at || Date.now()).toLocaleDateString('en-GB'), // DD/MM/YYYY
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
            date: savedQuotation.date || new Date(tender.created_at || Date.now()).toLocaleDateString('en-GB'),
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
  const handleSave = async () => {
    if (!quotation || saving) return;
    setSaving(true);
    try {
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
      // First save: set base_quotation_no to the original quotation number (clean of any revision)
      // Subsequent saves: increment version number only
      let newBase = (
        quotation.base_quotation_no || quotation.quotation_number || ''
      ).toString().replace(/\/R\d+$/, '');
      let newVer = quotation.version;
      
      if (quotation.pdf_url) {
        // We already have a saved PDF, treat as revision
        newVer += 1;
      }
      
      // Format the display quotation number with revision (QN/IFSPL/FT/0002/R3)
      const displayQuotationNumber = formatQuotationWithRevision(newBase, newVer);
      
      // ---- PDF generation & upload ----
      const pdfBlob = await generatePDFBlob();
      
      // Include revision number in filename for better tracking
      // Use the NEW version (after incrementing if needed) to match what's displayed
      // Convert quotation number format to filename format for storage
      // QN/IFSPL/FT/0007/R1 -> quotations/Quotation_QN_IFSPL_FT_0007_R1.pdf
      const pdfName = `quotations/Quotation_${displayQuotationNumber.replace(/\//g, '_')}.pdf`;
      pdfUrl = await uploadFile("quotations", pdfName, pdfBlob);

      // ---- persist changes (update-first, insert-fallback) ----
      const payload = {
        quotation_number: displayQuotationNumber,
        base_quotation_no: newBase,
        version: newVer,
        subject: quotation.subject,
        body: quotation.body,
        terms: quotation.terms,
        signed_by: quotation.signedBy, // map UI field to DB column
        signature_url: sigUrl,
        pdf_url: pdfUrl,
        client: quotation.client,
        updated_at: new Date().toISOString(),
      };

      // Get current user for user_id
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("User not authenticated");
      }

      // Try update by tender_id and user_id
      const { data: updatedRows, error: updateErr } = await supabase
        .from("quotations")
        .update({ ...payload, user_id: user.id })
        .eq("tender_id", parseInt(id))
        .eq("user_id", user.id)
        .select();
      if (updateErr) throw updateErr;

      // If no existing row, insert new with user_id
      if (!updatedRows || updatedRows.length === 0) {
        const { error: insertErr } = await supabase
          .from("quotations")
          .insert([{ tender_id: parseInt(id), ...payload, user_id: user.id }]);
        if (insertErr) throw insertErr;
      }

      setQuotation((p) => ({
        ...p,
        quotation_number: displayQuotationNumber,
        base_quotation_no: newBase,
        version: newVer,
        signature_url: sigUrl,
        pdf_url: pdfUrl,
      }));
      
      // Show revision information in alert
      if (newVer > 0) {
        alert(`Quotation saved successfully! ${displayQuotationNumber}`);
      } else {
        alert("Quotation saved successfully!");
      }

      // Auto-compose email with the latest saved data and open mail client
      await handleSendEmail({
        ...quotation,
        quotation_number: displayQuotationNumber,
        base_quotation_no: newBase,
        version: newVer,
        signature_url: sigUrl,
        pdf_url: pdfUrl,
      });
    } catch (e) {
      console.error(e);
      alert(`Save error: ${e.message}`);
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
      const { data: latestQuotation, error: fetchErr } = await supabase
        .from("quotations")
        .select("*")
        .eq("tender_id", id)
        .eq("user_id", user.id)
        .single();
      
      if (!fetchErr && latestQuotation) {
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
      } else if (fetchErr && fetchErr.code !== "PGRST116") {
        // PGRST116 means no rows found, which is okay for new quotations
        console.warn("⚠️ Could not fetch latest quotation from database, using current state:", fetchErr);
      }
      
      // Ensure we have a PDF to send - save first to generate PDF if needed
      if (!latestQ.pdf_url && !overrideQuotation) {
        await handleSave(); // Save first to generate PDF and ensure latest data is saved
        // After save, fetch again to get the updated PDF URL and all fields
        const { data: savedQuotation } = await supabase
          .from("quotations")
          .select("*")
          .eq("tender_id", id)
          .eq("user_id", user.id)
          .single();
        
        if (savedQuotation) {
          latestQ = {
            ...latestQ,
            ...savedQuotation,
            signedBy: savedQuotation.signed_by || latestQ.signedBy || "",
          };
        }
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

  // Add page numbers to PDF
  const addPageNumbers = (doc) => {
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(
        `Page ${i} of ${pageCount}`,
        doc.internal.pageSize.width - 30,
        doc.internal.pageSize.height - 10
      );
    }
  };

  // Check if we need a new page based on current Y position
  const checkNewPage = (doc, yPos, minSpace = 20) => {
    if (yPos > doc.internal.pageSize.height - minSpace) {
      doc.addPage();
      return 20; // Reset Y position to top of new page with margin
    }
    return yPos;
  };

  // Improved justified text function
  const justifyText = (doc, text, x, y, maxWidth, lineHeight) => {
    if (!text) return y;
    
    const words = text.replace(/\s+/g, ' ').trim().split(' ');
    let line = '';
    let currentY = y;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = line + word + ' ';
      const testWidth = doc.getTextWidth(testLine);
      
      if (testWidth > maxWidth && line !== '') {
        // Calculate spacing for justified text
        const spaceWidth = (maxWidth - doc.getTextWidth(line.trim())) / (line.split(' ').length - 1);
        
        // Split the line into words
        const lineWords = line.trim().split(' ');
        let xPos = x;
        
        // Position each word with calculated spacing
        for (let j = 0; j < lineWords.length; j++) {
          doc.text(lineWords[j], xPos, currentY);
          xPos += doc.getTextWidth(lineWords[j]) + spaceWidth;
        }
        
        line = word + ' ';
        currentY += lineHeight;
        
        // Check if we need a new page
        currentY = checkNewPage(doc, currentY, lineHeight + 5);
      } else {
        line = testLine;
      }
    }
    
    // Handle the last line (not justified, left-aligned)
    if (line.trim()) {
      doc.text(line.trim(), x, currentY);
      currentY += lineHeight;
    }
    
    return currentY;
  };

  const generatePDFBlob = async () => {
    const logoBase64 = await getBase64Image(INDUS_LOGO_SRC);
    let signatureBase64 = null;
    if (signatureSrc) signatureBase64 = await getBase64Image(signatureSrc);

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // --- Logo ---
    doc.addImage(logoBase64, "PNG", 155, 5, 35, 35);
    let yPos = 15;

    // --- Ref No. & Date ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`Ref. No.: ${quotation.base_quotation_no || quotation.quotation_number}`, 20, yPos);
    yPos += 3.5;
    doc.text(`Date: ${quotation.date}`, 20, yPos);
    yPos += 10;

    // --- To Address ---
    doc.setFontSize(10);
    doc.text("To,", 20, yPos);
    yPos += 4;
    
    // Client name with proper formatting
    if (quotation.client) {
      doc.setFont("helvetica", "bold");
      doc.text(quotation.client, 20, yPos);
      doc.setFont("helvetica", "normal");
      yPos += 3.5;
    }

    // Format address with proper spacing and alignment
    const addrParts = [
      quotation.street,
      quotation.street2,
      [quotation.city, quotation.state, quotation.zip].filter(Boolean).join(", "),
      quotation.country,
    ].filter(Boolean);

    addrParts.forEach((part) => {
      doc.text(part, 20, yPos);
      yPos += 3.5;
    });
    yPos += 6;

    // --- Subject ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const subjectWidth = 160;
    doc.text(`Subject: ${quotation.subject}`, 20, yPos);
    yPos += 6;
    doc.setFont("helvetica", "normal");

    // --- Greeting ---
    doc.setFontSize(10);
    doc.text("Dear Sir/Madam,", 20, yPos);
    yPos += 7;

    // --- Body ---
    doc.setFontSize(9);
    const bodyWidth = 160;
    yPos = justifyText(doc, quotation.body, 20, yPos, bodyWidth, 3.5);
    yPos += 4;
    yPos = checkNewPage(doc, yPos);
  

    // --- Part 1: Commercial Offer ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Part-1: Commercial offer", 20, yPos);
    doc.setFont("helvetica", "normal");
    yPos += 7;

    const formatNum = (num) =>
      `INR ${Math.round(num).toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}`;

    const tableData = approvedItems.map((item) => [
      item.description,
      item.qty.toString(),
      formatNum(item.rate),
      formatNum(item.total),
    ]);

    const grandTotal = approvedItems.reduce(
      (sum, item) => sum + parseFloat(item.total || 0),
      0
    );
    tableData.push(["Grand Total", "", "", formatNum(grandTotal)]);

    autoTable(doc, {
      startY: yPos,
      head: [["Cost Components", "Qty", "Rate", "Total Amount"]],
      body: tableData,
      theme: "grid",
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
        lineWidth: 0.1,
        lineColor: [200, 200, 200],
        overflow: "linebreak",
        minCellHeight: 12,
        halign: "left",
        valign: "middle",
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        lineWidth: 0.2,
        lineColor: [41, 128, 185]
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250],
      },
      columnStyles: {
        0: { cellWidth: 85, halign: "left", fontStyle: "normal" },
        1: { cellWidth: 18, halign: "center" },
        2: { cellWidth: 30, halign: "right" },
        3: { cellWidth: 32, halign: "right" },
      },
      pageBreak: "auto",
      rowPageBreak: "avoid",
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [230, 240, 255];
          data.cell.styles.textColor = [0, 0, 0];
          data.cell.styles.halign = "right";
          // Merge cells for grand total row to span qty and rate
          if (data.column.index === 0) {
            data.cell.colSpan = 3;
          } else if (data.column.index < 3) {
            data.cell.rowSpan = 0; // Hide the spanned cells
          }
        }
      },
      didDrawCell: (data) => {
        // Add underline for grand total
        if (data.row.index === tableData.length - 1 && data.column.index === 3) {
          const { x, y, width, height } = data.cell;
          doc.setDrawColor(41, 128, 185);
          doc.setLineWidth(0.5);
          doc.line(x, y + height - 1, x + width, y + height - 1);
        }
      },
      margin: { left: 20, right: 20, top: yPos },
    });

    yPos = doc.lastAutoTable.finalY + 10;
    yPos = checkNewPage(doc, yPos);

    // --- Part 2: Terms & Conditions ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Part-2: Terms & Conditions:", 20, yPos);
    yPos += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    // Split and clean the lines
    const termLines = quotation.terms
      ? quotation.terms.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim() !== "")
      : [];

    // Layout settings - optimized for justified alignment
    const leftMargin = 20;
    const bulletGap = 2;
    const textWidth = 160;
    const lineHeight = 3.5; // Consistent with body
    const sectionSpacing = 1; // Minimal extra space

    termLines.forEach((line) => {
      const cleanLine = line.trim();

      // Detect bullet like a), b), 1., -
      const match = cleanLine.match(/^([•\-\–]|\(?[a-zA-Z0-9]+\)|[0-9]+\.)\s*/);
      let bullet = "";
      let content = cleanLine;

      if (match) {
        bullet = match[1];
        content = cleanLine.substring(match[0].length).trim();
      }

      const bulletX = leftMargin;
      const contentX = bullet ? leftMargin + bulletGap + doc.getTextWidth(bullet) + 2 : leftMargin;
      const contentWidth = textWidth - (contentX - leftMargin);

      // Draw bullet if present
      if (bullet) {
        doc.text(bullet, bulletX, yPos);
      }

      // Justify the content (multi-line if needed)
      if (content) {
        const justifyY = yPos;
        yPos = justifyText(doc, content, contentX, justifyY, contentWidth, lineHeight);
      } else {
        yPos += lineHeight;
      }

      yPos += sectionSpacing;

      // Page overflow check
      yPos = checkNewPage(doc, yPos);
    });

    yPos += 3; // Minimal transition to footer

    doc.text("For Indus Fire Safety Pvt. Ltd.", 20, yPos);
    yPos += 6;

    // --- Signature ---
    if (signatureBase64) {
      doc.addImage(signatureBase64, "PNG", 20, yPos, 40, 15);
    } else {
      doc.setDrawColor(180);
      doc.setLineWidth(0.5);
      doc.rect(20, yPos, 40, 15, "S");
    }
    yPos += 18;

    doc.setFont("helvetica", "bold");
    doc.text(quotation.signedBy || "Authorized Signatory", 20, yPos);
    yPos += 4;
    doc.setFont("helvetica", "normal");
    doc.text("Authorized Signatory", 20, yPos);

    // Add page numbers to all pages
    addPageNumbers(doc);
    
    // Return blob instead of saving
    return doc.output('blob');
  };

  const handleDownloadPDF = async () => {
    try {
      const blob = await generatePDFBlob();
      
      // Get the full quotation number with revision (as displayed in UI)
      const currentRevisionNumber = formatQuotationWithRevision(
        (
          quotation.base_quotation_no || quotation.quotation_number || ''
        ).toString().replace(/\/R\d+$/, ''),
        quotation.version || 0
      );
      
      // Convert quotation number format to filename format
      // QN/IFSPL/FT/0007/R1 -> Quotation_QN_IFSPL_FT_0007_R1.pdf
      const pdfFileName = `Quotation_${currentRevisionNumber.replace(/\//g, '_')}.pdf`;
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert("Failed to generate PDF. Please check console.");
    }
  };

  if (loading) return <div className="flex justify-center items-center h-screen"><p>Loading...</p></div>;
  if (error || !quotation) return <div className="text-center text-red-600 mt-10">{error ? `Error: ${error}` : "Quotation not found!"}</div>;

  const grandTotal = approvedItems.reduce((sum, item) => sum + parseFloat(item.total || 0), 0);
  const fullAddress = `${quotation.street} ${quotation.street2 ? `${quotation.street2}, ` : ""}${quotation.city}, ${quotation.state} ${quotation.zip}, ${quotation.country}`.trim();

  return (
    <div className="w-full min-h-screen bg-gray-50">
      <div className="p-4 sm:p-6">
        <div className="bg-white rounded-lg shadow-xl max-w-5xl mx-auto">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                Quotation Details
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Quotation: {quotation.quotation_number}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-purple-400 text-sm"
              >
                {saving ? "Saving..." : quotation.version > 0 ? "Save & Revise" : "Save"}
              </button>
              <button
                onClick={handleDownloadPDF}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Download PDF
              </button>
              <button
                onClick={handleSendEmail}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
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
                {fullAddress && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">Address</p>
                    <p className="text-sm font-medium text-gray-900">{fullAddress}</p>
                  </div>
                )}
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
                      className="px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                    >
                      + New
                    </button>
                  </div>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => applyTemplate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
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
                        <td className="px-4 py-3 text-right text-purple-600">
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
                    className="px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                  >
                    + New
                  </button>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Template</label>
                  <select
                    value={selectedTermsTemplateId}
                    onChange={(e) => applyTerms(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
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
                  to="/fire-tender/quotation"
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-purple-400"
                >
                  {saving ? "Saving..." : quotation.version > 0 ? "Save & Revise" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Create Template Modal */}
      {showCreateTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Create New Template</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
              <input
                type="text"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter template name"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Template Type</label>
              <select
                value={newTemplate.type}
                onChange={(e) => setNewTemplate({ ...newTemplate, type: e.target.value, subject: "", content: "" })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
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