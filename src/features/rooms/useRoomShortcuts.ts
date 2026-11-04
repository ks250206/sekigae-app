import { useEffect, useLayoutEffect, useRef } from "react";
import type { ViewportController } from "@/components/canvas";
import { isEditableTarget } from "@/lib/keyboard";
import { usePrefs } from "@/store/prefs";
import { useUiStore } from "@/store/ui";
import {
  clearSelection,
  copySelection,
  deleteSelection,
  duplicateSelection,
  nudge,
  paste,
  rotate,
  selectAll,
} from "./actions";
import { useEditor } from "./editorStore";
import type { Interaction } from "./interaction";
import { matchShortcut } from "./shortcuts";
import { TOOL_SHORTCUTS } from "./tools";

const ARROWS: Record<string, [number, number]> = {
  arrowup: [0, -1],
  arrowdown: [0, 1],
  arrowleft: [-1, 0],
  arrowright: [1, 0],
};

/** モーダルが開いている間はショートカットを無効にする */
const modalOpen = () =>
  document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"]') !== null;

export function useRoomShortcuts(opts: {
  viewport: ViewportController;
  interaction: Interaction;
  fitAll: () => void;
  fitSelection: () => void;
}) {
  const ref = useRef(opts);
  useLayoutEffect(() => {
    ref.current = opts;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditableTarget(e.target) || modalOpen()) return;
      const id = matchShortcut(e);
      if (!id || id === "panHold") return;
      const { viewport, interaction, fitAll, fitSelection } = ref.current;
      const ed = useEditor.getState();
      const tool = TOOL_SHORTCUTS[id];
      if (tool) {
        ed.setTool(tool);
        e.preventDefault();
        return;
      }
      switch (id) {
        case "rotate":
          rotate(1);
          break;
        case "rotateBack":
          rotate(-1);
          break;
        case "delete":
          void deleteSelection();
          break;
        case "nudge":
        case "nudgeFar": {
          const [dx, dy] = ARROWS[e.key.toLowerCase()] ?? [0, 0];
          const k = id === "nudgeFar" ? 5 : 1;
          if (!nudge(dx * k, dy * k)) viewport.panBy(-dx * 40 * k, -dy * 40 * k);
          break;
        }
        case "copy":
          if (!copySelection()) return; // 何も選択していなければブラウザ標準のコピー
          break;
        case "paste":
          paste();
          break;
        case "duplicate":
          duplicateSelection();
          break;
        case "selectAll":
          selectAll();
          break;
        case "escape": {
          const sel = useUiStore.getState().selection;
          if (interaction.cancel()) break;
          if (ed.placement) ed.setPlacement(null);
          else if (sel.seatIds.length || sel.entranceIds.length || sel.roomIds.length)
            clearSelection();
          else if (ed.tool !== "select") ed.setTool("select");
          break;
        }
        case "zoomIn":
          viewport.zoomBy(1.25);
          break;
        case "zoomOut":
          viewport.zoomBy(1 / 1.25);
          break;
        case "zoomReset":
          viewport.reset();
          break;
        case "fitAll":
          fitAll();
          break;
        case "fitSelection":
          fitSelection();
          break;
        case "toggleHeatmap": {
          const p = usePrefs.getState();
          p.setCanvas({ showHeatmap: !p.canvas.showHeatmap });
          break;
        }
        case "toggleGrid": {
          const p = usePrefs.getState();
          p.setCanvas({ showGrid: !p.canvas.showGrid });
          break;
        }
        case "toggleMinimap": {
          const p = usePrefs.getState();
          p.setCanvas({ showMinimap: !p.canvas.showMinimap });
          break;
        }
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
