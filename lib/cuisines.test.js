import { describe, expect, it } from "vitest";
import { CUISINES, CUISINE_IDS, cuisinesForName, findCuisine } from "./cuisines";

describe("CUISINES data", () => {
  it("unique ids, kebab-case, labels and words present", () => {
    expect(new Set(CUISINE_IDS).size).toBe(CUISINE_IDS.length);
    for (const c of CUISINES) {
      expect(c.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.searchWords.length).toBeGreaterThan(0);
      expect(c.nameWords.length).toBeGreaterThan(0);
    }
    expect(CUISINES.length).toBeGreaterThanOrEqual(15);
    expect(findCuisine("indian")?.label).toBe("Indian");
    expect(findCuisine("klingon")).toBeNull();
  });

  it("name words are single words of letters only (they go into a PostgREST or() filter)", () => {
    for (const c of CUISINES) for (const w of c.nameWords) expect(w, `${c.id}: ${w}`).toMatch(/^\p{L}+$/u);
  });
});

describe("cuisinesForName (registry names are UPPERCASE French/English)", () => {
  it.each([
    ["SINGH'S CUISINE INDIENNE", ["indian"]],
    ["VAISHNO DHABA CUISINE INDIENNE", ["indian"]],
    ["Pizzeria Gema", ["pizza"]],
    ["PIZZERIA ITALIENNE NAPOLI", ["italian", "pizza"]],
    ["PHO BANG NEW YORK", ["vietnamese"]],
    ["RESTAURANT THAÏ EXPRESS", ["thai"]],
    ["Ma Poule Mouillée Churrasqueira", ["portuguese"]],
    ["Le Petit Alep", ["middle-eastern"]],
  ])("%s → %j", (name, expected) => {
    expect(cuisinesForName(name).sort()).toEqual(expected.sort());
  });

  it("whole words only: no PHOENIX for pho, no INDEPENDANT for inde", () => {
    expect(cuisinesForName("RESTAURANT PHOENIX")).toEqual([]);
    expect(cuisinesForName("CAFE INDEPENDANT")).toEqual([]);
  });

  it("grocery stores and canteens are never restaurants, whatever their name says", () => {
    expect(cuisinesForName("EPICERIE INDIENNE PATEL")).toEqual([]);
    expect(cuisinesForName("Épicerie Thaï")).toEqual([]);
    expect(cuisinesForName("CAFETERIA ECOLE ST-LUC PIZZA")).toEqual([]);
  });
});
