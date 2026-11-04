import * as React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createRule } from "@/domain/factory";
import type { PersonExpr, RuleBlock } from "@/domain/rules";
import i18n from "@/i18n";
import { useProjectStore } from "@/store/project";
import { makeProject } from "@/test/factories";
import { BlockSentence } from "./components/BlockSentence";
import { BlockShell } from "./components/BlockShell";
import { ConditionBuilder } from "./components/ConditionBuilder";
import { FeasibilityIndicator } from "./components/FeasibilityIndicator";
import { BLOCKS } from "./registry";
import { RulesEditor } from "./RulesEditor";
import { useRulesUi, EMPTY_FILTERS } from "./rulesUi";

const wrap = (ui: React.ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>);

beforeEach(async () => {
  await i18n.changeLanguage("ja");
  useProjectStore.getState().replaceProject(makeProject("medium"));
  useRulesUi.setState({
    pendingOpen: null,
    focusRuleId: null,
    filters: EMPTY_FILTERS,
    view: "expanded",
  });
});

describe("BlockSentence", () => {
  const block: RuleBlock = {
    type: "room.only",
    rooms: ["r1"],
    people: { op: "role", in: ["faculty"] },
  };

  it("places slots according to the language", async () => {
    const { rerender } = wrap(<BlockSentence block={block} onChange={() => {}} />);
    const sentence = screen.getByTestId("rule-sentence");
    const order = () =>
      [...sentence.querySelectorAll("[data-slot-name]")].map((e) =>
        e.getAttribute("data-slot-name"),
      );
    expect(order()).toEqual(["rooms", "people"]);
    expect(sentence.textContent).toMatch(/^Room 1.*は教員.*のみ$/);
    await act(() => i18n.changeLanguage("en"));
    rerender(
      <TooltipProvider>
        <BlockSentence block={block} onChange={() => {}} />
      </TooltipProvider>,
    );
    expect(order()).toEqual(["people", "rooms"]);
    expect(sentence.textContent).toMatch(/^Only Faculty.* in Room 1/);
  });

  it("shows placeholders for unset slots", () => {
    wrap(<BlockSentence block={BLOCKS["seat.pin"].create()} onChange={() => {}} />);
    expect(screen.getByTestId("slot-seat")).toHaveTextContent("席を選ぶ");
    expect(screen.getByTestId("slot-member")).toHaveAttribute("data-unset", "true");
  });
});

describe("ConditionBuilder", () => {
  function Harness({ initial }: { initial: PersonExpr }) {
    const [v, setV] = React.useState(initial);
    return (
      <>
        <ConditionBuilder kind="person" value={v} onChange={setV} />
        <pre data-testid="json">{JSON.stringify(v)}</pre>
      </>
    );
  }
  const json = () => JSON.parse(screen.getByTestId("json").textContent!) as PersonExpr;

  it("builds and/or/not conditions with a live summary", () => {
    wrap(<Harness initial={{ op: "role", in: ["d1", "d2", "d3"] }} />);
    expect(screen.getByTestId("builder-summary")).toHaveTextContent("博士課程 (D)");
    fireEvent.click(screen.getByTestId("builder-add"));
    const leaves = screen.getAllByTestId("builder-leaf");
    expect(leaves).toHaveLength(2);
    // 2 つ目の条件で M2 を選ぶ
    fireEvent.click(within(leaves[1]!).getByRole("button", { name: "M2" }));
    expect(json()).toEqual({
      op: "and",
      args: [
        { op: "role", in: ["d1", "d2", "d3"] },
        { op: "role", in: ["m2"] },
      ],
    });
    fireEvent.click(screen.getByTestId("builder-junction"));
    expect(json().op).toBe("or");
    fireEvent.click(within(leaves[1]!).getByTestId("builder-not"));
    expect(screen.getByTestId("builder-summary")).toHaveTextContent("博士課程 (D) または M2でない");
    // グループ化（深さ 2 まで）
    fireEvent.click(within(screen.getAllByTestId("builder-leaf")[0]!).getByTestId("builder-group"));
    expect(screen.getByTestId("builder-group-block")).toBeInTheDocument();
    expect(json()).toMatchObject({ op: "or", args: [{ op: "and" }, { op: "not" }] });
  });

  it("warns when nothing matches", () => {
    wrap(<Harness initial={{ op: "tag", in: ["none"] }} />);
    expect(screen.getByTestId("builder-count")).toHaveTextContent("0 人が該当");
  });

  it("offers a reset for too-deep expressions", () => {
    wrap(
      <Harness
        initial={{ op: "and", args: [{ op: "not", arg: { op: "or", args: [{ op: "all" }] } }] }}
      />,
    );
    fireEvent.click(screen.getByTestId("builder-reset"));
    expect(json()).toEqual({ op: "all" });
  });
});

describe("BlockShell", () => {
  it("shows strength, weight, violations and disables hard for soft-only blocks", () => {
    let strength = "";
    wrap(
      <BlockShell
        def={BLOCKS["room.prefer"]}
        strength="soft"
        weight={4}
        onStrengthChange={(s) => (strength = s)}
        onWeightChange={() => {}}
        onEnabledChange={() => {}}
        violationCount={2}
      />,
    );
    expect(screen.getByTestId("strength-hard")).toBeDisabled();
    expect(screen.getByTestId("weight-4")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("violation-badge")).toHaveTextContent("違反 2");
    fireEvent.click(screen.getByTestId("strength-soft"));
    expect(strength).toBe("soft");
  });

  it("hides strength controls for logic children", () => {
    wrap(<BlockShell def={BLOCKS["seat.empty"]} child onStrengthChange={() => {}} />);
    expect(screen.queryByTestId("strength-hard")).toBeNull();
  });
});

describe("FeasibilityIndicator", () => {
  it("renders nothing without a status", () => {
    const { container } = wrap(<FeasibilityIndicator />);
    expect(container).toBeEmptyDOMElement();
    wrap(<FeasibilityIndicator status="infeasible" />);
    expect(screen.getByTestId("feasibility-indicator")).toHaveTextContent("満たせません");
  });
});

describe("RulesEditor", () => {
  it("adds a rule from the palette and filters the stack", async () => {
    useProjectStore
      .getState()
      .addRule(
        { type: "seat.empty", seats: { op: "seats", seatIds: ["r1-s1"] } },
        { strength: "soft" },
      );
    wrap(<RulesEditor violationCounts={{}} />);
    expect(screen.getAllByTestId("rule-card")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("palette-block-group.cluster"));
    expect(screen.getAllByTestId("rule-card")).toHaveLength(2);
    expect(useProjectStore.getState().project.rules[1]!.block.type).toBe("group.cluster");
    fireEvent.click(screen.getByTestId("filter-cat-seat"));
    await waitFor(() => expect(screen.getAllByTestId("rule-card")).toHaveLength(1));
    expect(screen.getByTestId("rule-count")).toHaveTextContent("1 / 2");
  });

  it("shows warnings for dangling references", () => {
    const p = makeProject("medium");
    p.rules = [createRule({ type: "room.exclude", rooms: ["gone"], people: { op: "all" } })];
    useProjectStore.getState().replaceProject(p);
    wrap(<RulesEditor />);
    expect(screen.getByTestId("rules-warnings")).toHaveTextContent("参照切れ 1 件");
    expect(screen.getByTestId("dangling-badge")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("fix-all-dangling"));
    expect(useProjectStore.getState().project.rules[0]!.block).toMatchObject({ rooms: [] });
  });
});
