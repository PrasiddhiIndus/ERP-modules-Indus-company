-- Quotation Maker: optional Make / Remarks columns + display options

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotation_rows' and column_name = 'make'
  ) then
    alter table projects.quotation_rows add column make text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotation_rows' and column_name = 'remarks'
  ) then
    alter table projects.quotation_rows add column remarks text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotations' and column_name = 'maker_options'
  ) then
    alter table projects.quotations add column maker_options jsonb default '{}'::jsonb;
  end if;
end $$;
