import type { TourStep } from "./tour";

/** アプリ全体の流れを案内するメインツアー。#141 */
export const MAIN_TOUR: TourStep[] = [
  { route: "/rooms", key: "tour.welcome" },
  { route: "/rooms", target: "step-rooms", key: "tour.steps", side: "bottom" },
  { route: "/rooms", target: "rooms-list", key: "tour.roomsList", side: "right" },
  { route: "/rooms", target: "rooms-tools", key: "tour.roomsTools", side: "bottom" },
  { route: "/rooms", target: "rooms-canvas", key: "tour.roomsCanvas", side: "left" },
  { route: "/members", target: "members-table", key: "tour.members", side: "top" },
  { route: "/members", target: "members-import", key: "tour.membersImport", side: "bottom" },
  { route: "/rules", target: "rules-palette", key: "tour.rulesPalette", side: "right" },
  { route: "/rules", target: "rules-stack", key: "tour.rulesStack", side: "left" },
  { route: "/seating", target: "seating-presets", key: "tour.presets", side: "bottom" },
  { route: "/seating", target: "seating-shuffle", key: "tour.shuffle", side: "bottom" },
  { route: "/seating", target: "seating-canvas", key: "tour.seatingCanvas", side: "left" },
  { route: "/seating", target: "seating-violations", key: "tour.violations", side: "left" },
  { route: "/export", target: "export-panel", key: "tour.export", side: "top" },
  { route: "/export", key: "tour.finish" },
];

/** 画面ごとのミニツアー */
export const PAGE_TOURS: Record<string, TourStep[]> = {
  "/rooms": MAIN_TOUR.filter((s) => s.route === "/rooms" && s.target),
  "/members": MAIN_TOUR.filter((s) => s.route === "/members"),
  "/rules": MAIN_TOUR.filter((s) => s.route === "/rules"),
  "/seating": MAIN_TOUR.filter((s) => s.route === "/seating"),
  "/export": MAIN_TOUR.filter((s) => s.route === "/export" && s.target),
};
