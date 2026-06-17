import { useEffect, useState } from "react"
import { listMyLoans, pickupLoan, requestReturn } from "@/lib/api"
import type { Loan, Profile } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/StatusBadge"
import { ProofCapture } from "@/components/ProofCapture"

export function MyLoans({ profile }: { profile: Profile }) {
  const [loans, setLoans] = useState<Loan[]>([])
  const [expand, setExpand] = useState<string | null>(null)
  const proof = useState<{ photos: string[]; signUrl: string | null }>({ photos: [], signUrl: null })
  const [proofVal, setProofVal] = proof
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  async function load() { setLoans(await listMyLoans(profile.id)) }
  useEffect(() => { load() }, [])

  async function doPickup(id: string) {
    if (proofVal.photos.length < 1 || !proofVal.signUrl) { setErr("사진과 서명이 필요합니다."); return }
    setBusy(true); setErr("")
    try { await pickupLoan(id, proofVal.photos, proofVal.signUrl); setExpand(null); setProofVal({ photos: [], signUrl: null }); await load() }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  async function doReturn(id: string) {
    setBusy(true)
    try { await requestReturn(id); await load() } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl font-bold tracking-tight">내 신청함</h2>
        <p className="text-sm text-muted-foreground">내가 신청한 대여 건의 진행 상황입니다.</p></div>
      {loans.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">신청 내역이 없습니다.</CardContent></Card>}
      <div className="space-y-3">
        {loans.map((l) => (
          <Card key={l.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{l.materials?.name} <span className="font-normal text-muted-foreground">{l.materials?.spec}</span></p>
                  <p className="text-sm text-muted-foreground">{l.qty}{l.materials?.unit} · 반납예정 {l.due_date}</p>
                </div>
                <StatusBadge status={l.status} />
              </div>
              {l.status === "REJECTED" && l.reject_reason && <p className="text-sm text-destructive">거절 사유: {l.reject_reason}</p>}
              {l.status === "APPROVED" && (
                expand === l.id ? (
                  <div className="space-y-3 rounded-lg border bg-accent/30 p-3">
                    <ProofCapture prefix={`pick_${l.id}`} onChange={(photos, signUrl) => setProofVal({ photos, signUrl })} />
                    {err && <p className="text-sm text-destructive">{err}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => doPickup(l.id)}>수령 완료</Button>
                      <Button size="sm" variant="outline" onClick={() => setExpand(null)}>취소</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => { setExpand(l.id); setProofVal({ photos: [], signUrl: null }); setErr("") }}>수령 확인 (사진+서명)</Button>
                )
              )}
              {(l.status === "ON_LOAN" || l.status === "OVERDUE") && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => doReturn(l.id)}>반납 요청</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
