import { formatDateDdMmYyyy } from '../../utils/dateDisplay';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  fleetQueryErrorMessage,
  withFleetVehicleCategoryFilter,
  withFleetMasterCategoryFilter,
} from './fleetLoadUtils';
import { 
  Car, 
  Wrench, 
  AlertTriangle, 
  CheckCircle, 
  FileText,
  Calendar,
  MapPin
} from 'lucide-react';
import {
  SparkKpi,
  ChartPanel,
  DonutChart,
  BarCompareChart,
  RadialScoreChart,
  sparkFromValue,
  CHART_SERIES,
} from '../../components/charts/DashboardCharts';

const VehicleManagementDashboard = ({ onNavigate, vehicleCategory = 'in-house' }) => {
  const { user, loading: authLoading } = useAuth();
  const [loadError, setLoadError] = useState(null);
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
  const [statusMix, setStatusMix] = useState([]);
  const [documentHealth, setDocumentHealth] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setLoadError('Sign in to load fleet data.');
      setLoading(false);
      return;
    }
    fetchDashboardData();
  }, [vehicleCategory, authLoading, user?.id]);

  const fetchDashboardData = async () => {
    setLoadError(null);
    try {
      // Fetch vehicle counts by status
      const { data: vehicles, error: vehiclesError } = await withFleetVehicleCategoryFilter(
        supabase.from('operations_fire_tender_vehicle_master').select('vehicle_status'),
        vehicleCategory
      );

      if (vehiclesError) throw vehiclesError;

      // Count vehicles by status
      const statusCounts = (vehicles || []).reduce((acc, vehicle) => {
        acc[vehicle.vehicle_status] = (acc[vehicle.vehicle_status] || 0) + 1;
        return acc;
      }, {});

      // Fetch document expiries
      const { data: expiries, error: expiriesError } = await withFleetMasterCategoryFilter(
        supabase
          .from('operations_fire_tender_vehicle_documents')
          .select(`
          expiry_date,
          alert_status,
          document_type,
          operations_fire_tender_vehicle_master!inner(registration_number)
        `),
        vehicleCategory
      );

      if (expiriesError) throw expiriesError;

      const expiredDocs = expiries.filter(doc => doc.alert_status === 'Expired').length;
      const warningDocs = expiries.filter(doc => doc.alert_status === 'Warning').length;
      const validDocs = Math.max(0, expiries.length - expiredDocs - warningDocs);

      // Fetch active trips
      const { data: trips, error: tripsError } = await withFleetMasterCategoryFilter(
        supabase
          .from('operations_fire_tender_vehicle_trips')
          .select(`
          id,
          trip_purpose,
          issued_to_name,
          start_date_time,
          operations_fire_tender_vehicle_master!inner(registration_number)
        `)
          .eq('trip_status', 'Active')
          .order('start_date_time', { ascending: false })
          .limit(5),
        vehicleCategory
      );

      if (tripsError) throw tripsError;

      // Fetch drivers count
      const { data: drivers, error: driversError } = await supabase
        .from('operations_fire_tender_vehicle_drivers')
        .select('id')
        .eq('is_active', true);

      if (driversError) throw driversError;

      setDashboardData({
        totalVehicles: (vehicles || []).length,
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
      setStatusMix(
        Object.entries(statusCounts)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      );
      setDocumentHealth([
        { name: 'Valid', value: validDocs },
        { name: 'Expiring soon', value: warningDocs },
        { name: 'Expired', value: expiredDocs },
      ]);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoadError(fleetQueryErrorMessage(error));
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
      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </div>
      ) : null}
      {/* Header */}
      <div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Vehicle Management Dashboard</h1>
          <p className="text-gray-600 mt-2">Monitor and manage your fleet operations</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Vehicles', value: dashboardData.totalVehicles },
          { label: 'Available', value: dashboardData.availableVehicles },
          { label: 'On Duty', value: dashboardData.onDutyVehicles },
          { label: 'Under Maintenance', value: dashboardData.underMaintenanceVehicles },
          { label: 'Active Trips', value: dashboardData.activeTrips },
          { label: 'Active Drivers', value: dashboardData.totalDrivers },
          { label: 'Expired Documents', value: dashboardData.expiredDocuments },
          { label: 'Upcoming Expiries', value: dashboardData.upcomingExpiries },
        ].map((k, i) => (
          <SparkKpi
            key={k.label}
            label={k.label}
            value={k.value}
            series={sparkFromValue(Number(k.value) || 0)}
            color={CHART_SERIES[i % CHART_SERIES.length]}
          />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartPanel title="Fleet status mix" subtitle="Vehicles by current status" height={220}>
          <DonutChart data={statusMix} centerLabel="Vehicles" centerValue={dashboardData.totalVehicles} height={200} />
        </ChartPanel>
        <ChartPanel title="Document compliance" subtitle="Valid vs expiring vs expired" height={220}>
          <BarCompareChart
            data={documentHealth}
            series={[{ key: 'value', name: 'Documents', color: CHART_SERIES[1] }]}
            height={200}
          />
        </ChartPanel>
        <ChartPanel title="Fleet availability" subtitle="Available of total fleet" height={220}>
          <RadialScoreChart
            value={dashboardData.availableVehicles}
            max={dashboardData.totalVehicles}
            label="Available"
            color={CHART_SERIES[0]}
            height={200}
          />
        </ChartPanel>
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
                      <p className="font-medium text-gray-900">{trip.operations_fire_tender_vehicle_master?.registration_number}</p>
                      <p className="text-sm text-gray-600">{trip.trip_purpose}</p>
                      <p className="text-sm text-gray-500">Issued to: {trip.issued_to_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">
                        {formatDateDdMmYyyy(trip.start_date_time)}
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
                      <p className="font-medium text-gray-900">{expiry.operations_fire_tender_vehicle_master?.registration_number}</p>
                      <p className="text-sm text-gray-600">{expiry.document_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">
                        {formatDateDdMmYyyy(expiry.expiry_date)}
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
          <button
            onClick={() => onNavigate?.('vehicles')}
            className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Car className="h-6 w-6 text-gray-400 mr-2" />
            <span className="text-gray-600">Add New Vehicle</span>
          </button>
          <button
            onClick={() => onNavigate?.('trips')}
            className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors"
          >
            <FileText className="h-6 w-6 text-gray-400 mr-2" />
            <span className="text-gray-600">Assign Vehicle</span>
          </button>
          <button
            onClick={() => onNavigate?.('maintenance')}
            className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-yellow-500 hover:bg-yellow-50 transition-colors"
          >
            <Wrench className="h-6 w-6 text-gray-400 mr-2" />
            <span className="text-gray-600">Schedule Service</span>
          </button>
          <button
            onClick={() => onNavigate?.('documents')}
            className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors"
          >
            <Calendar className="h-6 w-6 text-gray-400 mr-2" />
            <span className="text-gray-600">View Reports</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VehicleManagementDashboard;
