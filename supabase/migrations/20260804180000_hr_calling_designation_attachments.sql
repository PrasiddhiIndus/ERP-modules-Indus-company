-- Calling Master: designation dropdown master, attachments jsonb, stricter phone/height checks.

insert into public.hr_calling_dropdown_masters (master_key, label, description, sort_order)
values (
  'designation',
  'Designation',
  'Candidate designation / role options',
  65
)
on conflict (master_key) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.hr_calling_candidates
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.hr_calling_candidates.attachments is
  'JSON array of uploaded file metadata: filePath (R2 object key), objectKey, bucket, fileName, contentType, uploadedAt.';

-- Height: whole centimetres only (no decimals).
alter table public.hr_calling_candidates
  drop constraint if exists hr_calling_candidates_height_check;

alter table public.hr_calling_candidates
  alter column height_cm type integer
  using case
    when height_cm is null then null
    else round(height_cm)::integer
  end;

alter table public.hr_calling_candidates
  add constraint hr_calling_candidates_height_check
  check (height_cm is null or (height_cm >= 0 and height_cm <= 300));

-- Mobile: exactly 10 digits for active calling records.
alter table public.hr_calling_candidates
  drop constraint if exists hr_calling_candidates_phone_format_check;

alter table public.hr_calling_candidates
  add constraint hr_calling_candidates_phone_format_check
  check (phone_number ~ '^[0-9]{10}$');
