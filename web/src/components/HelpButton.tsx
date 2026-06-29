import { useEffect, useState } from "react"
import { HelpCircle, X } from "lucide-react"

type FaqGroup = { group: string; admin?: boolean; items: { q: string; a: string }[] }

const FAQ_GROUPS: FaqGroup[] = [
  {
    group: "시작하기",
    items: [
      { q: "주Go받Go앱은 무엇인가요?", a: "협력사 간 잉여 안전자재를 나눔(무상 양도)과 대여(반납)로 주고받는 플랫폼입니다. 폐기·반출 비용을 줄이고 자재를 재사용해 서로 이득을 봅니다." },
      { q: "가입은 어떻게 하나요?", a: "로그인 화면에서 '가입 신청' 탭을 선택해 아이디·이름·협력사 이메일·소속 협력사·비밀번호를 입력합니다. 관리자가 '가입 승인 필요'를 켜 둔 경우 승인 후 이용할 수 있습니다." },
      { q: "나눔과 대여는 무엇이 다른가요?", a: "나눔은 무상 양도로 반납이 없으며 초록색으로 표시됩니다. 대여는 빌려준 뒤 반납받는 방식으로 주황색으로 표시됩니다." },
    ],
  },
  {
    group: "자재 찾고 받기",
    items: [
      { q: "원하는 자재를 어떻게 찾나요?", a: "'자재 목록'에서 카테고리 칩과 유형(나눔/대여) 필터, 검색창(품목·규격·위치), 정렬(최신순·이름순·마감임박), '가용만' 옵션으로 좁혀 찾습니다." },
      { q: "자재를 받으려면?", a: "자재 카드에서 나눔은 「나눔 받기」, 대여는 「대여 신청」을 누릅니다. 대여는 수량·희망 수령일·반납 예정일·용도를, 나눔은 수량·용도를 입력합니다." },
      { q: "받기로 한 자재 수령은?", a: "보유 협력사가 승인하면 '내 거래'의 '받은 것' 탭에서 「수령 확인」(대여)·「나눔 받기」(나눔)를 눌러 사진과 서명을 남깁니다. 대여는 '대여중', 나눔은 '수령완료'가 됩니다." },
      { q: "빌린 자재 반납은?", a: "'내 거래'의 '받은 것'에서 「반납 요청」을 누르면 보유 협력사가 실물을 확인한 뒤 반납을 확정합니다. 나눔은 반납이 없습니다." },
    ],
  },
  {
    group: "자재 내주기",
    items: [
      { q: "자재를 등록하려면?", a: "우측 상단 「자재 등록」에서 거래 유형(나눔/대여)·카테고리·수량·점검상태·사진을 입력합니다. 나눔은 마감기한을 정할 수 있습니다." },
      { q: "들어온 신청은 어떻게 처리하나요?", a: "'내 거래'의 '준 것' 탭에서 신청을 승인하거나 거절합니다. 대여 반납 요청은 「반납 확정」에서 회수 수량·점검상태·사진·서명으로 마무리합니다." },
      { q: "등록한 자재를 수정·삭제하려면?", a: "'자재 목록'에서 내 조직 자재 카드의 「수정」을 누르면 정보를 변경하거나 삭제할 수 있습니다." },
    ],
  },
  {
    group: "구해요 (필요 자재 요청)",
    items: [
      { q: "필요한 자재가 목록에 없으면?", a: "'구해요' 메뉴에서 「구해요 올리기」로 품목·수량·필요기한·현장·사유를 올리면 보유 협력사가 제안합니다." },
      { q: "내가 보유한 자재를 제안하려면?", a: "'구해요' 목록에서 다른 협력사의 요청에 「제안하기」를 누르고 내 조직 자재를 선택해 제안합니다." },
      { q: "받은 제안을 수락하려면?", a: "내가 올린 요청에서 「제안 보기」로 받은 제안을 확인하고 「수락」하면 거래가 자동으로 생성되어 '내 거래'에서 이어집니다." },
    ],
  },
  {
    group: "현황·알림",
    items: [
      { q: "대시보드의 절감·CO₂ 숫자는?", a: "재사용된 거래의 누적·이번 분기 구매비 절감액과 탄소 저감량입니다. KPI 카드를 누르면 관련 화면으로 이동합니다. 단가와 탄소 원단위는 관리자가 설정합니다." },
      { q: "공유 현황은 무엇인가요?", a: "협력사별 등록·제공·사용·연체·CO₂ 저감 현황과 전체 거래 피드를 모든 사용자가 볼 수 있는 화면입니다." },
      { q: "알림은 어디서 보나요?", a: "신청·승인·반납·제안·수락 등이 생기면 헤더의 알림 벨에 표시됩니다." },
    ],
  },
  {
    group: "관리자",
    admin: true,
    items: [
      { q: "관리자 센터에서 무엇을 하나요?", a: "협력사·사용자 관리, 가입 승인 필요 토글, 카테고리 단가·탄소 원단위 설정, 연체 자재 일괄 갱신, 마감 지난 나눔 일괄 비공개를 처리합니다." },
    ],
  },
]

export function HelpButton({ role }: { role: "member" | "admin" }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const groups = FAQ_GROUPS.filter((g) => !g.admin || role === "admin")

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="활용 방법"
        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <HelpCircle className="size-[18px]" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div className="flex h-full w-full max-w-sm flex-col bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-base font-bold tracking-tight">활용 방법</h2>
              <button onClick={() => setOpen(false)} aria-label="닫기"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {groups.map((g) => (
                <div key={g.group} className="mb-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</p>
                  <div className="space-y-1.5">
                    {g.items.map((it) => (
                      <details key={it.q} className="rounded-lg border bg-background px-3 py-2">
                        <summary className="cursor-pointer text-sm font-medium">{it.q}</summary>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{it.a}</p>
                      </details>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
