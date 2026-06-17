import { useState } from "react"
import { ChevronDown, LogOut, UserCog } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { updateMyProfile, changePassword } from "@/lib/api"
import type { Profile } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function UserMenu({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(false)
  const [name, setName] = useState(profile.name)
  const [phone, setPhone] = useState((profile as any).phone ?? "")
  const [pw, setPw] = useState("")
  const [msg, setMsg] = useState("")
  const initial = (profile.name || "U").trim().charAt(0)

  async function saveProfile() {
    try { await updateMyProfile(name, phone); setMsg("프로필 저장됨") } catch (e: any) { setMsg(e.message) }
  }
  async function savePw() {
    if (pw.length < 4) { setMsg("비밀번호 4자 이상"); return }
    try { await changePassword(pw); setPw(""); setMsg("비밀번호 변경됨") } catch (e: any) { setMsg(e.message) }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-accent">
        <span className="flex size-8 items-center justify-center rounded-full bg-[#1e293b] text-sm font-bold text-white">{initial}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold text-foreground">{profile.name}</span>
          <span className="block text-xs text-muted-foreground">{profile.organizations?.name}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => { setOpen(false); setEdit(false) }} />
          <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border bg-card shadow-lg">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">{profile.name}</p>
              <p className="text-xs text-muted-foreground">{profile.organizations?.name} · {profile.role === "admin" ? "관리자" : "멤버"}</p>
            </div>

            {!edit ? (
              <button onClick={() => { setEdit(true); setMsg("") }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-accent">
                <UserCog className="size-4" /> 내 프로필 수정
              </button>
            ) : (
              <div className="space-y-2 border-b px-4 py-3">
                <Input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
                <Input placeholder="연락처" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Button size="sm" className="w-full" onClick={saveProfile}>프로필 저장</Button>
                <Input type="password" placeholder="새 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} />
                <Button size="sm" variant="outline" className="w-full" onClick={savePw}>비밀번호 변경</Button>
                {msg && <p className="text-xs text-success">{msg}</p>}
              </div>
            )}

            <button onClick={() => supabase.auth.signOut()} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-accent">
              <LogOut className="size-4" /> 로그아웃
            </button>
          </div>
        </>
      )}
    </div>
  )
}
