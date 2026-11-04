import {
  Armchair,
  Box,
  DoorOpen,
  Eraser,
  Hand,
  MousePointer2,
  PaintRoller,
  SquareDashed,
  type LucideIcon,
} from "lucide-react";
import type { ToolId } from "./editorStore";
import type { ShortcutId } from "./shortcuts";

export interface ToolDef {
  id: ToolId;
  icon: LucideIcon;
  shortcut: ShortcutId;
  cursor: string;
}

export const TOOLS: ToolDef[] = [
  { id: "select", icon: MousePointer2, shortcut: "toolSelect", cursor: "default" },
  { id: "floor", icon: PaintRoller, shortcut: "toolFloor", cursor: "crosshair" },
  { id: "void", icon: SquareDashed, shortcut: "toolVoid", cursor: "crosshair" },
  { id: "obstacle", icon: Box, shortcut: "toolObstacle", cursor: "crosshair" },
  { id: "seat", icon: Armchair, shortcut: "toolSeat", cursor: "copy" },
  { id: "entrance", icon: DoorOpen, shortcut: "toolEntrance", cursor: "crosshair" },
  { id: "eraser", icon: Eraser, shortcut: "toolEraser", cursor: "crosshair" },
  { id: "pan", icon: Hand, shortcut: "toolPan", cursor: "grab" },
];

export const TOOL_SHORTCUTS: Partial<Record<ShortcutId, ToolId>> = Object.fromEntries(
  TOOLS.map((t) => [t.shortcut, t.id]),
);
