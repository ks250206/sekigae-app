/** 出力ファイルのフォント指定。issue #135 */
import type { Language } from "@/i18n";

export interface OutputFonts {
  /** 指定するフォント */
  face: string;
  /** 指定フォントが無い環境での代替（手動確認チェックリスト・テーマフォントで使用） */
  fallback: string;
}

/**
 * ja: 游ゴシック（Windows / macOS Office に同梱）→ 無い環境では Meiryo。
 * en: Arial。
 */
export function outputFonts(lang: Language): OutputFonts {
  return lang === "ja"
    ? { face: "Yu Gothic", fallback: "Meiryo" }
    : { face: "Arial", fallback: "Arial" };
}
