import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { getProfile } from "@/lib/api"
import type { Profile } from "@/types"
import { Login } from "@/views/Login"
import { Catalog } from "@/views/Catalog"
import { RegisterMaterial } from "@/views/RegisterMaterial"
import { MyDeals } from "@/views/MyDeals"
import { Dashboard } from "@/views/Dashboard"
import { ShareView } from "@/views/ShareView"
import { AdminView } from "@/views/AdminView"
import { RequestBoard } from "@/views/RequestBoard"
import { Button } from "@/components/ui/button"
import { Header } from "@/components/Header"
import {
  ShieldCheck, LayoutGrid, PlusSquare, Inbox, BarChart3, Settings, Users, Megaphone,
} from "lucide-react"
import { cn } from "@/lib/utils"

type NavKey = "catalog" | "share" | "register" | "deals" | "dashboard" | "admin" | "requests"
// '자재 등록'은 헤더의 '+ 자재 등록' CTA 로 진입 → 사이드바 nav 에서는 제외(중복 제거)
const NAV: { key: NavKey; label: string; icon: React.ReactNode; admin?: boolean }[] = [
  { key: "dashboard", label: "대시보드", icon: <BarChart3 className="size-4" /> },
  { key: "catalog", label: "자재 목록", icon: <LayoutGrid className="size-4" /> },
  { key: "requests", label: "구해요", icon: <Megaphone className="size-4" /> },
  { key: "share", label: "공유 현황", icon: <Users className="size-4" /> },
  { key: "deals", label: "내 거래", icon: <Inbox className="size-4" /> },
  { key: "admin", label: "관리자", icon: <Settings className="size-4" />, admin: true },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [nav, setNav] = useState<NavKey>("dashboard")
  const [dealsTab, setDealsTab] = useState<"received" | "given">("received")

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); setLoading(false); return }
    setLoading(true)
    getProfile(session.user.id).then((p) => { setProfile(p); setLoading(false) })
  }, [session])

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">로딩 중…</div>
  if (!session) return <Login />

  if (!profile || profile.status !== "active") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
        <ShieldCheck className="size-10 text-primary" />
        <div>
          <p className="font-semibold">가입 승인 대기 중</p>
          <p className="text-sm text-muted-foreground">관리자 승인 후 이용할 수 있습니다.</p>
        </div>
        <Button variant="outline" onClick={() => supabase.auth.signOut()}>로그아웃</Button>
      </div>
    )
  }

  const items = NAV.filter((n) => !n.admin || profile.role === "admin")
  const View = () => {
    switch (nav) {
      case "catalog": return <Catalog profile={profile} />
      case "share": return <ShareView profile={profile} />
      case "register": return <RegisterMaterial profile={profile} />
      case "deals": return <MyDeals profile={profile} initialTab={dealsTab} />
      case "dashboard": return <Dashboard profile={profile} onNavigate={((k: string, t?: string) => { if (t) setDealsTab(t as "received"|"given"); setNav(k as NavKey) }) as (k: string) => void} />
      case "admin": return <AdminView profile={profile} />
      case "requests": return <RequestBoard profile={profile} />
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header profile={profile} onNavigate={(k) => setNav(k as NavKey)} />
      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r bg-card md:block">
          <nav className="space-y-1 p-3">
            {items.map((n) => (
              <button key={n.key} onClick={() => setNav(n.key)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  nav === n.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                {n.icon}{n.label}
              </button>
            ))}
          </nav>
        </aside>
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-5xl px-6 py-8">{View()}</div>
        </main>
      </div>
      {/* 모바일 하단 탭바 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card md:hidden">
        {items.map((n) => (
          <button key={n.key} onClick={() => setNav(n.key)}
            className={cn("flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium",
              nav === n.key ? "text-primary" : "text-muted-foreground")}>
            {n.icon}{n.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
