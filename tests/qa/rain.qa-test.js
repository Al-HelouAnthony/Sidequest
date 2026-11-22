// QA: staged rain (server started with FORCE_RAIN_DAY=tue → Tue 13:00–18:00 Montréal is rainy).
// Outdoor places must never be suggested in that window, and must still be suggested at other times.
// Run only when the server was started with FORCE_RAIN_DAY=tue (QA_RAIN=tue).
import { describe, expect, it } from "vitest";
import { toLocal } from "@/lib/time";
import { all, call, qaId, QA } from "./helpers";

describe.runIf(process.env.QA_RAIN === "tue")("staged rain", () => {
  it("no outdoor place overlaps Tue 13:00–18:00; outdoor places still show elsewhere", async () => {
    const outdoor = new Set((await all("places", "id, indoor")).filter((p) => !p.indoor).map((p) => p.id));
    let inRain = 0;
    let outdoorElsewhere = 0;
    let rainyCardsSeen = 0;
    for (const n of [1, 3, 4, 5, 13, 14, 15, 16, 23, 24]) {
      let cursor = null;
      for (let p = 0; p < 10; p++) {
        const qs = new URLSearchParams({ seed: "99" });
        if (cursor) qs.set("cursor", cursor);
        const r = await call(`/api/feed?${qs}`, { as: qaId(QA.user, n) });
        expect(r.status).toBe(200);
        for (const c of r.json.cards) {
          const s = toLocal(c.slot.start);
          const e = toLocal(c.slot.end);
          const tueRain = s.weekday === 2 && s.hour < 18 && e.hour * 60 + e.minute > 13 * 60;
          if (tueRain) rainyCardsSeen++;
          if (outdoor.has(c.place.id)) {
            if (tueRain) inRain++;
            else outdoorElsewhere++;
          }
        }
        cursor = r.json.nextCursor;
        if (!cursor) break;
      }
    }
    console.log({ inRain, outdoorElsewhere, rainyCardsSeen });
    expect(rainyCardsSeen).toBeGreaterThan(0); // indoor ideas still offered in the rain
    expect(inRain).toBe(0);
    expect(outdoorElsewhere).toBeGreaterThan(0);
  });
});
