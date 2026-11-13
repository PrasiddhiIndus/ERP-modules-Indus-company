import React from 'react';
import { useBilling } from '../../../contexts/BillingContext';
import { COMMERCIAL_MODULE_PROJECTS } from '../../../constants/commercialModuleType';
import { PROJECTS_PO_APPROVER_MODULE_KEYS } from '../../../config/roles';
import POEntry from '../../commercial-rm-mm-amc-iev/POEntry';

/**
 * Projects — Contract Management · PO/WO to Sub-Coordinator.
 * Renders the Projects PO / WO entry screen (no inner PO Entry / Contact Log tabs).
 */
export default function PoWoSubCoordinator() {
  const { commercialPOs, setCommercialPOs, setInvoices } = useBilling();

  return (
    <POEntry
      commercialPOs={commercialPOs}
      setCommercialPOs={setCommercialPOs}
      setInvoices={setInvoices}
      fixedVertical="Projects"
      moduleType={COMMERCIAL_MODULE_PROJECTS}
      approverModuleKeys={PROJECTS_PO_APPROVER_MODULE_KEYS}
    />
  );
}
