-- Discriminator for IFSPL Employee Master list (in-house vs other sources).
-- Existing rows stay in-house. Display screens can filter without changing save logic.

alter table public.admin_ifsp_employee_master
  add column if not exists employee_type text not null default 'in_house';

alter table public.admin_ifsp_employee_master
  drop constraint if exists admin_ifsp_employee_master_employee_type_check;

alter table public.admin_ifsp_employee_master
  add constraint admin_ifsp_employee_master_employee_type_check
  check (employee_type in ('in_house', 'site'));

comment on column public.admin_ifsp_employee_master.employee_type is
  'in_house | site — IFSPL In-house Employee Master displays in_house only.';

create index if not exists admin_ifsp_employee_master_employee_type_idx
  on public.admin_ifsp_employee_master (employee_type);
