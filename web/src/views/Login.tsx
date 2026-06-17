import { useEffect, useState } from "react"
import { ShieldCheck } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { registerUser, listOrgsPublic } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, Field } from "@/components/ui/misc"

const DOMAIN = "safeshare.app"
const toEmail = (id: string) => {
  const v = id.trim().toLowerCase()
  return v.includes("@") ? v : `${v}@${DOMAIN}`
}

export function Login() {
  const [tab, setTab] = useState("login")
  const [uid, setUid] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [orgId, setOrgId] = useState("")
  const [code, setCode] = useState("")
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([])
  const [pw, setPw] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (tab === "signup" && orgs.length === 0) listOrgsPublic().then(setOrgs) }, [tab])

  async function signIn() {
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email: toEmail(uid), password: pw })
    setBusy(false)
    if (error) setMsg({ ok: false, text: "로그인 실패: 아이디 또는 비밀번호를 확인하세요." })
  }
  async function signUp() {
    setBusy(true); setMsg(null)
    if (/(@samsung\.com|\.samsung\.com)$/i.test(email.trim())) {
      setMsg({ ok: false, text: "Knox(삼성 임직원) 계정은 가입할 수 없습니다. 협력사 이메일로 가입하세요." }); setBusy(false); return
    }
    try {
      await registerUser(uid, pw, name, orgId, email, code)
      setMsg({ ok: true, text: "가입 완료! 바로 로그인하세요." })
    } catch (e: any) {
      const m = String(e?.message || e)
      const text = m.includes("DUP_ID") ? "이미 사용 중인 아이디입니다."
        : m.includes("BAD_CODE") ? "협력사 코드가 올바르지 않습니다. 협력사 관리자에게 문의하세요."
        : m.includes("KNOX_BLOCKED") ? "Knox(삼성 임직원) 계정은 가입할 수 없습니다. 협력사 이메일로 가입하세요."
        : m.includes("BAD_EMAIL") ? "올바른 이메일을 입력하세요."
        : m.includes("INVALID_ID") ? "아이디는 소문자·숫자·_·. 3~30자여야 합니다."
        : m.includes("NO_NAME") ? "이름을 입력하세요."
        : m.includes("NO_ORG") ? "소속 협력사를 선택하세요."
        : m.includes("SHORT_PW") ? "비밀번호는 4자 이상이어야 합니다."
        : "가입 실패. 잠시 후 다시 시도하세요."
      setMsg({ ok: false, text })
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-accent/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SafeShare</h1>
          <p className="mt-1 text-sm text-muted-foreground">협력사 간 잉여 안전자재 무상 대여 플랫폼</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex justify-center">
              <Tabs tabs={[{ value: "login", label: "로그인" }, { value: "signup", label: "가입 신청" }]} value={tab} onChange={setTab} />
            </div>
            <div className="space-y-3">
              <Field label="아이디"><Input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="영문 소문자·숫자" /></Field>
              {tab === "signup" && (
                <>
                  <Field label="이름"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                  <Field label="이메일"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="협력사 이메일" /></Field>
                  <p className="-mt-1 text-xs text-muted-foreground">⚠ Knox(삼성 임직원) 계정(@samsung.com)은 가입할 수 없습니다.</p>
                  <Field label="소속 협력사">
                    <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                      <option value="">선택</option>
                      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="협력사 코드"><Input value={code} maxLength={4} onChange={(e) => setCode(e.target.value)} placeholder="협력사 4자리 코드" /></Field>
                </>
              )}
              <Field label="비밀번호"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && tab === "login" && signIn()} /></Field>
              {msg && <p className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</p>}
              <Button className="w-full" disabled={busy} onClick={tab === "login" ? signIn : signUp}>
                {busy ? "처리 중…" : tab === "login" ? "로그인" : "가입 신청"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
