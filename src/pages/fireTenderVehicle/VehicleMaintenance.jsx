import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Wrench, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Filter,
  Download,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
  Car,
  FileText
} from 'lucide-react';

const VehicleMaintenance = () => {
  const [maintenance, setMaintenance] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('All');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('All');

  const [formData, setFormData] = useState({
    vehicle_id: '',
    service_date: '',
    vendor: '',
    service_type: '',
    cost: '',
    odometer_reading: '',
    nature_of_repair: '',
    parts_replaced: '',
    next_service_due: '',
    remarks: '',
    attachment_url: ''
  });

  const serviceTypes = [
    'Regular Service', 'Repair', 'AMC Service', 'Emergency Repair',
    'Preventive Maintenance', 'Breakdown Repair', 'Inspection', 'Other'
  ];

  useEffect(() => {
    fetchMaintenance();
    fetchVehicles();
  }, []);

  const fetchMaintenance = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('vehicle_maintenance')
        .select(`
          *,
          vehicles_master!inner(registration_number, vehicle_type)
        `)
        .eq('vehicles_master.user_id', user.id)
        .order('service_date', { ascending: false });

      if (error) throw error;
      setMaintenance(data || []);
    } catch (error) {
      console.error('Error fetching maintenance:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('vehicles_master')
        .select('id, registration_number, vehicle_type')
        .eq('user_id', user.id)
        .order('registration_number');

      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const maintenanceData = {
        ...formData,
        user_id: user.id,
        cost: parseFloat(formData.cost) || 0,
        odometer_reading: formData.odometer_reading ? parseFloat(formData.odometer_reading) : null
      };

      if (editingMaintenance) {
        const { error } = await supabase
          .from('vehicle_maintenance')
          .update(maintenanceData)
          .eq('id', editingMaintenance.id);

        if (error) throw error;
        alert('Maintenance record updated successfully!');
      } else {
        const { error } = await supabase
          .from('vehicle_maintenance')
          .insert([maintenanceData]);

        if (error) throw error;
        alert('Maintenance record added successfully!');
      }

      resetForm();
      fetchMaintenance();
    } catch (error) {
      console.error('Error saving maintenance:', error);
      alert('Failed to save maintenance record. Please try again.');
    }
  };

  const handleEdit = (maintenance) => {
    setEditingMaintenance(maintenance);
    setFormData({
      vehicle_id: maintenance.vehicle_id || '',
      service_date: maintenance.service_date || '',
      vendor: maintenance.vendor || '',
      service_type: maintenance.service_type || '',
      cost: maintenance.cost || '',
      odometer_reading: maintenance.odometer_reading || '',
      nature_of_repair: maintenance.nature_of_repair || '',
      parts_replaced: maintenance.parts_replaced || '',
      next_service_due: maintenance.next_service_due || '',
      remarks: maintenance.remarks || '',
      attachment_url: maintenance.attachment_url || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this maintenance record?')) {
      try {
        const { error } = await supabase
          .from('vehicle_maintenance')
          .delete()
          .eq('id', id);

        if (error) throw error;
        alert('Maintenance record deleted successfully!');
        fetchMaintenance();
      } catch (error) {
        console.error('Error deleting maintenance:', error);
        alert('Failed to delete maintenance record. Please try again.');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      vehicle_id: '',
      service_date: '',
      vendor: '',
      service_type: '',
      cost: '',
      odometer_reading: '',
      nature_of_repair: '',
      parts_replaced: '',
      next_service_due: '',
      remarks: '',
      attachment_url: ''
    });
    setEditingMaintenance(null);
    setShowForm(false);
  };

  const getServiceTypeColor = (serviceType) => {
    switch (serviceType) {
      case 'Regular Service': return 'bg-green-100 text-green-800';
      case 'Repair': return 'bg-red-100 text-red-800';
      case 'AMC Service': return 'bg-blue-100 text-blue-800';
      case 'Emergency Repair': return 'bg-red-100 text-red-800';
      case 'Preventive Maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'Breakdown Repair': return 'bg-red-100 text-red-800';
      case 'Inspection': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getUpcomingServiceStatus = (nextServiceDue) => {
    if (!nextServiceDue) return null;
    const today = new Date();
    const dueDate = new Date(nextServiceDue);
    const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue < 0) return { status: 'overdue', days: Math.abs(daysUntilDue) };
    if (daysUntilDue <= 7) return { status: 'urgent', days: daysUntilDue };
    if (daysUntilDue <= 30) return { status: 'warning', days: daysUntilDue };
    return { status: 'normal', days: daysUntilDue };
  };

  const filteredMaintenance = maintenance.filter(record => {
    const matchesSearch = 
      record.vehicles_master.registration_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.service_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.nature_of_repair?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesVehicle = vehicleFilter === 'All' || record.vehicle_id.toString() === vehicleFilter;
    const matchesServiceType = serviceTypeFilter === 'All' || record.service_type === serviceTypeFilter;
    
    return matchesSearch && matchesVehicle && matchesServiceType;
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
          <h1 className="text-3xl font-bold text-gray-900">Vehicle Maintenance</h1>
          <p className="text-gray-600 mt-2">Track vehicle service and maintenance records</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus className="h-5 w-5" />
          <span>Add Maintenance</span>
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search maintenance..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="All">All Vehicles</option>
            {vehicles.map(vehicle => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.registration_number}
              </option>
            ))}
          </select>
          <select
            value={serviceTypeFilter}
            onChange={(e) => setServiceTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="All">All Service Types</option>
            {serviceTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <button className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center justify-center space-x-2">
            <Download className="h-5 w-5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Maintenance Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingMaintenance ? 'Edit Maintenance Record' : 'Add Maintenance Record'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Service Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Service Details</h3>
                  
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Service Date *</label>
                    <input
                      type="date"
                      value={formData.service_date}
                      onChange={(e) => setFormData({...formData, service_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Vendor/Service Center *</label>
                    <input
                      type="text"
                      value={formData.vendor}
                      onChange={(e) => setFormData({...formData, vendor: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Service Type</label>
                    <select
                      value={formData.service_type}
                      onChange={(e) => setFormData({...formData, service_type: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select Service Type</option>
                      {serviceTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cost (₹) *</label>
                    <input
                      type="number"
                      value={formData.cost}
                      onChange={(e) => setFormData({...formData, cost: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Odometer Reading (km)</label>
                    <input
                      type="number"
                      value={formData.odometer_reading}
                      onChange={(e) => setFormData({...formData, odometer_reading: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="0"
                      step="0.1"
                    />
                  </div>
                </div>

                {/* Repair Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Repair Details</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nature of Repair</label>
                    <textarea
                      value={formData.nature_of_repair}
                      onChange={(e) => setFormData({...formData, nature_of_repair: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Describe the repair work done..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Parts Replaced</label>
                    <textarea
                      value={formData.parts_replaced}
                      onChange={(e) => setFormData({...formData, parts_replaced: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="List all parts replaced..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Next Service Due</label>
                    <input
                      type="date"
                      value={formData.next_service_due}
                      onChange={(e) => setFormData({...formData, next_service_due: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Service Receipt/Invoice URL</label>
                    <input
                      type="url"
                      value={formData.attachment_url}
                      onChange={(e) => setFormData({...formData, attachment_url: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="https://example.com/receipt.pdf"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
                    <textarea
                      value={formData.remarks}
                      onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Additional notes..."
                    />
                  </div>
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
                  {editingMaintenance ? 'Update Maintenance' : 'Add Maintenance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Maintenance Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Maintenance Records ({filteredMaintenance.length})
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
                  Service Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vendor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cost
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Next Service
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMaintenance.map((record) => {
                const upcomingService = getUpcomingServiceStatus(record.next_service_due);
                return (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {record.vehicles_master.registration_number}
                        </div>
                        <div className="text-sm text-gray-500">
                          {record.vehicles_master.vehicle_type}
                        </div>
                        {record.odometer_reading && (
                          <div className="text-xs text-gray-400">
                            {record.odometer_reading.toLocaleString()} km
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {new Date(record.service_date).toLocaleDateString()}
                        </div>
                        <div className="text-sm text-gray-500">
                          {record.service_type || 'Service'}
                        </div>
                        {record.nature_of_repair && (
                          <div className="text-xs text-gray-400 truncate max-w-xs">
                            {record.nature_of_repair}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{record.vendor}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        ₹{record.cost.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        {record.next_service_due ? (
                          <>
                            <div className="text-sm text-gray-900">
                              {new Date(record.next_service_due).toLocaleDateString()}
                            </div>
                            {upcomingService && (
                              <div className={`text-xs ${
                                upcomingService.status === 'overdue' ? 'text-red-600' :
                                upcomingService.status === 'urgent' ? 'text-red-600' :
                                upcomingService.status === 'warning' ? 'text-yellow-600' : 'text-green-600'
                              }`}>
                                {upcomingService.status === 'overdue' ? `${upcomingService.days} days overdue` :
                                 upcomingService.status === 'urgent' ? `${upcomingService.days} days remaining` :
                                 upcomingService.status === 'warning' ? `${upcomingService.days} days remaining` :
                                 `${upcomingService.days} days remaining`}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-sm text-gray-400">Not scheduled</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {record.attachment_url && (
                          <a
                            href={record.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-900"
                            title="View Receipt"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => handleEdit(record)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit Record"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(record.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Record"
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
        {filteredMaintenance.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Wrench className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No maintenance records found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleMaintenance;
