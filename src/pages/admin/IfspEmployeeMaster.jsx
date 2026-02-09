import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
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

const IfspEmployeeMaster = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortField, setSortField] = useState('employee_id');
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);

  const [formData, setFormData] = useState({
    employee_id: '',
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
    address: '',
    full_address: '',
    personal_no: '',
    emergency_no: '',
    identification_mark: '',
    years_of_experience: '',
    qualification: '',
    attachments: [],
    birthday_reminder: true,
    anniversary_reminder: true,
    department: '',
    other_experience: '',
    ifspl_experience: '',
    date_of_leaving: '',
    status: 'Active',
    status_reason: ''
  });

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
  const statusOptions = ['Active', 'Inactive'];

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // For now, use mock data until database is set up
      const mockEmployees = [
        {
          id: 1,
          employee_id: 'EMP001',
          full_name: 'Rajesh Kumar Sharma',
          gender: 'Male',
          date_of_joining: '2020-01-15',
          designation: 'Manager',
          date_of_birth: '1985-03-15',
          blood_group: 'A+',
          aadhar_no: '123456789012',
          pan_card_no: 'ABCDE1234F',
          department: 'HR',
          personal_no: '9876543210',
          emergency_no: '9876543211',
          years_of_experience: 8.5,
          status: 'Active'
        },
        {
          id: 2,
          employee_id: 'EMP002',
          full_name: 'Priya Singh',
          gender: 'Female',
          date_of_joining: '2021-06-01',
          designation: 'Senior Executive',
          date_of_birth: '1990-07-22',
          blood_group: 'B+',
          aadhar_no: '234567890123',
          pan_card_no: 'BCDEF2345G',
          department: 'Finance',
          personal_no: '9876543212',
          emergency_no: '9876543213',
          years_of_experience: 5.0,
          status: 'Active'
        },
        {
          id: 3,
          employee_id: 'EMP003',
          full_name: 'Amit Patel',
          gender: 'Male',
          date_of_joining: '2019-03-10',
          designation: 'Senior Manager',
          date_of_birth: '1988-11-10',
          blood_group: 'O+',
          aadhar_no: '345678901234',
          pan_card_no: 'CDEFG3456H',
          department: 'Operations',
          personal_no: '9876543214',
          emergency_no: '9876543215',
          years_of_experience: 10.0,
          status: 'Inactive'
        }
      ];

      setEmployees(mockEmployees);
      
      // Uncomment this when database is ready:
      // const { data, error } = await supabase
      //   .from('ifsp_employees')
      //   .select('*')
      //   .eq('user_id', user.id)
      //   .order(sortField, { ascending: sortDirection === 'asc' });

      // if (error) throw error;
      // setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // For now, work with mock data
      const employeeData = {
        ...formData,
        id: editingEmployee ? editingEmployee.id : Date.now(), // Generate ID for new employees
        years_of_experience: formData.years_of_experience ? parseFloat(formData.years_of_experience) : null,
        other_experience: formData.other_experience ? parseFloat(formData.other_experience) : null,
        ifspl_experience: formData.ifspl_experience ? parseFloat(formData.ifspl_experience) : null,
      };

      if (editingEmployee) {
        // Update existing employee in mock data
        setEmployees(prev => prev.map(emp => 
          emp.id === editingEmployee.id ? { ...emp, ...employeeData } : emp
        ));
        alert('Employee updated successfully!');
      } else {
        // Add new employee to mock data
        setEmployees(prev => [...prev, employeeData]);
        alert('Employee added successfully!');
      }

      resetForm();
      
      // Uncomment this when database is ready:
      // const { data: { user } } = await supabase.auth.getUser();
      // if (!user) return;
      // const { error } = await supabase
      //   .from('ifsp_employees')
      //   .update(employeeData)
      //   .eq('id', editingEmployee.id);
    } catch (error) {
      console.error('Error saving employee:', error);
      alert('Failed to save employee. Please try again.');
    }
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setFormData({
      employee_id: employee.employee_id || '',
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
      address: employee.address || '',
      full_address: employee.full_address || '',
      personal_no: employee.personal_no || '',
      emergency_no: employee.emergency_no || '',
      identification_mark: employee.identification_mark || '',
      years_of_experience: employee.years_of_experience || '',
      qualification: employee.qualification || '',
      attachments: employee.attachments || [],
      birthday_reminder: employee.birthday_reminder !== false,
      anniversary_reminder: employee.anniversary_reminder !== false,
      department: employee.department || '',
      other_experience: employee.other_experience || '',
      ifspl_experience: employee.ifspl_experience || '',
      date_of_leaving: employee.date_of_leaving || '',
      status: employee.status || 'Active',
      status_reason: employee.status_reason || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      try {
        // Delete from mock data
        setEmployees(prev => prev.filter(emp => emp.id !== id));
        alert('Employee deleted successfully!');
        
        // Uncomment this when database is ready:
        // const { error } = await supabase
        //   .from('ifsp_employees')
        //   .delete()
        //   .eq('id', id);
        // if (error) throw error;
      } catch (error) {
        console.error('Error deleting employee:', error);
        alert('Failed to delete employee. Please try again.');
      }
    }
  };

  const handleStatusChange = async (id, newStatus, reason) => {
    try {
      // Update status in mock data
      setEmployees(prev => prev.map(emp => 
        emp.id === id ? { ...emp, status: newStatus, status_reason: reason } : emp
      ));
      alert(`Employee status changed to ${newStatus} successfully!`);
      
      // Uncomment this when database is ready:
      // const { data: { user } } = await supabase.auth.getUser();
      // if (!user) return;
      // const { error } = await supabase
      //   .from('ifsp_employees')
      //   .update({ 
      //     status: newStatus,
      //     status_reason: reason,
      //     status_changed_by: user.email,
      //     status_changed_at: new Date().toISOString(),
      //     updated_by: user.email
      //   })
      //   .eq('id', id);
      // if (error) throw error;
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  const resetForm = () => {
    setFormData({
      employee_id: '',
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
      address: '',
      full_address: '',
      personal_no: '',
      emergency_no: '',
      identification_mark: '',
      years_of_experience: '',
      qualification: '',
      attachments: [],
      birthday_reminder: true,
      anniversary_reminder: true,
      department: '',
      other_experience: '',
      ifspl_experience: '',
      date_of_leaving: '',
      status: 'Active',
      status_reason: ''
    });
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

  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = 
      employee.employee_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.designation?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.personal_no?.includes(searchTerm) ||
      employee.aadhar_no?.includes(searchTerm) ||
      employee.pan_card_no?.includes(searchTerm);
    
    const matchesDepartment = departmentFilter === 'All' || employee.department === departmentFilter;
    const matchesStatus = statusFilter === 'All' || employee.status === statusFilter;
    
    return matchesSearch && matchesDepartment && matchesStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentEmployees = filteredEmployees.slice(startIndex, endIndex);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Fallback in case of any issues
  if (!employees || employees.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold text-gray-900">IFSPL Employee Master</h1>
        <p className="text-gray-600 mt-2">Complete employee database with Excel-like functionality</p>
        <div className="mt-8 text-center">
          <p className="text-gray-500">No employees found. Click "Add Employee" to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">IFSPL Employee Master</h1>
          <p className="text-gray-600 mt-2">Complete employee database with Excel-like functionality</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>Add Employee</span>
          </button>
          <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2">
            <Download className="h-5 w-5" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="All">All Departments</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="All">All Status</option>
            {statusOptions.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center justify-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Advanced Filter</span>
          </button>
          <button className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center justify-center space-x-2">
            <Upload className="h-5 w-5" />
            <span>Import Excel</span>
          </button>
        </div>
      </div>

      {/* Excel-like Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
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
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('employee_id')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Employee ID</span>
                    {sortField === 'employee_id' && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('full_name')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Full Name</span>
                    {sortField === 'full_name' && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gender</th>
                <th 
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date_of_joining')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Date of Joining</span>
                    {sortField === 'date_of_joining' && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Designation</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date of Birth</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Blood Group</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aadhar No</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PAN Card No</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Personal No</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Emergency No</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Years of Experience</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentEmployees.map((employee) => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {employee.employee_id}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.full_name}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.gender || '-'}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.date_of_joining ? new Date(employee.date_of_joining).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.designation}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.date_of_birth ? new Date(employee.date_of_birth).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.blood_group || '-'}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.aadhar_no || '-'}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.pan_card_no || '-'}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.department}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.personal_no || '-'}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.emergency_no || '-'}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.years_of_experience || '-'}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(employee.status)}`}>
                      {getStatusIcon(employee.status)}
                      <span className="ml-1">{employee.status}</span>
                    </span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(employee)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit Employee"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleStatusChange(employee.id, employee.status === 'Active' ? 'Inactive' : 'Active', 'Status changed')}
                        className={`${employee.status === 'Active' ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                        title={employee.status === 'Active' ? 'Deactivate' : 'Activate'}
                      >
                        {employee.status === 'Active' ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => handleDelete(employee.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete Employee"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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

      {/* Employee Form Modal - Complete Form with All Fields */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Employee ID *</label>
                    <input
                      type="text"
                      value={formData.employee_id}
                      onChange={(e) => setFormData({...formData, employee_id: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date of Joining *</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                    <input
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date of Anniversary</label>
                    <input
                      type="date"
                      value={formData.date_of_anniversary}
                      onChange={(e) => setFormData({...formData, date_of_anniversary: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Blood Group</label>
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
                  <h3 className="text-lg font-medium text-gray-900">Identity Documents</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Aadhar No</label>
                    <input
                      type="text"
                      value={formData.aadhar_no}
                      onChange={(e) => setFormData({...formData, aadhar_no: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">PAN Card No</label>
                    <input
                      type="text"
                      value={formData.pan_card_no}
                      onChange={(e) => setFormData({...formData, pan_card_no: e.target.value})}
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Father's Name</label>
                    <input
                      type="text"
                      value={formData.father_name}
                      onChange={(e) => setFormData({...formData, father_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
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
                  <h3 className="text-lg font-medium text-gray-900">Contact & Professional</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Full Address</label>
                    <textarea
                      value={formData.full_address}
                      onChange={(e) => setFormData({...formData, full_address: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Personal No</label>
                    <input
                      type="tel"
                      value={formData.personal_no}
                      onChange={(e) => setFormData({...formData, personal_no: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Emergency No</label>
                    <input
                      type="tel"
                      value={formData.emergency_no}
                      onChange={(e) => setFormData({...formData, emergency_no: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Years of Experience</label>
                    <input
                      type="number"
                      value={formData.years_of_experience}
                      onChange={(e) => setFormData({...formData, years_of_experience: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="0"
                      step="0.1"
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Other Experience</label>
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
  );
};

export default IfspEmployeeMaster;