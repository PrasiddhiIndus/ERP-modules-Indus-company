import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  nextIfsplEmployeeSystemId,
  computeTotalExperienceYears,
} from '../../utils/employeeMasterReminders';
import { formatDdMonYyyy } from '../../utils/dateFormat';
import * as XLSX from 'xlsx';
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

const th = 'px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-tight whitespace-nowrap border-b border-gray-200';
const td = 'px-2 py-2 text-xs text-gray-900 whitespace-nowrap max-w-[180px] truncate';

const IfspEmployeeMaster = () => {
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
  const fileInputRef = useRef(null);

  const deleteAllEmployees = async () => {
    if (!window.confirm('Delete ALL employee rows? This cannot be undone.')) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Session expired. Please log in again.');
        return;
      }
      const { error } = await supabase
        .from('admin_ifsp_employee_master')
        .delete()
        .eq('user_id', user.id);
      if (error) throw error;
      setEmployees([]);
      setCurrentPage(1);
      alert('All employees deleted.');
    } catch (e) {
      console.error('Delete all failed:', e);
      alert(e?.message || 'Failed to delete employees.');
    }
  };

  const emptyForm = () => ({
    employee_id: '',
    emp_code: '',
    timestamp: '',
    full_name: '',
    gender: '',
    date_of_joining: '',
    designation: '',
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
  });

  const [formData, setFormData] = useState(emptyForm);

  const departments = [
    'HR', 'Finance', 'Operations', 'Sales', 'Marketing', 'IT', 
    'Administration', 'Production', 'Quality Control', 'Logistics', 'Other'
  ];

  const designations = [
    'Manager', 'Senior Manager', 'Assistant Manager', 'Executive', 'Senior Executive',
    'Team Lead', 'Supervisor', 'Coordinator', 'Analyst', 'Specialist', 'Trainee', 'Other'
  ];

  const genders = ['Male', 'Female', 'Other'];
  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const religions = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other'];
  const maritalStatuses = ['Single', 'Married', 'Widowed', 'Divorced', 'Other'];
  const statusOptions = ['Active', 'Inactive'];

  const openAddForm = () => {
    setEditingEmployee(null);
    setFormData({ ...emptyForm(), employee_id: nextIfsplEmployeeSystemId(employees) });
    setShowForm(true);
  };

  const normalizeHeader = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w]/g, '');

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

  const handleImportExcel = async (file) => {
    if (!file) return;
    setImportBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expired. Please log in again.');

      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('No sheet found in file.');

      const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
      if (!Array.isArray(raw) || raw.length === 0) throw new Error('Excel is empty.');

      // Map headers -> fields (replicates your sheet column names)
      const mapKeyToField = (key) => {
        const k = normalizeHeader(key);
        const dict = {
          ifspl_employee_system_id: 'employee_id',
          emp_code: 'emp_code',
          timestamp: 'timestamp',
          full_name: 'full_name',
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
        };
        return dict[k] || null;
      };

      // Determine starting sequence for missing system ids
      let seq = 0;
      for (const row of employees || []) {
        const id = String(row?.employee_id || '').trim();
        const m = /^IFSPL-EMP-(\d+)$/i.exec(id);
        if (m) seq = Math.max(seq, parseInt(m[1], 10));
      }

      const todayYmd = new Date().toISOString().slice(0, 10);

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
        const sheetTotalExp =
          out.years_of_experience === '' || out.years_of_experience == null ? null : Number(out.years_of_experience);
        const totalExp = Number.isFinite(sheetTotalExp) ? sheetTotalExp : computeTotalExperienceYears(doj, prevExp);

        let sysId = String(out.employee_id || '').trim();
        if (!sysId) {
          seq += 1;
          sysId = `IFSPL-EMP-${String(seq).padStart(6, '0')}`;
        }

        const statusRaw = String(out.status || '').trim().toLowerCase();
        const normalizedStatus =
          statusRaw === 'inactive' || statusRaw === 'i' || statusRaw === '0' || statusRaw === 'false' ? 'Inactive' : 'Active';

        return {
          employee_id: sysId,
          emp_code: out.emp_code ? String(out.emp_code).trim() : null,
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
          date_of_leaving: parseExcelDate(out.date_of_leaving),
          other_experience: Number.isFinite(prevExp) ? prevExp : null,
          years_of_experience: totalExp,
          ifspl_experience:
            out.ifspl_experience === '' || out.ifspl_experience == null ? null : Number(out.ifspl_experience),
          status: normalizedStatus,
          // Tenant + audit
          user_id: user.id,
          created_by: user.email || '',
          updated_by: user.email || '',
          updated_at: new Date().toISOString(),
        };
      });

      // Insert rows (skip duplicates by employee_id per tenant by using upsert)
      const chunkSize = 200;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('admin_ifsp_employee_master')
          .upsert(chunk, { onConflict: 'user_id,employee_id' });
        if (error) throw error;
      }

      await fetchEmployees();
      setCurrentPage(1);
      alert(`Imported ${rows.length} employees successfully.`);
    } catch (e) {
      console.error('Import failed:', e);
      alert(e?.message || 'Import failed. Please check the file and try again.');
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
        .eq('user_id', user.id)
        .order(sortField, { ascending: sortDirection === 'asc' });

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [sortField, sortDirection]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const buildPayload = (userEmail) => {
    const payload = {
      employee_id: formData.employee_id || null,
      emp_code: formData.emp_code || null,
      timestamp: formData.timestamp || null,
      full_name: formData.full_name || null,
      gender: formData.gender || null,
      date_of_joining: formData.date_of_joining || null,
      designation: formData.designation || null,
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
      son_details: formData.son_details || null,
      daughter_details: formData.daughter_details || null,
      address: formData.address || null,
      full_address: formData.full_address || null,
      personal_no: formData.personal_no || null,
      emergency_no: formData.emergency_no || null,
      identification_mark: formData.identification_mark || null,
      years_of_experience: computeTotalExperienceYears(formData.date_of_joining, formData.other_experience),
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
      ifspl_experience: formData.ifspl_experience ? parseFloat(formData.ifspl_experience) : null,
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Session expired. Please log in again.');
        return;
      }
      const userEmail = user.email || '';

      if (editingEmployee) {
        const payload = buildPayload(userEmail);
        const { error } = await supabase
          .from('admin_ifsp_employee_master')
          .update(payload)
          .eq('id', editingEmployee.id)
          .eq('user_id', user.id);

        if (error) throw error;
        alert('Employee updated successfully!');
        await fetchEmployees();
      } else {
        const payload = {
          ...buildPayload(userEmail),
          employee_id: nextIfsplEmployeeSystemId(employees),
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

        if (error) throw error;
        alert('Employee added successfully!');
        await fetchEmployees();
      }

      resetForm();
    } catch (error) {
      console.error('Error saving employee:', error);
      alert(error?.message || 'Failed to save employee. Please try again.');
    }
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setFormData({
      employee_id: employee.employee_id || '',
      emp_code: employee.emp_code || '',
      timestamp: employee.timestamp || '',
      full_name: employee.full_name || '',
      gender: employee.gender || '',
      date_of_joining: employee.date_of_joining || '',
      designation: employee.designation || '',
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
      son_details: employee.son_details || '',
      daughter_details: employee.daughter_details || '',
      address: employee.address || '',
      full_address: employee.full_address || '',
      personal_no: employee.personal_no || '',
      emergency_no: employee.emergency_no || '',
      identification_mark: employee.identification_mark || '',
      years_of_experience: '',
      qualification: employee.qualification || '',
      educational_qualification: employee.educational_qualification || '',
      attachments: employee.attachments || [],
      birthday_reminder: employee.birthday_reminder !== false,
      anniversary_reminder: employee.anniversary_reminder !== false,
      department: employee.department || '',
      other_experience: employee.other_experience || '',
      ifspl_experience: employee.ifspl_experience || '',
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
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('admin_ifsp_employee_master')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      setEmployees(prev => prev.filter(emp => emp.id !== id));
      alert('Employee deleted successfully!');
    } catch (error) {
      console.error('Error deleting employee:', error);
      alert(error?.message || 'Failed to delete employee. Please try again.');
    }
  };

  const handleStatusChange = async (id, newStatus, reason) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('admin_ifsp_employee_master')
        .update({
          status: newStatus,
          status_reason: reason || null,
          status_changed_by: user.email,
          status_changed_at: new Date().toISOString(),
          updated_by: user.email,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      setEmployees(prev => prev.map(emp =>
        emp.id === id ? { ...emp, status: newStatus, status_reason: reason } : emp
      ));
      alert(`Employee status changed to ${newStatus} successfully!`);
    } catch (error) {
      console.error('Error updating status:', error);
      alert(error?.message || 'Failed to update status. Please try again.');
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
  };

  const filteredEmployees = employees.filter((employee) => {
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
    const matchesEmpCode = !code || String(employee.employee_id || '').toLowerCase().includes(code);

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
  });

  // Pagination
  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentEmployees = filteredEmployees.slice(startIndex, endIndex);
  const formTotalExperiencePreview = computeTotalExperienceYears(formData.date_of_joining, formData.other_experience);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-7rem)] w-full overflow-hidden overflow-x-hidden bg-gray-50">
      <div className="p-4 md:p-6 h-full w-full flex flex-col gap-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between shrink-0 min-w-0 gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">IFSPL Employee Master</h1>
          <p className="text-sm text-gray-600 mt-1">Complete employee database with Excel-like functionality</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 max-w-full">
          <div className="relative w-full sm:w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search anything…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          <button
            type="button"
            onClick={openAddForm}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 whitespace-nowrap"
          >
            <Plus className="h-5 w-5" />
            <span>Add Employee</span>
          </button>
          <button
            type="button"
            onClick={deleteAllEmployees}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center gap-2 whitespace-nowrap"
            title="Delete all rows"
          >
            <Trash2 className="h-5 w-5" />
            <span>Delete All</span>
          </button>
          <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 whitespace-nowrap">
            <Download className="h-5 w-5" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Filters and Search (section scroller) */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden w-full min-w-0 shrink-0">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
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
              className="bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-700 flex items-center justify-center gap-2 text-sm"
            >
              <Filter className="h-4 w-4" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              disabled={importBusy}
              onClick={() => fileInputRef.current?.click()}
              className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
            >
              <Upload className="h-4 w-4" />
              <span>{importBusy ? 'Importing…' : 'Import Excel'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => void handleImportExcel(e.target.files?.[0])}
            />
          </div>
        </div>
        <div className="max-h-[170px] overflow-y-auto p-4 overflow-x-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Full name"
              value={filterFullName}
              onChange={(e) => setFilterFullName(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="text"
              placeholder="IFSPL system id"
              value={filterSystemId}
              onChange={(e) => setFilterSystemId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="text"
              placeholder="Employee code"
              value={filterEmployeeCode}
              onChange={(e) => setFilterEmployeeCode(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="All">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
            <select
              value={designationFilter}
              onChange={(e) => setDesignationFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="All">All Designations</option>
              {designations.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="All">All Status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <div className="lg:col-span-4 self-center">
              <p className="text-[11px] text-gray-500">
                Excel import expects backend column headers (snake_case) like <span className="font-mono">employee_id</span>, <span className="font-mono">full_name</span>, <span className="font-mono">date_of_joining</span>, etc. (legacy headers also accepted).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Employee Database (section scroller; header + pagination fixed) */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden w-full min-w-0 flex flex-col flex-1 min-h-0">
        <div className="px-6 py-3 border-b border-gray-200 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">
            Employee Database ({filteredEmployees.length} records)
          </h3>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredEmployees.length)} of {filteredEmployees.length}
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Table scroller (vertical + horizontal) — only this section scrolls */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="w-max min-w-full">
            <table className="min-w-max divide-y divide-gray-200 border border-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className={th}>id</th>
                <th className={`${th} cursor-pointer hover:bg-gray-100`} onClick={() => handleSort('employee_id')}>
                  employee_id{sortField === 'employee_id' ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
                <th className={th}>emp_code</th>
                <th className={th}>timestamp</th>
                <th className={`${th} cursor-pointer hover:bg-gray-100`} onClick={() => handleSort('full_name')}>
                  full_name{sortField === 'full_name' ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
                <th className={th}>gender</th>
                <th className={`${th} cursor-pointer hover:bg-gray-100`} onClick={() => handleSort('date_of_joining')}>
                  date_of_joining{sortField === 'date_of_joining' ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
                <th className={th}>designation</th>
                <th className={th}>department</th>
                <th className={th}>location</th>
                <th className={th}>date_of_birth</th>
                <th className={th}>date_of_anniversary</th>
                <th className={th}>blood_group</th>
                <th className={th}>aadhar_no</th>
                <th className={th}>pan_card_no</th>
                <th className={th}>religion</th>
                <th className={th}>father_name</th>
                <th className={th}>mother_name</th>
                <th className={th}>spouse_name</th>
                <th className={th}>son_details</th>
                <th className={th}>daughter_details</th>
                <th className={th}>address</th>
                <th className={th}>full_address</th>
                <th className={th}>personal_no</th>
                <th className={th}>emergency_no</th>
                <th className={th}>identification_mark</th>
                <th className={th}>educational_qualification</th>
                <th className={th}>other_experience</th>
                <th className={th}>ifspl_experience</th>
                <th className={th}>years_of_experience</th>
                <th className={th}>date_of_leaving</th>
                <th className={th}>status</th>
                <th className={th}>actions</th>
              </tr>
              </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentEmployees.map((employee, rowIdx) => {
                const totalExp = computeTotalExperienceYears(employee.date_of_joining, employee.other_experience);
                return (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className={td} title={String(employee.id)}>{employee.id}</td>
                    <td className={td} title={employee.employee_id || ''}>{employee.employee_id || '–'}</td>
                    <td className={td} title={employee.emp_code || ''}>{employee.emp_code || '–'}</td>
                    <td className={td} title={employee.timestamp || ''}>{employee.timestamp || '–'}</td>
                    <td className={td} title={employee.full_name || ''}>{employee.full_name || '–'}</td>
                    <td className={td} title={employee.gender || ''}>{employee.gender || '–'}</td>
                    <td className={td}>{formatDdMonYyyy(employee.date_of_joining)}</td>
                    <td className={td} title={employee.designation || ''}>{employee.designation || '–'}</td>
                    <td className={td} title={employee.department || ''}>{employee.department || '–'}</td>
                    <td className={td} title={employee.location || ''}>{employee.location || '–'}</td>
                    <td className={td}>{formatDdMonYyyy(employee.date_of_birth)}</td>
                    <td className={td}>{formatDdMonYyyy(employee.date_of_anniversary)}</td>
                    <td className={td} title={employee.blood_group || ''}>{employee.blood_group || '–'}</td>
                    <td className={td}>{employee.aadhar_no || '–'}</td>
                    <td className={td}>{employee.pan_card_no || '–'}</td>
                    <td className={td} title={employee.religion || ''}>{employee.religion || '–'}</td>
                    <td className={td} title={employee.father_name || ''}>{employee.father_name || '–'}</td>
                    <td className={td} title={employee.mother_name || ''}>{employee.mother_name || '–'}</td>
                    <td className={td} title={employee.spouse_name || ''}>{employee.spouse_name || '–'}</td>
                    <td className={td} title={employee.son_details || ''}>{employee.son_details || '–'}</td>
                    <td className={td} title={employee.daughter_details || ''}>{employee.daughter_details || '–'}</td>
                    <td className={td} title={employee.address || ''}>{employee.address || '–'}</td>
                    <td className={td} title={employee.full_address || ''}>{employee.full_address || '–'}</td>
                    <td className={td}>{employee.personal_no || '–'}</td>
                    <td className={td}>{employee.emergency_no || '–'}</td>
                    <td className={td} title={employee.identification_mark || ''}>{employee.identification_mark || '–'}</td>
                    <td className={td} title={employee.educational_qualification || ''}>{employee.educational_qualification || '–'}</td>
                    <td className={td}>{employee.other_experience != null ? employee.other_experience : '–'}</td>
                    <td className={td}>{employee.ifspl_experience != null ? employee.ifspl_experience : '–'}</td>
                    <td className={td} title="Computed if sheet value missing">{(employee.years_of_experience ?? totalExp) != null ? (employee.years_of_experience ?? totalExp) : '–'}</td>
                    <td className={td}>{formatDdMonYyyy(employee.date_of_leaving)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(employee.status)}`}>
                        {getStatusIcon(employee.status)}
                        <span className="ml-1">{employee.status}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button type="button" onClick={() => handleEdit(employee)} className="text-blue-600 hover:text-blue-900" title="Edit">
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

      {/* Employee Form Modal - Complete Form with All Fields */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full mx-4 max-h-[90vh] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Employee (master sheet fields)</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">IFSPL_employee_system_id</label>
                    <input
                      type="text"
                      value={formData.employee_id}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-800"
                    />
                    <p className="text-xs text-gray-500 mt-1">Auto-generated sequentially when you save a new employee.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Employee_Name *</label>
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Father&apos;s_Name</label>
                    <input
                      type="text"
                      value={formData.father_name}
                      onChange={(e) => setFormData({...formData, father_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({...formData, gender: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select Gender</option>
                      {genders.map(gender => (
                        <option key={gender} value={gender}>{gender}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date_of_Joining *</label>
                    <input
                      type="date"
                      value={formData.date_of_joining}
                      onChange={(e) => setFormData({...formData, date_of_joining: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Designation *</label>
                    <select
                      value={formData.designation}
                      onChange={(e) => setFormData({...formData, designation: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="">Select Designation</option>
                      {designations.map(designation => (
                        <option key={designation} value={designation}>{designation}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date_of_Birth</label>
                    <input
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">Birthday reminders appear in Admin → Alerts &amp; Notifications (all active employees).</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Wedding_Anniversary_Date</label>
                    <input
                      type="date"
                      value={formData.date_of_anniversary}
                      onChange={(e) => setFormData({...formData, date_of_anniversary: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">Anniversary reminders appear in Admin → Alerts &amp; Notifications.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Blood_Group</label>
                    <select
                      value={formData.blood_group}
                      onChange={(e) => setFormData({...formData, blood_group: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select Blood Group</option>
                      {bloodGroups.map(group => (
                        <option key={group} value={group}>{group}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Identity Documents */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">IDs &amp; bank</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Aadhar_No</label>
                    <input
                      type="text"
                      value={formData.aadhar_no}
                      onChange={(e) => setFormData({...formData, aadhar_no: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">PAN_No</label>
                    <input
                      type="text"
                      value={formData.pan_card_no}
                      onChange={(e) => setFormData({...formData, pan_card_no: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">UAN_No</label>
                    <input
                      type="text"
                      value={formData.uan_no}
                      onChange={(e) => setFormData({...formData, uan_no: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">ESIC_No</label>
                    <input
                      type="text"
                      value={formData.esic_no}
                      onChange={(e) => setFormData({...formData, esic_no: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bank_Name</label>
                    <input
                      type="text"
                      value={formData.bank_name}
                      onChange={(e) => setFormData({...formData, bank_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Account_No</label>
                    <input
                      type="text"
                      value={formData.bank_account_no}
                      onChange={(e) => setFormData({...formData, bank_account_no: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">IFSC_Code</label>
                    <input
                      type="text"
                      value={formData.ifsc_code}
                      onChange={(e) => setFormData({...formData, ifsc_code: e.target.value.toUpperCase()})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Religion</label>
                    <select
                      value={formData.religion}
                      onChange={(e) => setFormData({...formData, religion: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select Religion</option>
                      {religions.map(religion => (
                        <option key={religion} value={religion}>{religion}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Mother's Name</label>
                    <input
                      type="text"
                      value={formData.mother_name}
                      onChange={(e) => setFormData({...formData, mother_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Spouse Name</label>
                    <input
                      type="text"
                      value={formData.spouse_name}
                      onChange={(e) => setFormData({...formData, spouse_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Son's Name</label>
                    <input
                      type="text"
                      value={formData.son_name}
                      onChange={(e) => setFormData({...formData, son_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Son's DOB (MM-DD-YYYY)</label>
                    <input
                      type="date"
                      value={formData.son_dob}
                      onChange={(e) => setFormData({...formData, son_dob: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Daughter's Name</label>
                    <input
                      type="text"
                      value={formData.daughter_name}
                      onChange={(e) => setFormData({...formData, daughter_name: e.target.value})}
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
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Permanent_Address</label>
                    <textarea
                      value={formData.full_address}
                      onChange={(e) => setFormData({...formData, full_address: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Mobile_No</label>
                    <input
                      type="tel"
                      value={formData.personal_no}
                      onChange={(e) => setFormData({...formData, personal_no: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email_ID</label>
                    <input
                      type="email"
                      value={formData.email_id}
                      onChange={(e) => setFormData({...formData, email_id: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Emergency_Contact_No</label>
                    <input
                      type="tel"
                      value={formData.emergency_no}
                      onChange={(e) => setFormData({...formData, emergency_no: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Marital_Status</label>
                    <select
                      value={formData.marital_status}
                      onChange={(e) => setFormData({...formData, marital_status: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select</option>
                      {maritalStatuses.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Identification Mark</label>
                    <input
                      type="text"
                      value={formData.identification_mark}
                      onChange={(e) => setFormData({...formData, identification_mark: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Previous_Experience (years, before IFSPL)</label>
                    <input
                      type="number"
                      value={formData.other_experience}
                      onChange={(e) => setFormData({...formData, other_experience: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="0"
                      step="0.1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Total_Experience (auto, as of today)</label>
                    <input
                      type="text"
                      readOnly
                      value={formTotalExperiencePreview != null ? `${formTotalExperiencePreview} years` : '—'}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-800"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Qualification</label>
                    <textarea
                      value={formData.qualification}
                      onChange={(e) => setFormData({...formData, qualification: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Department *</label>
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({...formData, department: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="">Select Department</option>
                      {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Site / city / branch"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">IFSPL Experience</label>
                    <input
                      type="number"
                      value={formData.ifspl_experience}
                      onChange={(e) => setFormData({...formData, ifspl_experience: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="0"
                      step="0.1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date of Leaving (DOL)</label>
                    <input
                      type="date"
                      value={formData.date_of_leaving}
                      onChange={(e) => setFormData({...formData, date_of_leaving: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {statusOptions.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.birthday_reminder}
                        onChange={(e) => setFormData({...formData, birthday_reminder: e.target.checked})}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">Birthday Reminder</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.anniversary_reminder}
                        onChange={(e) => setFormData({...formData, anniversary_reminder: e.target.checked})}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">Anniversary Reminder</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingEmployee ? 'Update Employee' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default IfspEmployeeMaster;