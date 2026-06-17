# 인증 ID/PW 전환 + 관리자 비밀번호 관리 — 변경 기획

| 항목 | 내용 |
|---|---|
| 작성일 | 2026-06-17 |
| 대상 | Streamlit(`app.py`·`core/auth.py`) + React(`web/`) + Supabase(Auth·RPC·트리거) |
| 변경 | ① 로그인 ID/PW ② 가입신청 ID/PW ③ 관리자 비밀번호 변경·초기화 |
| 핵심 제약 | **Supabase Auth는 이메일 기반** — "ID 로그인"은 내부적으로 이메일에 매핑해야 함 |

---

## 1. 현재 상태

- 로그인/가입: **이메일 + 비밀번호** (`supabase.auth.signInWithPassword({email, password})`).
- 가입 시 이메일 확인(Confirm email) 흐름 → 데모 중 "email rate limit"·`.local 거부` 이슈 발생.
- 비밀번호 변경: 본인만 가능(없음). 관리자 초기화: 없음(현재는 SQL로 직접 처리).
- **온보딩 결함**: 셀프 가입 시 `app_users` 행이 안 생겨 관리자 "가입 승인 대기"에 안 뜸(현재 미연결).

## 2. 목표 UX

```
[로그인]            [가입 신청]
 아이디  ____        아이디  ____
 비밀번호 ____        비밀번호 ____
 [로그인]            이름   ____
                     [가입 신청]
```
- 사용자는 **이메일을 전혀 보지 않음**. ID만 입력.
- 관리자: 사용자 목록에서 **비밀번호 변경(지정)** / **초기화(임시PW)** 버튼.

## 3. 설계 핵심 — "ID → 내부 이메일" 매핑 (권장안)

Supabase Auth는 username 로그인을 네이티브 지원하지 않음. → **ID를 내부 합성 이메일로 매핑**한다.

```
ID "kim_cs"  ──(앱이 도메인 부착)──▶  내부 이메일 "kim_cs@safeshare.app"
로그인: signInWithPassword({ email: id + "@safeshare.app", password })
```

- **장점**: Supabase Auth(해싱·세션·JWT·RLS `auth.uid()`)를 그대로 유지. 변경 최소.
- ID는 합성 이메일의 local-part. **결정적 매핑**이라 별도 조회 불필요(ID 유일 = 이메일 유일).
- ⚠️ 내부 도메인은 **GoTrue 이메일 검증을 통과해야 함**. 과거 테스트에서 `@*.local` 거부, `@example.com` 통과 확인. → `safeshare.app` 같은 유효 TLD 도메인 사용(실제 메일 발송 안 함).
- **이메일 확인(Confirm email) 끄기** 필수 → 가입 시 메일 발송/rate-limit 없음.

### 대안 비교
| 안 | 방식 | 평가 |
|---|---|---|
| **A. 내부 이메일 매핑** | ID→`id@domain` | ✅ 권장. Auth/RLS 유지, 변경 최소 |
| B. 커스텀 인증 | 자체 users+해시+세션 | ❌ RLS(auth.uid) 붕괴, 재작업 큼 |
| C. 이메일 라벨만 변경 | "이메일"→"아이디" 표기만 | ❌ 여전히 이메일 형식 강요 |

## 4. 변경 항목별 상세

### 4.1 로그인 ID/PW
- UI: "이메일" 필드 → **"아이디"** 필드(placeholder `영문/숫자`).
- 로직(`core/auth.py` / React `Login.tsx`):
  ```python
  email = f"{id_input.strip().lower()}@{INTERNAL_DOMAIN}"
  supabase.auth.sign_in_with_password({"email": email, "password": pw})
  ```
- ID 규칙: 소문자 영숫자 + `_`/`.`, 3~30자 (이메일 local-part 호환). 입력 검증.

### 4.2 가입신청 ID/PW
- UI: 아이디 + 비밀번호 (+ 이름). 이메일 입력 제거.
- 로직: `signUp({ email: id@domain, password })` → 성공 시 "관리자 승인 대기" 안내.
- **온보딩 결함 해결(중요)**: `auth.users` INSERT 트리거로 **`app_users`(status=pending, name=ID) 자동 생성** → 관리자 "가입 승인 대기"에 노출.
  ```sql
  create function on_auth_user_created() returns trigger
    security definer set search_path=public,pg_temp as $$
  begin
    insert into app_users(id, name, status, role)
    values (new.id, split_part(new.email,'@',1), 'pending', 'member')
    on conflict (id) do nothing;
    return new;
  end $$;
  create trigger trg_auth_user_created
    after insert on auth.users for each row execute function on_auth_user_created();
  ```
- 관리자가 승인 시 소속 협력사 지정 + status=active (기존 흐름 재사용).

### 4.3 관리자 비밀번호 변경/초기화
- Supabase 비번 변경은 (a)본인 세션 `updateUser` 또는 (b)service_role admin API. 클라이언트는 anon key라 admin API 불가.
- **해법: SECURITY DEFINER RPC**로 `auth.users.encrypted_password`를 pgcrypto로 직접 갱신(관리자 계정 생성 때 검증된 방식).
  ```sql
  create function admin_set_password(p_user uuid, p_pw text)
    returns void language plpgsql security definer
    set search_path=public,pg_temp as $$
  begin
    if not is_admin() then raise exception '관리자만 가능'; end if;
    update auth.users
       set encrypted_password = crypt(p_pw, gen_salt('bf')),
           updated_at = now()
     where id = p_user;
  end $$;
  revoke execute on function admin_set_password(uuid,text) from public, anon;
  grant execute on function admin_set_password(uuid,text) to authenticated;
  ```
- **변경**: 관리자가 입력한 새 PW로 설정. **초기화**: 임시 PW 생성(예: `safeshare-XXXX`) 후 설정 + 화면에 1회 표시.
- UI: 관리자 센터 사용자 목록에 각 사용자별 **[비번변경]**(입력) / **[초기화]** 버튼.
- (선택) 첫 로그인 시 비번 변경 강제 — `app_users.must_change_pw` 플래그.

## 5. 백엔드/설정 변경 요약
| 구분 | 변경 |
|---|---|
| Supabase Auth 설정 | **Confirm email 끄기** (대시보드 Auth > Providers/Email) |
| 트리거 | `auth.users` INSERT → `app_users(pending)` 자동 생성 |
| RPC | `admin_set_password(user, pw)` (관리자 전용, definer) |
| 앱 설정 | `INTERNAL_DOMAIN`(예 `safeshare.app`) — secrets/config |
| 마이그레이션 | 기존 사용자(관리자 sojunghan2000@gmail.com 등) ID 체계로 정리 |

## 6. 영향/주의
- **이메일 없음 → 셀프 비번 찾기 불가.** 분실 시 **관리자 초기화**가 유일 복구 경로(요구사항과 일치).
- 기존 관리자 계정(`sojunghan2000@gmail.com`)은 이메일이 ID가 됨 → 로그인 시 "sojunghan2000@gmail.com"을 ID로 입력해야 함. 깔끔히 하려면 신규 ID(예 `admin`) 계정 생성 권장.
- ID 중복 = 이메일 중복(Auth 유니크)으로 자동 방지. 가입 시 친화적 에러 메시지 필요.
- 합성 이메일은 실제 수신 불가 — 비밀번호 재설정 메일·매직링크 등 이메일 기능 전부 미사용 전제.

## 7. 작업 단계 / 공수(예상)
| 단계 | 내용 | 공수 |
|---|---|---|
| A1 | Supabase: Confirm email 끄기 + 트리거 + `admin_set_password` RPC | 0.5d |
| A2 | `core/auth.py`·React `Login`: ID→이메일 매핑, 라벨/검증 | 0.5d |
| A3 | 가입신청 ID/PW + 이름, 온보딩(트리거 연동) | 0.5d |
| A4 | 관리자 센터: 사용자 목록 + 비번변경/초기화 UI | 0.5d |
| A5 | 기존 계정 정리(관리자 신규 ID), 양 앱 검증 | 0.5d |

> 총 ~2.5일. MVP는 A1~A4(로그인·가입·관리자 비번)면 요구 3건 충족.

## 8. 확인 필요 (Open)
1. **내부 도메인** — `safeshare.app`? `safeshare.co.kr`? (실제 소유 불필요, 형식만 유효하면 됨. 사전 1회 검증)
2. **ID 규칙** — 길이/허용문자/대소문자(소문자 강제 권장).
3. **초기화 임시PW 방식** — 자동 생성(랜덤) vs 고정 기본값. 첫 로그인 강제 변경 둘지.
4. **기존 사용자 마이그레이션** — 현 관리자 계정 유지 vs 신규 `admin` ID 발급.
5. **가입 시 이름 필수 여부** — ID만으로 충분한지(관리자 식별 위해 이름 권장).

---

### 권장 결론
- **내부 이메일 매핑(안 A)** 으로 Supabase Auth를 유지하며 ID/PW UX 구현 — 변경 최소·안전.
- 관리자 비번 변경/초기화는 **definer RPC**로 service_role 없이 구현(검증된 방식).
- 부수 효과로 **셀프 가입 온보딩 결함(트리거 누락)도 함께 해결**.
- 결정 §8 5개만 정해지면 A1~A5 바로 착수.
