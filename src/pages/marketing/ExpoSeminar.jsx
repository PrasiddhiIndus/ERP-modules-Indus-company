import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Plus, Edit2, Trash2, MoreVertical, Download, Calendar, Users, Eye, Upload, Image as ImageIcon, FileSpreadsheet } from 'lucide-react';
import { exportToExcel } from './utils/excelExport';
import * as XLSX from 'xlsx';

const ExpoSeminar = () => {
  const [expos, setExpos] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showVisitorForm, setShowVisitorForm] = useState(false);
  const [selectedExpo, setSelectedExpo] = useState(null);
  const [editingExpo, setEditingExpo] = useState(null);
  const [viewingExpo, setViewingExpo] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [activeTab, setActiveTab] = useState('expos'); // 'expos' or 'visitors'
  const [formData, setFormData] = useState({
    event_name: '',
    event_type: 'Exhibition',
    booth_stall_number: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    city: '',
    location: '',
    country: 'India',
    venue_address: '',
    description: '',
    organizer_name: '',
    organizer_contact: '',
    notes: '',
  });
  const [costSheetItems, setCostSheetItems] = useState([
    { id: 'item-1', item_name: '', quantity: 1, price: 0, cost: 0, total: 0 }
  ]);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [siteVisits, setSiteVisits] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [clients, setClients] = useState([]);
  const [editingSiteVisit, setEditingSiteVisit] = useState(null);
  const [viewingSiteVisit, setViewingSiteVisit] = useState(null);
  const [siteVisitFormData, setSiteVisitFormData] = useState({
    executive_names: [], // Array for multiple selection
    visitor_name: '',
    company_name: '',
    client_name: '',
    designation: '',
    site_location: '',
    mobile_number: '',
    email_id: '',
    product_interest: '',
    discussion_note: '',
    visit_date: new Date().toISOString().split('T')[0],
    purpose_of_visit: '',
    travel_expenses: '',
    food_expenses: '',
    accommodation: '',
    other_expenses: '',
    total_expense: 0,
    approved_amount: '',
    status: 'Pending Paid',
  });
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [executiveNameInput, setExecutiveNameInput] = useState('');

  useEffect(() => {
    fetchExpos();
    fetchVisitors();
    fetchSiteVisits();
    fetchExecutives();
    fetchClients();
  }, []);

  // Calculate total expense whenever expense fields change
  useEffect(() => {
    const travel = parseFloat(siteVisitFormData.travel_expenses) || 0;
    const food = parseFloat(siteVisitFormData.food_expenses) || 0;
    const accommodation = parseFloat(siteVisitFormData.accommodation) || 0;
    const other = parseFloat(siteVisitFormData.other_expenses) || 0;
    const total = travel + food + accommodation + other;
    setSiteVisitFormData(prev => ({ ...prev, total_expense: total }));
  }, [siteVisitFormData.travel_expenses, siteVisitFormData.food_expenses, siteVisitFormData.accommodation, siteVisitFormData.other_expenses]);

  const fetchExpos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('marketing_expo_seminars')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;
      setExpos(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching expos:', error);
      setLoading(false);
    }
  };

  const fetchVisitors = async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_expo_visitors')
        .select(`
          *,
          marketing_expo_seminars:expo_id (event_name, event_type)
        `)
        .order('visit_date', { ascending: false });

      if (error) {
        // Table doesn't exist, set empty array
        if (error.code === 'PGRST205' || error.message.includes('not found')) {
          console.log('marketing_expo_visitors table not found, using empty array');
          setVisitors([]);
          return;
        }
        throw error;
      }
      setVisitors(data || []);
    } catch (error) {
      console.error('Error fetching visitors:', error);
      setVisitors([]);
    }
  };

  const fetchSiteVisits = async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_site_visits')
        .select('*')
        .order('visit_date', { ascending: false });

      if (error) throw error;
      setSiteVisits(data || []);
    } catch (error) {
      console.error('Error fetching site visits:', error);
      // If table doesn't exist, set empty array
      setSiteVisits([]);
    }
  };

  const fetchExecutives = async () => {
    try {
      // Try to fetch from ifsp_employees table
      const { data, error } = await supabase
        .from('ifsp_employees')
        .select('id, first_name, last_name, employee_id')
        .eq('status', 'Active')
        .order('first_name');

      if (error) {
        // Fallback: use auth users or empty array
        console.log('Could not fetch employees, using empty list');
        setExecutives([]);
        return;
      }
      
      setExecutives(data?.map(emp => ({
        id: emp.id,
        name: `${emp.first_name} ${emp.last_name}`,
        employee_id: emp.employee_id
      })) || []);
    } catch (error) {
      console.error('Error fetching executives:', error);
      setExecutives([]);
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_clients')
        .select('id, client_name')
        .order('client_name');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      setClients([]);
    }
  };

  const addCostSheetItem = () => {
    const newId = `item-${Date.now()}`;
    setCostSheetItems([...costSheetItems, { 
      id: newId, 
      item_name: '', 
      quantity: 1, 
      price: 0, 
      cost: 0, 
      total: 0 
    }]);
  };

  const removeCostSheetItem = (id) => {
    if (costSheetItems.length > 1) {
      setCostSheetItems(costSheetItems.filter(item => item.id !== id));
    }
  };

  const updateCostSheetItem = (id, field, value) => {
    setCostSheetItems(costSheetItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: field === 'item_name' ? value : parseFloat(value) || 0 };
        if (field === 'quantity' || field === 'price' || field === 'cost') {
          updated.total = (updated.quantity || 0) * (updated.price || 0) + (updated.cost || 0);
        }
        return updated;
      }
      return item;
    }));
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Validate file types
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const invalidFiles = files.filter(file => !validTypes.includes(file.type));
    if (invalidFiles.length > 0) {
      alert('Please upload only image files (JPEG, PNG, GIF, WebP)');
      return;
    }

    // Validate file sizes (max 5MB per file)
    const maxSize = 5 * 1024 * 1024; // 5MB
    const largeFiles = files.filter(file => file.size > maxSize);
    if (largeFiles.length > 0) {
      alert('Some files are too large. Maximum file size is 5MB per image.');
      return;
    }

    setUploadingImages(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const uploadedUrls = [];
      const errors = [];

      for (const file of files) {
        try {
          const fileExt = file.name.split('.').pop();
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(7);
          const fileName = `${user.id}/${timestamp}_${randomStr}.${fileExt}`;
          const filePath = `expo-seminar-images/${fileName}`;

          // Try to upload the file
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('marketing-documents')
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            // If bucket doesn't exist, provide helpful error
            if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('not found')) {
              throw new Error('Storage bucket "marketing-documents" not found. Please create it in Supabase Dashboard > Storage.');
            }
            throw uploadError;
          }

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('marketing-documents')
            .getPublicUrl(filePath);

          uploadedUrls.push(publicUrl);
        } catch (fileError) {
          console.error(`Error uploading file ${file.name}:`, fileError);
          errors.push(`${file.name}: ${fileError.message}`);
        }
      }

      if (uploadedUrls.length > 0) {
        setUploadedImages([...uploadedImages, ...uploadedUrls]);
        if (errors.length > 0) {
          alert(`Successfully uploaded ${uploadedUrls.length} image(s). Errors: ${errors.join(', ')}`);
        } else {
          alert(`Successfully uploaded ${uploadedUrls.length} image(s)!`);
        }
      } else if (errors.length > 0) {
        alert('Failed to upload images:\n' + errors.join('\n'));
      }

      setUploadingImages(false);
    } catch (error) {
      console.error('Error uploading images:', error);
      alert('Error uploading images: ' + error.message);
      setUploadingImages(false);
    }
  };

  const removeImage = (index) => {
    setUploadedImages(uploadedImages.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Calculate total from cost sheet
      const totalAmount = costSheetItems.reduce((sum, item) => sum + (item.total || 0), 0);
      
      // Prepare cost sheet data
      const costSheetData = {
        items: costSheetItems,
        images: uploadedImages,
        total_amount: totalAmount,
        created_at: new Date().toISOString(),
      };

      const submitData = {
        ...formData,
        cost_sheet_data: costSheetData,
      };
      
      if (editingExpo) {
        const { error } = await supabase
          .from('marketing_expo_seminars')
          .update({
            ...submitData,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingExpo.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('marketing_expo_seminars')
          .insert([{
            ...submitData,
            created_by: user.id,
            updated_by: user.id,
          }]);

        if (error) throw error;
      }

      setShowForm(false);
      setEditingExpo(null);
      setFormData({
        event_name: '',
        event_type: 'Exhibition',
        booth_stall_number: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        city: '',
        location: '',
        country: 'India',
        venue_address: '',
        description: '',
        organizer_name: '',
        organizer_contact: '',
        notes: '',
      });
      setCostSheetItems([{ id: 'item-1', item_name: '', quantity: 1, price: 0, cost: 0, total: 0 }]);
      setUploadedImages([]);
      fetchExpos();
    } catch (error) {
      console.error('Error saving expo:', error);
      alert('Error saving expo: ' + error.message);
    }
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingExcel(true);
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

          if (!rows || rows.length === 0) {
            alert('No data found in Excel file.');
            setUploadingExcel(false);
            return;
          }

          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            alert('User not authenticated');
            setUploadingExcel(false);
            return;
          }

          const siteVisitsToInsert = [];
          const errors = [];

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
              // Map Excel columns to form fields (case-insensitive matching)
              const mapColumn = (possibleNames) => {
                for (const name of possibleNames) {
                  const key = Object.keys(row).find(k => 
                    k.toLowerCase().trim() === name.toLowerCase().trim()
                  );
                  if (key) return row[key] || '';
                }
                return '';
              };

              // Map Excel columns to form fields (case-insensitive, handles missing columns gracefully)
              // All fields default to empty string or appropriate default value if column is missing
              const executiveNames = mapColumn(['Executive Name', 'Executive Names', 'Executive', 'Executive Name(s)']) || '';
              const visitorName = mapColumn(['Visitor Name', 'Visitor', 'Name', 'Visitor Name']) || '';
              const companyName = mapColumn(['Company Name', 'Company', 'Company Name']) || '';
              const clientName = mapColumn(['Client Name', 'Client', 'Client Name']) || '';
              const designation = mapColumn(['Designation', 'Designation', 'Position', 'Job Title']) || '';
              const location = mapColumn(['Location', 'Site Location', 'City', 'Location', 'Address']) || '';
              const mobileNumber = mapColumn(['Mobile Number', 'Mobile', 'Phone', 'Contact Number', 'Mobile No', 'Phone Number']) || '';
              const emailId = mapColumn(['Email ID', 'Email', 'Email Address', 'Email Id', 'E-mail']) || '';
              const productInterest = mapColumn(['Product Interest', 'Product', 'Interest', 'Product Interest', 'Products']) || '';
              const discussionNote = mapColumn(['Discussion Note', 'Discussion', 'Notes', 'Note', 'Discussion Notes', 'Comments']) || '';
              const visitDate = mapColumn(['Visit Date', 'Date', 'Visiting Date', 'Visit Date', 'Date of Visit']) || '';
              const status = mapColumn(['Status', 'Approved Status', 'Status', 'Approval Status']) || 'Pending Paid';
              const purposeOfVisit = mapColumn(['Purpose of Visit', 'Purpose', 'Purpose of Visit', 'Visit Purpose']) || '';
              const travelExpenses = parseFloat(mapColumn(['Travel Expenses', 'Travel', 'Travel Cost', 'Travel Expense', 'Transportation'])) || 0;
              const foodExpenses = parseFloat(mapColumn(['Food Expenses', 'Food', 'Food Cost', 'Food Expense', 'Meals'])) || 0;
              const accommodation = parseFloat(mapColumn(['Accommodation', 'Accommodation Cost', 'Accommodation Expense', 'Hotel', 'Lodging'])) || 0;
              const otherExpenses = parseFloat(mapColumn(['Other Expenses', 'Other', 'Other Cost', 'Other Expense', 'Miscellaneous'])) || 0;
              const totalExpense = travelExpenses + foodExpenses + accommodation + otherExpenses;
              const approvedAmount = parseFloat(mapColumn(['Approved Amount', 'Approved', 'Approved Amount', 'Approved Value'])) || null;

              // Skip empty rows
              if (!visitorName && !companyName && !clientName) {
                continue;
              }

              // Parse visit date
              let parsedDate = visitDate;
              if (visitDate) {
                // Try to parse Excel date or standard date format
                if (typeof visitDate === 'number') {
                  // Excel date serial number
                  const excelEpoch = new Date(1899, 11, 30);
                  parsedDate = new Date(excelEpoch.getTime() + visitDate * 86400000).toISOString().split('T')[0];
                } else if (visitDate.includes('/') || visitDate.includes('-')) {
                  // Try to parse as date string
                  const dateObj = new Date(visitDate);
                  if (!isNaN(dateObj.getTime())) {
                    parsedDate = dateObj.toISOString().split('T')[0];
                  }
                }
              } else {
                parsedDate = new Date().toISOString().split('T')[0];
              }

              siteVisitsToInsert.push({
                executive_names: executiveNames,
                visitor_name: visitorName,
                company_name: companyName,
                client_name: clientName,
                designation: designation,
                site_location: location,
                mobile_number: mobileNumber,
                email_id: emailId,
                product_interest: productInterest,
                discussion_note: discussionNote,
                visit_date: parsedDate,
                purpose_of_visit: purposeOfVisit,
                travel_expenses: travelExpenses,
                food_expenses: foodExpenses,
                accommodation: accommodation,
                other_expenses: otherExpenses,
                total_expense: totalExpense,
                approved_amount: approvedAmount,
                status: status || 'Pending Paid',
                created_by: user.id,
              });
            } catch (rowError) {
              errors.push(`Row ${i + 2}: ${rowError.message}`);
            }
          }

          if (siteVisitsToInsert.length === 0) {
            alert('No valid data found in Excel file. Please ensure at least one row has Visitor Name, Company Name, or Client Name.\n\nNote: Missing columns will be saved as empty values.');
            setUploadingExcel(false);
            return;
          }

          // Insert in batches of 100 (Supabase limit)
          const batchSize = 100;
          let inserted = 0;
          for (let i = 0; i < siteVisitsToInsert.length; i += batchSize) {
            const batch = siteVisitsToInsert.slice(i, i + batchSize);
            const { error } = await supabase
              .from('marketing_site_visits')
              .insert(batch);

            if (error) {
              errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
            } else {
              inserted += batch.length;
            }
          }

          if (errors.length > 0) {
            alert(`Uploaded ${inserted} records. Some errors occurred:\n${errors.join('\n')}`);
          } else {
            alert(`Successfully uploaded ${inserted} site visit record(s)!\n\nNote: Missing columns in your Excel file were saved as empty values.`);
          }

          fetchSiteVisits();
          setUploadingExcel(false);
          e.target.value = ''; // Reset file input
        } catch (error) {
          console.error('Error processing Excel:', error);
          alert('Error processing Excel file: ' + error.message + '\n\nPlease ensure your Excel file follows the correct format. You can download the template for reference.');
          setUploadingExcel(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Error reading file: ' + error.message);
      setUploadingExcel(false);
    }
  };

  const downloadExcelTemplate = () => {
    // Create template data with headers and one example row
    const templateData = [
      {
        'Executive Name': 'John Doe, Jane Smith',
        'Visitor Name': 'Rajesh Kumar',
        'Company Name': 'ABC Industries',
        'Client Name': 'ABC Industries',
        'Designation': 'Manager',
        'Location': 'Mumbai, Maharashtra',
        'Mobile Number': '9876543210',
        'Email ID': 'rajesh@abc.com',
        'Product Interest': 'Machinery',
        'Discussion Note': 'Discussed pricing and delivery timeline',
        'Visit Date': '2024-12-15',
        'Status': 'Pending Paid',
        'Purpose of Visit': 'Sales meeting',
        'Travel Expenses': '500',
        'Food Expenses': '300',
        'Accommodation': '2000',
        'Other Expenses': '200',
        'Approved Amount': '3000'
      }
    ];

    exportToExcel(templateData, 'Site_Visit_Template', 'Site Visit Template');
  };

  const handleSiteVisitSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const submitData = {
        executive_names: siteVisitFormData.executive_names.join(', '), // Store as comma-separated string
        visitor_name: siteVisitFormData.visitor_name,
        company_name: siteVisitFormData.company_name,
        client_name: siteVisitFormData.client_name,
        designation: siteVisitFormData.designation,
        site_location: siteVisitFormData.site_location,
        mobile_number: siteVisitFormData.mobile_number,
        email_id: siteVisitFormData.email_id,
        product_interest: siteVisitFormData.product_interest,
        discussion_note: siteVisitFormData.discussion_note,
        visit_date: siteVisitFormData.visit_date,
        purpose_of_visit: siteVisitFormData.purpose_of_visit,
        travel_expenses: parseFloat(siteVisitFormData.travel_expenses) || 0,
        food_expenses: parseFloat(siteVisitFormData.food_expenses) || 0,
        accommodation: parseFloat(siteVisitFormData.accommodation) || 0,
        other_expenses: parseFloat(siteVisitFormData.other_expenses) || 0,
        total_expense: siteVisitFormData.total_expense,
        approved_amount: parseFloat(siteVisitFormData.approved_amount) || null,
        status: siteVisitFormData.status,
      };

      if (editingSiteVisit) {
        const { error } = await supabase
          .from('marketing_site_visits')
          .update({
            ...submitData,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingSiteVisit.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('marketing_site_visits')
          .insert([{
            ...submitData,
            created_by: user.id,
          }]);

        if (error) throw error;
      }

      setShowVisitorForm(false);
      setEditingSiteVisit(null);
      setExecutiveNameInput('');
      setSiteVisitFormData({
        executive_names: [],
        visitor_name: '',
        company_name: '',
        client_name: '',
        designation: '',
        site_location: '',
        mobile_number: '',
        email_id: '',
        product_interest: '',
        discussion_note: '',
        visit_date: new Date().toISOString().split('T')[0],
        purpose_of_visit: '',
        travel_expenses: '',
        food_expenses: '',
        accommodation: '',
        other_expenses: '',
        total_expense: 0,
        approved_amount: '',
        status: 'Pending Paid',
      });
      fetchSiteVisits();
    } catch (error) {
      console.error('Error saving site visit:', error);
      // If table doesn't exist, show helpful message
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        alert('Site Visits table not found. Please create the marketing_site_visits table in your database.');
      } else {
        alert('Error saving site visit: ' + error.message);
      }
    }
  };

  const handleEditSiteVisit = (visit) => {
    setEditingSiteVisit(visit);
    setSiteVisitFormData({
      executive_names: visit.executive_names ? visit.executive_names.split(',').map(n => n.trim()) : [],
      visitor_name: visit.visitor_name || '',
      company_name: visit.company_name || '',
      client_name: visit.client_name || '',
      designation: visit.designation || '',
      site_location: visit.site_location || '',
      mobile_number: visit.mobile_number || '',
      email_id: visit.email_id || '',
      product_interest: visit.product_interest || '',
      discussion_note: visit.discussion_note || '',
      visit_date: visit.visit_date || new Date().toISOString().split('T')[0],
      purpose_of_visit: visit.purpose_of_visit || '',
      travel_expenses: visit.travel_expenses ? visit.travel_expenses.toString() : '',
      food_expenses: visit.food_expenses ? visit.food_expenses.toString() : '',
      accommodation: visit.accommodation ? visit.accommodation.toString() : '',
      other_expenses: visit.other_expenses ? visit.other_expenses.toString() : '',
      total_expense: visit.total_expense || 0,
      approved_amount: visit.approved_amount ? visit.approved_amount.toString() : '',
      status: visit.status || 'Pending Paid',
    });
    setShowVisitorForm(true);
  };

  const handleViewSiteVisit = (visit) => {
    setViewingSiteVisit(visit);
  };

  const handleDeleteSiteVisit = async (id) => {
    if (!confirm('Are you sure you want to delete this site visit?')) return;

    try {
      const { error } = await supabase
        .from('marketing_site_visits')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchSiteVisits();
    } catch (error) {
      console.error('Error deleting site visit:', error);
      alert('Error deleting site visit: ' + error.message);
    }
  };

  const handleEdit = async (expo) => {
    setEditingExpo(expo);
    setFormData({
      event_name: expo.event_name || '',
      event_type: expo.event_type || 'Exhibition',
      booth_stall_number: expo.booth_stall_number || '',
      start_date: expo.start_date || new Date().toISOString().split('T')[0],
      end_date: expo.end_date || new Date().toISOString().split('T')[0],
      city: expo.city || '',
      location: expo.location || '',
      country: expo.country || 'India',
      venue_address: expo.venue_address || '',
      description: expo.description || '',
      organizer_name: expo.organizer_name || '',
      organizer_contact: expo.organizer_contact || '',
      notes: expo.notes || '',
    });
    
    // Load cost sheet data if exists
    if (expo.cost_sheet_data) {
      try {
        const costData = typeof expo.cost_sheet_data === 'string' 
          ? JSON.parse(expo.cost_sheet_data) 
          : expo.cost_sheet_data;
        if (costData.items) {
          setCostSheetItems(costData.items);
        }
        if (costData.images) {
          setUploadedImages(costData.images);
        }
      } catch (e) {
        console.error('Error loading cost sheet data:', e);
      }
    } else {
      setCostSheetItems([{ id: 'item-1', item_name: '', quantity: 1, price: 0, cost: 0, total: 0 }]);
      setUploadedImages([]);
    }
    
    setShowForm(true);
    setMenuOpen(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this expo/seminar?')) return;

    try {
      const { error } = await supabase
        .from('marketing_expo_seminars')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchExpos();
      setMenuOpen(null);
    } catch (error) {
      console.error('Error deleting expo:', error);
      alert('Error deleting expo: ' + error.message);
    }
  };

  const handleExport = () => {
    if (activeTab === 'expos') {
      const exportData = expos.map(expo => ({
        'Event Name': expo.event_name,
        'Event Type': expo.event_type,
        'Booth/Stall Number': expo.booth_stall_number || '-',
        'Start Date': expo.start_date,
        'End Date': expo.end_date,
        'City': expo.city || '-',
        'Location': expo.location,
        'Country': expo.country,
        'Organizer': expo.organizer_name || '-',
        'Created At': new Date(expo.created_at).toLocaleDateString(),
      }));
      exportToExcel(exportData, 'Expo_Seminars_Export', 'Expo & Seminars');
    } else {
      const exportData = visitors.map(visitor => ({
        'Visitor Name': visitor.visitor_name,
        'Company': visitor.company_name || '-',
        'Contact Number': visitor.contact_number || '-',
        'Email': visitor.email || '-',
        'Designation': visitor.designation || '-',
        'Visit Date': visitor.visit_date,
        'Visit Type': visitor.visit_type,
        'Event': visitor.marketing_expo_seminars?.event_name || '-',
        'Remarks': visitor.remarks || '-',
      }));
      exportToExcel(exportData, 'Expo_Visitors_Export', 'Expo Visitors');
    }
  };

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Expo & Seminar Tracker</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Manage exhibitions, seminars, and visitor records</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={handleExport}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm sm:text-base"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Excel</span>
              <span className="sm:hidden">Export</span>
            </button>
            {activeTab === 'expos' ? (
              <button
                onClick={() => {
                  setEditingExpo(null);
                  setFormData({
                    event_name: '',
                    event_type: 'Exhibition',
                    booth_stall_number: '',
                    start_date: new Date().toISOString().split('T')[0],
                    end_date: new Date().toISOString().split('T')[0],
                    city: '',
                    location: '',
                    country: 'India',
                    venue_address: '',
                    description: '',
                    organizer_name: '',
                    organizer_contact: '',
                    notes: '',
                  });
                  setCostSheetItems([{ id: 'item-1', item_name: '', quantity: 1, price: 0, cost: 0, total: 0 }]);
                  setUploadedImages([]);
                  setShowForm(true);
                }}
                className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm sm:text-base"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Expo/Seminar</span>
                <span className="sm:hidden">New</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setEditingSiteVisit(null);
                  setExecutiveNameInput('');
                  setSiteVisitFormData({
                    executive_names: [],
                    visitor_name: '',
                    company_name: '',
                    client_name: '',
                    designation: '',
                    site_location: '',
                    mobile_number: '',
                    email_id: '',
                    product_interest: '',
                    discussion_note: '',
                    visit_date: new Date().toISOString().split('T')[0],
                    purpose_of_visit: '',
                    travel_expenses: '',
                    food_expenses: '',
                    accommodation: '',
                    other_expenses: '',
                    total_expense: 0,
                    approved_amount: '',
                    status: 'Pending Paid',
                  });
                  setShowVisitorForm(true);
                }}
                className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm sm:text-base"
              >
                <Plus className="w-4 h-4" />
                <span>New Site Visit</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 md:mb-6 border-b">
          <div className="flex space-x-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('expos')}
              className={`px-3 sm:px-4 py-2 font-medium text-sm sm:text-base whitespace-nowrap ${
                activeTab === 'expos'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Calendar className="w-4 h-4 inline mr-2" />
              Expo / Seminars
            </button>
            <button
              onClick={() => setActiveTab('visitors')}
              className={`px-3 sm:px-4 py-2 font-medium text-sm sm:text-base whitespace-nowrap ${
                activeTab === 'visitors'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Site Visits
            </button>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'expos' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-4 sm:p-8 text-center text-gray-500">Loading...</div>
            ) : expos.length === 0 ? (
              <div className="p-4 sm:p-8 text-center text-gray-500">No expos/seminars found</div>
            ) : (
              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Event Name</th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Event Type</th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Start Date</th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">End Date</th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Location</th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">City</th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {expos.map((expo) => (
                      <tr key={expo.id} className="hover:bg-gray-50">
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium text-gray-900">{expo.event_name}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">{expo.event_type}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500 hidden md:table-cell">
                          {new Date(expo.start_date).toLocaleDateString()}
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500 hidden md:table-cell">
                          {new Date(expo.end_date).toLocaleDateString()}
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500 hidden lg:table-cell">{expo.location}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500 hidden lg:table-cell">{expo.city || '-'}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-right text-sm font-medium relative">
                          <button
                            onClick={() => {
                              setMenuOpen(menuOpen === expo.id ? null : expo.id);
                              setSelectedExpo(expo);
                            }}
                            className="p-2 hover:bg-gray-100 rounded-lg"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {menuOpen === expo.id && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                              <button
                                onClick={() => {
                                  setViewingExpo(expo);
                                  setMenuOpen(null);
                                }}
                                className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                <Eye className="w-4 h-4" />
                                <span>View</span>
                              </button>
                              <button
                                onClick={() => handleEdit(expo)}
                                className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                <Edit2 className="w-4 h-4" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDelete(expo.id)}
                                className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'visitors' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-red-100/60 bg-gradient-to-r from-red-50 to-amber-50">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Site Visit Format</h2>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={downloadExcelTemplate}
                    className="flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm transition-colors text-sm"
                    title="Download Excel template with proper column format"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Template</span>
                  </button>
                  <label className="flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>{uploadingExcel ? 'Uploading...' : 'Upload Excel'}</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.ods"
                      onChange={handleExcelUpload}
                      className="hidden"
                      disabled={uploadingExcel}
                    />
                  </label>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-600">
                <p>💡 <strong>Note:</strong> Missing columns in your Excel file will be saved as empty values. Download the template to see the correct column format.</p>
              </div>
            </div>
            
            {/* Mobile Card View */}
            <div className="block lg:hidden p-4 space-y-4">
              {siteVisits.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No site visits found. Click "New Site Visit" to add one.</p>
                </div>
              ) : (
                siteVisits.map((visit, index) => (
                  <div key={visit.id} className="bg-white border-2 border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-semibold">#{index + 1}</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          visit.status === 'Pending Paid' ? 'bg-yellow-100 text-yellow-800' :
                          visit.status === 'Approved' ? 'bg-green-100 text-green-800' :
                          visit.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {visit.status || '-'}
                        </span>
                      </div>
                      <div className="flex space-x-1">
                        <button
                          onClick={() => handleViewSiteVisit(visit)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEditSiteVisit(visit)}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSiteVisit(visit.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div><span className="font-semibold text-gray-700">Visitor:</span> <span className="text-gray-900">{visit.visitor_name || '-'}</span></div>
                      <div><span className="font-semibold text-gray-700">Company:</span> <span className="text-gray-900">{visit.company_name || '-'}</span></div>
                      <div><span className="font-semibold text-gray-700">Client:</span> <span className="text-gray-900">{visit.client_name || '-'}</span></div>
                      <div><span className="font-semibold text-gray-700">Location:</span> <span className="text-gray-900">{visit.site_location || '-'}</span></div>
                      <div><span className="font-semibold text-gray-700">Designation:</span> <span className="text-gray-900">{visit.designation || '-'}</span></div>
                      <div><span className="font-semibold text-gray-700">Date:</span> <span className="text-gray-900">{visit.visit_date ? new Date(visit.visit_date).toLocaleDateString() : '-'}</span></div>
                      <div className="pt-2 border-t">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 font-semibold">Total:</span>
                          <span className="text-lg font-bold text-purple-600">{visit.total_expense ? `₹${parseFloat(visit.total_expense).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</span>
                        </div>
                        {visit.approved_amount && (
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-gray-600">Approved:</span>
                            <span className="font-semibold text-green-600">₹{parseFloat(visit.approved_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </div>
                      {visit.remarks && (
                        <div className="pt-2 border-t">
                          <span className="font-semibold text-gray-700">Remarks:</span>
                          <p className="text-gray-900 text-xs mt-1">{visit.remarks}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <div className="inline-block min-w-full align-middle">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-300">
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">Client Name</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">Company Name</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">Location</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">Designation</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">Visit Date</th>
                      <th className="px-2 py-2 text-right text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300 bg-purple-50">Total Amount</th>
                      <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">Approved Status</th>
                      <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider sticky right-0 bg-gradient-to-r from-gray-50 to-gray-100 z-10">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {siteVisits.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-4 py-12 text-center text-gray-500">
                          <div className="flex flex-col items-center">
                            <Users className="w-12 h-12 text-gray-400 mb-2" />
                            <p className="text-sm">No site visits found. Click "New Site Visit" to add one.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      siteVisits.map((visit) => (
                        <tr key={visit.id} className="hover:bg-purple-50 transition-colors">
                          <td className="px-2 py-2 whitespace-nowrap text-xs font-medium text-gray-900 border-r border-gray-200">
                            <div className="max-w-[120px] truncate" title={visit.client_name || '-'}>
                              {visit.client_name || '-'}
                            </div>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900 border-r border-gray-200">
                            <div className="max-w-[120px] truncate" title={visit.company_name || '-'}>
                              {visit.company_name || '-'}
                            </div>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-700 border-r border-gray-200">
                            <div className="max-w-[100px] truncate" title={visit.site_location || '-'}>
                              {visit.site_location || '-'}
                            </div>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-700 border-r border-gray-200">
                            <div className="max-w-[100px] truncate" title={visit.designation || '-'}>
                              {visit.designation || '-'}
                            </div>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-700 border-r border-gray-200">
                            {visit.visit_date ? new Date(visit.visit_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-xs text-right font-bold text-purple-600 border-r border-gray-200 bg-purple-50">
                            {visit.total_expense ? `₹${parseFloat(visit.total_expense).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-center border-r border-gray-200">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                              visit.status === 'Pending Paid' ? 'bg-yellow-100 text-yellow-800' :
                              visit.status === 'Approved' ? 'bg-green-100 text-green-800' :
                              visit.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {visit.status || '-'}
                            </span>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-center sticky right-0 bg-white z-10">
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                onClick={() => handleViewSiteVisit(visit)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="View"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleEditSiteVisit(visit)}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteSiteVisit(visit.id)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Expo Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  {editingExpo ? 'Edit Expo/Seminar' : 'Create New Expo/Seminar'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">Add a new exhibition or seminar participation record</p>
              </div>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingExpo(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Event Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.event_name}
                    onChange={(e) => setFormData({ ...formData, event_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., International Manufacturing Expo 2024"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Event Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.event_type}
                    onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="Exhibition">Exhibition</option>
                    <option value="Seminar">Seminar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Booth/Stall Number</label>
                  <input
                    type="text"
                    value={formData.booth_stall_number}
                    onChange={(e) => setFormData({ ...formData, booth_stall_number: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., A-123"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., Mumbai"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., Bombay Exhibition Centre"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Venue Address</label>
                  <textarea
                    value={formData.venue_address}
                    onChange={(e) => setFormData({ ...formData, venue_address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows={3}
                    placeholder="Full venue address"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows={4}
                    placeholder="Event description, objectives, target audience, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Organizer Name</label>
                  <input
                    type="text"
                    value={formData.organizer_name}
                    onChange={(e) => setFormData({ ...formData, organizer_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Organizer Contact</label>
                  <input
                    type="text"
                    value={formData.organizer_contact}
                    onChange={(e) => setFormData({ ...formData, organizer_contact: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="Email or phone"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows={3}
                    placeholder="Additional notes or observations"
                  />
                </div>
              </div>

              {/* Cost Sheet Section */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Cost Sheet</h3>
                  <button
                    type="button"
                    onClick={addCostSheetItem}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="overflow-x-auto border border-gray-300 rounded-lg">
                  <table className="w-full border-collapse bg-white">
                    <thead>
                      <tr className="bg-gray-100 border-b border-gray-300">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r border-gray-300">Sr. No.</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r border-gray-300 min-w-[200px]">Item Name</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-r border-gray-300 min-w-[100px]">Quantity</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-r border-gray-300 min-w-[120px]">Price (₹)</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-r border-gray-300 min-w-[120px]">Cost (₹)</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 min-w-[120px]">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costSheetItems.map((item, index) => (
                        <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="px-3 py-2 text-center text-sm text-gray-700 border-r border-gray-200">{index + 1}</td>
                          <td className="px-3 py-2 border-r border-gray-200">
                            <input
                              type="text"
                              value={item.item_name}
                              onChange={(e) => updateCostSheetItem(item.id, 'item_name', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-purple-500"
                              placeholder="Enter item name"
                            />
                          </td>
                          <td className="px-3 py-2 border-r border-gray-200">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateCostSheetItem(item.id, 'quantity', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-1 focus:ring-purple-500"
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td className="px-3 py-2 border-r border-gray-200">
                            <input
                              type="number"
                              value={item.price}
                              onChange={(e) => updateCostSheetItem(item.id, 'price', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-1 focus:ring-purple-500"
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td className="px-3 py-2 border-r border-gray-200">
                            <input
                              type="number"
                              value={item.cost}
                              onChange={(e) => updateCostSheetItem(item.id, 'cost', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-1 focus:ring-purple-500"
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                            ₹{parseFloat(item.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-200 font-bold border-t-2 border-gray-400">
                        <td colSpan={5} className="px-3 py-3 text-right text-sm text-gray-900 border-r border-gray-300">
                          Grand Total
                        </td>
                        <td className="px-3 py-3 text-right text-sm text-gray-900">
                          ₹{costSheetItems.reduce((sum, item) => sum + (item.total || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Image Upload Section */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Upload Images</h3>
                  {uploadedImages.length > 0 && (
                    <span className="text-sm text-gray-600">
                      {uploadedImages.length} {uploadedImages.length === 1 ? 'image' : 'images'} uploaded
                    </span>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      <Upload className="w-4 h-4" />
                      <span>{uploadingImages ? 'Uploading...' : 'Select Images'}</span>
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={uploadingImages}
                      />
                    </label>
                    {uploadingImages && (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                        <span className="text-sm text-gray-600">Uploading images...</span>
                      </div>
                    )}
                  </div>

                  {uploadedImages.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-3">
                        Click on an image to view full size. Hover to remove.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {uploadedImages.map((imageUrl, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={imageUrl}
                              alt={`Upload ${index + 1}`}
                              className="w-full h-32 object-cover rounded-lg border-2 border-gray-300 cursor-pointer hover:border-purple-500 transition-all"
                              onClick={() => window.open(imageUrl, '_blank')}
                              onError={(e) => {
                                e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%" y="50%" text-anchor="middle" dy=".3em"%3EImage%3C/text%3E%3C/svg%3E';
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-lg"
                              title="Remove image"
                            >
                              <X className="w-3 h-3" />
                            </button>
                            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                              Image {index + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingExpo(null);
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  {editingExpo ? 'Update Event' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Site Visit Form Modal */}
      {showVisitorForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  {editingSiteVisit ? 'Edit Site Visit' : 'Site Visit Form'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  {editingSiteVisit ? 'Update site visit record' : 'Add a new site visit record'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowVisitorForm(false);
                  setEditingSiteVisit(null);
                  setExecutiveNameInput('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSiteVisitSubmit} className="p-4 sm:p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Executive Name (Multiple name selection should be allowed) <span className="text-red-500">*</span>
                  </label>
                  
                  {/* Display selected executive names as tags */}
                  {siteVisitFormData.executive_names.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {siteVisitFormData.executive_names.map((name, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-full text-sm font-medium"
                        >
                          <span>{name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSiteVisitFormData({
                                ...siteVisitFormData,
                                executive_names: siteVisitFormData.executive_names.filter((_, i) => i !== index)
                              });
                            }}
                            className="hover:bg-purple-200 rounded-full p-0.5 transition-colors"
                            title="Remove name"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Input field with + button */}
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={executiveNameInput}
                        onChange={(e) => setExecutiveNameInput(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && executiveNameInput.trim()) {
                            e.preventDefault();
                            if (!siteVisitFormData.executive_names.includes(executiveNameInput.trim())) {
                              setSiteVisitFormData({
                                ...siteVisitFormData,
                                executive_names: [...siteVisitFormData.executive_names, executiveNameInput.trim()]
                              });
                              setExecutiveNameInput('');
                            }
                          }
                        }}
                        placeholder="Enter executive full name (e.g., John Doe)"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                      {executives.length > 0 && executiveNameInput.trim() && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {executives
                            .filter(exec => 
                              exec.name.toLowerCase().includes(executiveNameInput.toLowerCase()) &&
                              !siteVisitFormData.executive_names.includes(exec.name)
                            )
                            .slice(0, 10)
                            .map((exec) => (
                              <button
                                type="button"
                                key={exec.id}
                                onClick={() => {
                                  if (!siteVisitFormData.executive_names.includes(exec.name)) {
                                    setSiteVisitFormData({
                                      ...siteVisitFormData,
                                      executive_names: [...siteVisitFormData.executive_names, exec.name]
                                    });
                                    setExecutiveNameInput('');
                                  }
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-purple-50 text-sm text-gray-700"
                              >
                                {exec.name}
                              </button>
                            ))}
                          {executives.filter(exec => 
                            exec.name.toLowerCase().includes(executiveNameInput.toLowerCase()) &&
                            !siteVisitFormData.executive_names.includes(exec.name)
                          ).length === 0 && (
                            <div className="px-4 py-2 text-sm text-gray-500">No matching executives found</div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (executiveNameInput.trim() && !siteVisitFormData.executive_names.includes(executiveNameInput.trim())) {
                          setSiteVisitFormData({
                            ...siteVisitFormData,
                            executive_names: [...siteVisitFormData.executive_names, executiveNameInput.trim()]
                          });
                          setExecutiveNameInput('');
                        }
                      }}
                      disabled={!executiveNameInput.trim() || siteVisitFormData.executive_names.includes(executiveNameInput.trim())}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                      title="Add executive name"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  
                  {/* Quick select from existing executives */}
                  {executives.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 mb-1">Quick select from existing executives:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {executives
                          .filter(exec => !siteVisitFormData.executive_names.includes(exec.name))
                          .slice(0, 5)
                          .map((exec) => (
                            <button
                              type="button"
                              key={exec.id}
                              onClick={() => {
                                setSiteVisitFormData({
                                  ...siteVisitFormData,
                                  executive_names: [...siteVisitFormData.executive_names, exec.name]
                                });
                              }}
                              className="px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                            >
                              + {exec.name}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                  
                  {siteVisitFormData.executive_names.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">At least one executive name is required</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Visitor Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={siteVisitFormData.visitor_name}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, visitor_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={siteVisitFormData.company_name}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, company_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Client Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={siteVisitFormData.client_name}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, client_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      required
                      list="clients-list"
                    />
                    <datalist id="clients-list">
                      {clients.map((client) => (
                        <option key={client.id} value={client.client_name} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Designation
                    </label>
                    <input
                      type="text"
                      value={siteVisitFormData.designation}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, designation: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., Manager, Director"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={siteVisitFormData.site_location}
                    onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, site_location: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., Mumbai, Maharashtra"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      value={siteVisitFormData.mobile_number}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, mobile_number: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 9876543210"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email ID
                    </label>
                    <input
                      type="email"
                      value={siteVisitFormData.email_id}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, email_id: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., visitor@company.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Interest
                  </label>
                  <input
                    type="text"
                    value={siteVisitFormData.product_interest}
                    onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, product_interest: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="Products or services of interest"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Discussion Note
                  </label>
                  <textarea
                    value={siteVisitFormData.discussion_note}
                    onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, discussion_note: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows={3}
                    placeholder="Key points discussed during the visit"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Visit Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={siteVisitFormData.visit_date}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, visit_date: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select
                      value={siteVisitFormData.status}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, status: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="Pending Paid">Pending Paid</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Purpose of Visit</label>
                  <textarea
                    value={siteVisitFormData.purpose_of_visit}
                    onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, purpose_of_visit: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows={3}
                    placeholder="Describe the purpose of the site visit"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Travel Expenses (Car/Train/Bus/Auto)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={siteVisitFormData.travel_expenses}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, travel_expenses: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Food Expenses</label>
                    <input
                      type="number"
                      step="0.01"
                      value={siteVisitFormData.food_expenses}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, food_expenses: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Accommodation</label>
                    <input
                      type="number"
                      step="0.01"
                      value={siteVisitFormData.accommodation}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, accommodation: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Other Expenses</label>
                    <input
                      type="number"
                      step="0.01"
                      value={siteVisitFormData.other_expenses}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, other_expenses: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Total Expense</label>
                    <input
                      type="text"
                      value={`₹${siteVisitFormData.total_expense.toFixed(2)}`}
                      readOnly
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Approved Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={siteVisitFormData.approved_amount}
                      onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, approved_amount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowVisitorForm(false);
                    setEditingSiteVisit(null);
                    setExecutiveNameInput('');
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  {editingSiteVisit ? 'Update Site Visit' : 'Create Site Visit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Expo/Seminar Modal */}
      {viewingExpo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Expo/Seminar Details</h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">View complete event information</p>
              </div>
              <button
                onClick={() => setViewingExpo(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              {/* Basic Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-md font-semibold text-gray-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Event Name</p>
                    <p className="font-medium text-gray-900">{viewingExpo.event_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Event Type</p>
                    <p className="font-medium text-gray-900">{viewingExpo.event_type}</p>
                  </div>
                  {viewingExpo.booth_stall_number && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Booth/Stall Number</p>
                      <p className="font-medium text-gray-900">{viewingExpo.booth_stall_number}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Start Date</p>
                    <p className="font-medium text-gray-900">
                      {new Date(viewingExpo.start_date).toLocaleDateString('en-GB', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric' 
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">End Date</p>
                    <p className="font-medium text-gray-900">
                      {new Date(viewingExpo.end_date).toLocaleDateString('en-GB', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric' 
                      })}
                    </p>
                  </div>
                  {viewingExpo.city && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">City</p>
                      <p className="font-medium text-gray-900">{viewingExpo.city}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Location</p>
                    <p className="font-medium text-gray-900">{viewingExpo.location}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Country</p>
                    <p className="font-medium text-gray-900">{viewingExpo.country || 'India'}</p>
                  </div>
                  {viewingExpo.organizer_name && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Organizer Name</p>
                      <p className="font-medium text-gray-900">{viewingExpo.organizer_name}</p>
                    </div>
                  )}
                  {viewingExpo.organizer_contact && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Organizer Contact</p>
                      <p className="font-medium text-gray-900">{viewingExpo.organizer_contact}</p>
                    </div>
                  )}
                </div>
                {viewingExpo.venue_address && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-600 mb-1">Venue Address</p>
                    <p className="font-medium text-gray-900">{viewingExpo.venue_address}</p>
                  </div>
                )}
                {viewingExpo.description && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-600 mb-1">Description</p>
                    <p className="font-medium text-gray-900 whitespace-pre-wrap">{viewingExpo.description}</p>
                  </div>
                )}
                {viewingExpo.notes && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-600 mb-1">Notes</p>
                    <p className="font-medium text-gray-900 whitespace-pre-wrap">{viewingExpo.notes}</p>
                  </div>
                )}
              </div>

              {/* Cost Sheet Section */}
              {viewingExpo.cost_sheet_data && (() => {
                try {
                  const costData = typeof viewingExpo.cost_sheet_data === 'string' 
                    ? JSON.parse(viewingExpo.cost_sheet_data) 
                    : viewingExpo.cost_sheet_data;
                  
                  if (costData.items && costData.items.length > 0) {
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <h3 className="text-md font-semibold text-gray-900 mb-4">Cost Sheet</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse bg-white">
                            <thead>
                              <tr className="bg-gray-100 border-b border-gray-300">
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r border-gray-300">Sr. No.</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r border-gray-300 min-w-[200px]">Item Name</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-r border-gray-300 min-w-[100px]">Quantity</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-r border-gray-300 min-w-[120px]">Price (₹)</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-r border-gray-300 min-w-[120px]">Cost (₹)</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 min-w-[120px]">Total (₹)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {costData.items.map((item, index) => (
                                <tr key={item.id || index} className="border-b border-gray-200 hover:bg-gray-50">
                                  <td className="px-3 py-2 text-center text-sm text-gray-700 border-r border-gray-200">{index + 1}</td>
                                  <td className="px-3 py-2 text-sm text-gray-900 border-r border-gray-200">{item.item_name || '-'}</td>
                                  <td className="px-3 py-2 text-right text-sm text-gray-700 border-r border-gray-200">{item.quantity || 0}</td>
                                  <td className="px-3 py-2 text-right text-sm text-gray-700 border-r border-gray-200">
                                    ₹{parseFloat(item.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-3 py-2 text-right text-sm text-gray-700 border-r border-gray-200">
                                    ₹{parseFloat(item.cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                                    ₹{parseFloat(item.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-gray-200 font-bold border-t-2 border-gray-400">
                                <td colSpan={5} className="px-3 py-3 text-right text-sm text-gray-900 border-r border-gray-300">
                                  Grand Total
                                </td>
                                <td className="px-3 py-3 text-right text-sm text-gray-900">
                                  ₹{costData.total_amount ? parseFloat(costData.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : costData.items.reduce((sum, item) => sum + (item.total || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    );
                  }
                  return null;
                } catch (e) {
                  console.error('Error parsing cost sheet data:', e);
                  return null;
                }
              })()}

              {/* Images Section */}
              {viewingExpo.cost_sheet_data && (() => {
                try {
                  const costData = typeof viewingExpo.cost_sheet_data === 'string' 
                    ? JSON.parse(viewingExpo.cost_sheet_data) 
                    : viewingExpo.cost_sheet_data;
                  
                  if (costData.images && costData.images.length > 0) {
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <h3 className="text-md font-semibold text-gray-900 mb-4">Uploaded Images</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                          {costData.images.map((imageUrl, index) => (
                            <div key={index} className="relative group">
                              <img
                                src={imageUrl}
                                alt={`Expo Image ${index + 1}`}
                                className="w-full h-32 object-cover rounded-lg border border-gray-300 cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(imageUrl, '_blank')}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                } catch (e) {
                  console.error('Error parsing images:', e);
                  return null;
                }
              })()}

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setViewingExpo(null);
                    handleEdit(viewingExpo);
                  }}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Edit
                </button>
                <button
                  onClick={() => setViewingExpo(null)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Site Visit Modal */}
      {viewingSiteVisit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Site Visit Details</h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">View complete site visit information</p>
              </div>
              <button
                onClick={() => setViewingSiteVisit(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6">
              {/* Basic Information Section */}
              <div className="mb-6">
                <h3 className="text-md font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Executive Name</label>
                    <div className="flex flex-wrap gap-1.5">
                      {viewingSiteVisit.executive_names ? (
                        viewingSiteVisit.executive_names.split(',').map((name, idx) => (
                          <span key={idx} className="inline-block px-2.5 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                            {name.trim()}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-gray-500">-</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Visitor Name</label>
                    <p className="text-sm font-medium text-gray-900">{viewingSiteVisit.visitor_name || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Company Name</label>
                    <p className="text-sm font-medium text-gray-900">{viewingSiteVisit.company_name || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Client Name</label>
                    <p className="text-sm font-medium text-gray-900">{viewingSiteVisit.client_name || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Designation</label>
                    <p className="text-sm text-gray-900">{viewingSiteVisit.designation || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Location</label>
                    <p className="text-sm text-gray-900">{viewingSiteVisit.site_location || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Mobile Number</label>
                    <p className="text-sm text-gray-900">{viewingSiteVisit.mobile_number || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Email ID</label>
                    <p className="text-sm text-gray-900 break-all">{viewingSiteVisit.email_id || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Visit Date</label>
                    <p className="text-sm font-medium text-gray-900">
                      {viewingSiteVisit.visit_date ? new Date(viewingSiteVisit.visit_date).toLocaleDateString('en-IN', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric' 
                      }) : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Status</label>
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                      viewingSiteVisit.status === 'Pending Paid' ? 'bg-yellow-100 text-yellow-800' :
                      viewingSiteVisit.status === 'Approved' ? 'bg-green-100 text-green-800' :
                      viewingSiteVisit.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {viewingSiteVisit.status || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Product & Discussion Section */}
              <div className="mb-6">
                <h3 className="text-md font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Product & Discussion</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Product Interest</label>
                    <p className="text-sm text-gray-900">{viewingSiteVisit.product_interest || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Purpose of Visit</label>
                    <p className="text-sm text-gray-900">{viewingSiteVisit.purpose_of_visit || '-'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Discussion Note</label>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg border border-gray-200">
                      {viewingSiteVisit.discussion_note || '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Expenses Section */}
              <div className="mb-6">
                <h3 className="text-md font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Expenses</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Travel Expenses</label>
                    <p className="text-sm font-semibold text-gray-900">
                      {viewingSiteVisit.travel_expenses ? `₹${parseFloat(viewingSiteVisit.travel_expenses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00'}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Food Expenses</label>
                    <p className="text-sm font-semibold text-gray-900">
                      {viewingSiteVisit.food_expenses ? `₹${parseFloat(viewingSiteVisit.food_expenses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00'}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Accommodation</label>
                    <p className="text-sm font-semibold text-gray-900">
                      {viewingSiteVisit.accommodation ? `₹${parseFloat(viewingSiteVisit.accommodation).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00'}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Other Expenses</label>
                    <p className="text-sm font-semibold text-gray-900">
                      {viewingSiteVisit.other_expenses ? `₹${parseFloat(viewingSiteVisit.other_expenses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00'}
                    </p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-300">
                    <label className="block text-xs font-medium text-purple-700 mb-1 uppercase tracking-wide font-bold">Total Expense</label>
                    <p className="text-xl font-bold text-purple-600">
                      {viewingSiteVisit.total_expense ? `₹${parseFloat(viewingSiteVisit.total_expense).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00'}
                    </p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg border-2 border-green-300">
                    <label className="block text-xs font-medium text-green-700 mb-1 uppercase tracking-wide font-bold">Approved Amount</label>
                    <p className="text-xl font-bold text-green-600">
                      {viewingSiteVisit.approved_amount ? `₹${parseFloat(viewingSiteVisit.approved_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setViewingSiteVisit(null);
                    handleEditSiteVisit(viewingSiteVisit);
                  }}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Edit
                </button>
                <button
                  onClick={() => setViewingSiteVisit(null)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpoSeminar;

