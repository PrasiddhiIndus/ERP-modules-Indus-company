import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Car, 
  Wrench, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Users, 
  FileText,
  Calendar,
  TrendingUp,
  MapPin,
  Fuel,
  Activity
} from 'lucide-react';

const VehicleManagementDashboard = () => {
  const [dashboardData, setDashboardData] = useState({
    totalVehicles: 0,
    availableVehicles: 0,
    onDutyVehicles: 0,
    underMaintenanceVehicles: 0,
    expiredDocuments: 0,
    upcomingExpiries: 0,
    activeTrips: 0,
    totalDrivers: 0
  });
  const [recentTrips, setRecentTrips] = useState([]);
  const [upcomingExpiries, setUpcomingExpiries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch vehicle counts by status
      const { data: vehicles, error: vehiclesError } = await supabase
        .from('vehicles_master')
        .select('vehicle_status')
        .eq('user_id', user.id);

      if (vehiclesError) throw vehiclesError;

      // Count vehicles by status
      const statusCounts = vehicles.reduce((acc, vehicle) => {
        acc[vehicle.vehicle_status] = (acc[vehicle.vehicle_status] || 0) + 1;
        return acc;
      }, {});

      // Fetch document expiries
      const { data: expiries, error: expiriesError } = await supabase
        .from('vehicle_documents')
        .select(`
          expiry_date,
          alert_status,
          vehicles_master!inner(registration_number)
        `)
        .eq('vehicles_master.user_id', user.id);

      if (expiriesError) throw expiriesError;

      const expiredDocs = expiries.filter(doc => doc.alert_status === 'Expired').length;
      const warningDocs = expiries.filter(doc => doc.alert_status === 'Warning').length;

      // Fetch active trips
      const { data: trips, error: tripsError } = await supabase
        .from('vehicle_trips')
        .select(`
          id,
          trip_purpose,
          issued_to_name,
          start_date_time,
          vehicles_master!inner(registration_number)
        `)
        .eq('trip_status', 'Active')
        .eq('vehicles_master.user_id', user.id)
        .order('start_date_time', { ascending: false })
        .limit(5);

      if (tripsError) throw tripsError;

      // Fetch drivers count
      const { data: drivers, error: driversError } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (driversError) throw driversError;

      setDashboardData({
        totalVehicles: vehicles.length,
        availableVehicles: statusCounts['Available'] || 0,
        onDutyVehicles: statusCounts['On Duty'] || 0,
        underMaintenanceVehicles: statusCounts['Under Maintenance'] || 0,
        expiredDocuments: expiredDocs,
        upcomingExpiries: warningDocs,
        activeTrips: trips.length,
        totalDrivers: drivers.length
      });

      setRecentTrips(trips || []);
      setUpcomingExpiries(expiries.filter(doc => doc.alert_status === 'Warning').slice(0, 5));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Available': return 'text-green-600 bg-green-100';
      case 'On Duty': return 'text-blue-600 bg-blue-100';
      case 'Under Maintenance': return 'text-yellow-600 bg-yellow-100';
      case 'Out for Repair': return 'text-red-600 bg-red-100';
      case 'Rented': return 'text-purple-600 bg-purple-100';
      case 'Decommissioned': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getAlertColor = (alertStatus) => {
    switch (alertStatus) {
      case 'Expired': return 'text-red-600 bg-red-100';
      case 'Warning': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-green-600 bg-green-100';
    }
  };

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
          <h1 className="text-3xl font-bold text-gray-900">Vehicle Management Dashboard</h1>
          <p className="text-gray-600 mt-2">Monitor and manage your fleet operations</p>
        </div>
        <div className="flex space-x-3">
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2">
            <Car className="h-5 w-5" />
            <span>Add Vehicle</span>
          </button>
          <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Issue Vehicle</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Vehicles */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Vehicles</p>
              <p className="text-3xl font-bold text-gray-900">{dashboardData.totalVehicles}</p>
            </div>
            <Car className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        {/* Available Vehicles */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Available</p>
              <p className="text-3xl font-bold text-gray-900">{dashboardData.availableVehicles}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </div>

        {/* On Duty Vehicles */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">On Duty</p>
              <p className="text-3xl font-bold text-gray-900">{dashboardData.onDutyVehicles}</p>
            </div>
            <Activity className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        {/* Under Maintenance */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Under Maintenance</p>
              <p className="text-3xl font-bold text-gray-900">{dashboardData.underMaintenanceVehicles}</p>
            </div>
            <Wrench className="h-8 w-8 text-yellow-500" />
          </div>
        </div>

        {/* Active Trips */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Trips</p>
              <p className="text-3xl font-bold text-gray-900">{dashboardData.activeTrips}</p>
            </div>
            <MapPin className="h-8 w-8 text-purple-500" />
          </div>
        </div>

        {/* Total Drivers */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Drivers</p>
              <p className="text-3xl font-bold text-gray-900">{dashboardData.totalDrivers}</p>
            </div>
            <Users className="h-8 w-8 text-indigo-500" />
          </div>
        </div>

        {/* Expired Documents */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expired Documents</p>
              <p className="text-3xl font-bold text-gray-900">{dashboardData.expiredDocuments}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>

        {/* Upcoming Expiries */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Upcoming Expiries</p>
              <p className="text-3xl font-bold text-gray-900">{dashboardData.upcomingExpiries}</p>
            </div>
            <Clock className="h-8 w-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Trips */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
              <MapPin className="h-5 w-5 text-blue-500" />
              <span>Recent Active Trips</span>
            </h3>
          </div>
          <div className="p-6">
            {recentTrips.length > 0 ? (
              <div className="space-y-4">
                {recentTrips.map((trip) => (
                  <div key={trip.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{trip.vehicles_master.registration_number}</p>
                      <p className="text-sm text-gray-600">{trip.trip_purpose}</p>
                      <p className="text-sm text-gray-500">Issued to: {trip.issued_to_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">
                        {new Date(trip.start_date_time).toLocaleDateString()}
                      </p>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Active
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <MapPin className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No active trips</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Expiries */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <span>Upcoming Document Expiries</span>
            </h3>
          </div>
          <div className="p-6">
            {upcomingExpiries.length > 0 ? (
              <div className="space-y-4">
                {upcomingExpiries.map((expiry, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{expiry.vehicles_master.registration_number}</p>
                      <p className="text-sm text-gray-600">{expiry.document_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">
                        {new Date(expiry.expiry_date).toLocaleDateString()}
                      </p>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        Warning
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No upcoming expiries</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors">
            <Car className="h-6 w-6 text-gray-400 mr-2" />
            <span className="text-gray-600">Add New Vehicle</span>
          </button>
          <button className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors">
            <FileText className="h-6 w-6 text-gray-400 mr-2" />
            <span className="text-gray-600">Issue Vehicle</span>
          </button>
          <button className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-yellow-500 hover:bg-yellow-50 transition-colors">
            <Wrench className="h-6 w-6 text-gray-400 mr-2" />
            <span className="text-gray-600">Schedule Service</span>
          </button>
          <button className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors">
            <Calendar className="h-6 w-6 text-gray-400 mr-2" />
            <span className="text-gray-600">View Reports</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VehicleManagementDashboard;
