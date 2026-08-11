import {
  normalizeEmploymentType,
  inferEmploymentTypeFromEmployeeId,
  computeIfsplExperienceYears,
  computeTotalExperienceYears,
} from '../../../utils/employeeMasterReminders';

export const EMPLOYEE_MASTER_DESIGNATIONS = [
  'Manager',
  'Senior Manager',
  'Assistant Manager',
  'Executive',
  'Senior Executive',
  'Team Lead',
  'Supervisor',
  'Coordinator',
  'Analyst',
  'Specialist',
  'Trainee',
  'Other',
];

export const EMPLOYEE_MASTER_GENDERS = ['Male', 'Female', 'Other'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other'];
export const MARITAL_STATUSES = ['Single', 'Married', 'Widowed', 'Divorced', 'Other'];
export const STATUS_OPTIONS = ['Active', 'Inactive'];

export function emptyEmployeeMasterForm() {
  return {
    employee_id: '',
    employment_type: 'permanent',
    employee_code: '',
    timestamp: '',
    full_name: '',
    gender: '',
    date_of_joining: '',
    designation: '',
    designation_other: '',
    date_of_birth: '',
    date_of_anniversary: '',
    blood_group: '',
    aadhar_no: '',
    pan_card_no: '',
    religion: '',
    father_name: '',
    mother_name: '',
    spouse_name: '',
    son_name: '',
    son_dob: '',
    daughter_name: '',
    daughter_dob: '',
    son_details: '',
    daughter_details: '',
    address: '',
    full_address: '',
    personal_no: '',
    emergency_no: '',
    identification_mark: '',
    years_of_experience: '',
    qualification: '',
    educational_qualification: '',
    attachments: [],
    birthday_reminder: true,
    anniversary_reminder: true,
    department: '',
    other_experience: '',
    ifspl_experience: '',
    date_of_leaving: '',
    status: 'Active',
    status_reason: '',
    location: '',
    uan_no: '',
    esic_no: '',
    bank_name: '',
    bank_account_no: '',
    ifsc_code: '',
    email_id: '',
    marital_status: '',
    l1_manager_code: '',
    l1_manager_name: '',
    l2_manager_code: '',
    l2_manager_name: '',
    hierarchy_sort_order: '',
  };
}

export function designationFieldsFromStored(stored, designations = EMPLOYEE_MASTER_DESIGNATIONS) {
  const value = String(stored || '').trim();
  if (!value) return { designation: '', designation_other: '' };
  if (designations.includes(value)) return { designation: value, designation_other: '' };
  return { designation: 'Other', designation_other: value };
}

export function resolveDesignationForSave(designation, designationOther) {
  if (designation === 'Other') {
    const custom = String(designationOther || '').trim();
    return custom || null;
  }
  return designation || null;
}

export function employeeToFormData(employee) {
  if (!employee) return emptyEmployeeMasterForm();
  return {
    employee_id: employee.employee_id || '',
    employment_type: normalizeEmploymentType(
      employee.employment_type || inferEmploymentTypeFromEmployeeId(employee.employee_id),
    ),
    employee_code: employee.employee_code || '',
    timestamp: employee.timestamp || '',
    full_name: employee.full_name || '',
    gender: employee.gender || '',
    date_of_joining: employee.date_of_joining || '',
    ...designationFieldsFromStored(employee.designation, EMPLOYEE_MASTER_DESIGNATIONS),
    date_of_birth: employee.date_of_birth || '',
    date_of_anniversary: employee.date_of_anniversary || '',
    blood_group: employee.blood_group || '',
    aadhar_no: employee.aadhar_no || '',
    pan_card_no: employee.pan_card_no || '',
    religion: employee.religion || '',
    father_name: employee.father_name || '',
    mother_name: employee.mother_name || '',
    spouse_name: employee.spouse_name || '',
    son_name: employee.son_name || '',
    son_dob: employee.son_dob || '',
    daughter_name: employee.daughter_name || '',
    daughter_dob: employee.daughter_dob || '',
    son_details: employee.son_details || '',
    daughter_details: employee.daughter_details || '',
    address: employee.address || '',
    full_address: employee.full_address || '',
    personal_no: employee.personal_no || '',
    emergency_no: employee.emergency_no || '',
    identification_mark: employee.identification_mark || '',
    years_of_experience: '',
    qualification: employee.qualification || employee.educational_qualification || '',
    educational_qualification: employee.educational_qualification || employee.qualification || '',
    attachments: employee.attachments || [],
    birthday_reminder: employee.birthday_reminder !== false,
    anniversary_reminder: employee.anniversary_reminder !== false,
    department: employee.department || '',
    other_experience: employee.other_experience || '',
    ifspl_experience: computeIfsplExperienceYears(employee.date_of_joining) ?? '',
    date_of_leaving: employee.date_of_leaving || '',
    status: employee.status || 'Active',
    status_reason: employee.status_reason || '',
    location: employee.location || '',
    uan_no: employee.uan_no || '',
    esic_no: employee.esic_no || '',
    bank_name: employee.bank_name || '',
    bank_account_no: employee.bank_account_no || '',
    ifsc_code: employee.ifsc_code || '',
    email_id: employee.email_id || '',
    marital_status: employee.marital_status || '',
    l1_manager_code: employee.l1_manager_code || '',
    l1_manager_name: employee.l1_manager_name || '',
    l2_manager_code: employee.l2_manager_code || '',
    l2_manager_name: employee.l2_manager_name || '',
    hierarchy_sort_order:
      employee.hierarchy_sort_order != null && employee.hierarchy_sort_order !== ''
        ? String(employee.hierarchy_sort_order)
        : '',
  };
}

export function buildEmployeeMasterPayload(formData, userEmail) {
  const ifsplExperience = computeIfsplExperienceYears(formData.date_of_joining);
  const totalExperience = computeTotalExperienceYears(formData.date_of_joining, formData.other_experience);
  return {
    employee_id: formData.employee_id || null,
    employment_type: normalizeEmploymentType(formData.employment_type),
    employee_code: formData.employee_code || null,
    timestamp: formData.timestamp || null,
    full_name: formData.full_name || null,
    gender: formData.gender || null,
    date_of_joining: formData.date_of_joining || null,
    designation: resolveDesignationForSave(formData.designation, formData.designation_other),
    date_of_birth: formData.date_of_birth || null,
    date_of_anniversary: formData.date_of_anniversary || null,
    blood_group: formData.blood_group || null,
    aadhar_no: formData.aadhar_no || null,
    pan_card_no: formData.pan_card_no || null,
    religion: formData.religion || null,
    father_name: formData.father_name || null,
    mother_name: formData.mother_name || null,
    spouse_name: formData.spouse_name || null,
    son_name: formData.son_name || null,
    son_dob: formData.son_dob || null,
    daughter_name: formData.daughter_name || null,
    daughter_dob: formData.daughter_dob || null,
    son_details: formData.son_details || null,
    daughter_details: formData.daughter_details || null,
    address: formData.address || null,
    full_address: formData.full_address || null,
    personal_no: formData.personal_no || null,
    emergency_no: formData.emergency_no || null,
    identification_mark: formData.identification_mark || null,
    years_of_experience: totalExperience,
    qualification: formData.qualification || formData.educational_qualification || null,
    educational_qualification:
      formData.qualification || formData.educational_qualification || null,
    location: formData.location || null,
    uan_no: formData.uan_no || null,
    esic_no: formData.esic_no || null,
    bank_name: formData.bank_name || null,
    bank_account_no: formData.bank_account_no || null,
    ifsc_code: formData.ifsc_code || null,
    email_id: formData.email_id || null,
    marital_status: formData.marital_status || null,
    attachments: Array.isArray(formData.attachments) ? formData.attachments : [],
    birthday_reminder: formData.birthday_reminder !== false,
    anniversary_reminder: formData.anniversary_reminder !== false,
    department: formData.department || null,
    other_experience: formData.other_experience ? parseFloat(formData.other_experience) : null,
    ifspl_experience: ifsplExperience,
    date_of_leaving: formData.date_of_leaving || null,
    status: formData.status || 'Active',
    status_reason: formData.status_reason || null,
    updated_by: userEmail,
    updated_at: new Date().toISOString(),
  };
}
