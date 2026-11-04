/** localStorage 上の sekigae データを丸ごと JSON でダウンロードする（緊急退避用） */
export function downloadLocalBackup(): void {
  const data: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("sekigae:")) continue;
      const raw = localStorage.getItem(key);
      try {
        data[key] = raw ? JSON.parse(raw) : raw;
      } catch {
        data[key] = raw;
      }
    }
  } catch {
    // localStorage が使えない環境
  }
  downloadText(
    `sekigae-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(data, null, 2),
    "application/json",
  );
}

export function downloadText(filename: string, text: string, type = "text/plain"): void {
  downloadBlob(filename, new Blob([text], { type }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
