import { describe, expect, it } from "vite-plus/test";
import { ROLE_COLORS } from "@/graphics/palette";
import { makeExportFixture } from "./fixture";
import {
  abbreviateName,
  buildExportModel,
  cellRuns,
  defaultFilename,
  EXPORT_COLUMNS,
  rosterValue,
  wallSegments,
  type ExportModel,
  type ExportRoom,
} from "./model";

const DATE = new Date(2026, 3, 1, 9, 0, 0);

function gridArt(room: ExportRoom): string[] {
  const rows: string[] = [];
  for (let y = 0; y < room.height; y++) {
    let line = "";
    for (let x = 0; x < room.width; x++) {
      const c = room.cells[y * room.width + x]!;
      const seat = c.seatId ? room.seats.find((s) => s.id === c.seatId) : undefined;
      line += seat
        ? seat.member
          ? "S"
          : "s"
        : c.kind === "void"
          ? " "
          : c.kind === "obstacle"
            ? "#"
            : c.entranceSides.length
              ? "E"
              : ".";
    }
    rows.push(line);
  }
  return rows;
}

function summarize(m: ExportModel) {
  return {
    projectName: m.projectName,
    planName: m.planName,
    dateISO: m.dateISO,
    dateLabel: m.dateLabel,
    floor: m.floor,
    totals: m.totals,
    legend: m.legend,
    rosterColumns: m.rosterColumns.map((c) => c.header),
    roster: m.roster.map((p) => m.rosterColumns.map((c) => rosterValue(p, c.key)).join(" | ")),
    unassigned: m.unassigned.map((p) => p.name),
    rooms: m.rooms.map((r) => ({
      name: r.name,
      floor: [r.floorX, r.floorY, r.width, r.height],
      summary: r.summary,
      breakdown: r.roleBreakdown.map((b) => `${b.label}:${b.count}`).join(" "),
      grid: gridArt(r),
      seats: r.seats.map((s) =>
        s.member ? `${s.label} ${s.member.name} / ${s.member.subtitle} ${s.fill}` : `${s.label} -`,
      ),
    })),
  };
}

describe("buildExportModel", () => {
  it("matches the snapshot (ja, role colors, all columns)", () => {
    const m = buildExportModel(makeExportFixture(), {
      lang: "ja",
      columns: EXPORT_COLUMNS,
      colorBy: "role",
      date: DATE,
    });
    expect(summarize(m)).toMatchSnapshot();
  });

  it("matches the snapshot (en, lab colors, minimal columns, subset of rooms)", () => {
    const p = makeExportFixture();
    const m = buildExportModel(p, {
      lang: "en",
      columns: ["role"],
      colorBy: "lab",
      roomIds: [p.layout.rooms[2]!.id, p.layout.rooms[1]!.id],
      date: DATE,
    });
    expect(summarize(m)).toMatchSnapshot();
  });

  it("uses the final plan by default and resolves output-language strings", () => {
    const p = makeExportFixture();
    const m = buildExportModel(p, {
      lang: "en",
      columns: EXPORT_COLUMNS,
      colorBy: "role",
      date: DATE,
    });
    expect(m.planId).toBe("plan-a");
    expect(m.rosterColumns.map((c) => c.header)).toEqual([
      "Name",
      "Kana",
      "Lab",
      "Gender",
      "Role",
      "Room",
      "Seat",
      "Previous room",
      "Previous seat",
      "Change",
      "Note",
    ]);
    const ja = buildExportModel(p, { lang: "ja", columns: EXPORT_COLUMNS, colorBy: "role" });
    expect(ja.rosterColumns.map((c) => c.header)).toEqual([
      "氏名",
      "ふりがな",
      "研究室",
      "性別",
      "役職・学年",
      "部屋",
      "席",
      "昨年度の部屋",
      "昨年度の席",
      "変化",
      "メモ",
    ]);
  });

  it("colors seats by the chosen mode with light-scheme hex and readable text", () => {
    const p = makeExportFixture();
    const m = buildExportModel(p, { lang: "ja", columns: [], colorBy: "role" });
    const seat = m.rooms[0]!.seats[0]!;
    expect(seat.fill).toBe(ROLE_COLORS[seat.member!.roleKey].light);
    expect(seat.text).toMatch(/^#[0-9a-f]{6}$/);
    const none = buildExportModel(p, { lang: "ja", columns: [], colorBy: "none" });
    expect(none.legend).toEqual([]);
    expect(none.rooms[0]!.seats[0]!.member!.subtitle).toBe("");
  });

  it("computes change against the previous plan", () => {
    const m = buildExportModel(makeExportFixture(), {
      lang: "ja",
      columns: ["previous"],
      colorBy: "none",
    });
    const kinds = new Set(m.roster.map((p) => p.change));
    expect(kinds).toEqual(new Set(["same", "moved", "sameRoom", "new", undefined]));
  });

  it("builds merged wall segments and cell runs", () => {
    const m = buildExportModel(makeExportFixture(), { lang: "ja", columns: [], colorBy: "none" });
    const r1 = m.rooms[0]!;
    // 矩形の部屋は 4 本の壁
    expect(wallSegments(r1)).toHaveLength(4);
    expect(cellRuns(r1, (c) => c.kind === "obstacle")).toEqual([{ x: 6, y: 0, w: 1, h: 1 }]);
    // L 字は 6 本
    expect(wallSegments(m.rooms[2]!)).toHaveLength(6);
  });

  it("builds filenames and abbreviations", () => {
    expect(defaultFilename("A/B", "ja", DATE)).toBe("A_B_座席表_2026-04-01");
    expect(defaultFilename("Lab", "en", DATE)).toBe("Lab_seating_2026-04-01");
    expect(abbreviateName("山田 太郎", "ja")).toBe("山田");
    expect(abbreviateName("John Smith", "en")).toBe("J. Smith");
  });
});
