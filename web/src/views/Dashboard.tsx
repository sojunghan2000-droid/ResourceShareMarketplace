import { useEffect, useRef, useState } from "react"
import { listIncomingLoans, listAllLoans, listMyLoans, getImpactSummary, type ImpactSummary } from "@/lib/api"
import type { Loan, Profile } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Package, AlertTriangle, Clock, Send, Leaf } from "lucide-react"

function Kpi({ label, value, icon, tone, onClick }: {
  label: string; value: number; icon: React.ReactNode; tone: string; onClick?: () => void
}) {
  return (
    <Card onClick={onClick} className={onClick ? "cursor-pointer transition-shadow hover:shadow-md" : undefined}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex size-10 items-center justify-center rounded-lg ${tone}`}>{icon}</div>
        <div>
          <p className="text-3xl font-bold leading-none tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function Dashboard({ profile, onNavigate }: { profile: Profile; onNavigate?: (k: string, tab?: string) => void }) {
  const overdueRef = useRef<HTMLDivElement>(null)
  const [impact, setImpact] = useState<ImpactSummary>({ reuse_count: 0, saved_amount: 0, co2_avoided: 0, q_reuse_count: 0, q_saved_amount: 0, q_co2_avoided: 0 })
  const [incoming, setIncoming] = useState<Loan[]>([])
  const [mine, setMine] = useState<Loan[]>([])

  const isAdmin = profile.role === "admin"
  useEffect(() => {
    ;(isAdmin ? listAllLoans() : listIncomingLoans(profile.org_id)).then(setIncoming)
    listMyLoans(profile.id).then(setMine)
    getImpactSummary().then(setImpact)
  }, [])

  const onLoan = incoming.filter((l) => l.status === "ON_LOAN").length
  const overdueList = incoming.filter((l) => l.status === "OVERDUE")
  const pending = incoming.filter((l) => l.status === "REQUESTED" || l.status === "RETURN_PENDING").length
  const myActive = mine.filter((l) => ["REQUESTED", "APPROVED", "ON_LOAN"].includes(l.status)).length

  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl font-bold tracking-tight">대시보드</h2>
        <p className="text-sm text-muted-foreground">{isAdmin ? "전체 대여 현황 요약입니다. (관리자)" : `${profile.organizations?.name}의 대여 현황 요약입니다.`}</p></div>
      <Card className="border-give/30 bg-give/5">
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <div className="flex items-center gap-2 text-give"><Leaf className="size-5" /><span className="text-sm font-semibold">자원 재사용 임팩트</span></div>
            <div><p className="text-2xl font-bold tabular-nums">{impact.reuse_count}건</p><p className="text-xs text-muted-foreground">누적 재사용</p></div>
            <div><p className="text-2xl font-bold tabular-nums">{Math.round(impact.saved_amount).toLocaleString()}원</p><p className="text-xs text-muted-foreground">누적 절감</p></div>
            <div><p className="text-2xl font-bold tabular-nums text-give">{Math.round(impact.co2_avoided).toLocaleString()}kg</p><p className="text-xs text-muted-foreground">누적 CO₂ 저감</p></div>
          </div>
          <p className="text-xs text-muted-foreground">
            이번 분기: 재사용 {impact.q_reuse_count}건 · 절감 {Math.round(impact.q_saved_amount).toLocaleString()}원 · CO₂ {Math.round(impact.q_co2_avoided).toLocaleString()}kg
          </p>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`대여중 (${isAdmin ? "전체" : "내 자재"})`} value={onLoan} icon={<Package className="size-5 text-primary" />} tone="bg-primary/10"
          onClick={() => onNavigate?.("deals", "given")} />
        <Kpi label={`연체 (${isAdmin ? "전체" : "내 자재"})`} value={overdueList.length} icon={<AlertTriangle className="size-5 text-destructive" />} tone="bg-destructive/10"
          onClick={overdueList.length ? () => overdueRef.current?.scrollIntoView({ behavior: "smooth" }) : undefined} />
        <Kpi label="처리 대기" value={pending} icon={<Clock className="size-5 text-warning" />} tone="bg-warning/10"
          onClick={() => onNavigate?.("deals", "given")} />
        <Kpi label="내 진행 신청" value={myActive} icon={<Send className="size-5 text-success" />} tone="bg-success/10"
          onClick={() => onNavigate?.("deals", "received")} />
      </div>

      {overdueList.length > 0 && (
        <div ref={overdueRef}>
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold text-destructive">
              <AlertTriangle className="size-4" /> 연체 자재
            </div>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left">품목</th><th className="px-3 py-2 text-left">수량</th><th className="px-3 py-2 text-left">반납예정</th></tr>
                </thead>
                <tbody>
                  {overdueList.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2">{l.materials?.name}</td>
                      <td className="px-3 py-2">{l.qty}</td>
                      <td className="px-3 py-2">{l.due_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        </div>
      )}
    </div>
  )
}
