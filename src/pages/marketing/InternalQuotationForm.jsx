import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Save, ArrowLeft, X } from 'lucide-react';
import QuotationTrackerNavbar from './QuotationTrackerNavbar';

const InternalQuotationForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quotation, setQuotation] = useState(null);
  const [client, setClient] = useState(null);
  const [costingItems, setCostingItems] = useState([]);
  const [costingData, setCostingData] = useState(null);
  const [costingTableItems, setCostingTableItems] = useState([]);
  const [costingTableHeads, setCostingTableHeads] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [subjectTemplates, setSubjectTemplates] = useState([]);
  const [termsTemplates, setTermsTemplates] = useState([]);
  const [selectedSubjectTemplate, setSelectedSubjectTemplate] = useState('');
  const [selectedTermsTemplate, setSelectedTermsTemplate] = useState('');
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    quotation_number: '',
    subject_title: '',
    subject: '',
    terms_and_conditions: '',
    gst_percentage: 18,
    gst_type: 'IGST',
  });

  useEffect(() => {
    if (id) {
      fetchAllData();
    }
  }, [id]);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      // Fetch quotation with client details
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
        subject_title: quotationData.subject_title || '',
        subject: quotationData.subject || '',
        terms_and_conditions: quotationData.terms_and_conditions || '',
        gst_percentage: quotationData.gst_percentage || 18,
        gst_type: quotationData.gst_type || 'IGST',
      });

      // Fetch costing sheet items
      const { data: costingData, error: costingError } = await supabase
        .from('marketing_costing_sheets')
        .select('*')
        .eq('quotation_id', id)
        .order('item_order', { ascending: true });

      if (costingError) throw costingError;
      setCostingItems(costingData || []);
      
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

      // Fetch templates (Subject and Terms templates from quotation_templates)
      const { data: templatesData, error: templatesError } = await supabase
        .from('quotation_templates')
        .select('*')
        .in('type', ['Subject', 'Terms and Condition'])
        .order('created_at', { ascending: false });

      if (templatesError) throw templatesError;

      const subjectTemps = (templatesData || []).filter(t => t.type === 'Subject');
      const termsTemps = (templatesData || []).filter(t => t.type === 'Terms and Condition');

      setSubjectTemplates(subjectTemps);
      setTermsTemplates(termsTemps);
      setTemplates(templatesData || []);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const handleSubjectTemplateChange = (templateId) => {
    setSelectedSubjectTemplate(templateId);
    const template = subjectTemplates.find(t => t.id === templateId);
    if (template) {
      setFormData({
        ...formData,
        subject_title: template.subject_title || '',
        subject: template.subject || '',
      });
    }
  };

  const handleTermsTemplateChange = (templateId) => {
    setSelectedTermsTemplate(templateId);
    const template = termsTemplates.find(t => t.id === templateId);
    if (template) {
      setFormData({
        ...formData,
        terms_and_conditions: template.description || '',
      });
    }
  };

  const handleSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Calculate totals from costing sheet data
      let subtotal = 0;
      let finalAmount = 0;
      
      if (costingData && costingTableItems.length > 0) {
        // Calculate from costing_data
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
        // Fallback to old format
        subtotal = costingItems.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);
        finalAmount = subtotal + ((subtotal * parseFloat(formData.gst_percentage)) / 100);
      }
      
      const gstAmount = finalAmount - subtotal;

      const { error } = await supabase
        .from('marketing_quotations')
        .update({
          subject_title: formData.subject_title,
          subject: formData.subject,
          terms_and_conditions: formData.terms_and_conditions,
          gst_percentage: formData.gst_percentage,
          gst_type: formData.gst_type,
          total_amount: subtotal,
          gst_amount: gstAmount,
          final_amount: finalAmount,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      alert('Internal quotation saved successfully!');
      navigate('/app/marketing/quotation-tracker/internal-quotation');
    } catch (error) {
      console.error('Error saving internal quotation:', error);
      alert('Error saving internal quotation: ' + error.message);
    }
  };

  // Calculate totals for display
  const getCostingTotal = () => {
    if (costingData && costingTableItems.length > 0) {
      // Calculate from costing_data
      return costingTableItems.reduce((sum, item) => {
        const finalPrice = parseFloat(costingData[`${item.id}_final_price`] || 0);
        return sum + finalPrice;
      }, 0);
    } else {
      // Fallback to old format
      return costingItems.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);
    }
  };

  const getNetTotal = () => {
    if (costingData && costingTableItems.length > 0) {
      return costingTableItems.reduce((sum, item) => {
        const quotationRate = parseFloat(costingData[`${item.id}_quotation_rate`] || 0);
        return sum + quotationRate;
      }, 0);
    } else {
      return getCostingTotal();
    }
  };

  const costingTotal = getCostingTotal();
  const netTotal = getNetTotal();
  const gstAmount = costingTotal - netTotal;
  const finalAmount = costingTotal;

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-gray-50">
        <QuotationTrackerNavbar />
        <div className="pt-20 p-6">
          <div className="text-center text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="w-full min-h-screen bg-gray-50">
        <QuotationTrackerNavbar />
        <div className="pt-20 p-6">
          <div className="text-center text-red-600">Quotation not found!</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-50">
      <QuotationTrackerNavbar />
      <div className="pt-20 p-4 sm:p-6">
        <div className="bg-white rounded-lg shadow-xl max-w-5xl mx-auto">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                Internal Quotation
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Quotation: {quotation.quotation_number}
              </p>
            </div>
            <button
              onClick={() => navigate('/app/marketing/quotation-tracker/internal-quotation')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Content */}
          <div className="p-4 sm:p-6">
            {/* Client Details */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Client Details</h3>
              {client && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Client Name</p>
                    <p className="text-sm font-medium text-gray-900">{client.client_name || '-'}</p>
                  </div>
                  {client.contact_email && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Email</p>
                      <p className="text-sm font-medium text-gray-900">{client.contact_email}</p>
                    </div>
                  )}
                  {client.contact_number && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Phone</p>
                      <p className="text-sm font-medium text-gray-900">{client.contact_number}</p>
                    </div>
                  )}
                  {(client.city || client.state) && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Location</p>
                      <p className="text-sm font-medium text-gray-900">
                        {[client.city, client.state, client.country]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Form Fields */}
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Templates Selection */}
                <div>
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

                <div>
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

                <div className="md:col-span-2">
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

                <div className="md:col-span-2">
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GST Type
                  </label>
                  <select
                    value={formData.gst_type}
                    onChange={(e) => setFormData({ ...formData, gst_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="IGST">IGST</option>
                    <option value="CGST+SGST">CGST + SGST</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GST Percentage
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.gst_percentage}
                    onChange={(e) => setFormData({ ...formData, gst_percentage: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Terms & Conditions
                  </label>
                  <textarea
                    value={formData.terms_and_conditions}
                    onChange={(e) => setFormData({ ...formData, terms_and_conditions: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter terms and conditions"
                  />
                </div>
              </div>

              {/* Costing Sheet Table */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-4">Costing Sheet</h3>
                {costingTableItems.length === 0 && costingItems.length === 0 ? (
                  <div className="text-center text-gray-500 py-8 bg-gray-50 rounded-lg">
                    No costing items found. Create costing sheet first.
                  </div>
                ) : costingTableItems.length > 0 && costingData ? (
                  <div className="overflow-x-auto mb-4 border border-gray-300 rounded-lg">
                    <table className="w-full border-collapse" style={{ minWidth: '800px' }}>
                      <thead>
                        <tr className="bg-gray-100 border-b-2 border-gray-300">
                          <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700 border-r border-gray-300 sticky left-0 bg-gray-100 z-10">
                            Cost Head
                          </th>
                          {costingTableItems.map((item) => (
                            <th key={item.id} className="px-3 py-2 text-center text-sm font-semibold text-gray-700 border-r border-gray-300">
                              {item.name || 'Item'}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {costingTableHeads.map((head) => (
                          <tr key={head.id} className="border-b border-gray-200">
                            <td className={`px-3 py-2 text-sm border-r border-gray-300 sticky left-0 bg-white ${head.isCalculated ? 'font-semibold' : ''}`}>
                              {head.label}
                            </td>
                            {costingTableItems.map((item) => {
                              const key = `${item.id}_${head.id}`;
                              const value = costingData[key] || '';
                              const displayValue = head.isCalculated && value
                                ? `₹${parseFloat(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                : value || (head.isCalculated ? '0.00' : '0');
                              return (
                                <td key={item.id} className="px-3 py-2 text-sm text-right border-r border-gray-300">
                                  {displayValue}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-blue-50 font-semibold border-t-2 border-gray-300">
                          <td className="px-3 py-3 text-sm text-gray-900 border-r border-gray-300 sticky left-0 bg-blue-50 z-10">
                            Net Total (Excl. GST)
                          </td>
                          {costingTableItems.map((item) => {
                            const quotationRate = parseFloat(costingData[`${item.id}_quotation_rate`] || 0);
                            return (
                              <td key={item.id} className="px-3 py-3 text-sm text-gray-900 text-right border-r border-gray-300">
                                ₹{quotationRate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                          <td className="px-3 py-3 text-sm text-gray-900 border-r border-gray-300 sticky left-0 bg-gray-100 z-10">
                            Grand Total (Incl. GST)
                          </td>
                          {costingTableItems.map((item) => {
                            const finalPrice = parseFloat(costingData[`${item.id}_final_price`] || 0);
                            return (
                              <td key={item.id} className="px-3 py-3 text-sm text-gray-900 text-right border-r border-gray-300">
                                ₹{finalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            );
                          })}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Item Name</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Description</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Quantity</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Unit Price</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Total Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costingItems.map((item) => (
                          <tr key={item.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{item.item_name || '-'}</td>
                            <td className="px-4 py-3 text-sm">{item.description || '-'}</td>
                            <td className="px-4 py-3 text-sm">{item.quantity || 0}</td>
                            <td className="px-4 py-3 text-sm">
                              ₹{parseFloat(item.unit_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium">
                              ₹{parseFloat(item.total_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-100 font-semibold">
                          <td colSpan="4" className="px-4 py-3 text-right">Subtotal:</td>
                          <td className="px-4 py-3">
                            ₹{netTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                        <tr className="bg-gray-100">
                          <td colSpan="4" className="px-4 py-3 text-right">
                            GST ({formData.gst_type} {formData.gst_percentage}%):
                          </td>
                          <td className="px-4 py-3">
                            ₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                        <tr className="bg-gray-100 font-bold text-lg">
                          <td colSpan="4" className="px-4 py-3 text-right">Final Amount:</td>
                          <td className="px-4 py-3">
                            ₹{finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => navigate('/app/marketing/quotation-tracker/internal-quotation')}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InternalQuotationForm;

