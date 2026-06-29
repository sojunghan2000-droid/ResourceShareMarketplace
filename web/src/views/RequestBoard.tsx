import { useEffect, useState } from "react"
import { listCategories, listMaterialRequests, createMaterialRequest, closeMaterialRequest, listProposalsForRequest, proposeToRequest, acceptProposal, listMaterials } from "@/lib/api"
import type { Category, MaterialRequest, Profile, Material, RequestProposal } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Field } from "@/components/ui/misc"
import { Badge } from "@/components/ui/badge"
import { DealBadge } from "@/components/DealBadge"

const STATUS_KR: Record<MaterialRequest["status"], string> = { open: "모집중", fulfilled: "성사", closed: "마감" }
const STATUS_VARIANT: Record<MaterialRequest["status"], "warning" | "success" | "muted"> = {
  open: "warning", fulfilled: "success", closed: "muted",
}

export function RequestBoard({ profile }: { profile: Profile }) {
  const [cats, setCats] = useState<Category[]>([])
  const [reqs, setReqs] = useState<MaterialRequest[]>([])
  const [showForm, setShowForm] = useState(false)
  const [category, setCategory] = useState("")
  const [title, setTitle] = useState("")
  const [qty, setQty] = useState(1)
  const [neededBy, setNeededBy] = useState("")
  const [location, setLocation] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [expand, setExpand] = useState<string | null>(null)        // 펼친 요청 id
  const [proposals, setProposals] = useState<RequestProposal[]>([])
  const [myMats, setMyMats] = useState<Material[]>([])
  const [pick, setPick] = useState<string>("")                     // 제안할 자재 id
  const [pmsg, setPmsg] = useState("")                             // 제안 메시지

  async function load() { setReqs(await listMaterialRequests()) }
  useEffect(() => { listCategories().then((c) => { setCats(c); if (c[0]) setCategory(c[0].code) }) }, [])
  useEffect(() => { load() }, [])

  async function submit() {
    if (!title.trim()) { setMsg("품목명을 입력하세요."); return }
    setBusy(true); setMsg("")
    try {
      await createMaterialRequest(category, title, qty, neededBy || null, location, reason)
      setTitle(""); setQty(1); setNeededBy(""); setLocation(""); setReason(""); setShowForm(false)
      setMsg("구해요를 올렸습니다."); await load()
    } catch (e: any) { setMsg(e.message || "등록 실패") } finally { setBusy(false) }
  }

  async function openRow(r: MaterialRequest) {
    if (expand === r.id) { setExpand(null); return }
    setExpand(r.id); setPick(""); setPmsg(""); setMsg("")
    if (r.is_mine) {
      setProposals(await listProposalsForRequest(r.id))
    } else {
      const all = await listMaterials({})
      setMyMats(all.filter((m) => m.org_id === profile.org_id && m.qty_available > 0))
    }
  }
  async function doPropose(r: MaterialRequest) {
    if (!pick) { setMsg("제안할 자재를 선택하세요."); return }
    setBusy(true); setMsg("")
    try { await proposeToRequest(r.id, pick, pmsg); setExpand(null); setMsg("제안을 보냈습니다."); await load() }
    catch (e: any) { setMsg(e.message || "제안 실패") } finally { setBusy(false) }
  }
  async function doAccept(p: RequestProposal) {
    setBusy(true); setMsg("")
    try { await acceptProposal(p.id); setExpand(null); setMsg("제안을 수락해 거래가 시작되었습니다. '내 거래'에서 진행하세요."); await load() }
    catch (e: any) { setMsg(e.message || "수락 실패") } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-2xl font-bold tracking-tight">구해요</h2>
          <p className="text-sm text-muted-foreground">필요한 자재를 올리면 보유 협력사가 나눔·대여로 제안합니다.</p></div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "닫기" : "구해요 올리기"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="space-y-3 pt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="카테고리">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {cats.map((c) => <option key={c.code} value={c.code}>{c.major}</option>)}
              </Select>
            </Field>
            <Field label="필요 수량" required><Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, +e.target.value))} /></Field>
          </div>
          <Field label="품목명" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 안전난간 1.2m" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="필요 기한 (선택)"><Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} /></Field>
            <Field label="현장/위치 (선택)"><Input value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
          </div>
          <Field label="사유/메모 (선택)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 7월 정비 공정용" /></Field>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
          <Button disabled={busy} onClick={submit}>{busy ? "올리는 중…" : "구해요 등록"}</Button>
        </CardContent></Card>
      )}

      {reqs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">아직 올라온 구해요가 없어요. 첫 요청을 올려보세요.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {reqs.map((r) => (
            <Card key={r.id}><CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{r.title} <span className="font-normal text-muted-foreground">{r.qty}개</span></p>
                  <p className="text-xs text-muted-foreground">
                    {r.major ?? r.category} · {r.requester_org}{r.needed_by ? ` · ~${r.needed_by}` : ""}{r.location ? ` · ${r.location}` : ""}
                  </p>
                  {r.reason && <p className="mt-1 text-sm text-muted-foreground">{r.reason}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_KR[r.status]}</Badge>
                  <span className="text-xs text-muted-foreground">제안 {r.proposal_count}</span>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {r.status === "open" && !r.is_mine && (
                  <Button size="sm" onClick={() => openRow(r)}>{expand === r.id ? "닫기" : "제안하기"}</Button>
                )}
                {r.is_mine && (
                  <Button size="sm" variant="outline" onClick={() => openRow(r)}>{expand === r.id ? "닫기" : `제안 보기 (${r.proposal_count})`}</Button>
                )}
                {r.is_mine && r.status === "open" && (
                  <Button size="sm" variant="outline" onClick={async () => { await closeMaterialRequest(r.id); setMsg("요청을 마감했습니다."); setExpand(null); await load() }}>마감</Button>
                )}
              </div>

              {expand === r.id && !r.is_mine && r.status === "open" && (
                <div className="space-y-2 rounded-lg border bg-accent/30 p-3">
                  <Field label="내 조직 자재 선택">
                    <Select value={pick} onChange={(e) => setPick(e.target.value)}>
                      <option value="">선택</option>
                      {myMats.map((m) => <option key={m.id} value={m.id}>{m.name} {m.spec ?? ""} · 가용 {m.qty_available} ({m.deal_type === "give" ? "나눔" : "대여"})</option>)}
                    </Select>
                  </Field>
                  <Field label="메시지 (선택)"><Input value={pmsg} onChange={(e) => setPmsg(e.target.value)} placeholder="예: 즉시 제공 가능합니다" /></Field>
                  {myMats.length === 0 && <p className="text-xs text-muted-foreground">제안 가능한 내 조직 자재가 없습니다(가용 수량 필요).</p>}
                  <div className="flex justify-end"><Button size="sm" disabled={busy || !pick} onClick={() => doPropose(r)}>제안 보내기</Button></div>
                </div>
              )}

              {expand === r.id && r.is_mine && (
                <div className="space-y-2 rounded-lg border bg-accent/30 p-3">
                  {proposals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">아직 받은 제안이 없습니다.</p>
                  ) : proposals.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-2">
                      <div>
                        <p className="text-sm font-medium">{p.material_name} <span className="font-normal text-muted-foreground">{p.material_spec ?? ""}</span></p>
                        <p className="text-xs text-muted-foreground">{p.proposer_org} · 가용 {p.qty_available}{p.message ? ` · ${p.message}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <DealBadge type={p.deal_type} />
                        {p.status === "proposed" && r.status === "open"
                          ? <Button size="sm" disabled={busy} onClick={() => doAccept(p)}>수락</Button>
                          : <Badge variant="muted">{p.status === "accepted" ? "수락됨" : p.status === "rejected" ? "마감" : "철회"}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  )
}
