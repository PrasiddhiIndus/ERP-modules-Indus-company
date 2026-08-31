-- Read-only check. Paste in production AND staging SQL Editor.
-- Expected after 20260831120000 (or 20260827120000 + 20260827150000):
--   erp_attendance_punches: hr_all + select_own  (no USING (true), no *_authenticated, no erp_auth_*)
--   admin_attendance_register: hr_all + self_read (same)
-- Admin module is not touched. Do not reopen USING (true).

SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('erp_attendance_punches', 'admin_attendance_register')
ORDER BY tablename, policyname;
