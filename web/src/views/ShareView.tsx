import { useEffect, useState } from "react"
import { publicOrgStats, publicLoanFeed } from "@/lib/api"
import type { OrgStat, LoanFeedItem } from "@/lib/api"
import type { Profile } from "@/types"
import { Card, CardContent } from "@/components/ui/card"

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "신청대기", APPROVED: "승인됨", ON_LOAN: "대여중", RETURN_PENDING: "반납확인",
  RETURNED: "반납완료", REJECTED: "거절됨", OVERDUE: "연체",
}
const STATUS_COLOR: Record<string, string> = {
  REQUESTED: "text-warning", APPROVED: "text-success", ON_LOAN: "text-primary",
  RETURN_PENDING: "text-warning", RETURNED: "text-success", REJECTED: "text-muted-foreground", OVERDUE: "text-destructive",
}

export function ShareView({ profile: _profile }: { profile: Profile }) {
  const [stats, setStats] = useState<OrgStat[]>([])
  const [feed, setFeed] = useState<LoanFeedItem[]>([])

  useEffect(() => {
    publicOrgStats().then(setStats)
    publicLoanFeed(30).then(setFeed)
  }, [])

  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl font-bold tracking-tight">공유 현황</h2>
        <p className="text-sm text-muted-foreground">협력사 간 자재 공유 현황입니다. 모든 사용자가 볼 수 있습니다.</p></div>

      {/* 협력사별 현황 */}
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

      {/* 전체 대여 현황 (조직 단위, 개인명 제외) */}
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
