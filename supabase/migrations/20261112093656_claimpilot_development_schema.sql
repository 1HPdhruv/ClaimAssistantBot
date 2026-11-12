-- ClaimPilot development/demo schema. Run only in a designated development project.
-- No existing CampusBite/public business tables are modified.
-- Private relational entities use validated JSONB payloads plus indexed, constrained generated columns.
-- Integer minor units preserve money exactly. Never add unlike currencies.
begin;
create schema if not exists claimpilot;
revoke all on schema claimpilot from public, anon, authenticated;
grant usage on schema claimpilot to service_role;
create table claimpilot.revision (id boolean primary key default true check(id), version bigint not null default 0);
insert into claimpilot.revision(id) values(true);
alter table claimpilot.revision enable row level security;
create table claimpilot.departments (
 id uuid primary key,
 data jsonb not null check(jsonb_typeof(data)='object' and data->>'id'=id::text),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 name text generated always as (data->>'name') stored unique
);
alter table claimpilot.departments enable row level security;
create table claimpilot.profiles (
 id uuid primary key,
 data jsonb not null check(jsonb_typeof(data)='object' and data->>'id'=id::text),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 name text generated always as (data->>'name') stored, role text generated always as (data->>'role') stored check (role in ('employee','manager','finance')), department text generated always as (data->>'department') stored
);
alter table claimpilot.profiles enable row level security;
create table claimpilot.trips (
 id uuid primary key,
 data jsonb not null check(jsonb_typeof(data)='object' and data->>'id'=id::text),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 employee_id uuid generated always as ((data->>'employeeId')::uuid) stored references claimpilot.profiles(id) deferrable initially deferred, destination text generated always as (data->>'destination') stored, start_date text generated always as (data->>'startDate') stored, end_date text generated always as (data->>'endDate') stored, check (data->>'endDate' >= data->>'startDate')
);
alter table claimpilot.trips enable row level security;
create table claimpilot.expense_policies (
 id uuid primary key,
 data jsonb not null check(jsonb_typeof(data)='object' and data->>'id'=id::text),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 category text generated always as (data->>'category') stored, currency text generated always as (data->>'currency') stored, limit_minor bigint generated always as ((data->>'limitMinor')::bigint) stored check(limit_minor>=0), basis text generated always as (data->>'basis') stored check(basis in ('day','night','transaction'))
);
alter table claimpilot.expense_policies enable row level security;
create table claimpilot.receipts (
 id uuid primary key,
 data jsonb not null check(jsonb_typeof(data)='object' and data->>'id'=id::text),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 employee_id uuid generated always as ((data->>'employeeId')::uuid) stored references claimpilot.profiles(id) deferrable initially deferred, file_hash text generated always as (data->>'hash') stored, storage_path text generated always as (data->>'path') stored
);
alter table claimpilot.receipts enable row level security;
create table claimpilot.expenses (
 id uuid primary key,
 data jsonb not null check(jsonb_typeof(data)='object' and data->>'id'=id::text),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 employee_id uuid generated always as ((data->>'employeeId')::uuid) stored references claimpilot.profiles(id) deferrable initially deferred, amount_minor bigint generated always as ((data->>'amountMinor')::bigint) stored check(amount_minor>0), currency text generated always as (data->>'currency') stored check(currency ~ '^[A-Z]{3}$'), transaction_date text generated always as (data->>'date') stored, receipt_id uuid generated always as (nullif(data->>'receiptId','')::uuid) stored references claimpilot.receipts(id) deferrable initially deferred, trip_id uuid generated always as (nullif(data->>'tripId','')::uuid) stored references claimpilot.trips(id) deferrable initially deferred, status text generated always as (data->>'status') stored check(status in ('draft','claimed'))
);
alter table claimpilot.expenses enable row level security;
create table claimpilot.claims (
 id uuid primary key,
 data jsonb not null check(jsonb_typeof(data)='object' and data->>'id'=id::text),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 employee_id uuid generated always as ((data->>'employeeId')::uuid) stored references claimpilot.profiles(id) deferrable initially deferred, reference text generated always as (data->>'reference') stored unique, status text generated always as (data->>'status') stored check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_INFORMATION','APPROVED','FINANCE_VERIFICATION','REIMBURSEMENT_PROCESSING','REIMBURSED','REJECTED'))
);
alter table claimpilot.claims enable row level security;
create table claimpilot.audit_logs (
 id uuid primary key,
 data jsonb not null check(jsonb_typeof(data)='object' and data->>'id'=id::text),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 actor_id uuid generated always as ((data->>'actorId')::uuid) stored references claimpilot.profiles(id) deferrable initially deferred, action text generated always as (data->>'action') stored, entity_id text generated always as (data->>'entityId') stored
);
alter table claimpilot.audit_logs enable row level security;
create table claimpilot.reimbursements (
 id uuid primary key,
 data jsonb not null check(jsonb_typeof(data)='object' and data->>'id'=id::text),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 claim_id uuid generated always as ((data->>'claimId')::uuid) stored unique references claimpilot.claims(id) deferrable initially deferred, payment_reference text generated always as (data->>'reference') stored not null, payment_date text generated always as (data->>'date') stored not null
);
alter table claimpilot.reimbursements enable row level security;
create table claimpilot.claim_expenses (
 claim_id uuid not null references claimpilot.claims(id) on delete cascade deferrable initially deferred,
 expense_id uuid not null unique references claimpilot.expenses(id) deferrable initially deferred,
 primary key(claim_id, expense_id)
);
create table claimpilot.investigations (
 id uuid primary key references claimpilot.claims(id) on delete cascade deferrable initially deferred,
 data jsonb not null, evaluated_at timestamptz not null default now()
);
create table claimpilot.policy_violations (
 id text primary key, expense_id uuid not null references claimpilot.expenses(id) deferrable initially deferred,
 policy_id uuid references claimpilot.expense_policies(id) deferrable initially deferred, data jsonb not null
);
create table claimpilot.duplicate_matches (
 id text primary key, expense_id uuid not null references claimpilot.expenses(id) deferrable initially deferred,
 related_expense_id uuid not null references claimpilot.expenses(id) deferrable initially deferred, data jsonb not null
);
create table claimpilot.approvals (
 id uuid primary key references claimpilot.audit_logs(id) deferrable initially deferred,
 claim_id uuid not null references claimpilot.claims(id) deferrable initially deferred,
 actor_id uuid not null references claimpilot.profiles(id) deferrable initially deferred,
 decision text not null check(decision in ('APPROVED','REJECTED','NEEDS_INFORMATION','FINANCE_VERIFICATION','REIMBURSEMENT_PROCESSING','REIMBURSED')), data jsonb not null
);
alter table claimpilot.claim_expenses enable row level security;
alter table claimpilot.investigations enable row level security;
alter table claimpilot.policy_violations enable row level security;
alter table claimpilot.duplicate_matches enable row level security;
alter table claimpilot.approvals enable row level security;
create index on claimpilot.expenses(employee_id,transaction_date);
create index on claimpilot.expenses(receipt_id);
create index on claimpilot.expenses(trip_id);
create index on claimpilot.receipts(employee_id);
create index on claimpilot.receipts(file_hash);
create index on claimpilot.claims(employee_id,status);
create index on claimpilot.trips(employee_id);
create index on claimpilot.audit_logs(entity_id);
create index on claimpilot.audit_logs(actor_id);
create index on claimpilot.claim_expenses(expense_id);
create index on claimpilot.policy_violations(expense_id);
create index on claimpilot.policy_violations(policy_id);
create index on claimpilot.duplicate_matches(expense_id);
create index on claimpilot.duplicate_matches(related_expense_id);
create index on claimpilot.approvals(claim_id);
create index on claimpilot.approvals(actor_id);
revoke all on all tables in schema claimpilot from public, anon, authenticated;
grant select,insert,update,delete on all tables in schema claimpilot to service_role;
-- No browser JWT policies: demo authentication is app-managed, so all SQL access is server-only.
-- Functions are SECURITY INVOKER and executable only by the server's service role.
create function public.claimpilot_read() returns jsonb language plpgsql security invoker
set search_path = '' as $$
declare result jsonb := '{}'::jsonb; version bigint;
begin
 select r.version into version from claimpilot.revision r where id=true;
 select result || jsonb_build_object('profiles',coalesce(jsonb_agg(t.data order by t.created_at,t.id),'[]'::jsonb)) into result from claimpilot.profiles t;
 select result || jsonb_build_object('departments',coalesce(jsonb_agg(t.data order by t.created_at,t.id),'[]'::jsonb)) into result from claimpilot.departments t;
 select result || jsonb_build_object('trips',coalesce(jsonb_agg(t.data order by t.created_at,t.id),'[]'::jsonb)) into result from claimpilot.trips t;
 select result || jsonb_build_object('policies',coalesce(jsonb_agg(t.data order by t.created_at,t.id),'[]'::jsonb)) into result from claimpilot.expense_policies t;
 select result || jsonb_build_object('expenses',coalesce(jsonb_agg(t.data order by t.created_at,t.id),'[]'::jsonb)) into result from claimpilot.expenses t;
 select result || jsonb_build_object('receipts',coalesce(jsonb_agg(t.data order by t.created_at,t.id),'[]'::jsonb)) into result from claimpilot.receipts t;
 select result || jsonb_build_object('claims',coalesce(jsonb_agg(t.data order by t.created_at,t.id),'[]'::jsonb)) into result from claimpilot.claims t;
 select result || jsonb_build_object('audits',coalesce(jsonb_agg(t.data order by t.created_at,t.id),'[]'::jsonb)) into result from claimpilot.audit_logs t;
 select result || jsonb_build_object('reimbursements',coalesce(jsonb_agg(t.data order by t.created_at,t.id),'[]'::jsonb)) into result from claimpilot.reimbursements t;
 return jsonb_build_object('state',result,'revision',version);
end; $$;
create function public.claimpilot_write(p_state jsonb, p_revision bigint) returns void language plpgsql security invoker
set search_path = '' as $$
declare current_version bigint; entry jsonb; claim jsonb; finding jsonb;
begin
 select version into current_version from claimpilot.revision where id=true for update;
 if current_version <> p_revision then raise exception 'Concurrent state update' using errcode='40001'; end if;
 for entry in select value from jsonb_array_elements(p_state->'profiles') loop
 insert into claimpilot.profiles(id,data) values((entry->>'id')::uuid,entry)
 on conflict(id) do update set data=excluded.data,updated_at=now();
 end loop;
 for entry in select value from jsonb_array_elements(p_state->'departments') loop
 insert into claimpilot.departments(id,data) values((entry->>'id')::uuid,entry)
 on conflict(id) do update set data=excluded.data,updated_at=now();
 end loop;
 for entry in select value from jsonb_array_elements(p_state->'trips') loop
 insert into claimpilot.trips(id,data) values((entry->>'id')::uuid,entry)
 on conflict(id) do update set data=excluded.data,updated_at=now();
 end loop;
 for entry in select value from jsonb_array_elements(p_state->'policies') loop
 insert into claimpilot.expense_policies(id,data) values((entry->>'id')::uuid,entry)
 on conflict(id) do update set data=excluded.data,updated_at=now();
 end loop;
 for entry in select value from jsonb_array_elements(p_state->'expenses') loop
 insert into claimpilot.expenses(id,data) values((entry->>'id')::uuid,entry)
 on conflict(id) do update set data=excluded.data,updated_at=now();
 end loop;
 for entry in select value from jsonb_array_elements(p_state->'receipts') loop
 insert into claimpilot.receipts(id,data) values((entry->>'id')::uuid,entry)
 on conflict(id) do update set data=excluded.data,updated_at=now();
 end loop;
 for entry in select value from jsonb_array_elements(p_state->'claims') loop
 insert into claimpilot.claims(id,data) values((entry->>'id')::uuid,entry)
 on conflict(id) do update set data=excluded.data,updated_at=now();
 end loop;
 for entry in select value from jsonb_array_elements(p_state->'audits') loop
 insert into claimpilot.audit_logs(id,data) values((entry->>'id')::uuid,entry)
 on conflict(id) do update set data=excluded.data,updated_at=now();
 end loop;
 for entry in select value from jsonb_array_elements(p_state->'reimbursements') loop
 insert into claimpilot.reimbursements(id,data) values((entry->>'id')::uuid,entry)
 on conflict(id) do update set data=excluded.data,updated_at=now();
 end loop;
 -- Only expenses support deletion, and the application permits it solely for unclaimed drafts.
 delete from claimpilot.expenses e where not exists(select 1 from jsonb_array_elements(p_state->'expenses') x where (x->>'id')::uuid=e.id) and e.status='draft';
 delete from claimpilot.claim_expenses;
 for claim in select value from jsonb_array_elements(p_state->'claims') loop
 insert into claimpilot.claim_expenses(claim_id,expense_id)
 select (claim->>'id')::uuid, value::uuid from jsonb_array_elements_text(claim->'expenseIds');
 end loop;
 delete from claimpilot.investigations;
 delete from claimpilot.policy_violations;
 delete from claimpilot.duplicate_matches;
 for entry in select value from jsonb_array_elements(coalesce(p_state->'evaluations','[]'::jsonb)) loop
 insert into claimpilot.investigations(id,data) values((entry->>'claimId')::uuid,entry);
 for finding in select value from jsonb_array_elements(entry->'findings') loop
 if finding->>'type'='policy_excess' then
 insert into claimpilot.policy_violations(id,expense_id,policy_id,data) values(finding->>'id',(finding->>'expenseId')::uuid,(finding->>'policyId')::uuid,finding) on conflict(id) do update set data=excluded.data;
 elsif finding->>'type'='duplicate' then
 insert into claimpilot.duplicate_matches(id,expense_id,related_expense_id,data) values(finding->>'id',(finding->>'expenseId')::uuid,(finding->'relatedIds'->>0)::uuid,finding) on conflict(id) do update set data=excluded.data;
 end if;
 end loop;
 end loop;
 insert into claimpilot.approvals(id,claim_id,actor_id,decision,data)
 select id,entity_id::uuid,actor_id,action,data from claimpilot.audit_logs
 where action in ('APPROVED','REJECTED','NEEDS_INFORMATION','FINANCE_VERIFICATION','REIMBURSEMENT_PROCESSING','REIMBURSED')
 and entity_id in (select id::text from claimpilot.claims)
 on conflict(id) do nothing;
 update claimpilot.revision set version=version+1 where id=true;
end; $$;
revoke execute on function public.claimpilot_read() from public, anon, authenticated;
revoke execute on function public.claimpilot_write(jsonb,bigint) from public, anon, authenticated;
grant execute on function public.claimpilot_read() to service_role;
grant execute on function public.claimpilot_write(jsonb,bigint) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('receipts','receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do nothing;
-- No storage.objects browser policies. Server authorizes and issues signed URLs for 60 seconds.
commit;
