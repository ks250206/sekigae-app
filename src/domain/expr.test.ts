import { describe, expect, it } from "vite-plus/test";
import { createMember, createRoom } from "./factory";
import { resolvePeople, resolveSeats } from "./expr";

const members = [
  createMember({ id: "a", name: "A", role: "d1", labId: "L1" }),
  createMember({ id: "b", name: "B", role: "m2", labId: "L2" }),
  createMember({ id: "c", name: "C", role: "m1", labId: "L1" }),
  createMember({ id: "d", name: "D", role: "wd2", labId: "L1" }),
];

describe("resolvePeople", () => {
  it("supports or / and / not", () => {
    // (D または M2) かつ L1 研
    const ids = resolvePeople(
      {
        op: "and",
        args: [
          {
            op: "or",
            args: [
              { op: "roleGroup", in: ["doctor"] },
              { op: "role", in: ["m2"] },
            ],
          },
          { op: "lab", in: ["L1"] },
        ],
      },
      members,
    );
    expect(ids).toEqual(["a"]);
    expect(resolvePeople({ op: "not", arg: { op: "role", in: ["m1"] } }, members)).toEqual([
      "a",
      "b",
      "d",
    ]);
    expect(resolvePeople({ op: "roleGroup", in: ["workingDoctor"] }, members)).toEqual(["d"]);
  });
});

describe("resolveSeats", () => {
  it("selects back seats by depth", () => {
    const room = createRoom({
      id: "r",
      name: "R",
      width: 1,
      height: 4,
      entrances: [{ id: "e", x: 0, y: 3, side: "s" }],
      seats: [
        { id: "s0", x: 0, y: 0, facing: "n", label: "0", tags: ["window"] },
        { id: "s1", x: 0, y: 1, facing: "n", label: "1", tags: [] },
      ],
    });
    expect(resolveSeats({ op: "depth", roomIds: [], from: "back", count: 1 }, [room])).toEqual([
      "s0",
    ]);
    expect(
      resolveSeats(
        {
          op: "or",
          args: [
            { op: "seatTag", in: ["window"] },
            { op: "seats", seatIds: ["s1"] },
          ],
        },
        [room],
      ).sort(),
    ).toEqual(["s0", "s1"]);
  });
});
