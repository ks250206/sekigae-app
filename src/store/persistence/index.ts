/**
 * 永続化ランタイム。docs/DESIGN.md §8
 * - 起動時に最後に開いたプロジェクトを復元（無ければ空プロジェクトを作成）
 * - useProjectStore を購読して 500ms デバウンス自動保存。離脱・非表示時は即時保存
 * - 複数プロジェクトの作成・切替・複製・削除・取込
 * - 他タブでの更新検知（storage イベント）、破損データの退避と復旧
 */
import { create } from "zustand";
import { createEmptyProject, now } from "@/domain/factory";
import type { Project } from "@/domain/schema";
import i18n from "@/i18n";
import { newId } from "@/lib/id";
import { usePrefs } from "../prefs";
import { history, useProjectStore } from "../project";
import { useUiStore } from "../ui";
import { ProjectRepository, sortRecent, type ProjectMeta } from "./repository";
import {
  createDefaultAdapter,
  INDEX_KEY,
  isQuotaExceeded,
  PROJECT_KEY_PREFIX,
  projectKey,
  storageUsage,
  type StorageAdapter,
} from "./storage";

export type { ProjectMeta } from "./repository";

export interface Recovery {
  reason: "corrupt" | "future";
  projectId: string;
  /** 読めなかった元データ */
  raw: string;
  /** 退避先キー（corrupt のみ） */
  backupKey?: string;
  issues: string[];
  version?: number;
  /** 起動時（他に開いているプロジェクトが無い）か */
  atBoot: boolean;
}

export interface PersistenceState {
  ready: boolean;
  /** local: localStorage / memory: 使えないためメモリのみ（リロードで消える） */
  mode: "local" | "memory";
  /** 最近使った順 */
  projects: ProjectMeta[];
  status: "saved" | "pending" | "error";
  savedAt: string | null;
  error: { kind: "quota" | "unknown"; message: string; at: number } | null;
  /** 他のタブで現在のプロジェクトが更新・削除された */
  conflict: { projectId: string; deleted: boolean } | null;
  recovery: Recovery | null;
}

export const usePersistence = create<PersistenceState>()(() => ({
  ready: false,
  mode: "local",
  projects: [],
  status: "saved",
  savedAt: null,
  error: null,
  conflict: null,
  recovery: null,
}));

export const AUTOSAVE_DELAY = 500;

interface Runtime {
  repo: ProjectRepository;
  delay: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** 購読で最後に見たプロジェクト */
  current: Project;
  /** 最後に保存（または読込）したプロジェクト */
  lastSaved: Project | null;
  /** 最後に書いた JSON（storage イベントで自タブ由来か判定） */
  lastWritten: string | null;
  /** 起動時に自動作成し、まだ触っていないプロジェクト */
  autoCreatedId: string | null;
  dispose: () => void;
}

let rt: Runtime | null = null;

const setState = usePersistence.setState;
const defaultProjectName = () => i18n.t("project.defaultName");
const defaultPlanName = () => i18n.t("project.defaultPlanName");

function newEmptyProject(name?: string): Project {
  return createEmptyProject(name?.trim() || defaultProjectName(), defaultPlanName());
}

function isPristine(p: Project): boolean {
  return (
    p.createdAt === p.updatedAt &&
    p.layout.rooms.length === 0 &&
    p.members.length === 0 &&
    p.rules.length === 0
  );
}

function refreshIndex() {
  if (!rt) return;
  setState({ projects: sortRecent(rt.repo.readIndex()) });
}

function blocked(): boolean {
  const s = usePersistence.getState();
  return s.conflict !== null || (s.recovery?.atBoot ?? false);
}

/** 保存を実行。成功で true */
function writeProject(p: Project, opts: { opened?: boolean } = {}): boolean {
  if (!rt) return false;
  try {
    const json = rt.repo.save(p, opts);
    if (p.id === rt.current.id) {
      rt.lastSaved = p;
      rt.lastWritten = json;
      setState({ status: "saved", savedAt: now(), error: null });
    }
    refreshIndex();
    return true;
  } catch (e) {
    setState({
      status: "error",
      error: {
        kind: isQuotaExceeded(e) ? "quota" : "unknown",
        message: e instanceof Error ? e.message : String(e),
        at: Date.now(),
      },
    });
    return false;
  }
}

function schedule() {
  if (!rt) return;
  if (rt.timer) clearTimeout(rt.timer);
  setState({ status: "pending" });
  rt.timer = setTimeout(() => void flush(), rt.delay);
}

/** 未保存の変更があれば即時保存する。保存済み・保存不要なら true */
export function flush(force = false): boolean {
  if (!rt) return false;
  if (rt.timer) clearTimeout(rt.timer);
  rt.timer = null;
  if (blocked()) return false;
  if (!force && rt.current === rt.lastSaved) return true;
  return writeProject(rt.current);
}

/** 保存失敗時の再試行 */
export const retrySave = () => flush(true);

function onProjectChange(p: Project, prev: Project) {
  if (!rt || p === prev) return;
  if (p.id !== rt.current.id) {
    // 外部から別プロジェクトに差し替えられた（サンプル読込など）
    const old = rt.current;
    if (old !== rt.lastSaved && !blocked()) writeProject(old);
    if (rt.autoCreatedId === old.id && isPristine(old)) {
      try {
        rt.repo.remove(old.id);
      } catch {
        // ignore
      }
    }
    rt.autoCreatedId = null;
    rt.current = p;
    rt.lastSaved = null;
    rt.lastWritten = null;
    usePrefs.getState().setLastProjectId(p.id);
    // 別プロジェクトへの Undo を防ぐ（zundo の記録後に消す）
    queueMicrotask(() => history.clear());
    schedule();
    return;
  }
  rt.current = p;
  if (p === rt.lastSaved) return;
  schedule();
}

/** プロジェクトをストアに読み込む（保存はしない） */
function applyProject(p: Project) {
  if (!rt) return;
  if (rt.timer) clearTimeout(rt.timer);
  rt.timer = null;
  rt.current = p;
  rt.lastSaved = p;
  rt.lastWritten = rt.repo.adapter.get(projectKey(p.id));
  useProjectStore.getState().replaceProject(p);
  history.clear();
  useUiStore.getState().clearSelection();
  useUiStore.getState().setEditingPrevious(false);
  usePrefs.getState().setLastProjectId(p.id);
  try {
    rt.repo.touchOpened(p.id);
  } catch {
    // ignore
  }
  setState({ status: "saved", error: null, conflict: null });
  refreshIndex();
}

function startRecovery(
  id: string,
  r: Exclude<ReturnType<ProjectRepository["load"]>, { ok: true }>,
  atBoot: boolean,
) {
  if (!rt || r.reason === "missing") return;
  let backupKey: string | undefined;
  if (r.reason === "corrupt") {
    try {
      backupKey = rt.repo.quarantine(id, r.raw);
    } catch {
      // 退避に失敗しても元キーは残っているので失わない
    }
  }
  setState({
    recovery: {
      reason: r.reason,
      projectId: id,
      raw: r.raw,
      backupKey,
      issues: r.reason === "corrupt" ? r.issues : [],
      version: r.reason === "future" ? r.version : undefined,
      atBoot,
    },
  });
}

// ---------------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------------

export interface InitOptions {
  adapter?: StorageAdapter;
  delay?: number;
  /** window のイベント購読を行うか（テストで false） */
  listen?: boolean;
}

/** アプリ起動時に 1 回呼ぶ。dispose 関数を返す */
export function initPersistence(opts: InitOptions = {}): () => void {
  rt?.dispose();
  const adapter = opts.adapter ?? createDefaultAdapter();
  const repo = new ProjectRepository(adapter);
  const initial = useProjectStore.getState().project;
  const runtime: Runtime = {
    repo,
    delay: opts.delay ?? AUTOSAVE_DELAY,
    timer: null,
    current: initial,
    lastSaved: initial,
    lastWritten: null,
    autoCreatedId: null,
    dispose: () => {},
  };
  rt = runtime;
  setState({
    ready: false,
    mode: adapter.kind,
    projects: [],
    status: "saved",
    savedAt: null,
    error: null,
    conflict: null,
    recovery: null,
  });

  let index: ProjectMeta[] = [];
  try {
    index = repo.readIndex();
  } catch {
    index = [];
  }
  const lastId = usePrefs.getState().lastProjectId;
  const candidates = [
    ...(lastId ? [lastId] : []),
    ...sortRecent(index)
      .map((m) => m.id)
      .filter((id) => id !== lastId),
  ];

  let opened = false;
  for (const id of candidates) {
    const r = repo.load(id);
    if (r.ok) {
      applyProject(r.project);
      opened = true;
      break;
    }
    if (r.reason === "missing") continue;
    // 読めないデータ: 退避して復旧ダイアログ。仮の空プロジェクトで起動し、自動保存は止める
    startRecovery(id, r, true);
    const temp = newEmptyProject();
    runtime.current = temp;
    runtime.lastSaved = temp;
    useProjectStore.getState().replaceProject(temp);
    history.clear();
    opened = true;
    break;
  }
  if (!opened) {
    const p = newEmptyProject();
    runtime.current = p;
    runtime.lastSaved = null;
    useProjectStore.getState().replaceProject(p);
    history.clear();
    usePrefs.getState().setLastProjectId(p.id);
    writeProject(p, { opened: true });
    runtime.autoCreatedId = p.id;
  }

  const unsub = useProjectStore.subscribe((s, prev) => onProjectChange(s.project, prev.project));
  const cleanups: (() => void)[] = [unsub];

  if (opts.listen !== false && typeof window !== "undefined") {
    const onHide = () => void flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onStorage = (e: StorageEvent) => handleStorageEvent(e.key, e.newValue);
    window.addEventListener("beforeunload", onHide);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);
    cleanups.push(() => {
      window.removeEventListener("beforeunload", onHide);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    });
  }

  runtime.dispose = () => {
    if (runtime.timer) clearTimeout(runtime.timer);
    for (const c of cleanups) c();
    if (rt === runtime) rt = null;
  };
  refreshIndex();
  setState({ ready: true });
  return runtime.dispose;
}

/** 他タブの書き込み（storage イベント）。テストからも呼べるよう分離 */
export function handleStorageEvent(key: string | null, newValue: string | null) {
  if (!rt || rt.repo.adapter.kind !== "local") return;
  const own = projectKey(rt.current.id);
  if (key === null) {
    // localStorage.clear()
    refreshIndex();
    if (!rt.repo.has(rt.current.id))
      setState({ conflict: { projectId: rt.current.id, deleted: true } });
    return;
  }
  if (key === INDEX_KEY || (key.startsWith(PROJECT_KEY_PREFIX) && key !== own)) {
    refreshIndex();
    return;
  }
  if (key !== own) return;
  if (newValue !== null && newValue === rt.lastWritten) return;
  setState({ conflict: { projectId: rt.current.id, deleted: newValue === null } });
}

// ---------------------------------------------------------------------------
// 他タブとの競合
// ---------------------------------------------------------------------------

/** 他タブの内容を読み直す */
export function reloadFromStorage() {
  if (!rt) return;
  setState({ conflict: null });
  const r = rt.repo.load(rt.current.id);
  if (r.ok) applyProject(r.project);
  else if (r.reason === "missing") openMostRecentOrNew();
  else startRecovery(rt.current.id, r, false);
}

/** このタブの内容で上書き保存する */
export function overwriteWithThisTab() {
  setState({ conflict: null });
  flush(true);
}

// ---------------------------------------------------------------------------
// 破損データの復旧
// ---------------------------------------------------------------------------

function closeRecovery(): Recovery | null {
  const r = usePersistence.getState().recovery;
  setState({ recovery: null });
  return r;
}

/** 壊れたデータを削除する（退避コピーも消す） */
export function recoveryDiscard() {
  const r = closeRecovery();
  if (!rt || !r) return;
  try {
    rt.repo.remove(r.projectId);
    if (r.backupKey) rt.repo.adapter.remove(r.backupKey);
  } catch {
    // ignore
  }
  if (r.atBoot) openMostRecentOrNew();
  else refreshIndex();
}

/** 元データ（corrupt は退避済み）を残したまま空のプロジェクトで始める */
export function recoveryStartEmpty() {
  const r = closeRecovery();
  if (!rt || !r) return;
  if (r.reason === "corrupt" && r.backupKey) {
    try {
      rt.repo.remove(r.projectId);
    } catch {
      // ignore
    }
  }
  if (r.atBoot) {
    flush(true);
    usePrefs.getState().setLastProjectId(rt.current.id);
  } else {
    createProject();
  }
}

/** 復旧ダイアログを閉じるだけ（起動時以外） */
export function recoveryDismiss() {
  const r = usePersistence.getState().recovery;
  if (r && !r.atBoot) setState({ recovery: null });
}

// ---------------------------------------------------------------------------
// 複数プロジェクト
// ---------------------------------------------------------------------------

export function currentProjectId(): string {
  return useProjectStore.getState().project.id;
}

/** 新しい空プロジェクトを作って開く */
export function createProject(name?: string): string | null {
  if (!rt) return null;
  flush();
  const p = newEmptyProject(name);
  const prev = rt.current;
  rt.current = p;
  if (!writeProject(p, { opened: true })) {
    rt.current = prev;
    return null;
  }
  applyProject(p);
  return p.id;
}

/** 指定プロジェクトに切り替える。読めない場合は復旧ダイアログ */
export function switchProject(id: string): boolean {
  if (!rt) return false;
  if (id === rt.current.id) return true;
  flush();
  const r = rt.repo.load(id);
  if (r.ok) {
    applyProject(r.project);
    return true;
  }
  if (r.reason === "missing") refreshIndex();
  else startRecovery(id, r, false);
  return false;
}

function openMostRecentOrNew() {
  if (!rt) return;
  for (const m of sortRecent(rt.repo.readIndex())) {
    const r = rt.repo.load(m.id);
    if (r.ok) {
      applyProject(r.project);
      return;
    }
  }
  const p = newEmptyProject();
  rt.current = p;
  writeProject(p, { opened: true });
  applyProject(p);
}

export function renameProjectById(id: string, name: string) {
  if (!rt) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if (id === rt.current.id) {
    useProjectStore.getState().renameProject(trimmed);
    flush();
    return;
  }
  const r = rt.repo.load(id);
  if (r.ok) writeProject({ ...r.project, name: trimmed, updatedAt: now() });
}

/** 複製して新しい ID を返す（切り替えはしない） */
export function duplicateProject(id: string): string | null {
  if (!rt) return null;
  flush();
  const src =
    id === rt.current.id
      ? rt.current
      : (() => {
          const r = rt.repo.load(id);
          return r.ok ? r.project : null;
        })();
  if (!src) return null;
  const t0 = now();
  const copy: Project = {
    ...structuredClone(src),
    id: newId("proj_"),
    name: i18n.t("project.copyName", { name: src.name }),
    createdAt: t0,
    updatedAt: t0,
  };
  return writeProject(copy) ? copy.id : null;
}

/** 削除。開いているプロジェクトなら最近のもの（無ければ新規）に切り替える */
export function deleteProject(id: string) {
  if (!rt) return;
  try {
    rt.repo.remove(id);
  } catch {
    // ignore
  }
  if (id === rt.current.id) {
    if (rt.timer) clearTimeout(rt.timer);
    rt.timer = null;
    openMostRecentOrNew();
  } else refreshIndex();
}

export function projectExists(id: string): boolean {
  return rt?.repo.has(id) ?? false;
}

/** 検証済みプロジェクトを取り込んで開く。new: 新しい ID で / overwrite: 同じ ID を上書き */
export function importProject(p: Project, mode: "new" | "overwrite"): string | null {
  if (!rt) return null;
  flush();
  const t0 = now();
  const next: Project =
    mode === "new" ? { ...p, id: newId("proj_"), updatedAt: t0 } : { ...p, updatedAt: t0 };
  const prev = rt.current;
  rt.current = next;
  if (!writeProject(next, { opened: true })) {
    rt.current = prev;
    return null;
  }
  applyProject(next);
  return next.id;
}

/** 保存済みプロジェクトを読む（現在のものは最新の状態を返す） */
export function loadProject(id: string): Project | null {
  if (!rt) return null;
  if (id === rt.current.id) return rt.current;
  const r = rt.repo.load(id);
  return r.ok ? r.project : null;
}

/** 使用量（文字数と上限目安に対する割合） */
export function getStorageUsage() {
  if (!rt) return { used: 0, ratio: 0 };
  return storageUsage(rt.repo.adapter);
}
