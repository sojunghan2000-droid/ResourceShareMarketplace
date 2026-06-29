import { Badge } from "@/components/ui/badge"
import { DEAL_KR, type DealType } from "@/types"

export function DealBadge({ type }: { type: DealType }) {
  return <Badge variant={type === "give" ? "give" : "loan"}>{DEAL_KR[type]}</Badge>
}
