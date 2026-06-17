import { useEffect, useMemo, useState } from "react"
import { Search, MapPin, Package, X } from "lucide-react"
import { listCategories, listMaterials, requestLoan } from "@/lib/api"
import type { Category, Material, Profile } from "@/types"
import { INSPECTION_KR } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Field } from "@/components/ui/misc"

export function Catalog({ profile }: { profile: Profile }) {
  const [cats, setCats] = useState<Category[]>([])
  const [mats, setMats] = useState<Material[]>([])
  const [cat, setCat] = useState("")
  const [kw, setKw] = useState("")
  const [onlyAv, setOnlyAv] = useState(true)
  const [reqFor, setReqFor] = useState<Material | null>(null)

  const codeToMajor = useMemo(() => Object.fromEntries(cats.map((c) => [c.code, c.major])), [cats])

  async function load() {
    setMats(await listMaterials({ category: cat || null, keyword: kw, onlyAvailable: onlyAv }))
  }
  useEffect(() => { listCategories().then(setCats) }, [])
  useEffect(() => { load() }, [cat, onlyAv])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">자재 목록</h2>
        <p className="text-sm text-muted-foreground">협력사가 공유한 잉여 안전자재를 검색·신청하세요.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-44" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">전체 카테고리</option>
          {cats.map((c) => <option key={c.code} value={c.code}>{c.major}</option>)}
        </Select>
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="품목·규격 검색" value={kw}
            onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        </div>
        <label className="flex select-none items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyAv} onChange={(e) => setOnlyAv(e.target.checked)} className="size-4 accent-primary" />
          가용만
        </label>
        <Button variant="outline" onClick={load}>검색</Button>
      </div>

      {mats.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">조건에 맞는 자재가 없습니다.</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mats.map((m) => {
            const mine = m.org_id === profile.org_id
            const blocked = m.inspection_status === "no_use" || m.inspection_status === "damaged" || m.qty_available < 1
            return (
              <Card key={m.id} className="flex flex-col overflow-hidden">
                <div className="flex h-28 items-center justify-center bg-accent/50">
                  {m.photos?.[0]
                    ? <img src={m.photos[0]} alt="" className="h-full w-full object-cover" />
                    : <Package className="size-8 text-muted-foreground/50" />}
                </div>
                <CardContent className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold leading-tight">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.spec || "—"}</p>
                    </div>
                    <Badge variant="outline">{codeToMajor[m.category] ?? m.category}</Badge>
                  </div>
                  <div className="mt-auto flex items-center justify-between text-sm">
                    <span>가용 <b className="text-primary">{m.qty_available}</b> / {m.qty_total} {m.unit}</span>
                    <Badge variant={m.inspection_status === "good" ? "success" : "warning"}>{INSPECTION_KR[m.inspection_status]}</Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" /> {m.location || "위치 미지정"}
                  </div>
                  {mine ? (
                    <Badge variant="muted" className="w-fit">내 조직 자재</Badge>
                  ) : (
                    <Button size="sm" disabled={blocked} onClick={() => setReqFor(m)}>
                      {blocked ? "신청 불가" : "대여 신청"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {reqFor && <RequestDialog material={reqFor} onClose={() => setReqFor(null)} onDone={() => { setReqFor(null); load() }} />}
    </div>
  )
}

function RequestDialog({ material, onClose, onDone }: { material: Material; onClose: () => void; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const due0 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)
  const [qty, setQty] = useState(1)
  const [due, setDue] = useState(due0)
  const [pickup, setPickup] = useState(today)
  const [purpose, setPurpose] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true); setErr("")
    try {
      await requestLoan(material.id, qty, due, purpose, pickup || null)
      onDone()
    } catch (e: any) { setErr(e.message || "신청 실패") } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">대여 신청</h3>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
          </div>
          <p className="text-sm text-muted-foreground">{material.name} {material.spec} · 가용 {material.qty_available}{material.unit}</p>
          <Field label="수량" required><Input type="number" min={1} max={material.qty_available} value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(material.qty_available, +e.target.value)))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="희망 수령일"><Input type="date" value={pickup} onChange={(e) => setPickup(e.target.value)} /></Field>
            <Field label="반납 예정일" required><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          </div>
          <Field label="용도/메모"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="예: 7월 정비 공정" /></Field>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>취소</Button>
            <Button disabled={busy} onClick={submit}>{busy ? "신청 중…" : "신청 제출"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
