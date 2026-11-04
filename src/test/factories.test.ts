import { describe, expect, it } from "vite-plus/test";
import { projectSchema } from "@/domain/schema";
import { totalSeats } from "@/store/selectors";
import { makeProject } from "./factories";

describe("fixtures", () => {
  it.each(["small", "medium", "large"] as const)("%s fixture is schema-valid", (size) => {
    const p = makeProject(size);
    expect(projectSchema.safeParse(p).success).toBe(true);
  });
  it("large fixture has 100 members and 144+ seats", () => {
    const p = makeProject("large");
    expect(p.members).toHaveLength(100);
    expect(totalSeats(p.layout.rooms)).toBeGreaterThanOrEqual(144);
  });
});
