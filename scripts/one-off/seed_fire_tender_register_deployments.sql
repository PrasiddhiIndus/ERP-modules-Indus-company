-- Fire Tender Management register seed (deployments from commercial register).
-- Matches fleet by normalized registration_number (A-Z0-9 only).
-- Skips rows with no usable reg / not in fleet master.
-- Safe to re-run: updates master; inserts Active fire-tender trip only when none exists;
-- parked rows are set Available/Out for Repair/Under Maintenance at Indus House.

DO $$
DECLARE
  v_user uuid;
BEGIN
  SELECT t.user_id INTO v_user
  FROM public.operations_fire_tender_vehicle_trips t
  WHERE t.user_id IS NOT NULL
  LIMIT 1;

  IF v_user IS NULL THEN
    SELECT m.user_id INTO v_user
    FROM public.operations_fire_tender_vehicle_master m
    WHERE m.user_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No user_id available to stamp trips';
  END IF;

  CREATE TEMP TABLE tmp_ft_register (
    sr int PRIMARY KEY,
    description text,
    registration_raw text,
    make_mon_yy text,
    ownership text,
    deployment text,
    schedule text,
    fuel_scope text
  ) ON COMMIT DROP;

  INSERT INTO tmp_ft_register (sr, description, registration_raw, make_mon_yy, ownership, deployment, schedule, fuel_scope) VALUES
  (1,  'Multi-Purpose Fire Tender (Purchased from JPL)', 'GJ 06 JF 3716', 'Nov-08', 'IFSPL', 'Star Fire - Barmer Rajasthan', 'Contract Up to 20.12.2026', 'Diesel Filling /Top up of firefighting media is in Client''s scope.'),
  (2,  'QRV (RHINO - 2)', 'GJ 06 JF 2924', 'Nov-20', 'IFSPL', 'Star Fire - Mumbai', 'Contract Up to 21.04.2027', 'Diesel Filling /Top up of firefighting media is in Client''s scope.'),
  (3,  'Mercedes Benz', 'GJ 06 AX 1044', 'Oct-09', 'IFSPL', 'Reliance - VCD', 'Contract up to 30.04.2027', 'Diesel Filling /Top up of firefighting media is in Client''s scope'),
  (4,  'Multi-Purpose Fire Tender', 'Newly Fabricated Fire Tender', 'Mar-26', 'IFSPL', 'Sajjan India Limited-Ankleshwar', 'Contract up to 31.03.2027', 'Diesel Filling /Top up of firefighting media is in Client''s scope'),
  (5,  'Bharat Benz Fire Foam Tender', 'GJ 06 AX 6253', 'Apr-17', 'QFS', 'Iscon Balaji Food Pvt Ltd - Himmatnagar', 'Contract Up to 31.07.2027', 'Diesel Filling /Top up of firefighting media is in Client''s scope'),
  (6,  'Bharat Benz Fire Foam Tender', 'GJ 06 AX 6275', 'Jan-17', 'IEVPL', 'Iscon Balaji Food Pvt Ltd - Himmatnagar', 'Contract Up to 31.07.2027', 'Diesel Filling /Top up of firefighting media is in Client''s scope'),
  (7,  'Multi-Purpose Fire Tender (Purchased from CFCL)', 'RJ 20 EA 1000', 'Nov-10', 'IFSPL', 'Iscon Balaji Food Pvt Ltd - Limbasi', 'Contract Up to 31.07.2027', 'Diesel Filling /Top up of firefighting media is in Client''s scope'),
  (8,  'Multipurpose fire tender', 'GJ 05 BT 1840', 'Jan-23', 'Agniman Corporation', 'Iscon Balaji Food Pvt Ltd - Limbasi', 'Contract Up to 31.07.2027', 'Diesel Filling /Top up of firefighting media is in Client''s scope'),
  (9,  'Multi-Purpose Fire Tender', 'GJ 05 BU 5936', 'May-14', 'AGNIMAN', 'Iscon Balaji Food Pvt Ltd - Kanjari', 'Contract Up to 31.07.2027', 'Diesel Filling /Top up of firefighting media is in Client''s scope'),
  (10, 'Multi-Purpose Fire Tender (Purchased from CFCL)', 'GJ 06 BX 4161', 'Mar-12', 'IFSPL', 'Iscon Balaji Food Pvt Ltd - Patan', 'Contract Up to 16.12.2026', 'Diesel Filling /Top up of firefighting media is in Client''s scope'),
  (11, 'Multi-Purpose Fire Tender', 'Newly Fabricated Fire Tender', 'Jan-26', 'IFSPL', 'Iscon Balaji Food Pvt Ltd - Patan', 'Contract Up to 16.12.2026', 'Diesel Filling /Top up of firefighting media is in Client''s scope'),
  (12, 'Multi-Purpose Fire Tender', 'GJ 06 JF 2067', 'Jun-20', 'IFSPL', 'NFIL- Dahej', 'Contract Up to 30.09.2026', 'Diesel Filling arrangement in our scope & monthly reimbursement from client at actual'),
  (13, 'Foam Tender', 'GJ 06 JF 2033', 'Jun-20', 'IFSPL', 'Vedanta viramgam (under contract of SOPAN)', 'Contract up to 30.09.2026', 'Diesel Filling is in the Client''s scope. Reimbursable basis'),
  (14, 'Multi-Purpose Fire Tender', 'GJ 06 JF 2236', 'Feb-21', 'IFSPL', 'GMDC - Akrimota', 'Contract Up to 31.08.2028', 'Diesel filling in our scope'),
  (15, 'Multipurpose Fire Tender', 'GJ 06 JF 3487', 'Aug-23', 'IFSPL', 'GMDC - Akrimota', 'Contract Up to 31.08.2028', 'Diesel filling in our scope'),
  (16, 'Multi-Purpose Fire Tender', 'GJ 06 YY 7422', 'Apr-11', 'IFSPL', 'Safe enviro (DTOX) Jambusar', 'Contract up to 07.01.2027', 'Diesel Filling is in Client''s scope'),
  (17, 'Foam Tender', 'GJ 06 JF 1655', 'Jun-19', 'IFSPL', 'Sambhav Steel ltd', 'Contract Up to 31.03.2027', 'Fuel is in client scope'),
  (18, 'Multi-Purpose Fire Tender', 'GJ 06 JF 3304', 'Dec-22', 'IFSPL', 'Indian Navy - Ghatkopar', 'Contract up to 30.11.2026', 'Diesel Filling up to 90 litter /Month per vehicle will be in our scope.'),
  (19, 'Multipurpose fire tender', 'GJ 16 AY 6594', 'Jan-26', 'Delhi fire', 'Indian Navy – Ghatkopar', 'Contract up to 30.11.2026', 'Diesel Filling up to 90 litter /Month per vehicle will be in our scope.'),
  (20, 'Multi-Purpose Fire Tender', 'GJ 06 JF 3629', 'Apr-24', 'IFSPL', 'Durga Fire - Saykha', 'Contract up to 31.03.2027', 'Diesel Filling is in the Client''s scope. Reimbursable basis'),
  (21, 'Multi-Purpose Fire Tender', 'HR 69 F 2766', 'Jan-25', 'Delhi fire', 'Jubilant Bharuch', 'Contract up to 31.03.2027', 'Diesel Filling is in the Client''s scope.'),
  (22, 'Multi-Purpose Fire Tender', 'GJ 06 JF 3760', 'Apr-24', 'IFSPL', 'Jubilant Savli', 'Contract up to 31.03.2027', 'Diesel Filling is in the Client''s scope.'),
  (23, 'Multipurpose fire tender', 'GJ 16 X 9467', 'Oct-10', 'IFSPL (Old FT purchased from Jubilant Vilayat)', 'Balrampur Chini Mills', 'Contract Up to 08.09.2026', 'Diesel Filling is in Client''s scope.'),
  (24, 'Multipurpose fire tender', 'GJ06 BY 2355', 'Dec-25', 'QFS', 'Combat Aviation under contract of beniwal fuel and fire solution Nashik', 'Contract Up to 31.08.2026', 'Diesel Filling is in Client''s scope.'),
  (25, 'Multipurpose fire tender', 'HR 61 F 8769', 'Feb-25', 'Cosmos', 'Auro Infra - Chandrapur', 'Contract Up to 30.04.2027', 'Diesel Filling is in Client''s scope.'),
  (26, 'Multipurpose fire tender', 'GJ06BX9382', 'Jul-25', 'IFSPL', 'HOCL-Kochi', 'Contract Up to 30.06.2030', 'Diesel Filling is in Client''s scope.'),
  (27, 'Multi-Purpose Fire Tender', 'GJ 06 JF 1981', 'Nov-18', 'IFSPL', 'Cosmos Fire- Ahmedabad', 'Contract Up to 30.11.2026', 'Diesel Filling is in Client''s scope.'),
  (28, 'Multipurpose fire tender', 'GJ 06 BY 2471', 'Nov-25', 'IFSPL', 'HZL Debari', 'Contract up to 30.09.2026', 'Diesel up to 500 KM will be in our scope.'),
  (29, 'Multi-Purpose Fire Tender', 'GJ16 AY 5342', 'Dec-25', 'Emergency Fire Services', 'L & T - Kutch', 'Contract Up to 10.08.2026', 'Diesel Filling is in Client''s scope.'),
  (30, 'Water Mist (Fabricated for GAIL)', 'GJ 06 JF 2286', 'Nov-20', 'IFSPL', 'Rochling Industrial India- Savli', 'Contract Up to 30.11.2026', 'Diesel Filling /Top up of firefighting media is in Client''s scope'),
  (31, 'Multi-Purpose Fire Tender', 'GJ 06 AX 0577', 'Jan-16', 'IFSPL', 'Reliance - Karjat', 'Contract Up to 15.11.2026', 'Diesel filling in our scope'),
  (32, 'Multi-Purpose Fire Tender', 'GJ 06 AV 8779', 'Feb-15', 'IFSPL', 'Birla Copper - Pakhajan', 'Contract up to 09.03.2027', 'Diesel Filling /Top up of firefighting media is in Client''s scope.'),
  (33, 'Multipurpose fire tender', 'HR 63 E 5784', 'Nov-22', 'Delhi fire', 'Parked at Indus House (Breakdown condition)', NULL, NULL),
  (34, 'Multi-Purpose Fire Tender', NULL, 'Jan-23', 'QFS', 'Parked at Indus House', NULL, NULL),
  (35, 'Multi-Purpose Fire Tender', 'GJ 16 U 9997', NULL, 'IFSPL - Buyback from GIDC panoli', 'Parked at Indus House', NULL, NULL),
  (36, 'Multi-Purpose Fire Tender - (Purchased from GIDC Vapi)', 'Old Fire Tender purchased from GIDC Vapi', NULL, 'IFSPL', 'Parked at Indus House', NULL, NULL),
  (37, 'Multi-Purpose Fire Tender', 'HR-63-E-7193', 'Mar-22', 'Delhi fire', 'Parked at Indus House (Painting Work)', NULL, NULL),
  (38, 'Multi-Purpose Fire Tender (Purchased from CFCL)', 'GJ 06 JF 1197', 'Dec-93', 'IFSPL', 'Parked at Indus House', NULL, NULL),
  (39, 'QRV (RHINO - 1)', 'GJ 06 JF 3334', 'Apr-22', 'IFSPL', 'Parked at Indus House', NULL, NULL);

  -- Report missing (run this SELECT alone anytime after creating the temp table)
  RAISE NOTICE 'Missing / skipped vehicles:';
  PERFORM 1 FROM (
    SELECT r.sr, COALESCE(r.registration_raw, '(blank)') AS registration_raw, r.description
    FROM tmp_ft_register r
    LEFT JOIN public.operations_fire_tender_vehicle_master m
      ON upper(regexp_replace(COALESCE(m.registration_number, ''), '[^A-Za-z0-9]', '', 'g'))
       = upper(regexp_replace(COALESCE(r.registration_raw, ''), '[^A-Za-z0-9]', '', 'g'))
     AND upper(regexp_replace(COALESCE(r.registration_raw, ''), '[^A-Za-z0-9]', '', 'g'))
         ~ '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$'
    WHERE m.id IS NULL
    ORDER BY r.sr
  ) miss;

  -- Apply matched rows via helper CTE logic
  WITH parsed AS (
    SELECT
      r.*,
      upper(regexp_replace(COALESCE(r.registration_raw, ''), '[^A-Za-z0-9]', '', 'g')) AS reg_norm,
      CASE
        WHEN r.make_mon_yy ~ '^[A-Za-z]{3}-[0-9]{2}$' THEN
          CASE lower(split_part(r.make_mon_yy, '-', 1))
            WHEN 'jan' THEN 1 WHEN 'feb' THEN 2 WHEN 'mar' THEN 3 WHEN 'apr' THEN 4
            WHEN 'may' THEN 5 WHEN 'jun' THEN 6 WHEN 'jul' THEN 7 WHEN 'aug' THEN 8
            WHEN 'sep' THEN 9 WHEN 'oct' THEN 10 WHEN 'nov' THEN 11 WHEN 'dec' THEN 12
          END
      END AS make_month,
      CASE
        WHEN r.make_mon_yy ~ '^[A-Za-z]{3}-[0-9]{2}$' THEN
          CASE WHEN split_part(r.make_mon_yy, '-', 2)::int >= 90
            THEN 1900 + split_part(r.make_mon_yy, '-', 2)::int
            ELSE 2000 + split_part(r.make_mon_yy, '-', 2)::int
          END
      END AS make_year,
      (regexp_match(COALESCE(r.schedule, ''), '([0-9]{1,2})\.([0-9]{1,2})\.([0-9]{4})')) AS contract_parts,
      lower(COALESCE(r.deployment, '')) LIKE '%parked at indus house%' AS is_parked,
      lower(COALESCE(r.deployment, '')) LIKE '%breakdown%' AS is_breakdown,
      lower(COALESCE(r.deployment, '')) LIKE '%painting%' AS is_painting
    FROM tmp_ft_register r
  ),
  matched AS (
    SELECT
      p.*,
      m.id AS vehicle_id,
      CASE
        WHEN position(' - ' in COALESCE(p.deployment, '')) > 0
          THEN split_part(p.deployment, ' - ', 1)
        ELSE NULLIF(trim(p.deployment), '')
      END AS dep_location,
      CASE
        WHEN position(' - ' in COALESCE(p.deployment, '')) > 0
          THEN NULLIF(trim(substr(p.deployment, position(' - ' in p.deployment) + 3)), '')
        ELSE NULLIF(trim(p.deployment), '')
      END AS dep_site,
      CASE
        WHEN p.contract_parts IS NOT NULL THEN
          make_date(p.contract_parts[3]::int, p.contract_parts[2]::int, p.contract_parts[1]::int)
      END AS contract_end,
      CASE
        WHEN lower(COALESCE(p.fuel_scope, '')) LIKE '%our scope%' THEN 'Indus'
        WHEN lower(COALESCE(p.fuel_scope, '')) LIKE '%client%' THEN 'Client'
      END AS fuel_tag,
      CASE
        WHEN lower(COALESCE(p.fuel_scope, '')) LIKE '%firefighting media%'
         AND lower(COALESCE(p.fuel_scope, '')) LIKE '%client%' THEN 'Client'
      END AS media_tag
    FROM parsed p
    JOIN public.operations_fire_tender_vehicle_master m
      ON upper(regexp_replace(COALESCE(m.registration_number, ''), '[^A-Za-z0-9]', '', 'g')) = p.reg_norm
    WHERE p.reg_norm ~ '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$'
  )
  UPDATE public.operations_fire_tender_vehicle_master m
  SET
    owner_name = matched.ownership,
    remarks = matched.description,
    year_of_manufacture = COALESCE(matched.make_year, m.year_of_manufacture),
    date_of_manufacture = CASE
      WHEN matched.make_year IS NOT NULL AND matched.make_month IS NOT NULL
        THEN lpad(matched.make_month::text, 2, '0') || '-' || matched.make_year::text
      ELSE m.date_of_manufacture
    END,
    assigned_location = CASE
      WHEN matched.is_parked THEN 'Indus House'
      ELSE COALESCE(matched.dep_location, m.assigned_location)
    END,
    assigned_site = CASE
      WHEN matched.is_parked THEN NULL
      ELSE COALESCE(matched.dep_site, m.assigned_site)
    END,
    vehicle_status = CASE
      WHEN matched.is_parked AND matched.is_breakdown THEN 'Out for Repair'
      WHEN matched.is_parked AND matched.is_painting THEN 'Under Maintenance'
      WHEN matched.is_parked THEN 'Available'
      ELSE 'On Duty'
    END
  FROM matched
  WHERE m.id = matched.vehicle_id;

  -- Complete active trips for parked matched vehicles
  UPDATE public.operations_fire_tender_vehicle_trips t
  SET trip_status = 'Completed'
  WHERE t.trip_status = 'Active'
    AND t.assignment_type = 'fire-tender'
    AND t.vehicle_id IN (
      SELECT m.id
      FROM tmp_ft_register r
      JOIN public.operations_fire_tender_vehicle_master m
        ON upper(regexp_replace(COALESCE(m.registration_number, ''), '[^A-Za-z0-9]', '', 'g'))
         = upper(regexp_replace(COALESCE(r.registration_raw, ''), '[^A-Za-z0-9]', '', 'g'))
      WHERE lower(COALESCE(r.deployment, '')) LIKE '%parked at indus house%'
        AND upper(regexp_replace(COALESCE(r.registration_raw, ''), '[^A-Za-z0-9]', '', 'g'))
            ~ '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$'
    );

  INSERT INTO public.operations_fire_tender_vehicle_trips (
    assignment_type, vehicle_id, trip_purpose, trip_status,
    deployment_location, site_name, origin_location, destination_location,
    date_of_mobilisation, start_date_time, contract_start_date, contract_end_date, end_date_time,
    notes, user_id, expense_attachments
  )
  SELECT
    'fire-tender',
    matched.vehicle_id,
    'Fire Tender Vehicle Assignment',
    'Active',
    matched.dep_location,
    matched.dep_site,
    matched.dep_location,
    matched.dep_site,
    COALESCE(matched.contract_end - 30, CURRENT_DATE),
    (COALESCE(matched.contract_end - 30, CURRENT_DATE)::text || 'T00:00:00+05:30')::timestamptz,
    COALESCE(matched.contract_end - 30, CURRENT_DATE),
    matched.contract_end,
    CASE WHEN matched.contract_end IS NOT NULL
      THEN (matched.contract_end::text || 'T00:00:00+05:30')::timestamptz
    END,
    CASE
      WHEN matched.fuel_tag IS NULL AND matched.media_tag IS NULL THEN matched.fuel_scope
      WHEN COALESCE(matched.fuel_scope, '') = '' THEN
        'Scope — Fuel: ' || COALESCE(matched.fuel_tag, '—') || ' | Media: ' || COALESCE(matched.media_tag, '—')
      ELSE matched.fuel_scope || E'\nScope — Fuel: ' || COALESCE(matched.fuel_tag, '—') || ' | Media: ' || COALESCE(matched.media_tag, '—')
    END,
    v_user,
    NULL
  FROM (
    SELECT
      r.*,
      upper(regexp_replace(COALESCE(r.registration_raw, ''), '[^A-Za-z0-9]', '', 'g')) AS reg_norm,
      m.id AS vehicle_id,
      CASE
        WHEN position(' - ' in COALESCE(r.deployment, '')) > 0 THEN split_part(r.deployment, ' - ', 1)
        ELSE NULLIF(trim(r.deployment), '')
      END AS dep_location,
      CASE
        WHEN position(' - ' in COALESCE(r.deployment, '')) > 0
          THEN NULLIF(trim(substr(r.deployment, position(' - ' in r.deployment) + 3)), '')
        ELSE NULLIF(trim(r.deployment), '')
      END AS dep_site,
      CASE
        WHEN (regexp_match(COALESCE(r.schedule, ''), '([0-9]{1,2})\.([0-9]{1,2})\.([0-9]{4})')) IS NOT NULL THEN
          make_date(
            (regexp_match(r.schedule, '([0-9]{1,2})\.([0-9]{1,2})\.([0-9]{4})'))[3]::int,
            (regexp_match(r.schedule, '([0-9]{1,2})\.([0-9]{1,2})\.([0-9]{4})'))[2]::int,
            (regexp_match(r.schedule, '([0-9]{1,2})\.([0-9]{1,2})\.([0-9]{4})'))[1]::int
          )
      END AS contract_end,
      CASE
        WHEN lower(COALESCE(r.fuel_scope, '')) LIKE '%our scope%' THEN 'Indus'
        WHEN lower(COALESCE(r.fuel_scope, '')) LIKE '%client%' THEN 'Client'
      END AS fuel_tag,
      CASE
        WHEN lower(COALESCE(r.fuel_scope, '')) LIKE '%firefighting media%'
         AND lower(COALESCE(r.fuel_scope, '')) LIKE '%client%' THEN 'Client'
      END AS media_tag
    FROM tmp_ft_register r
    JOIN public.operations_fire_tender_vehicle_master m
      ON upper(regexp_replace(COALESCE(m.registration_number, ''), '[^A-Za-z0-9]', '', 'g'))
       = upper(regexp_replace(COALESCE(r.registration_raw, ''), '[^A-Za-z0-9]', '', 'g'))
    WHERE upper(regexp_replace(COALESCE(r.registration_raw, ''), '[^A-Za-z0-9]', '', 'g'))
          ~ '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$'
      AND lower(COALESCE(r.deployment, '')) NOT LIKE '%parked at indus house%'
  ) matched
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.operations_fire_tender_vehicle_trips t
    WHERE t.vehicle_id = matched.vehicle_id
      AND t.trip_status = 'Active'
      AND (t.assignment_type = 'fire-tender' OR t.assignment_type IS NULL)
  );

END $$;

-- Standalone: list register rows not present in Fleet Management
-- (paste the VALUES into a CTE if running alone without the DO block temp table)
SELECT *
FROM (VALUES
  (4,  'Newly Fabricated Fire Tender', 'no usable registration number'),
  (5,  'GJ 06 AX 6253', 'not found in fleet master'),
  (9,  'GJ 05 BU 5936', 'not found in fleet master'),
  (11, 'Newly Fabricated Fire Tender', 'no usable registration number'),
  (19, 'GJ 16 AY 6594', 'not found in fleet master'),
  (21, 'HR 69 F 2766', 'not found in fleet master'),
  (24, 'GJ06 BY 2355', 'not found in fleet master'),
  (25, 'HR 61 F 8769', 'not found in fleet master'),
  (29, 'GJ16 AY 5342', 'not found in fleet master'),
  (34, '(blank)', 'no usable registration number'),
  (36, 'Old Fire Tender purchased from GIDC Vapi', 'no usable registration number'),
  (37, 'HR-63-E-7193', 'not found in fleet master')
) AS missing(sr_no, registration_no, reason)
ORDER BY sr_no;
