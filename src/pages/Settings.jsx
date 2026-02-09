import React from 'react';
import { Settings, User, Bell, Shield, Database, Palette } from 'lucide-react';

const SettingsPage = () => {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="bg-white shadow p-6 rounded-lg mb-6">
        <h2 className="text-2xl font-semibold mb-4 flex items-center">
          <Settings className="h-6 w-6 mr-2" />
          Settings
        </h2>
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <Settings className="mx-auto h-12 w-12" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Settings Module</h3>
          <p className="text-gray-500">System settings and configuration options will be available here.</p>
        </div>
      </div>

      {/* Settings Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* User Settings */}
        <div className="bg-white shadow p-6 rounded-lg">
          <div className="flex items-center mb-4">
            <User className="h-6 w-6 text-blue-600 mr-2" />
            <h3 className="text-lg font-semibold">User Settings</h3>
          </div>
          <p className="text-gray-600 text-sm">Manage user preferences, profile settings, and account information.</p>
        </div>

        {/* Notifications */}
        <div className="bg-white shadow p-6 rounded-lg">
          <div className="flex items-center mb-4">
            <Bell className="h-6 w-6 text-yellow-600 mr-2" />
            <h3 className="text-lg font-semibold">Notifications</h3>
          </div>
          <p className="text-gray-600 text-sm">Configure notification preferences and alert settings.</p>
        </div>

        {/* Security */}
        <div className="bg-white shadow p-6 rounded-lg">
          <div className="flex items-center mb-4">
            <Shield className="h-6 w-6 text-green-600 mr-2" />
            <h3 className="text-lg font-semibold">Security</h3>
          </div>
          <p className="text-gray-600 text-sm">Manage security settings, passwords, and access controls.</p>
        </div>

        {/* Database */}
        <div className="bg-white shadow p-6 rounded-lg">
          <div className="flex items-center mb-4">
            <Database className="h-6 w-6 text-purple-600 mr-2" />
            <h3 className="text-lg font-semibold">Database</h3>
          </div>
          <p className="text-gray-600 text-sm">Database configuration and backup settings.</p>
        </div>

        {/* Appearance */}
        <div className="bg-white shadow p-6 rounded-lg">
          <div className="flex items-center mb-4">
            <Palette className="h-6 w-6 text-pink-600 mr-2" />
            <h3 className="text-lg font-semibold">Appearance</h3>
          </div>
          <p className="text-gray-600 text-sm">Customize the look and feel of the application.</p>
        </div>

        {/* System */}
        <div className="bg-white shadow p-6 rounded-lg">
          <div className="flex items-center mb-4">
            <Settings className="h-6 w-6 text-gray-600 mr-2" />
            <h3 className="text-lg font-semibold">System</h3>
          </div>
          <p className="text-gray-600 text-sm">System-wide configuration and maintenance options.</p>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
