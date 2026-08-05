-- Seed Indian states/UTs into Calling Master Home State + Working State dropdowns.
-- Safe to re-run: skips labels that already exist (case-insensitive).

with indian_states(label, sort_order) as (
  values
    ('Andhra Pradesh', 1),
    ('Arunachal Pradesh', 2),
    ('Assam', 3),
    ('Bihar', 4),
    ('Chhattisgarh', 5),
    ('Goa', 6),
    ('Gujarat', 7),
    ('Haryana', 8),
    ('Himachal Pradesh', 9),
    ('Jharkhand', 10),
    ('Karnataka', 11),
    ('Kerala', 12),
    ('Madhya Pradesh', 13),
    ('Maharashtra', 14),
    ('Manipur', 15),
    ('Meghalaya', 16),
    ('Mizoram', 17),
    ('Nagaland', 18),
    ('Odisha', 19),
    ('Punjab', 20),
    ('Rajasthan', 21),
    ('Sikkim', 22),
    ('Tamil Nadu', 23),
    ('Telangana', 24),
    ('Tripura', 25),
    ('Uttar Pradesh', 26),
    ('Uttarakhand', 27),
    ('West Bengal', 28),
    ('Andaman and Nicobar Islands', 29),
    ('Chandigarh', 30),
    ('Dadra and Nagar Haveli and Daman and Diu', 31),
    ('Delhi', 32),
    ('Jammu and Kashmir', 33),
    ('Ladakh', 34),
    ('Lakshadweep', 35),
    ('Puducherry', 36)
),
masters(master_key) as (
  values
    ('homeState'),
    ('workingState')
)
insert into public.hr_calling_dropdown_options (master_key, label, sort_order, is_active)
select
  m.master_key,
  s.label,
  s.sort_order,
  true
from masters m
cross join indian_states s
where not exists (
  select 1
  from public.hr_calling_dropdown_options existing
  where existing.master_key = m.master_key
    and lower(btrim(existing.label)) = lower(btrim(s.label))
    and existing.is_active = true
);
