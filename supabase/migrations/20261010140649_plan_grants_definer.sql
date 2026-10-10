-- service_role no puede leer auth.users, así que granted_plan fallaba al
-- llamarla el servidor (y con ella reserve_ai y /api/account para todos).
-- La función lee con los permisos de su dueño; sigue siendo solo para service_role.
alter function public.granted_plan(uuid) security definer;
revoke all on function public.granted_plan(uuid) from public, anon, authenticated;
grant execute on function public.granted_plan(uuid) to service_role;
