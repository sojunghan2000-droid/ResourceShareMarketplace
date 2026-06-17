"""Supabase 클라이언트 및 데이터 접근 계층.

- 클라이언트는 anon key 로 생성하고, 로그인 후 사용자 JWT 를 세션에 주입한다.
- 상태 전이는 모두 RPC(03_rpc.sql) 호출로만 수행한다.
- 목록/KPI 조회는 st.cache_data(ttl) 로 캐시하고 변경 시 무효화한다.
"""
from __future__ import annotations

from datetime import datetime, timezone

import streamlit as st
from supabase import create_client, Client


@st.cache_resource
def _base_client() -> Client:
    cfg = st.secrets["supabase"]
    return create_client(cfg["url"], cfg["anon_key"])


def client() -> Client:
    """현재 세션의 액세스 토큰이 있으면 주입한 클라이언트를 반환."""
    c = _base_client()
    sess = st.session_state.get("sb_session")
    if sess:
        try:
            c.postgrest.auth(sess["access_token"])
        except Exception:
            pass
    return c


# ----------------------------------------------------------------------
# 조회 (캐시)
# ----------------------------------------------------------------------
@st.cache_data(ttl=60)
def list_categories() -> list[dict]:
    return client().table("categories").select("*").order("sort").execute().data


@st.cache_data(ttl=300)
def category_prices() -> dict:
    """카테고리 코드 → 표준 임차단가(원/EA·일)."""
    rows = client().table("category_price").select("code, unit_price").execute().data
    return {r["code"]: float(r["unit_price"]) for r in rows}


def set_category_price(code: str, price: float):
    """관리자: 카테고리 표준단가 갱신(RLS가 admin 만 허용)."""
    client().table("category_price").upsert({"code": code, "unit_price": price}).execute()
    category_prices.clear()


def list_users() -> list[dict]:
    """관리자: 전체 사용자(활성 위주)."""
    return (client().table("app_users").select("id, name, role, status, org_id, organizations(name)")
            .order("status").execute().data)


def admin_set_password(user_id: str, pw: str):
    """관리자: 사용자 비밀번호 변경/초기화(admin_set_password RPC)."""
    client().rpc("admin_set_password", {"p_user": user_id, "p_pw": pw}).execute()


@st.cache_data(ttl=30)
def list_materials(category: str | None = None, keyword: str | None = None,
                   only_available: bool = False) -> list[dict]:
    q = client().table("materials").select("*").eq("status", "active")
    if category and category != "전체":
        q = q.eq("category", category)
    if only_available:
        q = q.gt("qty_available", 0)
    rows = q.order("created_at", desc=True).limit(500).execute().data
    if keyword:
        k = keyword.lower()
        rows = [r for r in rows
                if k in (r.get("name") or "").lower()
                or k in (r.get("spec") or "").lower()]
    return rows


@st.cache_data(ttl=20)
def list_my_loans(user_id: str) -> list[dict]:
    """신청자 관점: 내가 신청한 대여 건."""
    return (client().table("loans").select("*, materials(name, spec, unit)")
            .eq("borrower_user_id", user_id)
            .order("requested_at", desc=True).limit(300).execute().data)


@st.cache_data(ttl=20)
def list_incoming_loans(org_id: str) -> list[dict]:
    """보유자 관점: 내 조직 자재로 들어온 대여 건."""
    return (client().table("loans").select("*, materials(name, spec, unit)")
            .eq("lender_org_id", org_id)
            .order("requested_at", desc=True).limit(300).execute().data)


@st.cache_data(ttl=20)
def list_all_loans() -> list[dict]:
    """관리자 관점: 전체 조직의 대여 건(RLS가 admin에 전체 허용)."""
    return (client().table("loans").select("*, materials(name, spec, unit)")
            .order("requested_at", desc=True).limit(500).execute().data)


@st.cache_data(ttl=15)
def list_notifications() -> list[dict]:
    """내 알림 최근 15건(RLS: 본인 것만)."""
    return (client().table("notifications").select("*")
            .order("created_at", desc=True).limit(15).execute().data)


def mark_read(nid):
    now = datetime.now(timezone.utc).isoformat()
    client().table("notifications").update({"read_at": now}).eq("id", nid).execute()
    list_notifications.clear()


def mark_all_read():
    now = datetime.now(timezone.utc).isoformat()
    client().table("notifications").update({"read_at": now}).is_("read_at", "null").execute()
    list_notifications.clear()


def send_overdue_reminders() -> int:
    """관리자: 연체 건 차용자에게 독촉 알림 일괄 발송. 발송 건수 반환."""
    res = client().rpc("send_overdue_reminders", {}).execute()
    list_notifications.clear()
    return res.data


def invalidate():
    """변경 후 관련 캐시 무효화."""
    list_materials.clear()
    list_my_loans.clear()
    list_incoming_loans.clear()
    list_all_loans.clear()
    list_notifications.clear()


# ----------------------------------------------------------------------
# RPC (상태 전이)
# ----------------------------------------------------------------------
def rpc(name: str, params: dict):
    res = client().rpc(name, params).execute()
    invalidate()
    return res.data


def request_loan(material_id, qty, due, purpose=None, pickup=None):
    return rpc("request_loan", {
        "p_material_id": material_id, "p_qty": qty, "p_due": str(due),
        "p_purpose": purpose, "p_pickup": str(pickup) if pickup else None})


def approve_loan(loan_id):
    return rpc("approve_loan", {"p_loan_id": loan_id})


def reject_loan(loan_id, reason):
    return rpc("reject_loan", {"p_loan_id": loan_id, "p_reason": reason})


def pickup_loan(loan_id, photos, sign_url):
    return rpc("pickup_loan", {"p_loan_id": loan_id, "p_photos": photos, "p_sign_url": sign_url})


def request_return(loan_id):
    return rpc("request_return", {"p_loan_id": loan_id})


def return_loan(loan_id, return_qty, photos, sign_url, condition="good", note=None):
    return rpc("return_loan", {
        "p_loan_id": loan_id, "p_return_qty": return_qty, "p_photos": photos,
        "p_sign_url": sign_url, "p_condition": condition, "p_note": note})


# ----------------------------------------------------------------------
# Storage 업로드
# ----------------------------------------------------------------------
def upload_bytes(bucket: str, path: str, data: bytes, content_type="image/png") -> str:
    c = client()
    c.storage.from_(bucket).upload(
        path, data, {"content-type": content_type, "upsert": "true"})
    # 비공개 버킷 → 서명 URL(7일)
    signed = c.storage.from_(bucket).create_signed_url(path, 60 * 60 * 24 * 7)
    return signed.get("signedURL") or signed.get("signed_url", "")
