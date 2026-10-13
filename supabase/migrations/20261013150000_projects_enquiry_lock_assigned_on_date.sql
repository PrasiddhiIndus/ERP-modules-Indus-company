-- Enquiry Master: once an enquiry's "Assigned on Date" is saved it cannot be changed.
-- Updates keep the stored value instead of failing, so other edits still save.

create or replace function projects.enquiries_keep_assigned_on_date()
returns trigger
language plpgsql
set search_path = projects, pg_temp
as $$
begin
  if coalesce(btrim(old.data->>'assigned_on_date'), '') <> ''
     and (new.data->>'assigned_on_date') is distinct from (old.data->>'assigned_on_date') then
    new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{assigned_on_date}', old.data->'assigned_on_date', true);
  end if;
  return new;
end;
$$;

drop trigger if exists enquiries_keep_assigned_on_date on projects.enquiries;
create trigger enquiries_keep_assigned_on_date
  before update on projects.enquiries
  for each row
  execute function projects.enquiries_keep_assigned_on_date();
