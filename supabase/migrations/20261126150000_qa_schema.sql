-- =====================================================================
-- Migration: QA module schema (from docs/indus_qa_schema.sql)
-- Do not weaken triggers or constraints from the source schema.
-- ERP add-ons (profiles linkage, service_role grants, PostgREST notify)
-- are appended after the source body.
-- =====================================================================
-- INDUS ERP: QA module schema (Supabase / PostgreSQL 15+)
-- Aligned to ISO/IEC/IEEE 29119-2/-3/-4, ISO/IEC 25010:2023,
-- ISO 9001:2015 (7.5, 8.3.4, 8.6, 8.7, 10.2), ISO/IEC 27001:2022 A.8.29/A.8.32
--
-- Design rules enforced in the database, not only in the UI:
--   * Test results, case versions, sign-offs and the audit log are append-only.
--   * Retests create a new attempt; nothing is overwritten.
--   * Authors cannot approve their own test cases.
--   * Developers cannot record test results; only testers / QA lead close defects.
--   * S1/S2 defects close only with root cause + corrective action.
--   * Every change is written to a hash-chained audit log.
-- Everything lives in schema "qa".
-- =====================================================================

create schema if not exists qa;
create extension if not exists pgcrypto;

-- ---------- Enumerations ------------------------------------------------
create type qa.member_role   as enum ('tester','qa_lead','developer','product_owner','business_owner','viewer');
create type qa.request_type  as enum ('feature','enhancement','bug_fix','config','hotfix');
create type qa.stage         as enum ('intake','plan','design','execute','close');
create type qa.risk_level    as enum ('low','medium','high');
create type qa.test_level    as enum ('unit','integration','system','acceptance');
create type qa.test_type     as enum ('functional','regression','smoke','security','performance');
create type qa.case_status   as enum ('draft','changes_requested','approved','obsolete');
create type qa.result        as enum ('pass','fail','blocked','not_run');
create type qa.severity      as enum ('S1','S2','S3','S4');
create type qa.priority      as enum ('P1','P2','P3','P4');
create type qa.defect_status as enum ('new','triaged','in_progress','ready_for_retest','closed');
create type qa.resolution    as enum ('fixed','duplicate','not_a_defect','deferred','cannot_reproduce');
create type qa.rca_category  as enum ('requirement_gap','design','coding','configuration','data','environment','test_gap');
create type qa.iso25010      as enum ('functional_suitability','performance_efficiency','compatibility',
                                      'interaction_capability','reliability','security','maintainability',
                                      'flexibility','safety');
create type qa.technique     as enum ('equivalence_partitioning','boundary_value_analysis','decision_table',
                                      'state_transition','use_case','exploratory','error_guessing');

-- ---------- People ------------------------------------------------------
create table qa.members (
  user_id    uuid primary key references auth.users(id) on delete restrict,
  full_name  text not null,
  qa_role    qa.member_role not null default 'viewer',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function qa.my_role() returns qa.member_role
language sql stable security definer set search_path = qa, public as $$
  select qa_role from qa.members where user_id = auth.uid() and active
$$;

-- ---------- Rules (data-driven, editable by QA lead) --------------------
-- Which levels / types a request needs, by change class and risk.
create table qa.rule_required_levels (
  change_class char(1) not null check (change_class in ('A','B','C','D')),
  risk         qa.risk_level not null,
  requirement  text not null,          -- 'unit','integration','system','acceptance','regression','smoke','security','performance'
  primary key (change_class, risk, requirement)
);
create table qa.rule_signoffs (
  change_class char(1) not null,
  signer_role  qa.member_role not null,
  primary key (change_class, signer_role)
);

insert into qa.rule_required_levels (change_class, risk, requirement)
select c, r::qa.risk_level, l from (values
  ('A','low','unit'),('A','low','integration'),('A','low','system'),('A','low','regression'),('A','low','acceptance'),
  ('A','medium','unit'),('A','medium','integration'),('A','medium','system'),('A','medium','regression'),('A','medium','acceptance'),
  ('A','high','unit'),('A','high','integration'),('A','high','system'),('A','high','regression'),('A','high','acceptance'),
  ('A','high','security'),('A','high','performance'),
  ('B','low','unit'),('B','low','system'),('B','low','regression'),
  ('B','medium','unit'),('B','medium','integration'),('B','medium','system'),('B','medium','regression'),
  ('B','high','unit'),('B','high','integration'),('B','high','system'),('B','high','regression'),('B','high','acceptance'),
  ('C','low','system'),('C','low','smoke'),('C','medium','system'),('C','medium','smoke'),
  ('C','high','system'),('C','high','smoke'),('C','high','regression'),
  ('D','low','smoke'),('D','low','system'),('D','low','regression'),
  ('D','medium','smoke'),('D','medium','system'),('D','medium','regression'),
  ('D','high','smoke'),('D','high','system'),('D','high','regression')
) v(c, r, l);

insert into qa.rule_signoffs values
  ('A','qa_lead'),('A','product_owner'),('A','business_owner'),
  ('B','qa_lead'),('B','product_owner'),
  ('C','qa_lead'),
  ('D','qa_lead'),('D','product_owner');

-- ---------- Releases ----------------------------------------------------
create table qa.releases (
  id          text primary key,                -- '2.4.0'
  target_date date,
  status      text not null default 'open' check (status in ('open','signed_off','shipped','cancelled')),
  created_at  timestamptz not null default now()
);

-- ---------- QA requests (tickets / features entering QA) ----------------
create sequence qa.request_no start 101;
create table qa.requests (
  id            bigint primary key default nextval('qa.request_no'),
  code          text generated always as ('QR-' || id) stored unique,
  title         text not null check (length(title) > 3),
  request_type  qa.request_type not null,
  change_class  char(1) not null check (change_class in ('A','B','C','D')),
  module        text not null,                 -- e.g. 'HR Site – Payroll'
  likelihood    smallint not null check (likelihood between 1 and 3),
  impact        smallint not null check (impact between 1 and 3),
  risk_score    smallint generated always as (likelihood * impact) stored,
  risk          qa.risk_level generated always as (
                  case when likelihood * impact >= 6 then 'high'::qa.risk_level
                       when likelihood * impact >= 3 then 'medium'::qa.risk_level
                       else 'low'::qa.risk_level end) stored,
  stage         qa.stage not null default 'intake',
  release_id    text references qa.releases(id),
  description   text,
  unit_evidence_url text,                      -- CI report link from the developer
  owner_id      uuid references qa.members(user_id),
  created_by    uuid not null default auth.uid() references qa.members(user_id),
  created_at    timestamptz not null default now()
);

create table qa.request_signoffs (
  request_id  bigint not null references qa.requests(id),
  signer_role qa.member_role not null,
  signed_by   uuid not null default auth.uid() references qa.members(user_id),
  signed_at   timestamptz not null default now(),
  primary key (request_id, signer_role)
);

-- ---------- Test cases (versioned specifications, 29119-3) --------------
create sequence qa.case_no start 1001;
create table qa.test_cases (
  id              bigint primary key default nextval('qa.case_no'),
  code            text generated always as ('TC-' || id) stored unique,
  request_id      bigint not null references qa.requests(id),
  current_version int not null default 1,
  status          qa.case_status not null default 'draft',
  author_id       uuid not null default auth.uid() references qa.members(user_id),
  reviewer_id     uuid references qa.members(user_id),
  created_at      timestamptz not null default now()
);

create table qa.test_case_versions (
  case_id        bigint not null references qa.test_cases(id),
  version        int not null,
  title          text not null,
  level          qa.test_level not null,
  test_type      qa.test_type not null default 'functional',
  iso_char       qa.iso25010 not null default 'functional_suitability',
  technique      qa.technique not null,
  priority       text not null check (priority in ('high','medium','low')),
  preconditions  text,
  test_data      text,
  steps          jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) > 0),
                 -- [{"action": "...", "expected": "..."}]
  change_note    text,
  created_by     uuid not null default auth.uid() references qa.members(user_id),
  created_at     timestamptz not null default now(),
  approved_by    uuid references qa.members(user_id),
  approved_at    timestamptz,
  primary key (case_id, version)
);

-- ---------- Test runs and executions -------------------------------------
create sequence qa.run_no start 24;
create table qa.test_runs (
  id          bigint primary key default nextval('qa.run_no'),
  code        text generated always as ('RUN-' || id) stored unique,
  name        text not null,
  release_id  text not null references qa.releases(id),
  build       text not null,
  environment text not null,                    -- 'QA-01','UAT-02','PERF-01'
  created_by  uuid not null default auth.uid() references qa.members(user_id),
  created_at  timestamptz not null default now()
);

create table qa.run_cases (
  run_id       bigint not null references qa.test_runs(id),
  case_id      bigint not null references qa.test_cases(id),
  case_version int not null,                    -- pinned: the run tests a specific approved version
  assigned_to  uuid references qa.members(user_id),
  primary key (run_id, case_id),
  foreign key (case_id, case_version) references qa.test_case_versions(case_id, version)
);

create table qa.executions (
  id            bigint generated always as identity primary key,
  run_id        bigint not null,
  case_id       bigint not null,
  case_version  int not null,
  attempt       int not null,
  result        qa.result not null check (result <> 'not_run'),
  step_results  jsonb not null,                 -- ["pass","pass","fail","not_run"]
  actual_result text,
  executed_by   uuid not null default auth.uid() references qa.members(user_id),
  executed_at   timestamptz not null default now(),
  witnessed_by  uuid references qa.members(user_id),   -- second tester for high-risk cases
  foreign key (run_id, case_id) references qa.run_cases(run_id, case_id),
  unique (run_id, case_id, attempt),
  check (result <> 'fail' or coalesce(length(actual_result),0) > 0)
);

create table qa.evidence (
  id            bigint generated always as identity primary key,
  execution_id  bigint references qa.executions(id),
  defect_id     bigint,                          -- fk added below
  storage_path  text not null,                   -- Supabase Storage bucket path: qa-evidence/<run>/<case>/<file>
  file_name     text not null,
  size_bytes    bigint,
  sha256        text,                            -- integrity of the evidence file
  uploaded_by   uuid not null default auth.uid() references qa.members(user_id),
  uploaded_at   timestamptz not null default now(),
  check (execution_id is not null or defect_id is not null)
);

-- ---------- Defects (incident reports + CAPA) ---------------------------
create sequence qa.defect_no start 501;
create table qa.defects (
  id                bigint primary key default nextval('qa.defect_no'),
  code              text generated always as ('DEF-' || id) stored unique,
  title             text not null,
  severity          qa.severity not null,
  priority          qa.priority not null,
  status            qa.defect_status not null default 'new',
  resolution        qa.resolution,
  request_id        bigint not null references qa.requests(id),
  case_id           bigint references qa.test_cases(id),
  execution_id      bigint references qa.executions(id),
  environment       text,
  found_in_build    text,
  fixed_in_build    text,
  assigned_to       uuid references qa.members(user_id),
  reported_by       uuid not null default auth.uid() references qa.members(user_id),
  steps_to_reproduce text,
  expected          text,
  actual            text,
  rca_category      qa.rca_category,
  corrective_action text,
  preventive_action text,
  reopen_count      int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table qa.evidence add foreign key (defect_id) references qa.defects(id);

create table qa.defect_history (
  id          bigint generated always as identity primary key,
  defect_id   bigint not null references qa.defects(id),
  from_status qa.defect_status,
  to_status   qa.defect_status not null,
  changed_by  uuid default auth.uid(),
  changed_at  timestamptz not null default now()
);

-- ---------- Release gate --------------------------------------------------
create table qa.exit_criteria (
  release_id  text not null references qa.releases(id),
  key         text not null,                     -- 'exec','pass','s1','s2','cov','rev','uat'
  description text not null,
  target      numeric not null,
  waivable    boolean not null default true,
  primary key (release_id, key)
);

create table qa.waivers (
  release_id    text not null,
  criterion_key text not null,
  reason        text not null check (length(reason) >= 15),
  waived_by     uuid not null default auth.uid() references qa.members(user_id),
  waived_at     timestamptz not null default now(),
  primary key (release_id, criterion_key),
  foreign key (release_id, criterion_key) references qa.exit_criteria(release_id, key)
);

create table qa.release_signoffs (
  release_id  text not null references qa.releases(id),
  signer_role qa.member_role not null,
  signed_by   uuid not null default auth.uid() references qa.members(user_id),
  signed_at   timestamptz not null default now(),
  meaning     text not null,                     -- "Approved release 2.4.0 for production"
  primary key (release_id, signer_role)
);

-- ---------- Audit log (append-only, hash-chained) -------------------------
create table qa.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid default auth.uid(),
  actor_role  qa.member_role,
  action      text not null,                     -- INSERT / UPDATE / DELETE
  table_name  text not null,
  record_key  text,
  old_row     jsonb,
  new_row     jsonb,
  prev_hash   text,
  row_hash    text not null
);
create index on qa.audit_log (table_name, record_key);
create index on qa.audit_log (at desc);

-- =====================================================================
-- Triggers
-- =====================================================================

-- Generic audit writer with a hash chain (tamper-evident).
create or replace function qa.fn_audit() returns trigger
language plpgsql security definer set search_path = qa, public as $$
declare
  v_prev text; v_old jsonb; v_new jsonb; v_key text;
begin
  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_key := coalesce(v_new->>'code', v_old->>'code', v_new->>'id', v_old->>'id',
                    concat_ws(':', v_new->>'case_id', v_new->>'version'),
                    concat_ws(':', v_new->>'release_id', v_new->>'signer_role'));
  perform pg_advisory_xact_lock(hashtext('qa.audit_log'));
  select row_hash into v_prev from qa.audit_log order by id desc limit 1;
  insert into qa.audit_log (actor, actor_role, action, table_name, record_key, old_row, new_row, prev_hash, row_hash)
  values (auth.uid(), qa.my_role(), tg_op, tg_table_name, v_key, v_old, v_new, v_prev,
          encode(digest(coalesce(v_prev,'') || tg_op || tg_table_name || coalesce(v_key,'') ||
                        coalesce(v_old::text,'') || coalesce(v_new::text,'') || now()::text, 'sha256'), 'hex'));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['requests','request_signoffs','test_cases','test_case_versions','test_runs','run_cases',
                           'executions','evidence','defects','waivers','release_signoffs','exit_criteria',
                           'rule_required_levels','rule_signoffs','members','releases']
  loop
    execute format('create trigger trg_audit after insert or update or delete on qa.%I
                    for each row execute function qa.fn_audit()', t);
  end loop;
end $$;

-- Append-only tables: block UPDATE and DELETE.
create or replace function qa.fn_append_only() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only: % is not allowed. Record a new entry instead.', tg_table_name, tg_op;
end $$;

create trigger trg_lock before update or delete on qa.audit_log        for each row execute function qa.fn_append_only();
create trigger trg_lock before update or delete on qa.executions       for each row execute function qa.fn_append_only();
create trigger trg_lock before update or delete on qa.request_signoffs for each row execute function qa.fn_append_only();
create trigger trg_lock before update or delete on qa.release_signoffs for each row execute function qa.fn_append_only();
create trigger trg_lock before update or delete on qa.defect_history   for each row execute function qa.fn_append_only();
create trigger trg_lock before delete on qa.evidence                    for each row execute function qa.fn_append_only();

-- Case versions: content is frozen; only the approval stamp may be set once.
create or replace function qa.fn_case_version_guard() returns trigger language plpgsql as $$
declare v_author uuid;
begin
  if tg_op = 'DELETE' then raise exception 'Test case versions cannot be deleted; mark the case obsolete.'; end if;
  if (to_jsonb(new) - 'approved_by' - 'approved_at') <> (to_jsonb(old) - 'approved_by' - 'approved_at') then
    raise exception 'Version % of case % is frozen. Create version % instead.', old.version, old.case_id, old.version + 1;
  end if;
  if old.approved_by is not null then raise exception 'This version is already approved.'; end if;
  if new.approved_by is not null then
    select author_id into v_author from qa.test_cases where id = new.case_id;
    if new.approved_by = v_author or new.approved_by = new.created_by then
      raise exception 'Independent review required: the author cannot approve their own test case.';
    end if;
    if qa.my_role() is distinct from 'qa_lead' then raise exception 'Only the QA lead approves test cases.'; end if;
    new.approved_at := now();
    update qa.test_cases set status = 'approved', reviewer_id = new.approved_by where id = new.case_id;
  end if;
  return new;
end $$;
create trigger trg_case_version_guard before update or delete on qa.test_case_versions
  for each row execute function qa.fn_case_version_guard();

-- A new version of an approved case goes back to draft.
create or replace function qa.fn_case_new_version() returns trigger language plpgsql as $$
begin
  update qa.test_cases
     set current_version = new.version,
         status = case when new.version > 1 then 'draft'::qa.case_status else status end,
         reviewer_id = case when new.version > 1 then null else reviewer_id end
   where id = new.case_id;
  return new;
end $$;
create trigger trg_case_new_version after insert on qa.test_case_versions
  for each row execute function qa.fn_case_new_version();

-- Executions: role check, approved version only, attempt numbering.
create or replace function qa.fn_execution_guard() returns trigger language plpgsql as $$
begin
  if qa.my_role() not in ('tester','qa_lead') then
    raise exception 'Test results are recorded by a tester or the QA lead.';
  end if;
  if not exists (select 1 from qa.test_case_versions v
                  where v.case_id = new.case_id and v.version = new.case_version and v.approved_by is not null) then
    raise exception 'Only an approved test case version can be executed.';
  end if;
  select coalesce(max(attempt), 0) + 1 into new.attempt
    from qa.executions where run_id = new.run_id and case_id = new.case_id;
  return new;
end $$;
create trigger trg_execution_guard before insert on qa.executions
  for each row execute function qa.fn_execution_guard();

-- Defect lifecycle rules + history.
create or replace function qa.fn_defect_transition() returns trigger language plpgsql security definer set search_path = qa, public as $$
declare r qa.member_role := qa.my_role();
begin
  new.updated_at := now();
  if new.status = old.status then return new; end if;

  if old.status = 'new' and r <> 'qa_lead' then
    raise exception 'The QA lead triages new defects.';
  end if;
  if new.status = 'ready_for_retest' then
    if coalesce(new.fixed_in_build,'') = '' then raise exception 'Enter the build that contains the fix.'; end if;
    if r not in ('developer','qa_lead') then raise exception 'A developer or the QA lead marks a fix ready for retest.'; end if;
  end if;
  if new.status = 'closed' then
    if old.status <> 'ready_for_retest' then raise exception 'Only a retested defect can be closed.'; end if;
    if r not in ('tester','qa_lead') then raise exception 'A tester or the QA lead verifies and closes defects.'; end if;
    if new.resolution is null then raise exception 'Choose a resolution.'; end if;
    if new.severity in ('S1','S2') and (new.rca_category is null or coalesce(new.corrective_action,'') = '') then
      raise exception 'S1/S2 defects need a root cause and corrective action (ISO 9001 10.2).';
    end if;
  end if;
  if old.status = 'closed' then new.reopen_count := old.reopen_count + 1; new.resolution := null; end if;

  insert into qa.defect_history (defect_id, from_status, to_status) values (new.id, old.status, new.status);
  return new;
end $$;
create trigger trg_defect_transition before update on qa.defects
  for each row execute function qa.fn_defect_transition();

create or replace function qa.fn_defect_created() returns trigger language plpgsql security definer set search_path = qa, public as $$
begin
  insert into qa.defect_history (defect_id, from_status, to_status) values (new.id, null, new.status);
  return new;
end $$;
create trigger trg_defect_created after insert on qa.defects
  for each row execute function qa.fn_defect_created();

-- =====================================================================
-- Views
-- =====================================================================

-- Latest result per case per release (latest attempt across all runs of the release).
create or replace view qa.v_latest_results as
select distinct on (r.release_id, e.case_id)
       r.release_id, e.case_id, e.case_version, e.result, e.run_id, e.attempt, e.executed_by, e.executed_at
  from qa.executions e
  join qa.test_runs r on r.id = e.run_id
 order by r.release_id, e.case_id, e.executed_at desc;

-- Required coverage per request: one row per required level/type.
create or replace view qa.v_coverage as
with req as (
  select q.id as request_id, q.code, q.release_id, q.unit_evidence_url, rl.requirement
    from qa.requests q
    join qa.rule_required_levels rl on rl.change_class = q.change_class and rl.risk = q.risk
),
cases as (
  select c.id as case_id, c.request_id, c.status, v.level::text as level, v.test_type::text as test_type
    from qa.test_cases c
    join qa.test_case_versions v on v.case_id = c.id and v.version = c.current_version
   where c.status <> 'obsolete'
)
select req.request_id, req.code, req.release_id, req.requirement,
       case
         when req.requirement = 'unit' then case when req.unit_evidence_url is not null then 'pass' else 'gap' end
         when not exists (select 1 from cases c where c.request_id = req.request_id
                           and (c.level = req.requirement or c.test_type = req.requirement)) then 'gap'
         when not exists (select 1 from cases c where c.request_id = req.request_id and c.status = 'approved'
                           and (c.level = req.requirement or c.test_type = req.requirement)) then 'draft'
         when exists (select 1 from cases c join qa.v_latest_results lr on lr.case_id = c.case_id and lr.release_id = req.release_id
                       where c.request_id = req.request_id and c.status = 'approved'
                         and (c.level = req.requirement or c.test_type = req.requirement) and lr.result = 'fail') then 'fail'
         when not exists (select 1 from cases c
                           left join qa.v_latest_results lr on lr.case_id = c.case_id and lr.release_id = req.release_id
                          where c.request_id = req.request_id and c.status = 'approved'
                            and (c.level = req.requirement or c.test_type = req.requirement)
                            and coalesce(lr.result::text,'not_run') <> 'pass') then 'pass'
         else 'open'
       end as coverage
  from req;

-- Release gate: one row per exit criterion with actual value and verdict.
create or replace view qa.v_release_gate as
with planned as (
  select distinct r.release_id, rc.case_id
    from qa.run_cases rc join qa.test_runs r on r.id = rc.run_id
),
ex as (
  select p.release_id,
         count(*)                                              as planned,
         count(*) filter (where lr.result in ('pass','fail'))  as executed,
         count(*) filter (where lr.result = 'pass')            as passed
    from planned p
    left join qa.v_latest_results lr on lr.release_id = p.release_id and lr.case_id = p.case_id
   group by p.release_id
),
od as (
  select q.release_id,
         count(*) filter (where d.severity = 'S1') as s1,
         count(*) filter (where d.severity = 'S2') as s2
    from qa.defects d join qa.requests q on q.id = d.request_id
   where d.status <> 'closed'
   group by q.release_id
),
cv as (
  select release_id,
         100.0 * count(*) filter (where coverage not in ('gap','draft')) / nullif(count(*),0) as pct
    from qa.v_coverage group by release_id
),
rv as (
  select q.release_id, 100.0 * count(*) filter (where c.status = 'approved') / nullif(count(*),0) as pct
    from qa.test_cases c join qa.requests q on q.id = c.request_id
   where c.status <> 'obsolete' and q.stage <> 'intake'
   group by q.release_id
),
uat as (
  select q.release_id,
         100.0 * count(*) filter (where exists (
             select 1 from qa.test_cases c
               join qa.test_case_versions v on v.case_id = c.id and v.version = c.current_version
               join qa.v_latest_results lr on lr.case_id = c.id and lr.release_id = q.release_id
              where c.request_id = q.id and v.level = 'acceptance' and lr.result = 'pass'))
         / nullif(count(*),0) as pct
    from qa.requests q where q.change_class = 'A' and q.stage <> 'intake'
   group by q.release_id
),
actual as (
  select rel.id as release_id, k.key, k.val
    from qa.releases rel
    left join ex  on ex.release_id  = rel.id
    left join od  on od.release_id  = rel.id
    left join cv  on cv.release_id  = rel.id
    left join rv  on rv.release_id  = rel.id
    left join uat on uat.release_id = rel.id
    cross join lateral (values
      ('exec', round(100.0 * coalesce(ex.executed,0) / nullif(ex.planned,0), 1)),
      ('pass', round(100.0 * coalesce(ex.passed,0)  / nullif(ex.executed,0), 1)),
      ('s1',   coalesce(od.s1,0)::numeric),
      ('s2',   coalesce(od.s2,0)::numeric),
      ('cov',  round(coalesce(cv.pct,100),1)),
      ('rev',  round(coalesce(rv.pct,100),1)),
      ('uat',  round(coalesce(uat.pct,100),1))
    ) k(key, val)
)
select ec.release_id, ec.key, ec.description, ec.target, a.val as actual,
       case when ec.key in ('s1','s2') then a.val <= ec.target else coalesce(a.val,0) >= ec.target end as met,
       w.reason is not null and ec.waivable as waived,
       (case when ec.key in ('s1','s2') then a.val <= ec.target else coalesce(a.val,0) >= ec.target end)
         or (w.reason is not null and ec.waivable) as ok
  from qa.exit_criteria ec
  left join actual a on a.release_id = ec.release_id and a.key = ec.key
  left join qa.waivers w on w.release_id = ec.release_id and w.criterion_key = ec.key;

-- Release sign-off only when every criterion is ok.
create or replace function qa.fn_release_signoff_guard() returns trigger language plpgsql as $$
begin
  if exists (select 1 from qa.v_release_gate where release_id = new.release_id and not ok) then
    raise exception 'Release % has unmet exit criteria; sign-off is blocked.', new.release_id;
  end if;
  if qa.my_role() is distinct from new.signer_role then
    raise exception 'You can only sign as your own role.';
  end if;
  return new;
end $$;
create trigger trg_release_signoff_guard before insert on qa.release_signoffs
  for each row execute function qa.fn_release_signoff_guard();

create or replace function qa.fn_waiver_guard() returns trigger language plpgsql as $$
begin
  if qa.my_role() is distinct from 'qa_lead' then raise exception 'Only the QA lead can waive an exit criterion.'; end if;
  if not (select waivable from qa.exit_criteria where release_id = new.release_id and key = new.criterion_key) then
    raise exception 'Criterion % cannot be waived.', new.criterion_key;
  end if;
  return new;
end $$;
create trigger trg_waiver_guard before insert on qa.waivers
  for each row execute function qa.fn_waiver_guard();

-- Default exit criteria whenever a release is created.
create or replace function qa.fn_release_defaults() returns trigger language plpgsql as $$
begin
  insert into qa.exit_criteria (release_id, key, description, target, waivable) values
    (new.id,'exec','Planned tests executed (%)',98,true),
    (new.id,'pass','Pass rate of executed tests (%)',95,true),
    (new.id,'s1','Open critical (S1) defects',0,false),
    (new.id,'s2','Open major (S2) defects',0,true),
    (new.id,'cov','Required test levels covered by approved cases (%)',100,true),
    (new.id,'rev','Test cases in scope reviewed and approved (%)',100,true),
    (new.id,'uat','UAT passed for class A requests (%)',100,true);
  return new;
end $$;
create trigger trg_release_defaults after insert on qa.releases
  for each row execute function qa.fn_release_defaults();

-- =====================================================================
-- Workflow: move a request to its next stage, or return the reasons why not
-- =====================================================================
create or replace function qa.advance_request(p_request bigint)
returns text[] language plpgsql security invoker as $$
declare
  q qa.requests; why text[] := '{}'; nxt qa.stage; rec record;
begin
  select * into q from qa.requests where id = p_request for update;
  if not found then raise exception 'Request % not found', p_request; end if;

  nxt := case q.stage when 'intake' then 'plan' when 'plan' then 'design'
                      when 'design' then 'execute' when 'execute' then 'close' end;
  if nxt is null then return array['Request is already closed.']; end if;

  if q.stage = 'intake' and qa.my_role() is distinct from 'qa_lead' then
    why := why || 'Only the QA lead triages a request into planning.';
  end if;
  if q.stage = 'plan' and q.release_id is null then
    why := why || 'Choose a target release.';
  end if;
  if q.stage = 'design' then
    for rec in select requirement, coverage from qa.v_coverage where request_id = q.id and coverage in ('gap','draft') loop
      why := why || case when rec.requirement = 'unit' then 'Attach developer unit-test evidence.'
                         when rec.coverage = 'gap' then format('No test case at the %s level.', rec.requirement)
                         else format('The %s test case is still awaiting review.', rec.requirement) end;
    end loop;
  end if;
  if q.stage = 'execute' then
    for rec in select c.code, coalesce(lr.result::text,'not_run') as res
                 from qa.test_cases c
                 left join qa.v_latest_results lr on lr.case_id = c.id and lr.release_id = q.release_id
                where c.request_id = q.id and c.status = 'approved' and coalesce(lr.result::text,'not_run') <> 'pass' loop
      why := why || format('%s latest result is %s.', rec.code, rec.res);
    end loop;
    for rec in select code, severity, status from qa.defects where request_id = q.id and status <> 'closed' loop
      why := why || format('%s (%s) is still %s.', rec.code, rec.severity, rec.status);
    end loop;
    for rec in select s.signer_role from qa.rule_signoffs s
                where s.change_class = q.change_class
                  and not exists (select 1 from qa.request_signoffs x where x.request_id = q.id and x.signer_role = s.signer_role) loop
      why := why || format('Sign-off missing: %s.', rec.signer_role);
    end loop;
  end if;

  if array_length(why, 1) is null then
    update qa.requests set stage = nxt where id = q.id;
  end if;
  return why;   -- empty array = moved
end $$;

-- =====================================================================
-- Row level security (adjust to your org's needs)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['members','releases','requests','request_signoffs','test_cases','test_case_versions',
                           'test_runs','run_cases','executions','evidence','defects','defect_history',
                           'exit_criteria','waivers','release_signoffs','audit_log','rule_required_levels','rule_signoffs']
  loop
    execute format('alter table qa.%I enable row level security', t);
    execute format('create policy %I on qa.%I for select to authenticated using (qa.my_role() is not null)', 'read_'||t, t);
  end loop;
end $$;

-- Writers (row rules above are enforced by triggers regardless of policy)
create policy w_requests   on qa.requests           for all    to authenticated using (qa.my_role() in ('qa_lead','tester','product_owner','developer')) with check (qa.my_role() in ('qa_lead','tester','product_owner','developer'));
create policy w_req_sign   on qa.request_signoffs   for insert to authenticated with check (signer_role = qa.my_role());
create policy w_cases      on qa.test_cases         for all    to authenticated using (qa.my_role() in ('qa_lead','tester')) with check (qa.my_role() in ('qa_lead','tester'));
create policy w_versions   on qa.test_case_versions for all    to authenticated using (qa.my_role() in ('qa_lead','tester')) with check (qa.my_role() in ('qa_lead','tester'));
create policy w_runs       on qa.test_runs          for insert to authenticated with check (qa.my_role() in ('qa_lead','tester'));
create policy w_run_cases  on qa.run_cases          for all    to authenticated using (qa.my_role() in ('qa_lead','tester')) with check (qa.my_role() in ('qa_lead','tester'));
create policy w_exec       on qa.executions         for insert to authenticated with check (qa.my_role() in ('qa_lead','tester'));
create policy w_evidence   on qa.evidence           for insert to authenticated with check (qa.my_role() is not null);
create policy w_defects    on qa.defects            for all    to authenticated using (qa.my_role() in ('qa_lead','tester','developer')) with check (qa.my_role() in ('qa_lead','tester','developer'));
create policy w_waivers    on qa.waivers            for insert to authenticated with check (qa.my_role() = 'qa_lead');
create policy w_rel_sign   on qa.release_signoffs   for insert to authenticated with check (signer_role = qa.my_role());
create policy w_releases   on qa.releases           for all    to authenticated using (qa.my_role() = 'qa_lead') with check (qa.my_role() = 'qa_lead');
create policy w_rules1     on qa.rule_required_levels for all  to authenticated using (qa.my_role() = 'qa_lead') with check (qa.my_role() = 'qa_lead');
create policy w_rules2     on qa.rule_signoffs      for all    to authenticated using (qa.my_role() = 'qa_lead') with check (qa.my_role() = 'qa_lead');
create policy w_members    on qa.members            for all    to authenticated using (qa.my_role() = 'qa_lead') with check (qa.my_role() = 'qa_lead');
-- audit_log and defect_history have no write policy: only security-definer triggers write them.

grant usage on schema qa to authenticated;
grant select on all tables in schema qa to authenticated;
grant insert, update on qa.requests, qa.test_cases, qa.test_case_versions, qa.run_cases, qa.defects,
                        qa.releases, qa.rule_required_levels, qa.rule_signoffs, qa.members to authenticated;
grant insert on qa.request_signoffs, qa.test_runs, qa.executions, qa.evidence, qa.waivers, qa.release_signoffs to authenticated;
grant usage on all sequences in schema qa to authenticated;
grant execute on function qa.advance_request(bigint), qa.my_role() to authenticated;
-- Expose the schema to the API: add "qa" to supabase/config.toml [api] schemas (done in-repo).
-- Evidence files: private Storage bucket "qa-evidence" — see 20261126150100_qa_evidence_storage.sql.

-- =====================================================================
-- ERP linkage: qa.members ↔ public.profiles (same UUID as auth.users)
-- Does not duplicate user records; membership is opt-in in qa.members.
-- =====================================================================

-- Require an ERP profile row for every QA member (profiles.id = auth.users.id).
do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table qa.members
      drop constraint if exists qa_members_profile_fk;
    alter table qa.members
      add constraint qa_members_profile_fk
      foreign key (user_id) references public.profiles(id) on delete restrict;
  end if;
end $$;

-- Default full_name from profiles.username / email when caller leaves a placeholder.
create or replace function qa.fn_members_fill_name_from_profile()
returns trigger
language plpgsql
security definer
set search_path = qa, public
as $$
declare
  v_name text;
begin
  if to_regclass('public.profiles') is null then
    return new;
  end if;
  if new.full_name is null or btrim(new.full_name) = '' or new.full_name = '(from profile)' then
    select coalesce(nullif(btrim(p.username), ''), nullif(btrim(p.email), ''), new.user_id::text)
      into v_name
      from public.profiles p
     where p.id = new.user_id;
    if v_name is not null then
      new.full_name := v_name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_members_fill_name on qa.members;
create trigger trg_members_fill_name
  before insert or update of full_name on qa.members
  for each row execute function qa.fn_members_fill_name_from_profile();

comment on table qa.members is
  'QA role roster. user_id = auth.users.id = public.profiles.id. Not a second user directory.';

-- service_role for admin / seed / edge (bypasses RLS)
grant usage on schema qa to service_role, anon;
grant all on all tables in schema qa to service_role;
grant all on all sequences in schema qa to service_role;
grant execute on all functions in schema qa to service_role;

alter default privileges in schema qa
  grant select on tables to authenticated;
alter default privileges in schema qa
  grant all on tables to service_role;
alter default privileges in schema qa
  grant all on sequences to service_role;

-- Portable rewrite of advance_request: identical gates, but uses array_append
-- instead of text[] || text (the latter is ambiguous and breaks on some runtimes).
create or replace function qa.advance_request(p_request bigint)
returns text[] language plpgsql security invoker as $$
declare
  q qa.requests; why text[] := '{}'; nxt qa.stage; rec record;
begin
  select * into q from qa.requests where id = p_request for update;
  if not found then raise exception 'Request % not found', p_request; end if;

  nxt := case q.stage when 'intake' then 'plan' when 'plan' then 'design'
                      when 'design' then 'execute' when 'execute' then 'close' end;
  if nxt is null then return array['Request is already closed.']; end if;

  if q.stage = 'intake' and qa.my_role() is distinct from 'qa_lead' then
    why := array_append(why, 'Only the QA lead triages a request into planning.');
  end if;
  if q.stage = 'plan' and q.release_id is null then
    why := array_append(why, 'Choose a target release.');
  end if;
  if q.stage = 'design' then
    for rec in select requirement, coverage from qa.v_coverage where request_id = q.id and coverage in ('gap','draft') loop
      why := array_append(why, case when rec.requirement = 'unit' then 'Attach developer unit-test evidence.'
                         when rec.coverage = 'gap' then format('No test case at the %s level.', rec.requirement)
                         else format('The %s test case is still awaiting review.', rec.requirement) end);
    end loop;
  end if;
  if q.stage = 'execute' then
    for rec in select c.code, coalesce(lr.result::text,'not_run') as res
                 from qa.test_cases c
                 left join qa.v_latest_results lr on lr.case_id = c.id and lr.release_id = q.release_id
                where c.request_id = q.id and c.status = 'approved' and coalesce(lr.result::text,'not_run') <> 'pass' loop
      why := array_append(why, format('%s latest result is %s.', rec.code, rec.res));
    end loop;
    for rec in select code, severity, status from qa.defects where request_id = q.id and status <> 'closed' loop
      why := array_append(why, format('%s (%s) is still %s.', rec.code, rec.severity, rec.status));
    end loop;
    for rec in select s.signer_role from qa.rule_signoffs s
                where s.change_class = q.change_class
                  and not exists (select 1 from qa.request_signoffs x where x.request_id = q.id and x.signer_role = s.signer_role) loop
      why := array_append(why, format('Sign-off missing: %s.', rec.signer_role));
    end loop;
  end if;

  if array_length(why, 1) is null then
    update qa.requests set stage = nxt where id = q.id;
  end if;
  return why;
end $$;

grant execute on function qa.advance_request(bigint) to authenticated, service_role;

notify pgrst, 'reload schema';
