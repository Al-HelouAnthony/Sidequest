import { describe, expect, it } from "vitest";
import { SEARCH_TERMS, findTerms, placeMatches } from "./searchTerms";
import { normalize } from "./normalize";
import { Category } from "@/types/domain";
import { mockPlaces } from "@/lib/mocks/places";

const term = (id) => SEARCH_TERMS.filter((t) => t.id === id);
const named = (name) => mockPlaces.find((p) => p.name === name);

describe("search terms", () => {
  it("every term has a valid category, words and match words, and a unique id", () => {
    const ids = new Set();
    for (const t of SEARCH_TERMS) {
      expect(Category.safeParse(t.category).success).toBe(true);
      expect(t.words.length).toBeGreaterThan(0);
      expect(t.match.length).toBeGreaterThan(0);
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
    }
    expect(SEARCH_TERMS.length).toBeGreaterThanOrEqual(40);
  });

  it("finds terms as whole words only", () => {
    expect(findTerms(normalize("museum tonight")).map((t) => t.id)).toEqual(["museum"]);
    expect(findTerms(normalize("spaghetti")).map((t) => t.id)).toEqual([]); // "spa" is not inside "spaghetti"
  });

  it("matches places by name or tags (accents ignored)", () => {
    expect(placeMatches(named("Musée des beaux-arts"), term("museum"))).toBe(true); // name + tag
    expect(placeMatches(named("Musée des beaux-arts"), term("art"))).toBe(true);
    expect(placeMatches(named("Marché Jean-Talon"), term("market"))).toBe(true);
    expect(placeMatches(named("Biodôme"), term("animals"))).toBe(true);
    expect(placeMatches(named("Bily Kun"), term("live-music"))).toBe(true); // tag "live-music"
    expect(placeMatches(named("Kazu"), term("japanese"))).toBe(true); // tag "japanese"
    expect(placeMatches(named("La Banquise"), term("poutine"))).toBe(true);
  });

  it("does not match unrelated places", () => {
    expect(placeMatches(named("Parc Jarry"), term("museum"))).toBe(false);
    expect(placeMatches(named("Café Olimpico"), term("bowling"))).toBe(false);
    expect(placeMatches(named("Schwartz's Deli"), term("pizza"))).toBe(false);
  });
});
