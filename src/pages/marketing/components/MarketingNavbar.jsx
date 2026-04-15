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
    <div className="bg-white shadow-sm border-b border-slate-200/90 mb-6 rounded-b-xl ring-1 ring-slate-900/[0.04]">
      <div className="px-4 sm:px-6 py-3 sm:py-4">
        <nav className="flex gap-1 sm:gap-1.5 overflow-x-auto pb-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg text-sm transition-colors shrink-0 ${
                  isActive
                    ? 'bg-red-50 text-red-800 font-semibold ring-1 ring-red-100 shadow-sm'
                    : 'text-gray-600 hover:bg-slate-50 hover:text-gray-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-red-600' : 'text-gray-500'}`} />
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

