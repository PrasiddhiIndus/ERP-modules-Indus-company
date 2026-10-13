-- Rollback: stop renumbering on delete and restore the original serial behaviour.
-- Serial numbers already renumbered by the migration are kept as they are.

drop trigger if exists enquiries_renumber_after_delete on projects.enquiries;
drop function if exists projects.enquiries_after_delete_renumber();
drop function if exists projects.renumber_enquiry_serials();

drop trigger if exists enquiries_updated_at on projects.enquiries;
create trigger enquiries_updated_at
  before update on projects.enquiries
  for each row execute function public.set_updated_at();

alter table projects.enquiries alter column serial_number set generated always;
