import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const CostingSheet = ({ quotationId, onCostingChange }) => {
  const [costingItems, setCostingItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (quotationId) {
      fetchCostingItems();
    }
  }, [quotationId]);

  const fetchCostingItems = async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_costing_sheets')
        .select('*')
        .eq('quotation_id', quotationId)
        .order('item_order', { ascending: true });

      if (error) throw error;
      setCostingItems(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching costing items:', error);
      setLoading(false);
    }
  };

  const addCostingItem = () => {
    const newItem = {
      id: `temp-${Date.now()}`,
      item_name: '',
      description: '',
      quantity: 1,
      unit_price: 0,
      total_price: 0,
      item_order: costingItems.length,
      isNew: true,
    };
    setCostingItems([...costingItems, newItem]);
  };

  const updateCostingItem = (id, field, value) => {
    setCostingItems(costingItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unit_price') {
          updated.total_price = (parseFloat(updated.quantity) || 0) * (parseFloat(updated.unit_price) || 0);
        }
        return updated;
      }
      return item;
    }));
  };

  const deleteCostingItem = async (id) => {
    if (id.startsWith('temp-')) {
      setCostingItems(costingItems.filter(item => item.id !== id));
    } else {
      try {
        const { error } = await supabase
          .from('marketing_costing_sheets')
          .delete()
          .eq('id', id);
        if (error) throw error;
        fetchCostingItems();
      } catch (error) {
        console.error('Error deleting costing item:', error);
      }
    }
  };

  const saveCostingItems = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      for (const item of costingItems) {
        if (item.isNew) {
          const { error } = await supabase
            .from('marketing_costing_sheets')
            .insert([{
              quotation_id: quotationId,
              item_name: item.item_name,
              description: item.description,
              quantity: parseFloat(item.quantity) || 0,
              unit_price: parseFloat(item.unit_price) || 0,
              total_price: parseFloat(item.total_price) || 0,
              item_order: item.item_order,
            }]);
          if (error) throw error;
        } else if (!item.id.startsWith('temp-')) {
          const { error } = await supabase
            .from('marketing_costing_sheets')
            .update({
              item_name: item.item_name,
              description: item.description,
              quantity: parseFloat(item.quantity) || 0,
              unit_price: parseFloat(item.unit_price) || 0,
              total_price: parseFloat(item.total_price) || 0,
            })
            .eq('id', item.id);
          if (error) throw error;
        }
      }

      // Calculate total from costing sheet
      const total = costingItems.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);
      if (onCostingChange) {
        onCostingChange(total);
      }
      
      fetchCostingItems();
    } catch (error) {
      console.error('Error saving costing items:', error);
      alert('Error saving costing items: ' + error.message);
    }
  };

  const totalAmount = costingItems.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Loading costing sheet...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Costing Sheet</h3>
        <div className="flex space-x-2">
          <button
            onClick={addCostingItem}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item</span>
          </button>
          <button
            onClick={saveCostingItems}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Save Costing
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Item Name</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Description</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Quantity</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Unit Price (₹)</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Total Price (₹)</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {costingItems.map((item, index) => (
              <tr key={item.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={item.item_name}
                    onChange={(e) => updateCostingItem(item.id, 'item_name', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                    placeholder="Item name"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={item.description || ''}
                    onChange={(e) => updateCostingItem(item.id, 'description', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                    placeholder="Description"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateCostingItem(item.id, 'quantity', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateCostingItem(item.id, 'unit_price', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                  />
                </td>
                <td className="px-4 py-2">
                  <span className="font-medium">
                    ₹{parseFloat(item.total_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => deleteCostingItem(item.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {costingItems.length === 0 && (
              <tr>
                <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                  No costing items. Click "Add Item" to start.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-semibold">
              <td colSpan="4" className="px-4 py-2 text-right">Total:</td>
              <td className="px-4 py-2">
                ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default CostingSheet;

