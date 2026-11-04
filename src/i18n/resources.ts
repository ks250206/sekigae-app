import jaCommon from "./locales/ja/common.json";
import jaRooms from "./locales/ja/rooms.json";
import jaMembers from "./locales/ja/members.json";
import jaRules from "./locales/ja/rules.json";
import jaSeating from "./locales/ja/seating.json";
import jaExport from "./locales/ja/export.json";
import jaOnboarding from "./locales/ja/onboarding.json";
import enCommon from "./locales/en/common.json";
import enRooms from "./locales/en/rooms.json";
import enMembers from "./locales/en/members.json";
import enRules from "./locales/en/rules.json";
import enSeating from "./locales/en/seating.json";
import enExport from "./locales/en/export.json";
import enOnboarding from "./locales/en/onboarding.json";

export const defaultNS = "common";
export const namespaces = [
  "common",
  "rooms",
  "members",
  "rules",
  "seating",
  "export",
  "onboarding",
] as const;

export const resources = {
  ja: {
    common: jaCommon,
    rooms: jaRooms,
    members: jaMembers,
    rules: jaRules,
    seating: jaSeating,
    export: jaExport,
    onboarding: jaOnboarding,
  },
  en: {
    common: enCommon,
    rooms: enRooms,
    members: enMembers,
    rules: enRules,
    seating: enSeating,
    export: enExport,
    onboarding: enOnboarding,
  },
} as const;
