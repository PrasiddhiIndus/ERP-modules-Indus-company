import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Plus, Edit2, Trash2, MoreVertical, Download, Search, ChevronLeft, ChevronRight, User } from 'lucide-react';
import { exportToExcel } from './utils/excelExport';
import { formatDateDdMmYyyy } from '../../utils/dateDisplay';
import { toast } from "../../lib/toast";
import LeadCompanyAutocomplete from './components/LeadCompanyAutocomplete';
import {
  emptyClientForm,
  emptyContactPerson,
  parseContactPersons,
  flattenContactPersons,
  formatPersonsSummary,
  parseStringList,
  leadToClientForm,
} from './lib/clientContacts';

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
  const [formData, setFormData] = useState(emptyClientForm());
  const [sourceLead, setSourceLead] = useState(null);

  useEffect(() => {
    fetchClients(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
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

  const updatePerson = (index, patch) => {
    setFormData((prev) => {
      const next = [...(prev.contact_persons || [emptyContactPerson()])];
      next[index] = { ...next[index], ...patch };
      return { ...prev, contact_persons: next };
    });
  };

  const updatePersonList = (personIndex, field, itemIndex, value) => {
    setFormData((prev) => {
      const next = [...(prev.contact_persons || [emptyContactPerson()])];
      const list = [...(next[personIndex][field] || [''])];
      list[itemIndex] = value;
      next[personIndex] = { ...next[personIndex], [field]: list };
      return { ...prev, contact_persons: next };
    });
  };

  const addPersonListItem = (personIndex, field) => {
    setFormData((prev) => {
      const next = [...(prev.contact_persons || [emptyContactPerson()])];
      next[personIndex] = {
        ...next[personIndex],
        [field]: [...(next[personIndex][field] || []), ''],
      };
      return { ...prev, contact_persons: next };
    });
  };

  const removePersonListItem = (personIndex, field, itemIndex) => {
    setFormData((prev) => {
      const next = [...(prev.contact_persons || [emptyContactPerson()])];
      const list = (next[personIndex][field] || ['']).filter((_, i) => i !== itemIndex);
      next[personIndex] = { ...next[personIndex], [field]: list.length ? list : [''] };
      return { ...prev, contact_persons: next };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const flat = flattenContactPersons(formData.contact_persons);

      const submitData = {
        client_name: formData.client_name,
        industry: formData.industry || null,
        street_address: formData.street_address || null,
        city: formData.city || null,
        state: formData.state || null,
        country: formData.country || 'India',
        zip_code: formData.zip_code || null,
        primary_contact_person: flat.primary_contact_person,
        contact_numbers: flat.contact_numbers.length > 0 ? JSON.stringify(flat.contact_numbers) : null,
        contact_emails: flat.contact_emails.length > 0 ? JSON.stringify(flat.contact_emails) : null,
        contact_number: flat.contact_number,
        contact_email: flat.contact_email,
        contact_persons: flat.contact_persons.length > 0 ? JSON.stringify(flat.contact_persons) : null,
      };

      const save = async (payload) => {
        if (editingClient) {
          return supabase
            .from('marketing_clients')
            .update({
              ...payload,
              updated_by: user.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', editingClient.id);
        }
        return supabase
          .from('marketing_clients')
          .insert([{
            ...payload,
            created_by: user.id,
            updated_by: user.id,
          }]);
      };

      let { error } = await save(submitData);
      if (error && /contact_persons/i.test(error.message || '')) {
        const { contact_persons: _omit, ...withoutNewColumn } = submitData;
        ({ error } = await save(withoutNewColumn));
      }
      if (error) throw error;

      if (!editingClient && sourceLead?.id) {
        const { error: leadError } = await supabase
          .from('marketing_leads')
          .delete()
          .eq('id', sourceLead.id);
        if (leadError) {
          console.error('Error removing converted lead:', leadError);
          toast.warning('Client saved, but the lead could not be removed from Lead Master.');
        } else {
          toast.success('Client saved. Lead removed from Lead Master.');
        }
      } else {
        toast.success(editingClient ? 'Client updated' : 'Client saved');
      }

      setShowForm(false);
      setEditingClient(null);
      setSourceLead(null);
      setFormData(emptyClientForm());
      fetchClients(1);
    } catch (error) {
      console.error('Error saving client:', error);
      toast.warning('Error saving client: ' + error.message);
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setSourceLead(null);
    setFormData({
      client_name: client.client_name || '',
      industry: client.industry || '',
      street_address: client.street_address || '',
      city: client.city || '',
      state: client.state || '',
      country: client.country || 'India',
      zip_code: client.zip_code || '',
      contact_persons: parseContactPersons(client),
    });
    setShowForm(true);
    setMenuOpen(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingClient(null);
    setSourceLead(null);
    setFormData(emptyClientForm());
  };

  const applyLead = (lead) => {
    if (!lead) return;
    setSourceLead({ id: lead.id, company: lead.company || '' });
    setFormData(leadToClientForm(lead));
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
      toast.warning('Error deleting client: ' + error.message);
    }
  };

  const handleExport = () => {
    const exportData = clients.map((client) => {
      const people = formatPersonsSummary(client);
      const contactNumbers = people.flatMap((p) => p.numbers).join(', ')
        || parseStringList(client.contact_numbers).join(', ')
        || client.contact_number
        || '';
      const contactEmails = people.flatMap((p) => p.emails).join(', ')
        || parseStringList(client.contact_emails).join(', ')
        || client.contact_email
        || '';

      return {
        'Client Name': client.client_name,
        'Industry': client.industry,
        'Street Address': client.street_address || '',
        'City': client.city,
        'State': client.state,
        'Zip Code': client.zip_code || '',
        'Country': client.country,
        'Contact People': people.map((p) => {
          const nums = p.numbers.join(', ');
          return nums ? `${p.name || 'Contact'} (${nums})` : (p.name || '');
        }).filter(Boolean).join('; '),
        'Contact Numbers': contactNumbers,
        'Contact Emails': contactEmails,
        'Created At': formatDateDdMmYyyy(client.created_at),
      };
    });
    exportToExcel(exportData, 'Clients_Export', 'Clients');
  };

  const openNewClient = () => {
    setEditingClient(null);
    setSourceLead(null);
    setFormData(emptyClientForm());
    setShowForm(true);
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
              onClick={openNewClient}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base"
            >
              <Plus className="w-4 h-4" />
              <span>New Client</span>
            </button>
          </div>
        </div>

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
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-11">S.No</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client Name</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Industry</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact people</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Emails</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map((client, idx) => {
                    const people = formatPersonsSummary(client);
                    return (
                    <tr key={client.id} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-center tabular-nums text-gray-600">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium text-gray-900">{client.client_name}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">{client.industry || '-'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">{client.city || '-'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">{client.state || '-'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-700">
                        {people.length ? (
                          <div className="space-y-1.5">
                            {people.map((p, i) => (
                              <div key={`${client.id}-p-${i}`}>
                                <div className="font-medium text-gray-900">
                                  {p.name || 'Contact'}
                                  {i === 0 ? <span className="ml-1 text-[10px] font-normal uppercase tracking-wide text-purple-600">Primary</span> : null}
                                </div>
                                {p.numbers.length ? (
                                  <div className="text-xs text-gray-500">{p.numbers.join(', ')}</div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500 hidden lg:table-cell">
                        {people.flatMap((p) => p.emails).filter(Boolean).join(', ') || '-'}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

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

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  {editingClient ? 'Edit Client' : 'Create New Client'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  {editingClient
                    ? 'Update client details and contact people'
                    : 'Type a company name to fill from Lead Master, then add or edit people'}
                </p>
              </div>
              <button
                onClick={closeForm}
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
                  {editingClient ? (
                    <input
                      type="text"
                      value={formData.client_name}
                      onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="e.g., ABC Industries Pvt Ltd"
                      required
                    />
                  ) : (
                    <LeadCompanyAutocomplete
                      value={formData.client_name}
                      onChange={(next) => setFormData((prev) => ({ ...prev, client_name: next }))}
                      onSelectLead={applyLead}
                      placeholder="Type a company from Lead Master…"
                    />
                  )}
                  {!editingClient && sourceLead ? (
                    <p className="mt-1.5 text-xs text-purple-700">
                      Filled from Lead Master. Saving this client will remove that lead.
                    </p>
                  ) : !editingClient ? (
                    <p className="mt-1.5 text-xs text-gray-500">
                      Pick a lead company to fill industry, city, state, and person 1. You can still type a new name.
                    </p>
                  ) : null}
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
              </div>

              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Contact people</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Add each person and their phone or email. The first person is the primary contact.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        contact_persons: [...(prev.contact_persons || []), emptyContactPerson()],
                      }))
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add person
                  </button>
                </div>

                <div className="space-y-4">
                  {(formData.contact_persons?.length ? formData.contact_persons : [emptyContactPerson()]).map((person, personIndex) => (
                    <div
                      key={`person-${personIndex}`}
                      className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:p-4"
                    >
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <p className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                          <User className="w-3.5 h-3.5 text-purple-600" />
                          Person {personIndex + 1}
                          {personIndex === 0 ? (
                            <span className="font-normal text-purple-600">(primary)</span>
                          ) : null}
                        </p>
                        {(formData.contact_persons || []).length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                contact_persons: prev.contact_persons.filter((_, i) => i !== personIndex),
                              }))
                            }
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove person
                          </button>
                        ) : null}
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input
                          type="text"
                          value={person.name || ''}
                          onChange={(e) => updatePerson(personIndex, { name: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          placeholder="e.g., Rahul Sharma"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Phone numbers</label>
                          <div className="space-y-2">
                            {(person.numbers?.length ? person.numbers : ['']).map((number, numberIndex) => (
                              <div key={`n-${personIndex}-${numberIndex}`} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={number}
                                  onChange={(e) => updatePersonList(personIndex, 'numbers', numberIndex, e.target.value)}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                  placeholder="e.g., +91 98765 43210"
                                />
                                {(person.numbers || []).length > 1 ? (
                                  <button
                                    type="button"
                                    onClick={() => removePersonListItem(personIndex, 'numbers', numberIndex)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                    aria-label="Remove number"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                ) : null}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addPersonListItem(personIndex, 'numbers')}
                              className="inline-flex items-center gap-1 text-xs text-purple-700 hover:underline"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add number for this person
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Emails</label>
                          <div className="space-y-2">
                            {(person.emails?.length ? person.emails : ['']).map((email, emailIndex) => (
                              <div key={`e-${personIndex}-${emailIndex}`} className="flex items-center gap-2">
                                <input
                                  type="email"
                                  value={email}
                                  onChange={(e) => updatePersonList(personIndex, 'emails', emailIndex, e.target.value)}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                  placeholder="e.g., rahul@company.com"
                                />
                                {(person.emails || []).length > 1 ? (
                                  <button
                                    type="button"
                                    onClick={() => removePersonListItem(personIndex, 'emails', emailIndex)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                    aria-label="Remove email"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                ) : null}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addPersonListItem(personIndex, 'emails')}
                              className="inline-flex items-center gap-1 text-xs text-purple-700 hover:underline"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add email for this person
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeForm}
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
