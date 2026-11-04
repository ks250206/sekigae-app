import { describe, expect, it } from "vite-plus/test";
import type { Lab } from "@/domain/schema";
import {
  compactKey,
  labKey,
  matchLab,
  nameKey,
  normalizeGender,
  normalizeName,
  normalizeRole,
  normalizeWidth,
  parseTags,
  searchKey,
  seatLabelKey,
} from "./normalize";

describe("normalizeRole", () => {
  const cases: [string, string][] = [
    // 修士
    ["M1", "m1"],
    ["m1", "m1"],
    ["ｍ１", "m1"],
    ["Ｍ１", "m1"],
    ["M 1", "m1"],
    ["修士1年", "m1"],
    ["修士１年", "m1"],
    ["修士一年", "m1"],
    ["修士1年生", "m1"],
    ["修士課程1年", "m1"],
    ["博士前期1年", "m1"],
    ["博士前期課程1年", "m1"],
    ["Master 1", "m1"],
    ["master1", "m1"],
    ["Master's 1st year", "m1"],
    ["M2", "m2"],
    ["修士2年", "m2"],
    ["博士前期2年", "m2"],
    ["修士1回生", "m1"],
    // 博士
    ["D1", "d1"],
    ["ｄ２", "d2"],
    ["D3", "d3"],
    ["博士1年", "d1"],
    ["博士後期1年", "d1"],
    ["博士後期課程2年", "d2"],
    ["博士課程3年", "d3"],
    ["PhD 2", "d2"],
    ["Ph.D. 3", "d3"],
    ["Doctor 1", "d1"],
    ["博士3年 (D3)", "d3"],
    // 社会人ドクター（d* にならないこと）
    ["社会人D1", "wd1"],
    ["社D1", "wd1"],
    ["社Ｄ２", "wd2"],
    ["社会人博士1年", "wd1"],
    ["社会人ドクター1年", "wd1"],
    ["社会人ドクター3年", "wd3"],
    ["社会人博士課程2年", "wd2"],
    ["社会人博士後期3年", "wd3"],
    ["WD1", "wd1"],
    ["wd2", "wd2"],
    ["ＷＤ３", "wd3"],
    ["Working doctoral 1", "wd1"],
    ["社会人ドクター1年 (社D1)", "wd1"],
    // 学部
    ["B4", "b4"],
    ["ｂ３", "b3"],
    ["学部4年", "b4"],
    ["学部3年", "b3"],
    ["4年", "b4"],
    ["４年生", "b4"],
    ["四年", "b4"],
    ["Bachelor 4", "b4"],
    ["Undergraduate 3", "b3"],
    // スタッフ
    ["教授", "faculty"],
    ["准教授", "faculty"],
    ["助教", "faculty"],
    ["講師", "faculty"],
    ["特任准教授", "faculty"],
    ["Professor", "faculty"],
    ["Associate Professor", "faculty"],
    ["教員", "faculty"],
    ["ポスドク", "pd"],
    ["特任研究員", "pd"],
    ["博士研究員", "pd"],
    ["PD", "pd"],
    ["Postdoc", "pd"],
    ["post-doc", "pd"],
    ["技術職員", "technician"],
    ["技術員", "technician"],
    ["Technician", "technician"],
    ["秘書", "support"],
    ["支援員", "support"],
    ["その他", "other"],
    ["研究生", "other"],
    // キーそのもの
    ["faculty", "faculty"],
    ["FACULTY", "faculty"],
  ];
  it.each(cases)("%s → %s", (raw, expected) => {
    const r = normalizeRole(raw);
    expect(r.value).toBe(expected);
    expect(r.status).toBe("ok");
  });

  it("never turns working doctors into regular doctors", () => {
    for (const raw of ["社会人D1", "社D1", "社会人博士1年", "社会人ドクター1年", "WD1"]) {
      expect(normalizeRole(raw).value).not.toBe("d1");
    }
  });

  it.each(["", "  ", "　"])("empty %j → other/empty", (raw) => {
    expect(normalizeRole(raw)).toEqual({ value: "other", status: "empty" });
  });

  it.each(["宇宙飛行士", "M5", "D9", "B1", "社会人ドクター", "5年", "xyz"])(
    "unknown %s → other + warning",
    (raw) => {
      expect(normalizeRole(raw)).toEqual({ value: "other", status: "unknown" });
    },
  );

  it("handles null/undefined", () => {
    expect(normalizeRole(undefined).status).toBe("empty");
    expect(normalizeRole(null).status).toBe("empty");
  });
});

describe("normalizeGender", () => {
  const cases: [string, string][] = [
    ["男", "male"],
    ["男性", "male"],
    ["M", "male"],
    ["m", "male"],
    ["Male", "male"],
    ["ＭＡＬＥ", "male"],
    ["女", "female"],
    ["女性", "female"],
    ["F", "female"],
    ["Female", "female"],
    ["woman", "female"],
    ["その他", "other"],
    ["Other", "other"],
    ["non-binary", "other"],
    ["未回答", "unspecified"],
    ["不明", "unspecified"],
    ["N/A", "unspecified"],
    ["Prefer not to say", "unspecified"],
  ];
  it.each(cases)("%s → %s", (raw, expected) => {
    expect(normalizeGender(raw)).toEqual({ value: expected, status: "ok" });
  });
  it("empty → unspecified/empty", () => {
    expect(normalizeGender("")).toEqual({ value: "unspecified", status: "empty" });
  });
  it("unknown → unspecified/unknown", () => {
    expect(normalizeGender("ねこ")).toEqual({ value: "unspecified", status: "unknown" });
  });
});

describe("width / names", () => {
  it("normalizes full-width alphanumerics and spaces", () => {
    expect(normalizeWidth("　ＡＢＣ１２３　")).toBe("ABC123");
    expect(normalizeWidth("ﾔﾏﾀﾞ")).toBe("ヤマダ");
    expect(normalizeWidth("a  \t b")).toBe("a b");
  });
  it("normalizes names", () => {
    expect(normalizeName("  山田　太郎 ")).toBe("山田 太郎");
    expect(nameKey("山田　太郎")).toBe(nameKey("山田太郎"));
    expect(nameKey("Taro YAMADA")).toBe(nameKey("taro yamada"));
  });
  it("compactKey lowercases and strips spaces", () => {
    expect(compactKey(" Ａ Ｂ ")).toBe("ab");
  });
  it("searchKey folds katakana to hiragana", () => {
    expect(searchKey("ヤマダ")).toBe(searchKey("やまだ"));
    expect(searchKey("ﾔﾏﾀﾞ")).toBe("やまだ");
  });
});

describe("labs", () => {
  const labs: Lab[] = [
    { id: "l1", name: "山田研究室", shortName: "山田", color: "#000" },
    { id: "l2", name: "Smith Lab", shortName: "Smith", color: "#000" },
    { id: "l3", name: "鈴木 研究室", shortName: "SZK", color: "#000" },
  ];
  it.each([
    ["山田研究室", "l1"],
    ["山田研", "l1"],
    ["山田", "l1"],
    ["山田 研究室", "l1"],
    ["ＳＭＩＴＨ ＬＡＢ", "l2"],
    ["smith laboratory", "l2"],
    ["Smith", "l2"],
    ["鈴木研究室", "l3"],
    ["SZK", "l3"],
  ])("%s → %s", (raw, id) => {
    expect(matchLab(raw, labs)?.id).toBe(id);
  });
  it("returns undefined for unknown or empty", () => {
    expect(matchLab("佐藤研", labs)).toBeUndefined();
    expect(matchLab("  ", labs)).toBeUndefined();
  });
  it("labKey strips suffixes", () => {
    expect(labKey("山田研究室")).toBe("山田");
    expect(labKey("Smith Lab")).toBe("smith");
  });
});

describe("parseTags / seatLabelKey", () => {
  it("splits tags", () => {
    expect(parseTags("留学生, 車椅子、窓側;留学生")).toEqual(["留学生", "車椅子", "窓側"]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
  });
  it("matches seat labels loosely", () => {
    expect(seatLabelKey("A-01")).toBe(seatLabelKey("a1"));
    expect(seatLabelKey("Ａ－０１")).toBe(seatLabelKey("A-1"));
    expect(seatLabelKey("A-10")).not.toBe(seatLabelKey("A-1"));
  });
});
