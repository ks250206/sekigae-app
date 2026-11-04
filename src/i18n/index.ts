import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { resources, namespaces, defaultNS } from "./resources";
import { PREFS_KEY } from "@/store/prefs";

export const SUPPORTED_LANGUAGES = ["ja", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** prefs (zustand persist) に保存された言語を読む検出器 */
const prefsDetector = {
  name: "sekigaePrefs",
  lookup(): string | undefined {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      const lang = raw ? JSON.parse(raw)?.state?.language : undefined;
      return typeof lang === "string" ? lang : undefined;
    } catch {
      return undefined;
    }
  },
};

const detector = new LanguageDetector();
detector.addDetector(prefsDetector);

void i18n
  .use(detector)
  .use(initReactI18next)
  .init({
    resources,
    ns: namespaces,
    defaultNS,
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    detection: { order: ["sekigaePrefs", "navigator"], caches: [] },
    interpolation: { escapeValue: false },
    returnNull: false,
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: (lngs, ns, key) => {
      if (import.meta.env.DEV) console.warn(`[i18n] missing key ${ns}:${key} (${lngs.join(",")})`);
    },
  });

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.resolvedLanguage ?? "ja";

/** UI 言語とは独立した i18n インスタンス（出力ファイル用など） */
export function createFixedT(lng: Language) {
  return i18n.getFixedT(lng);
}

export default i18n;
