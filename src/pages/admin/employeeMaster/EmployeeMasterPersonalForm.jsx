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
import { toast } from '../../../lib/toast';

const BANK_FIELD_KEYS = ['uan_no', 'esic_no', 'bank_name', 'bank_account_no', 'ifsc_code'];

function uniqueDepartmentsFromEmployees(employees) {
  const seen = new Map();
  (employees || []).forEach((row) => {
    const value = String(row?.department || '').trim();
    if (!value || value.toLowerCase() === 'other') return;
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, value);
  });
  return Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

function departmentSelectOptions(employees) {
  const seen = new Map();
  [...uniqueDepartmentsFromEmployees(employees), ...EMPLOYEE_MASTER_BASE_DEPARTMENTS].forEach((value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed || trimmed === 'Other') return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  });
  const options = Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
  options.push('Other');
  return options;
}

function initFormData(employee, employees) {
  const departments = departmentSelectOptions(employees);
  if (employee) return employeeToFormData(employee, departments);
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

  const departments = useMemo(() => departmentSelectOptions(employees), [employees]);

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
      toast.warning('Enter a designation when Other is selected.');
      return;
    }
    if (formData.department === 'Other' && !String(formData.department_other || '').trim()) {
      toast.warning('Enter a department when Other is selected.');
      return;
    }
    if (formData.status === 'Inactive' && !String(formData.date_of_leaving || '').trim()) {
      toast.warning('Date of Leaving is required for Inactive status.');
      return;
    }
    try {
      setSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.warning('Session expired. Please log in again.');
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
        toast.warning(hierarchyCheck.message);
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
          toast.warning(idCheck.message);
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
        try {
          const { syncEmployeeHierarchyToIndusOne } = await import('../../../lib/employeeHierarchySync');
          await syncEmployeeHierarchyToIndusOne(supabase, {
            employeeCode: formData.employee_code,
            l1ManagerCode: hierarchyCheck.fields.l1_manager_code,
            l2ManagerCode: hierarchyCheck.fields.l2_manager_code,
          });
        } catch (syncErr) {
          console.warn('[hierarchy-sync] Indus One sync after employee update:', syncErr?.message || syncErr);
        }
        const saved = updatedRow || { ...employee, ...payload };
        syncScopeDraftBankFromMaster(saved.id || employee.id, {
          account_no: saved.bank_account_no,
          ifsc: saved.ifsc_code,
        });
        toast.success('Employee updated.');
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
          toast.warning(idCheck.message);
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
        try {
          const { syncEmployeeHierarchyToIndusOne } = await import('../../../lib/employeeHierarchySync');
          await syncEmployeeHierarchyToIndusOne(supabase, {
            employeeCode: formData.employee_code,
            l1ManagerCode: hierarchyCheck.fields.l1_manager_code,
            l2ManagerCode: hierarchyCheck.fields.l2_manager_code,
          });
        } catch (syncErr) {
          console.warn('[hierarchy-sync] Indus One sync after employee create:', syncErr?.message || syncErr);
        }
        toast.success('Employee added.');
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
      const raw = String(error?.message || '');
      const friendly =
        /cannot change your own account status/i.test(raw)
          ? 'Could not update this employee’s login status. Try again after the latest database update is applied, or ask a Super Admin.'
          : raw || 'Failed to save employee.';
      toast.error(friendly);
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

  const lbl = 'block text-xs font-medium text-gray-700 mb-1';
  const ctrl =
    'w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const ctrlMuted = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md bg-gray-50 text-gray-800';
  const section = 'rounded-lg border border-gray-200 bg-white p-3 space-y-2.5';
  const sectionTitle = 'text-sm font-semibold text-gray-900';
  const grid3 = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-2.5';
  const grid4 = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-2.5';

  return (
    <form onSubmit={handleSubmit} className={`${isPage ? 'p-4' : ''} space-y-3`}>
      {/* Identity & role */}
      <section className={section}>
        <h3 className={sectionTitle}>Identity &amp; role</h3>
        <div className={grid4}>
          <div>
            <label className={lbl}>Employment type *</label>
            <select
              value={formData.employment_type}
              onChange={(e) => handleEmploymentTypeChange(e.target.value)}
              className={ctrl}
              required
            >
              {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {editingEmployee ? (
              <p className="text-[11px] text-amber-700 mt-0.5">
                Changing type keeps the same system ID and employee code.
              </p>
            ) : null}
          </div>
          <div>
            <label className={lbl}>Machine ID</label>
            <input
              type="text"
              value={formData.employee_id}
              onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
              className={`${ctrl} font-mono`}
            />
          </div>
          <div>
            <label className={lbl}>Employee code</label>
            <input
              type="text"
              value={formData.employee_code}
              onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
              className={ctrl}
              placeholder="Optional HR code"
            />
          </div>
          <div>
            <label className={lbl}>Status</label>
            <select
              value={formData.status}
              onChange={(e) => {
                const nextStatus = e.target.value;
                if (nextStatus === 'Inactive' && !String(formData.date_of_leaving || '').trim()) {
                  toast.warning('Date of Leaving is required for Inactive status.');
                  return;
                }
                setFormData({ ...formData, status: nextStatus });
              }}
              className={ctrl}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>Employee name *</label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className={ctrl}
              required
            />
          </div>
          <div>
            <label className={lbl}>Designation *</label>
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
              className={ctrl}
              required
            >
              <option value="">Select</option>
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
                className={`mt-1.5 ${ctrl}`}
                required
              />
            ) : null}
          </div>
          <div>
            <label className={lbl}>Department *</label>
            <select
              value={formData.department}
              onChange={(e) => {
                const value = e.target.value;
                setFormData((prev) => ({
                  ...prev,
                  department: value,
                  department_other: value === 'Other' ? prev.department_other : '',
                }));
              }}
              className={ctrl}
              required
            >
              <option value="">Select</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            {formData.department === 'Other' ? (
              <input
                type="text"
                value={formData.department_other}
                onChange={(e) => setFormData({ ...formData, department_other: e.target.value })}
                placeholder="Enter department"
                className={`mt-1.5 ${ctrl}`}
                required
              />
            ) : null}
          </div>
          <div>
            <label className={lbl}>Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className={ctrl}
              placeholder="Site / city / branch"
            />
          </div>
        </div>
      </section>

      {/* Employment dates */}
      <section className={section}>
        <h3 className={sectionTitle}>Employment dates</h3>
        <div className={grid4}>
          <div>
            <label className={lbl}>Date of joining *</label>
            <FormDateInput
              value={formData.date_of_joining}
              onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
              className={ctrl}
              required
            />
          </div>
          <div>
            <label className={lbl}>Date of confirmation</label>
            <FormDateInput
              value={formData.confirmation_date ?? ''}
              onChange={(e) => setFormData({ ...formData, confirmation_date: e.target.value })}
              className={ctrl}
              aria-label="Date of confirmation"
            />
          </div>
          <div>
            <label className={lbl}>
              Date of leaving{formData.status === 'Inactive' ? ' *' : ''}
            </label>
            <FormDateInput
              required={formData.status === 'Inactive'}
              value={formData.date_of_leaving}
              onChange={(e) => setFormData({ ...formData, date_of_leaving: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>Date of resignation</label>
            <FormDateInput
              value={formData.date_of_resignation ?? ''}
              onChange={(e) => setFormData({ ...formData, date_of_resignation: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>Date of relieving</label>
            <FormDateInput
              value={formData.date_of_relieving ?? ''}
              onChange={(e) => setFormData({ ...formData, date_of_relieving: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>F&amp;F done date</label>
            <FormDateInput
              value={formData.fnf_done_date ?? ''}
              onChange={(e) => setFormData({ ...formData, fnf_done_date: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>IFSPL experience</label>
            <input
              type="text"
              readOnly
              value={
                formIfsplExperiencePreview != null ? `${formIfsplExperiencePreview} years` : '—'
              }
              className={ctrlMuted}
            />
          </div>
          <div>
            <label className={lbl}>Total experience</label>
            <input
              type="text"
              readOnly
              value={
                formTotalExperiencePreview != null ? `${formTotalExperiencePreview} years` : '—'
              }
              className={ctrlMuted}
            />
          </div>
          <div className="col-span-full">
            <label className={lbl}>Remarks</label>
            <textarea
              value={formData.remarks ?? ''}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              rows={3}
              className={ctrl}
              placeholder="Notes about employment dates, confirmation, exit, or other HR remarks"
            />
          </div>
        </div>
      </section>

      {/* Personal */}
      <section className={section}>
        <h3 className={sectionTitle}>Personal</h3>
        <div className={grid4}>
          <div>
            <label className={lbl}>Gender</label>
            <select
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              className={ctrl}
            >
              <option value="">Select</option>
              {genders.map((gender) => (
                <option key={gender} value={gender}>
                  {gender}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Date of birth</label>
            <FormDateInput
              value={formData.date_of_birth}
              onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>Wedding anniversary</label>
            <FormDateInput
              value={formData.date_of_anniversary}
              onChange={(e) => setFormData({ ...formData, date_of_anniversary: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>Blood group</label>
            <select
              value={formData.blood_group}
              onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
              className={ctrl}
            >
              <option value="">Select</option>
              {bloodGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Religion</label>
            <select
              value={formData.religion}
              onChange={(e) => setFormData({ ...formData, religion: e.target.value })}
              className={ctrl}
            >
              <option value="">Select</option>
              {religions.map((religion) => (
                <option key={religion} value={religion}>
                  {religion}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Marital status</label>
            <select
              value={formData.marital_status}
              onChange={(e) => setFormData({ ...formData, marital_status: e.target.value })}
              className={ctrl}
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
            <label className={lbl}>Identification mark</label>
            <input
              type="text"
              value={formData.identification_mark}
              onChange={(e) => setFormData({ ...formData, identification_mark: e.target.value })}
              className={ctrl}
            />
          </div>
          <div className="flex items-end gap-4 pb-0.5">
            <label className="flex items-center gap-1.5 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={formData.birthday_reminder}
                onChange={(e) => setFormData({ ...formData, birthday_reminder: e.target.checked })}
              />
              Birthday reminder
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={formData.anniversary_reminder}
                onChange={(e) =>
                  setFormData({ ...formData, anniversary_reminder: e.target.checked })
                }
              />
              Anniversary reminder
            </label>
          </div>
        </div>
      </section>

      {/* Family */}
      <section className={section}>
        <h3 className={sectionTitle}>Family</h3>
        <div className={grid4}>
          <div>
            <label className={lbl}>Father&apos;s name</label>
            <input
              type="text"
              value={formData.father_name}
              onChange={(e) => setFormData({ ...formData, father_name: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>Mother&apos;s name</label>
            <input
              type="text"
              value={formData.mother_name}
              onChange={(e) => setFormData({ ...formData, mother_name: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>Spouse name</label>
            <input
              type="text"
              value={formData.spouse_name}
              onChange={(e) => setFormData({ ...formData, spouse_name: e.target.value })}
              className={ctrl}
            />
          </div>
          <div className="hidden lg:block" aria-hidden="true" />
          <div>
            <label className={lbl}>Son&apos;s name</label>
            <input
              type="text"
              value={formData.son_name}
              onChange={(e) => setFormData({ ...formData, son_name: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>Son&apos;s DOB</label>
            <FormDateInput
              value={formData.son_dob}
              onChange={(e) => setFormData({ ...formData, son_dob: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>Daughter&apos;s name</label>
            <input
              type="text"
              value={formData.daughter_name}
              onChange={(e) => setFormData({ ...formData, daughter_name: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>Daughter&apos;s DOB</label>
            <FormDateInput
              value={formData.daughter_dob}
              onChange={(e) => setFormData({ ...formData, daughter_dob: e.target.value })}
              className={ctrl}
            />
          </div>
        </div>
      </section>

      {/* IDs & bank */}
      <section className={section}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={sectionTitle}>IDs &amp; bank</h3>
          {!String(formData.bank_account_no || '').trim() &&
          !String(formData.ifsc_code || '').trim() ? (
            <p className="text-[11px] text-amber-800">
              No account / IFSC yet — import bank details or enter here.
            </p>
          ) : (
            <p className="text-[11px] text-emerald-800">
              Account on file
              {formData.bank_account_no ? ` · ${formData.bank_account_no}` : ''}
              {formData.ifsc_code ? ` · ${formData.ifsc_code}` : ''}
            </p>
          )}
        </div>
        <div className={grid4}>
          <div>
            <label className={lbl}>Aadhaar</label>
            <input
              type="text"
              value={formData.aadhar_no}
              onChange={(e) => setFormData({ ...formData, aadhar_no: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>PAN</label>
            <input
              type="text"
              value={formData.pan_card_no}
              onChange={(e) => setFormData({ ...formData, pan_card_no: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>UAN</label>
            <input
              type="text"
              value={formData.uan_no}
              onChange={(e) => setBankField('uan_no', e.target.value)}
              className={ctrl}
              autoComplete="off"
            />
          </div>
          <div>
            <label className={lbl}>ESIC</label>
            <input
              type="text"
              value={formData.esic_no}
              onChange={(e) => setBankField('esic_no', e.target.value)}
              className={ctrl}
              autoComplete="off"
            />
          </div>
          <div>
            <label className={lbl}>Bank name</label>
            <input
              type="text"
              value={formData.bank_name}
              onChange={(e) => setBankField('bank_name', e.target.value)}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>Account number</label>
            <input
              type="text"
              value={formData.bank_account_no}
              onChange={(e) => setBankField('bank_account_no', e.target.value)}
              className={ctrl}
              autoComplete="off"
            />
          </div>
          <div>
            <label className={lbl}>IFSC</label>
            <input
              type="text"
              value={formData.ifsc_code}
              onChange={(e) => setBankField('ifsc_code', e.target.value.toUpperCase())}
              className={ctrl}
              autoComplete="off"
            />
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className={section}>
        <h3 className={sectionTitle}>Contact &amp; address</h3>
        <div className={grid3}>
          <div>
            <label className={lbl}>Mobile</label>
            <input
              type="tel"
              value={formData.personal_no}
              onChange={(e) => setFormData({ ...formData, personal_no: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>Email</label>
            <input
              type="email"
              value={formData.email_id}
              onChange={(e) => setFormData({ ...formData, email_id: e.target.value })}
              className={ctrl}
            />
          </div>
          <div>
            <label className={lbl}>Emergency contact</label>
            <input
              type="tel"
              value={formData.emergency_no}
              onChange={(e) => setFormData({ ...formData, emergency_no: e.target.value })}
              className={ctrl}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <label className={lbl}>Previous experience (years)</label>
            <input
              type="number"
              value={formData.other_experience}
              onChange={(e) => setFormData({ ...formData, other_experience: e.target.value })}
              className={ctrl}
              min="0"
              step="0.1"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <label className={lbl}>Qualification</label>
            <input
              type="text"
              value={formData.qualification}
              onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
              className={ctrl}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={lbl}>Current address</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={2}
              className={ctrl}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={lbl}>Permanent address</label>
            <textarea
              value={formData.full_address}
              onChange={(e) => setFormData({ ...formData, full_address: e.target.value })}
              rows={2}
              className={ctrl}
            />
          </div>
        </div>
      </section>

      {/* Hierarchy */}
      <section className={section}>
        <h3 className={sectionTitle}>Org hierarchy</h3>
        <div className={grid3}>
          <ManagerSearchSelect
            label="L1 manager (direct)"
            hint="Leave empty if not assigned."
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
            label="L2 manager (skip-level)"
            hint="Used for L2 leave approval."
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
            <label className={lbl}>Hierarchy Sr.No.</label>
            <input
              type="number"
              min="0"
              step="1"
              value={formData.hierarchy_sort_order}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, hierarchy_sort_order: e.target.value }))
              }
              className={ctrl}
              placeholder="Optional"
            />
            <button
              type="button"
              className="mt-1 text-[11px] font-medium text-blue-700 hover:text-blue-900"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  hierarchy_sort_order: String(suggestNextHierarchySortOrder(employees)),
                }))
              }
            >
              Next available ({suggestNextHierarchySortOrder(employees)})
            </button>
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2 pt-1">
        {showCancelButton ? (
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            disabled={saving}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
          disabled={saving}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
