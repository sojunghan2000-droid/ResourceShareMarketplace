import { useEffect, useState } from "react"
import { listIncomingLoans, listAllLoans, listMyLoans, publicOrgStats, publicLoanFeed } from "@/lib/api"
import type { OrgStat, LoanFeedItem } from "@/lib/api"
import type { Loan, Profile } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Package, AlertTriangle, Clock, Send } from "lucide-react"

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "신청대기", APPROVED: "승인됨", ON_LOAN: "대여중", RETURN_PENDING: "반납확인",
  RETURNED: "반납완료", REJECTED: "거절됨", OVERDUE: "연체",
}
const STATUS_COLOR: Record<string, string> = {
  REQUESTED: "text-warning", APPROVED: "text-success", ON_LOAN: "text-primary",
  RETURN_PENDING: "text-warning", RETURNED: "text-success", REJECTED: "text-muted-foreground", OVERDUE: "text-destructive",
}

function Kpi({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex size-10 items-center justify-center rounded-lg ${tone}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function Dashboard({ profile }: { profile: Profile }) {
  const [incoming, setIncoming] = useState<Loan[]>([])
  const [mine, setMine] = useState<Loan[]>([])
  const [stats, setStats] = useState<OrgStat[]>([])
  const [feed, setFeed] = useState<LoanFeedItem[]>([])

  const isAdmin = profile.role === "admin"
  useEffect(() => {
    ;(isAdmin ? listAllLoans() : listIncomingLoans(profile.org_id)).then(setIncoming)
    listMyLoans(profile.id).then(setMine)
    publicOrgStats().then(setStats)
    publicLoanFeed(20).then(setFeed)
  }, [])

  const onLoan = incoming.filter((l) => l.status === "ON_LOAN").length
  const overdueList = incoming.filter((l) => l.status === "OVERDUE")
  const pending = incoming.filter((l) => l.status === "REQUESTED" || l.status === "RETURN_PENDING").length
  const myActive = mine.filter((l) => ["REQUESTED", "APPROVED", "ON_LOAN"].includes(l.status)).length

  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl font-bold tracking-tight">대시보드</h2>
        <p className="text-sm text-muted-foreground">{isAdmin ? "전체 대여 현황 요약입니다. (관리자)" : `${profile.organizations?.name}의 대여 현황 요약입니다.`}</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`대여중 (${isAdmin ? "전체" : "내 자재"})`} value={onLoan} icon={<Package className="size-5 text-primary" />} tone="bg-primary/10" />
        <Kpi label={`연체 (${isAdmin ? "전체" : "내 자재"})`} value={overdueList.length} icon={<AlertTriangle className="size-5 text-destructive" />} tone="bg-destructive/10" />
        <Kpi label="처리 대기" value={pending} icon={<Clock className="size-5 text-warning" />} tone="bg-warning/10" />
        <Kpi label="내 진행 신청" value={myActive} icon={<Send className="size-5 text-success" />} tone="bg-success/10" />
      </div>

      {overdueList.length > 0 && (
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
      )}

      {/* 협력사별 현황 (전원 공개·읽기전용) */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 font-semibold">협력사별 현황</div>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">협력사</th>
                  <th className="px-3 py-2 text-left">등록 자재</th>
                  <th className="px-3 py-2 text-left">대여 제공</th>
                  <th className="px-3 py-2 text-left">대여 사용</th>
                  <th className="px-3 py-2 text-left">연체</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.org_id} className="border-t">
                    <td className="px-3 py-2 font-medium">{s.org_name}</td>
                    <td className="px-3 py-2">{s.materials_count}종</td>
                    <td className="px-3 py-2 text-primary">{s.provided_count}건</td>
                    <td className="px-3 py-2 text-primary">{s.used_count}건</td>
                    <td className="px-3 py-2">
                      {s.overdue_count === 0
                        ? <span className="text-success">✓</span>
                        : <span className="font-semibold text-destructive">{s.overdue_count}건</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 전체 대여 현황 (전원 공개·조직 단위, 개인명 제외) */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 font-semibold">전체 대여 현황
            <span className="ml-1 text-xs font-normal text-muted-foreground">· 협력사 간 공유 내역</span>
          </div>
          {feed.length === 0 ? (
            <p className="text-sm text-muted-foreground">대여 이력이 없습니다.</p>
          ) : (
            <div className="divide-y">
              {feed.map((l, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium">{l.material_name}{" "}
                      <span className="text-muted-foreground">{l.qty}{l.unit ?? ""}</span></p>
                    <p className="text-xs text-muted-foreground">
                      {l.lender_org ?? "-"} → {l.borrower_org ?? "-"} · {l.pickup_date ?? "-"} ~ {l.due_date ?? "-"}
                    </p>
                  </div>
                  <span className={`whitespace-nowrap text-xs ${STATUS_COLOR[l.status] ?? "text-muted-foreground"}`}>
                    ● {STATUS_LABEL[l.status] ?? l.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
