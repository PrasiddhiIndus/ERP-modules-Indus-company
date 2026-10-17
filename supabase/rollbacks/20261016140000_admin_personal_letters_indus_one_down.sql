DROP FUNCTION IF EXISTS public.get_personal_letter_by_id(uuid);
DROP FUNCTION IF EXISTS public.list_todays_personal_letter_celebrations();
DROP FUNCTION IF EXISTS public.list_my_personal_letters();
DROP POLICY IF EXISTS admin_personal_letters_select_today ON public.admin_personal_letters;
DROP POLICY IF EXISTS admin_personal_letters_select_own ON public.admin_personal_letters;
NOTIFY pgrst, 'reload schema';
