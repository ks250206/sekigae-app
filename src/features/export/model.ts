/**
 * 出力用の共通データモデル（XLSX / PPTX / プレビューで共用）。docs/DESIGN.md §7.6, issue #130
 *
 * - 描画ライブラリ非依存の純データ。色はライト配色固定の HEX。
 * - 文字列は出力言語の固定 t（UI 言語と独立）で解決済み。
 */
import { GENDERS, type Gender } from "@/domain/genders";
import { compareRole, ROLE_ORDER, type RoleKey } from "@/domain/roles";
import type { CellKind, Facing, ID, Member, Project, Room, SeatPlan } from "@/domain/schema";
import { GENDER_COLORS, readableText, ROLE_COLORS } from "@/graphics/palette";
import type { ParseKeys } from "i18next";
import { createFixedT, type Language } from "@/i18n";
import { collator, compareNames, formatDate } from "@/lib/format";
import { labIndex, memberIndex, seatIndex } from "@/store/selectors";

export type ExportFormat = "xlsx" | "pptx" | "png";
export type ColorBy = "role" | "lab" | "gender" | "none";
/** 含める項目（氏名・部屋・席は常に含む） */
export type ExportColumn = "role" | "lab" | "gender" | "previous" | "note";
export const EXPORT_COLUMNS: readonly ExportColumn[] = [
  "role",
  "lab",
  "gender",
  "previous",
  "note",
];
export const COLOR_BY_MODES: readonly ColorBy[] = ["role", "lab", "gender", "none"];

export interface ExportOptions {
  /** 既定: final の案、なければアクティブな案 */
  planId?: ID;
  /** 既定: 非表示でない全部屋。レイアウト順で出力 */
  roomIds?: ID[];
  lang: Language;
  columns: readonly ExportColumn[];
  colorBy: ColorBy;
  /** XLSX: 全部屋を 1 枚のフロアシートにも配置 */
  floorSheet?: boolean;
  /** PPTX: 部屋ごとの構成表スライドを追加 */
  compositionTable?: boolean;
  /** 作成日（テスト用に固定可能）。既定は現在時刻 */
  date?: Date;
}

/** 名簿列。import テンプレートと同じ見出し名にする */
export type RosterKey =
  | "name"
  | "kana"
  | "lab"
  | "gender"
  | "role"
  | "room"
  | "seat"
  | "prevRoom"
  | "prevSeat"
  | "change"
  | "note";

export type ChangeKind = "same" | "sameRoom" | "moved" | "new";

export interface ExportPerson {
  id: ID;
  name: string;
  kana: string;
  roleKey: RoleKey;
  /** 出力言語の短い役職名（M2, 社D3 …） */
  role: string;
  lab: string;
  labShort: string;
  gender: string;
  note: string;
  room: string;
  seat: string;
  prevRoom: string;
  prevSeat: string;
  change?: ChangeKind;
  changeLabel: string;
  /** 色分け基準による塗り色・文字色 */
  fill: string;
  text: string;
  /** 席上に表示する 2 行目（役職 / 研究室。含める項目による） */
  subtitle: string;
  /** フロア全体図用の略称 */
  short: string;
}

export interface ExportSeat {
  id: ID;
  x: number;
  y: number;
  facing: Facing;
  label: string;
  member?: ExportPerson;
  fill: string;
  text: string;
}

export interface ExportEntrance {
  id: ID;
  x: number;
  y: number;
  side: Facing;
}

export interface ExportCell {
  x: number;
  y: number;
  kind: CellKind;
  seatId?: ID;
  /** このセルの入口辺 */
  entranceSides: Facing[];
  /** 外壁となる辺（隣が部屋外 or void） */
  walls: Facing[];
}

export interface RoleCount {
  role: RoleKey;
  label: string;
  count: number;
}

export interface ExportRoom {
  id: ID;
  key: ID;
  name: string;
  color: string;
  note: string;
  width: number;
  height: number;
  /** フロア座標（セル単位、フロア全体の左上を 0,0 に正規化） */
  floorX: number;
  floorY: number;
  /** row-major。cells[y * width + x] */
  cells: ExportCell[];
  seats: ExportSeat[];
  entrances: ExportEntrance[];
  /** 役職順 → 席ラベル順 */
  members: ExportPerson[];
  seatCount: number;
  roleBreakdown: RoleCount[];
  summary: string;
}

export interface LegendItem {
  label: string;
  fill: string;
  text: string;
}

export interface ExportStrings {
  seatSheet: string;
  floorSheet: string;
  rosterSheet: string;
  byRoomSheet: string;
  unassignedSheet: string;
  entrance: string;
  legend: string;
  emptySeat: string;
  breakdown: string;
  members: string;
  seats: string;
  plan: string;
  createdOn: string;
  coverSubtitle: string;
  coverMembers: string;
  coverAssigned: string;
  coverUnassigned: string;
  coverRooms: string;
  coverSeats: string;
  overview: string;
  composition: string;
  total: string;
  unassignedTitle: string;
  none: string;
  /** 名簿見出し */
  headers: Record<RosterKey, string>;
  /** 役職の短い名前 */
  roles: Record<RoleKey, string>;
}

export interface ExportModel {
  lang: Language;
  projectName: string;
  planId: ID;
  planName: string;
  dateISO: string;
  dateLabel: string;
  colorBy: ColorBy;
  columns: readonly ExportColumn[];
  options: { floorSheet: boolean; compositionTable: boolean };
  hasPrevious: boolean;
  strings: ExportStrings;
  rooms: ExportRoom[];
  /** 選択部屋全体のバウンディングボックス（セル単位） */
  floor: { width: number; height: number };
  rosterColumns: { key: RosterKey; header: string }[];
  /** 選択部屋に座っている人 + 未配置者。役職順 → 名前順 */
  roster: ExportPerson[];
  unassigned: ExportPerson[];
  legend: LegendItem[];
  /** 役職の構成（全選択部屋）。列は存在する役職のみ */
  compositionRoles: RoleKey[];
  totals: {
    members: number;
    assigned: number;
    unassigned: number;
    seats: number;
    rooms: number;
  };
}

export const EMPTY_SEAT_FILL = "#ffffff";
export const NO_COLOR_FILL = "#f1f5f9";
export const NO_LAB_COLOR = "#94a3b8";
export const VOID_FILL = "#d9d9d9";
export const OBSTACLE_FILL = "#9ca3af";
export const FLOOR_FILL = "#f8fafc";
export const WALL_COLOR = "#334155";
export const ENTRANCE_COLOR = "#ea580c";

const SIDES: Facing[] = ["n", "e", "s", "w"];
const DELTA: Record<Facing, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

type OutputKey = `export:${ParseKeys<"export">}` | `common:${ParseKeys<"common">}`;
/** 出力言語に固定した t（名前空間付きキー）。UI 言語とは独立 */
export function outputT(
  lang: Language,
): (key: OutputKey, opts?: Record<string, unknown>) => string {
  return createFixedT(lang) as unknown as (key: string, opts?: Record<string, unknown>) => string;
}

/** 既定の出力対象案: 確定案 → アクティブ案 */
export function defaultPlan(p: Project): SeatPlan | undefined {
  return (
    p.plans.find((x) => x.final) ??
    p.plans.find((x) => x.id === p.activePlanId) ??
    p.plans.find((x) => x.kind === "current") ??
    p.plans[0]
  );
}

/** YYYY-MM-DD（ローカル日付） */
export function isoDate(d: Date): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** 既定ファイル名（拡張子なし）: `<project>_座席表_<YYYY-MM-DD>` / `<project>_seating_<date>` */
export function defaultFilename(projectName: string, lang: Language, date = new Date()): string {
  const t = outputT(lang);
  return sanitizeFilename(`${projectName}_${t("export:output.filenameStem")}_${isoDate(date)}`);
}

/** ファイル名に使えない文字を除く */
export function sanitizeFilename(name: string): string {
  // oxlint-disable-next-line no-control-regex
  const s = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return s || "sekigae";
}

/** フロア全体図用の略称。ja: 姓、en: 頭文字 + 姓 */
export function abbreviateName(name: string, lang: Language): string {
  const parts = name
    .trim()
    .split(/[\s　]+/u)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (lang === "ja" || /[぀-ヿ㐀-鿿]/u.test(name)) {
    const first = parts[0]!;
    return parts.length > 1 ? first.slice(0, 4) : first.slice(0, 3);
  }
  if (parts.length === 1) return parts[0]!.slice(0, 8);
  return `${parts[0]!.charAt(0)}. ${parts[parts.length - 1]!}`.slice(0, 10);
}

function labelsFor(lang: Language): ExportStrings {
  const t = outputT(lang);
  const roles = Object.fromEntries(ROLE_ORDER.map((r) => [r, t(`common:roles.${r}`)])) as Record<
    RoleKey,
    string
  >;
  const h = (k: RosterKey) => t(`export:output.headers.${k}`);
  return {
    seatSheet: t("export:output.seatSheet"),
    floorSheet: t("export:output.floorSheet"),
    rosterSheet: t("export:output.rosterSheet"),
    byRoomSheet: t("export:output.byRoomSheet"),
    unassignedSheet: t("export:output.unassignedSheet"),
    entrance: t("export:output.entrance"),
    legend: t("export:output.legend"),
    emptySeat: t("export:output.emptySeat"),
    breakdown: t("export:output.breakdown"),
    members: t("export:output.members"),
    seats: t("export:output.seats"),
    plan: "",
    createdOn: "",
    coverSubtitle: t("export:output.cover.subtitle"),
    coverMembers: t("export:output.cover.members"),
    coverAssigned: t("export:output.cover.assigned"),
    coverUnassigned: t("export:output.cover.unassigned"),
    coverRooms: t("export:output.cover.rooms"),
    coverSeats: t("export:output.cover.seats"),
    overview: t("export:output.overview"),
    composition: t("export:output.composition"),
    total: t("export:output.total"),
    unassignedTitle: t("export:output.unassignedTitle"),
    none: t("export:output.none"),
    headers: {
      name: h("name"),
      kana: h("kana"),
      lab: h("lab"),
      gender: h("gender"),
      role: h("role"),
      room: h("room"),
      seat: h("seat"),
      prevRoom: h("prevRoom"),
      prevSeat: h("prevSeat"),
      change: h("change"),
      note: h("note"),
    },
    roles,
  };
}

export function buildExportModel(project: Project, options: ExportOptions): ExportModel {
  const { lang, colorBy } = options;
  const columns = EXPORT_COLUMNS.filter((c) => options.columns.includes(c));
  const has = (c: ExportColumn) => columns.includes(c);
  const t = outputT(lang);
  const strings = labelsFor(lang);
  const date = options.date ?? new Date();
  const dateLabel = formatDate(date, lang);

  const plan =
    (options.planId && project.plans.find((p) => p.id === options.planId)) || defaultPlan(project);
  const assignment = plan?.assignment ?? {};
  const prevPlan =
    project.previousPlanId && project.previousPlanId !== plan?.id
      ? project.plans.find((p) => p.id === project.previousPlanId)
      : undefined;

  strings.plan = t("export:output.plan", { name: plan?.name ?? "" });
  strings.createdOn = t("export:output.createdOn", { date: dateLabel });

  const allRooms = project.layout.rooms;
  const wanted = options.roomIds ? new Set(options.roomIds) : undefined;
  const rooms = allRooms.filter((r) => (wanted ? wanted.has(r.id) : !r.hidden));

  const sIdx = seatIndex(allRooms);
  const mIdx = memberIndex(project.members);
  const lIdx = labIndex(project.labs);
  const roomByKey = new Map(allRooms.map((r) => [r.key, r]));

  // メンバー → 現在の席 / 昨年度の席
  const current = new Map<ID, { room: Room; seatLabel: string; seatId: ID }>();
  for (const [sid, mid] of Object.entries(assignment)) {
    const ref = sIdx.get(sid);
    if (ref && mIdx.has(mid))
      current.set(mid, { room: ref.room, seatLabel: ref.seat.label, seatId: sid });
  }
  const previous = new Map<ID, { roomKey: ID; roomName: string; seatLabel: string; seatId?: ID }>();
  if (prevPlan) {
    for (const [mid, key] of Object.entries(prevPlan.roomOnly)) {
      const r = roomByKey.get(key);
      previous.set(mid, { roomKey: key, roomName: r?.name ?? "", seatLabel: "" });
    }
    for (const [sid, mid] of Object.entries(prevPlan.assignment)) {
      const ref = sIdx.get(sid);
      if (ref)
        previous.set(mid, {
          roomKey: ref.room.key,
          roomName: ref.room.name,
          seatLabel: ref.seat.label,
          seatId: sid,
        });
    }
  }

  const fillOf = (m: Member | undefined): string => {
    if (!m) return EMPTY_SEAT_FILL;
    switch (colorBy) {
      case "role":
        return ROLE_COLORS[m.role].light;
      case "lab":
        return (m.labId && lIdx.get(m.labId)?.color) || NO_LAB_COLOR;
      case "gender":
        return GENDER_COLORS[m.gender].light;
      default:
        return NO_COLOR_FILL;
    }
  };

  const person = (m: Member): ExportPerson => {
    const lab = m.labId ? lIdx.get(m.labId) : undefined;
    const cur = current.get(m.id);
    const prev = previous.get(m.id);
    let change: ChangeKind | undefined;
    if (prevPlan && cur) {
      if (!prev) change = "new";
      else if (prev.seatId && prev.seatId === cur.seatId) change = "same";
      else if (prev.roomKey === cur.room.key) change = "sameRoom";
      else change = "moved";
    }
    const role = strings.roles[m.role];
    const sub: string[] = [];
    if (has("role")) sub.push(role);
    if (has("lab") && lab) sub.push(lab.shortName);
    const fill = fillOf(m);
    return {
      id: m.id,
      name: m.name,
      kana: m.kana ?? "",
      roleKey: m.role,
      role,
      lab: lab?.name ?? "",
      labShort: lab?.shortName ?? "",
      gender: t(`common:genders.${m.gender}`),
      note: m.note ?? "",
      room: cur?.room.name ?? "",
      seat: cur?.seatLabel ?? "",
      prevRoom: prev?.roomName ?? "",
      prevSeat: prev?.seatLabel ?? "",
      change,
      changeLabel: change ? t(`export:output.change.${change}`) : "",
      fill,
      text: readableText(fill),
      subtitle: sub.join(" · "),
      short: abbreviateName(m.name, lang),
    };
  };

  const byName = (a: ExportPerson, b: ExportPerson) =>
    compareRole(a.roleKey, b.roleKey) || compareNames(a, b, lang);

  // 部屋
  const minX = rooms.length ? Math.min(...rooms.map((r) => r.position.x)) : 0;
  const minY = rooms.length ? Math.min(...rooms.map((r) => r.position.y)) : 0;
  const maxX = rooms.length ? Math.max(...rooms.map((r) => r.position.x + r.width)) : 0;
  const maxY = rooms.length ? Math.max(...rooms.map((r) => r.position.y + r.height)) : 0;

  const exportRooms: ExportRoom[] = rooms.map((room) => {
    const kindAt = (x: number, y: number): CellKind =>
      x < 0 || y < 0 || x >= room.width || y >= room.height
        ? "void"
        : (room.cells[y * room.width + x] ?? "void");
    const seatByPos = new Map(room.seats.map((s) => [`${s.x},${s.y}`, s.id]));
    const cells: ExportCell[] = [];
    for (let y = 0; y < room.height; y++)
      for (let x = 0; x < room.width; x++) {
        const kind = kindAt(x, y);
        const walls =
          kind === "void"
            ? []
            : SIDES.filter((s) => kindAt(x + DELTA[s][0], y + DELTA[s][1]) === "void");
        cells.push({
          x,
          y,
          kind,
          seatId: seatByPos.get(`${x},${y}`),
          entranceSides: room.entrances.filter((e) => e.x === x && e.y === y).map((e) => e.side),
          walls,
        });
      }
    const seats: ExportSeat[] = room.seats.map((s) => {
      const mid = assignment[s.id];
      const m = mid ? mIdx.get(mid) : undefined;
      const p = m ? person(m) : undefined;
      return {
        id: s.id,
        x: s.x,
        y: s.y,
        facing: s.facing,
        label: s.label,
        member: p,
        fill: p?.fill ?? EMPTY_SEAT_FILL,
        text: p?.text ?? "#64748b",
      };
    });
    const members = seats
      .flatMap((s) => (s.member ? [s.member] : []))
      .sort((a, b) => compareRole(a.roleKey, b.roleKey) || collator(lang).compare(a.seat, b.seat));
    const counts = new Map<RoleKey, number>();
    for (const m of members) counts.set(m.roleKey, (counts.get(m.roleKey) ?? 0) + 1);
    return {
      id: room.id,
      key: room.key,
      name: room.name,
      color: room.color,
      note: room.note ?? "",
      width: room.width,
      height: room.height,
      floorX: room.position.x - minX,
      floorY: room.position.y - minY,
      cells,
      seats,
      entrances: room.entrances.map((e) => ({ id: e.id, x: e.x, y: e.y, side: e.side })),
      members,
      seatCount: room.seats.length,
      roleBreakdown: ROLE_ORDER.filter((r) => counts.has(r)).map((r) => ({
        role: r,
        label: strings.roles[r],
        count: counts.get(r)!,
      })),
      summary: t("export:output.roomSummary", {
        members: members.length,
        seats: room.seats.length,
      }),
    };
  });

  // 名簿・未配置
  const seatedHere = exportRooms.flatMap((r) => r.members);
  const unassigned = project.members
    .filter((m) => !current.has(m.id))
    .map(person)
    .sort(byName);
  const roster = [...seatedHere, ...unassigned].sort(byName);

  const rosterKeys: RosterKey[] = [
    "name",
    "kana",
    ...(has("lab") ? (["lab"] as const) : []),
    ...(has("gender") ? (["gender"] as const) : []),
    ...(has("role") ? (["role"] as const) : []),
    "room",
    "seat",
    ...(has("previous") ? (["prevRoom", "prevSeat", "change"] as const) : []),
    ...(has("note") ? (["note"] as const) : []),
  ];

  // 凡例（選択部屋に実際に現れる値のみ）
  const legend: LegendItem[] = [];
  const shown = seatedHere;
  const item = (label: string, fill: string): LegendItem => ({
    label,
    fill,
    text: readableText(fill),
  });
  if (colorBy === "role") {
    const set = new Set(shown.map((p) => p.roleKey));
    for (const r of ROLE_ORDER)
      if (set.has(r)) legend.push(item(strings.roles[r], ROLE_COLORS[r].light));
  } else if (colorBy === "lab") {
    const ids = new Set(shown.map((p) => mIdx.get(p.id)?.labId));
    for (const lab of project.labs) if (ids.has(lab.id)) legend.push(item(lab.name, lab.color));
    if (ids.has(undefined)) legend.push(item(t("export:output.noLab"), NO_LAB_COLOR));
  } else if (colorBy === "gender") {
    const set = new Set<Gender>(shown.map((p) => mIdx.get(p.id)!.gender));
    for (const g of GENDERS)
      if (set.has(g)) legend.push(item(t(`common:genders.${g}`), GENDER_COLORS[g].light));
  }

  const compRoles = new Set(seatedHere.map((p) => p.roleKey));

  return {
    lang,
    projectName: project.name,
    planId: plan?.id ?? "",
    planName: plan?.name ?? "",
    dateISO: isoDate(date),
    dateLabel,
    colorBy,
    columns,
    options: {
      floorSheet: !!options.floorSheet,
      compositionTable: !!options.compositionTable,
    },
    hasPrevious: !!prevPlan,
    strings,
    rooms: exportRooms,
    floor: { width: maxX - minX, height: maxY - minY },
    rosterColumns: rosterKeys.map((key) => ({ key, header: strings.headers[key] })),
    roster,
    unassigned,
    legend,
    compositionRoles: ROLE_ORDER.filter((r) => compRoles.has(r)),
    totals: {
      members: project.members.length,
      assigned: current.size,
      unassigned: unassigned.length,
      seats: exportRooms.reduce((n, r) => n + r.seatCount, 0),
      rooms: exportRooms.length,
    },
  };
}

/** 名簿セルの値 */
export function rosterValue(p: ExportPerson, key: RosterKey): string {
  switch (key) {
    case "change":
      return p.changeLabel;
    default:
      return p[key];
  }
}

/** 部屋の外壁（隣が部屋外/void の辺）を連結した線分。座標はセル境界（部屋ローカル） */
export function wallSegments(
  room: ExportRoom,
): { x1: number; y1: number; x2: number; y2: number }[] {
  const h = new Map<number, number[]>(); // y → 水平辺の x 開始位置
  const v = new Map<number, number[]>(); // x → 垂直辺の y 開始位置
  const push = (m: Map<number, number[]>, k: number, s: number) => {
    const a = m.get(k);
    if (a) a.push(s);
    else m.set(k, [s]);
  };
  for (const c of room.cells)
    for (const w of c.walls) {
      if (w === "n") push(h, c.y, c.x);
      else if (w === "s") push(h, c.y + 1, c.x);
      else if (w === "w") push(v, c.x, c.y);
      else push(v, c.x + 1, c.y);
    }
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const merge = (m: Map<number, number[]>, horiz: boolean) => {
    for (const [k, starts] of [...m].sort((a, b) => a[0] - b[0])) {
      const s = [...new Set(starts)].sort((a, b) => a - b);
      let i = 0;
      while (i < s.length) {
        const a = s[i]!;
        let b = a + 1;
        while (i + 1 < s.length && s[i + 1] === b) {
          i++;
          b++;
        }
        out.push(horiz ? { x1: a, y1: k, x2: b, y2: k } : { x1: k, y1: a, x2: k, y2: b });
        i++;
      }
    }
  };
  merge(h, true);
  merge(v, false);
  return out;
}

/** 指定種別のセルを行ごとに連結した矩形（図形数を減らすため） */
export function cellRuns(
  room: ExportRoom,
  pred: (c: ExportCell) => boolean,
): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = 0; y < room.height; y++) {
    let x = 0;
    while (x < room.width) {
      const c = room.cells[y * room.width + x]!;
      if (!pred(c)) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < room.width && pred(room.cells[y * room.width + x]!)) x++;
      out.push({ x: x0, y, w: x - x0, h: 1 });
    }
  }
  return out;
}
