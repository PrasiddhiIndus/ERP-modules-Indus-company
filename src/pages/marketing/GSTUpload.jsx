import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2 } from 'lucide-react';

const GSTUpload = () => {
  const [loading, setLoading] = useState(true);
  const [gstData, setGstData] = useState({
    gstCodes: [],
    gstStructure: [],
    productServiceTypes: []
  });
  const [currentDocumentId, setCurrentDocumentId] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [editingTableType, setEditingTableType] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormType, setCreateFormType] = useState(null);
  const [newRowData, setNewRowData] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadOrCreateGSTData();
  }, []);

  const loadOrCreateGSTData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      // Try to find existing GST data document
      const { data: existingDocs, error: fetchError } = await supabase
        .from('marketing_gst_documents')
        .select('*')
        .eq('is_active', true)
        .order('uploaded_at', { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      if (existingDocs && existingDocs.length > 0 && existingDocs[0].gst_data) {
        // Load existing data
        const existingData = existingDocs[0].gst_data;
        setGstData({
          gstCodes: existingData.gstCodes || [],
          gstStructure: existingData.gstStructure || [],
          productServiceTypes: existingData.productServiceTypes || []
        });
        setCurrentDocumentId(existingDocs[0].id);
      } else {
        // Create new document with empty data
        const newData = {
          gstCodes: [],
          gstStructure: [],
          productServiceTypes: []
        };
        
        const { data: newDoc, error: createError } = await supabase
          .from('marketing_gst_documents')
          .insert([{
            document_name: 'GST Master Data',
            document_type: 'Master',
            gst_number: '',
            description: 'GST master data managed directly',
            is_active: true,
            file_path: null,
            file_size: 0,
            uploaded_by: user.id,
            gst_data: newData,
          }])
          .select()
          .single();

        if (createError) throw createError;
        
        setGstData(newData);
        setCurrentDocumentId(newDoc.id);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading GST data:', error);
      // Initialize with empty data if error
      setGstData({
        gstCodes: [],
        gstStructure: [],
        productServiceTypes: []
      });
      setLoading(false);
    }
  };

  const handleEditRow = (tableType, index) => {
    setEditingTableType(tableType);
    setEditingRow(index);
    if (tableType === 'gstCodes') {
      setNewRowData({ ...gstData.gstCodes[index] });
    } else if (tableType === 'gstStructure') {
      setNewRowData({ ...gstData.gstStructure[index] });
    } else if (tableType === 'productServiceTypes') {
      setNewRowData({ ...gstData.productServiceTypes[index] });
    }
  };

  const handleDeleteRow = async (tableType, index) => {
    if (!confirm('Are you sure you want to delete this row?')) return;

    const updatedData = JSON.parse(JSON.stringify(gstData));
    
    if (tableType === 'gstCodes') {
      updatedData.gstCodes.splice(index, 1);
    } else if (tableType === 'gstStructure') {
      updatedData.gstStructure.splice(index, 1);
    } else if (tableType === 'productServiceTypes') {
      updatedData.productServiceTypes.splice(index, 1);
    }

    setGstData(updatedData);
    await saveGstData(updatedData);
  };

  const handleSaveEdit = async () => {
    if (!editingTableType || editingRow === null) return;

    const updatedData = JSON.parse(JSON.stringify(gstData));
    
    if (editingTableType === 'gstCodes') {
      updatedData.gstCodes[editingRow] = { ...newRowData };
    } else if (editingTableType === 'gstStructure') {
      updatedData.gstStructure[editingRow] = { ...newRowData };
    } else if (editingTableType === 'productServiceTypes') {
      updatedData.productServiceTypes[editingRow] = { ...newRowData };
    }

    setGstData(updatedData);
    setEditingRow(null);
    setEditingTableType(null);
    setNewRowData({});
    await saveGstData(updatedData);
  };

  const handleCancelEdit = () => {
    setEditingRow(null);
    setEditingTableType(null);
    setNewRowData({});
  };

  const handleCreateNew = (tableType) => {
    setCreateFormType(tableType);
    setShowCreateForm(true);
    if (tableType === 'gstCodes') {
      setNewRowData({ gst_code: '', gst_rate: '', gst_type: '', usage: '' });
    } else if (tableType === 'gstStructure') {
      setNewRowData({ gst_rate: '', cgst: '', sgst: '', igst: '' });
    } else if (tableType === 'productServiceTypes') {
      setNewRowData({ product_service_type: '', default_gst_rate: '' });
    }
  };

  const handleSaveCreate = async () => {
    if (!createFormType) return;

    const updatedData = JSON.parse(JSON.stringify(gstData));
    
    if (!updatedData.gstCodes) updatedData.gstCodes = [];
    if (!updatedData.gstStructure) updatedData.gstStructure = [];
    if (!updatedData.productServiceTypes) updatedData.productServiceTypes = [];

    if (createFormType === 'gstCodes') {
      updatedData.gstCodes.push({ ...newRowData });
    } else if (createFormType === 'gstStructure') {
      updatedData.gstStructure.push({ ...newRowData });
    } else if (createFormType === 'productServiceTypes') {
      updatedData.productServiceTypes.push({ ...newRowData });
    }

    setGstData(updatedData);
    setShowCreateForm(false);
    setCreateFormType(null);
    setNewRowData({});
    await saveGstData(updatedData);
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setCreateFormType(null);
    setNewRowData({});
  };

  const saveGstData = async (dataToSave) => {
    if (!currentDocumentId) {
      // Create new document if doesn't exist
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: newDoc, error: createError } = await supabase
          .from('marketing_gst_documents')
          .insert([{
            document_name: 'GST Master Data',
            document_type: 'Master',
            gst_number: '',
            description: 'GST master data managed directly',
            is_active: true,
            file_path: null,
            file_size: 0,
            uploaded_by: user.id,
            gst_data: dataToSave,
          }])
          .select()
          .single();

        if (createError) throw createError;
        setCurrentDocumentId(newDoc.id);
        return;
      } catch (error) {
        console.error('Error creating GST document:', error);
        alert('Error saving GST data: ' + error.message);
        return;
      }
    }
    
    try {
      setSaving(true);
      const { error } = await supabase
        .from('marketing_gst_documents')
        .update({ gst_data: dataToSave })
        .eq('id', currentDocumentId);

      if (error) throw error;
      
      // Silent save - no alert to avoid interruption
    } catch (error) {
      console.error('Error saving GST data:', error);
      alert('Error saving GST data: ' + error.message);
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      {/* Header */}
      <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">GST Data Management</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Manage GST codes, structure, and product/service types</p>
          </div>
          {saving && (
            <div className="flex items-center px-4 py-2 text-sm text-blue-600">
              <span>Saving...</span>
            </div>
          )}
        </div>
      </div>

      {/* GST Tables Display */}
      {loading ? (
        <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg">
          <div className="p-8 text-center text-gray-500">Loading GST data...</div>
        </div>
      ) : (
        <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg" data-gst-tables-section>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">GST Data Tables</h2>
              <p className="text-sm text-gray-600 mt-1">Create and manage your GST data directly</p>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-blue-900 mb-3">Data Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded p-3">
                <p className="text-xs text-gray-600">GST Codes</p>
                <p className="text-lg font-bold text-gray-900">
                  {gstData.gstCodes?.length || 0} items
                </p>
                {gstData.gstCodes && gstData.gstCodes.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">✓ Data available</p>
                )}
                {(!gstData.gstCodes || gstData.gstCodes.length === 0) && (
                  <p className="text-xs text-gray-500 mt-1">No data - Add manually</p>
                )}
              </div>
              <div className="bg-white rounded p-3">
                <p className="text-xs text-gray-600">GST Structure</p>
                <p className="text-lg font-bold text-gray-900">
                  {gstData.gstStructure?.length || 0} items
                </p>
                {gstData.gstStructure && gstData.gstStructure.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">✓ Data available</p>
                )}
                {(!gstData.gstStructure || gstData.gstStructure.length === 0) && (
                  <p className="text-xs text-gray-500 mt-1">No data - Add manually</p>
                )}
              </div>
              <div className="bg-white rounded p-3">
                <p className="text-xs text-gray-600">Product/Service Types</p>
                <p className="text-lg font-bold text-gray-900">
                  {gstData.productServiceTypes?.length || 0} items
                </p>
                {gstData.productServiceTypes && gstData.productServiceTypes.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">✓ Data available</p>
                )}
                {(!gstData.productServiceTypes || gstData.productServiceTypes.length === 0) && (
                  <p className="text-xs text-gray-500 mt-1">No data - Add manually</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* GST Codes Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden border">
                <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b">
                  <h3 className="text-md font-semibold text-gray-700">GST Codes and Usage</h3>
                  {!showCreateForm && (
                    <button
                      onClick={() => handleCreateNew('gstCodes')}
                      className="px-4 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                    >
                      + Add GST Code
                    </button>
                  )}
                </div>
                {(!gstData.gstCodes || gstData.gstCodes.length === 0) && !showCreateForm && (
                  <div className="p-4 text-center">
                    <p className="text-gray-500 text-sm mb-3">No GST codes available</p>
                    <button
                      onClick={() => handleCreateNew('gstCodes')}
                      className="px-4 py-2 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                    >
                      + Create First GST Code
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="border px-4 py-2 text-left text-sm font-medium text-gray-700 whitespace-nowrap">GST_Code</th>
                        <th className="border px-4 py-2 text-left text-sm font-medium text-gray-700 whitespace-nowrap">GST_Rate (%)</th>
                        <th className="border px-4 py-2 text-left text-sm font-medium text-gray-700 whitespace-nowrap">GST_Type</th>
                        <th className="border px-4 py-2 text-left text-sm font-medium text-gray-700">Usage</th>
                        <th className="border px-4 py-2 text-center text-sm font-medium text-gray-700 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {(!gstData.gstCodes || gstData.gstCodes.length === 0) && !showCreateForm && (
                        <tr>
                          <td colSpan="5" className="border px-4 py-8 text-center text-gray-500">
                            No GST codes found. Click "+ Add GST Code" to create one.
                          </td>
                        </tr>
                      )}
                      {gstData.gstCodes && gstData.gstCodes.length > 0 && gstData.gstCodes.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          {editingRow === index && editingTableType === 'gstCodes' ? (
                            <>
                              <td className="border px-4 py-2">
                                <input
                                  type="text"
                                  value={newRowData.gst_code || ''}
                                  onChange={(e) => setNewRowData({ ...newRowData, gst_code: e.target.value })}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </td>
                              <td className="border px-4 py-2">
                                <input
                                  type="text"
                                  value={newRowData.gst_rate || ''}
                                  onChange={(e) => setNewRowData({ ...newRowData, gst_rate: e.target.value })}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </td>
                              <td className="border px-4 py-2">
                                <input
                                  type="text"
                                  value={newRowData.gst_type || ''}
                                  onChange={(e) => setNewRowData({ ...newRowData, gst_type: e.target.value })}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </td>
                              <td className="border px-4 py-2">
                                <input
                                  type="text"
                                  value={newRowData.usage || ''}
                                  onChange={(e) => setNewRowData({ ...newRowData, usage: e.target.value })}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </td>
                              <td className="border px-4 py-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={handleSaveEdit}
                                    className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="px-3 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="border px-4 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">{item.gst_code || '-'}</td>
                              <td className="border px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{item.gst_rate || '-'}</td>
                              <td className="border px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{item.gst_type || '-'}</td>
                              <td className="border px-4 py-2 text-sm text-gray-600">{item.usage || '-'}</td>
                              <td className="border px-4 py-2 text-center">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleEditRow('gstCodes', index)}
                                    className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRow('gstCodes', index)}
                                    className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            {/* GST Structure Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden border">
                <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b">
                  <h3 className="text-md font-semibold text-gray-700">GST STRUCTURE</h3>
                  {!showCreateForm && (
                    <button
                      onClick={() => handleCreateNew('gstStructure')}
                      className="px-4 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                    >
                      + Add GST Structure
                    </button>
                  )}
                </div>
                {(!gstData.gstStructure || gstData.gstStructure.length === 0) && !showCreateForm && (
                  <div className="p-4 text-center">
                    <p className="text-gray-500 text-sm mb-3">No GST structure available</p>
                    <button
                      onClick={() => handleCreateNew('gstStructure')}
                      className="px-4 py-2 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                    >
                      + Create First GST Structure
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="border px-4 py-2 text-left text-sm font-medium text-gray-700 whitespace-nowrap">GST_Rate (%)</th>
                        <th className="border px-4 py-2 text-left text-sm font-medium text-gray-700 whitespace-nowrap">CGST%</th>
                        <th className="border px-4 py-2 text-left text-sm font-medium text-gray-700 whitespace-nowrap">SGST%</th>
                        <th className="border px-4 py-2 text-left text-sm font-medium text-gray-700 whitespace-nowrap">IGST%</th>
                        <th className="border px-4 py-2 text-center text-sm font-medium text-gray-700 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {(!gstData.gstStructure || gstData.gstStructure.length === 0) && !showCreateForm && (
                        <tr>
                          <td colSpan="5" className="border px-4 py-8 text-center text-gray-500">
                            No GST structure found. Click "+ Add GST Structure" to create one.
                          </td>
                        </tr>
                      )}
                      {gstData.gstStructure && gstData.gstStructure.length > 0 && gstData.gstStructure.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          {editingRow === index && editingTableType === 'gstStructure' ? (
                            <>
                              <td className="border px-4 py-2">
                                <input
                                  type="text"
                                  value={newRowData.gst_rate || ''}
                                  onChange={(e) => setNewRowData({ ...newRowData, gst_rate: e.target.value })}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </td>
                              <td className="border px-4 py-2">
                                <input
                                  type="text"
                                  value={newRowData.cgst || ''}
                                  onChange={(e) => setNewRowData({ ...newRowData, cgst: e.target.value })}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </td>
                              <td className="border px-4 py-2">
                                <input
                                  type="text"
                                  value={newRowData.sgst || ''}
                                  onChange={(e) => setNewRowData({ ...newRowData, sgst: e.target.value })}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </td>
                              <td className="border px-4 py-2">
                  <input
                    type="text"
                                  value={newRowData.igst || ''}
                                  onChange={(e) => setNewRowData({ ...newRowData, igst: e.target.value })}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </td>
                              <td className="border px-4 py-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={handleSaveEdit}
                                    className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="px-3 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="border px-4 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">{item.gst_rate || '-'}</td>
                              <td className="border px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{item.cgst || '-'}</td>
                              <td className="border px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{item.sgst || '-'}</td>
                              <td className="border px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{item.igst || '-'}</td>
                              <td className="border px-4 py-2 text-center">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleEditRow('gstStructure', index)}
                                    className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRow('gstStructure', index)}
                                    className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            {/* Product/Service Types Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden border">
                <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b">
                  <h3 className="text-md font-semibold text-gray-700">Product / Service Type and Default GST Rate</h3>
                  {!showCreateForm && (
                    <button
                      onClick={() => handleCreateNew('productServiceTypes')}
                      className="px-4 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                    >
                      + Add Product/Service
                    </button>
                  )}
                </div>
                {(!gstData.productServiceTypes || gstData.productServiceTypes.length === 0) && !showCreateForm && (
                  <div className="p-4 text-center">
                    <p className="text-gray-500 text-sm mb-3">No product/service types available</p>
                    <button
                      onClick={() => handleCreateNew('productServiceTypes')}
                      className="px-4 py-2 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                    >
                      + Create First Product/Service
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="border px-4 py-2 text-left text-sm font-medium text-gray-700">Product / Service Type</th>
                        <th className="border px-4 py-2 text-left text-sm font-medium text-gray-700 whitespace-nowrap">Default GST Rate (%)</th>
                        <th className="border px-4 py-2 text-center text-sm font-medium text-gray-700 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {(!gstData.productServiceTypes || gstData.productServiceTypes.length === 0) && !showCreateForm && (
                        <tr>
                          <td colSpan="3" className="border px-4 py-8 text-center text-gray-500">
                            No product/service types found. Click "+ Add Product/Service" to create one.
                          </td>
                        </tr>
                      )}
                      {gstData.productServiceTypes && gstData.productServiceTypes.length > 0 && gstData.productServiceTypes.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          {editingRow === index && editingTableType === 'productServiceTypes' ? (
                            <>
                              <td className="border px-4 py-2">
                                <input
                                  type="text"
                                  value={newRowData.product_service_type || ''}
                                  onChange={(e) => setNewRowData({ ...newRowData, product_service_type: e.target.value })}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </td>
                              <td className="border px-4 py-2">
                                <input
                                  type="text"
                                  value={newRowData.default_gst_rate || ''}
                                  onChange={(e) => setNewRowData({ ...newRowData, default_gst_rate: e.target.value })}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </td>
                              <td className="border px-4 py-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={handleSaveEdit}
                                    className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="px-3 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="border px-4 py-2 text-sm font-medium text-gray-900">{item.product_service_type || '-'}</td>
                              <td className="border px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{item.default_gst_rate || '-'}</td>
                              <td className="border px-4 py-2 text-center">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleEditRow('productServiceTypes', index)}
                                    className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRow('productServiceTypes', index)}
                                    className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            {/* Create New Row Form */}
            {showCreateForm && (
              <div className="bg-white rounded-lg shadow-sm border-2 border-purple-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-4">
                  Add New {createFormType === 'gstCodes' ? 'GST Code' : createFormType === 'gstStructure' ? 'GST Structure' : 'Product/Service Type'}
                </h4>
                <div className="space-y-3">
                  {createFormType === 'gstCodes' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">GST Code</label>
                        <input
                          type="text"
                          value={newRowData.gst_code || ''}
                          onChange={(e) => setNewRowData({ ...newRowData, gst_code: e.target.value })}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g., GST_18"
                        />
                      </div>
                <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">GST Rate (%)</label>
                  <input
                    type="text"
                          value={newRowData.gst_rate || ''}
                          onChange={(e) => setNewRowData({ ...newRowData, gst_rate: e.target.value })}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g., 18"
                  />
                </div>
                <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">GST Type</label>
                        <input
                          type="text"
                          value={newRowData.gst_type || ''}
                          onChange={(e) => setNewRowData({ ...newRowData, gst_type: e.target.value })}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g., 18 Standard"
                  />
                </div>
                <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Usage</label>
                  <input
                          type="text"
                          value={newRowData.usage || ''}
                          onChange={(e) => setNewRowData({ ...newRowData, usage: e.target.value })}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g., Fire equipment, manpower, training, services"
                        />
                      </div>
                    </>
                  )}
                  {createFormType === 'gstStructure' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">GST Rate (%)</label>
                        <input
                          type="text"
                          value={newRowData.gst_rate || ''}
                          onChange={(e) => setNewRowData({ ...newRowData, gst_rate: e.target.value })}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g., 18"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">CGST%</label>
                        <input
                          type="text"
                          value={newRowData.cgst || ''}
                          onChange={(e) => setNewRowData({ ...newRowData, cgst: e.target.value })}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g., 9"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">SGST%</label>
                        <input
                          type="text"
                          value={newRowData.sgst || ''}
                          onChange={(e) => setNewRowData({ ...newRowData, sgst: e.target.value })}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g., 9"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">IGST%</label>
                        <input
                          type="text"
                          value={newRowData.igst || ''}
                          onChange={(e) => setNewRowData({ ...newRowData, igst: e.target.value })}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g., 18"
                        />
                </div>
                    </>
                  )}
                  {createFormType === 'productServiceTypes' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Product / Service Type</label>
                    <input
                          type="text"
                          value={newRowData.product_service_type || ''}
                          onChange={(e) => setNewRowData({ ...newRowData, product_service_type: e.target.value })}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g., Fire Fighting Equipment"
                        />
                </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Default GST Rate (%)</label>
                        <input
                          type="text"
                          value={newRowData.default_gst_rate || ''}
                          onChange={(e) => setNewRowData({ ...newRowData, default_gst_rate: e.target.value })}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g., 18"
                        />
              </div>
                    </>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveCreate}
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    >
                      Save
                    </button>
                <button
                      onClick={handleCancelCreate}
                      className="px-4 py-2 bg-gray-400 text-white text-sm rounded hover:bg-gray-500"
                >
                  Cancel
                </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GSTUpload;

