import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createEmptyProject } from "@/domain/factory";
import { SCHEMA_VERSION } from "@/domain/schema";
import { usePrefs } from "../prefs";
import { history, useProjectStore } from "../project";
import {
  createProject,
  deleteProject,
  duplicateProject,
  flush,
  handleStorageEvent,
  importProject,
  initPersistence,
  loadProject,
  overwriteWithThisTab,
  recoveryDiscard,
  recoveryStartEmpty,
  reloadFromStorage,
  renameProjectById,
  retrySave,
  switchProject,
  usePersistence,
} from "./index";
import { ProjectRepository } from "./repository";
import {
  MemoryStorageAdapter,
  projectKey,
  WebStorageAdapter,
  type StorageAdapter,
} from "./storage";

const store = () => useProjectStore.getState();
const ps = () => usePersistence.getState();
let dispose: (() => void) | null = null;

const boot = (adapter: StorageAdapter = new MemoryStorageAdapter()) => {
  dispose = initPersistence({ adapter, listen: false });
  return adapter;
};

beforeEach(() => {
  vi.useFakeTimers();
  usePrefs.getState().setLastProjectId(null);
  store().replaceProject(createEmptyProject("before-init"));
});

afterEach(() => {
  dispose?.();
  dispose = null;
  vi.useRealTimers();
});

describe("persistence runtime", () => {
  it("creates and saves an empty project on first boot", () => {
    const adapter = boot();
    const id = store().project.id;
    expect(store().project.name).not.toBe("before-init");
    expect(adapter.get(projectKey(id))).not.toBeNull();
    expect(usePrefs.getState().lastProjectId).toBe(id);
    expect(ps().projects).toHaveLength(1);
  });

  it("autosaves after the debounce and restores on next boot", () => {
    const adapter = boot();
    store().renameProject("Edited");
    expect(ps().status).toBe("pending");
    vi.advanceTimersByTime(499);
    expect(new ProjectRepository(adapter).load(store().project.id)).toMatchObject({
      ok: true,
      project: { name: expect.not.stringMatching("Edited") },
    });
    vi.advanceTimersByTime(1);
    expect(ps().status).toBe("saved");
    const id = store().project.id;

    dispose?.();
    store().replaceProject(createEmptyProject("other"));
    boot(adapter);
    expect(store().project.id).toBe(id);
    expect(store().project.name).toBe("Edited");
  });

  it("flushes pending changes immediately", () => {
    const adapter = boot();
    store().renameProject("Now");
    flush();
    const raw = adapter.get(projectKey(store().project.id))!;
    expect(JSON.parse(raw).name).toBe("Now");
  });

  it("keeps projects separate when switching and clears undo history", () => {
    boot();
    const a = store().project.id;
    store().addMembers([{ name: "Alice" }]);
    const b = createProject("B")!;
    expect(store().project.id).toBe(b);
    expect(store().project.members).toHaveLength(0);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
    store().addMembers([{ name: "Bob" }]);
    switchProject(a);
    expect(store().project.members.map((m) => m.name)).toEqual(["Alice"]);
    switchProject(b);
    expect(store().project.members.map((m) => m.name)).toEqual(["Bob"]);
    history.undo();
    expect(store().project.id).toBe(b);
  });

  it("renames, duplicates and deletes projects", () => {
    boot();
    const a = store().project.id;
    store().addMembers([{ name: "Alice" }]);
    const copy = duplicateProject(a)!;
    expect(loadProject(copy)?.members).toHaveLength(1);
    expect(store().project.id).toBe(a);
    renameProjectById(copy, "Copy!");
    expect(loadProject(copy)?.name).toBe("Copy!");
    expect(ps().projects.map((m) => m.name)).toContain("Copy!");
    deleteProject(a);
    expect(store().project.id).toBe(copy);
    deleteProject(copy);
    // 最後のプロジェクトを消したら空プロジェクトを作る
    expect(ps().projects).toHaveLength(1);
    expect(store().project.members).toHaveLength(0);
  });

  it("imports as new or overwrites an existing project", () => {
    boot();
    const original = store().project;
    const incoming = { ...structuredClone(original), name: "Imported" };
    const newId = importProject(incoming, "new")!;
    expect(newId).not.toBe(original.id);
    expect(ps().projects).toHaveLength(2);
    importProject({ ...incoming, name: "Overwritten" }, "overwrite");
    expect(loadProject(original.id)?.name).toBe("Overwritten");
    expect(store().project.id).toBe(original.id);
  });

  it("drops the untouched auto-created project when another project is loaded externally", () => {
    const adapter = boot();
    const auto = store().project.id;
    const sample = createEmptyProject("Sample");
    store().replaceProject(sample);
    expect(adapter.get(projectKey(auto))).toBeNull();
    vi.advanceTimersByTime(500);
    expect(adapter.get(projectKey(sample.id))).not.toBeNull();
    expect(usePrefs.getState().lastProjectId).toBe(sample.id);
  });

  it("reports quota errors and retries", () => {
    const adapter = new MemoryStorageAdapter(4000);
    boot(adapter);
    store().addMembers(Array.from({ length: 50 }, (_, i) => ({ name: `Member ${i}` })));
    vi.advanceTimersByTime(500);
    expect(ps().status).toBe("error");
    expect(ps().error?.kind).toBe("quota");
    // データはメモリに残っている
    expect(store().project.members).toHaveLength(50);
    store().removeMembers(
      store()
        .project.members.slice(1)
        .map((m) => m.id),
    );
    vi.advanceTimersByTime(500);
    expect(ps().status).toBe("saved");
    expect(retrySave()).toBe(true);
  });

  it("quarantines corrupt data at boot and blocks autosave until resolved", () => {
    const adapter = new MemoryStorageAdapter();
    adapter.set(projectKey("broken"), '{"schemaVersion":1,"id":"broken"');
    usePrefs.getState().setLastProjectId("broken");
    boot(adapter);
    const rec = ps().recovery!;
    expect(rec.reason).toBe("corrupt");
    expect(rec.atBoot).toBe(true);
    expect(adapter.get(rec.backupKey!)).toBe('{"schemaVersion":1,"id":"broken"');
    // 自動保存は止まっている
    store().renameProject("tmp");
    vi.advanceTimersByTime(500);
    expect(adapter.get(projectKey(store().project.id))).toBeNull();

    recoveryStartEmpty();
    expect(ps().recovery).toBeNull();
    expect(adapter.get(projectKey("broken"))).toBeNull();
    expect(adapter.get(rec.backupKey!)).not.toBeNull();
    expect(adapter.get(projectKey(store().project.id))).not.toBeNull();
  });

  it("discards corrupt data and opens another project", () => {
    const adapter = new MemoryStorageAdapter();
    const good = createEmptyProject("Good");
    new ProjectRepository(adapter).save(good);
    adapter.set(projectKey("broken"), "nope");
    usePrefs.getState().setLastProjectId("broken");
    boot(adapter);
    const rec = ps().recovery!;
    recoveryDiscard();
    expect(adapter.get(projectKey("broken"))).toBeNull();
    expect(adapter.get(rec.backupKey!)).toBeNull();
    expect(store().project.id).toBe(good.id);
  });

  it("does not touch data from a future version", () => {
    const adapter = new MemoryStorageAdapter();
    const raw = JSON.stringify({
      ...createEmptyProject(),
      id: "fut",
      schemaVersion: SCHEMA_VERSION + 1,
    });
    adapter.set(projectKey("fut"), raw);
    usePrefs.getState().setLastProjectId("fut");
    boot(adapter);
    expect(ps().recovery).toMatchObject({ reason: "future", version: SCHEMA_VERSION + 1 });
    expect(ps().recovery?.backupKey).toBeUndefined();
    recoveryStartEmpty();
    expect(adapter.get(projectKey("fut"))).toBe(raw);
  });

  it("detects writes from another tab and resolves the conflict", () => {
    const adapter = boot(new WebStorageAdapter(localStorage));
    const id = store().project.id;
    // 自タブの書き込みは無視
    handleStorageEvent(projectKey(id), adapter.get(projectKey(id)));
    expect(ps().conflict).toBeNull();

    const other = { ...store().project, name: "From other tab" };
    adapter.set(projectKey(id), JSON.stringify(other));
    handleStorageEvent(projectKey(id), JSON.stringify(other));
    expect(ps().conflict).toEqual({ projectId: id, deleted: false });
    // 競合中は自動保存しない
    store().renameProject("Mine");
    vi.advanceTimersByTime(500);
    expect(JSON.parse(adapter.get(projectKey(id))!).name).toBe("From other tab");

    overwriteWithThisTab();
    expect(ps().conflict).toBeNull();
    expect(JSON.parse(adapter.get(projectKey(id))!).name).toBe("Mine");

    adapter.set(projectKey(id), JSON.stringify(other));
    handleStorageEvent(projectKey(id), JSON.stringify(other));
    reloadFromStorage();
    expect(store().project.name).toBe("From other tab");
    expect(ps().conflict).toBeNull();
  });
});
