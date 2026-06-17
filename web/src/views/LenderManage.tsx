import { useEffect, useState } from "react"
import { listIncomingLoans, listAllLoans, approveLoan, rejectLoan, returnLoan } from "@/lib/api"
import type { Loan, Profile, InspectionStatus } from "@/types"
import { INSPECTION_KR } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Field } from "@/components/ui/misc"
import { StatusBadge } from "@/components/StatusBadge"
import { ProofCapture } from "@/components/ProofCapture"

export function LenderManage({ profile }: { profile: Profile }) {
  const [loans, setLoans] = useState<Loan[]>([])
  const [expand, setExpand] = useState<string | null>(null)
  const [rejectFor, setRejectFor] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [rq, setRq] = useState(0)
  const [cond, setCond] = useState<InspectionStatus>("good")
  const [note, setNote] = useState("")
  const [proofVal, setProofVal] = useState<{ photos: string[]; signUrl: string | null }>({ photos: [], signUrl: null })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const isAdmin = profile.role === "admin"
  async function load() {
    const all = isAdmin ? await listAllLoans() : await listIncomingLoans(profile.org_id)
    setLoans(all.filter((l) => l.status === "REQUESTED" || l.status === "RETURN_PENDING"))
  }
  useEffect(() => { load() }, [])

  async function wrap(fn: () => Promise<void>) {
    setBusy(true); setErr("")
    try { await fn(); await load() } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl font-bold tracking-tight">{isAdmin ? "전체 대여 관리" : "내 자재 관리"}</h2>
        <p className="text-sm text-muted-foreground">{isAdmin ? "모든 협력사의 신청·반납을 처리합니다. (관리자)" : "들어온 신청을 승인하고, 반납을 확정하세요."}</p></div>
      {loans.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">처리할 신청·반납이 없습니다.</CardContent></Card>}
      <div className="space-y-3">
        {loans.map((l) => (
          <Card key={l.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{l.materials?.name} <span className="font-normal text-muted-foreground">{l.materials?.spec}</span></p>
                  <p className="text-sm text-muted-foreground">{l.qty}{l.materials?.unit} · 용도: {l.purpose || "—"}</p>
                </div>
                <StatusBadge status={l.status} />
              </div>

              {l.status === "REQUESTED" && (
                rejectFor === l.id ? (
                  <div className="flex gap-2">
                    <Input placeholder="거절 사유" value={reason} onChange={(e) => setReason(e.target.value)} />
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => wrap(async () => { await rejectLoan(l.id, reason); setRejectFor(null); setReason("") })}>거절 확정</Button>
                    <Button size="sm" variant="outline" onClick={() => setRejectFor(null)}>취소</Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="success" disabled={busy} onClick={() => wrap(() => approveLoan(l.id))}>승인</Button>
                    <Button size="sm" variant="outline" onClick={() => { setRejectFor(l.id); setReason("") }}>거절</Button>
                  </div>
                )
              )}

              {l.status === "RETURN_PENDING" && (
                expand === l.id ? (
                  <div className="space-y-3 rounded-lg border bg-accent/30 p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={`실제 회수 수량 (최대 ${l.qty})`}>
                        <Input type="number" min={0} max={l.qty} value={rq} onChange={(e) => setRq(Math.max(0, Math.min(l.qty, +e.target.value)))} />
                      </Field>
                      <Field label="점검상태">
                        <Select value={cond} onChange={(e) => setCond(e.target.value as InspectionStatus)}>
                          {(Object.keys(INSPECTION_KR) as InspectionStatus[]).map((k) => <option key={k} value={k}>{INSPECTION_KR[k]}</option>)}
                        </Select>
                      </Field>
                    </div>
                    <Field label="메모"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                    <ProofCapture prefix={`ret_${l.id}`} onChange={(photos, signUrl) => setProofVal({ photos, signUrl })} />
                    {err && <p className="text-sm text-destructive">{err}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => {
                        if (proofVal.photos.length < 1 || !proofVal.signUrl) { setErr("사진과 서명이 필요합니다."); return }
                        wrap(async () => { await returnLoan(l.id, rq, proofVal.photos, proofVal.signUrl!, cond, note); setExpand(null) })
                      }}>반납 완료 확정</Button>
                      <Button size="sm" variant="outline" onClick={() => setExpand(null)}>취소</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => { setExpand(l.id); setRq(l.qty); setCond("good"); setNote(""); setProofVal({ photos: [], signUrl: null }); setErr("") }}>반납 확정 (사진+서명)</Button>
                )
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
