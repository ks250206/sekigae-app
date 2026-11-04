/** 文字の収まり計算（PPTX / SVG プレビュー共用）。単位は呼び出し側で揃える（pt や px） */

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

/** 文字列の幅（em 単位）の概算: 全角 1.0、半角 0.55 */
export function textEm(s: string): number {
  let n = 0;
  for (const ch of s) n += WIDE.test(ch) ? 1 : 0.55;
  return n;
}

/** w × h の箱に 1 行で収まるフォントサイズ（w, h と同じ単位） */
export function fitFont(text: string, w: number, h: number, max: number, min = 5): number {
  const em = Math.max(textEm(text), 1);
  return Math.max(min, Math.min(max, (w * 0.8) / em, h * 0.8));
}

const round = (n: number) => Math.round(n * 10) / 10;

/** 氏名を 1 行 or 姓・名の 2 行に分け、大きく表示できる方を選ぶ */
export function nameLines(
  name: string,
  w: number,
  h: number,
  max: number,
  min = 5,
): { lines: string[]; fontSize: number } {
  const one = fitFont(name, w, h, max, min);
  const parts = name
    .trim()
    .split(/[\s　]+/u)
    .filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]!;
    const rest = parts.slice(1).join(" ");
    const two = Math.min(fitFont(first, w, h / 2, max, min), fitFont(rest, w, h / 2, max, min));
    if (two > one * 1.15) return { lines: [first, rest], fontSize: round(two) };
  }
  return { lines: [name], fontSize: round(one) };
}
