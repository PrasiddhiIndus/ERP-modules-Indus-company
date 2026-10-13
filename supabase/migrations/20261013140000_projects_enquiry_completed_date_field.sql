-- Enquiry Master: "Completed Date" date picker on Add Enquiry, the edit panel and the register.
-- Stored as data.completed_on (already used to detect enquiries completed after their target date).

insert into projects.enquiry_field_definitions (
  field_key, label, field_type, section, show_in_entry, show_in_database,
  read_only, required, sort_order, entry_hint, default_value, dropdown_kind_id
) values (
  'completed_on', 'Completed Date', 'date', 'assignment', true, true,
  false, false, 125, 'Date the enquiry was completed', null, null
)
on conflict (field_key) do nothing;
