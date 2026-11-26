-- Rollback: drop QA schema (destructive). Use only on non-production.

DROP SCHEMA IF EXISTS qa CASCADE;

NOTIFY pgrst, 'reload schema';
