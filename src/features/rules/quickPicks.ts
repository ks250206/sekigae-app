/** 人集合のクイック指定（#89）。ラベルは rules:quickPicks.<key> */
import { ROLE_QUICK_PICKS } from "@/domain/roles";
import type { PersonExpr } from "@/domain/rules";

export const QUICK_PICKS: readonly { key: string; expr: PersonExpr }[] = [
  { key: "students", expr: { op: "role", in: [...ROLE_QUICK_PICKS.students] } },
  { key: "doctor", expr: { op: "roleGroup", in: ["doctor"] } },
  { key: "workingDoctor", expr: { op: "roleGroup", in: ["workingDoctor"] } },
  { key: "anyDoctor", expr: { op: "roleGroup", in: ["doctor", "workingDoctor"] } },
  { key: "master", expr: { op: "roleGroup", in: ["master"] } },
  { key: "bachelor", expr: { op: "roleGroup", in: ["bachelor"] } },
  { key: "staff", expr: { op: "roleGroup", in: ["staff"] } },
  { key: "postdoc", expr: { op: "roleGroup", in: ["postdoc"] } },
  { key: "all", expr: { op: "all" } },
];
