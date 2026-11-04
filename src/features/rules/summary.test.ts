import { describe, expect, it } from "vite-plus/test";
import { createRule } from "@/domain/factory";
import type { PersonExpr, RuleBlock } from "@/domain/rules";
import { makeProject } from "@/test/factories";
import {
  fillTemplate,
  makeSummaryCtx,
  summarizeBlock,
  summarizePeople,
  summarizeRule,
  summarizeSeats,
} from "./summary";

const project = makeProject("medium");
const ja = makeSummaryCtx(project, "ja");
const en = makeSummaryCtx(project, "en");

describe("expression summaries", () => {
  it("adds parentheses around multi-valued conditions", () => {
    const e: PersonExpr = {
      op: "and",
      args: [
        { op: "role", in: ["d1", "d2", "d3", "m2"] },
        { op: "lab", in: ["lab1"] },
      ],
    };
    expect(summarizePeople(ja, e)).toBe("(博士課程 (D) または M2) かつ Lab 1");
    expect(summarizePeople(en, e)).toBe("(Doctoral (D) or M2) and Lab 1");
  });

  it("summarizes quick picks and negation", () => {
    const e: PersonExpr = {
      op: "and",
      args: [
        { op: "role", in: ["d3", "d2", "d1", "wd3", "wd2", "wd1", "m2", "m1", "b4", "b3"] },
        { op: "not", arg: { op: "roleGroup", in: ["workingDoctor"] } },
      ],
    };
    expect(summarizePeople(ja, e)).toBe("学生全員 かつ 社会人ドクターでない");
    expect(summarizePeople(en, e)).toBe("All students and not Working doctoral");
    expect(summarizePeople(ja, { op: "roleGroup", in: ["doctor", "workingDoctor"] })).toBe(
      "D または 社D",
    );
  });

  it("does not add parentheses for the same junction", () => {
    const e: PersonExpr = {
      op: "or",
      args: [
        { op: "roleGroup", in: ["doctor", "workingDoctor"] },
        { op: "role", in: ["faculty"] },
      ],
    };
    expect(summarizePeople(ja, e)).toBe("D または 社D または 教員");
  });

  it("summarizes seats and deleted references", () => {
    expect(summarizeSeats(ja, { op: "all" })).toBe("すべての席");
    expect(summarizeSeats(ja, { op: "seats", seatIds: ["r1-s1"] })).toBe("Room 1 R-01");
    expect(summarizeSeats(en, { op: "rooms", roomIds: ["gone"] })).toBe("(deleted)");
    expect(summarizeSeats(ja, { op: "depth", roomIds: ["r1"], from: "back", count: 3 })).toBe(
      "Room 1の奥3席",
    );
  });
});

describe("block summaries", () => {
  it("follows the language's word order", () => {
    const b: RuleBlock = {
      type: "room.only",
      rooms: ["r1"],
      people: { op: "role", in: ["faculty"] },
    };
    expect(summarizeBlock(ja, b)).toBe("Room 1は教員のみ");
    expect(summarizeBlock(en, b)).toBe("Only Faculty in Room 1");
    const all: RuleBlock = { ...b, rooms: [] };
    expect(summarizeBlock(ja, all)).toBe("すべての部屋は教員のみ");
  });

  it("omits unset optional qualifiers", () => {
    const b: RuleBlock = {
      type: "pair.relation",
      a: { op: "members", ids: ["m1"] },
      b: { op: "members", ids: ["m2"] },
      relation: "notAdjacent",
      qualifier: { lab: "same" },
    };
    const names = [project.members[0]!.name, project.members[1]!.name];
    expect(summarizeBlock(ja, b)).toBe(`${names[0]}と${names[1]}は同じ研究室同士なら隣にしない`);
    expect(summarizeBlock(en, b)).toBe(
      `Seat ${names[0]} and ${names[1]} not next to each other if in the same lab`,
    );
  });

  it("summarizes logic blocks", () => {
    const any: RuleBlock = {
      type: "logic.any",
      children: [
        { type: "seat.empty", seats: { op: "rooms", roomIds: ["r1"] } },
        {
          type: "room.count",
          rooms: ["r2"],
          people: { op: "all" },
          op: "lte",
          value: 3,
          unit: "count",
        },
      ],
    };
    expect(summarizeBlock(ja, any)).toBe(
      "次のいずれかを満たす: (Room 1は空席にする) ／ (Room 2の全員は3 人以下)",
    );
    const ifThen: RuleBlock = { type: "logic.ifThen", condition: null, then: null };
    expect(summarizeBlock(en, ifThen)).toBe("If “(none)”, then “(none)”");
  });

  it("can prefix the strength", () => {
    const rule = createRule(
      { type: "group.labBalance", people: { op: "all" } },
      {
        strength: "soft",
        weight: 2,
      },
    );
    expect(summarizeRule(rule, project, { lng: "ja", withStrength: true })).toBe(
      "[できれば ●●○○○] 全員の各部屋の研究室構成を全体の比率に近づける",
    );
  });

  it("fills templates", () => {
    expect(fillTemplate("A <x/> B <y></y>", { x: "1", y: "2" })).toBe("A 1 B 2");
  });
});
