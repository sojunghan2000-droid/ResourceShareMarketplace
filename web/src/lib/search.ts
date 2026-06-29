import type { Material } from "@/types"

export type SortKey = "recent" | "name" | "deadline"
export type DealFilter = "all" | "give" | "loan"

/** 자재 목록 정렬. 원본 불변(새 배열 반환). */
export function sortMaterials(mats: Material[], sort: SortKey): Material[] {
  const arr = [...mats]
  if (sort === "name") return arr.sort((a, b) => a.name.localeCompare(b.name, "ko"))
  if (sort === "deadline") return arr.sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0
    if (!a.deadline) return 1
    if (!b.deadline) return -1
    return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0
  })
  return arr.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}

/** 거래유형 필터. 원본 불변. */
export function filterByDealType(mats: Material[], f: DealFilter): Material[] {
  if (f === "all") return mats
  return mats.filter((m) => m.deal_type === f)
}
