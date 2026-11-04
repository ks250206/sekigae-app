/**
 * PPTX 出力（PptxGenJS, 16:9）。issue #133, #134
 * - すべて編集可能な図形（画像は使わない）。
 * - PptxGenJS は dynamic import で読み込み、初期バンドルに含めない。
 */
import type PptxGenJS from "pptxgenjs";
import type { Facing } from "@/domain/schema";
import { readableText, ROLE_COLORS } from "@/graphics/palette";
import { outputFonts } from "./fonts";
import {
  cellRuns,
  ENTRANCE_COLOR,
  FLOOR_FILL,
  OBSTACLE_FILL,
  wallSegments,
  WALL_COLOR,
  type ExportModel,
  type ExportRoom,
  type ExportSeat,
} from "./model";

type PptxCtor = typeof PptxGenJS;
type Slide = PptxGenJS.Slide;
type TextRun = PptxGenJS.TextProps;
/** 型定義に無いが PptxGenJS が対応しているカスタム図形 */
const CUSTOM_GEOMETRY = "custGeom" as PptxGenJS.SHAPE_NAME;

export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function loadPptxGenJS(): Promise<PptxCtor> {
  const mod = (await import("pptxgenjs")) as { default: PptxCtor };
  return mod.default;
}

/** 16:9 (10 × 5.625 in) */
const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN = 0.4;
const LEGEND_W = 1.5;
const AREA_TOP = 1.05;
const FOOTER_H = 0.4;

const hex = (c: string) => c.replace("#", "").toUpperCase();
const MUTED = "64748B";
const INK = "0F172A";

interface Ctx {
  model: ExportModel;
  pptx: PptxGenJS;
  font: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文字列の幅（em 単位）の概算: 全角 1.0、半角 0.55 */
export function textEm(s: string): number {
  let n = 0;
  for (const ch of s) n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u.test(ch) ? 1 : 0.55;
  return n;
}

/** 箱（inch）に収まるフォントサイズ（pt） */
export function fitFontSize(text: string, wIn: number, hIn: number, max: number, min = 5): number {
  const em = Math.max(textEm(text), 1);
  const byW = (wIn * 72 * 0.8) / em;
  const byH = hIn * 72 * 0.8;
  return Math.max(min, Math.min(max, byW, byH));
}

const round = (n: number) => Math.round(n * 10) / 10;

/** 氏名を 1 行 or 姓・名の 2 行に分け、大きく表示できる方を選ぶ */
export function nameLines(name: string, wIn: number, hIn: number, max: number) {
  const one = fitFontSize(name, wIn, hIn, max);
  const parts = name
    .trim()
    .split(/[\s\u3000]+/u)
    .filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]!;
    const rest = parts.slice(1).join(" ");
    const two = Math.min(
      fitFontSize(first, wIn, hIn / 2, max),
      fitFontSize(rest, wIn, hIn / 2, max),
    );
    if (two > one * 1.15) return { lines: [first, rest], fontSize: round(two) };
  }
  return { lines: [name], fontSize: round(one) };
}

function addFooter(slide: Slide, ctx: Ctx) {
  const { model } = ctx;
  slide.addText([model.projectName, model.strings.plan, model.strings.createdOn].join("   ·   "), {
    x: MARGIN,
    y: SLIDE_H - FOOTER_H,
    w: SLIDE_W - MARGIN * 2 - 0.6,
    h: 0.3,
    fontSize: 9,
    color: MUTED,
    fontFace: ctx.font,
    valign: "middle",
  });
  slide.slideNumber = {
    x: SLIDE_W - MARGIN - 0.5,
    y: SLIDE_H - FOOTER_H,
    w: 0.5,
    h: 0.3,
    fontSize: 9,
    color: MUTED,
    fontFace: ctx.font,
    align: "right",
  };
}

function addTitle(slide: Slide, ctx: Ctx, title: string, subtitle?: string) {
  slide.addText(title, {
    x: MARGIN,
    y: 0.2,
    w: SLIDE_W - MARGIN * 2,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: INK,
    fontFace: ctx.font,
    valign: "middle",
    margin: 0,
  });
  if (subtitle)
    slide.addText(subtitle, {
      x: MARGIN,
      y: 0.68,
      w: SLIDE_W - MARGIN * 2,
      h: 0.3,
      fontSize: 11,
      color: MUTED,
      fontFace: ctx.font,
      valign: "middle",
      margin: 0,
    });
}

function addLegend(slide: Slide, ctx: Ctx, x: number, y: number, maxH: number) {
  const { model } = ctx;
  if (!model.legend.length) return;
  const rowH = Math.min(0.28, (maxH - 0.3) / (model.legend.length + 1));
  slide.addText(model.strings.legend, {
    x,
    y,
    w: LEGEND_W,
    h: 0.28,
    fontSize: 10,
    bold: true,
    color: INK,
    fontFace: ctx.font,
    margin: 0,
  });
  model.legend.forEach((l, i) => {
    const yy = y + 0.32 + i * rowH;
    slide.addShape("roundRect", {
      x,
      y: yy + rowH * 0.15,
      w: rowH * 0.7,
      h: rowH * 0.7,
      rectRadius: 0.03,
      fill: { color: hex(l.fill) },
      line: { color: "CBD5E1", width: 0.5 },
    });
    slide.addText(l.label, {
      x: x + rowH * 0.85,
      y: yy,
      w: LEGEND_W - rowH * 0.85,
      h: rowH,
      fontSize: Math.min(10, rowH * 72 * 0.55),
      color: INK,
      fontFace: ctx.font,
      valign: "middle",
      margin: 0,
      fit: "shrink",
    });
  });
  // 入口の記号
  const yy = y + 0.32 + model.legend.length * rowH + 0.05;
  slide.addShape("line", {
    x,
    y: yy + rowH / 2,
    w: rowH * 0.7,
    h: 0,
    line: { color: hex(ENTRANCE_COLOR), width: 3 },
  });
  slide.addText(model.strings.entrance, {
    x: x + rowH * 0.85,
    y: yy,
    w: LEGEND_W - rowH * 0.85,
    h: rowH,
    fontSize: Math.min(10, rowH * 72 * 0.55),
    color: INK,
    fontFace: ctx.font,
    valign: "middle",
    margin: 0,
  });
}

/** 床・障害物・外壁・入口を描く（部屋の左上 = ox, oy、1 マス = cell inch） */
function drawRoomShell(
  slide: Slide,
  ctx: Ctx,
  room: ExportRoom,
  ox: number,
  oy: number,
  cell: number,
  opts: { doorSymbols: boolean; labels: boolean },
) {
  const name = (n: string) => `${room.name} ${n}`;
  for (const r of cellRuns(room, (c) => c.kind !== "void"))
    slide.addShape("rect", {
      x: ox + r.x * cell,
      y: oy + r.y * cell,
      w: r.w * cell,
      h: r.h * cell,
      fill: { color: hex(FLOOR_FILL) },
      line: { type: "none" },
      objectName: name("floor"),
    });
  for (const r of cellRuns(room, (c) => c.kind === "obstacle"))
    slide.addShape("rect", {
      x: ox + r.x * cell,
      y: oy + r.y * cell,
      w: r.w * cell,
      h: r.h * cell,
      fill: { color: hex(OBSTACLE_FILL) },
      line: { color: "6B7280", width: 0.5 },
      objectName: name("obstacle"),
    });
  // 外壁: 1 つのカスタム図形（複数のサブパス）
  const segs = wallSegments(room);
  if (segs.length)
    slide.addShape(CUSTOM_GEOMETRY, {
      x: ox,
      y: oy,
      w: room.width * cell,
      h: room.height * cell,
      fill: { type: "none" },
      line: { color: hex(WALL_COLOR), width: cell > 0.3 ? 2.5 : 1.5 },
      points: segs.flatMap((s) => [
        { x: s.x1 * cell, y: s.y1 * cell, moveTo: true },
        { x: s.x2 * cell, y: s.y2 * cell },
      ]),
      objectName: name("wall"),
    });
  for (const e of room.entrances) drawEntrance(slide, ctx, room, e, ox, oy, cell, opts);
}

const DOOR: Record<Facing, { h: [number, number]; u: [number, number]; n: [number, number] }> = {
  n: { h: [0, 0], u: [1, 0], n: [0, 1] },
  s: { h: [0, 1], u: [1, 0], n: [0, -1] },
  w: { h: [0, 0], u: [0, 1], n: [1, 0] },
  e: { h: [1, 0], u: [0, 1], n: [-1, 0] },
};
const deg = (v: [number, number]) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;

function drawEntrance(
  slide: Slide,
  ctx: Ctx,
  room: ExportRoom,
  e: ExportRoom["entrances"][number],
  ox: number,
  oy: number,
  cell: number,
  opts: { doorSymbols: boolean; labels: boolean },
) {
  const d = DOOR[e.side];
  const cx = ox + e.x * cell;
  const cy = oy + e.y * cell;
  const color = hex(ENTRANCE_COLOR);
  // 開口部（壁上の太線）
  const hx = cx + d.h[0] * cell;
  const hy = cy + d.h[1] * cell;
  slide.addShape("line", {
    x: hx,
    y: hy,
    w: d.u[0] * cell,
    h: d.u[1] * cell,
    line: { color, width: cell > 0.3 ? 4 : 2.5 },
    objectName: `${room.name} entrance`,
  });
  if (opts.doorSymbols) {
    // ドア記号: 蝶番 → 扉（内向き）→ 円弧で開口部の端へ
    const r = cell * 0.9;
    const lh = [d.h[0] * cell, d.h[1] * cell] as const;
    const leaf = { x: lh[0] + d.n[0] * r, y: lh[1] + d.n[1] * r };
    const stAng = (deg(d.n) + 360) % 360;
    const endAng = (deg(d.u) + 360) % 360;
    const swAng = ((endAng - stAng + 540) % 360) - 180;
    slide.addShape(CUSTOM_GEOMETRY, {
      x: cx,
      y: cy,
      w: cell,
      h: cell,
      fill: { type: "none" },
      line: { color, width: 1 },
      points: [
        { x: lh[0], y: lh[1], moveTo: true },
        { x: leaf.x, y: leaf.y },
        {
          x: lh[0] + d.u[0] * r,
          y: lh[1] + d.u[1] * r,
          curve: { type: "arc", hR: r, wR: r, stAng, swAng },
        },
      ],
      objectName: `${room.name} door`,
    });
  }
  if (opts.labels) {
    // ラベルは壁の外側
    const w = 0.9;
    const h = 0.22;
    const mid = { x: hx + (d.u[0] * cell) / 2, y: hy + (d.u[1] * cell) / 2 };
    const out = { x: -d.n[0], y: -d.n[1] };
    const lx = out.x < 0 ? mid.x - w - 0.02 : out.x > 0 ? mid.x + 0.02 : mid.x - w / 2;
    const ly = out.y < 0 ? mid.y - h - 0.01 : out.y > 0 ? mid.y + 0.01 : mid.y - h / 2;
    slide.addText(ctx.model.strings.entrance, {
      x: lx,
      y: ly,
      w,
      h,
      fontSize: 8,
      bold: true,
      color,
      fontFace: ctx.font,
      align: out.x < 0 ? "right" : out.x > 0 ? "left" : "center",
      valign: "middle",
      margin: 0,
    });
  }
}

const CHAIR_SHIFT: Record<Facing, [number, number]> = {
  // 着席者の向き。椅子は向きと反対側
  n: [0, 1],
  s: [0, -1],
  e: [-1, 0],
  w: [1, 0],
};

function drawSeat(slide: Slide, ctx: Ctx, seat: ExportSeat, ox: number, oy: number, cell: number) {
  const pad = cell * 0.06;
  const chairDepth = cell * 0.18;
  const back = CHAIR_SHIFT[seat.facing];
  let x = ox + seat.x * cell + pad;
  let y = oy + seat.y * cell + pad;
  let w = cell - pad * 2;
  let h = cell - pad * 2;
  // 机は椅子の分だけ前へ
  if (back[0] !== 0) {
    w -= chairDepth;
    if (back[0] < 0) x += chairDepth;
  } else {
    h -= chairDepth;
    if (back[1] < 0) y += chairDepth;
  }
  // 椅子
  const chairLong = cell * 0.4;
  const chairShort = chairDepth * 0.85;
  const ccx = ox + seat.x * cell + cell / 2 + back[0] * (cell / 2 - pad - chairDepth / 2);
  const ccy = oy + seat.y * cell + cell / 2 + back[1] * (cell / 2 - pad - chairDepth / 2);
  const cw = back[0] !== 0 ? chairShort : chairLong;
  const ch = back[0] !== 0 ? chairLong : chairShort;
  slide.addShape("roundRect", {
    x: ccx - cw / 2,
    y: ccy - ch / 2,
    w: cw,
    h: ch,
    rectRadius: Math.min(cw, ch) / 2,
    fill: { color: "CBD5E1" },
    line: { color: "94A3B8", width: 0.5 },
    objectName: `chair ${seat.label}`,
  });

  const m = seat.member;
  const runs: TextRun[] = [];
  if (m) {
    const lines = nameLines(m.name, w, m.subtitle ? h * 0.62 : h, 14);
    lines.lines.forEach((text, i) =>
      runs.push({
        text,
        options: {
          bold: true,
          fontSize: lines.fontSize,
          breakLine: i < lines.lines.length - 1 || !!m.subtitle,
        },
      }),
    );
    if (m.subtitle)
      runs.push({
        text: m.subtitle,
        options: {
          fontSize: round(
            Math.min(lines.fontSize * 0.8, fitFontSize(m.subtitle, w, h * 0.3, 11, 4)),
          ),
        },
      });
  } else {
    runs.push({
      text: seat.label,
      options: { fontSize: round(fitFontSize(seat.label, w, h * 0.5, 9)) },
    });
  }
  slide.addText(runs, {
    shape: "roundRect",
    x,
    y,
    w,
    h,
    rectRadius: Math.min(w, h) * 0.15,
    fill: { color: hex(seat.fill) },
    line: m ? { color: "475569", width: 0.75 } : { color: "94A3B8", width: 0.75, dashType: "dash" },
    color: hex(seat.text),
    fontFace: ctx.font,
    align: "center",
    valign: "middle",
    margin: 1,
    fit: "shrink",
    objectName: `seat ${seat.label}`,
  });
}

function addCoverSlide(ctx: Ctx) {
  const { model, pptx } = ctx;
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape("rect", {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.12,
    fill: { color: "4F46E5" },
    line: { type: "none" },
  });
  s.addText(model.projectName, {
    x: MARGIN,
    y: 1.0,
    w: SLIDE_W - MARGIN * 2,
    h: 0.9,
    fontSize: 36,
    bold: true,
    color: INK,
    fontFace: ctx.font,
    align: "center",
    fit: "shrink",
  });
  s.addText(`${model.strings.coverSubtitle}  —  ${model.planName}`, {
    x: MARGIN,
    y: 1.9,
    w: SLIDE_W - MARGIN * 2,
    h: 0.45,
    fontSize: 18,
    color: "334155",
    fontFace: ctx.font,
    align: "center",
  });
  s.addText(model.strings.createdOn, {
    x: MARGIN,
    y: 2.35,
    w: SLIDE_W - MARGIN * 2,
    h: 0.35,
    fontSize: 12,
    color: MUTED,
    fontFace: ctx.font,
    align: "center",
  });
  const stats: [string, number][] = [
    [model.strings.coverMembers, model.totals.members],
    [model.strings.coverAssigned, model.totals.assigned],
    [model.strings.coverUnassigned, model.totals.unassigned],
    [model.strings.coverRooms, model.totals.rooms],
    [model.strings.coverSeats, model.totals.seats],
  ];
  const tileW = 1.5;
  const gap = 0.2;
  const x0 = (SLIDE_W - (tileW * stats.length + gap * (stats.length - 1))) / 2;
  stats.forEach(([label, value], i) => {
    s.addText(
      [
        { text: String(value), options: { fontSize: 26, bold: true, color: INK, breakLine: true } },
        { text: label, options: { fontSize: 11, color: MUTED } },
      ],
      {
        shape: "roundRect",
        x: x0 + i * (tileW + gap),
        y: 3.1,
        w: tileW,
        h: 1.1,
        rectRadius: 0.1,
        fill: { color: "F1F5F9" },
        line: { color: "E2E8F0", width: 0.75 },
        fontFace: ctx.font,
        align: "center",
        valign: "middle",
      },
    );
  });
}

function addOverviewSlide(ctx: Ctx) {
  const { model, pptx } = ctx;
  if (!model.rooms.length) return;
  const s = pptx.addSlide();
  addTitle(s, ctx, model.strings.overview, model.strings.plan);
  const legendW = model.legend.length ? LEGEND_W + 0.2 : 0;
  const area: Box = {
    x: MARGIN,
    y: AREA_TOP + 0.2,
    w: SLIDE_W - MARGIN * 2 - legendW,
    h: SLIDE_H - AREA_TOP - 0.2 - FOOTER_H - 0.1,
  };
  const cell = Math.min(area.w / model.floor.width, area.h / model.floor.height);
  const ox = area.x + (area.w - cell * model.floor.width) / 2;
  const oy = area.y + (area.h - cell * model.floor.height) / 2;
  for (const room of model.rooms) {
    const rx = ox + room.floorX * cell;
    const ry = oy + room.floorY * cell;
    drawRoomShell(s, ctx, room, rx, ry, cell, { doorSymbols: false, labels: false });
    for (const seat of room.seats) {
      const p = cell * 0.06;
      const label = seat.member?.short ?? "";
      s.addText(label, {
        shape: "rect",
        x: rx + seat.x * cell + p,
        y: ry + seat.y * cell + p,
        w: cell - p * 2,
        h: cell - p * 2,
        fill: { color: hex(seat.fill) },
        line: { color: "64748B", width: 0.5 },
        color: hex(seat.text),
        fontSize: round(fitFontSize(label || "M", cell - p * 2, (cell - p * 2) * 0.7, 10, 4)),
        fontFace: ctx.font,
        align: "center",
        valign: "middle",
        margin: 0,
        objectName: `seat ${room.name} ${seat.label}`,
      });
    }
    s.addText(room.name, {
      x: rx,
      y: ry - 0.24,
      w: Math.max(room.width * cell, 1.2),
      h: 0.22,
      fontSize: 9,
      bold: true,
      color: hex(room.color),
      fontFace: ctx.font,
      margin: 0,
      valign: "bottom",
    });
  }
  addLegend(s, ctx, SLIDE_W - MARGIN - LEGEND_W, AREA_TOP + 0.2, area.h);
  addFooter(s, ctx);
}

function addRoomSlide(ctx: Ctx, room: ExportRoom) {
  const { model, pptx } = ctx;
  const s = pptx.addSlide();
  const breakdown = room.roleBreakdown.map((b) => `${b.label} ${b.count}`).join(" / ");
  addTitle(s, ctx, room.name, [room.summary, breakdown].filter(Boolean).join("   ·   "));
  const legendW = model.legend.length ? LEGEND_W + 0.2 : 0;
  // 入口ラベルの分だけ内側に余白
  const inset = 0.28;
  const area: Box = {
    x: MARGIN + inset,
    y: AREA_TOP + inset,
    w: SLIDE_W - MARGIN * 2 - legendW - inset * 2,
    h: SLIDE_H - AREA_TOP - FOOTER_H - inset * 2,
  };
  const cell = Math.min(area.w / room.width, area.h / room.height, 1.1);
  const ox = area.x + (area.w - cell * room.width) / 2;
  const oy = area.y + (area.h - cell * room.height) / 2;
  drawRoomShell(s, ctx, room, ox, oy, cell, { doorSymbols: true, labels: true });
  for (const seat of room.seats) drawSeat(s, ctx, seat, ox, oy, cell);
  addLegend(s, ctx, SLIDE_W - MARGIN - LEGEND_W, AREA_TOP + 0.1, area.h);
  addFooter(s, ctx);
}

function addCompositionSlide(ctx: Ctx) {
  const { model, pptx } = ctx;
  if (!model.rooms.length) return;
  const s = pptx.addSlide();
  addTitle(s, ctx, model.strings.composition, model.strings.plan);
  const roles = model.compositionRoles;
  const headerCell = (text: string, fill = "E2E8F0", color = INK): PptxGenJS.TableCell => ({
    text,
    options: { bold: true, fill: { color: fill }, color, align: "center" },
  });
  const rows: PptxGenJS.TableRow[] = [
    [
      headerCell(model.strings.headers.room),
      ...roles.map((r) => {
        const c = ROLE_COLORS[r].light;
        return headerCell(model.strings.roles[r], hex(c), hex(readableText(c)));
      }),
      headerCell(model.strings.total),
      headerCell(model.strings.seats),
    ],
  ];
  for (const room of model.rooms) {
    const counts = new Map(room.roleBreakdown.map((b) => [b.role, b.count]));
    rows.push([
      { text: room.name, options: { bold: true } },
      ...roles.map((r) => ({
        text: String(counts.get(r) ?? ""),
        options: { align: "center" as const },
      })),
      { text: String(room.members.length), options: { align: "center", bold: true } },
      { text: String(room.seatCount), options: { align: "center", color: MUTED } },
    ]);
  }
  rows.push([
    headerCell(model.strings.total),
    ...roles.map((r) =>
      headerCell(
        String(
          model.rooms.reduce(
            (n, room) => n + (room.roleBreakdown.find((b) => b.role === r)?.count ?? 0),
            0,
          ),
        ),
      ),
    ),
    headerCell(String(model.rooms.reduce((n, r) => n + r.members.length, 0))),
    headerCell(String(model.totals.seats)),
  ]);
  const w = SLIDE_W - MARGIN * 2;
  const first = Math.min(2, w * 0.25);
  const rest = (w - first) / (roles.length + 2);
  s.addTable(rows, {
    x: MARGIN,
    y: AREA_TOP + 0.1,
    w,
    colW: [first, ...Array.from({ length: roles.length + 2 }, () => rest)],
    fontFace: ctx.font,
    fontSize: roles.length > 10 ? 9 : 11,
    color: INK,
    border: { type: "solid", pt: 0.5, color: "CBD5E1" },
    valign: "middle",
    autoPage: false,
  });
  if (model.unassigned.length)
    s.addText(
      `${model.strings.unassignedTitle}: ${model.unassigned.map((p) => p.name).join("、")}`,
      {
        x: MARGIN,
        y: SLIDE_H - FOOTER_H - 0.7,
        w: SLIDE_W - MARGIN * 2,
        h: 0.6,
        fontSize: 10,
        color: "B45309",
        fontFace: ctx.font,
        fit: "shrink",
        valign: "bottom",
      },
    );
  addFooter(s, ctx);
}

/** モデルから PPTX のバイト列を生成する */
export async function exportPptx(model: ExportModel): Promise<Uint8Array> {
  const Pptx = await loadPptxGenJS();
  const pptx = new Pptx();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = model.projectName;
  pptx.author = "Sekigae";
  pptx.company = "Sekigae";
  pptx.subject = model.strings.coverSubtitle;
  const fonts = outputFonts(model.lang);
  // 明示指定のないテキスト（ユーザーが後から追加する箱など）は代替フォント
  pptx.theme = { headFontFace: fonts.face, bodyFontFace: fonts.fallback };
  const ctx: Ctx = { model, pptx, font: fonts.face };
  addCoverSlide(ctx);
  addOverviewSlide(ctx);
  for (const room of model.rooms) addRoomSlide(ctx, room);
  if (model.options.compositionTable) addCompositionSlide(ctx);
  const out = await pptx.write({ outputType: "uint8array" });
  return out as Uint8Array;
}
