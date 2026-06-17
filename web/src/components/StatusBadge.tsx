import { Badge } from "@/components/ui/badge"
import { STATUS_KR, type LoanStatus } from "@/types"

const VARIANT: Record<LoanStatus, "default" | "secondary" | "success" | "warning" | "destructive" | "muted"> = {
  REQUESTED: "warning",
  APPROVED: "default",
  ON_LOAN: "secondary",
  RETURN_PENDING: "warning",
  RETURNED: "success",
  REJECTED: "muted",
  OVERDUE: "destructive",
}

export function StatusBadge({ status }: { status: LoanStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_KR[status]}</Badge>
}
