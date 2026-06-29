-- 17_requests.sql  (P3 구해요)
-- 수요 게시(material_requests) + 제안(request_proposals). RPC는 동일 파일 하단(Task 2)에 이어 작성.

create table if not exists material_requests (
  id                uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references app_users(id),
  requester_org_id  uuid not null references organizations(id),
  category          text not null references categories(code),
  title             text not null,
  qty               int  not null check (qty > 0),
  needed_by         date,
  location          text,
  reason            text,
  status            text not null default 'open' check (status in ('open','fulfilled','closed')),
  created_at        timestamptz not null default now()
);
alter table material_requests enable row level security;

drop policy if exists mr_read on material_requests;
create policy mr_read on material_requests for select to authenticated using (true);

drop policy if exists mr_insert on material_requests;
create policy mr_insert on material_requests for insert to authenticated
  with check (requester_user_id = auth.uid());

drop policy if exists mr_update on material_requests;
create policy mr_update on material_requests for update to authenticated
  using (requester_user_id = auth.uid() or is_admin())
  with check (requester_user_id = auth.uid() or is_admin());

create table if not exists request_proposals (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid not null references material_requests(id) on delete cascade,
  proposer_user_id  uuid not null references app_users(id),
  proposer_org_id   uuid not null references organizations(id),
  material_id       uuid not null references materials(id),
  deal_type         text not null check (deal_type in ('give','loan')),
  message           text,
  status            text not null default 'proposed' check (status in ('proposed','accepted','rejected','withdrawn')),
  created_at        timestamptz not null default now()
);
alter table request_proposals enable row level security;

drop policy if exists rp_read on request_proposals;
create policy rp_read on request_proposals for select to authenticated using (true);

drop policy if exists rp_insert on request_proposals;
create policy rp_insert on request_proposals for insert to authenticated
  with check (proposer_user_id = auth.uid());

drop policy if exists rp_update on request_proposals;
create policy rp_update on request_proposals for update to authenticated
  using (proposer_user_id = auth.uid() or is_admin()
    or exists (select 1 from material_requests mr where mr.id = request_id and mr.requester_user_id = auth.uid()))
  with check (true);

create index if not exists idx_mr_status on material_requests(status, created_at desc);
create index if not exists idx_rp_request on request_proposals(request_id);

-- 구해요 RPC ---------------------------------------------------------------
create or replace function create_material_request(
  p_category text, p_title text, p_qty int, p_needed_by date, p_location text, p_reason text)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_id uuid; v_org uuid;
begin
  if not is_active() then raise exception '비활성 사용자'; end if;
  if length(trim(coalesce(p_title,''))) = 0 then raise exception '제목 필수'; end if;
  if p_qty is null or p_qty <= 0 then raise exception '수량 오류'; end if;
  if not exists(select 1 from categories where code = p_category) then raise exception '카테고리 오류'; end if;
  select org_id into v_org from app_users where id = auth.uid();
  insert into material_requests(requester_user_id, requester_org_id, category, title, qty, needed_by, location, reason)
  values (auth.uid(), v_org, p_category, trim(p_title), p_qty, p_needed_by,
          nullif(trim(coalesce(p_location,'')),''), nullif(trim(coalesce(p_reason,'')),''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function propose_to_request(p_request_id uuid, p_material_id uuid, p_message text)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_id uuid; v_req material_requests%rowtype; v_mat materials%rowtype; v_org uuid;
begin
  if not is_active() then raise exception '비활성 사용자'; end if;
  select * into v_req from material_requests where id = p_request_id;
  if not found then raise exception '요청 없음'; end if;
  if v_req.status <> 'open' then raise exception '마감된 요청'; end if;
  select * into v_mat from materials where id = p_material_id;
  if not found then raise exception '자재 없음'; end if;
  select org_id into v_org from app_users where id = auth.uid();
  if v_mat.org_id <> v_org then raise exception '본인 조직 자재만 제안 가능'; end if;
  if v_req.requester_org_id = v_org then raise exception '자기 조직 요청에는 제안 불가'; end if;
  if v_mat.status <> 'active' then raise exception '비공개 자재'; end if;
  insert into request_proposals(request_id, proposer_user_id, proposer_org_id, material_id, deal_type, message)
  values (p_request_id, auth.uid(), v_org, p_material_id, v_mat.deal_type, nullif(trim(coalesce(p_message,'')),''))
  returning id into v_id;
  perform _notify(v_req.requester_user_id, 'proposal_received', null,
    format('구해요 "%s"에 %s 제안이 도착했습니다.', v_req.title,
           case when v_mat.deal_type='give' then '나눔' else '대여' end));
  return v_id;
end $$;

create or replace function accept_proposal(p_proposal_id uuid)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_p request_proposals%rowtype; v_req material_requests%rowtype; v_mat materials%rowtype;
        v_loan uuid; v_qty int;
begin
  if not is_active() then raise exception '비활성 사용자'; end if;
  select * into v_p from request_proposals where id = p_proposal_id for update;
  if not found then raise exception '제안 없음'; end if;
  select * into v_req from material_requests where id = v_p.request_id for update;
  if v_req.requester_user_id <> auth.uid() and not is_admin() then raise exception '요청자만 수락 가능'; end if;
  if v_req.status <> 'open' then raise exception '이미 처리된 요청'; end if;
  if v_p.status <> 'proposed' then raise exception '유효하지 않은 제안'; end if;
  select * into v_mat from materials where id = v_p.material_id for update;
  if not found then raise exception '자재 없음'; end if;
  v_qty := least(v_req.qty, v_mat.qty_available);
  if v_qty < 1 then raise exception '제안 자재의 가용 수량이 없습니다'; end if;

  insert into loans(material_id, lender_org_id, borrower_org_id, borrower_user_id,
                    qty, due_date, purpose, deal_type, status, approved_at)
  values (v_mat.id, v_mat.org_id, v_req.requester_org_id, v_req.requester_user_id,
          v_qty,
          case when v_mat.deal_type='loan' then coalesce(v_req.needed_by, current_date + 14) else null end,
          format('구해요 매칭: %s', v_req.title), v_mat.deal_type, 'APPROVED', now())
  returning id into v_loan;
  update materials set qty_available = qty_available - v_qty where id = v_mat.id;
  update request_proposals set status = 'accepted' where id = p_proposal_id;
  update request_proposals set status = 'rejected'
    where request_id = v_req.id and id <> p_proposal_id and status = 'proposed';
  update material_requests set status = 'fulfilled' where id = v_req.id;
  insert into loan_events(loan_id, event_type, actor_user_id, payload)
  values (v_loan, 'request', auth.uid(), jsonb_build_object('via','proposal','proposal_id',p_proposal_id));
  perform _notify(v_p.proposer_user_id, 'proposal_accepted', v_loan,
    format('제안이 수락되어 %s 거래가 시작되었습니다.',
           case when v_mat.deal_type='give' then '나눔' else '대여' end));
  return v_loan;
end $$;

create or replace function close_material_request(p_request_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_req material_requests%rowtype;
begin
  select * into v_req from material_requests where id = p_request_id for update;
  if not found then raise exception '요청 없음'; end if;
  if v_req.requester_user_id <> auth.uid() and not is_admin() then raise exception '요청자만 마감 가능'; end if;
  update material_requests set status = 'closed' where id = p_request_id;
end $$;

create or replace function withdraw_proposal(p_proposal_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_p request_proposals%rowtype;
begin
  select * into v_p from request_proposals where id = p_proposal_id for update;
  if not found then raise exception '제안 없음'; end if;
  if v_p.proposer_user_id <> auth.uid() and not is_admin() then raise exception '제안자만 철회 가능'; end if;
  if v_p.status <> 'proposed' then raise exception '이미 처리된 제안'; end if;
  update request_proposals set status = 'withdrawn' where id = p_proposal_id;
end $$;

create or replace function list_material_requests()
returns table(id uuid, requester_org text, requester_user_id uuid, category text, major text,
              title text, qty int, needed_by date, location text, reason text, status text,
              created_at timestamptz, proposal_count int, is_mine boolean)
language sql security definer set search_path to 'public','pg_temp'
as $$
  select r.id, o.name, r.requester_user_id, r.category, c.major, r.title, r.qty, r.needed_by,
         r.location, r.reason, r.status, r.created_at,
         (select count(*) from request_proposals p where p.request_id=r.id and p.status='proposed')::int,
         (r.requester_user_id = auth.uid())
  from material_requests r
  join organizations o on o.id = r.requester_org_id
  left join categories c on c.code = r.category
  order by case when r.status='open' then 0 else 1 end, r.created_at desc;
$$;

create or replace function list_proposals_for_request(p_request_id uuid)
returns table(id uuid, proposer_org text, material_id uuid, material_name text, material_spec text,
              deal_type text, message text, status text, created_at timestamptz, qty_available int)
language sql security definer set search_path to 'public','pg_temp'
as $$
  select p.id, o.name, p.material_id, m.name, m.spec, p.deal_type, p.message, p.status, p.created_at, m.qty_available
  from request_proposals p
  join organizations o on o.id = p.proposer_org_id
  join materials m on m.id = p.material_id
  where p.request_id = p_request_id
  order by p.created_at;
$$;

-- 권한(P2 교훈: public+anon 회수 후 authenticated 부여) ----------------------
revoke all on function create_material_request(text,text,int,date,text,text) from public, anon;
grant  execute on function create_material_request(text,text,int,date,text,text) to authenticated;
revoke all on function propose_to_request(uuid,uuid,text) from public, anon;
grant  execute on function propose_to_request(uuid,uuid,text) to authenticated;
revoke all on function accept_proposal(uuid) from public, anon;
grant  execute on function accept_proposal(uuid) to authenticated;
revoke all on function close_material_request(uuid) from public, anon;
grant  execute on function close_material_request(uuid) to authenticated;
revoke all on function withdraw_proposal(uuid) from public, anon;
grant  execute on function withdraw_proposal(uuid) to authenticated;
revoke all on function list_material_requests() from public, anon;
grant  execute on function list_material_requests() to authenticated;
revoke all on function list_proposals_for_request(uuid) from public, anon;
grant  execute on function list_proposals_for_request(uuid) to authenticated;
