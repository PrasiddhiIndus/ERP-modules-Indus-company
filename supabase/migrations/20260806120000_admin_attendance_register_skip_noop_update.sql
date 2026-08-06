-- Safety net: cancel no-op UPDATEs on admin_attendance_register so identical
-- re-upserts do not generate WAL / Realtime messages.
-- Compares mark, mark_source, mark_remark, leave_request_id, tour_request_id.
-- Does not alter columns, drop data, or change Realtime publication.

CREATE OR REPLACE FUNCTION public.skip_noop_attendance_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.mark IS NOT DISTINCT FROM OLD.mark
     AND NEW.mark_source IS NOT DISTINCT FROM OLD.mark_source
     AND NEW.mark_remark IS NOT DISTINCT FROM OLD.mark_remark
     AND NEW.leave_request_id IS NOT DISTINCT FROM OLD.leave_request_id
     AND NEW.tour_request_id IS NOT DISTINCT FROM OLD.tour_request_id THEN
    RETURN NULL; -- cancel the update, no real change happened
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_update_skip_noop ON public.admin_attendance_register;

CREATE TRIGGER before_update_skip_noop
  BEFORE UPDATE ON public.admin_attendance_register
  FOR EACH ROW
  EXECUTE FUNCTION public.skip_noop_attendance_update();
