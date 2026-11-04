/** 役職・学年マスタ（固定）。docs/DESIGN.md §3.1 */

export const ROLE_KEYS = [
  "faculty",
  "technician",
  "support",
  "pd",
  "d3",
  "d2",
  "d1",
  "wd3",
  "wd2",
  "wd1",
  "m2",
  "m1",
  "b4",
  "b3",
  "other",
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_GROUPS = [
  "staff",
  "postdoc",
  "doctor",
  "workingDoctor",
  "master",
  "bachelor",
  "other",
] as const;
export type RoleGroup = (typeof ROLE_GROUPS)[number];

export interface RoleDef {
  key: RoleKey;
  /** シニア度。大きいほど上級（「奥ほど上級生」等で使用）。other は 0 */
  rank: number;
  group: RoleGroup;
  /** 進級先。null = 変化なし、"graduate" = 卒業候補 */
  next: RoleKey | "graduate" | null;
  /** 学生か（スタッフ・PD・その他は false） */
  student: boolean;
}

export const ROLES: Record<RoleKey, RoleDef> = {
  faculty: { key: "faculty", rank: 100, group: "staff", next: null, student: false },
  technician: { key: "technician", rank: 90, group: "staff", next: null, student: false },
  support: { key: "support", rank: 85, group: "staff", next: null, student: false },
  pd: { key: "pd", rank: 80, group: "postdoc", next: null, student: false },
  d3: { key: "d3", rank: 70, group: "doctor", next: "graduate", student: true },
  d2: { key: "d2", rank: 65, group: "doctor", next: "d3", student: true },
  d1: { key: "d1", rank: 60, group: "doctor", next: "d2", student: true },
  // 社会人ドクター: 一般の D とは別枠・別トラック
  wd3: { key: "wd3", rank: 70, group: "workingDoctor", next: "graduate", student: true },
  wd2: { key: "wd2", rank: 65, group: "workingDoctor", next: "wd3", student: true },
  wd1: { key: "wd1", rank: 60, group: "workingDoctor", next: "wd2", student: true },
  m2: { key: "m2", rank: 50, group: "master", next: "d1", student: true },
  m1: { key: "m1", rank: 45, group: "master", next: "m2", student: true },
  b4: { key: "b4", rank: 30, group: "bachelor", next: "m1", student: true },
  b3: { key: "b3", rank: 25, group: "bachelor", next: "b4", student: true },
  other: { key: "other", rank: 0, group: "other", next: null, student: false },
};

/** 表示順（シニア → ジュニア） */
export const ROLE_ORDER: readonly RoleKey[] = ROLE_KEYS;

export const roleRank = (r: RoleKey): number => ROLES[r].rank;
export const roleGroupOf = (r: RoleKey): RoleGroup => ROLES[r].group;
export const isStudent = (r: RoleKey): boolean => ROLES[r].student;

/** シニア順に並べるための比較関数（降順） */
export function compareRole(a: RoleKey, b: RoleKey): number {
  return ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b);
}

export function rolesInGroup(g: RoleGroup): RoleKey[] {
  return ROLE_KEYS.filter((r) => ROLES[r].group === g);
}

/**
 * 終端学年で「進学しない」場合の扱い。
 * M2 → D1 / B4 → M1 は進学の有無をウィザードで選ぶため、ここでは進学する前提の next を返す。
 */
export function nextRole(r: RoleKey): RoleKey | "graduate" | null {
  return ROLES[r].next;
}

/** 進学しない場合に卒業候補となる学年 */
export const GRADUATION_POINTS: readonly RoleKey[] = ["b4", "m2", "d3", "wd3"];

/** UI のクイック指定（人集合スロット） */
export const ROLE_QUICK_PICKS = {
  students: ROLE_KEYS.filter((r) => ROLES[r].student),
  doctor: rolesInGroup("doctor"),
  workingDoctor: rolesInGroup("workingDoctor"),
  anyDoctor: [...rolesInGroup("doctor"), ...rolesInGroup("workingDoctor")],
  master: rolesInGroup("master"),
  bachelor: rolesInGroup("bachelor"),
  staff: rolesInGroup("staff"),
  postdoc: rolesInGroup("postdoc"),
} as const satisfies Record<string, RoleKey[]>;
