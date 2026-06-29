import { supabase } from "./supabase"
import type { Category, Loan, Material, MaterialRequest, Profile, RequestProposal } from "@/types"

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("app_users")
    .select("*, organizations(name, type)")
    .eq("id", userId)
    .maybeSingle()
  return data as Profile | null
}

export async function listCategories(): Promise<Category[]> {
  const { data } = await supabase.from("categories").select("*").order("sort")
  return (data ?? []) as Category[]
}

export async function listMaterials(opts: {
  category?: string | null; keyword?: string; onlyAvailable?: boolean
}): Promise<Material[]> {
  let q = supabase.from("materials").select("*").eq("status", "active")
  if (opts.category) q = q.eq("category", opts.category)
  if (opts.onlyAvailable) q = q.gt("qty_available", 0)
  const { data } = await q.order("created_at", { ascending: false }).limit(500)
  let rows = (data ?? []) as Material[]
  if (opts.keyword) {
    const k = opts.keyword.toLowerCase()
    rows = rows.filter(
      (r) => (r.name ?? "").toLowerCase().includes(k)
        || (r.spec ?? "").toLowerCase().includes(k)
        || (r.location ?? "").toLowerCase().includes(k)
    )
  }
  return rows
}

export async function listMyLoans(userId: string): Promise<Loan[]> {
  const { data } = await supabase
    .from("loans")
    .select("*, materials(name, spec, unit)")
    .eq("borrower_user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(300)
  return (data ?? []) as Loan[]
}

export async function listIncomingLoans(orgId: string): Promise<Loan[]> {
  const { data } = await supabase
    .from("loans")
    .select("*, materials(name, spec, unit)")
    .eq("lender_org_id", orgId)
    .order("requested_at", { ascending: false })
    .limit(300)
  return (data ?? []) as Loan[]
}

/** 관리자 전용: 전체 조직의 대여 건(RLS가 admin에 전체 허용). */
export async function listAllLoans(): Promise<Loan[]> {
  const { data } = await supabase
    .from("loans")
    .select("*, materials(name, spec, unit)")
    .order("requested_at", { ascending: false })
    .limit(500)
  return (data ?? []) as Loan[]
}

// ---- 전원 공개(읽기전용) 피드 ----
export interface OrgStat {
  org_id: string; org_name: string
  materials_count: number; provided_count: number; used_count: number; overdue_count: number
  co2_avoided: number
}
export interface LoanFeedItem {
  material_name: string; qty: number; unit: string | null
  lender_org: string | null; borrower_org: string | null
  pickup_date: string | null; due_date: string | null; status: string; requested_at: string
}

/** 전원 공개: 협력사별 집계 현황(개인정보 없음). */
export async function publicOrgStats(): Promise<OrgStat[]> {
  const { data } = await supabase.rpc("public_org_stats")
  return (data ?? []) as OrgStat[]
}

/** 전원 공개: 전체 대여 피드(조직 단위, 개인명 제외). */
export async function publicLoanFeed(limit = 30): Promise<LoanFeedItem[]> {
  const { data } = await supabase.rpc("public_loan_feed", { p_limit: limit })
  return (data ?? []) as LoanFeedItem[]
}

// ---- RPC wrappers ----
async function rpc(name: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw new Error(error.message)
  return data
}

export const requestLoan = (materialId: string, qty: number, due: string | null, purpose: string, pickup: string | null) =>
  rpc("request_loan", { p_material_id: materialId, p_qty: qty, p_due: due, p_purpose: purpose, p_pickup: pickup })

export const approveLoan = (loanId: string) => rpc("approve_loan", { p_loan_id: loanId })
export const rejectLoan = (loanId: string, reason: string) => rpc("reject_loan", { p_loan_id: loanId, p_reason: reason })
export const pickupLoan = (loanId: string, photos: string[], signUrl: string) =>
  rpc("pickup_loan", { p_loan_id: loanId, p_photos: photos, p_sign_url: signUrl })
export const requestReturn = (loanId: string) => rpc("request_return", { p_loan_id: loanId })
export const completeGive = (loanId: string, photos: string[], signUrl: string) =>
  rpc("complete_give", { p_loan_id: loanId, p_photos: photos, p_sign_url: signUrl })
export const returnLoan = (loanId: string, returnQty: number, photos: string[], signUrl: string, condition: string, note: string) =>
  rpc("return_loan", { p_loan_id: loanId, p_return_qty: returnQty, p_photos: photos, p_sign_url: signUrl, p_condition: condition, p_note: note })
export const markOverdue = () => rpc("mark_overdue_loans", {})
export const markExpiredGives = () => rpc("mark_expired_gives", {})

export async function createMaterial(input: Record<string, unknown>) {
  const { error } = await supabase.from("materials").insert(input)
  if (error) throw new Error(error.message)
}

export async function updateMaterial(id: string, fields: Record<string, unknown>) {
  const { error } = await supabase.from("materials").update(fields).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function deleteMaterial(id: string) {
  const { error } = await supabase.from("materials").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

export async function uploadProof(bucket: string, path: string, file: Blob): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw new Error(error.message)
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7)
  return data?.signedUrl ?? ""
}

export async function listPendingUsers() {
  const { data } = await supabase.from("app_users").select("*, organizations(name)").eq("status", "pending")
  return data ?? []
}

export async function listOrgs() {
  const { data } = await supabase.from("organizations").select("*").order("name")
  return data ?? []
}

export async function approveUser(userId: string, orgId: string) {
  const { error } = await supabase.from("app_users").update({ status: "active", org_id: orgId }).eq("id", userId)
  if (error) throw new Error(error.message)
}

// ---- 인증(ID/PW) / 사용자 관리 ----
export async function listOrgsPublic(): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase.rpc("list_orgs_public")
  return (data ?? []) as { id: string; name: string }[]
}

export async function registerUser(id: string, pw: string, name: string, orgId: string, email: string) {
  const { error } = await supabase.rpc("register_user", {
    p_id: id.trim().toLowerCase(), p_pw: pw, p_name: name.trim(),
    p_org_id: orgId, p_email: email.trim(),
  })
  if (error) throw new Error(error.message)
}

export async function listOrgCodes(): Promise<Record<string, string>> {
  const { data } = await supabase.from("organization_codes").select("org_id, code")
  const map: Record<string, string> = {}
  for (const r of data ?? []) map[(r as any).org_id] = (r as any).code
  return map
}

export async function reissueOrgCode(orgId: string): Promise<string> {
  const { data, error } = await supabase.rpc("reissue_org_code", { p_org: orgId })
  if (error) throw new Error(error.message)
  return data as string
}

// ---- 협력사 관리 (관리자) ----
export async function addOrg(name: string): Promise<string> {
  const { data, error } = await supabase
    .from("organizations").insert({ name: name.trim(), type: "partner" }).select("id").single()
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}
export async function updateOrg(id: string, name: string) {
  const { error } = await supabase.from("organizations").update({ name: name.trim() }).eq("id", id)
  if (error) throw new Error(error.message)
}
export async function deleteOrg(id: string) {
  const { error } = await supabase.from("organizations").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

export async function updateMyProfile(name: string, phone: string) {
  const { error } = await supabase.rpc("update_my_profile", { p_name: name, p_phone: phone })
  if (error) throw new Error(error.message)
}

export async function changePassword(pw: string) {
  const { error } = await supabase.auth.updateUser({ password: pw })
  if (error) throw new Error(error.message)
}

export async function adminUpdateUser(userId: string, fields: Record<string, unknown>) {
  const { error } = await supabase.from("app_users").update(fields).eq("id", userId)
  if (error) throw new Error(error.message)
}

export async function listUsers() {
  const { data } = await supabase
    .from("app_users")
    .select("id, name, phone, role, status, org_id, organizations(name)")
    .order("status")
  return data ?? []
}

export async function adminSetPassword(userId: string, pw: string) {
  const { error } = await supabase.rpc("admin_set_password", { p_user: userId, p_pw: pw })
  if (error) throw new Error(error.message)
}

// ---- 임팩트(절감·탄소) ----
export interface ImpactSummary {
  reuse_count: number; saved_amount: number; co2_avoided: number
  q_reuse_count: number; q_saved_amount: number; q_co2_avoided: number
}
export async function getImpactSummary(): Promise<ImpactSummary> {
  const { data } = await supabase.rpc("impact_summary")
  const r = (Array.isArray(data) ? data[0] : data) as ImpactSummary | undefined
  return r ?? { reuse_count: 0, saved_amount: 0, co2_avoided: 0, q_reuse_count: 0, q_saved_amount: 0, q_co2_avoided: 0 }
}

// ---- 카테고리 단가·탄소 (관리자) ----
export interface CategoryPrice { code: string; major: string; unit_price: number; co2_per_unit: number }
export async function listCategoryPrice(): Promise<CategoryPrice[]> {
  const { data } = await supabase.rpc("list_category_price")
  return (data ?? []) as CategoryPrice[]
}
export async function setCategoryPrice(code: string, unitPrice: number, co2: number) {
  const { error } = await supabase.rpc("set_category_price", { p_code: code, p_unit_price: unitPrice, p_co2: co2 })
  if (error) throw new Error(error.message)
}

// ---- 앱 설정 ----
export async function getSignupRequiresApproval(): Promise<boolean> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "signup_requires_approval").maybeSingle()
  return (data?.value as boolean | undefined) ?? false
}
export async function setSignupRequiresApproval(v: boolean) {
  const { error } = await supabase.from("app_settings")
    .upsert({ key: "signup_requires_approval", value: v, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

// ---- 구해요(material_requests) ----
export async function listMaterialRequests(): Promise<MaterialRequest[]> {
  const { data } = await supabase.rpc("list_material_requests")
  return (data ?? []) as MaterialRequest[]
}
export async function createMaterialRequest(
  category: string, title: string, qty: number, neededBy: string | null, location: string, reason: string) {
  const { error } = await supabase.rpc("create_material_request", {
    p_category: category, p_title: title.trim(), p_qty: qty,
    p_needed_by: neededBy, p_location: location, p_reason: reason,
  })
  if (error) throw new Error(error.message)
}
export async function listProposalsForRequest(requestId: string): Promise<RequestProposal[]> {
  const { data } = await supabase.rpc("list_proposals_for_request", { p_request_id: requestId })
  return (data ?? []) as RequestProposal[]
}
export const proposeToRequest = (requestId: string, materialId: string, message: string) =>
  rpc("propose_to_request", { p_request_id: requestId, p_material_id: materialId, p_message: message })
export const acceptProposal = (proposalId: string) => rpc("accept_proposal", { p_proposal_id: proposalId })
export const closeMaterialRequest = (requestId: string) => rpc("close_material_request", { p_request_id: requestId })
export const withdrawProposal = (proposalId: string) => rpc("withdraw_proposal", { p_proposal_id: proposalId })

// ---- 알림 ----
export interface Notification {
  id: number
  type: string
  ref_loan_id: string | null
  message: string
  read_at: string | null
  created_at: string
}

export async function listNotifications(): Promise<Notification[]> {
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(15)
  return (data ?? []) as Notification[]
}

export async function markRead(id: number) {
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id)
}

export async function markAllRead() {
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null)
}
