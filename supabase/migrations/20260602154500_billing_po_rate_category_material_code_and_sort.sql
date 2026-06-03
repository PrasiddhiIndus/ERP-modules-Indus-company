-- Ensure Commercial PO rate rows support material-code based billing lines.
-- Safe on old/new DBs: creates missing columns and backfills legacy SAC/HSN.

alter table billing.po_rate_category
  add column if not exists hsn_sac text,
  add column if not exists material_code text,
  add column if not exists category_penalty numeric not null default 0,
  add column if not exists sort_order integer not null default 0;

do $$
begin
  -- If older DB has sac_hsn but hsn_sac is null, copy values forward.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'billing'
      and table_name = 'po_rate_category'
      and column_name = 'sac_hsn'
  ) then
    execute $sql$
      update billing.po_rate_category
      set hsn_sac = sac_hsn
      where hsn_sac is null
        and sac_hsn is not null
    $sql$;
  end if;
end $$;

-- If older rows have default sort_order=0 duplicates per PO, re-sequence once.
with ranked as (
  select
    ctid,
    row_number() over (
      partition by po_id
      order by coalesce(sort_order, 0), created_at nulls first, ctid
    ) - 1 as seq
  from billing.po_rate_category
)
update billing.po_rate_category t
set sort_order = r.seq
from ranked r
where t.ctid = r.ctid
  and coalesce(t.sort_order, -1) <> r.seq;

create unique index if not exists po_rate_category_po_id_sort_order_uniq
  on billing.po_rate_category (po_id, sort_order);

comment on column billing.po_rate_category.hsn_sac is
  'Combined SAC/HSN code captured per PO rate category and copied to invoice line items.';

comment on column billing.po_rate_category.material_code is
  'Optional material code per PO rate category (used when material-code billing is enabled).';
