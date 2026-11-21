import { describe, expect, it } from "vitest";
import { MAX_CAPTION_CHARS, WORDINGS, templateCaption } from "./templates";
import { buildMockFeedCards } from "@/lib/mocks/feedCards";

const friend = (name, travelMin) => ({ id: name, name, avatarUrl: "", travelMin, travelIsEstimate: false });
const caption = (friends, icon, tempC, myTravelMin = 10) =>
  templateCaption({ friends, weather: { icon, tempC, rainProb: 0 }, myTravelMin });
/** True if the caption contains one of these wordings. */
const hasOneOf = (text, wordings) => wordings.some((w) => text.includes(w));
const ALL_TIPS = Object.values(WORDINGS.tips).flat();

describe("templateCaption", () => {
  it("the same card always gets the same caption", () => {
    const a = caption([friend("Maya", 12)], "cloud", 4);
    const b = caption([friend("Maya", 12)], "cloud", 4);
    expect(a).toBe(b);
  });

  it("one friend: names the friend, shows weather and travel", () => {
    const text = caption([friend("Maya", 12)], "cloud", 4);
    expect(text).toContain("Maya");
    expect(text).toContain("4°C");
    expect(text).toContain("cloudy");
    expect(text).toContain("12 min");
  });

  it("no friends: no 'free' part, travel uses an 'alone' wording", () => {
    const text = caption([], "snow", -3, 8);
    expect(text).not.toMatch(/free|make it/);
    expect(text.startsWith("-3°C") || text.startsWith("snowy")).toBe(true);
    expect(text).toContain("8 min");
  });

  it("several friends are all listed", () => {
    const text = caption([friend("Maya", 5), friend("Karim", 7), friend("Léa", 9)], "sun", 20);
    expect(text).toContain("Maya, Karim and Léa");
  });

  it("each tip comes from the right group", () => {
    expect(hasOneOf(caption([], "sun", -15), WORDINGS.tips.deepCold)).toBe(true);
    expect(hasOneOf(caption([], "snow", -3), WORDINGS.tips.snow)).toBe(true);
    expect(hasOneOf(caption([], "rain", 8), WORDINGS.tips.rain)).toBe(true);
    expect(hasOneOf(caption([], "cloud", -2), WORDINGS.tips.freezing)).toBe(true);
    expect(hasOneOf(caption([], "cloud", 5), WORDINGS.tips.cold)).toBe(true);
    expect(hasOneOf(caption([], "partly", 15), WORDINGS.tips.cool)).toBe(true);
    expect(hasOneOf(caption([], "sun", 25), WORDINGS.tips.warm)).toBe(true);
  });

  it("different cards get different wordings", () => {
    const tips = new Set();
    for (let travel = 1; travel <= 20; travel++) {
      const text = caption([], "cloud", 5, travel);
      tips.add(WORDINGS.tips.cold.find((w) => text.includes(w)));
    }
    expect(tips.size).toBeGreaterThan(1);
  });

  it("rounds the temperature and never shows -0", () => {
    const text = caption([], "fog", -0.4);
    expect(text).toContain("0°C");
    expect(text).not.toContain("-0");
  });

  it("travel uses the longest trip in the group", () => {
    expect(caption([friend("Maya", 22)], "sun", 20, 10)).toContain("22 min");
  });

  it("always fits on the card, and travel is dropped before the tip", () => {
    const names = ["Maya", "Karim", "Antoine", "Léa"];
    for (let n = 0; n <= names.length; n++) {
      const friends = names.slice(0, n).map((name, i) => friend(name, 5 + i));
      for (const icon of ["sun", "partly", "cloud", "rain", "snow", "storm", "fog"]) {
        for (let temp = -20; temp <= 30; temp += 5) {
          for (const travel of [5, 12, 25]) {
            const text = caption(friends, icon, temp, travel);
            expect(text.length).toBeLessThanOrEqual(MAX_CAPTION_CHARS);
            const hasTravel = /\d+ min/.test(text);
            const hasTip = hasOneOf(text, ALL_TIPS);
            // Never "travel kept but tip dropped".
            expect(hasTravel && !hasTip).toBe(false);
          }
        }
      }
    }
  });

  it("every mock card gets a non-empty caption that fits on the card", () => {
    for (const card of buildMockFeedCards()) {
      const text = templateCaption(card);
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(MAX_CAPTION_CHARS);
    }
  });
});
