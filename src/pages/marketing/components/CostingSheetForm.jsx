import React, { useState, useEffect } from 'react';
import { X, Plus, Edit2, Eye, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import ExcelCostingSheet from './ExcelCostingSheet';

const CostingSheetForm = ({ 
  isOpen, 
  onClose, 
  costingSheetId = null,
  onSave 
}) => {
  const [quotations, setQuotations] = useState([]);
  const [costingSheets, setCostingSheets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const [selectedQuotationIdForEditor, setSelectedQuotationIdForEditor] = useState(null);
  const [showCostingSheet, setShowCostingSheet] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);
  const [selectedCostingSheetId, setSelectedCostingSheetId] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchQuotations();
      fetchCostingSheets();
      
      if (costingSheetId) {
        // If editing existing costing sheet
        fetchCostingSheetDetails(costingSheetId);
      }
    }
  }, [isOpen, costingSheetId, selectedQuotationId]);

  const fetchQuotations = async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_quotations')
        .select('id, quotation_number, client_id, enquiry_id')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setQuotations(data || []);
    } catch (error) {
      console.error('Error fetching quotations:', error);
    }
  };

  const fetchCostingSheets = async () => {
    try {
      setLoading(true);
      
      // If quotation is selected, filter by it
      if (selectedQuotationId) {
        const { data, error } = await supabase
          .from('marketing_costing_sheets')
          .select(`
            *,
            marketing_quotations:quotation_id (
              id,
              quotation_number,
              client_id,
              enquiry_id,
              marketing_clients:client_id (id, client_name),
              marketing_enquiries:enquiry_id (id, enquiry_number)
            )
          `)
          .eq('quotation_id', selectedQuotationId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setCostingSheets(data || []);
      } else {
        // Get all costing sheets
        const { data, error } = await supabase
          .from('marketing_costing_sheets')
          .select(`
            *,
            marketing_quotations:quotation_id (
              id,
              quotation_number,
              client_id,
              enquiry_id,
              marketing_clients:client_id (id, client_name),
              marketing_enquiries:enquiry_id (id, enquiry_number)
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setCostingSheets(data || []);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching costing sheets:', error);
      setLoading(false);
    }
  };

  const fetchCostingSheetDetails = async (id) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('marketing_costing_sheets')
        .select(`
          *,
          marketing_quotations:quotation_id (
            id,
            quotation_number,
            enquiry_id
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      
      if (data && data.marketing_quotations) {
        setSelectedQuotationId(data.quotation_id || '');
        setSelectedQuotationIdForEditor(data.quotation_id);
        setSelectedCostingSheetId(id);
        setShowCostingSheet(true);
        setIsViewMode(false);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching costing sheet details:', error);
      setLoading(false);
      alert('Error loading costing sheet: ' + error.message);
    }
  };

  const handleQuotationChange = (quotationId) => {
    setSelectedQuotationId(quotationId);
    setSelectedQuotationIdForEditor(null);
    setShowCostingSheet(false);
    setIsViewMode(false);
    setSelectedCostingSheetId(null);
    fetchCostingSheets();
  };

  const handleCreateNew = async () => {
    if (!selectedQuotationId) {
      alert('Please select a quotation first');
      return;
    }

    try {
      setSelectedQuotationIdForEditor(selectedQuotationId);
      setSelectedCostingSheetId(null);
      setIsViewMode(false);
      setShowCostingSheet(true);
    } catch (error) {
      console.error('Error opening costing sheet:', error);
      alert('Error: ' + error.message);
    }
  };

  const handleEdit = (costingSheet) => {
    setSelectedQuotationId(costingSheet.quotation_id || '');
    setSelectedQuotationIdForEditor(costingSheet.quotation_id);
    setSelectedCostingSheetId(costingSheet.id);
    setIsViewMode(false);
    setShowCostingSheet(true);
  };

  const handleView = (costingSheet) => {
    setSelectedQuotationId(costingSheet.quotation_id || '');
    setSelectedQuotationIdForEditor(costingSheet.quotation_id);
    setSelectedCostingSheetId(costingSheet.id);
    setIsViewMode(true);
    setShowCostingSheet(true);
  };

  const handleDelete = async (costingSheet) => {
    if (!confirm('Are you sure you want to delete this costing sheet?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('marketing_costing_sheets')
        .delete()
        .eq('id', costingSheet.id);

      if (error) throw error;

      alert('Costing sheet deleted successfully!');
      fetchCostingSheets(); // Refresh the list
    } catch (error) {
      console.error('Error deleting costing sheet:', error);
      alert('Error deleting costing sheet: ' + error.message);
    }
  };

  const handleSaveSuccess = () => {
    // Refresh the list after saving
    fetchCostingSheets();
    // Optionally go back to list view
    setShowCostingSheet(false);
    setSelectedQuotationIdForEditor(null);
    setSelectedCostingSheetId(null);
    setIsViewMode(false);
  };

  const handleClose = () => {
    setSelectedQuotationId('');
    setSelectedQuotationIdForEditor(null);
    setShowCostingSheet(false);
    setSelectedCostingSheetId(null);
    setIsViewMode(false);
    setCostingSheets([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
              Costing Sheet
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Create and manage Excel-like costing sheets
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {/* Quotation Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quotation
            </label>
            <div className="flex gap-3">
              <select
                value={selectedQuotationId}
                onChange={(e) => handleQuotationChange(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="">All Quotations</option>
                {quotations.map((quotation) => (
                  <option key={quotation.id} value={quotation.id}>
                    {quotation.quotation_number}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCreateNew}
                disabled={!selectedQuotationId}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>Create New</span>
              </button>
            </div>
          </div>

          {/* Costing Sheets Table */}
          {!showCostingSheet && (
            <div className="mt-6">
              {loading ? (
                <div className="text-center text-gray-500 py-12">Loading costing sheets...</div>
              ) : costingSheets.length === 0 ? (
                <div className="text-center text-gray-500 py-12 bg-gray-50 rounded-lg">
                  {selectedQuotationId 
                    ? 'No costing sheets found for this quotation. Click "Create New" to create one.'
                    : 'No costing sheets found. Select a quotation and click "Create New" to create a costing sheet.'}
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-300 rounded-lg">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-b-2 border-gray-300">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Quotation #</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Client</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Enquiry #</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Created</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Updated</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costingSheets.map((sheet) => {
                        const quotation = sheet.marketing_quotations;
                        return (
                          <tr key={sheet.id} className="border-b border-gray-200 hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {quotation?.quotation_number || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {quotation?.marketing_clients?.client_name || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {quotation?.marketing_enquiries?.enquiry_number || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {new Date(sheet.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {new Date(sheet.updated_at || sheet.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleView(sheet)}
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                  title="View/Edit"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleEdit(sheet)}
                                  className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(sheet)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Excel Costing Sheet Component */}
          {showCostingSheet && selectedQuotationIdForEditor && (
            <div className="mt-6">
              <div className="mb-4 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {isViewMode ? 'View Costing Sheet' : selectedCostingSheetId ? 'Edit Costing Sheet' : 'Create Costing Sheet'}
                  </h3>
                  {selectedCostingSheetId && (
                    <p className="text-xs text-gray-500 mt-1">Costing Sheet ID: {selectedCostingSheetId}</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowCostingSheet(false);
                    setSelectedQuotationIdForEditor(null);
                    setSelectedCostingSheetId(null);
                    setIsViewMode(false);
                    fetchCostingSheets();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Back to List
                </button>
              </div>
              <ExcelCostingSheet
                quotationId={selectedQuotationIdForEditor}
                onCostingChange={() => {}}
                onSaveSuccess={handleSaveSuccess}
                isViewMode={isViewMode}
                costingSheetId={selectedCostingSheetId}
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-gray-200 flex justify-end space-x-3 sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CostingSheetForm;
