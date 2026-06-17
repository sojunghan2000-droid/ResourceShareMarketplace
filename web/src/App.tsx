import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { getProfile } from "@/lib/api"
import type { Profile } from "@/types"
import { Login } from "@/views/Login"
import { Catalog } from "@/views/Catalog"
import { RegisterMaterial } from "@/views/RegisterMaterial"
import { MyLoans } from "@/views/MyLoans"
import { LenderManage } from "@/views/LenderManage"
import { Dashboard } from "@/views/Dashboard"
import { AdminView } from "@/views/AdminView"
import { Button } from "@/components/ui/button"
import { Header } from "@/components/Header"
import {
  ShieldCheck, LayoutGrid, PlusSquare, Inbox, PackageCheck, BarChart3, Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"

type NavKey = "catalog" | "register" | "myloans" | "lender" | "dashboard" | "admin"
// '자재 등록'은 헤더의 '+ 자재 등록' CTA 로 진입 → 사이드바 nav 에서는 제외(중복 제거)
const NAV: { key: NavKey; label: string; icon: React.ReactNode; admin?: boolean }[] = [
  { key: "dashboard", label: "대시보드", icon: <BarChart3 className="size-4" /> },
  { key: "catalog", label: "자재 목록", icon: <LayoutGrid className="size-4" /> },
  { key: "myloans", label: "내 신청함", icon: <Inbox className="size-4" /> },
  { key: "lender", label: "내 자재 관리", icon: <PackageCheck className="size-4" /> },
  { key: "admin", label: "관리자", icon: <Settings className="size-4" />, admin: true },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [nav, setNav] = useState<NavKey>("dashboard")

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
      case "register": return <RegisterMaterial profile={profile} />
      case "myloans": return <MyLoans profile={profile} />
      case "lender": return <LenderManage profile={profile} />
      case "dashboard": return <Dashboard profile={profile} />
      case "admin": return <AdminView />
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header profile={profile} onNavigate={(k) => setNav(k as NavKey)} />
      <div className="flex flex-1">
        <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r bg-card">
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
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-5xl px-6 py-8">{View()}</div>
        </main>
      </div>
    </div>
  )
}
