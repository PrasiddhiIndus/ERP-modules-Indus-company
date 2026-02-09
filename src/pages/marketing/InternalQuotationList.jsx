import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import QuotationTrackerNavbar from './QuotationTrackerNavbar';
import { Search, Eye, Edit, Trash2 } from 'lucide-react';

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
      // Fetch all quotations that have costing sheets (not just "Sent" status)
      const { data: quotationsData, error: quotationsError } = await supabase
        .from('marketing_quotations')
        .select(`
          *,
          marketing_clients:client_id (id, client_name, contact_email, contact_number, city, state, country),
          marketing_enquiries:enquiry_id (id, enquiry_number)
        `)
        .order('created_at', { ascending: false });

      if (quotationsError) throw quotationsError;

      // Check which quotations have costing sheets and fetch final amount
      const quotationsWithCosting = await Promise.all(
        quotationsData.map(async (quotation) => {
          const { data: costingData, error: costingError } = await supabase
            .from('marketing_costing_sheets')
            .select('id, costing_data')
            .eq('quotation_id', quotation.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Calculate final amount from costing data
          let finalAmount = 0;
          if (costingData?.costing_data) {
            try {
              const costingDataParsed = typeof costingData.costing_data === 'string' 
                ? JSON.parse(costingData.costing_data) 
                : costingData.costing_data;
              if (costingDataParsed.items && costingDataParsed.items.length > 0) {
                finalAmount = costingDataParsed.items.reduce((sum, item) => {
                  const finalPriceKey = `${item.id}_final_price`;
                  const finalPrice = parseFloat(costingDataParsed[finalPriceKey] || 0);
                  return sum + finalPrice;
                }, 0);
              }
            } catch (e) {
              console.error('Error parsing costing data:', e);
              // Fallback to quotation's final_amount if available
              finalAmount = parseFloat(quotation.final_amount || 0);
            }
          } else {
            // Use quotation's final_amount if costing data not available
            finalAmount = parseFloat(quotation.final_amount || 0);
          }

          return {
            ...quotation,
            hasCosting: costingData !== null,
            finalAmount: finalAmount,
          };
        })
      );

      setQuotations(quotationsWithCosting.filter(q => q.hasCosting));
      setLoading(false);
    } catch (error) {
      console.error('Error fetching quotations:', error);
      setLoading(false);
    }
  };

  const handleCreateInternalQuotation = (quotationId) => {
    navigate(`/marketing/quotation-tracker/internal-quotation/${quotationId}`);
  };

  const handleViewInternalQuotation = (quotationId) => {
    navigate(`/marketing/quotation-tracker/internal-quotation/${quotationId}?view=true`);
  };

  const handleEditInternalQuotation = (quotationId) => {
    navigate(`/marketing/quotation-tracker/internal-quotation/${quotationId}`);
  };

  const handleDeleteInternalQuotation = async (quotationId) => {
    if (!confirm('Are you sure you want to delete this internal quotation data? This will clear the subject and terms data.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('marketing_quotations')
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
          </div>
          
          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by quotation number or client name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Quotation Id</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Client Name</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Final Amount</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Internal Quotation Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.filter((quotation) => {
                    if (!searchQuery) return true;
                    const query = searchQuery.toLowerCase();
                    const quotationNumber = quotation.quotation_number?.toLowerCase() || '';
                    const clientName = quotation.marketing_clients?.client_name?.toLowerCase() || '';
                    return quotationNumber.includes(query) || clientName.includes(query);
                  }).map((quotation) => {
                    const hasInternalQuotation = quotation.subject_title || quotation.subject;
                    // Use updated_at if internal quotation exists, otherwise use created_at
                    const internalQuotationDate = hasInternalQuotation && quotation.updated_at 
                      ? quotation.updated_at 
                      : quotation.created_at;
                    return (
                      <tr key={quotation.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {quotation.quotation_number}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {quotation.marketing_clients?.client_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                          {quotation.finalAmount > 0 
                            ? `₹${quotation.finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {internalQuotationDate 
                            ? new Date(internalQuotationDate).toLocaleDateString('en-GB', { 
                                day: '2-digit', 
                                month: 'short', 
                                year: 'numeric' 
                              })
                            : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {hasInternalQuotation ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Saved
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
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
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
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
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
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

