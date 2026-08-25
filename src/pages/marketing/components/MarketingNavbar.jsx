import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DollarSign } from 'lucide-react';
import { MARKETING_NAV_ITEMS } from '../marketingNav';

const MarketingNavbar = () => {
  const location = useLocation();

  return (
    <div className="bg-white shadow-sm border-b border-slate-200/90 mb-6 rounded-b-xl ring-1 ring-slate-900/[0.04]">
      <div className="px-4 sm:px-6 py-3 sm:py-4">
        <nav className="flex gap-1 sm:gap-1.5 overflow-x-auto pb-0.5">
          {MARKETING_NAV_ITEMS.map((item) => {
            const Icon = item.useRupee ? DollarSign : item.icon;
            const isActive = item.end
              ? location.pathname === item.path
              : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

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
                {Icon ? (
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-red-600' : 'text-gray-500'}`} />
                ) : null}
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
