import { useEffect, useRef, useState } from "react"
import { Upload, Eraser } from "lucide-react"
import { Button } from "@/components/ui/button"
import { uploadProof } from "@/lib/api"

/** 사진 업로드 + 서명 캔버스. 변경 시 onChange(photos, signUrl) 호출. */
export function ProofCapture({
  prefix, onChange,
}: { prefix: string; onChange: (photos: string[], signUrl: string | null) => void }) {
  const [photos, setPhotos] = useState<string[]>([])
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  useEffect(() => { onChange(photos, signUrl) }, [photos, signUrl])

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setBusy(true)
    try {
      const urls: string[] = []
      for (const f of files) {
        const url = await uploadProof("loan-proofs", `${prefix}/${crypto.randomUUID()}_${f.name}`, f)
        urls.push(url)
      }
      setPhotos((p) => [...p, ...urls])
    } finally { setBusy(false) }
  }

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function down(e: React.PointerEvent) {
    drawing.current = true
    const ctx = canvasRef.current!.getContext("2d")!
    const { x, y } = pos(e)
    ctx.beginPath(); ctx.moveTo(x, y)
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext("2d")!
    const { x, y } = pos(e)
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#111827"
    ctx.lineTo(x, y); ctx.stroke()
    dirty.current = true
  }
  async function up() {
    drawing.current = false
    if (!dirty.current) return
    const c = canvasRef.current!
    c.toBlob(async (blob) => {
      if (!blob) return
      setBusy(true)
      try {
        const url = await uploadProof("loan-proofs", `${prefix}/${crypto.randomUUID()}_sign.png`, blob)
        setSignUrl(url)
      } finally { setBusy(false) }
    }, "image/png")
  }
  function clearSign() {
    const c = canvasRef.current!
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height)
    dirty.current = false; setSignUrl(null)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">실물 사진 <span className="text-destructive">*</span></label>
        <div className="mt-1.5 flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-sm hover:bg-accent">
            <Upload className="size-4" /> 사진 선택
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
          </label>
          {photos.length > 0 && <span className="text-sm text-success">{photos.length}장 업로드됨</span>}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">서명 <span className="text-destructive">*</span></label>
          <Button type="button" variant="ghost" size="sm" onClick={clearSign}><Eraser className="size-3.5" /> 지우기</Button>
        </div>
        <canvas
          ref={canvasRef} width={360} height={120}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          className="mt-1.5 touch-none rounded-md border border-input bg-white"
        />
        {signUrl && <p className="mt-1 text-xs text-success">서명 저장됨</p>}
      </div>
      {busy && <p className="text-xs text-muted-foreground">업로드 중…</p>}
    </div>
  )
}
