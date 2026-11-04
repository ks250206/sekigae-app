import { current, isDraft, type Draft } from "immer";
import type { ProjectStore, Recipe } from "../project";

export type Update = (recipe: Recipe) => void;
export type Get = () => ProjectStore;

/** immer の draft でも安全に深いコピーを作る */
export function clone<T>(x: T): T {
  return structuredClone(isDraft(x) ? (current(x as Draft<T>) as T) : x);
}
