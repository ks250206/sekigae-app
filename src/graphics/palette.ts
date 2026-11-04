/**
 * 役職・研究室のカラーパレット（HEX）。SVG 描画と XLSX/PPTX 出力の両方で使う。
 * 出力は常にライト配色。docs/DESIGN.md §9
 */
import type { RoleKey } from "@/domain/roles";

export type Scheme = "light" | "dark";

/** 役職パレット。社会人ドクター (wd*) は一般の D と別の色相（オレンジ系） */
export const ROLE_COLORS: Record<RoleKey, { light: string; dark: string }> = {
  faculty: { light: "#5b21b6", dark: "#a78bfa" },
  technician: { light: "#7c3aed", dark: "#c4b5fd" },
  support: { light: "#9333ea", dark: "#d8b4fe" },
  pd: { light: "#0f766e", dark: "#5eead4" },
  d3: { light: "#1e3a8a", dark: "#93c5fd" },
  d2: { light: "#1d4ed8", dark: "#60a5fa" },
  d1: { light: "#3b82f6", dark: "#3b82f6" },
  wd3: { light: "#9a3412", dark: "#fdba74" },
  wd2: { light: "#c2410c", dark: "#fb923c" },
  wd1: { light: "#ea580c", dark: "#f97316" },
  m2: { light: "#15803d", dark: "#86efac" },
  m1: { light: "#22a04b", dark: "#4ade80" },
  b4: { light: "#0e7490", dark: "#67e8f9" },
  b3: { light: "#0891b2", dark: "#22d3ee" },
  other: { light: "#64748b", dark: "#94a3b8" },
};

/** 研究室の候補色（隣り合っても区別しやすい順） */
export const LAB_PALETTE = [
  "#e11d48",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
  "#0d9488",
  "#a16207",
] as const;

/** 部屋の候補色 */
export const ROOM_PALETTE = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f43f5e",
] as const;

export const GENDER_COLORS = {
  male: { light: "#2563eb", dark: "#60a5fa" },
  female: { light: "#db2777", dark: "#f472b6" },
  other: { light: "#7c3aed", dark: "#a78bfa" },
  unspecified: { light: "#64748b", dark: "#94a3b8" },
} as const;

export const roleColor = (r: RoleKey, scheme: Scheme = "light") => ROLE_COLORS[r][scheme];

/** 既存色と重ならない次の色 */
export function nextPaletteColor(palette: readonly string[], used: readonly string[]): string {
  const u = new Set(used.map((c) => c.toLowerCase()));
  return palette.find((c) => !u.has(c.toLowerCase())) ?? palette[used.length % palette.length]!;
}

/** 背景色に対して読みやすい文字色（白 or 濃紺） */
export function readableText(hex: string): string {
  const n = hex.replace("#", "");
  const full =
    n.length === 3
      ? n
          .split("")
          .map((c) => c + c)
          .join("")
      : n;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "#0f172a" : "#ffffff";
}

/** HEX に透明度を付ける */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

/** ヒートマップ（0: 入口側 → 1: 最奥）の色 */
export function heatColor(t: number): string {
  const stops = [
    [0, [56, 189, 248]],
    [0.5, [167, 139, 250]],
    [1, [244, 63, 94]],
  ] as const;
  const x = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < stops.length - 2 && x > stops[i + 1]![0]) i++;
  const [t0, c0] = stops[i]!;
  const [t1, c1] = stops[i + 1]!;
  const k = (x - t0) / (t1 - t0 || 1);
  const mix = c0.map((v, j) => Math.round(v + (c1[j]! - v) * k));
  return `rgb(${mix.join(",")})`;
}
