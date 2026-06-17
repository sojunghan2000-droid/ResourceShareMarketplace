"""인증 / 세션 / 역할.

로그인은 ID/PW. Supabase Auth 가 이메일 기반이라 ID 를 내부 이메일(id@safeshare.app)로 매핑한다.
입력에 '@' 가 있으면(기존 이메일 계정) 그대로 사용. 가입은 register_user RPC(메일 발송 없음).
가입 직후 status='pending' → 관리자 승인 전까지 사용 불가.
"""
from __future__ import annotations

import re

import streamlit as st
from core.db import client, _base_client

INTERNAL_DOMAIN = "safeshare.app"
ID_RE = re.compile(r"^[a-z0-9._]{3,30}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
KNOX_RE = re.compile(r"(@samsung\.com|\.samsung\.com)$", re.I)


def to_email(id_or_email: str) -> str:
    """ID → 내부 이메일. 이미 이메일(@포함)이면 그대로."""
    v = (id_or_email or "").strip().lower()
    return v if "@" in v else f"{v}@{INTERNAL_DOMAIN}"


def _load_profile(user_id: str) -> dict | None:
    rows = client().table("app_users").select(
        "*, organizations(name, type)").eq("id", user_id).execute().data
    return rows[0] if rows else None


def sign_in(id_or_email: str, password: str) -> tuple[bool, str]:
    try:
        res = _base_client().auth.sign_in_with_password(
            {"email": to_email(id_or_email), "password": password})
    except Exception:
        return False, "로그인 실패: 아이디 또는 비밀번호를 확인하세요."
    if not res.session:
        return False, "로그인 실패: 아이디 또는 비밀번호를 확인하세요."

    st.session_state["sb_session"] = {
        "access_token": res.session.access_token,
        "refresh_token": res.session.refresh_token,
    }
    st.session_state["auth_user_id"] = res.user.id

    profile = _load_profile(res.user.id)
    if not profile:
        return False, "계정이 아직 조직에 연결되지 않았습니다. 관리자에게 문의하세요."
    if profile["status"] != "active":
        return False, "가입 승인 대기 중입니다. 관리자 승인 후 이용 가능합니다."

    st.session_state["profile"] = profile
    return True, "ok"


def list_orgs_public() -> list[dict]:
    """가입 화면용 협력사 목록(익명 호출 가능)."""
    try:
        return _base_client().rpc("list_orgs_public", {}).execute().data or []
    except Exception:
        return []


def sign_up(user_id: str, password: str, name: str, org_id: str, email: str,
            join_code: str) -> tuple[bool, str]:
    """ID/PW/이름/소속/이메일/협력사코드로 가입(register_user RPC). 즉시 활성."""
    uid = (user_id or "").strip().lower()
    em = (email or "").strip()
    code = (join_code or "").strip()
    if not ID_RE.match(uid):
        return False, "아이디는 소문자·숫자·_·. 3~30자여야 합니다."
    if len(password or "") < 4:
        return False, "비밀번호는 4자 이상이어야 합니다."
    if not (name or "").strip():
        return False, "이름을 입력하세요."
    if not org_id:
        return False, "소속 협력사를 선택하세요."
    if not EMAIL_RE.match(em):
        return False, "올바른 이메일을 입력하세요."
    if KNOX_RE.search(em):
        return False, "Knox(삼성 임직원) 계정은 가입할 수 없습니다. 협력사 이메일로 가입하세요."
    if not code:
        return False, "협력사 코드를 입력하세요."
    try:
        _base_client().rpc("register_user", {
            "p_id": uid, "p_pw": password, "p_name": name.strip(),
            "p_org_id": org_id, "p_email": em, "p_join_code": code}).execute()
    except Exception as e:
        msg = str(e)
        if "DUP_ID" in msg:
            return False, "이미 사용 중인 아이디입니다."
        if "BAD_CODE" in msg:
            return False, "협력사 코드가 올바르지 않습니다. 협력사 관리자에게 문의하세요."
        if "KNOX_BLOCKED" in msg:
            return False, "Knox(삼성 임직원) 계정은 가입할 수 없습니다. 협력사 이메일로 가입하세요."
        if "NO_ORG" in msg:
            return False, "소속 협력사를 선택하세요."
        if "INVALID_ID" in msg:
            return False, "아이디 형식이 올바르지 않습니다."
        return False, "가입 실패. 잠시 후 다시 시도하세요."
    return True, "가입 완료! 바로 로그인하세요."


def update_my_profile(name: str, phone: str) -> tuple[bool, str]:
    """본인 프로필(이름·연락처) 갱신."""
    try:
        client().rpc("update_my_profile", {"p_name": name, "p_phone": phone}).execute()
    except Exception as e:
        return False, f"저장 실패: {e}"
    # 세션 프로필 갱신
    p = st.session_state.get("profile")
    if p:
        p["name"] = name.strip() or p["name"]
        p["phone"] = phone.strip() or None
    return True, "프로필이 저장되었습니다."


def change_password(new_pw: str) -> tuple[bool, str]:
    """본인 비밀번호 변경(auth.updateUser)."""
    if len(new_pw or "") < 4:
        return False, "비밀번호는 4자 이상이어야 합니다."
    sess = st.session_state.get("sb_session")
    if not sess:
        return False, "세션이 없습니다. 다시 로그인하세요."
    try:
        c = _base_client()
        c.auth.set_session(sess["access_token"], sess["refresh_token"])
        c.auth.update_user({"password": new_pw})
    except Exception as e:
        return False, f"변경 실패: {e}"
    return True, "비밀번호가 변경되었습니다."


def sign_out():
    for k in ("sb_session", "auth_user_id", "profile"):
        st.session_state.pop(k, None)


def current_user() -> dict | None:
    return st.session_state.get("profile")


def require_login() -> dict:
    user = current_user()
    if not user:
        st.stop()
    return user


def is_admin() -> bool:
    u = current_user()
    return bool(u and u.get("role") == "admin")


def is_sysadmin() -> bool:
    u = current_user()
    return bool(u and u.get("is_sysadmin"))
