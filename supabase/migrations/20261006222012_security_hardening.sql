-- Pin the immutable-evidence trigger search path and restrict the hosted
-- platform's automatic-RLS helper to internal execution, when present.
alter function public.gandiva_immutable() set search_path = pg_catalog, public;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
