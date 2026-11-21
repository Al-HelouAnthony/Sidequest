import { describe, expect, it } from "vitest";
import { CUISINES, CUISINE_IDS, cuisinesForName, findCuisine, registryTerms } from "./cuisines";

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

  it("known names: letters + single spaces, lowercase, every cuisine has the field, no generic word alone", () => {
    for (const c of CUISINES) {
      expect(Array.isArray(c.knownNames)).toBe(true);
      for (const k of c.knownNames) expect(k, `${c.id}: ${k}`).toMatch(/^\p{Ll}+( \p{Ll}+)*$/u);
      expect(c.knownNames).not.toContain("four");
    }
    expect(registryTerms(findCuisine("middle-eastern"))).toEqual(expect.arrayContaining(["shawarma", "o four", "boustan"]));
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

  it.each([
    ["O FOUR", ["middle-eastern"]],
    ["O FOUR ST JEAN", ["middle-eastern"]],
    ["BOUSTAN / MADAME POULET", ["middle-eastern"]],
    ["RESTAURANT AMIR (PIERREFONDS)", ["middle-eastern"]],
    ["9462-7650 QUEBEC INC./BASHA LAJEUNESSE/JANAYA", ["middle-eastern"]],
  ])("known name %s → %j", (name, expected) => expect(cuisinesForName(name)).toEqual(expected));

  it("known names match as a whole phrase only: no Carrefour, Four Seasons, wood-fired pizzerias or Amira", () => {
    expect(cuisinesForName("BOULANGERIE PATISSERIE CARREFOUR")).toEqual([]);
    expect(cuisinesForName("HOTEL FOUR SEASONS (CUISINE 5E ETAGE)")).toEqual([]);
    expect(cuisinesForName("PIZZERIA AU FOUR À BOIS")).toEqual(["pizza"]);
    expect(cuisinesForName("GRILLADES AMIRA")).toEqual([]);
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
