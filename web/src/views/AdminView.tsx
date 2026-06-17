import { useEffect, useState } from "react"
import { listPendingUsers, listOrgs, approveUser, markOverdue, listUsers, adminSetPassword } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/misc"

export function AdminView() {
  const [pending, setPending] = useState<any[]>([])
  const [orgs, setOrgs] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [sel, setSel] = useState<Record<string, string>>({})
  const [pwInput, setPwInput] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState("")

  async function load() {
    setPending(await listPendingUsers())
    setOrgs(await listOrgs())
    setUsers(await listUsers())
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl font-bold tracking-tight">관리자</h2>
        <p className="text-sm text-muted-foreground">사용자 가입 승인 및 운영 작업.</p></div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">가입 승인 대기</h3>
          {pending.length === 0 && <p className="rounded-lg bg-accent/40 px-3 py-6 text-center text-sm text-muted-foreground">대기 중인 가입 신청이 없습니다.</p>}
          {pending.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex-1">
                <p className="text-sm font-medium">{u.name || "(이름없음)"}</p>
                <p className="text-xs text-muted-foreground">{u.id.slice(0, 8)}…</p>
              </div>
              <Select className="w-44" value={sel[u.id] ?? ""} onChange={(e) => setSel({ ...sel, [u.id]: e.target.value })}>
                <option value="">소속 협력사 선택</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
              <Button size="sm" variant="success" disabled={!sel[u.id]}
                onClick={async () => { await approveUser(u.id, sel[u.id]); await load() }}>승인</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">사용자 관리</h3>
          {users.filter((u) => u.status === "active").map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <div className="flex-1 min-w-40">
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">
                  {u.organizations?.name ?? "-"} · {u.role === "admin" ? "관리자" : "멤버"}
                </p>
              </div>
              <Input className="w-36" placeholder="새 비밀번호" value={pwInput[u.id] ?? ""}
                onChange={(e) => setPwInput({ ...pwInput, [u.id]: e.target.value })} />
              <Button size="sm" disabled={(pwInput[u.id]?.length ?? 0) < 4}
                onClick={async () => { await adminSetPassword(u.id, pwInput[u.id]); setPwInput({ ...pwInput, [u.id]: "" }); setMsg(`${u.name} 비밀번호 변경됨`) }}>
                변경
              </Button>
              <Button size="sm" variant="outline"
                onClick={async () => { await adminSetPassword(u.id, "1111"); setMsg(`${u.name} 비밀번호를 1111 로 초기화`) }}>
                초기화(1111)
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">운영</h3>
          <Separator />
          <Button variant="outline" onClick={async () => { const n = await markOverdue(); setMsg(`연체 처리: ${n}건`) }}>연체 자재 일괄 갱신</Button>
          {msg && <p className="text-sm text-success">{msg}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
