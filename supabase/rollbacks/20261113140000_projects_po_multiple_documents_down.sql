-- Rollback multi Original PO attachments (keeps legacy name/path columns).

drop function if exists public.pj_oc_remove_po_document(uuid, text);
drop function if exists public.pj_oc_sync_po_document_legacy(jsonb);

-- Restore prior set/clear signatures from 20261106150000 if needed after drop.
alter table public.pj_oc_master drop column if exists po_documents;

notify pgrst, 'reload schema';
