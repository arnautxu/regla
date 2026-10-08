-- Fresh, dedicated Supabase project. No automatic import of the legacy diary.
create table public.diary_state (
 user_id uuid primary key references auth.users on delete cascade,
 revision bigint not null default 0, settings jsonb,
 updated_at timestamptz not null default now()
);
create table public.diary_days (
 user_id uuid not null references auth.users on delete cascade,
 date date not null, payload jsonb not null, primary key(user_id,date)
);
create table public.diary_cycles (
 user_id uuid not null references auth.users on delete cascade,
 id text not null, payload jsonb not null, primary key(user_id,id)
);
create table public.diary_memories (
 user_id uuid not null references auth.users on delete cascade,
 id text not null, payload jsonb not null, primary key(user_id,id)
);
create table public.push_accounts (
 user_id uuid primary key references auth.users on delete cascade,
 document jsonb not null default '{"version":1,"subs":[]}',
 revision bigint not null default 0
);
create table public.partner_links (
 owner_id uuid primary key references auth.users on delete cascade,
 partner_id uuid not null unique references auth.users on delete cascade,
 check(owner_id <> partner_id)
);
create table public.partner_invites (
 token_hash text primary key,
 owner_id uuid not null unique references auth.users on delete cascade,
 expires_at timestamptz not null
);
create table public.billing_accounts (
 user_id uuid primary key references auth.users on delete cascade,
 customer_id text unique, subscription_id text unique,
 plan text not null default 'free' check(plan in ('free','plus','voice')),
 status text not null default 'inactive', paid_until timestamptz, billing_hold boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.billing_events (
 id text primary key, received_at timestamptz not null default now()
);
create table public.ai_policy (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 max_voice_concurrent integer not null default 1 check(max_voice_concurrent between 1 and 10),
 monthly_micro_usd bigint not null default 100000000 check(monthly_micro_usd >= 0)
);
insert into public.ai_policy(id) values(true);
create table public.ai_reservations (
 id uuid primary key, user_id uuid references auth.users on delete set null,
 kind text not null check(kind in ('chat','voice')),
 plan text not null, period date not null,
 status text not null default 'reserved' check(status in ('reserved','settled')),
 reserved_micro_usd bigint not null check(reserved_micro_usd >= 0),
 charged_micro_usd bigint check(charged_micro_usd >= 0),
 voice_seconds integer not null default 0 check(voice_seconds >= 0),
 agent_id text, agent_deleted boolean not null default false, actual_voice_seconds integer,
 provider_credits numeric, provider_id text unique, created_at timestamptz not null default now(),
 expires_at timestamptz not null
);
create index ai_user_period on public.ai_reservations(user_id,period);
create index ai_global_period on public.ai_reservations(period);
create index ai_user_recent on public.ai_reservations(user_id,created_at);
create index ai_voice_pending on public.ai_reservations(expires_at) where kind='voice' and status='reserved';
create index ai_agent_cleanup on public.ai_reservations(expires_at) where agent_id is not null and not agent_deleted;
create table public.notification_claims (
 user_id uuid not null references auth.users on delete cascade,
 tag text not null, created_at timestamptz not null default now(), primary key(user_id,tag)
);

-- No client writes: diary transactions, billing and cost policies are server-owned.
-- Users can read their own diary and usage through RLS. No anonymous access.
do $$ declare t text; begin
 foreach t in array array['diary_state','diary_days','diary_cycles','diary_memories','push_accounts','partner_links','partner_invites','billing_accounts','billing_events','ai_policy','ai_reservations','notification_claims'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['diary_state','diary_days','diary_cycles','diary_memories','billing_accounts','ai_reservations'] loop
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy own_rows on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
 end loop;
end $$;

-- All functions use SECURITY INVOKER and are callable by service_role ONLY.
create function public.save_diary(p_user uuid, p_revision bigint, p_doc jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare r bigint; begin
 insert into public.diary_state(user_id) values(p_user) on conflict do nothing;
 select revision into r from public.diary_state where user_id=p_user for update;
 if r <> p_revision then raise exception 'diary_conflict'; end if;
 if jsonb_array_length(p_doc->'days') = 0 and exists(select 1 from public.diary_days where user_id=p_user) then
  raise exception 'empty_diary';
 end if;
 delete from public.diary_days where user_id=p_user and date not in (select (x->>'date')::date from jsonb_array_elements(p_doc->'days') x);
 insert into public.diary_days select p_user,(x->>'date')::date,x from jsonb_array_elements(p_doc->'days') x
 on conflict(user_id,date) do update set payload=excluded.payload where diary_days.payload is distinct from excluded.payload;
 delete from public.diary_cycles where user_id=p_user and id not in (select x->>'id' from jsonb_array_elements(p_doc->'cycles') x);
 insert into public.diary_cycles select p_user,x->>'id',x from jsonb_array_elements(p_doc->'cycles') x
 on conflict(user_id,id) do update set payload=excluded.payload where diary_cycles.payload is distinct from excluded.payload;
 if p_doc ? 'memories' then
  delete from public.diary_memories where user_id=p_user and id not in (select x->>'id' from jsonb_array_elements(p_doc->'memories') x);
  insert into public.diary_memories select p_user,x->>'id',x from jsonb_array_elements(p_doc->'memories') x
  on conflict(user_id,id) do update set payload=excluded.payload where diary_memories.payload is distinct from excluded.payload;
 end if;
 update public.diary_state set settings=coalesce(settings,'{}') || coalesce(nullif(p_doc->'settings','null'),'{}'),
  revision=r+1,updated_at=now() where user_id=p_user;
 return r+1;
end $$;
create function public.read_diary(p_user uuid)
returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('version',1,'revision',coalesce((select revision from public.diary_state where user_id=p_user),0),
 'updatedAt',coalesce((select updated_at from public.diary_state where user_id=p_user),'1970-01-01'::timestamptz),
 'settings',(select settings from public.diary_state where user_id=p_user),
 'days',coalesce((select jsonb_agg(payload order by date) from public.diary_days where user_id=p_user),'[]'),
 'cycles',coalesce((select jsonb_agg(payload) from public.diary_cycles where user_id=p_user),'[]'),
 'memories',coalesce((select jsonb_agg(payload) from public.diary_memories where user_id=p_user),'[]'));
$$;

create function public.reserve_ai(p_user uuid,p_id uuid,p_kind text)
returns jsonb language plpgsql set search_path = '' as $$
declare pol public.ai_policy; b public.billing_accounts; pl text := 'free';
 period_start date := date_trunc('month',now() at time zone 'UTC')::date;
 amount bigint; seconds integer; personal_cap bigint; total bigint; messages integer; used_seconds integer;
begin
 -- Serialize budget decisions, including simultaneous requests on different instances.
 perform pg_advisory_xact_lock(82175001);
 select * into pol from public.ai_policy where id=true;
 if pol is null or not pol.enabled then return jsonb_build_object('error','paused'); end if;
 if p_kind not in ('chat','voice') then return jsonb_build_object('error','invalid'); end if;
 if exists(select 1 from public.ai_reservations where id=p_id) then return jsonb_build_object('error','duplicate'); end if;
 select * into b from public.billing_accounts where user_id=p_user;
 if b.status='active' and b.paid_until > now() and not b.billing_hold then pl:=b.plan; end if;
 if p_kind='voice' and pl <> 'voice' then return jsonb_build_object('error','voice_plan'); end if;
 if p_kind='voice' and (select count(*) from public.ai_reservations where kind='voice' and status='reserved' and expires_at>now()) >= pol.max_voice_concurrent then return jsonb_build_object('error','busy'); end if;
 amount:=case when p_kind='chat' then 6000 else 300000 end;
 seconds:=case when p_kind='voice' then 120 else 0 end;
 personal_cap:=case pl when 'free' then 60000 when 'plus' then 2000000 else 6000000 end;
 if (select count(*) from public.ai_reservations where user_id=p_user and created_at > now()-interval '1 minute') >= 10 then
  return jsonb_build_object('error','rate');
 end if;
 if exists(select 1 from public.ai_reservations where user_id=p_user and status='reserved' and expires_at > now()) then
  return jsonb_build_object('error','busy');
 end if;
 select count(*) filter(where kind='chat'),coalesce(sum(voice_seconds),0),
 coalesce(sum(coalesce(charged_micro_usd,reserved_micro_usd)),0)
 into messages,used_seconds,total from public.ai_reservations
 where user_id=p_user and (case when pl='free' then true else period=period_start end);
 if p_kind='chat' and messages >= (case pl when 'free' then 10 else 300 end) then return jsonb_build_object('error','messages'); end if;
 if p_kind='voice' and used_seconds+seconds > 1200 then return jsonb_build_object('error','minutes'); end if;
 if total+amount > personal_cap then return jsonb_build_object('error','budget'); end if;
 select coalesce(sum(coalesce(charged_micro_usd,reserved_micro_usd)),0) into total from public.ai_reservations where period=period_start;
 if total+amount > pol.monthly_micro_usd then return jsonb_build_object('error','global_budget'); end if;
 insert into public.ai_reservations(id,user_id,kind,plan,period,reserved_micro_usd,voice_seconds,expires_at)
 values(p_id,p_user,p_kind,pl,period_start,amount,seconds,now()+case p_kind when 'voice' then interval '18 minutes' else interval '2 minutes' end);
 return jsonb_build_object('id',p_id,'reserved',amount,'seconds',seconds,'plan',pl);
end $$;

create function public.settle_ai(p_id uuid,p_cost bigint,p_seconds integer default null,p_provider text default null)
returns void language plpgsql set search_path = '' as $$
declare r public.ai_reservations; begin
 perform pg_advisory_xact_lock(82175001);
 select * into r from public.ai_reservations where id=p_id for update;
 if r is null or r.status='settled' then return; end if;
 if p_cost < 0 or p_seconds < 0 then raise exception 'invalid_usage'; end if;
 -- An unexpected provider price overrun stops further spending globally.
 if p_cost > r.reserved_micro_usd or p_seconds > r.voice_seconds then
  update public.ai_policy set enabled=false where id=true;
 end if;
 update public.ai_reservations set status='settled',charged_micro_usd=p_cost,
 actual_voice_seconds=p_seconds,provider_id=coalesce(p_provider,provider_id) where id=p_id;
end $$;

create function public.accept_partner(p_partner uuid,p_hash text)
returns boolean language plpgsql set search_path = '' as $$
declare owner uuid; begin
 delete from public.partner_invites where token_hash=p_hash and expires_at > now() returning owner_id into owner;
 if owner is null or owner=p_partner then return false; end if;
 insert into public.partner_links(owner_id,partner_id) values(owner,p_partner);
 return true;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('save_diary','read_diary','reserve_ai','settle_ai','accept_partner') loop
  execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
alter table public.billing_accounts add column last_event_created bigint not null default 0;
alter table public.billing_accounts add column checkout_session text;
alter table public.billing_accounts add column checkout_until timestamptz;
create function public.apply_billing(p_event text,p_created bigint,p_customer text,p_subscription text,p_plan text,p_status text,p_until timestamptz)
returns void language plpgsql set search_path = '' as $$
begin
 perform pg_advisory_xact_lock(hashtext(p_customer));
 if exists(select 1 from public.billing_events where id=p_event) then return; end if;
 if not exists(select 1 from public.billing_accounts where customer_id=p_customer) then raise exception 'unknown_customer'; end if;
 -- Refund/dispute holds survive subsequent paid-invoice and subscription events.
 -- Resolve manually after reviewing the payment; a replay cannot restore access.
 if p_status='revoked' then
  update public.billing_accounts set billing_hold=true,status='inactive',paid_until=null where customer_id=p_customer;
 end if;
 update public.billing_accounts set subscription_id=p_subscription,plan=p_plan,
 status=case when billing_hold then 'inactive' else p_status end,
 paid_until=case when billing_hold then null else p_until end,
 last_event_created=p_created,updated_at=now()
 where customer_id=p_customer and last_event_created <= p_created;
 insert into public.billing_events(id) values(p_event);
end $$;
revoke all on function public.apply_billing from public,anon,authenticated;
grant execute on function public.apply_billing to service_role;
create function public.claim_checkout(p_user uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
 insert into public.billing_accounts(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.billing_accounts where user_id=p_user for update;
 if exists(select 1 from public.billing_accounts where user_id=p_user and
  (billing_hold or checkout_until > now() or (status='active' and paid_until > now()))) then return false; end if;
 update public.billing_accounts set checkout_session=null,checkout_until=now()+interval '31 minutes' where user_id=p_user;
 return true;
end $$;
revoke all on function public.claim_checkout from public,anon,authenticated;
grant execute on function public.claim_checkout to service_role;

-- Explicit deletion keeps a revision tombstone, so an old device cannot
-- resurrect the erased diary with a delayed upload.
create function public.erase_diary(p_user uuid) returns bigint
language plpgsql set search_path = '' as $$
declare r bigint; begin
 insert into public.diary_state(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.diary_state where user_id=p_user for update;
 delete from public.diary_days where user_id=p_user;
 delete from public.diary_cycles where user_id=p_user;
 delete from public.diary_memories where user_id=p_user;
 delete from public.push_accounts where user_id=p_user;
 delete from public.partner_links where owner_id=p_user;
 delete from public.partner_invites where owner_id=p_user;
 update public.diary_state set revision=revision+1,settings=null,updated_at=now() where user_id=p_user returning revision into r;
 return r;
end $$;
revoke all on function public.erase_diary from public,anon,authenticated;
grant execute on function public.erase_diary to service_role;
