// QA: Claude captions. QA_CLAUDE=bad → server started with an invalid key: feed must load fast with template
// captions. QA_CLAUDE=real → real key: first page within budget, later pages / repeat visits get Claude captions.
import { describe, expect, it } from "vitest";
import { templateCaption } from "@/lib/ai/templates";
import { call, MOCK } from "./helpers";

const MODE = process.env.QA_CLAUDE;
const isTemplate = (c) => c.caption === templateCaption(c);

describe.runIf(MODE === "bad" || MODE === "real")(`captions (${MODE} key)`, () => {
  it("feed always loads; captions are never empty; Claude never blocks the first page for long", async () => {
    const rows = [];
    const page1 = await call("/api/feed?seed=77", { as: MOCK.maya });
    expect(page1.status).toBe(200);
    rows.push(`page 1: ${Math.round(page1.ms)} ms, ${page1.headers.get("server-timing")}, template ${page1.json.cards.filter(isTemplate).length}/${page1.json.cards.length}`);
    expect(page1.ms).toBeLessThan(2500);
    for (const c of page1.json.cards) expect(c.caption.length).toBeGreaterThan(0);
    if (MODE === "bad") expect(page1.json.cards.every(isTemplate)).toBe(true);
    // Give the background job time, then page 2 and a repeat of page 1.
    await new Promise((r) => setTimeout(r, 6000));
    const page2 = await call(`/api/feed?seed=77&cursor=${encodeURIComponent(page1.json.nextCursor)}`, { as: MOCK.maya });
    const again = await call("/api/feed?seed=77", { as: MOCK.maya });
    rows.push(`page 2: ${Math.round(page2.ms)} ms, template ${page2.json.cards.filter(isTemplate).length}/${page2.json.cards.length}`);
    rows.push(`page 1 again: ${Math.round(again.ms)} ms, template ${again.json.cards.filter(isTemplate).length}/${again.json.cards.length}`);
    if (MODE === "real") {
      rows.push(`sample Claude captions: ${again.json.cards.filter((c) => !isTemplate(c)).slice(0, 3).map((c) => `"${c.caption}"`).join(" | ")}`);
      for (const c of again.json.cards) expect(c.caption.length).toBeLessThanOrEqual(120);
    }
    console.log(rows.join("\n"));
  });
});
