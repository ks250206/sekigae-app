/**
 * 出力ファイルの生成。XLSX / PPTX の書き出しモジュール（と ExcelJS / PptxGenJS）は
 * dynamic import で別チャンクにし、ボタンのホバー時にプリフェッチする。issue #135
 */
import type { ExportFormat, ExportModel } from "./model";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const EXTENSIONS: Record<ExportFormat, string> = { xlsx: "xlsx", pptx: "pptx", png: "png" };

type Writer = (model: ExportModel) => Promise<Uint8Array>;

const cache = new Map<ExportFormat, Promise<Writer>>();

/** 書き出し関数（とライブラリ本体）を読み込む。2 回目以降はキャッシュ */
export function loadWriter(format: "xlsx" | "pptx"): Promise<Writer> {
  let p = cache.get(format);
  if (!p) {
    p =
      format === "xlsx"
        ? import("./xlsx").then(async (m) => {
            await m.loadExcelJS();
            return m.exportXlsx;
          })
        : import("./pptx").then(async (m) => {
            await m.loadPptxGenJS();
            return m.exportPptx;
          });
    // 失敗したら次回やり直せるように
    p.catch(() => cache.delete(format));
    cache.set(format, p);
  }
  return p;
}

export function prefetchWriter(format: ExportFormat): void {
  if (format === "png") return;
  void loadWriter(format).catch(() => {});
}

export type Phase = "loading" | "generating";

/** モデルからダウンロード用の Blob を作る（PNG 以外） */
export async function generateOfficeFile(
  model: ExportModel,
  format: "xlsx" | "pptx",
  onPhase?: (p: Phase) => void,
): Promise<Blob> {
  onPhase?.("loading");
  const write = await loadWriter(format);
  onPhase?.("generating");
  // 進捗表示を描画させてから重い処理に入る
  await new Promise((r) => setTimeout(r, 0));
  const bytes = await write(model);
  return new Blob([bytes as BlobPart], { type: format === "xlsx" ? XLSX_MIME : PPTX_MIME });
}

/** SVG 要素を 2 倍解像度の PNG にする（ライト配色の白背景） */
export async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const vb = svg.viewBox.baseVal;
  const w = Math.max(1, Math.round((vb?.width || svg.clientWidth || 800) * scale));
  const h = Math.max(1, Math.round((vb?.height || svg.clientHeight || 600) * scale));
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to render SVG"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
