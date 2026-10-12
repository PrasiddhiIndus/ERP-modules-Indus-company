-- Test fixture: the first version of 20261012120000_iev_oc_creation.sql (used by oc-check.mjs only).
-- =============================================================================
-- IEV - OC Creation (additive only; nothing existing is altered).
--
--   * oc_number_series        one counter per financial year for IFSPL-IEV-OCC-<FY>-<00001>
--                             (separate from the Commercial PO Entry OC numbers, so they never collide)
--   * oc_master               the OC header (Section 1 + Section 3 free text + remarks)
--   * oc_security_items       SD / ABG / PBG rows (one row per item)
--   * oc_fixed_conditions     EMD / Defect Liability Period / Warranty
--   * oc_penalty              LD / penalty clause
--   * oc_payment_milestones   optional payment milestones (must total 100 % when present)
--   * oc_contacts             customer's contact details
--   * oc_signoff              WO/PO dissemination boxes (Sales, Planning, IEV Head, Finance)
--   * storage bucket oc-signatures (private) for optional signature images
--
-- OC numbers are only issued by public.oc_reserve_number(); a trigger rejects any number that was
-- not issued by the series and makes the number read-only after save.
-- Access = the existing IEV (fireTender) check used by tenders / quotations:
--   public.current_user_has_fire_tender_shared_catalog_access()
-- Rollback: supabase/rollbacks/20261012120000_iev_oc_creation_down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oc_number_series (
  fy text PRIMARY KEY CHECK (fy ~ '^\d{2}/\d{2}$'),
  last_seq integer NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oc_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_no text NOT NULL UNIQUE CHECK (oc_no ~ '^IFSPL-IEV-OCC-\d{2}/\d{2}-\d{5}$'),
  oc_date date,
  cost_center_tally text,
  client_name text NOT NULL CHECK (btrim(client_name) <> ''),
  client_address text,
  is_sez boolean,
  po_wo_no text NOT NULL CHECK (btrim(po_wo_no) <> ''),
  po_date date NOT NULL,
  project_description text NOT NULL CHECK (btrim(project_description) <> ''),
  duration_of_job text,
  delivery_date date NOT NULL,
  contract_value numeric(16, 2) NOT NULL CHECK (contract_value >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  gst_pct numeric(5, 2) CHECK (gst_pct BETWEEN 0 AND 100),
  payment_terms text,
  rto_insurance text,
  other_information text,
  remarks text,
  remarks_date date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oc_master_delivery_after_po CHECK (delivery_date > po_date)
);
CREATE INDEX IF NOT EXISTS idx_oc_master_created_at ON public.oc_master (created_at DESC);

CREATE TABLE IF NOT EXISTS public.oc_security_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.oc_master(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('SD', 'ABG', 'PBG')),
  applicable boolean,
  pct numeric(5, 2) CHECK (pct BETWEEN 0 AND 100),
  due_days integer CHECK (due_days >= 0),
  validity_text text,
  seq integer NOT NULL DEFAULT 0,
  CONSTRAINT oc_security_items_applicable_sd_only CHECK (type = 'SD' OR applicable IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_oc_security_items_oc ON public.oc_security_items (oc_id, seq);

CREATE TABLE IF NOT EXISTS public.oc_fixed_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.oc_master(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key IN ('EMD', 'DLP', 'WARRANTY')),
  enabled boolean,
  detail_text text,
  release_or_adjust text CHECK (release_or_adjust IN ('RELEASE', 'ADJUST_SD')),
  release_date date,
  UNIQUE (oc_id, key)
);

CREATE TABLE IF NOT EXISTS public.oc_penalty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL UNIQUE REFERENCES public.oc_master(id) ON DELETE CASCADE,
  enabled boolean,
  rate numeric(6, 3) CHECK (rate BETWEEN 0 AND 100),
  period_unit text CHECK (period_unit IN ('DAY', 'WEEK', 'MONTH')),
  cap_percent numeric(5, 2) CHECK (cap_percent BETWEEN 0 AND 100),
  applicable_from_text text
);

CREATE TABLE IF NOT EXISTS public.oc_payment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.oc_master(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 0,
  percent numeric(5, 2) NOT NULL CHECK (percent > 0 AND percent <= 100),
  trigger text,
  due_days integer CHECK (due_days >= 0),
  notes text
);
CREATE INDEX IF NOT EXISTS idx_oc_payment_milestones_oc ON public.oc_payment_milestones (oc_id, seq);

CREATE TABLE IF NOT EXISTS public.oc_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.oc_master(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 0,
  department text,
  names text,
  mobiles text[] NOT NULL DEFAULT '{}',
  emails text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_oc_contacts_oc ON public.oc_contacts (oc_id, seq);

CREATE TABLE IF NOT EXISTS public.oc_signoff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.oc_master(id) ON DELETE CASCADE,
  slot text NOT NULL CHECK (slot IN ('SALES', 'PLANNING', 'IEV_HEAD', 'FINANCE')),
  signed_by text,
  signed_on date,
  signature_path text,
  UNIQUE (oc_id, slot)
);

-- ---------------------------------------------------------------------------
-- OC number series
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oc_current_fy(p_on date DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN extract(month FROM d) >= 4 THEN to_char(d, 'YY') || '/' || to_char(d + interval '1 year', 'YY')
    ELSE to_char(d - interval '1 year', 'YY') || '/' || to_char(d, 'YY')
  END
  FROM (SELECT COALESCE(p_on, (now() AT TIME ZONE 'Asia/Kolkata')::date) AS d) s;
$$;

CREATE OR REPLACE FUNCTION public.oc_reserve_number()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy text := public.oc_current_fy();
  v_seq integer;
BEGIN
  IF NOT public.current_user_has_fire_tender_shared_catalog_access() THEN
    RAISE EXCEPTION 'You do not have access to IEV OC Creation.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.oc_number_series AS s (fy, last_seq) VALUES (v_fy, 1)
  ON CONFLICT (fy) DO UPDATE SET last_seq = s.last_seq + 1, updated_at = now()
  RETURNING last_seq INTO v_seq;
  RETURN format('IFSPL-IEV-OCC-%s-%s', v_fy, lpad(v_seq::text, 5, '0'));
END;
$$;

COMMENT ON FUNCTION public.oc_reserve_number() IS
  'Issues the next IEV OC number (IFSPL-IEV-OCC-<FY>-<00001>). Unused numbers leave a gap; they are never reissued.';

-- Only issued numbers may be saved; the number is read-only afterwards.
CREATE OR REPLACE FUNCTION public.oc_master_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy text;
  v_seq integer;
  v_last integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_fy := substring(NEW.oc_no FROM '^IFSPL-IEV-OCC-(\d{2}/\d{2})-\d{5}$');
    v_seq := substring(NEW.oc_no FROM '-(\d{5})$')::integer;
    SELECT last_seq INTO v_last FROM public.oc_number_series WHERE fy = v_fy;
    IF v_fy IS NULL OR v_last IS NULL OR v_seq < 1 OR v_seq > v_last THEN
      RAISE EXCEPTION 'OC numbers are issued by the system. Use Generate to get a number.' USING ERRCODE = '22023';
    END IF;
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.created_at := now();
  ELSE
    IF NEW.oc_no IS DISTINCT FROM OLD.oc_no THEN
      RAISE EXCEPTION 'The OC number cannot be changed after it is saved.' USING ERRCODE = '22023';
    END IF;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oc_master_guard ON public.oc_master;
CREATE TRIGGER oc_master_guard
  BEFORE INSERT OR UPDATE ON public.oc_master
  FOR EACH ROW EXECUTE FUNCTION public.oc_master_guard();

-- ---------------------------------------------------------------------------
-- Save (header + all child rows in one transaction, with the form's rules)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oc_j_text(j jsonb, k text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT NULLIF(btrim(j ->> k), '') $$;

CREATE OR REPLACE FUNCTION public.oc_save(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid := NULLIF(p ->> 'id', '')::uuid;
  v_oc_no text;
  v_po_date date := NULLIF(p ->> 'po_date', '')::date;
  v_delivery date := NULLIF(p ->> 'delivery_date', '')::date;
  v_value numeric := NULLIF(p ->> 'contract_value', '')::numeric;
  v_pen jsonb := COALESCE(p -> 'penalty', '{}'::jsonb);
  v_cond jsonb;
  v_total numeric;
  v_count integer;
BEGIN
  IF NOT public.current_user_has_fire_tender_shared_catalog_access() THEN
    RAISE EXCEPTION 'You do not have access to IEV OC Creation.' USING ERRCODE = '42501';
  END IF;

  IF public.oc_j_text(p, 'po_wo_no') IS NULL THEN RAISE EXCEPTION 'PO/WO No. is required.'; END IF;
  IF v_po_date IS NULL THEN RAISE EXCEPTION 'PO/WO date is required.'; END IF;
  IF public.oc_j_text(p, 'client_name') IS NULL THEN RAISE EXCEPTION 'Client name is required.'; END IF;
  IF public.oc_j_text(p, 'project_description') IS NULL THEN RAISE EXCEPTION 'Project description is required.'; END IF;
  IF v_value IS NULL THEN RAISE EXCEPTION 'Contract value is required.'; END IF;
  IF v_delivery IS NULL THEN RAISE EXCEPTION 'Delivery date is required.'; END IF;
  IF v_delivery <= v_po_date THEN RAISE EXCEPTION 'Delivery date must be after the PO/WO date.'; END IF;

  IF (v_pen ->> 'enabled')::boolean IS TRUE
     AND (NULLIF(v_pen ->> 'rate', '') IS NULL OR public.oc_j_text(v_pen, 'period_unit') IS NULL) THEN
    RAISE EXCEPTION 'LD / Penalty details (rate and period) are required when LD / Penalty is Yes.';
  END IF;

  FOR v_cond IN SELECT value FROM jsonb_array_elements(COALESCE(p -> 'fixed_conditions', '[]'::jsonb)) LOOP
    IF (v_cond ->> 'enabled')::boolean IS TRUE THEN
      IF v_cond ->> 'key' = 'EMD' THEN
        IF public.oc_j_text(v_cond, 'release_or_adjust') IS NULL THEN
          RAISE EXCEPTION 'EMD: choose a release date or adjust against SD.';
        END IF;
        IF v_cond ->> 'release_or_adjust' = 'RELEASE' AND NULLIF(v_cond ->> 'release_date', '') IS NULL THEN
          RAISE EXCEPTION 'EMD: release date is required.';
        END IF;
      ELSIF public.oc_j_text(v_cond, 'detail_text') IS NULL THEN
        RAISE EXCEPTION '% details are required when it is Yes.',
          CASE v_cond ->> 'key' WHEN 'DLP' THEN 'Defect Liability Period' ELSE 'Warranty' END;
      END IF;
    END IF;
  END LOOP;

  SELECT count(*), COALESCE(sum(NULLIF(m ->> 'percent', '')::numeric), 0)
    INTO v_count, v_total
    FROM jsonb_array_elements(COALESCE(p -> 'payment_milestones', '[]'::jsonb)) m;
  IF v_count > 0 AND v_total <> 100 THEN
    RAISE EXCEPTION 'Payment milestones must total 100%% (currently %).', v_total;
  END IF;

  IF v_id IS NULL THEN
    v_oc_no := COALESCE(public.oc_j_text(p, 'oc_no'), public.oc_reserve_number());
    INSERT INTO public.oc_master (oc_no) SELECT v_oc_no WHERE false; -- type check only
    INSERT INTO public.oc_master (
      oc_no, oc_date, cost_center_tally, client_name, client_address, is_sez, po_wo_no, po_date,
      project_description, duration_of_job, delivery_date, contract_value, currency, gst_pct,
      payment_terms, rto_insurance, other_information, remarks, remarks_date
    ) VALUES (
      v_oc_no, NULLIF(p ->> 'oc_date', '')::date, public.oc_j_text(p, 'cost_center_tally'),
      public.oc_j_text(p, 'client_name'), public.oc_j_text(p, 'client_address'), (p ->> 'is_sez')::boolean,
      public.oc_j_text(p, 'po_wo_no'), v_po_date, public.oc_j_text(p, 'project_description'),
      public.oc_j_text(p, 'duration_of_job'), v_delivery, v_value,
      COALESCE(public.oc_j_text(p, 'currency'), 'INR'), NULLIF(p ->> 'gst_pct', '')::numeric,
      public.oc_j_text(p, 'payment_terms'), public.oc_j_text(p, 'rto_insurance'),
      public.oc_j_text(p, 'other_information'), public.oc_j_text(p, 'remarks'), NULLIF(p ->> 'remarks_date', '')::date
    )
    RETURNING id, oc_no INTO v_id, v_oc_no;
  ELSE
    UPDATE public.oc_master SET
      oc_date = NULLIF(p ->> 'oc_date', '')::date,
      cost_center_tally = public.oc_j_text(p, 'cost_center_tally'),
      client_name = public.oc_j_text(p, 'client_name'),
      client_address = public.oc_j_text(p, 'client_address'),
      is_sez = (p ->> 'is_sez')::boolean,
      po_wo_no = public.oc_j_text(p, 'po_wo_no'),
      po_date = v_po_date,
      project_description = public.oc_j_text(p, 'project_description'),
      duration_of_job = public.oc_j_text(p, 'duration_of_job'),
      delivery_date = v_delivery,
      contract_value = v_value,
      currency = COALESCE(public.oc_j_text(p, 'currency'), 'INR'),
      gst_pct = NULLIF(p ->> 'gst_pct', '')::numeric,
      payment_terms = public.oc_j_text(p, 'payment_terms'),
      rto_insurance = public.oc_j_text(p, 'rto_insurance'),
      other_information = public.oc_j_text(p, 'other_information'),
      remarks = public.oc_j_text(p, 'remarks'),
      remarks_date = NULLIF(p ->> 'remarks_date', '')::date
    WHERE id = v_id
    RETURNING oc_no INTO v_oc_no;
    IF v_oc_no IS NULL THEN RAISE EXCEPTION 'This OC no longer exists.'; END IF;
  END IF;

  DELETE FROM public.oc_security_items WHERE oc_id = v_id;
  INSERT INTO public.oc_security_items (oc_id, type, applicable, pct, due_days, validity_text, seq)
  SELECT v_id, x ->> 'type',
         CASE WHEN x ->> 'type' = 'SD' THEN (x ->> 'applicable')::boolean END,
         NULLIF(x ->> 'pct', '')::numeric, NULLIF(x ->> 'due_days', '')::integer,
         public.oc_j_text(x, 'validity_text'), t.ord::integer
  FROM jsonb_array_elements(COALESCE(p -> 'security_items', '[]'::jsonb)) WITH ORDINALITY AS t(x, ord);

  DELETE FROM public.oc_fixed_conditions WHERE oc_id = v_id;
  INSERT INTO public.oc_fixed_conditions (oc_id, key, enabled, detail_text, release_or_adjust, release_date)
  SELECT v_id, x ->> 'key', (x ->> 'enabled')::boolean, public.oc_j_text(x, 'detail_text'),
         public.oc_j_text(x, 'release_or_adjust'), NULLIF(x ->> 'release_date', '')::date
  FROM jsonb_array_elements(COALESCE(p -> 'fixed_conditions', '[]'::jsonb)) x;

  DELETE FROM public.oc_penalty WHERE oc_id = v_id;
  INSERT INTO public.oc_penalty (oc_id, enabled, rate, period_unit, cap_percent, applicable_from_text)
  VALUES (v_id, (v_pen ->> 'enabled')::boolean, NULLIF(v_pen ->> 'rate', '')::numeric,
          public.oc_j_text(v_pen, 'period_unit'), NULLIF(v_pen ->> 'cap_percent', '')::numeric,
          public.oc_j_text(v_pen, 'applicable_from_text'));

  DELETE FROM public.oc_payment_milestones WHERE oc_id = v_id;
  INSERT INTO public.oc_payment_milestones (oc_id, seq, percent, trigger, due_days, notes)
  SELECT v_id, t.ord::integer, NULLIF(x ->> 'percent', '')::numeric, public.oc_j_text(x, 'trigger'),
         NULLIF(x ->> 'due_days', '')::integer, public.oc_j_text(x, 'notes')
  FROM jsonb_array_elements(COALESCE(p -> 'payment_milestones', '[]'::jsonb)) WITH ORDINALITY AS t(x, ord);

  DELETE FROM public.oc_contacts WHERE oc_id = v_id;
  INSERT INTO public.oc_contacts (oc_id, seq, department, names, mobiles, emails)
  SELECT v_id, t.ord::integer, public.oc_j_text(x, 'department'), public.oc_j_text(x, 'names'),
         COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(x -> 'mobiles', '[]'::jsonb))), '{}'),
         COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(x -> 'emails', '[]'::jsonb))), '{}')
  FROM jsonb_array_elements(COALESCE(p -> 'contacts', '[]'::jsonb)) WITH ORDINALITY AS t(x, ord);

  DELETE FROM public.oc_signoff WHERE oc_id = v_id;
  INSERT INTO public.oc_signoff (oc_id, slot, signed_by, signed_on, signature_path)
  SELECT v_id, x ->> 'slot', public.oc_j_text(x, 'signed_by'), NULLIF(x ->> 'signed_on', '')::date,
         public.oc_j_text(x, 'signature_path')
  FROM jsonb_array_elements(COALESCE(p -> 'signoff', '[]'::jsonb)) x;

  RETURN jsonb_build_object('id', v_id, 'oc_no', v_oc_no);
END;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security (same IEV access as tenders / quotations)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'oc_master', 'oc_security_items', 'oc_fixed_conditions', 'oc_penalty',
    'oc_payment_milestones', 'oc_contacts', 'oc_signoff'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.current_user_has_fire_tender_shared_catalog_access())', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.current_user_has_fire_tender_shared_catalog_access())', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.current_user_has_fire_tender_shared_catalog_access()) WITH CHECK (public.current_user_has_fire_tender_shared_catalog_access())', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.current_user_has_fire_tender_shared_catalog_access())', t || '_delete', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- The series is changed only through oc_reserve_number(); users may read it.
ALTER TABLE public.oc_number_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oc_number_series_select ON public.oc_number_series;
CREATE POLICY oc_number_series_select ON public.oc_number_series FOR SELECT TO authenticated
  USING (public.current_user_has_fire_tender_shared_catalog_access());
REVOKE ALL ON public.oc_number_series FROM anon, authenticated;
GRANT SELECT ON public.oc_number_series TO authenticated;
GRANT ALL ON public.oc_number_series TO service_role;

-- ---------------------------------------------------------------------------
-- Signature images (private bucket)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('oc-signatures', 'oc-signatures', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS oc_signatures_select ON storage.objects;
CREATE POLICY oc_signatures_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'oc-signatures' AND public.current_user_has_fire_tender_shared_catalog_access());
DROP POLICY IF EXISTS oc_signatures_insert ON storage.objects;
CREATE POLICY oc_signatures_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'oc-signatures' AND public.current_user_has_fire_tender_shared_catalog_access());
DROP POLICY IF EXISTS oc_signatures_update ON storage.objects;
CREATE POLICY oc_signatures_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'oc-signatures' AND public.current_user_has_fire_tender_shared_catalog_access())
  WITH CHECK (bucket_id = 'oc-signatures' AND public.current_user_has_fire_tender_shared_catalog_access());
DROP POLICY IF EXISTS oc_signatures_delete ON storage.objects;
CREATE POLICY oc_signatures_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'oc-signatures' AND public.current_user_has_fire_tender_shared_catalog_access());

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.oc_reserve_number() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_save(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_master_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_reserve_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oc_save(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oc_current_fy(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oc_j_text(jsonb, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
