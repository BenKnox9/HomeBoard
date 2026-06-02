import { computeContainArea, parseHolds, sortByOrder, isRouteDuplicate } from "../lib/holdUtils";
import { gradeIndex } from "../lib/grades";

// ── computeContainArea ────────────────────────────────────────────────────────

describe("computeContainArea", () => {
  it("fits wide image horizontally, centers vertically", () => {
    // 800×400 image (2:1) into 400×400 container → letterbox top/bottom
    const area = computeContainArea(800, 400, 400, 400);
    expect(area.displayW).toBe(400);
    expect(area.displayH).toBe(200);
    expect(area.offsetX).toBe(0);
    expect(area.offsetY).toBe(100); // (400 - 200) / 2
  });

  it("fits tall image vertically, centers horizontally", () => {
    // 400×800 image (1:2) into 400×400 container → pillarbox left/right
    const area = computeContainArea(400, 800, 400, 400);
    expect(area.displayH).toBe(400);
    expect(area.displayW).toBe(200);
    expect(area.offsetY).toBe(0);
    expect(area.offsetX).toBe(100); // (400 - 200) / 2
  });

  it("returns full container when image has same aspect ratio", () => {
    const area = computeContainArea(400, 400, 400, 400);
    expect(area.displayW).toBe(400);
    expect(area.displayH).toBe(400);
    expect(area.offsetX).toBe(0);
    expect(area.offsetY).toBe(0);
  });

  it("returns container dimensions when natural size is zero", () => {
    const area = computeContainArea(0, 0, 400, 300);
    expect(area.displayW).toBe(400);
    expect(area.displayH).toBe(300);
  });

  it("hold at center maps correctly after containment", () => {
    // 800×400 into 400×400 → displayW=400, displayH=200, offsetY=100
    const area = computeContainArea(800, 400, 400, 400);
    const pixelX = area.offsetX + 0.5 * area.displayW;
    const pixelY = area.offsetY + 0.5 * area.displayH;
    expect(pixelX).toBe(200);
    expect(pixelY).toBe(200); // 100 + 0.5*200
  });
});

// ── parseHolds ────────────────────────────────────────────────────────────────

describe("parseHolds", () => {
  it("returns empty array for undefined input", () => {
    expect(parseHolds(undefined)).toEqual([]);
  });

  it("returns empty array for null input", () => {
    expect(parseHolds(null)).toEqual([]);
  });

  it("parses a valid holds JSON string", () => {
    const holds = [{ id: "a", x: 0.5, y: 0.3, color: "green" }];
    expect(parseHolds(JSON.stringify(holds))).toEqual(holds);
  });

  it("returns null for malformed JSON", () => {
    expect(parseHolds("{bad json}")).toBeNull();
  });

  it("returns null when JSON is not an array", () => {
    expect(parseHolds(JSON.stringify({ id: "a" }))).toBeNull();
  });

  it("returns empty array for empty JSON array", () => {
    expect(parseHolds("[]")).toEqual([]);
  });
});

// ── sortByOrder ───────────────────────────────────────────────────────────────

describe("sortByOrder", () => {
  const routes = [
    { id: "a", name: "Route A" },
    { id: "b", name: "Route B" },
    { id: "c", name: "Route C" },
  ];

  it("returns routes in specified order", () => {
    const sorted = sortByOrder(routes, ["c", "a", "b"]);
    expect(sorted.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("appends routes not in order array at the end", () => {
    const sorted = sortByOrder(routes, ["b"]);
    expect(sorted[0].id).toBe("b");
    expect(sorted.length).toBe(3);
    // a and c should be at the end (order among unordered is original)
    const rest = sorted.slice(1).map((r) => r.id);
    expect(rest).toContain("a");
    expect(rest).toContain("c");
  });

  it("returns routes unchanged when order is empty", () => {
    const sorted = sortByOrder(routes, []);
    expect(sorted.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores stale IDs in order that no longer exist", () => {
    const sorted = sortByOrder(routes, ["z", "b", "a", "c"]);
    expect(sorted.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});

// ── isRouteDuplicate ──────────────────────────────────────────────────────────

describe("isRouteDuplicate", () => {
  const existing = [
    { name: "The Crimper" },
    { name: "Slab Master" },
  ];

  it("detects exact match", () => {
    expect(isRouteDuplicate("The Crimper", existing)).toBe(true);
  });

  it("detects case-insensitive match", () => {
    expect(isRouteDuplicate("the crimper", existing)).toBe(true);
    expect(isRouteDuplicate("THE CRIMPER", existing)).toBe(true);
  });

  it("trims whitespace before comparing", () => {
    expect(isRouteDuplicate("  The Crimper  ", existing)).toBe(true);
  });

  it("returns false for a unique name", () => {
    expect(isRouteDuplicate("New Route", existing)).toBe(false);
  });

  it("returns false when existing list is empty", () => {
    expect(isRouteDuplicate("Anything", [])).toBe(false);
  });
});

// ── gradeIndex ────────────────────────────────────────────────────────────────

describe("gradeIndex", () => {
  it("returns 0 for V0", () => {
    expect(gradeIndex("V0")).toBe(0);
  });

  it("returns correct index for V6", () => {
    expect(gradeIndex("V6")).toBe(6);
  });

  it("returns last index for V12+", () => {
    expect(gradeIndex("V12+")).toBe(13);
  });

  it("returns 0 for unknown grade", () => {
    expect(gradeIndex("VX")).toBe(0);
  });

  it("sorts correctly: V3 < V8", () => {
    expect(gradeIndex("V3")).toBeLessThan(gradeIndex("V8"));
  });
});
