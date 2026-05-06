import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Mail } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { INDUS_LOGO_SRC } from '../../../constants/branding.js';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';

const InternalQuotationFormModal = ({ 
  isOpen, 
  onClose, 
  quotationId = null,
  onSave 
}) => {
  const [quotation, setQuotation] = useState(null);
  const [client, setClient] = useState(null);
  const [costingData, setCostingData] = useState(null);
  const [costingTableItems, setCostingTableItems] = useState([]);
  const [costingTableHeads, setCostingTableHeads] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [subjectTemplates, setSubjectTemplates] = useState([]);
  const [termsTemplates, setTermsTemplates] = useState([]);
  const [selectedSubjectTemplate, setSelectedSubjectTemplate] = useState('');
  const [selectedTermsTemplate, setSelectedTermsTemplate] = useState('');
  const [loading, setLoading] = useState(false);
  const [signatureSrc, setSignatureSrc] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);
  const [signatureRemoved, setSignatureRemoved] = useState(false);
  const [products, setProducts] = useState([]);
  const signatureInputRef = useRef(null);

  const [formData, setFormData] = useState({
    quotation_number: '',
    subject_title: '',
    subject: '',
    terms_and_conditions: '',
    gst_percentage: 18,
    gst_type: 'IGST',
    signed_by: '',
  });

  /** Get costing cell value with legacy key fallback (final_price -> grand_total_supply_cost_with_gst, etc.) */
  const getCostingValue = (itemId, key) => {
    if (!costingData) return null;
    const v = costingData[`${itemId}_${key}`];
    if (v !== undefined && v !== null && v !== '') return v;
    const legacy = {
      grand_total_supply_cost_with_gst: 'final_price',
      grand_total_supply_cost_excl_gst: 'quotation_rate',
      quotation_rate_per_unit: 'quotation_rate',
    };
    const oldKey = legacy[key];
    if (oldKey) return costingData[`${itemId}_${oldKey}`];
    return null;
  };

  useEffect(() => {
    if (isOpen && quotationId) {
      fetchQuotationDetails(quotationId);
      fetchTemplates();
      fetchProducts();
    } else if (!isOpen) {
      // Reset signature when modal closes
      if (signatureSrc && signatureSrc.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(signatureSrc);
        } catch (e) {
          // Ignore errors
        }
      }
      setSignatureSrc(null);
      setSignatureFile(null);
    }
  }, [isOpen, quotationId]);
  
  // Load signature when quotation data is available
  useEffect(() => {
    const loadSignature = async () => {
      // Only load if we have a signature_path and no current signature (not from file input)
      if (quotation?.signature_path && !signatureFile) {
        try {
          console.log('Loading signature from path:', quotation.signature_path);
          
          // Try downloading directly (most reliable)
          const { data: signatureData, error: downloadError } = await supabase.storage
            .from('quotation-signatures')
            .download(quotation.signature_path);
          
          if (downloadError) {
            console.error('Error downloading signature:', downloadError);
            // Try public URL as fallback
            try {
              const { data: publicUrlData } = supabase.storage
                .from('quotation-signatures')
                .getPublicUrl(quotation.signature_path);
              
              if (publicUrlData?.publicUrl) {
                console.log('Using public URL for signature:', publicUrlData.publicUrl);
                setSignatureSrc(publicUrlData.publicUrl);
              }
            } catch (publicUrlError) {
              console.error('Error getting public URL:', publicUrlError);
            }
          } else if (signatureData) {
            const url = URL.createObjectURL(signatureData);
            console.log('Signature loaded successfully as blob URL');
            setSignatureSrc(url);
          }
        } catch (e) {
          console.error('Signature loading error:', e);
        }
      }
    };
    
    // Small delay to ensure quotation state is set
    const timer = setTimeout(() => {
      loadSignature();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [quotation?.signature_path, signatureFile]);

  const fetchTemplates = async () => {
    try {
      // Fetch templates from marketing_mail_templates table
      const { data: templatesData, error: templatesError } = await supabase
        .from('marketing_mail_templates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (templatesError) {
        console.error('Error fetching templates:', templatesError);
        if (templatesError.message && templatesError.message.includes("marketing_mail_templates") && templatesError.message.includes("schema cache")) {
          console.error("⚠️ Table 'marketing_mail_templates' not found! Please run the SQL migration file.");
        }
        return; // Return early instead of throwing to prevent breaking the form
      }

      const subjectTemps = (templatesData || []).filter(t => 
        t.template_type === 'Subject'
      );
      const termsTemps = (templatesData || []).filter(t => 
        t.template_type === 'Terms & Condition'
      );

      setSubjectTemplates(subjectTemps);
      setTermsTemplates(termsTemps);
      setTemplates(templatesData || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_products')
        .select('id, product_name, product_code, detailed_specifications')
        .eq('is_active', true)
        .order('product_name');
      
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchQuotationDetails = async (id) => {
    try {
      setLoading(true);
      const { data: quotationData, error: quotationError } = await supabase
        .from('marketing_quotations')
        .select(`
          *,
          marketing_clients:client_id (*),
          marketing_enquiries:enquiry_id (id, enquiry_number)
        `)
        .eq('id', id)
        .single();

      if (quotationError) throw quotationError;
      setQuotation(quotationData);
      setClient(quotationData.marketing_clients);

      // Set form data from quotation
      setFormData({
        quotation_number: quotationData.quotation_number || '',
        subject_title: quotationData.subject_title || quotationData.subject || '',
        subject: quotationData.subject || '',
        terms_and_conditions: quotationData.terms_and_conditions || '',
        gst_percentage: quotationData.gst_percentage || 18,
        gst_type: quotationData.gst_type || 'IGST',
        signed_by: quotationData.signed_by || '',
      });
      
      // Debug: Log signature_path if it exists
      console.log('Quotation data loaded:', {
        id: quotationData.id,
        signature_path: quotationData.signature_path,
        signed_by: quotationData.signed_by
      });

      // Fetch costing sheet items
      const { data: costingData, error: costingError } = await supabase
        .from('marketing_costing_sheets')
        .select('*')
        .eq('quotation_id', id)
        .order('item_order', { ascending: true });

      if (costingError) throw costingError;

      // Parse costing_data if available
      if (costingData && costingData.length > 0) {
        const firstSheet = costingData[0];
        if (firstSheet.costing_data) {
          try {
            const parsedData = typeof firstSheet.costing_data === 'string' 
              ? JSON.parse(firstSheet.costing_data) 
              : firstSheet.costing_data;
            
            setCostingData(parsedData);
            if (parsedData.items && Array.isArray(parsedData.items)) {
              setCostingTableItems(parsedData.items);
            }
            if (parsedData.costHeads && Array.isArray(parsedData.costHeads)) {
              setCostingTableHeads(parsedData.costHeads);
            }
          } catch (e) {
            console.error('Error parsing costing data:', e);
          }
        }
      }

      // Signature will be loaded by separate useEffect when quotation is set

      setLoading(false);
    } catch (error) {
      console.error('Error fetching quotation details:', error);
      setLoading(false);
    }
  };

  const handleSubjectTemplateChange = (templateId) => {
    setSelectedSubjectTemplate(templateId);
    const template = subjectTemplates.find(t => t.id === templateId);
    if (template) {
      // For Subject template: subject_title -> subject_title, subject_content -> subject (description)
      setFormData({
        ...formData,
        subject_title: template.subject_title || '',
        subject: template.subject_content || '',
      });
    }
  };

  const handleTermsTemplateChange = (templateId) => {
    setSelectedTermsTemplate(templateId);
    const template = termsTemplates.find(t => t.id === templateId);
    if (template) {
      // For Terms & Condition: terms_and_conditions -> terms_and_conditions
      setFormData({
        ...formData,
        terms_and_conditions: template.terms_and_conditions || '',
      });
    }
  };

  const handleSignatureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSignatureRemoved(false);
      setSignatureFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSignatureSrc(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveSignature = () => {
    // If currently previewing a blob URL, release it
    if (signatureSrc && signatureSrc.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(signatureSrc);
      } catch (e) {
        // ignore
      }
    }
    setSignatureSrc(null);
    setSignatureFile(null);
    setSignatureRemoved(true);
    if (signatureInputRef.current) {
      signatureInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    try {
      if (!quotationId) {
        alert('Please select a quotation');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      // Upload signature if new file selected
      let signaturePath = quotation?.signature_path || null;
      // If user removed the signature and didn't select a new one
      if (signatureRemoved && !signatureFile) {
        if (quotation?.signature_path) {
          try {
            await supabase.storage
              .from('quotation-signatures')
              .remove([quotation.signature_path]);
          } catch (e) {
            console.log('Could not delete signature from storage:', e);
          }
        }
        signaturePath = null;
      }
      if (signatureFile) {
        try {
          const fileExt = signatureFile.name.split('.').pop();
          const fileName = `signatures/${quotationId}_${Date.now()}.${fileExt}`;
          
          console.log('Uploading signature file:', fileName);
          
          // Delete old signature if exists
          if (quotation?.signature_path) {
            try {
              await supabase.storage
                .from('quotation-signatures')
                .remove([quotation.signature_path]);
            } catch (deleteError) {
              console.log('Could not delete old signature:', deleteError);
            }
          }
          
          // Upload new signature
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('quotation-signatures')
            .upload(fileName, signatureFile, { 
              upsert: true,
              cacheControl: '3600',
              contentType: signatureFile.type || `image/${fileExt}`
            });
          
          if (uploadError) {
            console.error('Signature upload error:', uploadError);
            if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('not found')) {
              alert('Storage bucket "quotation-signatures" not found. Please create it in Supabase Dashboard > Storage.');
            } else {
              alert('Error uploading signature: ' + uploadError.message);
            }
            throw uploadError;
          } else {
            signaturePath = fileName;
            console.log('Signature uploaded successfully:', signaturePath);
          }
        } catch (e) {
          console.error('Signature upload failed:', e);
          alert('Failed to upload signature image. Please try again or check storage bucket configuration.');
          // Don't throw - allow save to continue without signature
        }
      }

      // Calculate totals from costing sheet data
      let subtotal = 0;
      let finalAmount = 0;
      
      if (costingData && costingTableItems.length > 0) {
        subtotal = costingTableItems.reduce((sum, item) => {
          const v = parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_excl_gst') || 0);
          return sum + v;
        }, 0);
        finalAmount = costingTableItems.reduce((sum, item) => {
          const v = parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_with_gst') || 0);
          return sum + v;
        }, 0);
      } else {
        subtotal = quotation?.total_amount || 0;
        finalAmount = quotation?.final_amount || 0;
      }
      
      const gstAmount = finalAmount - subtotal;

      // Build update object - only include fields that definitely exist in schema
      // Based on schema: terms_and_conditions, gst_percentage, gst_type, total_amount, gst_amount, final_amount exist
      const updateData = {
        terms_and_conditions: formData.terms_and_conditions,
        gst_percentage: formData.gst_percentage,
        gst_type: formData.gst_type,
        total_amount: subtotal,
        gst_amount: gstAmount,
        final_amount: finalAmount,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };

      // First update with required fields that definitely exist in schema
      const { error: baseError } = await supabase
        .from('marketing_quotations')
        .update(updateData)
        .eq('id', quotationId);

      if (baseError) throw baseError;

      // Then try to update optional fields one by one, handling errors gracefully
      // These fields may not exist in schema: subject, subject_title, signed_by, signature_path
      
      // subject (may not exist in schema)
      if (formData.subject) {
        try {
          const { error: subjectError } = await supabase
            .from('marketing_quotations')
            .update({ subject: formData.subject })
            .eq('id', quotationId);
          
          if (subjectError) {
            console.log('Warning: subject field may not exist in schema:', subjectError);
          }
        } catch (e) {
          console.log('subject update skipped (field may not exist in schema):', e);
        }
      }
      
      // subject_title (may not exist in schema)
      if (formData.subject_title) {
        try {
          const { error: subjectTitleError } = await supabase
            .from('marketing_quotations')
            .update({ subject_title: formData.subject_title })
            .eq('id', quotationId);
          
          if (subjectTitleError) {
            console.log('Warning: subject_title field may not exist in schema:', subjectTitleError);
          }
        } catch (e) {
          console.log('subject_title update skipped (field may not exist in schema):', e);
        }
      }
      
      // signed_by (may not exist in schema)
      if (formData.signed_by) {
        try {
          const { error: signedByError } = await supabase
            .from('marketing_quotations')
            .update({ signed_by: formData.signed_by })
            .eq('id', quotationId);
          
          if (signedByError) {
            console.log('Warning: signed_by field may not exist in schema:', signedByError);
          }
        } catch (e) {
          console.log('signed_by update skipped (field may not exist in schema):', e);
        }
      }
      
      // signature_path (may not exist in schema)
      if (signaturePath || signatureRemoved) {
        try {
          const { error: signaturePathError } = await supabase
            .from('marketing_quotations')
            .update({ signature_path: signaturePath })
            .eq('id', quotationId);
          
          if (signaturePathError) {
            console.error('Error saving signature_path:', signaturePathError);
            alert('Warning: Could not save signature path to database. Image uploaded but path not saved.');
          } else {
            console.log('Signature path saved successfully:', signaturePath);
            // Update local quotation state
            setQuotation(prev => prev ? { ...prev, signature_path: signaturePath } : null);
            setSignatureRemoved(false);
          }
        } catch (e) {
          console.error('signature_path update error:', e);
          alert('Error saving signature path: ' + e.message);
        }
      }

      // Refresh quotation data after save to show updated values
      // This will reload the signature if it was saved
      await fetchQuotationDetails(quotationId);

      if (onSave) {
        onSave();
      }
      
      alert('Internal quotation saved successfully!');
      // Modal stays open so user can continue editing or close manually
    } catch (error) {
      console.error('Error saving internal quotation:', error);
      alert('Error saving internal quotation: ' + error.message);
    }
  };

  const handleClose = () => {
    setQuotation(null);
    setClient(null);
    setCostingData(null);
    setCostingTableItems([]);
    setCostingTableHeads([]);
    setFormData({
      quotation_number: '',
      subject_title: '',
      subject: '',
      terms_and_conditions: '',
      gst_percentage: 18,
      gst_type: 'IGST',
      signed_by: '',
    });
    setSelectedSubjectTemplate('');
    setSelectedTermsTemplate('');
    
    // Clean up blob URLs before clearing state
    if (signatureSrc && signatureSrc.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(signatureSrc);
      } catch (e) {
        // Ignore errors
      }
    }
    
    setSignatureSrc(null);
    setSignatureFile(null);
    setSignatureRemoved(false);
    onClose();
  };

  // Calculate totals for display
  const getCostingTotal = () => {
    if (costingData && costingTableItems.length > 0) {
      return costingTableItems.reduce((sum, item) => {
        const finalPrice = parseFloat(costingData[`${item.id}_final_price`] || 0);
        return sum + finalPrice;
      }, 0);
    }
    return quotation?.final_amount || 0;
  };

  const getNetTotal = () => {
    if (costingData && costingTableItems.length > 0) {
      return costingTableItems.reduce((sum, item) => {
        const quotationRate = parseFloat(costingData[`${item.id}_quotation_rate`] || 0);
        return sum + quotationRate;
      }, 0);
    }
    return quotation?.total_amount || 0;
  };

  const costingTotal = getCostingTotal();
  const netTotal = getNetTotal();
  const gstAmount = costingTotal - netTotal;
  const finalAmount = costingTotal;

  // Get base64 image from logo
  const getBase64Image = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  // PDF layout constants (A4: 210 x 297 mm) - professional spacing, nothing cut
  const PDF_LAYOUT = {
    marginLeft: 20,
    marginRight: 20,
    marginTopFirst: 15,
    marginTopNewPage: 22,
    footerReserve: 18,   // space for page number at bottom
    sectionGap: 5,      // gap between major sections
    lineHeightBody: 4,
    lineHeightTerms: 4,
    termsItemGap: 1.5,
    minSpaceForSection: 45,  // min space before starting Part-2 or footer block
  };

  const checkNewPage = (doc, yPos, minSpace = PDF_LAYOUT.footerReserve) => {
    const pageHeight = doc.internal.pageSize.height;
    if (yPos > pageHeight - minSpace) {
      doc.addPage();
      return PDF_LAYOUT.marginTopNewPage;
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
        
        currentY = checkNewPage(doc, currentY, lineHeight + PDF_LAYOUT.footerReserve);
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

  // Generate PDF matching fire tender quotation design
  const handleDownloadPDF = async () => {
    try {
      if (!quotation || !client) {
        alert('Quotation data not available');
        return;
      }

      const logoBase64 = await getBase64Image(INDUS_LOGO_SRC);
      let signatureBase64 = null;
      if (signatureSrc) {
        try {
          signatureBase64 = await getBase64Image(signatureSrc);
        } catch (e) {
          console.log('Error converting signature to base64:', e);
        }
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const { marginLeft, marginTopFirst, sectionGap, lineHeightBody } = PDF_LAYOUT;

      // --- Logo ---
      doc.addImage(logoBase64, 'PNG', 155, 5, 35, 35);
      let yPos = marginTopFirst;

      // --- Ref No. & Date ---
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`Ref. No.: ${quotation.quotation_number}`, marginLeft, yPos);
      yPos += 4;
      const currentDate = new Date(quotation.quotation_date || new Date()).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      doc.text(`Date: ${currentDate}`, marginLeft, yPos);
      yPos += sectionGap + 4;

      // --- To Address ---
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('To,', marginLeft, yPos);
      yPos += 4;
      if (client.client_name) {
        doc.setFont('helvetica', 'bold');
        doc.text(client.client_name, marginLeft, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 4;
      }
      const addrParts = [
        client.street,
        client.street2,
        [client.city, client.state, client.zip].filter(Boolean).join(', '),
        client.country,
      ].filter(Boolean);
      addrParts.forEach((part) => {
        doc.text(part, marginLeft, yPos);
        yPos += 4;
      });
      yPos += sectionGap;

      // --- Subject ---
      if (formData.subject_title) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`Subject: ${formData.subject_title}`, marginLeft, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += sectionGap;
      }

      // --- Greeting ---
      doc.setFontSize(10);
      doc.text('Dear Sir,', marginLeft, yPos);
      yPos += sectionGap;

      // --- Body (Subject description) ---
      if (formData.subject) {
        doc.setFontSize(9);
        const bodyWidth = 170;
        yPos = justifyText(doc, formData.subject, marginLeft, yPos, bodyWidth, lineHeightBody);
        yPos += sectionGap;
        yPos = checkNewPage(doc, yPos, PDF_LAYOUT.minSpaceForSection);
      }

      // --- Part 1: Commercial Offer ---
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Part-1: Commercial offer', marginLeft, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += sectionGap;

      const formatNum = (num) => {
        const formatted = parseFloat(num || 0).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        // Use "Rs." prefix - jsPDF default font doesn't support ₹ symbol
        return `Rs. ${formatted}`;
      };

      // Prepare table data: Item Name, Specification, Quotation Rate Per Unit, Grand Total (Excl GST), GST %, GST Amount, Grand Total With GST
      const tableData = [];
      const pdfHeaders = ['Item Name', 'Specification', 'Quotation Rate Per Unit', 'Grand Total (Excl GST)', 'GST %', 'GST Amount', 'Grand Total With GST'];
      if (costingTableItems.length > 0 && costingData) {
        costingTableItems.forEach((item, index) => {
          const itemName = item.productName || item.name || `Item ${index + 1}`;
          const specification = item.productId
            ? (item.specification || getProductSpecification(item.productId) || '-')
            : '-';
          const quotationRatePerUnit = parseFloat(getCostingValue(item.id, 'quotation_rate_per_unit') || 0);
          const grandExclGst = parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_excl_gst') || 0);
          const gstPct = getCostingValue(item.id, 'gst_pct');
          const gstAmount = parseFloat(getCostingValue(item.id, 'gst_amount') || 0);
          const grandWithGst = parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_with_gst') || 0);
          tableData.push([
            itemName,
            specification,
            formatNum(quotationRatePerUnit),
            formatNum(grandExclGst),
            gstPct != null && gstPct !== '' ? String(parseFloat(gstPct)) : '-',
            formatNum(gstAmount),
            formatNum(grandWithGst),
          ]);
        });
      } else {
        tableData.push(['Total Amount', '-', formatNum(finalAmount), formatNum(finalAmount), '-', '-', formatNum(finalAmount)]);
      }

      const grandExclGstTotal = costingTableItems.length > 0 && costingData
        ? costingTableItems.reduce((s, item) => s + parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_excl_gst') || 0), 0)
        : finalAmount;
      const gstAmountTotal = costingTableItems.length > 0 && costingData
        ? costingTableItems.reduce((s, item) => s + parseFloat(getCostingValue(item.id, 'gst_amount') || 0), 0)
        : 0;
      const grandWithGstTotal = costingTableItems.length > 0 && costingData
        ? costingTableItems.reduce((s, item) => s + parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_with_gst') || 0), 0)
        : finalAmount;
      tableData.push(['', 'Grand Total', '', formatNum(grandExclGstTotal), '', formatNum(gstAmountTotal), formatNum(grandWithGstTotal)]);

      const drawPageHeader = (doc, pageNumber) => {
        doc.addImage(logoBase64, 'PNG', 155, 5, 35, 35);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(`Ref. No.: ${quotation.quotation_number}`, marginLeft, 15);
        doc.text(`Date: ${currentDate}`, marginLeft, 19);
      };

      const firstPageStartY = yPos;
      const tableBottomMargin = PDF_LAYOUT.footerReserve + 8;

      autoTable(doc, {
        startY: firstPageStartY,
        head: [pdfHeaders],
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          lineWidth: 0.1,
          lineColor: [200, 200, 200],
          overflow: 'linebreak',
          minCellHeight: 8,
          halign: 'left',
          valign: 'top',
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 7.5,
          cellPadding: 2,
        },
        alternateRowStyles: {
          fillColor: [248, 249, 250],
        },
        columnStyles: {
          0: { cellWidth: 32, halign: 'left', valign: 'top' },
          1: { cellWidth: 38, halign: 'left', valign: 'top' },
          2: { cellWidth: 22, halign: 'right', valign: 'top' },
          3: { cellWidth: 22, halign: 'right', valign: 'top' },
          4: { cellWidth: 12, halign: 'right', valign: 'top' },
          5: { cellWidth: 20, halign: 'right', valign: 'top' },
          6: { cellWidth: 24, halign: 'right', valign: 'top' },
        },
        pageBreak: 'auto',
        rowPageBreak: 'avoid',
        showHead: 'everyPage',
        margin: { left: marginLeft, right: PDF_LAYOUT.marginRight, top: firstPageStartY, bottom: tableBottomMargin },
        didParsePage: (data) => {
          if (data.pageNumber > 1) {
            data.settings.startY = PDF_LAYOUT.marginTopNewPage;
            data.settings.margin.top = 0;
            data.settings.margin.bottom = tableBottomMargin;
          }
        },
        willDrawPage: (data) => {
          drawPageHeader(doc, data.pageNumber);
          if (data.pageNumber > 1 && data.table?.settings) {
            data.table.settings.startY = PDF_LAYOUT.marginTopNewPage;
            data.table.settings.margin.top = 0;
          }
        },
        didParseCell: (data) => {
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [230, 240, 255];
            data.cell.styles.textColor = [0, 0, 0];
            if (data.column.index === 1) data.cell.styles.halign = 'right';
          }
        },
      });

      yPos = doc.lastAutoTable.finalY + sectionGap;
      yPos = checkNewPage(doc, yPos, PDF_LAYOUT.minSpaceForSection);

      // --- Part 2: Terms & Conditions ---
      yPos = checkNewPage(doc, yPos, PDF_LAYOUT.minSpaceForSection);
      yPos += 2;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Part-2: Terms & Conditions:', marginLeft, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += sectionGap;

      doc.setFontSize(9);
      const termLines = formData.terms_and_conditions
        ? formData.terms_and_conditions.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim() !== '')
        : [];

      const textWidth = 170;
      const lineHeightTerms = PDF_LAYOUT.lineHeightTerms;
      const termsItemGap = PDF_LAYOUT.termsItemGap;

      termLines.forEach((line) => {
        const cleanLine = line.trim();
        const match = cleanLine.match(/^([•\-\–]|\(?[a-zA-Z0-9]+\)|[0-9]+\.)\s*/);
        let bullet = '';
        let content = cleanLine;
        if (match) {
          bullet = match[1];
          content = cleanLine.substring(match[0].length).trim();
        }
        const contentX = bullet ? marginLeft + 2 + doc.getTextWidth(bullet) + 2 : marginLeft;
        const contentW = textWidth - (contentX - marginLeft);

        if (bullet) doc.text(bullet, marginLeft, yPos);
        if (content) {
          const startY = yPos;
          yPos = justifyText(doc, content, contentX, startY, contentW, lineHeightTerms);
        } else {
          yPos += lineHeightTerms;
        }
        yPos += termsItemGap;
        yPos = checkNewPage(doc, yPos, lineHeightTerms + 12);
      });

      yPos = checkNewPage(doc, yPos, 32);
      yPos += sectionGap;

      doc.text('For Indus Fire Safety Pvt. Ltd.', marginLeft, yPos);
      yPos += 5;

      // --- Signature ---
      if (signatureBase64) {
        doc.addImage(signatureBase64, 'PNG', marginLeft, yPos, 40, 15);
      }
      yPos += 18;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(formData.signed_by || 'Authorized Signatory', marginLeft, yPos);
      yPos += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Authorized Signatory', marginLeft, yPos);

      addPageNumbers(doc);

      // Download PDF
      const fileName = `${quotation.quotation_number.replace(/\//g, '_')}.pdf`;
      doc.save(fileName);

      // Upload to storage
      try {
        const pdfBlob = doc.output('blob');
        const filePath = `quotations/${quotation.id}/${fileName}`;
        await supabase.storage
          .from('marketing-documents')
          .upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

        await supabase
          .from('marketing_quotations')
          .update({ pdf_path: filePath })
          .eq('id', quotation.id);
      } catch (uploadError) {
        console.log('Error uploading PDF:', uploadError);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF: ' + error.message);
    }
  };

  // Get product specification helper
  const getProductSpecification = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product || !product.detailed_specifications) return '';
    // Get specification without additional info
    const parts = product.detailed_specifications.split('Additional Info:');
    return parts[0].trim();
  };

  // Send Email with all quotation data - matching PDF format
  const handleSendEmail = async () => {
    try {
      if (!quotation || !client) {
        alert('Quotation data not available');
        return;
      }

      if (!client.contact_email) {
        alert('Client email not available');
        return;
      }

      // Generate PDF first
      const pdfBlob = await generatePDFBlob();
      const fileName = `${quotation.quotation_number.replace(/\//g, '_')}.pdf`;

      // Create email subject with quotation number
      const subject = formData.subject_title 
        ? `Quotation ${quotation.quotation_number} - ${formData.subject_title}`
        : `Quotation ${quotation.quotation_number}`;

      // Create email body matching PDF format
      let body = `Dear Sir,\n\n`;
      
      // Body Content (Subject/Opening Statement)
      if (formData.subject && formData.subject.trim()) {
        body += `${formData.subject.trim()}\n\n`;
      }

      // Part-1: Commercial Offer (Costing Summary) - Table format
      body += `Part-1: Commercial offer:\n\n`;
      
      // Calculate grand total first
      const grandTotal = costingTableItems.length > 0 && costingData
        ? costingTableItems.reduce((sum, item) => {
            const finalPrice = parseFloat(costingData[`${item.id}_final_price`] || 0);
            return sum + finalPrice;
          }, 0)
        : finalAmount;

      // Table header
      body += `Sr. No.\tItem Name\tSpecification\tRate\tTotal Amount\n`;
      body += `─────────────────────────────────────────────────────────────────────────────────────────\n`;

      // Format items in table format
      if (costingTableItems.length > 0 && costingData) {
        costingTableItems.forEach((item, index) => {
          const finalPrice = parseFloat(costingData[`${item.id}_final_price`] || 0);
          const itemName = item.name || item.productName || `Item ${index + 1}`;
          const specification = item.productId
            ? (item.specification || getProductSpecification(item.productId) || '-')
            : '-';
          
          // Format with tabs for table alignment
          const rateFormatted = `₹${finalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const totalFormatted = `₹${finalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          
          body += `${index + 1}\t${itemName}\t${specification}\t${rateFormatted}\t${totalFormatted}\n`;
        });
      } else {
        // Fallback
        const rateFormatted = `₹${finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const totalFormatted = `₹${finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        body += `1\tTotal Amount\t-\t${rateFormatted}\t${totalFormatted}\n`;
      }
      
      // Total row
      body += `─────────────────────────────────────────────────────────────────────────────────────────\n`;
      const grandTotalFormatted = `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      body += `\tTotal Amount\t\t\t${grandTotalFormatted}\n\n`;

      // Terms and Conditions - Format: Lettered list (a), b), c), d))
      if (formData.terms_and_conditions && formData.terms_and_conditions.trim()) {
        body += `Terms & Conditions:\n`;
        
        // Use terms from formData (can be updated from templates)
        const termsLines = formData.terms_and_conditions.trim().split('\n');
        termsLines.forEach((line) => {
          if (line.trim()) {
            // Use the line as-is (should already be formatted with a), b), etc.)
            const trimmedLine = line.trim();
            body += `${trimmedLine}\n`;
          }
        });
        body += `\n`;
      }

      // Closing Section
      body += `Regards,\n\n`;
      
      // Signature by name
      if (formData.signed_by && formData.signed_by.trim()) {
        body += `${formData.signed_by.trim()}\n`;
      } else {
        body += `Authorized Signatory\n`;
      }
      
      // Company name
      body += `Indus Fire Safety Pvt. Ltd.\n`;

      // Download PDF first
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Open email client after a short delay
      setTimeout(() => {
        const mailto = `mailto:${encodeURIComponent(client.contact_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailto);
        
        alert(`📧 Email client opened!\n\n📎 PDF "${fileName}" has been automatically downloaded.\n\nPlease attach it to your email from your Downloads folder.`);
      }, 500);
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Error sending email: ' + error.message);
    }
  };

  // Generate PDF blob (same as download but returns blob)
  const generatePDFBlob = async () => {
    const logoBase64 = await getBase64Image(INDUS_LOGO_SRC);
    let signatureBase64 = null;
    if (signatureSrc) {
      try {
        signatureBase64 = await getBase64Image(signatureSrc);
      } catch (e) {
        console.log('Error converting signature to base64:', e);
      }
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const { marginLeft, marginTopFirst, sectionGap, lineHeightBody } = PDF_LAYOUT;

    doc.addImage(logoBase64, 'PNG', 155, 5, 35, 35);
    let yPos = marginTopFirst;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`Ref. No.: ${quotation.quotation_number}`, marginLeft, yPos);
    yPos += 4;
    const currentDate = new Date(quotation.quotation_date || new Date()).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    doc.text(`Date: ${currentDate}`, marginLeft, yPos);
    yPos += sectionGap + 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('To,', marginLeft, yPos);
    yPos += 4;
    if (client.client_name) {
      doc.setFont('helvetica', 'bold');
      doc.text(client.client_name, marginLeft, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 4;
    }
    const addrParts = [
      client.street,
      client.street2,
      [client.city, client.state, client.zip].filter(Boolean).join(', '),
      client.country,
    ].filter(Boolean);
    addrParts.forEach((part) => {
      doc.text(part, marginLeft, yPos);
      yPos += 4;
    });
    yPos += sectionGap;

    if (formData.subject_title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`Subject: ${formData.subject_title}`, marginLeft, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += sectionGap;
    }
    doc.setFontSize(10);
    doc.text('Dear Sir,', marginLeft, yPos);
    yPos += sectionGap;

    if (formData.subject) {
      doc.setFontSize(9);
      const bodyWidth = 170;
      yPos = justifyText(doc, formData.subject, marginLeft, yPos, bodyWidth, lineHeightBody);
      yPos += sectionGap;
      yPos = checkNewPage(doc, yPos, PDF_LAYOUT.minSpaceForSection);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Part-1: Commercial offer', marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += sectionGap;

    const formatNum = (num) =>
      `₹${parseFloat(num || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

    // Prepare table data: Item Name, Specification, Quotation Rate Per Unit, Grand Total (Excl GST), GST %, GST Amount, Grand Total With GST
    const tableData = [];
    const pdfHeaders = ['Item Name', 'Specification', 'Quotation Rate Per Unit', 'Grand Total (Excl GST)', 'GST %', 'GST Amount', 'Grand Total With GST'];
    if (costingTableItems.length > 0 && costingData) {
      costingTableItems.forEach((item, index) => {
        const itemName = item.productName || item.name || `Item ${index + 1}`;
        const specification = item.productId
          ? (item.specification || getProductSpecification(item.productId) || '-')
          : '-';
        const quotationRatePerUnit = parseFloat(getCostingValue(item.id, 'quotation_rate_per_unit') || 0);
        const grandExclGst = parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_excl_gst') || 0);
        const gstPct = getCostingValue(item.id, 'gst_pct');
        const gstAmount = parseFloat(getCostingValue(item.id, 'gst_amount') || 0);
        const grandWithGst = parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_with_gst') || 0);
        tableData.push([
          itemName,
          specification,
          formatNum(quotationRatePerUnit),
          formatNum(grandExclGst),
          gstPct != null && gstPct !== '' ? String(parseFloat(gstPct)) : '-',
          formatNum(gstAmount),
          formatNum(grandWithGst),
        ]);
      });
    } else {
      tableData.push(['Total Amount', '-', formatNum(finalAmount), formatNum(finalAmount), '-', '-', formatNum(finalAmount)]);
    }

    const grandExclGstTotal = costingTableItems.length > 0 && costingData
      ? costingTableItems.reduce((s, item) => s + parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_excl_gst') || 0), 0)
      : finalAmount;
    const gstAmountTotal = costingTableItems.length > 0 && costingData
      ? costingTableItems.reduce((s, item) => s + parseFloat(getCostingValue(item.id, 'gst_amount') || 0), 0)
      : 0;
    const grandWithGstTotal = costingTableItems.length > 0 && costingData
      ? costingTableItems.reduce((s, item) => s + parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_with_gst') || 0), 0)
      : finalAmount;
    tableData.push(['', 'Grand Total', '', formatNum(grandExclGstTotal), '', formatNum(gstAmountTotal), formatNum(grandWithGstTotal)]);

    // Function to draw header on each page (reuse currentDate already defined above)
    const drawPageHeader = (doc, pageNumber) => {
      // Draw logo
      doc.addImage(logoBase64, 'PNG', 155, 5, 35, 35);
      
      // Draw Ref No. and Date (reuse currentDate variable)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`Ref. No.: ${quotation.quotation_number}`, 20, 15);
      doc.text(`Date: ${currentDate}`, 20, 18.5);
    };

    // Store the initial startY for first page
    const firstPageStartY = yPos;
    const tableBottomMargin = PDF_LAYOUT.footerReserve + 8;

    autoTable(doc, {
      startY: firstPageStartY,
      head: [pdfHeaders],
      body: tableData,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        lineWidth: 0.1,
        lineColor: [200, 200, 200],
        overflow: 'linebreak',
        minCellHeight: 8,
        halign: 'left',
        valign: 'top',
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 7.5,
        cellPadding: 2,
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250],
      },
      columnStyles: {
        0: { cellWidth: 32, halign: 'left', valign: 'top' },
        1: { cellWidth: 38, halign: 'left', valign: 'top' },
        2: { cellWidth: 22, halign: 'right', valign: 'top' },
        3: { cellWidth: 22, halign: 'right', valign: 'top' },
        4: { cellWidth: 12, halign: 'right', valign: 'top' },
        5: { cellWidth: 20, halign: 'right', valign: 'top' },
        6: { cellWidth: 24, halign: 'right', valign: 'top' },
      },
      pageBreak: 'auto',
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      margin: { left: marginLeft, right: PDF_LAYOUT.marginRight, top: firstPageStartY, bottom: tableBottomMargin },
      didParsePage: (data) => {
        if (data.pageNumber > 1) {
          data.settings.startY = PDF_LAYOUT.marginTopNewPage;
          data.settings.margin.top = 0;
          data.settings.margin.bottom = tableBottomMargin;
        }
      },
      willDrawPage: (data) => {
        drawPageHeader(doc, data.pageNumber);
        if (data.pageNumber > 1 && data.table?.settings) {
          data.table.settings.startY = PDF_LAYOUT.marginTopNewPage;
          data.table.settings.margin.top = 0;
        }
      },
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [230, 240, 255];
          data.cell.styles.textColor = [0, 0, 0];
          if (data.column.index === 1) data.cell.styles.halign = 'right';
        }
      },
    });

    yPos = doc.lastAutoTable.finalY + sectionGap;
    yPos = checkNewPage(doc, yPos, PDF_LAYOUT.minSpaceForSection);

    yPos = checkNewPage(doc, yPos, PDF_LAYOUT.minSpaceForSection);
    yPos += 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Part-2: Terms & Conditions:', marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += sectionGap;

    doc.setFontSize(9);
    const termLines = formData.terms_and_conditions
      ? formData.terms_and_conditions.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim() !== '')
      : [];

    const textWidth = 170;
    const lineHeightTerms = PDF_LAYOUT.lineHeightTerms;
    const termsItemGap = PDF_LAYOUT.termsItemGap;

    termLines.forEach((line) => {
      const cleanLine = line.trim();
      const match = cleanLine.match(/^([•\-\–]|\(?[a-zA-Z0-9]+\)|[0-9]+\.)\s*/);
      let bullet = '';
      let content = cleanLine;
      if (match) {
        bullet = match[1];
        content = cleanLine.substring(match[0].length).trim();
      }
      const contentX = bullet ? marginLeft + 2 + doc.getTextWidth(bullet) + 2 : marginLeft;
      const contentW = textWidth - (contentX - marginLeft);

      if (bullet) doc.text(bullet, marginLeft, yPos);
      if (content) {
        const startY = yPos;
        yPos = justifyText(doc, content, contentX, startY, contentW, lineHeightTerms);
      } else {
        yPos += lineHeightTerms;
      }
      yPos += termsItemGap;
      yPos = checkNewPage(doc, yPos, lineHeightTerms + 12);
    });

    yPos = checkNewPage(doc, yPos, 32);
    yPos += sectionGap;

    doc.text('For Indus Fire Safety Pvt. Ltd.', marginLeft, yPos);
    yPos += 5;

    if (signatureBase64) {
      doc.addImage(signatureBase64, 'PNG', marginLeft, yPos, 40, 15);
    }
    yPos += 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(formData.signed_by || 'Authorized Signatory', marginLeft, yPos);
    yPos += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Authorized Signatory', marginLeft, yPos);

    addPageNumbers(doc);

    return doc.output('blob');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full my-8">
        {/* Header with Logo */}
        <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-start sticky top-0 bg-white z-10">
          <div className="flex items-center gap-4">
            <img src={INDUS_LOGO_SRC} alt="Logo" className="h-12 w-12 object-contain" />
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                Internal Quotation
              </h2>
              {quotation && (
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  Quotation: {quotation.quotation_number}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {loading ? (
            <div className="text-center text-gray-500 py-12">Loading...</div>
          ) : quotation ? (
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
              {/* Client Details */}
              <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">CLIENT DETAILS</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Client Name</p>
                    <p className="text-sm font-medium text-gray-900">{client?.client_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Client ID</p>
                    <p className="text-sm font-medium text-gray-900">{client?.id?.substring(0, 8) || '-'}</p>
                  </div>
                  {client?.contact_email && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Email</p>
                      <p className="text-sm font-medium text-gray-900">{client.contact_email}</p>
                    </div>
                  )}
                  {client?.contact_number && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Phone</p>
                      <p className="text-sm font-medium text-gray-900">{client.contact_number}</p>
                    </div>
                  )}
                  {(client?.city || client?.state) && (
                    <div className="md:col-span-2">
                      <p className="text-xs text-gray-500 mb-1">Location</p>
                      <p className="text-sm font-medium text-gray-900">
                        {[client.city, client.state, client.country].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Subject Template Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject Template
                </label>
                <select
                  value={selectedSubjectTemplate}
                  onChange={(e) => handleSubjectTemplateChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select Subject Template</option>
                  {subjectTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject Fields */}
              <div className="mb-6">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject Title
                    </label>
                    <input
                      type="text"
                      value={formData.subject_title}
                      onChange={(e) => setFormData({ ...formData, subject_title: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="Enter subject title"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject
                    </label>
                    <textarea
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="Enter subject content"
                    />
                  </div>
                </div>
              </div>


              {/* Costing Sheet Table - Item Name, Specification, Quotation Rate Per Unit, Grand Total (Excl GST), GST %, GST Amount, Grand Total With GST */}
              <div className="mb-6 pt-6 border-t border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Costing Sheet</h3>
                </div>
                {costingTableItems.length > 0 && costingData ? (
                  <div className="overflow-x-auto border border-gray-300 rounded-lg">
                    <table className="w-full border-collapse bg-white text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-green-500 to-green-600 text-white">
                          <th className="px-2 py-2 text-left text-xs font-semibold uppercase border-r border-green-400 whitespace-nowrap">Item Name</th>
                          <th className="px-2 py-2 text-center text-xs font-semibold uppercase border-r border-green-400 whitespace-nowrap">Specification</th>
                          <th className="px-2 py-2 text-right text-xs font-semibold uppercase border-r border-green-400 whitespace-nowrap">Quotation Rate Per Unit</th>
                          <th className="px-2 py-2 text-right text-xs font-semibold uppercase border-r border-green-400 whitespace-nowrap">Grand Total Supply Cost (Excluding GST)</th>
                          <th className="px-2 py-2 text-right text-xs font-semibold uppercase border-r border-green-400 whitespace-nowrap">GST %</th>
                          <th className="px-2 py-2 text-right text-xs font-semibold uppercase border-r border-green-400 whitespace-nowrap">GST Amount</th>
                          <th className="px-2 py-2 text-right text-xs font-semibold uppercase whitespace-nowrap">Grand Total Supply Cost With GST</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costingTableItems.map((item, index) => {
                          const quotationRatePerUnit = parseFloat(getCostingValue(item.id, 'quotation_rate_per_unit') || 0);
                          const grandExclGst = parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_excl_gst') || 0);
                          const gstPct = getCostingValue(item.id, 'gst_pct');
                          const gstAmount = parseFloat(getCostingValue(item.id, 'gst_amount') || 0);
                          const grandWithGst = parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_with_gst') || 0);
                          const specification = item.productId
                            ? (item.specification || getProductSpecification(item.productId) || '-')
                            : '-';
                          const itemName = item.productName || item.name || `Item ${index + 1}`;
                          const fmt = (n) => n > 0 ? `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
                          return (
                            <tr key={item.id} className="border-b border-gray-200 hover:bg-green-50/30">
                              <td className="px-2 py-2 font-medium text-gray-900 border-r border-gray-200">{itemName}</td>
                              <td className="px-2 py-2 text-gray-700 border-r border-gray-200 max-w-xs text-center align-middle">
                                <div className="max-h-20 overflow-y-auto text-xs text-center leading-snug">{specification}</div>
                              </td>
                              <td className="px-2 py-2 text-right border-r border-gray-200">{fmt(quotationRatePerUnit)}</td>
                              <td className="px-2 py-2 text-right border-r border-gray-200">{fmt(grandExclGst)}</td>
                              <td className="px-2 py-2 text-right border-r border-gray-200">{gstPct != null && gstPct !== '' ? Number(gstPct).toLocaleString('en-IN') : '-'}</td>
                              <td className="px-2 py-2 text-right border-r border-gray-200">{fmt(gstAmount)}</td>
                              <td className="px-2 py-2 text-right font-semibold text-gray-900">{fmt(grandWithGst)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gradient-to-r from-gray-200 to-gray-300 border-t-2 border-gray-400">
                          <td colSpan={3} className="px-2 py-3 font-bold text-gray-900 border-r border-gray-400 text-right">Grand Total</td>
                          <td className="px-2 py-3 text-right font-bold text-gray-900 border-r border-gray-400">
                            ₹{(costingTableItems.reduce((s, item) => s + parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_excl_gst') || 0), 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-2 py-3 border-r border-gray-400" />
                          <td className="px-2 py-3 text-right font-bold text-gray-900 border-r border-gray-400">
                            ₹{(costingTableItems.reduce((s, item) => s + parseFloat(getCostingValue(item.id, 'gst_amount') || 0), 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-2 py-3 text-right font-bold text-gray-900">
                            ₹{(costingTableItems.reduce((s, item) => s + parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_with_gst') || 0), 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8 bg-gray-50 rounded-lg border border-gray-200">
                    No costing sheet data found. Create costing sheet first.
                  </div>
                )}
              </div>

              {/* Terms & Conditions Template and Field */}
              <div className="mb-6 pt-6 border-t border-gray-200">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Terms & Conditions Template
                  </label>
                  <select
                    value={selectedTermsTemplate}
                    onChange={(e) => handleTermsTemplateChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select Terms Template</option>
                    {termsTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Terms & Conditions
                  </label>
                  <textarea
                    value={formData.terms_and_conditions}
                    onChange={(e) => setFormData({ ...formData, terms_and_conditions: e.target.value })}
                    rows={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter terms and conditions"
                  />
                </div>
              </div>

              {/* Signature */}
              <div className="mb-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-4">Signature</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Signed By
                    </label>
                    <input
                      type="text"
                      value={formData.signed_by}
                      onChange={(e) => setFormData({ ...formData, signed_by: e.target.value })}
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
                      ref={signatureInputRef}
                      onChange={handleSignatureChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                    {signatureSrc ? (
                      <div className="mt-3">
                        <div className="relative inline-block">
                          <img 
                            src={signatureSrc} 
                            alt="Signature Preview" 
                            className="h-24 w-auto max-w-xs object-contain border-2 border-gray-300 rounded-lg bg-white p-3 shadow-md" 
                            onError={(e) => {
                              console.error('Error loading signature image from:', signatureSrc);
                              e.target.style.display = 'none';
                            }}
                            onLoad={() => {
                              console.log('Signature image loaded successfully from:', signatureSrc);
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleRemoveSignature}
                            className="absolute -top-2 -right-2 bg-white border border-gray-300 rounded-full p-1 shadow hover:bg-red-50"
                            title="Remove signature"
                          >
                            <X className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Signature Preview</p>
                      </div>
                    ) : quotation?.signature_path ? (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs text-gray-500">Signature saved.</span>
                        <button
                          type="button"
                          onClick={handleRemoveSignature}
                          className="inline-flex items-center justify-center bg-white border border-gray-300 rounded-full p-1 shadow hover:bg-red-50"
                          title="Remove signature"
                        >
                          <X className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-6 border-t border-gray-200">
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    className="flex items-center space-x-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    className="flex items-center space-x-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Send Mail</span>
                  </button>
                </div>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    Save Internal Quotation
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="text-center text-gray-500 py-12">
              Quotation not found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InternalQuotationFormModal;


