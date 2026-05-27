import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { SALARY_NAV } from './salaryNav';

const linkClass = ({ isActive }) =>
  `block px-3 py-2 rounded-lg text-xs font-medium transition ${
    isActive ? 'bg-[#1F3A8A] text-white' : 'text-gray-700 hover:bg-gray-100'
  }`;

export default function SalaryLayout() {
  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[60vh]">
      <aside className="lg:w-52 shrink-0">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2 sticky top-4">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Salary Management</p>
          <nav className="flex flex-row lg:flex-col flex-wrap gap-1 mt-1" aria-label="Salary management">
            {SALARY_NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass} end={item.to === 'dashboard'}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
