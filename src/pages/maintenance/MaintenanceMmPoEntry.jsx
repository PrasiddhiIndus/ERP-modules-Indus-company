import React from 'react';
import { BillingProvider, useBilling } from '../../contexts/BillingContext';
import { COMMERCIAL_MODULE_RM_MM_AMC_IEV } from '../../constants/commercialModuleType';
import { MAINTENANCE_MM_PO_APPROVER_MODULE_KEYS } from '../../config/roles';
import POEntry from '../commercial-rm-mm-amc-iev/POEntry';

/**
 * Maintenance → M&M PO Entry
 * Same Commercial R&M / AMC / IEV PO workflow, scoped to M&M only.
 */
const MaintenanceMmPoInner = () => {
  const { billingError, clearBillingError, commercialPOs, setCommercialPOs, setInvoices } = useBilling();

  return (
    <div className="min-h-screen bg-gray-50">
      {billingError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-2">
          <p className="text-sm text-amber-800">{billingError}</p>
          <button type="button" onClick={clearBillingError} className="text-amber-700 hover:text-amber-900 font-medium">
            Dismiss
          </button>
        </div>
      )}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">M&amp;M PO Entry</h1>
          <p className="text-gray-600 mt-1">
            Purchase order / work order entry for M&amp;M only (same contract records as Commercial PO Entry; vertical is always M&amp;M).
          </p>
        </div>
      </div>
      <div className="flex-1">
        <POEntry
          commercialPOs={commercialPOs}
          setCommercialPOs={setCommercialPOs}
          setInvoices={setInvoices}
          fixedVertical="M&M"
          moduleType={COMMERCIAL_MODULE_RM_MM_AMC_IEV}
          approverModuleKeys={MAINTENANCE_MM_PO_APPROVER_MODULE_KEYS}
        />
      </div>
    </div>
  );
};

const MaintenanceMmPoEntry = () => (
  <BillingProvider commercialModuleScope={COMMERCIAL_MODULE_RM_MM_AMC_IEV}>
    <MaintenanceMmPoInner />
  </BillingProvider>
);

export default MaintenanceMmPoEntry;
