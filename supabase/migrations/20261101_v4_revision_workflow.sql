-- Expand document statuses for the revision workflow.
alter table public.documents
drop constraint if exists documents_status_check;

alter table public.documents
add constraint documents_status_check
check (
  status in (
    'draft',
    'submitted',
    'owner_review',
    'in_review',
    'changes_requested',
    'approved',
    'archive_pending',
    'archived',
    'cancelled'
  )
);
-- Document Workflow LSEC v4 - immutable PDF revision workflow
create table if not exists public.document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  revision_number integer not null,
  source_revision_id uuid references public.document_revisions(id) on delete set null,
  workflow_step_id uuid references public.document_workflow_steps(id) on delete set null,
  file_path text not null,
  file_name text not null,
  file_size bigint,
  sha256 text,
  created_by uuid not null references public.profiles(id),
  revision_type text not null default 'signed' check (revision_type in ('original','signed','corrected','final')),
  is_current boolean not null default false,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  unique(document_id, revision_number)
);
create unique index if not exists document_revisions_one_current on public.document_revisions(document_id) where is_current;
create index if not exists document_revisions_document_idx on public.document_revisions(document_id, revision_number desc);
alter table public.documents add column if not exists current_revision_id uuid references public.document_revisions(id) on delete set null;
alter table public.workflow_templates add column if not exists owner_sign_first boolean not null default true;
alter table public.document_revisions enable row level security;
grant select on public.document_revisions to authenticated;
drop policy if exists revisions_participants_read on public.document_revisions;
create policy revisions_participants_read on public.document_revisions for select to authenticated using (
  exists(select 1 from public.documents d where d.id=document_revisions.document_id and d.owner_id=auth.uid())
  or public.is_admin()
  or exists(select 1 from public.document_workflows w join public.document_workflow_steps s on s.workflow_id=w.id join public.workflow_step_assignees a on a.step_id=s.id where w.document_id=document_revisions.document_id and a.user_id=auth.uid())
);

-- Backfill one original revision for existing documents without revisions.
insert into public.document_revisions(document_id,revision_number,file_path,file_name,file_size,created_by,revision_type,is_current)
select d.id,0,d.file_path,coalesce(d.file_name,'revision-000-original.pdf'),d.file_size,d.owner_id,'original',true
from public.documents d
where d.file_path is not null and not exists(select 1 from public.document_revisions r where r.document_id=d.id);
update public.documents d set current_revision_id=r.id
from public.document_revisions r where r.document_id=d.id and r.is_current and d.current_revision_id is null;

create or replace function public.instantiate_revision_workflow(p_document_id uuid,p_template_id uuid,p_owner_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid; s record; st uuid; offset_n int:=0; owner_first boolean:=true;
begin
 select coalesce(owner_sign_first,true) into owner_first from workflow_templates where id=p_template_id;
 insert into document_workflows(document_id,template_id,current_step,status) values(p_document_id,p_template_id,1,'in_progress') returning id into w;
 if owner_first then
   insert into document_workflow_steps(workflow_id,step_order,name,approval_mode,requires_signature,requires_comment,status)
   values(w,1,'เจ้าของเอกสารตรวจและลงนาม','any',true,false,'active') returning id into st;
   insert into workflow_step_assignees(step_id,user_id,status) values(st,p_owner_id,'pending');
   offset_n:=1;
 end if;
 for s in select * from workflow_template_steps where template_id=p_template_id order by step_order loop
   insert into document_workflow_steps(workflow_id,step_order,name,approval_mode,requires_signature,requires_comment,status)
   values(w,s.step_order+offset_n,s.name,s.approval_mode,s.requires_signature,s.requires_comment,case when not owner_first and s.step_order=1 then 'active' else 'waiting' end) returning id into st;
   if s.assignee_type='user' and s.assignee_user_id is not null then
     insert into workflow_step_assignees(step_id,user_id,status) values(st,s.assignee_user_id,'pending');
   else
     insert into workflow_step_assignees(step_id,user_id,status)
     select st,id,'pending' from profiles where position_id=s.position_id and is_active and (can_review or can_approve);
   end if;
 end loop;
 return w;
end$$;

create or replace function public.get_active_assignment(p_document_id uuid,p_user_id uuid)
returns table(step_id uuid,workflow_id uuid,step_order integer,requires_signature boolean,requires_comment boolean)
language sql security definer set search_path=public as $$
 select s.id,s.workflow_id,s.step_order,s.requires_signature,s.requires_comment
 from document_workflows w join document_workflow_steps s on s.workflow_id=w.id join workflow_step_assignees a on a.step_id=s.id
 where w.document_id=p_document_id and s.status='active' and a.user_id=p_user_id and a.status='pending' limit 1
$$;

create or replace function public.finalize_signed_revision(
 p_document_id uuid,p_user_id uuid,p_step_id uuid,p_source_revision_id uuid,p_revision_number integer,
 p_file_path text,p_file_name text,p_file_size bigint,p_sha256 text,p_comment text)
returns table(revision_id uuid,workflow_completed boolean)
language plpgsql security definer set search_path=public as $$
declare r uuid; s document_workflow_steps%rowtype; next_id uuid; completed boolean:=false;
begin
 select * into s from document_workflow_steps where id=p_step_id and status='active' for update;
 if s.id is null or not exists(select 1 from workflow_step_assignees where step_id=s.id and user_id=p_user_id and status='pending') then raise exception 'ไม่มีสิทธิ์ดำเนินการขั้นปัจจุบัน'; end if;
 if not exists(select 1 from document_revisions where id=p_source_revision_id and document_id=p_document_id and is_current) then raise exception 'Revision ต้นทางไม่ใช่ฉบับปัจจุบัน'; end if;
 update document_revisions set is_current=false where document_id=p_document_id and is_current;
 insert into document_revisions(document_id,revision_number,source_revision_id,workflow_step_id,file_path,file_name,file_size,sha256,created_by,revision_type,is_current)
 values(p_document_id,p_revision_number,p_source_revision_id,p_step_id,p_file_path,p_file_name,p_file_size,p_sha256,p_user_id,'signed',true) returning id into r;
 update documents set current_revision_id=r,file_path=p_file_path,file_name=p_file_name,file_size=p_file_size,updated_at=now(),status='in_review' where id=p_document_id;
 update workflow_step_assignees set status='approved',acted_at=now() where step_id=s.id and user_id=p_user_id;
 update document_workflow_steps set status='approved',decided_at=now() where id=s.id;
 insert into workflow_actions(document_id,step_id,actor_id,action,comment) values(p_document_id,s.id,p_user_id,'approved',nullif(trim(p_comment),''));
 select id into next_id from document_workflow_steps where workflow_id=s.workflow_id and step_order=s.step_order+1;
 if next_id is null then
   completed:=true;
   update document_workflows set status='completed',current_step=s.step_order where id=s.workflow_id;
   update documents set status='approved' where id=p_document_id;
   update document_revisions set revision_type='final',is_final=true where id=r;
 else
   update document_workflow_steps set status='active' where id=next_id;
   update document_workflows set current_step=s.step_order+1,status='in_progress' where id=s.workflow_id;
 end if;
 return query select r,completed;
end$$;

create or replace function public.return_revision_to_owner(p_document_id uuid,p_user_id uuid,p_comment text)
returns void language plpgsql security definer set search_path=public as $$
declare s document_workflow_steps%rowtype;
begin
 select st.* into s from document_workflows w join document_workflow_steps st on st.workflow_id=w.id join workflow_step_assignees a on a.step_id=st.id
 where w.document_id=p_document_id and st.status='active' and a.user_id=p_user_id and a.status='pending' limit 1 for update;
 if s.id is null then raise exception 'ไม่มีสิทธิ์'; end if;
 update workflow_step_assignees set status='rejected',acted_at=now() where step_id=s.id and user_id=p_user_id;
 update document_workflow_steps set status='rejected',decided_at=now() where id=s.id;
 update document_workflows set status='changes_requested' where id=s.workflow_id;
 update documents set status='changes_requested',updated_at=now() where id=p_document_id;
 insert into workflow_actions(document_id,step_id,actor_id,action,comment) values(p_document_id,s.id,p_user_id,'rejected',trim(p_comment));
end$$;

create or replace function public.mark_revision_archived(
 p_document_id uuid,p_revision_id uuid,p_drive_id text,p_item_id text,p_web_url text,p_file_name text,p_file_size bigint,p_sha256 text,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 update document_revisions set is_final=true,revision_type='final' where id=p_revision_id and document_id=p_document_id;
 insert into document_archives(document_id,drive_id,item_id,web_url,file_name,file_size,sha256,archived_by,upload_status)
 values(p_document_id,p_drive_id,p_item_id,p_web_url,p_file_name,p_file_size,p_sha256,p_user_id,'completed');
 update documents set status='archived',updated_at=now() where id=p_document_id;
end$$;

grant execute on function public.instantiate_revision_workflow(uuid,uuid,uuid) to service_role;
grant execute on function public.get_active_assignment(uuid,uuid) to service_role;
grant execute on function public.finalize_signed_revision(uuid,uuid,uuid,uuid,integer,text,text,bigint,text,text) to service_role;
grant execute on function public.return_revision_to_owner(uuid,uuid,text) to service_role;
grant execute on function public.mark_revision_archived(uuid,uuid,text,text,text,text,bigint,text,uuid) to service_role;
