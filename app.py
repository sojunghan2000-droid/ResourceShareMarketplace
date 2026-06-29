"""주Go받Go앱 — 협력사 간 잉여 안전자재 나눔·대여 플랫폼 (Streamlit)

단일 파일 라우팅(사이드바) + lib/ 모듈. 상태 전이는 모두 lib.db 의 RPC 래퍼로.
"""
from __future__ import annotations

import io
import uuid
from datetime import date, timedelta

import altair as alt
import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

from core import auth, db

st.set_page_config(page_title="주Go받Go앱", page_icon="⇄", layout="wide",
                   initial_sidebar_state="expanded")


def _toggle_body_class(class_name: str, on: bool) -> None:
    """parent document body에 클래스 추가/제거(st.markdown은 script strip → iframe 사용)."""
    op = "add" if on else "remove"
    components.html(
        f"<script>window.parent.document.body.classList.{op}('{class_name}');</script>",
        height=0, width=0)

STATUS_KR = {
    "REQUESTED": "신청대기", "APPROVED": "승인", "ON_LOAN": "대여중",
    "RETURN_PENDING": "반납확인대기", "RETURNED": "반납완료",
    "REJECTED": "거절됨", "OVERDUE": "연체", "COMPLETED": "수령완료",
}
INSPECTION_KR = {"good": "양호", "need_check": "점검필요", "no_use": "사용금지", "damaged": "파손"}
DEAL_KR = {"give": "나눔", "loan": "대여"}


# ----------------------------------------------------------------------
# 테마 (React/shadcn 룩 근사 — Pretendard + 파란 primary + 카드/사이드바)
# ----------------------------------------------------------------------
def inject_theme():
    st.markdown("""
<style>
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css");

:root{
  --ss-primary:#2563eb; --ss-primary-d:#1d4ed8;
  --ss-bg:#f8fafc; --ss-card:#ffffff; --ss-border:#e2e8f0;
  --ss-fg:#0f172a; --ss-muted:#64748b; --ss-radius:12px;
  --ss-success:#16a34a; --ss-warning:#d97706; --ss-danger:#dc2626;
}
html, body, [class*="css"], .stApp, [data-testid="stAppViewContainer"]{
  font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,system-ui,Roboto,sans-serif;
}
.stApp,[data-testid="stAppViewContainer"]{ background:var(--ss-bg); }
[data-testid="stHeader"]{ background:transparent; }
.block-container{ padding-top:2.2rem; max-width:1100px; }

/* 헤딩 */
h1,h2,h3{ color:var(--ss-fg); font-weight:800; letter-spacing:-.02em; }
h2{ font-size:1.6rem; }

/* 버튼 */
.stButton>button, .stFormSubmitButton>button{
  border-radius:8px; font-weight:600; border:1px solid var(--ss-border);
  background:var(--ss-card); color:var(--ss-fg); box-shadow:0 1px 2px rgba(15,23,42,.05);
  transition:all .15s;
}
.stButton>button:hover{ background:#f1f5f9; }
.stButton>button[kind="primary"], .stFormSubmitButton>button{
  background:var(--ss-primary); border-color:var(--ss-primary); color:#fff;
}
.stButton>button[kind="primary"]:hover, .stFormSubmitButton>button:hover{
  background:var(--ss-primary-d); border-color:var(--ss-primary-d); color:#fff;
}

/* 카드(테두리 컨테이너) */
[data-testid="stVerticalBlockBorderWrapper"]{
  background:var(--ss-card); border:1px solid var(--ss-border)!important;
  border-radius:var(--ss-radius); box-shadow:0 1px 3px rgba(15,23,42,.06);
}
[data-testid="stVerticalBlockBorderWrapper"]>div{ padding:2px; }

/* 입력류 */
[data-baseweb="input"],[data-baseweb="select"]>div,[data-baseweb="textarea"]{
  border-radius:8px!important; border-color:var(--ss-border)!important;
}
.stTextInput input,.stNumberInput input{ border-radius:8px; }

/* 탭 강조 */
.stTabs [data-baseweb="tab-highlight"]{ background:var(--ss-primary); }
.stTabs [aria-selected="true"]{ color:var(--ss-primary)!important; }

/* 메트릭 → KPI 카드 */
[data-testid="stMetric"]{
  background:var(--ss-card); border:1px solid var(--ss-border);
  border-radius:var(--ss-radius); padding:14px 16px; box-shadow:0 1px 3px rgba(15,23,42,.06);
}
[data-testid="stMetricValue"]{ font-weight:800; color:var(--ss-fg); }

/* 사이드바 */
[data-testid="stSidebar"]{ background:var(--ss-card); border-right:1px solid var(--ss-border); }
[data-testid="stSidebar"] .block-container{ padding-top:1.2rem; }

/* 사이드바 라디오 → 네비 항목 */
[data-testid="stSidebar"] div[role="radiogroup"]{ gap:4px; }
[data-testid="stSidebar"] div[role="radiogroup"] > label{
  display:flex; align-items:center; padding:9px 12px; margin:0; border-radius:9px;
  color:var(--ss-muted); font-weight:600; cursor:pointer; transition:all .12s;
}
[data-testid="stSidebar"] div[role="radiogroup"] > label:hover{ background:#f1f5f9; color:var(--ss-fg); }
[data-testid="stSidebar"] div[role="radiogroup"] > label > div:first-child{ display:none; }
[data-testid="stSidebar"] div[role="radiogroup"] > label:has(input:checked){
  background:var(--ss-primary); color:#fff; box-shadow:0 1px 2px rgba(37,99,235,.4);
}

/* 사이드바 네비 버튼 (아이콘 + 라벨, 활성 파랑) */
[data-testid="stSidebar"] .stButton button{
  justify-content:flex-start !important; gap:10px; border:none!important; background:transparent!important;
  color:var(--ss-muted)!important; box-shadow:none!important; font-weight:600; padding:9px 12px;
}
/* 버튼 내부 래퍼(아이콘+라벨)도 좌측 정렬 */
[data-testid="stSidebar"] .stButton button > div,
[data-testid="stSidebar"] .stButton button > div > span{
  justify-content:flex-start !important; width:100%; text-align:left;
}
[data-testid="stSidebar"] .stButton button:hover{ background:#f1f5f9!important; color:var(--ss-fg)!important; }
[data-testid="stSidebar"] .stButton button[kind="primary"]{ background:var(--ss-primary)!important; color:#fff!important; }
[data-testid="stSidebar"] .stButton button[kind="primary"]:hover{ background:var(--ss-primary-d)!important; }

/* 알림 목록 항목 좌측 정렬 */
.st-key-ss_notiflist .stButton button{ justify-content:flex-start !important; text-align:left; }
.st-key-ss_notiflist .stButton button > div,
.st-key-ss_notiflist .stButton button > div > span{
  justify-content:flex-start !important; width:100%; text-align:left;
}

/* 관리자 센터 — 연체 배너 + 버튼 색상 */
.st-key-overdue_banner{ background:#fef2f2; border:1px solid #fecaca!important; border-radius:12px; padding:14px 18px 6px; margin-bottom:14px; }
.st-key-dunning button[kind="primary"]{ background:#b91c1c!important; border-color:#b91c1c!important; }
.st-key-dunning button[kind="primary"]:hover{ background:#991b1b!important; border-color:#991b1b!important; }
[class*="st-key-aapv_"] button{ background:#dcfce7!important; border-color:#bbf7d0!important; color:#15803d!important; }
[class*="st-key-aapv_"] button:hover{ background:#bbf7d0!important; }
[class*="st-key-arej_"] button{ background:#fee2e2!important; border-color:#fecaca!important; color:#b91c1c!important; }
[class*="st-key-arej_"] button:hover{ background:#fecaca!important; }

/* 절감액 카드 막대 hover 툴팁 */
.ssbar{ position:relative; display:flex; flex-direction:column; align-items:center; gap:6px; cursor:default; }
.ssbar .ssbar-tip{
  display:none; position:absolute; bottom:calc(100% + 8px); left:50%; transform:translateX(-50%);
  background:#0f172a; border:1px solid #334155; color:#fff; padding:7px 11px; border-radius:9px;
  font-size:11px; line-height:1.5; white-space:nowrap; z-index:30; box-shadow:0 6px 16px rgba(0,0,0,.4);
}
.ssbar .ssbar-tip::after{
  content:""; position:absolute; top:100%; left:50%; transform:translateX(-50%);
  border:5px solid transparent; border-top-color:#0f172a;
}
.ssbar:hover .ssbar-tip{ display:block; }
.ssbar:hover > div:first-child{ filter:brightness(1.15); }

/* 상단 헤더 (스크롤 시 상단 고정)
   sticky 는 헤더의 부모 래퍼(stLayoutWrapper)에 적용해야 본문 전체 높이 기준으로 고정됨 */
[data-testid="stMain"] [data-testid="stLayoutWrapper"]:has(> .st-key-appheader){
  position:sticky !important; top:0; z-index:999; background:var(--ss-bg);
}
.st-key-appheader{
  background:var(--ss-bg);
  border-bottom:1px solid var(--ss-border);
  padding:6px 0;
}
[data-testid="stMainBlockContainer"]{ padding-top:1rem; }
.st-key-hdr_register button[kind="primary"]{ background:#ea580c!important; border-color:#ea580c!important; }
.st-key-hdr_register button[kind="primary"]:hover{ background:#c2410c!important; border-color:#c2410c!important; }

/* 폼 → 카드 */
[data-testid="stForm"]{
  background:var(--ss-card); border:1px solid var(--ss-border)!important;
  border-radius:var(--ss-radius); padding:20px 22px; box-shadow:0 1px 3px rgba(15,23,42,.06);
}

/* 자재 카드 내부 */
.ss-imgbox{ height:108px; margin:-2px -2px 10px; border-radius:11px 11px 0 0;
  background:linear-gradient(180deg,#eef2f7,#e8edf3); display:flex; align-items:center;
  justify-content:center; color:#94a3b8; }
.ss-imgbox img{ width:100%; height:100%; object-fit:cover; border-radius:11px 11px 0 0; }
.ss-row1{ display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
.ss-name{ font-weight:700; font-size:1rem; color:var(--ss-fg); line-height:1.2; }
.ss-spec{ color:var(--ss-muted); font-size:.78rem; margin-top:1px; }
.ss-row2{ display:flex; justify-content:space-between; align-items:center; margin-top:10px;
  font-size:.86rem; color:var(--ss-fg); }
.ss-row2 b{ color:var(--ss-primary); }
.ss-loc{ display:flex; align-items:center; gap:4px; color:var(--ss-muted);
  font-size:.76rem; margin-top:6px; }
/* 카드 컬럼 간 여백 + 카드 안쪽 패딩 */
[data-testid="stColumn"] [data-testid="stVerticalBlockBorderWrapper"]{ padding:0 0 12px; }
[data-testid="stColumn"] [data-testid="stVerticalBlockBorderWrapper"] .ss-pad{ padding:0 14px; }
[data-testid="stColumn"] [data-testid="stVerticalBlockBorderWrapper"] .stButton{ padding:0 14px; }

/* ===== PyroSafe식 글로벌 고정 상단바 ===== */
header[data-testid="stHeader"]{ display:none !important; }
div[data-testid="stToolbar"]{ display:none !important; }
.block-container{ padding-top:calc(1.2rem + 64px) !important; }
.ps-topbar{
  position:fixed; top:0; left:0; right:0; height:64px; z-index:9000;
  background:#fff; border-bottom:1px solid var(--ss-border);
  display:flex; align-items:center; gap:10px; padding:0 1.75rem;
}
.ps-topbar-name{ font-weight:800; font-size:15px; color:var(--ss-fg); }
.ps-topbar-sub{ color:var(--ss-muted); font-size:12px; }
/* 우측 고정 위젯: 알림 / 도움말 / 아바타 */
.st-key-notify_btn{ position:fixed; top:13px; right:9.5rem; z-index:9001; width:54px; }
.st-key-notify_btn button{ width:54px; height:38px; min-height:38px; border-radius:999px !important;
  background:transparent !important; border:none !important; color:var(--ss-muted) !important;
  padding:0 .5rem !important; font-size:.85rem !important; font-weight:700 !important; }
.st-key-notify_btn button:hover{ background:#f1f5f9 !important; color:var(--ss-fg) !important; }
.st-key-notify_btn button svg, .st-key-notify_btn button div[aria-hidden="true"]{ display:none !important; }
.st-key-help_btn{ position:fixed; top:13px; right:7rem; z-index:9001; width:38px; }
.st-key-help_btn button{ width:38px; height:38px; min-height:38px; border-radius:50% !important;
  background:transparent !important; border:none !important; color:var(--ss-muted) !important;
  padding:0 !important; font-size:1rem !important; font-weight:700 !important; }
.st-key-help_btn button:hover{ background:#f1f5f9 !important; color:var(--ss-fg) !important; }
.st-key-help_btn button svg, .st-key-help_btn button div[aria-hidden="true"]{ display:none !important; }
.st-key-avatar_menu{ position:fixed; top:12px; right:1.75rem; z-index:9001; width:40px; }
.st-key-avatar_menu button[data-testid="stPopoverButton"]{ width:40px; height:40px; min-height:40px;
  border-radius:50%; background:linear-gradient(135deg,#60a5fa,#2563eb) !important; color:#fff !important;
  font-weight:700; font-size:.9rem; border:2px solid #fff !important; box-shadow:0 0 0 1px var(--ss-border);
  padding:0 !important; justify-content:center; }
.st-key-avatar_menu button[data-testid="stPopoverButton"] div[aria-hidden="true"],
.st-key-avatar_menu button[data-testid="stPopoverButton"] svg{ display:none !important; }

/* ===== 사이드바: 상단바 아래로 + 항상 펼침 강제(네이티브 collapse 무력화) ===== */
section[data-testid="stSidebar"]{
  margin-top:64px !important;
  transform:none !important;
  visibility:visible !important;
  margin-left:0 !important;
  overflow:visible !important;
  min-width:244px !important; width:244px !important;
}
section[data-testid="stSidebar"][aria-expanded="false"]{
  transform:none !important; visibility:visible !important; margin-left:0 !important;
  min-width:244px !important; width:244px !important;
}
section[data-testid="stSidebar"] > div{ visibility:visible !important; }
[data-testid="stSidebarCollapseButton"]{ display:none !important; }
[data-testid="stSidebarHeader"]{ display:none !important; }
.ps-sb-toggle button{ background:transparent !important; border:none !important; color:var(--ss-muted) !important;
  width:100% !important; padding:.3rem .5rem !important; font-size:1.05rem !important;
  text-align:right !important; justify-content:flex-end !important; margin-bottom:.4rem !important; }
.ps-sb-toggle button:hover{ color:var(--ss-primary) !important; background:#eff6ff !important; }
.st-key-sb_toggle button > div{ justify-content:flex-end !important; }
.ps-sb-foot{ color:#94a3b8; font-size:.78rem; line-height:1.6; margin-top:1.5rem; padding:0 4px; }
/* mini 모드 */
body.ps-sidebar-mini section[data-testid="stSidebar"]{ width:80px !important; min-width:80px !important; max-width:80px !important; }
body.ps-sidebar-mini section[data-testid="stSidebar"] .block-container{ padding-left:.4rem !important; padding-right:.4rem !important; }
body.ps-sidebar-mini section[data-testid="stSidebar"] button > div{ justify-content:center !important; }
/* mini: nav 버튼 라벨 숨김(아이콘만) — 토글(«/»)은 유지 */
body.ps-sidebar-mini [class*="st-key-nav_"] button p,
body.ps-sidebar-mini [class*="st-key-nav_"] button [data-testid="stMarkdownContainer"]{ display:none !important; }
body.ps-sidebar-mini .ps-sb-brand, body.ps-sidebar-mini .ps-sb-sub{ visibility:hidden !important; white-space:nowrap !important; overflow:hidden !important; }
body.ps-sidebar-mini .ps-sb-foot{ display:none !important; }
body.ps-sidebar-mini .st-key-sb_toggle button > div{ justify-content:center !important; }
</style>
""", unsafe_allow_html=True)


def badge(text: str, tone: str = "muted", solid: bool = False) -> str:
    """인라인 색상 배지 HTML. solid=True면 꽉 찬 색 + 흰 글자."""
    soft = {
        "primary": ("#dbeafe", "#1d4ed8"), "success": ("#dcfce7", "#15803d"),
        "warning": ("#fef3c7", "#b45309"), "danger": ("#fee2e2", "#b91c1c"),
        "muted": ("#f1f5f9", "#475569"), "outline": ("#ffffff", "#334155"),
        "give": ("#dcfce7", "#15803d"), "loan": ("#ffedd5", "#c2410c"),
    }
    solidc = {
        "primary": "#2563eb", "success": "#16a34a", "warning": "#f59e0b",
        "danger": "#dc2626", "muted": "#64748b", "outline": "#334155",
        "give": "#16a34a", "loan": "#ea580c",
    }
    if solid:
        bg, fg, border = solidc.get(tone, "#64748b"), "#ffffff", "border:1px solid transparent;"
    else:
        bg, fg = soft.get(tone, soft["muted"])
        border = "border:1px solid #e2e8f0;" if tone == "outline" else "border:1px solid transparent;"
    return (f"<span style='background:{bg};color:{fg};{border}padding:3px 11px;border-radius:999px;"
            f"font-size:.72rem;font-weight:700;white-space:nowrap'>{text}</span>")


_PKG_SVG = ("<svg width='34' height='34' viewBox='0 0 24 24' fill='none' stroke='currentColor' "
            "stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>"
            "<path d='m7.5 4.27 9 5.15'/><path d='M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z'/>"
            "<path d='m3.3 7 8.7 5 8.7-5'/><path d='M12 22V12'/></svg>")
_PIN_SVG = ("<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' "
            "stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='vertical-align:-2px'>"
            "<path d='M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'/>"
            "<circle cx='12' cy='10' r='3'/></svg>")


STATUS_TONE = {
    "REQUESTED": "warning", "APPROVED": "primary", "ON_LOAN": "muted",
    "RETURN_PENDING": "warning", "RETURNED": "success", "REJECTED": "muted",
    "OVERDUE": "danger", "COMPLETED": "give",
}


def deal_badge(deal_type: str) -> str:
    """거래유형 배지(나눔=초록/대여=주황)."""
    dt = deal_type or "loan"
    return badge(DEAL_KR.get(dt, dt), "give" if dt == "give" else "loan", solid=True)


# ----------------------------------------------------------------------
# 증빙 입력 (사진 + 서명)
# ----------------------------------------------------------------------
def capture_proof(prefix: str) -> tuple[list[str], str | None]:
    """사진 업로드 + 서명 캔버스. (photo_urls, sign_url) 반환. 없으면 빈/None."""
    photo_urls: list[str] = []
    files = st.file_uploader("실물 사진 (필수, 1장 이상)", type=["jpg", "jpeg", "png"],
                             accept_multiple_files=True, key=f"{prefix}_photos")
    if files:
        for f in files:
            path = f"{prefix}/{uuid.uuid4().hex}_{f.name}"
            url = db.upload_bytes("loan-proofs", path, f.getvalue(),
                                  content_type=f.type or "image/jpeg")
            photo_urls.append(url)

    sign_url = None
    st.caption("서명 (필수)")
    try:
        from streamlit_drawable_canvas import st_canvas
        from PIL import Image
        canvas = st_canvas(stroke_width=2, stroke_color="#111", background_color="#fff",
                           height=120, width=360, drawing_mode="freedraw", key=f"{prefix}_sign")
        if canvas.image_data is not None and canvas.image_data[:, :, 3].any():
            img = Image.fromarray(canvas.image_data.astype("uint8"))
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            sign_url = db.upload_bytes("loan-proofs", f"{prefix}/{uuid.uuid4().hex}_sign.png",
                                       buf.getvalue())
    except Exception:
        sign_file = st.file_uploader("서명 이미지 업로드(캔버스 미지원 시)",
                                     type=["png", "jpg"], key=f"{prefix}_signfile")
        if sign_file:
            sign_url = db.upload_bytes("loan-proofs", f"{prefix}/{uuid.uuid4().hex}_sign.png",
                                       sign_file.getvalue())
    return photo_urls, sign_url


# ----------------------------------------------------------------------
# 상단 헤더 (로고 + 자재등록 + 알림 + 사용자)
# ----------------------------------------------------------------------
def _nav_for_type(t: str) -> str:
    if t in ("loan_requested", "return_requested", "loan_picked_up"):
        return "내 자재 관리"
    return "내 신청함"


def _notif_panel(notifs, unread):
    top = st.columns([2, 1])
    top[0].markdown("**알림**")
    if unread and top[1].button("모두 읽음", key="nt_readall", use_container_width=True):
        db.mark_all_read(); st.rerun()
    if not notifs:
        st.caption("알림이 없습니다.")
        return
    with st.container(key="ss_notiflist"):
        for n in notifs[:10]:
            dot = "🟠 " if not n.get("read_at") else ""
            if st.button(f"{dot}{n['message']}", key=f"nt_{n['id']}", use_container_width=True):
                db.mark_read(n["id"])
                st.session_state["nav"] = _nav_for_type(n.get("type", ""))
                st.rerun()


def render_header(user):
    notifs = db.list_notifications()
    unread = sum(1 for n in notifs if not n.get("read_at"))
    # 고정 글로벌 상단바 (브랜드)
    st.markdown(
        "<div class='ps-topbar'>"
        "<span class='ps-topbar-name'>Samsung C&amp;T</span>"
        "<span style='display:inline-block;width:1px;height:15px;background:#cbd5e1'></span>"
        "<span class='ps-topbar-sub'>용인 덕성 AI DC</span>"
        "</div>",
        unsafe_allow_html=True)
    # 우측 고정 위젯: 알림 / 도움말 / 아바타
    with st.container(key="notify_btn"):
        with st.popover(f"🔔 {unread}" if unread else "🔔", use_container_width=False,
                        help="알림"):
            _notif_panel(notifs, unread)
    with st.container(key="help_btn"):
        with st.popover("?", use_container_width=False, help="활용 방법"):
            _faq_content()
    with st.container(key="avatar_menu"):
        org = (user.get("organizations") or {}).get("name", "")
        with st.popover((user.get("name") or "U")[0], use_container_width=False,
                        help=user.get("name", "사용자")):
            st.markdown(f"**{user.get('name','')}**  \n{org}  \n"
                        f"{'관리자' if auth.is_admin() else '멤버'}")
            with st.expander("내 프로필 수정"):
                pn = st.text_input("이름", value=user.get("name", ""), key="prof_name")
                pp = st.text_input("연락처", value=user.get("phone") or "", key="prof_phone")
                if st.button("저장", key="prof_save", type="primary"):
                    ok, m = auth.update_my_profile(pn, pp)
                    (st.success if ok else st.error)(m)
                    if ok:
                        st.rerun()
                st.divider()
                np = st.text_input("새 비밀번호", type="password", key="prof_pw")
                if st.button("비밀번호 변경", key="prof_pwbtn"):
                    ok, m = auth.change_password(np)
                    (st.success if ok else st.error)(m)
            if st.button("로그아웃", key="hdr_logout", use_container_width=True):
                auth.sign_out(); st.rerun()


# ----------------------------------------------------------------------
# 로그인 화면
# ----------------------------------------------------------------------
def login_view():
    _, mid, _ = st.columns([1, 1.3, 1])
    with mid:
        st.markdown(
            "<div style='text-align:center;margin:8vh 0 4px'>"
            "<div style='display:inline-flex;width:52px;height:52px;border-radius:14px;"
            "background:#2563eb;color:#fff;align-items:center;justify-content:center;"
            "font-size:28px;font-weight:800;box-shadow:0 2px 8px rgba(37,99,235,.4)'>⇄</div>"
            "<h1 style='margin:14px 0 2px;font-size:1.8rem'>주Go받Go앱</h1>"
            "<p style='color:#64748b;margin:0'>협력사 간 잉여 안전자재 나눔·대여 플랫폼</p></div>",
            unsafe_allow_html=True)
        with st.container(border=True):
            tab_login, tab_signup = st.tabs(["로그인", "가입 신청"])
            with tab_login:
                # st.form 으로 감싸면 입력 후 Enter 로 바로 제출(로그인)된다.
                with st.form("login_form", border=False, clear_on_submit=False):
                    uid = st.text_input("아이디", key="login_id", placeholder="영문 소문자·숫자")
                    pw = st.text_input("비밀번호", type="password", key="login_pw")
                    submitted = st.form_submit_button(
                        "로그인", type="primary", use_container_width=True)
                if submitted:
                    ok, msg = auth.sign_in(uid, pw)
                    if ok:
                        st.rerun()
                    else:
                        st.error(msg)
            with tab_signup:
                uid2 = st.text_input("아이디", key="su_id", placeholder="소문자·숫자·_· (3~30자)")
                name2 = st.text_input("이름", key="su_name")
                email2 = st.text_input("이메일", key="su_email", placeholder="협력사 이메일")
                st.caption("⚠ Knox(삼성 임직원) 계정(@samsung.com)은 가입할 수 없습니다.")
                orgs_pub = auth.list_orgs_public()
                org_map = {o["name"]: o["id"] for o in orgs_pub}
                org_sel = st.selectbox("소속 협력사", ["선택"] + list(org_map), key="su_org")
                code2 = st.text_input("협력사 코드", key="su_code", max_chars=4,
                                      placeholder="협력사 4자리 코드", help="소속 협력사 관리자에게 받은 코드")
                pw2 = st.text_input("비밀번호", type="password", key="su_pw")
                if st.button("가입 신청", type="primary", use_container_width=True):
                    ok, msg = auth.sign_up(uid2, pw2, name2, org_map.get(org_sel), email2, code2)
                    (st.success if ok else st.error)(msg)


# ----------------------------------------------------------------------
# 페이지: 자재 목록
# ----------------------------------------------------------------------
@st.dialog("대여 신청")
def _request_dialog(m):
    is_give = m.get("deal_type") == "give"
    st.markdown(f"**{m['name']}** {m.get('spec') or ''} · 가용 {m['qty_available']}{m['unit']}")
    qty = st.number_input("수량", 1, m["qty_available"], 1)
    pickup = due = None
    if not is_give:
        c1, c2 = st.columns(2)
        pickup = c1.date_input("희망 수령일", date.today())
        due = c2.date_input("반납 예정일", date.today() + timedelta(days=14))
    purpose = st.text_input("용도/메모", placeholder="예: 7월 정비 공정")
    if st.button("나눔 받기" if is_give else "신청 제출", type="primary", use_container_width=True):
        try:
            db.request_loan(m["id"], int(qty), due, purpose, pickup)
            st.rerun()
        except Exception as e:
            st.error(f"신청 실패: {e}")


@st.dialog("자재 정보 수정")
def _edit_material_dialog(m):
    cats = db.list_categories()
    codes = [c["code"] for c in cats]
    cat = st.selectbox("카테고리", cats, index=codes.index(m["category"]) if m["category"] in codes else 0,
                       format_func=lambda c: c["major"])
    name = st.text_input("품목명", value=m["name"])
    spec = st.text_input("규격", value=m.get("spec") or "")
    c1, c2, c3 = st.columns(3)
    qty_total = c1.number_input("총수량", 0, 1000000, int(m["qty_total"]))
    qty_avail = c2.number_input("가용수량", 0, 1000000, int(m["qty_available"]))
    unit = c3.text_input("단위", value=m["unit"])
    c4, c5 = st.columns(2)
    insp_keys = list(INSPECTION_KR)
    insp = c4.selectbox("점검상태", insp_keys,
                        index=insp_keys.index(m["inspection_status"]) if m["inspection_status"] in insp_keys else 0,
                        format_func=lambda k: INSPECTION_KR[k])
    cur_exp = date.fromisoformat(m["expires_at"]) if m.get("expires_at") else None
    expires = c5.date_input("사용기한(없으면 비움)", value=cur_exp)
    location = st.text_input("보관 위치", value=m.get("location") or "")
    if m.get("photos"):
        st.image(m["photos"][0], width=140)
    new_files = st.file_uploader("사진 교체(선택)", type=["jpg", "jpeg", "png"],
                                 accept_multiple_files=True, key=f"em_ph_{m['id']}")
    if qty_avail > qty_total:
        st.warning("가용수량이 총수량보다 클 수 없습니다.")
    cs, cd = st.columns([3, 1])
    if cs.button("저장", type="primary", use_container_width=True):
        if qty_avail > qty_total:
            st.error("수량을 확인하세요."); return
        upd = {"category": cat["code"], "name": name.strip(), "spec": spec, "unit": unit,
               "qty_total": int(qty_total), "qty_available": int(qty_avail),
               "location": location, "inspection_status": insp,
               "expires_at": str(expires) if expires else None}
        if new_files:
            upd["photos"] = [db.upload_bytes("material-photos", f"materials/{uuid.uuid4().hex}_{f.name}",
                                             f.getvalue(), f.type or "image/jpeg") for f in new_files]
        try:
            db.client().table("materials").update(upd).eq("id", m["id"]).execute()
            db.invalidate(); st.rerun()
        except Exception as e:
            st.error(f"저장 실패: {e}")
    if cd.button("삭제", use_container_width=True):
        try:
            db.client().table("materials").delete().eq("id", m["id"]).execute()
            db.invalidate(); st.rerun()
        except Exception:
            st.error("대여 이력이 있어 삭제할 수 없습니다.")


def _material_card(m, user, major_by_code):
    insp = m["inspection_status"]
    insp_tone = "success" if insp == "good" else "danger" if insp in ("no_use", "damaged") else "warning"
    photos = m.get("photos") or []
    img = (f"<img src='{photos[0]}'/>" if photos else _PKG_SVG)
    with st.container(border=True):
        st.markdown(
            f"<div class='ss-imgbox'>{img}</div>"
            f"<div class='ss-pad'>"
            f"<div class='ss-row1'><div><div class='ss-name'>{m['name']}</div>"
            f"<div class='ss-spec'>{m.get('spec') or '—'}</div></div>"
            f"<div style='display:flex;flex-direction:column;gap:4px;align-items:flex-end'>"
            f"{deal_badge(m.get('deal_type'))}"
            f"{badge(major_by_code.get(m['category'], m['category']), 'outline')}</div></div>"
            f"<div class='ss-row2'><span>가용 <b>{m['qty_available']}</b> / {m['qty_total']} {m['unit']}</span>"
            f"{badge(INSPECTION_KR.get(insp), insp_tone, solid=True)}</div>"
            f"<div class='ss-loc'>{_PIN_SVG} {m.get('location') or '위치 미지정'}</div>"
            + (f"<div class='ss-loc' style='color:#c2410c;margin-top:4px'>나눔 마감 {m['deadline']}</div>"
               if m.get('deal_type') == 'give' and m.get('deadline') else "")
            + "</div>",
            unsafe_allow_html=True)
        mine = m["org_id"] == user["org_id"]
        editable = mine or auth.is_admin()
        blocked = insp in ("no_use", "damaged") or m["qty_available"] < 1
        if editable:
            if mine:
                st.markdown("<div class='ss-pad'>" + badge("내 조직 자재", "muted") + "</div>",
                            unsafe_allow_html=True)
            if st.button("수정", key=f"edit_{m['id']}", use_container_width=True):
                _edit_material_dialog(m)
        elif blocked:
            st.button("신청 불가", key=f"blk_{m['id']}", disabled=True, use_container_width=True)
        else:
            is_give = m.get("deal_type") == "give"
            if st.button("나눔 받기" if is_give else "대여 신청", key=f"req_{m['id']}",
                         type="primary", use_container_width=True):
                _request_dialog(m)


def page_catalog(user):
    st.markdown("## 자재 목록")
    st.caption("협력사가 공유한 잉여 안전자재를 검색·신청하세요.")
    cats_list = db.list_categories()
    cats = ["전체 카테고리"] + [c["major"] for c in cats_list]
    code_by_major = {c["major"]: c["code"] for c in cats_list}
    major_by_code = {c["code"]: c["major"] for c in cats_list}

    c1, c2, c3 = st.columns([2, 4, 1.3])
    sel = c1.selectbox("카테고리", cats, label_visibility="collapsed")
    kw = c2.text_input("검색", placeholder="품목·규격·위치 검색", label_visibility="collapsed")
    only_av = c3.checkbox("가용만", value=True)
    d1, d2 = st.columns([3, 2])
    deal_sel = d1.radio("유형", ["all", "give", "loan"], horizontal=True, label_visibility="collapsed",
                        format_func=lambda d: {"all": "전체", "give": "나눔", "loan": "대여"}[d])
    sort_sel = d2.selectbox("정렬", ["recent", "name", "deadline"], label_visibility="collapsed",
                            format_func=lambda s: {"recent": "최신순", "name": "이름순", "deadline": "마감임박"}[s])

    cat_code = None if sel == "전체 카테고리" else code_by_major.get(sel)
    mats = db.list_materials(category=cat_code, keyword=kw, only_available=only_av)
    if deal_sel != "all":
        mats = [m for m in mats if (m.get("deal_type") or "loan") == deal_sel]
    if sort_sel == "name":
        mats = sorted(mats, key=lambda m: m.get("name") or "")
    elif sort_sel == "deadline":
        mats = sorted(mats, key=lambda m: (m.get("deadline") is None, m.get("deadline") or ""))
    if not mats:
        with st.container(border=True):
            st.markdown("<div style='text-align:center;color:#64748b;padding:36px 0'>조건에 맞는 자재가 없습니다.</div>",
                        unsafe_allow_html=True)
        return

    for i in range(0, len(mats), 3):
        cols = st.columns(3)
        for col, m in zip(cols, mats[i:i + 3]):
            with col:
                _material_card(m, user, major_by_code)


# ----------------------------------------------------------------------
# 페이지: 자재 등록
# ----------------------------------------------------------------------
def page_register(user):
    st.markdown("## 자재 등록")
    st.caption("잉여 안전자재를 등록해 다른 협력사와 공유하세요.")
    cats = db.list_categories()
    with st.form("reg"):
        deal = st.radio("거래 유형*", ["give", "loan"], horizontal=True,
                        format_func=lambda d: "나눔(무상 양도)" if d == "give" else "대여(반납)")
        major = st.selectbox("카테고리", [c["major"] for c in cats])
        name = st.text_input("품목명*")
        spec = st.text_input("규격")
        c1, c2, c3 = st.columns(3)
        qty = c1.number_input("수량*", 1, 100000, 1)
        unit = c2.text_input("단위", "EA")
        location = c3.text_input("보관 위치")
        c4, c5 = st.columns(2)
        insp = c4.selectbox("점검상태", list(INSPECTION_KR.keys()),
                            format_func=lambda k: INSPECTION_KR[k])
        expires = c5.date_input("사용기한(없으면 비워두기)", value=None)
        deadline = st.date_input("나눔 마감기한(나눔만, 선택)", value=None)
        photos = st.file_uploader("사진", type=["jpg", "jpeg", "png"],
                                  accept_multiple_files=True)
        if st.form_submit_button("등록", type="primary"):
            if not name:
                st.error("품목명은 필수입니다.")
                return
            code = next(c["code"] for c in cats if c["major"] == major)
            urls = []
            for f in (photos or []):
                p = f"materials/{uuid.uuid4().hex}_{f.name}"
                urls.append(db.upload_bytes("material-photos", p, f.getvalue(),
                                            f.type or "image/jpeg"))
            db.client().table("materials").insert({
                "org_id": user["org_id"], "owner_user_id": user["id"],
                "category": code, "name": name, "spec": spec, "unit": unit,
                "qty_total": int(qty), "qty_available": int(qty),
                "location": location, "photos": urls,
                "inspection_status": insp,
                "expires_at": str(expires) if expires else None,
                "deal_type": deal,
                "deadline": str(deadline) if (deal == "give" and deadline) else None,
            }).execute()
            db.invalidate()
            st.success(f"{'나눔' if deal == 'give' else '대여'} 자재가 등록되었습니다.")


# ----------------------------------------------------------------------
# 페이지: 내 신청함 (Borrower)
# ----------------------------------------------------------------------
def _loan_row_html(m, l):
    """거래 카드 상단: 좌측 품목/수량(+대여 반납예정) + 우측 유형·상태 배지."""
    name = m.get("name", "")
    spec = m.get("spec") or ""
    dt = l.get("deal_type") or m.get("deal_type") or "loan"
    sub = f"{l['qty']}{m.get('unit','')}"
    if dt == "loan" and l.get("due_date"):
        sub += f" · 반납예정 {l['due_date']}"
    return (
        "<div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>"
        f"<div><div style='font-weight:700;font-size:1rem;color:#0f172a'>{name} "
        f"<span style='color:#64748b;font-weight:400'>{spec}</span></div>"
        f"<div style='color:#64748b;font-size:.84rem;margin-top:2px'>{sub}</div></div>"
        f"<div style='display:flex;gap:6px;align-items:center'>{deal_badge(dt)}"
        f"{badge(STATUS_KR.get(l['status'], l['status']), STATUS_TONE.get(l['status'],'muted'), solid=True)}</div>"
        "</div>")


def page_my_requests(user):
    st.markdown("## 내 신청함")
    st.caption("내가 신청한 대여 건의 진행 상황입니다.")
    loans = db.list_my_loans(user["id"])
    if not loans:
        with st.container(border=True):
            st.markdown("<div style='text-align:center;color:#64748b;padding:36px 0'>신청 내역이 없습니다.</div>",
                        unsafe_allow_html=True)
        return
    for l in loans:
        m = l.get("materials") or {}
        with st.container(border=True):
            st.markdown(_loan_row_html(m, l), unsafe_allow_html=True)
            if l["status"] == "APPROVED":
                is_give = (l.get("deal_type") == "give")
                with st.expander(("나눔 받기 (사진+서명 필수)" if is_give else "수령 확인 (사진+서명 필수)")):
                    ph, sg = capture_proof(f"pick_{l['id']}")
                    if st.button("받기 완료" if is_give else "수령 완료", key=f"pk_{l['id']}", type="primary"):
                        try:
                            if is_give:
                                db.complete_give(l["id"], ph, sg)
                            else:
                                db.pickup_loan(l["id"], ph, sg)
                            st.success("처리됨"); st.rerun()
                        except Exception as e:
                            st.error(f"실패: {e}")
            elif l["status"] in ("ON_LOAN", "OVERDUE"):
                if st.button("반납 요청", key=f"rr_{l['id']}"):
                    try:
                        db.request_return(l["id"]); st.success("반납 요청됨"); st.rerun()
                    except Exception as e:
                        st.error(f"실패: {e}")
            elif l["status"] == "REJECTED":
                st.caption(f"거절 사유: {l.get('reject_reason') or '-'}")


# ----------------------------------------------------------------------
# 페이지: 내 자재 관리 (Lender)
# ----------------------------------------------------------------------
def page_lender(user):
    is_admin = auth.is_admin()
    st.markdown("## 전체 대여 관리" if is_admin else "## 내 자재 관리")
    st.caption("모든 협력사의 신청·반납을 처리합니다. (관리자)" if is_admin
               else "들어온 신청을 승인하고, 반납을 확정하세요.")
    loans = db.list_all_loans() if is_admin else db.list_incoming_loans(user["org_id"])
    pend = [l for l in loans if l["status"] in ("REQUESTED", "RETURN_PENDING")]
    if not pend:
        with st.container(border=True):
            st.markdown("<div style='text-align:center;color:#64748b;padding:36px 0'>처리할 신청·반납이 없습니다.</div>",
                        unsafe_allow_html=True)
    for l in pend:
        m = l.get("materials") or {}
        with st.container(border=True):
            st.markdown(_loan_row_html(m, l), unsafe_allow_html=True)
            if l.get("purpose"):
                st.markdown(f"<div style='color:#64748b;font-size:.82rem;margin-top:-4px'>용도: {l['purpose']}</div>",
                            unsafe_allow_html=True)
            if l["status"] == "REQUESTED":
                c1, c2 = st.columns(2)
                if c1.button("승인", key=f"ap_{l['id']}", type="primary"):
                    try:
                        db.approve_loan(l["id"]); st.success("승인됨"); st.rerun()
                    except Exception as e:
                        st.error(f"실패: {e}")
                with c2.popover("거절"):
                    reason = st.text_input("거절 사유", key=f"rj_{l['id']}")
                    if st.button("거절 확정", key=f"rjb_{l['id']}"):
                        try:
                            db.reject_loan(l["id"], reason); st.success("거절됨"); st.rerun()
                        except Exception as e:
                            st.error(f"실패: {e}")
            elif l["status"] == "RETURN_PENDING":
                with st.expander("반납 최종 확정 (사진+서명 필수)"):
                    rq = st.number_input("실제 회수 수량", 0, l["qty"], l["qty"], key=f"rq_{l['id']}")
                    cond = st.selectbox("점검상태", list(INSPECTION_KR.keys()),
                                        format_func=lambda k: INSPECTION_KR[k], key=f"cd_{l['id']}")
                    note = st.text_input("메모", key=f"nt_{l['id']}")
                    ph, sg = capture_proof(f"ret_{l['id']}")
                    if st.button("반납 완료 확정", key=f"rc_{l['id']}", type="primary"):
                        try:
                            db.return_loan(l["id"], int(rq), ph, sg, cond, note)
                            st.success("반납 확정됨"); st.rerun()
                        except Exception as e:
                            st.error(f"실패: {e}")


# ----------------------------------------------------------------------
# 페이지: 대시보드
# ----------------------------------------------------------------------
def _impact_headline(imp):
    """자원 재사용 누적·이번 분기 절감·CO₂ 헤드라인(React 임팩트 카드 근사)."""
    g = lambda k: imp.get(k) or 0
    st.markdown(
        "<div style='background:#f0fdf4;border:1px solid rgba(22,163,74,.35);border-radius:12px;"
        "padding:14px 18px;margin-bottom:10px'>"
        "<div style='display:flex;flex-wrap:wrap;align-items:baseline;gap:24px'>"
        "<span style='color:#15803d;font-weight:800;font-size:.92rem'>자원 재사용 임팩트 (누적)</span>"
        f"<span><b style='font-size:1.5rem;color:#0f172a'>{int(g('reuse_count'))}</b>건"
        " <span style='color:#64748b;font-size:.78rem'>재사용</span></span>"
        f"<span><b style='font-size:1.5rem;color:#0f172a'>{round(g('saved_amount')):,}</b>원"
        " <span style='color:#64748b;font-size:.78rem'>절감</span></span>"
        f"<span><b style='font-size:1.5rem;color:#16a34a'>{round(g('co2_avoided')):,}</b>kg"
        " <span style='color:#64748b;font-size:.78rem'>CO₂ 저감</span></span></div>"
        f"<div style='color:#64748b;font-size:.8rem;margin-top:6px'>이번 분기 · 재사용 {int(g('q_reuse_count'))}건"
        f" · 절감 {round(g('q_saved_amount')):,}원 · CO₂ {round(g('q_co2_avoided')):,}kg</div>"
        "</div>", unsafe_allow_html=True)


def _kpi(col, label, value, unit, icon, color, bg):
    col.markdown(
        f"<div style='background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px'>"
        f"<div style='display:flex;justify-content:space-between;align-items:center'>"
        f"<span style='color:#64748b;font-size:.82rem'>{label}</span>"
        f"<span style='width:26px;height:26px;border-radius:8px;background:{bg};color:{color};"
        f"display:inline-flex;align-items:center;justify-content:center;font-size:13px'>{icon}</span></div>"
        f"<div style='margin-top:8px;font-size:1.6rem;font-weight:800;color:#0f172a'>{value}"
        f"<span style='font-size:.8rem;font-weight:600;color:#64748b;margin-left:3px'>{unit}</span></div></div>",
        unsafe_allow_html=True)


def _quarter_savings(loans, mat_cat, prices):
    """절감액 = Σ(대체구매 단가 × 수량). 완료 거래(반납완료+나눔 수령완료)만, 완료월 기준 집계.
    헤드라인 누적 절감(impact_summary)과 동일 정의(일수 미반영).
    반환: (최근 4개월 합, [(라벨, 월별액)] 최근 4개월)."""
    today = date.today()
    seq = []
    for i in range(3, -1, -1):
        mm, yy = today.month - i, today.year
        while mm <= 0:
            mm += 12; yy -= 1
        seq.append((yy, mm))
    bucket = {ym: 0.0 for ym in seq}
    total = 0.0
    for l in loans:
        if l["status"] not in ("RETURNED", "COMPLETED"):
            continue
        price = prices.get(mat_cat.get(l["material_id"]), 0)
        if not price:
            continue
        done = (l.get("returned_at") or l.get("loaned_at") or "")[:10]
        if not done:
            continue
        d = date.fromisoformat(done)
        amt = price * l["qty"]
        total += amt
        if (d.year, d.month) in bucket:
            bucket[(d.year, d.month)] += amt
    return total, [(f"{mm}월", bucket[(yy, mm)]) for (yy, mm) in seq]
_DOT = {
    "ON_LOAN": ("#2563eb", "대여중"), "OVERDUE": ("#dc2626", "연체"),
    "APPROVED": ("#16a34a", "승인됨"), "REQUESTED": ("#d97706", "신청대기"),
    "RETURN_PENDING": ("#d97706", "반납확인"), "RETURNED": ("#16a34a", "반납완료"),
    "REJECTED": ("#64748b", "거절됨"),
}


def page_dashboard(user):
    is_admin = auth.is_admin()
    st.markdown("## 대시보드")
    org = (user.get("organizations") or {}).get("name", "")
    st.caption("전체 대여 현황 요약입니다. (관리자)" if is_admin else f"{org} · {user.get('name','')}")

    try:
        _impact_headline(db.impact_summary())
    except Exception:
        pass

    loans = db.list_all_loans() if is_admin else db.list_incoming_loans(user["org_id"])
    mats = db.list_materials(None, "", False)
    if not is_admin:
        mats = [m for m in mats if m["org_id"] == user["org_id"]]
    cats_list = db.list_categories()
    orgs = db.client().table("organizations").select("id, name").execute().data
    org_name = {o["id"]: o["name"] for o in orgs}
    mat_cat = {m["id"]: m["category"] for m in mats}

    # ── KPI 4 ──
    avail = sum(1 for m in mats if m["qty_available"] > 0)
    on_loan = sum(1 for l in loans if l["status"] == "ON_LOAN")
    pending = sum(1 for l in loans if l["status"] in ("REQUESTED", "RETURN_PENDING"))
    overdue = sum(1 for l in loans if l["status"] == "OVERDUE")
    k = st.columns(4)
    _kpi(k[0], "가용 자재", avail, "종", "✓", "#16a34a", "#dcfce7")
    _kpi(k[1], "대여 진행중", on_loan, "건", "📦", "#2563eb", "#dbeafe")
    _kpi(k[2], "승인 대기", pending, "건", "⏱", "#d97706", "#fef3c7")
    _kpi(k[3], "연체 현황", overdue, "건", "⚠", "#dc2626", "#fee2e2")

    st.write("")
    left, right = st.columns([2, 1])

    # ── 카테고리별 자재 현황 (Altair 2계열) ──
    onloan_by_cat = {}
    for l in loans:
        if l["status"] in ("ON_LOAN", "OVERDUE", "RETURN_PENDING"):
            c = mat_cat.get(l["material_id"])
            if c:
                onloan_by_cat[c] = onloan_by_cat.get(c, 0) + l["qty"]
    rows = []
    for c in cats_list:
        rows.append({"카테고리": c["major"], "구분": "가용",
                     "수량": sum(m["qty_available"] for m in mats if m["category"] == c["code"])})
        rows.append({"카테고리": c["major"], "구분": "대여중", "수량": onloan_by_cat.get(c["code"], 0)})
    with left.container(border=True):
        st.markdown("**카테고리별 자재 현황**")
        chart = (alt.Chart(pd.DataFrame(rows)).mark_bar(cornerRadiusTopLeft=3, cornerRadiusTopRight=3)
                 .encode(
                     x=alt.X("카테고리:N", sort=[c["major"] for c in cats_list],
                             axis=alt.Axis(labelAngle=0, title=None)),
                     xOffset="구분:N",
                     y=alt.Y("수량:Q", title=None),
                     color=alt.Color("구분:N",
                                     scale=alt.Scale(domain=["가용", "대여중"], range=["#1e293b", "#ea580c"]),
                                     legend=alt.Legend(orient="bottom", title=None)))
                 .properties(height=230))
        st.altair_chart(chart, use_container_width=True)

    # ── 월별 절감 추이 — 네이비 카드 (완료 거래 수량×대체구매 단가, 최근 4개월) ──
    total, monthly = _quarter_savings(loans, mat_cat, db.category_prices())

    def _won(v):
        if v >= 1e6:
            return f"{v / 1e6:.1f}백만원"
        if v >= 1e4:
            return f"{v / 1e4:.1f}만원"
        return f"{int(v):,}원"

    if total >= 1e6:
        big, unit = f"{total / 1e6:.1f}", "백만원"
    elif total >= 1e4:
        big, unit = f"{total / 1e4:.1f}", "만원"
    else:
        big, unit = f"{int(total):,}", "원"
    mx = max((v for _, v in monthly), default=0) or 1
    bars = ""
    for i, (mon, v) in enumerate(monthly):
        h = int(v / mx * 64) + 6
        col = "#ea580c" if i == len(monthly) - 1 else "rgba(255,255,255,.22)"
        bars += (f"<div class='ssbar'>"
                 f"<div style='width:26px;height:{h}px;background:{col};border-radius:4px'></div>"
                 f"<span class='ssbar-tip'><b>{mon}</b><br>절감액 : {_won(v)}</span>"
                 f"<span style='color:#94a3b8;font-size:11px'>{mon}</span></div>")
    right.markdown(
        f"<div style='background:#1e293b;border-radius:14px;padding:18px 20px'>"
        f"<div style='color:#94a3b8;font-size:.82rem'>월별 절감 추이 <span style='font-size:.72rem'>· 최근 4개월</span></div>"
        f"<div style='color:#fff;font-size:1.7rem;font-weight:800;margin-top:4px'>{big}"
        f"<span style='font-size:.8rem;font-weight:600;color:#cbd5e1;margin-left:4px'>{unit}</span></div>"
        f"<div style='display:flex;justify-content:space-between;align-items:flex-end;margin-top:18px;height:84px'>{bars}</div></div>",
        unsafe_allow_html=True)

    # ── 협력사별 현황 (전원 공개) ──
    st.write("")
    stats = db.public_org_stats()
    with st.container(border=True):
        st.markdown("**협력사별 현황**")
        body = ("<tr style='color:#64748b;text-align:left;font-size:.8rem'>"
                "<th style='padding:6px 0'>협력사</th><th>등록 자재</th>"
                "<th>대여 제공</th><th>대여 사용</th><th>연체</th><th>CO₂ 저감</th></tr>")
        for r in stats:
            od = ("<span style='color:#16a34a'>✓✓</span>" if r["overdue_count"] == 0
                  else f"<span style='color:#dc2626;font-weight:700'>{r['overdue_count']}건</span>")
            body += (f"<tr style='border-top:1px solid #e2e8f0'>"
                     f"<td style='font-weight:700;padding:9px 0'>{r['org_name']}</td>"
                     f"<td>{r['materials_count']}종</td>"
                     f"<td style='color:#2563eb'>{r['provided_count']}건</td>"
                     f"<td style='color:#2563eb'>{r['used_count']}건</td><td>{od}</td>"
                     f"<td style='color:#16a34a'>{round(r.get('co2_avoided') or 0):,}kg</td></tr>")
        st.markdown(f"<table style='width:100%;font-size:.88rem'>{body}</table>", unsafe_allow_html=True)

    # ── 전체 대여 현황 (협력사 간 공유 내역) ──
    with st.container(border=True):
        st.markdown("**전체 대여 현황** <span style='color:#94a3b8;font-size:.78rem'>· 협력사 간 공유 내역</span>",
                    unsafe_allow_html=True)
        feed = db.public_loan_feed(30)
        if not feed:
            st.caption("대여 이력이 없습니다.")
        for l in feed:
            color, lab = _DOT.get(l["status"], ("#64748b", STATUS_KR.get(l["status"], l["status"])))
            period = f"{l.get('pickup_date') or '-'} ~ {l['due_date']}"
            row = st.columns([5, 1])
            row[0].markdown(
                f"<b>{l['material_name']}</b> {l['qty']}{l.get('unit') or ''}<br>"
                f"<span style='color:#64748b;font-size:.8rem'>{l.get('lender_org') or '-'} "
                f"→ {l.get('borrower_org') or '-'} · {period}</span>",
                unsafe_allow_html=True)
            row[1].markdown(
                f"<div style='text-align:right;padding-top:6px'><span style='color:{color}'>●</span> "
                f"<span style='font-size:.82rem;color:#334155'>{lab}</span></div>",
                unsafe_allow_html=True)


# ----------------------------------------------------------------------
# 페이지: 공유 현황 (전원 공개·읽기전용)
# ----------------------------------------------------------------------
def page_share(user):
    st.markdown("## 공유 현황")
    st.caption("협력사 간 자재 공유 현황입니다. 모든 사용자가 볼 수 있습니다.")

    # ── 협력사별 현황 ──
    stats = db.public_org_stats()
    with st.container(border=True):
        st.markdown("**🏢 협력사별 현황**")
        body = ("<tr style='color:#64748b;text-align:left;font-size:.8rem'>"
                "<th style='padding:6px 0'>협력사</th><th>등록 자재</th>"
                "<th>대여 제공</th><th>대여 사용</th><th>연체</th><th>CO₂ 저감</th></tr>")
        for r in stats:
            od = ("<span style='color:#16a34a'>✓✓</span>" if r["overdue_count"] == 0
                  else f"<span style='color:#dc2626;font-weight:700'>{r['overdue_count']}건</span>")
            body += (f"<tr style='border-top:1px solid #e2e8f0'>"
                     f"<td style='font-weight:700;padding:9px 0'>{r['org_name']}</td>"
                     f"<td>{r['materials_count']}종</td>"
                     f"<td style='color:#2563eb'>{r['provided_count']}건</td>"
                     f"<td style='color:#2563eb'>{r['used_count']}건</td><td>{od}</td>"
                     f"<td style='color:#16a34a'>{round(r.get('co2_avoided') or 0):,}kg</td></tr>")
        st.markdown(f"<table style='width:100%;font-size:.88rem'>{body}</table>", unsafe_allow_html=True)

    # ── 전체 대여 현황 (조직 단위, 개인명 제외) ──
    with st.container(border=True):
        st.markdown("**👥 전체 대여 현황** <span style='color:#94a3b8;font-size:.78rem'>· 협력사 간 공유 내역</span>",
                    unsafe_allow_html=True)
        feed = db.public_loan_feed(30)
        if not feed:
            st.caption("대여 이력이 없습니다.")
        for l in feed:
            color, lab = _DOT.get(l["status"], ("#64748b", STATUS_KR.get(l["status"], l["status"])))
            period = f"{l.get('pickup_date') or '-'} ~ {l['due_date']}"
            row = st.columns([5, 1])
            row[0].markdown(
                f"<b>{l['material_name']}</b> {l['qty']}{l.get('unit') or ''}<br>"
                f"<span style='color:#64748b;font-size:.8rem'>{l.get('lender_org') or '-'} "
                f"→ {l.get('borrower_org') or '-'} · {period}</span>",
                unsafe_allow_html=True)
            row[1].markdown(
                f"<div style='text-align:right;padding-top:6px'><span style='color:{color}'>●</span> "
                f"<span style='font-size:.82rem;color:#334155'>{lab}</span></div>",
                unsafe_allow_html=True)


# ----------------------------------------------------------------------
# 페이지: 관리자
# ----------------------------------------------------------------------
def _section_title(text):
    st.markdown(f"<div style='font-weight:700;font-size:1.05rem;margin:8px 0 4px;color:#0f172a'>{text}</div>",
                unsafe_allow_html=True)


def page_admin(user):
    st.markdown("## 관리자 센터")

    loans = db.list_all_loans()
    cats_list = db.list_categories()
    orgs = db.client().table("organizations").select("*").order("name").execute().data
    org_name = {o["id"]: o["name"] for o in orgs}
    users = db.client().table("app_users").select("id, name").execute().data
    user_name = {u["id"]: u["name"] for u in users}
    mats = db.list_materials(None, "", False)

    overdue = [l for l in loans if l["status"] == "OVERDUE"]
    requested = [l for l in loans if l["status"] == "REQUESTED"]

    # ── 1) 연체 경보 배너 ─────────────────────────────
    if overdue:
        f = overdue[0]; m = f.get("materials") or {}
        with st.container(key="overdue_banner"):
            st.markdown(
                f"<div style='color:#b91c1c;font-weight:800;font-size:1rem'>⚠ 연체 {len(overdue)}건 — 즉시 조치 필요</div>"
                f"<div style='color:#7f1d1d;font-size:.84rem;margin:4px 0 8px'>"
                f"{org_name.get(f['borrower_org_id'],'')} · {m.get('name')} {f['qty']}{m.get('unit','')} · 반납예정 {f['due_date']}</div>",
                unsafe_allow_html=True)
            if st.button("독촉 알림 일괄 발송", key="dunning", type="primary"):
                n = db.send_overdue_reminders()
                st.success(f"독촉 발송: {n}건")

    # ── 1.5) 나눔 마감 일괄 비공개 ────────────────────
    if st.button("나눔 마감 일괄 비공개", key="expire_gives"):
        try:
            n = db.mark_expired_gives()
            st.success(f"마감 지난 나눔 비공개: {n}건")
        except Exception as e:
            st.error(f"실패: {e}")

    # ── 2) 승인 대기 (대여 신청) ──────────────────────
    title = "승인 대기" + (f"  {badge(f'{len(requested)}건','warning',solid=True)}" if requested else "")
    st.markdown(f"<div style='font-weight:700;font-size:1.05rem;margin:8px 0 6px'>{title}</div>",
                unsafe_allow_html=True)
    if not requested:
        with st.container(border=True):
            st.markdown("<div style='text-align:center;color:#64748b;padding:18px 0'>대기 중인 대여 신청이 없습니다.</div>",
                        unsafe_allow_html=True)
    for l in requested:
        m = l.get("materials") or {}
        with st.container(border=True):
            col = st.columns([4, 1, 1])
            col[0].markdown(
                f"<b>{m.get('name')}</b> · {l['qty']}{m.get('unit','')}<br>"
                f"<span style='color:#64748b;font-size:.82rem'>{org_name.get(l['borrower_org_id'],'')} · "
                f"{user_name.get(l['borrower_user_id'],'')} · {l.get('pickup_date') or l['due_date']} 수령 예정</span>",
                unsafe_allow_html=True)
            if col[1].button("승인", key=f"aapv_{l['id']}", use_container_width=True):
                try: db.approve_loan(l["id"]); st.rerun()
                except Exception as e: st.error(str(e))
            with col[2].popover("거절", use_container_width=True):
                reason = st.text_input("사유", key=f"arsn_{l['id']}")
                if st.button("거절 확정", key=f"arej_{l['id']}", use_container_width=True):
                    try: db.reject_loan(l["id"], reason); st.rerun()
                    except Exception as e: st.error(str(e))

    # ── 3) 협력사별 현황 ──────────────────────────────
    active = ("REQUESTED", "APPROVED", "ON_LOAN", "RETURN_PENDING", "OVERDUE")
    rows = []
    for o in orgs:
        oid = o["id"]
        rows.append({
            "협력사": o["name"],
            "등록 자재": sum(1 for x in mats if x["org_id"] == oid),
            "대여 제공": sum(1 for x in loans if x["lender_org_id"] == oid and x["status"] in active),
            "대여 사용": sum(1 for x in loans if x["borrower_org_id"] == oid and x["status"] in active),
            "연체": sum(1 for x in loans if x["lender_org_id"] == oid and x["status"] == "OVERDUE"),
        })
    with st.container(border=True):
        h = st.columns([4, 1])
        h[0].markdown("**🏢 협력사별 현황**")
        h[1].download_button("CSV", pd.DataFrame(rows).to_csv(index=False).encode("utf-8-sig"),
                             "협력사현황.csv", use_container_width=True)
        body = ("<tr style='color:#64748b;text-align:left;font-size:.8rem'>"
                "<th style='padding:6px 0'>협력사</th><th>등록 자재</th><th>대여 제공</th><th>대여 사용</th><th>연체</th></tr>")
        for r in rows:
            od = ("<span style='color:#16a34a'>✓✓</span>" if r["연체"] == 0
                  else f"<span style='color:#dc2626;font-weight:700'>{r['연체']}건</span>")
            body += (f"<tr style='border-top:1px solid #e2e8f0'>"
                     f"<td style='font-weight:700;padding:9px 0'>{r['협력사']}</td>"
                     f"<td>{r['등록 자재']}종</td>"
                     f"<td style='color:#2563eb'>{r['대여 제공']}건</td>"
                     f"<td style='color:#2563eb'>{r['대여 사용']}건</td><td>{od}</td></tr>")
        st.markdown(f"<table style='width:100%;font-size:.88rem'>{body}</table>", unsafe_allow_html=True)

    # ── 3.5) 표준단가 관리 (절감액 기준) ───────────────
    with st.container(border=True):
        st.markdown("**대체구매 단가·탄소 원단위** <span style='color:#64748b;font-size:.8rem'>· 재사용 1건당 절감(원/EA, 구매 회피가) + CO₂ 저감(kg/단위) 산정 기준</span>",
                    unsafe_allow_html=True)
        prices = db.category_prices()
        co2s = db.category_co2()
        price_df = pd.DataFrame({
            "카테고리": [c["major"] for c in cats_list],
            "대체구매 단가(원/EA)": [int(prices.get(c["code"], 0)) for c in cats_list],
            "탄소(kg/단위)": [float(co2s.get(c["code"], 0)) for c in cats_list],
        })
        edited = st.data_editor(
            price_df, hide_index=True, use_container_width=True, key="cp_editor",
            disabled=["카테고리"],
            column_config={
                "대체구매 단가(원/EA)": st.column_config.NumberColumn(min_value=0, step=100, format="%d"),
                "탄소(kg/단위)": st.column_config.NumberColumn(min_value=0.0, step=0.1, format="%.2f")})
        if st.button("단가·탄소 저장", key="cp_save", type="primary"):
            for i, c in enumerate(cats_list):
                db.set_category_price(c["code"],
                                      float(edited.iloc[i]["대체구매 단가(원/EA)"]),
                                      float(edited.iloc[i]["탄소(kg/단위)"]))
            st.success("대체구매 단가·탄소 원단위를 저장했습니다.")
            st.rerun()

    # ── 4) 전체 대여 이력 ─────────────────────────────
    with st.container(border=True):
        st.markdown("**👥 전체 대여 이력**")
        if not loans:
            st.caption("이력이 없습니다.")
        for l in loans[:20]:
            m = l.get("materials") or {}
            period = f"{l.get('pickup_date') or '-'} ~ {l['due_date']}"
            col = st.columns([5, 1])
            col[0].markdown(
                f"<b>{m.get('name')}</b> {l['qty']}{m.get('unit','')}<br>"
                f"<span style='color:#64748b;font-size:.8rem'>{org_name.get(l['borrower_org_id'],'')} · "
                f"{user_name.get(l['borrower_user_id'],'')}  {period}</span>",
                unsafe_allow_html=True)
            col[1].markdown(badge(STATUS_KR.get(l["status"], l["status"]),
                                  STATUS_TONE.get(l["status"], "muted"), solid=True),
                            unsafe_allow_html=True)

    # ── 5) 협력사 관리 (관리자 CRUD + 가입 코드) ───────
    _section_title("협력사 관리")
    st.caption("가입 코드는 협력사에 공유하세요. 가입 시 이 코드가 일치해야 합니다.")
    codes = db.org_codes()
    for o in orgs:
        with st.container(border=True):
            oc = st.columns([3, 1.3, 1, 1])
            code = codes.get(o["id"], "—")
            oc[0].markdown(f"<b>{o['name']}</b> "
                           f"<span style='color:#64748b;font-size:.8rem'>· {o.get('type','partner')}</span><br>"
                           f"<span style='font-size:.8rem'>가입 코드 "
                           f"<b style='color:#2563eb;letter-spacing:1px'>{code}</b></span>",
                           unsafe_allow_html=True)
            if oc[1].button("코드 재발급", key=f"oc_{o['id']}", use_container_width=True):
                new = db.reissue_org_code(o["id"]); st.success(f"새 코드: {new}"); st.rerun()
            with oc[2].popover("이름 수정", use_container_width=True):
                non = st.text_input("협력사명", value=o["name"], key=f"on_{o['id']}")
                if st.button("저장", key=f"onb_{o['id']}", type="primary"):
                    db.client().table("organizations").update({"name": non.strip()}).eq("id", o["id"]).execute()
                    st.success("저장됨"); st.rerun()
            if oc[3].button("삭제", key=f"odel_{o['id']}", use_container_width=True):
                try:
                    db.client().table("organizations").delete().eq("id", o["id"]).execute()
                    st.success("삭제됨"); st.rerun()
                except Exception:
                    st.error("사용자·자재가 연결돼 있어 삭제할 수 없습니다.")
    with st.container(border=True):
        nc = st.columns([4, 1])
        new_org = nc[0].text_input("새 협력사명", key="new_org",
                                   label_visibility="collapsed", placeholder="새 협력사명 입력")
        if nc[1].button("추가", key="add_org", type="primary", use_container_width=True):
            if new_org.strip():
                res = db.client().table("organizations").insert(
                    {"name": new_org.strip(), "type": "partner"}).execute()
                new_id = res.data[0]["id"]
                code = db.reissue_org_code(new_id)
                st.success(f"추가됨 · 가입 코드 {code}"); st.rerun()

    # ── 6) 사용자 관리 (정보 수정 / 비번 초기화는 시스템 관리자만) ──
    _section_title("사용자 관리")
    org_id_by_name = {o["name"]: o["id"] for o in orgs}
    sysadmin = auth.is_sysadmin()
    for u in [x for x in db.list_users() if x["status"] == "active"]:
        with st.container(border=True):
            col = st.columns([4, 1.2, 1.2])
            org = (u.get("organizations") or {}).get("name", "-")
            role = "관리자" if u["role"] == "admin" else "멤버"
            col[0].markdown(f"<b>{u['name']}</b> "
                            f"<span style='color:#64748b;font-size:.8rem'>· {org} · {role}"
                            f"{' · ' + u['contact_email'] if u.get('contact_email') else ''}</span>",
                            unsafe_allow_html=True)
            with col[1].popover("정보 수정", use_container_width=True):
                en = st.text_input("이름", value=u["name"], key=f"en_{u['id']}")
                ep = st.text_input("연락처", value=u.get("phone") or "", key=f"ep_{u['id']}")
                org_names = list(org_id_by_name)
                eo = st.selectbox("소속", org_names,
                                  index=org_names.index(org) if org in org_names else 0, key=f"eo_{u['id']}")
                er = st.selectbox("역할", ["member", "admin"],
                                  index=0 if u["role"] == "member" else 1, key=f"er_{u['id']}")
                es = st.selectbox("상태", ["active", "disabled"],
                                  index=0 if u["status"] == "active" else 1, key=f"es_{u['id']}")
                if st.button("저장", key=f"esave_{u['id']}", type="primary"):
                    try:
                        db.client().table("app_users").update({
                            "name": en.strip(), "phone": (ep.strip() or None),
                            "org_id": org_id_by_name[eo], "role": er, "status": es,
                        }).eq("id", u["id"]).execute()
                        st.success("저장됨"); st.rerun()
                    except Exception as e:
                        st.error(str(e))
            if sysadmin and col[2].button("비번 초기화(1111)", key=f"rst_{u['id']}", use_container_width=True):
                try:
                    db.admin_set_password(u["id"], "1111")
                    st.success(f"{u['name']} 비밀번호를 1111 로 초기화했습니다.")
                except Exception as e:
                    st.error(str(e))


_REQ_STATUS_KR = {"open": "모집중", "fulfilled": "성사", "closed": "마감"}
_REQ_STATUS_TONE = {"open": "warning", "fulfilled": "success", "closed": "muted"}


def page_requests(user):
    st.markdown("## 구해요")
    st.caption("필요한 자재를 올리면 보유 협력사가 나눔·대여로 제안합니다.")
    cats = db.list_categories()
    code_by_major = {c["major"]: c["code"] for c in cats}

    with st.expander("구해요 올리기"):
        with st.form("new_req"):
            major = st.selectbox("카테고리", [c["major"] for c in cats])
            title = st.text_input("품목명*", placeholder="예: 안전난간 1.2m")
            c1, c2 = st.columns(2)
            qty = c1.number_input("필요 수량*", 1, 100000, 1)
            needed = c2.date_input("필요 기한(선택)", value=None)
            location = st.text_input("현장/위치(선택)")
            reason = st.text_input("사유/메모(선택)")
            if st.form_submit_button("등록", type="primary"):
                if not title.strip():
                    st.error("품목명은 필수입니다.")
                else:
                    try:
                        db.create_material_request(code_by_major[major], title.strip(),
                                                   int(qty), needed, location, reason)
                        st.success("구해요를 올렸습니다."); st.rerun()
                    except Exception as e:
                        st.error(f"등록 실패: {e}")

    reqs = db.list_material_requests()
    if not reqs:
        with st.container(border=True):
            st.markdown("<div style='text-align:center;color:#64748b;padding:36px 0'>"
                        "아직 올라온 구해요가 없어요. 첫 요청을 올려보세요.</div>", unsafe_allow_html=True)
        return

    for r in reqs:
        with st.container(border=True):
            sub = f"{r.get('major') or r['category']} · {r['requester_org']}"
            if r.get("needed_by"):
                sub += f" · ~{r['needed_by']}"
            if r.get("location"):
                sub += f" · {r['location']}"
            st.markdown(
                "<div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>"
                f"<div><div style='font-weight:700;font-size:1rem'>{r['title']} "
                f"<span style='color:#64748b;font-weight:400'>{r['qty']}개</span></div>"
                f"<div style='color:#64748b;font-size:.84rem;margin-top:2px'>{sub}</div></div>"
                f"<div style='display:flex;gap:6px;align-items:center'>"
                f"{badge(_REQ_STATUS_KR.get(r['status'], r['status']), _REQ_STATUS_TONE.get(r['status'], 'muted'), solid=True)}"
                f"<span style='color:#64748b;font-size:.78rem'>제안 {r['proposal_count']}</span></div></div>",
                unsafe_allow_html=True)
            if r.get("reason"):
                st.markdown(f"<div style='color:#64748b;font-size:.82rem;margin-top:2px'>{r['reason']}</div>",
                            unsafe_allow_html=True)

            if r["is_mine"]:
                with st.expander(f"받은 제안 ({r['proposal_count']})"):
                    props = db.list_proposals_for_request(r["id"])
                    if not props:
                        st.caption("아직 받은 제안이 없습니다.")
                    for p in props:
                        cc1, cc2 = st.columns([4, 1])
                        cc1.markdown(
                            f"<div style='font-size:.9rem'><b>{p['material_name']}</b> "
                            f"<span style='color:#64748b'>{p.get('material_spec') or ''}</span> "
                            f"{deal_badge(p['deal_type'])}</div>"
                            f"<div style='color:#64748b;font-size:.8rem'>{p['proposer_org']} · 가용 {p['qty_available']}"
                            f"{(' · ' + p['message']) if p.get('message') else ''}</div>",
                            unsafe_allow_html=True)
                        if p["status"] == "proposed" and r["status"] == "open":
                            if cc2.button("수락", key=f"acc_{p['id']}", type="primary"):
                                try:
                                    db.accept_proposal(p["id"])
                                    st.success("수락됨 — '내 신청함'에서 진행하세요."); st.rerun()
                                except Exception as e:
                                    st.error(f"실패: {e}")
                        else:
                            cc2.markdown(badge({"accepted": "수락됨", "rejected": "마감",
                                                "withdrawn": "철회"}.get(p["status"], p["status"]), "muted"),
                                         unsafe_allow_html=True)
                if r["status"] == "open" and st.button("요청 마감", key=f"close_{r['id']}"):
                    try:
                        db.close_material_request(r["id"]); st.rerun()
                    except Exception as e:
                        st.error(f"실패: {e}")
            elif r["status"] == "open":
                with st.expander("제안하기"):
                    my_mats = [m for m in db.list_materials(None, "", True)
                               if m["org_id"] == user["org_id"] and m["qty_available"] > 0]
                    if not my_mats:
                        st.caption("제안 가능한 내 조직 자재가 없습니다(가용 수량 필요).")
                    else:
                        opt = st.selectbox(
                            "내 조직 자재", my_mats, key=f"pm_{r['id']}",
                            format_func=lambda m: f"{m['name']} {m.get('spec') or ''} · 가용 {m['qty_available']}"
                                                  f" ({DEAL_KR.get(m.get('deal_type', 'loan'))})")
                        msg = st.text_input("메시지(선택)", key=f"pmsg_{r['id']}")
                        if st.button("제안 보내기", key=f"prop_{r['id']}", type="primary"):
                            try:
                                db.propose_to_request(r["id"], opt["id"], msg)
                                st.success("제안을 보냈습니다."); st.rerun()
                            except Exception as e:
                                st.error(f"실패: {e}")


def _faq_content():
    """활용 방법 FAQ 본문(헤더 ? popover). 항목별 개념 + 간단 절차."""
    st.markdown("##### 활용 방법")

    st.markdown("**나눔 vs 대여**")
    st.caption("나눔=무상 양도(반납 없음, 초록) / 대여=빌려주고 반납(주황).")

    st.markdown("**자재 받기** (필요한 쪽)")
    st.caption("절차 ① 자재 목록 검색 → ② 「나눔 받기」/「대여 신청」 → ③ 보유자 승인 → "
               "④ '내 신청함'에서 수령 확인(사진+서명) → ⑤ (대여) 사용 후 반납 요청")

    st.markdown("**자재 내주기** (보유한 쪽)")
    st.caption("절차 ① 「자재 등록」(유형·수량·사진, 나눔은 마감기한) → ② '내 자재 관리'에서 들어온 신청 승인/거절 → "
               "③ (대여) 반납 요청 시 반납 확정(회수 수량·사진+서명)")

    st.markdown("**구해요** (필요 자재 요청)")
    st.caption("절차 ① '구해요'에 품목·수량·기한 등록 → ② 보유 협력사가 「제안하기」 → "
               "③ 요청자가 「수락」 → ④ '내 신청함'에서 수령으로 진행")

    st.markdown("**현황 보기**")
    st.caption("절차 ① 대시보드에서 임팩트(절감·CO₂)·KPI 확인 → ② 아래 협력사별 현황·전체 거래 피드 확인")


# ----------------------------------------------------------------------
# 메인 라우팅
# ----------------------------------------------------------------------
def main():
    inject_theme()
    if not auth.current_user():
        login_view()
        return

    user = auth.current_user()
    render_header(user)
    # 아이콘 메뉴. 대시보드에 공유 현황 통합 → '공유 현황' 메뉴 제거.
    nav_items = [
        ("대시보드", ":material/bar_chart:"),
        ("자재 목록", ":material/grid_view:"),
        ("구해요", ":material/campaign:"),
        ("내 신청함", ":material/inbox:"),
        ("내 자재 관리", ":material/inventory_2:"),
        ("자재 등록", ":material/add:"),
    ]
    if auth.is_admin():
        nav_items.append(("관리자", ":material/settings:"))
    valid_pages = {label for label, _ in nav_items}
    choice = st.session_state.get("nav", "대시보드")
    if choice not in valid_pages:
        choice = "대시보드"

    mode = st.session_state.get("sidebar_mode", "expanded")
    mini = mode == "mini"
    _toggle_body_class("ps-sidebar-mini", mini)

    with st.sidebar:
        if mini:
            # 접힘: 토글만 (가운데)
            st.markdown("<div class='ps-sb-toggle'>", unsafe_allow_html=True)
            if st.button("»", key="sb_toggle", use_container_width=True):
                st.session_state["sidebar_mode"] = "expanded"
                st.rerun()
            st.markdown("</div>", unsafe_allow_html=True)
        else:
            # 펼침: 브랜드 ⇄ 주Go받Go 와 «  토글을 한 줄에 공존
            bc = st.columns([4, 1], vertical_alignment="center")
            bc[0].markdown(
                "<div class='ps-sb-brand' style='font-size:1.2rem;font-weight:800;color:#2563eb;"
                "line-height:1.2'>⇄ 주Go받Go</div>",
                unsafe_allow_html=True)
            with bc[1]:
                st.markdown("<div class='ps-sb-toggle'>", unsafe_allow_html=True)
                if st.button("«", key="sb_toggle", use_container_width=True):
                    st.session_state["sidebar_mode"] = "mini"
                    st.rerun()
                st.markdown("</div>", unsafe_allow_html=True)
            st.markdown(
                "<div class='ps-sb-sub' style='color:#64748b;font-size:.82rem;margin:6px 0 16px'>"
                "협력사 자재 나눔·대여</div>",
                unsafe_allow_html=True)
        # 아이콘 메뉴 — mini면 라벨은 CSS로 숨겨 아이콘만 표시
        for label, icon in nav_items:
            if st.button(label, icon=icon, key=f"nav_{label}",
                         type="primary" if label == choice else "secondary",
                         use_container_width=True):
                st.session_state["nav"] = label
                st.rerun()
        # 푸터
        st.markdown("<div class='ps-sb-foot'>Samsung C&amp;T · 용인 덕성 AI DC<br>v1.0 · 2026-06-30</div>",
                    unsafe_allow_html=True)

    {
        "자재 목록": page_catalog,
        "구해요": page_requests,
        "자재 등록": page_register,
        "내 신청함": page_my_requests,
        "내 자재 관리": page_lender,
        "대시보드": page_dashboard,
        "관리자": page_admin,
    }[choice](user)


if __name__ == "__main__":
    main()
