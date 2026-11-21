import { describe, expect, it } from "vitest";
import { distanceM, isPlaceholder, judge, nameScore, photoUrlFor, pickMatch } from "./fetch-google-places.mjs";

const olimpico = { name: "Café Olimpico", lat: 45.5229, lng: -73.6018, photoUrl: "https://picsum.photos/seed/x/800/1400" };
const cand = (id, name, lat, lng, photos = 3) => ({ id, displayName: { text: name }, location: { latitude: lat, longitude: lng }, photos: Array(photos).fill({}) });

describe("matching helpers", () => {
  it("distance and name score", () => {
    expect(distanceM({ lat: 45.5, lng: -73.6 }, { lat: 45.501, lng: -73.6 })).toBe(111);
    expect(nameScore("Café Olimpico", "Cafe Olimpico Mile End")).toBe(1);
    expect(nameScore("Le Mal Nécessaire", "Mal Necessaire")).toBe(1);
    expect(nameScore("Café Olimpico", "Dépanneur Café")).toBe(0.5);
    expect(nameScore("Café Olimpico", "Pharmaprix")).toBe(0);
  });

  it("judge: close + similar = OK, unsure = CHECK, far = NO", () => {
    expect(judge(30, 1)).toBe("OK");
    expect(judge(140, 0.5)).toBe("OK");
    expect(judge(300, 0.5)).toBe("CHECK");
    expect(judge(50, 0)).toBe("CHECK");
    expect(judge(900, 1)).toBe("NO");
    expect(judge(200, 0)).toBe("NO");
  });

  it("pickMatch prefers the right café over a closer wrong shop", () => {
    const m = pickMatch(olimpico, [cand("wrong", "Pharmaprix", 45.5229, -73.6018), cand("right", "Café Olimpico", 45.5231, -73.6019)]);
    expect(m).toMatchObject({ googlePlaceId: "right", verdict: "OK", photos: 3 });
    expect(pickMatch(olimpico, [])).toBeNull();
  });

  it("photo URLs point at our proxy; picsum and /api/photo count as replaceable", () => {
    expect(photoUrlFor("ChIJabc-_1", "cafe")).toBe("/api/photo?place=ChIJabc-_1&category=cafe");
    expect(isPlaceholder(olimpico)).toBe(true);
    expect(isPlaceholder({ photoUrl: "/fallback/cafe.svg" })).toBe(true);
    expect(isPlaceholder({ photoUrl: "https://xyz.supabase.co/storage/v1/object/public/place-photos/a.jpg" })).toBe(false);
  });
});
