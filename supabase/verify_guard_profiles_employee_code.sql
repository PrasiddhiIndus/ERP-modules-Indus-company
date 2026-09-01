-- Read-only. After 20260901140000, the function body must mention
-- employee_code, allowed_sub_modules, and is_active.

SELECT pg_get_functiondef('public.guard_profiles_self_update()'::regprocedure) AS def;

SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass
  AND NOT tgisinternal
  AND tgname = 'trg_guard_profiles_self_update';
