-- ============================================================
-- 07_scope_policies_authenticated.sql
-- RLS 정책을 authenticated 롤로 한정.
-- 이유: 헬퍼 함수(is_admin 등)를 anon 에서 회수(06)했으므로,
--       정책이 anon 에서 평가되면 'permission denied for function' 발생.
--       정책을 to authenticated 로 한정하면 anon 은 평가하지 않음.
-- anon 은 categories(cat_select using(true)) 만 읽을 수 있음.
-- ============================================================

-- organizations
drop policy if exists org_select on organizations;
create policy org_select on organizations
  for select to authenticated using (true);
drop policy if exists org_admin_all on organizations;
create policy org_admin_all on organizations
  for all to authenticated using (is_admin()) with check (is_admin());

-- app_users
drop policy if exists users_self_select on app_users;
create policy users_self_select on app_users
  for select to authenticated using (id = auth.uid() or is_admin());
drop policy if exists users_self_update on app_users;
create policy users_self_update on app_users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists users_admin_all on app_users;
create policy users_admin_all on app_users
  for all to authenticated using (is_admin()) with check (is_admin());

-- materials
drop policy if exists mat_select on materials;
create policy mat_select on materials
  for select to authenticated using (is_active());
drop policy if exists mat_insert on materials;
create policy mat_insert on materials
  for insert to authenticated with check (org_id = current_org_id() or is_admin());
drop policy if exists mat_update on materials;
create policy mat_update on materials
  for update to authenticated using (org_id = current_org_id() or is_admin())
  with check (org_id = current_org_id() or is_admin());
drop policy if exists mat_delete on materials;
create policy mat_delete on materials
  for delete to authenticated using (org_id = current_org_id() or is_admin());

-- loans
drop policy if exists loans_select on loans;
create policy loans_select on loans
  for select to authenticated using (
    lender_org_id = current_org_id() or borrower_org_id = current_org_id() or is_admin());

-- loan_events
drop policy if exists levents_select on loan_events;
create policy levents_select on loan_events
  for select to authenticated using (
    exists (select 1 from loans l where l.id = loan_events.loan_id
      and (l.lender_org_id = current_org_id() or l.borrower_org_id = current_org_id() or is_admin())));

-- notifications
drop policy if exists notif_select on notifications;
create policy notif_select on notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_update on notifications;
create policy notif_update on notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
