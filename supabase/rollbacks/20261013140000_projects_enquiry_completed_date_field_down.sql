-- Rollback: remove the Completed Date field from the form and register.
-- Dates already saved on enquiries are kept.

delete from projects.enquiry_field_definitions where field_key = 'completed_on';
