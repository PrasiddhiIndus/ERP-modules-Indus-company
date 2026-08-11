-- Activity log: promote module + record_ref for filter/search.
-- Details jsonb remains the full payload; these columns are indexed projections.

alter table public.erp_activity_log
  add column if not exists module text null;

alter table public.erp_activity_log
  add column if not exists record_ref text null;

create index if not exists erp_activity_log_module_idx
  on public.erp_activity_log (module);

create index if not exists erp_activity_log_record_ref_idx
  on public.erp_activity_log (record_ref);

create index if not exists erp_activity_log_module_created_at_idx
  on public.erp_activity_log (module, created_at desc);

comment on column public.erp_activity_log.module is
  'Human module label from route (e.g. Billing · Create invoice); used for drawer filters.';

comment on column public.erp_activity_log.record_ref is
  'Short business reference (invoice #, PO #, employee code) for search/display.';
