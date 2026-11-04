import { beforeEach, describe, expect, it } from "vite-plus/test";
import { createLab } from "@/domain/factory";
import { history, useProjectStore } from "@/store/project";
import { previousPlan } from "@/store/selectors";
import { makeProject } from "@/test/factories";
import { applyImport } from "./applyImport";
import { decodeText, parseDelimited, parsePasted } from "./fileIO";
import {
  buildImportRows,
  detectHeaderRow,
  guessField,
  guessMapping,
  guessMappingFromData,
  newLabNames,
  normalizeTable,
} from "./importRows";
import { prevPlacementOf } from "./prevPlan";

const s = () => useProjectStore.getState();

describe("header detection & mapping", () => {
  it.each([
    ["氏名", "name"],
    ["名前", "name"],
    ["Name", "name"],
    ["氏名（漢字）", "name"],
    ["フリガナ", "kana"],
    ["ふりがな", "kana"],
    ["所属研究室", "lab"],
    ["Lab", "lab"],
    ["性別", "gender"],
    ["Gender", "gender"],
    ["学年", "role"],
    ["役職・学年", "role"],
    ["備考", "note"],
    ["タグ", "tags"],
    ["昨年度の部屋", "prevRoom"],
    ["昨年度 席", "prevSeat"],
    ["Previous seat", "prevSeat"],
    ["好きな食べ物", null],
  ])("%s → %s", (h, f) => {
    expect(guessField(h)).toBe(f);
  });
  it("detects header after title rows", () => {
    const rows = [
      ["2026年度 名簿"],
      [""],
      ["No", "氏名", "学年", "性別"],
      ["1", "山田", "M1", "男"],
    ];
    expect(detectHeaderRow(normalizeTable(rows))).toBe(1);
    expect(
      detectHeaderRow([
        ["山田", "M1"],
        ["佐藤", "D1"],
      ]),
    ).toBe(-1);
  });
  it("does not map the same field twice", () => {
    expect(guessMapping(["氏名", "名前", "役職"])).toEqual(["name", null, "role"]);
  });
  it("guesses mapping from data without header", () => {
    const rows = [
      ["山田 太郎", "やまだ たろう", "M1", "男"],
      ["佐藤 花子", "さとう はなこ", "D2", "女"],
      ["鈴木 一郎", "すずき いちろう", "社D1", "男性"],
    ];
    expect(guessMappingFromData(rows)).toEqual(["name", "kana", "role", "gender"]);
  });
});

describe("buildImportRows", () => {
  const p = makeProject("small");
  p.labs = [createLab({ id: "L1", name: "山田研究室", color: "#000" })];
  const ctx = { labs: p.labs, rooms: p.layout.rooms };
  const mapping = guessMapping([
    "氏名",
    "研究室",
    "学年",
    "性別",
    "タグ",
    "昨年度の部屋",
    "昨年度の席",
  ]);

  it("normalizes values and reports issues", () => {
    const rows = buildImportRows(
      [
        ["山田　太郎", "山田研", "ｍ１", "男", "留学生, 窓側", "Room 1", "R-01"],
        ["", "山田研", "M2", "女", "", "", ""],
        ["佐藤", "新研究室", "宇宙飛行士", "ねこ", "", "Room 1", "R-01"],
        ["鈴木", "", "社会人D1", "", "", "Room 1", "Z-99"],
        ["山田 太郎", "", "B4", "", "", "Nowhere", ""],
        ["", "", "", "", "", "", ""],
      ],
      mapping,
      ctx,
      2,
    );
    expect(rows).toHaveLength(5);
    const [a, b, c, d, e] = rows;
    expect(a).toMatchObject({
      line: 2,
      name: "山田 太郎",
      labId: "L1",
      role: "m1",
      gender: "male",
      tags: ["留学生", "窓側"],
    });
    expect(a!.prev).toEqual({ roomKey: "r1", seatId: "r1-s1" });
    expect(a!.errors).toEqual([]);
    expect(b!.errors.map((x) => x.code)).toEqual(["nameMissing"]);
    expect(c!.warnings.map((x) => x.code).sort()).toEqual([
      "genderUnknown",
      "labNew",
      "roleUnknown",
    ]);
    expect(c!.role).toBe("other");
    expect(c!.errors.map((x) => x.code)).toEqual(["prevSeatDuplicate"]);
    expect(d).toMatchObject({ role: "wd1", prev: { roomKey: "r1" } });
    expect(d!.warnings.map((x) => x.code)).toEqual(["prevSeatRoomOnly"]);
    expect(e!.warnings.map((x) => x.code).sort()).toEqual(["duplicateName", "prevRoomUnknown"]);
    expect(newLabNames(rows)).toEqual([]); // the row with the new lab has an error
  });

  it("matches a seat label without room when unique", () => {
    const rows = buildImportRows([["A", "", "", "", "", "", "r-02"]], mapping, ctx);
    expect(rows[0]!.prev).toEqual({ roomKey: "r1", seatId: "r1-s2" });
  });
});

describe("applyImport", () => {
  beforeEach(() => {
    const p = makeProject("small");
    p.labs = [createLab({ id: "L1", name: "山田研究室", color: "#e11d48" })];
    p.members = p.members
      .slice(0, 3)
      .map((m, i) => ({ ...m, name: ["山田 太郎", "佐藤 花子", "鈴木 一郎"][i]!, labId: "L1" }));
    s().replaceProject(p);
    history.clear();
  });
  const mapping = guessMapping(["氏名", "研究室", "役職", "昨年度の席"]);
  const data = [
    ["山田太郎", "", "D1", "R-03"],
    ["高橋 次郎", "新研", "B4", "R-04"],
    ["中村 三郎", "新研究室", "M1", ""],
  ];

  it("adds members, creates labs and previous seats in one undo", () => {
    const before = s().project;
    const rows = buildImportRows(data, mapping, { labs: before.labs, rooms: before.layout.rooms });
    const res = applyImport(rows, "add", { previousPlanName: "前年" });
    expect(res).toMatchObject({ added: 3, updated: 0, labsCreated: 1, prevSet: 2 });
    const p = s().project;
    expect(p.members).toHaveLength(6);
    expect(p.labs).toHaveLength(2);
    expect(p.labs[1]!.color).not.toBe("#e11d48");
    const takahashi = p.members.find((m) => m.name === "高橋 次郎")!;
    const nakamura = p.members.find((m) => m.name === "中村 三郎")!;
    expect(takahashi.labId).toBe(nakamura.labId);
    expect(previousPlan(p)!.name).toBe("前年");
    expect(prevPlacementOf(p, takahashi.id)).toMatchObject({ kind: "seat", seat: { id: "r1-s4" } });
    history.undo();
    expect(s().project).toBe(before);
  });

  it("updates by name without clearing unfilled fields", () => {
    const before = s().project;
    const rows = buildImportRows(data, mapping, { labs: before.labs, rooms: before.layout.rooms });
    const res = applyImport(rows, "update");
    expect(res).toMatchObject({ added: 2, updated: 1 });
    const yamada = s().project.members.find((m) => m.name === "山田 太郎")!;
    expect(yamada.role).toBe("d1");
    expect(yamada.labId).toBe("L1"); // empty lab cell → unchanged
    expect(s().project.members).toHaveLength(5);
  });

  it("replaces all members", () => {
    const before = s().project;
    const rows = buildImportRows(data, mapping, { labs: before.labs, rooms: before.layout.rooms });
    const res = applyImport(rows, "replace");
    expect(res).toMatchObject({ added: 3, removed: 3 });
    expect(s().project.members.map((m) => m.name)).toEqual(["山田太郎", "高橋 次郎", "中村 三郎"]);
  });
});

describe("file IO", () => {
  it("decodes UTF-8 and Shift_JIS", () => {
    const utf8 = new TextEncoder().encode("氏名,学年\n山田,M1");
    expect(decodeText(utf8)).toMatchObject({ encoding: "utf-8", text: "氏名,学年\n山田,M1" });
    // "山田" in Shift_JIS
    const sjis = new Uint8Array([0x8e, 0x52, 0x93, 0x63]);
    expect(decodeText(sjis)).toEqual({ encoding: "shift_jis", text: "山田" });
  });
  it("parses CSV with quotes and pasted TSV", async () => {
    expect(await parseDelimited('氏名,メモ\n"山田, 太郎","a\nb"\n')).toEqual([
      ["氏名", "メモ"],
      ["山田, 太郎", "a\nb"],
    ]);
    expect(await parsePasted("山田\tM1\r\n佐藤\tD1\r\n")).toEqual([
      ["山田", "M1"],
      ["佐藤", "D1"],
    ]);
  });
});
