-- Read-only check. Paste in production AND staging SQL Editor.
-- Expected after 20260901120000:
--   manpower_enquiries_commercial_all only
--   qual uses current_user_has_commercial_enquiry_access
--   NO USING (true), NO *_authenticated, NO erp_auth_*

SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'manpower_enquiries'
ORDER BY policyname;
