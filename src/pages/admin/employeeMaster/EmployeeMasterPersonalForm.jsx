import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  EMPLOYMENT_TYPE_OPTIONS,
  nextEmployeeSystemId,
  normalizeEmploymentType,
  inferEmploymentTypeFromEmployeeId,
  resolveEmployeeIdOnTypeChange,
  resolveEmployeeIdForSave,
  validateEmployeeIdentifiers,
  computeIfsplExperienceYears,
  computeTotalExperienceYears,
} from '../../../utils/employeeMasterReminders';
import {
  isActiveEmployeeRow,
  suggestNextHierarchySortOrder,
  validateEmployeeHierarchy,
} from '../../../lib/employeeHierarchy';
import { EMPLOYEE_MASTER_BASE_DEPARTMENTS } from '../../../lib/employeeMasterDepartments';
import { ManagerSearchSelect } from '../../../components/employee/ManagerSearchSelect';
import FormDateInput from '../../../components/FormDateInput';
import {
  EMPLOYEE_MASTER_DESIGNATIONS,
  EMPLOYEE_MASTER_GENDERS,
  BLOOD_GROUPS,
  RELIGIONS,
  MARITAL_STATUSES,
  STATUS_OPTIONS,
  emptyEmployeeMasterForm,
  employeeToFormData,
  buildEmployeeMasterPayload,
} from './employeeMasterFormShared';
import { syncScopeDraftBankFromMaster } from '../../adminOperations/salaryAdmin/salaryMonthProcessing';

const BANK_FIELD_KEYS = ['uan_no', 'esic_no', 'bank_name', 'bank_account_no', 'ifsc_code'];

function initFormData(employee, employees) {
  if (employee) return employeeToFormData(employee);
  const employment_type = 'permanent';
  return {
    ...emptyEmployeeMasterForm(),
    employment_type,
    employee_id: nextEmployeeSystemId(employees, employment_type),
  };
}

/**
 * Shared Employee Master personal details form.
 * @param {{
 *   employee?: object | null,
 *   employees?: object[],
 *   variant?: 'modal' | 'page',
 *   onCancel?: () => void,
 *   onSaved?: (savedEmployeeOrNull: object | null) => void,
 *   showCancel?: boolean,
 * }} props
 */
export default function EmployeeMasterPersonalForm({
  employee = null,
  employees = [],
  variant = 'modal',
  onCancel,
  onSaved,
  showCancel = true,
}) {
  const [formData, setFormData] = useState(() => initFormData(employee, employees));
  const [saving, setSaving] = useState(false);
  const bankDirtyRef = useRef({});

  useEffect(() => {
    setFormData(initFormData(employee, employees));
    bankDirtyRef.current = {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    employee?.id,
    employee?.updated_at,
    employee?.uan_no,
    employee?.esic_no,
    employee?.bank_account_no,
    employee?.ifsc_code,
    employee?.bank_name,
  ]);

  // Always re-pull bank fields from DB when opening a profile (after Excel import)
  useEffect(() => {
    let cancelled = false;
    async function pullBankFromDb() {
      if (!employee?.id) return;
      const { data, error } = await supabase
        .from('admin_ifsp_employee_master')
        .select('uan_no, esic_no, bank_name, bank_account_no, ifsc_code')
        .eq('id', employee.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setFormData((prev) => ({
        ...prev,
        uan_no: data.uan_no || '',
        esic_no: data.esic_no || '',
        bank_name: data.bank_name || '',
        bank_account_no: data.bank_account_no || '',
        ifsc_code: data.ifsc_code || '',
      }));
    }
    void pullBankFromDb();
    return () => {
      cancelled = true;
    };
  }, [employee?.id]);

  const setBankField = (key, value) => {
    bankDirtyRef.current[key] = true;
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const managerCandidates = useMemo(() => {
    const excludeId = employee?.id;
    return (employees || [])
      .filter((row) => isActiveEmployeeRow(row))
      .filter((row) => !excludeId || row.id !== excludeId)
      .sort((a, b) =>
        String(a.full_name || '').localeCompare(String(b.full_name || ''), undefined, {
          sensitivity: 'base',
        }),
      );
  }, [employees, employee?.id]);

  const departmentsFromData = useMemo(() => {
    const seen = new Map();
    (employees || []).forEach((row) => {
      const value = String(row?.department || '').trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (!seen.has(key)) seen.set(key, value);
    });
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
  }, [employees]);

  const departments = useMemo(() => {
    const seen = new Map();
    [...departmentsFromData, ...EMPLOYEE_MASTER_BASE_DEPARTMENTS].forEach((value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) seen.set(key, trimmed);
    });
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
  }, [departmentsFromData]);

  const designations = EMPLOYEE_MASTER_DESIGNATIONS;
  const genders = EMPLOYEE_MASTER_GENDERS;
  const bloodGroups = BLOOD_GROUPS;
  const religions = RELIGIONS;
  const maritalStatuses = MARITAL_STATUSES;
  const statusOptions = STATUS_OPTIONS;

  const formIfsplExperiencePreview = computeIfsplExperienceYears(formData.date_of_joining);
  const formTotalExperiencePreview = computeTotalExperienceYears(
    formData.date_of_joining,
    formData.other_experience,
  );

  const handleEmploymentTypeChange = (type) => {
    const normalized = normalizeEmploymentType(type);
    if (employee) {
      const originalType = normalizeEmploymentType(
        employee.employment_type || inferEmploymentTypeFromEmployeeId(employee.employee_id),
      );
      if (normalized === originalType) {
        setFormData((prev) => ({
          ...prev,
          employment_type: normalized,
          employee_id: employee.employee_id || '',
        }));
        return;
      }
      const resolved = resolveEmployeeIdOnTypeChange(employees, employee, normalized);
      setFormData((prev) => ({
        ...prev,
        employment_type: normalized,
        employee_id: resolved.employee_id,
      }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      employment_type: normalized,
      employee_id: nextEmployeeSystemId(employees, normalized),
    }));
  };

  const handleCancel = () => {
    if (typeof onCancel === 'function') onCancel();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.designation === 'Other' && !String(formData.designation_other || '').trim()) {
      alert('Please enter a designation when Other is selected.');
      return;
    }
    if (formData.status === 'Inactive' && !String(formData.date_of_leaving || '').trim()) {
      alert('Date of Leaving is required when employee status is Inactive.');
      return;
    }
    try {
      setSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        alert('Session expired. Please log in again.');
        return;
      }
      const userEmail = user.email || '';
      const excludeDbId = employee?.id ?? null;

      const hierarchyCheck = validateEmployeeHierarchy(employees, {
        employee_code: formData.employee_code,
        employee_id: formData.employee_id,
        l1_manager_code: formData.l1_manager_code,
        l2_manager_code: formData.l2_manager_code,
        hierarchy_sort_order: formData.hierarchy_sort_order,
      });
      if (!hierarchyCheck.ok) {
        alert(hierarchyCheck.message);
        return;
      }

      if (employee) {
        const employment_type = normalizeEmploymentType(formData.employment_type);
        const employee_id = resolveEmployeeIdForSave(
          employees,
          employment_type,
          formData.employee_id,
          excludeDbId,
        );
        const idCheck = validateEmployeeIdentifiers(employees, {
          employee_id,
          employee_code: formData.employee_code,
          excludeDbId,
        });
        if (!idCheck.ok) {
          alert(idCheck.message);
          return;
        }

        const payload = {
          ...buildEmployeeMasterPayload(formData, userEmail),
          employment_type,
          employee_id,
          ...hierarchyCheck.fields,
        };
        // Never wipe existing bank fields with blanks unless the user edited that field
        for (const key of BANK_FIELD_KEYS) {
          const formVal = String(formData[key] ?? '').trim();
          const prevVal = String(employee[key] ?? '').trim();
          if (!formVal && prevVal && !bankDirtyRef.current[key]) {
            payload[key] = employee[key];
          }
        }
        const { data: updatedRow, error } = await supabase
          .from('admin_ifsp_employee_master')
          .update(payload)
          .eq('id', employee.id)
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            throw new Error(
              'That employee ID or code is already in use. Change the employee code or switch employment type again.',
            );
          }
          throw error;
        }
        const saved = updatedRow || { ...employee, ...payload };
        syncScopeDraftBankFromMaster(saved.id || employee.id, {
          account_no: saved.bank_account_no,
          ifsc: saved.ifsc_code,
        });
        alert('Employee updated successfully!');
        if (typeof onSaved === 'function') {
          onSaved(saved);
        }
      } else {
        const employment_type = normalizeEmploymentType(formData.employment_type);
        const employee_id = resolveEmployeeIdForSave(
          employees,
          employment_type,
          formData.employee_id,
        );
        const idCheck = validateEmployeeIdentifiers(employees, {
          employee_id,
          employee_code: formData.employee_code,
        });
        if (!idCheck.ok) {
          alert(idCheck.message);
          return;
        }

        const payload = {
          ...buildEmployeeMasterPayload(formData, userEmail),
          employment_type,
          employee_id,
          ...hierarchyCheck.fields,
        };
        const { data: insertedRow, error } = await supabase
          .from('admin_ifsp_employee_master')
          .insert({
            ...payload,
            user_id: user.id,
            created_by: userEmail,
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            throw new Error(
              'That employee ID or code is already in use. Please save again to get the next available ID.',
            );
          }
          throw error;
        }
        alert('Employee added successfully!');
        if (insertedRow?.id) {
          syncScopeDraftBankFromMaster(insertedRow.id, {
            account_no: insertedRow.bank_account_no,
            ifsc: insertedRow.ifsc_code,
          });
        }
        if (typeof onSaved === 'function') {
          onSaved(insertedRow || null);
        }
      }
    } catch (error) {
      console.error('Error saving employee:', error);
      alert(error?.message || 'Failed to save employee. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const editingEmployee = employee;
  const isPage = variant === 'page';
  const submitLabel = editingEmployee
    ? isPage
      ? 'Save personal details'
      : 'Update Employee'
    : 'Add Employee';
  const showCancelButton = isPage ? showCancel : true;

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Employee (master sheet fields)</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Employment type *</label>
            <select
              value={formData.employment_type}
              onChange={(e) => handleEmploymentTypeChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {editingEmployee && (
              <p className="text-xs text-amber-700 mt-1">
                Changing type keeps the same system ID. Existing employee code is unchanged.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Machine ID</label>
            <input
              type="text"
              value={formData.employee_id}
              onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
            />
            <p className="text-xs text-gray-500 mt-1">
              One continuous 5-digit IFSPL system series for Permanent, Consultant, and Voucher employees.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Employee code</label>
            <input
              type="text"
              value={formData.employee_code}
              onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Legacy / HR code (optional)"
            />
            <p className="text-xs text-gray-500 mt-1">
              Existing employees keep their code here; not auto-generated.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Employee_Name *</label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Father&apos;s_Name</label>
            <input
              type="text"
              value={formData.father_name}
              onChange={(e) => setFormData({ ...formData, father_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
            <select
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Gender</option>
              {genders.map((gender) => (
                <option key={gender} value={gender}>
                  {gender}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date_of_Joining *</label>
            <FormDateInput
              value={formData.date_of_joining}
              onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Designation *</label>
            <select
              value={formData.designation}
              onChange={(e) => {
                const value = e.target.value;
                setFormData((prev) => ({
                  ...prev,
                  designation: value,
                  designation_other: value === 'Other' ? prev.designation_other : '',
                }));
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">Select Designation</option>
              {designations.map((designation) => (
                <option key={designation} value={designation}>
                  {designation}
                </option>
              ))}
            </select>
            {formData.designation === 'Other' ? (
              <input
                type="text"
                value={formData.designation_other}
                onChange={(e) => setFormData({ ...formData, designation_other: e.target.value })}
                placeholder="Enter designation"
                className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date_of_Birth</label>
            <FormDateInput
              value={formData.date_of_birth}
              onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Birthday reminders appear in Admin → Alerts &amp; Notifications (all active employees).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Wedding_Anniversary_Date
            </label>
            <FormDateInput
              value={formData.date_of_anniversary}
              onChange={(e) => setFormData({ ...formData, date_of_anniversary: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Anniversary reminders appear in Admin → Alerts &amp; Notifications.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Blood_Group</label>
            <select
              value={formData.blood_group}
              onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Blood Group</option>
              {bloodGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Identity Documents */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">IDs &amp; bank</h3>
          <p className="text-xs text-gray-500 -mt-2">
            UAN, ESIC, account number and IFSC are saved on this profile. Salary Processing uses the same
            values automatically after import or save.
          </p>
          {!String(formData.bank_account_no || "").trim() &&
          !String(formData.ifsc_code || "").trim() ? (
            <p className="text-xs text-amber-800 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5">
              No account / IFSC on file yet. Use Employee Master → Import bank details (Employee Code must
              match), or type the values here and Save.
            </p>
          ) : (
            <p className="text-xs text-emerald-800 rounded border border-emerald-100 bg-emerald-50 px-2.5 py-1.5">
              Account details loaded from the employee record
              {formData.bank_account_no ? ` · A/c ${formData.bank_account_no}` : ""}
              {formData.ifsc_code ? ` · ${formData.ifsc_code}` : ""}.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Aadhaar number</label>
            <input
              type="text"
              value={formData.aadhar_no}
              onChange={(e) => setFormData({ ...formData, aadhar_no: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">PAN</label>
            <input
              type="text"
              value={formData.pan_card_no}
              onChange={(e) => setFormData({ ...formData, pan_card_no: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">UAN number</label>
            <input
              type="text"
              value={formData.uan_no}
              onChange={(e) => setBankField('uan_no', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ESIC number</label>
            <input
              type="text"
              value={formData.esic_no}
              onChange={(e) => setBankField('esic_no', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Bank name</label>
            <input
              type="text"
              value={formData.bank_name}
              onChange={(e) => setBankField('bank_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Account number</label>
            <input
              type="text"
              value={formData.bank_account_no}
              onChange={(e) => setBankField('bank_account_no', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">IFSC code</label>
            <input
              type="text"
              value={formData.ifsc_code}
              onChange={(e) => setBankField('ifsc_code', e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Religion</label>
            <select
              value={formData.religion}
              onChange={(e) => setFormData({ ...formData, religion: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Religion</option>
              {religions.map((religion) => (
                <option key={religion} value={religion}>
                  {religion}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mother&apos;s Name</label>
            <input
              type="text"
              value={formData.mother_name}
              onChange={(e) => setFormData({ ...formData, mother_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Spouse Name</label>
            <input
              type="text"
              value={formData.spouse_name}
              onChange={(e) => setFormData({ ...formData, spouse_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Son&apos;s Name</label>
            <input
              type="text"
              value={formData.son_name}
              onChange={(e) => setFormData({ ...formData, son_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Son&apos;s DOB (MM-DD-YYYY)
            </label>
            <FormDateInput
              value={formData.son_dob}
              onChange={(e) => setFormData({ ...formData, son_dob: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Daughter&apos;s Name</label>
            <input
              type="text"
              value={formData.daughter_name}
              onChange={(e) => setFormData({ ...formData, daughter_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Daughter&apos;s DOB</label>
            <FormDateInput
              value={formData.daughter_dob}
              onChange={(e) => setFormData({ ...formData, daughter_dob: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Contact & Professional */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Contact, location &amp; experience</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Current_Address</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Permanent_Address</label>
            <textarea
              value={formData.full_address}
              onChange={(e) => setFormData({ ...formData, full_address: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mobile_No</label>
            <input
              type="tel"
              value={formData.personal_no}
              onChange={(e) => setFormData({ ...formData, personal_no: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email_ID</label>
            <input
              type="email"
              value={formData.email_id}
              onChange={(e) => setFormData({ ...formData, email_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Emergency_Contact_No</label>
            <input
              type="tel"
              value={formData.emergency_no}
              onChange={(e) => setFormData({ ...formData, emergency_no: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Marital_Status</label>
            <select
              value={formData.marital_status}
              onChange={(e) => setFormData({ ...formData, marital_status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select</option>
              {maritalStatuses.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Identification Mark</label>
            <input
              type="text"
              value={formData.identification_mark}
              onChange={(e) => setFormData({ ...formData, identification_mark: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Previous_Experience (years, before IFSPL)
            </label>
            <input
              type="number"
              value={formData.other_experience}
              onChange={(e) => setFormData({ ...formData, other_experience: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min="0"
              step="0.1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Total_Experience (auto, as of today)
            </label>
            <input
              type="text"
              readOnly
              value={
                formTotalExperiencePreview != null ? `${formTotalExperiencePreview} years` : '—'
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Qualification</label>
            <textarea
              value={formData.qualification}
              onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Department *</label>
            <select
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">Select Department</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Site / city / branch"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">IFSPL Experience</label>
            <input
              type="text"
              readOnly
              value={
                formIfsplExperiencePreview != null ? `${formIfsplExperiencePreview} years` : '—'
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date of Leaving (DOL)
              {formData.status === 'Inactive' ? <span className="text-red-600"> *</span> : null}
            </label>
            <FormDateInput
              required={formData.status === 'Inactive'}
              value={formData.date_of_leaving}
              onChange={(e) => setFormData({ ...formData, date_of_leaving: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => {
                const nextStatus = e.target.value;
                if (nextStatus === 'Inactive' && !String(formData.date_of_leaving || '').trim()) {
                  alert('Date of Leaving is required when employee status is Inactive.');
                  return;
                }
                setFormData({ ...formData, status: nextStatus });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.birthday_reminder}
                onChange={(e) => setFormData({ ...formData, birthday_reminder: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Birthday Reminder</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.anniversary_reminder}
                onChange={(e) =>
                  setFormData({ ...formData, anniversary_reminder: e.target.checked })
                }
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Anniversary Reminder</span>
            </label>
          </div>
        </div>

        <div className="md:col-span-3 border-t border-gray-200 pt-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Org hierarchy (Indus One)</h3>
          <p className="text-xs text-gray-500">
            L1 is the direct manager (org tree parent). L2 is skip-level (leave L2 approval). Set Hierarchy
            Sr.No. to include this employee on the Indus One org chart; leave blank to hide until assigned.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ManagerSearchSelect
              label="L1 Manager (direct)"
              hint="Leave empty if not assigned. Uses employee code for routing."
              valueCode={formData.l1_manager_code}
              valueName={formData.l1_manager_name}
              candidates={managerCandidates}
              onChange={({ code, name }) =>
                setFormData((prev) => ({
                  ...prev,
                  l1_manager_code: code,
                  l1_manager_name: name,
                }))
              }
            />
            <ManagerSearchSelect
              label="L2 Manager (skip-level)"
              hint="Used for L2 leave approval, not as org tree parent."
              valueCode={formData.l2_manager_code}
              valueName={formData.l2_manager_name}
              candidates={managerCandidates}
              onChange={({ code, name }) =>
                setFormData((prev) => ({
                  ...prev,
                  l2_manager_code: code,
                  l2_manager_name: name,
                }))
              }
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hierarchy Sr.No. (org chart order)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={formData.hierarchy_sort_order}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, hierarchy_sort_order: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Optional — e.g. 10"
              />
              <button
                type="button"
                className="mt-2 text-xs font-medium text-blue-700 hover:text-blue-900"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    hierarchy_sort_order: String(suggestNextHierarchySortOrder(employees)),
                  }))
                }
              >
                Use next available Sr.No. ({suggestNextHierarchySortOrder(employees)})
              </button>
              <p className="text-[11px] text-gray-500 mt-1">
                Indus One org chart only lists employees with a Sr.No. set.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
        {showCancelButton ? (
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
            disabled={saving}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          disabled={saving}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
