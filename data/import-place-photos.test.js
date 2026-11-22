import { describe, expect, it } from "vitest";
import { creditsBlock, matchPhotos, parseSources } from "./import-place-photos.mjs";

const places = [
  { id: "10000000-0000-4000-8000-000000000001", name: "Café Olimpico" },
  { id: "10000000-0000-4000-8000-000000000010", name: "Le Mal Nécessaire" },
  { id: "10000000-0000-4000-8000-000000000034", name: "Pizzeria Gema" },
];

describe("matchPhotos", () => {
  it("matches by name (accents, case, punctuation ignored) or by id; reports strays and gaps", () => {
    const r = matchPhotos(places, ["cafe olimpico.JPG", "LE MAL NECESSAIRE!.png", "random.jpg", "10000000-0000-4000-8000-000000000001.jpg"]);
    expect(r.matched.map((m) => m.place.name)).toEqual(["Café Olimpico", "Le Mal Nécessaire"]);
    expect(r.unmatchedFiles).toEqual(["random.jpg", "10000000-0000-4000-8000-000000000001.jpg"]); // second picture for the same place
    expect(r.missing.map((p) => p.name)).toEqual(["Pizzeria Gema"]);
  });
});

describe("parseSources + creditsBlock", () => {
  it("reads 'Name | url' lines and lists every source, flagging missing ones", () => {
    const s = parseSources("Café Olimpico | https://example.com/a.jpg\n\nbad line\nle mal necessaire|http://x.y/z");
    expect(s.get("cafe olimpico")).toBe("https://example.com/a.jpg");
    expect(s.get("le mal necessaire")).toBe("http://x.y/z");
    const md = creditsBlock([{ name: "Café Olimpico", url: "https://example.com/a.jpg" }, { name: "Pizzeria Gema", url: undefined }]);
    expect(md).toContain("| Café Olimpico | [source](https://example.com/a.jpg) |");
    expect(md).toContain("| Pizzeria Gema | **missing: add it to sources.txt** |");
    expect(md.startsWith("<!-- G1B-START -->")).toBe(true);
  });
});
