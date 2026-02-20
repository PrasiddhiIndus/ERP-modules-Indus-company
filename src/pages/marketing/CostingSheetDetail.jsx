import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import CostingSheet from './components/CostingSheet';
import { Save, ArrowLeft } from 'lucide-react';

const CostingSheetDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quotation, setQuotation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [costingTotal, setCostingTotal] = useState(0);

  useEffect(() => {
    if (id) {
      fetchQuotation();
    }
  }, [id]);

  const fetchQuotation = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('marketing_quotations')
        .select(`
          *,
          marketing_clients:client_id (id, client_name),
          marketing_enquiries:enquiry_id (id, enquiry_number)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setQuotation(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching quotation:', error);
      setLoading(false);
    }
  };

  const handleSaveAndNext = () => {
    // Navigate to internal quotation after saving costing
    navigate(`/app/marketing/quotation-tracker/internal-quotation/${id}`);
  };

  if (loading) {
    return (
      <div className="w-full h-screen overflow-y-auto p-6">
        <div className="text-center text-gray-500">Loading quotation...</div>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="w-full h-screen overflow-y-auto p-6">
        <div className="text-center text-red-600">Quotation not found!</div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen overflow-y-auto p-6">
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Costing Sheet</h1>
              <p className="text-sm text-gray-600 mt-1">
                Quotation: {quotation.quotation_number} | Client: {quotation.marketing_clients?.client_name || '-'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/app/marketing/quotation-tracker')}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Quotation Tracker
              </button>
              <button
                onClick={handleSaveAndNext}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                <Save className="w-4 h-4" />
                Save & Go to Internal Quotation
              </button>
            </div>
          </div>
        </div>

      <CostingSheet
        quotationId={id}
        onCostingChange={(total) => setCostingTotal(total)}
      />
    </div>
  );
};

export default CostingSheetDetail;

