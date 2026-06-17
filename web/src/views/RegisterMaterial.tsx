import { useEffect, useState } from "react"
import { listCategories, createMaterial, uploadProof } from "@/lib/api"
import type { Category, Profile, InspectionStatus } from "@/types"
import { INSPECTION_KR } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/misc"
import { Upload } from "lucide-react"

export function RegisterMaterial({ profile }: { profile: Profile }) {
  const [cats, setCats] = useState<Category[]>([])
  const [category, setCategory] = useState("")
  const [name, setName] = useState("")
  const [spec, setSpec] = useState("")
  const [qty, setQty] = useState(1)
  const [unit, setUnit] = useState("EA")
  const [location, setLocation] = useState("")
  const [insp, setInsp] = useState<InspectionStatus>("good")
  const [expires, setExpires] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { listCategories().then((c) => { setCats(c); if (c[0]) setCategory(c[0].code) }) }, [])

  async function submit() {
    if (!name) { setMsg({ ok: false, text: "품목명은 필수입니다." }); return }
    setBusy(true); setMsg(null)
    try {
      const photos: string[] = []
      for (const f of files) {
        photos.push(await uploadProof("material-photos", `materials/${crypto.randomUUID()}_${f.name}`, f))
      }
      await createMaterial({
        org_id: profile.org_id, owner_user_id: profile.id, category, name, spec,
        unit, qty_total: qty, qty_available: qty, location, photos,
        inspection_status: insp, expires_at: expires || null,
      })
      setMsg({ ok: true, text: "자재가 등록되었습니다." })
      setName(""); setSpec(""); setQty(1); setLocation(""); setFiles([]); setExpires("")
    } catch (e: any) { setMsg({ ok: false, text: e.message || "등록 실패" }) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">자재 등록</h2>
        <p className="text-sm text-muted-foreground">잉여 안전자재를 등록해 다른 협력사와 공유하세요.</p>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Field label="카테고리">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {cats.map((c) => <option key={c.code} value={c.code}>{c.major}</option>)}
            </Select>
          </Field>
          <Field label="품목명" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 안전난간" /></Field>
          <Field label="규격"><Input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="예: 1.2m" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="수량" required><Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, +e.target.value))} /></Field>
            <Field label="단위"><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
            <Field label="보관 위치"><Input value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="점검상태">
              <Select value={insp} onChange={(e) => setInsp(e.target.value as InspectionStatus)}>
                {(Object.keys(INSPECTION_KR) as InspectionStatus[]).map((k) => <option key={k} value={k}>{INSPECTION_KR[k]}</option>)}
              </Select>
            </Field>
            <Field label="사용기한 (없으면 비움)"><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
          </div>
          <Field label="사진">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-sm hover:bg-accent">
              <Upload className="size-4" /> 사진 선택
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            </label>
            {files.length > 0 && <span className="ml-2 text-sm text-muted-foreground">{files.length}장 선택됨</span>}
          </Field>
          {msg && <p className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</p>}
          <Button disabled={busy} onClick={submit}>{busy ? "등록 중…" : "등록"}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
