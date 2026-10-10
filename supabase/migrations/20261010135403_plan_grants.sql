-- Planes regalados: un plan de pago para siempre, sin Stripe ni Apple.
-- Va por correo (no por id de cuenta) para que valga aunque la cuenta aún
-- no exista o se borre y se vuelva a crear. Ningún webhook ni sincronización
-- de compras toca esta tabla, así que nada la caduca ni la pisa: solo se
-- quita borrando la fila a mano.
create table public.plan_grants (
 email text primary key check (email = lower(btrim(email))),
 plan text not null check (plan in ('plus','voice')),
 note text,
 created_at timestamptz not null default now()
);
alter table public.plan_grants enable row level security;
revoke all on public.plan_grants from anon, authenticated;
grant all on public.plan_grants to service_role;

-- Solo correos confirmados: que nadie se quede el regalo registrándose con un correo ajeno.
create function public.granted_plan(p_user uuid)
returns text language sql stable set search_path = '' as $$
 select g.plan from public.plan_grants g join auth.users u on lower(u.email) = g.email
 where u.id = p_user and u.email_confirmed_at is not null
$$;
revoke all on function public.granted_plan from public, anon, authenticated;
grant execute on function public.granted_plan to service_role;

-- reserve_ai igual que en 20261008113950, pero un regalo cuenta como plan activo.
create or replace function public.reserve_ai(p_user uuid,p_id uuid,p_kind text)
returns jsonb language plpgsql set search_path = '' as $$
declare pol public.ai_policy; b public.billing_accounts; pl text := 'free'; g text;
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
 g := public.granted_plan(p_user);
 if g='voice' or (g='plus' and pl='free') then pl:=g; end if;
 if p_kind='chat' and pl='free' then return jsonb_build_object('error','plus_required'); end if;
 if p_kind='voice' and pl <> 'voice' then return jsonb_build_object('error','voice_plan'); end if;
 if p_kind='voice' and (select count(*) from public.ai_reservations where kind='voice' and status='reserved' and expires_at>now()) >= pol.max_voice_concurrent then return jsonb_build_object('error','busy'); end if;
 amount:=case when p_kind='chat' then 6000 else 300000 end;
 seconds:=case when p_kind='voice' then 120 else 0 end;
 personal_cap:=case pl when 'free' then 0 when 'plus' then 2000000 else 6000000 end;
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
 if p_kind='chat' and messages >= (case pl when 'free' then 0 else 300 end) then return jsonb_build_object('error','messages'); end if;
 if p_kind='voice' and used_seconds+seconds > 1200 then return jsonb_build_object('error','minutes'); end if;
 if total+amount > personal_cap then return jsonb_build_object('error','budget'); end if;
 select coalesce(sum(coalesce(charged_micro_usd,reserved_micro_usd)),0) into total from public.ai_reservations where period=period_start;
 if total+amount > pol.monthly_micro_usd then return jsonb_build_object('error','global_budget'); end if;
 insert into public.ai_reservations(id,user_id,kind,plan,period,reserved_micro_usd,voice_seconds,expires_at)
 values(p_id,p_user,p_kind,pl,period_start,amount,seconds,now()+case p_kind when 'voice' then interval '18 minutes' else interval '2 minutes' end);
 return jsonb_build_object('id',p_id,'reserved',amount,'seconds',seconds,'plan',pl);
end $$;
