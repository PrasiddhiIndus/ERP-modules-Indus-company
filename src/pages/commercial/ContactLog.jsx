import React, { useState, useMemo, useEffect } from 'react';
import { History, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const PAGE_SIZE = 10;

const ContactLog = () => {
  const { commercialPOs } = useBilling();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewHistoryPoId, setViewHistoryPoId] = useState(null);

  const TextCell = ({ value, className = '' }) => {
    const display = value ?? '';
    return (
      <span
        className={`block min-w-0 truncate ${className}`}
        title={typeof display === 'string' ? display : String(display)}
      >
        {display || '–'}
      </span>
    );
  };

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

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [searchTerm]);
  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginatedList = filteredList.slice(start, start + PAGE_SIZE);
  const goToPage = (p) => setPage(Math.min(Math.max(1, p), totalPages));

  const poForHistory = viewHistoryPoId ? commercialPOs.find((p) => p.id === viewHistoryPoId) : null;

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-blue-100 p-3 rounded-lg shrink-0">
          <History className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Contact Log</h2>
          <p className="text-sm text-gray-600">View and Click previous coordinator history as per PO</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by OC, client, coordinator..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="rounded-xl border border-gray-300 overflow-hidden bg-[#f2f6ff]">
        <div className="p-2">
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="w-full max-w-full min-w-0 overflow-x-hidden">
              <table className="w-full min-w-0 max-w-full table-fixed border-collapse">
                <thead>
                  <tr>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[18%]">
                      OC Number
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[28%]">
                      Client
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[22%]">
                      Current Coordinator
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[18%]">
                      Contact Number
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[14%]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {paginatedList.map((po) => (
                    <tr key={po.id} className="hover:bg-gray-50 align-top">
                      <td className="px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-900 min-w-0 text-center">
                        <TextCell value={po.ocNumber} className="text-center font-semibold font-mono" />
                      </td>
                      <td className="px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 min-w-0 text-center">
                        <TextCell value={po.legalName} className="text-center" />
                      </td>
                      <td className="px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 min-w-0 text-center">
                        <TextCell value={po.currentCoordinator} className="text-center" />
                      </td>
                      <td className="px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 min-w-0 text-center">
                        <TextCell value={po.contactNumber} className="text-center font-mono tabular-nums" />
                      </td>
                      <td className="px-1 sm:px-2 py-1.5 text-center min-w-0">
                        <button
                          type="button"
                          onClick={() => setViewHistoryPoId(po.id)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                          title="View History"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredList.length === 0 && (
              <div className="p-8 text-center text-gray-500 text-sm">No PO found. Add POs in PO Entry first.</div>
            )}
          </div>

          {filteredList.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-600">
                Showing <span className="font-medium">{start + 1}</span>–
                <span className="font-medium">{Math.min(start + PAGE_SIZE, filteredList.length)}</span> of{' '}
                <span className="font-medium">{filteredList.length}</span> PO{filteredList.length !== 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage <= 1}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-700">
                  Page <span className="font-medium">{safePage}</span> of <span className="font-medium">{totalPages}</span>
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {viewHistoryPoId && poForHistory && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Contact History – {poForHistory.ocNumber}</h3>
            <p className="text-sm text-gray-500 mb-4">
              Names/numbers of previous coordinators (coordinator may change during contract)
            </p>
            <div className="rounded-lg border border-gray-300 overflow-hidden bg-[#f2f6ff] p-2">
              <div className="bg-white rounded-md overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="px-2 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] w-[22%]">
                          Name
                        </th>
                        <th className="px-2 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] w-[22%]">
                          Contact Number
                        </th>
                        <th className="px-2 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] w-[28%]">
                          From
                        </th>
                        <th className="px-2 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] w-[28%]">
                          To
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {(poForHistory.contactHistoryLog || []).map((h, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-xs text-gray-900 text-center min-w-0 truncate" title={h.name}>
                            {h.name || '–'}
                          </td>
                          <td className="px-2 py-2 text-xs text-gray-700 text-center min-w-0 font-mono tabular-nums truncate" title={h.number}>
                            {h.number || '–'}
                          </td>
                          <td className="px-2 py-2 text-xs text-gray-700 text-center min-w-0">{h.from || '–'}</td>
                          <td className="px-2 py-2 text-xs text-gray-700 text-center min-w-0">{h.to || 'Current'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setViewHistoryPoId(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactLog;
