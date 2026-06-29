import { Plus } from "lucide-react"
import type { Profile } from "@/types"
import { HelpButton } from "@/components/HelpButton"
import { NotificationBell } from "@/components/NotificationBell"
import { UserMenu } from "@/components/UserMenu"

export function Header({ profile, onNavigate }: { profile: Profile; onNavigate: (key: string) => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card px-5">
      {/* 좌측: 브랜드 */}
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-[#1e293b] text-base font-bold text-white">
          ⇄
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-tight text-foreground">주Go받Go</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">협력사 자재 나눔·대여 · 삼성물산</span>
        </div>
      </div>

      {/* 우측: 액션 */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => onNavigate("register")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#ea580c] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#c2410c]"
        >
          <Plus className="size-4" /> 자재 등록
        </button>
        <HelpButton role={profile.role} />
        <NotificationBell onNavigate={onNavigate} />
        <UserMenu profile={profile} />
      </div>
    </header>
  )
}
