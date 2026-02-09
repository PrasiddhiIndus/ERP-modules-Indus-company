import React, { useState, useEffect } from 'react';
import { X, Download, Mail } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import logo from '../../../image/website_logo.webp';
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
  const [products, setProducts] = useState([]);

  const [formData, setFormData] = useState({
    quotation_number: '',
    subject_title: '',
    subject: '',
    terms_and_conditions: '',
    gst_percentage: 18,
    gst_type: 'IGST',
    signed_by: '',
  });

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
        .order('created_at', { ascending: false });

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
      setSignatureFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSignatureSrc(reader.result);
      };
      reader.readAsDataURL(file);
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
        const netTotal = costingTableItems.reduce((sum, item) => {
          const quotationRate = parseFloat(costingData[`${item.id}_quotation_rate`] || 0);
          return sum + quotationRate;
        }, 0);
        
        finalAmount = costingTableItems.reduce((sum, item) => {
          const finalPrice = parseFloat(costingData[`${item.id}_final_price`] || 0);
          return sum + finalPrice;
        }, 0);
        
        subtotal = netTotal;
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
      if (signaturePath) {
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

      const logoBase64 = await getBase64Image(logo);
      let signatureBase64 = null;
      if (signatureSrc) {
        try {
          signatureBase64 = await getBase64Image(signatureSrc);
        } catch (e) {
          console.log('Error converting signature to base64:', e);
        }
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // --- Logo ---
      doc.addImage(logoBase64, 'PNG', 155, 5, 35, 35);
      let yPos = 15;

      // --- Ref No. & Date ---
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`Ref. No.: ${quotation.quotation_number}`, 20, yPos);
      yPos += 3.5;
      const currentDate = new Date(quotation.quotation_date || new Date()).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      doc.text(`Date: ${currentDate}`, 20, yPos);
      yPos += 10;

      // --- To Address ---
      doc.setFontSize(10);
      doc.text('To,', 20, yPos);
      yPos += 4;
      
      // Client name with proper formatting
      if (client.client_name) {
        doc.setFont('helvetica', 'bold');
        doc.text(client.client_name, 20, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 3.5;
      }

      // Format address with proper spacing and alignment
      const addrParts = [
        client.street,
        client.street2,
        [client.city, client.state, client.zip].filter(Boolean).join(', '),
        client.country,
      ].filter(Boolean);

      addrParts.forEach((part) => {
        doc.text(part, 20, yPos);
        yPos += 3.5;
      });
      yPos += 4; // Reduced spacing

      // --- Subject ---
      if (formData.subject_title) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`Subject: ${formData.subject_title}`, 20, yPos);
        yPos += 5; // Reduced spacing
        doc.setFont('helvetica', 'normal');
      }

      // --- Greeting ---
      doc.setFontSize(10);
      doc.text('Dear Sir,', 20, yPos);
      yPos += 5; // Reduced spacing

      // --- Body (Subject Content) ---
      if (formData.subject) {
        doc.setFontSize(9);
        const bodyWidth = 160;
        yPos = justifyText(doc, formData.subject, 20, yPos, bodyWidth, 3.5);
        yPos += 3; // Reduced spacing
        yPos = checkNewPage(doc, yPos);
      }

      // --- Part 1: Commercial Offer ---
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Part-1: Commercial offer', 20, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 4; // Proper spacing after heading

      const formatNum = (num) => {
        const formatted = parseFloat(num || 0).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        // Use "Rs." prefix - jsPDF default font doesn't support ₹ symbol
        return `Rs. ${formatted}`;
      };

      // Prepare table data from costing sheet - 5 columns: Sr. No., Item Name, Specification, Rate, Total Amount
      const tableData = [];
      if (costingTableItems.length > 0 && costingData) {
        costingTableItems.forEach((item, index) => {
          const finalPrice = parseFloat(costingData[`${item.id}_final_price`] || 0);
          const itemName = item.name || item.productName || `Item ${index + 1}`;
          const specification = item.productId ? getProductSpecification(item.productId) : '';
          
          tableData.push([
            String(index + 1), // Sr. No. as string
            itemName, // Item Name
            specification || '-', // Specification
            formatNum(finalPrice), // Rate
            formatNum(finalPrice), // Total Amount
          ]);
        });
      } else {
        // Fallback if no costing data
        tableData.push([
          '1', // Sr. No.
          'Total Amount', // Item Name
          '-', // Specification
          formatNum(finalAmount), // Rate
          formatNum(finalAmount), // Total Amount
        ]);
      }

      const grandTotal = costingTableItems.length > 0 && costingData
        ? costingTableItems.reduce((sum, item) => {
            const finalPrice = parseFloat(costingData[`${item.id}_final_price`] || 0);
            return sum + finalPrice;
          }, 0)
        : finalAmount;

      // Total row: spans first 3 columns, empty Rate column, total in last column
      tableData.push(['', 'Total Amount', '', '', formatNum(grandTotal)]);

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

      autoTable(doc, {
        startY: firstPageStartY,
        head: [['Sr. No.', 'Item Name', 'Specification', 'Rate', 'Total Amount']],
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 8.5,
          cellPadding: 2.5,
          lineWidth: 0.1,
          lineColor: [200, 200, 200],
          overflow: 'linebreak',
          minCellHeight: 10,
          halign: 'left',
          valign: 'top',
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          lineWidth: 0.2,
          lineColor: [41, 128, 185],
          cellPadding: 2.5,
        },
        alternateRowStyles: {
          fillColor: [248, 249, 250],
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'left', valign: 'top', fontStyle: 'normal' },
          1: { cellWidth: 50, halign: 'left', valign: 'top' },
          2: { cellWidth: 50, halign: 'left', valign: 'top' },
          3: { cellWidth: 28, halign: 'center', valign: 'top' },
          4: { cellWidth: 30, halign: 'center', valign: 'top' },
        },
        pageBreak: 'auto',
        rowPageBreak: 'avoid',
        showHead: 'everyPage',
        margin: { left: 20, right: 20, top: firstPageStartY, bottom: 10 },
        didParsePage: (data) => {
          // On subsequent pages, force table to start immediately after header with NO gap
          if (data.pageNumber > 1) {
            // Set startY to 19mm (right after date at 18.5mm) - no space at all
            data.settings.startY = 19;
            // Remove all top margin
            data.settings.margin.top = 0;
          }
        },
        willDrawPage: (data) => {
          // Draw header on every page before table draws
          drawPageHeader(doc, data.pageNumber);
          
          // On subsequent pages, ensure table starts at top with no gap
          if (data.pageNumber > 1) {
            // Force the table to start at 19mm (immediately after header)
            if (data.table && data.table.settings) {
              data.table.settings.startY = 19;
              data.table.settings.margin.top = 0;
            }
          }
        },
        didParseCell: (data) => {
          // Style the total row - match QuotationDetail.jsx pattern
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [230, 240, 255];
            data.cell.styles.textColor = [0, 0, 0];
            data.cell.styles.halign = 'center';
            data.cell.styles.valign = 'top';
            // Merge first 3 cells for "Total Amount" label
            if (data.column.index === 0) {
              data.cell.colSpan = 3;
            } else if (data.column.index < 3) {
              data.cell.rowSpan = 0; // Hide the spanned cells
            }
          }
        },
        didDrawCell: (data) => {
          // Add underline for grand total - match QuotationDetail.jsx
          if (data.row.index === tableData.length - 1 && data.column.index === 4) {
            const { x, y, width, height } = data.cell;
            doc.setDrawColor(41, 128, 185);
            doc.setLineWidth(0.5);
            doc.line(x, y + height - 1, x + width, y + height - 1);
          }
        },
      });

      // Get the final Y position after table, with proper spacing
      yPos = doc.lastAutoTable.finalY + 3; // Proper spacing after table
      // Check if we need a new page
      yPos = checkNewPage(doc, yPos, 20);

      // --- Part 2: Terms & Conditions ---
      // Check if we have enough space, if not start on new page
      yPos = checkNewPage(doc, yPos, 30);
      
      // Add proper spacing before Terms & Conditions (1 space as requested)
      yPos += 1;
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Part-2: Terms & Conditions:', 20, yPos);
      yPos += 4; // Proper spacing after heading

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      // Split and clean the lines
      const termLines = formData.terms_and_conditions
        ? formData.terms_and_conditions.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim() !== '')
        : [];

      // Layout settings - optimized for justified alignment
      const leftMargin = 20;
      const bulletGap = 2;
      const textWidth = 160;
      const lineHeight = 3.2; // Reduced from 3.5 to save space
      const sectionSpacing = 0.8; // Reduced from 1 to save space

      termLines.forEach((line) => {
        const cleanLine = line.trim();

        // Detect bullet like a), b), 1., -
        const match = cleanLine.match(/^([•\-\–]|\(?[a-zA-Z0-9]+\)|[0-9]+\.)\s*/);
        let bullet = '';
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

        // Page overflow check - use smaller minSpace to avoid unnecessary page breaks
        yPos = checkNewPage(doc, yPos, 15);
      });

      // Check if we have enough space for footer section, if not start on new page
      yPos = checkNewPage(doc, yPos, 25);
      yPos += 2; // Reduced from 3 to 2 for tighter spacing

      doc.text('For Indus Fire Safety Pvt. Ltd.', 20, yPos);
      yPos += 5; // Reduced from 6 to 5

      // --- Signature ---
      if (signatureBase64) {
        doc.addImage(signatureBase64, 'PNG', 20, yPos, 40, 15);
      } else {
        doc.setDrawColor(180);
        doc.setLineWidth(0.5);
        doc.rect(20, yPos, 40, 15, 'S');
      }
      yPos += 18;

      doc.setFont('helvetica', 'bold');
      doc.text(formData.signed_by || 'Authorized Signatory', 20, yPos);
      yPos += 4;
      doc.setFont('helvetica', 'normal');
      doc.text('Authorized Signatory', 20, yPos);

      // Add page numbers to all pages
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
          const specification = item.productId ? getProductSpecification(item.productId) : '';
          
          // Format with tabs for table alignment
          const rateFormatted = `₹${finalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const totalFormatted = `₹${finalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          
          body += `${index + 1}\t${itemName}\t${specification || '-'}\t${rateFormatted}\t${totalFormatted}\n`;
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
    const logoBase64 = await getBase64Image(logo);
    let signatureBase64 = null;
    if (signatureSrc) {
      try {
        signatureBase64 = await getBase64Image(signatureSrc);
      } catch (e) {
        console.log('Error converting signature to base64:', e);
      }
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // --- Logo ---
    doc.addImage(logoBase64, 'PNG', 155, 5, 35, 35);
    let yPos = 15;

    // --- Ref No. & Date ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`Ref. No.: ${quotation.quotation_number}`, 20, yPos);
    yPos += 3.5;
    const currentDate = new Date(quotation.quotation_date || new Date()).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    doc.text(`Date: ${currentDate}`, 20, yPos);
    yPos += 10;

    // --- To Address ---
    doc.setFontSize(10);
    doc.text('To,', 20, yPos);
    yPos += 4;
    
    // Client name with proper formatting
    if (client.client_name) {
      doc.setFont('helvetica', 'bold');
      doc.text(client.client_name, 20, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 3.5;
    }

    // Format address with proper spacing and alignment
    const addrParts = [
      client.street,
      client.street2,
      [client.city, client.state, client.zip].filter(Boolean).join(', '),
      client.country,
    ].filter(Boolean);

    addrParts.forEach((part) => {
      doc.text(part, 20, yPos);
      yPos += 3.5;
    });
    yPos += 4; // Reduced spacing

    // --- Subject ---
    if (formData.subject_title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Subject: ${formData.subject_title}`, 20, yPos);
      yPos += 5; // Reduced spacing
      doc.setFont('helvetica', 'normal');
    }

    // --- Greeting ---
    doc.setFontSize(10);
    doc.text('Dear Sir,', 20, yPos);
    yPos += 5; // Reduced spacing

    // --- Body (Subject Content) ---
    if (formData.subject) {
      doc.setFontSize(9);
      const bodyWidth = 160;
      yPos = justifyText(doc, formData.subject, 20, yPos, bodyWidth, 3.5);
      yPos += 3; // Reduced spacing
      yPos = checkNewPage(doc, yPos);
    }

    // --- Part 1: Commercial Offer ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Part-1: Commercial offer', 20, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 4; // Proper spacing after heading

    const formatNum = (num) =>
      `₹${parseFloat(num || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

    // Prepare table data from costing sheet - 5 columns: Sr. No., Item Name, Specification, Rate, Total Amount
    const tableData = [];
    if (costingTableItems.length > 0 && costingData) {
      costingTableItems.forEach((item, index) => {
        const finalPrice = parseFloat(costingData[`${item.id}_final_price`] || 0);
        const itemName = item.name || item.productName || `Item ${index + 1}`;
        const specification = item.productId ? getProductSpecification(item.productId) : '';
        
        tableData.push([
          String(index + 1), // Sr. No. as string
          itemName, // Item Name
          specification || '-', // Specification
          formatNum(finalPrice), // Rate
          formatNum(finalPrice), // Total Amount
        ]);
      });
    } else {
      // Fallback if no costing data
      tableData.push([
        '1', // Sr. No.
        'Total Amount', // Item Name
        '-', // Specification
        formatNum(finalAmount), // Rate
        formatNum(finalAmount), // Total Amount
      ]);
    }

    const grandTotal = costingTableItems.length > 0 && costingData
      ? costingTableItems.reduce((sum, item) => {
          const finalPrice = parseFloat(costingData[`${item.id}_final_price`] || 0);
          return sum + finalPrice;
        }, 0)
      : finalAmount;

    // Total row: spans first 3 columns, empty Rate column, total in last column
    tableData.push(['', 'Total Amount', '', '', formatNum(grandTotal)]);

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

    autoTable(doc, {
      startY: firstPageStartY,
      head: [['Sr. No.', 'Item Name', 'Specification', 'Rate', 'Total Amount']],
      body: tableData,
      theme: 'grid',
      styles: {
        fontSize: 8.5,
        cellPadding: 2.5,
        lineWidth: 0.1,
        lineColor: [200, 200, 200],
        overflow: 'linebreak',
        minCellHeight: 10,
        halign: 'left',
        valign: 'top',
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        lineWidth: 0.2,
        lineColor: [41, 128, 185],
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250],
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'left', valign: 'top', fontStyle: 'normal' },
        1: { cellWidth: 50, halign: 'left', valign: 'top' },
        2: { cellWidth: 50, halign: 'left', valign: 'top' },
        3: { cellWidth: 28, halign: 'right', valign: 'top' },
        4: { cellWidth: 30, halign: 'right', valign: 'top' },
      },
      pageBreak: 'auto',
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      margin: { left: 20, right: 20, top: firstPageStartY, bottom: 10 },
      didParsePage: (data) => {
        // On subsequent pages, force table to start immediately after header with NO gap
        if (data.pageNumber > 1) {
          // Set startY to 19mm (right after date at 18.5mm) - no space at all
          data.settings.startY = 19;
          // Remove all top margin
          data.settings.margin.top = 0;
        }
      },
      willDrawPage: (data) => {
        // Draw header on every page before table draws
        drawPageHeader(doc, data.pageNumber);
        
        // On subsequent pages, ensure table starts at top with no gap
        if (data.pageNumber > 1) {
          // Force the table to start at 19mm (immediately after header)
          if (data.table && data.table.settings) {
            data.table.settings.startY = 19;
            data.table.settings.margin.top = 0;
          }
        }
      },
      didParseCell: (data) => {
        // Style the total row - match QuotationDetail.jsx pattern
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [230, 240, 255];
          data.cell.styles.textColor = [0, 0, 0];
          data.cell.styles.halign = 'right';
          data.cell.styles.valign = 'top';
          // Merge first 3 cells for "Total Amount" label
          if (data.column.index === 0) {
            data.cell.colSpan = 3;
          } else if (data.column.index < 3) {
            data.cell.rowSpan = 0; // Hide the spanned cells
          }
        }
      },
      didDrawCell: (data) => {
        // Add underline for grand total - match QuotationDetail.jsx
        if (data.row.index === tableData.length - 1 && data.column.index === 4) {
          const { x, y, width, height } = data.cell;
          doc.setDrawColor(41, 128, 185);
          doc.setLineWidth(0.5);
          doc.line(x, y + height - 1, x + width, y + height - 1);
        }
      },
    });

    // Get the final Y position after table, with proper spacing
    yPos = doc.lastAutoTable.finalY + 3; // Proper spacing after table
    // Check if we need a new page
    yPos = checkNewPage(doc, yPos, 20);

    // --- Part 2: Terms & Conditions ---
    // Check if we have enough space, if not start on new page
    yPos = checkNewPage(doc, yPos, 30);
    
    // Add proper spacing before Terms & Conditions (1 space as requested)
    yPos += 1;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Part-2: Terms & Conditions:', 20, yPos);
    yPos += 4; // Proper spacing after heading

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    // Split and clean the lines
    const termLines = formData.terms_and_conditions
      ? formData.terms_and_conditions.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim() !== '')
      : [];

    // Layout settings - optimized for justified alignment
    const leftMargin = 20;
    const bulletGap = 2;
    const textWidth = 160;
    const lineHeight = 3.2; // Reduced from 3.5 to save space
    const sectionSpacing = 0.8; // Reduced from 1 to save space

    termLines.forEach((line) => {
      const cleanLine = line.trim();

      // Detect bullet like a), b), 1., -
      const match = cleanLine.match(/^([•\-\–]|\(?[a-zA-Z0-9]+\)|[0-9]+\.)\s*/);
      let bullet = '';
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

      // Page overflow check - use smaller minSpace to avoid unnecessary page breaks
      yPos = checkNewPage(doc, yPos, 15);
    });

    // Check if we have enough space for footer section, if not start on new page
    yPos = checkNewPage(doc, yPos, 25);
    yPos += 2; // Reduced from 3 to 2 for tighter spacing

    doc.text('For Indus Fire Safety Pvt. Ltd.', 20, yPos);
    yPos += 5; // Reduced from 6 to 5

    // --- Signature ---
    if (signatureBase64) {
      doc.addImage(signatureBase64, 'PNG', 20, yPos, 40, 15);
    } else {
      doc.setDrawColor(180);
      doc.setLineWidth(0.5);
      doc.rect(20, yPos, 40, 15, 'S');
    }
    yPos += 18;

    doc.setFont('helvetica', 'bold');
    doc.text(formData.signed_by || 'Authorized Signatory', 20, yPos);
    yPos += 4;
    doc.setFont('helvetica', 'normal');
    doc.text('Authorized Signatory', 20, yPos);

    // Add page numbers to all pages
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
            <img src={logo} alt="Logo" className="h-12 w-12 object-contain" />
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


              {/* Costing Sheet Table - Same format as QuotationForm */}
              <div className="mb-6 pt-6 border-t border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Costing Sheet</h3>
                </div>
                {costingTableItems.length > 0 && costingData ? (
                  <div className="overflow-x-auto border border-gray-300 rounded-lg">
                    <table className="w-full border-collapse bg-white">
                      <colgroup>
                        <col style={{ width: '35%' }} />
                        <col style={{ width: '50%' }} />
                        <col style={{ width: '15%' }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-gradient-to-r from-green-500 to-green-600 text-white">
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider border-r border-green-400">Item Name</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider border-r border-green-400">Specification</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider">Total Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costingTableItems.map((item, index) => {
                          const finalPrice = parseFloat(costingData[`${item.id}_final_price`] || 0);
                          const specification = item.specification || (item.productId ? getProductSpecification(item.productId) : '');
                          const itemName = item.productName || item.name || `Item ${index + 1}`;
                          return (
                            <tr key={item.id} className="border-b border-gray-200 hover:bg-green-50/30 transition-colors">
                              <td className="px-3 py-2 text-sm font-medium text-gray-900 border-r border-gray-200">
                                {itemName}
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-700 border-r border-gray-200">
                                <div className="max-h-20 overflow-y-auto text-xs">
                                  {specification || '-'}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-sm font-semibold text-gray-900 text-right">
                                {finalPrice > 0 ? `₹${finalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gradient-to-r from-gray-200 to-gray-300 border-t-2 border-gray-400">
                          <td colSpan={2} className="px-3 py-3 text-sm font-bold text-gray-900 border-r border-gray-400 text-right">
                            Grand Total
                          </td>
                          <td className="px-3 py-3 text-sm font-bold text-gray-900 text-right">
                            ₹{(() => {
                              const total = costingTableItems.length > 0 && costingData
                                ? costingTableItems.reduce((sum, item) => {
                                    const finalPrice = parseFloat(costingData[`${item.id}_final_price`] || 0);
                                    return sum + finalPrice;
                                  }, 0)
                                : finalAmount;
                              return total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            })()}
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
                      onChange={handleSignatureChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                    {signatureSrc ? (
                      <div className="mt-3">
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
                        <p className="text-xs text-gray-500 mt-2">Signature Preview</p>
                      </div>
                    ) : quotation?.signature_path ? (
                      <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                        <p>Signature file exists but could not be loaded.</p>
                        <p className="mt-1">Path: {quotation.signature_path}</p>
                        <p className="mt-1">Please check browser console for details.</p>
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
                    className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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


