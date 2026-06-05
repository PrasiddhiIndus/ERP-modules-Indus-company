-- Template-wise (vehicle category) costing sheets for the Fire Tender module.
--
-- Templates: 'Fire Tender' (existing), 'Rescue vehicle', 'Rhino/QRV/ERV', 'Ambulance'.
-- The MAIN costing sheet (main_components / price_master) is scoped per template.
-- Accessories and MOC remain global (shared across templates).
--
-- Idempotent: safe to run more than once.

-- 1) New columns -------------------------------------------------------------
ALTER TABLE public.tenders
  ADD COLUMN IF NOT EXISTS costing_template text DEFAULT 'Fire Tender';

ALTER TABLE public.main_components
  ADD COLUMN IF NOT EXISTS template text DEFAULT 'Fire Tender';

ALTER TABLE public.price_master
  ADD COLUMN IF NOT EXISTS template text DEFAULT 'Fire Tender';

-- 2) Backfill existing rows to the default template --------------------------
UPDATE public.tenders        SET costing_template = 'Fire Tender' WHERE costing_template IS NULL;
UPDATE public.main_components SET template        = 'Fire Tender' WHERE template IS NULL;
UPDATE public.price_master   SET template        = 'Fire Tender' WHERE template IS NULL;

-- 3) Seed the new templates by cloning the Fire Tender catalog ---------------
--    (only when the target template has no rows yet, so re-runs are safe)
DO $$
DECLARE
  tmpl text;
BEGIN
  FOREACH tmpl IN ARRAY ARRAY['Rescue vehicle', 'Rhino/QRV/ERV', 'Ambulance'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.main_components WHERE template = tmpl) THEN
      INSERT INTO public.main_components
        (main_component, sub_category1, sub_category2, sub_category3, sub_category4, sub_category5, user_id, template)
      SELECT main_component, sub_category1, sub_category2, sub_category3, sub_category4, sub_category5, user_id, tmpl
      FROM public.main_components
      WHERE template = 'Fire Tender';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.price_master WHERE template = tmpl) THEN
      INSERT INTO public.price_master
        (main_component, sub_category1, sub_category2, sub_category3, sub_category4, sub_category5,
         manual_sub_category, weight, unit_cost, is_new, user_id, template)
      SELECT main_component, sub_category1, sub_category2, sub_category3, sub_category4, sub_category5,
         manual_sub_category, weight, unit_cost, false, user_id, tmpl
      FROM public.price_master
      WHERE template = 'Fire Tender';
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.tenders.costing_template IS
  'Fire Tender costing template / vehicle category that selects which main_components drive this tender''s costing sheet.';
COMMENT ON COLUMN public.main_components.template IS
  'Costing template this main component belongs to (Fire Tender, Rescue vehicle, Rhino/QRV/ERV, Ambulance).';
COMMENT ON COLUMN public.price_master.template IS
  'Costing template this price-master row belongs to.';
