import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  EMPLOYMENT_TYPE_OPTIONS,
  nextEmployeeSystemId,
  normalizeEmploymentType,
  inferEmploymentTypeFromEmployeeId,
  resolveEmployeeIdOnTypeChange,
  resolveEmployeeIdForSave,
  validateEmployeeIdentifiers,
  isEmployeeIdTaken,
  isEmpCodeTaken,
  employmentTypeLabel,
  computeIfsplExperienceYears,
  computeTotalExperienceYears,
} from '../../utils/employeeMasterReminders';
import {
  isActiveEmployeeRow,
  suggestNextHierarchySortOrder,
  validateEmployeeHierarchy,
} from '../../lib/employeeHierarchy';
import { formatDateDdMmYyyy } from '../../utils/dateDisplay';
import { EMPLOYEE_MASTER_BASE_DEPARTMENTS } from '../../lib/employeeMasterDepartments';
import { syncScopeDraftBankFromMaster } from '../adminOperations/salaryAdmin/salaryMonthProcessing';
import { normalizeAttendanceEmpCode } from '../../lib/attendanceDaily';
import { parseSalaryBankImportFile } from '../../lib/salaryBankExcel';
import { applySalaryBankImportToMaster } from '../../lib/salaryBankImportApply';
import * as XLSX from 'xlsx';
import FormDateInput from "../../components/FormDateInput";
import { 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Filter,
  Download,
  Upload,
  Eye,
  Calendar,
  MapPin,
  User,
  Phone,
  Mail,
  Building,
  CreditCard,
  GraduationCap,
  Briefcase,
  DollarSign,
  CheckCircle,
  XCircle,
  AlertTriangle,
  History,
  FileText,
  Heart,
  Gift,
  Clock
} from 'lucide-react';
import { toast } from '../../lib/toast';
import EmployeeMasterPersonalForm from './employeeMaster/EmployeeMasterPersonalForm';

/** Default list view — identify and act on employees without exposing the full master record. */
const EMPLOYEE_LIST_SUMMARY_FIELDS = new Set([
  "employee_id",
  "employment_type",
  "employee_code",
  "full_name",
  "age",
  "date_of_joining",
  "designation",
  "department",
  "status",
]);

const EMPLOYEE_FIELD_LABELS = {
  employee_id: "Machine ID",
  employment_type: "Employment type",
  employee_code: "Employee code",
  age: "Age",
  full_name: "Full name",
  gender: "Gender",
  date_of_joining: "Date of joining",
  designation: "Designation",
  department: "Department",
  location: "Location",
  date_of_birth: "Date of birth",
  date_of_anniversary: "Anniversary",
  blood_group: "Blood group",
  aadhar_no: "Aadhar",
  pan_card_no: "PAN",
  religion: "Religion",
  father_name: "Father name",
  mother_name: "Mother name",
  spouse_name: "Spouse name",
  son_details: "Son details",
  daughter_details: "Daughter details",
  address: "Address",
  full_address: "Full address",
  personal_no: "Personal phone",
  emergency_no: "Emergency contact",
  identification_mark: "Identification mark",
  educational_qualification: "Qualification",
  other_experience: "Other experience (yrs)",
  ifspl_experience: "IFSPL experience (yrs)",
  years_of_experience: "Total experience (yrs)",
  date_of_leaving: "Date of leaving",
  status: "Status",
};

const thBase =
  'px-3 py-2.5 text-[10px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap border-b border-gray-200 align-middle';
const th = `${thBase} text-left`;
const thCenter = `${thBase} text-center`;
const tdBase = 'px-3 py-2 text-xs text-gray-900 align-middle';
const td = `${tdBase} whitespace-nowrap max-w-[200px] truncate`;
const tdCenter = `${tdBase} text-center tabular-nums whitespace-nowrap`;
const tdDate = `${tdBase} text-center whitespace-nowrap tabular-nums`;
const filterInputClass =
  'w-full h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function compareEmployeeSortField(a, b, field, direction) {
  const asc = direction === 'asc';
  let av = a?.[field];
  let bv = b?.[field];

  if (field === 'date_of_joining' || field === 'date_of_birth' || field === 'date_of_anniversary' || field === 'date_of_leaving') {
    const ad = av ? new Date(av).getTime() : 0;
    const bd = bv ? new Date(bv).getTime() : 0;
    if (ad === bd) return 0;
    return asc ? ad - bd : bd - ad;
  }

  if (field === 'other_experience' || field === 'ifspl_experience' || field === 'years_of_experience' || field === 'age') {
    if (field === 'ifspl_experience') {
      av = computeIfsplExperienceYears(a?.date_of_joining);
      bv = computeIfsplExperienceYears(b?.date_of_joining);
    } else if (field === 'years_of_experience') {
      av = computeTotalExperienceYears(a?.date_of_joining, a?.other_experience);
      bv = computeTotalExperienceYears(b?.date_of_joining, b?.other_experience);
    } else if (field === 'age') {
      av = computeAgeFromDob(a?.date_of_birth);
      bv = computeAgeFromDob(b?.date_of_birth);
    }
    const an = av == null || av === '' ? null : Number(av);
    const bn = bv == null || bv === '' ? null : Number(bv);
    if (an == null && bn == null) return 0;
    if (an == null) return asc ? 1 : -1;
    if (bn == null) return asc ? -1 : 1;
    if (an === bn) return 0;
    return asc ? an - bn : bn - an;
  }

  const as = String(av ?? '').toLowerCase();
  const bs = String(bv ?? '').toLowerCase();
  if (as === bs) return 0;
  if (as < bs) return asc ? -1 : 1;
  return asc ? 1 : -1;
}

/** Whole years from date_of_birth to today (null if DOB missing/invalid). */
function computeAgeFromDob(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

const IfspEmployeeMaster = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFullName, setFilterFullName] = useState('');
  const [filterSystemId, setFilterSystemId] = useState('');
  const [filterEmployeeCode, setFilterEmployeeCode] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [designationFilter, setDesignationFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortField, setSortField] = useState('employee_id');
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [importBusy, setImportBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [showAllTableColumns, setShowAllTableColumns] = useState(false);
  const fileInputRef = useRef(null);
  const bankFileInputRef = useRef(null);

  const deleteAllEmployees = async () => {
    if (!window.confirm('Delete ALL employee rows? This cannot be undone.')) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.warning('Session expired. Please log in again.');
        return;
      }
      const { error } = await supabase
        .from('admin_ifsp_employee_master')
        .delete()
        .not('id', 'is', null);
      if (error) throw error;
      setEmployees([]);
      setCurrentPage(1);
      toast.success('All employees deleted.');
    } catch (e) {
      console.error('Delete all failed:', e);
      toast.error(e?.message || 'Failed to delete employees.');
    }
  };

  const emptyForm = () => ({
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
  });

  const [formData, setFormData] = useState(emptyForm);

  const managerCandidates = useMemo(() => {
    const excludeId = editingEmployee?.id;
    return (employees || [])
      .filter((row) => isActiveEmployeeRow(row))
      .filter((row) => !excludeId || row.id !== excludeId)
      .sort((a, b) =>
        String(a.full_name || '').localeCompare(String(b.full_name || ''), undefined, {
          sensitivity: 'base',
        })
      );
  }, [employees, editingEmployee?.id]);

  // Curated fallback list (used in the form so standard departments can always be
  // assigned even if no employee currently uses them). Live values from the
  // database are merged in below so the dropdowns reflect actual data.
  const BASE_DEPARTMENTS = EMPLOYEE_MASTER_BASE_DEPARTMENTS;

  // Distinct department values that actually exist in the employee records.
  const departmentsFromData = useMemo(() => {
    const seen = new Map();
    (employees || []).forEach((row) => {
      const value = String(row?.department || '').trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (!seen.has(key)) seen.set(key, value);
    });
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }, [employees]);

  // Form dropdown: real values + curated defaults, deduped (case-insensitive).
  const departments = useMemo(() => {
    const seen = new Map();
    [...departmentsFromData, ...BASE_DEPARTMENTS].forEach((value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) seen.set(key, trimmed);
    });
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }, [departmentsFromData]);

  const designations = [
    'Manager', 'Senior Manager', 'Assistant Manager', 'Executive', 'Senior Executive',
    'Team Lead', 'Supervisor', 'Coordinator', 'Analyst', 'Specialist', 'Trainee', 'Other'
  ];

  const resolveDesignationForSave = (designation, designationOther) => {
    if (designation === 'Other') {
      const custom = String(designationOther || '').trim();
      return custom || null;
    }
    return designation || null;
  };

  const designationFieldsFromStored = (stored) => {
    const value = String(stored || '').trim();
    if (!value) return { designation: '', designation_other: '' };
    if (designations.includes(value)) return { designation: value, designation_other: '' };
    return { designation: 'Other', designation_other: value };
  };

  const genders = ['Male', 'Female', 'Other'];
  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const religions = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other'];
  const maritalStatuses = ['Single', 'Married', 'Widowed', 'Divorced', 'Other'];
  const statusOptions = ['Active', 'Inactive'];

  /** snake_case columns — matches import template and table headers */
  const EMPLOYEE_EXPORT_FIELDS = [
    'employee_id',
    'employment_type',
    'employee_code',
    'age',
    'full_name',
    'gender',
    'date_of_joining',
    'designation',
    'department',
    'location',
    'date_of_birth',
    'date_of_anniversary',
    'blood_group',
    'aadhar_no',
    'pan_card_no',
    'religion',
    'father_name',
    'mother_name',
    'spouse_name',
    'son_details',
    'daughter_details',
    'address',
    'full_address',
    'personal_no',
    'emergency_no',
    'identification_mark',
    'educational_qualification',
    'other_experience',
    'ifspl_experience',
    'years_of_experience',
    'date_of_leaving',
    'status',
    'uan_no',
    'esic_no',
    'bank_name',
    'bank_account_no',
    'ifsc_code',
    'email_id',
    'marital_status',
  ];

  const openAddForm = () => {
    setEditingEmployee(null);
    setShowForm(true);
  };

  const openEmployeeProfile = (employee) => {
    if (!employee?.id) return;
    navigate(`/app/admin/employee/master/${employee.id}`);
  };

  const handleEmploymentTypeChange = (type) => {
    const normalized = normalizeEmploymentType(type);
    if (editingEmployee) {
      const originalType = normalizeEmploymentType(
        editingEmployee.employment_type || inferEmploymentTypeFromEmployeeId(editingEmployee.employee_id),
      );
      if (normalized === originalType) {
        setFormData((prev) => ({
          ...prev,
          employment_type: normalized,
          employee_id: editingEmployee.employee_id || '',
        }));
        return;
      }
      const resolved = resolveEmployeeIdOnTypeChange(employees, editingEmployee, normalized);
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

  const normalizeHeader = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w]/g, '');

  const blankImportVal = (v) => {
    const s = String(v ?? '').trim();
    return (
      !s ||
      s === '-' ||
      /^n\/?a$/i.test(s) ||
      s.toLowerCase() === 'null' ||
      /^#+$/.test(s)
    );
  };

  const cellText = (v) => {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && Number.isFinite(v)) {
      // Keep long bank/UAN numbers intact (avoid scientific notation)
      if (Math.abs(v) >= 1e11) return String(Math.round(v));
      if (Number.isInteger(v)) return String(v);
      return String(v);
    }
    return String(v).trim();
  };

  const normAccountField = (v, { upper = false } = {}) => {
    if (blankImportVal(v)) return '';
    const s = cellText(v).replace(/\s+/g, ' ');
    return upper ? s.toUpperCase() : s;
  };

  const findEmployeeByCode = (list, code) => {
    const raw = cellText(code);
    if (!raw) return null;
    const norm = normalizeAttendanceEmpCode(raw);
    const normKey = /^\d+$/.test(norm)
      ? norm
      : norm.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]+)(\d+)$/, '$1-$2');
    const hits = (list || []).filter((e) => {
      const cRaw = String(e.employee_code || '').trim();
      if (!cRaw) return false;
      const c = normalizeAttendanceEmpCode(cRaw);
      const cKey = /^\d+$/.test(c)
        ? c
        : c.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]+)(\d+)$/, '$1-$2');
      return cKey === normKey;
    });
    if (!hits.length) return null;
    // Prefer FTC-41 (hyphen) over FTC 41 (space)
    hits.sort((a, b) => {
      const aH = String(a.employee_code || '').includes('-') ? 1 : 0;
      const bH = String(b.employee_code || '').includes('-') ? 1 : 0;
      return bH - aH;
    });
    return hits[0];
  };

  const mapImportHeaderToField = (key) => {
    const k = normalizeHeader(key);
    const dict = {
      ifspl_employee_system_id: 'employee_id',
      employment_type: 'employment_type',
      employee_type: 'employment_type',
      employee_code: 'employee_code',
      emp_code: 'employee_code',
      code: 'employee_code',
      timestamp: 'timestamp',
      full_name: 'full_name',
      name_of_employee: 'full_name',
      employee_name: 'full_name',
      name: 'full_name',
      gender: 'gender',
      date_of_joining: 'date_of_joining',
      designation: 'designation',
      department: 'department',
      date_of_birth: 'date_of_birth',
      date_of_anniversary: 'date_of_anniversary',
      blood_group: 'blood_group',
      aadhar_no: 'aadhar_no',
      pan_card_no: 'pan_card_no',
      religion: 'religion',
      father_name: 'father_name',
      mother_name: 'mother_name',
      spouse_name: 'spouse_name',
      son_details: 'son_details',
      daughter_details: 'daughter_details',
      present_address: 'address',
      permanent_address: 'full_address',
      personal_no: 'personal_no',
      emergency_no: 'emergency_no',
      identification_mark: 'identification_mark',
      years_of_experience: 'years_of_experience',
      educational_qualification: 'educational_qualification',
      attachments: 'attachments',
      other_experience: 'other_experience',
      ifspl_experience: 'ifspl_experience',
      date_of_leaving: 'date_of_leaving',
      activeinactive: 'status',
      active_inactive: 'status',
      status: 'status',
      // Salary account sheet columns
      uan_number: 'uan_no',
      uan_no: 'uan_no',
      uan: 'uan_no',
      esic_number: 'esic_no',
      esic_no: 'esic_no',
      esic: 'esic_no',
      ac_number: 'bank_account_no',
      a_c_number: 'bank_account_no',
      a_c_no: 'bank_account_no',
      ac_no: 'bank_account_no',
      account_number: 'bank_account_no',
      account_no: 'bank_account_no',
      bank_account_no: 'bank_account_no',
      bank_account_number: 'bank_account_no',
      bank_ac: 'bank_account_no',
      bank_a_c: 'bank_account_no',
      ifsc_code: 'ifsc_code',
      ifsc: 'ifsc_code',
      ifsccode: 'ifsc_code',
      bank_name: 'bank_name',
      empcode: 'employee_code',
      empee_code: 'employee_code',
      emp_ee_code: 'employee_code',
    };
    return dict[k] || null;
  };

  /** Sheet like: Employee Code | Name | UAN | ESIC | A/c number | IFSC (Dept/Desig OK). */
  const isSalaryAccountsSheet = (headerFields) => {
    const hasCode = headerFields.has('employee_code');
    const hasAccountBits =
      headerFields.has('uan_no') ||
      headerFields.has('esic_no') ||
      headerFields.has('bank_account_no') ||
      headerFields.has('ifsc_code');
    // Full personal master sheets usually include these — keep them on the full-import path
    const looksLikeFullMaster =
      headerFields.has('father_name') ||
      headerFields.has('aadhar_no') ||
      headerFields.has('pan_card_no') ||
      headerFields.has('date_of_birth') ||
      headerFields.has('personal_no') ||
      headerFields.has('address');
    return hasCode && hasAccountBits && !looksLikeFullMaster;
  };

  const importSalaryAccountDetails = async (rawRows, user) => {
    const existing = [...(employees || [])];
    let updated = 0;
    let created = 0;
    let unchanged = 0;
    let skipped = 0;
    let failed = 0;
    const createdCodes = [];
    const failedCodes = [];

    const ACCOUNT_KEYS = ['uan_no', 'esic_no', 'bank_account_no', 'ifsc_code'];
    const todayYmd = new Date().toISOString().slice(0, 10);

    const inferTypeFromCode = (code) => {
      const c = String(code || '').trim();
      if (/^ftc[-_]?\d+/i.test(c) || /^c-\d+/i.test(c)) return 'contract';
      if (/^v-\d+/i.test(c)) return 'voucher';
      return 'permanent';
    };

    for (let idx = 0; idx < rawRows.length; idx += 1) {
      const r = rawRows[idx] || {};
      const out = {};
      Object.entries(r).forEach(([k, v]) => {
        const field = mapImportHeaderToField(k);
        if (!field) return;
        out[field] = v;
      });

      const empCodeRaw = cellText(out.employee_code);
      if (!empCodeRaw) {
        skipped += 1;
        continue;
      }

      const incoming = {
        uan_no: normAccountField(out.uan_no),
        esic_no: normAccountField(out.esic_no),
        bank_account_no: normAccountField(out.bank_account_no).replace(/\s+/g, ''),
        ifsc_code: normAccountField(out.ifsc_code, { upper: true }).replace(/\s+/g, ''),
      };
      const sheetName = cellText(out.full_name);
      const hasAnyAccount = ACCOUNT_KEYS.some((k) => Boolean(incoming[k]));
      if (!hasAnyAccount && !sheetName) {
        skipped += 1;
        continue;
      }

      let emp = findEmployeeByCode(existing, empCodeRaw);

      // No profile yet → create a basic Employee Master row so Personal details + Salary Processing can use it
      if (!emp?.id) {
        try {
          const employment_type = normalizeEmploymentType(inferTypeFromCode(empCodeRaw));
          const employee_id = nextEmployeeSystemId(existing, employment_type);
          const insertPayload = {
            employee_code: empCodeRaw,
            employee_id,
            employment_type,
            full_name: sheetName || `Employee ${empCodeRaw}`,
            designation: 'Other',
            department: 'Other',
            date_of_joining: todayYmd,
            status: 'Active',
            uan_no: incoming.uan_no || null,
            esic_no: incoming.esic_no || null,
            bank_account_no: incoming.bank_account_no || null,
            ifsc_code: incoming.ifsc_code || null,
            user_id: user.id,
            created_by: user.email || '',
            updated_by: user.email || '',
            updated_at: new Date().toISOString(),
          };
          const { data: inserted, error } = await supabase
            .from('admin_ifsp_employee_master')
            .insert(insertPayload)
            .select('*')
            .single();
          if (error) throw error;
          emp = inserted;
          existing.push(inserted);
          syncScopeDraftBankFromMaster(inserted.id, {
            account_no: inserted.bank_account_no,
            ifsc: inserted.ifsc_code,
          });
          created += 1;
          if (createdCodes.length < 8) createdCodes.push(empCodeRaw);
        } catch (createErr) {
          console.error('Salary account import: create failed', empCodeRaw, createErr);
          failed += 1;
          if (failedCodes.length < 8) failedCodes.push(empCodeRaw);
        }
        continue;
      }

      const patch = {};
      for (const key of ACCOUNT_KEYS) {
        const nextVal = incoming[key];
        if (!nextVal) continue; // sheet blank → leave master as-is
        const curVal =
          key === 'ifsc_code'
            ? normAccountField(emp[key], { upper: true }).replace(/\s+/g, '')
            : key === 'bank_account_no'
              ? normAccountField(emp[key]).replace(/\s+/g, '')
              : normAccountField(emp[key]);
        if (!curVal || curVal !== nextVal) {
          patch[key] = nextVal;
        }
      }
      // Fill empty name from sheet when profile has no name
      if (sheetName && !String(emp.full_name || '').trim()) {
        patch.full_name = sheetName;
      }

      if (!Object.keys(patch).length) {
        unchanged += 1;
        continue;
      }

      const payload = {
        ...patch,
        updated_by: user.email || '',
        updated_at: new Date().toISOString(),
      };
      const { data: updatedRow, error } = await supabase
        .from('admin_ifsp_employee_master')
        .update(payload)
        .eq('id', emp.id)
        .select('id, bank_account_no, ifsc_code, uan_no, esic_no, full_name')
        .single();
      if (error) {
        console.error('Salary account import: update failed', empCodeRaw, error);
        failed += 1;
        if (failedCodes.length < 8) failedCodes.push(empCodeRaw);
        continue;
      }

      Object.assign(emp, updatedRow || patch);
      syncScopeDraftBankFromMaster(emp.id, {
        account_no: emp.bank_account_no,
        ifsc: emp.ifsc_code,
      });
      updated += 1;
    }

    await fetchEmployees();
    setCurrentPage(1);

    const parts = [];
    if (updated) parts.push(`${updated} profile(s) updated`);
    if (created) {
      parts.push(
        `${created} new profile(s) created${
          createdCodes.length
            ? ` (${createdCodes.join(', ')}${created > createdCodes.length ? '…' : ''})`
            : ''
        }`
      );
    }
    if (unchanged) parts.push(`${unchanged} already up to date`);
    if (failed) {
      parts.push(
        `${failed} failed${
          failedCodes.length
            ? ` (${failedCodes.join(', ')}${failed > failedCodes.length ? '…' : ''})`
            : ''
        }`
      );
    }
    if (skipped) parts.push(`${skipped} blank row(s) skipped`);

    if (!updated && !created && !unchanged) {
      toast.error(parts.join(' · ') || 'No salary account rows could be saved.');
      return;
    }
    if (failed && (updated || created)) {
      toast.success(parts.join(' · '));
      return;
    }
    if (failed && !updated && !created) {
      toast.error(parts.join(' · ') || 'Could not save salary account details.');
      return;
    }
    toast.success(parts.join(' · ') || 'Salary account details saved to Employee Master.');
  };

  const parseExcelDate = (v) => {
    if (!v) return null;
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s || s === '-' || s.toLowerCase() === 'na' || s.toLowerCase() === 'n/a') return null;
    }
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') {
      const dt = XLSX.SSF.parse_date_code(v);
      if (dt?.y && dt?.m && dt?.d) {
        const mm = String(dt.m).padStart(2, '0');
        const dd = String(dt.d).padStart(2, '0');
        return `${dt.y}-${mm}-${dd}`;
      }
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    const str = String(v).trim();
    // Support DD-MM-YYYY or DD/MM/YYYY
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(str);
    if (m) {
      const dd = String(m[1]).padStart(2, '0');
      const mm = String(m[2]).padStart(2, '0');
      const yy = m[3];
      return `${yy}-${mm}-${dd}`;
    }
    // Support DD-Mon-YYYY (e.g. 01-Feb-2007)
    // Allow separators: space, '-', '/'
    const m2 = /^(\d{1,2})[\s/-]([A-Za-z]{3,9})[\s/-](\d{2,4})$/.exec(str);
    if (m2) {
      const dd = String(m2[1]).padStart(2, '0');
      const monRaw = String(m2[2]).slice(0, 3).toLowerCase();
      const monMap = {
        jan: '01',
        feb: '02',
        mar: '03',
        apr: '04',
        may: '05',
        jun: '06',
        jul: '07',
        aug: '08',
        sep: '09',
        oct: '10',
        nov: '11',
        dec: '12',
      };
      const mm = monMap[monRaw];
      if (!mm) return null;
      const yearRaw = String(m2[3]);
      const yy = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      return `${yy}-${mm}-${dd}`;
    }
    return null;
  };

  const handleImportBankExcel = async (file) => {
    if (!file) return;
    setImportBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expired. Please log in again.');

      const bankParsed = await parseSalaryBankImportFile(file, {
        employees: employees || [],
      });
      const bankRowCount =
        (bankParsed.rows?.length || 0) + (bankParsed.unmatched?.length || 0);
      if (!bankRowCount) {
        toast.error(
          (bankParsed.errors || []).join(' ') ||
            'No bank rows found. Use columns: Employee Code, Name, UAN, ESIC, A/c number, IFSC.'
        );
        return;
      }

      const result = await applySalaryBankImportToMaster(bankParsed, {
        employees: employees || [],
        user,
      });
      await fetchEmployees();
      setCurrentPage(1);

      if (!result.updated && !result.created) {
        toast.error(result.message || 'No account details were saved.');
        return;
      }
      toast.success(
        `${result.message}. Open the employee → Personal details to see Account / IFSC / UAN / ESIC.`
      );
    } catch (e) {
      console.error('Bank import failed:', e);
      toast.error(e?.message || 'Bank import failed. Please check the file and try again.');
    } finally {
      setImportBusy(false);
      if (bankFileInputRef.current) bankFileInputRef.current.value = '';
    }
  };

  const handleImportExcel = async (file) => {
    if (!file) return;
    setImportBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expired. Please log in again.');

      // 1) Bank / UAN / ESIC sheet — scan for header row (title rows above OK)
      const bankParsed = await parseSalaryBankImportFile(file, {
        employees: employees || [],
      });
      const bankRowCount =
        (bankParsed.rows?.length || 0) + (bankParsed.unmatched?.length || 0);
      const headerMissing = (bankParsed.errors || []).some((e) =>
        /could not find a header/i.test(String(e))
      );
      const anyAccountValue = [...(bankParsed.rows || []), ...(bankParsed.unmatched || [])].some(
        (r) => r.accountNo || r.ifsc || r.uanNo || r.esicNo
      );

      if (!headerMissing && bankRowCount > 0 && anyAccountValue) {
        const result = await applySalaryBankImportToMaster(bankParsed, {
          employees: employees || [],
          user,
        });
        await fetchEmployees();
        setCurrentPage(1);
        if (!result.updated && !result.created && result.failures?.length) {
          toast.error(result.message);
        } else if (!result.updated && !result.created && !result.unchanged) {
          toast.error(result.message || 'No account details were saved.');
        } else {
          toast.success(
            `${result.message}. Open any employee → Personal details to see Account / IFSC / UAN / ESIC.`
          );
        }
        return;
      }

      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('No sheet found in file.');

      // raw:false keeps long account / UAN numbers as text
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      if (!Array.isArray(raw) || raw.length === 0) throw new Error('Excel is empty.');

      const headerFields = new Set();
      Object.keys(raw[0] || {}).forEach((k) => {
        const field = mapImportHeaderToField(k);
        if (field) headerFields.add(field);
      });

      if (isSalaryAccountsSheet(headerFields)) {
        await importSalaryAccountDetails(raw, user);
        return;
      }

      // Map headers -> fields (full employee master import)
      const mapKeyToField = mapImportHeaderToField;

      const todayYmd = new Date().toISOString().slice(0, 10);
      const importRows = [...(employees || [])];

      const rows = raw.map((r, idx) => {
        const out = {};
        Object.entries(r || {}).forEach(([k, v]) => {
          const field = mapKeyToField(k);
          if (!field) return;
          out[field] = v;
        });

        // Default missing required DB fields (so we never block import)
        const fullName = String(out.full_name || '').trim() || `Unknown ${idx + 1}`;
        const designation = String(out.designation || '').trim() || 'Other';
        const department = String(out.department || '').trim() || 'Other';
        const doj = parseExcelDate(out.date_of_joining) || todayYmd;

        const prevExp = out.other_experience === '' || out.other_experience == null ? null : Number(out.other_experience);
        const ifsplExp = computeIfsplExperienceYears(doj);
        const totalExp = computeTotalExperienceYears(doj, prevExp);

        const employment_type = normalizeEmploymentType(out.employment_type || out.employee_id);

        const empCode = out.employee_code ? String(out.employee_code).trim() : '';
        const rawSysId = String(out.employee_id || '').trim();
        let sysId = rawSysId && rawSysId !== empCode ? rawSysId : '';

        // Existing code → update account / identity fields instead of failing
        const existingEmp = empCode ? findEmployeeByCode(importRows, empCode) : null;
        if (existingEmp) {
          const accountPatch = {};
          const maybeSet = (key, nextRaw, { upper = false } = {}) => {
            const nextVal = normAccountField(nextRaw, { upper });
            if (!nextVal) return;
            const curVal =
              key === 'bank_account_no' || key === 'ifsc_code'
                ? normAccountField(existingEmp[key], { upper }).replace(/\s+/g, '')
                : normAccountField(existingEmp[key], { upper });
            const cmpNext =
              key === 'bank_account_no' || key === 'ifsc_code'
                ? nextVal.replace(/\s+/g, '')
                : nextVal;
            if (!curVal || curVal !== cmpNext) accountPatch[key] = nextVal;
          };
          maybeSet('uan_no', out.uan_no);
          maybeSet('esic_no', out.esic_no);
          maybeSet('bank_account_no', out.bank_account_no);
          maybeSet('ifsc_code', out.ifsc_code, { upper: true });
          return {
            __updateExistingId: existingEmp.id,
            ...accountPatch,
            updated_by: user.email || '',
            updated_at: new Date().toISOString(),
          };
        }

        if (sysId && isEmployeeIdTaken(sysId, importRows)) {
          throw new Error(`Row ${idx + 2}: employee_id "${sysId}" is already in use.`);
        }
        if (!sysId) {
          sysId = nextEmployeeSystemId(importRows, employment_type);
        }
        importRows.push({ employee_id: sysId, employment_type, employee_code: empCode || null });

        const statusRaw = String(out.status || '').trim().toLowerCase();
        const normalizedStatus =
          statusRaw === 'inactive' || statusRaw === 'i' || statusRaw === '0' || statusRaw === 'false' ? 'Inactive' : 'Active';
        const dateOfLeavingParsed = parseExcelDate(out.date_of_leaving);
        if (normalizedStatus === 'Inactive' && !dateOfLeavingParsed) {
          throw new Error(`Row ${idx + 2}: Date of Leaving is required when status is Inactive.`);
        }

        return {
          employee_id: sysId,
          employment_type,
          employee_code: out.employee_code ? String(out.employee_code).trim() : null,
          timestamp: out.timestamp ? String(out.timestamp).trim() : null,
          full_name: fullName,
          gender: out.gender ? String(out.gender).trim() : null,
          father_name: out.father_name ? String(out.father_name).trim() : null,
          mother_name: out.mother_name ? String(out.mother_name).trim() : null,
          spouse_name: out.spouse_name ? String(out.spouse_name).trim() : null,
          religion: out.religion ? String(out.religion).trim() : null,
          identification_mark: out.identification_mark ? String(out.identification_mark).trim() : null,
          date_of_birth: parseExcelDate(out.date_of_birth),
          date_of_joining: doj,
          designation,
          department,
          location: out.location ? String(out.location).trim() : null,
          aadhar_no: out.aadhar_no ? String(out.aadhar_no).trim() : null,
          pan_card_no: out.pan_card_no ? String(out.pan_card_no).trim() : null,
          uan_no: out.uan_no ? String(out.uan_no).trim() : null,
          esic_no: out.esic_no ? String(out.esic_no).trim() : null,
          bank_name: out.bank_name ? String(out.bank_name).trim() : null,
          bank_account_no: out.bank_account_no ? String(out.bank_account_no).trim() : null,
          ifsc_code: out.ifsc_code ? String(out.ifsc_code).trim().toUpperCase() : null,
          personal_no: out.personal_no ? String(out.personal_no).trim() : null,
          email_id: out.email_id ? String(out.email_id).trim() : null,
          address: out.address ? String(out.address).trim() : null,
          full_address: out.full_address ? String(out.full_address).trim() : null,
          emergency_no: out.emergency_no ? String(out.emergency_no).trim() : null,
          blood_group: out.blood_group ? String(out.blood_group).trim() : null,
          marital_status: out.marital_status ? String(out.marital_status).trim() : null,
          date_of_anniversary: parseExcelDate(out.date_of_anniversary),
          son_details: out.son_details ? String(out.son_details).trim() : null,
          daughter_details: out.daughter_details ? String(out.daughter_details).trim() : null,
          educational_qualification: out.educational_qualification ? String(out.educational_qualification).trim() : null,
          qualification: out.educational_qualification ? String(out.educational_qualification).trim() : null,
          date_of_leaving: dateOfLeavingParsed,
          other_experience: Number.isFinite(prevExp) ? prevExp : null,
          years_of_experience: totalExp,
          ifspl_experience: ifsplExp,
          status: normalizedStatus,
          // Tenant + audit
          user_id: user.id,
          created_by: user.email || '',
          updated_by: user.email || '',
          updated_at: new Date().toISOString(),
        };
      });

      const toInsert = rows.filter((r) => !r.__updateExistingId);
      const toUpdate = rows.filter((r) => r.__updateExistingId);

      for (const row of toUpdate) {
        const { __updateExistingId: id, ...payload } = row;
        const hasAccountChange = ['uan_no', 'esic_no', 'bank_account_no', 'ifsc_code'].some(
          (k) => payload[k] != null && String(payload[k]).trim() !== ''
        );
        if (!id || !hasAccountChange) continue;
        const { data: saved, error } = await supabase
          .from('admin_ifsp_employee_master')
          .update(payload)
          .eq('id', id)
          .select('id, bank_account_no, ifsc_code')
          .maybeSingle();
        if (error) throw error;
        if (!saved) {
          console.warn('Import account update returned no row (check access)', id);
          continue;
        }
        syncScopeDraftBankFromMaster(id, {
          account_no: payload.bank_account_no ?? saved.bank_account_no,
          ifsc: payload.ifsc_code ?? saved.ifsc_code,
        });
      }

      const chunkSize = 200;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('admin_ifsp_employee_master')
          .upsert(chunk, { onConflict: 'user_id,employee_id' });
        if (error) throw error;
      }

      await fetchEmployees();
      setCurrentPage(1);
      const bits = [];
      if (toInsert.length) bits.push(`${toInsert.length} added`);
      if (toUpdate.length) bits.push(`${toUpdate.length} account row(s) merged`);
      toast.success(bits.join(' · ') || 'Import finished.');
    } catch (e) {
      console.error('Import failed:', e);
      toast.error(e?.message || 'Import failed. Please check the file and try again.');
    } finally {
      setImportBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setEmployees([]);
        return;
      }

      const { data, error } = await supabase
        .from('admin_ifsp_employee_master')
        .select('*')
        .order('employee_id', { ascending: true });

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const buildPayload = (userEmail) => {
    const ifsplExperience = computeIfsplExperienceYears(formData.date_of_joining);
    const totalExperience = computeTotalExperienceYears(formData.date_of_joining, formData.other_experience);
    const payload = {
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
      qualification: (formData.educational_qualification || formData.qualification) || null,
      educational_qualification: formData.educational_qualification || null,
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
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.designation === 'Other' && !String(formData.designation_other || '').trim()) {
      toast.warning('Please enter a designation when Other is selected.');
      return;
    }
    if (formData.status === 'Inactive' && !String(formData.date_of_leaving || '').trim()) {
      toast.warning('Date of Leaving is required when employee status is Inactive.');
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.warning('Session expired. Please log in again.');
        return;
      }
      const userEmail = user.email || '';
      const excludeDbId = editingEmployee?.id ?? null;

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

      if (editingEmployee) {
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
          ...buildPayload(userEmail),
          employment_type,
          employee_id,
          ...hierarchyCheck.fields,
        };
        const { error } = await supabase
          .from('admin_ifsp_employee_master')
          .update(payload)
          .eq('id', editingEmployee.id);

        if (error) {
          if (error.code === '23505') {
            throw new Error('That employee ID or code is already in use. Change the employee code or switch employment type again.');
          }
          throw error;
        }
        toast.success('Employee updated successfully!');
        await fetchEmployees();
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
          ...buildPayload(userEmail),
          employment_type,
          employee_id,
          ...hierarchyCheck.fields,
        };
        const { error } = await supabase
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
            throw new Error('That employee ID or code is already in use. Please save again to get the next available ID.');
          }
          throw error;
        }
        toast.success('Employee added successfully!');
        await fetchEmployees();
      }

      resetForm();
    } catch (error) {
      console.error('Error saving employee:', error);
      toast.error(error?.message || 'Failed to save employee. Please try again.');
    }
  };

  const handleEdit = (employee) => {
    openEmployeeProfile(employee);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('admin_ifsp_employee_master')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setEmployees(prev => prev.filter(emp => emp.id !== id));
      toast.success('Employee deleted successfully!');
    } catch (error) {
      console.error('Error deleting employee:', error);
      toast.error(error?.message || 'Failed to delete employee. Please try again.');
    }
  };

  const handleStatusChange = async (id, newStatus, reason) => {
    try {
      const employee = employees.find((emp) => emp.id === id);
      if (!employee) return;

      let dateOfLeaving = employee.date_of_leaving || '';
      if (newStatus === 'Inactive') {
        if (!String(dateOfLeaving).trim()) {
          const input = window.prompt(
            'Date of Leaving is required when deactivating an employee.\nEnter date (YYYY-MM-DD):'
          );
          if (!input?.trim()) {
            toast.warning('Date of Leaving is required to set employee as Inactive.');
            return;
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
            toast.warning('Please enter a valid date in YYYY-MM-DD format.');
            return;
          }
          dateOfLeaving = input.trim();
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updatePayload = {
        status: newStatus,
        status_reason: reason || null,
        status_changed_by: user.email,
        status_changed_at: new Date().toISOString(),
        updated_by: user.email,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === 'Inactive' && dateOfLeaving) {
        updatePayload.date_of_leaving = dateOfLeaving;
      }

      const { error } = await supabase
        .from('admin_ifsp_employee_master')
        .update(updatePayload)
        .eq('id', id);

      if (error) throw error;
      setEmployees(prev => prev.map(emp =>
        emp.id === id
          ? {
              ...emp,
              status: newStatus,
              status_reason: reason,
              ...(newStatus === 'Inactive' && dateOfLeaving ? { date_of_leaving: dateOfLeaving } : {}),
            }
          : emp
      ));
      toast.success(`Employee status changed to ${newStatus} successfully!`);
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(error?.message || 'Failed to update status. Please try again.');
    }
  };

  const resetForm = () => {
    setFormData(emptyForm());
    setEditingEmployee(null);
    setShowForm(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Inactive': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Active': return <CheckCircle className="h-4 w-4" />;
      case 'Inactive': return <XCircle className="h-4 w-4" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const SortableTh = ({ field, label, center = false }) => {
    const active = sortField === field;
    const cellClass = center ? thCenter : th;
    return (
      <th
        className={`${cellClass} cursor-pointer select-none hover:bg-gray-100`}
        onClick={() => handleSort(field)}
        title={`Sort by ${label}`}
        aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span className={`inline-flex items-center gap-1 ${center ? 'justify-center w-full' : ''}`}>
          {label}
          <span className={active ? 'text-gray-900' : 'text-gray-300'}>
            {active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </span>
      </th>
    );
  };

  const showCol = (field) => showAllTableColumns || EMPLOYEE_LIST_SUMMARY_FIELDS.has(field);
  const colLabel = (field) => EMPLOYEE_FIELD_LABELS[field] || String(field).replace(/_/g, " ");
  const ListTh = ({ field, center = false }) =>
    showCol(field) ? <SortableTh field={field} label={colLabel(field)} center={center} /> : null;
  const ListTd = ({ field, title, children, className: cellClass = td, center = false }) =>
    showCol(field) ? (
      <td className={center ? tdCenter : cellClass} title={title}>
        {children}
      </td>
    ) : null;

  const exportCellValue = (employee, field) => {
    if (field === 'ifspl_experience') {
      return computeIfsplExperienceYears(employee.date_of_joining) ?? '';
    }
    if (field === 'years_of_experience') {
      return computeTotalExperienceYears(employee.date_of_joining, employee.other_experience) ?? '';
    }
    if (field === 'age') {
      const age = computeAgeFromDob(employee.date_of_birth);
      return age != null ? age : '';
    }
    let value = employee[field];
    if (value == null || value === '') return '';
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return value;
  };

  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    const st = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !st ||
      String(employee.employee_id || '').toLowerCase().includes(st) ||
      String(employee.full_name || '').toLowerCase().includes(st) ||
      String(employee.designation || '').toLowerCase().includes(st) ||
      String(employee.department || '').toLowerCase().includes(st) ||
      String(employee.location || '').toLowerCase().includes(st) ||
      String(employee.personal_no || '').toLowerCase().includes(st) ||
      String(employee.email_id || '').toLowerCase().includes(st) ||
      String(employee.aadhar_no || '').toLowerCase().includes(st) ||
      String(employee.pan_card_no || '').toLowerCase().includes(st) ||
      String(employee.uan_no || '').toLowerCase().includes(st) ||
      String(employee.esic_no || '').toLowerCase().includes(st);

    const fn = filterFullName.trim().toLowerCase();
    const matchesFullName = !fn || String(employee.full_name || '').toLowerCase().includes(fn);

    const sys = filterSystemId.trim().toLowerCase();
    const matchesSystemId = !sys || String(employee.employee_id || '').toLowerCase().includes(sys);

    const code = filterEmployeeCode.trim().toLowerCase();
    const matchesEmpCode =
      !code ||
      String(employee.employee_code || '').toLowerCase().includes(code) ||
      String(employee.employee_id || '').toLowerCase().includes(code);

    const matchesDepartment = departmentFilter === 'All' || employee.department === departmentFilter;
    const matchesDesignation = designationFilter === 'All' || employee.designation === designationFilter;
    const matchesStatus = statusFilter === 'All' || employee.status === statusFilter;

    return (
      matchesSearch &&
      matchesFullName &&
      matchesSystemId &&
      matchesEmpCode &&
      matchesDepartment &&
      matchesDesignation &&
      matchesStatus
    );
  }), [
    employees,
    searchTerm,
    filterFullName,
    filterSystemId,
    filterEmployeeCode,
    departmentFilter,
    designationFilter,
    statusFilter,
  ]);

  const sortedFilteredEmployees = useMemo(() => {
    const list = [...filteredEmployees];
    list.sort((a, b) => compareEmployeeSortField(a, b, sortField, sortDirection));
    return list;
  }, [filteredEmployees, sortField, sortDirection]);

  const handleExportExcel = () => {
    if (!filteredEmployees.length) {
      toast.warning('No employees to export for the current filters.');
      return;
    }

    setExportBusy(true);
    try {
      const sheetRows = sortedFilteredEmployees.map((emp) => {
        const out = {};
        for (const field of EMPLOYEE_EXPORT_FIELDS) {
          out[field] = exportCellValue(emp, field);
        }
        if (out.years_of_experience === '' || out.years_of_experience == null) {
          const total = computeTotalExperienceYears(emp.date_of_joining, emp.other_experience);
          if (total != null) out.years_of_experience = total;
        }
        return out;
      });

      const ws = XLSX.utils.json_to_sheet(sheetRows, { header: EMPLOYEE_EXPORT_FIELDS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Employee Master');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `ifspl-employee-master-${stamp}.xlsx`);
    } catch (e) {
      console.error('Export failed:', e);
      toast.error(e?.message || 'Failed to export Excel file.');
    } finally {
      setExportBusy(false);
    }
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedFilteredEmployees.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentEmployees = sortedFilteredEmployees.slice(startIndex, endIndex);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "h-[calc(100vh-14rem)] min-h-[480px] w-full overflow-hidden overflow-x-hidden bg-gray-50 rounded-lg border border-gray-200"
          : "h-[calc(100vh-7rem)] w-full overflow-hidden overflow-x-hidden bg-gray-50"
      }
    >
      <div className={`p-4 md:p-6 h-full w-full flex flex-col gap-4 ${embedded ? "" : "max-w-[1600px] mx-auto"}`}>
      {/* Header */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-4 items-start shrink-0 min-w-0">
        <div className="min-w-0">
          <h1 className={`font-bold text-gray-900 ${embedded ? "text-lg" : "text-2xl"}`}>
            {embedded ? "Employee Master" : "IFSPL In-house Employee Master"}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            This screen is only for in-house employee records. Use All Employees when you need the combined in-house and site directory view.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap xl:justify-end items-stretch sm:items-center gap-2 w-full xl:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-[280px] xl:w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search anything…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-3 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAddForm}
              className="h-10 bg-blue-600 text-white px-4 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Add Employee</span>
            </button>
            <button
              type="button"
              onClick={deleteAllEmployees}
              className="h-10 bg-red-600 text-white px-4 rounded-lg hover:bg-red-700 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
              title="Delete all rows"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete All</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exportBusy || !sortedFilteredEmployees.length}
              className="h-10 bg-green-600 text-white px-4 rounded-lg hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
            >
              <Download className="h-4 w-4" />
              <span>{exportBusy ? 'Exporting…' : 'Export Excel'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden w-full min-w-0 shrink-0">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-gray-900">Filters</p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilterFullName('');
                setFilterSystemId('');
                setFilterEmployeeCode('');
                setDepartmentFilter('All');
                setDesignationFilter('All');
                setStatusFilter('All');
                setCurrentPage(1);
              }}
              className="h-9 bg-gray-600 text-white px-3 rounded-lg hover:bg-gray-700 flex items-center justify-center gap-2 text-sm"
            >
              <Filter className="h-4 w-4" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              disabled={importBusy}
              onClick={() => bankFileInputRef.current?.click()}
              className="h-9 bg-indigo-600 text-white px-3 rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
              title="Import Employee Code, UAN, ESIC, A/c number, IFSC onto Personal details"
            >
              <CreditCard className="h-4 w-4" />
              <span>{importBusy ? 'Importing…' : 'Import bank details'}</span>
            </button>
            <button
              type="button"
              disabled={importBusy}
              onClick={() => fileInputRef.current?.click()}
              className="h-9 bg-purple-600 text-white px-3 rounded-lg hover:bg-purple-700 disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
            >
              <Upload className="h-4 w-4" />
              <span>{importBusy ? 'Importing…' : 'Import Excel'}</span>
            </button>
            <input
              ref={bankFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => void handleImportBankExcel(e.target.files?.[0])}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => void handleImportExcel(e.target.files?.[0])}
            />
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 items-center">
            <input
              type="text"
              placeholder="Full name"
              value={filterFullName}
              onChange={(e) => setFilterFullName(e.target.value)}
              className={filterInputClass}
            />
            <input
              type="text"
              placeholder="Machine ID"
              value={filterSystemId}
              onChange={(e) => setFilterSystemId(e.target.value)}
              className={filterInputClass}
            />
            <input
              type="text"
              placeholder="Employee code"
              value={filterEmployeeCode}
              onChange={(e) => setFilterEmployeeCode(e.target.value)}
              className={filterInputClass}
            />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className={filterInputClass}
            >
              <option value="All">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
            <select
              value={designationFilter}
              onChange={(e) => setDesignationFilter(e.target.value)}
              className={filterInputClass}
            >
              <option value="All">All Designations</option>
              {designations.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={filterInputClass}
            >
              <option value="All">All Status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-gray-500 mt-3">
            Excel bank sheet columns: Employee Code, Name of Employee, UAN Number, Esic number, A/c
            number, IFSC Code. Use <span className="font-medium">Import bank details</span> — values
            save on each profile and appear in Salary Processing. Edit anytime under Personal details.
          </p>
        </div>
      </div>

      {/* Employee Database (section scroller; header + pagination fixed) */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden w-full min-w-0 flex flex-col flex-1 min-h-0">
        <div className="px-4 sm:px-6 py-3 border-b border-gray-200 flex flex-wrap justify-between items-center gap-3 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">
            Employees ({sortedFilteredEmployees.length})
          </h3>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowAllTableColumns((v) => !v)}
              className="text-xs font-medium text-accent hover:underline"
            >
              {showAllTableColumns ? "Show summary columns" : "Show all columns"}
            </button>
            <span className="text-sm text-gray-500 whitespace-nowrap">
              Showing {sortedFilteredEmployees.length ? startIndex + 1 : 0}–{Math.min(endIndex, sortedFilteredEmployees.length)} of {sortedFilteredEmployees.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="h-8 px-3 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-2 text-sm text-gray-600 whitespace-nowrap">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="h-8 px-3 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Table scroller (vertical + horizontal) — only this section scrolls */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="w-max min-w-full">
            <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className={thCenter}>Sr No</th>
                <ListTh field="employee_id" center />
                <ListTh field="employment_type" />
                <ListTh field="employee_code" center />
                <ListTh field="full_name" />
                <ListTh field="age" center />
                <ListTh field="date_of_joining" center />
                <ListTh field="designation" />
                <ListTh field="department" />
                <ListTh field="gender" />
                <ListTh field="location" />
                <ListTh field="date_of_birth" center />
                <ListTh field="date_of_anniversary" center />
                <ListTh field="blood_group" center />
                <ListTh field="aadhar_no" />
                <ListTh field="pan_card_no" />
                <ListTh field="religion" />
                <ListTh field="father_name" />
                <ListTh field="mother_name" />
                <ListTh field="spouse_name" />
                <ListTh field="son_details" />
                <ListTh field="daughter_details" />
                <ListTh field="address" />
                <ListTh field="full_address" />
                <ListTh field="personal_no" />
                <ListTh field="emergency_no" />
                <ListTh field="identification_mark" />
                <ListTh field="educational_qualification" />
                <ListTh field="other_experience" center />
                <ListTh field="ifspl_experience" center />
                <ListTh field="years_of_experience" center />
                <ListTh field="date_of_leaving" center />
                <ListTh field="status" center />
                <th className={thCenter}>Actions</th>
              </tr>
              </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentEmployees.map((employee, idx) => {
                const ifsplExp = computeIfsplExperienceYears(employee.date_of_joining);
                const totalExp = computeTotalExperienceYears(employee.date_of_joining, employee.other_experience);
                const age = computeAgeFromDob(employee.date_of_birth);
                const rowNo = startIndex + idx + 1;
                return (
                  <tr
                    key={employee.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => openEmployeeProfile(employee)}
                  >
                    <td className={tdCenter} title={String(employee.id)}>{rowNo}</td>
                    <ListTd field="employee_id" title={employee.employee_id || ''} center>
                      {employee.employee_id || '–'}
                    </ListTd>
                    <ListTd field="employment_type" title={employmentTypeLabel(employee.employment_type || employee.employee_id)}>
                      {employmentTypeLabel(employee.employment_type || employee.employee_id)}
                    </ListTd>
                    <ListTd field="employee_code" title={employee.employee_code || ''} center>
                      {employee.employee_code || '–'}
                    </ListTd>
                    <ListTd field="full_name" title={employee.full_name || ''}>{employee.full_name || '–'}</ListTd>
                    <ListTd field="age" title={age != null ? String(age) : ''} center>
                      {age != null ? age : '–'}
                    </ListTd>
                    <ListTd field="date_of_joining" className={tdDate}>
                      {formatDateDdMmYyyy(employee.date_of_joining)}
                    </ListTd>
                    <ListTd field="designation" title={employee.designation || ''}>{employee.designation || '–'}</ListTd>
                    <ListTd field="department" title={employee.department || ''}>{employee.department || '–'}</ListTd>
                    <ListTd field="gender" title={employee.gender || ''}>{employee.gender || '–'}</ListTd>
                    <ListTd field="location" title={employee.location || ''}>{employee.location || '–'}</ListTd>
                    <ListTd field="date_of_birth" className={tdDate}>{formatDateDdMmYyyy(employee.date_of_birth)}</ListTd>
                    <ListTd field="date_of_anniversary" className={tdDate}>{formatDateDdMmYyyy(employee.date_of_anniversary)}</ListTd>
                    <ListTd field="blood_group" title={employee.blood_group || ''} center>{employee.blood_group || '–'}</ListTd>
                    <ListTd field="aadhar_no">{employee.aadhar_no || '–'}</ListTd>
                    <ListTd field="pan_card_no">{employee.pan_card_no || '–'}</ListTd>
                    <ListTd field="religion" title={employee.religion || ''}>{employee.religion || '–'}</ListTd>
                    <ListTd field="father_name" title={employee.father_name || ''}>{employee.father_name || '–'}</ListTd>
                    <ListTd field="mother_name" title={employee.mother_name || ''}>{employee.mother_name || '–'}</ListTd>
                    <ListTd field="spouse_name" title={employee.spouse_name || ''}>{employee.spouse_name || '–'}</ListTd>
                    <ListTd field="son_details" title={employee.son_details || ''}>{employee.son_details || '–'}</ListTd>
                    <ListTd field="daughter_details" title={employee.daughter_details || ''}>{employee.daughter_details || '–'}</ListTd>
                    <ListTd field="address" title={employee.address || ''}>{employee.address || '–'}</ListTd>
                    <ListTd field="full_address" title={employee.full_address || ''}>{employee.full_address || '–'}</ListTd>
                    <ListTd field="personal_no">{employee.personal_no || '–'}</ListTd>
                    <ListTd field="emergency_no">{employee.emergency_no || '–'}</ListTd>
                    <ListTd field="identification_mark" title={employee.identification_mark || ''}>{employee.identification_mark || '–'}</ListTd>
                    <ListTd field="educational_qualification" title={employee.educational_qualification || ''}>{employee.educational_qualification || '–'}</ListTd>
                    <ListTd field="other_experience" center>{employee.other_experience != null ? employee.other_experience : '–'}</ListTd>
                    <ListTd field="ifspl_experience" center>{ifsplExp != null ? ifsplExp : '–'}</ListTd>
                    <ListTd field="years_of_experience" title="Previous experience + IFSPL experience" center>
                      {totalExp != null ? totalExp : '–'}
                    </ListTd>
                    <ListTd field="date_of_leaving" className={tdDate}>{formatDateDdMmYyyy(employee.date_of_leaving)}</ListTd>
                    {showCol('status') ? (
                    <td className="px-3 py-2 whitespace-nowrap text-center align-middle">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(employee.status)}`}>
                        {getStatusIcon(employee.status)}
                        <span className="ml-1">{employee.status}</span>
                      </span>
                    </td>
                    ) : null}
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-center align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center justify-center gap-2">
                        <button type="button" onClick={() => handleEdit(employee)} className="text-blue-600 hover:text-blue-900" title="Open profile">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(employee.id, employee.status === 'Active' ? 'Inactive' : 'Active', 'Status changed')}
                          className={employee.status === 'Active' ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}
                          title={employee.status === 'Active' ? 'Deactivate' : 'Activate'}
                        >
                          {employee.status === 'Active' ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                        </button>
                        <button type="button" onClick={() => handleDelete(employee.id)} className="text-red-600 hover:text-red-900" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>

          {filteredEmployees.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No employees found</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Employee modal — edit opens the employee profile page */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full mx-4 max-h-[90vh] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Add New Employee</h2>
            </div>
            <div className="p-6">
              <EmployeeMasterPersonalForm
                employee={null}
                employees={employees}
                variant="modal"
                onCancel={() => {
                  setShowForm(false);
                  setEditingEmployee(null);
                }}
                onSaved={async () => {
                  setShowForm(false);
                  setEditingEmployee(null);
                  await fetchEmployees();
                }}
              />
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default IfspEmployeeMaster;
