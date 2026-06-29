import { useEffect, useState } from "react"
import {
  listOrgs, listUsers, adminSetPassword, adminUpdateUser, markOverdue, markExpiredGives,
  addOrg, updateOrg, deleteOrg, getSignupRequiresApproval, setSignupRequiresApproval,
  listCategoryPrice, setCategoryPrice, type CategoryPrice,
} from "@/lib/api"
import type { Profile } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/misc"

export function AdminView({ profile }: { profile: Profile }) {
  const [orgs, setOrgs] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [requireApproval, setRequireApproval] = useState(false)
  const [prices, setPrices] = useState<CategoryPrice[]>([])
  const [newOrg, setNewOrg] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<any>({})
  const [msg, setMsg] = useState("")
  const sysadmin = !!profile.is_sysadmin

  async function load() {
    setOrgs(await listOrgs())
    setUsers(await listUsers())
    setRequireApproval(await getSignupRequiresApproval())
    setPrices(await listCategoryPrice())
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl font-bold tracking-tight">관리자 센터</h2>
        <p className="text-sm text-muted-foreground">협력사·사용자 관리 및 운영.</p></div>

      {/* 협력사 관리 */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">협력사 관리</h3>
          <p className="text-xs text-muted-foreground">협력사를 추가·수정·삭제합니다.</p>
          {orgs.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              {editId === `org-${o.id}` ? (
                <>
                  <Input className="flex-1" value={form.orgName} onChange={(e) => setForm({ ...form, orgName: e.target.value })} />
                  <Button size="sm" onClick={async () => { await updateOrg(o.id, form.orgName); setEditId(null); await load() }}>저장</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-40 text-sm font-medium">{o.name} <span className="text-xs text-muted-foreground">· {o.type}</span></span>
                  <Button size="sm" variant="outline" onClick={() => { setEditId(`org-${o.id}`); setForm({ orgName: o.name }) }}>이름 수정</Button>
                  <Button size="sm" variant="outline"
                    onClick={async () => { try { await deleteOrg(o.id); await load() } catch { setMsg("사용자·자재가 연결돼 있어 삭제할 수 없습니다.") } }}>삭제</Button>
                </>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Input className="flex-1" placeholder="새 협력사명" value={newOrg} onChange={(e) => setNewOrg(e.target.value)} />
            <Button size="sm" disabled={!newOrg.trim()} onClick={async () => {
              await addOrg(newOrg)
              setNewOrg(""); setMsg("협력사가 추가되었습니다."); await load()
            }}>추가</Button>
          </div>
        </CardContent>
      </Card>

      {/* 사용자 관리 */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">사용자 관리</h3>
          {users.filter((u) => u.status === "active").map((u) => (
            <div key={u.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-40">
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.organizations?.name ?? "-"} · {u.role === "admin" ? "관리자" : "멤버"}{u.contact_email ? ` · ${u.contact_email}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline"
                  onClick={() => { setEditId(editId === u.id ? null : u.id); setForm({ name: u.name, phone: u.phone ?? "", org_id: u.org_id, role: u.role, status: u.status }) }}>
                  정보 수정
                </Button>
                {sysadmin && (
                  <Button size="sm" variant="outline"
                    onClick={async () => { await adminSetPassword(u.id, "1111"); setMsg(`${u.name} 비밀번호를 1111 로 초기화`) }}>
                    비번 초기화(1111)
                  </Button>
                )}
              </div>
              {editId === u.id && (
                <div className="grid gap-2 rounded-lg bg-accent/30 p-3 sm:grid-cols-2">
                  <Input placeholder="이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <Input placeholder="연락처" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  <Select value={form.org_id ?? ""} onChange={(e) => setForm({ ...form, org_id: e.target.value })}>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                  <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="member">멤버</option><option value="admin">관리자</option>
                  </Select>
                  <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="active">active</option><option value="disabled">disabled</option>
                  </Select>
                  <Button size="sm" onClick={async () => {
                    await adminUpdateUser(u.id, { name: form.name.trim(), phone: form.phone.trim() || null, org_id: form.org_id, role: form.role, status: form.status })
                    setEditId(null); setMsg(`${form.name} 정보 저장됨`); await load()
                  }}>저장</Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 카테고리 단가·탄소 */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">카테고리 단가·탄소 원단위</h3>
          <p className="text-xs text-muted-foreground">표준단가는 구매비 절감액, 탄소 원단위(kgCO₂e/단위)는 CO₂ 저감 계산에 쓰입니다.</p>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr><th className="px-3 py-2 text-left">카테고리</th><th className="px-3 py-2 text-left">표준단가(원)</th><th className="px-3 py-2 text-left">CO₂(kg/단위)</th><th className="px-3 py-2"></th></tr>
              </thead>
              <tbody>
                {prices.map((p, i) => (
                  <tr key={p.code} className="border-t">
                    <td className="px-3 py-2 font-medium">{p.major}</td>
                    <td className="px-3 py-2"><Input type="number" min={0} value={p.unit_price}
                      onChange={(e) => setPrices((arr) => arr.map((x, j) => j === i ? { ...x, unit_price: Math.max(0, +e.target.value) } : x))} /></td>
                    <td className="px-3 py-2"><Input type="number" min={0} step="0.01" value={p.co2_per_unit}
                      onChange={(e) => setPrices((arr) => arr.map((x, j) => j === i ? { ...x, co2_per_unit: Math.max(0, +e.target.value) } : x))} /></td>
                    <td className="px-3 py-2"><Button size="sm" variant="outline"
                      onClick={async () => { await setCategoryPrice(p.code, p.unit_price, p.co2_per_unit); setMsg(`${p.major} 단가·탄소 저장됨`) }}>저장</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 운영 */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">운영</h3>
          <Separator />
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span>
              <span className="text-sm font-medium">가입 승인 필요</span>
              <span className="block text-xs text-muted-foreground">켜면 신규 가입이 '승인 대기'로 생성됩니다. (기본: 꺼짐 = 즉시 이용)</span>
            </span>
            <input type="checkbox" className="size-5 accent-primary" checked={requireApproval}
              onChange={async (e) => { const v = e.target.checked; setRequireApproval(v); await setSignupRequiresApproval(v); setMsg(`가입 승인 필요: ${v ? "켜짐" : "꺼짐"}`) }} />
          </label>
          <Separator />
          <Button variant="outline" onClick={async () => { const n = await markOverdue(); setMsg(`연체 처리: ${n}건`) }}>연체 자재 일괄 갱신</Button>
          <Button variant="outline" onClick={async () => { const n = await markExpiredGives(); setMsg(`마감 나눔 비공개: ${n}건`) }}>나눔 마감 일괄 비공개</Button>
          {msg && <p className="text-sm text-success">{msg}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
