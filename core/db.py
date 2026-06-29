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


@st.cache_data(ttl=300)
def category_co2() -> dict:
    """카테고리 코드 → 탄소 원단위(kgCO2e/단위)."""
    rows = client().table("category_price").select("code, co2_per_unit").execute().data
    return {r["code"]: float(r.get("co2_per_unit") or 0) for r in rows}


def set_category_price(code: str, price: float, co2: float | None = None):
    """관리자: 카테고리 표준단가(+탄소 원단위) 갱신(RLS가 admin 만 허용)."""
    row = {"code": code, "unit_price": price}
    if co2 is not None:
        row["co2_per_unit"] = co2
    client().table("category_price").upsert(row).execute()
    category_prices.clear()
    category_co2.clear()


def list_users() -> list[dict]:
    """관리자: 전체 사용자(활성 위주)."""
    return (client().table("app_users")
            .select("id, name, phone, contact_email, role, status, is_sysadmin, org_id, organizations(name)")
            .order("status").execute().data)


def admin_set_password(user_id: str, pw: str):
    """관리자: 사용자 비밀번호 변경/초기화(admin_set_password RPC)."""
    client().rpc("admin_set_password", {"p_user": user_id, "p_pw": pw}).execute()


def org_codes() -> dict:
    """관리자: 협력사 가입 코드 {org_id: code}."""
    rows = client().table("organization_codes").select("org_id, code").execute().data
    return {r["org_id"]: r["code"] for r in rows}


def reissue_org_code(org_id: str) -> str:
    """관리자: 협력사 코드 랜덤 재발급. 새 코드 반환."""
    return client().rpc("reissue_org_code", {"p_org": org_id}).execute().data


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


@st.cache_data(ttl=60)
def public_org_stats() -> list[dict]:
    """전원 공개(읽기전용): 협력사별 집계 현황(public_org_stats RPC)."""
    return client().rpc("public_org_stats", {}).execute().data


@st.cache_data(ttl=30)
def public_loan_feed(limit: int = 30) -> list[dict]:
    """전원 공개(읽기전용): 전체 대여 피드(조직 단위, 개인명 제외)."""
    return client().rpc("public_loan_feed", {"p_limit": limit}).execute().data


@st.cache_data(ttl=30)
def impact_summary() -> dict:
    """자원 재사용 누적·이번 분기 절감액·CO₂(impact_summary RPC)."""
    data = client().rpc("impact_summary", {}).execute().data
    row = data[0] if isinstance(data, list) and data else (data or {})
    return row or {}


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
    public_org_stats.clear()
    public_loan_feed.clear()


# ----------------------------------------------------------------------
# RPC (상태 전이)
# ----------------------------------------------------------------------
def rpc(name: str, params: dict):
    res = client().rpc(name, params).execute()
    invalidate()
    return res.data


def request_loan(material_id, qty, due, purpose=None, pickup=None):
    return rpc("request_loan", {
        "p_material_id": material_id, "p_qty": qty,
        "p_due": str(due) if due else None,
        "p_purpose": purpose, "p_pickup": str(pickup) if pickup else None})


def complete_give(loan_id, photos, sign_url):
    """나눔 수령=완료(반납 없음). 사진+서명 증빙 필수."""
    return rpc("complete_give", {"p_loan_id": loan_id, "p_photos": photos, "p_sign_url": sign_url})


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


def mark_expired_gives():
    """관리자: 마감 지난 나눔 자재 일괄 비공개(archived)."""
    return rpc("mark_expired_gives", {})


# ---- 구해요(material_requests) ----
def list_material_requests() -> list[dict]:
    return client().rpc("list_material_requests", {}).execute().data or []


def list_proposals_for_request(req_id) -> list[dict]:
    return client().rpc("list_proposals_for_request", {"p_request_id": req_id}).execute().data or []


def create_material_request(category, title, qty, needed_by, location, reason):
    return rpc("create_material_request", {
        "p_category": category, "p_title": title, "p_qty": qty,
        "p_needed_by": str(needed_by) if needed_by else None,
        "p_location": location or None, "p_reason": reason or None})


def propose_to_request(req_id, material_id, message):
    return rpc("propose_to_request", {
        "p_request_id": req_id, "p_material_id": material_id, "p_message": message or None})


def accept_proposal(proposal_id):
    return rpc("accept_proposal", {"p_proposal_id": proposal_id})


def close_material_request(req_id):
    return rpc("close_material_request", {"p_request_id": req_id})


def withdraw_proposal(proposal_id):
    return rpc("withdraw_proposal", {"p_proposal_id": proposal_id})


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
