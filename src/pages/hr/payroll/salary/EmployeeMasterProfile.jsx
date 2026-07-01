import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, User } from 'lucide-react';
import { salaryAppPath } from './salaryNav';;
import FormDateInput from "../../../../components/FormDateInput";

import {
  getEmployeeMasterById,
  initialsFromName,
  newEmployeeId,
  nextEmployeeCode,
  upsertEmployeeMaster,
} from './employeeMasterStorage';

const PROFILE_SECTIONS = [
  { id: 'basic', label: 'Basic Detail' },
  { id: 'employee', label: 'Employee Detail' },
  { id: 'personal', label: 'Personal Detail' },
  { id: 'family', label: 'Family Details' },
];

function createEmptyForm(employeeCode = '') {
  return {
    employeeCode,
    name: '',
    middleName: '',
    lastName: '',
    dob: '',
    gender: 'Male',
    dateOfJoining: '',
    address: '',
    location: '',
    email: '',
    salary: '',
    familyMemberName: '',
    familyRelationship: '',
    familyPhone: '',
    familyDob: '',
    phone: '',
  };
}

function recordToForm(existing, fallbackCode) {
  if (!existing) return createEmptyForm(fallbackCode);
  return {
    employeeCode: existing.employeeCode || fallbackCode,
    name: existing.name || '',
    middleName: existing.middleName || '',
    lastName: existing.lastName || '',
    dob: existing.dob || '',
    gender: existing.gender || 'Male',
    dateOfJoining: existing.dateOfJoining || '',
    address: existing.address || '',
    location: existing.location || '',
    email: existing.email || '',
    salary: existing.salary || '',
    familyMemberName: existing.familyMemberName || '',
    familyRelationship: existing.familyRelationship || '',
    familyPhone: existing.familyPhone || '',
    familyDob: existing.familyDob || '',
    phone: existing.phone || '',
  };
}

function SectionHeader({ title }) {
  return (
    <div className="bg-violet-700 text-white px-4 py-2.5 text-sm font-semibold">{title}</div>
  );
}

function Field({ label, required, children, className = '' }) {
  return (
    <label className={`block text-xs text-gray-600 ${className}`}>
      {label}
      {required ? <span className="text-red-500"> *</span> : null}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass =
  'w-full h-9 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400';

export default function EmployeeMasterProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [section, setSection] = useState('basic');
  const [recordId, setRecordId] = useState(null);
  const [form, setForm] = useState(() => createEmptyForm(nextEmployeeCode()));
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    if (isNew) {
      setRecordId(null);
      setForm(createEmptyForm(nextEmployeeCode()));
      return;
    }
    const existing = getEmployeeMasterById(id);
    if (existing) {
      setRecordId(id);
      setForm(recordToForm(existing, existing.employeeCode || existing.id.slice(-4).toUpperCase()));
      return;
    }
    setRecordId(null);
    setForm(createEmptyForm(nextEmployeeCode()));
  }, [id, isNew]);

  const displayCode = form.employeeCode.trim() || '—';
  const displayName = form.name.trim() || (isNew ? 'New employee' : '—');
  const avatarInitials = initialsFromName(form.name);

  const onChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const onSave = (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Name is required in Basic Detail.');
      setSection('basic');
      return;
    }
    if (!form.employeeCode.trim()) {
      setError('Employee code is required.');
      setSection('basic');
      return;
    }
    upsertEmployeeMaster({
      id: recordId || newEmployeeId(),
      ...form,
      employeeCode: form.employeeCode.trim(),
      name: form.name.trim(),
    });
    navigate(salaryAppPath('people-master'));
  };

  return (
    <div className="space-y-4 min-h-[60vh]">
      <Link
        to={salaryAppPath('people-master')}
        className="inline-flex items-center gap-1.5 text-xs text-[#1F3A8A] hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to employee list
      </Link>

      <form onSubmit={onSave} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-4 sm:px-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative shrink-0">
              <div className="h-20 w-20 rounded-full bg-amber-300 border-4 border-white shadow-md flex items-center justify-center">
                <span className="text-xl font-bold text-amber-900">{avatarInitials}</span>
              </div>
              <button
                type="button"
                className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center shadow border-2 border-white"
                title="Upload photo (coming soon)"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-gray-900">
                <span className="text-gray-500 font-semibold mr-2">{displayCode}</span>
                {displayName}
              </h2>
            </div>
          </div>
        </div>

        <div className="border-b border-gray-200 px-4 py-3 bg-teal-50/40">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-teal-600 text-white text-xs font-medium">
            <User className="h-3.5 w-3.5" />
            Profile
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] min-h-[360px]">
          <aside className="border-b lg:border-b-0 lg:border-r border-gray-200 bg-slate-50/60 p-2">
            <nav className="space-y-0.5">
              {PROFILE_SECTIONS.map((item) => {
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'text-gray-700 hover:bg-white hover:text-teal-700'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="bg-white flex flex-col min-h-[360px]">
            {section === 'basic' ? (
              <>
                <SectionHeader title="Basic Detail" />
                <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                  <Field label="Employee Code" required>
                    <input type="text" value={form.employeeCode} onChange={onChange('employeeCode')} className={inputClass} placeholder="e.g. 0008" />
                  </Field>
                  <Field label="Name" required>
                    <input type="text" value={form.name} onChange={onChange('name')} className={inputClass} placeholder="First / full name" />
                  </Field>
                  <Field label="Middle Name">
                    <input type="text" value={form.middleName} onChange={onChange('middleName')} className={inputClass} />
                  </Field>
                  <Field label="Last Name">
                    <input type="text" value={form.lastName} onChange={onChange('lastName')} className={inputClass} />
                  </Field>
                  <Field label="Date Of Birth">
                    <FormDateInput value={form.dob} onChange={onChange('dob')} className={inputClass}/>
                  </Field>
                  <Field label="Gender">
                    <div className="flex flex-wrap items-center gap-4 h-9">
                      {['Male', 'Female', 'Other'].map((g) => (
                        <label key={g} className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                          <input
                            type="radio"
                            name="gender"
                            value={g}
                            checked={form.gender === g}
                            onChange={onChange('gender')}
                            className="text-violet-600"
                          />
                          {g}
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field label="Date of Joining">
                    <FormDateInput value={form.dateOfJoining} onChange={onChange('dateOfJoining')} className={inputClass}/>
                  </Field>
                  <Field label="Location">
                    <input type="text" value={form.location} onChange={onChange('location')} className={inputClass} placeholder="State / city" />
                  </Field>
                  <Field label="Address" className="sm:col-span-2">
                    <textarea
                      value={form.address}
                      onChange={onChange('address')}
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                      placeholder="Full address"
                    />
                  </Field>
                </div>
              </>
            ) : null}

            {section === 'employee' ? (
              <>
                <SectionHeader title="Employee Detail" />
                <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 max-w-xl">
                  <Field label="Employee Email ID">
                    <input type="email" value={form.email} onChange={onChange('email')} className={inputClass} placeholder="name@company.com" />
                  </Field>
                </div>
              </>
            ) : null}

            {section === 'personal' ? (
              <>
                <SectionHeader title="Personal Detail" />
                <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 max-w-xl">
                  <Field label="Salary Entry">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.salary}
                      onChange={onChange('salary')}
                      className={inputClass}
                      placeholder="Monthly gross salary"
                    />
                  </Field>
                </div>
              </>
            ) : null}

            {section === 'family' ? (
              <>
                <SectionHeader title="Family Details" />
                <div className="px-4 py-3 text-xs text-gray-500 border-b border-gray-100">
                  Family member form — fill when ready. Saved locally with the employee profile.
                </div>
                <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                  <Field label="Member Name">
                    <input type="text" value={form.familyMemberName} onChange={onChange('familyMemberName')} className={inputClass} />
                  </Field>
                  <Field label="Relationship">
                    <input type="text" value={form.familyRelationship} onChange={onChange('familyRelationship')} className={inputClass} placeholder="Father, Spouse, etc." />
                  </Field>
                  <Field label="Contact Number">
                    <input type="tel" value={form.familyPhone} onChange={onChange('familyPhone')} className={inputClass} />
                  </Field>
                  <Field label="Date of Birth">
                    <FormDateInput value={form.familyDob} onChange={onChange('familyDob')} className={inputClass}/>
                  </Field>
                </div>
              </>
            ) : null}

            <div className="mt-auto border-t border-gray-100 px-4 py-4 bg-slate-50/50">
              {error ? <p className="text-sm text-red-600 text-center mb-3">{error}</p> : null}
              <div className="flex justify-center">
                <button
                  type="submit"
                  className="h-10 min-w-[140px] px-8 rounded-lg bg-[#1F3A8A] text-white text-sm font-medium hover:bg-[#1a3278] shadow-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
