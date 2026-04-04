-- Prevent duplicate rate-category rows per PO by enforcing unique order per PO.
-- Also remove current duplicate rows before adding the unique index.

DELETE FROM billing.po_rate_category a
USING billing.po_rate_category b
WHERE a.po_id = b.po_id
  AND COALESCE(a.sort_order, 0) = COALESCE(b.sort_order, 0)
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_po_rate_category_po_sort
  ON billing.po_rate_category(po_id, sort_order);

