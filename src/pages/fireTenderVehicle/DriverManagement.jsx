import { formatDateDdMmYyyy } from '../../utils/dateDisplay';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { uploadFleetFileToR2, buildFleetUploadSegment, parseFleetAttachmentKeys, presignFleetR2Get, fileLabelFromR2Key, appendFleetDocumentHistory, markFleetDocumentHistoryEntry } from '../../lib/fleetR2';
import FleetAttachmentUploader from './FleetAttachmentUploader';;
import FormDateInput from "../../components/FormDateInput";

import { 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Filter,
  Download,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  Paperclip
} from 'lucide-react';

const DriverManagement = ({ vehicleCategory: _fleetVehicleCategory } = {}) => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [pendingDriverFiles, setPendingDriverFiles] = useState([]);
  const [pendingReplacements, setPendingReplacements] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [licenseTypeFilter, setLicenseTypeFilter] = useState('All');

  const [formData, setFormData] = useState({
    employee_id: '',
    full_name: '',
    contact_number: '',
    email: '',
    license_number: '',
    license_type: [],
    license_expiry_date: '',
    department: '',
    designation: '',
    is_active: true,
    r2_attachment_keys: [],
    r2_document_history: []
  });

  const licenseTypes = [
    'LMV (Light Motor Vehicle)', 'HMV (Heavy Motor Vehicle)', 
    'Motorcycle', 'Commercial Vehicle', 'PSV (Public Service Vehicle)', 'Other'
  ];

  const statusOptions = ['Active', 'Inactive'];

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('operations_fire_tender_vehicle_drivers')
        .select('*')
        .order('full_name');

      if (error) throw error;
      setDrivers(data || []);
    } catch (error) {
      console.error('Error fetching drivers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const maxFiles = 15;
    if ((formData.r2_attachment_keys || []).length + pendingDriverFiles.length + pendingReplacements.length > maxFiles) {
      alert(`Too many files (max ${maxFiles}).`);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const driverFields = {
        employee_id: formData.employee_id || null,
        full_name: formData.full_name || null,
        contact_number: formData.contact_number || null,
        email: formData.email || null,
        license_number: formData.license_number || null,
        license_type: formData.license_type.length ? formData.license_type.join(', ') : null,
        license_expiry_date: formData.license_expiry_date && formData.license_expiry_date.trim() !== '' ? formData.license_expiry_date : null,
        department: formData.department || null,
        designation: formData.designation || null,
        is_active: formData.is_active === 'true' || formData.is_active === true,
        user_id: user.id
      };

      let r2Keys = [...(formData.r2_attachment_keys || [])];
      let documentHistory = Array.isArray(formData.r2_document_history) ? [...formData.r2_document_history] : [];

      const uploadPendingFiles = async (segment) => {
        for (const file of pendingDriverFiles) {
          const key = await uploadFleetFileToR2({ file, scope: 'drivers', segment });
          r2Keys.push(key);
          documentHistory = appendFleetDocumentHistory(documentHistory, {
            key,
            file_name: file.name,
            status: 'active',
          });
        }
        for (const { oldKey, file } of pendingReplacements) {
          const key = await uploadFleetFileToR2({ file, scope: 'drivers', segment });
          r2Keys = r2Keys.filter((k) => k !== oldKey);
          r2Keys.push(key);
          documentHistory = markFleetDocumentHistoryEntry(documentHistory, oldKey, 'replaced', { replaced_by: key });
          documentHistory = appendFleetDocumentHistory(documentHistory, {
            key,
            file_name: file.name,
            status: 'active',
          });
        }
      };

      if (editingDriver) {
        const segment = buildFleetUploadSegment(`driver-${editingDriver.id}`);
        await uploadPendingFiles(segment);
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_drivers')
          .update({ ...driverFields, r2_attachment_keys: r2Keys, r2_document_history: documentHistory })
          .eq('id', editingDriver.id);

        if (error) throw error;
        alert('Driver updated successfully!');
      } else {
        const { data: row, error: insertError } = await supabase
          .from('operations_fire_tender_vehicle_drivers')
          .insert([{ ...driverFields, r2_attachment_keys: [], r2_document_history: [] }])
          .select('id')
          .single();

        if (insertError) throw insertError;
        const segment = buildFleetUploadSegment(`driver-${row.id}`);
        await uploadPendingFiles(segment);
        if (r2Keys.length || documentHistory.length) {
          const { error: upErr } = await supabase
            .from('operations_fire_tender_vehicle_drivers')
            .update({ r2_attachment_keys: r2Keys, r2_document_history: documentHistory })
            .eq('id', row.id);
          if (upErr) throw upErr;
        }
        alert('Driver added successfully!');
      }

      resetForm();
      fetchDrivers();
    } catch (error) {
      console.error('Error saving driver:', error);
      alert(error?.message || 'Failed to save driver. Please try again.');
    }
  };

  const handleEdit = (driver) => {
    setEditingDriver(driver);
    setPendingDriverFiles([]);
    setPendingReplacements([]);
    setFormData({
      employee_id: driver.employee_id || '',
      full_name: driver.full_name || '',
      contact_number: driver.contact_number || '',
      email: driver.email || '',
      license_number: driver.license_number || '',
      license_type: driver.license_type ? driver.license_type.split(',').map((type) => type.trim()).filter(Boolean) : [],
      license_expiry_date: driver.license_expiry_date || '',
      department: driver.department || '',
      designation: driver.designation || '',
      is_active: driver.is_active,
      r2_attachment_keys: parseFleetAttachmentKeys(driver, null),
      r2_document_history: (() => {
        const hist = Array.isArray(driver.r2_document_history) ? driver.r2_document_history : [];
        if (hist.length) return hist;
        return parseFleetAttachmentKeys(driver, null).map((key) => ({
          key,
          file_name: fileLabelFromR2Key(key),
          uploaded_at: driver.updated_at || driver.created_at || new Date().toISOString(),
          status: 'active',
        }));
      })()
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this driver?')) {
      try {
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_drivers')
          .delete()
          .eq('id', id);

        if (error) throw error;
        alert('Driver deleted successfully!');
        fetchDrivers();
      } catch (error) {
        console.error('Error deleting driver:', error);
        alert('Failed to delete driver. Please try again.');
      }
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      const { error } = await supabase
        .from('operations_fire_tender_vehicle_drivers')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      alert(`Driver ${!currentStatus ? 'activated' : 'deactivated'} successfully!`);
      fetchDrivers();
    } catch (error) {
      console.error('Error updating driver status:', error);
      alert('Failed to update driver status. Please try again.');
    }
  };

  const resetForm = () => {
    setPendingDriverFiles([]);
    setPendingReplacements([]);
    setFormData({
      employee_id: '',
      full_name: '',
      contact_number: '',
      email: '',
      license_number: '',
      license_type: [],
      license_expiry_date: '',
      department: '',
      designation: '',
      is_active: true,
      r2_attachment_keys: [],
      r2_document_history: []
    });
    setEditingDriver(null);
    setShowForm(false);
  };

  const handleRemoveDriverAttachment = (key) => {
    setFormData((prev) => ({
      ...prev,
      r2_attachment_keys: (prev.r2_attachment_keys || []).filter((k) => k !== key),
      r2_document_history: markFleetDocumentHistoryEntry(prev.r2_document_history, key, 'deleted'),
    }));
  };

  const handleReplaceDriverAttachment = (oldKey, file) => {
    setPendingReplacements((prev) => {
      const withoutOld = prev.filter((item) => item.oldKey !== oldKey);
      return [...withoutOld, { oldKey, file }];
    });
  };

  const getHistoryStatusClass = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'replaced': return 'bg-amber-100 text-amber-800';
      case 'deleted': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  const openDriverAttachment = async (objectKey) => {
    try {
      const url = await presignFleetR2Get(objectKey);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      alert(err?.message || 'Could not open file.');
    }
  };

  const getStatusColor = (isActive) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const getStatusIcon = (isActive) => {
    return isActive ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />;
  };

  const getLicenseExpiryStatus = (expiryDate) => {
    if (!expiryDate) return null;
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) return { status: 'expired', days: Math.abs(daysUntilExpiry) };
    if (daysUntilExpiry <= 30) return { status: 'warning', days: daysUntilExpiry };
    return { status: 'valid', days: daysUntilExpiry };
  };

  const filteredDrivers = drivers.filter(driver => {
    const matchesSearch = 
      driver.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.employee_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.contact_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.license_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.department?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'All' || 
      (statusFilter === 'Active' && driver.is_active) ||
      (statusFilter === 'Inactive' && !driver.is_active);
    
    const matchesLicenseType = licenseTypeFilter === 'All' || (driver.license_type || '').includes(licenseTypeFilter);
    
    return matchesSearch && matchesStatus && matchesLicenseType;
  });

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
          <h1 className="text-3xl font-bold text-gray-900">Driver Management</h1>
          <p className="text-gray-600 mt-2">Manage driver information and licenses</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus className="h-5 w-5" />
          <span>Add Driver</span>
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search drivers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="All">All Status</option>
            {statusOptions.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select
            value={licenseTypeFilter}
            onChange={(e) => setLicenseTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="All">All License Types</option>
            {licenseTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <button className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center justify-center space-x-2">
            <Download className="h-5 w-5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Driver Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingDriver ? 'Edit Driver' : 'Add New Driver'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Personal Information</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Employee ID</label>
                    <input
                      type="text"
                      value={formData.employee_id}
                      onChange={(e) => setFormData({...formData, employee_id: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contact Number</label>
                    <input
                      type="tel"
                      value={formData.contact_number}
                      onChange={(e) => setFormData({...formData, contact_number: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({...formData, department: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Designation</label>
                    <input
                      type="text"
                      value={formData.designation}
                      onChange={(e) => setFormData({...formData, designation: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* License Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">License Information</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">License Number</label>
                    <input
                      type="text"
                      value={formData.license_number}
                      onChange={(e) => setFormData({...formData, license_number: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">License Type</label>
                    <select
                      multiple
                      value={formData.license_type}
                      onChange={(e) => setFormData({ ...formData, license_type: Array.from(e.target.selectedOptions, (option) => option.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {licenseTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Hold Ctrl (Windows) or Cmd (Mac) to select multiple license types.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">License Expiry Date</label>
                    <FormDateInput value={formData.license_expiry_date} onChange={(e) => setFormData({...formData, license_expiry_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select
                      value={formData.is_active}
                      onChange={(e) => setFormData({...formData, is_active: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value={true}>Active</option>
                      <option value={false}>Inactive</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Certificates &amp; Licenses</h3>
                <FleetAttachmentUploader
                  label="Upload certificates, licenses, and supporting documents"
                  savedKeys={formData.r2_attachment_keys || []}
                  onRemoveSavedKey={handleRemoveDriverAttachment}
                  onReplaceSavedKey={handleReplaceDriverAttachment}
                  pendingFiles={[
                    ...pendingDriverFiles,
                    ...pendingReplacements.map(({ file }) => file),
                  ]}
                  onPendingAdd={(files) => setPendingDriverFiles((prev) => [...prev, ...files])}
                  onRemovePending={(idx) => {
                    if (idx < pendingDriverFiles.length) {
                      setPendingDriverFiles((prev) => prev.filter((_, i) => i !== idx));
                    } else {
                      const repIdx = idx - pendingDriverFiles.length;
                      setPendingReplacements((prev) => prev.filter((_, i) => i !== repIdx));
                    }
                  }}
                  multiple
                  maxTotal={15}
                  helperText="Driving license, medical certificate, training proof, and other credentials. PDF, JPG, JPEG, PNG, DOC, DOCX (max 25 MB each)."
                />

                {(formData.r2_document_history || []).length > 0 && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Document history</h4>
                    <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
                      {[...(formData.r2_document_history || [])]
                        .slice()
                        .reverse()
                        .map((entry) => (
                          <li key={`${entry.key}-${entry.uploaded_at}`} className="flex flex-wrap items-center justify-between gap-2">
                            <span className="truncate text-gray-800" title={entry.file_name || entry.key}>
                              {entry.file_name || fileLabelFromR2Key(entry.key)}
                            </span>
                            <span className="flex items-center gap-2 shrink-0">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getHistoryStatusClass(entry.status)}`}>
                                {entry.status}
                              </span>
                              <span className="text-xs text-gray-500">
                                {entry.uploaded_at ? formatDateDdMmYyyy(entry.uploaded_at.slice(0, 10)) : '—'}
                              </span>
                              {entry.status !== 'deleted' && (
                                <button
                                  type="button"
                                  onClick={() => openDriverAttachment(entry.key)}
                                  className="text-blue-600 hover:text-blue-900"
                                  title="View"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              )}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
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
                  {editingDriver ? 'Update Driver' : 'Add Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drivers Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Drivers ({filteredDrivers.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  S.No
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Driver Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  License
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Files
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDrivers.map((driver, idx) => {
                const licenseExpiry = getLicenseExpiryStatus(driver.license_expiry_date);
                return (
                  <tr key={driver.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-center tabular-nums">{idx + 1}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {driver.full_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {driver.employee_id || 'No ID'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {driver.designation || 'Driver'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        {driver.contact_number && (
                          <div className="text-sm text-gray-900 flex items-center">
                            <Phone className="h-4 w-4 mr-1" />
                            {driver.contact_number}
                          </div>
                        )}
                        {driver.email && (
                          <div className="text-sm text-gray-500 flex items-center">
                            <Mail className="h-4 w-4 mr-1" />
                            {driver.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm text-gray-900">
                          {driver.license_number || '-'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {driver.license_type || '-'}
                        </div>
                        {driver.license_expiry_date && (
                          <div>
                            <div className="text-sm text-gray-500">
                              Expires: {formatDateDdMmYyyy(driver.license_expiry_date)}
                            </div>
                            {licenseExpiry && (
                              <div className={`text-xs ${
                                licenseExpiry.status === 'expired' ? 'text-red-600' :
                                licenseExpiry.status === 'warning' ? 'text-yellow-600' : 'text-green-600'
                              }`}>
                                {licenseExpiry.status === 'expired' ? `${licenseExpiry.days} days overdue` :
                                 licenseExpiry.status === 'warning' ? `${licenseExpiry.days} days remaining` :
                                 'Valid'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {driver.department || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1">
                        {(() => {
                          const keys = parseFleetAttachmentKeys(driver, null);
                          if (!keys.length) {
                            return <span className="text-sm text-gray-400">—</span>;
                          }
                          return (
                            <>
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Paperclip className="h-3.5 w-3.5" />
                                {keys.length}
                              </span>
                              {keys.map((key) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => openDriverAttachment(key)}
                                  className="text-blue-600 hover:text-blue-900"
                                  title="Open file"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(driver.is_active)}`}>
                        {getStatusIcon(driver.is_active)}
                        <span className="ml-1">{driver.is_active ? 'Active' : 'Inactive'}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleToggleStatus(driver.id, driver.is_active)}
                          className={`${driver.is_active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                          title={driver.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {driver.is_active ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => handleEdit(driver)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit Driver"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(driver.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Driver"
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
        {filteredDrivers.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No drivers found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverManagement;
