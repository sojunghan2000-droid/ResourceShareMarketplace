import { useEffect, useState } from "react"
import {
  listMyLoans, listIncomingLoans, listAllLoans,
  pickupLoan, requestReturn, completeGive, approveLoan, rejectLoan, returnLoan,
} from "@/lib/api"
import type { Loan, Profile, InspectionStatus } from "@/types"
import { INSPECTION_KR } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Field } from "@/components/ui/misc"
import { StatusBadge } from "@/components/StatusBadge"
import { DealBadge } from "@/components/DealBadge"
import { ProofCapture } from "@/components/ProofCapture"
import { cn } from "@/lib/utils"

type Tab = "received" | "given"

export function MyDeals({ profile, initialTab = "received" }: { profile: Profile; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  useEffect(() => { setTab(initialTab) }, [initialTab])
  const isAdmin = profile.role === "admin"

  const [received, setReceived] = useState<Loan[]>([])
  const [given, setGiven] = useState<Loan[]>([])
  const [expand, setExpand] = useState<string | null>(null)
  const [proofVal, setProofVal] = useState<{ photos: string[]; signUrl: string | null }>({ photos: [], signUrl: null })
  const [rejectFor, setRejectFor] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [rq, setRq] = useState(0)
  const [cond, setCond] = useState<InspectionStatus>("good")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  async function load() {
    setReceived(await listMyLoans(profile.id))
    const inc = isAdmin ? await listAllLoans() : await listIncomingLoans(profile.org_id)
    setGiven(inc.filter((l) => l.status === "REQUESTED" || l.status === "RETURN_PENDING"))
  }
  useEffect(() => { load() }, [])

  async function wrap(fn: () => Promise<void>) {
    setBusy(true); setErr("")
    try { await fn(); setExpand(null); setProofVal({ photos: [], signUrl: null }); await load() }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  function needProof(): boolean {
    if (proofVal.photos.length < 1 || !proofVal.signUrl) { setErr("사진과 서명이 필요합니다."); return false }
    return true
  }

  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl font-bold tracking-tight">내 거래</h2>
        <p className="text-sm text-muted-foreground">내가 받은(신청한) 거래와 내가 내준(들어온) 거래를 한 곳에서 처리합니다.</p></div>

      <div className="flex gap-1.5">
        {([["received","받은 것"],["given","준 것"]] as [Tab,string][]).map(([v,label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              tab === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent")}>{label}</button>
        ))}
      </div>

      {tab === "received" && (
        received.length === 0
          ? <Card><CardContent className="py-12 text-center text-muted-foreground">받은(신청한) 거래가 없습니다.</CardContent></Card>
          : <div className="space-y-3">{received.map((l) => (
            <Card key={l.id}><CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{l.materials?.name} <span className="font-normal text-muted-foreground">{l.materials?.spec}</span></p>
                  <p className="text-sm text-muted-foreground">{l.qty}{l.materials?.unit}{l.deal_type === "loan" && l.due_date ? ` · 반납예정 ${l.due_date}` : ""}</p>
                </div>
                <div className="flex items-center gap-2"><DealBadge type={l.deal_type} /><StatusBadge status={l.status} /></div>
              </div>
              {l.status === "REJECTED" && l.reject_reason && <p className="text-sm text-destructive">거절 사유: {l.reject_reason}</p>}
              {l.status === "APPROVED" && (
                expand === l.id ? (
                  <div className="space-y-3 rounded-lg border bg-accent/30 p-3">
                    <ProofCapture prefix={`recv_${l.id}`} onChange={(photos, signUrl) => setProofVal({ photos, signUrl })} />
                    {err && <p className="text-sm text-destructive">{err}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => { if (!needProof()) return
                        wrap(() => l.deal_type === "give"
                          ? completeGive(l.id, proofVal.photos, proofVal.signUrl!)
                          : pickupLoan(l.id, proofVal.photos, proofVal.signUrl!)) }}>
                        {l.deal_type === "give" ? "받기 완료" : "수령 완료"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setExpand(null)}>취소</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant={l.deal_type === "give" ? "success" : "default"}
                    onClick={() => { setExpand(l.id); setProofVal({ photos: [], signUrl: null }); setErr("") }}>
                    {l.deal_type === "give" ? "나눔 받기 (사진+서명)" : "수령 확인 (사진+서명)"}
                  </Button>
                )
              )}
              {(l.status === "ON_LOAN" || l.status === "OVERDUE") && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => wrap(() => requestReturn(l.id))}>반납 요청</Button>
              )}
            </CardContent></Card>
          ))}</div>
      )}

      {tab === "given" && (
        given.length === 0
          ? <Card><CardContent className="py-12 text-center text-muted-foreground">처리할 신청·반납이 없습니다.</CardContent></Card>
          : <div className="space-y-3">{given.map((l) => (
            <Card key={l.id}><CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{l.materials?.name} <span className="font-normal text-muted-foreground">{l.materials?.spec}</span></p>
                  <p className="text-sm text-muted-foreground">{l.qty}{l.materials?.unit} · 용도: {l.purpose || "—"}</p>
                </div>
                <div className="flex items-center gap-2"><DealBadge type={l.deal_type} /><StatusBadge status={l.status} /></div>
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
                      <Button size="sm" disabled={busy} onClick={() => { if (!needProof()) return
                        wrap(() => returnLoan(l.id, rq, proofVal.photos, proofVal.signUrl!, cond, note)) }}>반납 완료 확정</Button>
                      <Button size="sm" variant="outline" onClick={() => setExpand(null)}>취소</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => { setExpand(l.id); setRq(l.qty); setCond("good"); setNote(""); setProofVal({ photos: [], signUrl: null }); setErr("") }}>반납 확정 (사진+서명)</Button>
                )
              )}
            </CardContent></Card>
          ))}</div>
      )}
    </div>
  )
}
