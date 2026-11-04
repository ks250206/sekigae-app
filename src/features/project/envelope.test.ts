import { describe, expect, it } from "vite-plus/test";
import { createEmptyProject, createLab, createMember, createRule } from "@/domain/factory";
import { SCHEMA_VERSION } from "@/domain/schema";
import { makeProject } from "@/test/factories";
import { exportFilename, extractPartial, ImportError, makeEnvelope, parseImport } from "./envelope";

const roundtrip = (x: unknown) => parseImport(JSON.stringify(x));

const expectImportError = (fn: () => unknown, code: ImportError["code"]) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ImportError);
    expect((e as ImportError).code).toBe(code);
    return e as ImportError;
  }
  throw new Error("expected ImportError");
};

describe("envelope", () => {
  it("round-trips a whole project", () => {
    const p = makeProject("small");
    const env = makeEnvelope("project", p, "2026-04-01T00:00:00.000Z");
    expect(env).toMatchObject({ app: "sekigae", kind: "project", schemaVersion: SCHEMA_VERSION });
    expect(roundtrip(env)).toEqual({ kind: "project", data: p });
  });

  it("accepts a bare project without envelope", () => {
    const p = createEmptyProject("bare");
    expect(roundtrip(p)).toEqual({ kind: "project", data: p });
  });

  it("round-trips partial data", () => {
    const p = makeProject("small");
    p.rules.push(createRule({ type: "seat.pin", seatId: "s1", memberId: p.members[0]!.id }));
    for (const kind of ["layout", "members", "rules"] as const) {
      const data = extractPartial(p, kind);
      expect(roundtrip(makeEnvelope(kind, data))).toEqual({ kind, data });
    }
    const rules = extractPartial(p, "rules");
    expect(rules.refs?.members[0]).toEqual({ id: p.members[0]!.id, name: p.members[0]!.name });
  });

  it("explains failures", () => {
    expectImportError(() => parseImport("{oops"), "notJson");
    expectImportError(() => roundtrip({ hello: 1 }), "notSekigae");
    expectImportError(() => roundtrip([1, 2]), "notSekigae");
    const fut = expectImportError(
      () =>
        roundtrip({ ...makeEnvelope("layout", { rooms: [] }), schemaVersion: SCHEMA_VERSION + 1 }),
      "future",
    );
    expect(fut.version).toBe(SCHEMA_VERSION + 1);
    expectImportError(
      () => roundtrip({ app: "sekigae", kind: "nope", schemaVersion: 1 }),
      "invalid",
    );
  });

  it("points to the invalid field", () => {
    const bad = makeEnvelope("members", {
      members: [{ ...createMember({ name: "A" }), gender: "x" as never }],
      labs: [createLab({ name: "L", color: "#000" })],
    });
    const e = expectImportError(() => roundtrip(bad), "invalid");
    expect(e.issues[0]).toMatch(/^data\.members\.0\.gender: /);

    const p = createEmptyProject();
    const badProject = makeEnvelope("project", { ...p, name: 3 as never });
    expect(expectImportError(() => roundtrip(badProject), "invalid").issues[0]).toMatch(
      /^data\.name: /,
    );
  });

  it("makes safe file names", () => {
    const d = new Date(2026, 3, 9);
    expect(exportFilename("2026年度 山田研", "project", d)).toBe(
      "2026年度 山田研_2026-04-09.sekigae.json",
    );
    expect(exportFilename('a/b:c*"d', "layout", d)).toBe("a_b_c__d_layout_2026-04-09.sekigae.json");
    expect(exportFilename("  ", "rules", d)).toBe("sekigae_rules_2026-04-09.sekigae.json");
  });
});
