import { useEffect, useState } from "react"
import {
  listOrgs, listUsers, adminSetPassword, adminUpdateUser, markOverdue,
  addOrg, updateOrg, deleteOrg, listOrgCodes, reissueOrgCode,
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
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [newOrg, setNewOrg] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<any>({})
  const [msg, setMsg] = useState("")
  const sysadmin = !!profile.is_sysadmin

  async function load() {
    setOrgs(await listOrgs())
    setUsers(await listUsers())
    setCodes(await listOrgCodes())
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
          <p className="text-xs text-muted-foreground">가입 코드는 해당 협력사 담당자에게만 공유하세요. 재발급 시 기존 코드는 무효화됩니다.</p>
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
                  <span className="rounded-md bg-accent px-2 py-1 font-mono text-sm font-semibold tracking-widest">{codes[o.id] ?? "----"}</span>
                  <Button size="sm" variant="outline"
                    onClick={async () => { const c = await reissueOrgCode(o.id); setCodes((p) => ({ ...p, [o.id]: c })); setMsg(`${o.name} 새 코드: ${c}`) }}>코드 재발급</Button>
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
              const id = await addOrg(newOrg); const c = await reissueOrgCode(id)
              setNewOrg(""); setMsg(`추가됨 · 가입 코드 ${c}`); await load()
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

      {/* 운영 */}
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
