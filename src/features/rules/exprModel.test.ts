import { describe, expect, it } from "vite-plus/test";
import { exprDepth, type PersonExpr, type SeatExpr } from "@/domain/rules";
import { fromExpr, sameExpr, toExpr } from "./exprModel";

describe("condition builder model", () => {
  const cases: PersonExpr[] = [
    { op: "all" },
    { op: "role", in: ["m1"] },
    { op: "not", arg: { op: "role", in: ["m1"] } },
    {
      op: "and",
      args: [
        {
          op: "or",
          args: [
            { op: "role", in: ["d1"] },
            { op: "role", in: ["m2"] },
          ],
        },
        { op: "lab", in: ["lab1"] },
      ],
    },
    {
      op: "or",
      args: [
        { op: "lab", in: ["a"] },
        { op: "not", arg: { op: "gender", in: ["male"] } },
      ],
    },
  ];

  it.each(cases)("round-trips %j", (e) => {
    const m = fromExpr(e);
    expect(m).not.toBeNull();
    expect(sameExpr(toExpr(m!), e)).toBe(true);
  });

  it("rejects expressions deeper than the builder supports", () => {
    const deep: PersonExpr = {
      op: "and",
      args: [{ op: "not", arg: { op: "or", args: [{ op: "role", in: ["m1"] }] } }],
    };
    expect(fromExpr(deep)).toBeNull();
  });

  it("produces expressions within the depth limit", () => {
    const m = fromExpr<SeatExpr>({ op: "rooms", roomIds: ["r1"] })!;
    m.items.push({
      id: "x",
      kind: "group",
      op: "or",
      leaves: [
        { op: "seatTag", in: ["窓側"] },
        { op: "rooms", roomIds: ["r2"] },
      ],
    });
    m.items.push({ id: "y", kind: "leaf", not: true, leaf: { op: "seats", seatIds: ["s1"] } });
    const e = toExpr(m);
    expect(e.op).toBe("and");
    expect(exprDepth(e)).toBe(2);
    expect(toExpr({ op: "and", items: [] })).toEqual({ op: "all" });
  });
});
