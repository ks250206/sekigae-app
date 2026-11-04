import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const nano = customAlphabet(alphabet, 12);

/** 新しい ID を生成する。prefix は可読性のため（例: "room_", "m_"） */
export function newId(prefix = ""): string {
  return `${prefix}${nano()}`;
}
