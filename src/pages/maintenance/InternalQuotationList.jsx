import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './lib/maintenanceClient';
import QuotationTrackerNavbar from './QuotationTrackerNavbar';
import { Search, Eye, Edit, Trash2, Download } from 'lucide-react';
import { formatDateDdMmYyyy } from '../../utils/dateDisplay';
import { exportToExcel } from './utils/excelExport';
import {
  buildLatestCostingMap,
} from './utils/maintenanceQuotationUtils';

const InternalQuotationList = () => {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchQuotationsWithCosting();
  }, []);

  const fetchQuotationsWithCosting = async () => {
    try {
      setLoading(true);
      const { data: quotationsData, error: quotationsError } = await supabase
        .from('maintenance_quotations')
        .select(`
          *,
          maintenance_clients:client_id (id, client_name, contact_email, contact_number, city, state, country),
          maintenance_enquiries:enquiry_id (id, enquiry_number)
        `)
        .order('created_at', { ascending: false });

      if (quotationsError) throw quotationsError;

      const quotationIds = (quotationsData || []).map((q) => q.id);
      let costingMap = new Map();
      if (quotationIds.length > 0) {
        const { data: costingSheets } = await supabase
          .from('maintenance_costing_sheets')
          .select('quotation_id, total_price, created_at, updated_at')
          .in('quotation_id', quotationIds)
          .order('updated_at', { ascending: false });
        costingMap = buildLatestCostingMap(costingSheets || []);
      }

      const quotationsWithCosting = (quotationsData || []).map((quotation) => {
        const costingRow = costingMap.get(quotation.id) || null;
        const sheetTotal = parseFloat(costingRow?.total_price || 0);
        const finalAmount = sheetTotal > 0
          ? sheetTotal
          : parseFloat(quotation.final_amount || 0);

        return {
          ...quotation,
          hasCosting: costingRow !== null,
          finalAmount,
        };
      });

      setQuotations(quotationsWithCosting.filter((q) => q.hasCosting));
      setLoading(false);
    } catch (error) {
      console.error('Error fetching quotations:', error);
      setLoading(false);
    }
  };

  const handleExport = () => {
    const exportData = quotations.map((quotation) => ({
      'Quotation Number': quotation.quotation_number,
      'Client': quotation.maintenance_clients?.client_name || '-',
      'Subject': quotation.subject_title || '-',
      'Line Description': quotation.subject || '-',
      'Final Amount (Rs.)': quotation.finalAmount > 0 ? quotation.finalAmount : 0,
      'Internal Quotation Date': quotation.subject_title || quotation.subject
        ? formatDateDdMmYyyy(quotation.updated_at || quotation.created_at)
        : '-',
      'Status': quotation.subject_title || quotation.subject ? 'Saved' : (quotation.status || 'Draft'),
    }));
    exportToExcel(exportData, 'Internal_Quotations_Export', 'Internal Quotations');
  };

  const handleCreateInternalQuotation = (quotationId) => {
    navigate(`/app/maintenance/quotation-tracker/internal-quotation/${quotationId}`);
  };

  const handleViewInternalQuotation = (quotationId) => {
    navigate(`/app/maintenance/quotation-tracker/internal-quotation/${quotationId}?view=true`);
  };

  const handleEditInternalQuotation = (quotationId) => {
    navigate(`/app/maintenance/quotation-tracker/internal-quotation/${quotationId}`);
  };

  const handleDeleteInternalQuotation = async (quotationId) => {
    if (!confirm('Are you sure you want to delete this internal quotation data? This will clear the subject and terms data.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('maintenance_quotations')
        .update({ 
          subject_title: null,
          subject: null,
        })
        .eq('id', quotationId);

      if (error) throw error;
      alert('Internal quotation data deleted successfully!');
      fetchQuotationsWithCosting();
    } catch (error) {
      console.error('Error deleting internal quotation:', error);
      alert('Error deleting internal quotation: ' + error.message);
    }
  };

  const filteredQuotations = quotations.filter((quotation) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const quotationNumber = quotation.quotation_number?.toLowerCase() || '';
    const clientName = quotation.maintenance_clients?.client_name?.toLowerCase() || '';
    const subject = quotation.subject_title?.toLowerCase() || '';
    const lineDesc = quotation.subject?.toLowerCase() || '';
    return (
      quotationNumber.includes(query) ||
      clientName.includes(query) ||
      subject.includes(query) ||
      lineDesc.includes(query)
    );
  });

  return (
    <div className="w-full min-h-screen bg-gray-50">
      <QuotationTrackerNavbar />
      <div className="pt-20 p-6">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Internal Quotation</h1>
              <p className="text-sm text-gray-600 mt-1">List of quotations with costing sheets</p>
            </div>
            <button
              onClick={handleExport}
              disabled={quotations.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 text-sm"
            >
              <Download className="w-4 h-4" />
              Export Excel
            </button>
          </div>
          
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by quotation number, client, subject, or line description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading quotations...</div>
          ) : quotations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No quotations with costing sheets found. Create quotations with costing sheets first.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
              <table className="w-full min-w-[1100px] border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700 w-11">S.No</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Quotation Id</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Client Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 min-w-[140px]">Subject</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 min-w-[180px]">Line Description</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Final Amount</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Internal Quotation Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotations.map((quotation, idx) => {
                    const hasInternalQuotation = quotation.subject_title || quotation.subject;
                    const internalQuotationDate = hasInternalQuotation && quotation.updated_at 
                      ? quotation.updated_at 
                      : quotation.created_at;
                    return (
                      <tr key={quotation.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-center tabular-nums text-gray-600">{idx + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {quotation.quotation_number}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {quotation.maintenance_clients?.client_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-800 max-w-[180px]">
                          <span className="line-clamp-2" title={quotation.subject_title || ''}>
                            {quotation.subject_title || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-[220px]">
                          <span className="line-clamp-2" title={quotation.subject || ''}>
                            {quotation.subject || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                          {quotation.finalAmount > 0 
                            ? `₹${quotation.finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {internalQuotationDate 
                            ? formatDateDdMmYyyy(internalQuotationDate)
                            : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {hasInternalQuotation ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Saved
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              {quotation.status || 'Sent'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {hasInternalQuotation ? (
                              <>
                                <button
                                  onClick={() => handleViewInternalQuotation(quotation.id)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="View"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleEditInternalQuotation(quotation.id)}
                                  className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                  title="Edit"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteInternalQuotation(quotation.id)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleCreateInternalQuotation(quotation.id)}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                              >
                                Create Internal Quotation
                              </button>
                            )}
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
      </div>
    </div>
  );
};

export default InternalQuotationList;
