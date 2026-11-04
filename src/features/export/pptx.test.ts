import JSZip from "jszip";
import { describe, expect, it } from "vite-plus/test";
import { makeExportFixture } from "./fixture";
import { buildExportModel, EXPORT_COLUMNS, type ExportOptions } from "./model";
import { exportPptx, fitFontSize } from "./pptx";
import { nameLines, textEm } from "./text";

const DATE = new Date(2026, 3, 1);

async function generate(opts: Partial<ExportOptions> = {}) {
  const model = buildExportModel(makeExportFixture(), {
    lang: "ja",
    columns: EXPORT_COLUMNS,
    colorBy: "role",
    date: DATE,
    ...opts,
  });
  const bytes = await exportPptx(model);
  const zip = await JSZip.loadAsync(bytes);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const slides = await Promise.all(slideFiles.map((f) => zip.file(f)!.async("string")));
  const texts = slides.map((xml) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]!));
  return { model, zip, slides, texts };
}

describe("text fitting", () => {
  it("measures full-width characters wider than half-width", () => {
    expect(textEm("山田")).toBe(2);
    expect(textEm("ab")).toBeCloseTo(1.1);
    expect(fitFontSize("山田 太郎", 0.8, 0.5, 14)).toBeLessThan(14);
    expect(fitFontSize("A", 2, 2, 14)).toBe(14);
    expect(fitFontSize("とても長い名前とても長い名前", 0.3, 0.3, 14)).toBe(5);
    expect(nameLines("山田 太郎", 40, 40, 14).lines).toEqual(["山田", "太郎"]);
    expect(nameLines("Al", 40, 40, 14).lines).toEqual(["Al"]);
  });
});

describe("exportPptx", () => {
  it("creates cover, overview and one slide per room with editable shapes (ja)", async () => {
    const { model, slides, texts } = await generate({ compositionTable: true });
    // 表紙 + 全体図 + 3 部屋 + 構成表
    expect(slides).toHaveLength(1 + 1 + 3 + 1);
    expect(texts[0]).toContain("テスト研究室");
    expect(texts[0]!.join(" ")).toContain("座席表");
    expect(texts[1]).toContain("フロア全体図");
    // 部屋スライド: タイトル・氏名・役職・入口・凡例
    const room = model.rooms[0]!;
    const t = texts[2]!;
    expect(t).toContain(room.name);
    const seated = room.seats.find((s) => s.member)!;
    // 氏名は 1 行、または姓・名の 2 行
    const [family, given] = seated.member!.name.split(" ");
    expect(t.includes(seated.member!.name) || (t.includes(family!) && t.includes(given!))).toBe(
      true,
    );
    expect(t).toContain(seated.member!.subtitle);
    expect(t).toContain("入口");
    expect(t).toContain("凡例");
    // 画像は使わない（すべて図形）
    for (const xml of slides) expect(xml).not.toContain("<p:pic>");
    expect(slides[2]).toContain("custGeom");
    expect(slides[2]).toContain('prst="roundRect"');
    expect(slides[2]).toContain('typeface="Yu Gothic"');
    // 構成表
    expect(slides[5]).toContain("<a:tbl>");
    expect(texts[5]).toContain("部屋ごとの構成");
    expect(texts[5]).toContain("合計");
  });

  it("writes English strings and Arial when the output language is en", async () => {
    const { slides, texts } = await generate({ lang: "en", colorBy: "none" });
    expect(slides).toHaveLength(5);
    expect(texts[1]).toContain("Floor overview");
    expect(texts[2]).toContain("Entrance");
    expect(texts[2]).not.toContain("Legend");
    expect(slides[2]).toContain('typeface="Arial"');
  });
});
