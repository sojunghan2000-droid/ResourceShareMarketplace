import { useEffect, useState } from "react"
import { Bell, CheckCheck } from "lucide-react"
import { listNotifications, markAllRead, markRead, type Notification } from "@/lib/api"

/** 알림 type → 점프할 화면 키 */
function navForType(t: string): "myloans" | "lender" {
  if (["loan_requested", "return_requested", "loan_picked_up"].includes(t)) return "lender"
  return "myloans" // loan_approved | loan_rejected | return_confirmed 등
}

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return "방금"
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

export function NotificationBell({ onNavigate }: { onNavigate: (key: string) => void }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])

  async function load() { setItems(await listNotifications()) }
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  const unread = items.filter((n) => !n.read_at).length

  async function openItem(n: Notification) {
    if (!n.read_at) { await markRead(n.id); }
    setOpen(false)
    onNavigate(navForType(n.type))
    load()
  }
  async function readAll() { await markAllRead(); load() }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="알림"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ea580c] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">알림</span>
              {unread > 0 && (
                <button onClick={readAll} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <CheckCheck className="size-3.5" /> 모두 읽음
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-auto">
              {items.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">알림이 없습니다.</div>
              )}
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`flex w-full items-start gap-2 border-b px-4 py-2.5 text-left last:border-0 hover:bg-accent/50 ${n.read_at ? "" : "bg-primary/5"}`}
                >
                  {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#ea580c]" />}
                  <div className={n.read_at ? "ml-4" : ""}>
                    <p className="text-sm leading-snug text-foreground">{n.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{relTime(n.created_at)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
