import { DoorOpen, Download, LayoutGrid, ListChecks, Puzzle, Users } from "lucide-react";

export const STEPS = [
  { id: "rooms", path: "/rooms", icon: LayoutGrid },
  { id: "members", path: "/members", icon: Users },
  { id: "rules", path: "/rules", icon: Puzzle },
  { id: "seating", path: "/seating", icon: DoorOpen },
  { id: "export", path: "/export", icon: Download },
] as const;

export type StepId = (typeof STEPS)[number]["id"];
export const StepIcon = ListChecks;
