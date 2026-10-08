-- Supabase's optional automatic-RLS event trigger is an administration helper,
-- never an RPC for anonymous or signed-in clients. It may be absent locally.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;
