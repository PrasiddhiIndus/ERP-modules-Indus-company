import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Plus, Edit2, Trash2, MoreVertical, Download, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { exportToExcel } from './utils/excelExport';

const ClientMaster = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [totalCount, setTotalCount] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [formData, setFormData] = useState({
    client_name: '',
    industry: '',
    street_address: '',
    city: '',
    state: '',
    country: 'India',
    zip_code: '',
    primary_contact_person: '',
    contact_numbers: [''],
    contact_emails: [''],
  });

  useEffect(() => {
    fetchClients(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Reset + refetch when searching
    setCurrentPage(1);
    fetchClients(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const fetchClients = async (page = currentPage) => {
    try {
      setLoading(true);
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('marketing_clients')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      const q = String(searchQuery || '').trim();
      if (q) {
        // Search across a few common fields.
        query = query.or(
          `client_name.ilike.%${q}%,industry.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%,primary_contact_person.ilike.%${q}%`
        );
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;
      setClients(data || []);
      setTotalCount(count || 0);
      setCurrentPage(page);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching clients:', error);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Filter out empty contact numbers and emails
      const contactNumbers = formData.contact_numbers.filter(num => num.trim() !== '');
      const contactEmails = formData.contact_emails.filter(email => email.trim() !== '');
      
      // Prepare data for submission - store arrays as JSON strings for Supabase
      const submitData = {
        client_name: formData.client_name,
        industry: formData.industry || null,
        street_address: formData.street_address || null,
        city: formData.city || null,
        state: formData.state || null,
        country: formData.country || 'India',
        zip_code: formData.zip_code || null,
        primary_contact_person: formData.primary_contact_person || null,
        // Store arrays as JSON strings (Supabase will handle JSONB conversion)
        contact_numbers: contactNumbers.length > 0 ? JSON.stringify(contactNumbers) : null,
        contact_emails: contactEmails.length > 0 ? JSON.stringify(contactEmails) : null,
        // Keep backward compatibility - store first contact as single fields
        contact_number: contactNumbers.length > 0 ? contactNumbers[0] : null,
        contact_email: contactEmails.length > 0 ? contactEmails[0] : null,
      };
      
      if (editingClient) {
        const { error } = await supabase
          .from('marketing_clients')
          .update({
            ...submitData,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingClient.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('marketing_clients')
          .insert([{
            ...submitData,
            created_by: user.id,
            updated_by: user.id,
          }]);

        if (error) throw error;
      }

      setShowForm(false);
      setEditingClient(null);
      setFormData({
        client_name: '',
        industry: '',
        street_address: '',
        city: '',
        state: '',
        country: 'India',
        zip_code: '',
        primary_contact_person: '',
        contact_numbers: [''],
        contact_emails: [''],
      });
      fetchClients(1);
    } catch (error) {
      console.error('Error saving client:', error);
      alert('Error saving client: ' + error.message);
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    
    // Handle contact numbers - support JSON string, array, or single value
    let contactNumbers = [''];
    if (client.contact_numbers) {
      try {
        // Try to parse as JSON first
        if (typeof client.contact_numbers === 'string') {
          const parsed = JSON.parse(client.contact_numbers);
          contactNumbers = Array.isArray(parsed) ? parsed : [parsed];
        } else if (Array.isArray(client.contact_numbers)) {
          contactNumbers = client.contact_numbers;
        } else {
          contactNumbers = [client.contact_numbers];
        }
      } catch (e) {
        // If not JSON, treat as single value
        contactNumbers = [client.contact_numbers];
      }
    } else if (client.contact_number) {
      contactNumbers = [client.contact_number];
    }
    
    // Handle contact emails - support JSON string, array, or single value
    let contactEmails = [''];
    if (client.contact_emails) {
      try {
        // Try to parse as JSON first
        if (typeof client.contact_emails === 'string') {
          const parsed = JSON.parse(client.contact_emails);
          contactEmails = Array.isArray(parsed) ? parsed : [parsed];
        } else if (Array.isArray(client.contact_emails)) {
          contactEmails = client.contact_emails;
        } else {
          contactEmails = [client.contact_emails];
        }
      } catch (e) {
        // If not JSON, treat as single value
        contactEmails = [client.contact_emails];
      }
    } else if (client.contact_email) {
      contactEmails = [client.contact_email];
    }
    
    setFormData({
      client_name: client.client_name || '',
      industry: client.industry || '',
      street_address: client.street_address || '',
      city: client.city || '',
      state: client.state || '',
      country: client.country || 'India',
      zip_code: client.zip_code || '',
      primary_contact_person: client.primary_contact_person || '',
      contact_numbers: contactNumbers.length > 0 ? contactNumbers : [''],
      contact_emails: contactEmails.length > 0 ? contactEmails : [''],
    });
    setShowForm(true);
    setMenuOpen(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this client?')) return;

    try {
      const { error } = await supabase
        .from('marketing_clients')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchClients();
      setMenuOpen(null);
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Error deleting client: ' + error.message);
    }
  };

  const handleExport = () => {
    const exportData = clients.map(client => {
      // Handle contact numbers - support JSON string, array, or single value
      let contactNumbers = '';
      if (client.contact_numbers) {
        try {
          if (typeof client.contact_numbers === 'string') {
            const parsed = JSON.parse(client.contact_numbers);
            contactNumbers = Array.isArray(parsed) ? parsed.join(', ') : parsed;
          } else if (Array.isArray(client.contact_numbers)) {
            contactNumbers = client.contact_numbers.join(', ');
          } else {
            contactNumbers = client.contact_numbers;
          }
        } catch (e) {
          contactNumbers = client.contact_numbers;
        }
      } else if (client.contact_number) {
        contactNumbers = client.contact_number;
      }
      
      // Handle contact emails - support JSON string, array, or single value
      let contactEmails = '';
      if (client.contact_emails) {
        try {
          if (typeof client.contact_emails === 'string') {
            const parsed = JSON.parse(client.contact_emails);
            contactEmails = Array.isArray(parsed) ? parsed.join(', ') : parsed;
          } else if (Array.isArray(client.contact_emails)) {
            contactEmails = client.contact_emails.join(', ');
          } else {
            contactEmails = client.contact_emails;
          }
        } catch (e) {
          contactEmails = client.contact_emails;
        }
      } else if (client.contact_email) {
        contactEmails = client.contact_email;
      }
      
      return {
        'Client Name': client.client_name,
        'Industry': client.industry,
        'Street Address': client.street_address || '',
        'City': client.city,
        'State': client.state,
        'Zip Code': client.zip_code || '',
        'Country': client.country,
        'Primary Contact Person': client.primary_contact_person,
        'Contact Numbers': contactNumbers,
        'Contact Emails': contactEmails,
        'Created At': new Date(client.created_at).toLocaleDateString(),
      };
    });
    exportToExcel(exportData, 'Clients_Export', 'Clients');
  };

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Client Master</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Manage all your clients</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-[260px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clients…"
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <button
              onClick={handleExport}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm sm:text-base"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Excel</span>
              <span className="sm:hidden">Export</span>
            </button>
            <button
              onClick={() => {
                setEditingClient(null);
                setFormData({
                  client_name: '',
                  industry: '',
                  street_address: '',
                  city: '',
                  state: '',
                  country: 'India',
                  zip_code: '',
                  primary_contact_person: '',
                  contact_numbers: [''],
                  contact_emails: [''],
                });
                setShowForm(true);
              }}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base"
            >
              <Plus className="w-4 h-4" />
              <span>New Client</span>
            </button>
          </div>
        </div>

        {/* Clients Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-4 sm:p-8 text-center text-gray-500">Loading...</div>
          ) : clients.length === 0 ? (
            <div className="p-4 sm:p-8 text-center text-gray-500">No clients found</div>
          ) : (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client Name</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Industry</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact Person</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Contact Numbers</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Contact Emails</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium text-gray-900">{client.client_name}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">{client.industry || '-'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">{client.city || '-'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">{client.state || '-'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">{client.primary_contact_person || '-'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500 hidden md:table-cell">
                        {(() => {
                          let numbers = '';
                          if (client.contact_numbers) {
                            try {
                              if (typeof client.contact_numbers === 'string') {
                                const parsed = JSON.parse(client.contact_numbers);
                                numbers = Array.isArray(parsed) ? parsed.join(', ') : parsed;
                              } else if (Array.isArray(client.contact_numbers)) {
                                numbers = client.contact_numbers.join(', ');
                              } else {
                                numbers = client.contact_numbers;
                              }
                            } catch (e) {
                              numbers = client.contact_numbers;
                            }
                          } else if (client.contact_number) {
                            numbers = client.contact_number;
                          }
                          return numbers || '-';
                        })()}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500 hidden lg:table-cell">
                        {(() => {
                          let emails = '';
                          if (client.contact_emails) {
                            try {
                              if (typeof client.contact_emails === 'string') {
                                const parsed = JSON.parse(client.contact_emails);
                                emails = Array.isArray(parsed) ? parsed.join(', ') : parsed;
                              } else if (Array.isArray(client.contact_emails)) {
                                emails = client.contact_emails.join(', ');
                              } else {
                                emails = client.contact_emails;
                              }
                            } catch (e) {
                              emails = client.contact_emails;
                            }
                          } else if (client.contact_email) {
                            emails = client.contact_email;
                          }
                          return emails || '-';
                        })()}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-right text-sm font-medium relative">
                        <button
                          onClick={() => setMenuOpen(menuOpen === client.id ? null : client.id)}
                          className="p-2 hover:bg-gray-100 rounded-lg"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {menuOpen === client.id && (
                          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                            <button
                              onClick={() => handleEdit(client)}
                              className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <Edit2 className="w-4 h-4" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDelete(client.id)}
                              className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalCount > itemsPerPage ? (
            <div className="flex items-center justify-between gap-3 px-3 sm:px-6 py-3 border-t bg-white">
              <p className="text-xs text-gray-600">
                Showing {(currentPage - 1) * itemsPerPage + 1}-
                {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchClients(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button
                  type="button"
                  onClick={() => fetchClients(currentPage + 1)}
                  disabled={currentPage * itemsPerPage >= totalCount}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm disabled:opacity-40"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Create/Edit Client Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  {editingClient ? 'Edit Client' : 'Create New Client'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">Add a new client to the system</p>
              </div>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingClient(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.client_name}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., ABC Industries Pvt Ltd"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Industry</label>
                  <input
                    type="text"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., Manufacturing"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Street Address</label>
                  <input
                    type="text"
                    value={formData.street_address}
                    onChange={(e) => setFormData({ ...formData, street_address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., 123 Main Street, Building A"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., Mumbai"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., Maharashtra"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Zip Code</label>
                  <input
                    type="text"
                    value={formData.zip_code}
                    onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., 400001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., India"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Primary Contact Person</label>
                  <input
                    type="text"
                    value={formData.primary_contact_person}
                    onChange={(e) => setFormData({ ...formData, primary_contact_person: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., John Doe"
                  />
                </div>

                {/* Contact Numbers Section */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Numbers
                  </label>
                  <div className="space-y-2">
                    {formData.contact_numbers.map((number, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={number}
                          onChange={(e) => {
                            const newNumbers = [...formData.contact_numbers];
                            newNumbers[index] = e.target.value;
                            setFormData({ ...formData, contact_numbers: newNumbers });
                          }}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          placeholder="e.g., +91 98765 43210"
                        />
                        {formData.contact_numbers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newNumbers = formData.contact_numbers.filter((_, i) => i !== index);
                              setFormData({ ...formData, contact_numbers: newNumbers });
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          contact_numbers: [...formData.contact_numbers, ''],
                        });
                      }}
                      className="flex items-center space-x-2 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Contact Number</span>
                    </button>
                  </div>
                </div>

                {/* Contact Emails Section */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Emails
                  </label>
                  <div className="space-y-2">
                    {formData.contact_emails.map((email, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => {
                            const newEmails = [...formData.contact_emails];
                            newEmails[index] = e.target.value;
                            setFormData({ ...formData, contact_emails: newEmails });
                          }}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          placeholder="e.g., contact@abcindustries.com"
                        />
                        {formData.contact_emails.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newEmails = formData.contact_emails.filter((_, i) => i !== index);
                              setFormData({ ...formData, contact_emails: newEmails });
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          contact_emails: [...formData.contact_emails, ''],
                        });
                      }}
                      className="flex items-center space-x-2 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Contact Email</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingClient(null);
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {editingClient ? 'Update Client' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientMaster;

