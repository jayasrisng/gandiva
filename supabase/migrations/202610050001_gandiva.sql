-- Gandiva V1. Apply ONLY to a new, dedicated Gandiva Supabase project.
create extension if not exists pgcrypto;
create table public.merchant_profiles (
 id uuid primary key references auth.users(id), business_name text not null default 'My business', created_at timestamptz not null default now()
);
create function public.gandiva_create_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into merchant_profiles(id,business_name) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'business_name',''),'My business'));
 return new;
end $$;
create trigger gandiva_auth_profile after insert on auth.users for each row execute function public.gandiva_create_profile();
create table public.products (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null default 'Untitled product', category text not null default 'other',
 status text not null default 'source' check(status in ('source','analyzing','truth_review','truth_confirmed','generating','verifying','review','approved')),
 current_truth_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id, owner_id)
);
create table public.product_assets (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, owner_id uuid not null,
 kind text not null check(kind in ('original','derivative','audio','generated')),
 bucket text not null check(bucket in ('product-images','generated-assets','audio')),
 path text not null unique, mime text not null, size_bytes bigint not null check(size_bytes>0), sha256 text not null,
 parent_asset_id uuid, created_at timestamptz not null default now(),
 foreign key(product_id,owner_id) references public.products(id,owner_id), unique(id,product_id,owner_id),
 foreign key(parent_asset_id,product_id,owner_id) references public.product_assets(id,product_id,owner_id)
);
create table public.source_transcripts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 audio_path text not null unique, text text not null, model text not null, language text not null, created_at timestamptz not null default now()
);
create table public.product_descriptions (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, owner_id uuid not null,
 text text not null, raw_transcript text, language text not null, model text, audio_asset_id uuid, parent_revision_id uuid,
 created_at timestamptz not null default now(), unique(id,product_id,owner_id),
 foreign key(product_id,owner_id) references public.products(id,owner_id),
 foreign key(audio_asset_id,product_id,owner_id) references public.product_assets(id,product_id,owner_id),
 foreign key(parent_revision_id,product_id,owner_id) references public.product_descriptions(id,product_id,owner_id)
);
create table public.truth_versions (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, owner_id uuid not null, version int not null,
 description_id uuid not null, source_asset_ids uuid[] not null, record jsonb not null, metadata jsonb not null default '{}',
 confirmed_at timestamptz, confirmed_by uuid references auth.users(id), created_at timestamptz not null default now(),
 unique(product_id,version), unique(id,product_id,owner_id),
 foreign key(product_id,owner_id) references public.products(id,owner_id),
 foreign key(description_id,product_id,owner_id) references public.product_descriptions(id,product_id,owner_id)
);
alter table public.products add constraint product_current_truth foreign key(current_truth_id,id,owner_id) references public.truth_versions(id,product_id,owner_id);
create table public.generations (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, owner_id uuid not null, version int not null,
 truth_version_id uuid not null, parent_generation_id uuid, output_asset_id uuid,
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 direction text not null, correction jsonb, metadata jsonb not null default '{}', created_at timestamptz not null default now(),
 unique(product_id,version), unique(id,product_id,owner_id),
 foreign key(product_id,owner_id) references public.products(id,owner_id),
 foreign key(truth_version_id,product_id,owner_id) references public.truth_versions(id,product_id,owner_id),
 foreign key(parent_generation_id,product_id,owner_id) references public.generations(id,product_id,owner_id),
 foreign key(output_asset_id,product_id,owner_id) references public.product_assets(id,product_id,owner_id)
);
create table public.verification_runs (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, owner_id uuid not null,
 generation_id uuid not null, truth_version_id uuid not null, version int not null,
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 report jsonb, metadata jsonb not null default '{}', created_at timestamptz not null default now(),
 unique(generation_id,version), unique(id,product_id,owner_id),
 foreign key(generation_id,product_id,owner_id) references public.generations(id,product_id,owner_id),
 foreign key(truth_version_id,product_id,owner_id) references public.truth_versions(id,product_id,owner_id)
);
create table public.approvals (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, owner_id uuid not null,
 kind text not null check(kind in ('truth','final')), truth_version_id uuid not null, generation_id uuid, verification_id uuid,
 statement text not null, acknowledged_warnings text[] not null default '{}', created_at timestamptz not null default now(),
 unique(id,product_id,owner_id),
 foreign key(truth_version_id,product_id,owner_id) references public.truth_versions(id,product_id,owner_id),
 foreign key(generation_id,product_id,owner_id) references public.generations(id,product_id,owner_id),
 foreign key(verification_id,product_id,owner_id) references public.verification_runs(id,product_id,owner_id),
 check((kind='truth' and generation_id is null and verification_id is null) or (kind='final' and generation_id is not null and verification_id is not null))
);
create unique index final_approval_target on public.approvals(truth_version_id,generation_id,verification_id) where kind='final';
create table public.passports (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, owner_id uuid not null, approval_id uuid not null unique,
 snapshot jsonb not null, manifest_sha256 text not null, created_at timestamptz not null default now(),
 foreign key(approval_id,product_id,owner_id) references public.approvals(id,product_id,owner_id)
);
create table public.jobs (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, owner_id uuid not null,
 kind text not null check(kind in ('analyze','generate','verify')),
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 idempotency_key text not null, payload jsonb not null, result jsonb, error text,
 attempts int not null default 0, lease_token uuid, lease_until timestamptz, created_at timestamptz not null default now(), completed_at timestamptz,
 unique(owner_id,idempotency_key), foreign key(product_id,owner_id) references public.products(id,owner_id)
);
create index jobs_queue on public.jobs(status,created_at);
create index product_owner on public.products(owner_id,created_at desc);

-- All browser writes go through authenticated server routes and transactional RPCs.
-- Service-role routes must validate the owner before invoking these service-only functions.
do $$ declare t text; begin
 foreach t in array array['merchant_profiles','products','product_assets','source_transcripts','product_descriptions','truth_versions','generations','verification_runs','approvals','passports','jobs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy owner_read on public.%I for select to authenticated using (%s)',t,case when t='merchant_profiles' then 'id = auth.uid()' else 'owner_id = auth.uid()' end);
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit) values
 ('product-images','product-images',false,15728640),('generated-assets','generated-assets',false,26214400),('audio','audio',false,26214400)
on conflict(id) do nothing;
create policy gandiva_asset_read on storage.objects for select to authenticated
 using(bucket_id in ('product-images','generated-assets','audio') and (storage.foldername(name))[1]=auth.uid()::text);

create function public.gandiva_immutable() returns trigger language plpgsql as $$
begin
 if tg_table_name='truth_versions' then
  if old.confirmed_at is null and new.confirmed_at is not null
    and (to_jsonb(new)-'confirmed_at'-'confirmed_by')=(to_jsonb(old)-'confirmed_at'-'confirmed_by') then return new; end if;
 elsif tg_table_name='generations' or tg_table_name='verification_runs' then
  if old.status <> 'completed' then return new; end if;
 end if;
 raise exception 'Evidence records are immutable';
end $$;
do $$ declare t text; begin
 foreach t in array array['source_transcripts','product_assets','product_descriptions','truth_versions','generations','verification_runs','approvals','passports'] loop
 execute format('create trigger immutable_record before update on public.%I for each row execute function public.gandiva_immutable()',t);
 end loop;
end $$;

create function public.gandiva_intake(p_owner uuid,p_id uuid,p_key text,p_assets jsonb,p_description jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare a jsonb; existing uuid; description_id uuid:=gen_random_uuid(); begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||p_key,0));
 select product_id into existing from jobs where owner_id=p_owner and idempotency_key=p_key;
 if existing is not null then return existing; end if;
 insert into products(id,owner_id,status) values(p_id,p_owner,'analyzing');
 for a in select value from jsonb_array_elements(p_assets) loop
 insert into product_assets(id,product_id,owner_id,kind,bucket,path,mime,size_bytes,sha256,parent_asset_id)
 values((a->>'id')::uuid,p_id,p_owner,a->>'kind',a->>'bucket',a->>'path',a->>'mime',(a->>'size_bytes')::bigint,a->>'sha256',nullif(a->>'parent_asset_id','')::uuid);
 end loop;
 insert into product_descriptions(id,product_id,owner_id,text,raw_transcript,language,model,audio_asset_id)
 values(description_id,p_id,p_owner,p_description->>'text',p_description->>'raw_transcript',p_description->>'language',p_description->>'model',nullif(p_description->>'audio_asset_id','')::uuid);
 insert into jobs(product_id,owner_id,kind,idempotency_key,payload) values(p_id,p_owner,'analyze',p_key,jsonb_build_object('descriptionId',description_id));
 return p_id;
end $$;

create function public.gandiva_add_sources(p_owner uuid,p_product uuid,p_base uuid,p_key text,p_assets jsonb,p_description uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare p products; a jsonb; job_id uuid; begin
 select * into p from products where id=p_product and owner_id=p_owner for update;
 if p.id is null then raise exception 'Product not found'; end if;
 select id into job_id from jobs where owner_id=p_owner and idempotency_key=p_key and product_id=p.id;
 if job_id is not null then return job_id; end if;
 if p.current_truth_id is distinct from p_base then raise exception 'Stale Product Truth'; end if;
 if exists(select 1 from jobs where product_id=p.id and status in ('queued','running')) then raise exception 'Wait for active jobs'; end if;
 if not exists(select 1 from product_descriptions where id=p_description and product_id=p.id and owner_id=p_owner) then raise exception 'Source description required'; end if;
 if (select count(*) from product_assets where product_id=p.id and kind='original')+(select count(*) from jsonb_array_elements(p_assets) x where x->>'kind'='original')>6 then raise exception 'Use at most six original sources'; end if;
 for a in select value from jsonb_array_elements(p_assets) loop
 if a->>'kind' not in ('original','derivative') then raise exception 'Photo sources required'; end if;
 insert into product_assets(id,product_id,owner_id,kind,bucket,path,mime,size_bytes,sha256,parent_asset_id)
 values((a->>'id')::uuid,p.id,p_owner,a->>'kind',a->>'bucket',a->>'path',a->>'mime',(a->>'size_bytes')::bigint,a->>'sha256',nullif(a->>'parent_asset_id','')::uuid);
 end loop;
 insert into jobs(product_id,owner_id,kind,idempotency_key,payload) values(p.id,p_owner,'analyze',p_key,jsonb_build_object('descriptionId',p_description)) returning id into job_id;
 update products set current_truth_id=null,status='analyzing',updated_at=now() where id=p.id;
 return job_id;
end $$;

create function public.gandiva_save_truth(p_owner uuid,p_product uuid,p_base uuid,p_record jsonb,p_description_text text) returns uuid
language plpgsql security definer set search_path=public as $$
declare p products; base truth_versions; new_id uuid:=gen_random_uuid(); description_id uuid; begin
 select * into p from products where id=p_product and owner_id=p_owner for update;
 if p.id is null or p.current_truth_id is distinct from p_base then raise exception 'Stale Product Truth'; end if;
 if exists(select 1 from jobs where product_id=p.id and status in ('queued','running')) then raise exception 'Wait for active jobs'; end if;
 select * into base from truth_versions where id=p_base and product_id=p.id;
 description_id:=base.description_id;
 if p_description_text is not null then
 description_id:=gen_random_uuid();
 insert into product_descriptions(id,product_id,owner_id,text,language,parent_revision_id) values(description_id,p.id,p_owner,p_description_text,'merchant_edit',base.description_id);
 end if;
 insert into truth_versions(id,product_id,owner_id,version,description_id,source_asset_ids,record,metadata)
 values(new_id,p.id,p_owner,base.version+1,description_id,base.source_asset_ids,p_record,jsonb_build_object('source','merchant_revision','parentTruthId',p_base));
 update products set current_truth_id=new_id,status='truth_review',name=p_record->>'title',updated_at=now() where id=p.id;
 return new_id;
end $$;

create function public.gandiva_confirm_truth(p_owner uuid,p_product uuid,p_truth uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare p products; t truth_versions; approval_id uuid; begin
 select * into p from products where id=p_product and owner_id=p_owner for update;
 if p.id is null or p.current_truth_id is distinct from p_truth then raise exception 'Stale Product Truth'; end if;
 select * into t from truth_versions where id=p_truth;
 if t.confirmed_at is not null then select id into approval_id from approvals where truth_version_id=p_truth and kind='truth'; return approval_id; end if;
 update truth_versions set confirmed_at=now(),confirmed_by=p_owner where id=p_truth;
 insert into approvals(product_id,owner_id,kind,truth_version_id,statement) values(p.id,p_owner,'truth',t.id,'I confirm this Product Truth record. My claims remain separate from photographic evidence.') returning id into approval_id;
 update products set status='truth_confirmed',updated_at=now() where id=p.id;
 return approval_id;
end $$;

create function public.gandiva_enqueue(p_owner uuid,p_product uuid,p_kind text,p_key text,p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare p products; t truth_versions; g generations; target_id uuid:=gen_random_uuid(); job_id uuid; begin
 select * into p from products where id=p_product and owner_id=p_owner for update;
 if p.id is null then raise exception 'Product not found'; end if;
 select id into job_id from jobs where owner_id=p_owner and idempotency_key=p_key and product_id=p.id;
 if job_id is not null then return job_id; end if;
 if exists(select 1 from jobs where product_id=p.id and status in ('queued','running')) then raise exception 'Wait for the current job to finish'; end if;
 if p_kind='analyze' then
 insert into jobs(product_id,owner_id,kind,idempotency_key,payload) values(p.id,p_owner,p_kind,p_key,p_payload) returning id into job_id;
 update products set status='analyzing',updated_at=now() where id=p.id; return job_id;
 end if;
 select * into t from truth_versions where id=p.current_truth_id and confirmed_at is not null;
 if t.id is null or t.id is distinct from (p_payload->>'truthId')::uuid then raise exception 'Confirm current Product Truth first'; end if;
 if p_kind='generate' then
 if p_payload->>'parentId' is not null then
 select * into g from generations where id=(p_payload->>'parentId')::uuid and product_id=p.id and status='completed';
 if g.id is null then raise exception 'Correction target not found'; end if;
 end if;
 insert into generations(id,product_id,owner_id,version,truth_version_id,parent_generation_id,direction,correction)
 values(target_id,p.id,p_owner,coalesce((select max(version) from generations where product_id=p.id),0)+1,t.id,g.id,p_payload->>'direction',p_payload->'correction');
 p_payload:=p_payload||jsonb_build_object('generationId',target_id);
 elsif p_kind='verify' then
 select * into g from generations where id=(p_payload->>'generationId')::uuid and product_id=p.id and truth_version_id=t.id and status='completed';
 if g.id is null then raise exception 'Image does not match current truth'; end if;
 insert into verification_runs(id,product_id,owner_id,generation_id,truth_version_id,version)
 values(target_id,p.id,p_owner,g.id,t.id,coalesce((select max(version) from verification_runs where generation_id=g.id),0)+1);
 p_payload:=p_payload||jsonb_build_object('verificationId',target_id);
 else raise exception 'Invalid job kind'; end if;
 insert into jobs(product_id,owner_id,kind,idempotency_key,payload) values(p.id,p_owner,p_kind,p_key,p_payload) returning id into job_id;
 update products set status=case when p_kind='generate' then 'generating' else 'verifying' end,updated_at=now() where id=p.id;
 return job_id;
end $$;

create function public.gandiva_claim_job() returns setof jobs
language plpgsql security definer set search_path=public as $$
declare j jobs; begin
 select * into j from jobs where (status='queued' or (status='running' and lease_until<now())) order by created_at for update skip locked limit 1;
 if j.id is null then return; end if;
 -- An interrupted provider call may have completed remotely; don't silently spend again.
 if j.status='running' then
 update jobs set status='failed',error='Execution lease expired. Outcome may be unknown; review before retrying.',lease_until=null where id=j.id;
 if j.kind='generate' then update generations set status='failed' where id=(j.payload->>'generationId')::uuid; end if;
 if j.kind='verify' then update verification_runs set status='failed' where id=(j.payload->>'verificationId')::uuid; end if;
 return;
 end if;
 update jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '20 minutes' where id=j.id returning * into j;
 return next j;
end $$;

create function public.gandiva_finish_job(p_job uuid,p_lease uuid,p_result jsonb,p_asset jsonb default null) returns void
language plpgsql security definer set search_path=public as $$
declare j jobs; p products; new_id uuid:=gen_random_uuid(); t_id uuid; asset_id uuid; verification_id uuid:=gen_random_uuid(); begin
 select * into j from jobs where id=p_job and status='running' and lease_token=p_lease and lease_until>now() for update;
 if j.id is null then raise exception 'Stale job execution'; end if;
 select * into p from products where id=j.product_id for update;
 if j.kind='analyze' then
 if jsonb_array_length(p_result->'sourceIds')=0 or exists(select 1 from jsonb_array_elements_text(p_result->'sourceIds') x where not exists(select 1 from product_assets a where a.id=x::uuid and a.product_id=p.id and a.owner_id=j.owner_id and a.kind='original')) then raise exception 'Invalid source evidence'; end if;
 insert into truth_versions(id,product_id,owner_id,version,description_id,source_asset_ids,record,metadata)
 values(new_id,p.id,j.owner_id,coalesce((select max(version) from truth_versions where product_id=p.id),0)+1,(j.payload->>'descriptionId')::uuid,
 array(select jsonb_array_elements_text(p_result->'sourceIds')::uuid),p_result->'truth',p_result->'metadata');
 update products set current_truth_id=new_id,name=p_result->'truth'->>'title',category=p_result->'truth'->>'category',status='truth_review',updated_at=now() where id=p.id;
 elsif j.kind='generate' then
 asset_id:=(p_asset->>'id')::uuid;
 insert into product_assets(id,product_id,owner_id,kind,bucket,path,mime,size_bytes,sha256)
 values(asset_id,p.id,j.owner_id,'generated','generated-assets',p_asset->>'path',p_asset->>'mime',(p_asset->>'size_bytes')::bigint,p_asset->>'sha256');
 update generations set status='completed',output_asset_id=asset_id,metadata=p_result where id=(j.payload->>'generationId')::uuid returning truth_version_id into t_id;
 insert into verification_runs(id,product_id,owner_id,generation_id,truth_version_id,version) values(verification_id,p.id,j.owner_id,(j.payload->>'generationId')::uuid,t_id,1);
 insert into jobs(product_id,owner_id,kind,idempotency_key,payload) values(p.id,j.owner_id,'verify','verify-'||verification_id,jsonb_build_object('verificationId',verification_id,'generationId',j.payload->>'generationId','truthId',t_id));
 update products set status='verifying',updated_at=now() where id=p.id;
 else
 update verification_runs set status='completed',report=p_result->'report',metadata=p_result->'metadata' where id=(j.payload->>'verificationId')::uuid;
 update products set status='review',updated_at=now() where id=p.id;
 end if;
 update jobs set status='completed',result=p_result,completed_at=now(),lease_until=null where id=j.id;
end $$;

create function public.gandiva_fail_job(p_job uuid,p_lease uuid,p_error text) returns void
language plpgsql security definer set search_path=public as $$
declare j jobs; begin
 select * into j from jobs where id=p_job and status='running' and lease_token=p_lease for update;
 if j.id is null then return; end if;
 update jobs set status='failed',error=left(p_error,1000),lease_until=null,completed_at=now() where id=j.id;
 if j.kind='generate' then update generations set status='failed' where id=(j.payload->>'generationId')::uuid; end if;
 if j.kind='verify' then update verification_runs set status='failed' where id=(j.payload->>'verificationId')::uuid; end if;
end $$;

create function public.gandiva_approve(p_owner uuid,p_product uuid,p_truth uuid,p_generation uuid,p_verification uuid,p_warnings text[],p_snapshot jsonb,p_hash text) returns uuid
language plpgsql security definer set search_path=public as $$
declare p products; t truth_versions; g generations; v verification_runs; f jsonb; r jsonb; approval_id uuid:=gen_random_uuid(); passport_id uuid:=gen_random_uuid(); begin
 select * into p from products where id=p_product and owner_id=p_owner for update;
 if p.id is null or p.current_truth_id is distinct from p_truth then raise exception 'Stale truth'; end if;
 if exists(select 1 from jobs where product_id=p.id and status in ('queued','running')) then raise exception 'Wait for active jobs'; end if;
 select * into t from truth_versions where id=p_truth and confirmed_at is not null;
 select * into g from generations where id=p_generation and product_id=p.id and truth_version_id=p_truth and status='completed';
 select * into v from verification_runs where id=p_verification and generation_id=p_generation and truth_version_id=p_truth and status='completed';
 if t.id is null or g.id is null or v.id is null then raise exception 'Completed matching verification required'; end if;
 select pa.id into passport_id from passports pa join approvals a on a.id=pa.approval_id where a.truth_version_id=t.id and a.generation_id=g.id and a.verification_id=v.id and a.kind='final';
 if passport_id is not null then return passport_id; end if;
 passport_id:=gen_random_uuid();
 if exists(select 1 from verification_runs where generation_id=g.id and version>v.version) then raise exception 'Use latest verification'; end if;
 if jsonb_array_length(v.report->'attributes')<>jsonb_array_length(t.record->'facts') then raise exception 'Incomplete verification'; end if;
 for f in select value from jsonb_array_elements(t.record->'facts') loop
 if (select count(*) from jsonb_array_elements(v.report->'attributes') x where x->>'factId'=f->>'id')<>1 then raise exception 'Incomplete or duplicate attribute'; end if;
 select value into r from jsonb_array_elements(v.report->'attributes') where value->>'factId'=f->>'id';
 if r->>'status' not in ('PASS','WARNING','FAIL','NOT VERIFIABLE') then raise exception 'Invalid attribute status'; end if;
 if r->>'status'='PASS' and f->>'conflict' is not null then raise exception 'Unresolved conflicting evidence'; end if;
 if exists(select 1 from jsonb_array_elements_text(r->'sourceAssetIds') x where not (x::uuid=any(t.source_asset_ids))) then raise exception 'Foreign source evidence'; end if;
 if r->>'status'='FAIL' or ((f->>'defining')::boolean and r->>'status'='NOT VERIFIABLE') then raise exception 'Unresolved product identity issue'; end if;
 if r->>'status'='PASS' and ((f->>'verificationScope')='claim_only' or jsonb_array_length(f->'visualEvidence')=0 or jsonb_array_length(r->'sourceAssetIds')=0) then raise exception 'Unsupported pass'; end if;
 if r->>'status' in ('WARNING','NOT VERIFIABLE') and not (f->>'id'=any(p_warnings)) then raise exception 'Acknowledge unresolved attributes'; end if;
 end loop;
 insert into approvals(id,product_id,owner_id,kind,truth_version_id,generation_id,verification_id,statement,acknowledged_warnings)
 values(approval_id,p.id,p_owner,'final',t.id,g.id,v.id,'I confirm this image accurately represents my real product. I have reviewed the comparison and disclosed uncertainties.',p_warnings);
 insert into passports(id,product_id,owner_id,approval_id,snapshot,manifest_sha256)
 values(passport_id,p.id,p_owner,approval_id,p_snapshot||jsonb_build_object('approvalId',approval_id,'approvedBy',p_owner,'approvedAt',now(),'finalApproval',jsonb_build_object('statement','I confirm this image accurately represents my real product. I have reviewed the comparison and disclosed uncertainties.','acknowledgedWarnings',to_jsonb(p_warnings),'truthVersionId',t.id,'generationId',g.id,'verificationId',v.id)),p_hash);
 update products set status='approved',updated_at=now() where id=p.id;
 return passport_id;
end $$;
-- PostgreSQL grants EXECUTE to PUBLIC by default; these functions are service-only.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname like 'gandiva_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
