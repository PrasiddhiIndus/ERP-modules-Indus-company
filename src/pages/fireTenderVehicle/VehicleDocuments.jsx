import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { uploadFleetFileToR2, buildFleetUploadSegment, parseFleetAttachmentKeys, presignFleetR2Get } from '../../lib/fleetR2';
import FleetAttachmentUploader from './FleetAttachmentUploader';
import { 
  FileText, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Download,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye
} from 'lucide-react';

const VehicleDocuments = ({ vehicleCategory = 'in-house' }) => {
  const [documents, setDocuments] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [pendingAttachmentFiles, setPendingAttachmentFiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [alertFilter, setAlertFilter] = useState('All');

  const [formData, setFormData] = useState({
    vehicle_id: '',
    document_type: '',
    document_number: '',
    issue_date: '',
    expiry_date: '',
    provider: '',
    premium_amount: '',
    r2_attachment_keys: [],
    remarks: ''
  });

  const documentTypes = [
    'RC (Registration Certificate)', 'Insurance', 'Pollution Certificate', 
    'Fitness Certificate', 'Permit', 'AMC Contract', 'Service Contract', 'Other'
  ];

  const defaultDocumentFieldConfig = {
    documentNumberLabel: 'Document number',
    issueDateLabel: 'Issue date',
    expiryDateLabel: 'Expiry date',
    providerLabel: 'Provider / issuing authority',
    secondarySectionTitle: 'Provider & file',
    showIssueDate: true,
    showExpiryDate: true,
    expiryRequired: true,
    showPremium: true,
    showAttachments: true,
    attachmentMultiple: true,
    attachmentMax: 10,
    showRemarks: true
  };

  const documentTypeFieldConfig = {
    'RC (Registration Certificate)': {
      documentNumberLabel: 'RC number',
      issueDateLabel: 'Date of issue',
      expiryDateLabel: 'Registration valid until',
      providerLabel: 'Issuing RTO / authority',
      secondarySectionTitle: 'RTO & file',
      showPremium: false,
      attachmentMax: 6
    },
    Insurance: {
      documentNumberLabel: 'Policy number',
      issueDateLabel: 'Policy start date',
      expiryDateLabel: 'Policy expiry date',
      providerLabel: 'Insurer / broker',
      secondarySectionTitle: 'Insurer, premium & file',
      showPremium: true,
      attachmentMultiple: true,
      attachmentMax: 12
    },
    'Pollution Certificate': {
      documentNumberLabel: 'PUC certificate number',
      issueDateLabel: 'Test date',
      expiryDateLabel: 'PUC valid until',
      providerLabel: 'Testing centre',
      secondarySectionTitle: 'Centre & file',
      showPremium: false,
      attachmentMultiple: false,
      attachmentMax: 2
    },
    'Fitness Certificate': {
      documentNumberLabel: 'Fitness certificate number',
      issueDateLabel: 'Date of issue',
      expiryDateLabel: 'Fitness valid until',
      providerLabel: 'Issuing authority / RTO',
      secondarySectionTitle: 'Authority & file',
      showPremium: false,
      attachmentMax: 6
    },
    Permit: {
      documentNumberLabel: 'Permit number',
      issueDateLabel: 'Issue date',
      expiryDateLabel: 'Permit valid until',
      providerLabel: 'Issuing / permit authority',
      secondarySectionTitle: 'Authority & file',
      showPremium: false,
      attachmentMax: 6
    },
    'AMC Contract': {
      documentNumberLabel: 'Contract / reference number',
      issueDateLabel: 'Contract start date',
      expiryDateLabel: 'Contract end date',
      providerLabel: 'AMC vendor',
      secondarySectionTitle: 'Vendor, fee & file',
      showPremium: true,
      attachmentMax: 12
    },
    'Service Contract': {
      documentNumberLabel: 'Contract / reference number',
      issueDateLabel: 'Contract start date',
      expiryDateLabel: 'Contract end date',
      providerLabel: 'Service provider',
      secondarySectionTitle: 'Provider, fee & file',
      showPremium: true,
      attachmentMax: 12
    },
    Other: {
      documentNumberLabel: 'Reference / document number',
      issueDateLabel: 'Issue date',
      expiryDateLabel: 'Expiry / valid until',
      providerLabel: 'Issuer / organisation',
      secondarySectionTitle: 'Details & file',
      showPremium: true
    }
  };

  const getDocumentFieldConfig = (documentType) => ({
    ...defaultDocumentFieldConfig,
    ...(documentTypeFieldConfig[documentType] || {})
  });

  const alertStatuses = ['Active', 'Warning', 'Expired'];

  useEffect(() => {
    fetchDocuments();
    fetchVehicles();
  }, [vehicleCategory]);

  const fetchDocuments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('operations_fire_tender_vehicle_documents')
        .select(`
          *,
          operations_fire_tender_vehicle_master!inner(registration_number, vehicle_type)
        `)
        .eq('operations_fire_tender_vehicle_master.user_id', user.id)
        .eq('operations_fire_tender_vehicle_master.vehicle_category', vehicleCategory)
        .order('expiry_date', { ascending: true });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('operations_fire_tender_vehicle_master')
        .select('id, registration_number, vehicle_type')
        .eq('user_id', user.id)
        .eq('vehicle_category', vehicleCategory)
        .order('registration_number');

      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const docCfg = getDocumentFieldConfig(formData.document_type);
    const existingCount = (formData.r2_attachment_keys || []).length;
    if (existingCount + pendingAttachmentFiles.length > docCfg.attachmentMax) {
      alert(`Too many attachments for this document type (max ${docCfg.attachmentMax}).`);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const vehicleIdNum = formData.vehicle_id
        ? (typeof formData.vehicle_id === 'number' ? formData.vehicle_id : parseInt(formData.vehicle_id, 10))
        : null;

      const buildPayload = (r2Keys) => ({
        vehicle_id: vehicleIdNum,
        document_type: formData.document_type || null,
        document_number: formData.document_number || null,
        issue_date: formData.issue_date && formData.issue_date.trim() !== '' ? formData.issue_date : null,
        expiry_date: formData.expiry_date && formData.expiry_date.trim() !== '' ? formData.expiry_date : null,
        provider: formData.provider || null,
        premium_amount: formData.premium_amount !== '' && formData.premium_amount != null ? parseFloat(formData.premium_amount) : null,
        remarks: formData.remarks || null,
        r2_attachment_keys: r2Keys,
        file_url: null,
        user_id: user.id,
        alert_status: getAlertStatus(formData.expiry_date),
      });

      let r2Keys = [...(formData.r2_attachment_keys || [])];

      if (editingDocument) {
        const segment = buildFleetUploadSegment(`doc-${editingDocument.id}`);
        for (const file of pendingAttachmentFiles) {
          r2Keys.push(await uploadFleetFileToR2({ file, scope: 'documents', segment }));
        }
        const documentData = buildPayload(r2Keys);
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_documents')
          .update(documentData)
          .eq('id', editingDocument.id);

        if (error) throw error;
        alert('Document updated successfully!');
      } else {
        const { data: row, error: insertError } = await supabase
          .from('operations_fire_tender_vehicle_documents')
          .insert([buildPayload([])])
          .select('id')
          .single();

        if (insertError) throw insertError;
        const segment = buildFleetUploadSegment(`doc-${row.id}`);
        for (const file of pendingAttachmentFiles) {
          r2Keys.push(await uploadFleetFileToR2({ file, scope: 'documents', segment }));
        }
        if (r2Keys.length) {
          const { error: upErr } = await supabase
            .from('operations_fire_tender_vehicle_documents')
            .update({ r2_attachment_keys: r2Keys })
            .eq('id', row.id);
          if (upErr) throw upErr;
        }
        alert('Document added successfully!');
      }

      resetForm();
      fetchDocuments();
    } catch (error) {
      console.error('Error saving document:', error);
      alert(error?.message || 'Failed to save document. Please try again.');
    }
  };

  const getAlertStatus = (expiryDate) => {
    if (!expiryDate) return 'Active';
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) return 'Expired';
    if (daysUntilExpiry <= 30) return 'Warning';
    return 'Active';
  };

  const handleEdit = (document) => {
    setEditingDocument(document);
    setPendingAttachmentFiles([]);
    setFormData({
      vehicle_id: document.vehicle_id || '',
      document_type: document.document_type || '',
      document_number: document.document_number || '',
      issue_date: document.issue_date || '',
      expiry_date: document.expiry_date || '',
      provider: document.provider || '',
      premium_amount: document.premium_amount || '',
      r2_attachment_keys: parseFleetAttachmentKeys(document, 'file_url'),
      remarks: document.remarks || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this document?')) {
      try {
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_documents')
          .delete()
          .eq('id', id);

        if (error) throw error;
        alert('Document deleted successfully!');
        fetchDocuments();
      } catch (error) {
        console.error('Error deleting document:', error);
        alert('Failed to delete document. Please try again.');
      }
    }
  };

  const resetForm = () => {
    setPendingAttachmentFiles([]);
    setFormData({
      vehicle_id: '',
      document_type: '',
      document_number: '',
      issue_date: '',
      expiry_date: '',
      provider: '',
      premium_amount: '',
      r2_attachment_keys: [],
      remarks: ''
    });
    setEditingDocument(null);
    setShowForm(false);
  };

  const getAlertColor = (alertStatus) => {
    switch (alertStatus) {
      case 'Expired': return 'bg-red-100 text-red-800';
      case 'Warning': return 'bg-yellow-100 text-yellow-800';
      case 'Active': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAlertIcon = (alertStatus) => {
    switch (alertStatus) {
      case 'Expired': return <AlertTriangle className="h-4 w-4" />;
      case 'Warning': return <Clock className="h-4 w-4" />;
      case 'Active': return <CheckCircle className="h-4 w-4" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };

  const getDaysUntilExpiry = (expiryDate) => {
    if (!expiryDate) return null;
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry;
  };

  const openDocumentAttachment = async (objectKey) => {
    try {
      const url = await presignFleetR2Get(objectKey);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      alert(err?.message || 'Could not open file.');
    }
  };

  const filteredDocuments = documents.filter(document => {
    const vm = document.operations_fire_tender_vehicle_master;
    const matchesSearch = 
      vm?.registration_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      document.document_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      document.document_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      document.provider?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === 'All' || document.document_type === typeFilter;
    const matchesAlert = alertFilter === 'All' || document.alert_status === alertFilter;
    
    return matchesSearch && matchesType && matchesAlert;
  });

  const docFieldCfg = getDocumentFieldConfig(formData.document_type);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Vehicle Documents</h1>
          <p className="text-gray-600 mt-2">Manage vehicle documents and track expiries</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus className="h-5 w-5" />
          <span>Add Document</span>
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="All">All Types</option>
            {documentTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={alertFilter}
            onChange={(e) => setAlertFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="All">All Alerts</option>
            {alertStatuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center justify-center space-x-2">
            <Download className="h-5 w-5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Document Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingDocument ? 'Edit Document' : 'Add New Document'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Document Details</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle *</label>
                    <select
                      value={formData.vehicle_id}
                      onChange={(e) => setFormData({...formData, vehicle_id: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="">Select Vehicle</option>
                      {vehicles.map(vehicle => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.registration_number} - {vehicle.vehicle_type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Document Type *</label>
                    <select
                      value={formData.document_type}
                      onChange={(e) => {
                        const next = e.target.value;
                        const nextCfg = getDocumentFieldConfig(next);
                        setFormData((prev) => ({
                          ...prev,
                          document_type: next,
                          ...(!nextCfg.showPremium ? { premium_amount: '' } : {})
                        }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="">Select Document Type</option>
                      {documentTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{docFieldCfg.documentNumberLabel}</label>
                    <input
                      type="text"
                      value={formData.document_number}
                      onChange={(e) => setFormData({...formData, document_number: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {docFieldCfg.showIssueDate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{docFieldCfg.issueDateLabel}</label>
                    <input
                      type="date"
                      value={formData.issue_date}
                      onChange={(e) => setFormData({...formData, issue_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  )}

                  {docFieldCfg.showExpiryDate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{docFieldCfg.expiryDateLabel} *</label>
                    <input
                      type="date"
                      value={formData.expiry_date}
                      onChange={(e) => setFormData({...formData, expiry_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required={docFieldCfg.expiryRequired}
                    />
                  </div>
                  )}
                </div>

                {/* Provider and File */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">{docFieldCfg.secondarySectionTitle}</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{docFieldCfg.providerLabel}</label>
                    <input
                      type="text"
                      value={formData.provider}
                      onChange={(e) => setFormData({...formData, provider: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {docFieldCfg.showPremium && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Premium / fee amount (₹)</label>
                    <input
                      type="number"
                      value={formData.premium_amount}
                      onChange={(e) => setFormData({...formData, premium_amount: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  )}

                  {docFieldCfg.showAttachments && (
                    <FleetAttachmentUploader
                      savedKeys={formData.r2_attachment_keys || []}
                      onRemoveSavedKey={(key) =>
                        setFormData((prev) => ({
                          ...prev,
                          r2_attachment_keys: (prev.r2_attachment_keys || []).filter((k) => k !== key),
                        }))
                      }
                      pendingFiles={pendingAttachmentFiles}
                      onPendingAdd={(files) =>
                        setPendingAttachmentFiles((prev) => [...prev, ...files])
                      }
                      onRemovePending={(idx) =>
                        setPendingAttachmentFiles((prev) => prev.filter((_, i) => i !== idx))
                      }
                      multiple={docFieldCfg.attachmentMultiple}
                      maxTotal={docFieldCfg.attachmentMax}
                    />
                  )}

                  {docFieldCfg.showRemarks && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
                    <textarea
                      value={formData.remarks}
                      onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingDocument ? 'Update Document' : 'Add Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Documents Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Vehicle Documents ({filteredDocuments.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vehicle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Provider
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expiry Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Alert Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDocuments.map((document) => {
                const daysUntilExpiry = getDaysUntilExpiry(document.expiry_date);
                return (
                  <tr key={document.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {document.operations_fire_tender_vehicle_master?.registration_number}
                        </div>
                        <div className="text-sm text-gray-500">
                          {document.operations_fire_tender_vehicle_master?.vehicle_type}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{document.document_type}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {document.document_number || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {document.provider || '-'}
                      </div>
                      {document.premium_amount && (
                        <div className="text-sm text-gray-500">
                          ₹{document.premium_amount.toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm text-gray-900">
                          {document.expiry_date ? new Date(document.expiry_date).toLocaleDateString() : '-'}
                        </div>
                        {daysUntilExpiry !== null && (
                          <div className={`text-xs ${
                            daysUntilExpiry < 0 ? 'text-red-600' :
                            daysUntilExpiry <= 30 ? 'text-yellow-600' : 'text-green-600'
                          }`}>
                            {daysUntilExpiry < 0 ? `${Math.abs(daysUntilExpiry)} days overdue` :
                             daysUntilExpiry === 0 ? 'Expires today' :
                             `${daysUntilExpiry} days remaining`}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getAlertColor(document.alert_status)}`}>
                        {getAlertIcon(document.alert_status)}
                        <span className="ml-1">{document.alert_status}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex flex-wrap items-center gap-1">
                        {parseFleetAttachmentKeys(document, 'file_url').map((key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => openDocumentAttachment(key)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Open attachment"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        ))}
                        {document.file_url && String(document.file_url).trim().match(/^https?:\/\//i) && (
                          <a
                            href={document.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-900"
                            title="Legacy URL"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => handleEdit(document)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit Document"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(document.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Document"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredDocuments.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No documents found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleDocuments;
