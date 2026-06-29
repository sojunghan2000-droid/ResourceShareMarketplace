-- 18_polish.sql  (P3 이연 폴리시)

-- 1) public_org_stats: co2_avoided 컬럼 추가(반환형 변경 → drop & recreate)
drop function if exists public_org_stats();
create or replace function public_org_stats()
returns table(org_id uuid, org_name text, materials_count int, provided_count int,
              used_count int, overdue_count int, co2_avoided numeric)
language sql security definer set search_path to 'public','pg_temp'
as $$
  select o.id, o.name,
    (select count(*) from materials m where m.org_id=o.id and m.status='active')::int,
    (select count(*) from loans l where l.lender_org_id=o.id
       and l.status in ('REQUESTED','APPROVED','ON_LOAN','RETURN_PENDING','OVERDUE'))::int,
    (select count(*) from loans l where l.borrower_org_id=o.id
       and l.status in ('REQUESTED','APPROVED','ON_LOAN','RETURN_PENDING','OVERDUE'))::int,
    (select count(*) from loans l where l.lender_org_id=o.id and l.status='OVERDUE')::int,
    coalesce((select sum(l.qty * coalesce(cp.co2_per_unit,0))
       from loans l join materials m on m.id=l.material_id
       left join category_price cp on cp.code=m.category
       where l.lender_org_id=o.id and l.status in ('RETURNED','COMPLETED')),0)
  from organizations o order by o.name;
$$;
revoke all on function public_org_stats() from public, anon;
grant  execute on function public_org_stats() to authenticated;

-- 2) impact_summary: 이번 분기 컬럼 추가(반환형 변경 → drop & recreate)
drop function if exists impact_summary();
create or replace function impact_summary()
returns table(reuse_count int, saved_amount numeric, co2_avoided numeric,
              q_reuse_count int, q_saved_amount numeric, q_co2_avoided numeric)
language sql security definer set search_path to 'public','pg_temp'
as $$
  with done as (
    select l.qty, coalesce(cp.unit_price,0) up, coalesce(cp.co2_per_unit,0) co2,
           coalesce(l.returned_at, l.loaned_at) as done_at
    from loans l join materials m on m.id=l.material_id
    left join category_price cp on cp.code=m.category
    where l.status in ('RETURNED','COMPLETED')
  )
  select count(*)::int, coalesce(sum(qty*up),0), coalesce(sum(qty*co2),0),
         count(*) filter (where done_at >= date_trunc('quarter', now()))::int,
         coalesce(sum(qty*up) filter (where done_at >= date_trunc('quarter', now())),0),
         coalesce(sum(qty*co2) filter (where done_at >= date_trunc('quarter', now())),0)
  from done;
$$;
revoke all on function impact_summary() from public, anon;
grant  execute on function impact_summary() to authenticated;

-- 3) mark_expired_gives: 마감 지난 나눔 자재 비공개 + 소유자 알림 (관리자 전용)
create or replace function mark_expired_gives()
returns int language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare r record; v_cnt int := 0;
begin
  if not is_admin() then raise exception '관리자만 가능'; end if;
  for r in
    update materials set status='archived'
    where deal_type='give' and status='active' and deadline is not null and deadline < current_date
    returning id, owner_user_id, name
  loop
    v_cnt := v_cnt + 1;
    if r.owner_user_id is not null then
      perform _notify(r.owner_user_id, 'give_expired', null,
        format('나눔 자재 "%s"가 마감일이 지나 비공개 처리되었습니다.', r.name));
    end if;
  end loop;
  return v_cnt;
end $$;
revoke all on function mark_expired_gives() from public, anon;
grant  execute on function mark_expired_gives() to authenticated;
