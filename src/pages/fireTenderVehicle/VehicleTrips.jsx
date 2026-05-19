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

const VehicleTrips = ({ vehicleCategory = 'in-house' }) => {
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [purposeFilter, setPurposeFilter] = useState('All');

  const [formData, setFormData] = useState({
    assignment_type: 'in-house',
    driver_name: '',
    vehicle_id: '',
    deployment_location: '',
    site_name: '',
    date_of_mobilisation: '',
    km_out: '',
    km_in: '',
    contract_start_date: '',
    contract_end_date: '',
    notes: '',
    responsible_person: '',
    site_visit_location: '',
    number_of_passengers: '',
    visit_date: '',
    visit_duration_days: '',
    departments_allotted: [],
    expense_attachments: [],
    remarks: '',
    trip_purpose: '',
    issued_to_name: '',
    issued_to_department: '',
    start_date_time: '',
    end_date_time: '',
    origin_location: '',
    destination_location: '',
    odometer_start: '',
    odometer_end: '',
    trip_status: 'Active',
    approved_by: ''
  });

  const tripPurposes = [
    'Fire Tender Vehicle Assignment',
    'In-House Vehicle Assignment'
  ];
  const departmentOptions = ['Operations', 'Safety', 'Maintenance', 'Admin', 'Projects', 'Logistics'];
  const fireTenderVehicleTypes = [
    'Multipurpose',
    'Foam Tender',
    'DCP Tender',
    'Water Bowser',
    'Quick Response Vehicle',
    'Water Mist'
  ];

  const tripStatuses = ['Active', 'Completed', 'Cancelled'];

  useEffect(() => {
    fetchTrips();
    fetchVehicles();
    fetchDrivers();
  }, [vehicleCategory]);

  const setVehicleStatus = async (vehicleId, status) => {
    if (!vehicleId) return;
    const { error } = await supabase
      .from('operations_fire_tender_vehicle_master')
      .update({ vehicle_status: status })
      .eq('id', vehicleId);
    if (error) throw error;
  };

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
        .eq('operations_fire_tender_vehicle_master.vehicle_category', vehicleCategory)
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
        .select('id, registration_number, vehicle_type, make, model, vehicle_status')
        .eq('user_id', user.id)
        .eq('vehicle_category', vehicleCategory)
        .in('vehicle_status', ['Available', 'On Duty'])
        .order('registration_number');

      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    }
  };

  const fetchDrivers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('operations_fire_tender_vehicle_drivers')
        .select('id, full_name')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setDrivers(data || []);
    } catch (error) {
      console.error('Error fetching drivers:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const selectedVehicleId = formData.vehicle_id
        ? (typeof formData.vehicle_id === 'number' ? formData.vehicle_id : parseInt(formData.vehicle_id, 10))
        : null;

      const tripData = {
        assignment_type: formData.assignment_type || null,
        vehicle_id: selectedVehicleId,
        trip_purpose: formData.assignment_type === 'fire-tender' ? 'Fire Tender Vehicle Assignment' : 'In-House Vehicle Assignment',
        issued_to_name: formData.assignment_type === 'fire-tender'
          ? (formData.driver_name || null)
          : (formData.responsible_person || null),
        issued_to_department: formData.assignment_type === 'in-house'
          ? (formData.departments_allotted.length ? formData.departments_allotted.join(', ') : null)
          : null,
        issued_to_contact: null,
        start_date_time: formData.assignment_type === 'fire-tender'
          ? (formData.date_of_mobilisation ? `${formData.date_of_mobilisation}T00:00` : null)
          : (formData.visit_date ? `${formData.visit_date}T00:00` : null),
        end_date_time: formData.assignment_type === 'fire-tender'
          ? (formData.contract_end_date ? `${formData.contract_end_date}T00:00` : null)
          : null,
        origin_location: formData.assignment_type === 'fire-tender'
          ? (formData.deployment_location || null)
          : (formData.site_visit_location || null),
        destination_location: formData.site_name || null,
        odometer_start: formData.km_out !== '' && formData.km_out != null ? parseFloat(formData.km_out) : null,
        odometer_end: formData.km_in !== '' && formData.km_in != null ? parseFloat(formData.km_in) : null,
        fuel_added: 0,
        fuel_cost: 0,
        trip_status: formData.trip_status || 'Active',
        approved_by: null,
        approval_date: null,
        remarks: formData.assignment_type === 'fire-tender' ? (formData.notes || null) : (formData.remarks || null),
        driver_name: formData.driver_name || null,
        deployment_location: formData.deployment_location || null,
        site_name: formData.site_name || null,
        date_of_mobilisation: formData.date_of_mobilisation || null,
        km_at_mobilisation_out: formData.km_out !== '' && formData.km_out != null ? parseFloat(formData.km_out) : null,
        km_at_demobilisation_in: formData.km_in !== '' && formData.km_in != null ? parseFloat(formData.km_in) : null,
        contract_start_date: formData.contract_start_date || null,
        contract_end_date: formData.contract_end_date || null,
        notes: formData.notes || null,
        responsible_person: formData.responsible_person || null,
        site_visit_location: formData.site_visit_location || null,
        number_of_passengers: formData.number_of_passengers !== '' && formData.number_of_passengers != null ? parseInt(formData.number_of_passengers, 10) : null,
        visit_date: formData.visit_date || null,
        visit_duration_days: formData.visit_duration_days !== '' && formData.visit_duration_days != null ? parseInt(formData.visit_duration_days, 10) : null,
        departments_allotted: formData.departments_allotted.length ? formData.departments_allotted : null,
        expense_attachments: formData.expense_attachments.length ? formData.expense_attachments : null,
        user_id: user.id
      };

      if (editingTrip) {
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .update(tripData)
          .eq('id', editingTrip.id);

        if (error) throw error;

        if (editingTrip.vehicle_id && editingTrip.vehicle_id !== selectedVehicleId) {
          await setVehicleStatus(editingTrip.vehicle_id, 'Available');
        }
        if (selectedVehicleId) {
          await setVehicleStatus(selectedVehicleId, tripData.trip_status === 'Active' ? 'On Duty' : 'Available');
        }
        alert('Trip updated successfully!');
      } else {
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .insert([tripData]);

        if (error) throw error;
        if (selectedVehicleId) {
          await setVehicleStatus(selectedVehicleId, tripData.trip_status === 'Active' ? 'On Duty' : 'Available');
        }
        alert('Trip created successfully!');
      }

      resetForm();
      fetchTrips();
      fetchVehicles();
    } catch (error) {
      console.error('Error saving trip:', error);
      alert('Failed to save trip. Please try again.');
    }
  };

  const handleEdit = (trip) => {
    setEditingTrip(trip);
    const assignmentType = trip.trip_purpose === 'Fire Tender Vehicle Assignment' ? 'fire-tender' : 'in-house';
    setFormData({
      assignment_type: trip.assignment_type || assignmentType,
      driver_name: trip.driver_name || (assignmentType === 'fire-tender' ? (trip.issued_to_name || '') : ''),
      vehicle_id: trip.vehicle_id || '',
      deployment_location: trip.deployment_location || (assignmentType === 'fire-tender' ? (trip.origin_location || '') : ''),
      site_name: trip.site_name || trip.destination_location || '',
      date_of_mobilisation: trip.date_of_mobilisation || (assignmentType === 'fire-tender' && trip.start_date_time ? new Date(trip.start_date_time).toISOString().slice(0, 10) : ''),
      km_out: trip.km_at_mobilisation_out ?? trip.odometer_start ?? '',
      km_in: trip.km_at_demobilisation_in ?? trip.odometer_end ?? '',
      contract_start_date: trip.contract_start_date || (assignmentType === 'fire-tender' && trip.start_date_time ? new Date(trip.start_date_time).toISOString().slice(0, 10) : ''),
      contract_end_date: trip.contract_end_date || (assignmentType === 'fire-tender' && trip.end_date_time ? new Date(trip.end_date_time).toISOString().slice(0, 10) : ''),
      notes: trip.notes || (assignmentType === 'fire-tender' ? (trip.remarks || '') : ''),
      responsible_person: trip.responsible_person || (assignmentType === 'in-house' ? (trip.issued_to_name || '') : ''),
      site_visit_location: trip.site_visit_location || (assignmentType === 'in-house' ? (trip.origin_location || '') : ''),
      number_of_passengers: trip.number_of_passengers ?? '',
      visit_date: trip.visit_date || (assignmentType === 'in-house' && trip.start_date_time ? new Date(trip.start_date_time).toISOString().slice(0, 10) : ''),
      visit_duration_days: trip.visit_duration_days ?? '',
      departments_allotted: Array.isArray(trip.departments_allotted)
        ? trip.departments_allotted
        : (trip.issued_to_department ? trip.issued_to_department.split(',').map((d) => d.trim()).filter(Boolean) : []),
      expense_attachments: Array.isArray(trip.expense_attachments) ? trip.expense_attachments : [],
      remarks: assignmentType === 'in-house' ? (trip.remarks || '') : '',
      trip_purpose: trip.trip_purpose || '',
      issued_to_name: trip.issued_to_name || '',
      issued_to_department: trip.issued_to_department || '',
      start_date_time: trip.start_date_time ? new Date(trip.start_date_time).toISOString().slice(0, 16) : '',
      end_date_time: trip.end_date_time ? new Date(trip.end_date_time).toISOString().slice(0, 16) : '',
      origin_location: trip.origin_location || '',
      destination_location: trip.destination_location || '',
      odometer_start: trip.odometer_start || '',
      odometer_end: trip.odometer_end || '',
      trip_status: trip.trip_status || 'Active',
      approved_by: trip.approved_by || '',
      issued_to_contact: '',
      fuel_added: '',
      fuel_cost: ''
    });
    setShowForm(true);
  };

  const handleCompleteTrip = async (tripId) => {
    if (window.confirm('Are you sure you want to complete this trip?')) {
      try {
        const trip = trips.find((item) => item.id === tripId);
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .update({ 
            trip_status: 'Completed',
            end_date_time: new Date().toISOString()
          })
          .eq('id', tripId);

        if (error) throw error;
        if (trip?.vehicle_id) {
          await setVehicleStatus(trip.vehicle_id, 'Available');
        }
        alert('Trip completed successfully!');
        fetchTrips();
        fetchVehicles();
      } catch (error) {
        console.error('Error completing trip:', error);
        alert('Failed to complete trip. Please try again.');
      }
    }
  };

  const handleCancelTrip = async (tripId) => {
    if (window.confirm('Are you sure you want to cancel this trip?')) {
      try {
        const trip = trips.find((item) => item.id === tripId);
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .update({ trip_status: 'Cancelled' })
          .eq('id', tripId);

        if (error) throw error;
        if (trip?.vehicle_id) {
          await setVehicleStatus(trip.vehicle_id, 'Available');
        }
        alert('Trip cancelled successfully!');
        fetchTrips();
        fetchVehicles();
      } catch (error) {
        console.error('Error cancelling trip:', error);
        alert('Failed to cancel trip. Please try again.');
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this trip?')) {
      try {
        const trip = trips.find((item) => item.id === id);
        const { error } = await supabase
          .from('operations_fire_tender_vehicle_trips')
          .delete()
          .eq('id', id);

        if (error) throw error;
        if (trip?.vehicle_id) {
          await setVehicleStatus(trip.vehicle_id, 'Available');
        }
        alert('Trip deleted successfully!');
        fetchTrips();
        fetchVehicles();
      } catch (error) {
        console.error('Error deleting trip:', error);
        alert('Failed to delete trip. Please try again.');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      assignment_type: 'in-house',
      driver_name: '',
      vehicle_id: '',
      deployment_location: '',
      site_name: '',
      date_of_mobilisation: '',
      km_out: '',
      km_in: '',
      contract_start_date: '',
      contract_end_date: '',
      notes: '',
      responsible_person: '',
      site_visit_location: '',
      number_of_passengers: '',
      visit_date: '',
      visit_duration_days: '',
      departments_allotted: [],
      expense_attachments: [],
      remarks: '',
      trip_purpose: '',
      issued_to_name: '',
      issued_to_department: '',
      start_date_time: '',
      end_date_time: '',
      origin_location: '',
      destination_location: '',
      odometer_start: '',
      odometer_end: '',
      trip_status: 'Active',
      approved_by: '',
      issued_to_contact: '',
      fuel_added: '',
      fuel_cost: ''
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

  const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === String(formData.vehicle_id));
  const autoVehicleName = selectedVehicle ? [selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(' ') : '';
  const filteredAssignmentVehicles = vehicles.filter((vehicle) => {
    const isFireTenderVehicle = fireTenderVehicleTypes.includes(vehicle.vehicle_type);
    return formData.assignment_type === 'fire-tender' ? isFireTenderVehicle : !isFireTenderVehicle;
  });

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
          <span>Assign Vehicle</span>
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
                {editingTrip ? 'Edit Trip' : 'Assign Vehicle'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Assignment Type</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Type *</label>
                    <select
                      value={formData.assignment_type}
                      onChange={(e) => setFormData({ ...formData, assignment_type: e.target.value, vehicle_id: '' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="in-house">In-House Vehicle</option>
                      <option value="fire-tender">Fire Tender Vehicle</option>
                    </select>
                  </div>
                </div>
              </div>

              {formData.assignment_type === 'fire-tender' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Fire Tender Vehicle Assignment</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Driver Name *</label>
                      <select
                        value={formData.driver_name}
                        onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      >
                        <option value="">Select Driver</option>
                        {drivers.map((driver) => (
                          <option key={driver.id} value={driver.full_name}>{driver.full_name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle *</label>
                      <select
                        value={formData.vehicle_id}
                        onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      >
                        <option value="">Select Vehicle</option>
                        {filteredAssignmentVehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.registration_number} - {vehicle.vehicle_type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Number</label>
                      <input type="text" value={selectedVehicle?.registration_number || ''} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50" readOnly />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Name</label>
                      <input type="text" value={autoVehicleName} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50" readOnly />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Deployment Location *</label>
                      <input type="text" value={formData.deployment_location} onChange={(e) => setFormData({ ...formData, deployment_location: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Site Name *</label>
                      <input type="text" value={formData.site_name} onChange={(e) => setFormData({ ...formData, site_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Date of Mobilisation *</label>
                      <input type="date" value={formData.date_of_mobilisation} onChange={(e) => setFormData({ ...formData, date_of_mobilisation: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Km at Mobilisation (Out)</label>
                      <input type="number" min="0" value={formData.km_out} onChange={(e) => setFormData({ ...formData, km_out: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Km at De-mobilisation (In)</label>
                      <input type="number" min="0" value={formData.km_in} onChange={(e) => setFormData({ ...formData, km_in: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Contract Period (Start)</label>
                      <input type="date" value={formData.contract_start_date} onChange={(e) => setFormData({ ...formData, contract_start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Contract Period (End)</label>
                      <input type="date" value={formData.contract_end_date} onChange={(e) => setFormData({ ...formData, contract_end_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                      <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                  </div>
                </div>
              )}

              {formData.assignment_type === 'in-house' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">In-House Vehicle Assignment</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Driver / Responsible Person *</label>
                      <input
                        type="text"
                        list="driver-master-list"
                        value={formData.responsible_person}
                        onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                      <datalist id="driver-master-list">
                        {drivers.map((driver) => (
                          <option key={driver.id} value={driver.full_name} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle *</label>
                      <select
                        value={formData.vehicle_id}
                        onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      >
                        <option value="">Select Vehicle</option>
                        {filteredAssignmentVehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.registration_number} - {vehicle.vehicle_type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Site Visit Location *</label>
                      <input type="text" value={formData.site_visit_location} onChange={(e) => setFormData({ ...formData, site_visit_location: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Site Name *</label>
                      <input type="text" value={formData.site_name} onChange={(e) => setFormData({ ...formData, site_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Number of Passengers</label>
                      <input type="number" min="0" value={formData.number_of_passengers} onChange={(e) => setFormData({ ...formData, number_of_passengers: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Visit Date *</label>
                      <input type="date" value={formData.visit_date} onChange={(e) => setFormData({ ...formData, visit_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Visit Duration (Days)</label>
                      <input type="number" min="0" value={formData.visit_duration_days} onChange={(e) => setFormData({ ...formData, visit_duration_days: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Department(s) Allotted</label>
                      <select
                        multiple
                        value={formData.departments_allotted}
                        onChange={(e) => setFormData({ ...formData, departments_allotted: Array.from(e.target.selectedOptions, (option) => option.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {departmentOptions.map((dept) => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Odometer Out (Km)</label>
                      <input type="number" min="0" value={formData.km_out} onChange={(e) => setFormData({ ...formData, km_out: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Odometer In (Km)</label>
                      <input type="number" min="0" value={formData.km_in} onChange={(e) => setFormData({ ...formData, km_in: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Expense Attachments</label>
                      <input
                        type="file"
                        multiple
                        onChange={(e) => setFormData({ ...formData, expense_attachments: Array.from(e.target.files || []).map((file) => file.name) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
                      <textarea value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                  </div>
                </div>
              )}

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
                  {editingTrip ? 'Update Trip' : 'Assign Vehicle'}
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
                  Assigned To
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
