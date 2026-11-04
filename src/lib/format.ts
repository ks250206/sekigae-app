/** ロケール対応のフォーマット・並び順（Intl） */

export function formatDateTime(iso: string | Date, lng: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(lng, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function formatDate(iso: string | Date, lng: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(lng, { dateStyle: "medium" }).format(d);
}

export function formatNumber(n: number, lng: string, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(lng, opts).format(n);
}

export function formatPercent(ratio: number, lng: string, digits = 0): string {
  return new Intl.NumberFormat(lng, {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(ratio);
}

export function formatBytes(bytes: number, lng: string): string {
  if (bytes < 1024) return `${formatNumber(bytes, lng)} B`;
  if (bytes < 1024 * 1024)
    return `${formatNumber(bytes / 1024, lng, { maximumFractionDigits: 1 })} KB`;
  return `${formatNumber(bytes / 1024 / 1024, lng, { maximumFractionDigits: 1 })} MB`;
}

/** 「3 分前」などの相対時刻 */
export function formatRelative(iso: string | Date, lng: string, nowMs = Date.now()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = (d.getTime() - nowMs) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lng, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

const collators = new Map<string, Intl.Collator>();
export function collator(lng: string): Intl.Collator {
  let c = collators.get(lng);
  if (!c) {
    c = new Intl.Collator(lng, { numeric: true, sensitivity: "base" });
    collators.set(lng, c);
  }
  return c;
}

/** 氏名ソート（ja ではふりがな優先） */
export function compareNames(
  a: { name: string; kana?: string },
  b: { name: string; kana?: string },
  lng: string,
): number {
  const c = collator(lng);
  if (lng.startsWith("ja")) return c.compare(a.kana || a.name, b.kana || b.name);
  return c.compare(a.name, b.name);
}
