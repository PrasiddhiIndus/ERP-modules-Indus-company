import React, { createContext, useContext, useState } from 'react';

const initialWopoList = [
  {
    id: 1,
    oc_number: 'IFSPL-BILL-OC-25/26-00001',
    category: 'Fire Tender',
    rates: '₹12,50,000',
    payment_terms: '30% Advance, 70% on Delivery',
    wo_number: 'WO-2025-001',
    client_name: 'ABC Municipal Corp',
    client_address: '123 Main Rd, City - 400001',
    hsn_sac: '9985',
    gst_config: 'GST 18%',
    billing_type: 'Manpower with Fire Tender',
    billing_template: 'Lumpsum Billing',
    start_date: '2025-01-15',
    end_date: '2025-12-31',
    status: 'active',
    approval_status: 'approved',
    wo_quantity: 10,
  },
  {
    id: 2,
    oc_number: 'IFSPL-BILL-OC-25/26-00002',
    category: 'Manpower',
    rates: 'FM: ₹55,000; DCPO: ₹45,000; F Sup: ₹42,000',
    designation_rates: [
      { designation: 'FM', rate: '₹55,000/month' },
      { designation: 'DCPO', rate: '₹45,000/month' },
      { designation: 'F Sup', rate: '₹42,000/month' },
    ],
    payment_terms: 'Monthly',
    wo_number: 'WO-2025-002',
    client_name: 'XYZ Industries',
    client_address: '456 Industrial Area, Mumbai - 400002',
    hsn_sac: '9983',
    gst_config: 'GST 18%',
    billing_type: 'Manpower',
    billing_template: 'Monthly Billing',
    start_date: '2025-02-01',
    end_date: '2025-06-30',
    status: 'active',
    approval_status: 'pending_approval',
    wo_quantity: 5,
  },
  {
    id: 3,
    oc_number: 'IFSPL-BILL-OC-25/26-00003',
    category: 'AMC',
    rates: '₹2,00,000/year',
    payment_terms: 'Quarterly',
    wo_number: 'WO-2024-045',
    client_name: 'State Fire Dept',
    client_address: '789 Govt Complex, Delhi - 110001',
    hsn_sac: '9988',
    gst_config: 'GST 18%',
    billing_type: 'AMC',
    billing_template: 'Monthly Billing',
    start_date: '2024-04-01',
    end_date: '2025-03-31',
    status: 'expiring_soon',
    approval_status: 'approved',
    wo_quantity: 12,
  },
  {
    id: 4,
    oc_number: 'IFSPL-BILL-OC-24/25-00100',
    category: 'Service',
    rates: '₹75,000',
    payment_terms: '100% on Completion',
    wo_number: 'WO-2024-100',
    client_name: 'PQR Ltd',
    client_address: '321 Park St, Pune - 411001',
    hsn_sac: '9986',
    gst_config: 'GST 18%',
    billing_type: 'Service',
    billing_template: 'Lumpsum Billing',
    start_date: '2024-06-01',
    end_date: '2024-12-31',
    status: 'expired',
    approval_status: 'approved',
  },
  {
    id: 5,
    oc_number: 'IFSPL-BILL-OC-25/26-00004',
    category: 'Fire Tender',
    rates: '₹18,00,000',
    payment_terms: '40% Advance, 60% on Commissioning',
    wo_number: 'WO-2025-010',
    client_name: 'Metro Rail Corp',
    client_address: '555 Metro Bhavan, Chennai - 600001',
    hsn_sac: '9985',
    gst_config: 'GST 18%',
    billing_type: 'Manpower with Fire Tender',
    billing_template: 'Monthly Billing',
    start_date: '2025-03-01',
    end_date: '2026-02-28',
    status: 'active',
    approval_status: 'draft',
    wo_quantity: 8,
  },
];

const BillingContext = createContext(null);

// Billing History: cancelled/rejected bills moved here (audit trail – never delete)
// billingAlerts: { id, type: 'po_expiry'|'qty_breach'|'additional_billing', message, oc_number?, bill_number?, severity }
export const BillingProvider = ({ children }) => {
  const [wopoList, setWopoList] = useState(initialWopoList);
  const [quickBillRequests, setQuickBillRequests] = useState([]);
  // bills: id, oc_id, oc_number, client_name, wo_number, billing_template, billing_method?, bill_number, status, items: [{ description, quantity, rate (locked), amount, source_ref }], rate_change_senior_approval?, credit_note_status, attachments: [{ name, type, url }], created_at, site?
  const [bills, setBills] = useState([]);
  const [billingHistory, setBillingHistory] = useState([]);
  const [billingAlerts, setBillingAlerts] = useState([]);

  const value = {
    wopoList,
    setWopoList,
    quickBillRequests,
    setQuickBillRequests,
    bills,
    setBills,
    billingHistory,
    setBillingHistory,
    billingAlerts,
    setBillingAlerts,
  };

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
};

export const useBilling = () => {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error('useBilling must be used within BillingProvider');
  return ctx;
};

export default BillingContext;
