import React from "react";
import { BarChart3, Activity, Calendar, User } from "lucide-react";

const Dashboard = () => {
  const stats = [
    { label: "Total Projects", value: "12", icon: BarChart3, color: "bg-blue-500" },
    { label: "Active Tasks", value: "8", icon: Activity, color: "bg-green-500" },
    { label: "Completed", value: "24", icon: Calendar, color: "bg-purple-500" },
    { label: "Team Members", value: "6", icon: User, color: "bg-orange-500" },
  ];

  return (
    <div>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Example Section */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Updates
        </h3>
        <p className="text-sm text-gray-600">
          This is your dashboard overview. Add charts, activity feeds, or
          quick links here.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
