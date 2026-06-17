# SafeShare — 협력사 간 잉여 안전자재 공유 플랫폼

카톡방을 대체하는 **구조화된 안전자재 대여(무상 대여 후 반납) 플랫폼**.
플랜트/제조 현장의 협력사 간 잉여 안전자재를 등록·검색·신청·수령·반납까지 추적한다.

- 기획: [PRD](PRD_안전자재공유플랫폼.md) · [개발기획서](개발기획서_안전자재공유플랫폼.md)
- 스택: Streamlit + Supabase(Postgres/Auth/Storage/RLS)

## 디렉터리
```
sql/
  01_schema.sql                    # 테이블/enum/인덱스/트리거
  02_rls.sql                       # RLS 정책 + 헬퍼 함수
  03_rpc.sql                       # 상태전이 RPC (신청/승인/거절/수령/반납요청/반납확정/연체)
  04_seed.sql                      # 표준 카테고리 사전 + 데모 조직
  05_harden_functions.sql          # 함수 search_path 고정 + RPC anon/public 노출 제거
  06_revoke_helper_public.sql      # RLS 헬퍼 함수 anon 노출 제거
  07_scope_policies_authenticated.sql  # RLS 정책을 authenticated 롤로 한정
app.py · core/(db.py, auth.py)
.streamlit/secrets.toml.example
requirements.txt
```

> **배포 상태(2026-06-16)**: Supabase 프로젝트 `safeshare`(ref `gevtqcdnjbnbpivuocrk`, 서울)에
> 01~07 적용 완료. 상태머신 전체 플로우 + 안전 가드 E2E 검증 통과. 보안 advisor 경고 해소
> (남은 0029는 의도된 설계). Storage 버킷 `material-photos`/`loan-proofs` 생성됨.

## S0 셋업 절차

### 1. Supabase 프로젝트 준비
1. Supabase 프로젝트 생성.
2. **SQL Editor**에서 `01` → `02` → ... → `07` 순서대로 실행.
3. **Storage** 버킷 2개 생성(비공개): `material-photos`, `loan-proofs`.
   (authenticated 읽기/쓰기 정책은 storage.objects 에 별도 필요 — 배포 시 적용됨)

### 2. 인증/가입 (관리자 승인형)
- Supabase **Auth**에서 이메일 가입 사용.
- 가입한 사용자는 `auth.users`에만 생기므로, `app_users`에 연결 행을 만들어야 활성화됨.
  최초 관리자 1명은 SQL로 직접 등록(아래 예시).

**경로 A — 앱에서 가입 후 승격(권장)**: 사용자가 앱에서 이메일 가입 → 아래로 승격.
```sql
select id, email from auth.users;   -- 가입한 auth user id 확인
insert into app_users(id, org_id, name, role, status)
values ('<auth_user_id>', '<owner_org_id>', '관리자', 'admin', 'active');
```

**경로 B — SQL로 직접 생성(이메일 인증/rate-limit 우회)**: GoTrue 로그인을 위해
`auth.users` + `auth.identities` + `app_users` 3곳을 모두 채워야 한다. identities 누락 시
로그인이 `Database error querying schema` 로 실패함.
```sql
do $$
declare v_id uuid := gen_random_uuid();
        v_org uuid := '<owner_org_id>';   -- 원청 조직 id
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token)
  values (v_id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    '<email>', crypt('<password>', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}','{}', '','','','','','');
  insert into auth.identities (provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id,
    jsonb_build_object('sub',v_id::text,'email','<email>','email_verified',true,'phone_verified',false),
    'email', now(), now(), now());
  insert into app_users(id, org_id, name, role, status)
  values (v_id, v_org, '관리자', 'admin', 'active');
end $$;
```
- 이후 일반 사용자 가입 → 관리자 페이지에서 `status`를 `active`로 승인(P1 구현).

### 3. 로컬 실행
```bash
pip install -r requirements.txt
cp .streamlit/secrets.toml.example .streamlit/secrets.toml   # 값 채우기
streamlit run app.py
```

### 4. 배포 (Streamlit Cloud)
- 저장소 연결 후 `secrets.toml` 내용을 Streamlit Cloud **Secrets**에 입력.
- `service_role_key`는 앱에 넣지 않는다(클라이언트는 anon key만).

## 상태머신
```
[가용] --request_loan--> REQUESTED --approve_loan--> APPROVED --pickup_loan--> ON_LOAN
                              | reject_loan(복원)                                   |
                              v                                            request_return
                          REJECTED                                                  |
                                                                                    v
                                                            RETURN_PENDING --return_loan--> RETURNED
   * due 초과 & ON_LOAN  --mark_overdue_loans-->  OVERDUE  (반납요청 가능)
```
- 수량 차감: 신청 시 예약 차감 / 거절·반납 시 복원(반납은 실회수 수량만).
- 수령·반납확정: 사진 + 서명 증빙 필수.

## 다음 (앱 구현, S1~)
- `app.py` + `pages/` 스캐폴드 → 로그인/자재목록/등록/신청함/대시보드/관리자.
- 자세한 화면·로드맵은 개발기획서 §4, §9 참조.
