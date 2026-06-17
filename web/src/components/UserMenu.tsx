import { useState } from "react"
import { ChevronDown, LogOut } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { Profile } from "@/types"

export function UserMenu({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false)
  const initial = (profile.name || "U").trim().charAt(0)

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-accent">
        <span className="flex size-8 items-center justify-center rounded-full bg-[#1e293b] text-sm font-bold text-white">
          {initial}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold text-foreground">{profile.name}</span>
          <span className="block text-xs text-muted-foreground">{profile.organizations?.name}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border bg-card shadow-lg">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">{profile.name}</p>
              <p className="text-xs text-muted-foreground">{profile.organizations?.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{profile.role === "admin" ? "관리자" : "멤버"}</p>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-accent"
            >
              <LogOut className="size-4" /> 로그아웃
            </button>
          </div>
        </>
      )}
    </div>
  )
}
