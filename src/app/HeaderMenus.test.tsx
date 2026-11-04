import { describe, expect, it } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeMenu, LanguageMenu } from "./HeaderMenus";

describe("header menus", () => {
  it("renders theme and language triggers", () => {
    render(
      <TooltipProvider>
        <ThemeMenu />
        <LanguageMenu />
      </TooltipProvider>,
    );
    expect(screen.getByTestId("theme-menu")).toBeInTheDocument();
    expect(screen.getByTestId("language-menu")).toBeInTheDocument();
  });
});
