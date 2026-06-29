import { useEffect, useMemo, useState } from "react"
import { Search, MapPin, Package, X } from "lucide-react"
import { listCategories, listMaterials, requestLoan, updateMaterial, deleteMaterial, uploadProof } from "@/lib/api"
import type { Category, Material, Profile, InspectionStatus } from "@/types"
import { INSPECTION_KR } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Field } from "@/components/ui/misc"
import { cn } from "@/lib/utils"
import { sortMaterials, filterByDealType, type SortKey, type DealFilter } from "@/lib/search"
import { DealBadge } from "@/components/DealBadge"

export function Catalog({ profile }: { profile: Profile }) {
  const [cats, setCats] = useState<Category[]>([])
  const [mats, setMats] = useState<Material[]>([])
  const [cat, setCat] = useState("")
  const [kw, setKw] = useState("")
  const [onlyAv, setOnlyAv] = useState(true)
  const [sort, setSort] = useState<SortKey>("recent")
  const [deal, setDeal] = useState<DealFilter>("all")
  const [reqFor, setReqFor] = useState<Material | null>(null)
  const [editFor, setEditFor] = useState<Material | null>(null)
  const isAdmin = profile.role === "admin"

  const codeToMajor = useMemo(() => Object.fromEntries(cats.map((c) => [c.code, c.major])), [cats])

  async function load() {
    setMats(await listMaterials({ category: cat || null, keyword: kw, onlyAvailable: onlyAv }))
  }
  useEffect(() => { listCategories().then(setCats) }, [])
  useEffect(() => { load() }, [cat, onlyAv])
  const shown = useMemo(() => sortMaterials(filterByDealType(mats, deal), sort), [mats, deal, sort])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">자재 목록</h2>
        <p className="text-sm text-muted-foreground">협력사가 공유한 잉여 안전자재를 검색·신청하세요.</p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setCat("")}
            className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              cat === "" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent")}>전체</button>
          {cats.map((c) => (
            <button key={c.code} onClick={() => setCat(c.code)}
              className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                cat === c.code ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent")}>{c.major}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([["all","전체"],["give","나눔"],["loan","대여"]] as [DealFilter,string][]).map(([v,label]) => (
            <button key={v} onClick={() => setDeal(v)}
              className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                deal === v
                  ? (v==="give" ? "border-give bg-give text-give-foreground" : v==="loan" ? "border-loan bg-loan text-loan-foreground" : "border-primary bg-primary text-primary-foreground")
                  : "border-border bg-card hover:bg-accent")}>{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="품목·규격·위치 검색" value={kw}
              onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
          </div>
          <Select className="w-32" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="recent">최신순</option>
            <option value="name">이름순</option>
            <option value="deadline">마감임박</option>
          </Select>
          <label className="flex select-none items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyAv} onChange={(e) => setOnlyAv(e.target.checked)} className="size-4 accent-primary" />
            가용만
          </label>
          <Button variant="outline" onClick={load}>검색</Button>
        </div>
      </div>

      {shown.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">조건에 맞는 자재가 없습니다.</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((m) => {
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
                    <div className="flex flex-col items-end gap-1">
                      <DealBadge type={m.deal_type} />
                      <Badge variant="outline">{codeToMajor[m.category] ?? m.category}</Badge>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between text-sm">
                    <span>가용 <b className="text-primary">{m.qty_available}</b> / {m.qty_total} {m.unit}</span>
                    <Badge variant={m.inspection_status === "good" ? "success" : "warning"}>{INSPECTION_KR[m.inspection_status]}</Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" /> {m.location || "위치 미지정"}
                  </div>
                  {m.deal_type === "give" && m.deadline && (
                    <p className="text-xs text-loan">나눔 마감 {m.deadline}</p>
                  )}
                  {mine || isAdmin ? (
                    <div className="flex items-center gap-2">
                      {mine && <Badge variant="muted" className="w-fit">내 조직 자재</Badge>}
                      <Button size="sm" variant="outline" onClick={() => setEditFor(m)}>수정</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant={m.deal_type==="give" ? "success" : "default"} disabled={blocked} onClick={() => setReqFor(m)}>
                      {blocked ? "신청 불가" : m.deal_type==="give" ? "나눔 받기" : "대여 신청"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {reqFor && <RequestDialog material={reqFor} onClose={() => setReqFor(null)} onDone={() => { setReqFor(null); load() }} />}
      {editFor && <EditDialog material={editFor} cats={cats} onClose={() => setEditFor(null)} onDone={() => { setEditFor(null); load() }} />}
    </div>
  )
}

function EditDialog({ material, cats, onClose, onDone }: { material: Material; cats: Category[]; onClose: () => void; onDone: () => void }) {
  const [category, setCategory] = useState(material.category)
  const [name, setName] = useState(material.name)
  const [spec, setSpec] = useState(material.spec ?? "")
  const [qtyTotal, setQtyTotal] = useState(material.qty_total)
  const [qtyAvail, setQtyAvail] = useState(material.qty_available)
  const [unit, setUnit] = useState(material.unit)
  const [location, setLocation] = useState(material.location ?? "")
  const [insp, setInsp] = useState<InspectionStatus>(material.inspection_status)
  const [expires, setExpires] = useState(material.expires_at ?? "")
  const [files, setFiles] = useState<File[]>([])
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  async function save() {
    if (qtyAvail > qtyTotal) { setErr("가용수량이 총수량보다 클 수 없습니다."); return }
    setBusy(true); setErr("")
    try {
      const fields: Record<string, unknown> = {
        category, name: name.trim(), spec, unit, qty_total: qtyTotal, qty_available: qtyAvail,
        location, inspection_status: insp, expires_at: expires || null,
      }
      if (files.length) {
        const urls: string[] = []
        for (const f of files) urls.push(await uploadProof("material-photos", `materials/${crypto.randomUUID()}_${f.name}`, f))
        fields.photos = urls
      }
      await updateMaterial(material.id, fields)
      onDone()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-md overflow-auto" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">자재 정보 수정</h3>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
          </div>
          <Field label="카테고리">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {cats.map((c) => <option key={c.code} value={c.code}>{c.major}</option>)}
            </Select>
          </Field>
          <Field label="품목명"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="규격"><Input value={spec} onChange={(e) => setSpec(e.target.value)} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="총수량"><Input type="number" value={qtyTotal} onChange={(e) => setQtyTotal(Math.max(0, +e.target.value))} /></Field>
            <Field label="가용수량"><Input type="number" value={qtyAvail} onChange={(e) => setQtyAvail(Math.max(0, +e.target.value))} /></Field>
            <Field label="단위"><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="점검상태">
              <Select value={insp} onChange={(e) => setInsp(e.target.value as InspectionStatus)}>
                {(Object.keys(INSPECTION_KR) as InspectionStatus[]).map((k) => <option key={k} value={k}>{INSPECTION_KR[k]}</option>)}
              </Select>
            </Field>
            <Field label="사용기한"><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
          </div>
          <Field label="보관 위치"><Input value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
          {material.photos?.[0] && <img src={material.photos[0]} alt="" className="h-24 w-24 rounded object-cover" />}
          <Field label="사진 교체(선택)">
            <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </Field>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex justify-between gap-2 pt-1">
            <Button variant="outline" className="text-destructive"
              onClick={async () => { try { await deleteMaterial(material.id); onDone() } catch { setErr("대여 이력이 있어 삭제할 수 없습니다.") } }}>삭제</Button>
            <Button disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function RequestDialog({ material, onClose, onDone }: { material: Material; onClose: () => void; onDone: () => void }) {
  const isGive = material.deal_type === "give"
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
      await requestLoan(material.id, qty, isGive ? null : due, purpose, isGive ? null : (pickup || null))
      onDone()
    } catch (e: any) { setErr(e.message || "신청 실패") } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{isGive ? "나눔 받기" : "대여 신청"}</h3>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
          </div>
          <p className="text-sm text-muted-foreground">{material.name} {material.spec} · 가용 {material.qty_available}{material.unit}</p>
          <Field label="수량" required><Input type="number" min={1} max={material.qty_available} value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(material.qty_available, +e.target.value)))} /></Field>
          {!isGive && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="희망 수령일"><Input type="date" value={pickup} onChange={(e) => setPickup(e.target.value)} /></Field>
              <Field label="반납 예정일" required><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
            </div>
          )}
          <Field label="용도/메모"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="예: 7월 정비 공정" /></Field>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>취소</Button>
            <Button disabled={busy} onClick={submit}>{busy ? "신청 중…" : isGive ? "나눔 받기" : "신청 제출"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
