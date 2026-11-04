/** 描画用の純関数（パス生成・バウンディングボックス）。部屋ローカルのセル座標で返す */
import type { CellKind, Facing, Room } from "@/domain/schema";
import { unionBounds, type Bounds } from "./viewport";

/** 部屋ヘッダー（名前タブ）の高さ（セル単位）。部屋の上側に張り出す */
export const ROOM_HEADER = 0.8;

const kindAt = (r: Pick<Room, "width" | "height" | "cells">, x: number, y: number): CellKind =>
  x < 0 || y < 0 || x >= r.width || y >= r.height ? "void" : (r.cells[y * r.width + x] ?? "void");

/** 指定種別のセルを行ごとの連続区間にまとめた矩形パス */
export function cellsPath(
  r: Pick<Room, "width" | "height" | "cells">,
  match: (k: CellKind) => boolean,
) {
  let d = "";
  for (let y = 0; y < r.height; y++) {
    let x = 0;
    while (x < r.width) {
      if (!match(kindAt(r, x, y))) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < r.width && match(kindAt(r, x, y))) x++;
      d += `M${x0} ${y}h${x - x0}v1h${x0 - x}z`;
    }
  }
  return d;
}

/** 床（void 以外）の領域 */
export const floorPath = (r: Pick<Room, "width" | "height" | "cells">) =>
  cellsPath(r, (k) => k !== "void");

/**
 * 壁の外周線: void 以外のセルで、隣が void / 部屋外の辺を連結した線分パス。
 * 横線・縦線ごとに連続区間をまとめる（stroke-linecap=square で角が埋まる）。
 */
export function wallPath(r: Pick<Room, "width" | "height" | "cells">): string {
  const solid = (x: number, y: number) => kindAt(r, x, y) !== "void";
  let d = "";
  // 横の境界線 y = 0..height
  for (let y = 0; y <= r.height; y++) {
    let x = 0;
    while (x < r.width) {
      const edge = (xx: number) => solid(xx, y) !== solid(xx, y - 1);
      if (!edge(x)) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < r.width && edge(x)) x++;
      d += `M${x0} ${y}H${x}`;
    }
  }
  for (let x = 0; x <= r.width; x++) {
    let y = 0;
    while (y < r.height) {
      const edge = (yy: number) => solid(x, yy) !== solid(x - 1, yy);
      if (!edge(y)) {
        y++;
        continue;
      }
      const y0 = y;
      while (y < r.height && edge(y)) y++;
      d += `M${x} ${y0}V${y}`;
    }
  }
  return d;
}

/** 部屋本体のワールド座標の矩形 */
export const roomRect = (r: Pick<Room, "position" | "width" | "height">): Bounds => ({
  x: r.position.x,
  y: r.position.y,
  width: r.width,
  height: r.height,
});

/** ヘッダーを含む部屋の外接矩形 */
export const roomBounds = (r: Pick<Room, "position" | "width" | "height">): Bounds => ({
  x: r.position.x,
  y: r.position.y - ROOM_HEADER,
  width: r.width,
  height: r.height + ROOM_HEADER,
});

export const roomsBounds = (rooms: Pick<Room, "position" | "width" | "height">[]) =>
  unionBounds(rooms.map(roomBounds));

export const FACING_ANGLE: Record<Facing, number> = { n: 0, e: 90, s: 180, w: 270 };

/** 机の中心（セル内ローカル）。ラベル配置に使う */
export const DESK_CENTER: Record<Facing, { x: number; y: number }> = {
  n: { x: 0.5, y: 0.33 },
  e: { x: 0.67, y: 0.5 },
  s: { x: 0.5, y: 0.67 },
  w: { x: 0.33, y: 0.5 },
};

/** 1 文字の概算幅（全角 = 1、半角 = 0.6） */
const charWidth = (c: string) => ((c.codePointAt(0) ?? 0) < 0x100 ? 0.6 : 1);

/** SVG にはテキスト省略が無いので、幅（セル単位）に収まるよう概算で切り詰める */
export function fitText(text: string, maxWidth: number, fontSize: number): string {
  let total = 0;
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    total += charWidth(chars[i]!) * fontSize;
    if (total > maxWidth) return chars.slice(0, Math.max(0, i - 1)).join("") + "…";
  }
  return text;
}

/** 文字列の概算幅（セル単位） */
export const textWidth = (text: string, fontSize: number) =>
  Array.from(text).reduce((n, c) => n + charWidth(c) * fontSize, 0);
