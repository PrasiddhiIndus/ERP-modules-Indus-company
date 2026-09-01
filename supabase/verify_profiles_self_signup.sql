-- Read-only. After 20260901130000:
--   handle_new_user source must not reference raw_user_meta_data->>'role'
--   trg_profiles_protect_privileges exists

SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) AS handle_new_user_def;

SELECT tgname, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass
  AND NOT tgisinternal
  AND tgname = 'trg_profiles_protect_privileges';
