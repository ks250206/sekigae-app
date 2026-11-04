/**
 * ルールテンプレート（よく使うルール）。docs/DESIGN.md §4.5 / issue #156
 * 追加されたルールは origin: 'template'。
 */
import { ROLE_QUICK_PICKS } from "@/domain/roles";
import type { RuleBlock, Strength, Weight } from "@/domain/rules";

export interface RuleTemplate {
  id: string;
  /** i18n: rules:templates.<id>.name / .description */
  i18nKey: string;
  strength: Strength;
  weight: Weight;
  create: () => RuleBlock;
  /** 追加後に自動で開くスロット（未指定なら最初の未設定スロット） */
  openSlot?: string;
}

const students = () => ({ op: "role" as const, in: [...ROLE_QUICK_PICKS.students] });

export const RULE_TEMPLATES: readonly RuleTemplate[] = [
  {
    id: "wdKeepSeat",
    i18nKey: "templates.wdKeepSeat",
    strength: "hard",
    weight: 3,
    create: () => ({
      type: "prev.same",
      people: { op: "roleGroup", in: ["workingDoctor"] },
      scope: "seat",
    }),
  },
  {
    id: "mixLabs3",
    i18nKey: "templates.mixLabs3",
    strength: "soft",
    weight: 3,
    create: () => ({ type: "room.diversity", rooms: [], attr: "lab", min: 3 }),
  },
  {
    id: "labCapHalf",
    i18nKey: "templates.labCapHalf",
    strength: "soft",
    weight: 3,
    create: () => ({ type: "room.attrCap", rooms: [], attr: "lab", max: 50, unit: "percent" }),
  },
  {
    id: "noSameLabSameGradeAdjacent",
    i18nKey: "templates.noSameLabSameGradeAdjacent",
    strength: "soft",
    weight: 3,
    create: () => ({
      type: "pair.relation",
      a: students(),
      b: students(),
      relation: "notAdjacent",
      qualifier: { lab: "same", role: "same" },
    }),
  },
  {
    id: "buddySenior",
    i18nKey: "templates.buddySenior",
    strength: "soft",
    weight: 3,
    create: () => ({
      type: "group.buddy",
      a: { op: "role", in: ["m1", "b4"] },
      b: {
        op: "or",
        args: [
          { op: "roleGroup", in: ["doctor", "workingDoctor"] },
          { op: "role", in: ["faculty"] },
        ],
      },
      scope: "sameRoom",
      min: 1,
    }),
  },
  {
    id: "mixAdjacentLab",
    i18nKey: "templates.mixAdjacentLab",
    strength: "soft",
    weight: 3,
    create: () => ({ type: "group.mixAdjacent", people: { op: "all" }, attr: "lab" }),
  },
  {
    id: "facultyRoom",
    i18nKey: "templates.facultyRoom",
    strength: "hard",
    weight: 3,
    create: () => ({ type: "room.only", rooms: [], people: { op: "role", in: ["faculty"] } }),
    openSlot: "rooms",
  },
  {
    id: "prevDifferentRoom",
    i18nKey: "templates.prevDifferentRoom",
    strength: "soft",
    weight: 3,
    create: () => ({
      type: "prev.different",
      people: {
        op: "and",
        args: [students(), { op: "not", arg: { op: "roleGroup", in: ["workingDoctor"] } }],
      },
      scope: "room",
    }),
  },
];

export const templateById = (id: string) => RULE_TEMPLATES.find((t) => t.id === id);
