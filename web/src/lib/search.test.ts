import { describe, it, expect } from "vitest"
import { sortMaterials, filterByDealType } from "./search"
import type { Material } from "@/types"

const m = (over: Partial<Material>): Material => ({
  id: "x", org_id: "o", owner_user_id: null, category: "c", name: "n", spec: null,
  unit: "EA", qty_total: 1, qty_available: 1, location: null, photos: [],
  inspection_status: "good", expires_at: null, deal_type: "loan", deadline: null,
  status: "active", created_at: "2026-01-01", ...over,
})

describe("filterByDealType", () => {
  const list = [m({ id: "g", deal_type: "give" }), m({ id: "l", deal_type: "loan" })]
  it("all: 전체 반환", () => { expect(filterByDealType(list, "all").map(x=>x.id)).toEqual(["g","l"]) })
  it("give: 나눔만", () => { expect(filterByDealType(list, "give").map(x=>x.id)).toEqual(["g"]) })
  it("loan: 대여만", () => { expect(filterByDealType(list, "loan").map(x=>x.id)).toEqual(["l"]) })
})

describe("sortMaterials deadline", () => {
  it("deadline: 임박(오름차순), null은 뒤로", () => {
    const out = sortMaterials([
      m({ id: "a", deadline: null }),
      m({ id: "b", deadline: "2026-07-10" }),
      m({ id: "c", deadline: "2026-07-01" }),
    ], "deadline")
    expect(out.map(x=>x.id)).toEqual(["c","b","a"])
  })
})

describe("sortMaterials", () => {
  it("recent: created_at 내림차순", () => {
    const out = sortMaterials([m({ id: "a", created_at: "2026-01-01" }), m({ id: "b", created_at: "2026-02-01" })], "recent")
    expect(out.map((x) => x.id)).toEqual(["b", "a"])
  })
  it("name: 가나다순", () => {
    const out = sortMaterials([m({ id: "a", name: "나사" }), m({ id: "b", name: "가위" })], "name")
    expect(out.map((x) => x.id)).toEqual(["b", "a"])
  })
  it("원본 배열 불변", () => {
    const input = [m({ id: "a", created_at: "2026-01-01" }), m({ id: "b", created_at: "2026-02-01" })]
    sortMaterials(input, "recent")
    expect(input.map((x) => x.id)).toEqual(["a", "b"])
  })
})
