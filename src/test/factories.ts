/** テスト・ベンチ用のデータ生成。docs/DESIGN.md #32 */
import { createEmptyProject, createLab, createMember, createRoom } from "@/domain/factory";
import type { RoleKey } from "@/domain/roles";
import type { Facing, Member, Project, Room, Seat } from "@/domain/schema";
import { LAB_PALETTE, ROOM_PALETTE } from "@/graphics/palette";
import { createRng } from "@/lib/rng";
import { fakeName } from "./names";

export function makeSeat(id: string, x: number, y: number, facing: Facing = "n"): Seat {
  return { id, x, y, facing, label: id, tags: [] };
}

/** 島型の机を並べた部屋。cols×rows の島、各島 2×islandLen 席 */
export function makeIslandRoom(opts: {
  id: string;
  name: string;
  islands: number;
  islandLen?: number;
  position?: { x: number; y: number };
  color?: string;
}): Room {
  const len = opts.islandLen ?? 3;
  const width = opts.islands * 3 + 1;
  const height = len + 3;
  const seats: Seat[] = [];
  let n = 1;
  for (let i = 0; i < opts.islands; i++) {
    const x0 = 1 + i * 3;
    for (let j = 0; j < len; j++) {
      seats.push(makeSeat(`${opts.id}-s${n++}`, x0, 1 + j, "e"));
      seats.push(makeSeat(`${opts.id}-s${n++}`, x0 + 1, 1 + j, "w"));
    }
  }
  seats.forEach((s, i) => (s.label = `${opts.name.slice(0, 1)}-${String(i + 1).padStart(2, "0")}`));
  return createRoom({
    id: opts.id,
    name: opts.name,
    width,
    height,
    position: opts.position ?? { x: 0, y: 0 },
    color: opts.color,
    seats,
    entrances: [{ id: `${opts.id}-e`, x: 0, y: height - 1, side: "s" }],
  });
}

const ROLE_MIX: RoleKey[] = [
  "faculty",
  "d3",
  "d2",
  "d1",
  "wd2",
  "m2",
  "m2",
  "m1",
  "m1",
  "m1",
  "b4",
  "b4",
  "b4",
  "pd",
];

export function makeMembers(n: number, labIds: string[], seed = 1): Member[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, (_, i) =>
    createMember({
      id: `m${i + 1}`,
      name: fakeName(i),
      role: ROLE_MIX[i % ROLE_MIX.length]!,
      labId: labIds.length ? labIds[rng.int(labIds.length)] : undefined,
      gender: rng.next() < 0.5 ? "male" : "female",
    }),
  );
}

export type FixtureSize = "small" | "medium" | "large";

/** small: 1 部屋 10 名 / medium: 3 部屋 30 名 / large: 6 部屋 100 名 150 席 */
export function makeProject(size: FixtureSize = "medium", seed = 1): Project {
  const spec = {
    small: { rooms: 1, islands: 2, len: 3, members: 10, labs: 2 },
    medium: { rooms: 3, islands: 2, len: 3, members: 30, labs: 4 },
    large: { rooms: 6, islands: 4, len: 3, members: 100, labs: 6 },
  }[size];
  const p = createEmptyProject(`fixture-${size}`);
  p.labs = Array.from({ length: spec.labs }, (_, i) =>
    createLab({ id: `lab${i + 1}`, name: `Lab ${i + 1}`, color: LAB_PALETTE[i]! }),
  );
  let x = 0;
  for (let i = 0; i < spec.rooms; i++) {
    const room = makeIslandRoom({
      id: `r${i + 1}`,
      name: `Room ${i + 1}`,
      islands: spec.islands,
      islandLen: spec.len,
      position: { x, y: 0 },
      color: ROOM_PALETTE[i % ROOM_PALETTE.length],
    });
    x += room.width + 2;
    p.layout.rooms.push(room);
  }
  p.members = makeMembers(
    spec.members,
    p.labs.map((l) => l.id),
    seed,
  );
  return p;
}
