import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cake, Download, Phone, Upload, User, UserPlus } from 'lucide-react';
import { salaryAppPath } from './salaryNav';
import {
  appendEmployeeMasterRows,
  DEMO_EMPLOYEES,
  formatDobDisplay,
  initialsFromName,
  loadEmployeeMasterList,
} from './employeeMasterStorage';
import { downloadEmployeeMasterTemplate, parseEmployeeMasterExcel } from './employeeMasterExcel';

export default function SalaryEmployeeMaster() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [employees, setEmployees] = useState(() => loadEmployeeMasterList());
  const [search, setSearch] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [importBusy, setImportBusy] = useState(false);

  const refresh = () => setEmployees(loadEmployeeMasterList());

  const filterRows = (list) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (e) =>
        e.name?.toLowerCase().includes(q) ||
        e.phone?.toLowerCase().includes(q) ||
        formatDobDisplay(e.dob).includes(q)
    );
  };

  const showingDemo = employees.length === 0;
  const filtered = showingDemo ? filterRows(DEMO_EMPLOYEES) : filterRows(employees);

  const handleImport = async (file) => {
    if (!file) return;
    setImportBusy(true);
    setImportMsg('');
    try {
      const { rows, skipped } = await parseEmployeeMasterExcel(file);
      const count = appendEmployeeMasterRows(rows);
      refresh();
      const skipNote = skipped.length ? ` · ${skipped.length} row(s) skipped` : '';
      setImportMsg(`${count} employee(s) imported from Excel${skipNote}`);
    } catch (err) {
      setImportMsg(err.message || 'Import failed');
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div className="space-y-4 min-h-[60vh]">
      <div>
        <h2 className="text-lg font-semibold text-[#1F3A8A]">People Master</h2>
        <p className="text-xs text-gray-500 mt-0.5">Employee master details · Indus Fire Safety Private Limited</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, DOB…"
          className="w-56 sm:w-64 h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        />

        <button
          type="button"
          disabled={importBusy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-60 shadow-sm"
        >
          <Upload className="h-3.5 w-3.5" />
          {importBusy ? 'Importing…' : 'Employee import'}
        </button>

        <button
          type="button"
          onClick={downloadEmployeeMasterTemplate}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 shadow-sm"
        >
          <Download className="h-3.5 w-3.5" />
          Download template
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            void handleImport(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <button
          type="button"
          onClick={() => navigate(salaryAppPath('people-master/new'))}
          className="ml-auto inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium hover:bg-[#1a3278] shadow-sm"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add employee
        </button>
      </div>

      {importMsg ? (
        <div className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-700">{importMsg}</div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
        {showingDemo ? (
          <div className="px-3 py-2 text-xs border-b border-amber-100 bg-amber-50 text-amber-800">
            Showing 2 sample employees — import or add to replace with your data.
          </div>
        ) : null}

        <div className="hidden sm:grid sm:grid-cols-[44px_1fr_140px_120px_130px] gap-3 px-3 py-2 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span />
          <span>Name</span>
          <span>Phone</span>
          <span>DOB</span>
          <span className="text-right">Action</span>
        </div>

        <div className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">
              No employees match your search.
            </div>
          ) : (
            filtered.map((emp) => (
              <div
                key={emp.id}
                className="grid grid-cols-1 sm:grid-cols-[44px_1fr_140px_120px_130px] items-center gap-3 px-3 py-3 bg-white hover:bg-slate-50/80"
              >
                <div className="h-11 w-11 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center shrink-0 overflow-hidden">
                  <span className="text-xs font-semibold text-slate-600">{initialsFromName(emp.name)}</span>
                </div>

                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate(salaryAppPath(`people-master/${emp.id}`))}
                    className="text-sm font-medium text-[#2563eb] hover:underline text-left"
                  >
                    {emp.name || '—'}
                  </button>
                  <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5 sm:hidden">
                    <Phone className="h-3 w-3 text-blue-500" />
                    <span>{emp.phone || '—'}</span>
                    <span className="text-gray-300">·</span>
                    <Cake className="h-3 w-3 text-pink-500" />
                    <span>{formatDobDisplay(emp.dob)}</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-500 mt-0.5">
                    <User className="h-3 w-3" />
                    <span>{emp.employeeCode || emp.id.slice(-4).toUpperCase()}</span>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-700">
                  <Phone className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <span>{emp.phone || '—'}</span>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-700">
                  <Cake className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                  <span>{formatDobDisplay(emp.dob)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(salaryAppPath(`people-master/${emp.id}`))}
                  className="sm:justify-self-end h-8 px-3 rounded-md border border-[#1F3A8A] text-[#1F3A8A] text-xs font-medium hover:bg-blue-50 shrink-0"
                >
                  Employee profile
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
