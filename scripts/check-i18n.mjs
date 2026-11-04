// ja / en の翻訳キーの差分を検出する。差分があれば exit 1。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/i18n/locales/", import.meta.url).pathname;
const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );

let errors = 0;
const nss = new Set([...readdirSync(join(root, "ja")), ...readdirSync(join(root, "en"))]);
for (const file of nss) {
  const load = (lng) => {
    try {
      return new Map(flatten(JSON.parse(readFileSync(join(root, lng, file), "utf8"))));
    } catch {
      console.error(`✗ missing file: ${lng}/${file}`);
      errors++;
      return new Map();
    }
  };
  const ja = load("ja");
  const en = load("en");
  const report = (msg) => {
    console.error(msg);
    errors++;
  };
  for (const k of ja.keys()) if (!en.has(k)) report(`✗ en/${file}: missing "${k}"`);
  for (const k of en.keys()) if (!ja.has(k)) report(`✗ ja/${file}: missing "${k}"`);
  for (const [k, v] of [...ja, ...en]) if (v === "") report(`✗ ${file}: empty string "${k}"`);
}
if (errors) {
  console.error(`i18n check failed: ${errors} problem(s)`);
  process.exit(1);
}
console.log("i18n check passed");
