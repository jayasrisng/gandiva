-- Read-only post-setup verification for the Gandiva database.
select c.relname as table_name,c.relrowsecurity as rls_enabled,
 obj_description(c.oid,'pg_class') as description
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by c.relname;

select id,public,file_size_limit from storage.buckets
where id in ('product-images','generated-assets','audio') order by id;

select p.proname,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'gandiva_%' order by p.proname;

select version,name from supabase_migrations.schema_migrations order by version;
