-- Commercial Manpower / Training PO Entry: duty pattern, fire tender, reliever scope,
-- monthly value (TCV ÷ years × 12), and document attachment metadata.

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS duty_pattern text,
  ADD COLUMN IF NOT EXISTS custom_duty_pattern text,
  ADD COLUMN IF NOT EXISTS with_fire_tender boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reliever_scope text,
  ADD COLUMN IF NOT EXISTS monthly_value numeric(18, 2),
  ADD COLUMN IF NOT EXISTS po_copy_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scope_of_work_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS penalty_clause_files jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN billing.po_wo.duty_pattern IS 'Manpower duty pattern (preset or Custom).';
COMMENT ON COLUMN billing.po_wo.custom_duty_pattern IS 'Free-text duty pattern when duty_pattern is Custom.';
COMMENT ON COLUMN billing.po_wo.with_fire_tender IS 'Whether the PO includes fire tender.';
COMMENT ON COLUMN billing.po_wo.reliever_scope IS 'Reliever scope: In IFSPL scope | In inclusive instrength.';
COMMENT ON COLUMN billing.po_wo.monthly_value IS 'Monthly value = total_contract_value ÷ (contract duration years × 12).';
COMMENT ON COLUMN billing.po_wo.po_copy_files IS 'JSON array of PO copy attachments {name,size,type,path}.';
COMMENT ON COLUMN billing.po_wo.scope_of_work_files IS 'JSON array of scope-of-work attachments {name,size,type,path}.';
COMMENT ON COLUMN billing.po_wo.penalty_clause_files IS 'JSON array of penalty-clause attachments {name,size,type,path}.';
