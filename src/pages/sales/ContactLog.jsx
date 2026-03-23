import React, { useState, useMemo } from 'react';
import { History, Search } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const ContactLog = () => {
  const { commercialPOs } = useBilling();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewHistoryPoId, setViewHistoryPoId] = useState(null);

  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return commercialPOs;
    const s = searchTerm.toLowerCase();
    return commercialPOs.filter(
      (p) =>
        p.ocNumber?.toLowerCase().includes(s) ||
        p.legalName?.toLowerCase().includes(s) ||
        p.currentCoordinator?.toLowerCase().includes(s)
    );
  }, [commercialPOs, searchTerm]);

  const poForHistory = viewHistoryPoId ? commercialPOs.find((p) => p.id === viewHistoryPoId) : null;

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-indigo-100 p-3 rounded-lg shrink-0"><History className="w-6 h-6 text-indigo-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Contact Log</h2>
          <p className="text-sm text-gray-600">View coordinator history per PO – use &quot;View History&quot; to see previous POC names/numbers</p>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" placeholder="Search by OC, client, coordinator..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OC Number</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Coordinator</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact Number</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredList.map((po) => (
                <tr key={po.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{po.ocNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{po.legalName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{po.currentCoordinator || '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{po.contactNumber || '–'}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setViewHistoryPoId(po.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"><History className="w-4 h-4" /> View History</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredList.length === 0 && <div className="p-8 text-center text-gray-500">No PO found. Add POs in PO Entry first.</div>}
      </div>
      {viewHistoryPoId && poForHistory && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Contact History – {poForHistory.ocNumber}</h3>
            <p className="text-sm text-gray-500 mb-4">Names/numbers of previous coordinators</p>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200">
                <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Contact Number</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">From</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">To</th></tr></thead>
                <tbody className="divide-y divide-gray-200">{(poForHistory.contactHistoryLog || []).map((h, i) => (<tr key={i}><td className="px-3 py-2 text-sm">{h.name}</td><td className="px-3 py-2 text-sm">{h.number}</td><td className="px-3 py-2 text-sm">{h.from || '–'}</td><td className="px-3 py-2 text-sm">{h.to || 'Current'}</td></tr>))}</tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end"><button type="button" onClick={() => setViewHistoryPoId(null)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactLog;
