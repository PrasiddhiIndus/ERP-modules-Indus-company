import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import QuotationTrackerNavbar from './QuotationTrackerNavbar';

const CostingSheetList = () => {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApprovedQuotations();
  }, []);

  const fetchApprovedQuotations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('marketing_quotations')
        .select(`
          *,
          marketing_clients:client_id (id, client_name),
          marketing_enquiries:enquiry_id (id, enquiry_number)
        `)
        .eq('status', 'Approved')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuotations(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching approved quotations:', error);
      setLoading(false);
    }
  };

  const handleCreateCosting = (quotationId) => {
    navigate(`/marketing/quotation-tracker/costing/${quotationId}`);
  };

  return (
    <div className="w-full min-h-screen bg-gray-50">
      <QuotationTrackerNavbar />
      <div className="pt-20 p-6">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Costing Sheet</h1>
              <p className="text-sm text-gray-600 mt-1">List of approved quotations for costing</p>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading quotations...</div>
          ) : quotations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No approved quotations found. Approve quotations first to create costing sheets.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Quotation #</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Client</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Enquiry #</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Total Amount</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.map((quotation) => (
                    <tr key={quotation.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {quotation.quotation_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(quotation.quotation_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {quotation.marketing_clients?.client_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {quotation.marketing_enquiries?.enquiry_number || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        ₹{parseFloat(quotation.final_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleCreateCosting(quotation.id)}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                        >
                          Create Costing
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CostingSheetList;

