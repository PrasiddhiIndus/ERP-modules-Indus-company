-- Quotation Master: "Order Converted Date" from the Offer Database sheet.
-- Additive / idempotent. Nullable — existing rows and save paths are unaffected.

alter table projects.quotations
  add column if not exists order_converted_date date;

comment on column projects.quotations.order_converted_date is
  'Date the offer converted to an order (Offer Database sheet "Order Coverted Date"); drives the Quarter column.';

notify pgrst, 'reload schema';
