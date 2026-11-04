import { describe, expect, it } from "vite-plus/test";
import { createEmptyProject } from "@/domain/factory";
import { SCHEMA_VERSION } from "@/domain/schema";
import {
  FutureVersionError,
  InvalidDataError,
  migrate,
  migrations,
  parseProject,
  type MigrationMap,
} from "./migrations";

describe("migrate", () => {
  it("has a migration for every version below the current one", () => {
    for (let v = 1; v < SCHEMA_VERSION; v++) expect(migrations[v]).toBeTypeOf("function");
  });

  it("applies migrations sequentially up to the target", () => {
    const map: MigrationMap = {
      1: (d) => ({ ...d, a: 1 }),
      2: (d) => ({ ...d, b: (d.a as number) + 1 }),
    };
    const out = migrate({ schemaVersion: 1 }, { migrations: map, target: 3 });
    expect(out).toEqual({ schemaVersion: 3, a: 1, b: 2 });
    // 途中のバージョンからも開始できる
    expect(migrate({ schemaVersion: 2, a: 5 }, { migrations: map, target: 3 })).toEqual({
      schemaVersion: 3,
      a: 5,
      b: 6,
    });
  });

  it("returns current-version data unchanged", () => {
    const p = createEmptyProject();
    expect(migrate(p)).toBe(p);
  });

  it("rejects data from a future version", () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(FutureVersionError);
  });

  it("rejects missing versions and gaps", () => {
    expect(() => migrate({})).toThrow(InvalidDataError);
    expect(() => migrate([])).toThrow(InvalidDataError);
    expect(() => migrate({ schemaVersion: 1 }, { migrations: {}, target: 2 })).toThrow(
      /no migration/,
    );
  });
});

describe("parseProject", () => {
  it("accepts a valid project", () => {
    const p = createEmptyProject("x");
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it("reports which field is invalid", () => {
    const p = createEmptyProject("x") as unknown as Record<string, unknown>;
    p.members = [{ id: "m1", name: "A", gender: "male", role: "zz", tags: [] }];
    try {
      parseProject(p);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidDataError);
      expect((e as InvalidDataError).issues.join("\n")).toMatch(/^members\.0\.role: /m);
    }
  });
});
