import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  MapPin, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Filter,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Car,
  Calendar,
  Fuel,
  FileText
} from 'lucide-react';

const VehicleTrips = () => {
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [purposeFilter, setPurposeFilter] = useState('All');

  const [formData, setFormData] = useState({
    vehicle_id: '',
    trip_purpose: '',
    issued_to_name: '',
    issued_to_department: '',
    issued_to_contact: '',
    start_date_time: '',
    end_date_time: '',
    origin_location: '',
    destination_location: '',
    odometer_start: '',
    odometer_end: '',
    fuel_added: '',
    fuel_cost: '',
    trip_status: 'Active',
    approved_by: '',
    remarks: ''
  });

  const tripPurposes = [
    'Official Duty', 'Rental', 'Site Visit', 'Logistics', 
    'Training', 'Demo', 'Client Delivery', 'Emergency', 'Other'
  ];

  const tripStatuses = ['Active', 'Completed', 'Cancelled'];

  useEffect(() => {
    fetchTrips();
    fetchVehicles();
  }, []);

  const fetchTrips = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('operations_fire_tender_vehicle_trips')
        .select(`
          *,
          operations_fire_tender_vehicle_master!inner(registration_number, vehicle_type)
        `)
        .eq('operations_fire_tender_vehicle_master.user_id', user.id)
        .order('start_date_time', { ascending: false });

      if (error) throw error;
      setTrips(data || []);
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('operations_fire_tender_vehicle_master')
        .select('id, registration_number, vehicle_type, vehicle_status')
        .eq('user_id', user.id)
        .eq('vehicle_status', 'Available')
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

      const tripData = {
        vehicle_id: formData.vehicle_id ? (typeof formData.vehicle_id === 'number' ? formData.vehicle_id : parseInt(formData.vehicle_id, 10)) : null,
        trip_purpose: formData.trip_purpose || null,
        issued_to_name: formData.issued_to_name || null,
        issued_to_department: formData.issued_to_department || null,
        issued_to_contact: formData.issued_to_contact || null,
        start_date_time: formData.start_date_time && formData.start_date_time.trim() !== '' ? formData.start_date_time : null,
        end_date_time: formData.end_date_time && formData.end_date_time.trim() !== '' ? formData.end_date_time : null,
        origin_location: formData.origin_location || null,
        destination_location: formData.destination_location || null,
        odometer_start: formData.odometer_start !== '' && formData.odometer_start != null ? parseFloat(formData.odometer_start) : null,
        odometer_end: formData.odometer_end !== '' && formData.odometer_end != null ? parseFloat(formData.odometer_end) : null,
        fuel_added: formData.fuel_added !== '' && formData.fuel_added != null ? parseFloat(formData.fuel_added) : 0,
        fuel_cost: formData.fuel_cost !== '' && formData.fuel_cost != null ? parseFloat(formData.fuel_cost) : 0,
        trip_status: formData.trip_status || 'Active',
        approved_by: formData.approved_by || null,
        approval_date: formData.approved_by && formData.approved_by.trim() !== '' ? new Date().toISOString() : null,
        remarks: formData.remarks || null,
        user_id: user.id
      };

      if (editingTrip) {
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .update(tripData)
          .eq('id', editingTrip.id);

        if (error) throw error;
        alert('Trip updated successfully!');
      } else {
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .insert([tripData]);

        if (error) throw error;
        alert('Trip created successfully!');
      }

      resetForm();
      fetchTrips();
    } catch (error) {
      console.error('Error saving trip:', error);
      alert('Failed to save trip. Please try again.');
    }
  };

  const handleEdit = (trip) => {
    setEditingTrip(trip);
    setFormData({
      vehicle_id: trip.vehicle_id || '',
      trip_purpose: trip.trip_purpose || '',
      issued_to_name: trip.issued_to_name || '',
      issued_to_department: trip.issued_to_department || '',
      issued_to_contact: trip.issued_to_contact || '',
      start_date_time: trip.start_date_time ? new Date(trip.start_date_time).toISOString().slice(0, 16) : '',
      end_date_time: trip.end_date_time ? new Date(trip.end_date_time).toISOString().slice(0, 16) : '',
      origin_location: trip.origin_location || '',
      destination_location: trip.destination_location || '',
      odometer_start: trip.odometer_start || '',
      odometer_end: trip.odometer_end || '',
      fuel_added: trip.fuel_added || '',
      fuel_cost: trip.fuel_cost || '',
      trip_status: trip.trip_status || 'Active',
      approved_by: trip.approved_by || '',
      remarks: trip.remarks || ''
    });
    setShowForm(true);
  };

  const handleCompleteTrip = async (tripId) => {
    if (window.confirm('Are you sure you want to complete this trip?')) {
      try {
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .update({ 
            trip_status: 'Completed',
            end_date_time: new Date().toISOString()
          })
          .eq('id', tripId);

        if (error) throw error;
        alert('Trip completed successfully!');
        fetchTrips();
      } catch (error) {
        console.error('Error completing trip:', error);
        alert('Failed to complete trip. Please try again.');
      }
    }
  };

  const handleCancelTrip = async (tripId) => {
    if (window.confirm('Are you sure you want to cancel this trip?')) {
      try {
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .update({ trip_status: 'Cancelled' })
          .eq('id', tripId);

        if (error) throw error;
        alert('Trip cancelled successfully!');
        fetchTrips();
      } catch (error) {
        console.error('Error cancelling trip:', error);
        alert('Failed to cancel trip. Please try again.');
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this trip?')) {
      try {
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .delete()
          .eq('id', id);

        if (error) throw error;
        alert('Trip deleted successfully!');
        fetchTrips();
      } catch (error) {
        console.error('Error deleting trip:', error);
        alert('Failed to delete trip. Please try again.');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      vehicle_id: '',
      trip_purpose: '',
      issued_to_name: '',
      issued_to_department: '',
      issued_to_contact: '',
      start_date_time: '',
      end_date_time: '',
      origin_location: '',
      destination_location: '',
      odometer_start: '',
      odometer_end: '',
      fuel_added: '',
      fuel_cost: '',
      trip_status: 'Active',
      approved_by: '',
      remarks: ''
    });
    setEditingTrip(null);
    setShowForm(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'bg-blue-100 text-blue-800';
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Active': return <Clock className="h-4 w-4" />;
      case 'Completed': return <CheckCircle className="h-4 w-4" />;
      case 'Cancelled': return <XCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const filteredTrips = trips.filter(trip => {
    const vm = trip.operations_fire_tender_vehicle_master;
    const matchesSearch = 
      vm?.registration_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.issued_to_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.trip_purpose?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.origin_location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.destination_location?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'All' || trip.trip_status === statusFilter;
    const matchesPurpose = purposeFilter === 'All' || trip.trip_purpose === purposeFilter;
    
    return matchesSearch && matchesStatus && matchesPurpose;
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
          <h1 className="text-3xl font-bold text-gray-900">Vehicle Trips</h1>
          <p className="text-gray-600 mt-2">Track and manage vehicle usage</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus className="h-5 w-5" />
          <span>Issue Vehicle</span>
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search trips..."
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
            {tripStatuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select
            value={purposeFilter}
            onChange={(e) => setPurposeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="All">All Purposes</option>
            {tripPurposes.map(purpose => (
              <option key={purpose} value={purpose}>{purpose}</option>
            ))}
          </select>
          <button className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center justify-center space-x-2">
            <Download className="h-5 w-5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Trip Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingTrip ? 'Edit Trip' : 'Issue Vehicle'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Vehicle and Purpose */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Trip Details</h3>
                  
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Trip Purpose *</label>
                    <select
                      value={formData.trip_purpose}
                      onChange={(e) => setFormData({...formData, trip_purpose: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="">Select Purpose</option>
                      {tripPurposes.map(purpose => (
                        <option key={purpose} value={purpose}>{purpose}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date & Time *</label>
                    <input
                      type="datetime-local"
                      value={formData.start_date_time}
                      onChange={(e) => setFormData({...formData, start_date_time: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">End Date & Time</label>
                    <input
                      type="datetime-local"
                      value={formData.end_date_time}
                      onChange={(e) => setFormData({...formData, end_date_time: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Origin Location</label>
                    <input
                      type="text"
                      value={formData.origin_location}
                      onChange={(e) => setFormData({...formData, origin_location: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Destination Location</label>
                    <input
                      type="text"
                      value={formData.destination_location}
                      onChange={(e) => setFormData({...formData, destination_location: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Issued To and Odometer */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Issued To & Tracking</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Issued To Name *</label>
                    <input
                      type="text"
                      value={formData.issued_to_name}
                      onChange={(e) => setFormData({...formData, issued_to_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                    <input
                      type="text"
                      value={formData.issued_to_department}
                      onChange={(e) => setFormData({...formData, issued_to_department: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contact Number</label>
                    <input
                      type="text"
                      value={formData.issued_to_contact}
                      onChange={(e) => setFormData({...formData, issued_to_contact: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Odometer Start (km)</label>
                    <input
                      type="number"
                      value={formData.odometer_start}
                      onChange={(e) => setFormData({...formData, odometer_start: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="0"
                      step="0.1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Odometer End (km)</label>
                    <input
                      type="number"
                      value={formData.odometer_end}
                      onChange={(e) => setFormData({...formData, odometer_end: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="0"
                      step="0.1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fuel Added (Liters)</label>
                    <input
                      type="number"
                      value={formData.fuel_added}
                      onChange={(e) => setFormData({...formData, fuel_added: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="0"
                      step="0.1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fuel Cost (₹)</label>
                    <input
                      type="number"
                      value={formData.fuel_cost}
                      onChange={(e) => setFormData({...formData, fuel_cost: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Trip Status</label>
                    <select
                      value={formData.trip_status}
                      onChange={(e) => setFormData({...formData, trip_status: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {tripStatuses.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Approved By</label>
                    <input
                      type="text"
                      value={formData.approved_by}
                      onChange={(e) => setFormData({...formData, approved_by: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
                    <textarea
                      value={formData.remarks}
                      onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  {editingTrip ? 'Update Trip' : 'Issue Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Trips Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Vehicle Trips ({filteredTrips.length})
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
                  Purpose
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Issued To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Route
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
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
              {filteredTrips.map((trip) => (
                <tr key={trip.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {trip.operations_fire_tender_vehicle_master?.registration_number}
                      </div>
                      <div className="text-sm text-gray-500">
                        {trip.operations_fire_tender_vehicle_master?.vehicle_type}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{trip.trip_purpose}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {trip.issued_to_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {trip.issued_to_department}
                      </div>
                      {trip.issued_to_contact && (
                        <div className="text-xs text-gray-400">
                          {trip.issued_to_contact}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm text-gray-900">
                        {trip.origin_location || '-'}
                      </div>
                      <div className="text-sm text-gray-500">
                        → {trip.destination_location || '-'}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm text-gray-900">
                        {new Date(trip.start_date_time).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(trip.start_date_time).toLocaleTimeString()}
                      </div>
                      {trip.end_date_time && (
                        <div className="text-xs text-gray-400">
                          End: {new Date(trip.end_date_time).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(trip.trip_status)}`}>
                      {getStatusIcon(trip.trip_status)}
                      <span className="ml-1">{trip.trip_status}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      {trip.trip_status === 'Active' && (
                        <>
                          <button
                            onClick={() => handleCompleteTrip(trip.id)}
                            className="text-green-600 hover:text-green-900"
                            title="Complete Trip"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleCancelTrip(trip.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Cancel Trip"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleEdit(trip)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit Trip"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(trip.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete Trip"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredTrips.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <MapPin className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No trips found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleTrips;
