-- Upgrade v2 -> v3. Run once in Supabase SQL Editor. Does not delete existing documents.
alter table public.workflow_template_steps add column if not exists assignee_user_id uuid references public.profiles(id) on delete set null;
alter table public.workflow_template_steps add column if not exists requires_comment boolean not null default false;
alter table public.document_workflow_steps add column if not exists requires_comment boolean not null default false;
alter table public.signatures add column if not exists workflow_step_id uuid references public.document_workflow_steps(id) on delete set null;
alter table public.signatures add column if not exists layer_name text not null default 'ลายเซ็น';
alter table public.signatures add column if not exists image_data text;
alter table public.signatures add column if not exists rotation numeric not null default 0;
alter table public.signatures add column if not exists z_index integer not null default 1;
alter table public.signatures add column if not exists opacity numeric not null default 1;
alter table public.signatures add column if not exists is_visible boolean not null default true;
alter table public.signatures add column if not exists is_locked boolean not null default false;
alter table public.signatures add column if not exists updated_at timestamptz not null default now();
alter table public.document_archives add column if not exists upload_status text not null default 'completed';
alter table public.document_archives add column if not exists error_message text;

create index if not exists signatures_document_page_idx on public.signatures(document_id,page_number,z_index);
create index if not exists workflow_actions_document_idx on public.workflow_actions(document_id,created_at desc);

-- Replace workflow instantiation to support individual assignees and comment requirements.
create or replace function public.instantiate_workflow(p_document_id uuid,p_template_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid;s record;st uuid;
begin
 if not exists(select 1 from documents where id=p_document_id and owner_id=auth.uid()) then raise exception 'ไม่มีสิทธิ์'; end if;
 insert into document_workflows(document_id,template_id) values(p_document_id,p_template_id) returning id into w;
 for s in select * from workflow_template_steps where template_id=p_template_id order by step_order loop
  insert into document_workflow_steps(workflow_id,step_order,name,approval_mode,requires_signature,requires_comment,status)
  values(w,s.step_order,s.name,s.approval_mode,s.requires_signature,s.requires_comment,case when s.step_order=1 then 'active' else 'waiting' end) returning id into st;
  if s.assignee_type='user' and s.assignee_user_id is not null then
   insert into workflow_step_assignees(step_id,user_id) values(st,s.assignee_user_id) on conflict do nothing;
  else
   insert into workflow_step_assignees(step_id,user_id) select st,id from profiles where position_id=s.position_id and is_active and (can_review or can_approve) on conflict do nothing;
  end if;
 end loop;
 update documents set status='in_review',updated_at=now() where id=p_document_id;
 return w;
end$$;

-- Requires a rejection reason, and requires at least one signature layer when configured.
create or replace function public.act_on_workflow(p_document_id uuid,p_action text,p_comment text default '') returns void language plpgsql security definer set search_path=public as $$
declare st document_workflow_steps%rowtype;wf document_workflows%rowtype;
begin
 select s.* into st from document_workflow_steps s join document_workflows w on w.id=s.workflow_id join workflow_step_assignees a on a.step_id=s.id where w.document_id=p_document_id and s.status='active' and a.user_id=auth.uid() limit 1;
 if st.id is null then raise exception 'ไม่ได้รับมอบหมายในขั้นตอนปัจจุบัน'; end if;
 if p_action not in ('approved','rejected') then raise exception 'การดำเนินการไม่ถูกต้อง'; end if;
 if p_action='rejected' and length(trim(coalesce(p_comment,'')))<3 then raise exception 'กรุณาระบุเหตุผลที่ส่งกลับ'; end if;
 if st.requires_comment and length(trim(coalesce(p_comment,'')))<3 then raise exception 'ขั้นตอนนี้ต้องมีความคิดเห็น'; end if;
 if p_action='approved' and st.requires_signature and not exists(select 1 from signatures where document_id=p_document_id and workflow_step_id=st.id and user_id=auth.uid()) then raise exception 'กรุณาเพิ่มและบันทึกลายเซ็นอย่างน้อย 1 จุด'; end if;
 select * into wf from document_workflows where id=st.workflow_id;
 if p_action='rejected' then
  update document_workflow_steps set status='rejected',decided_at=now() where id=st.id;
  update workflow_step_assignees set status='rejected',acted_at=now() where step_id=st.id and user_id=auth.uid();
  update documents set status='changes_requested',updated_at=now() where id=p_document_id;
  update document_workflows set status='changes_requested' where id=wf.id;
 else
  update workflow_step_assignees set status='approved',acted_at=now() where step_id=st.id and user_id=auth.uid();
  update document_workflow_steps set status='approved',decided_at=now() where id=st.id;
  update document_workflow_steps set status='active' where workflow_id=wf.id and step_order=st.step_order+1;
  if not found then update documents set status='approved',updated_at=now() where id=p_document_id; update document_workflows set status='completed' where id=wf.id;
  else update document_workflows set current_step=st.step_order+1 where id=wf.id; end if;
 end if;
 insert into workflow_actions(document_id,step_id,actor_id,action,comment) values(p_document_id,st.id,auth.uid(),p_action,nullif(trim(p_comment),''));
end$$;

grant execute on function public.instantiate_workflow(uuid,uuid) to authenticated;
grant execute on function public.act_on_workflow(uuid,text,text) to authenticated;
