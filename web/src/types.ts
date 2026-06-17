export type LoanStatus =
  | "REQUESTED" | "APPROVED" | "ON_LOAN"
  | "RETURN_PENDING" | "RETURNED" | "REJECTED" | "OVERDUE"

export type InspectionStatus = "good" | "need_check" | "no_use" | "damaged"

export interface Profile {
  id: string
  org_id: string
  name: string
  phone?: string | null
  contact_email?: string | null
  role: "member" | "admin"
  is_sysadmin?: boolean
  status: "pending" | "active" | "disabled"
  organizations?: { name: string; type: string }
}

export interface Category { code: string; major: string; examples: string; sort: number }

export interface Material {
  id: string
  org_id: string
  owner_user_id: string | null
  category: string
  name: string
  spec: string | null
  unit: string
  qty_total: number
  qty_available: number
  location: string | null
  photos: string[]
  inspection_status: InspectionStatus
  expires_at: string | null
  status: string
  created_at: string
}

export interface Loan {
  id: string
  material_id: string
  lender_org_id: string
  borrower_org_id: string
  borrower_user_id: string
  qty: number
  purpose: string | null
  pickup_date: string | null
  due_date: string
  status: LoanStatus
  reject_reason: string | null
  return_qty: number | null
  unreturned_qty: number
  requested_at: string
  materials?: { name: string; spec: string | null; unit: string }
}

export const STATUS_KR: Record<LoanStatus, string> = {
  REQUESTED: "신청대기", APPROVED: "대여승인", ON_LOAN: "대여중",
  RETURN_PENDING: "반납확인대기", RETURNED: "반납완료", REJECTED: "거절됨", OVERDUE: "연체",
}

export const INSPECTION_KR: Record<InspectionStatus, string> = {
  good: "양호", need_check: "점검필요", no_use: "사용금지", damaged: "파손",
}
