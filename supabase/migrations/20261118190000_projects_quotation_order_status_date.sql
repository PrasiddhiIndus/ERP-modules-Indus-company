-- Quotation Master: "Order Converted Date" becomes "Order Status Date".
--   * Same column (projects.quotations.order_converted_date) — no data is moved or renamed,
--     so imports, the dashboard and existing rows keep working.
--   * The date is stamped automatically (today, IST) whenever offer_status changes, on every
--     path: Quotation Master edit, Board, detail drawer, Make a Quotation save, and the
--     Order Lost L1 approval (projects.decide_quotation_order_lost).
--   * If the same update sets the date explicitly, that value is kept.
--   * The Quarter / FY shown for Order Converted offers is computed from this date in the app.
-- Rollback: supabase/rollbacks/20261118190000_projects_quotation_order_status_date_down.sql

comment on column projects.quotations.order_converted_date is
  'Order Status Date: set automatically whenever offer_status changes. For Order Converted offers it is the conversion date and drives the financial quarter (Q1 Apr–Jun … Q4 Jan–Mar).';

create or replace function projects.quotations_stamp_order_status_date()
returns trigger
language plpgsql
set search_path = projects, public, pg_temp
as $$
begin
  if new.offer_status is distinct from old.offer_status
     and new.order_converted_date is not distinct from old.order_converted_date then
    new.order_converted_date := (now() at time zone 'Asia/Kolkata')::date;
  end if;
  return new;
end;
$$;

revoke all on function projects.quotations_stamp_order_status_date() from public;

drop trigger if exists quotations_stamp_order_status_date on projects.quotations;
create trigger quotations_stamp_order_status_date
  before update of offer_status on projects.quotations
  for each row
  execute function projects.quotations_stamp_order_status_date();

notify pgrst, 'reload schema';
