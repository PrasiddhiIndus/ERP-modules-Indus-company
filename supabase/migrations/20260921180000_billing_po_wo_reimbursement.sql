-- Commercial Manpower PO: optional reimbursement category on PO / Financials.

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS reimbursement_type text,
  ADD COLUMN IF NOT EXISTS reimbursement_other text;

COMMENT ON COLUMN billing.po_wo.reimbursement_type IS
  'Manpower PO reimbursement category (gratuity, bonus, nh_ph, arrears, pf_esic, accommodation, transportation, other).';
COMMENT ON COLUMN billing.po_wo.reimbursement_other IS
  'Free-text reimbursement detail when reimbursement_type is other.';
