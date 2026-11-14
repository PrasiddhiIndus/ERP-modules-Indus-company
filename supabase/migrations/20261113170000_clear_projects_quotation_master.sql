-- One-time clear of Quotation Master: headers + related detail rows.
-- Safe if optional detail tables are missing in some environments.

do $$
begin
  if to_regclass('projects.quotation_followups') is not null then
    execute 'delete from projects.quotation_followups';
  end if;

  if to_regclass('projects.quotation_attachments') is not null then
    execute 'delete from projects.quotation_attachments';
  end if;

  if to_regclass('projects.quotation_line_items') is not null then
    execute 'delete from projects.quotation_line_items';
  end if;

  if to_regclass('projects.quotation_maker_audit') is not null then
    execute 'delete from projects.quotation_maker_audit';
  end if;

  -- quotation_rows cascades from quotations when FK is on delete cascade;
  -- delete rows explicitly first so parent/child order never blocks.
  if to_regclass('projects.quotation_rows') is not null then
    execute 'delete from projects.quotation_rows';
  end if;

  if to_regclass('projects.quotations') is not null then
    execute 'delete from projects.quotations';
  end if;

  -- Reset job/offer number counters so re-import starts clean.
  if to_regclass('projects.quotation_sequences') is not null then
    execute 'delete from projects.quotation_sequences';
  end if;
end $$;
