-- PO At Glance: allow multiple Original PO attachments.
-- Keeps po_document_name / po_document_path in sync with the first file for older screens.

alter table public.pj_oc_master
  add column if not exists po_documents jsonb not null default '[]'::jsonb;

comment on column public.pj_oc_master.po_documents is
  'Original PO attachments: [{name, path, uploaded_at}, ...]';

update public.pj_oc_master m
   set po_documents = jsonb_build_array(
         jsonb_build_object(
           'name', coalesce(nullif(btrim(m.po_document_name), ''), 'Purchase order'),
           'path', btrim(m.po_document_path),
           'uploaded_at', to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         )
       )
 where nullif(btrim(coalesce(m.po_document_path, '')), '') is not null
   and (
     m.po_documents is null
     or m.po_documents = '[]'::jsonb
     or jsonb_typeof(m.po_documents) <> 'array'
   );

create or replace function public.pj_oc_sync_po_document_legacy(p_docs jsonb)
returns table (po_document_name text, po_document_path text)
language sql
immutable
as $$
  select
    nullif(btrim(coalesce(p_docs->0->>'name', '')), ''),
    nullif(btrim(coalesce(p_docs->0->>'path', '')), '');
$$;

-- Return type changes from void → jsonb; CREATE OR REPLACE cannot alter that.
drop function if exists public.pj_oc_set_po_document(uuid, text, text);

create or replace function public.pj_oc_set_po_document(p_id uuid, p_name text, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_created uuid;
  v_docs jsonb;
  v_entry jsonb;
  v_legacy record;
begin
  if auth.uid() is null or not public.pj_oc_current_user_has_access() then
    raise exception 'You do not have access to Projects PO At Glance.' using errcode = '42501';
  end if;
  if p_id is null or nullif(btrim(coalesce(p_path, '')), '') is null then
    raise exception 'Choose a purchase order file to upload.' using errcode = 'P0001';
  end if;
  select m.created_by, coalesce(m.po_documents, '[]'::jsonb)
    into v_created, v_docs
  from public.pj_oc_master m
  where m.id = p_id
  for update;
  if not found then
    raise exception 'This PO At Glance could not be found.' using errcode = 'P0001';
  end if;
  if public.pj_oc_user_is_remarks_only(v_created) then
    raise exception 'You can add remarks on this PO. The rest is view only.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(v_docs) <> 'array' then
    v_docs := '[]'::jsonb;
  end if;

  -- Skip duplicate path
  if exists (
    select 1
    from jsonb_array_elements(v_docs) d
    where lower(btrim(coalesce(d->>'path', ''))) = lower(btrim(p_path))
  ) then
    return v_docs;
  end if;

  v_entry := jsonb_build_object(
    'name', coalesce(nullif(btrim(coalesce(p_name, '')), ''), 'Purchase order'),
    'path', btrim(p_path),
    'uploaded_at', to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
  v_docs := v_docs || jsonb_build_array(v_entry);

  select * into v_legacy from public.pj_oc_sync_po_document_legacy(v_docs);

  update public.pj_oc_master
     set po_documents = v_docs,
         po_document_name = v_legacy.po_document_name,
         po_document_path = v_legacy.po_document_path,
         updated_at = now(),
         updated_by = auth.uid()
   where id = p_id;

  return v_docs;
end;
$body$;

create or replace function public.pj_oc_remove_po_document(p_id uuid, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_created uuid;
  v_docs jsonb;
  v_legacy record;
begin
  if auth.uid() is null or not public.pj_oc_current_user_has_access() then
    raise exception 'You do not have access to Projects PO At Glance.' using errcode = '42501';
  end if;
  if p_id is null or nullif(btrim(coalesce(p_path, '')), '') is null then
    raise exception 'Choose which purchase order file to remove.' using errcode = 'P0001';
  end if;
  select m.created_by, coalesce(m.po_documents, '[]'::jsonb)
    into v_created, v_docs
  from public.pj_oc_master m
  where m.id = p_id
  for update;
  if not found then
    raise exception 'This PO At Glance could not be found.' using errcode = 'P0001';
  end if;
  if public.pj_oc_user_is_remarks_only(v_created) then
    raise exception 'You can add remarks on this PO. The rest is view only.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(v_docs) <> 'array' then
    v_docs := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(d), '[]'::jsonb)
    into v_docs
  from jsonb_array_elements(v_docs) d
  where lower(btrim(coalesce(d->>'path', ''))) is distinct from lower(btrim(p_path));

  select * into v_legacy from public.pj_oc_sync_po_document_legacy(v_docs);

  update public.pj_oc_master
     set po_documents = v_docs,
         po_document_name = v_legacy.po_document_name,
         po_document_path = v_legacy.po_document_path,
         updated_at = now(),
         updated_by = auth.uid()
   where id = p_id;

  return v_docs;
end;
$body$;

create or replace function public.pj_oc_clear_po_document(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_created uuid;
begin
  if auth.uid() is null or not public.pj_oc_current_user_has_access() then
    raise exception 'You do not have access to Projects PO At Glance.' using errcode = '42501';
  end if;
  select m.created_by into v_created from public.pj_oc_master m where m.id = p_id;
  if not found then
    raise exception 'This PO At Glance could not be found.' using errcode = 'P0001';
  end if;
  if public.pj_oc_user_is_remarks_only(v_created) then
    raise exception 'You can add remarks on this PO. The rest is view only.' using errcode = 'P0001';
  end if;
  update public.pj_oc_master
     set po_documents = '[]'::jsonb,
         po_document_name = null,
         po_document_path = null,
         updated_at = now(),
         updated_by = auth.uid()
   where id = p_id;
end;
$body$;

revoke all on function public.pj_oc_sync_po_document_legacy(jsonb) from public;
revoke all on function public.pj_oc_set_po_document(uuid, text, text) from public, anon;
revoke all on function public.pj_oc_remove_po_document(uuid, text) from public, anon;
revoke all on function public.pj_oc_clear_po_document(uuid) from public, anon;

grant execute on function public.pj_oc_set_po_document(uuid, text, text) to authenticated, service_role;
grant execute on function public.pj_oc_remove_po_document(uuid, text) to authenticated, service_role;
grant execute on function public.pj_oc_clear_po_document(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
