import React, { useState } from 'react';
import { 
  Car, 
  MapPin, 
  FileText, 
  Wrench, 
  Users, 
  BarChart3,
  Settings,
  Home
} from 'lucide-react';
import VehicleManagementDashboard from './VehicleManagementDashboard';
import VehicleMaster from './VehicleMaster';
import VehicleTrips from './VehicleTrips';
import VehicleDocuments from './VehicleDocuments';
import VehicleMaintenance from './VehicleMaintenance';
import DriverManagement from './DriverManagement';

const FireTenderVehicleManagement = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [vehicleType, setVehicleType] = useState('in-house');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, component: VehicleManagementDashboard },
    { id: 'vehicles', label: 'Vehicle Master', icon: Car, component: VehicleMaster },
    { id: 'trips', label: 'Vehicle Trips', icon: MapPin, component: VehicleTrips },
    { id: 'documents', label: 'Documents', icon: FileText, component: VehicleDocuments },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench, component: VehicleMaintenance },
    { id: 'drivers', label: 'Driver Management', icon: Users, component: DriverManagement }
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || VehicleManagementDashboard;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Fleet Management</h1>
              <p className="text-gray-600 mt-1">Comprehensive fleet management system</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label htmlFor="vehicle-type" className="text-sm font-medium text-gray-700">
                  Vehicle Type:
                </label>
                <select
                  id="vehicle-type"
                  value={vehicleType}
                  onChange={(event) => setVehicleType(event.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="in-house">In-House Vehicles</option>
                  <option value="fire-tender">Fire Tender Vehicles</option>
                </select>
              </div>
              <div className="text-sm text-gray-500">
                Last updated: {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        {activeTab === 'dashboard' ? (
          <VehicleManagementDashboard onNavigate={setActiveTab} />
        ) : (
          <ActiveComponent />
        )}
      </div>
    </div>
  );
};

export default FireTenderVehicleManagement;