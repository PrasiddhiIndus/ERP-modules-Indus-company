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
              <h1 className="text-2xl font-bold text-gray-900">Fire Tender/Vehicle Management</h1>
              <p className="text-gray-600 mt-1">Comprehensive fleet management system</p>
            </div>
            <div className="flex items-center space-x-4">
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
        <ActiveComponent />
      </div>
    </div>
  );
};

export default FireTenderVehicleManagement;