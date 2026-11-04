/**
 * 論理ブロックの子ルールをパスで操作する純関数（イミュータブル）。
 * パス例: [] = ルート, ["children", 1], ["condition"], ["children", 0, "then"]
 */
import { MAX_LOGIC_DEPTH, logicDepth, type RuleBlock } from "@/domain/rules";

export type BlockPath = (string | number)[];
export type ContainerKey = "children" | "condition" | "then";

export function getAt(root: RuleBlock, path: BlockPath): RuleBlock | null {
  let cur: unknown = root;
  for (const seg of path) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return (cur as RuleBlock | undefined) ?? null;
}

/** path の位置を value で置き換える。value = null で削除（children の場合は詰める） */
export function setAt(root: RuleBlock, path: BlockPath, value: RuleBlock | null): RuleBlock | null {
  if (!path.length) return value;
  const [head, ...rest] = path;
  if (head === "children" && (root.type === "logic.any" || root.type === "logic.all")) {
    const [idx, ...more] = rest;
    if (typeof idx !== "number") return root;
    const children = [...root.children];
    const cur = children[idx];
    if (!cur) return root;
    const next = more.length ? setAt(cur, more, value) : value;
    if (next === null) children.splice(idx, 1);
    else children[idx] = next;
    return { ...root, children };
  }
  if ((head === "condition" || head === "then") && root.type === "logic.ifThen") {
    const cur = root[head];
    const next = rest.length ? (cur ? setAt(cur, rest, value) : cur) : value;
    return { ...root, [head]: next };
  }
  return root;
}

/** container（論理ブロックのパス）の key に child を挿入する。ifThen は空のときのみ */
export function insertAt(
  root: RuleBlock,
  containerPath: BlockPath,
  key: ContainerKey,
  index: number,
  child: RuleBlock,
): RuleBlock | null {
  const container = getAt(root, containerPath);
  if (!container) return null;
  let next: RuleBlock;
  if (key === "children" && (container.type === "logic.any" || container.type === "logic.all")) {
    const children = [...container.children];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, child);
    next = { ...container, children };
  } else if (
    (key === "condition" || key === "then") &&
    container.type === "logic.ifThen" &&
    container[key] === null
  ) {
    next = { ...container, [key]: child };
  } else return null;
  return setAt(root, containerPath, next);
}

/** オブジェクト同一性で子を取り除く（移動時の番兵用） */
export function removeIdentity(root: RuleBlock, target: RuleBlock): RuleBlock {
  if (root.type === "logic.any" || root.type === "logic.all") {
    return {
      ...root,
      children: root.children.filter((c) => c !== target).map((c) => removeIdentity(c, target)),
    };
  }
  if (root.type === "logic.ifThen") {
    const fix = (b: RuleBlock | null) => (b === target ? null : b ? removeIdentity(b, target) : b);
    return { ...root, condition: fix(root.condition), then: fix(root.then) };
  }
  return root;
}

/** 子ルールを同じルール内で移動する。失敗時は null */
export function moveWithin(
  root: RuleBlock,
  from: BlockPath,
  containerPath: BlockPath,
  key: ContainerKey,
  index: number,
): RuleBlock | null {
  const child = getAt(root, from);
  if (!child || !from.length) return null;
  // 自分自身の中には入れられない
  if (containerPath.length >= from.length && from.every((s, i) => containerPath[i] === s))
    return null;
  const sentinel = { type: "logic.all", children: [] } as RuleBlock;
  const marked = setAt(root, from, sentinel);
  if (!marked) return null;
  const inserted = insertAt(marked, containerPath, key, index, child);
  if (!inserted) return null;
  const out = removeIdentity(inserted, sentinel);
  return logicDepth(out) > MAX_LOGIC_DEPTH ? null : out;
}

/** 深さの上限を満たすか */
export const withinDepth = (b: RuleBlock | null) => logicDepth(b) <= MAX_LOGIC_DEPTH;

export const pathKey = (path: BlockPath) => path.join(".");
export function parsePath(s: string): BlockPath {
  if (!s) return [];
  return s.split(".").map((x) => (/^\d+$/.test(x) ? Number(x) : x));
}
