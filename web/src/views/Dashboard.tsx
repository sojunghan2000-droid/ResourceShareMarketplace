import { useEffect, useState } from "react"
import { listIncomingLoans, listAllLoans, listMyLoans } from "@/lib/api"
import type { Loan, Profile } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Package, AlertTriangle, Clock, Send } from "lucide-react"

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

  const isAdmin = profile.role === "admin"
  useEffect(() => {
    ;(isAdmin ? listAllLoans() : listIncomingLoans(profile.org_id)).then(setIncoming)
    listMyLoans(profile.id).then(setMine)
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
    </div>
  )
}
