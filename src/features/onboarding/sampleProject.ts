/**
 * サンプルプロジェクト（複合研究室: 3 部屋・27 名・4 研究室混在・社会人ドクター 2 名）。#138
 * 名前はすべて架空。
 */
import {
  createEmptyProject,
  createLab,
  createMember,
  createRoom,
  createRule,
  createSeatPlan,
} from "@/domain/factory";
import type { RoleKey } from "@/domain/roles";
import type { Gender } from "@/domain/genders";
import type { Facing, Project, Room, Seat } from "@/domain/schema";
import { LAB_PALETTE, ROOM_PALETTE } from "@/graphics/palette";

type Lang = "ja" | "en";

const T = {
  ja: {
    project: "サンプル: 複合研究室 2026年度",
    labs: [
      ["青木研究室", "青木"],
      ["北村研究室", "北村"],
      ["森田研究室", "森田"],
      ["和田研究室", "和田"],
    ],
    rooms: ["教員室", "大部屋", "小部屋"],
    window: "窓側",
    plan: "案A",
    prev: "2025年度",
  },
  en: {
    project: "Sample: Shared labs 2026",
    labs: [
      ["Aoki Lab", "Aoki"],
      ["Kitamura Lab", "Kitamura"],
      ["Morita Lab", "Morita"],
      ["Wada Lab", "Wada"],
    ],
    rooms: ["Faculty room", "Main room", "Small room"],
    window: "Window",
    plan: "Plan A",
    prev: "2025",
  },
} as const;

// [ja 名, en 名, 役職, 研究室 index, 性別]
const PEOPLE: [string, string, RoleKey, number, Gender][] = [
  ["青木 誠", "Makoto Aoki", "faculty", 0, "male"],
  ["北村 恵", "Megumi Kitamura", "faculty", 1, "female"],
  ["森田 健", "Ken Morita", "faculty", 2, "male"],
  ["和田 彩", "Aya Wada", "faculty", 3, "female"],
  ["石川 修", "Osamu Ishikawa", "technician", 1, "male"],
  ["上田 遥", "Haruka Ueda", "pd", 0, "female"],
  ["江口 蒼", "Ao Eguchi", "d3", 2, "male"],
  ["大森 楓", "Kaede Omori", "d2", 0, "female"],
  ["加藤 陸", "Riku Kato", "d1", 1, "male"],
  ["久保 凛", "Rin Kubo", "d1", 3, "female"],
  ["小池 隆", "Takashi Koike", "wd2", 2, "male"],
  ["斎藤 直子", "Naoko Saito", "wd1", 3, "female"],
  ["柴田 湊", "Minato Shibata", "m2", 0, "male"],
  ["杉本 結衣", "Yui Sugimoto", "m2", 1, "female"],
  ["高橋 樹", "Itsuki Takahashi", "m2", 2, "male"],
  ["田村 葵", "Aoi Tamura", "m2", 3, "female"],
  ["千葉 颯太", "Sota Chiba", "m1", 0, "male"],
  ["土屋 美咲", "Misaki Tsuchiya", "m1", 1, "female"],
  ["中川 悠真", "Yuma Nakagawa", "m1", 2, "male"],
  ["西田 ひなた", "Hinata Nishida", "m1", 3, "female"],
  ["野口 蓮", "Ren Noguchi", "m1", 1, "male"],
  ["橋本 さくら", "Sakura Hashimoto", "b4", 0, "female"],
  ["平野 大翔", "Hiroto Hirano", "b4", 1, "male"],
  ["福田 芽依", "Mei Fukuda", "b4", 2, "female"],
  ["星野 朝陽", "Asahi Hoshino", "b4", 3, "male"],
  ["松井 奏", "Kanade Matsui", "b4", 0, "unspecified"],
  ["宮本 陽菜", "Hina Miyamoto", "b4", 2, "female"],
];

const seat = (
  id: string,
  x: number,
  y: number,
  facing: Facing,
  label: string,
  tags: string[] = [],
): Seat => ({
  id,
  x,
  y,
  facing,
  label,
  tags,
});

function facultyRoom(name: string): Room {
  return createRoom({
    id: "sample-room-faculty",
    name,
    color: ROOM_PALETTE[5],
    position: { x: 0, y: 0 },
    width: 6,
    height: 5,
    seats: [
      seat("sf-1", 1, 1, "s", "F-01"),
      seat("sf-2", 4, 1, "s", "F-02"),
      seat("sf-3", 1, 3, "n", "F-03"),
      seat("sf-4", 4, 3, "n", "F-04"),
    ],
    entrances: [{ id: "sf-e", x: 5, y: 2, side: "e" }],
  });
}

function mainRoom(name: string, windowTag: string): Room {
  const seats: Seat[] = [];
  let n = 1;
  for (let island = 0; island < 3; island++) {
    const x0 = 1 + island * 3;
    for (let j = 0; j < 3; j++) {
      const tags = island === 0 ? [windowTag] : [];
      seats.push(seat(`sm-${n}`, x0, 1 + j, "e", `M-${String(n).padStart(2, "0")}`, tags));
      n++;
      seats.push(seat(`sm-${n}`, x0 + 1, 1 + j, "w", `M-${String(n).padStart(2, "0")}`, tags));
      n++;
    }
  }
  return createRoom({
    id: "sample-room-main",
    name,
    color: ROOM_PALETTE[0],
    position: { x: 8, y: 0 },
    width: 10,
    height: 6,
    seats,
    entrances: [{ id: "sm-e", x: 9, y: 5, side: "s" }],
  });
}

function smallRoom(name: string): Room {
  const room = createRoom({
    id: "sample-room-small",
    name,
    color: ROOM_PALETTE[2],
    position: { x: 0, y: 7 },
    width: 7,
    height: 6,
  });
  // L 字: 右上 3×3 を部屋外に
  for (let y = 0; y < 3; y++) for (let x = 4; x < 7; x++) room.cells[y * 7 + x] = "void";
  room.cells[2 * 7 + 0] = "obstacle"; // 柱
  room.seats = [
    seat("ss-1", 1, 0, "s", "S-01"),
    seat("ss-2", 2, 0, "s", "S-02"),
    seat("ss-3", 1, 4, "n", "S-03"),
    seat("ss-4", 2, 4, "n", "S-04"),
    seat("ss-5", 4, 4, "n", "S-05"),
    seat("ss-6", 5, 4, "n", "S-06"),
    seat("ss-7", 0, 5, "e", "S-07"),
    seat("ss-8", 6, 5, "w", "S-08"),
  ];
  room.entrances = [{ id: "ss-e", x: 6, y: 3, side: "e" }];
  return room;
}

export function createSampleProject(lang: Lang = "ja"): Project {
  const t = T[lang];
  const p = createEmptyProject(t.project, t.plan);
  p.labs = t.labs.map(([name, shortName], i) =>
    createLab({ id: `sample-lab-${i + 1}`, name, shortName, color: LAB_PALETTE[i]! }),
  );
  p.members = PEOPLE.map(([ja, en, role, lab, gender], i) =>
    createMember({
      id: `sample-m${i + 1}`,
      name: lang === "ja" ? ja : en,
      kana: undefined,
      role,
      labId: p.labs[lab]!.id,
      gender,
    }),
  );
  const [faculty, main, small] = [
    facultyRoom(t.rooms[0]),
    mainRoom(t.rooms[1], t.window),
    smallRoom(t.rooms[2]),
  ];
  p.layout.rooms = [faculty, main, small];

  // 昨年度: B4（新メンバー）以外は昨年度の席あり。一部は部屋のみ判明
  const prev = createSeatPlan(t.prev, "previous");
  const m = (i: number) => `sample-m${i}`;
  Object.assign(prev.assignment, {
    "sf-1": m(1),
    "sf-2": m(2),
    "sf-3": m(3),
    "sf-4": m(4),
    "sm-1": m(7), // D3
    "sm-2": m(8),
    "sm-5": m(13),
    "sm-6": m(14),
    "sm-9": m(11), // 社D2: 固定したい席
    "sm-12": m(15),
    "sm-14": m(5),
    "ss-1": m(6),
    "ss-3": m(9),
    "ss-4": m(10),
    "ss-5": m(16),
    "ss-8": m(12), // 社D1
    "ss-6": m(17),
  });
  prev.roomOnly = { [m(18)]: main.key, [m(19)]: small.key };
  p.plans.push(prev);
  p.previousPlanId = prev.id;

  const students = {
    op: "roleGroup" as const,
    in: ["doctor", "workingDoctor", "master", "bachelor"] as const,
  };
  p.rules = [
    createRule(
      { type: "room.only", rooms: [faculty.id], people: { op: "role", in: ["faculty"] } },
      { strength: "hard", origin: "template" },
    ),
    createRule(
      { type: "prev.same", people: { op: "roleGroup", in: ["workingDoctor"] }, scope: "seat" },
      { strength: "hard", origin: "template" },
    ),
    createRule(
      { type: "room.diversity", rooms: [main.id, small.id], attr: "lab", min: 3 },
      { strength: "soft", weight: 4, origin: "template" },
    ),
    createRule(
      {
        type: "group.buddy",
        a: { op: "role", in: ["m1", "b4"] },
        b: {
          op: "or",
          args: [
            { op: "roleGroup", in: ["doctor", "workingDoctor"] },
            { op: "role", in: ["faculty"] },
          ],
        },
        scope: "sameRoom",
        min: 1,
      },
      { strength: "soft", weight: 3, origin: "template" },
    ),
    createRule(
      {
        type: "prev.different",
        people: {
          op: "and",
          args: [
            { op: "roleGroup", in: [...students.in] },
            { op: "not", arg: { op: "roleGroup", in: ["workingDoctor"] } },
          ],
        },
        scope: "room",
      },
      { strength: "soft", weight: 2, origin: "template" },
    ),
    createRule(
      {
        type: "seat.only",
        seats: { op: "seatTag", in: [t.window] },
        people: {
          op: "or",
          args: [
            { op: "roleGroup", in: ["doctor"] },
            { op: "role", in: ["m2"] },
          ],
        },
      },
      { strength: "soft", weight: 2 },
    ),
  ];
  return p;
}
