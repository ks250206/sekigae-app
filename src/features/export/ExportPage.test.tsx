import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { createEmptyProject } from "@/domain/factory";
import i18n from "@/i18n";
import { usePrefs } from "@/store/prefs";
import { useProjectStore } from "@/store/project";
import ExportPage from "./ExportPage";
import { makeExportFixture } from "./fixture";
import { defaultExportPrefs, normalizeExportPrefs } from "./prefs";

beforeEach(async () => {
  await i18n.changeLanguage("ja");
  usePrefs.setState({ ui: {} });
});

describe("ExportPage", () => {
  it("shows an empty state without rooms", () => {
    useProjectStore.getState().replaceProject(createEmptyProject("空"));
    render(<ExportPage />);
    expect(screen.getByTestId("export-empty")).toBeInTheDocument();
  });

  it("previews rooms, warns about unassigned members and remembers choices", () => {
    const p = makeExportFixture();
    useProjectStore.getState().replaceProject(p);
    render(<ExportPage />);
    const preview = screen.getByTestId("export-preview");
    expect(within(preview).getAllByRole("figure")).toHaveLength(3);
    expect(screen.getByTestId("export-warning-unassigned")).toHaveTextContent("2");
    const filename = () => (screen.getByTestId("export-filename") as HTMLInputElement).value;
    expect(filename()).toMatch(/^テスト研究室_座席表_\d{4}-\d{2}-\d{2}$/);

    // 部屋の選択を外すとプレビューから消える
    fireEvent.click(screen.getByTestId(`export-room-${p.layout.rooms[0]!.id}`));
    expect(within(preview).getAllByRole("figure")).toHaveLength(2);

    // 出力言語を en にするとファイル名の既定値が変わり、prefs に保存される
    fireEvent.click(screen.getByTestId("export-lang-en"));
    expect(filename()).toMatch(/^テスト研究室_seating_/);
    fireEvent.click(screen.getByTestId("export-format-pptx"));
    expect(usePrefs.getState().ui.export).toMatchObject({ lang: "en", format: "pptx" });
  });
});

describe("normalizeExportPrefs", () => {
  it("drops invalid values", () => {
    const d = defaultExportPrefs("ja");
    expect(
      normalizeExportPrefs(
        { format: "pdf", lang: "fr", columns: ["role", "x"], colorBy: "lab" },
        d,
      ),
    ).toEqual({ ...d, columns: ["role"], colorBy: "lab" });
    expect(normalizeExportPrefs(null, d)).toEqual(d);
  });
});
