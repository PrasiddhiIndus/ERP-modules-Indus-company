-- Forward migration only deletes pre-DOJ WO/NH·PH rows.
-- Those offs should not be restored; auto sync recreates valid offs on/after DOJ.
-- No-op rollback.
SELECT 1;
