/** 共有パターン ID（同一ページに複数キャンバスがあっても中身が同じなので衝突しない） */
export const DEF = {
  floor: "sk-floor-tex",
  hatch: "sk-obstacle-hatch",
  void: "sk-void-hatch",
} as const;
export const defUrl = (id: string) => `url(#${id})`;
