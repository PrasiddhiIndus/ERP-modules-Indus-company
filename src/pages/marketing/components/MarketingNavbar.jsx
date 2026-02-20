import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  DollarSign, 
  Calendar, 
  Users, 
  Package, 
  ShoppingCart,
  MapPin,
  Receipt
} from 'lucide-react';

const MarketingNavbar = () => {
  const location = useLocation();

  const navItems = [
    { path: '/app/marketing', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/app/marketing/enquiry-master', icon: FileText, label: 'Enquiry Master' },
    { path: '/app/marketing/quotation-tracker', icon: DollarSign, label: 'Quotation Tracker' },
    { path: '/app/marketing/follow-up-planner', icon: Calendar, label: 'Follow-up Planner' },
    { path: '/app/marketing/client-master', icon: Users, label: 'Client Master' },
    { path: '/app/marketing/product-catalog', icon: Package, label: 'Product Catalog' },
    { path: '/app/marketing/purchase-orders', icon: ShoppingCart, label: 'Purchase Orders' },
    { path: '/app/marketing/expo-seminar', icon: MapPin, label: 'Expo & Seminar' },
    { path: '/app/marketing/gst-upload', icon: Receipt, label: 'GST Documents' },
  ];

  return (
    <div className="bg-white shadow-sm border-b mb-6">
      <div className="px-6 py-4">
        <nav className="flex space-x-1 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-purple-100 text-purple-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default MarketingNavbar;

