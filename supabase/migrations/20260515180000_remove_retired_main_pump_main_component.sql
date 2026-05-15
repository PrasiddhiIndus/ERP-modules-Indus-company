-- Retire mistaken Fire Tender catalog root where a full tender-style ref was stored as `main_component`
-- (e.g. "IFSPL/Ad-X/00001/08-25 - 1Main Pump"). Removes past rows and catalog/price entries.

-- costing_rows (all tenders)
DELETE FROM public.costing_rows
WHERE TRIM(main_component) IN (
  'IFSPL/Ad-X/00001/08-25 - 1Main Pump',
  'IFSPL/Ad-X/00001/08-25 - 1 Main Pump'
)
   OR TRIM(main_component) ~* '^IFSPL/Ad-X/00001/08-25\s*-\s*(\d+Main\s*Pump|\d+\s+Main\s*Pump)$';

-- price_master (if table exists in project)
DELETE FROM public.price_master
WHERE TRIM(main_component) IN (
  'IFSPL/Ad-X/00001/08-25 - 1Main Pump',
  'IFSPL/Ad-X/00001/08-25 - 1 Main Pump'
)
   OR TRIM(main_component) ~* '^IFSPL/Ad-X/00001/08-25\s*-\s*(\d+Main\s*Pump|\d+\s+Main\s*Pump)$';

-- main_components tree rows for that root
DELETE FROM public.main_components
WHERE TRIM(main_component) IN (
  'IFSPL/Ad-X/00001/08-25 - 1Main Pump',
  'IFSPL/Ad-X/00001/08-25 - 1 Main Pump'
)
   OR TRIM(main_component) ~* '^IFSPL/Ad-X/00001/08-25\s*-\s*(\d+Main\s*Pump|\d+\s+Main\s*Pump)$';
