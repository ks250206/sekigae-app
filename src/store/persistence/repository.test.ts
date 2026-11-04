import { describe, expect, it } from "vite-plus/test";
import { createEmptyProject, createMember, createRoom } from "@/domain/factory";
import { SCHEMA_VERSION } from "@/domain/schema";
import { ProjectRepository, sortRecent } from "./repository";
import { INDEX_KEY, MemoryStorageAdapter, projectKey } from "./storage";

const setup = () => {
  const adapter = new MemoryStorageAdapter();
  return { adapter, repo: new ProjectRepository(adapter) };
};

describe("ProjectRepository", () => {
  it("saves and loads a project and keeps index metadata", () => {
    const { repo } = setup();
    const p = createEmptyProject("A");
    p.layout.rooms.push(createRoom({ name: "R" }));
    p.members.push(createMember({ name: "m" }), createMember({ name: "n" }));
    repo.save(p);
    const r = repo.load(p.id);
    expect(r.ok && r.project).toEqual(p);
    expect(repo.readIndex()).toEqual([
      { id: p.id, name: "A", updatedAt: p.updatedAt, roomCount: 1, memberCount: 2 },
    ]);
  });

  it("returns missing for unknown ids", () => {
    expect(setup().repo.load("nope")).toEqual({ ok: false, reason: "missing" });
  });

  it("detects corrupt and future data", () => {
    const { adapter, repo } = setup();
    adapter.set(projectKey("bad"), "{not json");
    adapter.set(projectKey("inv"), JSON.stringify({ schemaVersion: 1, id: "inv" }));
    adapter.set(
      projectKey("fut"),
      JSON.stringify({ ...createEmptyProject(), schemaVersion: SCHEMA_VERSION + 1 }),
    );
    expect(repo.load("bad")).toMatchObject({ ok: false, reason: "corrupt" });
    const inv = repo.load("inv");
    expect(inv.ok).toBe(false);
    if (!inv.ok && inv.reason === "corrupt")
      expect(inv.issues.some((i) => i.startsWith("name"))).toBe(true);
    expect(repo.load("fut")).toMatchObject({
      ok: false,
      reason: "future",
      version: SCHEMA_VERSION + 1,
    });
  });

  it("rebuilds a broken index from project keys", () => {
    const { adapter, repo } = setup();
    const a = createEmptyProject("A");
    const b = createEmptyProject("B");
    repo.save(a);
    repo.save(b);
    adapter.set(INDEX_KEY, "garbage");
    expect(
      repo
        .readIndex()
        .map((m) => m.name)
        .sort(),
    ).toEqual(["A", "B"]);
    // 本体が無いエントリは除き、一覧に無い本体は補う
    adapter.remove(projectKey(a.id));
    const c = createEmptyProject("C");
    adapter.set(projectKey(c.id), JSON.stringify(c));
    expect(
      repo
        .readIndex()
        .map((m) => m.name)
        .sort(),
    ).toEqual(["B", "C"]);
  });

  it("removes projects and quarantines raw data", () => {
    const { adapter, repo } = setup();
    const p = createEmptyProject("A");
    repo.save(p);
    const key = repo.quarantine(p.id, "raw", new Date("2026-01-02T03:04:05.006Z"));
    expect(key).toBe(`sekigae:v1:corrupt:${p.id}:2026-01-02T03-04-05-006Z`);
    expect(adapter.get(key)).toBe("raw");
    repo.remove(p.id);
    expect(repo.has(p.id)).toBe(false);
    expect(repo.readIndex()).toEqual([]);
  });

  it("sorts by most recently opened or updated", () => {
    const list = sortRecent([
      { id: "a", name: "a", updatedAt: "2026-01-01", roomCount: 0, memberCount: 0 },
      { id: "b", name: "b", updatedAt: "2026-01-03", roomCount: 0, memberCount: 0 },
      {
        id: "c",
        name: "c",
        updatedAt: "2025-01-01",
        openedAt: "2026-01-05",
        roomCount: 0,
        memberCount: 0,
      },
    ]);
    expect(list.map((m) => m.id)).toEqual(["c", "b", "a"]);
  });
});
