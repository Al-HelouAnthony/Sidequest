import { describe, expect, it } from "vitest";
import { MAX_CAPTION_CHARS, templateCaption } from "./templates";
import { buildMockFeedCards } from "@/lib/mocks/feedCards";

const friend = (name, travelMin) => ({ id: name, name, avatarUrl: "", travelMin, travelIsEstimate: false });
const caption = (friends, icon, tempC, myTravelMin = 10) =>
  templateCaption({ friends, weather: { icon, tempC, rainProb: 0 }, myTravelMin });

describe("templateCaption", () => {
  it("one friend: full example", () => {
    expect(caption([friend("Maya", 12)], "cloud", 4)).toBe(
      "You and Maya are both free · 4°C, cloudy · Get your coat · ~12 min for everyone",
    );
  });

  it("no friends: no 'free' part, travel says 'away'", () => {
    expect(caption([], "snow", -3, 8)).toBe("-3°C, snowy · Wear warm boots · ~8 min away");
  });

  it("three friends are listed", () => {
    const text = caption([friend("Maya", 5), friend("Karim", 7), friend("Léa", 9)], "sun", 20);
    expect(text.startsWith("You, Maya, Karim and Léa are all free")).toBe(true);
  });

  it("clothing tips follow temperature and weather", () => {
    expect(caption([], "sun", -15)).toContain("Bundle up: hat and gloves");
    expect(caption([], "rain", 8)).toContain("Bring an umbrella");
    expect(caption([], "cloud", -2)).toContain("Get your winter coat");
    expect(caption([], "partly", 15)).toContain("A light jacket will do");
    expect(caption([], "sun", 25)).toContain("T-shirt weather");
  });

  it("rounds the temperature and never shows -0", () => {
    expect(caption([], "fog", -0.4)).toContain("0°C, foggy");
    expect(caption([], "fog", -0.4)).not.toContain("-0");
  });

  it("travel uses the longest trip in the group", () => {
    expect(caption([friend("Maya", 22)], "sun", 20, 10)).toContain("~22 min for everyone");
  });

  it("too long: drops travel first", () => {
    // Full version would be 92 characters.
    const text = caption([friend("Maya", 5), friend("Karim", 7), friend("Léa", 9)], "sun", 20);
    expect(text).toBe("You, Maya, Karim and Léa are all free · 20°C, sunny · T-shirt weather");
  });

  it("still too long: drops the clothing tip too, weather stays", () => {
    const four = [friend("Maya", 5), friend("Karim", 7), friend("Antoine", 9), friend("Léa", 11)];
    expect(caption(four, "partly", -15)).toBe(
      "You, Maya, Karim, Antoine and Léa are all free · -15°C, partly cloudy",
    );
  });

  it("every mock card gets a non-empty caption that fits on the card", () => {
    for (const card of buildMockFeedCards()) {
      const text = templateCaption(card);
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(MAX_CAPTION_CHARS);
    }
  });
});
