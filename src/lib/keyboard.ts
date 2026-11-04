/** 入力欄にフォーカスがあるか（ショートカットを無効化する判定） */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    target.closest("[role=dialog] input, [cmdk-input]") !== null
  );
}

export const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** 表示用の修飾キー名 */
export const modKey = () => (isMac() ? "⌘" : "Ctrl");
