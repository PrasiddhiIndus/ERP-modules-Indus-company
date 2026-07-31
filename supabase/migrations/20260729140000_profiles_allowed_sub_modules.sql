-- Sub-module access grants (partial module visibility) for User Management.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allowed_sub_modules jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profiles.allowed_sub_modules IS
  'Optional sub-module keys (e.g. billing.tracking) when full module is not in allowed_modules.';
